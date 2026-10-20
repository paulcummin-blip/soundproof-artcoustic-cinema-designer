// combinedSystemResponse.js
// ---------------------------------------------------------------------------
// The combined LCR + bass-managed subwoofer response.
//
// RP22 interpretation (confirmed): P19 is the combined response of the screen
// channels and the bass-managed subwoofers operating SIMULTANEOUSLY at the
// reference seat; P20 is that same combined response compared seat to seat.
// A subwoofer-only response is therefore incomplete above the crossover, so
// this module builds the combined one.
//
// METHOD
//   1. Take the room's complex transfer from every source to every seat —
//      already produced by the authoritative modal engine, unchanged.
//   2. Multiply the subwoofer path by the complex subwoofer low-pass.
//   3. Multiply the speaker path by the speaker's complex natural roll-off and
//      the complex speaker high-pass.
//   4. Complex-sum the two paths PER FREQUENCY, and only then convert to SPL.
//
// Phase is preserved until the sources have been combined. Nothing here
// smooths, grades, thresholds or re-bands — smoothing and assessment stay with
// the existing canonical authority.
//
// LEVEL CONVENTION
// A fixed broad-band reference is captured with the geometry, before filters
// and independently of installed sub gains. Crossover/tuning edits never
// re-level the speakers. Split centres share one channel's drive.
// Redirected bass is represented by the sub branch ONCE.
// This practical design convention is not a claim about processor calibration.
//
// Pure module: no React, no entity access, no engine import.
// ---------------------------------------------------------------------------

import { buildCrossoverFilterBank, isCrossoverConfigUsable } from "./crossoverAuthority";
import { buildSpeakerRollOffBank, resolveSpeakerLfKneeHz } from "./speakerLfResponseModel";
import { normaliseModelKey } from "@/components/utils/modelKeyNormaliser";

function complexMultiply(a, b) {
  return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
}

const isFinitePoint = (point) => Number.isFinite(Number(point?.re)) && Number.isFinite(Number(point?.im));

function complexToDb(re, im) {
  return 20 * Math.log10(Math.max(Math.hypot(re, im), 1e-10));
}

function pointsToCurve(frequenciesHz, sumRe, sumIm) {
  const curve = [];
  for (let index = 0; index < frequenciesHz.length; index += 1) {
    const frequency = Number(frequenciesHz[index]);
    if (!Number.isFinite(frequency) || frequency <= 0) continue;
    curve.push({ frequency, spl: complexToDb(sumRe[index], sumIm[index]) });
  }
  return curve;
}

/**
 * Complex-sum one path for one seat.
 *
 * @param {Array} sources      [{ points: [{re,im}], filter: [{re,im}]|null, shape: [{re,im}]|null }]
 * @param {number} pointCount
 * @returns {{ re: Float64Array, im: Float64Array }}
 */
function sumPath(sources, pointCount) {
  const re = new Float64Array(pointCount);
  const im = new Float64Array(pointCount);
  for (const source of sources) {
    const points = Array.isArray(source?.points) ? source.points : [];
    for (let index = 0; index < pointCount; index += 1) {
      const point = points[index];
      if (!isFinitePoint(point)) continue;
      let value = { re: Number(point.re), im: Number(point.im) };
      if (source.filter?.[index]) value = complexMultiply(value, source.filter[index]);
      if (source.shape?.[index]) value = complexMultiply(value, source.shape[index]);
      re[index] += value.re * (source.channelWeight ?? 1);
      im[index] += value.im * (source.channelWeight ?? 1);
    }
  }
  return { re, im };
}

/**
 * Build the combined LCR + subwoofer response for every seat.
 *
 * @param {object} params
 * @param {number[]} params.frequenciesHz        the shared frequency axis (15–200 Hz)
 * @param {Array} params.seats                   [{ seatId, isRsp }]
 * @param {object} params.subTransfersBySeat     { seatId: [{ sourceId, points }] }  product curve + tuning applied
 * @param {object} params.speakerTransfersBySeat { seatId: [{ sourceId, modelKey, points }] }  unit flat-source room transfer
 * @param {object} params.crossover              normalised crossover config
 * @param {string} [params.primarySeatId]
 * @returns {object} combined curves, the subwoofer-only comparison, and the trim used
 */
