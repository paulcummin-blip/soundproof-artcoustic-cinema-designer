// nonIntrusiveHierarchyGate.js
//
// Non-intrusive-first Bass ADI escalation hierarchy.
//
// Post-calculation Bass Optimisation must exhaust the installed-layout
// electronic levers (phase, delay, gain, crossover) BEFORE any physical
// subwoofer or seating movement is considered. Physical movement is a
// last resort: it is eligible only when the best confirmed electronic
// result still leaves P19 RSP, P20 Primary and P20 Secondary all at L1
// (the poorest passing level). Seating movement is eligible only after
// subwoofer placement has been assessed and the best confirmed practical
// result STILL leaves all three at L1.
//
// A physical recommendation must deliver a genuine RP22 Level improvement —
// a same-level dB gain alone never justifies moving subwoofers or seating.
//
// This module is PURE: it reads existing canonical results and diagnostics
// and decides eligibility. It performs no acoustic calculation, no search,
// and no side effect. It does NOT modify RP22 grading thresholds, canonical
// solvers, Stage 1/2, physical validation, safe Apply or publication.
//
// The initial ADI Starting Layout recommendation search (Stage 1/2) is
// OUTSIDE this gate — it continues to evaluate practical front/rear-wall
// positions across eligible subwoofer quantities.

import { readRspP19 } from "./p19Authority.js";
import { isMaterialImprovement } from "./materialityGate.js";

/** Canonical RP22 level 0..4 (0 = FAIL), or null when unstated. */
function numericLevel(value) {
  if (Number.isInteger(value) && value >= 0 && value <= 4) return value;
  if (value === "FAIL") return 0;
  const match = typeof value === "string" ? value.match(/^L([1-4])$/i) : null;
  return match ? Number(match[1]) : null;
}

/**
 * The worst (minimum) RP22 level among a subset of per-seat P20 rows.
 * Returns null when the subset is empty — a missing metric never satisfies
 * a gate. FAIL (0) is worse than L1 and correctly fails an all-L1 check.
 */
function worstSeatLevel(perSeatP20, primary) {
  const rows = (Array.isArray(perSeatP20) ? perSeatP20 : []).filter((s) => !!s?.isPrimary === primary);
  if (rows.length === 0) return null;
  const levels = rows.map((s) => numericLevel(s?.level)).filter((l) => l != null);
  if (levels.length === 0) return null;
  return Math.min(...levels);
}

/**
 * Read the three escalation-relevant RP22 levels from a confirmed result.
 *
 *   p19Rsp      — aggregate RSP P19 level (always applicable).
 *   p20Primary  — worst P20 level across primary seats (null when none).
 *   p20Secondary — worst P20 level across non-primary seats (null when none).
 *
 * Each is 0..4 (0 = FAIL) or null when unstated/missing. Null never satisfies
 * an L1 gate.
 */
export function readEscalationLevels(result) {
  if (!result) return { p19Rsp: null, p20Primary: null, p20Secondary: null };
  const perSeatP20 = Array.isArray(result?.perSeatP20) ? result.perSeatP20 : [];
  const hasSecondary = perSeatP20.some((s) => s?.isPrimary === false);
  return {
    p19Rsp: readRspP19(result).level,
    p20Primary: worstSeatLevel(perSeatP20, true),
    // P20 Secondary is only applicable when the design has secondary seats.
    // A single-row cinema has no secondary seats: Secondary is not a gate.
    p20Secondary: hasSecondary ? worstSeatLevel(perSeatP20, false) : "not_applicable",
  };
}

/**
 * Whether all APPLICABLE escalation levels are explicitly L1.
 *
 * P19 RSP and P20 Primary are always required. P20 Secondary is required only
 * when the design has secondary seats. A level of null, undefined, FAIL (0)
 * or L2/L3/L4 never satisfies the gate.
 */
export function isAllL1(levels) {
  if (!levels) return false;
  const required = [];
  if (levels.p19Rsp !== "not_applicable") required.push(levels.p19Rsp);
  if (levels.p20Primary !== "not_applicable") required.push(levels.p20Primary);
  if (levels.p20Secondary !== "not_applicable") required.push(levels.p20Secondary);
  if (required.length === 0) return false;
  return required.every((l) => l === 1);
}

/** Eligibility for post-calculation subwoofer placement search. */
export function isPhysicalPlacementEligible(bestElectronicResult) {
  return isAllL1(readEscalationLevels(bestElectronicResult));
}

/**
 * Eligibility for seating movement. Requires that placement has been
 * assessed (placementGate passed) AND the best confirmed practical result
 * still leaves all applicable levels at L1.
 */
