// acoustic-delay-alignment.test.mjs
// ---------------------------------------------------------------------------
// Acceptance fixture: practical acoustic delay search (best P19 / best P20 /
// balanced) for a controlled two-row front/rear subwoofer layout.
//
// The fixture is a controlled analytic room — one front sub, one rear sub, a
// front seat row and a rear seat row. Each source/seat transfer is a complex
// response (direct path with its distance phase + axial modal resonances),
// captured with ZERO tuning, exactly the shape the production grouped-delay
// search consumes. Nothing here re-implements the search, the re-summation or
// the objective selection: the test drives the production modules and measures
// what they actually produce.
//
// P19 and P20 are evaluated FROM THE CANDIDATE'S OWN DELAY STATE with the
// production RP22 bass grading authority. No threshold is changed or duplicated.
// ---------------------------------------------------------------------------

import test from "node:test";
import assert from "node:assert/strict";

import {
  createGroupedDelayCandidate,
  defineDelayGroups,
  generateGroupedCoarseCandidates,
  runGroupedDelaySearch,
} from "../src/components/room/bass/improveBassV2/groupedDelaySearch.js";
import { resumWithTuning } from "../src/components/room/bass/stage2/stage2TuningSearch.js";
import { selectCanonicalObjectives } from "../src/components/room/bass/improveBassV2/canonicalObjectiveSelection.js";
import { buildCandidateLedger, buildProxyIndex, summariseCandidateLedger } from "../src/components/room/bass/improveBassV2/candidateLedger.js";
import { gradeP19, gradeP20 } from "../src/components/utils/rp22/bassGradingAuthority.js";
import {
  ACOUSTIC_DELAY_LABELS,
  DISTANCE_VS_ACOUSTIC_EXPLANATION,
  buildAcousticDelayAlignment,
  buildAcousticDelayEvidence,
  buildAlignmentCurves,
  resolveSignedRearOffsetMs,
} from "../src/components/room/bass/improveBassV2/acousticDelayAlignment.js";

// ── The controlled room ────────────────────────────────────────────────────
const SPEED_OF_SOUND_M_S = 343;
const ROOM = { widthM: 5.0, lengthM: 6.6, heightM: 2.5 };
const SUB_Z_M = 0.4;
const LISTENER_Z_M = 1.2;

const FRONT_SUB = { id: "sub-front", legacyGroup: "front", enabled: true, position: { x: 2.5, y: 0.4 } };
const REAR_SUB = { id: "sub-rear", legacyGroup: "rear", enabled: true, position: { x: 2.5, y: 6.2 } };
const INSTANCES = [FRONT_SUB, REAR_SUB];

const SEATS = [
  { id: "rsp", x: 2.5, y: 4.0, priority: "primary" },
  { id: "row1-left", x: 1.6, y: 4.0, priority: "secondary" },
  { id: "row1-right", x: 3.4, y: 4.0, priority: "secondary" },
  { id: "row2-left", x: 1.6, y: 5.3, priority: "secondary" },
  { id: "row2-right", x: 3.4, y: 5.3, priority: "secondary" },
];
const SEAT_IDS = SEATS.map((seat) => seat.id);
const FREQS_HZ = Array.from({ length: 101 }, (_, index) => 20 + index);

const round2 = (value) => Math.round(Number(value) * 100) / 100;
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const spread = (values) => Math.max(...values) - Math.min(...values);

/** The room's axial modes within the modal band. */
function axialModes() {
  const modes = [];
  for (let nx = 0; nx <= 2; nx++) {
    for (let ny = 1; ny <= 3; ny++) {
      if (nx === 0 && ny === 0) continue;
      const fn = (SPEED_OF_SOUND_M_S / 2)
        * Math.sqrt((nx / ROOM.widthM) ** 2 + (ny / ROOM.lengthM) ** 2);
      if (fn > 220) continue;
      modes.push({
        fn,
        q: 5,
        weight: 0.5 / Math.sqrt(fn),
        shapeX: (x) => Math.cos((nx * Math.PI * x) / ROOM.widthM),
        shapeY: (y) => Math.cos((ny * Math.PI * y) / ROOM.lengthM),
      });
    }
  }
  return modes;
}
const MODES = axialModes();

