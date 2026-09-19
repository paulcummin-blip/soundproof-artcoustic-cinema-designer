/**
 * rp22ParameterInterpretations.js
 * --------------------------------
 * Layer 1 — Per-parameter engineering interpretation functions.
 * Each function takes the achieved level and raw value and returns
 * an engineering statement with confidence.
 *
 * These are DETERMINISTIC interpretations — the same input always
 * produces the same output. No GPT. No marketing language.
 * Engineering facts only.
 */

import { CONFIDENCE, withConfidence, notCalculated } from './confidence';

const LEVEL_MEANINGS = {
  L4: 'exceeds reference-grade standards',
  L3: 'meets high-performance standards',
  L2: 'meets good-performance standards',
  L1: 'meets minimum acceptable standards',
  FAIL: 'does not meet minimum standards',
  'N/A': 'not applicable or not calculated',
};

function levelConfidence(paramId) {
  // Geometric parameters have higher confidence (computed from verified geometry)
  const geometric = new Set([1, 2, 3, 5, 7, 9, 11]);
  // SPL capability parameters depend on product specs
  const splDependent = new Set([4, 6, 10, 12, 13]);
  // Frequency response variance depends on product + room
  const frDependent = new Set([16, 17]);

  if (geometric.has(paramId)) return CONFIDENCE.COMPUTED_GEOMETRIC;
  if (splDependent.has(paramId)) return CONFIDENCE.COMPUTED_SPL;
  if (frDependent.has(paramId)) return CONFIDENCE.COMPUTED_SPL;
  return CONFIDENCE.COMPUTED_GEOMETRIC;
}

function fmtVal(value, unit, decimals = 1) {
  if (!Number.isFinite(Number(value))) return '—';
  return `${Number(value).toFixed(decimals)}${unit ? ' ' + unit : ''}`;
}

// ─── P1: Seat-to-wall distance ───────────────────────────────────
export function interpretP1(metric) {
  if (!metric || !metric.level || metric.level === 'N/A') return notCalculated('Seat-to-wall distance not calculated.');
  const val = fmtVal(metric.value, 'm');
  const meanings = {
    L4: `All seating positions maintain ${val} separation from the nearest wall, providing excellent isolation from boundary interference and ensuring consistent tonal balance across the listening area.`,
    L3: `Seating positions maintain ${val} separation from the nearest wall, providing good isolation from boundary interference.`,
    L2: `Seating positions have ${val} separation from the nearest wall; some boundary interference may be perceptible at perimeter seats.`,
    L1: `Seating positions are ${val} from the nearest wall; boundary interference may affect tonal balance at certain seats.`,
    FAIL: `Seating positions are ${val} from the nearest wall, below the minimum recommended separation.`,
  };
  return withConfidence(meanings[metric.level] || meanings.L1, levelConfidence(1));
}

// ─── P2: Discrete channel count ──────────────────────────────────
export function interpretP2(metric) {
  if (!metric || !metric.level || metric.level === 'N/A') return notCalculated('Discrete channel count not calculated.');
  const count = metric.value;
  const meanings = {
    L4: `${count} discrete channels provide full spatial resolution for object-based audio rendering, enabling precise sound object placement in three-dimensional space.`,
    L3: `${count} discrete channels provide high spatial resolution for object-based audio rendering.`,
    L2: `${count} discrete channels provide good spatial resolution; some compromise in object-based audio precision compared to reference configurations.`,
    L1: `${count} discrete channels meet the minimum for discrete surround sound; object-based audio precision is limited.`,
    FAIL: `${count} discrete channels do not meet the minimum for discrete surround sound.`,
  };
  return withConfidence(meanings[metric.level] || meanings.L1, levelConfidence(2));
}

