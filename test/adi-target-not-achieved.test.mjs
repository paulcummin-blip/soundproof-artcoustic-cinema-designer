// adi-target-not-achieved.test.mjs
// ---------------------------------------------------------------------------
// Focused test: ADI must not give false closure ("No further engineering
// changes are recommended") when the selected bass target is not achieved.
//
// Verifies:
//   1. TARGET_NOT_ACHIEVED outcome fires when all rp22Levels are 0 and no winner
//   2. TARGET_NOT_ACHIEVED fires when problem.type is CAPABILITY and no winner
//   3. TARGET_NOT_ACHIEVED fires when problem.type is EXTENSION and no winner
//   4. Genuine NO_FURTHER_ENGINEERING still works when target IS achieved
//   5. RECOMMENDATION still works when a winner exists (even if target not achieved)
//   6. buildTargetNotAchieved returns useful copy (assessment/action/why/limitation)
//   7. p18TargetHz is accepted in designObjectives
// ---------------------------------------------------------------------------

import { test, describe } from 'vitest';
import assert from 'node:assert/strict';

import { runEngineeringDecisionModel } from '@/components/adi/engineeringDecisionModel';
import { buildTargetNotAchieved } from '@/components/adi/recommendationBuilder';
import { ADI_OUTCOME } from '@/components/adi/adiConstants';
import { PROBLEM_TYPE } from '@/components/recommendationEngine/recommendationTypes';

// ── Helpers ──

function makeBaseline({ rp22Levels = { p14: 0, p18: 0, p19: 0, p20: 0 } } = {}) {
  return {
    p14AchievedDb: 0,
    achievedP18Hz: 0,
    perSeatP19: [{ seatId: 'RSP', variationDbRaw: -20, level: 0, worstFrequencyHz: 35 }],
    perSeatP20: [{ seatId: 'R1S1', variationDbRaw: -15, level: 0, worstFrequencyHz: 35 }],
    rp22Levels,
  };
}

function makeDesignObjectives({ p14TargetDb = 117, p18TargetHz = 22 } = {}) {
  return { p14TargetDb, p14Level: 4, p18TargetBasis: 'recommended', p18TargetHz };
}

