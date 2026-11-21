// maxSplAuthority.js
// ---------------------------------------------------------------------------
// Peak-to-continuous maximum SPL authority for competitor comparison.
//
// Unless a manufacturer EXPLICITLY identifies a published maximum SPL as
// continuous (AES / IEC / continuous basis), Sound Proof treats the published
// maximum SPL as peak and estimates continuous capability as:
//
//   Estimated continuous maximum SPL = Published maximum SPL − 6 dB
//
// This includes manufacturer specifications labelled "Maximum SPL", "Max SPL",
// "Peak SPL", "Maximum peak output", or any equivalent maximum SPL designation
// that does not explicitly confirm continuous output.
//
// The −6 dB crest-factor allowance is applied ONCE, here, and is never
// repeated inside the central SPL engine. It is independent of the
// full-space → half-space space correction (also +6 dB), which is applied
// separately and once by the normalizer.
//
// The estimated continuous value becomes the capability limit (the hard cap)
// for the comparison. Where a sensitivity-and-power calculation exceeds this
// limit, the lower defensible capability (the limit) is used.
//
// Authority hierarchy for the maximum SPL limit:
//   A. Published continuous SPL (basis explicitly confirms continuous) → use directly
//   B. Published max SPL not explicitly continuous → estimated continuous = figure − 6 dB
//   C. No published max SPL → calculated from sensitivity + power (no SPL cap)
// ---------------------------------------------------------------------------

export const PEAK_TO_CONTINUOUS_ALLOWANCE_DB = 6;

const EXPLICITLY_CONTINUOUS_BASES = new Set(['aes', 'iec', 'continuous']);

/**
 * Whether a max-SPL basis explicitly confirms the figure as continuous.
 * AES, IEC and 'continuous' bases are the only values that establish a
 * manufacturer-confirmed continuous maximum SPL.
 */
export function isExplicitlyContinuousSpl(basis) {
  return EXPLICITLY_CONTINUOUS_BASES.has(String(basis || '').toLowerCase());
}

/**
 * Whether a max-SPL basis explicitly identifies the figure as peak.
 */
export function isExplicitlyPeakSpl(basis) {
  return String(basis || '').toLowerCase() === 'peak';
}

/**
 * Classify the max-SPL authority for a competitor row.
 *   'published_continuous' — manufacturer explicitly published a continuous SPL
 *                             (a value in the continuous field, basis not peak)
 *   'published_peak'        — manufacturer explicitly identified the figure as peak
 *                             (basis = peak, or a peak field with no continuous)
 *   'assumed_peak'          — manufacturer published a max SPL but no continuous
 *                             figure (peak field only, basis not peak)
 *   'none'                  — no published max SPL figure at all
 *
 * A value in the continuous field is the PRIMARY signal that the manufacturer
 * explicitly stated a continuous maximum SPL. The extraction and approval process
 * only populates max_continuous_spl_db when the source labels a figure
 * continuous / Cont. / RMS / long-term / rated / AES / IEC. The basis label
 * describes HOW the figure was obtained (measured, calculated, AES, IEC); it
 * does not override the continuous/peak distinction. So a populated continuous
 * field with a 'calculated', 'manufacturer unspecified', 'unknown', or null basis
 * is still a manufacturer-confirmed continuous figure — the label records the
 * derivation method, not whether the figure is continuous or peak.
 *
 * Only an explicit 'peak' basis contradicts a populated continuous field (the
 * manufacturer called the same figure peak), and that is treated as published_peak.
 *
 * @param {object} params { rawContinuous, rawPeak, maxSplBasis }
 * @returns {{type: 'published_continuous'|'published_peak'|'assumed_peak'|'none'}}
 */
export function classifyMaxSplAuthority({ rawContinuous, rawPeak, maxSplBasis }) {
  if (rawContinuous !== null && !isExplicitlyPeakSpl(maxSplBasis)) {
    return { type: 'published_continuous' };
  }
  const hasMaxSplFigure = rawContinuous !== null || rawPeak !== null;
  if (!hasMaxSplFigure) return { type: 'none' };
  if (isExplicitlyPeakSpl(maxSplBasis)) return { type: 'published_peak' };
  return { type: 'assumed_peak' };
}

/**
 * The space-corrected max SPL figure that Sound Proof treats as peak when the
 * manufacturer has not explicitly confirmed continuous. Returns the continuous
 * field value when present (non-continuous basis), otherwise the peak field
 * value. Both are already space-corrected by the normalizer before this is
 * called, so the −6 dB allowance applies to the half-space figure.
 *
 * @param {object} params { continuous, peak, authorityType }
 * @returns {number|null}
 */
export function peakFigureForEstimate({ continuous, peak, authorityType }) {
  if (authorityType !== 'published_peak' && authorityType !== 'assumed_peak') return null;
  return continuous !== null ? continuous : peak;
}

/**
 * Compute the estimated continuous maximum SPL from a peak/unqualified max SPL.
 *   estimated = peakFigure − 6 dB
 *
 * @param {number|null} peakFigure space-corrected peak/assumed-peak SPL in dB
 * @returns {number|null} estimated continuous SPL in dB, or null
 */
export function estimatedContinuousFromPeak(peakFigure) {
  if (peakFigure === null || !Number.isFinite(peakFigure)) return null;
  return peakFigure - PEAK_TO_CONTINUOUS_ALLOWANCE_DB;
}