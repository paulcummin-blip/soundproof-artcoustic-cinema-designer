// crossoverAuthority.js
// ---------------------------------------------------------------------------
// THE authority for the speaker / subwoofer crossover in Sound Proof.
//
// It owns three things and nothing else:
//   1. The complex Linkwitz-Riley filter responses (magnitude AND phase).
//   2. The per-speaker-model crossover limits and their defaults.
//   3. The shared-LCR crossover rule (the highest minimum across the LCR trio).
//
// FILTER CONVENTION (documented, deliberately conventional):
//   * 24 dB/octave = Linkwitz-Riley 4th order. LR4 sums flat with no polarity
//     change, so no branch is inverted.
//   * 12 dB/octave = Linkwitz-Riley 2nd order. LR2 sums flat only when one
//     branch is inverted; the HIGH-PASS branch is inverted internally, which is
//     how processors and REW ship LR2. Without it a 12/12 pair would show a deep
//     null exactly at the crossover, which is not what the hardware does.
//   * Both branch responses are complex, so the speaker path and the subwoofer
//     path can be summed coherently and the crossover-region interaction is
//     preserved. Nothing here converts to magnitude.
//
// Pure module: no React, no entity access, no acoustic calculation. The filters
// are a modelling convention for the design prediction, not a claim about a
// particular processor's DSP topology.
// ---------------------------------------------------------------------------

import { normaliseModelKey } from "@/components/utils/modelKeyNormaliser";

/** Crossover frequency ceiling. Nothing in Sound Proof may exceed this. */
export const CROSSOVER_MAX_HZ = 200;
/** Crossover frequency floor for a model with no specific requirement. */
export const CROSSOVER_MIN_HZ = 80;
/** Default crossover frequency for a model with no specific requirement. */
export const DEFAULT_CROSSOVER_HZ = 100;
/** Default slope pair. */
export const DEFAULT_SLOPE_DB_PER_OCT = 24;
/** The only slopes Sound Proof offers. */
export const CROSSOVER_SLOPES_DB_PER_OCT = Object.freeze([12, 24]);

/**
 * Speaker models whose low-frequency capability requires a HIGHER crossover
 * than the general 80–200 Hz range. Mandatory: these minimums can never be
 * undercut, by the designer or by the optimiser.
 */
export const MODEL_CROSSOVER_LIMITS = Object.freeze({
  "evolve-1": Object.freeze({ defaultHz: 150, minHz: 150, maxHz: CROSSOVER_MAX_HZ }),
  "evolve-1-1": Object.freeze({ defaultHz: 120, minHz: 120, maxHz: CROSSOVER_MAX_HZ }),
  "evolve-2-1": Object.freeze({ defaultHz: 100, minHz: 100, maxHz: CROSSOVER_MAX_HZ }),
});

/** Every other model: 100 Hz default, adjustable 80–200 Hz. */
export const DEFAULT_MODEL_CROSSOVER_LIMITS = Object.freeze({
  defaultHz: DEFAULT_CROSSOVER_HZ,
  minHz: CROSSOVER_MIN_HZ,
  maxHz: CROSSOVER_MAX_HZ,
});

/** The limits for one speaker model. */
export function crossoverLimitsForModel(modelKey) {
  return MODEL_CROSSOVER_LIMITS[normaliseModelKey(modelKey)] || DEFAULT_MODEL_CROSSOVER_LIMITS;
}

/**
 * The shared crossover range for an LCR set: the HIGHEST required minimum and
 * the HIGHEST required default across the three speakers. Mixing a model with a
 * raised minimum (Evolve 1, Evolve 1-1, Evolve 2-1) with an ordinary model
 * raises the whole front stage to that model's requirement.
 */
