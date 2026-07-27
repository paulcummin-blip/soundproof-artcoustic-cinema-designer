// Partial-bank salvage for Design EQ.
// When a generated filter bank fails validation, this module creates a
// sanitised partial-bank candidate and a cut-only candidate by removing
// or clamping invalid filters. It never weakens or bypasses any existing
// product capability, filter, bank, protected-null or RP22 limit.

import {
  limitBoostForCapability,
  evaluateProvisionalBankLimits,
  peakingEqResponseDb,
} from "@/components/utils/designEqBankLimits";
import { isProtectedFrequency } from "@/components/utils/houseCurveFitProtection";
import {
  classifyEqCorrectionRegion,
  validatePhysicalEqAction,
  findAggregatePeakBoostViolations,
  buildFilterDecisionDiagnostics,
} from "@/components/utils/designEqPhysicsAuthority";
import { interpolateCanonicalTarget } from "@/components/utils/houseCurveTargetAuthority";
import { artcousticHouseCurveOffsetAt } from "@/components/utils/artcousticHouseCurve";

const isFiniteNumber = (value) => Number.isFinite(Number(value));

function interpolateRaw(curve, frequency) {
  if (!Array.isArray(curve) || !curve.length || !isFiniteNumber(frequency)) return null;
  const sorted = [...curve].sort((a, b) => a.frequency - b.frequency);
  if (frequency <= sorted[0].frequency) return sorted[0].spl;
  if (frequency >= sorted[sorted.length - 1].frequency) return sorted[sorted.length - 1].spl;
  const upperIndex = sorted.findIndex((point) => point.frequency >= frequency);
  const low = sorted[upperIndex - 1];
  const high = sorted[upperIndex];
  const ratio = (frequency - low.frequency) / (high.frequency - low.frequency);
  return low.spl + (high.spl - low.spl) * ratio;
}

function targetSplAt(frequency, canonicalTargetCurve, anchorDb) {
  return interpolateCanonicalTarget(canonicalTargetCurve, frequency)
    ?? (isFiniteNumber(anchorDb) ? anchorDb + artcousticHouseCurveOffsetAt(frequency) : null);
}

/**
 * Salvage a partial filter bank from a failed EQ fit.
 *
 * Process:
 * 1. Remove individually invalid filters (protected-null overlap, physical-authority violation).
 * 2. Clamp individual boost filters to source-domain capability.
 * 3. Iteratively remove the most problematic filter until the bank passes all limits.
 * 4. Create a cut-only bank from surviving negative-gain filters.
 *
 * Never converts a validation failure into success. Every retained filter must
 * pass full bank revalidation.
 */
