// stage2TuningSearch.js
// Delay-only and level+delay tuning search for Stage 2 canonical confirmation.
//
// Uses per-source per-seat complex transfers (captured with ZERO tuning during
// the placement phase) to re-sum with different delay/level/polarity tuning
// WITHOUT re-running the modal simulation. This is mathematically equivalent
// to applying the tuning in the simulation:
//   - Delay: phase rotation e^(-j*2*pi*f*delayMs/1000)
//   - Gain: amplitude scaling 10^(gainDb/20)
//   - Polarity: sign flip (polarity < 0)
//
// The search uses a bounded scan of front-group delay (rear group held at 0)
// scored by peak-to-peak SPL variation at the RSP — the SAME trusted approach
// proven in SubwooferDelayOptimiser. For level+delay, the search also scans
// front-group level trim.
//
// Proxy metrics (peak-to-peak variation) are used ONLY to pick the best
// tuning. The authoritative P19/P20 evaluation happens downstream in the
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

// Scoring frequency band (matching SubwooferDelayOptimiser).
const SCORE_FREQ_MIN_HZ = 20;
const SCORE_FREQ_MAX_HZ = 120;

/**
 * Apply a tuning (delay, gain, polarity) to a per-source complex transfer
 * and return the tuned complex values.
 *
 * @param {Array} points — [{ frequency, re, im }] zero-tuning per-source transfer
 * @param {number} delayMs — delay in milliseconds
 * @param {number} gainDb — gain in dB
 * @param {number} polarity — 0 (normal) or 1 (inverted)
 * @returns {Array} [{ re, im }] tuned complex values
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
    // Phase rotation: (re + j*im) * e^(-j*theta) = (re*cos + im*sin) + j*(-re*sin + im*cos)
    const reTuned = (p.re * cosT + p.im * sinT) * gainLinear * sign;
    const imTuned = (-p.re * sinT + p.im * cosT) * gainLinear * sign;
    return { re: reTuned, im: imTuned };
  });
}

/**
 * Sum tuned per-source complex transfers for a single seat to get the
 * summed complex response.
 *
 * @param {Array} perSourceTransfers — [{ points: [{frequency, re, im}] }] per-source
 * @param {Array} tuning — [{ delayMs, gainDb, polarity }] per-source tuning
 * @returns {{ freqsHz: number[], re: number[], im: number[] }}
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

/**
 * Split sources into front/rear groups by yNorm.
 * Front group: yNorm < 0.5, Rear group: yNorm >= 0.5.
 */
function splitFrontRear(sources) {
  const front = [];
  const rear = [];
  (sources || []).forEach((s, i) => {
    if (s.yNorm < 0.5) front.push(i);
    else rear.push(i);
  });
  return { front, rear };
}

/**
 * Build a tuning array for a given front-group delay and level.
 * Rear group is held at zero delay and zero level.
 * Within each group, all subs share the same delay/level.
 *
 * @param {number} sourceCount — total number of sources
 * @param {Array} frontIndices — indices of front-group sources
 * @param {number} frontDelayMs — front-group delay
 * @param {number} frontGainDb — front-group gain
 * @returns {Array} tuning per source
 */
function buildGroupTuning(sourceCount, frontIndices, frontDelayMs, frontGainDb) {
  const tuning = [];
  for (let i = 0; i < sourceCount; i++) {
    if (frontIndices.includes(i)) {
      tuning.push({ delayMs: frontDelayMs, gainDb: frontGainDb, polarity: 0 });
    } else {
      tuning.push({ delayMs: 0, gainDb: 0, polarity: 0 });
    }
  }
  return tuning;
}

/**
 * Search for the best delay-only tuning (zero relative trims).
 * Scans front-group delay, rear group held at zero.
 * Uses coarse scan then fine refinement around the best.
 *
 * @param {object} perSourceRspTransfers — per-source RSP complex transfers (zero tuning)
 * @param {Array} sources — source positions with yNorm
 * @returns {{ tuning: Array, bestDelayMs: number, bestScore: number }}
 */
