// improvementCardData.js
// ---------------------------------------------------------------------------
// Structured before/after comparison data for the ADI improvement cards.
//
// Pure presentation resolver: reads the SAME authorities the panel already
// resolves (the headline, the result view model, the placement recommendation,
// the calibration decision and the improvement result) and returns structured
// metric pairs. It performs NO calculation, re-ranks nothing, and changes no
// engineering logic, fingerprints or saved state.
//
// THREE STATES:
//   pending   — a physical or calibration change on offer (predicted values)
//   applied   — a change the designer applied (actual recalculated values)
//   applied-adi — a calibration ADI applied on its own (actual recalculated values)
//
// ENGINEERING INTEGRITY:
//   • A metric is shown only where BOTH before and after are supported by the
//     same comparison evidence.
//   • Results from unrelated projects, versions or fingerprints are never
//     compared. When runBaselineDiffers is true for a pending state, no cards
//     are returned.
//   • For applied states, the "after" is the canonical published result (the
//     actual recalculated value), never the prediction — green is shown only
//     when the authoritative calculation has completed.
//   • Every value is read from an existing authority; nothing is fabricated or
//     interpolated.
// ---------------------------------------------------------------------------

import { deviationText, levelText, wholeDbImprovement } from "./optimiserWholeNumberDb.js";
import { PLACEMENT_KIND } from "./placementRecommendationAuthority.js";
import { IMPROVEMENT_CASE } from "./improvementResultAuthority.js";
import { resolveImprovementActionPresentation } from "./improvementActionPresentation.js";

const num = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

/** P20 from a result-view-model side ({ p20: { raw, display, level, levelText } }). */
function p20FromResultSide(side) {
  if (!side?.p20) return null;
  const raw = num(side.p20.raw);
  const display = side.p20.display || deviationText(raw);
  const level = side.p20.levelText || levelText(side.p20.level);
  if (!display && !level) return null;
  return { raw, display, level };
}

/** P19 from a result-view-model side. */
function p19FromResultSide(side) {
  if (!side?.p19) return null;
  const raw = num(side.p19.raw);
  const display = side.p19.display || deviationText(raw);
  const level = side.p19.levelText || levelText(side.p19.level);
  if (!display && !level) return null;
  return { raw, display, level };
}

/** P20 from a calibration-decision side ({ p20: { deviationDb, level } }). */
function p20FromDecisionSide(side) {
  if (!side?.p20) return null;
  const raw = num(side.p20.deviationDb);
  const display = deviationText(raw);
  const level = levelText(side.p20.level);
  if (!display && !level) return null;
  return { raw, display, level };
}

/** P19 from a calibration-decision side. */
function p19FromDecisionSide(side) {
  if (!side?.p19) return null;
  const raw = num(side.p19.deviationDb);
  const display = deviationText(raw);
  const level = levelText(side.p19.level);
  if (!display && !level) return null;
  return { raw, display, level };
}

/** P20/P19 from a placement expected-row (already carries before/after strings). */
function metricFromPlacementRow(rows, label) {
  const row = (Array.isArray(rows) ? rows : []).find((r) => r?.label === label);
  if (!row?.before || !row?.after) return null;
  return {
    before: { display: row.before, level: row.levelBefore || null, raw: null },
    after: { display: row.after, level: row.levelAfter || null, raw: null },
  };
}

/** Numeric RP22 level 1..4 from a value or "L2" string, or null. */
function numericLevel(level) {
  if (level == null) return null;
  if (Number.isFinite(Number(level))) return Number(level);
  const match = String(level).trim().toUpperCase().match(/^L?([1-4])$/);
  return match ? Number(match[1]) : null;
}

/** "up" | "down" | "same" | null — only when both levels are known. */
function levelChange(beforeLevel, afterLevel) {
  const b = numericLevel(beforeLevel);
  const a = numericLevel(afterLevel);
  if (b == null || a == null) return null;
  if (a > b) return "up";
  if (a < b) return "down";
  return "same";
}

/** Build one metric card datum, or null when either side is missing. */
function buildMetric(key, label, before, after) {
  if (!before?.display && !after?.display) return null;
  const improvement = before?.raw != null && after?.raw != null
    ? wholeDbImprovement(before.raw, after.raw)
    : null;
  return {
    key,
    label,
    before: before?.display || null,
    after: after?.display || null,
    beforeLevel: before?.level || null,
    afterLevel: after?.level || null,
    improvement,
    // Colour authority: green only when the RP22 Level rose, red when it
    // fell, neutral when it stayed the same. A same-Level dB change is never
    // coloured as an improvement.
    levelChange: levelChange(before?.level, after?.level),
  };
}

/**
 * Resolve the structured card data for the ADI improvement cards.
 *
 * @returns {object|null} null when no comparable before/after evidence exists.
 */
