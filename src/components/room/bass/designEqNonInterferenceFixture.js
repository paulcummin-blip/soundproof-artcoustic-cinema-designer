// designEqNonInterferenceFixture.js — Proves collectDiagnostics does not alter
// the acoustic result of calculateDesignEqCurve.
//
// Runs identical deterministic inputs twice:
//   A. collectDiagnostics = false
//   B. collectDiagnostics = true
//
// Requires EXACT equality for:
//   - selectedCandidateId (via filter bank signature)
//   - final filter-bank signature
//   - finalPostEqCurve signature
//   - canonicalPostEqRsp signature (curve signature of the output curve)
//   - P14 (smoothedMinimumSpl)
//   - P18 (not applicable at this layer — null in both)
//   - P19 (worstResidualFrequencyHz + maximumAbsoluteDeviationDb)
//   - P20 (not applicable at this layer — null in both)
//
// Only diagnostic metadata (detectedRegions, candidateAcceptanceDiagnostics,
// iterationTrace, etc.) may differ.
//
// READ-ONLY: this fixture never modifies production code. It only calls the
// production function and compares outputs.

import { calculateDesignEqCurve } from "@/components/utils/designEqCalibration";
import { buildFilterBankSignature, buildCurveSignature } from "@/components/room/bass/bassResultAuthority";

// Deterministic synthetic raw curve — a typical room response with a modal
// peak near 45 Hz and a null near 90 Hz. 41 points from 20–200 Hz.
function buildDeterministicRawCurve() {
  const points = [];
  for (let i = 0; i < 41; i++) {
    const frequency = 20 * Math.pow(10, i / 10); // 20, 25, 32, 40, 50, 63, 80, 100, 126, 160, 200...
    // Simulate a room response: flat at 90 dB with a +6 dB peak at 45 Hz and -8 dB null at 90 Hz.
    const peakGain = 6 * Math.exp(-Math.pow(Math.log2(frequency / 45), 2) / 0.5);
    const nullLoss = -8 * Math.exp(-Math.pow(Math.log2(frequency / 90), 2) / 0.3);
    const spl = 90 + peakGain + nullLoss;
    points.push({ frequency, spl });
  }
  return points;
}

// Deterministic active subs — two generic subwoofers.
const DETERMINISTIC_ACTIVE_SUBS = [
  { modelKey: "sub-a", displacement: 0.004, xmax: 12 },
  { modelKey: "sub-b", displacement: 0.004, xmax: 12 },
];

const DETERMINISTIC_OPTIONS = {
  assessmentStartHz: 20,
  assessmentEndHz: 200,
  fitProfile: "standard",
  requestedSystemOutputDb: 105,
  targetToleranceDb: 1.5,
};

function extractComparableFields(result) {
  const filters = Array.isArray(result?.filters) ? result.filters : [];
  const curve = Array.isArray(result?.curve) ? result.curve : [];
  const combinedEqCurve = Array.isArray(result?.combinedEqCurve) ? result.combinedEqCurve : [];
  const checkpoint = result?.selectedCheckpoint || {};
  return {
    filterBankSignature: buildFilterBankSignature({ generatedFilterBank: filters }),
    finalPostEqCurveSignature: buildCurveSignature(curve),
    combinedEqCurveSignature: buildCurveSignature(combinedEqCurve),
    p14_smoothedMinimumSpl: checkpoint.smoothedMinimumSpl ?? null,
    p14_rawMinimumSpl: checkpoint.rawMinimumSpl ?? null,
    p19_worstResidualFrequencyHz: checkpoint.worstResidualFrequencyHz ?? null,
    p19_maximumAbsoluteDeviationDb: checkpoint.maximumAbsoluteDeviationDb ?? null,
    p19_rmsDeviationDb: checkpoint.rmsDeviationDb ?? null,
    p18: null, // Not calculated at this layer
    p20: null, // Not calculated at this layer
    stopReason: result?.stopReason || null,
    designEqFitProfile: result?.designEqFitProfile || null,
    filterCount: filters.filter((f) => f?.enabled).length,
  };
}

