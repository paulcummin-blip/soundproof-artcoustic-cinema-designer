/**
 * adi-calibration-evidence.test.mjs
 * ---------------------------------------------------------------------------
 * The rule under test: the Bass Optimisation panel may state that calibration
 * was tested and found not useful ONLY when the saved run kept the evidence to
 * prove it — a candidate count and the best candidate the search canonically
 * confirmed, for delay, gain and polarity. With no such evidence the panel says
 * the evidence was not retained and asks for the re-run that produces it.
 *
 * The builder is read-only: it selects which canonical values to show, it never
 * scores, recalculates or alters a bass result.
 */

import { test } from "vitest";
import assert from "node:assert/strict";

import {
  CALIBRATION_EVIDENCE_MISSING_MESSAGE,
  CALIBRATION_EVIDENCE_RESULT,
  CALIBRATION_EVIDENCE_STATUS,
  buildCalibrationEvidence,
  calibrationEvidenceFor,
  describeCalibrationLever,
  resolveCalibrationEvidenceState,
} from "../components/room/bass/optimiserPlan/optimiserCalibrationEvidence.js";
import { buildFamilyLedgerRows } from "../components/room/bass/optimiserPlan/optimiserFamilyLedgerRows.js";
import { ADI_ROW_STATUS } from "../components/room/bass/optimiserPlan/optimiserFamilyLedgerRows.js";
import {
  ADI_CALIBRATION_KIND,
  ADI_PANEL_FINDING,
  resolveAdiPanelFinding,
  resolveCalibrationSectionKind,
} from "../components/room/bass/optimiserPlan/adiPanelSections.js";

const baseline = {
  candidateId: "current",
  achievedP19VariationDb: 5.2,
  achievedP19Level: 3,
  achievedP20VariationDb: 5.4,
  achievedP20Level: 3,
  perSeatP20: [{ seatId: "S1", variationDbRaw: 4.1 }],
  worstFrequencyHz: 62,
};

function delayCandidate(id, p20, p19) {
  return {
    candidateId: id,
    achievedP19VariationDb: p19,
    achievedP19Level: 4,
    achievedP20VariationDb: p20,
    achievedP20Level: 4,
    perSeatP20: [{ seatId: "S2", variationDbRaw: p20 }],
    worstFrequencyHz: 58,
  };
}

/** A run that genuinely tested delay and gain and kept their evidence. */
function selectionWithCalibrationEvidence() {
  const optionId = 'grouped-delay:["F1","F2"]:2';
  return {
    currentResult: baseline,
    calibrationDiagnostics: {
      status: "completed-shortlist",
      coarseCount: 61,
      fineCount: 4,
      retained: 5,
      confirmed: 5,
      valid: 5,
      invalid: 0,
      grouping: { status: "eligible", groups: [{ id: "A", label: "Front pair", role: "front" }, { id: "B", label: "Rear pair", role: "rear" }] },
      ledger: [
        { id: optionId, direction: "B", adjustmentMs: 2, effectiveOffsetMs: 2, promoted: true },
        { id: 'grouped-delay:["F1","F2"]:3', direction: "B", adjustmentMs: 3, effectiveOffsetMs: 3, promoted: false },
      ],
      options: [{ candidateId: optionId, tuning: [], validity: { valid: true }, canonical: delayCandidate(optionId, 5.3, 5.1) }],
      evaluations: [{ candidateId: optionId, status: "below-materiality", materiality: { material: false, reason: "No material calibration improvement" } }],
    },
    calibrationMaterial: { material: false },
    calibrationResult: null,
    gainDiagnostics: {
      grouping: { status: "eligible" },
      coarseCount: 30,
      fineCount: 2,
      retained: 3,
      confirmed: 3,
      valid: 3,
      invalid: 0,
      gainAdjustable: true,
      groups: [{ id: "A", label: "Front pair" }, { id: "B", label: "Rear pair" }],
      bestAttempt: {
        candidateId: "gain:1",
        adjustmentDb: 1.5,
        p19VariationDb: 5.1,
        p19Level: 3,
        p20VariationDb: 5.3,
        p20Level: 3,
      },
      evaluations: [{ candidateId: "gain:1", status: "below-materiality", materiality: { material: false, reason: "No material calibration improvement" } }],
    },
    gainMaterial: { material: false },
    gainResult: null,
    phaseDiagnostics: {
      status: "done",
      optionCount: 6,
      phaseReferenceHz: 80,
      grouping: { status: "eligible", groups: [{ id: "A", label: "Front pair", role: "front" }] },
      ledger: [{ id: "phase:1", direction: "A", adjustmentMs: 5, effectiveOffsetMs: -5 }],
    },
    combinedResult: {
      candidateId: "combined:1",
      achievedP19VariationDb: 5.2,
      achievedP19Level: 3,
      achievedP20VariationDb: 5.4,
      achievedP20Level: 3,
      perSeatP20: [{ seatId: "S1", variationDbRaw: 4.1 }],
    },
    combinedMaterial: { material: false },
    phaseResult: null,
  };
}

