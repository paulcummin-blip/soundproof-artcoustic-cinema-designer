import { calculateDesignEqCurve, DESIGN_EQ_FIT_PROFILES } from "@/components/utils/designEqCalibration";
import { calculateHouseCurveEqCurve } from "@/components/utils/houseCurveFitter";
import { calculateAllSeatMetricsFromCorrected } from "@/components/utils/houseCurveFitterCore";
import { annotateCandidatePoolForHouseCurveRanking } from "@/components/utils/houseCurveCandidateRankingMetrics";
import { isPhysicallyCredibleBassCandidate } from "@/components/utils/bassCandidatePoolEligibility";
import { applyBassSmoothing } from "@/components/room/bass/bassGraphSmoothing";
import { buildCurveSignature, buildFilterBankSignature, stampPoolAuthority } from "@/components/room/bass/bassResultAuthority";
import { BASS_OPTIMISER_POOL_VERSION } from "@/components/room/bass/bassOptimiserWorkerProtocol";
import {
  buildCanonicalAbsoluteHouseCurveTarget,
  deriveProductionEqVerticalAnchor,
  resolveHouseCurveDomains,
} from "@/components/utils/houseCurveTargetAuthority";
import { identifyProtectedNullRegions } from "@/components/utils/houseCurveFitProtection";
import { normaliseHouseCurveToP14Total, requiredP14ExtensionHz, integrateRawResponseLevelDbC } from "@/components/utils/p14HouseCurveNormalisation";
import { artcousticHouseCurveOffsetAt } from "@/components/utils/artcousticHouseCurve";
import { getCurrentSystemSourceOutput, getSystemSourceCapability } from "@/components/utils/subwooferCapability";

const FIT_PROFILES = [DESIGN_EQ_FIT_PROFILES.standard, DESIGN_EQ_FIT_PROFILES.accuracy];

// ── Source reference tolerance ──
// The raw response peak should be within this tolerance of the system capability
// to confirm the simulation was run at the same source level as
// baseRequestedSystemOutputDb. Room gain can push the peak above the capability,
// so the tolerance is generous on the high side. On the low side, the peak should
// not be far below the capability (which would indicate the simulation was run at
// a lower level than the capability curve).
const SOURCE_REFERENCE_TOLERANCE_DB = 6;

/**
 * Verify that the raw simulated response was generated at baseRequestedSystemOutputDb.
 * The simulation engine uses the sub's capability curve as the source curve, so the
 * raw response peak should be close to the system capability. If the raw response
 * and baseRequestedSystemOutputDb do not refer to the same source operating level,
 * the operating offset would be calculated from mismatched authorities.
 *
 * Returns { consistent: boolean, message: string }.
 */
function verifyRawResponseSourceReference(rawCurve, activeSubs, baseRequestedSystemOutputDb) {
  if (!Array.isArray(rawCurve) || !rawCurve.length) {
    return { consistent: false, message: "BLOCKED: raw response and source-output references do not match (empty raw curve)" };
  }
  if (!Number.isFinite(baseRequestedSystemOutputDb)) {
    return { consistent: false, message: "BLOCKED: raw response and source-output references do not match (no configured source output)" };
  }
  // Compute the system capability at the peak frequency of the raw curve.
  const rawPeak = rawCurve.reduce((max, point) => Number.isFinite(point?.spl) && point.spl > max ? point.spl : max, -Infinity);
  if (!Number.isFinite(rawPeak)) {
    return { consistent: false, message: "BLOCKED: raw response and source-output references do not match (no finite raw SPL)" };
  }
  // Find the frequency of the raw peak.
  const peakPoint = rawCurve.find((point) => Number.isFinite(point?.spl) && point.spl === rawPeak);
  const peakFrequencyHz = peakPoint?.frequency;
  if (!Number.isFinite(peakFrequencyHz)) {
    return { consistent: false, message: "BLOCKED: raw response and source-output references do not match (no peak frequency)" };
  }
  const systemCapabilityDb = getSystemSourceCapability(activeSubs, peakFrequencyHz);
  if (!Number.isFinite(systemCapabilityDb)) {
    return { consistent: false, message: "BLOCKED: raw response and source-output references do not match (no system capability)" };
  }
  // The raw response peak should be close to the system capability (within tolerance).
  // Room gain can push the peak above the capability, so allow generous tolerance.
  const deltaDb = rawPeak - systemCapabilityDb;
  if (Math.abs(deltaDb) > SOURCE_REFERENCE_TOLERANCE_DB) {
    return {
      consistent: false,
      message: `BLOCKED: raw response and source-output references do not match (raw peak ${rawPeak.toFixed(1)} dB vs capability ${systemCapabilityDb.toFixed(1)} dB at ${peakFrequencyHz.toFixed(1)} Hz, delta ${deltaDb.toFixed(1)} dB)`,
    };
  }
  return { consistent: true, message: null };
}

