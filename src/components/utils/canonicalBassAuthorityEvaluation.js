import {
  assessP14Capability,
  formatP14Capability,
  formatP14BasisLabel,
  gradeP14ForBasis,
  gradeP14Minimum,
  gradeP14Recommended,
  normalizeP14TargetBasis,
} from "@/components/utils/p14CapabilityAuthority";
import { integrateRawResponseLevelDbC } from "@/components/utils/p14HouseCurveNormalisation";
import { computeOfficialP19Assessment, computeOfficialPerSeatP19Assessment, computeOfficialP20Assessment } from "@/components/utils/bassAuthoritativeAssessment";
import { houseCurveP19Level } from "@/components/utils/houseCurveFitterCore";
import { getRp22BassOperatingDefinitions } from "@/components/utils/rp22BassOperatingDefinitions";
import { buildPostEqBassCapabilityOutcome } from "@/components/utils/postEqBassCapabilityOutcome";
import { assessP18AgainstRequiredExtension, buildBassTargetWarning } from "@/components/utils/bassDesignPhilosophyAuthority";
import { assessP18Extension, normalizeP18TargetBasis, p18ThresholdHzForLevel } from "@/components/utils/p18ExtensionAuthority";
import { isCanonicalP19Ready } from "@/components/room/bass/p19Readiness";
import { buildSmoothCapabilityEnvelope, buildPracticalCalibrationTarget } from "@/components/utils/practicalCalibrationTarget";
import { resolveBassAssessmentBand } from "@/components/utils/bassAssessmentBandAuthority";
import { getProductCurveFrequencyRange } from "@/components/models/speakers/registry";

export function buildPositionAwareP14Capability({
  canonicalResult,
  productDiagnostic,
  targetBasis,
  requiredExtensionHz,
}) {
  const maximumAfterEq = canonicalResult?.maximumSplCurveAfterEq || [];
  const maximumBeforeEq = canonicalResult?.maximumSplCurveBeforeEq || [];
  const positionAwareEnvelopeDbC = integrateRawResponseLevelDbC({
    rawCurve: maximumAfterEq,
    lowerHz: requiredExtensionHz,
    upperHz: 120,
  });
  if (!Number.isFinite(positionAwareEnvelopeDbC)) return productDiagnostic;

  const positionAwareEnvelopeBeforeEqDbC = integrateRawResponseLevelDbC({
    rawCurve: maximumBeforeEq,
    lowerHz: requiredExtensionHz,
    upperHz: 120,
  });
  const approvedProductDbC = Number(productDiagnostic?.p14CapabilityDb ?? productDiagnostic?.value);
  const approvedProductBeforeEqDbC = Number(
    productDiagnostic?.productCapabilityBeforeEqDb ?? productDiagnostic?.rawCapabilityDb,
  );

  // A maximum-continuous SPL trace is an alternative-frequency capability
  // envelope, not simultaneous broadband energy. Integrating every maximum
  // point lets room peaks be counted repeatedly and can inflate four 120 dB
  // continuous SUB2-12s to an impossible 135+ dBC. Room/placement modelling
  // may reduce the available result, but it must never raise the published P14
  // authority above the approved frequency-weighted product ceiling.
  const capabilityDbC = Number.isFinite(approvedProductDbC)
    ? Math.min(positionAwareEnvelopeDbC, approvedProductDbC)
    : positionAwareEnvelopeDbC;
  const beforeEqDbC = Number.isFinite(approvedProductBeforeEqDbC)
    ? Math.min(positionAwareEnvelopeBeforeEqDbC, approvedProductBeforeEqDbC)
    : positionAwareEnvelopeBeforeEqDbC;
  const productCeilingApplied = Number.isFinite(approvedProductDbC)
    && approvedProductDbC < positionAwareEnvelopeDbC - 1e-9;

  const basis = normalizeP14TargetBasis(targetBasis);
  const assessmentPoints = maximumAfterEq.filter((point) =>
    Number.isFinite(point?.frequency)
    && Number.isFinite(point?.spl)
    && point.frequency >= requiredExtensionHz
    && point.frequency <= 120
  );
  const positionAwareLimitingPoint = assessmentPoints.reduce((lowest, point) =>
    !lowest || point.spl < lowest.spl ? point : lowest, null);
  const headroomConsumedByEqDb = productCeilingApplied
    ? productDiagnostic?.headroomConsumedByEqDb ?? productDiagnostic?.eqHeadroomConsumedDb ?? null
    : Number.isFinite(beforeEqDbC)
      ? Math.max(0, beforeEqDbC - capabilityDbC)
      : productDiagnostic?.headroomConsumedByEqDb ?? null;
  const capabilityCurve = productCeilingApplied && Array.isArray(productDiagnostic?.capabilityCurve)
    ? productDiagnostic.capabilityCurve
    : maximumAfterEq.map((point) => ({
        frequency: point.frequency,
        rawCapabilityDb: null,
        positiveEqBoostDb: null,
        remainingCapabilityDb: point.spl,
      }));

  return {
    ...(productDiagnostic || {}),
    p14CapabilityDb: capabilityDbC,
    value: capabilityDbC,
    formatted: formatP14Capability(capabilityDbC),
    level: gradeP14ForBasis(capabilityDbC, basis),
    targetBasis: basis,
    targetBasisLabel: formatP14BasisLabel(basis),
    minimumLevel: gradeP14Minimum(capabilityDbC),
    recommendedLevel: gradeP14Recommended(capabilityDbC),
    rawCapabilityDb: beforeEqDbC,
    productCapabilityBeforeEqDb: approvedProductBeforeEqDbC,
    capabilityRemainingAfterEqDb: capabilityDbC,
    eqHeadroomConsumedDb: headroomConsumedByEqDb,
    headroomConsumedByEqDb,
    limitingFrequency: productCeilingApplied
      ? productDiagnostic?.limitingFrequency ?? null
      : positionAwareLimitingPoint?.frequency ?? null,
    capabilityCurve,
    requiredExtensionHz,
    positionAware: true,
    includesRoomGeometry: true,
    includesProductFrequencyResponse: true,
    includesProductOutputLimit: true,
    productCeilingApplied,
    approvedProductCapabilityDbC: Number.isFinite(approvedProductDbC) ? approvedProductDbC : null,
    positionAwareEnvelopeCapabilityDbC: positionAwareEnvelopeDbC,
    positionAwareEnvelopeBeforeEqDbC,
    source: productCeilingApplied
      ? "position-aware-envelope-bounded-by-approved-product-capability"
      : "position-aware-authoritative-engine-maximum-spl-envelope-post-eq",
    productOnlyDiagnostic: productDiagnostic || null,
  };
}

