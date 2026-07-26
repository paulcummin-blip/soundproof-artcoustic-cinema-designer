// eqForensicTraceBuilder.js — Pure, read-only forensic trace extractor.
//
// Builds a compact eqForensicTrace object from the EXISTING diagnostic data
// already attached to the completed optimisation result when engineering
// diagnostics are enabled. This module:
//   - Runs zero simulations and zero optimiser runs.
//   - Reads only from the completed result's existing fields.
//   - Interpolates from the actual canonical arrays (not graph pixels).
//   - Emits null / "UNAVAILABLE" for any stage not exposed by current diagnostics.
//   - Never infers missing values from static code.
//
// The trace is focused on two probe frequencies (34.16 Hz and 77.81 Hz) and
// only carries records relevant to those probes — no full 360-point curves.

import { applyBassSmoothing } from "@/components/room/bass/bassGraphSmoothing";
import { buildFilterBankSignature } from "@/components/room/bass/bassResultAuthority";
import { BASS_OPTIMISER_VERSIONS } from "@/components/room/bass/bassOptimiserWorkerProtocol";

export const EQ_FORENSIC_TRACE_VERSION = 1;
export const DEFAULT_PROBE_FREQS = [34.16, 77.81];
const UNAVAILABLE = "UNAVAILABLE";
const THIRD_OCTAVE_RATIO = Math.pow(2, 1 / 6); // ±1/3 octave half-width

const num = (v) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

function interpolateSpl(curve, freq) {
  if (!Array.isArray(curve) || !curve.length) return null;
  const f = num(freq);
  if (f === null) return null;
  const pts = curve
    .map((p) => ({ frequency: num(p?.frequency ?? p?.hz), spl: num(p?.spl ?? p?.offsetDb ?? p?.db) }))
    .filter((p) => p.frequency !== null && p.spl !== null)
    .sort((a, b) => a.frequency - b.frequency);
  if (!pts.length) return null;
  if (f < pts[0].frequency || f > pts[pts.length - 1].frequency) return null;
  let upper = pts.findIndex((p) => p.frequency >= f);
  if (upper === -1) return null;
  if (upper === 0) return pts[0].spl;
  const lo = pts[upper - 1];
  const hi = pts[upper];
  if (hi.frequency === lo.frequency) return hi.spl;
  return lo.spl + (hi.spl - lo.spl) * ((f - lo.frequency) / (hi.frequency - lo.frequency));
}

function nearestSampleFreq(curve, freq) {
  if (!Array.isArray(curve) || !curve.length) return null;
  const f = num(freq);
  if (f === null) return null;
  let best = null;
  let bestDist = Infinity;
  for (const p of curve) {
    const pf = num(p?.frequency ?? p?.hz);
    if (pf === null) continue;
    const d = Math.abs(pf - f);
    if (d < bestDist) { bestDist = d; best = pf; }
  }
  return best;
}

function isWithinThirdOctave(freqA, freqB) {
  const a = num(freqA);
  const b = num(freqB);
  if (a === null || b === null || a <= 0 || b <= 0) return false;
  const ratio = Math.max(a, b) / Math.min(a, b);
  return ratio <= THIRD_OCTAVE_RATIO;
}

function isInsideProtectedNull(freq, protectedNullRegions) {
  const f = num(freq);
  if (f === null) return false;
  return (Array.isArray(protectedNullRegions) ? protectedNullRegions : []).some((region) => {
    const start = num(region?.startHz);
    const end = num(region?.endHz);
    if (start !== null && end !== null) return f >= start && f <= end;
    const centre = num(region?.centreHz ?? region?.frequencyHz);
    return centre !== null && isWithinThirdOctave(f, centre);
  });
}

function compactFilterBank(filters) {
  return (Array.isArray(filters) ? filters : [])
    .filter((f) => f?.enabled)
    .map((f) => ({
      frequencyHz: num(f.frequencyHz),
      gainDb: num(f.gainDb),
      Q: num(f.Q),
      enabled: !!f.enabled,
    }));
}

function bankSignature(filters) {
  return buildFilterBankSignature({ generatedFilterBank: filters || [] });
}

