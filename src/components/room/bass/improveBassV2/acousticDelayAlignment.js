// acousticDelayAlignment.js
// ---------------------------------------------------------------------------
// The ONE presentation authority for the practical acoustic delay search.
//
// WHAT THIS IS
// The bass optimiser groups the subwoofers (front group / rear group) and
// sweeps the grouped delay around the current, distance-aligned alignment,
// scoring every candidate through the canonical chain (P19, P20, P14, P18).
// This module turns the RESULT of that search into the installer-facing
// statement: the current (distance-aligned) delay, the recommended delay, the
// signed rear-group offset, which objective the recommendation serves, the
// limiting seat and frequency, and the canonical before/after values.
//
// HONESTY RULES
//   - It reads canonical values only (aggregate RSP P19, achieved P20). It never
//     computes, extrapolates or rounds an improvement into existence.
//   - A value it does not have is reported as unavailable — never as zero, and
//     never as an improvement.
//   - Physical distance alignment is CORRECT. The acoustic optimum may simply
//     differ, so the wording is "best acoustic delay" / "frequency-response
//     alignment" / "rear sub delay offset" / "bass summation optimisation".
//
// Pure: no React, no side effects.
// ---------------------------------------------------------------------------

import { readRspP19 } from "./p19Authority.js";
import { resumWithTuning } from "../stage2/stage2TuningSearch.js";

/** A change smaller than this is not called an improvement. */
export const DELAY_ALIGNMENT_TOLERANCE_DB = 0.05;

/** The allowed installer-facing vocabulary. There is no "wrong timing" state. */
export const ACOUSTIC_DELAY_LABELS = Object.freeze({
  title: "Best acoustic delay",
  alignment: "Frequency-response alignment",
  rearOffset: "Rear sub delay offset",
  summation: "Bass summation optimisation",
  noImprovement: "No useful delay improvement found.",
});

/** The ADI statement of why distance timing and the acoustic optimum differ. */
export const DISTANCE_VS_ACOUSTIC_EXPLANATION =
  "Distance timing is a starting point. The best acoustic delay may differ because the goal is smooth frequency-domain summation through the modal region.";

export const OBJECTIVE_ROLE_LABELS = Object.freeze({
  both: "Best P19 and best P20",
  "best-p19": "Best P19",
  "best-p20": "Best P20",
  balanced: "Balanced — improves one objective without damaging the other",
  practical: "Practical intervention ordering",
});

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function round(value, places = 2) {
  return value == null ? null : Number(Number(value).toFixed(places));
}

function idOf(result) {
  return String(result?.candidateId ?? result?.id ?? "");
}

function levelOf(value) {
  if (Number.isInteger(value) && value >= 0 && value <= 4) return value;
  if (value === "FAIL") return 0;
  const match = typeof value === "string" ? value.match(/^L([1-4])$/i) : null;
  return match ? Number(match[1]) : null;
}

/** Millisecond text: whole numbers stay whole, everything else keeps 0.1 ms. */
export function formatDelayMs(value) {
  const ms = finite(value);
  if (ms == null) return null;
  return Number.isInteger(ms) ? `${ms}` : ms.toFixed(1);
}

/** The grouped adjustment implied by a lever's per-sub changes, when uniform. */
function groupedAdjustmentFromChanges(changes) {
  const deltas = (Array.isArray(changes) ? changes : [])
    .map((change) => finite(change?.toMs) - finite(change?.fromMs))
    .filter(Number.isFinite);
  if (!deltas.length) return null;
  const magnitudes = deltas.map((delta) => Math.abs(delta));
  const magnitude = Math.max(...magnitudes);
  const uniform = magnitudes.every((value) => Math.abs(value - magnitude) <= 0.1);
  return uniform && magnitude > 0 ? magnitude : null;
}

/** The physical role of the changed sources, when they all share one side. */
function roleFromChanges(changes) {
  const roles = new Set(
    (Array.isArray(changes) ? changes : [])
      .map((change) => (change?.group === "front" || change?.group === "rear" ? change.group : null)),
  );
  if (roles.size !== 1) return null;
  return [...roles][0];
}

/**
 * The signed offset of the REAR (far-side) group relative to the FRONT
 * (screen-side) group. Positive = the rear group carries the added delay
 * (rear group later). Negative = the front group carries it, so the rear group
 * is effectively advanced (rear group earlier). Zero = no delay change.
 * Unknown physical roles return null: the sign is never guessed.
 */
