// src/components/utils/rp22/measuredP17Engine.jsx
// RP22 P17 MEASURED ENGINE — STAGE 1 SCAFFOLDING ONLY.
//
// This module estimates the predicted seat response using the nearest available measured
// horizontal and vertical polar data for a speaker. This is an ENGINEERING APPROXIMATION of the
// loudspeaker's 3D radiation pattern (built from two orthogonal measured slices — we do not have
// a full 3D Klippel balloon) and must NOT be presented internally as an exact measured 3D
// response.
//
// STAGE 1: no real speaker uses this path yet — no registry model declares
// `polarModel.type === "measured"`, and no placeholder/fake polar data has been added anywhere.
// This file exists purely as inactive scaffolding so Stage 2 can add real PAS/FRD datasets
// (starting with Spitfire Cloud) without further engine changes.
//
// RP22 CLASSIFICATION IS NOT PERFORMED HERE. This module only returns acoustic prediction data
// (predicted response, deviation, worst octave, angles used). The existing RP22 layer/classifier
// (useRP22AnalysisEngine.jsx / rp22HfOffAxis.jsx) remains solely responsible for assigning
// RP22 levels — see classifyMeasuredP17Level in rp22HfOffAxis.jsx.
//
// NEAREST-ANGLE ONLY: interpolation between measured angles will be implemented only after the
// discrete-angle implementation has been validated against real PAS/FRD data.

import { computeSlidingOctaveDeviation } from "@/components/utils/rp22/slidingOctaveEngine";
import { validatePolarModel } from "@/components/utils/rp22/polarModelValidation";
import { loadMeasuredDataset } from "@/components/utils/rp22/measuredDatasetLoader";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

// Find the nearest available measured angle from a list of measured angles (nearest-neighbour
// only — see file header note on interpolation).
function findNearestMeasuredAngle(angles, targetDeg) {
  if (!Array.isArray(angles) || !angles.length || !isNum(targetDeg)) return null;
  let best = angles[0];
  let bestDist = Math.abs(angles[0] - targetDeg);
  for (const a of angles) {
    const d = Math.abs(a - targetDeg);
    if (d < bestDist) {
      best = a;
      bestDist = d;
    }
  }
  return best;
}

// Linear interpolation of a measured polar curve at an arbitrary target angle, between the two
// bracketing measured angles. Exact measured-angle matches return that angle's verbatim curve.
// Clamps to the nearest endpoint measured curve outside the measured range (no extrapolation).
// Curves are arrays of { frequency, spl }; the lo-curve's frequency grid is used and the hi-curve
// is sampled at the same frequencies (curves share a common log-spaced grid in the source data).
function interpolatedCurve(map, angles, targetDeg) {
  if (!map || !Array.isArray(angles) || !angles.length || !isNum(targetDeg)) return null;
  const t = Number(targetDeg);
  // Exact measured-angle match (object keys are strings; numeric t coerces correctly).
  if (map[t] != null && Array.isArray(map[t]) && map[t].length) return map[t];

  const sorted = [...angles].sort((a, b) => a - b);
  if (t <= sorted[0]) return (Array.isArray(map[sorted[0]]) && map[sorted[0]].length) ? map[sorted[0]] : null;
  if (t >= sorted[sorted.length - 1]) {
    const last = sorted[sorted.length - 1];
    return (Array.isArray(map[last]) && map[last].length) ? map[last] : null;
  }

  let lo = sorted[0];
  let hi = sorted[sorted.length - 1];
  for (let i = 0; i < sorted.length - 1; i++) {
    if (t >= sorted[i] && t <= sorted[i + 1]) { lo = sorted[i]; hi = sorted[i + 1]; break; }
  }
  const loCurve = map[lo];
  const hiCurve = map[hi];
  if (!Array.isArray(loCurve) || !loCurve.length || !Array.isArray(hiCurve) || !hiCurve.length) return null;

  const frac = (t - lo) / (hi - lo);
  // Sample the hi-curve at a given frequency (linear interp across its sorted frequency grid).
  const hiAt = (freq) => {
    for (let i = 0; i < hiCurve.length; i++) {
      if (hiCurve[i].frequency === freq) return hiCurve[i].spl;
      if (hiCurve[i].frequency > freq) {
        if (i === 0) return hiCurve[0].spl;
        const a = hiCurve[i - 1];
        const b = hiCurve[i];
        const tt = (freq - a.frequency) / (b.frequency - a.frequency);
        return a.spl + (b.spl - a.spl) * tt;
      }
    }
    return hiCurve[hiCurve.length - 1].spl;
  };

  return loCurve
    .map((p) => {
      const f = p.frequency;
      const loSpl = p.spl;
      const hiSpl = hiAt(f);
      if (!isNum(loSpl) || !isNum(hiSpl)) return { frequency: f, spl: loSpl };
      return { frequency: f, spl: loSpl + (hiSpl - loSpl) * frac };
    })
    .filter((p) => isNum(p.spl));
}

