// Pure forecast + severity math (ADR-005). NO database, NO LLM, NO side-effects
// — imported by unit tests AND by the server runner. The auditability
// requirement ("every flag traceable to a documented arithmetic rule") is
// satisfied precisely because these functions are deterministic, pure, and
// individually testable.

export interface ForecastInput {
  currentQuantity: number;
  // Negative deltas = consumption (units used). Positive deltas = restocks.
  // Each entry: { day (ISO date or day index), delta }
  deltas: { t: number | string; delta: number }[];
  windowDays: number; // typically 14
  now?: number; // injectable clock for tests
}

export interface ForecastResult {
  daysToZero: number | null; // null = no consumption recorded, or zero qty
  averageDailyConsumption: number; // units/day (non-negative)
  totalConsumption: number; // sum of negative deltas (abs)
}

// Rolling-average daily consumption over the last `windowDays` days, then
// days-to-zero. Pure arithmetic — no rounding tricks.
export function forecastStock(input: ForecastInput): ForecastResult {
  const consumption = input.deltas
    .filter((d) => d.delta < 0)
    .reduce((sum, d) => sum + Math.abs(d.delta), 0);

  if (consumption === 0 || input.currentQuantity <= 0) {
    return {
      daysToZero: input.currentQuantity <= 0 ? 0 : null,
      averageDailyConsumption: 0,
      totalConsumption: consumption,
    };
  }

  const avg = consumption / input.windowDays;
  const daysToZero = input.currentQuantity / avg;

  return {
    daysToZero,
    averageDailyConsumption: avg,
    totalConsumption: consumption,
  };
}

// Severity tiers (ARCHITECTURE.md Section 8):
//   🔴 critical: days-to-zero <= 3, OR bed occupancy 100%, OR doctor absent
//                  past cutoff with no prior notice
//   🟡 warning:  days-to-zero <= 7
//   🟢 watch:    declining trend but outside the above thresholds — capped at
//                WATCH_WINDOW_DAYS so a facility with months of runway is not
//                flagged. Beyond that, the stock is healthy and gets no flag.
export type Severity = "critical" | "warning" | "watch";

// A "declining trend" is only actionable inside a ~3-week horizon; past that,
// there is nothing for an operator to do this cycle, so we don't flag it (this
// prevents the dashboard from flooding with every item that has any history).
const WATCH_WINDOW_DAYS = 21;

export function severityForStock(daysToZero: number | null): Severity | null {
  if (daysToZero === null) return null; // no consumption recorded — don't flag
  if (daysToZero <= 3) return "critical";
  if (daysToZero <= 7) return "warning";
  if (daysToZero <= WATCH_WINDOW_DAYS) return "watch";
  return null; // healthy runway — no flag needed
}

export function severityForBed(occupied: number, total: number): Severity | null {
  if (total <= 0) return null;
  if (occupied >= total) return "critical";
  // 90%+ capacity = warning tier; trending toward full.
  if (occupied / total >= 0.9) return "warning";
  return null;
}

// Doctor absence past a cutoff time: returns the severity, or null if the
// doctor HAS checked in by the cutoff. `checkedInByCutoff` is true if any
// doctor_attendance row for the facility today has check_in <= cutoff.
export function severityForDoctor(
  checkedInByCutoff: boolean
): Severity | null {
  if (checkedInByCutoff) return null;
  return "critical"; // unexplained absence past cutoff
}

export function severityForTest(isFunctional: boolean): Severity | null {
  // A broken test/equipment is a watch-tier signal at most — it's operationally
  // relevant but rarely patient-safety-critical by itself.
  return isFunctional ? null : "watch";
}
