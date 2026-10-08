// p19-rsp-authority.test.mjs
// ---------------------------------------------------------------------------
// CANONICAL RSP P19 AUTHORITY — bass optimiser candidate funnel.
//
// P19 is the AGGREGATE RSP response against target. It has no per-seat form:
// legacy per-seat P19 rows may remain as historical/diagnostic evidence but they
// carry NO authority anywhere in the candidate funnel.
//
// These tests assert, from the production functions:
//   1.  aggregate RSP P19 deviation AND level are required for validity
//   2.  legacy per-seat P19 rows cannot substitute for the aggregate
//   3.  a legacy-only candidate is invalid and can never become a winner
//   4.  an aggregate RSP P19 level drop (L4 -> L2) is safety-rejected
//   5.  a per-seat P19 "improvement" cannot mask an aggregate regression
//   6.  the trade-off classifier reads the aggregate P19 authority only
//   7.  materiality reads the aggregate P19 authority only
//   8.  a candidate without aggregate P19 can win no objective, and no run
//   9.  P20 remains the per-seat authority (seat consistency is untouched)
//   10. every P19 decision is invariant to the contents of the legacy rows
//
// No P19/P20 scoring, no thresholds and no project data are changed.
//
// Run: node --import ./test/_alias-register.mjs test/p19-rsp-authority.test.mjs

import {
  validateConfirmedCandidate,
  validateAggregateP19,
} from '@/components/room/bass/improveBassV2/confirmedCandidateValidity';
import { selectConfirmedRecommendations } from '@/components/room/bass/improveBassV2/confirmedRecommendationSelection';
import { hasHardSafetyRegression } from '@/components/room/bass/improveBassV2/zeroFailOptimiser';
import {
  classifyVerifiedTradeOff,
  findBestP19Improvement,
  findBestP20Improvement,
  findP19Worsening,
  findP20Worsening,
  hasPrimarySeatLevelRegression,
} from '@/components/room/bass/improveBassV2/tradeOffClassifier';
import { isMaterialImprovement } from '@/components/room/bass/improveBassV2/materialityGate';
import { compareRspP19, readRspP19 } from '@/components/room/bass/improveBassV2/p19Authority';
import { selectCanonicalObjectives } from '@/components/room/bass/improveBassV2/canonicalObjectiveSelection';
import { extractAuthoritativeMetrics } from '@/components/room/bass/best-layout/authoritativeFinalistSelection';
import { gradeP19FromRaw, gradeP20FromRaw } from '@/components/room/bass/completedBassResultPersistence';

const STAGE2_CANONICAL_VERSION = 'stage2-canonical-v6-delay-lag';

const SEATS = [
  { id: 'seat-r1-c1', isPrimary: true },
  { id: 'seat-r2-c1', isPrimary: false },
];

const SNAPSHOT = {
  validationContext: { seats: SEATS },
  effectiveConfiguration: null,
  evaluationIncomplete: false,
};

// ── Fixture ────────────────────────────────────────────────────────────────

/** A legacy per-seat P19 row — historical diagnostic evidence only. */
function legacyRow(seatId, isPrimary, raw) {
  return { seatId, isPrimary, variationDbRaw: raw, level: gradeP19FromRaw(raw) };
}

function p20Row(seatId, isPrimary, raw) {
  return { seatId, isPrimary, variationDbRaw: raw, level: gradeP20FromRaw(raw) };
}

const P20_PRIMARY_RAW = 3.5;    // L3
const P20_SECONDARY_RAW = 5.23; // L1

/**
 * A canonical confirmed candidate.
 *
 * `aggregateP19Raw` is the CANONICAL P19 authority. `legacyP19Rows` are legacy
 * per-seat P19 rows — present in the data, ignored by every P19 decision.
 */
