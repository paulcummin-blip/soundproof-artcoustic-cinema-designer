// optimiser-plan-persistence.test.mjs
// ---------------------------------------------------------------------------
// The evaluated optimiser result is saved with the design/proposal and
// restored on reopen — never recomputed, and never silently reused after the
// design changes.
//
//   TEST 1  plan built from the evaluated candidate (only CHANGED levers)
//   TEST 2  save → restore round trip returns the plan exactly
//   TEST 3  fingerprint matches → Current; design changed → Stale (kept)
//   TEST 4  an applied lever reports Applied; a partial apply does not
//   TEST 5  a disabled lever stays Disabled across restore
//   TEST 6  levers whose subwoofers disappeared → No longer applicable
//   TEST 7  only a combined candidate → the fact is persisted (rule 6)
//   TEST 8  no individual effect is ever borrowed from the combined candidate
import assert from 'node:assert/strict';
import { buildOptimiserPlan } from '../src/components/room/bass/optimiserPlan/buildOptimiserPlan.js';
import { resolveOptimiserPlanStatus } from '../src/components/room/bass/optimiserPlan/resolveOptimiserPlanStatus.js';
import {
  hydrateOptimiserPlan,
  readPublishedOptimiserPlan,
  serializeOptimiserPlan,
} from '../src/components/room/bass/optimiserPlan/optimiserPlanPersistence.js';
import {
  getOptimiserPlanAuthority,
  resetOptimiserPlanAuthority,
  setOptimiserLeverDecision,
  setOptimiserPlanAuthority,
} from '../src/components/room/bass/optimiserPlan/optimiserPlanStore.js';
import {
  OPTIMISER_LEVER,
  OPTIMISER_LEVER_STATE,
  OPTIMISER_PLAN_STATUS,
} from '../src/components/room/bass/optimiserPlan/optimiserPlanConstants.js';

let failures = 0;
const check = (name, fn) => {
  try { fn(); console.log(`PASS  ${name}`); }
  catch (e) { failures += 1; console.error(`FAIL  ${name}\n      ${e.message}`); }
};

const DESIGN_FP = 'design:fp:aaa';
const RESULT_FP = 'result:fp:bbb';

const instances = () => [
  { id: 'sub-front-1', enabled: true, legacyGroup: 'front', position: { x: 0.31, y: 0.1375 }, delayMs: 0, gainDb: 0, polarity: 1 },
  { id: 'sub-front-2', enabled: true, legacyGroup: 'front', position: { x: 4.19, y: 0.1375 }, delayMs: 0, gainDb: 0, polarity: 1 },
  { id: 'sub-rear-1', enabled: true, legacyGroup: 'rear', position: { x: 0.31, y: 5.8625 }, delayMs: 0, gainDb: 0, polarity: 1 },
  { id: 'sub-rear-2', enabled: true, legacyGroup: 'rear', position: { x: 4.19, y: 5.8625 }, delayMs: 0, gainDb: 0, polarity: 1 },
];

const baseline = () => ({
  candidateId: 'current',
  candidateKind: 'current',
  perSeatP19: [],
  perSeatP20: [
    { seatId: 'seat-r1-c1', level: 1, variationDbRaw: 17.02, worstFrequencyHz: 94.56 },
    { seatId: 'seat-r2-c2', level: 1, variationDbRaw: 9.06, worstFrequencyHz: 53.45 },
  ],
  achievedP19VariationDb: 0.56,
  achievedP19Level: 4,
  achievedP20VariationDb: 17.02,
  achievedP20Level: 1,
  p14AchievedDb: 112,
  achievedP18Hz: 22,
  operatingOutputDb: 106,
});

const tuning = (delayRearMs, gainRearDb, rearPolarity) => ([
  { sourceId: 'sub-front-1', delayMs: 0, gainDb: 0, polarity: 1 },
  { sourceId: 'sub-front-2', delayMs: 0, gainDb: 0, polarity: 1 },
  { sourceId: 'sub-rear-1', delayMs: delayRearMs, gainDb: gainRearDb, polarity: rearPolarity },
  { sourceId: 'sub-rear-2', delayMs: delayRearMs, gainDb: gainRearDb, polarity: rearPolarity },
]);

