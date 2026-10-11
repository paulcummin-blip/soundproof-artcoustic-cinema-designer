// optimiserCalibrationEvidence.js
// ---------------------------------------------------------------------------
// The persisted CALIBRATION EVIDENCE of a completed optimiser run.
//
// Product rule this exists to satisfy: the panel states what ADI did with the
// calibration levers — delay, gain, polarity and phase — and it may only say
// "no useful calibration-only improvement was found" when the SAVED record
// proves the run actually tested them. Without that proof the panel says the
// evidence was not retained and asks for the re-run that produces it. A claim is
// never made from missing evidence.
//
// Per lever it records, compactly and only from values the run itself produced:
//   - whether the search ran
//   - how many candidates it generated and confirmed
//   - the best candidate it canonically confirmed, with P19 and P20 before/after,
//     the lever's own signed value (delay offset, gain trim) and the limiting seat
//   - the grouping it searched and the range it swept
//   - the run's own reason for not accepting that candidate
//
// READ-ONLY: it reads the selection the run produced. It evaluates nothing,
// scores nothing, recalculates nothing and changes no bass maths, no optimiser
// scoring and no RP22 grading. A value the run did not produce stays null.
// ---------------------------------------------------------------------------

import { readRspP19 } from "../improveBassV2/p19Authority.js";
import { POLARITY_NOT_EVALUATED_REASON } from "./optimiserPlanConstants.js";
import { deviationText } from "./optimiserWholeNumberDb.js";
import { savedCalibrationCandidates } from "./savedCalibrationDecision.js";
import {
  CALIBRATION_NO_DECISION_RECORDED_REASON,
  CALIBRATION_READY_TO_APPLY_REASON,
  describeCalibrationNotApplied,
} from "../optimiseWorkflow/adiCalibrationAutoApplyAuthority.js";

export const CALIBRATION_EVIDENCE_SCHEMA_VERSION = 1;

/** Every calibration lever the record covers. */
export const CALIBRATION_EVIDENCE_LEVERS = Object.freeze(["delay", "gain", "polarity", "phase"]);

/**
 * The levers the panel's calibration finding names. The no-improvement claim is
 * about exactly these three, so exactly these three must be evidenced.
 */
export const CALIBRATION_CLAIM_LEVERS = Object.freeze(["delay", "gain", "polarity"]);

export const CALIBRATION_EVIDENCE_LABEL = Object.freeze({
  delay: "Delay",
  gain: "Gain",
  polarity: "Polarity",
  phase: "Phase",
  combined: "Combined calibration",
});

/**
 * The combined calibration result: the levers the optimiser retuned TOGETHER on
 * one geometry (phase → delay → gain). It is recorded separately from the four
 * isolated levers, because a combined result is not any one lever's own result —
 * and without it the panel can only ever compare delay-only against gain-only.
 */
export const COMBINED_CALIBRATION_LEVER = "combined";

export const COMBINED_CALIBRATION_SCOPE =
  "Phase, delay and gain retuned together on one geometry — never a single lever's value alone.";

/** The stated detail when a saved record kept no combined calibration result. */
export const COMBINED_EVIDENCE_MISSING_DETAIL =
  "Saved optimiser evidence did not include a combined calibration result.";

/** The reason recorded when the combined search ran and confirmed no result. */
export const COMBINED_NO_CANDIDATE_REASON =
  "Tested — no combined calibration candidate was confirmed in this run.";

/** The mandated copy when the run kept no calibration evidence to read. */
export const CALIBRATION_EVIDENCE_MISSING_MESSAGE =
  "Calibration evidence was not retained for this run. Re-run calibration to evaluate delay, gain and polarity.";

/**
 * The same fact stated once more inside Engineer details, where the reader is
 * already looking at the retained record: it says which part of it is absent.
 */
export const CALIBRATION_EVIDENCE_MISSING_DETAIL =
  "Saved optimiser evidence did not include the calibration candidate summary.";

/** The mandated copy when the best calibration candidate was a trade-off. */
export const CALIBRATION_TRADE_OFF_MESSAGE =
  "A calibration change improves one measure and worsens another — held for the designer, not applied automatically.";

/** Whether a lever's own evidence can be read back from the saved record. */
export const CALIBRATION_EVIDENCE_STATUS = Object.freeze({
  RETAINED: "retained",
  MISSING: "missing",
});

/** What came of a lever's search, in the fixed vocabulary. */
export const CALIBRATION_EVIDENCE_RESULT = Object.freeze({
  APPLIED: "applied",
  IMPROVEMENT_NOT_APPLIED: "improvement_not_applied",
  TRADE_OFF: "trade_off",
  NO_USEFUL_IMPROVEMENT: "no_useful_improvement",
  NOT_TESTED_IN_RUN: "not_tested_in_run",
  EVIDENCE_MISSING: "evidence_missing",
});