export function resolveSignedRearOffsetMs({ grouping = null, direction = null, adjustmentMs = null, changes = [] } = {}) {
  const declared = finite(adjustmentMs);
  const magnitude = Math.abs(declared ?? groupedAdjustmentFromChanges(changes) ?? NaN);
  if (!Number.isFinite(magnitude)) return null;
  if (magnitude < DELAY_ALIGNMENT_TOLERANCE_DB) return 0;

  const role = grouping?.groups?.find((group) => group?.id === direction)?.role
    || roleFromChanges(changes);
  if (role === "front") return -magnitude;
  if (role === "rear") return magnitude;
  return null;
}

/** Which objective the recommended delay candidate was selected as. */
export function objectiveRoleFor(result, objectives) {
  const id = idOf(result);
  if (!id || !objectives) return null;
  const isP19 = idOf(objectives.bestCanonicalP19) === id;
  const isP20 = idOf(objectives.bestCanonicalP20) === id;
  const isBalanced = idOf(objectives.bestCanonicalBalanced) === id;
  if (isP19 && isP20) return "both";
  if (isBalanced) return "balanced";
  if (isP19) return "best-p19";
  if (isP20) return "best-p20";
  return "practical";
}

function canonicalPair(result) {
  const p19 = readRspP19(result);
  return {
    p19DeviationDb: p19.deviationDb,
    p19Level: p19.level,
    p20DeviationDb: finite(result?.achievedP20VariationDb),
    p20Level: levelOf(result?.achievedP20Level),
  };
}

function normaliseCurves(curves) {
  if (!curves?.before?.length || !curves?.after?.length) return null;
  return { seatId: curves.seatId || "rsp", before: curves.before, after: curves.after };
}

/**
 * Build the persisted evidence of the delay search's recommended candidate.
 * Returns null when there is no confirmed delay candidate to report.
 *
 * @param {object} params
 * @param {object|null} params.calibrationResult - the confirmed grouped-delay candidate
 * @param {object|null} params.baselineResult - the current design's confirmed result
 * @param {object|null} params.grouping - the search's front/rear grouping
 * @param {object|null} params.groupedDelay - { direction, adjustmentMs } of the candidate
 * @param {object|null} params.objectives - canonical objective winners of the run
 * @param {Array} params.changes - the lever's per-sub delay changes
 * @param {object|null} params.curves - the RSP before/after curves (display only)
 */
export function buildAcousticDelayEvidence({
  calibrationResult = null,
  baselineResult = null,
  grouping = null,
  groupedDelay = null,
  objectives = null,
  changes = [],
  curves = null,
} = {}) {
  if (!calibrationResult || !baselineResult) return null;

  const direction = groupedDelay?.direction || calibrationResult?.groupedDelay?.direction || null;
  const adjustmentMs = finite(groupedDelay?.adjustmentMs) ?? finite(calibrationResult?.groupedDelay?.adjustmentMs);
  const before = canonicalPair(baselineResult);
  const after = canonicalPair(calibrationResult);
  const p19DeltaDb = before.p19DeviationDb != null && after.p19DeviationDb != null
    ? round(before.p19DeviationDb - after.p19DeviationDb)
    : null;
  const p20DeltaDb = before.p20DeviationDb != null && after.p20DeviationDb != null
    ? round(before.p20DeviationDb - after.p20DeviationDb)
    : null;

  return {
    candidateId: idOf(calibrationResult) || null,
    adjustmentMs,
    direction,
    groupLabel: grouping?.groups?.find((group) => group?.id === direction)?.label || null,
    signedRearOffsetMs: resolveSignedRearOffsetMs({ grouping, direction, adjustmentMs, changes }),
    objectiveRole: objectiveRoleFor(calibrationResult, objectives),
    // The compact canonical values of the best-P19, best-P20 and balanced delay
    // candidates, so the card can show all three without carrying a candidate pool.
    objectiveValues: objectives?.values || null,
    before,
    after,
    p19DeltaDb,
    p20DeltaDb,
    improvedP19: p19DeltaDb != null && p19DeltaDb > DELAY_ALIGNMENT_TOLERANCE_DB,
    improvedP20: p20DeltaDb != null && p20DeltaDb > DELAY_ALIGNMENT_TOLERANCE_DB,
    material: (p19DeltaDb != null && p19DeltaDb > DELAY_ALIGNMENT_TOLERANCE_DB)
      || (p20DeltaDb != null && p20DeltaDb > DELAY_ALIGNMENT_TOLERANCE_DB),
    limitingSeatId: calibrationResult?.worstSeatId || null,
    limitingFrequencyHz: finite(calibrationResult?.worstFrequencyHz),
    curves: normaliseCurves(curves),
  };
}