test("a run with no retained calibration evidence builds nothing to read", () => {
  assert.equal(buildCalibrationEvidence({ selection: {} }), null);
  assert.equal(buildCalibrationEvidence({ selection: null }), null);
  const state = resolveCalibrationEvidenceState(null);
  assert.equal(state.evidenceRetained, false);
  assert.equal(state.message, CALIBRATION_EVIDENCE_MISSING_MESSAGE);
  assert.deepEqual(state.missingLevers, ["delay", "gain", "polarity"]);
});

test("delay evidence keeps its counts, signed offset and canonical before/after", () => {
  const evidence = buildCalibrationEvidence({ selection: selectionWithCalibrationEvidence() });
  const delay = calibrationEvidenceFor(evidence, "delay");
  assert.equal(delay.evidenceStatus, CALIBRATION_EVIDENCE_STATUS.RETAINED);
  assert.equal(delay.tested, true);
  assert.equal(delay.candidateCount, 5);
  assert.equal(delay.candidateCounts.coarse, 61);
  assert.equal(delay.grouping.groups.length, 2);
  assert.equal(delay.testedRange.signedOffsetsMs.max, 3);
  assert.equal(delay.bestCandidate.signedOffsetMs, 2);
  assert.equal(delay.bestCandidate.p19Before, 5.2);
  assert.equal(delay.bestCandidate.p19After, 5.1);
  assert.equal(delay.bestCandidate.p20Before, 5.4);
  assert.equal(delay.bestCandidate.p20After, 5.3);
  assert.equal(delay.bestCandidate.limitingSeatId, "S2");
  assert.equal(delay.result, CALIBRATION_EVIDENCE_RESULT.NO_USEFUL_IMPROVEMENT);
  assert.equal(delay.reason, "No material calibration improvement");
});

test("gain and polarity evidence are retained and readable", () => {
  const evidence = buildCalibrationEvidence({ selection: selectionWithCalibrationEvidence() });
  const gain = calibrationEvidenceFor(evidence, "gain");
  assert.equal(gain.evidenceStatus, CALIBRATION_EVIDENCE_STATUS.RETAINED);
  assert.equal(gain.candidateCount, 3);
  assert.equal(gain.bestCandidate.adjustmentDb, 1.5);
  assert.equal(gain.bestCandidate.p20Before, 5.4);
  assert.equal(gain.bestCandidate.p20After, 5.3);

  const polarity = calibrationEvidenceFor(evidence, "polarity");
  assert.equal(polarity.evidenceStatus, CALIBRATION_EVIDENCE_STATUS.RETAINED);
  assert.equal(polarity.candidateCount, 6);
  assert.equal(polarity.bestCandidate.p20Before, 5.4);
  assert.equal(polarity.scope.includes("combined candidate"), true);
});

test("the no-improvement claim is allowed only when all three levers are proven", () => {
  const proven = resolveCalibrationEvidenceState(buildCalibrationEvidence({ selection: selectionWithCalibrationEvidence() }));
  assert.equal(proven.evidenceRetained, true);
  assert.equal(proven.message, null);
  assert.equal(proven.noImprovementProven, true);
  assert.equal(proven.leverLines.length >= 3, true);

  // The same run, with the delay search's evidence dropped: the claim is refused.
  const partial = selectionWithCalibrationEvidence();
  delete partial.calibrationDiagnostics;
  const refused = resolveCalibrationEvidenceState(buildCalibrationEvidence({ selection: partial }));
  assert.equal(refused.evidenceRetained, false);
  assert.equal(refused.message, CALIBRATION_EVIDENCE_MISSING_MESSAGE);
  assert.deepEqual(refused.missingLevers, ["delay"]);
});

test("a trade-off is stated as a trade-off and never as no useful improvement", () => {
  const selection = selectionWithCalibrationEvidence();
  const optionId = selection.calibrationDiagnostics.options[0].candidateId;
  selection.calibrationDiagnostics.evaluations = [{
    candidateId: optionId,
    status: "trade-off",
    tradeOff: { isTradeOff: true, reason: "Improves P20 and worsens P19" },
  }];
  const state = resolveCalibrationEvidenceState(buildCalibrationEvidence({ selection }));
  assert.equal(state.tradeOffHeld, true);
  assert.equal(state.noImprovementProven, false);
  assert.equal(state.tradeOffMessage.includes("trade-off") || state.tradeOffMessage.includes("worsens another"), true);
});

