// batchModalEvaluator.js — Isolated exact batch modal evaluator (PROTOTYPE).
//
// Replicates the EXACT production AB-corrected modal transfer path from:
//   simulateAuthoritativeBassResponse → simulateBassResponseRewCore
//   → abCorrectedModalTransferLocal
//
// The AB-corrected modal pressure at frequency f for source s and receiver r is:
//
//   P(f,s,r) = √V × Σ_n [ A_s(f) × Ψ_n(s) × Ψ_n(r) × M_n × W_n × (1/V) × H_n(f) × T_s(f) ]
//            = (A_s(f) × T_s(f) / √V) × Σ_n [ Ψ_n(s) × Ψ_n(r) × M_n × W_n × H_n(f) ]
//
// Where every term is independently precomputable:
//   A_s(f)        = 10^((curveDb(f) + gainDb)/20)   — SOURCE+FREQUENCY (product curve + derating)
//   T_s(f)        = tuning phase rotation          — SOURCE+FREQUENCY (identity for zero tuning)
//   V             = W × L × H                      — ROOM-ONLY
//   Ψ_n(s)        = cos(nx·π·sx/W)·cos(ny·π·sy/L)·cos(nz·π·sz/H) — SOURCE+MODE
//   Ψ_n(r)        = cos(nx·π·rx/W)·cos(ny·π·ry/L)·cos(nz·π·rz/H) — LISTENER+MODE
//   M_n           = 2^activeAxes                   — MODE-ONLY
//   W_n           = abSpectralWeight                — MODE-ONLY
//   H_n(f)        = (kr²−k² − j·k·kr/Q) / denomSq   — MODE+FREQUENCY
//
// No source-receiver coupling term prevents factorisation.
// This is EXACT — no approximation, no interpolation, no equation change.
//
// NOT WIRED INTO PRODUCTION. Use from tests only until parity is proven.

import { modeShapeValueLocal } from './modalCalculations';
import { buildFrequencyAxis, interpolateCurveDb } from './rewCorePrimitives';

const SPEED_OF_SOUND_MPS = 343;

/**
 * Build the AB-corrected mode list (with sealed-room zero mode + Q scaling).
 * Mirrors lines 1310-1321 of rewBassEngine.js exactly.
 */
function buildAbModes(modes, { abGlobalQScale, abMidbandQScale, roomIsSealed, applyModeMultiplicity }) {
  const scaled = modes.map((mode) => {
    const inMidBand = mode.freq >= 70 && mode.freq <= 120;
    const qScale = abGlobalQScale * (inMidBand ? abMidbandQScale : 1);
    if (qScale === 1) return mode;
    return { ...mode, qValue: mode.qValue * qScale };
  });
  return roomIsSealed
    ? [{ nx: 0, ny: 0, nz: 0, freq: 0, type: 'zero', qValue: 1, abSpectralWeight: undefined }, ...scaled]
    : scaled;
}

/**
 * Compute the per-frequency source amplitude A_s(f) = 10^((curveDb(f) + gainDb)/20).
 *
 * For "product" mode: curveDb is interpolated from the product curve WITH amplifier
 * derating applied to each curve point (matching lines 130-140 of
 * authoritativeBassResponseEngine.js).
 *
 * For "flat_rew_reference" mode: curveDb is interpolated from the flat 94 dB curve
 * (no derating).
 *
 * @returns {Float64Array} sourceFreqAmplitude[freqIndex]
 */
function computeSourceFrequencyAmplitude(sourceCurve, gainDb, freqsHz) {
  const safeGainDb = Number.isFinite(gainDb) ? Number(gainDb) : 0;
  const amplitude = new Float64Array(freqsHz.length);
  for (let fi = 0; fi < freqsHz.length; fi++) {
    const curveDb = interpolateCurveDb(sourceCurve, freqsHz[fi]);
    amplitude[fi] = Math.pow(10, (curveDb + safeGainDb) / 20);
  }
  return amplitude;
}

/**
 * Apply amplifier derating to a product curve point-by-point.
 * Matches lines 132-140 of authoritativeBassResponseEngine.js.
 */
function applyDeratingToCurve(rawCurve, deratingDb) {
  if (!Number.isFinite(deratingDb) || deratingDb === 0) return rawCurve;
  return rawCurve.map((point) => {
    const spl = Number(point?.spl);
    const db = Number(point?.db);
    if (Number.isFinite(spl)) return { ...point, spl: spl + deratingDb };
    if (Number.isFinite(db)) return { ...point, db: db + deratingDb };
    return { ...point };
  });
}