export function resolveSharedCrossoverLimits(modelKeys) {
  const keys = (Array.isArray(modelKeys) ? modelKeys : []).filter(Boolean);
  if (!keys.length) return { ...DEFAULT_MODEL_CROSSOVER_LIMITS };
  let minHz = CROSSOVER_MIN_HZ;
  let defaultHz = DEFAULT_CROSSOVER_HZ;
  let maxHz = CROSSOVER_MAX_HZ;
  for (const key of keys) {
    const limits = crossoverLimitsForModel(key);
    minHz = Math.max(minHz, limits.minHz);
    defaultHz = Math.max(defaultHz, limits.defaultHz);
    maxHz = Math.min(maxHz, limits.maxHz);
  }
  return { minHz, defaultHz, maxHz };
}

/** True when the requested frequency is inside the permitted range. */
export function isCrossoverFrequencyAllowed(frequencyHz, limits) {
  const resolved = limits || DEFAULT_MODEL_CROSSOVER_LIMITS;
  const value = Number(frequencyHz);
  if (!Number.isFinite(value)) return false;
  return value >= resolved.minHz && value <= resolved.maxHz;
}

/**
 * Coerce any requested frequency onto the permitted range. Applied to manual
 * entry AND to every optimiser candidate, so a speaker's minimum can never be
 * bypassed.
 */
export function normaliseCrossoverFrequency(frequencyHz, limits) {
  const resolved = limits || DEFAULT_MODEL_CROSSOVER_LIMITS;
  const value = Number(frequencyHz);
  const candidate = Number.isFinite(value) && value > 0 ? value : resolved.defaultHz;
  return Math.min(resolved.maxHz, Math.max(resolved.minHz, candidate));
}

/** Only 12 and 24 dB/octave exist. Anything else falls back to the default. */
export function normaliseCrossoverSlope(slopeDbPerOct) {
  const value = Number(slopeDbPerOct);
  return CROSSOVER_SLOPES_DB_PER_OCT.includes(value) ? value : DEFAULT_SLOPE_DB_PER_OCT;
}

/** The crossover configuration Sound Proof starts a design with. */
export function defaultCrossoverConfig(limits) {
  const resolved = limits || DEFAULT_MODEL_CROSSOVER_LIMITS;
  return {
    frequencyHz: resolved.defaultHz,
    speakerHpSlopeDbPerOct: DEFAULT_SLOPE_DB_PER_OCT,
    subwooferLpSlopeDbPerOct: DEFAULT_SLOPE_DB_PER_OCT,
    linkFrequencies: true,
    subwooferFrequencyHz: resolved.defaultHz,
  };
}

/**
 * Normalise a stored crossover config against the current limits.
 *
 * An existing manually chosen frequency is PRESERVED when it is still valid for
 * the selected speakers — it is only moved when the speakers have changed in a
 * way that makes it illegal.
 */
export function normaliseCrossoverConfig(config, limits) {
  const resolved = limits || DEFAULT_MODEL_CROSSOVER_LIMITS;
  const fallback = defaultCrossoverConfig(resolved);
  const source = config && typeof config === "object" ? config : {};
  const linkFrequencies = source.linkFrequencies !== false;
  const frequencyHz = normaliseCrossoverFrequency(
    Number.isFinite(Number(source.frequencyHz)) ? Number(source.frequencyHz) : fallback.frequencyHz,
    resolved,
  );
  return {
    frequencyHz,
    speakerHpSlopeDbPerOct: normaliseCrossoverSlope(source.speakerHpSlopeDbPerOct),
    subwooferLpSlopeDbPerOct: normaliseCrossoverSlope(source.subwooferLpSlopeDbPerOct),
    linkFrequencies,
    subwooferFrequencyHz: linkFrequencies
      ? frequencyHz
      : normaliseCrossoverFrequency(
          Number.isFinite(Number(source.subwooferFrequencyHz))
            ? Number(source.subwooferFrequencyHz)
            : frequencyHz,
          resolved,
        ),
  };
}

/** True when the config describes a usable crossover at all. */
export function isCrossoverConfigUsable(config) {
  if (!config || typeof config !== "object") return false;
  const speaker = Number(config.frequencyHz);
  const subwoofer = config.linkFrequencies === false ? Number(config.subwooferFrequencyHz) : speaker;
  return Number.isFinite(speaker) && speaker > 0 && Number.isFinite(subwoofer) && subwoofer > 0;
}