// ─── P4: Screen speaker SPL delta ────────────────────────────────
export function interpretP4(metric) {
  if (!metric || !metric.level || metric.level === 'N/A') return notCalculated('Screen speaker SPL variation not calculated.');
  const val = fmtVal(metric.value, 'dB');
  const meanings = {
    L4: `Screen wall speakers are matched to within ${val}, ensuring seamless pans across the front soundstage with no perceptible level shifts.`,
    L3: `Screen wall speakers are matched to within ${val}, providing smooth front soundstage pans with minimal level variation.`,
    L2: `Screen wall speakers vary by up to ${val}; some level shifts may be perceptible during front soundstage pans.`,
    L1: `Screen wall speakers vary by up to ${val}; level shifts during front pans may be noticeable.`,
    FAIL: `Screen wall speaker variation of ${val} exceeds acceptable limits.`,
  };
  return withConfidence(meanings[metric.level] || meanings.L1, levelConfidence(4));
}

// ─── P5: Surround angular spacing ────────────────────────────────
export function interpretP5(metric) {
  if (!metric || !metric.level || metric.level === 'N/A') return notCalculated('Surround angular spacing not calculated.');
  const val = fmtVal(metric.value, '°');
  const meanings = {
    L4: `Adjacent surround speakers are spaced at most ${val} apart at the listening position, ensuring smooth sound movement and accurate localisation in the lateral sound field.`,
    L3: `Adjacent surround speakers are spaced at most ${val} apart, providing good sound movement and localisation.`,
    L2: `Adjacent surround speakers are spaced up to ${val} apart; some localisation gaps may be perceptible between speaker positions.`,
    L1: `Adjacent surround speakers are spaced up to ${val} apart; localisation gaps may be noticeable.`,
    FAIL: `Surround angular spacing of ${val} exceeds acceptable limits.`,
  };
  return withConfidence(meanings[metric.level] || meanings.L1, levelConfidence(5));
}

// ─── P6: Surround SPL delta ─────────────────────────────────────
export function interpretP6(metric) {
  if (!metric || !metric.level || metric.level === 'N/A') return notCalculated('Surround SPL variation not calculated.');
  const val = fmtVal(metric.value, 'dB');
  const meanings = {
    L4: `Surround speakers are matched to within ${val}, ensuring seamless pans around the listener with no perceptible level shifts.`,
    L3: `Surround speakers are matched to within ${val}, providing smooth surround pans with minimal level variation.`,
    L2: `Surround speakers vary by up to ${val}; some level shifts may be perceptible during surround pans.`,
    L1: `Surround speakers vary by up to ${val}; level shifts during surround pans may be noticeable.`,
    FAIL: `Surround speaker variation of ${val} exceeds acceptable limits.`,
  };
  return withConfidence(meanings[metric.level] || meanings.L1, levelConfidence(6));
}

// ─── P9: Overhead angular spacing ────────────────────────────────
export function interpretP9(metric) {
  if (!metric || !metric.level || metric.level === 'N/A') return notCalculated('Overhead angular spacing not calculated.');
  const val = fmtVal(metric.value, '°');
  const meanings = {
    L4: `Adjacent overhead speakers are spaced at most ${val} apart, ensuring smooth vertical sound movement and accurate overhead localisation.`,
    L3: `Adjacent overhead speakers are spaced at most ${val} apart, providing good vertical sound movement.`,
    L2: `Adjacent overhead speakers are spaced up to ${val} apart; some localisation gaps may be perceptible in the overhead sound field.`,
    L1: `Adjacent overhead speakers are spaced up to ${val} apart; overhead localisation gaps may be noticeable.`,
    FAIL: `Overhead angular spacing of ${val} exceeds acceptable limits.`,
  };
  return withConfidence(meanings[metric.level] || meanings.L1, levelConfidence(9));
}

