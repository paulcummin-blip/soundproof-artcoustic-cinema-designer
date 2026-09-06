// Final production-state verification of the EQ hot-path fix.
// Measures fresh runtime, fitter invocation counts, authority identity,
// and acoustic parity from the FINAL source state.
// Run with: node --import ./test/_alias-register.mjs test/final-eq-hotpath-verification.mjs
import { generateCanonicalCandidatePool } from "@/components/utils/canonicalBassOptimiser";
import { selectCandidateFromPool } from "@/components/utils/bassCandidatePoolSelection";
import { buildCandidateId, buildFilterBankSignature, buildCurveSignature } from "@/components/room/bass/bassResultAuthority";
import { computeCalibrationFingerprint } from "@/components/room/bass/bassAnalysisFingerprints";

const frequencies = Array.from({ length: 181 }, (_, i) => 20 + i);
const gaussian = (f, c, w, g) => g * Math.exp(-0.5 * ((f - c) / w) ** 2);
const rawCurve = frequencies.map((f) => ({
  frequency: f,
  spl: 114 + 4 * Math.log10(120 / f) + gaussian(f, 42, 7, 7) + gaussian(f, 73, 9, -4),
}));
const seatCurve = (seatId, shift) => ({
  seatId,
  responseData: rawCurve.map((p) => ({ ...p, spl: p.spl + shift + gaussian(p.frequency, 58, 12, shift * 0.3) })),
});
const physicalInputs = {
  rawCurve,
  activeSubs: [{ id: "sub-1", modelKey: "SUB2-12" }],
  usableLfHz: 20,
  transitionHz: 163.3,
  correctionEndHz: 200,
  perSeatRawCurves: [seatCurve("seat-1", -0.6), seatCurve("seat-2", 0.8)],
};

const targetCase = { requestedLevel: 2, requestedTargetSplDb: 112, targetBasis: "minimum" };

const calibrationFingerprintInput = {
  roomDims: { widthM: 4, lengthM: 6, heightM: 2.7 },
  rspPosition: { x: 2, y: 3, z: 1.2 },
  seatingPositions: [{ id: "seat-1", x: 1.5, y: 3, z: 1.2 }, { id: "seat-2", x: 2.5, y: 3, z: 1.2 }],
  sources: [{ id: "sub-1", modelKey: "SUB2-12", x: 1, y: 0.5, z: 0.3 }],
  houseCurveFingerprint: "artcoustic-shape-v1",
  eqConstraints: { maxBoostDb: 6, maxCutDb: 15 },
  assessmentStartHz: 20, assessmentEndHz: 200, optimisationTransitionHz: 163.3, usableLfHz: 20,
  selectedP14TargetDb: targetCase.requestedTargetSplDb,
  p14TargetBasis: targetCase.targetBasis,
  p14TargetLevel: targetCase.requestedLevel,
};

function maxDelta(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return null;
  const len = Math.min(a.length, b.length);
  let max = 0;
  for (let i = 0; i < len; i++) {
    const da = a[i]?.spl, db = b[i]?.spl;
    if (Number.isFinite(da) && Number.isFinite(db)) max = Math.max(max, Math.abs(da - db));
  }
  return max;
}

function runPath(collectDiagnostics) {
  const t0 = performance.now();
  const pool = generateCanonicalCandidatePool({
    ...physicalInputs,
    selectedP14TargetDb: targetCase.requestedTargetSplDb,
    p14TargetBasis: targetCase.targetBasis,
    p14TargetLevel: targetCase.requestedLevel,
    collectDiagnostics,
  });
  const elapsed = performance.now() - t0;
  const selection = selectCandidateFromPool(pool);
  const candidate = selection.selectedCandidate;
  const perf = pool.performanceSummary || {};
  const fingerprint = computeCalibrationFingerprint(calibrationFingerprintInput);
  return {
    elapsed,
    pool,
    candidate,
    candidateId: buildCandidateId(candidate),
    filterBankSignature: buildFilterBankSignature(candidate),
    postEqCurveSignature: buildCurveSignature(candidate.finalPostEqCurve),
    designEqFitProfile: candidate.designEqFitProfile,
    finalPostEqCurve: candidate.finalPostEqCurve,
    productOperatingEnvelopeCurve: candidate.productOperatingEnvelopeCurve,
    p14: candidate.pairedP14P18Summary?.p14Level || candidate.p14Level,
    p18: candidate.pairedP14P18Summary?.p18Level || candidate.p18Level,
    p19: candidate.p19Level,
    p20: candidate.p20Level,
    fingerprint,
    perf: {
      standardFitCount: perf.standardFitCount || 0,
      accuracyFitCount: perf.accuracyFitCount || 0,
      houseCurveFitCount: perf.houseCurveFitCount || 0,
      coreFitTimeMs: perf.coreFitTimeMs || 0,
      iterativeFittingSkipped: !!perf.iterativeFittingSkipped,
      totalOptimiserTimeMs: perf.totalOptimiserTimeMs || 0,
    },
  };
}