function makeResult({
  candidateId,
  candidateKind = 'calibration',
  aggregateP19Raw = 2.79,
  omitAggregateP19 = false,
  legacyP19Rows = [legacyRow('seat-r1-c1', true, 2.79), legacyRow('seat-r2-c1', false, 2.79)],
  p20PrimaryRaw = P20_PRIMARY_RAW,
  p20SecondaryRaw = P20_SECONDARY_RAW,
  omitP20Seat = false,
}) {
  const result = {
    candidateId,
    candidateKind,
    inputIdentity: 'fp-p19-rsp-authority',
    timingVersion: STAGE2_CANONICAL_VERSION,
    assessmentStartHz: 20,
    assessmentEndHz: 200,
    achievedP18Hz: 20,
    p18AchievedLevel: 3,
    p14AchievedDb: 117,
    p14AchievedLevel: 2,
    operatingOutputDb: 117,
    p14TargetDb: 117,
    requestedP14Pass: true,
    canonicalAuthorityReceipt: { selectedCandidateId: candidateId, postEqCurveSignature: 'sig' },
    physicalValidation: { passed: true },
    appliedTuning: [
      { sourceId: 'sub-1', delayMs: 0, gainDb: 0, polarity: 1 },
      { sourceId: 'sub-2', delayMs: 0, gainDb: 0, polarity: 1 },
    ],
    perSeatP20: [
      p20Row('seat-r1-c1', true, p20PrimaryRaw),
      ...(omitP20Seat ? [] : [p20Row('seat-r2-c1', false, p20SecondaryRaw)]),
    ],
    perSeatP19: legacyP19Rows,
  };
  if (!omitAggregateP19) {
    result.achievedP19VariationDb = aggregateP19Raw;
    result.achievedP19Level = gradeP19FromRaw(aggregateP19Raw);
  }
  return result;
}

const baseline = (options = {}) => makeResult({
  candidateId: 'current',
  candidateKind: 'current',
  ...options,
});

// ── Harness ────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  assert(actual === expected, `${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
}

function statusOf(selection, candidateId) {
  return selection.evaluations.find((e) => e.candidateId === candidateId)?.status ?? null;
}

// ── 1. Aggregate RSP P19 is required for validity ─────────────────────────

function testAggregateP19RequiredForValidity() {
  const complete = makeResult({ candidateId: 'cand-complete' });
  const completeCheck = validateConfirmedCandidate(complete, { seats: SEATS });
  assertEqual(completeCheck.valid, true, '1. a candidate with aggregate RSP P19 deviation and level is valid');

  const noDeviation = makeResult({ candidateId: 'cand-no-deviation' });
  delete noDeviation.achievedP19VariationDb;
  const noDeviationCheck = validateConfirmedCandidate(noDeviation, { seats: SEATS });
  assertEqual(noDeviationCheck.valid, false, '1. missing aggregate RSP P19 deviation is invalid');
  assert(noDeviationCheck.issues.some((i) => /aggregate RSP deviation/i.test(i)),
    '1. the missing aggregate deviation is named in the issues');

  const noLevel = makeResult({ candidateId: 'cand-no-level' });
  delete noLevel.achievedP19Level;
  const noLevelCheck = validateConfirmedCandidate(noLevel, { seats: SEATS });
  assertEqual(noLevelCheck.valid, false, '1. missing aggregate RSP P19 level is invalid');
  assert(noLevelCheck.issues.some((i) => /aggregate RSP level/i.test(i)),
    '1. the missing aggregate level is named in the issues');

  const aggregateOnly = validateAggregateP19(makeResult({ candidateId: 'cand-aggregate-only' }));
  assertEqual(aggregateOnly.valid, true, '1. the aggregate authority validates on its own');
}

// ── 2 & 3. Legacy per-seat P19 cannot substitute ──────────────────────────

function testLegacyPerSeatCannotSubstitute() {
  // Legacy rows are rich and look like a strong improvement; the aggregate is absent.
  const legacyOnly = makeResult({
    candidateId: 'cand-legacy-only',
    omitAggregateP19: true,
    legacyP19Rows: [legacyRow('seat-r1-c1', true, 0.4), legacyRow('seat-r2-c1', false, 0.5)],
  });
  assertEqual(validateConfirmedCandidate(legacyOnly, { seats: SEATS }).valid, false,
    '2. per-seat P19 rows do not rescue a candidate with no aggregate RSP P19');

  const baselineResult = baseline();
  const selection = selectConfirmedRecommendations([legacyOnly], SNAPSHOT, baselineResult);
  assertEqual(statusOf(selection, 'cand-legacy-only'), 'invalid',
    '3. a legacy-only candidate is recorded as invalid');

  const legacyP20Missing = makeResult({ candidateId: 'cand-no-p20-seat', omitP20Seat: true });
  assertEqual(validateConfirmedCandidate(legacyP20Missing, { seats: SEATS }).valid, false,
    '3. the per-seat metric (P20) is still required in full');
}

