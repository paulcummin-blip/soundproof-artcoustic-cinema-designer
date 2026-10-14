/**
 * nonScreenChannelWording
 * -----------------------
 * The ONE place that words a design's non-screen loudspeaker layer for the
 * client report pages, so P13 and P17 always state the layer the design actually
 * has.
 *
 * A system with no overhead / height speakers has surround channels, not an
 * overhead layer: it is a deliberate 5.1 system, not an immersive one with
 * something missing. These helpers therefore name the overhead layer only where
 * the design carries one, and otherwise state the surround channels alone.
 *
 * Wording only. Nothing here grades, measures, sums or reinterprets a result:
 * every figure a page prints still comes from the published engineering
 * summary. Pure module — no React, no DOM, no side effects.
 */

/** The non-screen layer's noun: "surround and overhead" or "surround". */
export function nonScreenLayerNoun(hasOverheadLayer) {
  return hasOverheadLayer ? 'surround and overhead' : 'surround';
}

/** The P13 page's stated result: what was measured for the non-screen layer. */
export function p13CapabilityExplanation(hasOverheadLayer) {
  return `Minimum SPL capability of the ${nonScreenLayerNoun(hasOverheadLayer)} speakers at the reference seating position.`;
}

/** The P17 page's stated result: which channel groups were read per seat. */
export function timbreChannelsCaption(hasOverheadLayer) {
  return hasOverheadLayer
    ? 'Tonal balance consistency between the screen, surround and overhead channels at each seating position.'
    : 'Tonal balance consistency between the screen and surround channels at each seating position.';
}

/**
 * A marker or matrix label, with the overhead layer named only where it exists:
 * "P17 Surround & Overhead" becomes "P17 Surround" on a design with no height
 * speakers, and is left exactly as it is where the layer is installed.
 */
export function nonScreenSegmentLabel(label, hasOverheadLayer) {
  if (hasOverheadLayer) return label;
  return String(label ?? '')
    .replace(/Surround\s*&\s*Overhead/g, 'Surround')
    .replace(/Surround\/Overhead/g, 'Surround');
}

/** The canonical height / upper role prefixes the report's own layer rules use. */
const UPPER_ROLE_PREFIXES = ['T', 'U'];

/**
 * Whether a design's own assessed non-screen channels include a height layer,
 * read from the channel roles their published results are stated for.
 */
export function hasUpperChannelRole(speakerSplValues) {
  return (Array.isArray(speakerSplValues) ? speakerSplValues : [])
    .some((value) => UPPER_ROLE_PREFIXES.some((prefix) => String(value?.role || '').toUpperCase().startsWith(prefix)));
}

/**
 * The P13 page's fallback sentence, used only where no published explanation was
 * carried: it states the same measure for the layer this design has, and is
 * never an overhead claim for a system with no height speakers.
 */
export function p13ResultFallback(hasOverheadLayer) {
  return `The ${nonScreenLayerNoun(hasOverheadLayer)} speakers maintain consistent impact and clarity across the listening area, preserving the immersion of demanding movie soundtracks at the reference seating position.`;
}

export default p13CapabilityExplanation;