const RESULT_LABEL = Object.freeze({
  [CALIBRATION_EVIDENCE_RESULT.APPLIED]: "Applied",
  // An improvement that was not applied is NEVER labelled on its own: the label
  // is the rule that held it, read from the run's own calibration decision. When
  // a saved record predates that decision, the honest sentence below is used.
  [CALIBRATION_EVIDENCE_RESULT.IMPROVEMENT_NOT_APPLIED]: CALIBRATION_NO_DECISION_RECORDED_REASON,
  [CALIBRATION_EVIDENCE_RESULT.TRADE_OFF]: "Trade-off — not applied automatically",
  [CALIBRATION_EVIDENCE_RESULT.NO_USEFUL_IMPROVEMENT]: "No useful improvement",
  [CALIBRATION_EVIDENCE_RESULT.NOT_TESTED_IN_RUN]: "Not tested in this run",
  [CALIBRATION_EVIDENCE_RESULT.EVIDENCE_MISSING]: "Evidence not retained",
});

/**
 * The outcome text of one lever: for an improvement that was not applied, always
 * the reason it was held — never a bare "not applied".
 */
export function calibrationOutcomeLabel(record) {
  if (!record) return null;
  if (record.result === CALIBRATION_EVIDENCE_RESULT.IMPROVEMENT_NOT_APPLIED
    || record.result === CALIBRATION_EVIDENCE_RESULT.TRADE_OFF) {
    return record.notAppliedReason
      || RESULT_LABEL[CALIBRATION_EVIDENCE_RESULT.IMPROVEMENT_NOT_APPLIED];
  }
  return RESULT_LABEL[record.result] || null;
}

/** The fixed reason used only when the measured deltas themselves prove it. */
export const CALIBRATION_NO_IMPROVEMENT_REASON =
  "No calibration candidate cleared the 1 dB action threshold";

/** A change smaller than this is not an improvement (the panel's action threshold). */
const ACTION_THRESHOLD_DB = 1;