/**
 * Compute the mode-frequency complex response H_n(f) for all modes and frequencies.
 *
 * Mirrors lines 186-205 of abCorrectedModalTransferLocal exactly:
 *   kr = 2π·mode.freq / c
 *   k  = 2π·f / c
 *   realDen = kr² − k²
 *   imagDen = (k·kr) / max(Q, 1e-6)
 *   denomSq = realDen² + imagDen²
 *   HRe = realDen / denomSq
 *   HIm = −imagDen / denomSq
 *
 * @returns {{ re: Float64Array, im: Float64Array }} modeFreqRe[modeIdx * nFreq + freqIdx]
 */
function computeModeFrequencyResponse(abModes, freqsHz) {
  const nModes = abModes.length;
  const nFreqs = freqsHz.length;
  const re = new Float64Array(nModes * nFreqs);
  const im = new Float64Array(nModes * nFreqs);

  // Precompute kr per mode (MODE-ONLY, does not depend on frequency)
  const kr = new Float64Array(nModes);
  for (let mi = 0; mi < nModes; mi++) {
    kr[mi] = (2 * Math.PI * abModes[mi].freq) / SPEED_OF_SOUND_MPS;
  }

  for (let fi = 0; fi < nFreqs; fi++) {
    const f = freqsHz[fi];
    const k = (2 * Math.PI * f) / SPEED_OF_SOUND_MPS;
    const kSq = k * k;
    for (let mi = 0; mi < nModes; mi++) {
      const kr_mi = kr[mi];
      const realDen = kr_mi * kr_mi - kSq;
      const imagDen = (k * kr_mi) / Math.max(abModes[mi].qValue, 1e-6);
      const denomSq = realDen * realDen + imagDen * imagDen;
      const idx = mi * nFreqs + fi;
      re[idx] = realDen / denomSq;
      im[idx] = -imagDen / denomSq;
    }
  }

  return { re, im };
}

/**
 * Compute the source-mode coupling Ψ_n(source) for all sources and modes.
 * Uses modeShapeValueLocal — the EXACT same function as production.
 *
 * @returns {Float64Array} sourceModeCoupling[sourceIdx * nModes + modeIdx]
 */
function computeSourceModeCoupling(sources, abModes, roomDims) {
  const nSources = sources.length;
  const nModes = abModes.length;
  const coupling = new Float64Array(nSources * nModes);
  for (let si = 0; si < nSources; si++) {
    const src = sources[si];
    for (let mi = 0; mi < nModes; mi++) {
      coupling[si * nModes + mi] = modeShapeValueLocal(
        abModes[mi], src.x, src.y, src.z, roomDims
      );
    }
  }
  return coupling;
}

/**
 * Compute the listener-mode coupling Ψ_n(listener) for all listeners and modes.
 * Uses modeShapeValueLocal — the EXACT same function as production.
 *
 * @returns {Float64Array} listenerModeCoupling[listenerIdx * nModes + modeIdx]
 */
function computeListenerModeCoupling(listeners, abModes, roomDims) {
  const nListeners = listeners.length;
  const nModes = abModes.length;
  const coupling = new Float64Array(nListeners * nModes);
  for (let li = 0; li < nListeners; li++) {
    const lis = listeners[li];
    for (let mi = 0; mi < nModes; mi++) {
      coupling[li * nModes + mi] = modeShapeValueLocal(
        abModes[mi], lis.x, lis.y, lis.z, roomDims
      );
    }
  }
  return coupling;
}

/**
 * Compute the mode weight M_n × W_n for each mode.
 * Mirrors lines 196-202 of abCorrectedModalTransferLocal.
 *
 * @returns {Float64Array} modeWeight[modeIdx]
 */
function computeModeWeights(abModes, applyModeMultiplicity) {
  const nModes = abModes.length;
  const weights = new Float64Array(nModes);
  for (let mi = 0; mi < nModes; mi++) {
    const mode = abModes[mi];
    const activeAxes = (mode.nx > 0 ? 1 : 0) + (mode.ny > 0 ? 1 : 0) + (mode.nz > 0 ? 1 : 0);
    const modeMultiplicity = applyModeMultiplicity ? Math.pow(2, activeAxes) : 1;
    const spectralWeight = Number.isFinite(Number(mode.abSpectralWeight))
      ? Math.max(0, Math.min(1, Number(mode.abSpectralWeight)))
      : 1;
    weights[mi] = modeMultiplicity * spectralWeight;
  }
  return weights;
}

