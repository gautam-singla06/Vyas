import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const migration = readFileSync(path.resolve(__dirname, "0006_security_hardening.sql"), "utf8");

describe("security hardening migration", () => {
  it("removes anonymous raw operational-table reads", () => {
    expect(migration).toContain('drop policy if exists "stock_items_public_read"');
    expect(migration).toContain('drop policy if exists "bed_status_public_read"');
    expect(migration).toContain('drop policy if exists "test_availability_public_read"');
  });

  it("does not replace public facility access with authenticated-wide access", () => {
    expect(migration).toContain('create policy "facilities_self_read"');
    expect(migration).toContain('create policy "facilities_admin_district_read"');
    expect(migration).not.toContain('"facilities_authenticated_read"');
  });

  it("enforces facility and role inside the SECURITY DEFINER footfall RPC", () => {
    expect(migration).toContain("p_facility_id is distinct from public.current_user_facility_id()");
    expect(migration).toContain("public.current_user_role() not in ('nurse', 'pharmacist')");
  });

  it("limits admin suggestion updates to rows wholly within the caller district", () => {
    expect(migration).toContain("grant update (status) on public.redistribution_suggestions");
    expect(migration).toContain("and from_facility_id in");
    expect(migration).toContain("and to_facility_id in");
  });
});
