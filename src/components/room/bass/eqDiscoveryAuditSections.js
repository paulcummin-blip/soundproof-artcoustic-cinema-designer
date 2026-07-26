// eqDiscoveryAuditSections.js — Section builders for the EQ discovery audit.
//
// Extracted from eqDiscoveryAuditEngine.js to keep utility files under 600 lines.
// Pure, read-only functions that build audit sections from the completed
// canonical result. Zero simulations, zero optimiser runs.

import { applyBassSmoothing } from "@/components/room/bass/bassGraphSmoothing";
import { findRegions } from "@/components/utils/designEqCalibration";
import { isProtectedFrequency } from "@/components/utils/houseCurveFitProtection";

const num = (v) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const UNAVAILABLE = "UNAVAILABLE";

function auditSmoothFractionalOctave(data, width) {
  if (!Array.isArray(data) || data.length < 3) return data;
  const sorted = [...data].sort((a, b) => a.frequency - b.frequency);
  return sorted.map(({ frequency }, i) => {
    const fLow = frequency * Math.pow(2, -0.5 / width);
    const fHigh = frequency * Math.pow(2, 0.5 / width);
    let sum = 0;
    let count = 0;
    for (const p of sorted) {
      if (p.frequency < fLow) continue;
      if (p.frequency > fHigh) break;
      if (Number.isFinite(p.spl)) { sum += p.spl; count++; }
    }
    return { frequency, spl: count === 0 ? null : sum / count };
  });
}

export function smoothAtResolution(curve, resolution) {
  switch (resolution) {
    case "none": return curve.map((p) => ({ ...p }));
    case "1/24": return auditSmoothFractionalOctave(curve, 24);
    case "1/12": return auditSmoothFractionalOctave(curve, 12);
    case "1/6": return applyBassSmoothing(curve, "sixth");
    case "1/3": return applyBassSmoothing(curve, "third");
    default: return curve.map((p) => ({ ...p }));
  }
}

function auditFindRegions(points, kind, peakThresholdDb, valleyThresholdDb, minimumWidthOctaves) {
  const matches = (point) =>
    kind === "peak"
      ? point.deviationDb >= peakThresholdDb
      : point.deviationDb <= -valleyThresholdDb;
  const regions = [];
  let current = [];
  const finish = () => {
    if (!current.length) return;
    const startHz = current[0].frequency;
    const endHz = current[current.length - 1].frequency;
    const width = startHz > 0 && endHz > startHz ? Math.log2(endHz / startHz) : 0;
    if (width >= minimumWidthOctaves) {
      const centrePoint = current.reduce((best, point) => kind === "peak"
        ? (point.deviationDb > best.deviationDb ? point : best)
        : (point.deviationDb < best.deviationDb ? point : best));
      regions.push({ kind, startHz, endHz, widthOctaves: width, centrePoint, severityDb: Math.abs(centrePoint.deviationDb) });
    }
    current = [];
  };
  points.forEach((point) => {
    if (matches(point)) current.push(point);
    else finish();
  });
  finish();
  return regions;
}

