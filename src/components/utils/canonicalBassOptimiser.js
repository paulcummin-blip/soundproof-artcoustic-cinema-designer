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
import { identifyProtectedNullRegions, isProtectedSmoothedFrequency } from "@/components/utils/houseCurveFitProtection";
import { findAggregatePeakBoostViolations } from "@/components/utils/designEqPhysicsAuthority";
import { normaliseHouseCurveToP14Total } from "@/components/utils/p14HouseCurveNormalisation";
import { p18ThresholdHzForLevel } from "@/components/utils/p18ExtensionAuthority";
import { assessP14Capability } from "@/components/utils/p14CapabilityAuthority";
import { artcousticHouseCurveOffsetAt } from "@/components/utils/artcousticHouseCurve";
import { getCurrentSystemSourceOutput, getSystemSourceCapability, getSourceDomainBoostAllowance } from "@/components/utils/subwooferCapability";
import { salvagePartialBank, buildSalvageEqResult } from "@/components/utils/designEqPartialBankSalvage";
import { calculatePairedP14P18ProductionAuthority } from "@/components/utils/pairedP14P18ProductionAuthority";
import { buildPairedP14P18CandidateSummary } from "@/components/utils/pairedP14P18CandidateSummary";

const FIT_PROFILES = [DESIGN_EQ_FIT_PROFILES.standard, DESIGN_EQ_FIT_PROFILES.accuracy];
const MAXIMUM_SPL_SAFETY_MARGIN_DB = 2;
const PRODUCT_EXTENSION_REFERENCE_TOLERANCE_DB = 1.5;
const OPERATING_WINDOW_MAX_BOOST_DB = DESIGN_EQ_FIT_PROFILES.accuracy.maximumAggregateBoostDb;
const OPERATING_WINDOW_MAX_CUT_DB = DESIGN_EQ_FIT_PROFILES.accuracy.maximumCutDb;

/**
 * Apply the global calibration gain before PEQ, as a target-following
 * processor such as Dirac or ARC would. Attenuation is always safe. A
 * positive calibration gain is limited by the least available source-domain
 * headroom in the requested P14 operating band.
 */