// Helper: build the common return fields for the P14-passes case (used when
// P18 is achieved and when P18 is not achieved but P14 still passes).
// P19/P20 fields are added by the caller.
function buildP14PassReturnObject(params) {
  const {
    p14TargetBasis, requestedLevel, selectedTargetDb, p14AssessmentStartHz,
    achievedP14Db, achievedP14Level, p14, requestedP14Pass,
    selectedP18TargetBasis, requiredExtensionHz,
    achievedP18FrequencyHz, independentP18Assessment, achievedP18Level, p18,
    extensionAssessment, extensionShapePass, requestedP18Pass,
    p18RequiredExtensionAssessment, idealHouseTarget, practicalCalibrationTarget,
    assessmentBand,
  } = params;
  return {
    selectedP14TargetBasis: p14TargetBasis,
    selectedP14Level: requestedLevel,
    selectedP14TargetDb: selectedTargetDb,
    selectedP14RequiredExtensionHz: p14AssessmentStartHz,
    idealHouseTarget,
    practicalCalibrationTarget,
    p19TargetIdentity: practicalCalibrationTarget.length ? "practical-calibration-target" : "ideal-house-target",
    assessmentStartHz: assessmentBand.valid ? assessmentBand.lowerHz : null,
    assessmentEndHz: assessmentBand.valid ? assessmentBand.upperHz : null,
    assessmentBandValid: assessmentBand.valid,
    availableP14CapabilityDb: achievedP14Db,
    requestedP14Pass,
    p14MarginDb: Number.isFinite(achievedP14Db) && Number.isFinite(selectedTargetDb) ? achievedP14Db - selectedTargetDb : null,
    maximumAchievableMinimumLevel: p14?.minimumLevel ?? 0,
    maximumAchievableRecommendedLevel: p14?.recommendedLevel ?? 0,
    achievedP14Db,
    achievedP14Level,
    achievedP14MinimumLevel: p14?.minimumLevel ?? 0,
    achievedP14RecommendedLevel: p14?.recommendedLevel ?? 0,
    minimumLevel: p14?.minimumLevel ?? 0,
    recommendedLevel: p14?.recommendedLevel ?? 0,
    limitingFrequencyHz: p14?.limitingFrequency ?? null,
    headroomConsumedByEqDb: p14?.headroomConsumedByEqDb ?? null,
    p14CapabilityDetails: p14,
    p14TargetBasis,
    p18TargetBasis: selectedP18TargetBasis,
    selectedP18TargetBasis,
    selectedP18RequiredExtensionHz: requiredExtensionHz,
    achievedP18FrequencyHz,
    achievedP18DesignHz: independentP18Assessment?.designHz ?? null,
    p18PerformanceBand: independentP18Assessment?.performanceBand ?? null,
    p18PerformanceMultiplier: independentP18Assessment?.performanceMultiplier ?? null,
    achievedP18Level,
    p18AchievedAuthority: p18,
    p18Limitation: achievedP18FrequencyHz == null || achievedP18Level === 0
      ? "Canonical post-EQ extension does not achieve P18 Level 1"
      : null,
    p18Evaluated: true,
    p18NotEvaluatedReason: null,
    requestedP18Pass,
    p18RequiredExtensionAssessment,
    requiredExtensionHz,
  };
}

