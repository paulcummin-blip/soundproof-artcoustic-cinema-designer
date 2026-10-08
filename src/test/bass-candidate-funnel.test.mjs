// bass-candidate-funnel.test.mjs
// ---------------------------------------------------------------------------
// ACCEPTANCE — the bass optimiser candidate funnel.
//
// Controlled front/rear fixture: two seat rows, a front and a rear sub group,
// a baseline with poor seat-to-seat consistency, and candidates where the best
// P19 candidate is deliberately NOT the best P20 candidate.
//
// Proves:
//   - the proxy metrics measure what their names say (RSP range vs seat range)
//   - promotion reads each objective's OWN proxy (no inverted pairing)
//   - best canonical P19 / P20 / balanced are identified, and distinct
//   - the final recommendation names its objective and its trade-off
//   - P19 materiality reads the aggregate RSP authority, not empty per-seat rows
//   - the diagnostic ledger exposes settings, proxy and canonical values
//
// No scoring, no grading, no project data and no report copy is changed.
// ---------------------------------------------------------------------------
import { test } from 'vitest';
import assert from 'node:assert/strict';

import {
  computeProxyCandidateMetrics,
  promoteProxyChallengers,
  readProxyCandidateMetrics,
} from '../components/room/bass/improveBassV2/proxyCandidateMetrics.js';
import {
  selectCanonicalObjectives,
  explainFinalSelection,
  dedupeCandidates,
} from '../components/room/bass/improveBassV2/canonicalObjectiveSelection.js';
import {
  buildCandidateLedger,
  buildProxyIndex,
  summariseCandidateLedger,
} from '../components/room/bass/improveBassV2/candidateLedger.js';
import { isMaterialImprovement } from '../components/room/bass/improveBassV2/materialityGate.js';
import { classifyVerifiedTradeOff } from '../components/room/bass/improveBassV2/tradeOffClassifier.js';
import { compareRspP19, readRspP19 } from '../components/room/bass/improveBassV2/p19Authority.js';
import { selectSeatingShortlist } from '../components/room/bass/improveBassV2/seatingShortlistPolicy.js';
import { gradeP19FromRaw, gradeP20FromRaw } from '../components/room/bass/completedBassResultPersistence.js';

// ── Fixture ────────────────────────────────────────────────────────────────

// Two rows, one primary seat per row (a front/rear sub layout).
const SEATS = [
  { id: 'seat-r1-c1', priority: 'secondary' },
  { id: 'seat-r1-c2', priority: 'primary' },
  { id: 'seat-r1-c3', priority: 'secondary' },
  { id: 'seat-r2-c1', priority: 'secondary' },
  { id: 'seat-r2-c2', priority: 'secondary' },
  { id: 'seat-r2-c3', priority: 'primary' },
];

// Canonical P20 grading: <=2 L4, <=3 L3, <=4 L2, otherwise L1 — so every
// deviation below is L1 and the levels stay comparable (same-level comparisons).
const BASE_P20 = [8.2, 8.9, 9.4, 11.8, 13.2, 10.7];
const worseP20 = (deltaDb) => BASE_P20.map((value) => value + deltaDb);

/** A confirmed candidate: real per-seat P20 collection, aggregate RSP P19. */
function candidate(id, { p19DeviationDb, p20DeviationsDb, kind = 'calibration', origin = 'calibration-only' }) {
  return {
    candidateId: id,
    candidateKind: kind,
    candidateOrigin: origin,
    achievedP19VariationDb: p19DeviationDb,
    achievedP19Level: gradeP19FromRaw(p19DeviationDb),
    perSeatP19: [], // P19 is RSP-only — always empty in this model
    achievedP20VariationDb: Math.max(...p20DeviationsDb),
    achievedP20Level: gradeP20FromRaw(Math.max(...p20DeviationsDb)),
    perSeatP20: SEATS.map((seat, index) => ({
      seatId: seat.id,
      isPrimary: seat.priority === 'primary',
      variationDbRaw: p20DeviationsDb[index],
      level: gradeP20FromRaw(p20DeviationsDb[index]),
    })),
    appliedTuning: [
      { sourceId: 'sub-front-1', delayMs: 0, gainDb: 0, polarity: 1, phaseControlDeg: 0 },
      { sourceId: 'sub-front-2', delayMs: 0, gainDb: 0, polarity: 1, phaseControlDeg: 0 },
      { sourceId: 'sub-rear-1', delayMs: 4, gainDb: 0, polarity: 1, phaseControlDeg: 0 },
      { sourceId: 'sub-rear-2', delayMs: 4, gainDb: 0, polarity: 1, phaseControlDeg: 0 },
    ],
    achievedP18Hz: 18,
    achievedP18Level: 3,
  };
}