export function isSeatingEligible(bestPracticalResult) {
  return isAllL1(readEscalationLevels(bestPracticalResult));
}

/**
 * Whether an electronic search category genuinely completed for the current
 * design. A dispatched, skipped (for a non-applicable design), cancelled or
 * failed search is NOT complete. "skipped" is complete ONLY when it means the
 * lever is not applicable to this design (a valid terminal state), not when it
 * means "not run".
 *
 * @param {object} diagnostics - { status, error, valid, searchStatus, ... }
 * @returns {{ complete: boolean, reason: string|null }}
 */
export function electronicCategoryCompleted(diagnostics) {
  if (!diagnostics) return { complete: false, reason: "missing-diagnostics" };
  if (diagnostics.error) return { complete: false, reason: "error" };
  // Stale or cancelled: the search did not reach a terminal state.
  if (diagnostics.status === "stale" || diagnostics.status === "cancelled") {
    return { complete: false, reason: diagnostics.status };
  }
  if (diagnostics.status === "incomplete" || diagnostics.status === "not_run") {
    return { complete: false, reason: diagnostics.status };
  }
  // "skipped" is a valid terminal state ONLY when the lever is not applicable
  // to this design (e.g. no independently adjustable group). The grouped
  // searches set status="skipped" with a grouping reason in that case.
  if (diagnostics.status === "skipped") {
    // A skipped search with no grouping reason is "not run", not "not applicable".
    const notApplicable = diagnostics.groupingStatus === "skipped"
      || diagnostics.searchStatus === "skipped"
      || diagnostics.gainAdjustable === false
      || !!diagnostics.grouping;
    return notApplicable
      ? { complete: true, reason: "not-applicable" }
      : { complete: false, reason: "skipped-not-run" };
  }
  // completed-shortlist / completed / done: a stage that was entered is NOT
  // complete merely because it ran. Require canonical confirmation evidence —
  // at least one candidate was canonically confirmed OR explicitly validated.
  // Screening or retention alone is not proof of a genuine evaluation.
  const confirmed = Number(diagnostics.confirmed || 0);
  const valid = Number(diagnostics.valid || 0);
  if (confirmed > 0 || valid > 0) return { complete: true, reason: null };
  return { complete: false, reason: "no-confirmation-evidence" };
}

/**
 * Whether the supported installed-layout electronic levers have genuinely
 * finished. Phase, delay and gain must each be complete. Crossover is
 * complete only when its diagnostics demonstrate actual crossover coverage
 * — completion of the combined stage alone is NOT proof of crossover.
 */
export function electronicsCompleted({ phaseDiagnostics, calibrationDiagnostics, gainDiagnostics, crossoverDiagnostics } = {}) {
  const reasons = [];
  const phase = electronicCategoryCompleted(phaseDiagnostics);
  if (!phase.complete) reasons.push(`phase:${phase.reason}`);
  const delay = electronicCategoryCompleted(calibrationDiagnostics);
  if (!delay.complete) reasons.push(`delay:${delay.reason}`);
  const gain = electronicCategoryCompleted(gainDiagnostics);
  if (!gain.complete) reasons.push(`gain:${gain.reason}`);
  // Crossover: optional. When diagnostics are present, require genuine
  // coverage (candidates screened / tested), not merely a combined-stage flag.
  if (crossoverDiagnostics != null) {
    const coverage = crossoverGenuinelyCompleted(crossoverDiagnostics);
    if (!coverage.complete) reasons.push(`crossover:${coverage.reason}`);
  }
  return { complete: reasons.length === 0, reasons };
}

/**
 * Crossover is genuinely complete only when its diagnostics show actual
 * crossover search coverage — candidates screened/tested/confirmed — or an
 * explicit "not applicable" terminal state. Completion of the combined
 * optimisation stage alone is NOT proof that crossover was tested.
 */
