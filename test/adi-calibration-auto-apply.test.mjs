/**
 * adi-calibration-auto-apply.test.mjs
 * ---------------------------------------------------------------------------
 * The rule under test: ADI may apply a CALIBRATION change on its own — delay,
 * front/rear group delay, rear-sub acoustic delay offset, gain trim, polarity,
 * all-pass phase — when the confirmed canonical P19/P20 results support it, and
 * it may NEVER apply a PHYSICAL change (subwoofer movement, seating movement,
 * layout, product) or a calibration that materially worsens an objective or
 * overwrites calibration a human set by hand.
 *
 * Front/rear sub test case: a +2 ms rear-group delay improves P20 from L1 to a
 * better level while P19 is unchanged. The decision must apply it. The best P20
 * candidate, which damages P19, must be HELD with the trade-off stated.
 *
 * Run: node test/adi-calibration-auto-apply.test.mjs
 */

import assert from 'node:assert/strict';
import { gradeP20FromRaw } from '../src/components/room/bass/completedBassResultPersistence.js';
import { selectCanonicalObjectives } from '../src/components/room/bass/improveBassV2/canonicalObjectiveSelection.js';
import { createGroupedDelayCandidate } from '../src/components/room/bass/improveBassV2/groupedDelaySearch.js';
import { applyCalibrationTuning } from '../src/components/room/bass/improveBassV2/improveBassV2ApplyCalibration.js';
import { computeCalibrationFingerprint } from '../src/components/room/bass/bassAnalysisFingerprints.js';
import {
  getAppliedCalibrationAuthority,
  markAppliedCalibrationOptimiserGenerated,
  resetAppliedCalibrationAuthority,
} from '../src/components/room/bass/appliedCalibrationAuthority/appliedCalibrationAuthorityStore.js';
import { serializeAppliedCalibration } from '../src/components/room/bass/appliedCalibrationAuthority/appliedCalibrationPersistence.js';
import {
  ADI_APPLIED_CALIBRATION_TITLE,
  CALIBRATION_APPLY_DECISION,
  CALIBRATION_APPLY_REASON,
  MATERIAL_DAMAGE_DB,
  NO_USEFUL_CALIBRATION_IMPROVEMENT,
  buildCalibrationSettings,
  buildDesignChangeRecommendations,
  describeRearGroupOffset,
  resolveCalibrationAutoApply,
} from '../src/components/room/bass/optimiseWorkflow/adiCalibrationAutoApplyAuthority.js';

// ── Fixtures ─────────────────────────────────────────────────────────────

const SEATS = ['seat-left', 'seat-right'];

/** A graded per-seat P20 row: the level is derived from the raw deviation. */
function p20Row(seatId, raw) {
  return { seatId, variationDbRaw: raw, level: `L${gradeP20FromRaw(raw)}`, isPrimary: true };
}

function confirmedResult({ id, p19, p19Level = 'L4', p20, tuning = [], kind = null, seats = true, movement = {} }) {
  return {
    candidateId: id,
    candidateKind: kind || (id === 'current' ? 'current' : 'calibration'),
    appliedTuning: tuning,
    achievedP19VariationDb: p19,
    achievedP19Level: p19Level,
    achievedP20VariationDb: p20,
    achievedP20Level: `L${gradeP20FromRaw(p20)}`,
    perSeatP20: seats ? SEATS.map((seat) => p20Row(seat, p20)) : [],
    perSeatP19: [],
    worstSeatId: SEATS[1],
    ...movement,
  };
}

const tuning = ({ rearMs = 0, frontMs = 0, gainDb = 0, polarity = 1, phaseDeg = 0 } = {}) => ([
  { sourceId: 'sub-front', delayMs: frontMs, gainDb, polarity, phaseControlDeg: phaseDeg },
  { sourceId: 'sub-rear', delayMs: rearMs, gainDb, polarity, phaseControlDeg: phaseDeg },
]);