// Baseline: L3 RSP response, poor (L1) seat-to-seat consistency.
const BASELINE = candidate('current-design', { p19DeviationDb: 3.4, p20DeviationsDb: BASE_P20 });
// Best P19: a full RSP level gain (L3 -> L4), at the cost of seat consistency.
const BEST_P19 = candidate('candidate:best-p19', { p19DeviationDb: 1.4, p20DeviationsDb: worseP20(1.6) });
// Best P20: materially better seat consistency, RSP response unchanged.
const BEST_P20 = candidate('candidate:best-p20', { p19DeviationDb: 3.4, p20DeviationsDb: [6.1, 6.4, 6.2, 6.0, 6.3, 6.2] });
// Balanced: improves both, with neither pushed to its limit.
const BALANCED = candidate('candidate:balanced', { p19DeviationDb: 1.9, p20DeviationsDb: [8.9, 8.8, 8.6, 8.5, 9.0, 8.7] });

// ── Proxy metrics measure what their names say ─────────────────────────────

test('proxy metrics: RSP range and worst-seat range are measured, not swapped', () => {
  // One subwoofer, two seats. The RSP response has a 20 dB swing; the one real
  // seat is flat. Under the old names this produced proxyP19 = 0 (worst seat)
  // and proxyP20 = 20 (RSP) — the inverted pairing this work removes.
  const rawTransfer = {
    seatIds: ['rsp', 'seat-r1-c1'],
    perSourcePerSeatComplexTransfers: [
      { seatId: 'rsp', points: [
        { frequency: 20, re: 1, im: 0 },
        { frequency: 60, re: 10, im: 0 },
        { frequency: 120, re: 1, im: 0 },
      ] },
      { seatId: 'seat-r1-c1', points: [
        { frequency: 20, re: 1, im: 0 },
        { frequency: 60, re: 1, im: 0 },
        { frequency: 120, re: 1, im: 0 },
      ] },
    ],
  };

  const metrics = computeProxyCandidateMetrics(rawTransfer, [{ delayMs: 0, gainDb: 0, polarity: 0 }]);
  assert.ok(metrics.proxyRspRange > 19 && metrics.proxyRspRange < 21, `RSP range ~20 dB, got ${metrics.proxyRspRange}`);
  assert.ok(metrics.proxyWorstSeatRange < 0.001, `worst seat range ~0 dB, got ${metrics.proxyWorstSeatRange}`);
  assert.ok(metrics.proxyBalancedRange >= metrics.proxyRspRange - 1e-9, 'balanced range is the worse of the two');
  assert.ok(metrics.proxyAllSeatRange < 0.001, 'all-seat mean range reflects the flat seats');
});

test('proxy metrics: legacy names are read with their real meanings', () => {
  // proxyP20 held the RSP range, proxyP19 held the worst-seat range.
  const legacy = readProxyCandidateMetrics({ proxyP19: 3.0, proxyP20: 9.0, proxyBalanced: 9.0 });
  assert.equal(legacy.proxyRspRange, 9.0);
  assert.equal(legacy.proxyWorstSeatRange, 3.0);
});

// ── Promotion reads each objective's own proxy ─────────────────────────────