function sourceToSeatDistance(source, seat) {
  return Math.hypot(source.position.x - seat.x, source.position.y - seat.y, SUB_Z_M - LISTENER_Z_M);
}

/** Complex transfer of one source at one seat, captured with zero tuning. */
function transferPoints(source, seat) {
  const distanceM = sourceToSeatDistance(source, seat);
  return FREQS_HZ.map((frequency) => {
    const omega = 2 * Math.PI * frequency;
    let re = Math.cos((-omega * distanceM) / SPEED_OF_SOUND_M_S) / distanceM;
    let im = Math.sin((-omega * distanceM) / SPEED_OF_SOUND_M_S) / distanceM;
    for (const mode of MODES) {
      const coupling = mode.shapeX(source.position.x) * mode.shapeX(seat.x)
        * mode.shapeY(source.position.y) * mode.shapeY(seat.y);
      const detune = (frequency * frequency - mode.fn * mode.fn)
        / Math.max((frequency * mode.fn) / mode.q, 1e-9);
      const denominator = 1 + detune * detune;
      re += (mode.weight * coupling) / denominator;
      im -= (mode.weight * coupling * detune) / denominator;
    }
    return { frequency, re, im };
  });
}

const RAW_TRANSFER = {
  sources: INSTANCES.map((instance) => ({ x: instance.position.x, y: instance.position.y })),
  seatIds: SEAT_IDS,
  seatPriorityMap: SEATS.map((seat) => [seat.id, seat.priority]),
  perSourcePerSeatComplexTransfers: INSTANCES.flatMap((source) => SEATS.map((seat) => ({
    seatId: seat.id,
    points: transferPoints(source, seat),
  }))),
};

/** The current, distance-aligned alignment: both sources arrive together. */
function distanceAlignedBaseline() {
  const arrivalMs = INSTANCES.map((source) => (sourceToSeatDistance(source, SEATS[0]) / SPEED_OF_SOUND_M_S) * 1000);
  const latestMs = Math.max(...arrivalMs);
  return INSTANCES.map((source, index) => ({
    sourceId: source.id,
    delayMs: round2(latestMs - arrivalMs[index]),
    gainDb: 0,
    polarity: 1,
  }));
}
const BASELINE = distanceAlignedBaseline();

// ── Fixture-level P19 / P20 evaluation FROM THE CANDIDATE STATE ────────────

function curvesFor(tuning) {
  const responses = resumWithTuning(RAW_TRANSFER.perSourcePerSeatComplexTransfers, tuning, SEAT_IDS);
  const curves = new Map();
  for (const seatId of SEAT_IDS) {
    const response = responses?.[seatId];
    if (!response) return null;
    const points = response.freqsHz
      .map((hz, index) => ({ hz, db: response.splDb[index] }))
      .filter((point) => point.hz >= 20 && point.hz <= 120 && Number.isFinite(point.db));
    if (!points.length) return null;
    curves.set(seatId, points);
  }
  return curves;
}

/**
 * P19 = the RSP response's own variation in the modal band.
 * P20 = the worst seat's response-shape deviation from the RSP.
 * Both are read from the response re-summed with THIS candidate's delay state.
 */
function evaluateTuning(tuning) {
  const curves = curvesFor(tuning);
  const rsp = curves.get("rsp");
  const rspMean = mean(rsp.map((point) => point.db));
  const p19 = spread(rsp.map((point) => point.db));

  let p20 = 0;
  let limitingSeatId = null;
  let limitingFrequencyHz = null;
  for (const seatId of SEAT_IDS) {
    if (seatId === "rsp") continue;
    const curve = curves.get(seatId);
    const seatMean = mean(curve.map((point) => point.db));
    let worst = 0;
    let worstHz = null;
    curve.forEach((point, index) => {
      const deviation = Math.abs((point.db - seatMean) - (rsp[index].db - rspMean));
      if (deviation > worst) { worst = deviation; worstHz = point.hz; }
    });
    if (worst > p20) { p20 = worst; limitingSeatId = seatId; limitingFrequencyHz = worstHz; }
  }

  return {
    p19: round2(p19),
    p19Level: gradeP19(p19),
    p20: round2(p20),
    p20Level: gradeP20(p20),
    limitingSeatId,
    limitingFrequencyHz,
  };
}

