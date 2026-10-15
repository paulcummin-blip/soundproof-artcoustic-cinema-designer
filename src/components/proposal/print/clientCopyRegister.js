/**
 * clientCopyRegister.js
 * ---------------------
 * THE PUBLISHED PAGE'S OWN COPY REGISTER — the last, deterministic wording pass
 * a client-facing section body goes through before it is printed.
 *
 * Two things it does, and nothing else:
 *
 *   1. PROPORTIONATE STRUCTURE WORDING. A design's structure is described at the
 *      register its own evidence supports. Where a structure's achieved level is
 *      L1 or L2, a clause that claims the whole structure is exceptional is
 *      reduced to the proportionate wording for what the evidence actually
 *      states — "exceptionally precise placement across the front stage" becomes
 *      "precise front-stage placement". Where the structure reached L3 or L4 the
 *      copy is left exactly as it stands: genuine strong evidence is never
 *      weakened, and no level is ever changed.
 *
 *   2. FIGURE RESTRAINT. Each structure page prints its own calculated figures in
 *      its evidence cards. The prose around them carries the experience, so a
 *      figure that only restates what the cards already state — a value
 *      introduced as the size of a stated capability — is dropped from the prose
 *      and left in the evidence where the client can read every number. A figure
 *      the sentence itself is making is never touched.
 *
 * PRESENTATION ONLY, and only where the document is printed: the stored proposal
 * copy is never modified, no sentence is rewritten in meaning, no figure, level,
 * product or claim is changed, and the pass is idempotent — a second application
 * on the same body changes nothing.
 *
 * Pure: no React, no SDK, no side effects.
 */

/** The structures a System Design document states, by the section that carries them. */
const SECTION_STRUCTURE = Object.freeze({
  spatial_resolution: 'Spatial Resolution',
  dynamic_range: 'Dynamic Range',
  timbre_matching: 'Timbre Matching',
});

/** A structure described proportionately needs no more than a passing level. */
const PROPORTIONATE_BELOW = 3;

/**
 * The clause that claims the whole structure is exceptional, and the wording the
 * evidence supports. One clause per structure, stated once, in the order it is
 * tried: the tighter phrase first, so the longest match wins.
 */
const PROPORTIONATE_REWRITES = Object.freeze([
  [/\bexceptionally\s+precise\s+placement\s+across\s+the\s+front\s+stage\b/gi, 'precise front-stage placement'],
  [/\bexceptional\s+precision\s+of\s+placement\s+across\s+the\s+front\s+stage\b/gi, 'precise front-stage placement'],
  [/\bexceptionally\s+precise\s+placement\b/gi, 'precise placement'],
  [/\bexceptional\s+precision\s+of\s+placement\b/gi, 'precise placement'],
]);

/**
 * A figure stated as the size of a capability the sentence already names. The
 * connector or the word "calculated" introduces it, so the figure can go without
 * the sentence losing what it says: "calculated output capability of 99 dBC"
 * reads "calculated output capability".
 */
const CAPABILITY_FIGURE = Object.freeze([
  /\s+of\s+\d+(?:[.,]\d+)?\s?(?:dBFS|dBC|dBA|dB|Hz|kHz)\b/gi,
  /\s+at\s+\d+(?:[.,]\d+)?\s?(?:dBFS|dBC|dBA|dB|Hz|kHz)\b/gi,
  /\bcalculated\s+\d+(?:[.,]\d+)?\s?(?:dBFS|dBC|dBA|dB|Hz|kHz)\b/gi,
]);

/** A sentence that states an assessed result is evidence, and is left alone. */
const STATED_RESULT = /\bP\d{1,2}\b|\bL[1-4]\b/i;

/** The structure level a section's own evidence reached, from the frozen interpretation. */
export function sectionStructureLevel(interpretation, sectionType) {
  const structure = SECTION_STRUCTURE[String(sectionType || '').trim()];
  if (!structure) return null;
  const structures = interpretation?.reliable_evidence?.structures;
  const entry = (Array.isArray(structures) ? structures : [])
    .find((item) => String(item?.structure || '').trim().toLowerCase() === structure.toLowerCase());
  const match = /\bL([1-4])\b/i.exec(String(entry?.level || ''));
  return match ? Number(match[1]) : null;
}

/** Split an HTML body into its tags and its text runs. */
function rewriteRuns(html, rewrite) {
  const source = String(html || '');
  if (!source) return source;
  return source
    .split(/(<[^>]*>)/)
    .map((part) => (part.startsWith('<') ? part : rewrite(part)))
    .join('');
}

/** Drop a capability's own figure from one sentence, never a stated result. */
function withoutCapabilityFigures(sentence) {
  if (STATED_RESULT.test(sentence)) return sentence;
  let out = sentence;
  for (const pattern of CAPABILITY_FIGURE) {
    out = out.replace(pattern, '');
  }
  return out
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+([.,;:])/g, '$1')
    .replace(/\bcapability\s*,/gi, 'capability,');
}

/**
 * The published body for one section: proportionate structure wording where the
 * structure's own level calls for it, and no figure that merely restates the
 * evidence cards beside it.
 *
 * @param {string} html — the prepared section body
 * @param {{ sectionType?: string, structureLevel?: number|null }} [options]
 * @returns {string} the body as the page prints it
 */
export function applyClientCopyRegister(html, options = {}) {
  const source = String(html || '');
  if (!source) return source;
  const sectionType = String(options.sectionType || '').trim();
  const structureLevel = Number(options.structureLevel) || null;
  const isStructure = Boolean(SECTION_STRUCTURE[sectionType]);

  return rewriteRuns(source, (run) => {
    if (!run.trim()) return run;
    let out = run;
    // The structure's own register: only where the evidence does not support the
    // exceptional claim, and only in the section that states that structure.
    if (isStructure && structureLevel !== null && structureLevel < PROPORTIONATE_BELOW) {
      for (const [pattern, replacement] of PROPORTIONATE_REWRITES) {
        out = out.replace(pattern, replacement);
      }
    }
    if (!isStructure) return out;
    // Sentence by sentence, so a figure is only ever read against its own sentence.
    return out
      .split(/(?<=[.!?])(\s+)/)
      .map((piece) => (/^[.!?]?\s*$/.test(piece) ? piece : withoutCapabilityFigures(piece)))
      .join('');
  });
}

export default applyClientCopyRegister;