/**
 * Clamp a positive global operating-level offset to the maximum safe scalar
 * increase supported by the selected subwoofer system. The applied positive
 * offset must not exceed the least available frequency-dependent source
 * headroom within the required P14 operating band. Negative offsets (level
 * reduction) apply completely — they increase available headroom.
 *
 * Uses the existing approved product authority only (getSystemSourceCapability).
 */
function clampPositiveOperatingOffset(requestedOffsetDb, activeSubs, baseRequestedSystemOutputDb, requiredExtensionHz) {
  if (!Number.isFinite(requestedOffsetDb)) return 0;
  // Negative or zero offsets apply completely.
  if (requestedOffsetDb <= 0) return requestedOffsetDb;
  // Positive offsets: determine the maximum safe scalar increase.
  if (!Number.isFinite(baseRequestedSystemOutputDb)) return 0;
  // Sample the system capability across the P14 operating band.
  const bandFrequencies = [20, 25, 31.5, 40, 50, 63, 80, 100, 120]
    .filter((f) => f >= requiredExtensionHz && f <= 120);
  let maxSafePositiveOffset = Infinity;
  for (const frequency of bandFrequencies) {
    const capabilityDb = getSystemSourceCapability(activeSubs, frequency);
    if (!Number.isFinite(capabilityDb)) continue;
    const headroomAtFrequency = capabilityDb - baseRequestedSystemOutputDb;
    maxSafePositiveOffset = Math.min(maxSafePositiveOffset, headroomAtFrequency);
  }
  if (!Number.isFinite(maxSafePositiveOffset)) return 0;
  // If the base output already exceeds capability everywhere, can't increase.
  if (maxSafePositiveOffset <= 0) return 0;
  return Math.min(requestedOffsetDb, maxSafePositiveOffset);
}

function interpolateCorrection(curve, frequency) {
  if (!Array.isArray(curve) || !curve.length) return 0;
  if (frequency <= curve[0].frequency) return curve[0].spl;
  if (frequency >= curve.at(-1).frequency) return curve.at(-1).spl;
  const upperIndex = curve.findIndex((point) => point.frequency >= frequency);
  const low = curve[upperIndex - 1];
  const high = curve[upperIndex];
  const ratio = (frequency - low.frequency) / (high.frequency - low.frequency);
  return low.spl + (high.spl - low.spl) * ratio;
}

function applyBankToSeats(seats, correction) {
  return (Array.isArray(seats) ? seats : []).filter((seat) => seat?.seatId !== "rsp" && Array.isArray(seat?.responseData))
    .map((seat) => ({
      seatId: seat.seatId,
      isPrimary: !!seat.isPrimary,
      responseData: seat.responseData.map((point) => ({
        frequency: point.frequency,
        spl: point.spl + interpolateCorrection(correction, point.frequency),
      })),
    }));
}