export function salvagePartialBank({
  filters = [],
  rawCurve = [],
  activeSubs = [],
  usableLfHz = null,
  requestedSystemOutputDb,
  profile,
  protectedNullRegions = [],
  canonicalTargetCurve = [],
  anchorDb,
}) {
  const originalFilters = (Array.isArray(filters) ? filters : [])
    .filter((f) => f?.enabled && isFiniteNumber(f.frequencyHz) && f.frequencyHz > 0
      && isFiniteNumber(f.gainDb) && isFiniteNumber(f.Q) && f.Q > 0)
    .map((f) => ({ ...f, enabled: true }));

  const removedFilters = [];
  const removeFilter = (filter, reason) => {
    removedFilters.push({
      frequencyHz: filter.frequencyHz,
      gainDb: filter.gainDb,
      q: filter.Q,
      reasonRemoved: reason,
    });
  };

  // Phase 1: Individual filter validation
  const individuallyValid = [];
  for (const filter of originalFilters) {
    let f = { ...filter, enabled: true };
    let removed = false;

    // Protected-null check: any filter overlapping a protected null is removed.
    if (isProtectedFrequency(f.frequencyHz, protectedNullRegions)) {
      removeFilter(f, "protected-null");
      removed = true;
    }

    if (!removed) {
      // Physical-authority check
      const rawSpl = interpolateRaw(rawCurve, f.frequencyHz);
      const targetSpl = targetSplAt(f.frequencyHz, canonicalTargetCurve, anchorDb);
      const authority = classifyEqCorrectionRegion({
        frequency: f.frequencyHz,
        rawSpl,
        currentSpl: rawSpl,
        targetSpl,
        protectedNull: false,
        widthOctaves: f.widthOctaves,
        requestedGainDb: f.gainDb,
      });
      if (!validatePhysicalEqAction(authority.classification, f.gainDb).passed) {
        removeFilter(f, "physical-authority");
        removed = true;
      }
    }

    if (!removed && f.gainDb > 0) {
      // Clamp individual boost to source-domain capability
      const clamped = limitBoostForCapability(f, activeSubs, usableLfHz, requestedSystemOutputDb);
      if (!isFiniteNumber(clamped.gainDb) || Math.abs(clamped.gainDb) <= 0.1) {
        removeFilter(f, "source-domain-headroom");
        removed = true;
      } else {
        f = { ...clamped, enabled: true };
      }
    }

    if (!removed) {
      individuallyValid.push(f);
    }
  }

  // Phase 2: Bank validation and iterative removal
  let workingBank = individuallyValid.map((f) => ({ ...f, enabled: true }));
  let bankLimits = evaluateProvisionalBankLimits(
    workingBank, rawCurve, activeSubs, usableLfHz, requestedSystemOutputDb, profile,
  );

  let iterations = 0;
  const maxIterations = 20;
  while (!bankLimits.allOk && workingBank.length > 0 && iterations < maxIterations) {
    iterations += 1;

    if (!bankLimits.boostLimitOk || !bankLimits.sourceDomainHeadroomOk) {
      // Remove the largest positive filter (most likely cause of boost/headroom violation)
      const positiveFilters = workingBank.filter((f) => f.gainDb > 0);
      if (positiveFilters.length === 0) break;
      const worst = positiveFilters.reduce((a, b) =>
        Math.abs(b.gainDb) > Math.abs(a.gainDb) ? b : a);
      removeFilter(worst, bankLimits.sourceDomainHeadroomOk ? "aggregate-boost-limit" : "source-domain-headroom");
      workingBank = workingBank.filter((f) => f !== worst);
    } else if (!bankLimits.cutLimitOk) {
      // Remove the largest negative filter
      const negativeFilters = workingBank.filter((f) => f.gainDb < 0);
      if (negativeFilters.length === 0) break;
      const worst = negativeFilters.reduce((a, b) =>
        Math.abs(b.gainDb) > Math.abs(a.gainDb) ? b : a);
      removeFilter(worst, "aggregate-cut-limit");
      workingBank = workingBank.filter((f) => f !== worst);
    } else {
      break;
    }

    bankLimits = evaluateProvisionalBankLimits(
      workingBank, rawCurve, activeSubs, usableLfHz, requestedSystemOutputDb, profile,
    );
  }

  const sanitisedFilters = workingBank;
  const sanitisedBankLimits = bankLimits;

  // Phase 3: Create cut-only bank from surviving negative-gain filters
  const cutOnlyFilters = sanitisedFilters.filter((f) => f.gainDb < 0);
  const cutOnlyBankLimits = cutOnlyFilters.length > 0
    ? evaluateProvisionalBankLimits(
        cutOnlyFilters, rawCurve, activeSubs, usableLfHz, requestedSystemOutputDb, profile,
      )
    : {
        maxAggregateBoostDb: 0, maxAggregateBoostHz: null,
        maxAggregateCutDb: 0, maxAggregateCutHz: null,
        limitingPermittedBoostDb: 6,
        boostLimitOk: true, cutLimitOk: true, sourceDomainHeadroomOk: true, allOk: true,
      };

  // Diagnostics
  const removedInvalidBoostCount = removedFilters.filter((r) =>
    r.gainDb > 0 && (r.reasonRemoved === "source-domain-headroom" || r.reasonRemoved === "aggregate-boost-limit")).length;
  const removedProtectedNullFilterCount = removedFilters.filter((r) =>
    r.reasonRemoved === "protected-null").length;
  const retainedCutCount = sanitisedFilters.filter((f) => f.gainDb < 0).length;
  const retainedBoostCount = sanitisedFilters.filter((f) => f.gainDb > 0).length;

  return {
    sanitisedFilters,
    sanitisedBankLimits,
    cutOnlyFilters,
    cutOnlyBankLimits,
    removedFilters,
    diagnostics: {
      originalGeneratedFilterCount: originalFilters.length,
      originalEnabledFilterCount: originalFilters.length,
      removedInvalidBoostCount,
      removedProtectedNullFilterCount,
      retainedCutCount,
      retainedBoostCount,
      sanitisedBankValidation: sanitisedBankLimits.allOk,
      cutOnlyBankValidation: cutOnlyBankLimits.allOk,
      removedFilterDetails: removedFilters,
    },
  };
}