/**
 * Estimate the predicted response at one 3D listening angle using the nearest available measured
 * horizontal and vertical polar data. Engineering approximation only — see file header.
 *
 * @param {object} params
 * @param {object} params.polarModel - registry polarModel definition (type: "measured")
 * @param {number} params.horizontalOffAxisAngle - true horizontal off-axis angle (deg)
 * @param {number} params.verticalOffAxisAngle - true vertical off-axis angle (deg)
 * @param {object} [params.devOverride] - IS_DEVELOPMENT_MODE-only validation mode:
 *        { forceHorizontalDeg, forceVerticalDeg } forces the lookup to a specific measured angle.
 */
export function estimatePredictedResponse({ polarModel, horizontalOffAxisAngle, verticalOffAxisAngle, devOverride }) {
  const validation = validatePolarModel(polarModel);

  if (!validation.readyForMeasuredP17) {
    return {
      predictedResponse: null,
      selectedHorizontalAngle: null,
      selectedVerticalAngle: null,
      horizontalOffAxisAngle: isNum(horizontalOffAxisAngle) ? horizontalOffAxisAngle : null,
      verticalOffAxisAngle: isNum(verticalOffAxisAngle) ? verticalOffAxisAngle : null,
      missingMeasuredData: true,
      missingDataReason: "Measured dataset unavailable",
    };
  }

  // Resolve the named dataset (never embedded on polarModel itself — see file header).
  const dataset = loadMeasuredDataset(polarModel.dataset);
  if (!dataset.found) {
    return {
      predictedResponse: null,
      selectedHorizontalAngle: null,
      selectedVerticalAngle: null,
      horizontalOffAxisAngle: isNum(horizontalOffAxisAngle) ? horizontalOffAxisAngle : null,
      verticalOffAxisAngle: isNum(verticalOffAxisAngle) ? verticalOffAxisAngle : null,
      missingMeasuredData: true,
      missingDataReason: "Measured dataset unavailable",
    };
  }

  // Validation mode: force the lookup to a specific measured angle (dev-only override).
  const targetH = isNum(devOverride?.forceHorizontalDeg) ? devOverride.forceHorizontalDeg : horizontalOffAxisAngle;
  const targetV = isNum(devOverride?.forceVerticalDeg) ? devOverride.forceVerticalDeg : verticalOffAxisAngle;

  const selectedHorizontalAngle = findNearestMeasuredAngle(dataset.horizontalAngles, targetH);
  const selectedVerticalAngle = findNearestMeasuredAngle(dataset.verticalAngles, targetV);

  // Interpolate between neighbouring measured angles (linear in angle) rather than snapping to
  // the nearest measured angle. selectedHorizontal/VerticalAngle are retained for diagnostics.
  const hCurve = interpolatedCurve(dataset.horizontal, dataset.horizontalAngles, targetH);
  const vCurve = interpolatedCurve(dataset.vertical, dataset.verticalAngles, targetV);

  if (!Array.isArray(hCurve) || !hCurve.length || !Array.isArray(vCurve) || !vCurve.length) {
    return {
      predictedResponse: null,
      selectedHorizontalAngle,
      selectedVerticalAngle,
      horizontalOffAxisAngle: isNum(horizontalOffAxisAngle) ? horizontalOffAxisAngle : null,
      verticalOffAxisAngle: isNum(verticalOffAxisAngle) ? verticalOffAxisAngle : null,
      missingMeasuredData: true,
      missingDataReason: "Measured dataset unavailable",
    };
  }

  // STAGE 1 SCAFFOLDING NOTE: this combines the two orthogonal measured slices into a single
  // estimated response curve. It is a placeholder combination method — no real Stage 2 dataset
  // exists yet to validate a better model against. This is an estimate of the 3D response, and
  // must NOT be read as "horizontal loss + vertical loss".
  const freqs = Array.from(new Set([...hCurve.map((p) => p.frequency), ...vCurve.map((p) => p.frequency)])).sort((a, b) => a - b);
  const predictedResponse = freqs
    .map((f) => {
      const hSpl = hCurve.find((p) => p.frequency === f)?.spl;
      const vSpl = vCurve.find((p) => p.frequency === f)?.spl;
      const spl = isNum(hSpl) && isNum(vSpl) ? (hSpl + vSpl) / 2 : (isNum(hSpl) ? hSpl : vSpl);
      return { frequency: f, spl };
    })
    .filter((p) => isNum(p.spl));

  return {
    predictedResponse,
    selectedHorizontalAngle,
    selectedVerticalAngle,
    horizontalOffAxisAngle: isNum(horizontalOffAxisAngle) ? horizontalOffAxisAngle : null,
    verticalOffAxisAngle: isNum(verticalOffAxisAngle) ? verticalOffAxisAngle : null,
    missingMeasuredData: false,
    missingDataReason: null,
  };
}

