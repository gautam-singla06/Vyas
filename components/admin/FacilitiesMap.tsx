"use client";

import { useEffect, useRef } from "react";
import type { FacilityMarker, SuggestionRow } from "@/domain/admin/queries";

interface Props {
  facilities: FacilityMarker[];
  suggestions: SuggestionRow[];
}

// Leaflet is browser-only (it touches `window`/DOM at import). We import the
// CSS dynamically and use the npm modules directly in a client component that
// short-circuits on SSR. The parent dynamic-imports this file with ssr:false.
export default function FacilitiesMap({ facilities, suggestions }: Props) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);

  useEffect(() => {
    let disposed = false;
    let L: typeof import("leaflet");

    (async () => {
      try {
        await import("leaflet/dist/leaflet.css");
        L = await import("leaflet");
      } catch (e) {
        console.error("leaflet load failed", e);
        return;
      }
      if (disposed || !elRef.current || facilities.length === 0) return;

      // Center on the first facility for a sensible default view.
      const first = facilities[0];
      const map = L.map(elRef.current).setView([first.lat, first.lng], 10);
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 18,
      }).addTo(map);

      // One marker per facility, color-coded by unresolved-flag presence.
      for (const f of facilities) {
        const color = f.hasUnresolvedFlag ? "#dc2626" : "#16a34a";
        L.circleMarker([f.lat, f.lng], {
          radius: 8,
          fillColor: color,
          color: "#fff",
          weight: 2,
          fillOpacity: 0.9,
        })
          .bindPopup(`${f.name} (${f.type})${f.hasUnresolvedFlag ? " — has flags" : ""}`)
          .addTo(map);
      }

      // Line overlay for pending redistribution suggestions between facilities.
      const byId = new Map(facilities.map((f) => [f.id, f]));
      for (const s of suggestions) {
        if (s.status !== "pending") continue;
        const from = byId.get(s.from_facility_id);
        const to = byId.get(s.to_facility_id);
        if (!from || !to) continue;
        L.polyline(
          [
            [from.lat, from.lng],
            [to.lat, to.lng],
          ],
          { color: "#d97706", weight: 2, dashArray: "6 6" }
        )
          .bindPopup(`${s.item_name}: ${s.from_facility_name} → ${s.to_facility_name} (${s.suggested_qty})`)
          .addTo(map);
      }
    })();

    return () => {
      disposed = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [facilities, suggestions]);

  return <div ref={elRef} className="h-[420px] w-full rounded-lg border border-gray-200" />;
}