function num(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function round2(value) {
  const numeric = num(value);
  return numeric == null ? null : Math.round(numeric * 100) / 100;
}

/** "+3 dB" / "−2 ms" / "0 dB" — the lever's own signed value. */
function signedText(value, unit, places = 2) {
  const numeric = num(value);
  if (numeric == null) return null;
  const rounded = Number(numeric.toFixed(places));
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  return `${sign}${Math.abs(rounded)} ${unit}`;
}

/** "P19 ±4 dB → ±4 dB" — whole numbers, the card's own presentation. */
function pairText(label, before, after) {
  const beforeText = num(before) == null ? null : deviationText(num(before));
  const afterText = num(after) == null ? null : deviationText(num(after));
  if (!beforeText && !afterText) return null;
  if (beforeText && afterText) return `${label} ${beforeText} → ${afterText}`;
  return `${label} ${beforeText || afterText}`;
}

/** The canonical P19 authority of one result. */
function p19Of(result) {
  const read = readRspP19(result);
  return { deviationDb: num(read.deviationDb), level: read.level ?? null };
}

/** The canonical P20 authority of one result. */
function p20Of(result) {
  const value = num(result?.achievedP20VariationDb);
  return value == null ? { value: null, level: null } : { value, level: result?.achievedP20Level ?? null };
}

/**
 * The worst seat of a confirmed result, read from its own per-seat P20 rows. The
 * limiting frequency is stated only when that result carries one.
 */
function limitingOf(result) {
  const rows = Array.isArray(result?.perSeatP20) ? result.perSeatP20 : [];
  let worst = null;
  for (const seat of rows) {
    const value = Math.abs(num(seat?.variationDbRaw) ?? NaN);
    if (!Number.isFinite(value)) continue;
    if (!worst || value > worst.value) worst = { value, seatId: seat?.seatId ?? null };
  }
  return {
    limitingSeatId: worst?.seatId ?? null,
    limitingFrequencyHz: num(result?.worstFrequencyHz ?? result?.p20WorstFrequencyHz),
  };
}

/** One candidate, stated compactly against the run's own baseline. */
function candidateRecord({ candidateId, result, baseline, extra = null }) {
  const before19 = p19Of(baseline);
  const after19 = p19Of(result);
  const before20 = p20Of(baseline);
  const after20 = p20Of(result);
  return {
    candidateId: candidateId ?? result?.candidateId ?? null,
    p19Before: before19.deviationDb,
    p19After: after19.deviationDb,
    p19LevelBefore: before19.level,
    p19LevelAfter: after19.level,
    p20Before: before20.value,
    p20After: after20.value,
    p20LevelBefore: before20.level,
    p20LevelAfter: after20.level,
    // The improvement the candidate itself measured. Negative = better.
    p19DeltaDb: before19.deviationDb != null && after19.deviationDb != null
      ? round2(after19.deviationDb - before19.deviationDb) : null,
    p20DeltaDb: before20.value != null && after20.value != null
      ? round2(after20.value - before20.value) : null,
    ...limitingOf(result),
    ...(extra || {}),
  };
}

/** Whether a candidate's own measured values show a real improvement. */
function candidateImproves(candidate) {
  if (!candidate) return false;
  const p20 = num(candidate.p20DeltaDb);
  const p19 = num(candidate.p19DeltaDb);
  return (p20 != null && p20 <= -ACTION_THRESHOLD_DB) || (p19 != null && p19 <= -ACTION_THRESHOLD_DB);
}

/** Whether a candidate's own measured values prove nothing useful came of it. */
function candidateProvesNoImprovement(candidate) {
  if (!candidate) return false;
  const p20 = num(candidate.p20DeltaDb);
  const p19 = num(candidate.p19DeltaDb);
  if (p20 == null && p19 == null) return false;
  return !candidateImproves(candidate);
}

/** The grouping the search used, compactly. */
function compactGrouping(grouping) {
  if (!grouping || typeof grouping !== "object") return null;
  const groups = Array.isArray(grouping.groups)
    ? grouping.groups.map((group) => ({
      id: group?.id ?? null,
      label: group?.label ?? null,
      role: group?.role ?? null,
    }))
    : [];
  return { status: grouping.status ?? null, reason: grouping.reason ?? null, groups };
}

/**
 * The range the grouped sweep actually covered, read from the search's own
 * ledger: the adjustments generated per direction and the effective (signed)
 * offsets those adjustments produce for the rear group.
 */
function ledgerRange(ledger) {
  const rows = Array.isArray(ledger) ? ledger : [];
  if (rows.length === 0) return null;
  const directions = new Map();
  const offsets = [];
  for (const row of rows) {
    const adjustment = num(row?.adjustmentMs);
    const direction = row?.direction ?? null;
    if (direction && direction !== "current" && adjustment != null) {
      const current = directions.get(direction) || { id: direction, minMs: adjustment, maxMs: adjustment, candidates: 0 };
      current.minMs = Math.min(current.minMs, adjustment);
      current.maxMs = Math.max(current.maxMs, adjustment);
      current.candidates += 1;
      directions.set(direction, current);
    }
    const offset = num(row?.effectiveOffsetMs);
    if (offset != null && offset !== 0) offsets.push(offset);
  }
  return {
    directions: [...directions.values()],
    signedOffsetsMs: offsets.length ? { min: Math.min(...offsets), max: Math.max(...offsets) } : null,
  };
}

/**
 * One lever's record. `evidenceStatus` states whether the saved record can be
 * read back at all: a search that ran and kept its count or its best candidate,
 * or a search that did not apply to this design and recorded why.
 */
function leverRecord({
  lever,
  tested = false,
  candidateCount = null,
  candidateCounts = null,
  grouping = null,
  testedRange = null,
  bestCandidate = null,
  result = CALIBRATION_EVIDENCE_RESULT.EVIDENCE_MISSING,
  reason = null,
  scope = null,
}) {
  const retained = (tested === true && (candidateCount != null || bestCandidate != null))
    || (tested !== true && Boolean(reason));
  return {
    lever,
    label: CALIBRATION_EVIDENCE_LABEL[lever] || lever,
    tested: tested === true,
    evidenceStatus: retained
      ? CALIBRATION_EVIDENCE_STATUS.RETAINED
      : CALIBRATION_EVIDENCE_STATUS.MISSING,
    candidateCount,
    candidateCounts,
    grouping,
    testedRange,
    bestCandidate,
    result: retained ? result : CALIBRATION_EVIDENCE_RESULT.EVIDENCE_MISSING,
    reason,
    scope,
  };
}

/** The run's own evaluation of one candidate, when it recorded one. */
function evaluationFor(evaluations, candidateId) {
  const list = Array.isArray(evaluations) ? evaluations : [];
  return list.find((entry) => entry?.candidateId === candidateId) || null;
}

/** The run's own reason for the evaluation of one candidate, when it recorded one. */
function reasonForCandidate({ candidateId, evaluations, material }) {
  const evaluation = evaluationFor(evaluations, candidateId);
  // The run's own recorded reason first: the material assessment, then the
  // evaluation it produced for this candidate. Never a reason this module made up.
  return material?.reason
    || (typeof evaluation?.materiality?.reason === "string" ? evaluation.materiality.reason : null)
    || (typeof evaluation?.tradeOff?.reason === "string" ? evaluation.tradeOff.reason : null)
    || null;
}

/** What came of a lever's search, from the run's own records. */
function outcomeFor({ applied = false, tradeOff = false, material = null, bestCandidate = null, tested = true }) {
  if (applied) return CALIBRATION_EVIDENCE_RESULT.APPLIED;
  if (!tested) return CALIBRATION_EVIDENCE_RESULT.NOT_TESTED_IN_RUN;
  if (tradeOff) return CALIBRATION_EVIDENCE_RESULT.TRADE_OFF;
  if (material?.material === true || candidateImproves(bestCandidate)) {
    return CALIBRATION_EVIDENCE_RESULT.IMPROVEMENT_NOT_APPLIED;
  }
  return CALIBRATION_EVIDENCE_RESULT.NO_USEFUL_IMPROVEMENT;
}

/** The delay lever: the grouped front/rear sweep and its best confirmed option. */
function buildDelayEvidence({ selection, baseline, appliedLevers }) {
  const diagnostics = selection?.calibrationDiagnostics || null;
  const ledger = Array.isArray(diagnostics?.ledger) ? diagnostics.ledger : [];
  const options = Array.isArray(diagnostics?.options) ? diagnostics.options : [];
  const retention = num(diagnostics?.retained);
  const confirmed = num(diagnostics?.confirmed);
  const grouping = compactGrouping(diagnostics?.grouping);
  const accepted = selection?.calibrationResult || null;

  const candidates = options
    .map((option) => ({
      candidateId: option?.candidateId ?? option?.canonical?.candidateId ?? null,
      result: option?.canonical || option?.validated || null,
      valid: option?.validity?.valid !== false,
    }))
    .filter((entry) => entry.result && entry.valid);

  // The run's own accepted delay candidate first; otherwise the confirmed option
  // whose own canonical values are best. Reading the minimum of values the run
  // already confirmed selects WHICH evidence to show — it scores nothing.
  const best = accepted
    ? (candidates.find((entry) => entry.candidateId === accepted.candidateId)
      || { candidateId: accepted.candidateId ?? null, result: accepted, valid: true })
    : candidates
      .slice()
      .sort((a, b) => {
        const p20 = (num(p20Of(a.result).value) ?? Infinity) - (num(p20Of(b.result).value) ?? Infinity);
        if (p20 !== 0) return p20;
        const p19 = (num(p19Of(a.result).deviationDb) ?? Infinity) - (num(p19Of(b.result).deviationDb) ?? Infinity);
        if (p19 !== 0) return p19;
        return String(a.candidateId).localeCompare(String(b.candidateId));
      })[0] || null;

  const ledgerRow = best
    ? ledger.find((row) => row?.id === best.candidateId) || null
    : null;
  const bestCandidate = best
    ? candidateRecord({
      candidateId: best.candidateId,
      result: best.result,
      baseline,
      extra: {
        // The engine's own signed offset for that candidate, never a re-derived one.
        signedOffsetMs: num(ledgerRow?.effectiveOffsetMs),
        adjustmentMs: num(ledgerRow?.adjustmentMs),
        direction: ledgerRow?.direction ?? null,
      },
    })
    : null;

  // The run's own verdict on this candidate: a trade-off is never restated as a
  // no-improvement conclusion, whatever the measured deltas are.
  const evaluation = evaluationFor(diagnostics?.evaluations, best?.candidateId ?? null);
  const reason = reasonForCandidate({
    candidateId: best?.candidateId ?? null,
    evaluations: diagnostics?.evaluations,
    material: selection?.calibrationMaterial,
  }) || (bestCandidate && candidateProvesNoImprovement(bestCandidate) ? CALIBRATION_NO_IMPROVEMENT_REASON : null);

  const tested = num(diagnostics?.coarseCount) != null || num(diagnostics?.retained) != null
    || num(diagnostics?.confirmed) != null || candidates.length > 0;
  const skippedReason = typeof diagnostics?.grouping?.reason === "string" ? diagnostics.grouping.reason : null;

  return leverRecord({
    lever: "delay",
    tested,
    candidateCount: retention ?? confirmed,
    candidateCounts: diagnostics ? {
      coarse: num(diagnostics.coarseCount),
      fine: num(diagnostics.fineCount),
      retained: retention,
      confirmed,
      valid: num(diagnostics.valid),
      invalid: num(diagnostics.invalid),
    } : null,
    grouping,
    testedRange: ledgerRange(ledger),
    bestCandidate,
    result: outcomeFor({
      applied: appliedLevers.includes("delay"),
      tradeOff: Boolean(accepted?.tradeOff)
        || Boolean(best?.result?.tradeOff)
        || evaluation?.status === "trade-off",
      material: selection?.calibrationMaterial,
      bestCandidate,
      tested,
    }),
    reason: tested ? reason : skippedReason,
    scope: null,
  });
}

/** The gain lever: the grouped front/rear trim sweep and its best attempt. */
function buildGainEvidence({ selection, baseline, appliedLevers }) {
  const diagnostics = selection?.gainDiagnostics || null;
  const accepted = selection?.gainResult || null;
  const attempt = diagnostics?.bestAttempt || null;
  const gainAdjustable = typeof diagnostics?.gainAdjustable === "boolean" ? diagnostics.gainAdjustable : null;

  const bestCandidate = accepted
    ? candidateRecord({ candidateId: accepted.candidateId, result: accepted, baseline, extra: { adjustmentDb: num(attempt?.adjustmentDb) } })
    : attempt
      ? {
        candidateId: attempt.candidateId ?? null,
        p19Before: p19Of(baseline).deviationDb, p19After: num(attempt.p19VariationDb),
        p19LevelBefore: p19Of(baseline).level, p19LevelAfter: attempt.p19Level ?? null,
        p20Before: p20Of(baseline).value, p20After: num(attempt.p20VariationDb),
        p20LevelBefore: p20Of(baseline).level, p20LevelAfter: attempt.p20Level ?? null,
        p19DeltaDb: p19Of(baseline).deviationDb != null && num(attempt.p19VariationDb) != null
          ? round2(num(attempt.p19VariationDb) - p19Of(baseline).deviationDb) : null,
        p20DeltaDb: p20Of(baseline).value != null && num(attempt.p20VariationDb) != null
          ? round2(num(attempt.p20VariationDb) - p20Of(baseline).value) : null,
        limitingSeatId: null,
        limitingFrequencyHz: null,
        adjustmentDb: num(attempt.adjustmentDb),
      }
      : null;

  // The run's own verdict on this candidate: a trade-off is never restated as a
  // no-improvement conclusion, whatever the measured deltas are.
  const evaluation = evaluationFor(diagnostics?.evaluations, bestCandidate?.candidateId ?? null);
  const reason = reasonForCandidate({
    candidateId: bestCandidate?.candidateId ?? null,
    evaluations: diagnostics?.evaluations,
    material: selection?.gainMaterial,
  }) || (bestCandidate && candidateProvesNoImprovement(bestCandidate) ? CALIBRATION_NO_IMPROVEMENT_REASON : null);

  const tested = num(diagnostics?.coarseCount) != null || num(diagnostics?.retained) != null
    || num(diagnostics?.confirmed) != null || Boolean(attempt) || Boolean(accepted);
  const notApplicableReason = gainAdjustable === false
    ? (typeof diagnostics?.reason === "string" ? diagnostics.reason : null)
    : null;

  return leverRecord({
    lever: "gain",
    tested,
    candidateCount: num(diagnostics?.retained) ?? num(diagnostics?.confirmed),
    candidateCounts: diagnostics ? {
      coarse: num(diagnostics.coarseCount),
      fine: num(diagnostics.fineCount),
      retained: num(diagnostics.retained),
      confirmed: num(diagnostics.confirmed),
      valid: num(diagnostics.valid),
      invalid: num(diagnostics.invalid),
    } : null,
    grouping: diagnostics
      ? {
        status: diagnostics.groupingStatus ?? diagnostics.grouping?.status ?? null,
        reason: diagnostics.reason ?? diagnostics.grouping?.reason ?? null,
        groups: Array.isArray(diagnostics.groups)
          ? diagnostics.groups.map((group) => ({ id: group?.id ?? null, label: group?.label ?? null, role: null }))
          : compactGrouping(diagnostics.grouping)?.groups || [],
      }
      : null,
    testedRange: null,
    bestCandidate,
    result: outcomeFor({
      applied: appliedLevers.includes("gain"),
      tradeOff: Boolean(accepted?.tradeOff) || evaluation?.status === "trade-off",
      material: selection?.gainMaterial,
      bestCandidate,
      tested,
    }),
    reason: tested ? reason : notApplicableReason,
    scope: gainAdjustable === false ? "Gain cannot be adjusted for this layout" : null,
  });
}

/** The polarity lever: explored inside the grouped phase/polarity search. */
function buildPolarityEvidence({ selection, baseline, appliedLevers }) {
  const phase = selection?.phaseDiagnostics || null;
  const combined = selection?.combinedResult || null;
  const optionCount = num(phase?.optionCount);
  const bestCandidate = combined
    ? candidateRecord({ candidateId: combined.candidateId, result: combined, baseline })
    : null;

  const reason = typeof selection?.combinedMaterial?.reason === "string"
    ? selection.combinedMaterial.reason
    : (combined?.tradeOff?.reason || null);

  const tested = optionCount != null ? optionCount > 0 : Boolean(bestCandidate);

  return leverRecord({
    lever: "polarity",
    tested,
    candidateCount: optionCount,
    candidateCounts: { groupedSearchOptions: optionCount },
    grouping: compactGrouping(phase?.grouping),
    testedRange: ledgerRange(phase?.ledger),
    bestCandidate,
    result: outcomeFor({
      applied: appliedLevers.includes("polarity"),
      tradeOff: Boolean(combined?.tradeOff),
      material: selection?.combinedMaterial,
      bestCandidate,
      tested,
    }),
    reason,
    scope: POLARITY_NOT_EVALUATED_REASON,
  });
}

/** The phase lever: the subwoofer-only all-pass search, and what it does not cover. */
function buildPhaseEvidence({ selection, baseline, appliedLevers }) {
  const phase = selection?.phaseDiagnostics || null;
  const result = selection?.phaseResult || null;
  const optionCount = num(phase?.optionCount);
  const referenceHz = num(phase?.phaseReferenceHz);
  const bestCandidate = result
    ? candidateRecord({ candidateId: result.candidateId, result, baseline })
    : null;

  const scope = [
    `Subwoofer-only all-pass alignment${referenceHz != null ? ` referenced at ${referenceHz} Hz` : ""}`,
    "the speaker/sub crossover region is not evaluated",
  ].join(" — ");

  const tested = optionCount != null ? optionCount > 0 : Boolean(bestCandidate);

  return leverRecord({
    lever: "phase",
    tested,
    candidateCount: optionCount,
    candidateCounts: { groupedSearchOptions: optionCount },
    grouping: compactGrouping(phase?.grouping),
    testedRange: ledgerRange(phase?.ledger),
    bestCandidate,
    result: outcomeFor({
      applied: appliedLevers.includes("phase"),
      tradeOff: Boolean(result?.tradeOff),
      material: selection?.phaseMaterial,
      bestCandidate,
      tested,
    }),
    reason: typeof selection?.phaseMaterial?.reason === "string"
      ? selection.phaseMaterial.reason
      : (phase?.grouping?.reason || null),
    scope,
  });
}

/**
 * The COMBINED calibration result: the candidate the optimiser's own combined
 * retune produced, what it retuned, and what came of it.
 *
 * A run that searched combined calibration and confirmed nothing keeps its own
 * count and says so — that is a tested lever with no result, never an absent
 * capability, and never silence about a search that ran.
 */
function buildCombinedEvidence({ selection, baseline, appliedCandidateId = null }) {
  const diagnostics = selection?.combinedDiagnostics || null;
  const result = selection?.combinedResult || null;
  const from = result?.combinedFrom || null;

  const bestCandidate = result
    ? candidateRecord({
      candidateId: result.candidateId,
      result,
      baseline,
      extra: {
        // Which levers THIS candidate retuned. A flag the run did not record
        // stays false: nothing is inferred from the levers it did record.
        phaseRetuned: from?.phaseRetuned === true,
        delayRetuned: from?.delayRetuned === true,
        gainRetuned: from?.gainRetuned === true,
        calibrationOnly: from?.calibrationOnly === true,
        candidateOrigin: result.candidateOrigin || null,
        seatingOffsetMm: num(result.seatingOffsetMm ?? from?.seatingOffsetMm),
      },
    })
    : null;

  const testedCount = num(diagnostics?.tested);
  const confirmedCount = num(diagnostics?.confirmed);
  const tested = testedCount != null || confirmedCount != null || Boolean(result);
  const applied = appliedCandidateId != null && result?.candidateId != null
    && String(result.candidateId) === String(appliedCandidateId);

  const materialReason = typeof selection?.combinedMaterial?.reason === "string"
    ? selection.combinedMaterial.reason
    : null;

  return leverRecord({
    lever: COMBINED_CALIBRATION_LEVER,
    tested,
    candidateCount: confirmedCount ?? (result ? 1 : null),
    candidateCounts: diagnostics ? {
      tested: testedCount,
      confirmed: confirmedCount,
      valid: num(diagnostics.valid),
      invalid: num(diagnostics.invalid),
    } : null,
    grouping: null,
    testedRange: null,
    bestCandidate,
    result: outcomeFor({
      applied,
      tradeOff: Boolean(result?.tradeOff),
      material: selection?.combinedMaterial,
      bestCandidate,
      tested,
    }),
    reason: tested
      ? (materialReason || (bestCandidate ? null : COMBINED_NO_CANDIDATE_REASON))
      : null,
    scope: COMBINED_CALIBRATION_SCOPE,
  });
}

/**
 * Build the compact calibration evidence for a completed run.
 *
 * @param {object} params
 * @param {object|null} params.selection - the run's own selection
 * @param {object|null} [params.baseline] - the run's baseline result
 * @param {string[]} [params.appliedLevers] - levers the saved plan offers to apply
 * @returns {object|null} null when the run retained nothing to read
 */
/**
 * What the run's own calibration decision did with one lever.
 *
 * The decision is the authority for WHAT ADI did: a lever it applied is APPLIED;
 * a lever whose improvement it held keeps the sentence that says why — the rule
 * that blocked it, or the stronger candidate it lost to. An improvement that was
 * found but not applied is NEVER left without that sentence.
 */
function applyDecisionToLever(record, lever, { decision = null, decisionApplied = false } = {}) {
  const entry = decision?.perLever?.[lever] || null;

  if (entry?.applied === true) {
    return {
      ...record,
      result: decisionApplied
        ? CALIBRATION_EVIDENCE_RESULT.APPLIED
        : CALIBRATION_EVIDENCE_RESULT.IMPROVEMENT_NOT_APPLIED,
      notAppliedReason: decisionApplied ? null : CALIBRATION_READY_TO_APPLY_REASON,
      decision: entry.decision || null,
      decisionReason: entry.reason || null,
    };
  }

  if (record.result !== CALIBRATION_EVIDENCE_RESULT.IMPROVEMENT_NOT_APPLIED
    && record.result !== CALIBRATION_EVIDENCE_RESULT.TRADE_OFF) {
    return { ...record, decision: entry?.decision || null, decisionReason: entry?.reason || null };
  }

  return {
    ...record,
    decision: entry?.decision || null,
    decisionReason: entry?.reason || null,
    // The reason it was held: the decision's own sentence, or — for a record that
    // predates the decision — the honest statement that none was recorded.
    notAppliedReason: entry?.statement || CALIBRATION_NO_DECISION_RECORDED_REASON,
  };
}

export function buildCalibrationEvidence({
  selection = null,
  baseline = null,
  appliedLevers = [],
  // The run's calibration decision (resolveCalibrationApplicationPlan): what ADI
  // did with each calibration lever and why the others were held. Optional so an
  // older caller cannot make the evidence claim an application that never ran.
  calibrationDecision = null,
  decisionApplied = false,
} = {}) {
  if (!selection || typeof selection !== "object") return null;
  const baselineResult = baseline || selection.currentResult || null;
  const applied = Array.isArray(appliedLevers) ? appliedLevers.filter(Boolean) : [];
  // The result the decision actually applied, when it applied one: the combined
  // record states whether THAT result came from the combined retune.
  const appliedCandidateId = decisionApplied === true
    ? (calibrationDecision?.selected?.candidateId || calibrationDecision?.candidateId || null)
    : null;

  const measured = {
    delay: buildDelayEvidence({ selection, baseline: baselineResult, appliedLevers: applied }),
    gain: buildGainEvidence({ selection, baseline: baselineResult, appliedLevers: applied }),
    polarity: buildPolarityEvidence({ selection, baseline: baselineResult, appliedLevers: applied }),
    phase: buildPhaseEvidence({ selection, baseline: baselineResult, appliedLevers: applied }),
  };

  const levers = {};
  for (const key of CALIBRATION_EVIDENCE_LEVERS) {
    levers[key] = applyDecisionToLever(measured[key], key, { decision: calibrationDecision, decisionApplied });
  }

  // The combined calibration result, recorded beside the isolated levers: what
  // the combined retune produced, and whether that was the result applied. A run
  // whose ONLY retained result is the combined one keeps its evidence too.
  const combined = buildCombinedEvidence({
    selection, baseline: baselineResult, appliedCandidateId,
  });

  // Nothing at all was retained: the record is absent rather than empty, so the
  // panel states the missing-evidence message instead of an empty table.
  if (combined?.evidenceStatus !== CALIBRATION_EVIDENCE_STATUS.RETAINED
    && !CALIBRATION_EVIDENCE_LEVERS.some((key) => levers[key].evidenceStatus === CALIBRATION_EVIDENCE_STATUS.RETAINED)) {
    return null;
  }

  return {
    schemaVersion: CALIBRATION_EVIDENCE_SCHEMA_VERSION,
    recordedAt: new Date().toISOString(),
    levers,
    // Written only when the run recorded something about the combined search: a
    // result, or that it searched and confirmed none. A run that never reached a
    // combined retune says nothing rather than claiming one was absent.
    combined: combined?.evidenceStatus === CALIBRATION_EVIDENCE_STATUS.RETAINED ? combined : null,
    // The decision travels with the evidence, so the panel and any reader of the
    // saved record resolve what ADI did — and why — from one place.
    decision: calibrationDecision || null,
    candidateDecisions: savedCalibrationCandidates(calibrationDecision, decisionApplied),
    decisionApplied: decisionApplied === true,
  };
}

/** One lever's record from a persisted evidence block, or null. */
export function calibrationEvidenceFor(evidence, leverKey) {
  if (!evidence || typeof evidence !== "object") return null;
  const record = evidence.levers?.[leverKey] || null;
  return record && typeof record === "object" ? record : null;
}

/** The combined calibration result from a persisted evidence block, or null. */
export function combinedCalibrationEvidence(evidence) {
  if (!evidence || typeof evidence !== "object") return null;
  const record = evidence.combined || null;
  return record && typeof record === "object" ? record : null;
}

/**
 * "P19 ±1 dB → ±1 dB · P20 ±27 dB → ±11 dB · Applied" — the combined result's
 * own values, read from the record. A record whose search ran and confirmed
 * nothing states that, and a record the run did not keep says so.
 */
export function describeCombinedCalibration(record) {
  if (!record || typeof record !== "object") return null;
  if (record.evidenceStatus !== CALIBRATION_EVIDENCE_STATUS.RETAINED) {
    return COMBINED_EVIDENCE_MISSING_DETAIL;
  }
  const parts = [];
  const best = record.bestCandidate || null;
  if (best) {
    const p19 = pairText("P19", best.p19Before, best.p19After);
    const p20 = pairText("P20", best.p20Before, best.p20After);
    if (p19) parts.push(p19);
    if (p20) parts.push(p20);
  } else if (num(record.candidateCount) != null) {
    parts.push(`${record.candidateCount} candidates confirmed`);
  }
  const outcome = calibrationOutcomeLabel(record);
  if (outcome) parts.push(outcome);
  if (record.reason) parts.push(record.reason);
  return parts.length ? parts.join(" · ") : null;
}

/** "+2 ms · P19 ±4 dB → ±4 dB · P20 ±5 dB → ±4 dB · No useful improvement" */
export function describeCalibrationLever(record) {
  if (!record || record.evidenceStatus !== CALIBRATION_EVIDENCE_STATUS.RETAINED) return null;
  const label = (record.label || CALIBRATION_EVIDENCE_LABEL[record.lever] || record.lever || "").toLowerCase();
  const parts = [];
  const best = record.bestCandidate || null;

  if (best) {
    const value = record.lever === "delay"
      ? signedText(best.signedOffsetMs, "ms")
      : (record.lever === "gain" ? signedText(best.adjustmentDb, "dB") : null);
    parts.push(`Best ${label}${value ? ` ${value}` : ""}`);
    const p19 = pairText("P19", best.p19Before, best.p19After);
    const p20 = pairText("P20", best.p20Before, best.p20After);
    if (p19) parts.push(p19);
    if (p20) parts.push(p20);
  } else if (num(record.candidateCount) != null) {
    parts.push(`${record.candidateCount} candidates tested`);
  }

  const outcome = calibrationOutcomeLabel(record);
  if (outcome) parts.push(outcome);
  if (!best && !record.tested && record.reason) parts.push(record.reason);
  else if (record.reason) parts.push(record.reason);

  return parts.length ? parts.join(" · ") : null;
}

/**
 * What the panel may state about calibration, read from the saved evidence.
 *
 * A lever's own search is proven only when the record kept its count or its best
 * confirmed candidate. The no-improvement sentence may be shown only when every
 * named lever is proven and none of them found a trade-off or an unapplied
 * improvement; otherwise the panel states what the evidence actually supports.
 */
export function resolveCalibrationEvidenceState(evidence) {
  const missingLevers = CALIBRATION_CLAIM_LEVERS
    .filter((key) => calibrationEvidenceFor(evidence, key)?.evidenceStatus !== CALIBRATION_EVIDENCE_STATUS.RETAINED);

  if (missingLevers.length > 0) {
    return {
      evidenceRetained: false,
      missingLevers,
      message: CALIBRATION_EVIDENCE_MISSING_MESSAGE,
      anyTested: false,
      noImprovementProven: false,
      tradeOffHeld: false,
      tradeOffMessage: null,
      improvementHeld: false,
      leverLines: [],
      // No lever line is claimable without the evidence behind it, so no held
      // reason is stated either — the missing-evidence sentence is.
      heldLines: [],
    };
  }

  const records = CALIBRATION_CLAIM_LEVERS.map((key) => calibrationEvidenceFor(evidence, key));
  const tested = records.filter((record) => record.tested === true);
  const tradeOffHeld = tested.some((record) => record.result === CALIBRATION_EVIDENCE_RESULT.TRADE_OFF);
  const improvementHeld = tested.some((record) => record.result === CALIBRATION_EVIDENCE_RESULT.IMPROVEMENT_NOT_APPLIED);

  // The no-improvement sentence is proven only when every lever that was tested
  // kept the best candidate it confirmed AND that candidate's own values show no
  // useful improvement.
  const noImprovementProven = tested.length > 0
    && !tradeOffHeld
    && !improvementHeld
    && tested.every((record) => record.result === CALIBRATION_EVIDENCE_RESULT.NO_USEFUL_IMPROVEMENT
      && record.bestCandidate != null);

  return {
    evidenceRetained: true,
    missingLevers: [],
    message: null,
    anyTested: tested.length > 0,
    noImprovementProven,
    tradeOffHeld,
    tradeOffMessage: tradeOffHeld ? CALIBRATION_TRADE_OFF_MESSAGE : null,
    improvementHeld,
    leverLines: leverLinesOf(evidence),
    // The levers whose improvement was found and NOT applied, each with the
    // reason it was held. These are shown even when another lever was applied, so
    // a held improvement is never left unexplained.
    heldLines: leverLinesOf(evidence).filter((line) => Boolean(line.notAppliedReason)),
  };
}

/** One display line per calibration lever, with its held reason when it has one. */
function leverLinesOf(evidence) {
  return CALIBRATION_EVIDENCE_LEVERS
    .map((key) => calibrationEvidenceFor(evidence, key))
    .filter(Boolean)
    .map((record) => ({
      lever: record.lever,
      label: record.label,
      text: describeCalibrationLever(record),
      notAppliedReason: record.notAppliedReason || null,
    }))
    .filter((line) => Boolean(line.text));
}