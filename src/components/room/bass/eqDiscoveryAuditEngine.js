// eqDiscoveryAuditEngine.js — Pure, read-only EQ discovery audit engine.
//
// Uses the completed canonical result's raw RSP curve and canonical target curve
// to run isolated diagnostic discovery at multiple smoothing resolutions, peak
// thresholds, and minimum widths. Calls the PRODUCTION findRegions function
// where possible; uses a local mirror only when the production function cannot
// accept a custom minimum width (matrix cells with non-production widths).
//
// READ-ONLY RULES:
//   - Zero simulations, zero optimiser runs, zero cache invalidations.
//   - All variants run in isolated local data.
//   - Never replaces the production result.
//   - Caches smoothing curves within a single audit run.

import { buildEqForensicTrace, DEFAULT_PROBE_FREQS } from "@/components/room/bass/eqForensicTraceBuilder";
import { isProtectedFrequency } from "@/components/utils/houseCurveFitProtection";
import {
  smoothAtResolution,
  interpolateSpl,
  nearestSampleFreq,
  octaveWidth,
  buildResidualCurve,
  buildDeviationPoints,
  buildResolutionComparison,
  buildRegionDiscoveryMatrix,
  buildCuratedVariants,
  buildAutomaticPeakScan,
} from "@/components/room/bass/eqDiscoveryAuditSections";

const num = (v) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const UNAVAILABLE = "UNAVAILABLE";
const PROBE_FREQS = DEFAULT_PROBE_FREQS;

// ── Section 2: Production-path summary ──
function buildProductionPathSummary(trace, rawCurve, targetCurve, protectedNullRegions, assessmentStartHz, assessmentEndHz, probeFreqs) {
  const smoothingCache = {};
  const getSmoothed = (res) => {
    if (!smoothingCache[res]) smoothingCache[res] = smoothAtResolution(rawCurve, res);
    return smoothingCache[res];
  };

  return probeFreqs.map((probeHz) => {
    const actualSampleHz = nearestSampleFreq(rawCurve, probeHz);
    const unsmoothedSpl = interpolateSpl(rawCurve, probeHz);
    const targetSpl = interpolateSpl(targetCurve, probeHz);
    const unsmoothedResidual = (unsmoothedSpl !== null && targetSpl !== null) ? unsmoothedSpl - targetSpl : null;

    const prodSmoothed = getSmoothed("1/3");
    const prodSmoothedSpl = interpolateSpl(prodSmoothed, probeHz);
    const prodFitterResidual = (prodSmoothedSpl !== null && targetSpl !== null) ? prodSmoothedSpl - targetSpl : null;

    const smoothingDiff = (unsmoothedResidual !== null && prodFitterResidual !== null) ? prodFitterResidual - unsmoothedResidual : null;
    const signChanged = (unsmoothedResidual !== null && prodFitterResidual !== null) && (Math.sign(unsmoothedResidual) !== Math.sign(prodFitterResidual));

    const protectedNull = isProtectedFrequency(probeHz, protectedNullRegions);
    const inAssessmentBand = probeHz >= assessmentStartHz && probeHz <= assessmentEndHz;

    const discoveredRegionEntry = trace.discoveredRegions?.find((r) => r.probeHz === probeHz);
    const hasRegion = discoveredRegionEntry?.hasContainingRegion || false;
    const region = discoveredRegionEntry?.regions?.[0] || discoveredRegionEntry?.nearestRegion || null;

    const trialEntry = trace.generatedTrials?.find((t) => t.probeHz === probeHz);
    const trialCount = trialEntry?.trialCount || 0;
    const firstRejectionGate = trialCount > 0 ? (trialEntry.trials[0]?.firstGate || UNAVAILABLE) : UNAVAILABLE;
    const acceptedTrial = trialCount > 0 ? trialEntry.trials.some((t) => t.accepted) : false;

    const finalBank = trace.handoffBanks?.candidateStages?.find((s) => s.stage === "finalOptimisedBassResponse.canonicalFilterBank");
    const finalFilterNear = (finalBank?.filters || []).find((f) => Math.abs(f.frequencyHz - probeHz) < 3) || null;

    return {
      probeHz,
      actualSampleHz,
      unsmoothedResidualDb: unsmoothedResidual,
      productionFitterResidualDb: prodFitterResidual,
      smoothingDiffDb: smoothingDiff,
      signChanged,
      protectedNull,
      inAssessmentBand,
      regionDiscovered: hasRegion,
      regionStartHz: region?.startHz ?? null,
      regionCentreHz: region?.centreHz ?? null,
      regionEndHz: region?.endHz ?? null,
      regionWidthHz: region ? (region.endHz ?? 0) - (region.startHz ?? 0) : null,
      regionWidthOctaves: region?.widthOctaves ?? (region ? octaveWidth(region.startHz, region.endHz) : null),
      peakThresholdDb: 2,
      thresholdPass: unsmoothedResidual !== null ? unsmoothedResidual >= 2 : null,
      minimumWidthThreshold: "1/6 octave (peak)",
      widthPass: null,
      trialCount,
      firstRejectionGate,
      acceptedTrial,
      finalFilterNearProbe: finalFilterNear ? `${finalFilterNear.frequencyHz.toFixed(2)} Hz ${finalFilterNear.gainDb.toFixed(2)} dB` : "none",
      finalGraphEqContribution: UNAVAILABLE,
    };
  });
}