function bankLimits(eq) {
  const limits = eq.designEqFitProfile === "house_curve" ? eq.bankLimits : eq.bankDiagnostics?.selectedBankLimits;
  return {
    maxAggregateBoostDb: limits?.maxAggregateBoostDb ?? null,
    maxAggregateBoostHz: limits?.maxAggregateBoostHz ?? null,
    maxAggregateCutDb: limits?.maxAggregateCutDb ?? null,
    maxAggregateCutHz: limits?.maxAggregateCutHz ?? null,
    boostLimitOk: limits?.boostLimitOk ?? null,
    cutLimitOk: limits?.cutLimitOk ?? null,
    sourceDomainHeadroomOk: limits?.sourceDomainHeadroomOk ?? null,
    allOk: limits?.allOk ?? eq.bankValidationPassed ?? null,
  };
}

function buildCanonicalCandidate({ rawCurve, levelNormalisedRawCurve, operatingLevelOffsetDb, perSeatRawCurves, eq, domains, targetCurve, targetShape, verticalOffsetDb, protectedNullRegions, baseRequestedSystemOutputDb, operatingSystemOutputDb, requestedOperatingLevelOffsetDb }) {
  const perSeatPostEqCurves = applyBankToSeats(perSeatRawCurves, eq.combinedEqCurve);
  const seatsForMetrics = perSeatPostEqCurves.length
    ? perSeatPostEqCurves
    : [{ seatId: "rsp", isPrimary: true, responseData: eq.curve }];
  const seatMetrics = calculateAllSeatMetricsFromCorrected(
    seatsForMetrics,
    domains.p19StartHz,
    domains.p19EndHz,
    verticalOffsetDb,
    targetCurve,
  );
  const limits = bankLimits(eq);
  const positiveEqDemandCurve = (eq.combinedEqCurve || []).map((point) => ({
    frequency: point.frequency,
    demandDb: Math.max(0, Number(point.spl) || 0),
  }));
  const smoothed = applyBassSmoothing(eq.curve || [], "third")
    .filter((point) => point.frequency >= domains.correctionStartHz && point.frequency <= domains.correctionEndHz);
  return {
    canonical: true,
    designEqFitProfile: eq.designEqFitProfile || "standard",
    designEqFitProfileConfig: eq.designEqFitProfileConfig || null,
    startStrategy: eq.designEqFitProfile === "house_curve" ? "multi-start" : "single",
    selectedStart: eq.selectedStart ?? null,
    rawResponseCurve: rawCurve.map((point) => ({ ...point })),
    rspBeforePeqAtOperatingLevel: (levelNormalisedRawCurve || []).map((point) => ({ ...point })),
    operatingLevelOffsetDb: Number.isFinite(operatingLevelOffsetDb) ? operatingLevelOffsetDb : 0,
    rawResponseSignature: buildCurveSignature(rawCurve),
    generatedFilterBank: eq.filters || [],
    finalPostEqCurve: eq.curve || [],
    combinedEqCurve: eq.combinedEqCurve || [],
    perSeatPostEqCurves,
    productionHouseCurveTarget: targetCurve.map((point) => ({ ...point })),
    fitterHouseCurveTarget: (eq.fitterHouseCurveTarget || targetCurve).map((point) => ({ ...point })),
    canonicalHouseCurveShape: targetShape.map((point) => ({ ...point })),
    canonicalVerticalOffsetDb: verticalOffsetDb,
    positiveEqDemandCurve,
    protectedNullRegions: protectedNullRegions.map((region) => ({ ...region })),
    assessmentStartHz: domains.p19StartHz,
    assessmentEndHz: domains.p19EndHz,
    correctionStartHz: domains.correctionStartHz,
    correctionEndHz: domains.correctionEndHz,
    physicalEqAuthorityPassed: eq.physicalEqAuthorityPassed !== false,
    physicalAuthorityViolations: eq.physicalAuthorityViolations || [],
    bankValidationResult: limits,
    aggregateBankLimits: limits,
    physicalValidation: { passed: eq.physicalEqAuthorityPassed !== false && limits.allOk !== false, bankLimits: limits },
    fitMetrics: {
      maximumResidualDb: eq.rspObjectiveMaxDeviationDb ?? eq.rspMaxDeviationDb ?? eq.selectedCheckpoint?.maximumAbsoluteDeviationDb ?? null,
      rmsResidualDb: eq.rspRmsDeviationDb ?? eq.selectedCheckpoint?.rmsDeviationDb ?? null,
      meanSignedResidualDb: eq.rspMeanSignedResidualDb ?? null,
      shapeRmsResidualDb: eq.rspShapeRmsDeviationDb ?? null,
      smoothedPointCount: smoothed.length,
    },
    worstSeatMaxDeviationDb: seatMetrics?.worstSeatMaxDeviationDb ?? eq.worstSeatMaxDeviationDb ?? null,
    meanSeatMaxDeviationDb: seatMetrics?.meanSeatMaxDeviationDb ?? eq.meanSeatMaxDeviationDb ?? null,
    rmsSeatTargetErrorDb: seatMetrics?.rmsSeatTargetErrorDb ?? eq.rmsSeatTargetErrorDb ?? null,
    perSeatMetrics: seatMetrics?.seatMetrics ?? eq.perSeatMetrics ?? [],
    rspObjectiveMaxDeviationDb: eq.rspObjectiveMaxDeviationDb ?? eq.rspMaxDeviationDb ?? null,
    rspRmsResidualDb: eq.rspRmsDeviationDb ?? eq.selectedCheckpoint?.rmsDeviationDb ?? null,
    rspMeanSignedResidualDb: eq.rspMeanSignedResidualDb ?? null,
    rspMeanAbsoluteResidualDb: null,
    rspShapeRmsResidualDb: eq.rspShapeRmsDeviationDb ?? null,
    designEqIterationTrace: eq.iterationTrace || [],
    designEqDetectedRegions: eq.detectedRegions || [],
    designEqCandidateAcceptanceDiagnostics: eq.candidateAcceptanceDiagnostics || [],
    designEqCandidateSelectionDiagnostics: eq.candidateSelectionDiagnostics || [],
    designEqFilterDecisionDiagnostics: eq.filterDecisionDiagnostics || [],
    rejectedEqCandidates: eq.rejectedEqCandidates || [],
    seatToleranceAdjustedCandidates: eq.seatToleranceAdjustedCandidates || [],
    seatRegressionToleranceDiagnostics: eq.seatRegressionToleranceDiagnostics || null,
    designEqStopReason: eq.stopReason || null,
    designEqSelectionReason: eq.selectionReason || null,
    designEqBankDiagnostics: eq.bankDiagnostics || null,
    houseCurveDiagnostics: eq.houseCurveDiagnostics || null,
  };
}