export function buildCombinedSystemResponse({
  frequenciesHz,
  seats,
  subTransfersBySeat,
  speakerTransfersBySeat,
  crossover,
  primarySeatId = "rsp",
  speakerReferenceLevelDb,
} = {}) {
  const frequencies = Array.isArray(frequenciesHz) ? frequenciesHz.map(Number) : [];
  const seatList = (Array.isArray(seats) ? seats : []).filter((seat) => seat?.seatId);
  if (!frequencies.length || !seatList.length) {
    return { available: false, reason: "no-frequency-axis-or-seats", combinedBySeat: {}, subOnlyBySeat: {} };
  }
  if (!isCrossoverConfigUsable(crossover)) {
    return { available: false, reason: "crossover-not-configured", combinedBySeat: {}, subOnlyBySeat: {} };
  }
  const bank = buildCrossoverFilterBank(frequencies, crossover);
  if (!bank) {
    return { available: false, reason: "crossover-filters-unavailable", combinedBySeat: {}, subOnlyBySeat: {} };
  }

  const speakerModelKeys = [];
  Object.values(speakerTransfersBySeat || {}).forEach((sources) => {
    (Array.isArray(sources) ? sources : []).forEach((source) => {
      if (source?.modelKey) speakerModelKeys.push(source.modelKey);
    });
  });
  const rollOffBank = buildSpeakerRollOffBank(frequencies, speakerModelKeys);

  const pointCount = frequencies.length;
  const paths = new Map();
  for (const seat of seatList) {
    const subSources = (subTransfersBySeat?.[seat.seatId] || []).map((source) => ({
      points: source.points,
      filter: bank.lowPass,
      shape: null,
    }));
    const speakerSources = (speakerTransfersBySeat?.[seat.seatId] || []).map((source) => ({
      points: source.points,
      filter: bank.highPass,
      shape: rollOffBank.get(normaliseModelKey(source.modelKey)) || null,
      channelWeight: source.channelWeight ?? 1,
    }));
    paths.set(seat.seatId, {
      sub: sumPath(subSources, pointCount),
      speaker: sumPath(speakerSources, pointCount),
      subCount: subSources.length,
      speakerCount: speakerSources.length,
    });
  }

  if (!paths.has(primarySeatId) || !Number.isFinite(speakerReferenceLevelDb)) {
    return { available: false, reason: "missing-fixed-level-reference", combinedBySeat: {}, subOnlyBySeat: {} };
  }
  const levelMatchDb = speakerReferenceLevelDb;
  const speakerTrim = Math.pow(10, levelMatchDb / 20);

  const combinedBySeat = {};
  const subOnlyBySeat = {};
  for (const [seatId, path] of paths) {
    const combinedRe = new Float64Array(pointCount);
    const combinedIm = new Float64Array(pointCount);
    for (let index = 0; index < pointCount; index += 1) {
      combinedRe[index] = path.sub.re[index] + speakerTrim * path.speaker.re[index];
      combinedIm[index] = path.sub.im[index] + speakerTrim * path.speaker.im[index];
    }
    combinedBySeat[seatId] = pointsToCurve(frequencies, combinedRe, combinedIm);
    subOnlyBySeat[seatId] = pointsToCurve(frequencies, path.sub.re, path.sub.im);
  }

  const primaryPath = paths.get(primarySeatId) || paths.get(seatList[0]?.seatId);
  return {
    available: true,
    reason: null,
    crossover: {
      frequencyHz: bank.speakerHz,
      subwooferFrequencyHz: bank.subwooferHz,
      speakerHpSlopeDbPerOct: bank.speakerHpSlopeDbPerOct,
      subwooferLpSlopeDbPerOct: bank.subwooferLpSlopeDbPerOct,
    },
    levelMatchDb,
    subwooferCount: primaryPath?.subCount ?? 0,
    speakerCount: primaryPath?.speakerCount ?? 0,
    speakerKneeHz: Object.fromEntries(
      speakerModelKeys.map((key) => [key, resolveSpeakerLfKneeHz(key)]),
    ),
    combinedBySeat,
    subOnlyBySeat,
    primarySeatId: paths.has(primarySeatId) ? primarySeatId : (seatList[0]?.seatId ?? null),
    frequencyCount: pointCount,
  };
}