const instances = () => ([
  { id: 'sub-front', enabled: true, model: 'SUB3-12', legacyGroup: 'front', position: { x: 2.0, y: 0.4 }, bottomHeightM: 0.3, rotationDeg: 0, delayMs: 0, gainDb: 0, polarity: 1, phaseControlDeg: 0 },
  { id: 'sub-rear', enabled: true, model: 'SUB3-12', legacyGroup: 'rear', position: { x: 2.0, y: 5.6 }, bottomHeightM: 0.3, rotationDeg: 0, delayMs: 0, gainDb: 0, polarity: 1, phaseControlDeg: 0 },
]);

const baseline = () => confirmedResult({ id: 'current', p19: 4.1, p19Level: 'L4', p20: 6.0 });
const rearDelayCandidate = (ms = 2) => confirmedResult({ id: 'cal-balanced', p19: 4.1, p19Level: 'L4', p20: 4.6, tuning: tuning({ rearMs: ms }) });
// A material P19 improvement (1.3 dB, above the canonical 1.0 dB gate) with P20
// left unharmed: this is the balanced candidate the decision may apply.
const bestP19Candidate = () => confirmedResult({ id: 'cal-p19', p19: 2.8, p19Level: 'L4', p20: 5.9, tuning: tuning({ rearMs: 1 }) });
const damagingCandidate = () => confirmedResult({ id: 'cal-p20', p19: 6.2, p19Level: 'L3', p20: 3.6, tuning: tuning({ rearMs: 3 }) });
const immaterialCandidate = () => confirmedResult({ id: 'cal-tiny', p19: 4.1, p19Level: 'L4', p20: 5.95, tuning: tuning({ rearMs: 0.5 }) });

const decisionFor = (candidate, extra = {}) => resolveCalibrationAutoApply({
  baseline: baseline(),
  candidate,
  objectives: selectCanonicalObjectives({ candidates: [rearDelayCandidate(), bestP19Candidate(), damagingCandidate()], baseline: baseline() }),
  instances: instances(),
  appliedCalibration: null,
  ...extra,
});

// ── Reporting ────────────────────────────────────────────────────────────

const results = [];
function check(item, fn) {
  try {
    const note = fn();
    results.push([item, 'PASS', note || '']);
  } catch (error) {
    results.push([item, 'FAIL', error.message]);
  }
}

// ── 1. Safe calibration changes identified ───────────────────────────────

check('SAFE CALIBRATION CHANGES IDENTIFIED', () => {
  const settings = buildCalibrationSettings(instances(), tuning({ rearMs: 2, gainDb: -1.5, polarity: -1, phaseDeg: 90 }));
  assert.ok(settings.length >= 4, `expected every changed setting, got ${settings.length}`);
  const delay = settings.find((s) => s.setting === 'Delay');
  assert.equal(delay.label, 'Sub 2 (rear)');
  assert.equal(delay.from, '0 ms');
  assert.equal(delay.to, '2 ms');
  assert.ok(settings.some((s) => s.setting === 'Gain trim'));
  assert.ok(settings.some((s) => s.setting === 'Polarity'));
  assert.ok(settings.some((s) => s.setting === 'All-pass phase'));
  // Nothing physical is ever a "setting".
  assert.ok(!settings.some((s) => /position|seat|model|count/i.test(s.setting)));
  return `${settings.length} settings, delay ${delay.from} → ${delay.to}`;
});

// ── 2. Rear delay candidates: signed offsets + no change ─────────────────

