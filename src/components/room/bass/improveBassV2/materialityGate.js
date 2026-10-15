import { validateSeatResults, canonicalLevel, applicableSeatsFromResult } from "./confirmedCandidateValidity.js";
import { countFailingSeats, hasNewFailingSeats } from "./zeroFailOptimiser.js";
import { floorP19P20Deviation } from "@/components/utils/rp22/resolveRp22DesignValue";
import { compareRspP19 } from "./p19Authority.js";
// materialityGate.js
// Canonical user-facing materiality assessment for calibration-only improvements.
//
// A candidate is MATERIAL when, without meaningful regression:
//   A. any relevant P19/P20 displayed level improves;
//   B. levels remain identical but worst-seat deviation improves by >= 1.0 dB;
//   C. a severe response problem/null improves by >= 3 dB with no new significant problem.
//
// Headroom (P14) is NOT an independent user-facing materiality qualifier.
// It belongs in safety, ranking/tiebreaking, and avoiding excessive
// calibration cost — but it must not independently cause MATERIAL = true.
//
// A 0.15 dB Pareto tolerance may remain internally for numerical comparisons.
// Do NOT surface 0.2-0.5 dB cosmetic wins as a recommendation.

/**
 * WHICH rule decided an assessment. Reporting only: the rule that refused a
 * candidate is named, so a stated reason can never claim a threshold, or a
 * "no seat improves" verdict, that the assessment did not actually apply.
 */
export const MATERIALITY_RULE = Object.freeze({
  FAIL_COUNT_REDUCED: "fail-count-reduced",
  FAIL_COUNT_INCREASED: "fail-count-increased",
  FAILING_SEAT_MOVED: "failing-seat-moved",
  P19_AGGREGATE_IMPROVED: "p19-aggregate-improved",
  SEAT_LEVEL_IMPROVED: "seat-level-improved",
  SAME_LEVEL_SEAT_DEVIATION: "same-level-seat-deviation",
  SEVERE_NULL_REDUCED: "severe-null-reduced",
  P20_AGGREGATE_IMPROVED: "p20-aggregate-improved",
  // A required metric made materially worse. Named so the refusal states the
  // figure that actually held the change, and a worsening candidate can never
  // be reported as a plain improvement.
  P19_AGGREGATE_WORSENED: "p19-aggregate-worsened",
  // The final refusal: displayed levels did not move, and the seat-level
  // deviation improvement did not clear the same-level rule (or the severe-null
  // rule). The rule that held it is the seat-level rule, and `details.seatScope`
  // states exactly which seats were read before any "no seat" claim is made.
  SEAT_LEVEL_NOT_CLEARED: "seat-level-not-cleared",
});

/**
 * WHAT an immaterial improvement IS, so the panel can tell a change worth the
 * designer's attention from one that genuinely is not — the distinction that
 * stops every unapplied candidate reading as a failed optimisation.
 *
 *   IMPROVEMENT_WORTH_CONSIDERING  the overall result improves by the canonical
 *                                  figure, and no regression guard is breached.
 *                                  ADI still does not apply it on its own: it is
 *                                  stated as a suggestion for the designer.
 *   NO_WORTHWHILE_IMPROVEMENT      the change does not clear the action figure.
 *   MEANINGFUL_REGRESSION          a level drop, a primary seat losing ground or
 *                                  a new significant problem — never a
 *                                  suggestion, whatever the aggregate improves.
 *
 * The figure used below is the SAME canonical 1.0 dB this gate already applies
 * to a same-level improvement (rule B) and to the same-level raw regression. No
 * new threshold and no new comparison is introduced, and nothing here decides
 * materiality: it classifies a refusal the rules above have already made.
 */
export const MATERIALITY_DISPOSITION = Object.freeze({
  IMPROVEMENT_WORTH_CONSIDERING: "improvement-worth-considering",
  NO_WORTHWHILE_IMPROVEMENT: "no-worthwhile-improvement",
  MEANINGFUL_REGRESSION: "rejected-meaningful-regression",
});

/**
 * Classify a refused change by what it is worth, from the figures the rules
 * already read. Pure: it changes no score, applies nothing and returns only the
 * disposition and the figure it was compared against.
 */