test('promotion: RSP proxy fills the P19 slot, worst-seat proxy fills the P20 slot', () => {
  const rspGood = { id: 'challenger:a', familyId: 'a', proxyResult: { proxyRspRange: 2.0, proxyWorstSeatRange: 9.0, proxyBalancedRange: 9.0 } };
  const seatsGood = { id: 'challenger:b', familyId: 'b', proxyResult: { proxyRspRange: 9.0, proxyWorstSeatRange: 2.0, proxyBalancedRange: 9.0 } };
  const compromise = { id: 'challenger:c', familyId: 'c', proxyResult: { proxyRspRange: 5.0, proxyWorstSeatRange: 5.5, proxyBalancedRange: 5.5 } };

  const promoted = promoteProxyChallengers([rspGood, seatsGood, compromise], 3);
  const ids = promoted.map((entry) => entry.id);
  assert.equal(ids[0], 'challenger:a', 'RSP-best challenger is promoted first');
  assert.equal(ids[1], 'challenger:b', 'seat-best challenger is promoted second');
  assert.equal(ids[2], 'challenger:c', 'balanced challenger takes the third slot');
  assert.ok(promoted.every((entry) => Number.isFinite(entry.proxyRspRange)), 'promoted challengers carry the four proxy metrics');
});

// ── Canonical objective winners ────────────────────────────────────────────

test('canonical objectives: best P19, best P20 and balanced are identified and distinct', () => {
  const objectives = selectCanonicalObjectives({ candidates: [BEST_P19, BEST_P20, BALANCED], baseline: BASELINE });

  assert.equal(objectives.bestCanonicalP19.candidateId, 'candidate:best-p19');
  assert.equal(objectives.bestCanonicalP20.candidateId, 'candidate:best-p20');
  assert.equal(objectives.bestCanonicalBalanced.candidateId, 'candidate:balanced');
  assert.notEqual(objectives.bestCanonicalP19.candidateId, objectives.bestCanonicalP20.candidateId,
    'best P19 and best P20 are not necessarily the same candidate');
  assert.equal(objectives.scoredCount, 3);
});

test('canonical objectives: a candidate that damages an objective is not the balanced winner', () => {
  const damaging = candidate('candidate:damaging', {
    p19DeviationDb: 1.2,
    p20DeviationsDb: worseP20(3.5), // materially worse seat consistency than the baseline
  });
  const objectives = selectCanonicalObjectives({ candidates: [damaging, BALANCED], baseline: BASELINE });
  assert.equal(objectives.bestCanonicalP19.candidateId, 'candidate:damaging');
  assert.equal(objectives.bestCanonicalBalanced.candidateId, 'candidate:balanced');
});

test('duplicate candidate ids collapse to one entry', () => {
  const deduped = dedupeCandidates([BEST_P19, { ...BEST_P19 }, BEST_P20]);
  assert.equal(deduped.length, 2);
});

// ── Final recommendation names its objective and trade-off ────────────────

test('final recommendation names the objective it favours and what it gives up', () => {
  const objectives = selectCanonicalObjectives({ candidates: [BEST_P19, BEST_P20, BALANCED], baseline: BASELINE });

  const asP19 = explainFinalSelection({ finalCandidate: BEST_P19, objectives });
  assert.equal(asP19.objective, 'rsp');
  assert.match(asP19.objectiveLabel, /P19/);
  assert.match(asP19.tradeOff, /seat-to-seat deviation/);

  const asBalanced = explainFinalSelection({ finalCandidate: BALANCED, objectives });
  assert.equal(asBalanced.objective, 'balanced');
  assert.match(asBalanced.reason, /compromise/);

  const asP20 = explainFinalSelection({ finalCandidate: BEST_P20, objectives });
  assert.equal(asP20.objective, 'consistency');
  assert.match(asP20.tradeOff, /RSP deviation/);
});

// ── P19 materiality reads the aggregate RSP authority ─────────────────────

test('P19 materiality: an aggregate RSP improvement is material with no per-seat P19 rows', () => {
  const improved = candidate('candidate:rsp-improved', {
    p19DeviationDb: 1.4,           // L3 -> L4
    p20DeviationsDb: BASE_P20,     // seat consistency unchanged
  });
  assert.equal(BASELINE.perSeatP19.length, 0, 'the fixture carries no per-seat P19 rows');
  assert.equal(improved.perSeatP19.length, 0, 'the candidate carries no per-seat P19 rows');

  const verdict = isMaterialImprovement(BASELINE, improved);
  assert.equal(verdict.material, true, 'aggregate RSP P19 improvement counts as material');
  assert.match(verdict.reason, /aggregate RSP/i);
});

