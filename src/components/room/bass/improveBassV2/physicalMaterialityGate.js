// physicalMaterialityGate.js
// ---------------------------------------------------------------------------
// Stricter materiality for PHYSICAL recommendations — subwoofer placement,
// seating changes, and coordinated physical alternatives.
//
// Sound Proof is a design-stage sales tool, not a precision calibration
// application. A physical change is worth recommending only when:
//
//   A. P19 or P20 improves by at least one RP22 Performance Level; OR
//   B. The relevant parameter is L1 before AND after, but its variation
//      improves by at least 6 dB.
//
// Same-level fractional-dB improvements (the 1.0 dB and 3.0 dB rules the
// calibration gate allows) do NOT recommend a physical change on their own.
// The existing safety checks — fail-count, P19 aggregate worsening, primary-
// seat regression, new significant per-seat problems, and P14 output safety
// (enforced in the selection layer) — are preserved unchanged.
//
// Full numerical precision is kept internally; no value is rounded before a
// threshold is evaluated. RP22 level boundaries and calculation definitions
// are not altered.
//
// Pure: no React, no side effects, no acoustic calculations.
// ---------------------------------------------------------------------------

import {
  MATERIALITY_RULE,
  isMaterialImprovement,
  hasPrimarySeatRegression,
} from "./materialityGate.js";
import { canonicalP19Level } from "./p19Authority.js";

/** The L1 → L1 variation improvement that clears the physical materiality bar. */
export const PHYSICAL_L1_L1_THRESHOLD_DB = 6.0;

/**
 * The canonical material-damage figure (1.0 dB). A P20 deviation worsening
 * beyond this is a safety failure for a physical recommendation, whatever the
 * P19 gain. Matches BALANCED_DAMAGE_THRESHOLD_DB — one figure, never a second.
 */
export const PHYSICAL_MATERIAL_DAMAGE_DB = 1.0;

/** New per-seat P20 problem: a seat that worsens beyond the damage figure. */
const NEW_PROBLEM_THRESHOLD_DB = PHYSICAL_MATERIAL_DAMAGE_DB;

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function numericLevel(value) {
  if (Number.isFinite(Number(value))) return Math.max(0, Math.min(4, Number(value)));
  const match = String(value || "").match(/^L([1-4])$/i);
  return match ? Number(match[1]) : 0;
}

/** One decimal, for a stated measurement. Never used in a comparison. */
function round1(value) {
  const n = finite(value);
  return n == null ? null : Math.round(n * 10) / 10;
}

/**
 * Whether a confirmed candidate is a PHYSICAL change (placement, seating,
 * coordinated, or combined-physical). Pure calibration / crossover-only
 * candidates are electronic and use the existing calibration gate.
 */
export function isPhysicalCandidate(result) {
  if (!result) return false;
  if (result.candidateOrigin === "coordinated" || result.isCoordinatedCandidate) return true;
  if (result.candidateOrigin === "combined" || result.candidateOrigin === "combined-calibration-seating") return true;
  if (result.isPositionCandidate) return true;
  if (result.candidateKind === "seating") return true;
  // Calibration-only (delay/gain/polarity/phase, crossover) is electronic.
  if (result.candidateKind === "calibration" || result.candidateId === "calibration-only") return false;
  // Default: treat as physical so the stricter rule applies (safer).
  return true;
}

function hasNewSignificantProblem(currentResult, candidateResult) {
  const currentP20 = new Map((currentResult?.perSeatP20 || []).map(s => [String(s.seatId), s]));
  for (const seat of (candidateResult?.perSeatP20 || [])) {
    const cur = currentP20.get(String(seat.seatId));
    const curVar = Math.abs(Number(cur?.variationDbRaw) || 0);
    const candVar = Math.abs(Number(seat?.variationDbRaw) || 0);
    if (candVar > curVar + NEW_PROBLEM_THRESHOLD_DB) return true;
  }
  return false;
}

/**
 * Assess whether a PHYSICAL candidate (placement, seating, coordinated) is a
 * MATERIAL improvement under the stricter commercial-purpose rule.
 *
 * A physical change is MATERIAL when, without meaningful regression:
 *   A. P19 or P20 improves by at least one RP22 Performance Level; OR
 *   B. The relevant parameter is L1 before AND after, but its variation
 *      improves by at least 6 dB.
 *
 * All existing safety checks are preserved: fail-count, P19 aggregate
 * worsening, primary-seat regression, P20 aggregate worsening, and new
 * per-seat significant problems.
 *
 * @param {object} currentResult - canonical result with the current design
 * @param {object} candidateResult - canonical result with the candidate design
 * @returns {{ material: boolean, rule: string, reason: string, details?: object, physical: true }}
 */
