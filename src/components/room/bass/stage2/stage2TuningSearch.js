// stage2TuningSearch.js
// Independent per-source delay and level+delay tuning search for Stage 2
// canonical confirmation.
//
// Uses per-source per-seat complex transfers (captured with ZERO tuning during
// the placement phase) to re-sum with different delay/level/polarity tuning
// WITHOUT re-running the modal simulation. This is mathematically equivalent
// to applying the tuning in the simulation:
//   - Delay: phase rotation e^(-j*2*pi*f*delayMs/1000)
//   - Gain: amplitude scaling 10^(gainDb/20)
//   - Polarity: sign flip (polarity < 0)
//
// The search uses COORDINATE DESCENT: one source is chosen as the timing
// reference (0 ms, 0 dB), and each remaining source's delay (and gain for
// level+delay) is optimised independently via coarse-to-fine scans. This
// replaces the previous grouped front-vs-rear search which could not
// represent independent per-source delay patterns such as:
//   Room B 4-sub: 10.807 / 0 / 7.162 / 0 ms
//   Room C 4-sub: 0 / 10.064 / 2.998 / 14.514 ms
//
// Multiple credible finalists are retained (best + second if materially
// different) to avoid prematurely deleting an authoritative winner. The
// second variant is found by running coordinate descent from a different
// starting point, which may discover a different local optimum.
//
// Proxy metrics (peak-to-peak variation at RSP) are used ONLY to pick candidate
// tunings. The authoritative P19/P20 evaluation happens downstream in the
// canonical confirmation chain. The proxy-picked tuning is confirmed through
// the FULL canonical chain (EQ pool, P18, P19, P20, grading) before final
// Pareto selection.

const SPEED_OF_SOUND_M_S = 343;

// Delay search bounds (matching SubwooferDelayOptimiser proven range).
const DELAY_MIN_MS = 0;
const DELAY_MAX_MS = 20;
const DELAY_COARSE_STEP_MS = 2.0;
const DELAY_FINE_STEP_MS = 0.5;
const DELAY_FINE_WINDOW_MS = 3.0;

// Level search bounds.
const LEVEL_MIN_DB = -10;
const LEVEL_MAX_DB = 0;
const LEVEL_STEP_DB = 1.0;
const LEVEL_FINE_STEP_DB = 0.5;
const LEVEL_FINE_WINDOW_DB = 2.0;

// Scoring frequency band (matching SubwooferDelayOptimiser).
const SCORE_FREQ_MIN_HZ = 20;
const SCORE_FREQ_MAX_HZ = 120;

// Coordinate descent convergence limit.
const MAX_CD_PASSES = 3;

// Second-finalist retention thresholds.
const MATERIAL_DELAY_DIFF_MS = 2.0;
const MATERIAL_GAIN_DIFF_DB = 1.0;
const SECOND_FINALIST_SCORE_MARGIN = 1.5; // second must be within 1.5x best score

/**
 * Apply a tuning (delay, gain, polarity) to a per-source complex transfer
 * and return the tuned complex values.
 */
function applyTuning(points, delayMs, gainDb, polarity) {
  const delayS = Number(delayMs) / 1000;
  const gainLinear = Math.pow(10, Number(gainDb) / 20);
  const sign = polarity < 0 ? -1 : 1;
  return points.map((p) => {
    const freq = Number(p.frequency);
    if (!Number.isFinite(freq) || !Number.isFinite(p.re) || !Number.isFinite(p.im)) {
      return { re: 0, im: 0 };
    }
    const theta = -2 * Math.PI * freq * delayS;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const reTuned = (p.re * cosT + p.im * sinT) * gainLinear * sign;
    const imTuned = (-p.re * sinT + p.im * cosT) * gainLinear * sign;
    return { re: reTuned, im: imTuned };
  });
}

/**
 * Sum tuned per-source complex transfers for a single seat to get the
 * summed complex response.
 */