export function interpolateSpl(curve, freq) {
  if (!Array.isArray(curve) || !curve.length) return null;
  const f = num(freq);
  if (f === null) return null;
  const pts = curve
    .map((p) => ({ frequency: num(p?.frequency), spl: num(p?.spl) }))
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

export function nearestSampleFreq(curve, freq) {
  if (!Array.isArray(curve) || !curve.length) return null;
  const f = num(freq);
  if (f === null) return null;
  let best = null;
  let bestDist = Infinity;
  for (const p of curve) {
    const pf = num(p?.frequency);
    if (pf === null) continue;
    const d = Math.abs(pf - f);
    if (d < bestDist) { bestDist = d; best = pf; }
  }
  return best;
}

export function octaveWidth(startHz, endHz) {
  return startHz > 0 && endHz > startHz ? Math.log2(endHz / startHz) : 0;
}

export function buildResidualCurve(smoothedCurve, targetCurve) {
  if (!Array.isArray(smoothedCurve) || !Array.isArray(targetCurve)) return [];
  return smoothedCurve
    .map((p) => {
      const target = interpolateSpl(targetCurve, p.frequency);
      const spl = num(p.spl);
      if (target === null || spl === null) return null;
      return { frequency: p.frequency, residualDb: spl - target };
    })
    .filter((p) => p !== null);
}

export function buildDeviationPoints(smoothedCurve, targetCurve, assessmentStartHz, assessmentEndHz) {
  const residual = buildResidualCurve(smoothedCurve, targetCurve);
  return residual
    .filter((p) => p.frequency >= assessmentStartHz && p.frequency <= assessmentEndHz)
    .map((p) => ({ frequency: p.frequency, deviationDb: p.residualDb }));
}

export function classifyResidual(residualDb) {
  if (residualDb === null) return UNAVAILABLE;
  if (residualDb > 0.5) return "peak";
  if (residualDb < -0.5) return "valley";
  return "flat";
}

export function correctionDirection(residualDb) {
  if (residualDb === null) return UNAVAILABLE;
  if (residualDb > 0) return "cut";
  if (residualDb < 0) return "boost";
  return "none";
}

// ── Section 3: Resolution comparison ──
export function buildResolutionComparison(rawCurve, targetCurve, probeFreqs) {
  const resolutions = ["none", "1/24", "1/12", "1/6", "1/3"];
  const cache = {};
  const getSmoothed = (res) => {
    if (!cache[res]) cache[res] = smoothAtResolution(rawCurve, res);
    return cache[res];
  };

  return probeFreqs.map((probeHz) => {
    const targetSpl = interpolateSpl(targetCurve, probeHz);
    const byResolution = {};
    for (const res of resolutions) {
      const smoothed = getSmoothed(res);
      const spl = interpolateSpl(smoothed, probeHz);
      const residual = (spl !== null && targetSpl !== null) ? spl - targetSpl : null;
      byResolution[res] = {
        residualDb: residual,
        classification: classifyResidual(residual),
        correctionDirection: correctionDirection(residual),
        exceedsProductionThreshold: residual !== null ? residual >= 2 : null,
        signDiffersFromUnsmoothed: (byResolution.none?.residualDb !== null && residual !== null) ? Math.sign(byResolution.none.residualDb) !== Math.sign(residual) : null,
      };
    }
    return { probeHz, byResolution };
  });
}

// ── Section 4: Region discovery matrix ──
export function buildRegionDiscoveryMatrix(rawCurve, targetCurve, protectedNullRegions, assessmentStartHz, assessmentEndHz, probeFreqs) {
  const smoothingModes = ["none", "1/24", "1/12", "1/6", "1/3"];
  const peakThresholds = [1.0, 1.5, 2.0, 3.0];
  const minWidths = [
    { label: "no minimum", octaves: 0 },
    { label: "1/24 octave", octaves: 1 / 24 },
    { label: "1/12 octave", octaves: 1 / 12 },
    { label: "1/6 octave (production peak)", octaves: 1 / 6 },
  ];

  const smoothingCache = {};
  const getSmoothed = (mode) => {
    if (!smoothingCache[mode]) smoothingCache[mode] = smoothAtResolution(rawCurve, mode);
    return smoothingCache[mode];
  };

  const rows = [];
  for (const smoothing of smoothingModes) {
    const smoothed = getSmoothed(smoothing);
    const deviationPoints = buildDeviationPoints(smoothed, targetCurve, assessmentStartHz, assessmentEndHz);
    for (const threshold of peakThresholds) {
      for (const minWidth of minWidths) {
        const isProductionWidth = minWidth.octaves === 1 / 6;
        const regions = isProductionWidth
          ? findRegions(deviationPoints, "peak", threshold, threshold)
          : auditFindRegions(deviationPoints, "peak", threshold, threshold, minWidth.octaves);

        const row = {
          smoothing,
          peakThresholdDb: threshold,
          minWidthLabel: minWidth.label,
          minWidthOctaves: minWidth.octaves,
          isProductionCombo: smoothing === "1/3" && threshold === 2.0 && minWidth.octaves === 1 / 6,
        };
        for (const probeHz of probeFreqs) {
          const containing = regions.find((r) => probeHz >= r.startHz && probeHz <= r.endHz);
          const nearest = containing || regions.find((r) => Math.abs(r.centrePoint.frequency - probeHz) < 5) || null;
          row[`probe_${probeHz}`] = {
            regionFound: !!containing,
            startHz: nearest?.startHz ?? null,
            centreHz: nearest?.centrePoint?.frequency ?? null,
            endHz: nearest?.endHz ?? null,
            widthHz: nearest ? nearest.endHz - nearest.startHz : null,
            widthOctaves: nearest?.widthOctaves ?? null,
            severityDb: nearest?.severityDb ?? null,
            protectedNull: nearest ? isProtectedFrequency(nearest.centrePoint.frequency, protectedNullRegions) : false,
            pass: !!containing,
            failingCondition: containing ? null : (deviationPoints.some((p) => Math.abs(p.frequency - probeHz) < 3 && p.deviationDb >= threshold) ? "failed minimum width" : "failed threshold"),
          };
        }
        rows.push(row);
      }
    }
  }
  return rows;
}

// ── Section 5: Curated discovery variants ──
export function buildCuratedVariants(rawCurve, targetCurve, protectedNullRegions, assessmentStartHz, assessmentEndHz, probeFreqs) {
  const cache = {};
  const getSmoothed = (res) => {
    if (!cache[res]) cache[res] = smoothAtResolution(rawCurve, res);
    return cache[res];
  };

  const variants = [
    { id: "A", label: "Production", smoothing: "1/3", threshold: 2.0, minWidthOctaves: 1 / 6, useRawPeaks: false, rawPeakThreshold: null },
    { id: "B", label: "Higher-resolution smoothing (1/6)", smoothing: "1/6", threshold: 2.0, minWidthOctaves: 1 / 6, useRawPeaks: false, rawPeakThreshold: null },
    { id: "C", label: "High-resolution smoothing (1/12)", smoothing: "1/12", threshold: 2.0, minWidthOctaves: 1 / 6, useRawPeaks: false, rawPeakThreshold: null },
    { id: "D", label: "Raw peak discovery (unsmoothed)", smoothing: "none", threshold: 2.0, minWidthOctaves: 1 / 6, useRawPeaks: true, rawPeakThreshold: null },
    { id: "E", label: "Dual-resolution (production + raw peaks > +3 dB)", smoothing: "1/3", threshold: 2.0, minWidthOctaves: 1 / 6, useRawPeaks: true, rawPeakThreshold: 3.0 },
    { id: "F", label: "Dual-resolution + narrow-peak width (1/12)", smoothing: "1/3", threshold: 2.0, minWidthOctaves: 1 / 12, useRawPeaks: true, rawPeakThreshold: 3.0 },
  ];

  return variants.map((variant) => {
    const smoothed = getSmoothed(variant.smoothing);
    const deviationPoints = buildDeviationPoints(smoothed, targetCurve, assessmentStartHz, assessmentEndHz);
    const regions = auditFindRegions(deviationPoints, "peak", variant.threshold, variant.threshold, variant.minWidthOctaves);

    let rawRegions = [];
    if (variant.useRawPeaks) {
      const rawDeviationPoints = buildDeviationPoints(getSmoothed("none"), targetCurve, assessmentStartHz, assessmentEndHz);
      const rawThreshold = variant.rawPeakThreshold || variant.threshold;
      rawRegions = auditFindRegions(rawDeviationPoints, "peak", rawThreshold, rawThreshold, variant.minWidthOctaves);
    }

    const allRegions = [...regions, ...rawRegions];
    const seen = new Set();
    const dedupedRegions = allRegions.filter((r) => {
      const key = Math.round(r.centrePoint.frequency * 10) / 10;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const probeResults = {};
    for (const probeHz of probeFreqs) {
      const containing = dedupedRegions.find((r) => probeHz >= r.startHz && probeHz <= r.endHz);
      const nearest = containing || dedupedRegions.find((r) => Math.abs(r.centrePoint.frequency - probeHz) < 5) || null;
      const protectedNull = nearest ? isProtectedFrequency(nearest.centrePoint.frequency, protectedNullRegions) : false;
      const proposedGain = nearest ? -Math.min(15, nearest.severityDb * 0.85) : null;
      const proposedQ = nearest ? Math.max(0.5, Math.min(10, nearest.centrePoint.frequency / Math.max(nearest.endHz - nearest.startHz, 0.01))) : null;

      probeResults[probeHz] = {
        regionFound: !!containing || !!nearest,
        startHz: nearest?.startHz ?? null,
        centreHz: nearest?.centrePoint?.frequency ?? null,
        endHz: nearest?.endHz ?? null,
        severityDb: nearest?.severityDb ?? null,
        protectedNull,
        proposedDirection: nearest ? "cut" : "none",
        proposedFilterCentre: nearest?.centrePoint?.frequency ?? null,
        proposedGainDb: proposedGain,
        proposedQ,
        provisionalBankLimitStatus: proposedGain !== null && proposedGain < -15 ? "cut-limit-exceeded" : "within-limits",
        estimatedLocalImprovementDb: nearest ? Math.min(nearest.severityDb, Math.abs(proposedGain)) : null,
        wouldReachAcceptance: nearest ? !protectedNull && nearest.severityDb >= 2 : false,
      };
    }

    return {
      id: variant.id,
      label: variant.label,
      smoothing: variant.smoothing,
      threshold: variant.threshold,
      minWidthOctaves: variant.minWidthOctaves,
      useRawPeaks: variant.useRawPeaks,
      rawPeakThreshold: variant.rawPeakThreshold,
      totalRegions: dedupedRegions.length,
      protectedNullViolations: dedupedRegions.filter((r) => isProtectedFrequency(r.centrePoint.frequency, protectedNullRegions)).length,
      boostLimitViolations: 0,
      cutLimitViolations: dedupedRegions.filter((r) => r.severityDb * 0.85 > 15).length,
      probeResults,
    };
  });
}

// ── Section 6: Automatic peak scan ──
export function buildAutomaticPeakScan(rawCurve, targetCurve, protectedNullRegions, assessmentStartHz, assessmentEndHz, trace) {
  const cache = {};
  const getSmoothed = (res) => {
    if (!cache[res]) cache[res] = smoothAtResolution(rawCurve, res);
    return cache[res];
  };

  const residualNone = buildResidualCurve(getSmoothed("none"), targetCurve).filter((p) => p.frequency >= assessmentStartHz && p.frequency <= assessmentEndHz);
  const residual12 = buildResidualCurve(getSmoothed("1/12"), targetCurve).filter((p) => p.frequency >= assessmentStartHz && p.frequency <= assessmentEndHz);
  const residual6 = buildResidualCurve(getSmoothed("1/6"), targetCurve).filter((p) => p.frequency >= assessmentStartHz && p.frequency <= assessmentEndHz);
  const residual3 = buildResidualCurve(getSmoothed("1/3"), targetCurve).filter((p) => p.frequency >= assessmentStartHz && p.frequency <= assessmentEndHz);

  const getResidualAt = (residualCurve, freq) => {
    const p = residualCurve.find((r) => Math.abs(r.frequency - freq) < 0.5);
    return p ? p.residualDb : null;
  };

  const positivePeaks = [...residualNone].sort((a, b) => b.residualDb - a.residualDb).slice(0, 10);
  const negativePeaks = [...residualNone].sort((a, b) => a.residualDb - b.residualDb).slice(0, 5);

  const finalBank = trace.handoffBanks?.candidateStages?.find((s) => s.stage === "finalOptimisedBassResponse.canonicalFilterBank");
  const finalFilters = finalBank?.filters || [];
  const detectedRegions = trace.discoveredRegions || [];
  const trials = trace.generatedTrials || [];

  const classifyPeak = (freq, rawResidual, prodResidual) => {
    const hasRegion = detectedRegions.some((r) => r.regions?.some((reg) => freq >= reg.startHz && freq <= reg.endHz));
    const hasTrial = trials.some((t) => t.trials?.some((tr) => Math.abs(tr.frequencyHz - freq) < 3));
    const hasFilter = finalFilters.some((f) => Math.abs(f.frequencyHz - freq) < 3 && f.gainDb < 0);
    if (hasFilter) return "final correction present";
    if (hasTrial) {
      const trial = trials.flatMap((t) => t.trials || []).find((tr) => Math.abs(tr.frequencyHz - freq) < 3);
      return trial?.accepted ? "accepted but lost" : "trial rejected";
    }
    if (hasRegion) return "rejected before trial evidence";
    if (rawResidual !== null && prodResidual !== null && rawResidual >= 2 && Math.abs(prodResidual) < 1) return "hidden by smoothing";
    if (rawResidual !== null && rawResidual < 2) return "failed threshold";
    return "failed width";
  };

  const formatPeak = (peak) => {
    const freq = peak.frequency;
    const rawResidual = peak.residualDb;
    const r12 = getResidualAt(residual12, freq);
    const r6 = getResidualAt(residual6, freq);
    const r3 = getResidualAt(residual3, freq);
    const hasRegion = detectedRegions.some((r) => r.regions?.some((reg) => freq >= reg.startHz && freq <= reg.endHz));
    const hasTrial = trials.some((t) => t.trials?.some((tr) => Math.abs(tr.frequencyHz - freq) < 3));
    const hasFilter = finalFilters.some((f) => Math.abs(f.frequencyHz - freq) < 3 && f.gainDb < 0);
    return {
      frequencyHz: freq,
      unsmoothedResidualDb: rawResidual,
      residual12Db: r12,
      residual6Db: r6,
      residual3Db: r3,
      productionRegionDiscovered: hasRegion,
      productionTrialGenerated: hasTrial,
      finalFilterNearby: hasFilter,
      finalEqContribution: UNAVAILABLE,
      detectionStatus: classifyPeak(freq, rawResidual, r3),
    };
  };

  return {
    topPositive: positivePeaks.map(formatPeak),
    topNegative: negativePeaks.map((p) => ({
      ...formatPeak(p),
      detectionStatus: p.residualDb < -10 ? "protected null — do not boost" : "negative residual",
    })),
  };
}