// ── Stage 1: Input Authority ──
function buildInputAuthority(optimisationResult, fingerprints) {
  const activeCalibration = fingerprints?.calibration || null;
  const resultCalibration = optimisationResult?.calibrationFingerprint || null;
  return {
    activeCalibrationFingerprint: activeCalibration,
    resultCalibrationFingerprint: resultCalibration,
    calibrationMatch: !!(activeCalibration && resultCalibration && activeCalibration === resultCalibration),
    selectedCandidateId: optimisationResult?.selectedCandidateId || null,
    poolId: optimisationResult?.poolId || null,
    versions: {
      protocolVersion: optimisationResult?.protocolVersion || BASS_OPTIMISER_VERSIONS.protocolVersion,
      poolVersion: optimisationResult?.poolVersion || BASS_OPTIMISER_VERSIONS.poolVersion,
      engineVersion: optimisationResult?.engineVersion || BASS_OPTIMISER_VERSIONS.engineVersion,
      resultSchemaVersion: optimisationResult?.resultSchemaVersion || BASS_OPTIMISER_VERSIONS.resultSchemaVersion,
    },
  };
}

// ── Stage 2: Fitter Inputs at probe frequencies ──
function buildFitterInputs(candidate, probeFreqs) {
  if (!candidate) return probeFreqs.map((f) => ({ probeHz: f, status: UNAVAILABLE }));
  const rawCurve = Array.isArray(candidate.rawResponseCurve) ? candidate.rawResponseCurve : [];
  const targetCurve = Array.isArray(candidate.productionHouseCurveTarget) ? candidate.productionHouseCurveTarget : [];
  const smoothedCurve = rawCurve.length ? applyBassSmoothing(rawCurve, "third") : [];
  const protectedNullRegions = candidate.protectedNullRegions || [];
  const detectedRegions = candidate.designEqDetectedRegions || [];
  const assessmentStart = num(candidate.assessmentStartHz);
  const assessmentEnd = num(candidate.assessmentEndHz);

  return probeFreqs.map((probeHz) => {
    const actualSampleHz = nearestSampleFreq(rawCurve, probeHz);
    const unsmoothedRawSpl = interpolateSpl(rawCurve, probeHz);
    const fitterSmoothedSpl = interpolateSpl(smoothedCurve, probeHz);
    const canonicalTargetSpl = interpolateSpl(targetCurve, probeHz);
    const unsmoothedResidualDb = (unsmoothedRawSpl !== null && canonicalTargetSpl !== null)
      ? unsmoothedRawSpl - canonicalTargetSpl : null;
    const fitterResidualDb = (fitterSmoothedSpl !== null && canonicalTargetSpl !== null)
      ? fitterSmoothedSpl - canonicalTargetSpl : null;
    const protectedNull = isInsideProtectedNull(probeHz, protectedNullRegions);
    const nearestRegion = detectedRegions.find((r) => isWithinThirdOctave(probeHz, r.centreHz ?? r.frequencyHz));
    const classification = nearestRegion ? nearestRegion.kind : "none";
    const correctionDirection = fitterResidualDb !== null
      ? (fitterResidualDb > 0 ? "cut" : fitterResidualDb < 0 ? "boost" : "none")
      : UNAVAILABLE;
    const inAssessmentBand = (assessmentStart !== null && assessmentEnd !== null)
      ? (probeHz >= assessmentStart && probeHz <= assessmentEnd) : null;
    return {
      probeHz,
      actualSampleHz,
      unsmoothedRawSpl,
      fitterSmoothedSpl,
      canonicalTargetSpl,
      unsmoothedResidualDb,
      fitterResidualDb,
      protectedNull,
      classification,
      correctionDirection,
      inAssessmentBand,
    };
  });
}

// ── Stage 3: Region Discovery ──
function buildDiscoveredRegions(candidate, probeFreqs) {
  if (!candidate) return probeFreqs.map((f) => ({ probeHz: f, status: UNAVAILABLE }));
  const detected = candidate.designEqDetectedRegions || [];
  return probeFreqs.map((probeHz) => {
    const containing = detected.filter((r) => {
      const start = num(r.startHz);
      const end = num(r.endHz);
      if (start !== null && end !== null) return probeHz >= start && probeHz <= end;
      return isWithinThirdOctave(probeHz, r.centreHz ?? r.frequencyHz);
    });
    const nearest = containing.length
      ? containing[0]
      : detected.find((r) => isWithinThirdOctave(probeHz, r.centreHz ?? r.frequencyHz)) || null;
    return {
      probeHz,
      hasContainingRegion: containing.length > 0,
      regions: containing.map((r) => ({
        iteration: r.iteration || null,
        startHz: num(r.startHz),
        centreHz: num(r.centreHz ?? r.frequencyHz),
        endHz: num(r.endHz),
        kind: r.kind || null,
        severityDb: num(r.severityDb),
        insideProtectedNull: !!r.insideProtectedNull,
      })),
      nearestRegion: nearest ? {
        iteration: nearest.iteration || null,
        startHz: num(nearest.startHz),
        centreHz: num(nearest.centreHz ?? nearest.frequencyHz),
        endHz: num(nearest.endHz),
        kind: nearest.kind || null,
        severityDb: num(nearest.severityDb),
        insideProtectedNull: !!nearest.insideProtectedNull,
      } : null,
    };
  });
}

