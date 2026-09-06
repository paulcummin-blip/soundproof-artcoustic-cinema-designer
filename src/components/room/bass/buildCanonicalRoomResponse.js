// buildCanonicalRoomResponse.js — Stage 1: Build the canonical unsmoothed
// flat-reference Room Response from already-calculated per-source complex
// RSP transfers.
//
// The perSourceRspComplexTransfers are produced during the authoritative
// preparation path (authoritativeBassResponseEngine.js) using the same
// flat 94 dB source and normalized physics as the legacy normalized room
// transfer engine. Each source's complex pressure already includes the
// installed tuning (gainDb, delayMs, polarity) applied by the simulation.
//
// This function complex-sums the sources and converts to dB SPL, producing
// the exact same 360-point, 15–200 Hz, unsmoothed, flat-reference Room
// Response that the legacy normalized engine produced — at zero additional
// acoustic cost (combination only, ~1 ms).
//
// This is a lifecycle/persistence fix, NOT an acoustic change. The maths
// is identical to normalizedRoomTransferEngine.js's RSP summation.

import { buildCurveSignature } from "./bassResultAuthority";

function complexToDb(re, im) {
  const magnitude = Math.sqrt(re * re + im * im);
  return 20 * Math.log10(Math.max(magnitude, 1e-10));
}

/**
 * Build the canonical unsmoothed flat-reference Room Response curve from
 * already-calculated per-source complex RSP transfers.
 *
 * @param {Array} perSourceRspComplexTransfers — array of {
 *   sourceIndex, sourceId, points: [{ frequency, re, im }], ...
 * }
 * @returns {{ points: Array<{frequency, spl}>, signature: string, pointCount: number, sourceCount: number } | null}
 */
export function buildCanonicalRoomResponse(perSourceRspComplexTransfers) {
  if (!Array.isArray(perSourceRspComplexTransfers) || perSourceRspComplexTransfers.length === 0) {
    return null;
  }

  const firstSource = perSourceRspComplexTransfers[0];
  const firstPoints = firstSource?.points;
  if (!Array.isArray(firstPoints) || firstPoints.length === 0) {
    return null;
  }

  const pointCount = firstPoints.length;
  const frequencies = new Array(pointCount);
  const sumRe = new Array(pointCount).fill(0);
  const sumIm = new Array(pointCount).fill(0);

  for (let i = 0; i < pointCount; i++) {
    frequencies[i] = Number(firstPoints[i].frequency);
  }

  for (const source of perSourceRspComplexTransfers) {
    const points = source?.points;
    if (!Array.isArray(points)) continue;
    const len = Math.min(points.length, pointCount);
    for (let i = 0; i < len; i++) {
      const re = Number(points[i]?.re);
      const im = Number(points[i]?.im);
      if (Number.isFinite(re) && Number.isFinite(im)) {
        sumRe[i] += re;
        sumIm[i] += im;
      }
    }
  }

  const points = [];
  for (let i = 0; i < pointCount; i++) {
    const frequency = frequencies[i];
    if (!Number.isFinite(frequency) || frequency <= 0) continue;
    const spl = complexToDb(sumRe[i], sumIm[i]);
    if (Number.isFinite(spl)) points.push({ frequency, spl });
  }

  if (points.length === 0) return null;

  return {
    points,
    signature: buildCurveSignature(points),
    pointCount: points.length,
    sourceCount: perSourceRspComplexTransfers.length,
  };
}

/**
 * Extract the plain curve array ({frequency, spl}[]) from a canonical Room
 * Response result for persistence / graph consumption.
 */
export function canonicalRoomResponseCurve(result) {
  if (!result) return [];
  if (Array.isArray(result)) return result;
  if (Array.isArray(result.points)) return result.points;
  return [];
}