// ── Section 8: Actual production candidates ──
function buildActualCandidates(trace) {
  const candidates = trace.candidates?.candidates || [];
  const finalBank = trace.handoffBanks?.candidateStages?.find((s) => s.stage === "finalOptimisedBassResponse.canonicalFilterBank");
  const selectedBank = trace.handoffBanks?.candidateStages?.find((s) => s.stage === "selected-candidate");
  const graphSig = trace.graphAuthority?.graphFilterBankSignature;
  const finalSig = trace.finalAuthority?.filterBankSignature;

  // Check filters directly for cuts near probes
  const allCandidateFilters = candidates.flatMap((c) => {
    // We don't have direct filter arrays in the trace candidates, but we have signatures
    return [];
  });

  return {
    candidates: candidates.map((c) => ({
      candidateId: c.candidateId,
      fitProfile: c.fitProfile,
      enabledFilterCount: c.enabledFilterCount,
      filterBankSignature: c.filterBankSignature,
      maximumResidualDb: c.rspMaxResidualDb,
      rmsResidualDb: c.rspRmsResidualDb,
      meanAbsoluteResidualDb: c.meanAbsoluteResidualDb,
      worstSeatDeviationDb: c.worstSeatDeviationDb,
      meanSeatDeviationDb: c.meanSeatDeviationDb,
      eqCost: c.eqCost,
      rank: c.rank,
      selected: c.selected,
    })),
    checks: {
      cutNear34Hz: false, // determined from filter bank inspection in panel
      cutNear78Hz: false,
      selectedEqualsFinal: selectedBank?.filterBankSignature === finalBank?.filterBankSignature,
      finalEqualsGraph: finalSig === graphSig,
    },
  };
}

// ── Section 9: Root-cause classification ──
function classifyRootCause(probeResult, matrixRows, probeHz) {
  const unsmoothedResidual = probeResult.unsmoothedResidualDb;
  const prodResidual = probeResult.productionFitterResidualDb;
  const regionDiscovered = probeResult.regionDiscovered;
  const trialCount = probeResult.trialCount;
  const acceptedTrial = probeResult.acceptedTrial;

  if (unsmoothedResidual === null) return { code: "J", reason: "Insufficient evidence — unsmoothed residual unavailable." };

  // A: PEAK HIDDEN BY SMOOTHING
  if (unsmoothedResidual >= 3 && prodResidual !== null && Math.abs(prodResidual) < 1) {
    return { code: "A", reason: `Raw +${unsmoothedResidual.toFixed(2)} dB peak reduced to ${prodResidual.toFixed(2)} dB by 1/3 octave smoothing — peak hidden.` };
  }

  // B: RESIDUAL SURVIVES SMOOTHING BUT FAILS THRESHOLD
  if (prodResidual !== null && Math.abs(prodResidual) >= 1 && Math.abs(prodResidual) < 2) {
    return { code: "B", reason: `Smoothed residual ${prodResidual.toFixed(2)} dB survives smoothing but fails the 2.0 dB production peak threshold.` };
  }

  // C: RESIDUAL PASSES THRESHOLD BUT FAILS REGION WIDTH
  if (prodResidual !== null && prodResidual >= 2 && !regionDiscovered) {
    const narrowWidthRow = matrixRows.find((r) => r.smoothing === "1/3" && r.peakThresholdDb === 2.0 && r.minWidthOctaves === 1 / 12);
    const narrowFound = narrowWidthRow && narrowWidthRow[`probe_${probeHz}`]?.regionFound;
    if (narrowFound) {
      return { code: "C", reason: `Smoothed residual ${prodResidual.toFixed(2)} dB passes threshold but region is narrower than the 1/6 octave production minimum width.` };
    }
    return { code: "B", reason: `Smoothed residual ${prodResidual.toFixed(2)} dB — threshold or width gate failure.` };
  }

  // D: REGION DISCOVERED BUT TRIAL NOT GENERATED
  if (regionDiscovered && trialCount === 0) {
    return { code: "D", reason: "Region discovered but no trial diagnostic generated near this probe." };
  }

  // E: TRIAL GENERATED BUT REJECTED
  if (trialCount > 0 && !acceptedTrial) {
    return { code: "E", reason: `Trial generated but rejected at ${probeResult.firstRejectionGate}.`, gate: probeResult.firstRejectionGate };
  }

  // F: TRIAL ACCEPTED BUT LOST
  if (acceptedTrial) {
    return { code: "F", reason: "Trial accepted but lost at handoff — check candidate banks." };
  }

  // I: CORRECTION PRESENT AND WORKING
  if (probeResult.finalFilterNearProbe !== "none") {
    return { code: "I", reason: "Final filter near probe — correction present." };
  }

  // J: INSUFFICIENT EVIDENCE
  return { code: "J", reason: "Insufficient evidence to classify — threshold and width gates not fully exposed." };
}