function sumTunedTransfers(perSourceTransfers, tuning) {
  if (!perSourceTransfers?.length) return { freqsHz: [], re: [], im: [] };
  let freqsHz = null;
  let sumRe = null;
  let sumIm = null;
  perSourceTransfers.forEach((transfer, sourceIndex) => {
    const t = tuning[sourceIndex] || { delayMs: 0, gainDb: 0, polarity: 0 };
    const tuned = applyTuning(transfer.points, t.delayMs, t.gainDb, t.polarity);
    if (!freqsHz) {
      freqsHz = tuned.map((_, i) => transfer.points[i].frequency);
      sumRe = tuned.map((v) => v.re);
      sumIm = tuned.map((v) => v.im);
    } else {
      tuned.forEach((v, i) => {
        if (Number.isFinite(v.re) && Number.isFinite(v.im)) {
          sumRe[i] += v.re;
          sumIm[i] += v.im;
        }
      });
    }
  });
  return { freqsHz: freqsHz || [], re: sumRe || [], im: sumIm || [] };
}

/**
 * Compute SPL from complex values.
 */
function complexToSpl(re, im) {
  return 20 * Math.log10(Math.max(Math.hypot(re, im), 1e-10));
}

/**
 * Score a summed response by peak-to-peak SPL variation in the scoring band.
 * Lower is better (flatter response).
 */
function scorePeakToPeak(freqsHz, re, im) {
  const spls = [];
  for (let i = 0; i < freqsHz.length; i++) {
    const freq = freqsHz[i];
    if (freq >= SCORE_FREQ_MIN_HZ && freq <= SCORE_FREQ_MAX_HZ) {
      spls.push(complexToSpl(re[i], im[i]));
    }
  }
  if (!spls.length) return Number.POSITIVE_INFINITY;
  return Math.max(...spls) - Math.min(...spls);
}

// ---------------------------------------------------------------------------
// Independent per-source coordinate descent
// ---------------------------------------------------------------------------

/**
 * Score a specific tuning configuration by peak-to-peak SPL variation at RSP.
 */
function scoreTuning(perSourceRspTransfers, delays, gains) {
  const sourceCount = perSourceRspTransfers.length;
  const tuning = [];
  for (let i = 0; i < sourceCount; i++) {
    tuning.push({
      delayMs: delays[i] || 0,
      gainDb: gains ? (gains[i] || 0) : 0,
      polarity: 0,
    });
  }
  const { freqsHz, re, im } = sumTunedTransfers(perSourceRspTransfers, tuning);
  return scorePeakToPeak(freqsHz, re, im);
}

/**
 * Normalise delays so the minimum is always 0 (relative-delay invariance).
 */
function normaliseDelays(delays) {
  const min = Math.min(...delays);
  return delays.map((d) => Math.max(0, d - min));
}

/**
 * Coordinate descent for independent per-source delays.
 * Source at refIndex is held at 0 ms (timing reference). All other sources
 * are optimised independently via coarse-to-fine scan.
 *
 * @param {Array} perSourceRspTransfers — per-source RSP complex transfers
 * @param {number} sourceCount — total number of sources
 * @param {number} refIndex — index of the reference source (held at 0)
 * @param {Array} initialDelays — starting delay configuration
 * @returns {{ delays: number[], score: number }}
 */
