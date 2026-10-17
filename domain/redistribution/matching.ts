// Pure redistribution matching (ADR-012, ADR-011). Pure arithmetic — no LLM,
// no routing engine, no DB. Imported by unit tests AND by the server runner.

export interface FacilityPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export interface StockLevel {
  facilityId: string;
  item_name: string;
  quantity: number;
  unit: string;
}

export interface RedistributionCandidate {
  fromFacilityId: string;
  toFacilityId: string;
  itemName: string;
  suggestedQty: number;
  distanceKm: number;
}

// Standard Haversine — straight-line distance between two lat/lng points in km.
// Earth radius 6371 km. No external lib needed (ADR-012).
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371; // km
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}

// The matcher ranks how surplus facilities can relieve a deficit facility.
// Inputs: the deficit point, its item name + current (low) quantity, the set
// of all facilities (for coordinates), and all stock levels for the SAME
// item_name. Surplus = quantity above its own keep-stocking threshold.
//
// suggestedQty = half of the surplus facility's excess above its threshold,
// capped at the deficit amount needed to bring the deficit facility back up
// to its threshold. Top-N within radius, ranked by distance ascending.
export interface MatchParams {
  deficit: FacilityPoint;
  itemName: string;
  deficitQty: number;
  deficitThreshold: number;   // bring deficit ABOVE this
  surplusThreshold: number;    // surplus facilities ABOVE this
  facilities: FacilityPoint[];
  stockLevels: StockLevel[];
  radiusKm: number;
  topN: number;
}

export function matchRedistribution(params: MatchParams): RedistributionCandidate[] {
  const deficitFacilityId = params.deficit.id;
  const deficitNeed = Math.max(0, params.deficitThreshold - params.deficitQty);

  if (deficitNeed <= 0) return [];

  const surplusFacilities = new Map(
    params.facilities.map((f) => [f.id, f])
  );

  const candidates: RedistributionCandidate[] = [];

  for (const lvl of params.stockLevels) {
    if (lvl.facilityId === deficitFacilityId) continue;
    if (lvl.item_name.toLowerCase() !== params.itemName.toLowerCase()) continue;

    const excess = lvl.quantity - params.surplusThreshold;
    if (excess <= 0) continue;

    const fromF = surplusFacilities.get(lvl.facilityId);
    if (!fromF) continue;

    const distanceKm = haversineKm(
      { lat: fromF.lat, lng: fromF.lng },
      { lat: params.deficit.lat, lng: params.deficit.lng }
    );
    if (distanceKm > params.radiusKm) continue;

    // Half the excess above its own surplus threshold, capped by the deficit need.
    const suggestedQty = Math.min(
      Math.floor(excess / 2),
      deficitNeed
    );
    if (suggestedQty <= 0) continue;

    candidates.push({
      fromFacilityId: fromF.id,
      toFacilityId: deficitFacilityId,
      itemName: params.itemName,
      suggestedQty,
      distanceKm: round2(distanceKm),
    });
  }

  // Rank by distance ascending; take top N. Ties broken by larger suggested qty.
  candidates.sort((a, b) =>
    a.distanceKm !== b.distanceKm
      ? a.distanceKm - b.distanceKm
      : b.suggestedQty - a.suggestedQty
  );

  return candidates.slice(0, params.topN);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