export function crossoverGenuinelyCompleted(diagnostics) {
  if (!diagnostics) return { complete: false, reason: "missing-diagnostics" };
  if (diagnostics.error) return { complete: false, reason: "error" };
  // Stale or cancelled: the search did not reach a terminal state.
  if (diagnostics.status === "stale" || diagnostics.status === "cancelled") {
    return { complete: false, reason: diagnostics.status };
  }
  // Genuine not-applicable: no combined LCR/subwoofer response is available.
  // Crossover cannot be tested — this is a legitimate terminal state, not an
  // unattempted search. Do not describe an unattempted crossover as tested.
  if (diagnostics.status === "unavailable" || diagnostics.status === "not_applicable") {
    return { complete: true, reason: "not-applicable" };
  }
  // A skipped search without an unavailable reason was never attempted.
  if (diagnostics.status === "skipped") {
    return { complete: false, reason: "skipped-not-run" };
  }
  // completed / no_safe_improvement: require canonical confirmation evidence.
  // Screening alone (candidates generated but never canonically confirmed) is
  // NOT a genuine evaluation. A search that confirmed and then rejected every
  // candidate is still genuinely complete — it does not need a winner.
  const confirmed = Number(diagnostics.confirmed || 0);
  if (confirmed > 0) return { complete: true, reason: null };
  const screened = Number(diagnostics.crossoverCandidates || diagnostics.screened || 0);
  if (screened > 0) return { complete: false, reason: "screened-not-confirmed" };
  return { complete: false, reason: "no-coverage" };
}

/**
 * Whether a candidate delivers a genuine RP22 Level improvement over the
 * baseline on any of the three applicable escalation metrics, without
 * regressing any applicable metric. A same-level dB-only improvement is NOT
 * a genuine level improvement.
 *
 * Fail-count reduction (a FAIL seat becoming L1) is a level improvement:
 * the worst-case P20 Primary or Secondary level rises from 0.
 */
export function hasGenuineLevelImprovement(baseline, candidate) {
  if (!baseline || !candidate) return false;
  const before = readEscalationLevels(baseline);
  const after = readEscalationLevels(candidate);
  const metrics = ["p19Rsp", "p20Primary", "p20Secondary"];
  let improved = false;
  for (const key of metrics) {
    if (before[key] === "not_applicable" || after[key] === "not_applicable") continue;
    const b = before[key];
    const a = after[key];
    if (b == null || a == null) return false; // missing evidence never qualifies
    if (a > b) improved = true;
    if (a < b) return false; // regression on any applicable metric disqualifies
  }
  return improved;
}

/**
 * Whether a P14 operating-point regression is present on a candidate.
 * Read-only: uses the candidate's own P14 evidence fields. Never recomputes.
 */
function hasP14Regression(baseline, candidate) {
  const baseAchieved = Number(baseline?.p14AchievedDb);
  const candAchieved = Number(candidate?.p14AchievedDb);
  const baseLevel = numericLevel(baseline?.p14AchievedLevel);
  const candLevel = numericLevel(candidate?.p14AchievedLevel);
  if (Number.isFinite(baseLevel) && Number.isFinite(candLevel) && candLevel < baseLevel) return true;
  if (Number.isFinite(baseAchieved) && Number.isFinite(candAchieved) && candAchieved < baseAchieved - 0.05) return true;
  if (candidate?.p14NotAchievedReason && !baseline?.p14NotAchievedReason) return true;
  return false;
}

/**
 * Whether a physical candidate is acceptable as a recommendation. A physical
 * recommendation must (a) be a material improvement by the existing canonical
 * materiality gate AND (b) deliver a genuine RP22 Level improvement on an
 * applicable metric AND (c) not regress P14 capability. Electronic
 * candidates are NOT subject to this gate.
 */
export function isPhysicalRecommendationAcceptable(baseline, candidate) {
  if (!baseline || !candidate) return false;
  const material = isMaterialImprovement(baseline, candidate);
  if (!material?.material) return false;
  if (!hasGenuineLevelImprovement(baseline, candidate)) return false;
  if (hasP14Regression(baseline, candidate)) return false;
  return true;
}

/**
 * Classify a confirmed result as physical (moves subwoofers and/or seating)
 * or electronic. Used to apply the physical-significance filter only to
 * candidates that actually move something.
 */
export function isPhysicalCandidate(result) {
  if (!result) return false;
  if (result.candidateKind === "current" || result.candidateId === "current") return false;
  if (result.isPositionCandidate) return true;
  if (result.candidateKind === "seating") return true;
  if (result.seatingOffsetMm != null) return true;
  // Coordinated candidates move both; they are bound as position candidates
  // with a design context, or carry a coordinated origin.
  if (result.candidateOrigin === "combined-calibration-seating") return true;
  if (result.candidateOrigin === "coordinated") return true;
  return false;
}

/**
 * Filter a candidate pool for physical significance: remove physical
 * candidates that lack a genuine level improvement. Electronic candidates
 * pass through untouched (they are not subject to the physical gate).
 */
export function filterPhysicalForSignificance(candidates, baseline) {
  if (!Array.isArray(candidates)) return [];
  if (!baseline) return candidates;
  return candidates.filter((r) => {
    if (!isPhysicalCandidate(r)) return true;
    return isPhysicalRecommendationAcceptable(baseline, r);
  });
}