const positionCandidate = () => ({
  candidateId: 'pos:1',
  isPositionCandidate: true,
  candidateKind: 'position',
  coordinates: [{ x: 0.9, y: 0.4 }, { x: 3.6, y: 0.4 }, { x: 0.9, y: 5.6 }, { x: 3.6, y: 5.6 }],
  appliedTuning: tuning(0, 0, 1),
  perSeatP20: [
    { seatId: 'seat-r1-c1', level: 2, variationDbRaw: 12.5, worstFrequencyHz: 92.1 },
    { seatId: 'seat-r2-c2', level: 2, variationDbRaw: 8.1, worstFrequencyHz: 53.45 },
  ],
  achievedP19VariationDb: 0.7,
  achievedP20VariationDb: 12.5,
  p14AchievedDb: 112.2,
  operatingOutputDb: 106.1,
  achievedP18Hz: 22,
});

const delayCandidate = () => ({
  candidateId: 'calibration:2',
  candidateKind: 'calibration',
  appliedTuning: tuning(2.5, 0, 1),
  perSeatP20: [
    { seatId: 'seat-r1-c1', level: 1, variationDbRaw: 15.0, worstFrequencyHz: 94.56 },
    { seatId: 'seat-r2-c2', level: 1, variationDbRaw: 8.9, worstFrequencyHz: 53.45 },
  ],
  achievedP19VariationDb: 0.8,
  achievedP20VariationDb: 15.0,
  p14AchievedDb: 112,
  operatingOutputDb: 105.8,
  achievedP18Hz: 22,
});

const gainCandidate = () => ({
  candidateId: 'gain:3',
  candidateKind: 'gain',
  appliedTuning: tuning(0, -2, 1),
  perSeatP20: [
    { seatId: 'seat-r1-c1', level: 1, variationDbRaw: 16.1, worstFrequencyHz: 94.56 },
    { seatId: 'seat-r2-c2', level: 1, variationDbRaw: 8.6, worstFrequencyHz: 53.45 },
  ],
  achievedP19VariationDb: 0.6,
  achievedP20VariationDb: 16.1,
  p14AchievedDb: 111.4,
  operatingOutputDb: 104.5,
  achievedP18Hz: 22,
});

const combinedWinner = () => ({
  candidateId: 'combined:9',
  candidateKind: 'combined',
  coordinates: [{ x: 0.9, y: 0.4 }, { x: 3.6, y: 0.4 }, { x: 0.9, y: 5.6 }, { x: 3.6, y: 5.6 }],
  appliedTuning: tuning(2.5, -2, -1),
  perSeatP20: [
    { seatId: 'seat-r1-c1', level: 3, variationDbRaw: 7.4, worstFrequencyHz: 88.0 },
    { seatId: 'seat-r2-c2', level: 3, variationDbRaw: 5.1, worstFrequencyHz: 53.45 },
  ],
  achievedP19VariationDb: 1.1,
  achievedP20VariationDb: 7.4,
  p14AchievedDb: 111.4,
  operatingOutputDb: 104.5,
  achievedP18Hz: 22,
  algorithmVersion: 'house-curve-shape-fit-v41',
});

const selection = () => ({
  winner: combinedWinner(),
  currentResult: baseline(),
  confirmedResults: [positionCandidate()],
  calibrationResult: delayCandidate(),
  calibrationMaterial: { material: true, reason: 'Measured seat-to-seat improvement' },
  gainResult: gainCandidate(),
  gainMaterial: { material: true, reason: 'Measured level alignment improvement' },
});

const buildPlan = (overrides = {}) => buildOptimiserPlan({
  selection: selection(),
  identity: { designFingerprint: DESIGN_FP, resultFingerprint: RESULT_FP },
  instances: instances(),
  ...overrides,
});