// ── Run both paths ──
const defaultPath = runPath(false);
const diagPath = runPath(true);

// ── Acoustic parity ──
const finalPostEqDelta = maxDelta(defaultPath.finalPostEqCurve, diagPath.finalPostEqCurve);
const envelopeDelta = maxDelta(defaultPath.productOperatingEnvelopeCurve, diagPath.productOperatingEnvelopeCurve);

// ── Identity comparison ──
const identityEqual = defaultPath.candidateId === diagPath.candidateId;
const fingerprintEqual = defaultPath.fingerprint === diagPath.fingerprint;
const curveSigEqual = defaultPath.postEqCurveSignature === diagPath.postEqCurveSignature;
const filterSigDiffers = defaultPath.filterBankSignature !== diagPath.filterBankSignature;
const profileDiffers = defaultPath.designEqFitProfile !== diagPath.designEqFitProfile;

const report = {
  "1_ACOUSTIC_PARITY": {
    finalPostEqCurve_max_delta_dB: finalPostEqDelta,
    productOperatingEnvelopeCurve_max_delta_dB: envelopeDelta,
    p14_default: defaultPath.p14,
    p14_diagnostic: diagPath.p14,
    p18_default: defaultPath.p18,
    p18_diagnostic: diagPath.p18,
    p19_default: defaultPath.p19,
    p19_diagnostic: diagPath.p19,
    p20_default: defaultPath.p20,
    p20_diagnostic: diagPath.p20,
  },
  "2_FITTER_INVOCATIONS": {
    standard_default: defaultPath.perf.standardFitCount,
    accuracy_default: defaultPath.perf.accuracyFitCount,
    house_default: defaultPath.perf.houseCurveFitCount,
    standard_diagnostic: diagPath.perf.standardFitCount,
    accuracy_diagnostic: diagPath.perf.accuracyFitCount,
    house_diagnostic: diagPath.perf.houseCurveFitCount,
    expected_default: "0 / 0 / 0",
    iterativeFittingSkipped_default: defaultPath.perf.iterativeFittingSkipped,
  },
  "3_PERFORMANCE": {
    default_elapsed_ms: Math.round(defaultPath.elapsed * 100) / 100,
    diagnostic_elapsed_ms: Math.round(diagPath.elapsed * 100) / 100,
    default_coreFitTimeMs: defaultPath.perf.coreFitTimeMs,
    diagnostic_coreFitTimeMs: diagPath.perf.coreFitTimeMs,
    speedup_factor: diagPath.elapsed > 0
      ? Math.round((diagPath.elapsed / defaultPath.elapsed) * 10) / 10
      : null,
  },
  "4_AUTHORITY_IDENTITY": {
    default_candidateId: defaultPath.candidateId,
    diagnostic_candidateId: diagPath.candidateId,
    identity_equal: identityEqual,
    default_fingerprint: defaultPath.fingerprint,
    diagnostic_fingerprint: diagPath.fingerprint,
    fingerprint_equal: fingerprintEqual,
    default_filterBankSignature: defaultPath.filterBankSignature,
    diagnostic_filterBankSignature: diagPath.filterBankSignature,
    filterBankSignature_differs: filterSigDiffers,
    default_designEqFitProfile: defaultPath.designEqFitProfile,
    diagnostic_designEqFitProfile: diagPath.designEqFitProfile,
    profile_differs: profileDiffers,
    postEqCurveSignature_equal: curveSigEqual,
    filterBankSignature_contributes_to_difference: filterSigDiffers || profileDiffers,
  },
};

console.log(JSON.stringify(report, null, 2));