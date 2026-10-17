import type { StaffRole } from "./context";

// Roles are resolved from the server-side staff record, never from a request
// body or client-side session claim.
export function canManageFacilityResources(role: StaffRole): boolean {
  return role === "nurse" || role === "pharmacist";
}

export function canUseVoiceStockIntent(role: StaffRole): boolean {
  return canManageFacilityResources(role);
}