/**
 * Full measured P17 response computation for one speaker at one seat, compared against the RSP.
 * Returns acoustic prediction data ONLY — no RP22 level is assigned here (see file header).
 *
 * @param {object} params
 * @param {object} params.polarModel
 * @param {number} params.seatHorizontalOffAxisAngle
 * @param {number} params.seatVerticalOffAxisAngle
 * @param {number} params.rspHorizontalOffAxisAngle
 * @param {number} params.rspVerticalOffAxisAngle
 * @param {object} [params.devOverride] - applies only to the seat lookup, never the RSP reference.
 */
export function computeMeasuredP17Response({
  polarModel,
  seatHorizontalOffAxisAngle,
  seatVerticalOffAxisAngle,
  rspHorizontalOffAxisAngle,
  rspVerticalOffAxisAngle,
  devOverride,
}) {
  const seatEstimate = estimatePredictedResponse({
    polarModel,
    horizontalOffAxisAngle: seatHorizontalOffAxisAngle,
    verticalOffAxisAngle: seatVerticalOffAxisAngle,
    devOverride,
  });

  if (seatEstimate.missingMeasuredData) {
    return {
      predictedResponse: null,
      maximumDeviationDb: null,
      worstOctave: null,
      selectedHorizontalAngle: seatEstimate.selectedHorizontalAngle,
      selectedVerticalAngle: seatEstimate.selectedVerticalAngle,
      horizontalOffAxisAngle: seatEstimate.horizontalOffAxisAngle,
      verticalOffAxisAngle: seatEstimate.verticalOffAxisAngle,
      missingMeasuredData: true,
      missingDataReason: seatEstimate.missingDataReason,
    };
  }

  // RSP reference lookup is never forced by devOverride — the override only affects the seat
  // under test, so validation mode can compare a forced seat angle against the true RSP.
  const rspEstimate = estimatePredictedResponse({
    polarModel,
    horizontalOffAxisAngle: rspHorizontalOffAxisAngle,
    verticalOffAxisAngle: rspVerticalOffAxisAngle,
  });

  if (rspEstimate.missingMeasuredData) {
    return {
      predictedResponse: seatEstimate.predictedResponse,
      maximumDeviationDb: null,
      worstOctave: null,
      selectedHorizontalAngle: seatEstimate.selectedHorizontalAngle,
      selectedVerticalAngle: seatEstimate.selectedVerticalAngle,
      horizontalOffAxisAngle: seatEstimate.horizontalOffAxisAngle,
      verticalOffAxisAngle: seatEstimate.verticalOffAxisAngle,
      missingMeasuredData: true,
      missingDataReason: "Missing measured data for RSP reference angle.",
    };
  }

  const { maxDeviationDb, worstOctave } = computeSlidingOctaveDeviation(
    seatEstimate.predictedResponse,
    rspEstimate.predictedResponse
  );

  return {
    predictedResponse: seatEstimate.predictedResponse,
    maximumDeviationDb: maxDeviationDb,
    worstOctave,
    selectedHorizontalAngle: seatEstimate.selectedHorizontalAngle,
    selectedVerticalAngle: seatEstimate.selectedVerticalAngle,
    horizontalOffAxisAngle: seatEstimate.horizontalOffAxisAngle,
    verticalOffAxisAngle: seatEstimate.verticalOffAxisAngle,
    missingMeasuredData: false,
    missingDataReason: null,
  };
}

// Re-export the validation framework so callers only need one import for the measured engine.
export { validatePolarModel };

// Development-only diagnostic builder (requirement: dev diagnostics + validation mode).
// Inactive until a dev-only HUD/panel wires it up in Stage 2 against a real measured speaker.
// Must not be exposed in production — gate any UI usage behind IS_DEVELOPMENT_MODE.
export function buildP17MeasuredDevDiagnostics({ speakerRole, measuredResult, predictedRp22Level }) {
  if (!measuredResult) return null;
  return {
    speakerRole: speakerRole ?? null,
    horizontalOffAxisAngle: measuredResult.horizontalOffAxisAngle,
    verticalOffAxisAngle: measuredResult.verticalOffAxisAngle,
    selectedHorizontalAngle: measuredResult.selectedHorizontalAngle,
    selectedVerticalAngle: measuredResult.selectedVerticalAngle,
    worstOctave: measuredResult.worstOctave,
    maximumDeviationDb: measuredResult.maximumDeviationDb,
    predictedRp22Level: predictedRp22Level ?? null,
    missingMeasuredData: measuredResult.missingMeasuredData,
    missingDataReason: measuredResult.missingDataReason,
  };
}