export function classifyCalibrationDisposition({
  improvementDb = null,
  levelDropped = false,
  meaningfulRegression = false,
} = {}) {
  const value = Number(improvementDb);
  const measured = Number.isFinite(value) ? value : null;
  if (meaningfulRegression === true || levelDropped === true) {
    return {
      disposition: MATERIALITY_DISPOSITION.MEANINGFUL_REGRESSION,
      thresholdDb: WITHIN_LEVEL_THRESHOLD_DB,
      improvementDb: measured,
    };
  }
  return {
    disposition: measured != null && measured >= WITHIN_LEVEL_THRESHOLD_DB
      ? MATERIALITY_DISPOSITION.IMPROVEMENT_WORTH_CONSIDERING
      : MATERIALITY_DISPOSITION.NO_WORTHWHILE_IMPROVEMENT,
    thresholdDb: WITHIN_LEVEL_THRESHOLD_DB,
    improvementDb: measured,
  };
}

const LEVEL_IMPROVEMENT = 1;      // any level increase is material
const WITHIN_LEVEL_THRESHOLD_DB = 1.0;  // >= 1.0 dB within same level
const SEVERE_NULL_THRESHOLD_DB = 3.0;   // >= 3.0 dB null reduction
const NEW_PROBLEM_THRESHOLD_DB = 1.0;    // new problem if deviation worsens > this

/** One decimal, for a stated measurement. Never used in a comparison. */
function round1(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 10) / 10 : null;
}

function numericLevel(value) {
  if (Number.isFinite(Number(value))) return Math.max(0, Math.min(4, Number(value)));
  const match = String(value || "").match(/^L([1-4])$/i);
  return match ? Number(match[1]) : 0;
}

// Seat-level deviation is read from the PER-SEAT METRIC (P20) only. P19 is the
// aggregate RSP authority in this model, so its legacy per-seat P19 rows are
// ignored diagnostic evidence and are never inspected for materiality.
function worstSeatDeviation(result) {
  const p20 = Array.isArray(result?.perSeatP20) ? result.perSeatP20 : [];
  let worst = 0;
  for (const seat of p20) {
    const v = Math.abs(Number(seat?.variationDbRaw) || 0);
    if (v > worst) worst = v;
  }
  return worst;
}

function worstPrimarySeatDeviation(result) {
  const p20 = (Array.isArray(result?.perSeatP20) ? result.perSeatP20 : []).filter(s => s.isPrimary);
  let worst = 0;
  for (const seat of p20) {
    const v = Math.abs(Number(seat?.variationDbRaw) || 0);
    if (v > worst) worst = v;
  }
  return worst;
}

/**
 * The AGGREGATE P20 deviation of a result — the figure the designer reads as the
 * overall result. Falls back to this gate's own all-seat measure when a result
 * does not carry the aggregate value. Read only; never recalculated.
 */
function aggregateDeviation(result) {
  const value = Number(result?.achievedP20VariationDb);
  return Number.isFinite(value) ? value : worstSeatDeviation(result);
}

/** The displayed P20 level of a result, or null when it does not carry one. */
function aggregateLevel(result) {
  return Number.isFinite(Number(result?.achievedP20Level)) ? numericLevel(result?.achievedP20Level) : null;
}

// Same-level raw-regression threshold: a primary seat that stays in the same
// displayed level but whose raw deviation worsens by MORE than this is rejected.
// Must match authoritativeFinalistSelection.js — do not create two tolerances.
const PRIMARY_RAW_REGRESSION_THRESHOLD_DB = 1.0;