test('P19 materiality: an aggregate RSP worsening is not material', () => {
  const worsened = candidate('candidate:rsp-worse', {
    p19DeviationDb: 6.5,           // L3 -> FAIL, seat consistency unchanged
    p20DeviationsDb: BASE_P20,
  });
  const verdict = isMaterialImprovement(BASELINE, worsened);
  assert.equal(verdict.material, false);
});

test('RSP P19 comparison reports improvement and regression honestly', () => {
  const improved = compareRspP19(BASELINE, BEST_P19, 1.0);
  assert.equal(improved.improved, true);
  assert.equal(improved.levelImproved, true, 'a full level gain is an improvement');
  assert.ok(Math.abs(improved.deviationDeltaDb - 2.0) < 1e-9, `2.0 dB deviation reduction, got ${improved.deviationDeltaDb}`);

  const subThreshold = compareRspP19(BASELINE, candidate('candidate:small', {
    p19DeviationDb: 3.0, p20DeviationsDb: BASE_P20,
  }), 1.0);
  assert.equal(subThreshold.improved, false, 'a sub-threshold deviation change is not material');

  const regressed = compareRspP19(BASELINE, candidate('candidate:regressed', {
    p19DeviationDb: 6.5, p20DeviationsDb: BASE_P20,
  }), 1.0);
  assert.equal(regressed.levelRegressed, true, 'a lower aggregate level is a regression');
  assert.equal(regressed.improved, false);
  assert.equal(readRspP19(BEST_P19).level, 4);
});

test('trade-off: RSP improvement with seat-consistency loss is a verified trade-off', () => {
  const verdict = classifyVerifiedTradeOff(BASELINE, BEST_P19);
  assert.equal(verdict.isTradeOff, true, 'P19 improved while P20 worsened materially');
  assert.equal(verdict.improvement.parameter, 'P19');
  assert.equal(verdict.improvement.scope, 'rsp', 'the improvement was read from the aggregate RSP authority');
  assert.equal(verdict.worsening.parameter, 'P20');
  assert.match(verdict.neutralText, /primary seat|consistency/i);
});

// ── Diagnostic ledger ──────────────────────────────────────────────────────