check('REAR DELAY CANDIDATES TESTED', () => {
  const grouping = { groups: [{ id: 'A', role: 'front', sourceIds: ['sub-front'] }, { id: 'B', role: 'rear', sourceIds: ['sub-rear'] }] };
  const base = tuning();
  const rearLater = createGroupedDelayCandidate(grouping, base, 'B', 2);
  const rearEarlier = createGroupedDelayCandidate(grouping, base, 'A', 2);
  const noChange = createGroupedDelayCandidate(grouping, base, 'B', 0);
  assert.equal(rearLater.effectiveOffsetMs, 2, 'rear group later must be +2 ms');
  assert.equal(rearEarlier.effectiveOffsetMs, -2, 'front group later means the rear group is earlier');
  assert.equal(noChange.id, 'current');
  assert.equal(noChange.effectiveOffsetMs, 0);
  // The applied change is stated with its sign, from the applied settings.
  const offset = describeRearGroupOffset(buildCalibrationSettings(instances(), tuning({ rearMs: 2 })));
  assert.match(offset, /\+2 ms/);
  assert.match(offset, /rear group later/);
  const earlier = describeRearGroupOffset(buildCalibrationSettings(instances(), tuning({ frontMs: 2 })));
  assert.match(earlier, /rear group earlier/);
  return 'later, earlier and no-change all evaluated; +2 ms stated';
});

// ── 3-5. The three objectives ────────────────────────────────────────────

const objectives = () => selectCanonicalObjectives({
  candidates: [rearDelayCandidate(), bestP19Candidate(), damagingCandidate()],
  baseline: baseline(),
});

check('BEST P19 CANDIDATE IDENTIFIED', () => {
  const found = objectives();
  assert.equal(found.bestCanonicalP19.candidateId, 'cal-p19');
  assert.equal(found.values.bestP19.p19, 2.8);
  return `best P19 = ${found.bestCanonicalP19.candidateId} at ${found.values.bestP19.p19} dB`;
});

check('BEST P20 CANDIDATE IDENTIFIED', () => {
  const found = objectives();
  assert.equal(found.bestCanonicalP20.candidateId, 'cal-p20');
  assert.equal(found.values.bestP20.p20, 3.6);
  return `best P20 = ${found.bestCanonicalP20.candidateId} at ${found.values.bestP20.p20} dB`;
});

check('BALANCED CANDIDATE IDENTIFIED', () => {
  const found = objectives();
  assert.ok(found.bestCanonicalBalanced, 'a balanced candidate must be named');
  assert.equal(found.values.balanced.damages, false, 'the balanced candidate must damage neither objective');
  const balanced = found.bestCanonicalBalanced;
  assert.ok(balanced.achievedP19VariationDb <= 4.1 + MATERIAL_DAMAGE_DB);
  assert.ok(balanced.achievedP20VariationDb <= 6.0 + MATERIAL_DAMAGE_DB);
  // The decision names it as the balanced candidate and uses the spec's own
  // wording for it.
  const decision = decisionFor(balanced);
  assert.equal(decision.objective, 'balanced');
  assert.equal(decision.objectiveLabel, 'balanced acoustic-delay');
  assert.equal(decision.reason, CALIBRATION_APPLY_REASON.BEST_BALANCED);
  assert.match(decision.statement, /ADI applied the balanced acoustic-delay candidate/);
  return `balanced = ${balanced.candidateId}; ${decision.statement}`;
});

// ── 6. A safe delay improvement is applied ───────────────────────────────

check('SAFE DELAY IMPROVEMENT AUTO-APPLIED', () => {
  const decision = decisionFor(rearDelayCandidate());
  assert.equal(decision.decision, CALIBRATION_APPLY_DECISION.APPLIED);
  assert.ok(
    [CALIBRATION_APPLY_REASON.BEST_BALANCED, CALIBRATION_APPLY_REASON.IMPROVES_ONE_WITHOUT_DAMAGE].includes(decision.reason),
    `unexpected reason ${decision.reason}`,
  );
  assert.equal(decision.before.p20.deviationDb, 6.0);
  assert.equal(decision.after.p20.deviationDb, 4.6);
  assert.equal(decision.improvement.p20Improved, true);
  assert.equal(decision.damage.any, false);
  assert.match(decision.statement, /ADI applied the .*candidate/);
  assert.match(decision.statement, /Predicted P20 from/);
  assert.equal(decision.inRoomNote, 'Predicted calibration starting point — confirm in-room after installation.');
  // The applied tuning is the ONLY thing this decision carries.
  const serialized = JSON.stringify(decision);
  ['coordinates', 'positionCoordinates', 'seatPositions', 'positions'].forEach((key) => {
    assert.ok(!serialized.includes(`"${key}"`), `decision must carry no ${key}`);
  });
  return decision.statement;
});

