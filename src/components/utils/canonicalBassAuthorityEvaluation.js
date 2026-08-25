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
  // P18: find the achieved extension from the fixed post-EQ design at the
  // selected P14 operating level. Computed before P19/P20 so the precise
  // -3 dB crossing becomes the lower bound of the shared P19/P20 assessment
  // band (RP22: transition down to the achieved -3 dB lower limit).
  const extensionAssessment = assessP18AgainstRequiredExtension({
    rspPostEqCurve: canonicalResult.canonicalPostEqRsp,
    canonicalTargetCurve: canonicalResult.canonicalTargetCurve,
    perSeatPostEqCurves: canonicalResult.canonicalPostEqSeatResponses,
    selectedP14TargetDb: selectedTargetDb,
    requiredExtensionHz,
    p18CutoffDb: requested?.p18CutoffDb,
    configuredUsableLfHz: usableLfHz,
  });
  const extensionShapePass = extensionAssessment?.passes ?? null;
  const requestedP18Pass = extensionShapePass;
  const p18RequiredExtensionAssessment = extensionAssessment ? {
    ...extensionAssessment,
    extensionShapePass,
    p14CapabilityPass: requestedP14Pass,
    conditionalOnP14: false,
    passes: requestedP18Pass,
    failureReason: extensionShapePass === false ? "target-relative-extension-shortfall" : null,
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
    source: "selected-output-target-relative-rsp-extension-one-third-octave",
  } : null;

  // Shared P19/P20 assessment band: precise achieved P18 -3 dB crossing →
  // actual room transition frequency. Falls back to the domain band only
  // when the P18 crossing is not available.
  const p19AssessmentStartHz = Number.isFinite(achievedP18FrequencyHz) && achievedP18FrequencyHz > 0
    ? achievedP18FrequencyHz
    : (canonicalResult.assessmentStartHz ?? 20);
  const p19AssessmentEndHz = canonicalResult.assessmentEndHz ?? 120;

  // ── Practical Calibration Target T(f) ──
  // P19 measures response smoothness against T(f), not the ideal H(f). T(f)
  // follows the ideal house curve where the system can physically achieve it
  // and rolls smoothly toward the broad LF capability envelope where it cannot.
  // This removes the double-penalty where P18 already grades LF extension and
  // P19 penalised the same system again for being below an impossible target.
  // P18 continues to measure extension against the ideal H(f) (canonicalTargetCurve).
  const idealHouseTarget = (Array.isArray(canonicalResult.canonicalTargetCurve) && canonicalResult.canonicalTargetCurve.length)
    ? canonicalResult.canonicalTargetCurve
    : [];
  const practicalCalibrationTarget = (Array.isArray(canonicalResult.practicalCalibrationTarget) && canonicalResult.practicalCalibrationTarget.length)
    ? canonicalResult.practicalCalibrationTarget
    : buildPracticalCalibrationTarget({
        idealTargetCurve: idealHouseTarget,
        capabilityEnvelope: buildSmoothCapabilityEnvelope(canonicalResult.maximumSplCurveAfterEq || canonicalResult.maximumSplCurveBeforeEq || []),
      });
  // P19 target identity: the practical calibration target T(f).
  const p19TargetCurve = practicalCalibrationTarget.length ? practicalCalibrationTarget : idealHouseTarget;

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
  // P19 per-seat: RP22 marks P19 as Room/Seat = Seat. Per-seat P19 grades are
  // the official P19 results for each seat. The RSP is the calibration/target
  // reference; per-seat deviations relative to target are the seat-scoped grades.
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
    selectedP14TargetBasis: p14TargetBasis,
    selectedP14Level: requestedLevel,
    selectedP14TargetDb: selectedTargetDb,
    selectedP14RequiredExtensionHz: p14AssessmentStartHz,
    // Explicit target identities so downstream code can distinguish which
    // definition a curve uses. P18 references idealHouseTarget; P19 references
    // practicalCalibrationTarget. P20 uses neither (seat-vs-RSP only).
    idealHouseTarget,
    practicalCalibrationTarget,
    p19TargetIdentity: practicalCalibrationTarget.length ? "practical-calibration-target" : "ideal-house-target",
    // Authoritative P19/P20 assessment band: precise achieved P18 -3 dB
    // crossing → actual room transition frequency. This is the single
    // authority consumed by the graph marker, persisted cache, and any
    // report/debug text describing the assessment band. Falls back to the
    // domain band (20 Hz) only when the P18 crossing is genuinely unavailable.
    assessmentStartHz: p19AssessmentStartHz,
    assessmentEndHz: p19AssessmentEndHz,
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
    achievedP18DesignHz: independentP18Assessment.designHz,
    p18PerformanceBand: independentP18Assessment.performanceBand,
    p18PerformanceMultiplier: independentP18Assessment.performanceMultiplier,
    achievedP18Level,
    p18AchievedAuthority: p18 ? {
      ...p18,
      operatingP14CapabilityDb: achievedP14Db,
      operatingP14Level: achievedP14Level,
    } : null,
    p18Limitation: achievedP18FrequencyHz == null || achievedP18Level === 0
      ? "Canonical post-EQ extension does not achieve P18 Level 1"
      : null,
    achievedP19VariationDb,
    achievedP19Level,
    p19AssessmentReady,
    officialP19VariationDb: achievedP19VariationDb,
    officialP19WorstFrequencyHz: p19AssessmentReady ? (p19?.worstFrequencyHz ?? null) : null,
    perSeatP19Results,
    achievedP20VariationDb,
    achievedP20Level,
    worstP20SeatId: p20?.worstSeat?.seatId ?? null,
    perSeatP20Results: p20?.perSeatResults || [],
    p20Available,
    postEqCapabilityAssessment,
    limitation: postEqCapabilityAssessment.limitation,
    requestedP18Pass,
    p18RequiredExtensionAssessment,
    requiredExtensionHz,
    targetWarning,
  };
}