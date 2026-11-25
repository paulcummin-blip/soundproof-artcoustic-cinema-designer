// stage1ResponseRecovery.js
// ---------------------------------------------------------------------------
// Build Stage 1 recommendation preview curves from the REFINED response
// evidence stored on each finalist (the 32 PPO refinement pass). The preview
// graph and the displayed metrics therefore describe the SAME response — no
// independent 96 PPO recovery pass, and no recomputation when the designer
// changes product selection, P14 target, zoom or workspace settings.
//
// The output is a RELATIVE room-transfer response (predicted relative room
// response), not measured SPL or final product-specific performance. Curves
// are labelled honestly and use the same 20–80 Hz range and consistent
// normalisation across all three cards.
//
// No curves are independently flattened, exaggerated or artificially
// smoothed. The raw complex-pressure sum was already converted to dB by the
// refinement pass; here it is only averaged / enveloped and normalised.
// ---------------------------------------------------------------------------

import { resolveSeatPriority, PRIMARY } from "@/components/utils/seatPriorityAuthority";

/**
 * Map stored response-evidence seat curves to primary/secondary using the
 * seating positions' priority field. Returns { primaryCurves, secondaryCurves }.
 * The evidence curves are already filtered to the 20–80 Hz display band.
 * @private
 */
function mapSeatCurves(seatCurves, seatingPositions) {
  const priorityMap = new Map();
  (Array.isArray(seatingPositions) ? seatingPositions : []).forEach((seat) => {
    const id = String(seat?.id || "");
    if (id) priorityMap.set(id, resolveSeatPriority(seat));
  });

  const primaryCurves = [];
  const secondaryCurves = [];
  for (const sc of (Array.isArray(seatCurves) ? seatCurves : [])) {
    const id = String(sc.originalSeatId || "");
    const priority = priorityMap.get(id) || PRIMARY;
    const curve = (sc.responseData || []).filter((p) => Number.isFinite(p.spl));
    if (curve.length > 0) {
      if (priority === PRIMARY) primaryCurves.push(curve);
      else secondaryCurves.push(curve);
    }
  }
  return { primaryCurves, secondaryCurves };
}

/**
 * Compute the average of an array of curves at each frequency. All curves
 * must share the same frequency points.
 * @private
 */
function averageCurves(curves) {
  if (!curves.length) return [];
  const length = Math.min(...curves.map((c) => c.length));
  const out = [];
  for (let i = 0; i < length; i += 1) {
    const freq = curves[0][i].frequency;
    const values = curves.map((c) => c[i]?.spl).filter(Number.isFinite);
    const avg = values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
    out.push({ frequency: freq, spl: Number.isFinite(avg) ? avg : null });
  }
  return out;
}

/**
 * Compute the min/max envelope across an array of curves at each frequency.
 * Returns { min, max } arrays for the shaded seat-to-seat variation band.
 * @private
 */
function envelopeCurves(curves) {
  if (!curves.length) return { min: [], max: [] };
  const length = Math.min(...curves.map((c) => c.length));
  const min = [];
  const max = [];
  for (let i = 0; i < length; i += 1) {
    const freq = curves[0][i].frequency;
    const values = curves.map((c) => c[i]?.spl).filter(Number.isFinite);
    if (values.length) {
      min.push({ frequency: freq, spl: Math.min(...values) });
      max.push({ frequency: freq, spl: Math.max(...values) });
    }
  }
  return { min, max };
}

/**
 * Build a Stage 1 preview from the refined response evidence stored on a
 * recommendation option. No engine call: the 32 PPO refinement pass already
 * produced the rspCurve and per-seat curves; here they are only mapped to
 * primary/secondary, averaged and enveloped for the shaded band.
 *
 * Returns { rspCurve, primaryAverage, primaryBand: { min, max },
 * secondaryCount, primaryCount, frequencies } or null when no evidence.
 *
 * @param {object} option — Stage 1 recommendation option with responseEvidence
 * @param {Array} seatingPositions — original seats (for priority mapping)
 * @returns {object|null}
 */
export function buildStage1PreviewFromEvidence(option, seatingPositions) {
  const evidence = option?.responseEvidence;
  if (!evidence) return null;
  const rspCurve = (evidence.rspCurve || []).filter((p) => Number.isFinite(p.spl));
  if (rspCurve.length === 0) return null;
  const { primaryCurves, secondaryCurves } = mapSeatCurves(evidence.seatCurves, seatingPositions);
  const primaryAverage = averageCurves(primaryCurves);
  const primaryBand = envelopeCurves(primaryCurves);
  return {
    rspCurve,
    primaryAverage,
    primaryBand,
    primaryCount: primaryCurves.length,
    secondaryCount: secondaryCurves.length,
    frequencies: rspCurve.map((p) => p.frequency),
  };
}

/**
 * Normalise a set of preview curves to a common reference for honest visual
 * comparison. Each curve set is shifted so its RSP curve's mean (in the
 * display band) is 0 dB. The raw curve shapes are preserved — no flattening,
 * no smoothing, no exaggeration.
 *
 * Returns { previews, yMin, yMax } where yMin/yMax are the common dB range
 * across all normalised curve sets.
 *
 * @param {Array} rawPreviews — array of buildStage1PreviewFromEvidence outputs
 * @returns {object} { previews, yMin, yMax }
 */
export function normalisePreviewsForDisplay(rawPreviews) {
  const valid = (Array.isArray(rawPreviews) ? rawPreviews : []).filter(Boolean);
  if (valid.length === 0) return { previews: [], yMin: -15, yMax: 15 };

  const previews = valid.map((preview) => {
    const rspValues = (preview.rspCurve || []).map((p) => p.spl).filter(Number.isFinite);
    const rspMean = rspValues.length ? rspValues.reduce((s, v) => s + v, 0) / rspValues.length : 0;

    const shift = (curve) => (curve || []).map((p) => ({
      frequency: p.frequency,
      spl: Number.isFinite(p.spl) ? p.spl - rspMean : null,
    }));

    return {
      rspCurve: shift(preview.rspCurve),
      primaryAverage: shift(preview.primaryAverage),
      primaryBand: {
        min: shift(preview.primaryBand?.min),
        max: shift(preview.primaryBand?.max),
      },
      primaryCount: preview.primaryCount,
      secondaryCount: preview.secondaryCount,
      frequencies: preview.frequencies,
    };
  });

  // Compute common y-range across all normalised curves.
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const p of previews) {
    for (const curve of [p.rspCurve, p.primaryAverage, p.primaryBand?.min, p.primaryBand?.max]) {
      for (const point of (curve || [])) {
        if (Number.isFinite(point.spl)) {
          yMin = Math.min(yMin, point.spl);
          yMax = Math.max(yMax, point.spl);
        }
      }
    }
  }
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) {
    yMin = -15;
    yMax = 15;
  }
  // Add padding and round to whole dB.
  const pad = 2;
  yMin = Math.floor(yMin - pad);
  yMax = Math.ceil(yMax + pad);

  return { previews, yMin, yMax };
}