// ── 7-8. Gain and polarity where safe ────────────────────────────────────

check('GAIN IMPROVEMENT AUTO-APPLIED WHERE SAFE', () => {
  const candidate = confirmedResult({ id: 'cal-gain', p19: 4.1, p19Level: 'L4', p20: 4.8, tuning: tuning({ gainDb: -2 }) });
  const decision = decisionFor(candidate);
  assert.equal(decision.decision, CALIBRATION_APPLY_DECISION.APPLIED);
  assert.ok(decision.settings.some((s) => s.setting === 'Gain trim' && s.to === '-2 dB'));
  return 'gain trim −2 dB applied';
});

check('POLARITY IMPROVEMENT AUTO-APPLIED WHERE SAFE', () => {
  const candidate = confirmedResult({ id: 'cal-polarity', p19: 4.0, p19Level: 'L4', p20: 4.4, tuning: tuning({ polarity: -1 }) });
  const decision = decisionFor(candidate);
  assert.equal(decision.decision, CALIBRATION_APPLY_DECISION.APPLIED);
  assert.ok(decision.settings.some((s) => s.setting === 'Polarity' && s.to === 'Inverted'));
  return 'polarity inverted on both subwoofers';
});

// ── 9-10. Physical changes are never applied ─────────────────────────────

check('PHYSICAL SUB MOVES NOT AUTO-APPLIED', () => {
  const moved = confirmedResult({
    id: 'pos-rear-quarter',
    p19: 4.0, p19Level: 'L4', p20: 4.2,
    tuning: tuning({ rearMs: 2 }),
    kind: 'positions',
    movement: { positionCoordinates: [{ x: 1.2, y: 5.6 }, { x: 2.8, y: 5.6 }] },
  });
  const decision = decisionFor(moved);
  const serialized = JSON.stringify(decision);
  assert.ok(!serialized.includes('positionCoordinates'), 'the apply path must never carry coordinates');
  assert.ok(!serialized.includes('"positions"'), 'the apply path must never carry positions');
  const changes = buildDesignChangeRecommendations({ baseline: baseline(), subPositionResult: moved });
  assert.equal(changes.length, 1);
  assert.equal(changes[0].applied, false);
  assert.match(changes[0].statement, /has not been applied/);
  // Applying the tuning leaves every position byte-identical.
  const before = instances();
  const after = applyCalibrationTuning(before, moved.appliedTuning, null);
  after.forEach((instance, index) => assert.deepEqual(instance.position, before[index].position));
  assert.equal(after[1].delayMs, 2);
  return changes[0].statement;
});

check('SEAT MOVES NOT AUTO-APPLIED', () => {
  const moved = confirmedResult({
    id: 'seating-row-2',
    p19: 4.1, p19Level: 'L4', p20: 4.0,
    kind: 'seating',
    movement: { seatPositions: [{ id: SEATS[0], x: 1.8, y: 4.2 }, { id: SEATS[1], x: 2.4, y: 4.2 }] },
  });
  const changes = buildDesignChangeRecommendations({ baseline: baseline(), seatingResult: moved });
  assert.equal(changes.length, 1);
  assert.equal(changes[0].key, 'seating');
  assert.equal(changes[0].applied, false);
  assert.match(changes[0].statement, /has not been applied/);
  const decision = decisionFor(moved);
  assert.ok(!JSON.stringify(decision).includes('seatPositions'));
  return changes[0].statement;
});

