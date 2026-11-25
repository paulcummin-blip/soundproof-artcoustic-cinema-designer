// stage1ResponseRecovery.js
// ---------------------------------------------------------------------------
// Recover genuine predicted response curves for Stage 1 recommended finalists
// using the existing normalized room-transfer engine. This does NOT rerun the
// placement search — it calls computeNormalizedRoomTransfer for the three
// recommended finalists only (three calls, not the full search).
//
// The output is a RELATIVE room-transfer response (predicted relative room
// response), not measured SPL or final product-specific performance. Curves
// are labelled honestly and use the same 20–80 Hz range and consistent
// normalisation across all three cards.
//
// No curves are independently flattened, exaggerated or artificially
// smoothed. The raw complex-pressure sum is converted to dB exactly as the
// production path does, then filtered to the 20–80 Hz display band.
// ---------------------------------------------------------------------------

import { computeNormalizedRoomTransfer } from "../normalizedRoomTransferEngine";
import { prepareStage1Context, buildStage1EngineOptions } from "../stage1/stage1CandidateEvaluation";
import { STAGE1_SCREENING_FREQ_MIN_HZ, STAGE1_SCREENING_FREQ_MAX_HZ, STAGE1_FALLBACK_SOURCE_HEIGHT_M } from "../stage1/stage1Constants";
import { resolveSeatPriority, PRIMARY } from "@/components/utils/seatPriorityAuthority";

const DISPLAY_FREQ_MIN = STAGE1_SCREENING_FREQ_MIN_HZ; // 20
const DISPLAY_FREQ_MAX = STAGE1_SCREENING_FREQ_MAX_HZ; // 80

function filterToDisplayBand(curve) {
  return (curve || []).filter(
    (p) => p.frequency >= DISPLAY_FREQ_MIN && p.frequency <= DISPLAY_FREQ_MAX && Number.isFinite(p.spl),
  );
}

/**
 * Build simulation sources from a Stage 1 recommendation option's
 * coordinates. Each source is a virtual-source point at the wall boundary
 * (x, y in metres, z = STAGE1_FALLBACK_SOURCE_HEIGHT_M), with flat tuning
 * (0 dB gain, 0 ms delay, 0 polarity). This matches the Stage 1 evaluation
 * exactly.
 * @private
 */
function buildSimSources(option) {
  const coordinates = Array.isArray(option?.coordinates) ? option.coordinates : [];
  return coordinates.map((c, i) => ({
    id: `stage1-preview-src-${i + 1}`,
    x: Number(c.x),
    y: Number(c.y),
    z: STAGE1_FALLBACK_SOURCE_HEIGHT_M,
    placement: "front",
    tuning: { gainDb: 0, delayMs: 0, polarity: 0 },
  }));
}

/**
 * Map transfer-engine seat curves to primary/secondary using the seating
 * positions' priority field. Returns { primaryCurves, secondaryCurves }.
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
    const filtered = filterToDisplayBand(sc.responseData);
    if (filtered.length > 0) {
      if (priority === PRIMARY) primaryCurves.push(filtered);
      else secondaryCurves.push(filtered);
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
 * Recover predicted response curves for a single Stage 1 finalist.
 *
 * Returns { rspCurve, primaryAverage, primaryBand: { min, max },
 * secondaryCount, primaryCount, frequencies } or null on error.
 *
 * Curves are filtered to the 20–80 Hz display band. No smoothing, no
 * flattening, no artificial enhancement.
 *
 * @param {object} option — Stage 1 recommendation option ({ coordinates, ... })
 * @param {object} context — { roomDims, rspPosition, seatingPositions, physicsOptions, preparedModes }
 * @returns {object|null}
 */
export function recoverStage1ResponsePreview(option, context) {
  if (!option || !context) return null;
  const { roomDims, rspPosition, seatingPositions, physicsOptions, preparedModes } = context;
  if (!roomDims || !Array.isArray(option?.coordinates) || option.coordinates.length === 0) return null;

  const sources = buildSimSources(option);
  if (sources.length === 0) return null;

  const transfer = computeNormalizedRoomTransfer({
    roomDims,
    rspPosition,
    seatingPositions,
    subsForSimulation: sources,
    physicsOptions,
    preparedModes,
  });

  if (transfer.status !== "complete") return null;

  const rspCurve = filterToDisplayBand(transfer.rspCurve);
  const { primaryCurves, secondaryCurves } = mapSeatCurves(transfer.seatCurves, seatingPositions);

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
 * Prepare a shared Stage 1 context (including precomputed room modes) for
 * efficient multi-finalist curve recovery. Compute the mode bank once and
 * reuse it across all three finalist calls.
 *
 * @param {object} params — { roomDims, rspPosition, seatingPositions, physicsOptions }
 * @returns {object} context for recoverStage1ResponsePreview
 */
export function prepareStage1PreviewContext({ roomDims, rspPosition, seatingPositions, physicsOptions }) {
  const ctx = prepareStage1Context({ roomDims, rspPosition, seatingPositions, physicsOptions });
  return {
    roomDims: ctx.roomDims,
    rspPosition: ctx.rspPosition,
    seatingPositions: ctx.seatingPositions,
    physicsOptions: ctx.physicsOptions,
    preparedModes: ctx.preparedModes,
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
 * @param {Array} rawPreviews — array of recoverStage1ResponsePreview outputs
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