function resultFor({ id, kind, tuning, evaluation, groupedDelay = null }) {
  return {
    candidateId: id,
    candidateKind: kind,
    achievedP19VariationDb: evaluation.p19,
    achievedP19Level: evaluation.p19Level,
    achievedP20VariationDb: evaluation.p20,
    achievedP20Level: evaluation.p20Level,
    worstSeatId: evaluation.limitingSeatId,
    worstFrequencyHz: evaluation.limitingFrequencyHz,
    appliedTuning: tuning,
    groupedDelay,
  };
}

// ── The run ────────────────────────────────────────────────────────────────
const GROUPS = defineDelayGroups(INSTANCES, ROOM);
const TRANSFER_SNAPSHOT = structuredClone(RAW_TRANSFER.perSourcePerSeatComplexTransfers);
const SEARCH = runGroupedDelaySearch({
  rawTransfer: RAW_TRANSFER,
  instances: INSTANCES,
  roomDims: ROOM,
  effectiveBaseline: BASELINE,
});
const BASELINE_EVAL = evaluateTuning(BASELINE);
const BASELINE_RESULT = resultFor({ id: "current", kind: "current", tuning: BASELINE, evaluation: BASELINE_EVAL });

const SWEEP = SEARCH.ledger.map((row) => ({ row, evaluation: evaluateTuning(row.tuning) }));
const CANONICAL = SWEEP
  .filter(({ row }) => !row.isCurrent && !row.rejection)
  .map(({ row, evaluation }) => resultFor({
    id: row.id,
    kind: "calibration",
    tuning: row.tuning,
    evaluation,
    groupedDelay: { direction: row.direction, adjustmentMs: row.adjustmentMs, effectiveOffsetMs: row.effectiveOffsetMs },
  }));

const OBJECTIVES = selectCanonicalObjectives({ candidates: CANONICAL, baseline: BASELINE_RESULT });
const RECOMMENDED = OBJECTIVES.bestCanonicalBalanced || OBJECTIVES.bestCanonicalP20 || OBJECTIVES.bestCanonicalP19;
const RECOMMENDED_EVAL = RECOMMENDED?.achievedP20VariationDb != null
  ? { p19: RECOMMENDED.achievedP19VariationDb, p20: RECOMMENDED.achievedP20VariationDb }
  : null;

const bestP19 = OBJECTIVES.bestCanonicalP19;
const bestP20 = OBJECTIVES.bestCanonicalP20;
const bestImprovementP19 = round2(BASELINE_EVAL.p19 - Math.min(...CANONICAL.map((c) => c.achievedP19VariationDb)));
const bestImprovementP20 = round2(BASELINE_EVAL.p20 - Math.min(...CANONICAL.map((c) => c.achievedP20VariationDb)));

const DELAY_CHANGES = INSTANCES.map((instance, index) => ({
  label: instance.legacyGroup === "front" ? "Front sub" : "Rear sub",
  group: instance.legacyGroup,
  fromMs: BASELINE[index].delayMs,
  toMs: RECOMMENDED.appliedTuning[index].delayMs,
}));

const ALIGNMENT_EVIDENCE = buildAcousticDelayEvidence({
  calibrationResult: RECOMMENDED,
  baselineResult: BASELINE_RESULT,
  grouping: GROUPS,
  groupedDelay: RECOMMENDED.groupedDelay,
  objectives: OBJECTIVES,
  changes: DELAY_CHANGES,
  curves: buildAlignmentCurves({
    rawTransfer: RAW_TRANSFER,
    beforeTuning: BASELINE,
    afterTuning: RECOMMENDED.appliedTuning,
  }),
});
const ALIGNMENT = buildAcousticDelayAlignment({ lever: { changes: DELAY_CHANGES }, evidence: ALIGNMENT_EVIDENCE });

// ── 1. Baseline and sweep behaviour ───────────────────────────────────────

test("baseline distance-aligned P20 is poor", () => {
  assert.ok(BASELINE_EVAL.p20 >= 3, `expected poor baseline P20, got ${BASELINE_EVAL.p20} dB`);
  assert.ok(BASELINE_EVAL.p20Level <= 2, `expected P20 level <= 2, got ${BASELINE_EVAL.p20Level}`);
});