test("an improvement that was not applied is not stated as no useful improvement", () => {
  const selection = selectionWithCalibrationEvidence();
  selection.calibrationDiagnostics.options[0].canonical = delayCandidate(
    selection.calibrationDiagnostics.options[0].candidateId, 3.1, 5.1,
  );
  selection.calibrationMaterial = { material: true, reason: "Worst-seat deviation improved by 2.3 dB" };
  const evidence = buildCalibrationEvidence({ selection });
  const delay = calibrationEvidenceFor(evidence, "delay");
  assert.equal(delay.result, CALIBRATION_EVIDENCE_RESULT.IMPROVEMENT_NOT_APPLIED);
  const state = resolveCalibrationEvidenceState(evidence);
  assert.equal(state.improvementHeld, true);
  assert.equal(state.noImprovementProven, false);
});

test("the panel refuses the no-improvement sentence without evidence and shows the message", () => {
  const state = resolveCalibrationEvidenceState(null);
  const kind = resolveCalibrationSectionKind({ decision: null, hasPersistedValues: false, evaluated: true, evidenceRetained: state.evidenceRetained });
  assert.equal(kind, ADI_CALIBRATION_KIND.EVIDENCE_MISSING);
  const finding = resolveAdiPanelFinding({ isRunning: false, calibrationApplied: false, designRecommended: true, evaluated: true, calibrationEvidenceRetained: false });
  assert.equal(finding, ADI_PANEL_FINDING.EVIDENCE_MISSING);
  assert.equal(finding, CALIBRATION_EVIDENCE_MISSING_MESSAGE);
});

test("a completed pass with retained evidence keeps the existing tested state", () => {
  const state = resolveCalibrationEvidenceState(buildCalibrationEvidence({ selection: selectionWithCalibrationEvidence() }));
  const kind = resolveCalibrationSectionKind({ decision: null, hasPersistedValues: false, evaluated: true, evidenceRetained: state.evidenceRetained });
  assert.equal(kind, ADI_CALIBRATION_KIND.TESTED);
  const finding = resolveAdiPanelFinding({ isRunning: false, calibrationApplied: false, designRecommended: true, evaluated: true, calibrationEvidenceRetained: true });
  assert.equal(finding, ADI_PANEL_FINDING.TESTED_NO_CALIBRATION);
});

test("the ledger rows state the missing evidence instead of claiming no improvement", () => {
  const families = [
    { family: "delay", label: "Delay", status: "evaluated", candidatesEvaluated: null, bestAttempt: null, reason: "Evaluated — no comparison value was kept for this search.", tested: true },
    { family: "gain", label: "Gain", status: "evaluated", candidatesEvaluated: null, bestAttempt: null, gainAdjustable: true, reason: "Evaluated — no comparison value was kept for this search.", tested: true },
    { family: "polarity", label: "Polarity", status: "not_tested_separately", candidatesEvaluated: null, bestAttempt: null, reason: "No standalone search", tested: false },
    { family: "placement", label: "Placement", status: "rejected", candidatesEvaluated: 4, bestAttempt: { candidateId: "p1", p20VariationDb: 4.4, p19VariationDb: 5.0, p20DeltaDb: -1.0, p19DeltaDb: -0.2 }, tested: true },
  ];
  const withoutEvidence = buildFamilyLedgerRows({ families, baseline, runComplete: true });
  assert.equal(withoutEvidence.delay.outcome, CALIBRATION_EVIDENCE_MISSING_MESSAGE);
  assert.equal(withoutEvidence.delay.status, ADI_ROW_STATUS.NOT_RUN);
  assert.equal(withoutEvidence.gain.outcome, CALIBRATION_EVIDENCE_MISSING_MESSAGE);
  assert.equal(withoutEvidence.polarity.outcome, CALIBRATION_EVIDENCE_MISSING_MESSAGE);

  const evidence = buildCalibrationEvidence({ selection: selectionWithCalibrationEvidence() });
  const withEvidence = buildFamilyLedgerRows({ families, baseline, runComplete: true, calibrationEvidence: evidence });
  assert.notEqual(withEvidence.delay.outcome, CALIBRATION_EVIDENCE_MISSING_MESSAGE);
  assert.equal(withEvidence.delay.outcome.includes("No useful improvement"), true);
  assert.equal(withEvidence.delay.outcome.includes("P19"), true);
});

test("the described lever line carries the best candidate, its values and the reason", () => {
  const evidence = buildCalibrationEvidence({ selection: selectionWithCalibrationEvidence() });
  const text = describeCalibrationLever(calibrationEvidenceFor(evidence, "delay"));
  assert.equal(text.includes("Best delay"), true);
  assert.equal(text.includes("+2 ms"), true);
  assert.equal(text.includes("P20"), true);
  assert.equal(text.includes("No useful improvement"), true);
  assert.equal(text.includes("No material calibration improvement"), true);
});