check('TEST 1 — plan carries only the levers the candidate changes', () => {
  const plan = buildPlan();
  assert.ok(plan, 'plan must be built');
  assert.deepEqual(
    Object.keys(plan.levers).sort(),
    [OPTIMISER_LEVER.DELAY, OPTIMISER_LEVER.GAIN, OPTIMISER_LEVER.PLACEMENT, OPTIMISER_LEVER.POLARITY].sort(),
  );
  assert.equal(plan.levers[OPTIMISER_LEVER.PLACEMENT].changes.length, 4);
  assert.equal(plan.levers[OPTIMISER_LEVER.DELAY].changes.length, 2);
  assert.equal(plan.levers[OPTIMISER_LEVER.GAIN].changes.length, 2);
  assert.equal(plan.levers[OPTIMISER_LEVER.POLARITY].changes.length, 2);
  assert.equal(plan.levers[OPTIMISER_LEVER.DELAY].changes[0].toMs, 2.5);
  assert.equal(plan.levers[OPTIMISER_LEVER.GAIN].changes[0].toDb, -2);
  assert.equal(plan.levers[OPTIMISER_LEVER.POLARITY].changes[0].toLabel, 'Inverted');
  assert.equal(plan.designFingerprint, DESIGN_FP);
  assert.equal(plan.resultFingerprint, RESULT_FP);
  assert.equal(plan.engineering, undefined); // no stray fields
  assert.equal(plan.levers[OPTIMISER_LEVER.PLACEMENT].changes[0].label, 'Front sub 1');
});

check('TEST 2 — save → restore returns the plan exactly', () => {
  resetOptimiserPlanAuthority('p1', 'v1');
  const plan = buildPlan();
  const serialized = serializeOptimiserPlan(plan);
  setOptimiserPlanAuthority('p1', 'v1', serialized);
  const before = getOptimiserPlanAuthority('p1', 'v1');
  resetOptimiserPlanAuthority('p1', 'v1'); // simulate reopen
  hydrateOptimiserPlan('p1', 'v1', JSON.parse(JSON.stringify(serialized)));
  const after = getOptimiserPlanAuthority('p1', 'v1');
  assert.deepEqual(after, before);
  assert.equal(after.levers[OPTIMISER_LEVER.DELAY].changes[0].toMs, 2.5);
  assert.equal(after.engineVersion, 'house-curve-shape-fit-v41');
});

check('TEST 3 — matching fingerprint is Current; a changed design is Stale but kept', () => {
  const plan = serializeOptimiserPlan(buildPlan());
  const current = resolveOptimiserPlanStatus({ plan, currentDesignFingerprint: DESIGN_FP, instances: instances() });
  assert.equal(current.status, OPTIMISER_PLAN_STATUS.CURRENT);
  assert.equal(current.staleReason, null);

  const stale = resolveOptimiserPlanStatus({ plan, currentDesignFingerprint: 'design:fp:CHANGED', instances: instances() });
  assert.equal(stale.status, OPTIMISER_PLAN_STATUS.STALE);
  assert.ok(stale.staleReason);
  assert.equal(stale.levers.length, 4, 'the saved plan is kept, never dropped');
  assert.ok(stale.levers.every((lever) => lever.state === OPTIMISER_LEVER_STATE.NEEDS_REEVALUATION));

  const unknown = resolveOptimiserPlanStatus({ plan, currentDesignFingerprint: null, instances: instances() });
  assert.equal(unknown.status, OPTIMISER_PLAN_STATUS.STALE, 'an unconfirmable design is never treated as current');
});

check('TEST 4 — Applied only when the saved values match the current design', () => {
  const plan = serializeOptimiserPlan(buildPlan());
  const notApplied = resolveOptimiserPlanStatus({ plan, currentDesignFingerprint: DESIGN_FP, instances: instances() });
  assert.ok(notApplied.levers.every((lever) => lever.state === OPTIMISER_LEVER_STATE.NOT_APPLIED));
  assert.equal(notApplied.appliedCount, 0);

  // Gain applied on the rear pair only.
  const gainApplied = instances().map((instance) => (
    instance.legacyGroup === 'rear' ? { ...instance, gainDb: -2 } : instance
  ));
  const partial = resolveOptimiserPlanStatus({ plan, currentDesignFingerprint: DESIGN_FP, instances: gainApplied });
  const gainLever = partial.levers.find((lever) => lever.key === OPTIMISER_LEVER.GAIN);
  const delayLever = partial.levers.find((lever) => lever.key === OPTIMISER_LEVER.DELAY);
  assert.equal(gainLever.state, OPTIMISER_LEVER_STATE.APPLIED);
  assert.equal(delayLever.state, OPTIMISER_LEVER_STATE.NOT_APPLIED, 'other levers must not read Applied');
  assert.equal(partial.appliedCount, 1);
});