export function searchDelayOnly(perSourceRspTransfers, sources) {
  if (!perSourceRspTransfers?.length || !sources?.length) {
    return { tuning: sources?.map(() => ({ delayMs: 0, gainDb: 0, polarity: 0 })) || [], bestDelayMs: 0, bestScore: Infinity };
  }

  const { front } = splitFrontRear(sources);
  const sourceCount = sources.length;

  // If no front subs, all subs are rear — no delay search needed
  if (!front.length) {
    return { tuning: sources.map(() => ({ delayMs: 0, gainDb: 0, polarity: 0 })), bestDelayMs: 0, bestScore: Infinity };
  }

  // Coarse scan
  let bestDelay = 0;
  let bestScore = Infinity;
  for (let delay = DELAY_MIN_MS; delay <= DELAY_MAX_MS; delay += DELAY_COARSE_STEP_MS) {
    const tuning = buildGroupTuning(sourceCount, front, delay, 0);
    const { freqsHz, re, im } = sumTunedTransfers(perSourceRspTransfers, tuning);
    const score = scorePeakToPeak(freqsHz, re, im);
    if (score < bestScore) {
      bestScore = score;
      bestDelay = delay;
    }
  }

  // Fine refinement around best
  const fineStart = Math.max(DELAY_MIN_MS, bestDelay - DELAY_FINE_WINDOW_MS / 2);
  const fineEnd = Math.min(DELAY_MAX_MS, bestDelay + DELAY_FINE_WINDOW_MS / 2);
  for (let delay = fineStart; delay <= fineEnd; delay += DELAY_FINE_STEP_MS) {
    const tuning = buildGroupTuning(sourceCount, front, delay, 0);
    const { freqsHz, re, im } = sumTunedTransfers(perSourceRspTransfers, tuning);
    const score = scorePeakToPeak(freqsHz, re, im);
    if (score < bestScore) {
      bestScore = score;
      bestDelay = delay;
    }
  }

  return {
    tuning: buildGroupTuning(sourceCount, front, bestDelay, 0),
    bestDelayMs: bestDelay,
    bestScore,
  };
}

/**
 * Search for the best level+delay tuning.
 * Scans front-group delay × front-group level, rear group held at zero.
 *
 * @param {object} perSourceRspTransfers — per-source RSP complex transfers (zero tuning)
 * @param {Array} sources — source positions with yNorm
 * @returns {{ tuning: Array, bestDelayMs: number, bestGainDb: number, bestScore: number }}
 */
export function searchLevelAndDelay(perSourceRspTransfers, sources) {
  if (!perSourceRspTransfers?.length || !sources?.length) {
    return { tuning: sources?.map(() => ({ delayMs: 0, gainDb: 0, polarity: 0 })) || [], bestDelayMs: 0, bestGainDb: 0, bestScore: Infinity };
  }

  const { front } = splitFrontRear(sources);
  const sourceCount = sources.length;

  if (!front.length) {
    return { tuning: sources.map(() => ({ delayMs: 0, gainDb: 0, polarity: 0 })), bestDelayMs: 0, bestGainDb: 0, bestScore: Infinity };
  }

  // Coarse delay scan × level scan
  let bestDelay = 0;
  let bestGain = 0;
  let bestScore = Infinity;
  for (let delay = DELAY_MIN_MS; delay <= DELAY_MAX_MS; delay += DELAY_COARSE_STEP_MS) {
    for (let gain = LEVEL_MIN_DB; gain <= LEVEL_MAX_DB; gain += LEVEL_STEP_DB) {
      const tuning = buildGroupTuning(sourceCount, front, delay, gain);
      const { freqsHz, re, im } = sumTunedTransfers(perSourceRspTransfers, tuning);
      const score = scorePeakToPeak(freqsHz, re, im);
      if (score < bestScore) {
        bestScore = score;
        bestDelay = delay;
        bestGain = gain;
      }
    }
  }

  // Fine delay refinement around best
  const fineStart = Math.max(DELAY_MIN_MS, bestDelay - DELAY_FINE_WINDOW_MS / 2);
  const fineEnd = Math.min(DELAY_MAX_MS, bestDelay + DELAY_FINE_WINDOW_MS / 2);
  for (let delay = fineStart; delay <= fineEnd; delay += DELAY_FINE_STEP_MS) {
    for (let gain = LEVEL_MIN_DB; gain <= LEVEL_MAX_DB; gain += LEVEL_STEP_DB) {
      const tuning = buildGroupTuning(sourceCount, front, delay, gain);
      const { freqsHz, re, im } = sumTunedTransfers(perSourceRspTransfers, tuning);
      const score = scorePeakToPeak(freqsHz, re, im);
      if (score < bestScore) {
        bestScore = score;
        bestDelay = delay;
        bestGain = gain;
      }
    }
  }

  return {
    tuning: buildGroupTuning(sourceCount, front, bestDelay, bestGain),
    bestDelayMs: bestDelay,
    bestGainDb: bestGain,
    bestScore,
  };
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