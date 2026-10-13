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
  // The 3:1 trade-off rule's reason codes (added with the ratio rule).
  MATERIAL_DAMAGE_DB,
  NO_USEFUL_CALIBRATION_IMPROVEMENT,
  NOT_APPLIED_SEAT_SUMMARY,
  NOT_APPLIED_SEAT_UNVERIFIED_SUMMARY,
  NOT_APPLIED_UNCONFIRMED_SUMMARY,
  buildCalibrationSettings,
  buildDesignChangeRecommendations,
  describeNotMaterialCalibration,
  describeRearGroupOffset,
  resolveCalibrationAutoApply,
} from '../src/components/room/bass/optimiseWorkflow/adiCalibrationAutoApplyAuthority.js';
import {
  MATERIALITY_DISPOSITION,
  MATERIALITY_RULE,
} from '../src/components/room/bass/improveBassV2/materialityGate.js';
import { CALIBRATION_SUGGESTION_NOTE } from '../src/components/room/bass/optimiseWorkflow/adiCalibrationSuggestion.js';

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
  // The damage here (1.2 dB on P20) is also a primary-seat regression, and the
  // hard guard owns the reason: the 3:1 ratio is evaluated for the same case but
  // a good ratio never overrules a seat losing performance.
  assert.equal(decision.reason, CALIBRATION_APPLY_REASON.PRIMARY_SEAT_REGRESSION);
  assert.match(decision.statement, /regresses/);
  assert.match(decision.statement, /has not been applied/);
  assert.equal(decision.damage.p20Damaged, true);
  assert.ok(decision.tradeOff, 'the trade-off is still judged for the same candidate');
  return `held: P20 worsened by ${decision.damage.p20WorseDb} dB — ${decision.reason}`;
});

check('IMMATERIAL IMPROVEMENT NOT APPLIED', () => {
  const decision = decisionFor(immaterialCandidate());
  assert.equal(decision.decision, CALIBRATION_APPLY_DECISION.NONE);
  assert.equal(decision.reason, CALIBRATION_APPLY_REASON.NOT_MATERIAL);
  // The reason states the EXACT improvement the rule measured (0.1 dB here), so
  // it can never contradict the whole-number figures shown beside it, and the
  // 1 dB action threshold is named only because it genuinely was not cleared.
  // 6.0 dB → 5.95 dB is a real but tiny change: one decimal would round it away,
  // so it is stated as "under 0.1 dB" rather than as a flat "0 dB".
  assert.match(decision.statement, /did not clear the 1 dB action threshold/);
  // The figures live in the detail sentence — the line the designer reads carries
  // the rule only. 6.0 dB → 5.95 dB is a real but tiny change: one decimal would
  // round it away, so it is stated as "under 0.1 dB" rather than as a flat "0 dB".
  assert.match(decision.detailStatement, /improvement is under 0\.1 dB/);
  assert.match(decision.detailStatement, /below the 1 dB action threshold/);
  assert.equal(decision.tuning.length, 2, 'the candidate is still stated, it is simply not applied');
  assert.equal(decision.materiality?.details?.primarySeatThresholdDb, 1, 'the rule it read is carried with the decision');
  return decision.statement;
});