/**
 * Compute the tuning phase rotation for a source at a given frequency.
 * Mirrors lines 166-168 of abCorrectedModalTransferLocal.
 * For zero tuning (delayMs=0, polarity=0), this is identity: cos=1, sin=0.
 */
function computeTuningRotation(delayMs, polarity, freqsHz) {
  const cos = new Float64Array(freqsHz.length);
  const sin = new Float64Array(freqsHz.length);
  for (let fi = 0; fi < freqsHz.length; fi++) {
    const f = freqsHz[fi];
    const tuningPhase = (-2 * Math.PI * f * (delayMs / 1000)) + (polarity === 180 ? Math.PI : 0);
    cos[fi] = Math.cos(tuningPhase);
    sin[fi] = Math.sin(tuningPhase);
  }
  return { cos, sin };
}

/**
 * Evaluate per-source per-listener complex transfers using the factored modal
 * dot product. This is the EXACT equivalent of calling
 * simulateBassResponseRewCore 120 times (20 sources × 6 listeners) with the
 * AB-corrected path, product source curve, and zero tuning.
 *
 * @param {object} params
 * @param {object} params.roomDims — { widthM, lengthM, heightM }
 * @param {Array} params.sources — [{ x, y, z, modelKey, tuning: { gainDb, delayMs, polarity }, deratingDb, sourceCurve }]
 * @param {Array} params.listeners — [{ id, x, y, z }]
 * @param {Array} params.precomputedModes — from prepareModeBank
 * @param {object} params.physics — physics options (from buildStage2Physics)
 * @param {string} params.qStrategyOverride — "ab_corrected"
 * @param {number} [params.freqMinHz=15]
 * @param {number} [params.freqMaxHz=200]
 * @param {boolean} [params.collectDiagnostics=false]
 * @returns {{ freqsHz, perSourcePerListenerTransfers, diagnostics }}
 */