// ── Section 10: Variant comparison summary ──
function buildVariantSummary(variants) {
  return variants.map((v) => ({
    variant: v.id,
    label: v.label,
    probe34RegionFound: v.probeResults[34.16]?.regionFound || false,
    probe34ProposedCut: v.probeResults[34.16]?.proposedGainDb !== null ? `${v.probeResults[34.16].proposedGainDb.toFixed(2)} dB` : "none",
    probe34ExpectedResidualAfterTrial: v.probeResults[34.16]?.estimatedLocalImprovementDb !== null ? `-${v.probeResults[34.16].estimatedLocalImprovementDb.toFixed(2)} dB` : "none",
    probe78RegionFound: v.probeResults[77.81]?.regionFound || false,
    probe78ProposedCut: v.probeResults[77.81]?.proposedGainDb !== null ? `${v.probeResults[77.81].proposedGainDb.toFixed(2)} dB` : "none",
    probe78ExpectedResidualAfterTrial: v.probeResults[77.81]?.estimatedLocalImprovementDb !== null ? `-${v.probeResults[77.81].estimatedLocalImprovementDb.toFixed(2)} dB` : "none",
    totalPositivePeaksAbove3dB: v.totalRegions,
    protectedNullViolations: v.protectedNullViolations,
    boostLimitViolations: v.boostLimitViolations,
    cutLimitViolations: v.cutLimitViolations,
    seatRegressionCalculated: false,
    productionBehaviourChanged: false,
  }));
}

// ── Section 11: Smell test ──
function classifySmellTest(variant) {
  const p34 = variant.probeResults[34.16];
  const p78 = variant.probeResults[77.81];
  const raw34 = p34?.severityDb;
  const raw78 = p78?.severityDb;

  if (raw34 !== null && raw34 >= 4 && (p34?.proposedGainDb === null || Math.abs(p34.proposedGainDb) < 0.5)) return "Fail";
  if (raw78 !== null && raw78 >= 4 && (p78?.proposedGainDb === null || Math.abs(p78.proposedGainDb) < 0.5)) return "Fail";
  if (p34?.protectedNull || p78?.protectedNull) return "Fail";
  if (variant.totalRegions > 8) return "Questionable";
  if (variant.id === "D" || variant.id === "E" || variant.id === "F") return "Plausible";
  if (variant.id === "A") return "Questionable";
  if (variant.id === "B" || variant.id === "C") return "Plausible";
  return "Questionable";
}

// ── Section 7: Residual graph data ──
function buildResidualGraphData(rawCurve, targetCurve, assessmentStartHz, assessmentEndHz, trace) {
  const resolutions = [
    { key: "none", label: "Unsmoothed", color: "#dc2626" },
    { key: "1/12", label: "1/12 octave", color: "#ea580c" },
    { key: "1/6", label: "1/6 octave", color: "#ca8a04" },
    { key: "1/3", label: "1/3 octave (production)", color: "#213428" },
  ];
  const cache = {};
  const getSmoothed = (res) => {
    if (!cache[res]) cache[res] = smoothAtResolution(rawCurve, res);
    return cache[res];
  };

  const freqs = getSmoothed("1/3")
    .filter((p) => p.frequency >= assessmentStartHz && p.frequency <= assessmentEndHz)
    .map((p) => p.frequency);

  const series = resolutions.map((res) => {
    const smoothed = getSmoothed(res.key);
    return {
      key: res.key,
      label: res.label,
      color: res.color,
      data: freqs.map((f) => {
        const spl = interpolateSpl(smoothed, f);
        const target = interpolateSpl(targetCurve, f);
        return { frequency: f, residualDb: (spl !== null && target !== null) ? spl - target : null };
      }).filter((p) => p.residualDb !== null),
    };
  });

  const discoveredRegions = (trace.discoveredRegions || []).flatMap((r) => r.regions || []);
  const finalBank = trace.handoffBanks?.candidateStages?.find((s) => s.stage === "finalOptimisedBassResponse.canonicalFilterBank");
  const filters = (finalBank?.filters || []).filter((f) => f.gainDb < 0);

  return { series, discoveredRegions, filters, probeFreqs: PROBE_FREQS, assessmentStartHz, assessmentEndHz };
}