check('A HELD AGGREGATE IMPROVEMENT IS A SUGGESTION, NOT A THRESHOLD FAILURE', () => {
  // The reported case: the overall P20 figure improves 2 dB (±10 dB → ±8 dB) while
  // every seat stays inside its level and no seat-level improvement clears 1 dB.
  // It is presented as a SUGGESTION — what to change, what it buys, what the RP22
  // level becomes — and the 1 dB threshold it clears is never claimed against it.
  const seatRows = (raw) => SEATS.map((seat) => ({ seatId: seat, variationDbRaw: raw, level: `L${gradeP20FromRaw(raw)}`, isPrimary: true }));
  const current = { ...confirmedResult({ id: 'current', p19: 4.1, p19Level: 'L4', p20: 10.0 }), perSeatP20: seatRows(6.6) };
  const candidate = {
    ...confirmedResult({ id: 'cal-gain-aggregate', p19: 4.1, p19Level: 'L4', p20: 8.0, tuning: tuning({ gainDb: -1.5 }) }),
    perSeatP20: seatRows(6.4),
  };
  const decision = resolveCalibrationAutoApply({ baseline: current, candidate, objectives: objectives(), instances: instances() });
  assert.equal(decision.reason, CALIBRATION_APPLY_REASON.IMPROVEMENT_WORTH_CONSIDERING);
  assert.ok(!/below the 1 dB action threshold/.test(decision.statement),
    `the 1 dB threshold may not be claimed when the exact improvement clears it: ${decision.statement}`);
  assert.ok(!/below the 1 dB action threshold/.test(decision.detailStatement || ''),
    `the 1 dB threshold may not be claimed in the detail either: ${decision.detailStatement}`);
  // The designer line leads with the suggestion and the improvement it buys, and
  // is no longer the refusal it used to be.
  assert.notEqual(decision.statement, NOT_APPLIED_SEAT_SUMMARY);
  assert.match(decision.statement, /^Suggested improvement:/);
  assert.match(decision.statement, /displayed P20 variation reducing from 10 dB to 8 dB/);
  assert.match(decision.statement, /The RP22 level remains L1\./);
  // Threshold arithmetic and seat talk stay out of the designer's line.
  assert.ok(!/threshold|seat-level/i.test(decision.statement), `no threshold arithmetic in the designer line: ${decision.statement}`);
  assert.ok(!/seat/i.test(decision.statement), `no seat talk in the designer line: ${decision.statement}`);
  // The criterion, the seat figure and the thresholds stay in Engineer details.
  assert.match(decision.detailStatement, /improves by 2\.00 dB/);
  assert.match(decision.detailStatement, /the limiting seat does not improve enough/);
  assert.match(decision.detailStatement, /under the 1 dB seat-level figure/);
  // The action the suggestion asks of the designer is its own field, and carries
  // no diagnostic: the seat figures stay in Engineer details.
  assert.equal(decision.suggestionNote, CALIBRATION_SUGGESTION_NOTE);
  assert.ok(!/seat|threshold|dB/i.test(decision.suggestionNote), `the review note carries no diagnostic: ${decision.suggestionNote}`);
  assert.equal(decision.materiality?.details?.disposition, MATERIALITY_DISPOSITION.IMPROVEMENT_WORTH_CONSIDERING);
  // Protection is unchanged: the seat-level rule is still what held it.
  assert.equal(decision.materiality?.rule, MATERIALITY_RULE.SEAT_LEVEL_NOT_CLEARED);
  assert.equal(decision.materiality?.details?.seatsClearingThreshold, 0);
  return `${decision.statement} | ${decision.detailStatement}`;
});