check('TEST 5 — a disabled lever stays Disabled across restore', () => {
  resetOptimiserPlanAuthority('p2', 'v1');
  setOptimiserPlanAuthority('p2', 'v1', serializeOptimiserPlan(buildPlan()));
  setOptimiserLeverDecision('p2', 'v1', OPTIMISER_LEVER.POLARITY, true);
  const disabledPlan = getOptimiserPlanAuthority('p2', 'v1');
  assert.equal(disabledPlan.leverDecisions.polarity.disabled, true, 'the decision is saved on the plan');

  const restored = hydrateOptimiserPlan('p3', 'v1', disabledPlan);
  const view = resolveOptimiserPlanStatus({ plan: restored, currentDesignFingerprint: DESIGN_FP, instances: instances() });
  const polarity = view.levers.find((lever) => lever.key === OPTIMISER_LEVER.POLARITY);
  assert.equal(polarity.state, OPTIMISER_LEVER_STATE.DISABLED);
  assert.equal(view.disabledCount, 1);
});

check('TEST 6 — levers whose subwoofers disappeared are No longer applicable', () => {
  const plan = serializeOptimiserPlan(buildPlan());
  const replaced = instances().map((instance) => ({ ...instance, id: `${instance.id}-new` }));
  const view = resolveOptimiserPlanStatus({ plan, currentDesignFingerprint: DESIGN_FP, instances: replaced });
  assert.ok(view.levers.every((lever) => lever.state === OPTIMISER_LEVER_STATE.NO_LONGER_APPLICABLE));
  assert.equal(view.appliedCount, 0);
});

check('TEST 7 — a combined-only candidate persists that fact', () => {
  const plan = buildOptimiserPlan({
    selection: { winner: combinedWinner(), currentResult: baseline(), confirmedResults: [] },
    identity: { designFingerprint: DESIGN_FP, resultFingerprint: RESULT_FP },
    instances: instances(),
  });
  assert.ok(plan);
  assert.equal(plan.individualEffectsEvaluated, false);
  assert.equal(plan.levers.polarity.evaluated, false);
  assert.ok(plan.notes.some((note) => /individual lever effects were not evaluated/i.test(note)));
  assert.ok(plan.combined.effect, 'the combined candidate keeps its own evaluated effect');
});

check('TEST 8 — no lever borrows the combined candidate improvement', () => {
  const plan = buildPlan();
  const combined = plan.combined.effect.p20DeltaDb;
  assert.equal(combined, Math.round((7.4 - 17.02) * 100) / 100);
  const delayLever = plan.levers[OPTIMISER_LEVER.DELAY];
  const gainLever = plan.levers[OPTIMISER_LEVER.GAIN];
  const polarityLever = plan.levers[OPTIMISER_LEVER.POLARITY];
  assert.equal(delayLever.effect.p20DeltaDb, Math.round((15.0 - 17.02) * 100) / 100, 'delay uses its own evaluation');
  assert.equal(gainLever.effect.p20DeltaDb, Math.round((16.1 - 17.02) * 100) / 100, 'gain uses its own evaluation');
  assert.equal(polarityLever.effect, null, 'polarity has no individual evaluation');
  assert.equal(polarityLever.evaluated, false);
  assert.match(resolveOptimiserPlanStatus({ plan, currentDesignFingerprint: DESIGN_FP, instances: instances() })
    .levers.find((lever) => lever.key === OPTIMISER_LEVER.POLARITY).effectLabel, /not yet evaluated/i);
});

check('TEST 9 — the published payload carries the same plan (proposal / history / duplicate)', () => {
  const plan = serializeOptimiserPlan(buildPlan());
  const completedBassAuthority = { contract: { recommendation: { optimiserPlan: plan } } };
  const published = readPublishedOptimiserPlan(completedBassAuthority);
  assert.deepEqual(published, plan);
  assert.equal(readPublishedOptimiserPlan({ contract: {} }), null);
});

if (failures) { console.error(`\n${failures} failing`); process.exit(1); }
console.log('\nAll optimiser plan persistence checks passed.');