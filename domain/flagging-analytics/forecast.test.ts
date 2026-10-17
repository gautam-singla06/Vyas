import { describe, it, expect } from "vitest";
import {
  forecastStock,
  severityForStock,
  severityForBed,
  severityForDoctor,
  severityForTest,
} from "./forecast";

describe("forecastStock", () => {
  it("computes days-to-zero from 14-day rolling consumption", () => {
    // Item with 50 units, consumed 3/day for 14 days => avg 3, d2z = 50/3 ≈ 16.67
    const deltas = Array.from({ length: 14 }, (_, i) => ({
      t: i,
      delta: -3,
    }));
    const res = forecastStock({
      currentQuantity: 50,
      deltas,
      windowDays: 14,
    });
    expect(res.totalConsumption).toBe(42);
    expect(res.averageDailyConsumption).toBeCloseTo(3, 5);
    expect(res.daysToZero).toBeCloseTo(50 / 3, 5);
  });

  it("returns null daysToZero when no consumption is recorded", () => {
    const res = forecastStock({
      currentQuantity: 100,
      deltas: [{ t: 0, delta: 0 }],
      windowDays: 14,
    });
    expect(res.daysToZero).toBeNull();
    expect(res.averageDailyConsumption).toBe(0);
  });

  it("returns 0 daysToZero when quantity is already zero", () => {
    const res = forecastStock({
      currentQuantity: 0,
      deltas: [{ t: 0, delta: -5 }],
      windowDays: 14,
    });
    expect(res.daysToZero).toBe(0);
  });

  it("ignores positive deltas (restocks) in the consumption average", () => {
    const deltas = [{ t: 0, delta: -5 }, { t: 1, delta: 50 }];
    const res = forecastStock({
      currentQuantity: 60,
      deltas,
      windowDays: 14,
    });
    expect(res.totalConsumption).toBe(5);
    expect(res.averageDailyConsumption).toBeCloseTo(5 / 14, 5);
    expect(res.daysToZero).toBeCloseTo(60 / (5 / 14), 2);
  });

  it("matches the ADR-005 worked example: PHC Rampur Paracetamol critical", () => {
    // Seed scenario: 14 daily -3 deltas from a starting ~50 down to qty=8.
    // avg = 3/day, days-to-zero = 8/3 ≈ 2.67 => CRITICAL.
    const deltas = Array.from({ length: 14 }, (_, i) => ({ t: i, delta: -3 }));
    const res = forecastStock({
      currentQuantity: 8,
      deltas,
      windowDays: 14,
    });
    expect(res.averageDailyConsumption).toBeCloseTo(3, 5);
    expect(res.daysToZero).toBeLessThanOrEqual(3);
  });
});

describe("severityForStock", () => {
  it("flags critical when daysToZero <= 3", () => {
    expect(severityForStock(0)).toBe("critical");
    expect(severityForStock(2.67)).toBe("critical");
    expect(severityForStock(3)).toBe("critical");
  });
  it("flags warning when 3 < daysToZero <= 7", () => {
    expect(severityForStock(4)).toBe("warning");
    expect(severityForStock(7)).toBe("warning");
  });
  it("flags watch when 7 < daysToZero <= 21 (trending down within horizon)", () => {
    expect(severityForStock(10)).toBe("watch");
    expect(severityForStock(21)).toBe("watch");
  });
  it("does not flag when the runway is healthy (daysToZero > 21)", () => {
    expect(severityForStock(22)).toBeNull();
    expect(severityForStock(100)).toBeNull();
    expect(severityForStock(365)).toBeNull();
  });
  it("does not flag when there is no consumption signal", () => {
    expect(severityForStock(null)).toBeNull();
  });
});

describe("severityForBed", () => {
  it("flags critical at 100% occupancy", () => {
    expect(severityForBed(30, 30)).toBe("critical");
  });
  it("flags warning at 90%+ occupancy, not below", () => {
    expect(severityForBed(9, 10)).toBe("warning");
    expect(severityForBed(8, 10)).toBeNull();
  });
  it("does not flag when there are no beds", () => {
    expect(severityForBed(0, 0)).toBeNull();
  });
});

describe("severityForDoctor", () => {
  it("flags critical when the doctor has not checked in by cutoff", () => {
    expect(severityForDoctor(false)).toBe("critical");
  });
  it("does not flag when the doctor has checked in", () => {
    expect(severityForDoctor(true)).toBeNull();
  });
});

describe("severityForTest", () => {
  it("flags watch for a broken test, not for a functional one", () => {
    expect(severityForTest(false)).toBe("watch");
    expect(severityForTest(true)).toBeNull();
  });
});