function describeOffset(evidence) {
  const signed = finite(evidence?.signedRearOffsetMs);
  if (signed == null) {
    return evidence?.adjustmentMs
      ? `+${formatDelayMs(evidence.adjustmentMs)} ms to the ${evidence.groupLabel || "adjusted group"} — the physical group order is not recorded, so no signed rear offset is claimed`
      : null;
  }
  if (signed === 0) return "No delay change — the current alignment is kept";
  const magnitude = formatDelayMs(Math.abs(signed));
  return signed > 0
    ? `+${magnitude} ms — rear group later than the front group`
    : `−${magnitude} ms — rear group earlier than the front group (the front group carries the delay)`;
}

function describeHonestResult(evidence) {
  const improvedP19 = !!evidence?.improvedP19;
  const improvedP20 = !!evidence?.improvedP20;
  if (improvedP19 && improvedP20) {
    return "The recommended delay improves both the RSP response and seat-to-seat consistency.";
  }
  if (improvedP19) {
    return "The recommended delay improves the RSP response. Seat-to-seat consistency is not claimed to improve.";
  }
  if (improvedP20) {
    return "The recommended delay improves seat-to-seat consistency. The RSP response is not claimed to improve.";
  }
  return ACOUSTIC_DELAY_LABELS.noImprovement;
}

/**
 * Build the display model the installer-facing card renders.
 *
 * @param {object} params
 * @param {object|null} params.lever - the persisted delay lever (its `changes` list)
 * @param {object|null} params.evidence - buildAcousticDelayEvidence() output
 */
export function buildAcousticDelayAlignment({ lever = null, evidence = null } = {}) {
  const changes = Array.isArray(lever?.changes) ? lever.changes : [];
  if (!evidence && !changes.length) return { hasEvidence: false };

  const delayRows = (key) => changes
    .map((change) => {
      const ms = formatDelayMs(change?.[key]);
      if (ms == null) return null;
      return { label: change?.label || "Subwoofer", value: `${ms} ms` };
    })
    .filter(Boolean);

  return {
    hasEvidence: true,
    labels: ACOUSTIC_DELAY_LABELS,
    explanation: DISTANCE_VS_ACOUSTIC_EXPLANATION,
    currentDelays: delayRows("fromMs"),
    recommendedDelays: delayRows("toMs"),
    offsetText: evidence ? describeOffset(evidence) : null,
    signedRearOffsetMs: evidence ? finite(evidence.signedRearOffsetMs) : null,
    objectiveRole: evidence?.objectiveRole || null,
    objectiveText: evidence?.objectiveRole ? OBJECTIVE_ROLE_LABELS[evidence.objectiveRole] || null : null,
    objectiveCandidates: evidence?.objectiveValues || null,
    before: evidence?.before || null,
    after: evidence?.after || null,
    p19DeltaDb: evidence?.p19DeltaDb ?? null,
    p20DeltaDb: evidence?.p20DeltaDb ?? null,
    improvedP19: !!evidence?.improvedP19,
    improvedP20: !!evidence?.improvedP20,
    material: !!evidence?.material,
    limitingSeatId: evidence?.limitingSeatId || null,
    limitingFrequencyHz: evidence?.limitingFrequencyHz ?? null,
    curves: evidence?.curves || null,
    statement: evidence ? describeHonestResult(evidence) : null,
    candidateId: evidence?.candidateId || null,
  };
}

/**
 * The RSP before/after curves of the delay candidate, from the design's own
 * captured complex transfers. Display only: it re-reads the SAME transfer data
 * the search scored, re-summed with each tuning, so the graph cannot disagree
 * with the numbers beside it. Returns null when the transfers are unavailable.
 *
 * Tuning arrays are indexed by source order, exactly as the search indexes them.
 */
export function buildAlignmentCurves({
  rawTransfer = null,
  beforeTuning = null,
  afterTuning = null,
  seatId = "rsp",
  minHz = 20,
  maxHz = 200,
} = {}) {
  const transfers = rawTransfer?.perSourcePerSeatComplexTransfers;
  if (!Array.isArray(transfers) || !transfers.length) return null;
  const before = curveFor(transfers, beforeTuning, seatId, minHz, maxHz);
  const after = curveFor(transfers, afterTuning, seatId, minHz, maxHz);
  if (!before || !after) return null;
  return { seatId, minHz, maxHz, before, after };
}

function curveFor(transfers, tuning, seatId, minHz, maxHz) {
  const responses = resumWithTuning(transfers, Array.isArray(tuning) ? tuning : [], [seatId]);
  const response = responses?.[seatId];
  if (!response?.freqsHz?.length) return null;
  const points = [];
  for (let index = 0; index < response.freqsHz.length; index++) {
    const hz = Number(response.freqsHz[index]);
    const db = Number(response.splDb[index]);
    if (!Number.isFinite(hz) || !Number.isFinite(db) || hz < minHz || hz > maxHz) continue;
    points.push({ hz: Math.round(hz * 10) / 10, db: Math.round(db * 10) / 10 });
  }
  return points.length ? points : null;
}