/**
 * Build a salvage EQ result object compatible with buildCanonicalCandidate.
 * Recomputes the curve, combined EQ curve, and physical-authority violations
 * from the salvaged filter bank.
 */
export function buildSalvageEqResult({
  originalEq,
  salvageFilters,
  bankLimits,
  profileMarker,
  rawCurve,
  canonicalTargetCurve,
  protectedNullRegions,
  stopReason,
}) {
  const filters = salvageFilters.map((f) => ({ ...f, enabled: true }));
  const combinedEqCurve = rawCurve.map((point) => ({
    frequency: point.frequency,
    spl: filters.reduce((sum, filter) => sum + peakingEqResponseDb(point.frequency, filter), 0),
  }));
  const curve = rawCurve.map((point, index) => ({
    frequency: point.frequency,
    spl: point.spl + combinedEqCurve[index].spl,
  }));
  const physicalAuthorityViolations = findAggregatePeakBoostViolations(rawCurve, curve, canonicalTargetCurve);
  const filterDecisionDiagnostics = buildFilterDecisionDiagnostics(
    filters, rawCurve, curve, canonicalTargetCurve, protectedNullRegions,
  );
  const headroomConsumedByEqDb = filters
    .filter((f) => f.enabled && f.gainDb > 0)
    .reduce((sum, f) => sum + f.gainDb, 0);

  return {
    ...originalEq,
    designEqFitProfile: profileMarker,
    designEqFitProfileConfig: originalEq.designEqFitProfileConfig || null,
    selectedStart: `salvage:${profileMarker}`,
    filters,
    curve,
    combinedEqCurve,
    fitterHouseCurveTarget: originalEq.fitterHouseCurveTarget || canonicalTargetCurve.map((p) => ({ ...p })),
    physicalEqAuthorityPassed: physicalAuthorityViolations.length === 0,
    physicalAuthorityViolations,
    bankLimits: { ...bankLimits },
    bankDiagnostics: { selectedBankLimits: { ...bankLimits } },
    bankValidationPassed: bankLimits.allOk,
    rspObjectiveMaxDeviationDb: null,
    rspMaxDeviationDb: null,
    rspRmsDeviationDb: null,
    rspMeanSignedResidualDb: null,
    rspShapeRmsDeviationDb: null,
    iterationTrace: [],
    detectedRegions: [],
    candidateAcceptanceDiagnostics: [],
    candidateSelectionDiagnostics: [],
    filterDecisionDiagnostics,
    rejectedEqCandidates: [],
    seatToleranceAdjustedCandidates: [],
    seatRegressionToleranceDiagnostics: null,
    stopReason,
    selectionReason: `Salvaged partial bank (${profileMarker})`,
    houseCurveDiagnostics: null,
    worstSeatMaxDeviationDb: null,
    meanSeatMaxDeviationDb: null,
    rmsSeatTargetErrorDb: null,
    perSeatMetrics: [],
    headroomConsumedByEqDb,
  };
}