export function hasPrimarySeatRegression(currentResult, candidateResult) {
  const currentP19 = new Map((currentResult?.perSeatP19 || []).map(s => [String(s.seatId), s]));
  const currentP20 = new Map((currentResult?.perSeatP20 || []).map(s => [String(s.seatId), s]));

  for (const seat of (candidateResult?.perSeatP19 || [])) {
    if (!seat.isPrimary) continue;
    const cur = currentP19.get(String(seat.seatId));
    if (!cur) continue;
    const candidateLevel = numericLevel(seat.level);
    const currentLevel = numericLevel(cur.level);
    if (candidateLevel < currentLevel) {
      return { regressed: true, seatId: seat.seatId, parameter: "P19", currentLevel, candidateLevel };
    }
    // Same-level raw-regression guard: reject if raw deviation worsens by
    // > 1.0 dB while remaining in the same displayed level.
    if (candidateLevel === currentLevel) {
      const candRaw = Math.abs(Number(seat.variationDbRaw) || 0);
      const curRaw = Math.abs(Number(cur.variationDbRaw) || 0);
      if (Number.isFinite(candRaw) && Number.isFinite(curRaw)
        && (candRaw - curRaw) > PRIMARY_RAW_REGRESSION_THRESHOLD_DB) {
        return { regressed: true, seatId: seat.seatId, parameter: "P19", currentLevel, candidateLevel,
          rawDeltaDb: candRaw - curRaw, reason: "same-level raw regression" };
      }
    }
  }
  for (const seat of (candidateResult?.perSeatP20 || [])) {
    if (!seat.isPrimary) continue;
    const cur = currentP20.get(String(seat.seatId));
    if (!cur) continue;
    const candidateLevel = numericLevel(seat.level);
    const currentLevel = numericLevel(cur.level);
    if (candidateLevel < currentLevel) {
      return { regressed: true, seatId: seat.seatId, parameter: "P20", currentLevel, candidateLevel };
    }
    // Same-level raw-regression guard
    if (candidateLevel === currentLevel) {
      const candRaw = Math.abs(Number(seat.variationDbRaw) || 0);
      const curRaw = Math.abs(Number(cur.variationDbRaw) || 0);
      if (Number.isFinite(candRaw) && Number.isFinite(curRaw)
        && (candRaw - curRaw) > PRIMARY_RAW_REGRESSION_THRESHOLD_DB) {
        return { regressed: true, seatId: seat.seatId, parameter: "P20", currentLevel, candidateLevel,
          rawDeltaDb: candRaw - curRaw, reason: "same-level raw regression" };
      }
    }
  }
  return { regressed: false };
}

// A new significant problem is a PER-SEAT (P20) worsening. The aggregate RSP
// P19 has its own authority and is not a per-seat signal, so legacy per-seat P19
// rows are not inspected here.
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
 * Assess whether a calibration-only candidate is a MATERIAL improvement
 * over the current installed tuning.
 *
 * @param {object} currentResult - canonical result with installed tuning
 * @param {object} candidateResult - canonical result with searched tuning
 * @returns {{ material: boolean, reason: string, details?: object }}
 */
