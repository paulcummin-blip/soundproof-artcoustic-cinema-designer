// utils/rp22BassMetrics.jsx
// RP22 bass-derived Parameter 18 / 19 / 20 calculations that rely on the
// CURRENT bass engine output (BassResponseEngine). This file does NOT modify
// any acoustic maths — it only post-processes the existing per-seat
// { frequency, spl } response arrays that the engine already produces.
//
// Sources:
//   - BassResponseEngine.simulateResponseWithExtras(...) → responseData = [{ frequency, spl }]
//   - applyBassSmoothing(data, 'third') — display-only 1/3-octave smoothing.

import { applyBassSmoothing } from '../room/bass/bassGraphSmoothing';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

function toSplCurve(responseData) {
  if (!Array.isArray(responseData)) return [];
  const arr = [];
  for (let i = 0; i < responseData.length; i++) {
    const p = responseData[i];
    if (!p) continue;
    const f = Number(p.frequency);
    const s = Number(p.spl);
    if (isNum(f) && isNum(s)) arr.push({ frequency: f, spl: s });
  }
  return arr;
}

function smoothThird(curve) {
  if (!Array.isArray(curve) || curve.length === 0) return [];
  const smoothed = applyBassSmoothing(curve, 'third');
  // normalise + filter nulls produced by smoothing when data is too sparse
  const out = [];
  for (let i = 0; i < smoothed.length; i++) {
    const f = Number(smoothed[i].frequency);
    if (!isNum(f)) continue;
    const s = Number(smoothed[i].spl);
    if (!isNum(s)) continue;
    out.push({ frequency: f, spl: s });
  }
  return out;
}

function median(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const copy = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(copy.length / 2);
  return copy.length % 2 === 0
    ? (copy[mid - 1] + copy[mid]) / 2
    : copy[mid];
}

function valAt(curve, f) {
  if (!Array.isArray(curve) || curve.length === 0 || !isNum(f)) return null;
  if (f <= curve[0].frequency) return curve[0].spl;
  if (f >= curve[curve.length - 1].frequency) return curve[curve.length - 1].spl;
  for (let i = 0; i < curve.length - 1; i++) {
    if (f >= curve[i].frequency && f <= curve[i + 1].frequency) {
      const span = curve[i + 1].frequency - curve[i].frequency;
      if (span === 0) return curve[i].spl;
      const r = (f - curve[i].frequency) / span;
      return curve[i].spl + (curve[i + 1].spl - curve[i].spl) * r;
    }
  }
  return null;
}

// ── Legacy exports consumed by src/components/bass/bassSimulationEngine.jsx ──
// These pre-date the per-seat consumer above and operate on parallel
// freqsHz / splDb arrays (the format the simulation engine produces).
// Signatures are kept stable; only implementations are provided here.

const arrAt = (freqs, vals, f) => {
  if (!Array.isArray(freqs) || freqs.length === 0 || !Number.isFinite(f)) return null;
  if (f <= freqs[0]) return vals[0];
  if (f >= freqs[freqs.length - 1]) return vals[vals.length - 1];
  for (let i = 0; i < freqs.length - 1; i++) {
    if (f >= freqs[i] && f <= freqs[i + 1]) {
      const span = freqs[i + 1] - freqs[i];
      if (span === 0) return vals[i];
      const r = (f - freqs[i]) / span;
      return vals[i] + (vals[i + 1] - vals[i]) * r;
    }
  }
  return null;
};

// P14 — peak total LFE SPL capability in the requested band (Hz).
export function computeP14MaxLfeSpl({ freqsHz, splDb, band = [20, 80] }) {
  if (!Array.isArray(freqsHz) || !Array.isArray(splDb) || freqsHz.length === 0) {
    return { maxSplDb: null, details: { band, samples: 0 } };
  }
  const [fLo, fHi] = band;
  const inBand = [];
  for (let i = 0; i < freqsHz.length; i++) {
    if (freqsHz[i] >= fLo && freqsHz[i] <= fHi && isNum(splDb[i])) inBand.push(splDb[i]);
  }
  if (inBand.length === 0) return { maxSplDb: null, details: { band, samples: 0 } };
  const maxSplDb = Math.max(...inBand);
  return { maxSplDb, details: { band, samples: inBand.length } };
}