export function evaluateCanonicalBassAuthority({
  canonicalResult,
  activeSubs = [],
  usableLfHz = null,
  p14TargetBasis = "minimum",
  p18TargetBasis = "minimum",
  requestedLevel = 4,
} = {}) {
  if (!canonicalResult?.selectedCandidateId || !canonicalResult.canonicalPostEqRsp?.length) return null;

  const selectedP18TargetBasis = normalizeP18TargetBasis(p18TargetBasis);
  const definitions = getRp22BassOperatingDefinitions(p14TargetBasis, selectedP18TargetBasis);
  const requested = definitions.find((definition) => definition.value === requestedLevel) || definitions.at(-1);
  const selectedTargetDb = requested?.p14TargetDb ?? null;
  const p14AssessmentStartHz = 20;
  // P18 is not forced to the same numbered level as P14. Measure the achieved
  // -3 dB point at the selected P14 output, then grade it independently. The
  // selected Min./Rec. basis contributes only its L1 pass/fail boundary here.
  const requiredExtensionHz = p18ThresholdHzForLevel(selectedP18TargetBasis, 1);
  const positiveEqDemandCurve = (canonicalResult.positiveEqDemandCurve || []).map((point) => ({
    frequency: point.frequency,
    spl: Number(point.demandDb ?? point.spl) || 0,
  }));

  // Retain the approved product-only assessment as a diagnostic/fallback, but
  // publish P14 from the product-aware maximum SPL envelope at the actual RSP.
  const productP14Diagnostic = assessP14Capability({
    activeSubs,
    combinedEqCurve: positiveEqDemandCurve,
    targetBasis: p14TargetBasis,
  });
  const p14 = buildPositionAwareP14Capability({
    canonicalResult,
    productDiagnostic: productP14Diagnostic,
    targetBasis: p14TargetBasis,
    requiredExtensionHz: p14AssessmentStartHz,
  });
  const achievedP14Db = p14?.value ?? null;
  const achievedP14Level = p14?.level ?? 0;

  const requestedP14Pass = Number.isFinite(achievedP14Db) && Number.isFinite(selectedTargetDb)
    ? achievedP14Db >= selectedTargetDb
    : null;

  // ── P14 FAIL → P18/P19/P20 NOT EVALUATED ──
  // The selected P14 operating target is authoritative. When it cannot be
  // achieved, P18/P19/P20 are not graded under that operating point — no
  // fallback to a different SPL, no substitute lower bound, no persisted
  // grades. The designer sees the strict FAIL and the available maximum.
  if (requestedP14Pass === false) {
    return {
      selectedP14TargetBasis: p14TargetBasis,
      selectedP14Level: requestedLevel,
      selectedP14TargetDb: selectedTargetDb,
      selectedP14RequiredExtensionHz: p14AssessmentStartHz,
      idealHouseTarget: [],
      practicalCalibrationTarget: [],
      p19TargetIdentity: "not-evaluated",
      assessmentStartHz: null,
      assessmentEndHz: null,
      assessmentBandValid: false,
      availableP14CapabilityDb: achievedP14Db,
      requestedP14Pass: false,
      p14MarginDb: Number.isFinite(achievedP14Db) && Number.isFinite(selectedTargetDb) ? achievedP14Db - selectedTargetDb : null,
      maximumAchievableMinimumLevel: p14?.minimumLevel ?? 0,
      maximumAchievableRecommendedLevel: p14?.recommendedLevel ?? 0,
      achievedP14Db,
      achievedP14Level,
      achievedP14MinimumLevel: p14?.minimumLevel ?? 0,
      achievedP14RecommendedLevel: p14?.recommendedLevel ?? 0,
      minimumLevel: p14?.minimumLevel ?? 0,
      recommendedLevel: p14?.recommendedLevel ?? 0,
      limitingFrequencyHz: p14?.limitingFrequency ?? null,
      headroomConsumedByEqDb: p14?.headroomConsumedByEqDb ?? null,
      p14CapabilityDetails: p14,
      p14TargetBasis,
      p18TargetBasis: selectedP18TargetBasis,
      selectedP18TargetBasis,
      selectedP18RequiredExtensionHz: requiredExtensionHz,
      // P18/P19/P20 not evaluated at the requested operating point
      achievedP18FrequencyHz: null,
      achievedP18DesignHz: null,
      p18PerformanceBand: null,
      p18PerformanceMultiplier: null,
      achievedP18Level: 0,
      p18AchievedAuthority: null,
      p18Limitation: "Not evaluated at requested operating point",
      p18Evaluated: false,
      p18NotEvaluatedReason: "p14-operating-point-not-achieved",
      achievedP19VariationDb: null,
      achievedP19Level: null,
      p19AssessmentReady: false,
      officialP19VariationDb: null,
      officialP19WorstFrequencyHz: null,
      perSeatP19Results: [],
      p19Evaluated: false,
      p19NotEvaluatedReason: "p14-operating-point-not-achieved",
      achievedP20VariationDb: null,
      achievedP20Level: null,
      worstP20SeatId: null,
      perSeatP20Results: [],
      p20Available: false,
      p20Evaluated: false,
      p20NotEvaluatedReason: "p14-operating-point-not-achieved",
      postEqCapabilityAssessment: null,
      limitation: "P14 operating target not achieved — P18/P19/P20 not evaluated",
      requestedP18Pass: null,
      p18RequiredExtensionAssessment: null,
      requiredExtensionHz,
      targetWarning: buildBassTargetWarning({
        p14Pass: false,
        p18Pass: null,
        p14ShortfallDb: Number.isFinite(achievedP14Db) && Number.isFinite(selectedTargetDb) ? selectedTargetDb - achievedP14Db : null,
        p14LimitingFrequencyHz: p14?.limitingFrequency ?? null,
        p18ShortfallHz: null,
        p18RequiredExtensionHz: requiredExtensionHz,
      }),
    };
  }

  // P18: find the achieved extension from the fixed post-EQ design at the
  // selected P14 operating level. Uses the 60–200 Hz median method (METHOD A)
  // — refDb = median of 1/3-octave-smoothed response over 60–200 Hz,
  // cutoffDb = refDb − 3, F3 = sustained extension walk.
  //
  // Product capability validity floor: the highest (worst) lowest engineering
  // frequency among active subwoofers. The system cannot claim product-limited
  // SPL capability below this floor — a response still above the -3 dB cutoff
  // there is a bounded result (≤ floor), not a measured crossing.
  const productCurveMinHzValues = (activeSubs || [])
    .map((sub) => getProductCurveFrequencyRange(sub?.modelKey ?? sub?.model)?.minHz)
    .filter(Number.isFinite);
  const productCurveMinHz = productCurveMinHzValues.length ? Math.max(...productCurveMinHzValues) : null;
  const extensionAssessment = assessP18AgainstRequiredExtension({
    rspPostEqCurve: canonicalResult.canonicalPostEqRsp,
    canonicalTargetCurve: canonicalResult.canonicalTargetCurve,
    perSeatPostEqCurves: canonicalResult.canonicalPostEqSeatResponses,
    selectedP14TargetDb: selectedTargetDb,
    requiredExtensionHz,
    p18CutoffDb: requested?.p18CutoffDb,
    configuredUsableLfHz: usableLfHz,
    productCurveMinHz,
  });
  const extensionShapePass = extensionAssessment?.passes ?? null;
  const requestedP18Pass = extensionShapePass;
  const p18RequiredExtensionAssessment = extensionAssessment ? {
    ...extensionAssessment,
    extensionShapePass,
    p14CapabilityPass: requestedP14Pass,
    conditionalOnP14: false,
    passes: requestedP18Pass,
    failureReason: extensionShapePass === false ? "in-room-extension-shortfall" : null,
  } : null;
  const achievedP18FrequencyHz = extensionAssessment?.achievedExtensionHz ?? null;
  const independentP18Assessment = assessP18Extension(achievedP18FrequencyHz, selectedP18TargetBasis);
  const achievedP18Level = independentP18Assessment.level ?? 0;
  const p18 = extensionAssessment ? {
    ...extensionAssessment,
    ...independentP18Assessment,
    value: achievedP18FrequencyHz,
    level: achievedP18Level > 0 ? `L${achievedP18Level}` : null,
    targetBasis: selectedP18TargetBasis,
    gradedIndependentlyFromP14: true,
    p14CapabilityPass: requestedP14Pass,
    source: "in-room-60-200-median-sustained-extension",
  } : null;

  // ── Single P19/P20 assessment-band authority ──
  // The band is [achieved P18 F3 → room transition], valid only when P14
  // passes AND a legitimate sustained P18 F3 exists. When invalid, P19/P20
  // are not evaluated — no fallback to a different lower bound.
  const transitionHz = canonicalResult.assessmentEndHz ?? null;
  const assessmentBand = resolveBassAssessmentBand({
    p14Pass: requestedP14Pass === true,
    achievedP18Hz: achievedP18FrequencyHz,
    transitionHz,
  });
  const p19AssessmentStartHz = assessmentBand.valid ? assessmentBand.lowerHz : null;
  const p19AssessmentEndHz = assessmentBand.valid ? assessmentBand.upperHz : null;

  // ── Practical Calibration Target T(f) ──
  // P19 measures response smoothness against T(f), not the ideal H(f). T(f)
  // follows the ideal house curve where the system can physically achieve it
  // and rolls smoothly toward the broad LF capability envelope where it cannot.
  const idealHouseTarget = (Array.isArray(canonicalResult.canonicalTargetCurve) && canonicalResult.canonicalTargetCurve.length)
    ? canonicalResult.canonicalTargetCurve
    : [];
  const practicalCalibrationTarget = (Array.isArray(canonicalResult.practicalCalibrationTarget) && canonicalResult.practicalCalibrationTarget.length)
    ? canonicalResult.practicalCalibrationTarget
    : buildPracticalCalibrationTarget({
        idealTargetCurve: idealHouseTarget,
        capabilityEnvelope: buildSmoothCapabilityEnvelope(canonicalResult.maximumSplCurveAfterEq || canonicalResult.maximumSplCurveBeforeEq || []),
      });
  const p19TargetCurve = practicalCalibrationTarget.length ? practicalCalibrationTarget : idealHouseTarget;

  // When the assessment band is invalid (P14 passed but P18 F3 not achieved,
  // or transition not available), P19/P20 are NOT evaluated. No fallback to
  // a different lower bound — there is no valid assessment region.
  if (!assessmentBand.valid) {
    return {
      ...buildP14PassReturnObject({
        p14TargetBasis, requestedLevel, selectedTargetDb, p14AssessmentStartHz,
        achievedP14Db, achievedP14Level, p14, requestedP14Pass,
        selectedP18TargetBasis, requiredExtensionHz,
        achievedP18FrequencyHz, independentP18Assessment, achievedP18Level, p18,
        extensionAssessment, extensionShapePass, requestedP18Pass,
        p18RequiredExtensionAssessment, idealHouseTarget, practicalCalibrationTarget,
        assessmentBand,
      }),
      // P19/P20 not evaluated
      achievedP19VariationDb: null,
      achievedP19Level: null,
      p19AssessmentReady: false,
      officialP19VariationDb: null,
      officialP19WorstFrequencyHz: null,
      perSeatP19Results: [],
      p19Evaluated: false,
      p19NotEvaluatedReason: assessmentBand.reason || "p18-extension-not-achieved",
      achievedP20VariationDb: null,
      achievedP20Level: null,
      worstP20SeatId: null,
      perSeatP20Results: [],
      p20Available: false,
      p20Evaluated: false,
      p20NotEvaluatedReason: assessmentBand.reason || "p18-extension-not-achieved",
      postEqCapabilityAssessment: null,
      limitation: "P18 extension not achieved — P19/P20 not evaluated",
    };
  }

  // P19: canonical post-EQ RSP versus the Practical Calibration Target T(f)
  // (RSP only — the official RP22 P19 result is at the RSP relative to target).
  const p19 = computeOfficialP19Assessment({
    rspPostEqCurve: canonicalResult.canonicalPostEqRsp,
    canonicalTargetCurve: p19TargetCurve,
    assessmentStartHz: p19AssessmentStartHz,
    assessmentEndHz: p19AssessmentEndHz,
  });
  const officialP19VariationDb = p19?.variationDbRaw ?? null;
  const officialP19Level = houseCurveP19Level(officialP19VariationDb);
  const p19AssessmentReady = isCanonicalP19Ready({
    canonicalPostEqRsp: canonicalResult.canonicalPostEqRsp,
    canonicalTargetCurve: p19TargetCurve,
    officialVariationDb: officialP19VariationDb,
    officialLevel: officialP19Level,
  });
  const achievedP19VariationDb = p19AssessmentReady ? officialP19VariationDb : null;
  const achievedP19Level = p19AssessmentReady ? officialP19Level : null;
  const perSeatP19Results = computeOfficialPerSeatP19Assessment({
    perSeatPostEqCurves: canonicalResult.canonicalPostEqSeatResponses,
    canonicalTargetCurve: p19TargetCurve,
    assessmentStartHz: p19AssessmentStartHz,
    assessmentEndHz: p19AssessmentEndHz,
  });

  // P20: canonical post-EQ real seats versus the canonical post-EQ RSP.
  const p20 = computeOfficialP20Assessment({
    rspPostEqCurve: canonicalResult.canonicalPostEqRsp,
    perSeatPostEqCurves: canonicalResult.canonicalPostEqSeatResponses,
    assessmentStartHz: p19AssessmentStartHz,
    assessmentEndHz: p19AssessmentEndHz,
  });
  const achievedP20VariationDb = p20?.worstSeat?.variationDbRaw ?? null;
  const achievedP20Level = p20?.worstSeat?.level ?? 0;
  const p20Available = !!p20?.available;
  const postEqCapabilityAssessment = buildPostEqBassCapabilityOutcome({
    authority: { selectedTargetBasis: p14TargetBasis },
    requestedLevel,
    targetAnchorDb: requested?.p14TargetDb ?? null,
    scalarP14: p14,
    achievedP18Level,
    achievedP18FrequencyHz,
    achievedP19Level,
    achievedP19VariationDb,
    achievedP20Level,
    achievedP20VariationDb,
    p20Available,
    p18RequiredExtensionAssessment,
  });
  const targetWarning = buildBassTargetWarning({
    p14Pass: requestedP14Pass,
    p18Pass: requestedP18Pass,
    p14ShortfallDb: Number.isFinite(achievedP14Db) && Number.isFinite(selectedTargetDb) ? selectedTargetDb - achievedP14Db : null,
    p14LimitingFrequencyHz: p14?.limitingFrequency ?? null,
    p18ShortfallHz: p18RequiredExtensionAssessment?.shortfallHz ?? null,
    p18RequiredExtensionHz: requiredExtensionHz,
  });

  return {
    ...buildP14PassReturnObject({
      p14TargetBasis, requestedLevel, selectedTargetDb, p14AssessmentStartHz,
      achievedP14Db, achievedP14Level, p14, requestedP14Pass,
      selectedP18TargetBasis, requiredExtensionHz,
      achievedP18FrequencyHz, independentP18Assessment, achievedP18Level, p18,
      extensionAssessment, extensionShapePass, requestedP18Pass,
      p18RequiredExtensionAssessment, idealHouseTarget, practicalCalibrationTarget,
      assessmentBand,
    }),
    p18AchievedAuthority: p18 ? {
      ...p18,
      operatingP14CapabilityDb: achievedP14Db,
      operatingP14Level: achievedP14Level,
    } : null,
    achievedP19VariationDb,
    achievedP19Level,
    p19AssessmentReady,
    officialP19VariationDb: achievedP19VariationDb,
    officialP19WorstFrequencyHz: p19AssessmentReady ? (p19?.worstFrequencyHz ?? null) : null,
    perSeatP19Results,
    p19Evaluated: true,
    p19NotEvaluatedReason: null,
    achievedP20VariationDb,
    achievedP20Level,
    worstP20SeatId: p20?.worstSeat?.seatId ?? null,
    perSeatP20Results: p20?.perSeatResults || [],
    p20Available,
    p20Evaluated: true,
    p20NotEvaluatedReason: null,
    postEqCapabilityAssessment,
    limitation: postEqCapabilityAssessment.limitation,
    targetWarning,
  };
}