function extractDiagnosticOnlyFields(result) {
  return {
    detectedRegionCount: Array.isArray(result?.detectedRegions) ? result.detectedRegions.length : 0,
    candidateAcceptanceDiagnosticsCount: Array.isArray(result?.candidateAcceptanceDiagnostics) ? result.candidateAcceptanceDiagnostics.length : 0,
    candidateSelectionDiagnosticsCount: Array.isArray(result?.candidateSelectionDiagnostics) ? result.candidateSelectionDiagnostics.length : 0,
    iterationTraceCount: Array.isArray(result?.iterationTrace) ? result.iterationTrace.length : 0,
    filterDecisionDiagnosticsCount: Array.isArray(result?.filterDecisionDiagnostics) ? result.filterDecisionDiagnostics.length : 0,
    checkpointSummariesCount: Array.isArray(result?.checkpointSummaries) ? result.checkpointSummaries.length : 0,
    worstResidualDiagnosticsCount: Array.isArray(result?.worstResidualDiagnostics) ? result.worstResidualDiagnostics.length : 0,
    diagnosticsCount: Array.isArray(result?.diagnostics) ? result.diagnostics.length : 0,
  };
}

// Run the non-interference test. Returns { passed, comparisons, diagnosticOnlyA, diagnosticOnlyB }.
export function runDesignEqNonInterferenceFixture() {
  const rawCurve = buildDeterministicRawCurve();

  const resultA = calculateDesignEqCurve(rawCurve, 20, DETERMINISTIC_ACTIVE_SUBS, {
    ...DETERMINISTIC_OPTIONS,
    collectDiagnostics: false,
  });
  const resultB = calculateDesignEqCurve(rawCurve, 20, DETERMINISTIC_ACTIVE_SUBS, {
    ...DETERMINISTIC_OPTIONS,
    collectDiagnostics: true,
  });

  const comparableA = extractComparableFields(resultA);
  const comparableB = extractComparableFields(resultB);
  const diagnosticOnlyA = extractDiagnosticOnlyFields(resultA);
  const diagnosticOnlyB = extractDiagnosticOnlyFields(resultB);

  const comparableKeys = [
    "filterBankSignature",
    "finalPostEqCurveSignature",
    "combinedEqCurveSignature",
    "p14_smoothedMinimumSpl",
    "p14_rawMinimumSpl",
    "p19_worstResidualFrequencyHz",
    "p19_maximumAbsoluteDeviationDb",
    "p19_rmsDeviationDb",
    "p18",
    "p20",
    "stopReason",
    "designEqFitProfile",
    "filterCount",
  ];

  const comparisons = comparableKeys.map((key) => ({
    field: key,
    expected: comparableA[key],
    actual: comparableB[key],
    delta: comparableA[key] === comparableB[key] ? 0 : "DIFFERS",
    passed: comparableA[key] === comparableB[key],
  }));

  const allPassed = comparisons.every((c) => c.passed);

  return {
    passed: allPassed,
    comparisons,
    diagnosticOnlyA,
    diagnosticOnlyB,
    verdict: allPassed
      ? "DIAGNOSTIC CAPTURE CODE-CORRECT, RUNTIME TEST REQUIRED"
      : "DIAGNOSTICS ALTER ACOUSTIC RESULT",
  };
}

// Build a structured report for UI display.
export function buildNonInterferenceReport() {
  const { passed, comparisons, diagnosticOnlyA, diagnosticOnlyB, verdict } = runDesignEqNonInterferenceFixture();
  const rows = comparisons.map((c) => ({
    TEST: `Non-interference: ${c.field}`,
    EXPECTED: String(c.expected),
    ACTUAL: String(c.actual),
    DELTA: String(c.delta),
    SEVERITY: c.passed ? "PASS" : "FAIL",
    "NEXT TEST": c.passed ? "—" : "Isolate the collectDiagnostics branch that alters this field",
  }));
  rows.push({
    TEST: "Diagnostic-only fields differ (expected)",
    EXPECTED: "diagnostic arrays empty when collectDiagnostics=false",
    ACTUAL: `A: detected=${diagnosticOnlyA.detectedRegionCount}, B: detected=${diagnosticOnlyB.detectedRegionCount}`,
    DELTA: diagnosticOnlyB.detectedRegionCount >= diagnosticOnlyA.detectedRegionCount ? "expected" : "unexpected",
    SEVERITY: diagnosticOnlyB.detectedRegionCount >= diagnosticOnlyA.detectedRegionCount ? "PASS" : "FAIL",
    "NEXT TEST": "—",
  });
  rows.push({
    TEST: "Final verdict",
    EXPECTED: "DIAGNOSTIC CAPTURE CODE-CORRECT, RUNTIME TEST REQUIRED",
    ACTUAL: verdict,
    DELTA: passed ? "0" : "FAIL",
    SEVERITY: passed ? "PASS" : "FAIL",
    "NEXT TEST": "Runtime validation with live worker result",
  });
  return { passed, verdict, rows };
}