// ── 11-15. What must never be applied ───────────────────────────────────

check('P19 DAMAGE HELD FOR APPROVAL, NOT APPLIED', () => {
  const decision = decisionFor(damagingCandidate());
  assert.equal(decision.decision, CALIBRATION_APPLY_DECISION.HOLD);
  assert.equal(decision.reason, CALIBRATION_APPLY_REASON.P19_DAMAGED);
  assert.equal(decision.damage.p19Damaged, true);
  assert.equal(decision.damage.p19WorseDb, 2.1);
  assert.match(decision.statement, /trade-off/);
  assert.match(decision.statement, /has not been applied/);
  assert.match(decision.statement, /approval/);
  return decision.statement;
});

check('P20 DAMAGE HELD FOR APPROVAL, NOT APPLIED', () => {
  const candidate = confirmedResult({ id: 'cal-p19-only', p19: 3.4, p19Level: 'L4', p20: 7.2, tuning: tuning({ rearMs: 1 }) });
  const decision = decisionFor(candidate);
  assert.equal(decision.decision, CALIBRATION_APPLY_DECISION.HOLD);
  assert.equal(decision.reason, CALIBRATION_APPLY_REASON.P20_DAMAGED);
  assert.equal(decision.damage.p20Damaged, true);
  return `held: P20 worsened by ${decision.damage.p20WorseDb} dB`;
});

check('IMMATERIAL IMPROVEMENT NOT APPLIED', () => {
  const decision = decisionFor(immaterialCandidate());
  assert.equal(decision.decision, CALIBRATION_APPLY_DECISION.NONE);
  assert.equal(decision.reason, CALIBRATION_APPLY_REASON.NOT_MATERIAL);
  assert.equal(decision.statement, NO_USEFUL_CALIBRATION_IMPROVEMENT);
  assert.equal(decision.tuning.length, 2, 'the candidate is still stated, it is simply not applied');
  return decision.statement;
});

check('AMBIGUOUS EVIDENCE HELD, NOT APPLIED', () => {
  const candidate = confirmedResult({ id: 'cal-noseats', p19: 4.1, p19Level: 'L4', p20: 4.6, tuning: tuning({ rearMs: 2 }), seats: false });
  const decision = decisionFor(candidate);
  assert.equal(decision.decision, CALIBRATION_APPLY_DECISION.HOLD);
  assert.equal(decision.reason, CALIBRATION_APPLY_REASON.AMBIGUOUS_EVIDENCE);
  return decision.statement;
});

check('HAND-SET CALIBRATION NOT OVERWRITTEN', () => {
  const decision = decisionFor(rearDelayCandidate(), {
    appliedCalibration: { source: 'Manual Entry', status: 'User Modified', values: tuning() },
  });
  assert.equal(decision.decision, CALIBRATION_APPLY_DECISION.HOLD);
  assert.equal(decision.reason, CALIBRATION_APPLY_REASON.HUMAN_CALIBRATION);
  assert.match(decision.statement, /set by hand/);
  return decision.statement;
});

check('ALREADY-APPLIED CALIBRATION NOT RE-APPLIED', () => {
  const applied = applyCalibrationTuning(instances(), rearDelayCandidate().appliedTuning, null);
  const decision = decisionFor(rearDelayCandidate(), { instances: applied });
  assert.equal(decision.decision, CALIBRATION_APPLY_DECISION.NONE);
  assert.equal(decision.reason, CALIBRATION_APPLY_REASON.ALREADY_APPLIED);
  return decision.statement;
});

check('NO CANDIDATE STATES NO USEFUL IMPROVEMENT', () => {
  const decision = resolveCalibrationAutoApply({ baseline: baseline(), candidate: null, instances: instances() });
  assert.equal(decision.decision, CALIBRATION_APPLY_DECISION.NONE);
  assert.equal(decision.statement, NO_USEFUL_CALIBRATION_IMPROVEMENT);
  return decision.statement;
});

