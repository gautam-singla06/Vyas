import { describe, expect, it } from "vitest";
import { canManageFacilityResources, canUseVoiceStockIntent } from "./authorization";

describe("server-side role authorization", () => {
  it("allows resource writes only for nurse and pharmacist roles", () => {
    expect(canManageFacilityResources("nurse")).toBe(true);
    expect(canManageFacilityResources("pharmacist")).toBe(true);
    expect(canManageFacilityResources("doctor")).toBe(false);
    expect(canManageFacilityResources("admin")).toBe(false);
  });

  it("does not allow a client-provided admin role to unlock voice stock intents", () => {
    expect(canUseVoiceStockIntent("admin")).toBe(false);
  });
});