// ─── P10: Overhead SPL delta ─────────────────────────────────────
export function interpretP10(metric) {
  if (!metric || !metric.level || metric.level === 'N/A') return notCalculated('Overhead SPL variation not calculated.');
  const val = fmtVal(metric.value, 'dB');
  const meanings = {
    L4: `Overhead speakers are matched to within ${val}, ensuring seamless vertical pans with no perceptible level shifts.`,
    L3: `Overhead speakers are matched to within ${val}, providing smooth vertical pans with minimal level variation.`,
    L2: `Overhead speakers vary by up to ${val}; some level shifts may be perceptible during overhead pans.`,
    L1: `Overhead speakers vary by up to ${val}; level shifts during overhead pans may be noticeable.`,
    FAIL: `Overhead speaker variation of ${val} exceeds acceptable limits.`,
  };
  return withConfidence(meanings[metric.level] || meanings.L1, levelConfidence(10));
}

// ─── P12: Screen speaker SPL capability ──────────────────────────
export function interpretP12(metric) {
  if (!metric || !metric.level || metric.level === 'N/A') return notCalculated('Screen speaker SPL capability not calculated.');
  const val = fmtVal(metric.value, 'dB SPL', 0);
  const meanings = {
    L4: `Screen wall speakers achieve ${val} long-term SPL capability at the reference position, exceeding reference cinema requirements with substantial headroom for dynamic peaks and calibration EQ.`,
    L3: `Screen wall speakers achieve ${val} long-term SPL capability at the reference position, meeting high-performance cinema requirements.`,
    L2: `Screen wall speakers achieve ${val} long-term SPL capability, meeting good cinema performance requirements.`,
    L1: `Screen wall speakers achieve ${val} long-term SPL capability, meeting minimum cinema performance requirements.`,
    FAIL: `Screen wall speaker SPL capability of ${val} does not meet minimum requirements.`,
  };
  return withConfidence(meanings[metric.level] || meanings.L1, levelConfidence(12));
}

// ─── P13: Non-screen speaker SPL capability ─────────────────────
export function interpretP13(metric) {
  if (!metric || !metric.level || metric.level === 'N/A') return notCalculated('Non-screen speaker SPL capability not calculated.');
  const val = fmtVal(metric.value, 'dB SPL', 0);
  const meanings = {
    L4: `Surround and overhead speakers achieve ${val} long-term SPL capability at the reference position, exceeding reference cinema requirements.`,
    L3: `Surround and overhead speakers achieve ${val} long-term SPL capability, meeting high-performance cinema requirements.`,
    L2: `Surround and overhead speakers achieve ${val} long-term SPL capability, meeting good cinema performance requirements.`,
    L1: `Surround and overhead speakers achieve ${val} long-term SPL capability, meeting minimum cinema performance requirements.`,
    FAIL: `Non-screen speaker SPL capability of ${val} does not meet minimum requirements.`,
  };
  return withConfidence(meanings[metric.level] || meanings.L1, levelConfidence(13));
}

// ─── P16: Screen FR variance ─────────────────────────────────────
export function interpretP16(metric) {
  if (!metric || !metric.level || metric.level === 'N/A') return notCalculated('Screen speaker frequency response variance not calculated.');
  const val = fmtVal(metric.value, 'dB');
  const meanings = {
    L4: `Screen wall speaker frequency response varies by no more than ${val} across all seats, ensuring consistent tonal balance throughout the listening area.`,
    L3: `Screen wall speaker frequency response varies by no more than ${val} across all seats, providing good tonal consistency.`,
    L2: `Screen wall speaker frequency response varies by up to ${val} across seats; some tonal variation may be perceptible between listening positions.`,
    L1: `Screen wall speaker frequency response varies by up to ${val} across seats; tonal variation between listening positions may be noticeable.`,
    FAIL: `Screen wall speaker frequency response variation of ${val} exceeds acceptable limits.`,
  };
  return withConfidence(meanings[metric.level] || meanings.L1, levelConfidence(16));
}