// ── Next test recommendation ──
function deriveNextTest(rootCause34, rootCause78, variants) {
  const variantE = variants.find((v) => v.id === "E");
  const variantF = variants.find((v) => v.id === "F");
  const variantC = variants.find((v) => v.id === "C");

  const eSolves34 = variantE?.probeResults[34.16]?.regionFound;
  const eSolves78 = variantE?.probeResults[77.81]?.regionFound;
  const fSolves34 = variantF?.probeResults[34.16]?.regionFound;
  const fSolves78 = variantF?.probeResults[77.81]?.regionFound;
  const cSolves34 = variantC?.probeResults[34.16]?.regionFound;
  const cSolves78 = variantC?.probeResults[77.81]?.regionFound;

  if (eSolves34 && eSolves78) {
    return "Test dual-resolution discovery (Variant E): permit unsmoothed positive peaks above +3 dB to create cut candidates alongside the production 1/3-octave smoothed response. This is the smallest change that solves both probes without relaxing width rules for boost regions.";
  }
  if (fSolves34 && fSolves78) {
    return "Test dual-resolution + narrow-peak width (Variant F): same as E but permit positive cut regions down to 1/12 octave. Use only if E does not solve both peaks.";
  }
  if (cSolves34 && cSolves78) {
    return "Test 1/12-octave smoothing (Variant C) as the production smoothing resolution. This is a larger change but may solve both peaks if dual-resolution is not preferred.";
  }
  return "No curated variant solves both probes — investigate threshold and width gate exposure before proposing a production change.";
}

// ── Main engine ──
export function runEqDiscoveryAudit({
  optimisationResult,
  fingerprints,
  rawRspCurve,
  probeFreqs = PROBE_FREQS,
}) {
  const trace = buildEqForensicTrace({ optimisationResult, fingerprints, probeFreqs });
  const selectedCandidate = optimisationResult?.selectedCandidate || null;
  const rawCurve = Array.isArray(rawRspCurve) ? rawRspCurve : (selectedCandidate?.rawResponseCurve || []);
  const targetCurve = Array.isArray(selectedCandidate?.productionHouseCurveTarget) ? selectedCandidate.productionHouseCurveTarget : [];
  const protectedNullRegions = selectedCandidate?.protectedNullRegions || [];
  const assessmentStartHz = num(selectedCandidate?.assessmentStartHz) ?? 20;
  const assessmentEndHz = num(selectedCandidate?.assessmentEndHz) ?? 200;

  if (!rawCurve.length || !targetCurve.length) {
    return { available: false, reason: "Completed canonical result or target curve not available." };
  }

  const productionPathSummary = buildProductionPathSummary(trace, rawCurve, targetCurve, protectedNullRegions, assessmentStartHz, assessmentEndHz, probeFreqs);
  const resolutionComparison = buildResolutionComparison(rawCurve, targetCurve, probeFreqs);
  const regionDiscoveryMatrix = buildRegionDiscoveryMatrix(rawCurve, targetCurve, protectedNullRegions, assessmentStartHz, assessmentEndHz, probeFreqs);
  const curatedVariants = buildCuratedVariants(rawCurve, targetCurve, protectedNullRegions, assessmentStartHz, assessmentEndHz, probeFreqs);
  const peakScan = buildAutomaticPeakScan(rawCurve, targetCurve, protectedNullRegions, assessmentStartHz, assessmentEndHz, trace);
  const actualCandidates = buildActualCandidates(trace);
  const variantSummary = buildVariantSummary(curatedVariants);
  const smellTest = curatedVariants.map((v) => ({ variant: v.id, label: v.label, classification: classifySmellTest(v) }));
  const rootCause34 = classifyRootCause(productionPathSummary[0], regionDiscoveryMatrix, 34.16);
  const rootCause78 = classifyRootCause(productionPathSummary[1], regionDiscoveryMatrix, 77.81);
  const nextTest = deriveNextTest(rootCause34, rootCause78, curatedVariants);
  const residualGraphData = buildResidualGraphData(rawCurve, targetCurve, assessmentStartHz, assessmentEndHz, trace);

  return {
    available: true,
    authority: trace.calibrationFingerprint,
    finalAuthority: trace.finalAuthority,
    graphAuthority: trace.graphAuthority,
    productionPathSummary,
    resolutionComparison,
    regionDiscoveryMatrix,
    curatedVariants,
    peakScan,
    actualCandidates,
    variantSummary,
    smellTest,
    rootCause34,
    rootCause78,
    nextTest,
    residualGraphData,
    assessmentStartHz,
    assessmentEndHz,
    probeFreqs,
  };
}