// P18 — in-room -3 dB extension frequency.
// Walks from low to high and finds the lowest frequency where the smoothed
// response reaches -3 dB relative to the per-frequency target, staying above.
export function computeP18InRoomF3({ freqsHz, splDb, targetDb, minHz = 10, maxHz = 200 }) {
  if (!Array.isArray(freqsHz) || !Array.isArray(splDb) || freqsHz.length === 0) {
    return { f3Hz: null, details: { samples: 0 } };
  }
  // Reference level = median of splDb in 60-200 Hz band (usable-bass reference).
  const refIdxs = [];
  for (let i = 0; i < freqsHz.length; i++) {
    if (freqsHz[i] >= 60 && freqsHz[i] <= 200 && isNum(splDb[i])) refIdxs.push(i);
  }
  const refVals = (refIdxs.length > 0 ? refIdxs : freqsHz.map((_, i) => i))
    .map((i) => splDb[i])
    .filter(isNum);
  const refDb = median(refVals);
  if (!isNum(refDb)) return { f3Hz: null, details: { samples: 0 } };
  const cutoffDb = refDb - 3;

  // Walk from low to high; first bin at/above cutoff within [minHz,maxHz].
  let f3 = null;
  for (let i = 0; i < freqsHz.length; i++) {
    const f = freqsHz[i];
    if (f < minHz || f > maxHz) continue;
    if (!isNum(splDb[i])) continue;
    if (splDb[i] >= cutoffDb) { f3 = f; break; }
  }
  return { f3Hz: f3, details: { refDb, cutoffDb, samples: freqsHz.length } };
}

// P19 — max absolute deviation of splDb from targetDb below Schroeder freq.
export function computeP19DeviationBelowSchroeder({ freqsHz, splDb, targetDb, schroederHz }) {
  if (!Array.isArray(freqsHz) || !Array.isArray(splDb) || freqsHz.length === 0) {
    return { resultDb: null, details: { samples: 0 } };
  }
  if (!isNum(schroederHz) || schroederHz <= 0) {
    return { resultDb: null, details: { samples: 0 } };
  }
  // If targetDb is an array (one value per freq), compare directly; else treat as scalar flat target.
  const tgtArr = Array.isArray(targetDb) && targetDb.length === freqsHz.length;
  let maxDev = 0;
  let used = 0;
  for (let i = 0; i < freqsHz.length; i++) {
    if (freqsHz[i] > schroederHz) continue;
    if (!isNum(splDb[i])) continue;
    const ref = tgtArr ? targetDb[i] : targetDb;
    if (!isNum(ref)) continue;
    const d = Math.abs(splDb[i] - ref);
    if (d > maxDev) maxDev = d;
    used++;
  }
  return { resultDb: used > 0 ? maxDev : null, details: { schroederHz, samples: used } };
}

export function computeTransitionFrequencyHz(roomDims, rt60 = 0.4) {
  const w = Number(roomDims?.widthM ?? roomDims?.width);
  const l = Number(roomDims?.lengthM ?? roomDims?.length);
  const h = Number(roomDims?.heightM ?? roomDims?.height);
  if (!isNum(w) || !isNum(l) || !isNum(h) || w <= 0 || l <= 0 || h <= 0) return null;
  const V = w * l * h;
  if (!isNum(V) || V <= 0) return null;
  const fs = 2000 * Math.sqrt(Math.max(rt60, 0.05) / V);
  return isNum(fs) && fs > 0 ? fs : null;
}