describe('ADI target-not-achieved messaging', () => {

  test('1. All rp22Levels FAIL + no winner → TARGET_NOT_ACHIEVED', () => {
    const baseline = makeBaseline();
    const decision = runEngineeringDecisionModel({
      optimiserResult: { winner: null, terminalOutcome: 'no-better-evaluated', confirmedResults: [] },
      currentResult: baseline,
      designObjectives: makeDesignObjectives(),
      context: { subwooferCount: 2, roomDims: { widthM: 4.5, lengthM: 6, heightM: 2.4 }, seatingPositions: [] },
    });
    assert.equal(decision.outcome, ADI_OUTCOME.TARGET_NOT_ACHIEVED);
    assert.ok(decision.recommendation?.assessment?.length > 0);
    assert.ok(decision.recommendation?.action?.length > 0);
  });

  test('2. problem.type CAPABILITY + no winner → TARGET_NOT_ACHIEVED', () => {
    // P14 achieved is below target (but non-zero) → isCapabilityLimited fires
    const baseline = makeBaseline({ rp22Levels: { p14: 0, p18: 2, p19: 2, p20: 2 } });
    baseline.p14AchievedDb = 100; // below target of 117
    const decision = runEngineeringDecisionModel({
      optimiserResult: { winner: null, terminalOutcome: 'no-better-evaluated', confirmedResults: [] },
      currentResult: baseline,
      designObjectives: makeDesignObjectives(),
      context: { subwooferCount: 2, roomDims: { widthM: 4.5, lengthM: 6, heightM: 2.4 }, seatingPositions: [] },
    });
    assert.equal(decision.outcome, ADI_OUTCOME.TARGET_NOT_ACHIEVED);
  });

  test('3. problem.type EXTENSION + no winner → TARGET_NOT_ACHIEVED', () => {
    // P14 passes but P18 fails — extension-limited (achieved 30 Hz vs target 35 Hz)
    const baseline = makeBaseline({ rp22Levels: { p14: 3, p18: 0, p19: 2, p20: 2 } });
    baseline.p14AchievedDb = 120;  // above target → capability passes
    baseline.achievedP18Hz = 30;   // below target of 35 → extension fails
    const decision = runEngineeringDecisionModel({
      optimiserResult: { winner: null, terminalOutcome: 'no-better-evaluated', confirmedResults: [] },
      currentResult: baseline,
      designObjectives: makeDesignObjectives({ p14TargetDb: 117, p18TargetHz: 35 }),
      context: { subwooferCount: 2, roomDims: { widthM: 4.5, lengthM: 6, heightM: 2.4 }, seatingPositions: [] },
    });
    assert.equal(decision.outcome, ADI_OUTCOME.TARGET_NOT_ACHIEVED);
  });

  test('4. Target achieved + no winner → genuine NO_FURTHER_ENGINEERING preserved', () => {
    // All levels pass — target is achieved. No winner → genuine no further engineering.
    const baseline = makeBaseline({ rp22Levels: { p14: 3, p18: 3, p19: 3, p20: 3 } });
    baseline.p14AchievedDb = 120;
    baseline.achievedP18Hz = 22;
    const decision = runEngineeringDecisionModel({
      optimiserResult: {
        winner: null,
        terminalOutcome: 'no-better-evaluated',
        confirmedResults: [],
        positionOptimisation: { subOptimisationExhausted: true },
        calibrationMaterial: { material: false },
        phaseMaterial: { material: false },
        gainMaterial: { material: false },
        seatingMaterial: { material: false },
        combinedMaterial: { material: false },
      },
      currentResult: baseline,
      designObjectives: makeDesignObjectives(),
      context: { subwooferCount: 2, roomDims: { widthM: 4.5, lengthM: 6, heightM: 2.4 }, seatingPositions: [] },
    });
    assert.equal(decision.outcome, ADI_OUTCOME.NO_FURTHER_ENGINEERING);
    assert.equal(
      decision.recommendation.action,
      'No further engineering changes are recommended.',
    );
  });

  test('5. Winner exists + target not achieved → RECOMMENDATION (improvement shown)', () => {
    // Even if target is not achieved, if the optimiser found a winner, show the
    // recommendation — the improvement is still useful.
    const baseline = makeBaseline();
    const decision = runEngineeringDecisionModel({
      optimiserResult: {
        winner: {
          candidateId: 'c1',
          leverClass: 'calibration',
          result: {
            perSeatP19: [{ seatId: 'RSP', variationDbRaw: -10, level: 1 }],
            perSeatP20: [{ seatId: 'R1S1', variationDbRaw: -8, level: 1 }],
          },
        },
        confirmedResults: [{ candidateId: 'c1' }],
        terminalOutcome: null,
      },
      currentResult: baseline,
      designObjectives: makeDesignObjectives(),
      context: { subwooferCount: 2, roomDims: { widthM: 4.5, lengthM: 6, heightM: 2.4 }, seatingPositions: [] },
    });
    assert.equal(decision.outcome, ADI_OUTCOME.RECOMMENDATION);
  });

  test('6. buildTargetNotAchieved returns useful copy', () => {
    const problem = { type: PROBLEM_TYPE.CAPABILITY, description: 'Capability limit.' };
    const physicalCause = { description: 'Subwoofer cannot reach target output.' };
    const rec = buildTargetNotAchieved(problem, physicalCause, {});
    assert.ok(rec.assessment.includes('not currently achieved'), `assessment: ${rec.assessment}`);
    assert.ok(rec.action.includes('lower target'), `action: ${rec.action}`);
    assert.ok(rec.action.includes('additional sub capacity'), `action: ${rec.action}`);
    assert.ok(rec.action.includes('accept and document'), `action: ${rec.action}`);
    assert.equal(rec.why, 'Subwoofer cannot reach target output.');
    assert.ok(rec.remainingLimitation.includes('output'), `remainingLimitation: ${rec.remainingLimitation}`);
  });

  test('7. buildTargetNotAchieved limiting factor varies by problem type', () => {
    const cases = [
      { type: PROBLEM_TYPE.CAPABILITY, expect: 'output' },
      { type: PROBLEM_TYPE.EXTENSION, expect: 'extension' },
      { type: PROBLEM_TYPE.SEAT_CONSISTENCY, expect: 'seat-to-seat' },
      { type: PROBLEM_TYPE.RESPONSE_SMOOTHNESS, expect: 'response smoothness' },
      { type: PROBLEM_TYPE.LOCAL_CANCELLATION, expect: 'cancellation' },
      { type: PROBLEM_TYPE.ROOM_MODE, expect: 'room mode' },
    ];
    for (const { type, expect } of cases) {
      const rec = buildTargetNotAchieved({ type }, null, {});
      assert.ok(
        rec.remainingLimitation.toLowerCase().includes(expect),
        `problem ${type}: expected "${expect}" in "${rec.remainingLimitation}"`,
      );
    }
  });

  test('8. p18TargetHz accepted in designObjectives without error', () => {
    const baseline = makeBaseline();
    // Should not throw when p18TargetHz is passed
    const decision = runEngineeringDecisionModel({
      optimiserResult: { winner: null, terminalOutcome: 'no-better-evaluated', confirmedResults: [] },
      currentResult: baseline,
      designObjectives: { p14TargetDb: 117, p14Level: 4, p18TargetBasis: 'recommended', p18TargetHz: 22 },
      context: { subwooferCount: 2, roomDims: {}, seatingPositions: [] },
    });
    assert.ok(decision.outcome);
  });

  test('9. TARGET_NOT_ACHIEVED recommendation has no false closure text', () => {
    const baseline = makeBaseline();
    const decision = runEngineeringDecisionModel({
      optimiserResult: { winner: null, terminalOutcome: 'no-better-evaluated', confirmedResults: [] },
      currentResult: baseline,
      designObjectives: makeDesignObjectives(),
      context: { subwooferCount: 2, roomDims: {}, seatingPositions: [] },
    });
    const action = decision.recommendation?.action || '';
    assert.ok(!action.includes('No further engineering'), `Must not say "No further engineering": ${action}`);
    assert.ok(!action.includes('No physical cause'), `Must not say "No physical cause": ${action}`);
    assert.ok(!action.includes('Apply the recommended equalisation'), `Must not say "Apply the recommended equalisation": ${action}`);
  });
});