function clampPositiveOperatingOffset(requestedOffsetDb, activeSubs, baseRequestedSystemOutputDb, requiredExtensionHz) {
  if (!Number.isFinite(requestedOffsetDb)) return 0;
  if (requestedOffsetDb <= 0) return requestedOffsetDb;
  if (!Number.isFinite(baseRequestedSystemOutputDb)) return 0;
  const bandFrequencies = [20, 25, 31.5, 40, 50, 63, 80, 100, 120]
    .filter((frequency) => frequency >= requiredExtensionHz && frequency <= 120);
  let maximumSafePositiveOffsetDb = Infinity;
  for (const frequency of bandFrequencies) {
    const capabilityDb = getSystemSourceCapability(activeSubs, frequency);
    if (!Number.isFinite(capabilityDb)) continue;
    maximumSafePositiveOffsetDb = Math.min(
      maximumSafePositiveOffsetDb,
      capabilityDb - baseRequestedSystemOutputDb,
    );
  }
  if (!Number.isFinite(maximumSafePositiveOffsetDb) || maximumSafePositiveOffsetDb <= 0) return 0;
  return Math.min(requestedOffsetDb, maximumSafePositiveOffsetDb);
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

export function deriveCorrectionWindowOperatingOffsetDb({
  rawCurve = [], targetCurve = [], assessmentStartHz = 20, assessmentEndHz = 200,
  protectedNullRegions = [], maximumAggregateBoostDb = OPERATING_WINDOW_MAX_BOOST_DB,
  maximumCutDb = OPERATING_WINDOW_MAX_CUT_DB, assessmentSmoothing = "third",
} = {}) {
  // RP22 P19/P20 grading is always one-third-octave smoothed, but this helper
  // also places the physical operating curve before PEQ. In that use, assess
  // the unsmoothed correction band so a useful room-created dip is not pulled
  // down simply because neighbouring peaks dominate a fractional-octave average.
  const assessmentCurve = assessmentSmoothing === "none"
    ? (Array.isArray(rawCurve) ? rawCurve : []).map((point) => ({ ...point }))
    : applyBassSmoothing(rawCurve, assessmentSmoothing);
  const correctablePoints = assessmentCurve
    .filter((point) => Number.isFinite(point?.frequency) && Number.isFinite(point?.spl)
      && point.frequency >= assessmentStartHz && point.frequency <= assessmentEndHz
      && !isProtectedSmoothedFrequency(point.frequency, protectedNullRegions))
    .map((point) => ({
      frequency: point.frequency,
      residualDb: point.spl - interpolateCorrection(targetCurve, point.frequency),
    }))
    .filter((point) => Number.isFinite(point.residualDb));
  if (!correctablePoints.length) {
    return {
      requestedOffsetDb: 0,
      selectionMode: "no-correctable-points",
      feasible: false,
      pointCount: 0,
      minimumResidualDb: null,
      maximumResidualDb: null,
      meanResidualDb: null,
      lowerOffsetBoundDb: null,
      upperOffsetBoundDb: null,
      assessmentStartHz,
      assessmentEndHz,
      assessmentSmoothing,
    };
  }
  const residuals = correctablePoints.map((point) => point.residualDb);
  const minimumResidualDb = Math.min(...residuals);
  const maximumResidualDb = Math.max(...residuals);
  const meanResidualDb = residuals.reduce((sum, residual) => sum + residual, 0) / residuals.length;
  const lowerOffsetBoundDb = -Math.max(0, maximumAggregateBoostDb) - minimumResidualDb;
  const upperOffsetBoundDb = Math.max(0, maximumCutDb) - maximumResidualDb;
  const meanAlignedOffsetDb = -meanResidualDb;
  const feasible = lowerOffsetBoundDb <= upperOffsetBoundDb;
  // When the response span fits inside the available +6 / -15 dB PEQ window,
  // centre it on the target without asking the filter bank for an impossible
  // boost or cut. If it cannot fit, place the response halfway between the two
  // incompatible bounds. This minimises the worst remaining error after the
  // maximum safe boost and cut, rather than preserving every valley at the cost
  // of leaving large peaks and turning the result into a level-only adjustment.
  const balancedInfeasibleOffsetDb = (lowerOffsetBoundDb + upperOffsetBoundDb) / 2;
  const requestedOffsetDb = feasible
    ? Math.min(upperOffsetBoundDb, Math.max(lowerOffsetBoundDb, meanAlignedOffsetDb))
    : balancedInfeasibleOffsetDb;
  return {
    requestedOffsetDb,
    selectionMode: feasible ? "mean-aligned-within-correction-window" : "balanced-unreachable-residual",
    feasible,
    pointCount: correctablePoints.length,
    minimumResidualDb,
    maximumResidualDb,
    meanResidualDb,
    lowerOffsetBoundDb,
    upperOffsetBoundDb,
    balancedInfeasibleOffsetDb,
    irreducibleShortfallDb: feasible ? 0 : Math.max(0, lowerOffsetBoundDb - requestedOffsetDb),
    irreducibleExcessDb: feasible ? 0 : Math.max(0, requestedOffsetDb - upperOffsetBoundDb),
    maximumAggregateBoostDb,
    maximumCutDb,
    assessmentStartHz,
    assessmentEndHz,
    assessmentSmoothing,
  };
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

function applyMaximumSplSafetyMargin(curve) {
  return (Array.isArray(curve) ? curve : []).map((point) => ({
    ...point,
    spl: Number.isFinite(point?.spl) ? point.spl - MAXIMUM_SPL_SAFETY_MARGIN_DB : point?.spl,
  }));
}

function buildMaximumSplCurveAfterEq(maximumBeforeEq) {
  // Product capability combined with the room transfer is a fixed, frequency-
  // dependent ceiling. Positive EQ may spend the local margin between the
  // operating response and this ceiling, but it must not lower every other
  // frequency by the largest boost in the bank. Cuts reduce the requested
  // operating response; the capability envelope itself does not move.
  return {
    globalEqTrimDb: 0,
    curve: (Array.isArray(maximumBeforeEq) ? maximumBeforeEq : []).map((point) => ({
      ...point,
    })),
  };
}

function capCurveToEnvelope(requestedCurve, maximumCurve) {
  if (!Array.isArray(maximumCurve) || !maximumCurve.length) {
    return (Array.isArray(requestedCurve) ? requestedCurve : []).map((point) => ({ ...point }));
  }
  return (Array.isArray(requestedCurve) ? requestedCurve : []).map((point) => {
    const maximumSpl = interpolateCorrection(maximumCurve, point.frequency);
    const requestedSpl = Number(point?.spl);
    if (!Number.isFinite(requestedSpl) || !Number.isFinite(maximumSpl)) return { ...point };
    return {
      ...point,
      spl: Math.min(requestedSpl, maximumSpl),
      requestedSpl,
      maximumSpl,
      capabilityLimited: requestedSpl > maximumSpl + 0.05,
    };
  });
}

export function buildProductOperatingEnvelope({
  frequencyGrid = [], targetCurve = [], activeSubs = [], combinedEqCurve = [],
  selectedOperatingOutputDb = null, targetBasis = "minimum",
} = {}) {
  if (!Array.isArray(frequencyGrid) || !frequencyGrid.length || !activeSubs.length
    || !Number.isFinite(Number(selectedOperatingOutputDb))) {
    return { curve: [], p14CapabilityDb: null, operatingMarginDb: null, operatingHeadroomDb: null, p14ShortfallDb: null, referenceCapabilityDb: null, extensionBandEndHz: null };
  }
  const productP14 = assessP14Capability({
    activeSubs,
    combinedEqCurve: (combinedEqCurve || []).map((point) => ({
      frequency: point.frequency,
      spl: Math.max(0, Number(point?.spl) || 0),
    })),
    targetBasis,
  });
  const p14CapabilityDb = Number(productP14?.p14CapabilityDb ?? productP14?.value);
  // Keep the signed operating margin. Clamping an impossible P14 request to
  // zero headroom would make the response look merely "at the limit" instead
  // of exposing the actual output shortfall.
  const operatingMarginDb = Number.isFinite(p14CapabilityDb)
    ? p14CapabilityDb - Number(selectedOperatingOutputDb)
    : 0;
  const operatingHeadroomDb = Math.max(0, operatingMarginDb);
  const p14ShortfallDb = Math.max(0, -operatingMarginDb);
  const capabilities = frequencyGrid.map((frequency) => ({
    frequency: Number(frequency),
    capabilityDb: getSystemSourceCapability(activeSubs, Number(frequency)),
  })).filter((point) => Number.isFinite(point.frequency) && Number.isFinite(point.capabilityDb));
  const referencePoints = capabilities.filter((point) => point.frequency >= 30 && point.frequency <= 120);
  const referenceCapabilityDb = referencePoints.length
    ? Math.max(...referencePoints.map((point) => point.capabilityDb))
    : null;
  if (!Number.isFinite(referenceCapabilityDb)) {
    return { curve: [], p14CapabilityDb, operatingMarginDb, operatingHeadroomDb, p14ShortfallDb, referenceCapabilityDb: null, extensionBandEndHz: null };
  }
  const extensionThresholdDb = referenceCapabilityDb - PRODUCT_EXTENSION_REFERENCE_TOLERANCE_DB;
  const extensionEntryIndex = capabilities.findIndex((point) => point.capabilityDb >= extensionThresholdDb);
  const extensionEntry = extensionEntryIndex >= 0 ? capabilities[extensionEntryIndex] : null;
  const extensionPrevious = extensionEntryIndex > 0 ? capabilities[extensionEntryIndex - 1] : null;
  const extensionBandEndHz = extensionEntry && extensionPrevious
    ? extensionPrevious.frequency + (extensionEntry.frequency - extensionPrevious.frequency)
      * Math.max(0, Math.min(1,
        (extensionThresholdDb - extensionPrevious.capabilityDb)
          / Math.max(1e-9, extensionEntry.capabilityDb - extensionPrevious.capabilityDb),
      ))
    : extensionEntry?.frequency ?? capabilities.at(-1)?.frequency ?? null;
  const curve = capabilities.map((point) => {
    const targetSpl = interpolateCorrection(targetCurve, point.frequency);
    const productRelativeCapabilityDb = point.capabilityDb - referenceCapabilityDb;
    const relativeProductLimitDb = productRelativeCapabilityDb
      + operatingMarginDb - MAXIMUM_SPL_SAFETY_MARGIN_DB;
    return {
      frequency: point.frequency,
      spl: Number.isFinite(targetSpl) ? targetSpl + relativeProductLimitDb : point.capabilityDb,
      productCapabilityDb: point.capabilityDb,
      productRelativeCapabilityDb,
      relativeProductLimitDb,
      extensionEnvelopeApplies: point.frequency <= extensionBandEndHz,
      extensionBandEndHz,
    };
  });
  return {
    curve,
    p14CapabilityDb,
    operatingMarginDb,
    operatingHeadroomDb,
    p14ShortfallDb,
    referenceCapabilityDb,
    extensionBandEndHz,
    authority: "power-summed-product-extension-envelope-at-selected-p14",
  };
}

function capCurveToProductOperatingEnvelope(requestedCurve, productEnvelope) {
  if (!Array.isArray(productEnvelope) || !productEnvelope.length) {
    return (Array.isArray(requestedCurve) ? requestedCurve : []).map((point) => ({ ...point }));
  }
  const extensionBandEndHz = Number(productEnvelope.find((point) => Number.isFinite(point?.extensionBandEndHz))?.extensionBandEndHz);
  return (Array.isArray(requestedCurve) ? requestedCurve : []).map((point) => {
    // The product-only envelope governs broad LF extension. It must not erase
    // ordinary room peaks in the correction band; those remain present and
    // must be reduced by the real EQ bank.
    if (!Number.isFinite(point?.frequency)
      || !Number.isFinite(extensionBandEndHz)
      || point.frequency > extensionBandEndHz) return { ...point };
    const productLimitSpl = interpolateCorrection(productEnvelope, point.frequency);
    if (!Number.isFinite(productLimitSpl) || !Number.isFinite(point?.spl)) return { ...point };
    return {
      ...point,
      requestedSpl: Number.isFinite(point.requestedSpl) ? point.requestedSpl : point.spl,
      productOperatingLimitSpl: productLimitSpl,
      spl: Math.min(point.spl, productLimitSpl),
      capabilityLimited: point.capabilityLimited === true || point.spl > productLimitSpl + 0.05,
    };
  });
}

function findAchievedProtectedNullBoostViolations(beforeCurve, afterCurve, protectedNullRegions) {
  return (Array.isArray(afterCurve) ? afterCurve : []).map((point) => {
    const region = (Array.isArray(protectedNullRegions) ? protectedNullRegions : [])
      .find((candidate) => point.frequency >= candidate.startHz && point.frequency <= candidate.endHz);
    if (!region) return null;
    const beforeSpl = interpolateCorrection(beforeCurve, point.frequency);
    const finalSpl = Number(point?.spl);
    const aggregateCorrectionDb = finalSpl - beforeSpl;
    return {
      authorityType: "protected-null-boost",
      frequencyHz: point.frequency,
      beforeSpl,
      finalSpl,
      aggregateCorrectionDb,
      protectedRegionStartHz: region.startHz,
      protectedRegionEndHz: region.endHz,
    };
  }).filter((point) => point && Number.isFinite(point.aggregateCorrectionDb)
    && point.aggregateCorrectionDb > 0.05);
}

function capabilityLimitedRegions(curve) {
  const points = (Array.isArray(curve) ? curve : []).filter((point) => point.capabilityLimited);
  if (!points.length) return [];
  const regions = [];
  let current = [];
  const close = () => {
    if (!current.length) return;
    const worst = current.reduce((result, point) => {
      const effectiveMaximumSpl = Math.min(
        Number.isFinite(point.maximumSpl) ? point.maximumSpl : Infinity,
        Number.isFinite(point.productOperatingLimitSpl) ? point.productOperatingLimitSpl : Infinity,
      );
      const shortfallDb = point.requestedSpl - effectiveMaximumSpl;
      return !result || shortfallDb > result.shortfallDb
        ? { frequencyHz: point.frequency, shortfallDb }
        : result;
    }, null);
    regions.push({
      startHz: current[0].frequency,
      endHz: current.at(-1).frequency,
      worstFrequencyHz: worst?.frequencyHz ?? null,
      maximumShortfallDb: worst?.shortfallDb ?? null,
    });
    current = [];
  };
  (Array.isArray(curve) ? curve : []).forEach((point) => {
    if (point.capabilityLimited) current.push(point);
    else close();
  });
  close();
  return regions;
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

function buildCanonicalCandidate({
  rawCurve, maximumSplCurveBeforeEq, levelNormalisedRawCurve, operatingLevelOffsetDb,
  perSeatRawCurves, perSeatMaximumSplCurves, eq, domains, targetCurve, targetShape,
  verticalOffsetDb, protectedNullRegions, baseRequestedSystemOutputDb,
  operatingSystemOutputDb, requestedOperatingLevelOffsetDb, selectedOperatingOutputDb,
  operatingOutputDiagnostics, pairedAuthorityInputs, activeSubs, p14TargetBasis,
}) {
  const requestedPreEqCurve = (levelNormalisedRawCurve || []).map((point) => ({ ...point }));
  const achievedPreEqCurve = capCurveToEnvelope(requestedPreEqCurve, maximumSplCurveBeforeEq);
  const maximumAfterEq = buildMaximumSplCurveAfterEq(maximumSplCurveBeforeEq);
  const unconstrainedPostEqCurve = (eq.curve || []).map((point) => ({ ...point }));
  const productOperatingEnvelope = buildProductOperatingEnvelope({
    frequencyGrid: unconstrainedPostEqCurve.map((point) => point.frequency),
    targetCurve,
    activeSubs,
    combinedEqCurve: eq.combinedEqCurve || [],
    selectedOperatingOutputDb,
    targetBasis: p14TargetBasis,
  });
  const roomEnvelopeLimitedPostEqCurve = capCurveToEnvelope(unconstrainedPostEqCurve, maximumAfterEq.curve);
  const finalPostEqCurve = capCurveToProductOperatingEnvelope(
    roomEnvelopeLimitedPostEqCurve,
    productOperatingEnvelope.curve,
  );
  // Candidate authority judges the response that can actually be delivered.
  // The fitter's requested curve may use local positive EQ up to the fixed
  // product-plus-room ceiling; anything above that ceiling is capability
  // limited. The fitter's unconstrained curve remains diagnostic-only.
  const achievedPeakBoostViolations = findAggregatePeakBoostViolations(
    achievedPreEqCurve, finalPostEqCurve, targetCurve,
  );
  const achievedProtectedNullBoostViolations = findAchievedProtectedNullBoostViolations(
    achievedPreEqCurve, finalPostEqCurve, protectedNullRegions,
  );
  const achievedPhysicalAuthorityViolations = [
    ...achievedPeakBoostViolations,
    ...achievedProtectedNullBoostViolations,
  ];
  const achievedPhysicalEqAuthorityPassed = achievedPhysicalAuthorityViolations.length === 0;
  const requestedPerSeatPostEqCurves = applyBankToSeats(perSeatRawCurves, eq.combinedEqCurve);
  const maximumPerSeatAfterEqCurves = (Array.isArray(perSeatMaximumSplCurves) ? perSeatMaximumSplCurves : [])
    .filter((seat) => seat?.seatId !== "rsp" && Array.isArray(seat?.responseData))
    .map((seat) => ({
      seatId: seat.seatId,
      isPrimary: !!seat.isPrimary,
      responseData: buildMaximumSplCurveAfterEq(seat.responseData).curve,
    }));
  const maximumSeatById = new Map(maximumPerSeatAfterEqCurves.map((seat) => [seat.seatId, seat]));
  const perSeatPostEqCurves = requestedPerSeatPostEqCurves.map((seat) => ({
    ...seat,
    responseData: capCurveToProductOperatingEnvelope(
      capCurveToEnvelope(
        seat.responseData,
        maximumSeatById.get(seat.seatId)?.responseData || [],
      ),
      productOperatingEnvelope.curve,
    ),
  }));
  const seatsForMetrics = perSeatPostEqCurves.length
    ? perSeatPostEqCurves
    : [{ seatId: "rsp", isPrimary: true, responseData: finalPostEqCurve }];
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
  const smoothed = applyBassSmoothing(finalPostEqCurve, "third")
    .filter((point) => point.frequency >= domains.correctionStartHz && point.frequency <= domains.correctionEndHz);
  const limitedRegions = capabilityLimitedRegions(finalPostEqCurve);
  const pairedP14P18Authority = calculatePairedP14P18ProductionAuthority({
    ...(pairedAuthorityInputs || {}),
    combinedEqCurve: eq.combinedEqCurve || [],
    selectedEqBankIdentity: buildFilterBankSignature({ generatedFilterBank: eq.filters || [] }),
  });
  const pairedP14P18Summary = buildPairedP14P18CandidateSummary(pairedP14P18Authority);
  return {
    canonical: true,
    designEqFitProfile: eq.designEqFitProfile || "standard",
    designEqFitProfileConfig: eq.designEqFitProfileConfig || null,
    startStrategy: eq.designEqFitProfile === "house_curve" ? "multi-start" : "single",
    selectedStart: eq.selectedStart ?? null,
    rawResponseCurve: rawCurve.map((point) => ({ ...point })),
    maximumSplCurveBeforeEq: (maximumSplCurveBeforeEq || []).map((point) => ({ ...point })),
    maximumSplCurveAfterEq: maximumAfterEq.curve.map((point) => ({ ...point })),
    productOperatingEnvelopeCurve: productOperatingEnvelope.curve.map((point) => ({ ...point })),
    productOperatingEnvelopeAuthority: productOperatingEnvelope.authority || null,
    productOperatingMarginDb: productOperatingEnvelope.operatingMarginDb,
    productOperatingHeadroomDb: productOperatingEnvelope.operatingHeadroomDb,
    productOperatingShortfallDb: productOperatingEnvelope.p14ShortfallDb,
    productExtensionBandEndHz: productOperatingEnvelope.extensionBandEndHz,
    productOperatingReferenceCapabilityDb: productOperatingEnvelope.referenceCapabilityDb,
    maximumSplSafetyMarginDb: MAXIMUM_SPL_SAFETY_MARGIN_DB,
    maximumSplGlobalEqTrimDb: maximumAfterEq.globalEqTrimDb,
    maximumSplAuthority: {
      method: "authoritative-position-aware-engine-envelope",
      version: "1.0.0",
      includesRoomGeometry: true,
      includesProductFrequencyResponse: true,
      includesProductOutputLimit: true,
      safetyMarginDb: MAXIMUM_SPL_SAFETY_MARGIN_DB,
    },
    requestedPreEqOperatingCurve: requestedPreEqCurve,
    rspBeforePeqAtOperatingLevel: achievedPreEqCurve,
    operatingLevelOffsetDb: Number.isFinite(operatingLevelOffsetDb) ? operatingLevelOffsetDb : 0,
    requestedOperatingLevelOffsetDb: Number.isFinite(requestedOperatingLevelOffsetDb) ? requestedOperatingLevelOffsetDb : 0,
    baseRequestedSystemOutputDb: Number.isFinite(baseRequestedSystemOutputDb) ? baseRequestedSystemOutputDb : null,
    operatingSystemOutputDb: Number.isFinite(operatingSystemOutputDb) ? operatingSystemOutputDb : null,
    selectedOperatingOutputDb: Number.isFinite(selectedOperatingOutputDb) ? selectedOperatingOutputDb : null,
    operatingOutputDiagnostics: operatingOutputDiagnostics || null,
    rawResponseSignature: buildCurveSignature(rawCurve),
    generatedFilterBank: eq.filters || [],
    unconstrainedPostEqCurve,
    finalPostEqCurve,
    combinedEqCurve: eq.combinedEqCurve || [],
    perSeatPostEqCurves,
    maximumPerSeatPostEqCurves: maximumPerSeatAfterEqCurves,
    capabilityLimitedRegions: limitedRegions,
    capabilityLimitedPointCount: finalPostEqCurve.filter((point) => point.capabilityLimited).length,
    pairedP14P18Authority,
    pairedP14P18Summary,
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
    physicalEqAuthorityPassed: achievedPhysicalEqAuthorityPassed,
    physicalAuthorityViolations: achievedPhysicalAuthorityViolations,
    achievedProtectedNullBoostViolations,
    requestedPhysicalAuthorityViolations: eq.physicalAuthorityViolations || [],
    bankValidationResult: limits,
    aggregateBankLimits: limits,
    physicalValidation: { passed: achievedPhysicalEqAuthorityPassed && limits.allOk !== false, bankLimits: limits },
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
  p18TargetBasis = p14TargetBasis, selectedP18RequiredExtensionHz = null,
  perSourceComplexTransfers = [], normalizedTransferFingerprint = null,
  calibrationFingerprint = null,
} = {}) {
  const missingInputs = [!rawCurve.length && "rawCurve", !activeSubs.length && "activeSubs"].filter(Boolean);
  if (missingInputs.length) return stampPoolAuthority({
    poolVersion: BASS_OPTIMISER_POOL_VERSION, candidates: [], selectablePool: [], poolId: null,
    generatedCandidateCount: 0, physicallyCredibleCount: 0, generationStatus: "invalid-inputs", missingInputs,
    warningMessage: `Missing mandatory optimiser input${missingInputs.length > 1 ? "s" : ""}: ${missingInputs.join(", ")}`,
  });

  const nowMs = () => typeof performance !== "undefined" ? performance.now() : Date.now();
  const startedAt = nowMs();
  const domains = resolveHouseCurveDomains(
    rawCurve.map((point) => point.frequency),
    correctionEndHz,
    transitionHz,
  );

  // ── Fixed house target: P14-normalised global vertical offset ──
  // P14 is the user's fixed total-LFE output request. Its 20–120 Hz
  // normalisation is independent of the P18 extension grade eventually achieved
  // at that output. P18 may improve when P14 is lowered and retreat when P14 is
  // raised; it must never move the P14 target or redefine the P14 integration
  // band.
  const houseCurveShape = [15, 20, 25, 31.5, 40, 50, 63, 80, 100, 120, 150, 200, 400]
    .map((f) => ({ frequency: f, offsetDb: artcousticHouseCurveOffsetAt(f) }));
  const requiredExtensionHz = Number.isFinite(Number(selectedP18RequiredExtensionHz))
    ? Number(selectedP18RequiredExtensionHz)
    : p18ThresholdHzForLevel(p18TargetBasis, 1);
  const p14AssessmentStartHz = 20;
  const p14Normalisation = normaliseHouseCurveToP14Total({
    houseCurveShape,
    selectedP14TargetDb: Number(selectedP14TargetDb),
    requiredExtensionHz: p14AssessmentStartHz,
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
  // Publish the target on the complete canonical response grid so graph,
  // P18 and metric authority all compare like-for-like. The fitter still only
  // applies filters inside the separate correction domain below.
  const targetCurve = buildCanonicalAbsoluteHouseCurveTarget({
    frequencyGrid: rawCurve.map((point) => point.frequency), targetAnchorDb: verticalOffsetDb,
    correctionStartHz: rawCurve[0].frequency, correctionEndHz: rawCurve.at(-1).frequency,
  });
  const targetShape = targetCurve.map((point) => ({ frequency: point.frequency, offsetDb: point.spl - verticalOffsetDb }));
  // The fitting objective is the requested house curve clipped only by the
  // fixed product-plus-room capability envelope. This lets the bank pull every
  // reachable region to the house curve while leaving genuine capability
  // shortfalls visible. Official RP22 scoring continues to use targetCurve,
  // never this constrained fitting target.
  // Resolve seat curves before computing the operating-level offset.
  const seats = (Array.isArray(perSeatRawCurves) ? perSeatRawCurves : [])
    .filter((seat) => Array.isArray(seat?.responseData) && seat.responseData.length);
  // The authoritative engine output is the maximum product-aware response at
  // each position. Reserve the same continuous-output safety margin used by
  // the P14 authority before it becomes the hard graph/EQ envelope.
  const maximumSplCurveBeforeEq = applyMaximumSplSafetyMargin(rawCurve);
  const perSeatMaximumSplCurves = seats.map((seat) => ({
    ...seat,
    responseData: applyMaximumSplSafetyMargin(seat.responseData),
  }));
  const capabilityConstrainedFitTarget = targetCurve.map((point) => {
    const maximumSpl = interpolateCorrection(maximumSplCurveBeforeEq, point.frequency);
    return {
      ...point,
      spl: Number.isFinite(maximumSpl) ? Math.min(point.spl, maximumSpl) : point.spl,
    };
  });
  // ── Source output before and after global trim ──
  // baseRequestedSystemOutputDb is the configured LFE output level (the level
  // the headroom calculation subtracts from the manufacturer capability curve).
  // Falls back to 114 dB when no tuning is configured on the sub objects.
  const baseRequestedSystemOutputDb = getCurrentSystemSourceOutput(activeSubs);
  // ── Target-following global calibration level ──
  // Place the physical RSP against the fixed house target across the complete
  // 20–200 Hz correction band. The operating trim and PEQ bank form one
  // correction window: every non-protected local dip must remain reachable by
  // the available +6 dB boost while peaks are left for the -15 dB cut bank.
  // This operating decision is deliberately unsmoothed; one-third-octave
  // smoothing remains the separate authority for RP22 P19/P20 grading.
  // Narrow cancellation nulls remain visible and are excluded from this anchor.
  const preliminaryProtectedNullRegions = identifyProtectedNullRegions(
    rawCurve, domains.correctionStartHz, domains.correctionEndHz, verticalOffsetDb,
    activeSubs, usableLfHz, null, targetCurve,
  );
  const operatingLevelWindowDiagnostics = deriveCorrectionWindowOperatingOffsetDb({
    rawCurve,
    targetCurve,
    assessmentStartHz: domains.correctionStartHz,
    assessmentEndHz: domains.correctionEndHz,
    protectedNullRegions: preliminaryProtectedNullRegions,
    assessmentSmoothing: "none",
  });
  const requestedOperatingLevelOffsetDb = operatingLevelWindowDiagnostics.requestedOffsetDb;
  // Attenuation applies completely. Positive global gain is permitted only
  // within the least available source-domain headroom across the P14 band.
  const appliedOperatingLevelOffsetDb = clampPositiveOperatingOffset(
    requestedOperatingLevelOffsetDb,
    activeSubs,
    baseRequestedSystemOutputDb,
    requiredExtensionHz,
  );
  operatingLevelWindowDiagnostics.appliedOffsetDb = appliedOperatingLevelOffsetDb;
  operatingLevelWindowDiagnostics.positiveHeadroomLimited = appliedOperatingLevelOffsetDb < requestedOperatingLevelOffsetDb - 0.05;
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
  const pairedAuthorityInputs = {
    activeSubs,
    perSourceComplexTransfers,
    targetBasis: p14TargetBasis,
    requestedLevel: p14TargetLevel,
    requestedTargetSplDb: selectedP14TargetDb,
    normalizedTransferFingerprint,
    calibrationFingerprint,
  };
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
    canonicalTargetCurve: capabilityConstrainedFitTarget,
    protectedNullRegions,
    fitProfile: profile,
    assessmentStartHz: domains.correctionStartHz,
    assessmentEndHz: domains.correctionEndHz,
    collectDiagnostics,
    initialFilters,
    requestedSystemOutputDb: selectedOperatingOutputDb,
  });
  const eqResults = [];
  const standardFitStartedAt = nowMs();
  const standardEq = calculateDesignEqCurve(levelNormalisedRawCurve, usableLfHz, activeSubs, fitOptions("standard"));
  const standardFitTimeMs = nowMs() - standardFitStartedAt;
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
  const accuracyFitStartedAt = nowMs();
  const accuracyEq = calculateDesignEqCurve(levelNormalisedRawCurve, usableLfHz, activeSubs, fitOptions("accuracy", seed));
  const accuracyFitTimeMs = nowMs() - accuracyFitStartedAt;
  eqResults.push(accuracyEq);
  completedTasks += 1;
  report("Canonical accuracy fit complete");
  const houseCurveFitStartedAt = nowMs();
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
  const houseCurveFitTimeMs = nowMs() - houseCurveFitStartedAt;
  eqResults.push(houseEq);
  completedTasks += 1;
  report("Canonical house-curve fit complete");

  const eqCandidates = eqResults.map((eq) => buildCanonicalCandidate({
    rawCurve, maximumSplCurveBeforeEq, levelNormalisedRawCurve,
    operatingLevelOffsetDb: appliedOperatingLevelOffsetDb,
    perSeatRawCurves: levelNormalisedSeats, perSeatMaximumSplCurves,
    eq, domains, targetCurve, targetShape, verticalOffsetDb, protectedNullRegions,
    baseRequestedSystemOutputDb, operatingSystemOutputDb, requestedOperatingLevelOffsetDb,
    selectedOperatingOutputDb, operatingOutputDiagnostics, pairedAuthorityInputs, activeSubs, p14TargetBasis,
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
        rawCurve, maximumSplCurveBeforeEq, levelNormalisedRawCurve,
        operatingLevelOffsetDb: appliedOperatingLevelOffsetDb,
        perSeatRawCurves: levelNormalisedSeats, perSeatMaximumSplCurves,
        eq: sanitisedEq, domains, targetCurve, targetShape,
        verticalOffsetDb, protectedNullRegions,
        baseRequestedSystemOutputDb, operatingSystemOutputDb, requestedOperatingLevelOffsetDb,
        selectedOperatingOutputDb, operatingOutputDiagnostics, pairedAuthorityInputs, activeSubs, p14TargetBasis,
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
        rawCurve, maximumSplCurveBeforeEq, levelNormalisedRawCurve,
        operatingLevelOffsetDb: appliedOperatingLevelOffsetDb,
        perSeatRawCurves: levelNormalisedSeats, perSeatMaximumSplCurves,
        eq: cutOnlyEq, domains, targetCurve, targetShape,
        verticalOffsetDb, protectedNullRegions,
        baseRequestedSystemOutputDb, operatingSystemOutputDb, requestedOperatingLevelOffsetDb,
        selectedOperatingOutputDb, operatingOutputDiagnostics, pairedAuthorityInputs, activeSubs, p14TargetBasis,
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
    rawCurve, maximumSplCurveBeforeEq, levelNormalisedRawCurve,
    operatingLevelOffsetDb: appliedOperatingLevelOffsetDb,
    perSeatRawCurves: levelNormalisedSeats, perSeatMaximumSplCurves,
    eq: identityEq, domains, targetCurve, targetShape, verticalOffsetDb, protectedNullRegions,
    baseRequestedSystemOutputDb, operatingSystemOutputDb, requestedOperatingLevelOffsetDb,
    selectedOperatingOutputDb, operatingOutputDiagnostics, pairedAuthorityInputs, activeSubs, p14TargetBasis,
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
  const endedAt = nowMs();
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
    operatingLevelWindowDiagnostics,
    canonicalHouseCurveShape: targetShape,
    canonicalTargetCurve: targetCurve,
    protectedNullRegions,
    transitionHz,
    performanceSummary: {
      totalOptimiserTimeMs: endedAt - startedAt,
      requestCount: 1,
      profileCount: totalTasks,
      uniqueCoreFitCount: totalTasks,
      standardFitCount: 1,
      accuracyFitCount: 1,
      houseCurveFitCount: 1,
      coreFitTimeMs: standardFitTimeMs + accuracyFitTimeMs + houseCurveFitTimeMs,
      selectedDiagnosticFitTimeMs: 0,
      standardFitTimeMs,
      accuracyFitTimeMs,
      houseCurveFitTimeMs,
      candidateAssemblyTimeMs: Math.max(0, endedAt - startedAt - standardFitTimeMs - accuracyFitTimeMs - houseCurveFitTimeMs),
      selectedRevisionCandidateCount: eqResults.reduce((sum, eq) => sum + (eq?.revisionDiagnostics?.revisionAttemptCount || 0), 0),
      completedBankEvaluationCount: eqResults.reduce((sum, eq) =>
        sum + (eq?.bankDiagnostics?.completedBankEvaluationCount || 0), 0),
      bankValidationRequests: houseEq?.operationCounts?.bankValidationRequests || 0,
      uniqueBankValidations: houseEq?.operationCounts?.uniqueBankValidations || 0,
      reusedBankValidations: houseEq?.operationCounts?.reusedBankValidations || 0,
      filterResponseRequests: houseEq?.operationCounts?.filterResponseRequests || 0,
      uniqueFilterResponses: houseEq?.operationCounts?.uniqueFilterResponses || 0,
      metricGridPreparationRequests: houseEq?.operationCounts?.metricGridPreparationRequests || 0,
      uniqueMetricGridPreparations: houseEq?.operationCounts?.uniqueMetricGridPreparations || 0,
      curveEvaluationRequests: houseEq?.operationCounts?.curveEvaluationRequests || 0,
      reusedCurveEvaluationRequests: houseEq?.operationCounts?.reusedCurveEvaluationRequests || 0,
      perSeatMetricEvaluations: houseEq?.operationCounts?.perSeatMetricEvaluations || 0,
      candidateBankValidationTimeMs: houseEq?.operationCounts?.candidateBankValidationTimeMs || 0,
      perSeatEvaluationTimeMs: houseEq?.operationCounts?.perSeatEvaluationTimeMs || 0,
      candidateBankCount: candidates.length,
      seatCount: seats.length,
    },
  });
}