export function buildImprovementCardData({
  headline = null,
  summary = null,
  resultModel = null,
  calibrationDecision = null,
  improvementResult = null,
  placement = null,
  planView = null,
} = {}) {
  if (!headline) return null;

  const hl = headline;
  const rm = resultModel;
  const decision = calibrationDecision;
  const ir = improvementResult;
  const pl = placement;

  // ── Determine the state ──
  const isPhysicalRecommended = pl?.kind === PLACEMENT_KIND.RECOMMENDED;
  const isPhysicalApplied = pl?.kind === PLACEMENT_KIND.APPLIED;
  const isCalibrationPending = hl.kind === "consider" && ir?.caseKey === IMPROVEMENT_CASE.REVIEW;
  const isCalibrationApplied = ir?.caseKey === IMPROVEMENT_CASE.APPLIED || hl.kind === "applied";

  const isPending = isPhysicalRecommended || isCalibrationPending;
  const isApplied = isPhysicalApplied || isCalibrationApplied;

  if (!isPending && !isApplied) return null;

  // ── The action presentation ──
  // Plain-English headline, proposed-changes rows, scope statement and the
  // action-specific Apply label. Read from the SAME authorities the card
  // already reads — nothing is fabricated.
  const actionPresentation = resolveImprovementActionPresentation({
    headline: hl,
    summary,
    placement: pl,
    improvementResult: ir,
    planView,
  });

  // For a pending state whose evaluation ran against a different current state,
  // no before/after pair is comparable — never compare unrelated results.
  if (isPending && rm?.currentP20?.runBaselineDiffers === true) return null;

  // Title: the physical change or the calibration adjustment.
  const title = hl.adjustment
    || pl?.move?.movementLabel
    || summary?.recommendation
    || null;
  if (!title) return null;

  // ── Extract before/after for P20 and P19 ──
  let p20Before = null, p20After = null;
  let p19Before = null, p19After = null;

  if (isPhysicalRecommended) {
    // Predicted: placement.expected rows carry baseline → effect before/after.
    const p20 = metricFromPlacementRow(pl?.expected, "P20");
    if (p20) { p20Before = p20.before; p20After = p20.after; }
    const p19 = metricFromPlacementRow(pl?.expected, "P19");
    if (p19) { p19Before = p19.before; p19After = p19.after; }
  } else if (isPhysicalApplied) {
    // Actual: before = pre-apply baseline, after = current published result.
    const baseline = planView?.baseline;
    if (baseline?.p20VariationDb != null) {
      p20Before = { raw: num(baseline.p20VariationDb), display: deviationText(baseline.p20VariationDb), level: levelText(baseline.p20Level) };
    }
    p20After = p20FromResultSide(rm?.current);
    if (baseline?.p19VariationDb != null) {
      p19Before = { raw: num(baseline.p19VariationDb), display: deviationText(baseline.p19VariationDb), level: levelText(baseline.p19Level) };
    }
    p19After = p19FromResultSide(rm?.current);
  } else if (isCalibrationApplied) {
    // Actual: before = pre-apply baseline (decision.before), after = current published.
    p20Before = p20FromDecisionSide(decision?.before);
    p20After = p20FromResultSide(rm?.current);
    p19Before = p19FromDecisionSide(decision?.before);
    p19After = p19FromResultSide(rm?.current);
    // If the authoritative result is not available, do not show green.
    if (!p20After && !p19After) return null;
  } else if (isCalibrationPending) {
    // Predicted: before = current published, after = proposed candidate.
    p20Before = p20FromResultSide(rm?.current);
    p20After = p20FromResultSide(rm?.proposed);
    p19Before = p19FromResultSide(rm?.current);
    p19After = p19FromResultSide(rm?.proposed);
  }

  // ── Build metrics — only where both before AND after are supported ──
  const metrics = [];
  const p20Metric = buildMetric("p20", "P20 · Worst-seat variation", p20Before, p20After);
  if (p20Metric) metrics.push(p20Metric);
  const p19Metric = buildMetric("p19", "P19 · RSP response", p19Before, p19After);
  if (p19Metric) metrics.push(p19Metric);

  if (metrics.length === 0) return null;

  // Show the strongest meaningful improvement first.
  metrics.sort((a, b) => (b.improvement ?? 0) - (a.improvement ?? 0));

  // Pill label and footer.
  let pillLabel;
  let footer;
  if (isApplied) {
    pillLabel = isCalibrationApplied ? "Applied by ADI" : "Applied";
    footer = "Calculated from the updated design, not simply copied from the recommendation.";
  } else {
    pillLabel = "Awaiting approval";
    footer = "Predicted outcome, pending application and recalculation.";
  }

  return {
    state: isApplied ? "applied" : "pending",
    appliedByAdi: isCalibrationApplied,
    title,
    pillLabel,
    metrics,
    footer,
    // ── The action presentation ──
    actionType: actionPresentation?.actionType || null,
    actionHeadline: actionPresentation?.actionHeadline || null,
    appliedHeadline: actionPresentation?.appliedHeadline || null,
    proposedChanges: actionPresentation?.proposedChanges || [],
    scopeStatement: actionPresentation?.scopeStatement || null,
    applyLabel: actionPresentation?.applyLabel || null,
  };
}