// Shared Design EQ transform — 1/3-octave smoothed basis, nudged toward its own
// flat median, clamped to +6 dB boost / -10 dB cut. It never "repairs" a narrow
// raw null, since it only ever operates on the already-smoothed curve.
// Used by both computeParam14LfeCapability (scoring) and the Bass Response graph
// (display), so P14 and the graph always agree on the same post-EQ curve.
export function applyDesignEqCurve(curveData, usableLfHz) {
  const raw = toSplCurve(curveData);
  if (raw.length === 0) return curveData || [];
  const smoothed = smoothThird(raw);
  if (smoothed.length === 0) return raw;
  const targetDb = median(smoothed.map((p) => p.spl));
  if (!isNum(targetDb)) return raw;
  const MAX_BOOST_DB = 6;
  const MAX_CUT_DB = -10;
  // Product LF guard: below the subwoofer's approved usable -6 dB limit, positive
  // EQ boost is physically unfounded (the driver cannot produce it). Cuts remain
  // allowed; boosts are clamped to 0 dB in that region. The existing ±6 / -10
  // limits are unchanged elsewhere.
  const lfHz = isNum(usableLfHz) && usableLfHz > 0 ? usableLfHz : null;
  // Gain is derived from the broad (smoothed) trend at each raw frequency, then
  // applied to the RAW value — this cuts broad peaks / lifts broad troughs while
  // leaving narrow modal peaks and nulls exactly where the raw response put them.
  return raw.map((p) => {
    const smoothedAtF = valAt(smoothed, p.frequency);
    const basis = isNum(smoothedAtF) ? smoothedAtF : p.spl;
    const diff = targetDb - basis;
    let clamped = Math.max(MAX_CUT_DB, Math.min(MAX_BOOST_DB, diff));
    if (lfHz != null && p.frequency < lfHz) {
      clamped = Math.min(0, clamped);
    }
    return { frequency: p.frequency, spl: p.spl + clamped };
  });
}

// Parameter 14 — LFE total SPL capability at RSP (post design-EQ), 1/3-octave
// smoothed. Design EQ (when enabled) nudges the smoothed curve toward its own
// flat median, clamped to +6 dB boost / -10 dB cut — it never "repairs" a
// narrow raw null, since it only ever operates on the already-smoothed curve.
export function computeParam14LfeCapability(rspResponse, designEqEnabled, band = [20, 120]) {
  if (!Array.isArray(rspResponse) || rspResponse.length === 0) return null;
  const curve = toSplCurve(rspResponse);
  if (curve.length === 0) return null;

  const smoothed = smoothThird(curve);
  if (smoothed.length === 0) return null;

  const evalCurve = designEqEnabled ? applyDesignEqCurve(rspResponse) : smoothed;

  const [fLo, fHi] = band;
  const inBand = evalCurve.filter((p) => p.frequency >= fLo && p.frequency <= fHi);
  const bandUsed = inBand.length > 0 ? inBand : evalCurve;
  const minSpl = Math.min(...bandUsed.map((p) => p.spl));
  if (!isNum(minSpl)) return null;

  let level = 0;
  if (minSpl >= 123) level = 4;
  else if (minSpl >= 120) level = 3;
  else if (minSpl >= 117) level = 2;
  else if (minSpl >= 114) level = 1;

  return {
    value: minSpl,
    level: level >= 1 ? `L${level}` : null,
    formatted: `${minSpl.toFixed(1)} dB`,
    designEqEnabled: !!designEqEnabled,
    band,
    note: 'Post-EQ design estimate at RSP using selected subwoofer product data.',
  };
}