// ── 4. Aggregate RSP P19 level drop is safety-rejected ────────────────────

function testAggregateLevelDropIsSafetyRejected() {
  // Baseline L4 (2.79 dB) -> candidate L2 (4.28 dB) = a two-level drop.
  const baselineResult = baseline({ aggregateP19Raw: 2.79 });
  const regressed = makeResult({
    candidateId: 'cand-l4-to-l2',
    aggregateP19Raw: 4.28,
    // Legacy rows deliberately show no regression at all.
    legacyP19Rows: [legacyRow('seat-r1-c1', true, 2.79), legacyRow('seat-r2-c1', false, 2.79)],
  });

  assertEqual(gradeP19FromRaw(2.79), 4, '4. the baseline fixture is L4');
  assertEqual(gradeP19FromRaw(4.28), 2, '4. the candidate fixture is L2');

  const direct = hasHardSafetyRegression(
    extractAuthoritativeMetrics(regressed),
    extractAuthoritativeMetrics(baselineResult),
  );
  assertEqual(direct.regressed, true, '4. the aggregate level drop is a hard safety regression');
  assertEqual(direct.parameter, 'P19', '4. the regression is reported as P19');
  assertEqual(direct.scope, 'rsp', '4. the regression is scoped to the aggregate RSP authority');

  const selection = selectConfirmedRecommendations([regressed], SNAPSHOT, baselineResult);
  assertEqual(statusOf(selection, 'cand-l4-to-l2'), 'safety-rejected', '4. L4 -> L2 is safety-rejected');
  assertEqual(selection.winner, null, '4. a safety-rejected candidate is never the winner');

  // A candidate with no aggregate P19 must not be read as a regression either.
  const noAuthority = hasHardSafetyRegression(
    { p14Level: 2, p18Level: 3 },
    { p14Level: 2, p18Level: 3 },
  );
  assertEqual(noAuthority.regressed, false, '4. the check is inert when no aggregate P19 is supplied');
}

// ── 5. A per-seat improvement cannot mask an aggregate regression ─────────

function testPerSeatImprovementCannotMaskAggregateRegression() {
  // Baseline: aggregate L4 (1.5 dB). Candidate: aggregate still L4 but 1.29 dB
  // WORSE — the same-level aggregate P19 regression the classifier must report.
  // Seat consistency (P20) improves, so the candidate is a trade-off, not a
  // safety rejection.
  const baselineResult = baseline({
    aggregateP19Raw: 1.5,
    legacyP19Rows: [legacyRow('seat-r1-c1', true, 1.5), legacyRow('seat-r2-c1', false, 4.0)],
  });
  const candidate = makeResult({
    candidateId: 'cand-p20-improves-p19-regresses',
    aggregateP19Raw: 2.79,
    // Legacy per-seat P19 rows claim a level IMPROVEMENT (L2 -> L4).
    legacyP19Rows: [legacyRow('seat-r1-c1', true, 1.5), legacyRow('seat-r2-c1', false, 1.5)],
    p20PrimaryRaw: 1.5,    // L4 (was L3)
    p20SecondaryRaw: 1.5,  // L4 (was L1)
  });

  assertEqual(findBestP19Improvement(candidate, baselineResult).improved, false,
    '5. legacy per-seat P19 levels cannot create a P19 improvement');

  const worsening = findP19Worsening(candidate, baselineResult);
  assertEqual(worsening.worsened, true, '5. the aggregate P19 regression is the worsening signal');
  assertEqual(worsening.scope, 'rsp', '5. the worsening is scoped to the aggregate RSP authority');
  assertEqual(worsening.seatId, 'rsp', '5. the worsening is not attributed to a seat');

  const tradeOff = classifyVerifiedTradeOff(baselineResult, candidate);
  assertEqual(tradeOff.isTradeOff, true, '5. the candidate is classified as a trade-off');
  assertEqual(tradeOff.worsening.parameter, 'P19', '5. the trade-off worsening is P19');
  assertEqual(tradeOff.worsening.scope, 'rsp', '5. and it comes from the aggregate authority');
  assertEqual(tradeOff.improvement.parameter, 'P20', '5. the improvement is the seat-consistency gain');
}