function coordinateDescentDelay(perSourceRspTransfers, sourceCount, refIndex, initialDelays) {
  const delays = [...initialDelays];
  delays[refIndex] = 0; // reference is always 0

  let bestScore = scoreTuning(perSourceRspTransfers, delays, null);

  for (let pass = 0; pass < MAX_CD_PASSES; pass++) {
    let improved = false;
    for (let i = 0; i < sourceCount; i++) {
      if (i === refIndex) continue;

      // Coarse scan
      let bestDelay = delays[i];
      let bestLocal = bestScore;
      for (let d = DELAY_MIN_MS; d <= DELAY_MAX_MS; d += DELAY_COARSE_STEP_MS) {
        delays[i] = d;
        const s = scoreTuning(perSourceRspTransfers, delays, null);
        if (s < bestLocal - 1e-9) {
          bestLocal = s;
          bestDelay = d;
        }
      }

      // Fine refinement around best
      const fineStart = Math.max(DELAY_MIN_MS, bestDelay - DELAY_FINE_WINDOW_MS / 2);
      const fineEnd = Math.min(DELAY_MAX_MS, bestDelay + DELAY_FINE_WINDOW_MS / 2);
      for (let d = fineStart; d <= fineEnd; d += DELAY_FINE_STEP_MS) {
        delays[i] = d;
        const s = scoreTuning(perSourceRspTransfers, delays, null);
        if (s < bestLocal - 1e-9) {
          bestLocal = s;
          bestDelay = d;
        }
      }

      delays[i] = bestDelay;
      if (bestLocal < bestScore - 1e-9) {
        bestScore = bestLocal;
        improved = true;
      }
    }
    if (!improved) break;
  }

  return { delays, score: bestScore };
}

/**
 * Coordinate descent for independent per-source delays AND gains.
 * Source at refIndex is held at 0 ms / 0 dB. All other sources are optimised
 * independently. Delays are optimised first, then gains, alternating until
 * convergence.
 *
 * @param {Array} perSourceRspTransfers — per-source RSP complex transfers
 * @param {number} sourceCount — total number of sources
 * @param {number} refIndex — index of the reference source (held at 0/0)
 * @param {Array} initialDelays — starting delay configuration
 * @param {Array} initialGains — starting gain configuration
 * @returns {{ delays: number[], gains: number[], score: number }}
 */
function coordinateDescentLevelAndDelay(perSourceRspTransfers, sourceCount, refIndex, initialDelays, initialGains) {
  const delays = [...initialDelays];
  const gains = [...initialGains];
  delays[refIndex] = 0;
  gains[refIndex] = 0; // reference gain is always 0 dB

  let bestScore = scoreTuning(perSourceRspTransfers, delays, gains);

  for (let pass = 0; pass < MAX_CD_PASSES; pass++) {
    let improved = false;

    // Optimise delays
    for (let i = 0; i < sourceCount; i++) {
      if (i === refIndex) continue;
      let bestDelay = delays[i];
      let bestLocal = bestScore;
      for (let d = DELAY_MIN_MS; d <= DELAY_MAX_MS; d += DELAY_COARSE_STEP_MS) {
        delays[i] = d;
        const s = scoreTuning(perSourceRspTransfers, delays, gains);
        if (s < bestLocal - 1e-9) {
          bestLocal = s;
          bestDelay = d;
        }
      }
      const fineStart = Math.max(DELAY_MIN_MS, bestDelay - DELAY_FINE_WINDOW_MS / 2);
      const fineEnd = Math.min(DELAY_MAX_MS, bestDelay + DELAY_FINE_WINDOW_MS / 2);
      for (let d = fineStart; d <= fineEnd; d += DELAY_FINE_STEP_MS) {
        delays[i] = d;
        const s = scoreTuning(perSourceRspTransfers, delays, gains);
        if (s < bestLocal - 1e-9) {
          bestLocal = s;
          bestDelay = d;
        }
      }
      delays[i] = bestDelay;
      if (bestLocal < bestScore - 1e-9) {
        bestScore = bestLocal;
        improved = true;
      }
    }

    // Optimise gains (independently per source, ≤ 0 dB)
    for (let i = 0; i < sourceCount; i++) {
      if (i === refIndex) continue;
      let bestGain = gains[i];
      let bestLocal = bestScore;
      for (let g = LEVEL_MIN_DB; g <= LEVEL_MAX_DB; g += LEVEL_STEP_DB) {
        gains[i] = g;
        const s = scoreTuning(perSourceRspTransfers, delays, gains);
        if (s < bestLocal - 1e-9) {
          bestLocal = s;
          bestGain = g;
        }
      }
      const gFineStart = Math.max(LEVEL_MIN_DB, bestGain - LEVEL_FINE_WINDOW_DB / 2);
      const gFineEnd = Math.min(LEVEL_MAX_DB, bestGain + LEVEL_FINE_WINDOW_DB / 2);
      for (let g = gFineStart; g <= gFineEnd; g += LEVEL_FINE_STEP_DB) {
        gains[i] = g;
        const s = scoreTuning(perSourceRspTransfers, delays, gains);
        if (s < bestLocal - 1e-9) {
          bestLocal = s;
          bestGain = g;
        }
      }
      gains[i] = bestGain;
      if (bestLocal < bestScore - 1e-9) {
        bestScore = bestLocal;
        improved = true;
      }
    }

    if (!improved) break;
  }

  return { delays, gains, score: bestScore };
}

