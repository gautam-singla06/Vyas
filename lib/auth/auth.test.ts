import { describe, it, expect } from "vitest";
import { routeForRole } from "@/lib/auth/context";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { isServerSupabaseConfigured } from "@/lib/supabase/server";

describe("Auth context and routing", () => {
  it("routes admin role to /admin", () => {
    expect(routeForRole("admin")).toBe("/admin");
  });

  it("routes doctor role to /doctor", () => {
    expect(routeForRole("doctor")).toBe("/doctor");
  });

  it("routes nurse and pharmacist roles to /staff", () => {
    expect(routeForRole("nurse")).toBe("/staff");
    expect(routeForRole("pharmacist")).toBe("/staff");
  });

  it("detects unconfigured Supabase gracefully without throwing", () => {
    // When environment variables are missing or unconfigured
    expect(typeof isSupabaseConfigured()).toBe("boolean");
    expect(typeof isServerSupabaseConfigured()).toBe("boolean");
  });
});