export function evaluateBatchModalTransfers({
  roomDims,
  sources,
  listeners,
  precomputedModes,
  physics,
  qStrategyOverride,
  freqMinHz = 15,
  freqMaxHz = 200,
  collectDiagnostics = false,
}) {
  const widthM = Number(roomDims.widthM);
  const lengthM = Number(roomDims.lengthM);
  const heightM = Number(roomDims.heightM);
  const roomVolumeM3 = widthM * lengthM * heightM;
  const abSqrtVScale = Math.sqrt(Math.max(roomVolumeM3, 1e-6));
  const invSqrtV = 1 / abSqrtVScale; // = √V / V = 1/√V

  const isAbCorrected = qStrategyOverride === 'ab_corrected';
  const applyModeMultiplicity = isAbCorrected ? true : physics.abApplyModeMultiplicity;
  const roomIsSealed = isAbCorrected ? true : physics.roomIsSealed;
  const abGlobalQScale = 1; // production default
  const abMidbandQScale = 1; // from engineOptionsBase

  // Build frequency axis (same as simulateBassResponseRewCore)
  const freqsHz = buildFrequencyAxis(freqMinHz, freqMaxHz, undefined);
  const nFreqs = freqsHz.length;

  // Build AB-corrected mode list (with sealed zero mode + Q scaling)
  const abModes = buildAbModes(precomputedModes, {
    abGlobalQScale, abMidbandQScale, roomIsSealed, applyModeMultiplicity,
  });
  const nModes = abModes.length;

  // ── PRECOMPUTE FACTORED ARRAYS ──────────────────────────────────────────

  const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

  // 1. Mode-frequency complex response H_n(f) — MODE × FREQUENCY
  const modeFreq = computeModeFrequencyResponse(abModes, freqsHz);
  const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

  // 2. Source-mode coupling Ψ_n(s) — SOURCE × MODE
  const sourceModeCoupling = computeSourceModeCoupling(sources, abModes, { widthM, lengthM, heightM });
  const t2 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

  // 3. Listener-mode coupling Ψ_n(r) — LISTENER × MODE
  const listenerModeCoupling = computeListenerModeCoupling(listeners, abModes, { widthM, lengthM, heightM });
  const t3 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

  // 4. Mode weights M_n × W_n — MODE
  const modeWeight = computeModeWeights(abModes, applyModeMultiplicity);
  const t4 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

  // 5. Source-frequency amplitude A_s(f) — SOURCE × FREQUENCY
  //    For each source, compute the derated product curve and interpolate.
  //    Also compute the tuning rotation (identity for zero tuning).
  const nSources = sources.length;
  const sourceFreqAmplitude = new Array(nSources);
  const sourceTuningCos = new Array(nSources);
  const sourceTuningSin = new Array(nSources);
  for (let si = 0; si < nSources; si++) {
    const src = sources[si];
    const sourceCurve = src.sourceCurve || src._sourceCurve;
    sourceFreqAmplitude[si] = computeSourceFrequencyAmplitude(
      sourceCurve, src.tuning?.gainDb ?? 0, freqsHz
    );
    const tuning = computeTuningRotation(
      src.tuning?.delayMs ?? 0, src.tuning?.polarity ?? 0, freqsHz
    );
    sourceTuningCos[si] = tuning.cos;
    sourceTuningSin[si] = tuning.sin;
  }
  const t5 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

  // ── COMPUTE TRANSFER MATRIX ─────────────────────────────────────────────
  // For each (source, listener, frequency):
  //   rawSumRe = Σ_n [ S[si][n] * L[li][n] * MW[n] * HRe[n][f] ]
  //   rawSumIm = Σ_n [ S[si][n] * L[li][n] * MW[n] * HIm[n][f] ]
  //   P_re = A_s(f) * invSqrtV * (rawSumRe * cos - rawSumIm * sin)
  //   P_im = A_s(f) * invSqrtV * (rawSumRe * sin + rawSumIm * cos)
  //
  // For zero tuning: cos=1, sin=0, so P_re = A_s(f) * invSqrtV * rawSumRe

  const nListeners = listeners.length;
  const perSourcePerListenerTransfers = [];

  for (let si = 0; si < nSources; si++) {
    for (let li = 0; li < nListeners; li++) {
      const reOut = new Float64Array(nFreqs);
      const imOut = new Float64Array(nFreqs);
      const smBase = si * nModes;
      const lmBase = li * nModes;

      for (let fi = 0; fi < nFreqs; fi++) {
        let rawSumRe = 0;
        let rawSumIm = 0;

        for (let mi = 0; mi < nModes; mi++) {
          const sCoupling = sourceModeCoupling[smBase + mi];
          const lCoupling = listenerModeCoupling[lmBase + mi];
          const mw = modeWeight[mi];
          const coupling = sCoupling * lCoupling * mw;
          const mfIdx = mi * nFreqs + fi;
          rawSumRe += coupling * modeFreq.re[mfIdx];
          rawSumIm += coupling * modeFreq.im[mfIdx];
        }

        // Apply source amplitude and room scalar
        const amplitude = sourceFreqAmplitude[si][fi];
        const scalar = amplitude * invSqrtV;

        // Apply tuning rotation (identity for zero tuning)
        const tCos = sourceTuningCos[si][fi];
        const tSin = sourceTuningSin[si][fi];
        reOut[fi] = scalar * (rawSumRe * tCos - rawSumIm * tSin);
        imOut[fi] = scalar * (rawSumRe * tSin + rawSumIm * tCos);
      }

      perSourcePerListenerTransfers.push({
        sourceIndex: si,
        listenerId: listeners[li].id,
        points: freqsHz.map((frequency, fi) => ({
          frequency,
          re: reOut[fi],
          im: imOut[fi],
        })),
      });
    }
  }

  const t6 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

  const diagnostics = collectDiagnostics ? {
    nModes,
    nFreqs,
    nSources,
    nListeners,
    timing: {
      modeFreqMs: t1 - t0,
      sourceModeMs: t2 - t1,
      listenerModeMs: t3 - t2,
      modeWeightMs: t4 - t3,
      sourceFreqMs: t5 - t4,
      transferMatrixMs: t6 - t5,
      totalMs: t6 - t0,
    },
    memory: {
      modeFreqRe: modeFreq.re.byteLength,
      modeFreqIm: modeFreq.im.byteLength,
      sourceModeCoupling: sourceModeCoupling.byteLength,
      listenerModeCoupling: listenerModeCoupling.byteLength,
      modeWeight: modeWeight.byteLength,
      sourceFreqAmplitude: sourceFreqAmplitude.reduce((s, a) => s + a.byteLength, 0),
      perSourcePerListenerTransfers: perSourcePerListenerTransfers.length * nFreqs * 2 * 8,
    },
  } : null;

  return {
    freqsHz,
    perSourcePerListenerTransfers,
    diagnostics,
  };
}

export default evaluateBatchModalTransfers;