// Parameter 18 — In-room bass extension capability envelope, level-coupled
// to P14 (LFE SPL capability). For each RP22 operating target (L1–L4), the
// -3 dB cutoff is measured against that target's required SPL threshold.
// P18 can never grade higher than P14.
//
// P14 thresholds (dB SPL): L1=114, L2=117, L3=120, L4=123
// P18 frequency limits (Hz): L1≤30, L2≤25, L3≤18, L4≤15
export function computeParam18BassExtension(rspResponse, p14Result) {
  if (!Array.isArray(rspResponse) || rspResponse.length === 0) return null;

  const curve = toSplCurve(rspResponse);
  if (curve.length === 0) return null;

  const smoothed = smoothThird(curve);
  if (smoothed.length === 0) return null;

  const sorted = smoothed.slice().sort((a, b) => a.frequency - b.frequency);
  if (sorted.length === 0) return null;

  const p14Value = p14Result && isNum(p14Result.value) ? p14Result.value : null;

  const TARGETS = [
    { level: "L1", targetSplDb: 114, cutoffDb: 111, limitHz: 30 },
    { level: "L2", targetSplDb: 117, cutoffDb: 114, limitHz: 25 },
    { level: "L3", targetSplDb: 120, cutoffDb: 117, limitHz: 18 },
    { level: "L4", targetSplDb: 123, cutoffDb: 120, limitHz: 15 },
  ];

  const targets = TARGETS.map((t) => {
    const achievable = isNum(p14Value) && p14Value >= t.targetSplDb;
    if (!achievable) {
      return {
        level: t.level,
        targetSplDb: t.targetSplDb,
        cutoffDb: t.cutoffDb,
        extensionHz: null,
        achievable: false,
        bounded: false,
        passesFrequency: false,
      };
    }

    // Lowest bin already at/above cutoff — bounded result ("≤ X Hz").
    if (sorted[0].spl >= t.cutoffDb) {
      const ext = sorted[0].frequency;
      return {
        level: t.level,
        targetSplDb: t.targetSplDb,
        cutoffDb: t.cutoffDb,
        extensionHz: ext,
        achievable: true,
        bounded: true,
        passesFrequency: ext <= t.limitHz,
      };
    }

    // Scan upward for the first below→above crossing, interpolate.
    let crossingHz = null;
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i];
      const b = sorted[i + 1];
      if (!isNum(a.spl) || !isNum(b.spl)) continue;
      if (a.spl < t.cutoffDb && b.spl >= t.cutoffDb) {
        const frac = (t.cutoffDb - a.spl) / (b.spl - a.spl);
        crossingHz = a.frequency + (b.frequency - a.frequency) * frac;
        break;
      }
    }

    if (crossingHz == null) {
      return {
        level: t.level,
        targetSplDb: t.targetSplDb,
        cutoffDb: t.cutoffDb,
        extensionHz: null,
        achievable: false,
        bounded: false,
        passesFrequency: false,
      };
    }

    return {
      level: t.level,
      targetSplDb: t.targetSplDb,
      cutoffDb: t.cutoffDb,
      extensionHz: crossingHz,
      achievable: true,
      bounded: false,
      passesFrequency: crossingHz <= t.limitHz,
    };
  });

  // Evaluate L4 down to L1; return the highest passing coupled level.
  let officialCoupledLevel = null;
  let winningTarget = null;
  for (let i = targets.length - 1; i >= 0; i--) {
    const t = targets[i];
    if (t.achievable && t.extensionHz != null && t.passesFrequency) {
      officialCoupledLevel = t.level;
      winningTarget = t;
      break;
    }
  }

  return {
    targets,
    officialCoupledLevel,
    level: officialCoupledLevel,
    value: winningTarget ? winningTarget.extensionHz : null,
    formatted:
      winningTarget == null
        ? null
        : winningTarget.bounded
          ? `≤ ${Math.round(winningTarget.extensionHz)} Hz`
          : `${Math.round(winningTarget.extensionHz)} Hz`,
    note: 'Predicted design-stage value from current bass engine. Capability envelope level-coupled to P14.',
  };
}

// Parameter 19 — Frequency response below transition frequency at RSP, relative
// to target curve (1/3-octave smoothing).
//
//  Target curve: with no user-selectable target in the app yet, we use the
//  median SPL of the 1/3-octave smoothed RSP curve (i.e. flat-target) across
//  the smoothed bass band. Max absolute deviation below the transition
//  frequency is returned.
export function computeParam19Deviation(rspResponse, transitionHz) {
  if (!isNum(transitionHz) || transitionHz <= 0) return null;
  if (!Array.isArray(rspResponse) || rspResponse.length === 0) return null;
  const curve = toSplCurve(rspResponse);
  if (curve.length === 0) return null;

  const smoothed = smoothThird(curve);
  if (smoothed.length === 0) return null;

  const bandHigh = smoothed.filter((p) => p.frequency >= 70 && p.frequency <= 200);
  const bandUsed = bandHigh.length > 0 ? bandHigh : smoothed;
  const refDb = median(bandUsed.map((p) => p.spl));
  if (!isNum(refDb)) return null;

  const below = smoothed.filter((p) => p.frequency <= transitionHz);
  if (below.length === 0) return null;

  let rawMaxDev = 0;
  for (let i = 0; i < below.length; i++) {
    const d = Math.abs(below[i].spl - refDb);
    if (d > rawMaxDev) rawMaxDev = d;
  }
  const maxDev = Math.ceil(Math.abs(rawMaxDev));

  let level = null;
  if (maxDev <= 2) level = 4;
  else if (maxDev <= 3) level = 3;
  else if (maxDev <= 4) level = 2;
  else if (maxDev <= 5) level = 1;

  return {
    maxDevDb: maxDev,
    targetDb: refDb,
    transitionHz,
    level: level != null ? `L${level}` : null,
    formatted: `±${maxDev} dB`,
    note: 'Calculated from 1/3-octave smoothed predicted response.',
  };
}

