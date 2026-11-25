// stage1NullDetector.js
// ---------------------------------------------------------------------------
// Validated frequency-defined broad depression / null detector for Stage 1
// screening.
//
// Smoothing and reference windows are fixed in fractional-octave terms so the
// detector represents the same physical bandwidth at every resolution (8, 16,
// 32 or 96 points per octave) and narrow simulated features can never
// dominate practical placement recommendations.
//
// Reference shoulders use the EXISTING extended simulation response (15–200
// Hz): the detector runs on the full curve so depressions near the 20/80 Hz
// screening-band edges have complete shoulders, then only depressions centred
// inside the 20–80 Hz screening band are reported.
//
// Bandwidth is measured by interpolated threshold crossings (linear
// interpolation between the last sample below and the first sample above the
// broad-depression depth), and a depression only qualifies when its bandwidth
// is at least minBandwidthFractionOctave.
//
// This module is DETECTION ONLY. It changes no candidate generation, no
// ranking weights, no RP22 scoring, no physics and no UI.
// ---------------------------------------------------------------------------

import { STAGE1_NULL_RULE, STAGE1_SCREENING_FREQ_MIN_HZ, STAGE1_SCREENING_FREQ_MAX_HZ } from "./stage1Constants";

function mean(values) {
  if (!values.length) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/**
 * Collect the spl values from `points` whose frequency lies within the
 * fractional-octave window [centre * 2^(-halfWidth), centre * 2^(halfWidth)].
 * `points` must be sorted by ascending frequency. Optionally exclude points
 * whose frequency lies within an inner window (used to drop the smoothing
 * band from the reference shoulders).
 * @private
 */
function valuesInOctaveWindow(points, centreHz, halfWidth, excludeInnerHalfWidth = 0) {
  const lo = centreHz / Math.pow(2, halfWidth);
  const hi = centreHz * Math.pow(2, halfWidth);
  const innerLo = excludeInnerHalfWidth > 0 ? centreHz / Math.pow(2, excludeInnerHalfWidth) : Infinity;
  const innerHi = excludeInnerHalfWidth > 0 ? centreHz * Math.pow(2, excludeInnerHalfWidth) : -Infinity;
  const out = [];
  for (const p of points) {
    if (!Number.isFinite(p.spl)) continue;
    if (p.frequency < lo || p.frequency > hi) continue;
    if (excludeInnerHalfWidth > 0 && p.frequency > innerLo && p.frequency < innerHi) continue;
    out.push(p.spl);
  }
  return out;
}

/**
 * Smooth a response curve with a fixed fractional-octave moving average.
 * Returns a new array of { frequency, spl } with the smoothed spl at each
 * original frequency. The window is defined by `halfWidthOctave` (half-width
 * on each side of the centre frequency). A point with no neighbours in the
 * window keeps its own value.
 * @private
 */
function smoothByFractionalOctave(points, halfWidthOctave) {
  return points.map((point) => {
    const values = valuesInOctaveWindow(points, point.frequency, halfWidthOctave);
    return { frequency: point.frequency, spl: values.length ? mean(values) : point.spl };
  });
}

/**
 * Compute the depression depth at each point relative to its fractional-octave
 * reference shoulders. The shoulder window is `shoulderHalfWidthOctave` on each
 * side, EXCLUDING the inner smoothing window so the immediate smoothed value
 * does not contribute to its own reference. Depth is clamped to >= 0.
 * @private
 */
function depressionDepths(smoothed, smoothingHalfWidthOctave, shoulderHalfWidthOctave) {
  return smoothed.map((point) => {
    const shoulders = valuesInOctaveWindow(smoothed, point.frequency, shoulderHalfWidthOctave, smoothingHalfWidthOctave);
    const shoulderMean = shoulders.length ? mean(shoulders) : point.spl;
    return { frequency: point.frequency, spl: point.spl, depthDb: Math.max(0, shoulderMean - point.spl) };
  });
}

/**
 * Linear-interpolated crossing frequency between two samples where the depth
 * crosses the threshold. Returns the frequency at which depth == threshold.
 * @private
 */
function interpolateCrossing(lowPoint, highPoint, threshold) {
  const f0 = lowPoint.frequency;
  const f1 = highPoint.frequency;
  const d0 = lowPoint.depthDb;
  const d1 = highPoint.depthDb;
  if (d0 === d1) return f0;
  const t = (threshold - d0) / (d1 - d0);
  return f0 + t * (f1 - f0);
}

/**
 * Detect broad depressions in a response curve using the validated
 * frequency-defined method.
 *
 * @param {Array} curve — full response curve [{ frequency, spl }], typically
 *   15–200 Hz so edge depressions have complete shoulders.
 * @param {object} [rule] — override for STAGE1_NULL_RULE (mainly for tests)
 * @returns {Array} depressions centred inside the 20–80 Hz screening band:
 *   [{ centreHz, depthDb, bandwidthHz, bandwidthFractionOctave, isSevere }]
 */
export function detectFrequencyDefinedDepressions(curve, rule = STAGE1_NULL_RULE) {
  const points = (Array.isArray(curve) ? curve : [])
    .filter((p) => Number.isFinite(p?.frequency) && p?.frequency > 0 && Number.isFinite(p?.spl))
    .slice()
    .sort((a, b) => a.frequency - b.frequency);
  if (points.length < 3) return [];

  const smoothed = smoothByFractionalOctave(points, rule.smoothingFractionOctave);
  const depths = depressionDepths(smoothed, rule.smoothingFractionOctave, rule.shoulderFractionOctave);

  // Group contiguous points (by frequency order) whose depth meets the broad
  // threshold. A group is a candidate broad depression.
  const groups = [];
  let active = [];
  for (const point of depths) {
    if (point.depthDb >= rule.broadDepthDb) {
      active.push(point);
    } else if (active.length) {
      groups.push(active);
      active = [];
    }
  }
  if (active.length) groups.push(active);

  const depressions = [];
  for (const group of groups) {
    // Compute interpolated start/end crossings against the broad threshold.
    let startHz = group[0].frequency;
    const prevPoint = depths[depths.indexOf(group[0]) - 1];
    if (prevPoint && prevPoint.depthDb < rule.broadDepthDb) {
      startHz = interpolateCrossing(prevPoint, group[0], rule.broadDepthDb);
    }
    let endHz = group[group.length - 1].frequency;
    const nextPoint = depths[depths.indexOf(group[group.length - 1]) + 1];
    if (nextPoint && nextPoint.depthDb < rule.broadDepthDb) {
      endHz = interpolateCrossing(group[group.length - 1], nextPoint, rule.broadDepthDb);
    }

    const bandwidthHz = Math.max(0, endHz - startHz);
    const safeStart = Math.max(startHz, 1e-6);
    const bandwidthFractionOctave = endHz > safeStart ? Math.log2(endHz / safeStart) : 0;
    if (bandwidthFractionOctave < rule.minBandwidthFractionOctave) continue;

    const deepest = group.reduce((best, item) => (item.depthDb > best.depthDb ? item : best));
    const centreHz = deepest.frequency;
    // Only report depressions centred inside the 20–80 Hz screening band.
    if (centreHz < STAGE1_SCREENING_FREQ_MIN_HZ || centreHz > STAGE1_SCREENING_FREQ_MAX_HZ) continue;

    depressions.push({
      centreHz,
      depthDb: deepest.depthDb,
      bandwidthHz,
      bandwidthFractionOctave,
      isSevere: deepest.depthDb >= rule.severeDepthDb,
    });
  }

  return depressions;
}