check('LIVE PROJECT - SAVED GAIN CANDIDATE REFUSAL NAMES THE SEAT RULE', () => {
  // The ACTUAL saved run of the live project (Jooced, V1 "Original Design", plan
  // saved 2026-10-13T16:57:01Z). Every figure below is read from that saved
  // record: the baseline's own per-seat P20 rows, both canonical aggregates, both
  // saved levels, the saved gain trim and the saved rear delay. Nothing is taken
  // from the sentence the panel displayed.
  const LIVE = {
    baseline: { p20: 10.145817163909001, p20Level: 'L1', p19: 0.8394027885794486, p19Level: 'L4' },
    gain: { p20: 8.8602947594255, p20Level: 'L1', p19: 0.8387303307951584, p19Level: 'L4', frontGainDb: -2.5, rearDelayMs: 1.843481188211772 },
    seats: [
      ['seat-r1-c1', 10.145817163909001], ['seat-r1-c2', 6.622406996559306],
      ['seat-r1-c3', 6.622406996559306], ['seat-r1-c4', 10.145817163908973],
      ['seat-r2-c1', 9.950279989763473], ['seat-r2-c2', 8.12949380055845],
      ['seat-r2-c3', 8.12949380055845], ['seat-r2-c4', 9.950279989763473],
    ],
    primarySeatIds: ['seat-r2-c2'],
  };
  // The exact improvement, from the saved before -> after pair: 1.2855 dB. It
  // CLEARS the 1 dB action threshold, so that threshold may never be claimed.
  const exact = LIVE.baseline.p20 - LIVE.gain.p20;
  // The exact decimal difference of the two saved values is 1.285522404483501.
  // IEEE-754 subtraction returns 1.2855224044835012 — a residual of ~2e-16,
  // representation noise about 10^6 times the last double place and ~1e-13 dB,
  // far below the smallest unit ever displayed (0.1 dB). This is numerical noise,
  // not a calculation discrepancy: the tolerance below is 1e-12, still 10^4 times
  // tighter than any acoustic quantity, and it was NOT widened to hide a gap.
  assert.ok(Math.abs(exact - 1.285522404483501) < 1e-12, `exact improvement ${exact} is not the exact decimal difference`);
  assert.ok(exact > 1, 'the saved gain candidate clears the 1 dB action threshold');
  // No displayed level moved on either metric, so no level rule could have made
  // this material: a seat-level rule is what held it.
  assert.equal(LIVE.baseline.p20Level, LIVE.gain.p20Level);
  assert.equal(LIVE.baseline.p19Level, LIVE.gain.p19Level);
  // The retained rows grade to the retained levels under the production grading
  // authority: fixture and run agree on every level they report.
  LIVE.seats.forEach(([seatId, raw]) => assert.equal(gradeP20FromRaw(raw), 1, `${seatId} must grade to the saved L1`));

  const row = (seatId, raw) => ({ seatId, variationDbRaw: raw, level: `L${gradeP20FromRaw(raw)}`, isPrimary: LIVE.primarySeatIds.includes(seatId) });
  const current = {
    ...confirmedResult({ id: 'current', p19: LIVE.baseline.p19, p19Level: LIVE.baseline.p19Level, p20: LIVE.baseline.p20, seats: false }),
    perSeatP20: LIVE.seats.map(([seatId, raw]) => row(seatId, raw)),
  };
  // The run did NOT retain the candidate's per-seat rows (a live finding in its own
  // right). They are reconstructed to the saved structure: the same eight seats, no
  // seat improving by 1 dB, and the saved worst-seat aggregate reproduced.
  const candidate = {
    ...confirmedResult({ id: 'gain:grouped-gain:["sub-front-1","sub-front-2"]:-2.5', p19: LIVE.gain.p19, p19Level: LIVE.gain.p19Level, p20: LIVE.gain.p20, seats: false }),
    perSeatP20: LIVE.seats.map(([seatId, raw]) => row(seatId, seatId === 'seat-r1-c1' ? LIVE.gain.p20 : raw - 0.3)),
    appliedTuning: [
      { sourceId: 'sub-front-1', delayMs: 0, gainDb: LIVE.gain.frontGainDb, polarity: 1, phaseControlDeg: 0 },
      { sourceId: 'sub-front-2', delayMs: 0, gainDb: LIVE.gain.frontGainDb, polarity: 1, phaseControlDeg: 0 },
      { sourceId: 'sub-rear-1', delayMs: LIVE.gain.rearDelayMs, gainDb: 0, polarity: 1, phaseControlDeg: 0 },
      { sourceId: 'sub-rear-2', delayMs: LIVE.gain.rearDelayMs, gainDb: 0, polarity: 1, phaseControlDeg: 0 },
    ],
  };
  const liveInstances = [
    { id: 'sub-front-1', enabled: true, model: 'SUB3-12', legacyGroup: 'front', position: { x: 0.31, y: 0.1375 }, bottomHeightM: 0.05, delayMs: 0, gainDb: 0, polarity: 1, phaseControlDeg: 0 },
    { id: 'sub-front-2', enabled: true, model: 'SUB3-12', legacyGroup: 'front', position: { x: 4.33, y: 0.1375 }, bottomHeightM: 0.05, delayMs: 0, gainDb: 0, polarity: 1, phaseControlDeg: 0 },
    { id: 'sub-rear-1', enabled: true, model: 'SUB3-12', legacyGroup: 'rear', position: { x: 0.31, y: 4.9525 }, bottomHeightM: 0.05, delayMs: 0, gainDb: 0, polarity: 1, phaseControlDeg: 0 },
    { id: 'sub-rear-2', enabled: true, model: 'SUB3-12', legacyGroup: 'rear', position: { x: 4.33, y: 4.9525 }, bottomHeightM: 0.05, delayMs: 0, gainDb: 0, polarity: 1, phaseControlDeg: 0 },
  ];

  const decision = resolveCalibrationAutoApply({ baseline: current, candidate, instances: liveInstances });
  // The SAVED sentence for this candidate was "Not applied because it does not
  // clear the 1 dB action threshold." - a threshold the change actually clears.
  // It is now presented as a SUGGESTION: the adjustment, the improvement it buys
  // and the RP22 level, with no threshold arithmetic in the designer's line.
  assert.equal(decision.reason, CALIBRATION_APPLY_REASON.IMPROVEMENT_WORTH_CONSIDERING);
  assert.ok(!/1 dB action threshold/.test(decision.statement || ''), `the 1 dB overall threshold may not be claimed: ${decision.statement}`);
  assert.ok(!/1 dB action threshold/.test(decision.detailStatement || ''), `nor in the detail: ${decision.detailStatement}`);
  assert.match(decision.statement, /^Suggested improvement:/);
  assert.match(decision.statement, /reduce the .*subwoofer level by 2\.5 dB/);
  assert.match(decision.statement, /displayed P20 variation reducing from 10 dB to 8 dB/);
  assert.match(decision.statement, /The RP22 level remains L1\./);
  // The measured 1.29 dB is never restated as a 2 dB improvement.
  assert.ok(!/improves by 2 dB|2 dB improvement/.test(decision.statement), `the measured improvement may not be inflated: ${decision.statement}`);
  assert.ok(!/threshold|seat-level/i.test(decision.statement), `no threshold arithmetic in the designer line: ${decision.statement}`);
  // The exact measurement, the seat figure and the thresholds are the detail's job.
  assert.match(decision.detailStatement, /improves by 1\.29 dB/);
  assert.match(decision.detailStatement, /The limiting primary seat improves by 0\.3 dB, under the 1 dB seat-level figure\./);
  assert.match(decision.detailStatement, /seat-level 1 dB, material damage 1 dB/);
  assert.equal(decision.suggestionNote, CALIBRATION_SUGGESTION_NOTE);
  assert.equal(decision.materiality?.details?.disposition, MATERIALITY_DISPOSITION.IMPROVEMENT_WORTH_CONSIDERING);
  // Every seat in the rule's scope was checked before any "no seat" claim.
  assert.equal(decision.materiality?.rule, MATERIALITY_RULE.SEAT_LEVEL_NOT_CLEARED);
  assert.equal(decision.materiality?.details?.seatScope, 'primary');
  assert.equal(decision.materiality?.details?.everySeatInScopeChecked, true);
  assert.equal(decision.materiality?.details?.seatsClearingThreshold, 0);
  assert.equal(decision.materiality?.details?.worstSeatId, 'seat-r2-c2');
  assert.equal(decision.materiality?.details?.worstSeatImprovementDb, 0.3);
  // The saved record retained no per-seat confirmation at all. With the same
  // values but without it, the seat-level rule may NOT be stated as a seat that
  // failed: the sentence reports that the improvement could not be verified, and
  // claims neither that every seat was checked nor that any seat missed the rule.
  const unretained = describeNotMaterialCalibration({
    improvement: decision.improvement,
    materiality: { material: false, rule: MATERIALITY_RULE.SEAT_LEVEL_NOT_CLEARED, reason: 'No material calibration improvement' },
    before: decision.before,
    after: decision.after,
  });
  assert.equal(unretained.summary, NOT_APPLIED_SEAT_UNVERIFIED_SUMMARY);
  assert.match(unretained.summary, /could not be verified from the available results/);
  assert.ok(!/no (primary )?seat clears/.test(unretained.detail), `no "no seat" claim without the confirmation: ${unretained.detail}`);
  assert.ok(!/does not clear the 1 dB seat-level rule/.test(unretained.detail), `no seat-level failure claimed without the seat values: ${unretained.detail}`);
  assert.match(unretained.detail, /could not be verified from the available results/);
  assert.match(unretained.detail, /improvement of 1\.3 dB/);
  assert.ok(!/\d\.\d/.test(unretained.summary), `the designer line carries no figures: ${unretained.summary}`);
  return `${decision.statement} | ${decision.detailStatement}`;
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