test("the delay sweep actually changes the response", () => {
  assert.ok(spread(SWEEP.map(({ evaluation }) => evaluation.p19)) > 0.2, "P19 does not move across the sweep");
  assert.ok(spread(SWEEP.map(({ evaluation }) => evaluation.p20)) > 0.2, "P20 does not move across the sweep");
});

test("at least one tested delay materially improves P19 or P20", () => {
  assert.ok(
    bestImprovementP19 > 0.5 || bestImprovementP20 > 0.5,
    `expected a material improvement, got P19 ${bestImprovementP19} dB / P20 ${bestImprovementP20} dB`,
  );
});

test("best P19 and best P20 candidates are identified and honest", () => {
  assert.ok(bestP19?.candidateId, "no best-P19 candidate");
  assert.ok(bestP20?.candidateId, "no best-P20 candidate");
  assert.ok(bestP19.achievedP19VariationDb <= bestP20.achievedP19VariationDb);
  assert.ok(bestP20.achievedP20VariationDb <= bestP19.achievedP20VariationDb);
});

test("the balanced candidate is identified", () => {
  assert.ok(OBJECTIVES.bestCanonicalBalanced?.candidateId, "no balanced candidate");
  assert.ok(OBJECTIVES.values.balanced?.p19 != null && OBJECTIVES.values.balanced?.p20 != null);
});

test("P20 is scored from the candidate's own delay state", () => {
  const candidate = bestP20;
  const recomputed = evaluateTuning(candidate.appliedTuning);
  assert.equal(recomputed.p20, candidate.achievedP20VariationDb);
  assert.notEqual(recomputed.p20, BASELINE_EVAL.p20);
  assert.ok(recomputed.p20 < BASELINE_EVAL.p20, "the best-P20 candidate must be better than baseline");
});

// ── 2. Signed rear-group offset ───────────────────────────────────────────

test("every sweep candidate exposes a signed rear-group offset", () => {
  for (const { row } of SWEEP) {
    assert.ok(Number.isFinite(row.effectiveOffsetMs), `no signed offset on ${row.id}`);
    if (row.isCurrent) assert.equal(row.effectiveOffsetMs, 0);
    else if (row.direction === "B") assert.ok(row.effectiveOffsetMs > 0, `${row.id} should be rear-later`);
    else if (row.direction === "A") assert.ok(row.effectiveOffsetMs < 0, `${row.id} should be rear-earlier`);
  }
});

test("rear earlier / later / no change labels are correct", () => {
  assert.equal(resolveSignedRearOffsetMs({ grouping: GROUPS, direction: "B", adjustmentMs: 6 }), 6);
  assert.equal(resolveSignedRearOffsetMs({ grouping: GROUPS, direction: "A", adjustmentMs: 6 }), -6);
  assert.equal(resolveSignedRearOffsetMs({ grouping: GROUPS, direction: "A", adjustmentMs: 0 }), 0);
  assert.equal(resolveSignedRearOffsetMs({ grouping: null, direction: "A", adjustmentMs: 6 }), null);
  assert.equal(resolveSignedRearOffsetMs({ changes: DELAY_CHANGES, direction: null, adjustmentMs: null }) > 0, true);
});

test("the signed offset text states rear-later, rear-earlier or no change", () => {
  const withOffset = (signedRearOffsetMs) => buildAcousticDelayAlignment({
    lever: { changes: DELAY_CHANGES },
    evidence: { ...ALIGNMENT_EVIDENCE, signedRearOffsetMs },
  });
  assert.match(withOffset(6).offsetText, /rear group later/);
  assert.match(withOffset(-6).offsetText, /rear group earlier/);
  assert.match(withOffset(0).offsetText, /No delay change/);
});

// ── 3. Best acoustic delay authority ──────────────────────────────────────