export function isPhysicalMaterialImprovement(currentResult, candidateResult) {
  if (!currentResult || !candidateResult) {
    return { material: false, reason: "Missing result data", physical: true };
  }

  // ── Shared safety: run the full existing assessment ────────────────────
  // This performs every safety check (fail-count, P19 aggregate worsening,
  // seat-level validity, primary-seat regression) and returns the complete
  // analysis. We inherit its safety verdicts and then apply the stricter
  // physical recommendation bar.
  const safety = isMaterialImprovement(currentResult, candidateResult);

  const safetyFailRules = new Set([
    MATERIALITY_RULE.FAIL_COUNT_INCREASED,
    MATERIALITY_RULE.FAILING_SEAT_MOVED,
    MATERIALITY_RULE.P19_AGGREGATE_WORSENED,
  ]);
  if (safety.valid === false || safetyFailRules.has(safety.rule)) {
    return { material: false, rule: safety.rule, reason: safety.reason, details: safety.details, physical: true };
  }

  // Primary-seat regression: a physical change that regresses a primary seat
  // is never recommended, whatever else it improves.
  const primaryRegression = hasPrimarySeatRegression(currentResult, candidateResult);
  if (primaryRegression.regressed) {
    return {
      material: false,
      rule: "physical-primary-seat-regression",
      reason: `Primary seat regressed: ${primaryRegression.parameter} at ${primaryRegression.seatId}`,
      details: primaryRegression,
      physical: true,
    };
  }

  // ── P20 aggregate worsening safety ──────────────────────────────────────
  // A P19 level gain bought by materially worsening P20 is never a physical
  // recommendation. A level drop or a deviation worsening beyond the
  // canonical material-damage figure both refuse.
  const p20BeforeLevel = numericLevel(currentResult?.achievedP20Level);
  const p20AfterLevel = numericLevel(candidateResult?.achievedP20Level);
  if (p20BeforeLevel != null && p20AfterLevel != null && p20AfterLevel < p20BeforeLevel) {
    return {
      material: false,
      rule: "physical-p20-level-worsened",
      reason: `P20 level dropped: L${p20BeforeLevel} → L${p20AfterLevel}`,
      physical: true,
    };
  }
  const p20BeforeDev = finite(currentResult?.achievedP20VariationDb);
  const p20AfterDev = finite(candidateResult?.achievedP20VariationDb);
  if (p20BeforeDev != null && p20AfterDev != null
    && (p20AfterDev - p20BeforeDev) > PHYSICAL_MATERIAL_DAMAGE_DB) {
    return {
      material: false,
      rule: "physical-p20-deviation-worsened",
      reason: `P20 deviation worsened by ${round1(p20AfterDev - p20BeforeDev)} dB`,
      physical: true,
    };
  }

  // New per-seat significant problem: a seat whose P20 variation worsens
  // beyond the damage figure is a safety failure for physical too.
  if (hasNewSignificantProblem(currentResult, candidateResult)) {
    return {
      material: false,
      rule: "physical-new-significant-problem",
      reason: "A seat's P20 variation worsened significantly",
      physical: true,
    };
  }

  // ── RULE A: P19 or P20 improves by at least one RP22 Performance Level ──
  // P19 aggregate RSP level.
  const p19BeforeLevel = canonicalP19Level(currentResult?.achievedP19Level);
  const p19AfterLevel = canonicalP19Level(candidateResult?.achievedP19Level);
  if (p19BeforeLevel != null && p19AfterLevel != null && p19AfterLevel > p19BeforeLevel) {
    return {
      material: true,
      rule: "physical-level-improved",
      reason: `P19 level improved: L${p19BeforeLevel} → L${p19AfterLevel}`,
      details: { p19BeforeLevel, p19AfterLevel },
      physical: true,
    };
  }
  // P20 aggregate level.
  if (p20BeforeLevel != null && p20AfterLevel != null && p20AfterLevel > p20BeforeLevel) {
    return {
      material: true,
      rule: "physical-level-improved",
      reason: `P20 level improved: L${p20BeforeLevel} → L${p20AfterLevel}`,
      details: { p20BeforeLevel, p20AfterLevel },
      physical: true,
    };
  }
  // Per-seat P20 level improvement (any seat). A seat going FAIL → L1 is a
  // level gain (0 → 1) and is caught here.
  const beforeSeatMap = new Map((currentResult?.perSeatP20 || []).map(s => [String(s.seatId), s]));
  for (const seat of (candidateResult?.perSeatP20 || [])) {
    const before = beforeSeatMap.get(String(seat.seatId));
    if (!before) continue;
    const beforeLevel = numericLevel(before.level);
    const afterLevel = numericLevel(seat.level);
    if (afterLevel > beforeLevel) {
      return {
        material: true,
        rule: "physical-level-improved",
        reason: `Seat ${seat.seatId} P20 improved: L${beforeLevel} → L${afterLevel}`,
        details: { seatId: seat.seatId, beforeLevel, afterLevel },
        physical: true,
      };
    }
  }

  // ── RULE B: L1 → L1 with >= 6 dB variation improvement ──────────────────
  // The relevant parameter stays at L1 before and after, but its variation
  // (deviation) improves by at least 6 dB. Full precision; no rounding.
  const p19BeforeDev = finite(currentResult?.achievedP19VariationDb);
  const p19AfterDev = finite(candidateResult?.achievedP19VariationDb);
  if (p19BeforeLevel === 1 && p19AfterLevel === 1 && p19BeforeDev != null && p19AfterDev != null) {
    const improvement = p19BeforeDev - p19AfterDev;
    if (improvement >= PHYSICAL_L1_L1_THRESHOLD_DB) {
      return {
        material: true,
        rule: "physical-l1-l1-variation",
        reason: `P19 variation improved by ${Math.floor(improvement)} dB at L1`,
        details: { p19BeforeDev, p19AfterDev, improvement },
        physical: true,
      };
    }
  }
  if (p20BeforeLevel === 1 && p20AfterLevel === 1 && p20BeforeDev != null && p20AfterDev != null) {
    const improvement = p20BeforeDev - p20AfterDev;
    if (improvement >= PHYSICAL_L1_L1_THRESHOLD_DB) {
      return {
        material: true,
        rule: "physical-l1-l1-variation",
        reason: `P20 variation improved by ${Math.floor(improvement)} dB at L1`,
        details: { p20BeforeDev, p20AfterDev, improvement },
        physical: true,
      };
    }
  }

  // ── Below the stricter physical materiality threshold ──────────────────
  return {
    material: false,
    rule: "physical-below-materiality",
    reason: "No RP22 Performance Level improvement (and no L1→L1 ≥6 dB variation gain)",
    physical: true,
  };
}