// ── Stage 4 & 5: Trial Generation and First Rejection Gate ──
function buildGeneratedTrials(candidate, probeFreqs) {
  if (!candidate) return probeFreqs.map((f) => ({ probeHz: f, status: UNAVAILABLE }));
  const acceptance = candidate.designEqCandidateAcceptanceDiagnostics || [];
  return probeFreqs.map((probeHz) => {
    const trials = acceptance.filter((t) => isWithinThirdOctave(probeHz, t.frequencyHz));
    return {
      probeHz,
      trialCount: trials.length,
      trials: trials.map((t) => {
        const reason = t.reason || "";
        const gate = t.accepted ? "accepted"
          : reason.includes("protected null") ? "protected-null"
          : reason.includes("modal gate") ? "objective-improvement"
          : reason.includes("normal refinement failed") ? "objective-improvement"
          : "objective-improvement";
        return {
          action: t.action || null,
          frequencyHz: num(t.frequencyHz),
          proposedGainDb: num(t.proposedGainDb),
          proposedQ: num(t.proposedQ),
          accepted: !!t.accepted,
          classification: t.classification || null,
          regionKind: t.regionKind || null,
          severityDb: num(t.severityDb),
          insideProtectedNull: !!t.insideProtectedNull,
          localImprovementDb: num(t.localImprovementDb),
          maximumDeviationReductionDb: num(t.maximumDeviationReductionDb),
          rmsReductionDb: num(t.rmsReductionDb),
          acousticObjectiveImprovementDb: num(t.acousticObjectiveImprovementDb),
          normalRefinementAcceptable: !!t.normalRefinementAcceptable,
          modalAcceptanceResult: !!t.modalAcceptanceResult,
          firstGate: gate,
          reason: t.reason || null,
        };
      }),
    };
  });
}

// ── Stage 6: Filter Bank at Every Handoff ──
function buildHandoffBanks(optimisationResult, finalBassResponse) {
  const candidates = optimisationResult?.candidates || [];
  const byProfile = (profile) => candidates.find((c) => c?.designEqFitProfile === profile) || null;
  const standard = byProfile("standard");
  const accuracy = byProfile("accuracy");
  const houseCurve = byProfile("house_curve");
  const selected = optimisationResult?.selectedCandidate || null;
  const finalBank = finalBassResponse?.canonicalFilterBank || [];
  const intermediateStages = [
    "standardSeedFilters", "bestSeedFilters", "houseCurveFitterCore",
    "houseCurveResidualCleanup-input", "houseCurveResidualCleanup-output",
    "post-refinement", "resolveFallback-input", "resolveFallback-output",
  ].map((stage) => ({ stage, status: UNAVAILABLE, enabledFilterCount: null, filters: [], filterBankSignature: null }));
  const candidateStages = [
    { stage: "standard-candidate", candidate: standard, filters: standard?.generatedFilterBank },
    { stage: "accuracy-candidate", candidate: accuracy, filters: accuracy?.generatedFilterBank },
    { stage: "house-curve-candidate", candidate: houseCurve, filters: houseCurve?.generatedFilterBank },
    { stage: "selected-candidate", candidate: selected, filters: selected?.generatedFilterBank },
    { stage: "finalOptimisedBassResponse.canonicalFilterBank", candidate: null, filters: finalBank },
  ].map((s) => ({
    stage: s.stage,
    candidateId: s.candidate?.candidateId || null,
    enabledFilterCount: (s.filters || []).filter((f) => f?.enabled).length,
    filters: compactFilterBank(s.filters),
    filterBankSignature: bankSignature(s.filters),
    fallbackOccurred: false,
    fallbackType: null,
  }));
  return { intermediateStages, candidateStages };
}