test("the authority exposes every required field", () => {
  for (const key of [
    "candidateId", "adjustmentMs", "signedRearOffsetMs", "objectiveRole",
    "before", "after", "p19DeltaDb", "p20DeltaDb", "improvedP19", "improvedP20",
    "material", "limitingSeatId", "limitingFrequencyHz", "objectiveValues",
  ]) {
    assert.ok(key in ALIGNMENT_EVIDENCE, `evidence is missing ${key}`);
  }
  assert.ok(ALIGNMENT_EVIDENCE.before.p19DeviationDb != null);
  assert.ok(ALIGNMENT_EVIDENCE.after.p19DeviationDb != null);
  assert.ok(ALIGNMENT_EVIDENCE.limitingSeatId, "no limiting seat");
  assert.ok(ALIGNMENT_EVIDENCE.limitingFrequencyHz != null, "no limiting frequency");
});

test("the display model carries the card's rows, labels and ADI explanation", () => {
  assert.equal(ALIGNMENT.hasEvidence, true);
  assert.equal(ALIGNMENT.labels.title, "Best acoustic delay");
  assert.equal(ALIGNMENT.explanation, DISTANCE_VS_ACOUSTIC_EXPLANATION);
  assert.ok(ALIGNMENT.currentDelays.length === INSTANCES.length);
  assert.ok(ALIGNMENT.recommendedDelays.length === INSTANCES.length);
  assert.ok(ALIGNMENT.objectiveText);
  assert.ok(ALIGNMENT.curves?.before?.length && ALIGNMENT.curves?.after?.length);
});

test("improvement is never fabricated", () => {
  const noGain = buildAcousticDelayEvidence({
    calibrationResult: { ...BASELINE_RESULT, candidateKind: "calibration", candidateId: "no-gain" },
    baselineResult: BASELINE_RESULT,
    grouping: GROUPS,
    groupedDelay: { direction: "B", adjustmentMs: 0 },
    objectives: null,
    changes: [],
  });
  assert.equal(noGain.improvedP19, false);
  assert.equal(noGain.improvedP20, false);
  assert.equal(noGain.material, false);
  const model = buildAcousticDelayAlignment({ lever: { changes: DELAY_CHANGES }, evidence: noGain });
  assert.equal(model.statement, ACOUSTIC_DELAY_LABELS.noImprovement);
  assert.equal(ALIGNMENT.improvedP19, ALIGNMENT_EVIDENCE.p19DeltaDb > 0.05);
  assert.equal(ALIGNMENT.improvedP20, ALIGNMENT_EVIDENCE.p20DeltaDb > 0.05);
});

// ── 4. Candidate ledger ───────────────────────────────────────────────────

test("the candidate ledger records settings and results", () => {
  const proxyIndex = buildProxyIndex({
    diagnostics: { calibrationDiagnostics: { options: SEARCH.ledger.map((row) => ({ candidateId: row.id, tuning: row.tuning, proxy: row.proxy })) } },
  });
  const rows = buildCandidateLedger({
    candidates: [...CANONICAL, BASELINE_RESULT],
    proxyIndex,
    evaluations: [],
    objectives: OBJECTIVES,
    finalCandidate: RECOMMENDED,
  });
  const summary = summariseCandidateLedger(rows);
  assert.ok(summary.confirmed >= CANONICAL.length);
  assert.ok(summary.bestP19.length === 1 && summary.bestP20.length === 1);
  assert.ok(summary.bestBalanced.length === 1);

  const bestP19Row = rows.find((row) => row.candidateId === bestP19.candidateId);
  assert.ok(bestP19Row, "best-P19 candidate missing from the ledger");
  assert.deepEqual(bestP19Row.settings.delay, bestP19.appliedTuning.map((entry) => entry.delayMs));
  assert.equal(bestP19Row.canonicalP19, bestP19.achievedP19VariationDb);
  assert.equal(bestP19Row.canonicalP20, bestP19.achievedP20VariationDb);
  assert.ok(bestP19Row.selectedAs.includes("best-p19"));
});

// ── 5. Phase rotation, base reuse, staged search, unchanged thresholds ────

