// maxSplBasisAuthority.js
// ---------------------------------------------------------------------------
// ONE home for the conservative interpretation of a manufacturer's published
// maximum SPL figure. The duration / basis the manufacturer states (or does
// NOT state) decides whether the figure is continuous capability or a
// peak / short-term figure.
//
//   explicitly continuous / AES / IEC / calculated → continuous capability
//   explicitly peak / short-term                   → peak / short-term
//   "Maximum SPL" with no duration stated           → peak / short-term
//                                                    (ASSUMED — never promoted
//                                                     to continuous)
//
// An ambiguous figure is NEVER promoted to continuous. The comparison engine
// then falls back to the calculated continuous capability (sensitivity + power)
// capped at the reclassified peak (continuous can never exceed peak), so the
// ambiguous figure can never increase capability beyond what is justified.
//
// Shared by the normaliser, the data-adequacy classifier and the comparison
// info panel, so all three state exactly the same thing and the assumption can
// never be silently upgraded. Nothing here changes an SPL value, a space
// correction, an RP22 threshold, the propagation rules, the amplifier ceiling,
// the EQ headroom or the eligibility rules.
// ---------------------------------------------------------------------------

// Basis values the manufacturer states that mean a genuinely CONTINUOUS figure.
// 'calculated' is a manufacturer-calculated continuous SPL — a clear continuous
// basis, distinct from an ambiguous "Max SPL".
const CONTINUOUS_BASIS = new Set([
  'continuous',
  'aes',
  'iec',
  'calculated',
]);

// Basis values the manufacturer states that mean a peak / short-term figure.
const PEAK_BASIS = new Set([
  'peak',
  'short-term',
  'short term',
  'peak/short-term',
  'peak / short-term',
]);

const textOf = (value) => String(value ?? '').trim().toLowerCase();

export const MAX_SPL_DURATION = Object.freeze({
  CONTINUOUS: {
    key: 'continuous',
    label: 'Continuous',
    isContinuous: true,
    isPeak: false,
    isAmbiguous: false,
    assumed: false,
  },
  PEAK: {
    key: 'peak',
    label: 'Peak / short-term',
    isContinuous: false,
    isPeak: true,
    isAmbiguous: false,
    assumed: false,
  },
  PEAK_ASSUMED: {
    key: 'peak_assumed',
    label: 'Peak / short-term — assumed',
    isContinuous: false,
    isPeak: true,
    isAmbiguous: true,
    assumed: true,
  },
});

/**
 * Resolve the max-SPL duration authority from the manufacturer's stated basis.
 * @param {string} basis the basis carried on the comparison row
 *   (record.max_spl_test_conditions — 'continuous', 'AES', 'IEC', 'calculated',
 *   'peak', 'manufacturer unspecified', 'unknown', or blank).
 * @returns {object} one of MAX_SPL_DURATION
 */
export function resolveMaxSplDuration(basis) {
  const text = textOf(basis);
  if (CONTINUOUS_BASIS.has(text)) return MAX_SPL_DURATION.CONTINUOUS;
  if (PEAK_BASIS.has(text)) return MAX_SPL_DURATION.PEAK;
  // 'manufacturer unspecified', 'unknown', blank, or anything else not
  // explicitly continuous → the manufacturer did not state a duration, so the
  // figure is held as peak / short-term. It is never promoted to continuous.
  return MAX_SPL_DURATION.PEAK_ASSUMED;
}

/**
 * The assumption statement shown wherever the comparison names its assumptions,
 * when a published "Max SPL" figure has no stated duration.
 */
export const AMBIGUOUS_MAX_SPL_ASSUMPTION =
  'Max SPL basis: Peak / short-term — assumed because manufacturer did not state duration';