// ── Complex filter responses ────────────────────────────────────────────────

function complexMultiply(a, b) {
  return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
}

function complexDivide(a, b) {
  const denominator = b.re * b.re + b.im * b.im;
  if (!(denominator > 0)) return { re: 0, im: 0 };
  return {
    re: (a.re * b.re + a.im * b.im) / denominator,
    im: (a.im * b.re - a.re * b.im) / denominator,
  };
}

const ONE = Object.freeze({ re: 1, im: 0 });
const INVERT = Object.freeze({ re: -1, im: 0 });

/**
 * The complex Linkwitz-Riley response of one crossover branch at one frequency.
 *
 * @param {number} frequencyHz
 * @param {number} crossoverHz
 * @param {number} slopeDbPerOct  12 (LR2) or 24 (LR4)
 * @param {"highpass"|"lowpass"} branch
 * @returns {{re:number, im:number}} unity-normalised complex gain
 */
export function linkwitzRileyResponse(frequencyHz, crossoverHz, slopeDbPerOct, branch) {
  const frequency = Number(frequencyHz);
  const crossover = Number(crossoverHz);
  if (!Number.isFinite(frequency) || frequency <= 0) return { re: 0, im: 0 };
  if (!Number.isFinite(crossover) || crossover <= 0) return { re: 0, im: 0 };
  const u = frequency / crossover;
  const isHighPass = branch === "highpass";

  if (Number(slopeDbPerOct) === 12) {
    // LR2 = the square of a 1st-order Butterworth branch.
    const firstOrderDen = { re: 1, im: u };
    const lowPassStage = complexDivide(ONE, firstOrderDen);
    const highPassStage = complexDivide({ re: 0, im: u }, firstOrderDen);
    if (!isHighPass) return complexMultiply(lowPassStage, lowPassStage);
    // LR2 sums flat only with one branch inverted — the high-pass, as shipped.
    return complexMultiply(complexMultiply(highPassStage, highPassStage), INVERT);
  }

  // LR4 = the square of a 2nd-order Butterworth branch.
  const secondOrderDen = { re: 1 - u * u, im: Math.SQRT2 * u };
  if (!isHighPass) {
    const stage = complexDivide(ONE, secondOrderDen);
    return complexMultiply(stage, stage);
  }
  const stage = complexDivide({ re: -(u * u), im: 0 }, secondOrderDen);
  return complexMultiply(stage, stage);
}

/**
 * Pre-compute both branches across a frequency axis, so a crossover sweep costs
 * one complex multiply per point instead of a filter evaluation per point.
 *
 * @returns {{ lowPass: Array<{re:number,im:number}>, highPass: Array<{re:number,im:number}> }}
 */
export function buildCrossoverFilterBank(frequenciesHz, crossover) {
  const frequencies = Array.isArray(frequenciesHz) ? frequenciesHz : [];
  const speakerHz = Number(crossover?.frequencyHz);
  const subwooferHz = crossover?.linkFrequencies === false
    ? Number(crossover?.subwooferFrequencyHz)
    : speakerHz;
  const hpSlope = normaliseCrossoverSlope(crossover?.speakerHpSlopeDbPerOct);
  const lpSlope = normaliseCrossoverSlope(crossover?.subwooferLpSlopeDbPerOct);
  if (!Number.isFinite(speakerHz) || !Number.isFinite(subwooferHz) || speakerHz <= 0 || subwooferHz <= 0) {
    return null;
  }
  return {
    speakerHz,
    subwooferHz,
    speakerHpSlopeDbPerOct: hpSlope,
    subwooferLpSlopeDbPerOct: lpSlope,
    highPass: frequencies.map((f) => linkwitzRileyResponse(f, speakerHz, hpSlope, "highpass")),
    lowPass: frequencies.map((f) => linkwitzRileyResponse(f, subwooferHz, lpSlope, "lowpass")),
  };
}