test("delay is applied as frequency-domain phase rotation", () => {
  const halfPeriodAt100Hz = 5; // 100 Hz -> 10 ms period, so 5 ms is a half turn
  const single = [{
    seatId: "rsp",
    points: FREQS_HZ.map((frequency) => ({
      frequency,
      re: 1,
      im: 0,
    })),
  }];
  const none = resumWithTuning(single, [{ delayMs: 0, gainDb: 0, polarity: 1 }], ["rsp"]).rsp;
  const delayed = resumWithTuning(single, [{ delayMs: halfPeriodAt100Hz, gainDb: 0, polarity: 1 }], ["rsp"]).rsp;
  const index = FREQS_HZ.indexOf(100);
  assert.ok(Math.abs(delayed._sumRe[index] + none._sumRe[index]) < 1e-9, "half-period delay must invert the real part");
  assert.ok(Math.abs(delayed._sumIm[index]) < 1e-9, "half-period delay must null the imaginary part");
  assert.ok(Math.abs(none._sumIm[FREQS_HZ.indexOf(50)] - Math.sin(-2 * Math.PI * 50 * 0.005)) < 1e-9);
});

test("the base complex response is reused, never rebuilt or mutated", () => {
  assert.deepEqual(RAW_TRANSFER.perSourcePerSeatComplexTransfers, TRANSFER_SNAPSHOT);
  const candidate = SEARCH.candidates[0];
  assert.ok(candidate.tuning.length === INSTANCES.length);
  for (let index = 0; index < INSTANCES.length; index++) {
    assert.equal(candidate.tuning[index].gainDb, BASELINE[index].gainDb);
    assert.equal(candidate.tuning[index].polarity, BASELINE[index].polarity);
  }
});

test("the search stays staged and bounded", () => {
  const coarse = generateGroupedCoarseCandidates(GROUPS, BASELINE);
  assert.equal(coarse.length, 61, "expected zero plus 1..30 in both directions");
  assert.ok(SEARCH.fineCount <= 4, `refinement must stay bounded, got ${SEARCH.fineCount}`);
  assert.ok(SEARCH.ledger.length <= 65, `ledger must stay bounded, got ${SEARCH.ledger.length}`);
  assert.ok(SEARCH.timings.totalMs >= 0);
  const promoted = SEARCH.candidates.length;
  assert.ok(promoted > 0 && promoted <= 12, `promoted shortlist must stay small, got ${promoted}`);
});

test("P19 and P20 scoring thresholds are untouched", () => {
  assert.equal(gradeP19(2), 4); assert.equal(gradeP19(3), 3);
  assert.equal(gradeP19(4), 2); assert.equal(gradeP19(5), 1);
  assert.equal(gradeP19(6), 0); assert.equal(gradeP19(null), null);
  assert.equal(gradeP20(2), 4); assert.equal(gradeP20(3), 3);
  assert.equal(gradeP20(4), 2); assert.equal(gradeP20(5), 1);
  assert.equal(gradeP20(null), null);
});

test("search guards are unchanged", () => {
  const candidate = createGroupedDelayCandidate(GROUPS, BASELINE, "B", 30, 35);
  assert.match(candidate.rejection || "", /processor limit/);
  assert.throws(() => createGroupedDelayCandidate(GROUPS, BASELINE, "B", -1));
  assert.equal(defineDelayGroups(INSTANCES.slice(0, 1), ROOM).status, "skipped");
});

// ── Report payload (read by the acceptance summary) ───────────────────────
export const ACCEPTANCE_FIXTURE = {
  baseline: BASELINE_EVAL,
  bestImprovementP19,
  bestImprovementP20,
  bestP19: { id: bestP19?.candidateId, p19: bestP19?.achievedP19VariationDb, p20: bestP19?.achievedP20VariationDb },
  bestP20: { id: bestP20?.candidateId, p19: bestP20?.achievedP19VariationDb, p20: bestP20?.achievedP20VariationDb },
  balanced: OBJECTIVES.values.balanced,
  bestP19DiffersFromBestP20: bestP19?.candidateId !== bestP20?.candidateId,
  recommended: RECOMMENDED_EVAL,
  signedRearOffsetMs: ALIGNMENT_EVIDENCE.signedRearOffsetMs,
  limitingSeatId: ALIGNMENT_EVIDENCE.limitingSeatId,
  limitingFrequencyHz: ALIGNMENT_EVIDENCE.limitingFrequencyHz,
  sweepCount: SWEEP.length,
};