/**
 * Build a tuning array from delays and optional gains.
 */
function buildTuningArray(sourceCount, delays, gains) {
  const tuning = [];
  for (let i = 0; i < sourceCount; i++) {
    tuning.push({
      delayMs: delays[i] || 0,
      gainDb: gains ? (gains[i] || 0) : 0,
      polarity: 0,
    });
  }
  return tuning;
}

/**
 * Check whether two delay configurations are materially different.
 */
function delaysMateriallyDifferent(a, b) {
  return a.some((d, i) => Math.abs(d - b[i]) >= MATERIAL_DELAY_DIFF_MS);
}

/**
 * Check whether two tuning configurations are materially different
 * (delay or gain difference).
 */
function tuningMateriallyDifferent(a, b) {
  return a.some((t, i) =>
    Math.abs((t.delayMs || 0) - (b[i]?.delayMs || 0)) >= MATERIAL_DELAY_DIFF_MS
    || Math.abs((t.gainDb || 0) - (b[i]?.gainDb || 0)) >= MATERIAL_GAIN_DIFF_DB
  );
}

/**
 * Search for the best delay-only tuning using independent per-source
 * coordinate descent. Returns up to 2 credible finalists.
 *
 * @param {Array} perSourceRspTransfers — per-source RSP complex transfers (zero tuning)
 * @param {Array} sources — source positions (unused in independent search, kept for compat)
 * @returns {{ finalists: Array<{ tuning: Array, score: number, delays: number[] }> }}
 */
export function searchDelayOnly(perSourceRspTransfers, sources) {
  const sourceCount = perSourceRspTransfers?.length || sources?.length || 0;
  if (!sourceCount) {
    return { finalists: [] };
  }
  if (sourceCount <= 1) {
    return {
      finalists: [{
        tuning: [{ delayMs: 0, gainDb: 0, polarity: 0 }],
        score: Infinity,
        delays: [0],
      }],
    };
  }

  // Finalist 1: source 0 as reference, all others start at 0
  const init1 = new Array(sourceCount).fill(0);
  const result1 = coordinateDescentDelay(perSourceRspTransfers, sourceCount, 0, init1);
  const normalizedDelays1 = normaliseDelays(result1.delays);

  const finalists = [{
    tuning: buildTuningArray(sourceCount, normalizedDelays1, null),
    score: result1.score,
    delays: normalizedDelays1,
  }];

  // Finalist 2: last source as reference, all others start at max delay
  // (different starting point may find a different local optimum)
  const ref2 = sourceCount - 1;
  const init2 = new Array(sourceCount).fill(DELAY_MAX_MS / 2);
  const result2 = coordinateDescentDelay(perSourceRspTransfers, sourceCount, ref2, init2);
  const normalizedDelays2 = normaliseDelays(result2.delays);

  // Retain second finalist only if materially different and within score margin
  if (
    delaysMateriallyDifferent(normalizedDelays1, normalizedDelays2)
    && result2.score <= result1.score * SECOND_FINALIST_SCORE_MARGIN
  ) {
    finalists.push({
      tuning: buildTuningArray(sourceCount, normalizedDelays2, null),
      score: result2.score,
      delays: normalizedDelays2,
    });
  }

  return { finalists };
}