export function generateCanonicalCandidatePool({
  rawCurve = [], activeSubs = [], usableLfHz = null, transitionHz = 120,
  correctionEndHz = 200, perSeatRawCurves = [], collectDiagnostics = false,
  onProgress = null, reuseExactHouseCurveEvaluations = true,
  selectedP14TargetDb = 109, p14TargetBasis = "minimum", p14TargetLevel = 1,
} = {}) {
  const missingInputs = [!rawCurve.length && "rawCurve", !activeSubs.length && "activeSubs"].filter(Boolean);
  if (missingInputs.length) return stampPoolAuthority({
    poolVersion: BASS_OPTIMISER_POOL_VERSION, candidates: [], selectablePool: [], poolId: null,
    generatedCandidateCount: 0, physicallyCredibleCount: 0, generationStatus: "invalid-inputs", missingInputs,
    warningMessage: `Missing mandatory optimiser input${missingInputs.length > 1 ? "s" : ""}: ${missingInputs.join(", ")}`,
  });

  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  const domains = resolveHouseCurveDomains(rawCurve.map((point) => point.frequency), correctionEndHz);

  // ── Fixed house target: P14-normalised global vertical offset ──
  // The Artcoustic house-curve shape is shifted vertically by exactly one
  // global offset so that the complete applicable curve C-weighted power-sums
  // to the selected P14 target (e.g. 109 dBC for Minimum L1). This offset is
  // computed once and never changes during fitting — it is not moved by the
  // product model, subwoofer quantity, available headroom, current response
  // shape, P18/P19 results, or fitter failure.
  const houseCurveShape = [15, 20, 25, 31.5, 40, 50, 63, 80, 100, 120, 150, 200, 400]
    .map((f) => ({ frequency: f, offsetDb: artcousticHouseCurveOffsetAt(f) }));
  const requiredExtensionHz = requiredP14ExtensionHz(p14TargetBasis, p14TargetLevel);
  const p14Normalisation = normaliseHouseCurveToP14Total({
    houseCurveShape,
    selectedP14TargetDb: Number(selectedP14TargetDb),
    requiredExtensionHz,
    upperLfeHz: 120,
  });
  let verticalOffsetDb = p14Normalisation?.operatingCurveOffsetDb;
  if (!Number.isFinite(verticalOffsetDb)) {
    // Fallback: response-anchored offset (existing approved authority).
    verticalOffsetDb = deriveProductionEqVerticalAnchor(rawCurve);
  }
  if (!Number.isFinite(verticalOffsetDb)) return stampPoolAuthority({
    poolVersion: BASS_OPTIMISER_POOL_VERSION, candidates: [], selectablePool: [], poolId: null,
    generatedCandidateCount: 0, physicallyCredibleCount: 0, generationStatus: "invalid-anchor",
    missingInputs: ["canonicalVerticalOffsetDb"], warningMessage: "Could not align the house-curve shape to the raw response.",
  });
  const targetCurve = buildCanonicalAbsoluteHouseCurveTarget({
    frequencyGrid: rawCurve.map((point) => point.frequency), targetAnchorDb: verticalOffsetDb,
    correctionStartHz: domains.correctionStartHz, correctionEndHz: domains.correctionEndHz,
  });
  const targetShape = targetCurve.map((point) => ({ frequency: point.frequency, offsetDb: point.spl - verticalOffsetDb }));
  // Resolve seat curves before computing the operating-level offset.
  const seats = (Array.isArray(perSeatRawCurves) ? perSeatRawCurves : [])
    .filter((seat) => Array.isArray(seat?.responseData) && seat.responseData.length);
  // ── Source output before and after global trim ──
  // baseRequestedSystemOutputDb is the configured LFE output level (the level
  // the headroom calculation subtracts from the manufacturer capability curve).
  // Falls back to 114 dB when no tuning is configured on the sub objects.
  const baseRequestedSystemOutputDb = getCurrentSystemSourceOutput(activeSubs);
  // ── Raw response source reference check ──
  // The raw simulated response must have been generated at baseRequestedSystemOutputDb.
  // The simulation engine uses the sub's capability curve as the source curve, so
  // the raw response peak should be close to the system capability. If the raw
  // response and baseRequestedSystemOutputDb do not refer to the same source
  // operating level, the operating offset would be calculated from mismatched
  // authorities — block and return an error.
  const sourceReferenceCheck = verifyRawResponseSourceReference(rawCurve, activeSubs, baseRequestedSystemOutputDb);
  if (!sourceReferenceCheck.consistent) {
    return stampPoolAuthority({
      poolVersion: BASS_OPTIMISER_POOL_VERSION, candidates: [], selectablePool: [], poolId: null,
      generatedCandidateCount: 0, physicallyCredibleCount: 0, generationStatus: "blocked-source-mismatch",
      missingInputs: ["rawResponseSourceReference"], warningMessage: sourceReferenceCheck.message,
    });
  }
  // ── Global operating-level offset ──
  // The raw simulated RSP is at the physical maximum level. Before PEQ, a single
  // scalar offset places the complete response at the selected P14 operating
  // level (e.g. 109 dBC). This is system trim — it is NOT a PEQ filter, does not
  // consume a filter-bank slot, and does not count towards the −15 dB PEQ cut
  // limit. PEQ then corrects only the remaining shape residual relative to the
  // fixed house-curve target.
  const rawIntegratedLevelDbC = integrateRawResponseLevelDbC({
    rawCurve, lowerHz: requiredExtensionHz, upperHz: 120,
  });
  const requestedOperatingLevelOffsetDb = Number.isFinite(rawIntegratedLevelDbC)
    ? Number(selectedP14TargetDb) - rawIntegratedLevelDbC
    : 0;
  // ── Applied offset: negative offsets apply completely; positive offsets are
  // physically limited by the least available frequency-dependent source
  // headroom within the required P14 operating band. ──
  const appliedOperatingLevelOffsetDb = clampPositiveOperatingOffset(
    requestedOperatingLevelOffsetDb, activeSubs, baseRequestedSystemOutputDb, requiredExtensionHz,
  );
  // The operating source output after global trim — this is the level the PEQ
  // headroom calculation must use (NOT the pre-trim base output).
  const operatingSystemOutputDb = Number.isFinite(baseRequestedSystemOutputDb)
    ? Number(baseRequestedSystemOutputDb) + appliedOperatingLevelOffsetDb
    : appliedOperatingLevelOffsetDb;
  const levelNormalisedRawCurve = rawCurve.map((point) => ({
    ...point,
    spl: Number.isFinite(point.spl) ? point.spl + appliedOperatingLevelOffsetDb : point.spl,
  }));
  const levelNormalisedSeats = seats.map((seat) => ({
    ...seat,
    responseData: seat.responseData.map((point) => ({
      ...point,
      spl: Number.isFinite(point.spl) ? point.spl + appliedOperatingLevelOffsetDb : point.spl,
    })),
  }));
  const protectedNullRegions = identifyProtectedNullRegions(
    levelNormalisedRawCurve, domains.correctionStartHz, domains.correctionEndHz, verticalOffsetDb,
    activeSubs, usableLfHz, null, targetCurve,
  );
  const totalTasks = FIT_PROFILES.length + 1;
  let completedTasks = 0;
  const report = (phase) => onProgress?.({ phase, completedTasks, totalTasks, completedRequests: completedTasks, totalRequests: totalTasks });
  report("Canonical target aligned");

  const fitOptions = (profile, initialFilters = []) => ({
    targetAnchorDb: verticalOffsetDb,
    canonicalTargetCurve: targetCurve,
    protectedNullRegions,
    fitProfile: profile,
    assessmentStartHz: domains.correctionStartHz,
    assessmentEndHz: domains.correctionEndHz,
    collectDiagnostics,
    initialFilters,
    requestedSystemOutputDb: operatingSystemOutputDb,
  });
  const eqResults = [];
  const standardEq = calculateDesignEqCurve(levelNormalisedRawCurve, usableLfHz, activeSubs, fitOptions("standard"));
  eqResults.push(standardEq);
  completedTasks += 1;
  report("Canonical standard fit complete");
  // Seed the Accuracy and house-curve fitters from the standard fit's seed
  // checkpoint — a physically valid checkpoint with enabled filters that
  // improves RMS meaningfully without worsening max residual by more than a
  // small tolerance. Falls back to the selected checkpoint filters only if no
  // useful seed field exists. Never forces a seed when none qualified.
  const seedSource = (standardEq.standardSeedFilters && standardEq.standardSeedFilters.length)
    ? standardEq.standardSeedFilters
    : (standardEq.bestSeedFilters && standardEq.bestSeedFilters.length)
      ? standardEq.bestSeedFilters
      : (standardEq.filters || []);
  const seed = seedSource.filter((filter) => filter?.enabled);
  const accuracyEq = calculateDesignEqCurve(levelNormalisedRawCurve, usableLfHz, activeSubs, fitOptions("accuracy", seed));
  eqResults.push(accuracyEq);
  completedTasks += 1;
  report("Canonical accuracy fit complete");
  const houseEq = calculateHouseCurveEqCurve(levelNormalisedRawCurve, levelNormalisedSeats, usableLfHz, activeSubs, {
    ...fitOptions("house_curve", seed),
    assessmentStartHz: domains.p19StartHz,
    assessmentEndHz: domains.p19EndHz,
    fitStartHz: domains.correctionStartHz,
    fitEndHz: domains.correctionEndHz,
    correctionStartHz: domains.correctionStartHz,
    correctionEndHz: domains.correctionEndHz,
    reuseExactEvaluations: reuseExactHouseCurveEvaluations,
  });
  eqResults.push(houseEq);
  completedTasks += 1;
  report("Canonical house-curve fit complete");

  const candidates = annotateCandidatePoolForHouseCurveRanking(eqResults.map((eq) => buildCanonicalCandidate({
    rawCurve, levelNormalisedRawCurve, operatingLevelOffsetDb: appliedOperatingLevelOffsetDb, perSeatRawCurves: levelNormalisedSeats, eq, domains, targetCurve, targetShape, verticalOffsetDb, protectedNullRegions,
  })));
  const __canonicalTrace__ = {
    receivedCollectDiagnostics: collectDiagnostics,
    profiles: eqResults.map((eq, i) => {
      const candidate = candidates[i];
      const eqTrace = eq.__designEqTrace__ || {};
      return {
        profile: eq.designEqFitProfile || (i === 0 ? "standard" : i === 1 ? "accuracy" : "house_curve"),
        inputCollectDiagnostics: eqTrace.inputCollectDiagnostics ?? null,
        detectedRegionCount: eqTrace.detectedRegionCount ?? null,
        appendTrialCount: eqTrace.appendTrialCount ?? null,
        revisionTrialCount: eqTrace.revisionTrialCount ?? null,
        candidateAcceptanceDiagnosticsCount: eqTrace.candidateAcceptanceDiagnosticsCount ?? null,
        finalEnabledFilterCount: (eq.filters || []).filter((f) => f.enabled).length,
        finalFilterBankSignature: buildFilterBankSignature({ generatedFilterBank: eq.filters }),
        stopReason: eqTrace.stopReason ?? eq.stopReason ?? null,
        designEqCandidateAcceptanceDiagnosticsCountAfterMapping: Array.isArray(candidate?.designEqCandidateAcceptanceDiagnostics)
          ? candidate.designEqCandidateAcceptanceDiagnostics.length : null,
      };
    }),
  };
  const selectablePool = candidates.filter(isPhysicallyCredibleBassCandidate);
  const endedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  const poolId = `canonical:${buildCurveSignature(rawCurve)}:${activeSubs.length}:${seats.length}:${verticalOffsetDb.toFixed(4)}`;
  // Mark diagnosticsIncluded: true ONLY when collectDiagnostics was requested
  // AND the real production candidates actually carry acceptance diagnostic
  // arrays. This is a cache-capability flag — it never changes EQ behaviour,
  // ranking, targets, filters, or P14/P18/P19/P20.
  const diagnosticsIncluded = !!collectDiagnostics && candidates.some((candidate) =>
    Array.isArray(candidate?.designEqCandidateAcceptanceDiagnostics)
    && candidate.designEqCandidateAcceptanceDiagnostics.length > 0
  );
  return stampPoolAuthority({
    poolVersion: BASS_OPTIMISER_POOL_VERSION,
    candidates,
    selectablePool,
    poolId,
    generatedCandidateCount: candidates.length,
    physicallyCredibleCount: selectablePool.length,
    standardFitCount: 1,
    accuracyFitCount: 1,
    houseCurveFitCount: 1,
    generationStatus: "complete",
    missingInputs: [],
    warningMessage: null,
    canonical: true,
    diagnosticsIncluded,
    __canonicalTrace__,
    canonicalVerticalOffsetDb: verticalOffsetDb,
    operatingLevelOffsetDb: appliedOperatingLevelOffsetDb,
    requestedOperatingLevelOffsetDb,
    baseRequestedSystemOutputDb,
    operatingSystemOutputDb,
    canonicalHouseCurveShape: targetShape,
    canonicalTargetCurve: targetCurve,
    protectedNullRegions,
    transitionHz,
    performanceSummary: {
      totalOptimiserTimeMs: endedAt - startedAt,
      requestCount: 1,
      profileCount: totalTasks,
      candidateBankCount: candidates.length,
      seatCount: seats.length,
    },
  });
}