// ── 6. The trade-off classifier reads the aggregate P19 only ──────────────

function testTradeOffClassifierUsesAggregateP19() {
  const baselineResult = baseline({ aggregateP19Raw: 4.28 });
  const improved = makeResult({ candidateId: 'cand-rsp-improved', aggregateP19Raw: 2.79 });
  const improvement = findBestP19Improvement(improved, baselineResult);
  assertEqual(improvement.improved, true, '6. an aggregate level gain is a P19 improvement');
  assertEqual(improvement.scope, 'rsp', '6. and it is scoped to the aggregate RSP authority');
  assertEqual(improvement.isLevelChange, true, '6. a full level gain is reported as a level change');

  // A primary-seat P19 level drop in the legacy rows is not a safety signal.
  const legacyDrop = makeResult({
    candidateId: 'cand-legacy-drop',
    aggregateP19Raw: 2.79,
    legacyP19Rows: [legacyRow('seat-r1-c1', true, 4.9), legacyRow('seat-r2-c1', false, 4.9)],
  });
  assertEqual(hasPrimarySeatLevelRegression(legacyDrop, baselineResult).regressed, false,
    '6. a legacy per-seat P19 level drop is not a primary-seat regression');

  // The per-seat P20 level drop IS still a primary-seat regression.
  const p20Drop = makeResult({
    candidateId: 'cand-p20-drop',
    aggregateP19Raw: 2.79,
    p20PrimaryRaw: 5.23,
  });
  const p20Regression = hasPrimarySeatLevelRegression(p20Drop, baselineResult);
  assertEqual(p20Regression.regressed, true, '6. a P20 primary-seat level drop is still a regression');
  assertEqual(p20Regression.parameter, 'P20', '6. and it is reported as P20');
}

// ── 7. Materiality reads the aggregate P19 only ───────────────────────────

function testMaterialityUsesAggregateP19() {
  const baselineResult = baseline({ aggregateP19Raw: 3.4, p20PrimaryRaw: 3.5, p20SecondaryRaw: 5.23 });

  // (a) An aggregate RSP improvement is material even with no per-seat P19 rows.
  const aggregateGain = makeResult({
    candidateId: 'cand-aggregate-gain',
    aggregateP19Raw: 1.4,
    legacyP19Rows: [],
    p20PrimaryRaw: 3.5,
    p20SecondaryRaw: 5.23,
  });
  const gain = isMaterialImprovement(baselineResult, aggregateGain);
  assertEqual(gain.material, true, '7. an aggregate RSP P19 improvement is material');
  assert(/aggregate RSP/i.test(gain.reason), '7. the materiality reason names the aggregate authority');

  // (b) A legacy per-seat P19 improvement cannot make an unchanged candidate material.
  const legacyGain = makeResult({
    candidateId: 'cand-legacy-gain',
    aggregateP19Raw: 3.4,
    legacyP19Rows: [legacyRow('seat-r1-c1', true, 0.4), legacyRow('seat-r2-c1', false, 0.4)],
    p20PrimaryRaw: 3.5,
    p20SecondaryRaw: 5.23,
  });
  const legacy = isMaterialImprovement(baselineResult, legacyGain);
  assertEqual(legacy.material, false,
    '7. a legacy per-seat P19 improvement alone is not material');

  // (c) An aggregate P19 regression with a legacy per-seat improvement is not material.
  const regressed = makeResult({
    candidateId: 'cand-aggregate-regression',
    aggregateP19Raw: 6.5, // L1 -> FAIL
    legacyP19Rows: [legacyRow('seat-r1-c1', true, 0.4)],
    p20PrimaryRaw: 3.5,
    p20SecondaryRaw: 5.23,
  });
  assertEqual(isMaterialImprovement(baselineResult, regressed).material, false,
    '7. an aggregate P19 regression is never material');
}