test('candidate ledger exposes settings, proxy values, canonical values and roles', () => {
  const groupedId = 'grouped-delay:["sub-rear-1","sub-rear-2"]:4';
  const groupedResult = {
    ...candidate(groupedId, { p19DeviationDb: 2.1, p20DeviationsDb: BASE_P20 }),
    candidateKind: 'calibration',
    candidateOrigin: 'calibration-only',
  };
  const placementResult = {
    ...BEST_P20,
    candidateId: 'challenger:placement-1',
    candidateKind: 'position',
    candidateOrigin: 'local-symmetric',
    isPositionCandidate: true,
  };
  const unconfirmedChallenger = {
    id: 'challenger:placement-2',
    familyId: 'asymmetricPair',
    proxyResult: { proxyRspRange: 6.4, proxyWorstSeatRange: 4.2, proxyBalancedRange: 6.4 },
  };

  const proxyIndex = buildProxyIndex({
    challengers: [
      { id: 'challenger:placement-1', familyId: 'symmetric', proxyResult: { proxyRspRange: 3.2, proxyWorstSeatRange: 6.8, proxyBalancedRange: 6.8 } },
      unconfirmedChallenger,
    ],
    diagnostics: {
      calibrationDiagnostics: {
        options: [{ candidateId: groupedId, tuning: [], proxy: { rspRangeDb: 4.1, primaryRangeDb: 7.2, allSeatRangeDb: 7.9 } }],
      },
    },
  });

  const objectives = selectCanonicalObjectives({ candidates: [BEST_P19, BEST_P20, BALANCED], baseline: BASELINE });
  const ledger = buildCandidateLedger({
    candidates: [groupedResult, placementResult, BALANCED, BEST_P19, BEST_P20],
    proxyIndex,
    evaluations: [{ candidateId: groupedId, status: 'material', materiality: { material: true, reason: 'Level improvement' } }],
    objectives,
    finalCandidate: BALANCED,
  });

  const groupedRow = ledger.find((entry) => entry.candidateId === groupedId);
  assert.ok(groupedRow, 'confirmed grouped-delay candidate is in the ledger');
  assert.equal(groupedRow.source, 'grouped-delay');
  assert.deepEqual(groupedRow.settings.delay, [0, 0, 4, 4], 'per-source delay settings are exposed');
  assert.equal(groupedRow.settings.phase[0], 0, 'per-source phase settings are exposed');
  assert.equal(groupedRow.proxyRspRange, 4.1, 'RSP-range proxy is exposed');
  assert.equal(groupedRow.proxyWorstSeatRange, 7.2, 'worst-seat proxy is exposed');
  assert.equal(groupedRow.canonicalP19, 2.1);
  assert.equal(groupedRow.canonicalP19Level, 4);
  assert.ok(Number.isFinite(groupedRow.canonicalP20), 'canonical P20 is exposed');
  assert.equal(groupedRow.canonicalP18Hz, 18);
  assert.equal(groupedRow.status, 'confirmed');
  assert.equal(groupedRow.rank, 3, 'confirmed rows are ranked by canonical P19 (best P19 1.4, balanced 1.9, grouped 2.1)');
  assert.match(groupedRow.reasonRetained, /Level improvement/);

  const placementRow = ledger.find((entry) => entry.candidateId === 'challenger:placement-1');
  assert.equal(placementRow.source, 'challenger-placement');
  assert.equal(placementRow.proxyRspRange, 3.2, 'challenger proxy joins the confirmed placement row');
  assert.deepEqual(placementRow.selectedAs, [], 'not an objective winner');

  const balancedRow = ledger.find((entry) => entry.candidateId === 'candidate:balanced');
  assert.equal(balancedRow.selectedAs.includes('final-recommended'), true);

  const proxyOnly = ledger.find((entry) => entry.candidateId === 'challenger:placement-2');
  assert.equal(proxyOnly.status, 'proxy-only');
  assert.equal(proxyOnly.canonicalP19, null, 'proxy-only rows carry no canonical result');
  assert.match(proxyOnly.reasonDiscarded, /Not promoted/);

  const bestP19Row = ledger.find((entry) => entry.candidateId === 'candidate:best-p19');
  assert.equal(bestP19Row.rank, 1, 'best canonical P19 candidate ranks first');
  assert.equal(bestP19Row.selectedAs.includes('best-p19'), true);

  const summary = summariseCandidateLedger(ledger);
  assert.equal(summary.confirmed, 5);
  assert.equal(summary.proxyOnly, 1);
  assert.equal(summary.finalRecommended[0], 'candidate:balanced');
  assert.ok(summary.bestP19.includes('candidate:best-p19'));
  assert.ok(summary.bestP20.includes('candidate:best-p20'));
  assert.ok(summary.bestBalanced.includes('candidate:balanced'));
});

test('seating shortlist reads the corrected worst-seat proxy and the legacy field', () => {
  const results = [
    { offsetMm: 100, proxyRspRange: 9.0, proxyWorstSeatRange: 5.0, proxyBalancedRange: 9.0 },
    { offsetMm: 200, proxyRspRange: 9.0, proxyWorstSeatRange: 3.0, proxyBalancedRange: 9.0 },
    { offsetMm: 300, proxyP19: 4.0 }, // legacy capture: proxyP19 held the worst-seat range
  ];
  const shortlist = selectSeatingShortlist(results, 8);
  assert.deepEqual(shortlist.map((entry) => entry.offsetMm), [200, 300, 100],
    'seating is shortlisted by seat-consistency range, new name or legacy name');
});

test('ledger keeps proxy-only grouped options even when nothing was confirmed', () => {
  const proxyIndex = buildProxyIndex({
    diagnostics: { gainDiagnostics: { options: [{ candidateId: 'grouped-gain:["sub-rear-1"]:-2', tuning: [], proxy: { rspRangeDb: 5, primaryRangeDb: 5.5 } }] } },
  });
  const ledger = buildCandidateLedger({ candidates: [], proxyIndex, objectives: null, finalCandidate: null });
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].candidateId, 'grouped-gain:["sub-rear-1"]:-2');
  assert.equal(ledger[0].source, 'proxy-only');
});