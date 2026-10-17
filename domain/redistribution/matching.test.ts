import { describe, it, expect } from "vitest";
import {
  haversineKm,
  matchRedistribution,
  type FacilityPoint,
  type StockLevel,
} from "./matching";

const facilities: FacilityPoint[] = [
  { id: "Rampur",   name: "PHC Rampur",   lat: 27.175, lng: 81.012 }, // deficit
  { id: "Sadar",    name: "CHC Sitapur Sadar", lat: 27.107, lng: 80.804 }, // very close, big surplus
  { id: "Laharpur", name: "PHC Laharpur", lat: 27.235, lng: 80.845 },  // mid distance, smaller surplus
  { id: "Maholi",   name: "PHC Maholi",   lat: 27.262, lng: 80.458 },  // far, within radius
];

const stockLevels: StockLevel[] = [
  { facilityId: "Rampur",   item_name: "Paracetamol", quantity: 8,   unit: "tablets" },
  { facilityId: "Sadar",    item_name: "Paracetamol", quantity: 1200, unit: "tablets" },
  { facilityId: "Laharpur", item_name: "Paracetamol", quantity: 200,  unit: "tablets" },
  { facilityId: "Maholi",   item_name: "Paracetamol", quantity: 300,  unit: "tablets" },
  { facilityId: "Laharpur", item_name: "ORS",         quantity: 60,   unit: "sachets" }, // wrong item
];

const deficit = facilities[0];

describe("haversineKm", () => {
  it("returns 0 for the same point", () => {
    expect(haversineKm({ lat: 27.175, lng: 81.012 }, { lat: 27.175, lng: 81.012 })).toBe(0);
  });
  it("computes a non-zero distance for distinct points", () => {
    const d = haversineKm(facilities[0], facilities[1]);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(100);
  });
});

describe("matchRedistribution", () => {
  it("ranks surplus candidates by distance ascending", () => {
    const cands = matchRedistribution({
      deficit,
      itemName: "Paracetamol",
      deficitQty: 8,
      deficitThreshold: 50,   // need to bring Rampur up to 50 from 8 => need 42
      surplusThreshold: 100,   // surplus only if qty > 100
      facilities,
      stockLevels,
      radiusKm: 200,
      topN: 3,
    });

    expect(cands.length).toBe(3);
    // Laharpur (~17.8km) is closest to Rampur, then Sadar (~21.9km), then Maholi (~55.6km).
    expect(cands[0].fromFacilityId).toBe("Laharpur");
    expect(cands[1].fromFacilityId).toBe("Sadar");
    expect(cands[2].fromFacilityId).toBe("Maholi");
    // Sadar excess = 1200 - 100 = 1100; half = 550, capped by need 42 => 42
    const sadar = cands.find((c) => c.fromFacilityId === "Sadar");
    expect(sadar?.suggestedQty).toBe(42);
    // Distance ordering must be strictly non-decreasing
    expect(cands[0].distanceKm).toBeLessThanOrEqual(cands[1].distanceKm);
    expect(cands[1].distanceKm).toBeLessThanOrEqual(cands[2].distanceKm);
  });

  it("caps suggestedQty at half of the surplus facility's excess", () => {
    // Make the need enormous so the cap kicks in: Laharpur excess = 200-100=100, half=50.
    const cands = matchRedistribution({
      deficit,
      itemName: "Paracetamol",
      deficitQty: 0,
      deficitThreshold: 10000,
      surplusThreshold: 100,
      facilities,
      stockLevels,
      radiusKm: 200,
      topN: 3,
    });
    const lahar = cands.find((c) => c.fromFacilityId === "Laharpur");
    expect(lahar?.suggestedQty).toBe(50);
  });

  it("excludes facilities outside the radius", () => {
    const cands = matchRedistribution({
      deficit,
      itemName: "Paracetamol",
      deficitQty: 8,
      deficitThreshold: 50,
      surplusThreshold: 100,
      facilities,
      stockLevels,
      radiusKm: 25, // Sadar & Laharpur are ~20-25km; Maholi is far further
      topN: 5,
    });
    // Maholi (~70km from Rampur) should NOT appear at radius 25.
    expect(cands.find((c) => c.fromFacilityId === "Maholi")).toBeUndefined();
  });

  it("returns nothing when the deficit facility is already above its threshold", () => {
    expect(
      matchRedistribution({
        deficit,
        itemName: "Paracetamol",
        deficitQty: 100,
        deficitThreshold: 50,
        surplusThreshold: 100,
        facilities,
        stockLevels,
        radiusKm: 200,
        topN: 3,
      })
    ).toEqual([]);
  });

  it("ignores stock of a different item_name", () => {
    const cands = matchRedistribution({
      deficit,
      itemName: "Paracetamol",
      deficitQty: 8,
      deficitThreshold: 50,
      surplusThreshold: 100,
      facilities,
      stockLevels,
      radiusKm: 200,
      topN: 3,
    });
    expect(cands.length).toBe(3); // Sadar, Laharpur, Maholi — NOT Laharpur ORS
  });
});
