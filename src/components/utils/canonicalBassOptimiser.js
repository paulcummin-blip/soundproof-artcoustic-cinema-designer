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
import { getCurrentSystemSourceOutput, getSystemSourceCapability, getSourceDomainBoostAllowance } from "@/components/utils/subwooferCapability";
import { salvagePartialBank, buildSalvageEqResult } from "@/components/utils/designEqPartialBankSalvage";

const FIT_PROFILES = [DESIGN_EQ_FIT_PROFILES.standard, DESIGN_EQ_FIT_PROFILES.accuracy];

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

function buildOperatingOutputDiagnostics(activeSubs, usableLfHz, selectedOperatingOutputDb, correctionStartHz, correctionEndHz) {
  const authority = "selected-p14-target";
  if (!Array.isArray(activeSubs) || !activeSubs.length || !Number.isFinite(selectedOperatingOutputDb)) {
    return {
      selectedOperatingOutputDb: Number.isFinite(selectedOperatingOutputDb) ? selectedOperatingOutputDb : null,
      productCapabilityAuthoritySource: authority,
      maximumAllowedBoostByFrequency: [],
      firstBindingConstraint: null,
    };
  }
  const bandFrequencies = [20, 25, 31.5, 40, 50, 63, 80, 100, 120, 141.68, 150, 200]
    .filter((f) => f >= (correctionStartHz || 20) && f <= (correctionEndHz || 200));
  const maximumAllowedBoostByFrequency = bandFrequencies.map((frequency) => {
    const allowance = getSourceDomainBoostAllowance({
      frequency,
      requestedBoostDb: 6,
      activeSubs,
      usableLfHz,
      maxBoostDb: 6,
      requestedSystemOutputDb: selectedOperatingOutputDb,
    });
    return {
      frequency,
      allowedBoostDb: Number.isFinite(allowance.allowedBoostDb) ? allowance.allowedBoostDb : 6,
      systemCapabilityDb: allowance.systemCapabilityDb ?? null,
      availableHeadroomDb: allowance.availableHeadroomDb ?? null,
    };
  });
  const firstBinding = maximumAllowedBoostByFrequency.find((point) =>
    Number.isFinite(point.allowedBoostDb) && point.allowedBoostDb < 6 - 0.05
  );
  return {
    selectedOperatingOutputDb,
    productCapabilityAuthoritySource: authority,
    maximumAllowedBoostByFrequency,
    firstBindingConstraint: firstBinding
      ? { frequency: firstBinding.frequency, allowedBoostDb: firstBinding.allowedBoostDb, constraintType: "product-headroom" }
      : null,
  };
}