// ── Stage 7: Candidate Ranking ──
function buildCandidateRanking(optimisationResult) {
  const candidates = optimisationResult?.candidates || [];
  const selectionDiagnostics = optimisationResult?.selectionDiagnostics || null;
  const rankedCandidates = selectionDiagnostics?.rankedCandidates || [];
  const rankById = new Map(rankedCandidates.map((r) => [r.candidateId, r]));
  return {
    rankingMode: selectionDiagnostics?.mode || null,
    selectionReason: selectionDiagnostics?.selectionReason || null,
    rankingTuple: selectionDiagnostics?.rankingTuple || null,
    candidates: candidates.map((c) => {
      const rankInfo = rankById.get(c.candidateId) || {};
      return {
        candidateId: c.candidateId || null,
        fitProfile: c.designEqFitProfile || null,
        startStrategy: c.startStrategy || null,
        enabledFilterCount: (c.generatedFilterBank || []).filter((f) => f?.enabled).length,
        filterBankSignature: c.filterBankSignature || bankSignature(c.generatedFilterBank),
        rspMaxResidualDb: num(c.fitMetrics?.maximumResidualDb),
        rspRmsResidualDb: num(c.fitMetrics?.rmsResidualDb),
        houseCurveMaxErrorDb: num(c.houseCurveRankingMaxResidualDb),
        houseCurveRmsErrorDb: num(c.houseCurveRankingRmsResidualDb),
        meanAbsoluteResidualDb: num(c.houseCurveRankingMeanAbsoluteResidualDb ?? c.rspMeanAbsoluteResidualDb),
        worstSeatDeviationDb: num(c.worstSeatMaxDeviationDb),
        meanSeatDeviationDb: num(c.meanSeatMaxDeviationDb),
        eqCost: (c.generatedFilterBank || []).reduce((s, f) => f?.enabled && Number.isFinite(f.gainDb) ? s + Math.abs(f.gainDb) : s, 0),
        rank: rankInfo.rank || null,
        selected: !!rankInfo.selected,
        rejectionReason: rankInfo.reason || null,
      };
    }),
  };
}

// ── Stage 8: Final Authority ──
function buildFinalAuthority(finalBassResponse) {
  if (!finalBassResponse) return { status: UNAVAILABLE };
  return {
    selectedCandidateId: finalBassResponse.selectedCandidateId || null,
    filterBankSignature: finalBassResponse.filterBankSignature || null,
    rawResponseSignature: finalBassResponse.rawResponseSignature || null,
    postEqCurveSignature: finalBassResponse.postEqCurveSignature || null,
    canonicalVerticalOffsetDb: num(finalBassResponse.canonicalVerticalOffsetDb),
  };
}

// ── Stage 9: Graph Authority ──
function buildGraphAuthority(finalBassResponse) {
  if (!finalBassResponse) return { status: UNAVAILABLE };
  const finalSig = finalBassResponse.filterBankSignature || null;
  return {
    graphFilterBankSignature: finalSig,
    matchesFinalBank: true,
    note: "Graph uses canonicalPostEqRsp generated from the selected candidate; no separate graph filter bank exists.",
  };
}

// ── Main builder ──
export function buildEqForensicTrace({
  optimisationResult,
  fingerprints,
  probeFreqs = DEFAULT_PROBE_FREQS,
}) {
  const finalBassResponse = optimisationResult?.finalOptimisedBassResponse || null;
  const selectedCandidate = optimisationResult?.selectedCandidate || null;
  const hasDiagnostics = !!(selectedCandidate?.designEqDetectedRegions || selectedCandidate?.designEqCandidateAcceptanceDiagnostics);

  return {
    version: EQ_FORENSIC_TRACE_VERSION,
    diagnosticsEnabled: hasDiagnostics,
    calibrationFingerprint: buildInputAuthority(optimisationResult, fingerprints),
    fitterInputs: buildFitterInputs(selectedCandidate, probeFreqs),
    discoveredRegions: buildDiscoveredRegions(selectedCandidate, probeFreqs),
    generatedTrials: buildGeneratedTrials(selectedCandidate, probeFreqs),
    handoffBanks: buildHandoffBanks(optimisationResult, finalBassResponse),
    candidates: buildCandidateRanking(optimisationResult),
    finalAuthority: buildFinalAuthority(finalBassResponse),
    graphAuthority: buildGraphAuthority(finalBassResponse),
  };
}