/**
 * Search for the best level+delay tuning using independent per-source
 * coordinate descent. Returns up to 2 credible finalists.
 *
 * @param {Array} perSourceRspTransfers — per-source RSP complex transfers (zero tuning)
 * @param {Array} sources — source positions (unused in independent search, kept for compat)
 * @returns {{ finalists: Array<{ tuning: Array, score: number, delays: number[], gains: number[] }> }}
 */
export function searchLevelAndDelay(perSourceRspTransfers, sources) {
  const sourceCount = perSourceRspTransfers?.length || sources?.length || 0;
  if (!sourceCount) {
    return { finalists: [] };
  }
  if (sourceCount <= 1) {
    return {
      finalists: [{
        tuning: [{ delayMs: 0, gainDb: 0, polarity: 0 }],
        score: Infinity,
        delays: [0],
        gains: [0],
      }],
    };
  }

  // Finalist 1: source 0 as reference, all others start at 0
  const initDelays1 = new Array(sourceCount).fill(0);
  const initGains1 = new Array(sourceCount).fill(0);
  const result1 = coordinateDescentLevelAndDelay(
    perSourceRspTransfers, sourceCount, 0, initDelays1, initGains1,
  );
  const normalizedDelays1 = normaliseDelays(result1.delays);

  const tuning1 = buildTuningArray(sourceCount, normalizedDelays1, result1.gains);
  const finalists = [{
    tuning: tuning1,
    score: result1.score,
    delays: normalizedDelays1,
    gains: result1.gains,
  }];

  // Finalist 2: last source as reference, different starting point
  const ref2 = sourceCount - 1;
  const initDelays2 = new Array(sourceCount).fill(DELAY_MAX_MS / 2);
  const initGains2 = new Array(sourceCount).fill(LEVEL_MIN_DB / 2);
  const result2 = coordinateDescentLevelAndDelay(
    perSourceRspTransfers, sourceCount, ref2, initDelays2, initGains2,
  );
  const normalizedDelays2 = normaliseDelays(result2.delays);
  const tuning2 = buildTuningArray(sourceCount, normalizedDelays2, result2.gains);

  if (
    tuningMateriallyDifferent(tuning1, tuning2)
    && result2.score <= result1.score * SECOND_FINALIST_SCORE_MARGIN
  ) {
    finalists.push({
      tuning: tuning2,
      score: result2.score,
      delays: normalizedDelays2,
      gains: result2.gains,
    });
  }

  return { finalists };
}

/**
 * Re-sum per-source per-seat complex transfers with a given tuning to produce
 * the summed seat responses (freqsHz, splDb per seat).
 *
 * @param {Array} perSourcePerSeatTransfers — [{ seatId, points: [{frequency, re, im}] }] per source per seat
 * @param {Array} tuning — [{ delayMs, gainDb, polarity }] per source
 * @param {Array} seatIds — ordered list of seat IDs
 * @returns {object} seatResponses — { [seatId]: { freqsHz, splDb, _sumRe, _sumIm } }
 */
export function resumWithTuning(perSourcePerSeatTransfers, tuning, seatIds) {
  const seatResponses = {};
  for (const seatId of seatIds) {
    const seatTransfers = perSourcePerSeatTransfers.filter((t) => t.seatId === seatId);
    if (!seatTransfers.length) continue;
    const { freqsHz, re, im } = sumTunedTransfers(seatTransfers, tuning);
    if (!freqsHz.length) continue;
    seatResponses[seatId] = {
      freqsHz,
      splDb: re.map((r, i) => complexToSpl(r, im[i])),
      _sumRe: re,
      _sumIm: im,
    };
  }
  return seatResponses;
}