// ── 8. A candidate without aggregate P19 can win nothing ──────────────────

function testCandidateWithoutAggregateP19CannotWin() {
  const baselineResult = baseline({ aggregateP19Raw: 3.4 });
  const noAggregate = makeResult({
    candidateId: 'cand-no-aggregate',
    omitAggregateP19: true,
    // The best-looking legacy evidence there is.
    legacyP19Rows: [legacyRow('seat-r1-c1', true, 0.2), legacyRow('seat-r2-c1', false, 0.2)],
    p20PrimaryRaw: 1.5,
    p20SecondaryRaw: 1.5,
  });
  // A genuine aggregate RSP level gain (L3 -> L4) — the material candidate.
  const valid = makeResult({ candidateId: 'cand-valid', aggregateP19Raw: 1.4 });

  const objectives = selectCanonicalObjectives({ candidates: [noAggregate, valid], baseline: baselineResult });
  assertEqual(objectives.bestCanonicalP19?.candidateId, 'cand-valid',
    '8. a candidate with no aggregate P19 is not the best P19 candidate');
  assertEqual(objectives.bestCanonicalP20?.candidateId, 'cand-valid',
    '8. a candidate with no aggregate P19 is not the best P20 candidate either');
  assertEqual(objectives.bestCanonicalBalanced?.candidateId, 'cand-valid',
    '8. a candidate with no aggregate P19 is not the balanced winner');
  assertEqual(objectives.scoredCount, 1, '8. it is excluded from the scored pool');

  const selection = selectConfirmedRecommendations([noAggregate, valid], SNAPSHOT, baselineResult);
  assertEqual(statusOf(selection, 'cand-no-aggregate'), 'invalid', '8. it is invalid, not eligible');
  assertEqual(selection.winner?.candidateId, 'cand-valid', '8. the final recommendation is the valid candidate');

  // Alone, it produces no recommendation at all.
  const alone = selectConfirmedRecommendations([noAggregate], SNAPSHOT, baselineResult);
  assertEqual(alone.winner, null, '8. alone it produces no winner');
  assertEqual(alone.terminalOutcome, 'incomplete', '8. and the run reports an incomplete evaluation');
}

// ── 9. P20 remains the per-seat authority ─────────────────────────────────

function testP20RemainsPerSeatAuthority() {
  const baselineResult = baseline({ p20PrimaryRaw: 3.5, p20SecondaryRaw: 5.23 });
  const p20Improved = makeResult({
    candidateId: 'cand-p20-improved',
    aggregateP19Raw: 2.79,
    p20PrimaryRaw: 1.5,
    p20SecondaryRaw: 1.5,
  });

  const p20 = findBestP20Improvement(p20Improved, baselineResult);
  assertEqual(p20.improved, true, '9. P20 is still read per seat');
  assertEqual(p20.parameter, 'P20', '9. and still reported as P20');
  assertEqual(p20.worsened, undefined, '9. a P20 improvement carries no P19 semantics');

  const p20Worsening = findP20Worsening(
    makeResult({ candidateId: 'cand-p20-worse', aggregateP19Raw: 2.79, p20SecondaryRaw: 6.73 }),
    baselineResult,
  );
  assertEqual(p20Worsening.worsened, true, '9. P20 same-level worsening is still detected per seat');

  // A P19 regression cannot hide behind a P20 gain: the safety gate is separate.
  const both = makeResult({
    candidateId: 'cand-p19-regresses-p20-improves',
    aggregateP19Raw: 2.79,
    p20PrimaryRaw: 1.5,
    p20SecondaryRaw: 1.5,
  });
  const p19Baseline = baseline({ aggregateP19Raw: 1.5 });
  assertEqual(hasHardSafetyRegression(
    extractAuthoritativeMetrics(both),
    extractAuthoritativeMetrics(p19Baseline),
  ).regressed, false, '9. a same-level aggregate P19 movement is not a safety rejection');

  const tradeOff = classifyVerifiedTradeOff(p19Baseline, both);
  assertEqual(tradeOff.isTradeOff, true, '9. it is a designer trade-off instead');
  assertEqual(tradeOff.improvement.parameter, 'P20', '9. improving seat consistency');
  assertEqual(tradeOff.worsening.parameter, 'P19', '9. at the cost of the aggregate RSP response');
}