export function isMaterialImprovement(currentResult, candidateResult) {
  if (!currentResult || !candidateResult) {
    return { material: false, reason: "Missing result data" };
  }

  // The applicable seat set comes from the per-seat metric (P20). P19 is an
  // aggregate RSP result here, so it can never define the seat set.
  const seats = applicableSeatsFromResult(currentResult);
  const baseline = validateSeatResults(currentResult,seats), candidate = validateSeatResults(candidateResult,seats);
  if (!baseline.valid || !candidate.valid) return {material:false,valid:false,reason:"Invalid or incomplete canonical seat data",details:{baseline,candidate}};

  // Zero-fail-first: failing-seat count decrease is always material.
  // The blanket primary-seat regression veto has been removed — a candidate
  // may trade a strong primary seat (e.g. L4 -> L2) to eliminate a FAIL
  // elsewhere. Fail-count reduction is always material; zero-fail is always
  // material.
  const currentFails = countFailingSeats(currentResult);
  const candidateFails = countFailingSeats(candidateResult);
  if (candidateFails < currentFails) {
    const eliminated = currentFails - candidateFails;
    const reason = candidateFails === 0
      ? `All seats now pass P19 and P20 (eliminated ${eliminated} failing seat${eliminated > 1 ? 's' : ''})`
      : `Eliminated ${eliminated} failing seat${eliminated > 1 ? 's' : ''}`;
    return { material: true, rule: MATERIALITY_RULE.FAIL_COUNT_REDUCED, reason, details: { currentFails, candidateFails, eliminated } };
  }
  // Fail count increased -> never material
  if (candidateFails > currentFails) {
    return {
      material: false,
      rule: MATERIALITY_RULE.FAIL_COUNT_INCREASED,
      reason: `Failing seats increased from ${currentFails} to ${candidateFails}`,
      details: { currentFails, candidateFails },
    };
  }
  // Same fail count -- if fails moved (new fail at a previously-passing seat),
  // do not treat as material improvement on the fail objective.
  if (hasNewFailingSeats(currentResult, candidateResult)) {
    return {
      material: false,
      rule: MATERIALITY_RULE.FAILING_SEAT_MOVED,
      reason: "Failing seat moved \u2014 no net improvement",
      details: { currentFails, candidateFails },
    };
  }

  // ── P19 is RSP-only: materiality reads the aggregate RSP authority ──────
  // Per-seat P19 rows are legitimately empty in this model, so a per-seat
  // comparison sees no P19 change at all. An aggregate RSP improvement — a
  // level gain, or >= 1.0 dB less deviation — is a material improvement.
  // A regression is deliberately NOT rejected here: the trade-off classifier
  // and the P14/P18 safety gate own that decision.
  const rspP19 = compareRspP19(currentResult, candidateResult, WITHIN_LEVEL_THRESHOLD_DB);
  // ── Required-metric veto ────────────────────────────────────────────────
  // A change is a plain improvement only when nothing required was given away
  // to get it. A P19 level drop, or a deviation worse than the SAME canonical
  // 1.0 dB figure the rules below apply, is never stated as an improvement. The
  // candidate is not thrown away: the trade-off classifier owns that decision
  // and surfaces it to the designer as a choice they make deliberately.
  if (rspP19 && !rspP19.improved) {
    const p19LevelDrop = Number.isFinite(Number(rspP19.before?.level))
      && Number.isFinite(Number(rspP19.after?.level))
      && Number(rspP19.after.level) < Number(rspP19.before.level);
    const p19WorseByDb = -Number(rspP19.deviationDeltaDb);
    if (p19LevelDrop || (Number.isFinite(p19WorseByDb) && p19WorseByDb > WITHIN_LEVEL_THRESHOLD_DB)) {
      return {
        material: false,
        rule: MATERIALITY_RULE.P19_AGGREGATE_WORSENED,
        reason: p19LevelDrop
          ? `P19 aggregate RSP level dropped: L${rspP19.before.level} -> L${rspP19.after.level}`
          : `P19 aggregate RSP deviation worsened by ${floorP19P20Deviation(p19WorseByDb)} dB`,
        details: { rspP19, p19WorseByDb },
      };
    }
  }
  if (rspP19?.improved) {
    return {
      material: true,
      rule: MATERIALITY_RULE.P19_AGGREGATE_IMPROVED,
      reason: rspP19.levelImproved
        ? `P19 aggregate RSP level improved: L${rspP19.before.level} -> L${rspP19.after.level}`
        : `P19 aggregate RSP deviation improved by ${floorP19P20Deviation(rspP19.deviationDeltaDb)} dB`,
      details: { rspP19 },
    };
  }

  // ── Same-level CONTINUOUS improvement on the aggregate P20 ──────────────
  // A candidate does NOT have to cross an RP22 level boundary to be valuable.
  // P20 ±15 dB · L1 -> P20 ±11 dB · L1 is a real improvement in seat-to-seat
  // consistency, measured on the same figure the designer reads. The figure is
  // the SAME canonical 1.0 dB action threshold this gate already applies to a
  // same-level seat improvement — no new threshold and no new comparison — and
  // no displayed level is required to move. A level crossing is still the
  // strongest result; it is simply no longer the only one that counts.
  const p20Before = aggregateDeviation(currentResult);
  const p20After = aggregateDeviation(candidateResult);
  const p20Improvement = p20Before - p20After;
  if (p20Improvement >= WITHIN_LEVEL_THRESHOLD_DB) {
    const levelHeld = aggregateLevel(currentResult) !== null
      && aggregateLevel(currentResult) === aggregateLevel(candidateResult);
    return {
      material: true,
      rule: MATERIALITY_RULE.P20_AGGREGATE_IMPROVED,
      reason: levelHeld
        ? `Seat-to-seat consistency improved by ${floorP19P20Deviation(p20Improvement)} dB without changing the achieved level`
        : `Seat-to-seat consistency improved by ${floorP19P20Deviation(p20Improvement)} dB`,
      details: { p20Before, p20After, improvement: p20Improvement, levelHeld },
    };
  }

  // Same fail count, no moved fails -- check for level / deviation / null
  // improvements. Use the actual matched seats, from the PER-SEAT metric (P20).
  // P19 has no per-seat form: its aggregate authority was assessed above.
  const pairs = (candidateResult.perSeatP20||[]).map(seat=>({
    parameter:"P20",seatId:seat.seatId,
    before:(currentResult.perSeatP20||[]).find(s=>String(s.seatId)===String(seat.seatId)),after:seat,
  }));
  const improvements=pairs.filter(p=>canonicalLevel(p.after.level)>canonicalLevel(p.before.level));
  if(improvements.length) return {material:true,rule:MATERIALITY_RULE.SEAT_LEVEL_IMPROVED,reason:"Level improvement: "+improvements.map(p=>p.seatId+" "+p.parameter+" L"+canonicalLevel(p.before.level)+" -> L"+canonicalLevel(p.after.level)).join(", "),details:{seats:improvements}};
  const sameLevels = pairs.every(p=>canonicalLevel(p.after.level)===canonicalLevel(p.before.level));

  // B. Same levels, worst-seat deviation improves by >= 1.0 dB
  if (sameLevels) {
    const currentWorst = worstPrimarySeatDeviation(currentResult);
    const candidateWorst = worstPrimarySeatDeviation(candidateResult);
    const improvement = currentWorst - candidateWorst;
    if (improvement >= WITHIN_LEVEL_THRESHOLD_DB) {
      return { material: true, rule: MATERIALITY_RULE.SAME_LEVEL_SEAT_DEVIATION, reason: `Worst-seat deviation improved by ${floorP19P20Deviation(improvement)} dB`, details: { currentWorst, candidateWorst, improvement } };
    }
  }

  // C. Severe null improves >= 3 dB with no new significant problem
  const currentWorstAll = worstSeatDeviation(currentResult);
  const candidateWorstAll = worstSeatDeviation(candidateResult);
  const nullReduction = currentWorstAll - candidateWorstAll;
  if (nullReduction >= SEVERE_NULL_THRESHOLD_DB && !hasNewSignificantProblem(currentResult, candidateResult)) {
    return { material: true, rule: MATERIALITY_RULE.SEVERE_NULL_REDUCED, reason: `Severe null reduced by ${floorP19P20Deviation(nullReduction)} dB`, details: { currentWorstAll, candidateWorstAll, nullReduction } };
  }

  // D. Headroom is NOT an independent user-facing materiality qualifier.
  // It belongs in safety, ranking/tiebreaking, and avoiding excessive
  // calibration cost — but it must not independently cause MATERIAL = true.
  // A recommendation that only improves headroom without any P19/P20 level
  // or deviation improvement is NOT a user-facing recommendation.

  // The exact measurements every rule above consulted, returned WITH the refusal
  // so the decision can state the rule that actually held the change. No rule,
  // threshold or comparison is changed here — the numbers are simply not thrown
  // away, so a stated reason can never name a threshold this gate did not apply.
  // EVERY seat the rule read is checked, not just the worst one, so a "no seat
  // clears the rule" claim is only ever made when it is true of every seat in
  // scope. Pure reporting — no threshold and no comparison is changed.
  const seatScope = (candidateResult?.perSeatP20 || []).filter((seat) => seat?.isPrimary).length > 0
    ? "primary"
    : "all";
  const scopedSeats = (candidateResult?.perSeatP20 || [])
    .filter((seat) => (seatScope === "primary" ? seat?.isPrimary : true));
  const beforeBySeat = new Map((currentResult?.perSeatP20 || []).map((seat) => [String(seat?.seatId), seat]));
  const seatRows = scopedSeats.map((seat) => {
    const before = beforeBySeat.get(String(seat?.seatId));
    const beforeDb = before ? Math.abs(Number(before?.variationDbRaw) || 0) : null;
    const afterDb = Math.abs(Number(seat?.variationDbRaw) || 0);
    return {
      seatId: seat?.seatId ?? null,
      improvementDb: beforeDb == null ? null : round1(beforeDb - afterDb),
    };
  });
  const checked = seatRows.filter((row) => row.improvementDb != null);
  const clearing = checked.filter((row) => row.improvementDb >= WITHIN_LEVEL_THRESHOLD_DB);
  const worstSeatRow = checked.reduce((worst, row) =>
    !worst || row.improvementDb < worst.improvementDb ? row : worst, null);

  const primarySeats = (candidateResult?.perSeatP20 || []).filter((seat) => seat?.isPrimary).length;
  const currentPrimaryWorst = worstPrimarySeatDeviation(currentResult);
  const candidatePrimaryWorst = worstPrimarySeatDeviation(candidateResult);
  const currentAnyWorst = worstSeatDeviation(currentResult);
  const candidateAnyWorst = worstSeatDeviation(candidateResult);

  // ── WHAT this refusal is ── reporting only ──────────────────────────────
  // The same 1.0 dB figure the rules above apply, read against the aggregate
  // result the designer sees, separates a change worth their attention from one
  // that is not. It decides nothing: MATERIAL stays false, every regression
  // guard above stays in force, and no threshold, comparison or score changes.
  const aggregateBefore = aggregateDeviation(currentResult);
  const aggregateAfter = aggregateDeviation(candidateResult);
  const aggregateImprovementDb = aggregateBefore != null && aggregateAfter != null
    ? aggregateBefore - aggregateAfter
    : null;
  const aggregateLevelBefore = aggregateLevel(currentResult);
  const aggregateLevelAfter = aggregateLevel(candidateResult);
  const levelDropped = aggregateLevelBefore != null && aggregateLevelAfter != null
    && aggregateLevelAfter < aggregateLevelBefore;
  const primaryRegression = hasPrimarySeatRegression(currentResult, candidateResult);
  const meaningfulRegression = hasNewSignificantProblem(currentResult, candidateResult)
    || primaryRegression.regressed === true;
  const classification = classifyCalibrationDisposition({
    improvementDb: aggregateImprovementDb,
    levelDropped,
    meaningfulRegression,
  });

  return {
    material: false,
    rule: MATERIALITY_RULE.SEAT_LEVEL_NOT_CLEARED,
    reason: "No material calibration improvement",
    details: {
      sameLevels,
      // Which seats the refusal was decided on, and the confirmation that every
      // one of them was read before any "no seat clears the rule" claim.
      seatScope,
      seatsInScope: scopedSeats.length,
      seatsChecked: checked.length,
      everySeatInScopeChecked: checked.length === scopedSeats.length,
      seatsClearingThreshold: clearing.length,
      worstSeatId: worstSeatRow?.seatId ?? null,
      worstSeatImprovementDb: worstSeatRow?.improvementDb ?? null,
      primarySeatCount: primarySeats,
      // Positive = better. The seat-level figure the same-level rule reads.
      worstPrimarySeatImprovementDb: round1(currentPrimaryWorst - candidatePrimaryWorst),
      // Positive = better. The all-seats figure the severe-null rule reads.
      worstAnySeatImprovementDb: round1(currentAnyWorst - candidateAnyWorst),
      primarySeatThresholdDb: WITHIN_LEVEL_THRESHOLD_DB,
      severeNullThresholdDb: SEVERE_NULL_THRESHOLD_DB,
      newSignificantProblem: hasNewSignificantProblem(currentResult, candidateResult),
      // ── What the refusal is worth, with the pair it was read from ──
      aggregateImprovementDb: round1(aggregateImprovementDb),
      aggregateP20BeforeDb: round1(aggregateBefore),
      aggregateP20AfterDb: round1(aggregateAfter),
      aggregateLevelBefore,
      aggregateLevelAfter,
      levelDropped,
      primarySeatRegression: primaryRegression.regressed === true,
      meaningfulRegression,
      disposition: classification.disposition,
      dispositionThresholdDb: classification.thresholdDb,
    },
  };
}