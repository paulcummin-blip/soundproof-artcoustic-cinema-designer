/**
 * bassExtensionLanguage.js (src mirror)
 * -------------------------------------
 * MIRROR of the shared performance-language authority's BASS EXTENSION register:
 * base44/shared/performanceLanguageAuthority.js → PERFORMANCE_LANGUAGE.BASS_EXTENSION.
 *
 * The writing authority lives in base44/shared, which the front end cannot import
 * from (the two trees are bundled separately), so the register is mirrored here
 * verbatim for the client-facing proposal surfaces. These sentences are the
 * approved wording for the depth a design actually reaches, exactly as the
 * authority states them: nothing is added, hedged, or said about what the system
 * does not reach.
 *
 * The register is used at the STRENGTH the stated result earned: a Level 1 or
 * Level 2 result is told in its own level's words, so a modest result is stated
 * positively as the depth it gives the soundtrack and never as an apology, and a
 * strong one is never flattened onto weaker wording.
 */

/** The authority's own bass-extension sentences, by achieved level. */
export const BASS_EXTENSION_LANGUAGE = Object.freeze({
  L1: 'Solid bass depth that gives films and music real weight and scale.',
  L2: 'Deep bass that adds scale, impact and excitement to films and music.',
  L3: 'Very deep, powerful bass with the scale and impact of a serious cinema system.',
  L4: 'Exceptional low-frequency performance, reaching into the deepest parts of the soundtrack with huge scale, physical impact and authority.',
});

/**
 * The approved bass-extension sentence for a stated result.
 *
 * The level is read from the result text itself ("L2 · 26 Hz"); where no level is
 * stated the lowest level's wording is used, so a claim is never upgraded beyond
 * what the evidence says. Any level-specific wording a caller needs comes from
 * here, so "useful bass extension" and every similar hedge has no way back into
 * client-facing copy.
 */
export function bassExtensionSentence(stated) {
  const text = String(stated ?? '');
  const level = /\bL4\b/i.test(text) ? 'L4'
    : /\bL3\b/i.test(text) ? 'L3'
      : /\bL2\b/i.test(text) ? 'L2'
        : 'L1';
  return BASS_EXTENSION_LANGUAGE[level];
}

export default bassExtensionSentence;