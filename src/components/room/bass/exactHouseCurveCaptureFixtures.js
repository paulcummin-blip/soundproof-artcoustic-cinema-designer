import { buildExactHouseCurveCaseCapture } from "./exactHouseCurveCaseCapture";
import { serializeEqCurve, serializeSplCurve } from "./exactHouseCurveCaptureValidation";

const curve = (values) => values.map((spl, index) => ({ frequency: 20 + index * 10, spl }));

function fixtureInputs(overrides = {}) {
  const before = curve([100, 101, 102]);
  const eq = curve([1, -2, 0.5]);
  const after = before.map((point, index) => ({ frequency: point.frequency, spl: point.spl + eq[index].spl }));
  const target = curve([106, 105, 104]);
  const candidate = {
    candidateId: "candidate-1", generatedFilterBank: [{ enabled: true, frequencyHz: 30, gainDb: -2, Q: 2 }],
    combinedEqCurve: eq, finalPostEqCurve: after, productionHouseCurveTarget: target, fitterHouseCurveTarget: target,
    assessmentStartHz: 20, assessmentEndHz: 40, requestedTargetSpl: 100,
    achievedP14Level: 1, achievedP14Db: 101, achievedP18Level: 1, achievedP18FrequencyHz: 20,
    achievedP19Level: 1, achievedP19VariationDb: 4, achievedP20Level: 1, achievedP20VariationDb: 3, p20Available: true,
    filterBankSignature: "filters-1",
  };
  const parameters = Object.fromEntries([
    ["p14", [1, 101]], ["p18", [1, 20]], ["p19", [1, 4]], ["p20", [1, 3]],
  ].map(([key, [level, value]]) => [key, { status: "complete", level, value }]));
  return {
    result: { selectedCandidate: candidate, selectedCandidateId: "candidate-1", finalPostEqCurve: after, filterBankSignature: "filters-1" },
    contract: { selectedCandidateId: "candidate-1", provenance: { filterBankSignature: "filters-1" }, productAnalysis: { parameters }, fingerprints: { calibration: "cal-1" } },
    lifecycle: {}, rspRawCurve: before, perSeatRawCurves: [], activeSubs: [{ modelKey: "SUB2-12" }], usableLfHz: 20,
    transitionFrequencyHz: 120, graphSeries: [
      { kind: "raw", label: "RSP before EQ", data: before },
      { kind: "post-eq", label: "RSP after EQ", candidateId: "candidate-1", filterBankSignature: "filters-1", data: after },
      { kind: "house-curve", label: "Absolute house-curve target", data: target },
    ], graphCandidateId: "candidate-1", graphFilterBankSignature: "filters-1", designEqEnabled: true, detailedStatus: "COMPLETE",
    ...overrides,
  };
}

export function runExactHouseCurveCaptureFixtures() {
  const inputs = fixtureInputs();
  const capture = buildExactHouseCurveCaseCapture(inputs);
  const repeated = buildExactHouseCurveCaseCapture(inputs);
  const mismatch = buildExactHouseCurveCaseCapture(fixtureInputs({ graphCandidateId: "wrong" }));
  const emptyEqInputs = fixtureInputs();
  emptyEqInputs.result = { ...emptyEqInputs.result, selectedCandidate: { ...emptyEqInputs.result.selectedCandidate, combinedEqCurve: [] } };
  const emptyEq = buildExactHouseCurveCaseCapture(emptyEqInputs);
  const fallbackInputs = fixtureInputs();
  fallbackInputs.result = { ...fallbackInputs.result, selectedCandidate: { ...fallbackInputs.result.selectedCandidate, fitterHouseCurveTarget: null } };
  const fallback = buildExactHouseCurveCaseCapture(fallbackInputs);
  const checks = [
    ["Structured clone and JSON serialization", JSON.stringify(structuredClone(capture)) === JSON.stringify(capture)],
    ["Exact frequency preservation", capture.frequencyGrid.join(",") === "20,30,40"],
    ["SPL serializer", serializeSplCurve([{ frequency: 20, spl: 100 }])[0]?.spl === 100],
    ["EQ gain serializer", serializeEqCurve([{ frequency: 20, spl: 2 }])[0]?.gainDb === 2],
    ["Exact target authority", capture.targetSource === "exact-live-authority" && capture.productionHouseCurveTarget.length === 3],
    ["Before plus EQ equals after", capture.captureValidation.maximumAfterEqReconstructionErrorDb === 0],
    ["Candidate identity pass", capture.captureValidation.identityPass && capture.captureValidation.valid],
    ["Identity mismatch rejection", !mismatch.captureValidation.valid && !mismatch.captureValidation.identityPass],
    ["Empty aggregate EQ rejection", !emptyEq.captureValidation.valid && emptyEq.captureValidation.failures.some((failure) => failure.includes("aggregate EQ is empty"))],
    ["Reconstructed target rejection", !fallback.captureValidation.valid && fallback.targetSource === "reconstructed-fallback"],
    ["Stable content fingerprint", capture.caseFingerprint === repeated.caseFingerprint],
    ["P14–P20 parity", !capture.captureValidation.failures.some((failure) => failure.includes("P14–P20"))],
  ].map(([name, passed]) => ({ name, passed: !!passed }));
  return { checks, passed: checks.filter((check) => check.passed).length, total: checks.length, allPassed: checks.every((check) => check.passed) };
}