function buildCanonicalCandidate({ rawCurve, levelNormalisedRawCurve, operatingLevelOffsetDb, perSeatRawCurves, eq, domains, targetCurve, targetShape, verticalOffsetDb, protectedNullRegions, baseRequestedSystemOutputDb, operatingSystemOutputDb, requestedOperatingLevelOffsetDb, selectedOperatingOutputDb, operatingOutputDiagnostics }) {
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
    requestedOperatingLevelOffsetDb: Number.isFinite(requestedOperatingLevelOffsetDb) ? requestedOperatingLevelOffsetDb : 0,
    baseRequestedSystemOutputDb: Number.isFinite(baseRequestedSystemOutputDb) ? baseRequestedSystemOutputDb : null,
    operatingSystemOutputDb: Number.isFinite(operatingSystemOutputDb) ? operatingSystemOutputDb : null,
    selectedOperatingOutputDb: Number.isFinite(selectedOperatingOutputDb) ? selectedOperatingOutputDb : null,
    operatingOutputDiagnostics: operatingOutputDiagnostics || null,
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
  // ── Source-domain operating authority (Stage C3) ──
  // The canonical source-domain operating output is the selected P14 target
  // itself — the same authority used by the P14 capability diagnostic. The
  // fitter's headroom calculation (systemCapability - operatingOutput) must
  // use this value, NOT the response-domain operatingSystemOutputDb (which
  // mixes baseRequestedSystemOutputDb with the RSP operating-level offset).
  // Domain separation:
  //   selectedOperatingOutputDb      — source-domain product operating output (= P14 target)
  //   operatingSystemOutputDb        — response-domain graph trim baseline (base + offset)
  //   appliedOperatingLevelOffsetDb  — response-domain RSP vertical shift
  const selectedOperatingOutputDb = Number.isFinite(selectedP14TargetDb)
    ? Number(selectedP14TargetDb)
    : (Number.isFinite(baseRequestedSystemOutputDb) ? baseRequestedSystemOutputDb : null);
  const operatingOutputDiagnostics = buildOperatingOutputDiagnostics(
    activeSubs, usableLfHz, selectedOperatingOutputDb, domains.correctionStartHz, domains.correctionEndHz,
  );
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
    p14TargetDb: Number(selectedP14TargetDb),
    canonicalTargetCurve: targetCurve,
    protectedNullRegions,
    fitProfile: profile,
    assessmentStartHz: domains.correctionStartHz,
    assessmentEndHz: domains.correctionEndHz,
    collectDiagnostics,
    initialFilters,
    requestedSystemOutputDb: selectedOperatingOutputDb,
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

  const eqCandidates = eqResults.map((eq) => buildCanonicalCandidate({
    rawCurve, levelNormalisedRawCurve, operatingLevelOffsetDb: appliedOperatingLevelOffsetDb, perSeatRawCurves: levelNormalisedSeats, eq, domains, targetCurve, targetShape, verticalOffsetDb, protectedNullRegions,
    baseRequestedSystemOutputDb, operatingSystemOutputDb, requestedOperatingLevelOffsetDb, selectedOperatingOutputDb, operatingOutputDiagnostics,
  }));

  // ── Partial-bank salvage ──
  // When a generated bank fails validation, create sanitised and cut-only
  // candidates from the same filters. Safe cuts are retained; unsafe boosts
  // are removed. One impossible boost does not discard unrelated valid cuts.
  const salvagedCandidates = [];
  const salvageDiagnosticsByProfile = {};
  const salvageTriggerDiagnosticsByProfile = {};
  for (let i = 0; i < eqResults.length; i++) {
    const eq = eqResults[i];
    const baseProfile = eq.designEqFitProfile || (i === 0 ? "standard" : i === 1 ? "accuracy" : "house_curve");
    // ── Explicit validation authority ──
    // A normal full-bank candidate is proven valid only when physical authority
    // is explicitly passed AND the profile-specific bank result is explicitly
    // true. Missing/undefined validation metadata is NOT proof of safety — it
    // triggers salvage so the bank is revalidated from first principles.
    const profileBankAllOk = eq.designEqFitProfile === "house_curve"
      ? eq.bankLimits?.allOk
      : eq.bankDiagnostics?.selectedBankLimits?.allOk;
    const normalBankIsProvenValid =
      eq.physicalEqAuthorityPassed === true
      && (eq.bankValidationPassed === true || profileBankAllOk === true);
    const eqBankFails = !normalBankIsProvenValid;
    salvageTriggerDiagnosticsByProfile[baseProfile] = {
      designEqFitProfile: eq.designEqFitProfile,
      physicalEqAuthorityPassed: eq.physicalEqAuthorityPassed,
      bankValidationPassed: eq.bankValidationPassed,
      profileBankAllOk,
      normalBankIsProvenValid,
      eqBankFails,
      salvageInvoked: eqBankFails,
    };
    if (!eqBankFails) continue;
    const salvageProfile = baseProfile === "house_curve"
      ? { ...DESIGN_EQ_FIT_PROFILES.accuracy, id: "house_curve", preserveP14: false, maximumCutDb: 15 }
      : (DESIGN_EQ_FIT_PROFILES[baseProfile] || DESIGN_EQ_FIT_PROFILES.standard);
    const salvage = salvagePartialBank({
      filters: eq.filters || [],
      rawCurve: levelNormalisedRawCurve,
      activeSubs,
      usableLfHz,
      requestedSystemOutputDb: selectedOperatingOutputDb,
      profile: salvageProfile,
      protectedNullRegions,
      canonicalTargetCurve: targetCurve,
      anchorDb: verticalOffsetDb,
    });
    salvageDiagnosticsByProfile[baseProfile] = salvage.diagnostics;
    if (salvage.sanitisedFilters.length > 0 && salvage.sanitisedBankLimits.allOk) {
      const sanitisedEq = buildSalvageEqResult({
        originalEq: eq,
        salvageFilters: salvage.sanitisedFilters,
        bankLimits: salvage.sanitisedBankLimits,
        profileMarker: `${baseProfile}_sanitised`,
        rawCurve: levelNormalisedRawCurve,
        canonicalTargetCurve: targetCurve,
        protectedNullRegions,
        stopReason: `salvaged sanitised bank — ${salvage.sanitisedFilters.length} filter(s) retained`,
      });
      salvagedCandidates.push(buildCanonicalCandidate({
        rawCurve, levelNormalisedRawCurve, operatingLevelOffsetDb: appliedOperatingLevelOffsetDb,
        perSeatRawCurves: levelNormalisedSeats, eq: sanitisedEq, domains, targetCurve, targetShape,
        verticalOffsetDb, protectedNullRegions,
        baseRequestedSystemOutputDb, operatingSystemOutputDb, requestedOperatingLevelOffsetDb, selectedOperatingOutputDb, operatingOutputDiagnostics,
      }));
    }
    if (salvage.cutOnlyFilters.length > 0 && salvage.cutOnlyBankLimits.allOk) {
      const cutOnlyEq = buildSalvageEqResult({
        originalEq: eq,
        salvageFilters: salvage.cutOnlyFilters,
        bankLimits: salvage.cutOnlyBankLimits,
        profileMarker: `${baseProfile}_cut_only`,
        rawCurve: levelNormalisedRawCurve,
        canonicalTargetCurve: targetCurve,
        protectedNullRegions,
        stopReason: `salvaged cut-only bank — ${salvage.cutOnlyFilters.length} cut filter(s) retained`,
      });
      salvagedCandidates.push(buildCanonicalCandidate({
        rawCurve, levelNormalisedRawCurve, operatingLevelOffsetDb: appliedOperatingLevelOffsetDb,
        perSeatRawCurves: levelNormalisedSeats, eq: cutOnlyEq, domains, targetCurve, targetShape,
        verticalOffsetDb, protectedNullRegions,
        baseRequestedSystemOutputDb, operatingSystemOutputDb, requestedOperatingLevelOffsetDb, selectedOperatingOutputDb, operatingOutputDiagnostics,
      }));
    }
  }

  // Identity candidate — a valid no-EQ fallback. Uses the level-normalised
  // raw response as both the pre-EQ and post-EQ curve. No filters, no EQ
  // correction, zero headroom consumption. Physically credible by definition.
  const identityEq = {
    designEqFitProfile: "identity",
    designEqFitProfileConfig: null,
    selectedStart: "identity",
    filters: [],
    curve: levelNormalisedRawCurve.map((point) => ({ ...point })),
    combinedEqCurve: [],
    fitterHouseCurveTarget: targetCurve,
    physicalEqAuthorityPassed: true,
    physicalAuthorityViolations: [],
    bankLimits: { allOk: true, boostLimitOk: true, cutLimitOk: true, sourceDomainHeadroomOk: true, maxAggregateBoostDb: 0, maxAggregateBoostHz: null, maxAggregateCutDb: 0, maxAggregateCutHz: null },
    bankDiagnostics: { selectedBankLimits: { allOk: true, boostLimitOk: true, cutLimitOk: true, sourceDomainHeadroomOk: true, maxAggregateBoostDb: 0, maxAggregateBoostHz: null, maxAggregateCutDb: 0, maxAggregateCutHz: null } },
    bankValidationPassed: true,
    rspObjectiveMaxDeviationDb: null,
    rspMaxDeviationDb: null,
    rspRmsDeviationDb: null,
    rspMeanSignedResidualDb: null,
    rspShapeRmsDeviationDb: null,
    iterationTrace: [],
    detectedRegions: [],
    candidateAcceptanceDiagnostics: [],
    candidateSelectionDiagnostics: [],
    filterDecisionDiagnostics: [],
    rejectedEqCandidates: [],
    seatToleranceAdjustedCandidates: [],
    seatRegressionToleranceDiagnostics: null,
    stopReason: "identity — no EQ applied",
    selectionReason: "Identity candidate — no EQ applied",
    houseCurveDiagnostics: null,
    worstSeatMaxDeviationDb: null,
    meanSeatMaxDeviationDb: null,
    rmsSeatTargetErrorDb: null,
    perSeatMetrics: [],
  };
  const identityCandidate = buildCanonicalCandidate({
    rawCurve, levelNormalisedRawCurve, operatingLevelOffsetDb: appliedOperatingLevelOffsetDb, perSeatRawCurves: levelNormalisedSeats, eq: identityEq, domains, targetCurve, targetShape, verticalOffsetDb, protectedNullRegions,
    baseRequestedSystemOutputDb, operatingSystemOutputDb, requestedOperatingLevelOffsetDb, selectedOperatingOutputDb, operatingOutputDiagnostics,
  });
  const candidates = annotateCandidatePoolForHouseCurveRanking([...eqCandidates, ...salvagedCandidates, identityCandidate]);
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
    salvagedCandidateCount: salvagedCandidates.length,
    salvageDiagnosticsByProfile,
    salvageTriggerDiagnosticsByProfile,
  };
  const rawSelectablePool = candidates.filter(isPhysicallyCredibleBassCandidate);
  // Minimum improvement guard: salvaged candidates must materially improve
  // at least one ranking metric versus identity to remain selectable.
  const identityForGuard = candidates.find((c) => c.designEqFitProfile === "identity");
  const identityRmsForGuard = identityForGuard?.houseCurveRankingRmsResidualDb;
  const identityMaxForGuard = identityForGuard?.houseCurveRankingMaxResidualDb;
  const MIN_SALVAGE_IMPROVEMENT_DB = 0.05;
  const isSalvagedProfile = (profile) => typeof profile === "string"
    && (profile.endsWith("_sanitised") || profile.endsWith("_cut_only"));
  const selectablePool = rawSelectablePool.filter((candidate) => {
    if (!isSalvagedProfile(candidate.designEqFitProfile)) return true;
    const rms = candidate.houseCurveRankingRmsResidualDb;
    const max = candidate.houseCurveRankingMaxResidualDb;
    const rmsImprovement = Number.isFinite(identityRmsForGuard) && Number.isFinite(rms)
      ? identityRmsForGuard - rms : 0;
    const maxImprovement = Number.isFinite(identityMaxForGuard) && Number.isFinite(max)
      ? identityMaxForGuard - max : 0;
    return rmsImprovement > MIN_SALVAGE_IMPROVEMENT_DB || maxImprovement > MIN_SALVAGE_IMPROVEMENT_DB;
  });
  const eqSelectableCount = selectablePool.filter((c) => c.designEqFitProfile !== "identity").length;
  const identityOnlyFallback = eqSelectableCount === 0 && selectablePool.length > 0;
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
    identityFitCount: 1,
    generationStatus: "complete",
    missingInputs: [],
    warningMessage: identityOnlyFallback
      ? "No physically valid EQ bank was available. Results show the achieved response without Design EQ."
      : null,
    canonical: true,
    diagnosticsIncluded,
    salvageDiagnostics: salvageDiagnosticsByProfile,
    __canonicalTrace__,
    canonicalVerticalOffsetDb: verticalOffsetDb,
    operatingLevelOffsetDb: appliedOperatingLevelOffsetDb,
    requestedOperatingLevelOffsetDb,
    baseRequestedSystemOutputDb,
    operatingSystemOutputDb,
    selectedOperatingOutputDb,
    operatingOutputDiagnostics,
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