// ─── P17: Surround FR variance ───────────────────────────────────
export function interpretP17(metric) {
  if (!metric || !metric.level || metric.level === 'N/A') return notCalculated('Surround speaker frequency response variance not calculated.');
  const val = fmtVal(metric.value, 'dB');
  const meanings = {
    L4: `Surround and overhead speaker frequency response varies by no more than ${val} across all seats, ensuring consistent envelopment throughout the listening area.`,
    L3: `Surround and overhead speaker frequency response varies by no more than ${val} across all seats, providing good tonal consistency.`,
    L2: `Surround and overhead speaker frequency response varies by up to ${val} across seats; some tonal variation may be perceptible.`,
    L1: `Surround and overhead speaker frequency response varies by up to ${val} across seats; tonal variation may be noticeable.`,
    FAIL: `Surround speaker frequency response variation of ${val} exceeds acceptable limits.`,
  };
  return withConfidence(meanings[metric.level] || meanings.L1, levelConfidence(17));
}

// ─── P15: Background noise floor (assumed) ───────────────────────
export function interpretP15(assumedLevel) {
  if (!assumedLevel) return notCalculated('Background noise floor not assumed.');
  const ncbValues = { L1: 'NCB 26', L2: 'NCB 22', L3: 'NCB 18', L4: 'NCB 15' };
  const meanings = {
    L4: `Assumed background noise floor at NCB 15 — suitable for reference-grade cinema where the quietest passages are fully audible above the noise floor.`,
    L3: `Assumed background noise floor at NCB 18 — suitable for high-performance cinema with excellent dynamic range.`,
    L2: `Assumed background noise floor at NCB 22 — suitable for good cinema performance; low-level detail may be slightly masked at very quiet passages.`,
    L1: `Assumed background noise floor at NCB 26 — meets minimum cinema requirements; low-level detail may be masked during quiet passages.`,
  };
  return withConfidence(meanings[assumedLevel] || `Assumed noise floor at ${ncbValues[assumedLevel] || 'unknown'}.`, CONFIDENCE.ASSUMED);
}

// ─── P21: Early reflections (assumed) ────────────────────────────
export function interpretP21(assumedLevel) {
  if (!assumedLevel) return notCalculated('Early reflections level not assumed.');
  const meanings = {
    L4: `Assumed early reflections at -12 dB relative to direct sound — ensures optimum direct-to-reflected sound balance for precise imaging and spatial accuracy.`,
    L3: `Assumed early reflections at -10 dB relative to direct sound — provides good direct-to-reflected balance for accurate imaging.`,
    L2: `Assumed early reflections at -8 dB relative to direct sound — meets good-performance standards for direct-to-reflected balance.`,
    L1: `Early reflections level not specified; acoustic treatment should be verified.`,
  };
  return withConfidence(meanings[assumedLevel] || meanings.L1, CONFIDENCE.ASSUMED);
}

// ─── Parameter registry ──────────────────────────────────────────
export const PARAM_INTERPRETERS = {
  1: { key: 'p1', interpret: interpretP1, category: 'spatial_resolution', title: 'Seat-to-wall distance' },
  2: { key: 'p2', interpret: interpretP2, category: 'spatial_resolution', title: 'Discrete channel count' },
  4: { key: 'p4', interpret: interpretP4, category: 'timbre', title: 'Screen speaker SPL variation' },
  5: { key: 'p5', interpret: interpretP5, category: 'spatial_resolution', title: 'Surround angular spacing' },
  6: { key: 'p6', interpret: interpretP6, category: 'timbre', title: 'Surround SPL variation' },
  9: { key: 'p9', interpret: interpretP9, category: 'spatial_resolution', title: 'Overhead angular spacing' },
  10: { key: 'p10', interpret: interpretP10, category: 'timbre', title: 'Overhead SPL variation' },
  12: { key: 'p12', interpret: interpretP12, category: 'dynamic_range', title: 'Screen speaker SPL capability' },
  13: { key: 'p13', interpret: interpretP13, category: 'dynamic_range', title: 'Non-screen speaker SPL capability' },
  16: { key: 'p16', interpret: interpretP16, category: 'timbre', title: 'Screen speaker frequency response variance' },
  17: { key: 'p17', interpret: interpretP17, category: 'timbre', title: 'Surround speaker frequency response variance' },
};

export { LEVEL_MEANINGS };