// ── 16-17. Fingerprint and authority ────────────────────────────────────

check('FINGERPRINT INCLUDES APPLIED SETTINGS', () => {
  const geometry = { roomDims: { widthM: 4.5, lengthM: 6.0, heightM: 2.4 }, seatingPositions: [] };
  const sourcesOf = (list) => list.map((instance) => ({
    id: instance.id,
    x: instance.position.x,
    y: instance.position.y,
    z: instance.bottomHeightM,
    modelKey: instance.model,
    rotationDeg: instance.rotationDeg,
    tuning: {
      delayMs: instance.delayMs,
      gainDb: instance.gainDb,
      polarity: instance.polarity,
      phaseControlDeg: instance.phaseControlDeg,
    },
  }));
  const before = instances();
  const after = applyCalibrationTuning(before, rearDelayCandidate().appliedTuning, null);
  const fpBefore = computeCalibrationFingerprint({ ...geometry, sources: sourcesOf(before) });
  const fpAfter = computeCalibrationFingerprint({ ...geometry, sources: sourcesOf(after) });
  const fpSame = computeCalibrationFingerprint({ ...geometry, sources: sourcesOf(before) });
  assert.notEqual(fpBefore, fpAfter, 'applying calibration must change the calculation fingerprint');
  assert.equal(fpBefore, fpSame, 'the fingerprint must be deterministic');
  after.forEach((instance, index) => assert.deepEqual(instance.position, before[index].position));
  return `${fpBefore.slice(0, 12)}… → ${fpAfter.slice(0, 12)}…`;
});

check('APPLIED SETTINGS BECOME THE BASS AUTHORITY', () => {
  const projectId = 'project:adi-apply';
  const versionId = 'version:1';
  const values = rearDelayCandidate().appliedTuning.map((t) => ({
    id: String(t.sourceId), delayMs: t.delayMs, gainDb: t.gainDb, polarity: t.polarity, phaseControlDeg: t.phaseControlDeg,
  }));
  resetAppliedCalibrationAuthority(projectId, versionId);
  markAppliedCalibrationOptimiserGenerated(projectId, versionId, {
    basisFingerprint: 'calbasis:v1:test',
    candidateId: 'cal-balanced',
    values,
  });
  const authority = getAppliedCalibrationAuthority(projectId, versionId);
  assert.equal(authority.status, 'Optimiser Generated');
  assert.equal(authority.source, 'Bass Optimiser');
  assert.equal(authority.values.find((v) => v.id === 'sub-rear').delayMs, 2);
  const persisted = serializeAppliedCalibration(authority);
  assert.equal(persisted.values.find((v) => v.id === 'sub-rear').delayMs, 2);
  assert.equal(persisted.basisFingerprint, 'calbasis:v1:test');
  resetAppliedCalibrationAuthority(projectId, versionId);
  return 'authority holds the applied tuning and persists it';
});

check('NO P19/P20 SCORING THRESHOLD CHANGED', () => {
  // The damage threshold is the canonical balanced threshold, re-exported — not
  // a new one, and no level boundary is re-derived anywhere in this module.
  assert.equal(MATERIAL_DAMAGE_DB, 1.0);
  assert.equal(ADI_APPLIED_CALIBRATION_TITLE, 'ADI Applied Bass Calibration');
  return 'thresholds read from the canonical authority, unchanged';
});

// ── Report ──────────────────────────────────────────────────────────────

const failed = results.filter(([, status]) => status === 'FAIL');
results.forEach(([item, status, note]) => {
  console.log(`${status}  ${item}${note ? `  — ${note}` : ''}`);
});
console.log('');
console.log(`${results.length - failed.length}/${results.length} PASS`);
if (failed.length) process.exitCode = 1;