// ── 10. Every P19 decision is invariant to the legacy rows ────────────────

function testP19DecisionsAreInvariantToLegacyRows() {
  const baselineResult = baseline({ aggregateP19Raw: 1.5 });

  const legacyLooksGreat = makeResult({
    candidateId: 'cand-legacy-great',
    aggregateP19Raw: 2.79,
    legacyP19Rows: [legacyRow('seat-r1-c1', true, 0.2), legacyRow('seat-r2-c1', false, 0.2)],
    p20PrimaryRaw: 1.5,
    p20SecondaryRaw: 1.5,
  });
  const legacyLooksTerrible = makeResult({
    candidateId: 'cand-legacy-terrible',
    aggregateP19Raw: 2.79,
    legacyP19Rows: [legacyRow('seat-r1-c1', true, 9.9), legacyRow('seat-r2-c1', false, 9.9)],
    p20PrimaryRaw: 1.5,
    p20SecondaryRaw: 1.5,
  });

  assertEqual(validateConfirmedCandidate(legacyLooksGreat, { seats: SEATS }).valid,
    validateConfirmedCandidate(legacyLooksTerrible, { seats: SEATS }).valid,
    '10. validity is identical whatever the legacy rows contain');

  assertEqual(findBestP19Improvement(legacyLooksGreat, baselineResult).improved,
    findBestP19Improvement(legacyLooksTerrible, baselineResult).improved,
    '10. the P19 improvement read is identical');
  assertEqual(findP19Worsening(legacyLooksGreat, baselineResult).worsened,
    findP19Worsening(legacyLooksTerrible, baselineResult).worsened,
    '10. the P19 worsening read is identical');

  const tradeOffGreat = classifyVerifiedTradeOff(baselineResult, legacyLooksGreat);
  const tradeOffTerrible = classifyVerifiedTradeOff(baselineResult, legacyLooksTerrible);
  assertEqual(tradeOffGreat.isTradeOff, tradeOffTerrible.isTradeOff, '10. trade-off classification is identical');
  assertEqual(tradeOffGreat.worsening?.parameter, tradeOffTerrible.worsening?.parameter,
    '10. the classified objective is identical');

  assertEqual(isMaterialImprovement(baselineResult, legacyLooksGreat).material,
    isMaterialImprovement(baselineResult, legacyLooksTerrible).material,
    '10. materiality is identical');

  assertEqual(compareRspP19(baselineResult, legacyLooksGreat).deviationDeltaDb,
    compareRspP19(baselineResult, legacyLooksTerrible).deviationDeltaDb,
    '10. the aggregate comparison ignores the legacy rows entirely');
  assertEqual(readRspP19(legacyLooksGreat).level, readRspP19(legacyLooksTerrible).level,
    '10. the aggregate level is the same authority');

  const selectionGreat = selectConfirmedRecommendations([legacyLooksGreat], SNAPSHOT, baselineResult);
  const selectionTerrible = selectConfirmedRecommendations([legacyLooksTerrible], SNAPSHOT, baselineResult);
  assertEqual(selectionGreat.winner?.candidateId ?? null, selectionTerrible.winner?.candidateId ?? null,
    '10. the winner is identical');
  assertEqual(selectionGreat.terminalOutcome, selectionTerrible.terminalOutcome,
    '10. the terminal outcome is identical');
}

// ── Run ───────────────────────────────────────────────────────────────────

testAggregateP19RequiredForValidity();
testLegacyPerSeatCannotSubstitute();
testAggregateLevelDropIsSafetyRejected();
testPerSeatImprovementCannotMaskAggregateRegression();
testTradeOffClassifierUsesAggregateP19();
testMaterialityUsesAggregateP19();
testCandidateWithoutAggregateP19CannotWin();
testP20RemainsPerSeatAuthority();
testP19DecisionsAreInvariantToLegacyRows();

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);