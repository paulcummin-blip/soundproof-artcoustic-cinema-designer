// speakerLfResponseModel.js
// ---------------------------------------------------------------------------
// The natural low-frequency roll-off of an LCR speaker, as a complex response.
//
// WHY THIS IS AN APPROXIMATION
// Sound Proof holds each model's published operating limits (the low-frequency
// limit and the usable -6 dB point) but not yet measured on-axis response
// curves for the Artcoustic LCR models. Rather than pretend otherwise, the
// natural roll-off is modelled as a SMOOTH, minimum-phase 2nd-order Butterworth
// high-pass whose knee sits at the model's published low-frequency limit.
//
// IT IS REPLACEABLE. The engine consumes {re, im} per frequency and never
// assumes how it was produced, so measured Artcoustic curves can replace this
// module without touching the engine, the assessment or the optimiser.
//
// IT IS APPLIED ONCE. The electrical crossover high-pass is a separate stage
// (crossoverAuthority). The engine runs the speaker path from a UNIT flat
// source, so the natural roll-off below is the speaker's own acoustic behaviour
// and the electrical high-pass is the processor's — they are two distinct
// physical stages, never the same filter applied twice.
//
// Pure module: no React, no entity access.
// ---------------------------------------------------------------------------

import { MODELS, normaliseModelKey } from "@/components/models/speakers/registry";

/** Fallback knee when a model publishes no low-frequency limit at all. */
export const FALLBACK_LF_KNEE_HZ = 100;

/**
 * The knee frequency of a model's natural roll-off: its published -3 dB
 * low-frequency limit, confirmed by the published usable (-6 dB) point when one
 * exists. Never treated as a brick wall.
 */
export function resolveSpeakerLfKneeHz(modelKey) {
  const key = normaliseModelKey(modelKey);
  const model = MODELS.find((candidate) => candidate.key === key);
  const publishedLow = Number(model?.frequency_response_low);
  if (Number.isFinite(publishedLow) && publishedLow > 0) return publishedLow;
  const publishedUsable = Number(model?.usable_lf_hz_minus6db ?? model?.approvedUsableLfHzMinus6dB);
  if (Number.isFinite(publishedUsable) && publishedUsable > 0) return publishedUsable;
  return FALLBACK_LF_KNEE_HZ;
}

/**
 * The complex natural roll-off of a speaker at one frequency.
 *
 * A minimum-phase 2nd-order Butterworth high-pass: -3 dB at the knee, 12
 * dB/octave below it, unity above. The phase is the real phase of that filter,
 * so the roll-off contributes correctly to the crossover-region summation.
 *
 * @param {number} frequencyHz
 * @param {number} kneeHz
 * @returns {{re:number, im:number}}
 */
export function speakerNaturalRollOffResponse(frequencyHz, kneeHz) {
  const frequency = Number(frequencyHz);
  const knee = Number(kneeHz);
  if (!Number.isFinite(frequency) || frequency <= 0) return { re: 0, im: 0 };
  if (!Number.isFinite(knee) || knee <= 0) return { re: 1, im: 0 };
  const u = frequency / knee;
  const denominator = { re: 1 - u * u, im: Math.SQRT2 * u };
  const magnitude = denominator.re * denominator.re + denominator.im * denominator.im;
  if (!(magnitude > 0)) return { re: 0, im: 0 };
  const numerator = { re: -(u * u), im: 0 };
  return {
    re: (numerator.re * denominator.re + numerator.im * denominator.im) / magnitude,
    im: (numerator.im * denominator.re - numerator.re * denominator.im) / magnitude,
  };
}

/**
 * Pre-compute one speaker model's natural roll-off across a frequency axis.
 * @returns {Array<{re:number, im:number}>}
 */
export function buildSpeakerRollOffCurve(frequenciesHz, modelKey) {
  const kneeHz = resolveSpeakerLfKneeHz(modelKey);
  const frequencies = Array.isArray(frequenciesHz) ? frequenciesHz : [];
  return frequencies.map((frequency) => speakerNaturalRollOffResponse(frequency, kneeHz));
}

/** Per-model roll-off curves for a set of speakers, computed once each. */
export function buildSpeakerRollOffBank(frequenciesHz, modelKeys) {
  const bank = new Map();
  (Array.isArray(modelKeys) ? modelKeys : []).forEach((modelKey) => {
    const key = normaliseModelKey(modelKey);
    if (!key || bank.has(key)) return;
    bank.set(key, buildSpeakerRollOffCurve(frequenciesHz, key));
  });
  return bank;
}