function levelForDeviation(dev) {
  if (dev <= 2) return 4;
  if (dev <= 3) return 3;
  if (dev <= 4) return 2;
  return null; // "N/A" — below L2 floor (Param 20 has no L1)
}

// Parameter 20 — Seat-to-seat frequency response below transition, relative to
// RSP, per seat, 1/3-octave smoothing. The worst (non-RSP) seat result is the
// achieved room value.
export function computeParam20SeatConsistency({ rspResponse, perSeatResponses, transitionHz, rspSeatId }) {
  if (!isNum(transitionHz) || transitionHz <= 0) return null;
  if (!Array.isArray(rspResponse) || rspResponse.length === 0) return null;

  const rspSmoothed = smoothThird(toSplCurve(rspResponse));
  if (rspSmoothed.length === 0) return null;

  const rspBandFreqs = rspSmoothed
    .filter((p) => p.frequency <= transitionHz)
    .map((p) => p.frequency);
  if (rspBandFreqs.length === 0) return null;

  const perSeat = [];
  for (let i = 0; i < (perSeatResponses || []).length; i++) {
    const entry = perSeatResponses[i];
    if (!entry || !Array.isArray(entry.responseData) || entry.responseData.length === 0) continue;
    // P20 measures seat-to-seat consistency across REAL seats only.
    // The synthetic "rsp" response (measured at the green RSP marker) is the
    // reference curve, not a real seat — exclude it from the comparison set.
    if (entry.seatId === "rsp" || entry.__isSyntheticRsp === true) continue;
    const seatCurve = smoothThird(toSplCurve(entry.responseData));
    if (seatCurve.length === 0) continue;

    let maxDev = 0;
    for (let j = 0; j < rspBandFreqs.length; j++) {
      const f = rspBandFreqs[j];
      const rspSpl = valAt(rspSmoothed, f);
      const seatSpl = valAt(seatCurve, f);
      if (rspSpl != null && seatSpl != null) {
        const d = Math.abs(seatSpl - rspSpl);
        if (d > maxDev) maxDev = d;
      }
    }
    const isRsp = rspSeatId != null && String(entry.seatId) === String(rspSeatId);
    const dev = isRsp ? 0 : maxDev;
    perSeat.push({
      seatId: entry.seatId,
      isPrimary: !!entry.isPrimary,
      isRsp,
      deviationDb: dev,
      level: levelForDeviation(dev),
    });
  }
  if (perSeat.length === 0) return null;

  // Seat-to-seat consistency requires at least 2 real seats. With fewer than
  // 2 real seats there is nothing to compare (the RSP reference alone is not a
  // "seat-to-seat" measurement), so report no_data.
  if (perSeat.length < 2) return null;

  const other = perSeat.filter((s) => !s.isRsp);
  // Worst (max deviation) across non-RSP seats; fall back to RSP with single seat config.
  let worst = null;
  if (other.length > 0) {
    worst = other.reduce((acc, s) => s.deviationDb > (acc ? acc.deviationDb : -Infinity) ? s : acc, null);
  } else {
    worst = perSeat[0] || null;
  }
  if (!worst) return null;

  const worstDev = worst.deviationDb;
  const worstLevel = levelForDeviation(worstDev);

  return {
    perSeat,
    rspSeatId,
    worstSeatId: worst.seatId,
    worstSeatDeviationDb: worstDev,
    worstSeatLevel: worstLevel,
    transitionHz,
    isSingleSeat: other.length === 0,
    note: 'Seat-to-seat consistency relative to RSP using 1/3-octave smoothing.',
  };
}