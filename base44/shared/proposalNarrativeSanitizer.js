/**
 * proposalNarrativeSanitizer.js (shared)
 * --------------------------------------
 * Deterministic post-processing for AI-written proposal prose.
 *
 * The proposal writer is instructed never to build its own performance table and
 * never to describe a predicted result as measured. Those instructions are the
 * contract, but prompt wording alone is not a guarantee, so this module applies
 * the same three rules to the generated HTML itself, after the model returns:
 *
 *   1. no AI-written table inside a narrative section (the report owns its one
 *      calculated table, which is rendered by Sound Proof, never by the model)
 *   2. predicted, modelled or calculated data is never described as measured,
 *      proven or confirmed
 *   3. a blanket tonal guarantee is removed when the P17 evidence shows the
 *      options differ, because the assessed results no longer support it
 *
 *   4. a sentence referencing an assumed or administrative parameter (P8, P15,
 *      P21) is removed, because those are not client decision points; the
 *      designer can lift that exclusion explicitly, per parameter.
 *
 *   5. the P17 trade-off is attributed to the option the frozen evidence actually
 *      shows as stronger. A sentence that credits any other option for the
 *      stronger surround and overhead timbre result is replaced with the
 *      evidence's own wording, so a reversed attribution can never reach a client.
 *
 *   6. a sentence that merges the two bass concepts — calling P19 seat-to-seat
 *      consistency, or P20 the reference-position response against target — is
 *      removed, because the two parameters answer different questions.
 *
 * It only removes or rewrites wording. It never invents, changes or reorders a
 * value, a level, a parameter or a sentence's engineering meaning.
 *
 * Pure: no React, no SDK, no runtime-specific APIs. Safe in any backend function
 * and in the shared draft pipeline used by both the live and preview paths.
 */

import { stripExcludedParameterSentences } from './clientFacingParameterAuthority.js';
import { p17TradeoffSentences } from './p17TradeoffAuthority.js';

const TABLE_BLOCK = /<table\b[\s\S]*?<\/table>/gi;
const TABLE_TAG = /<\/?(?:table|thead|tbody|tfoot|tr|th|td|caption|colgroup|col)\b[^>]*>/gi;
const PIPE_TABLE_ROW = /^\s*\|[^\n]*\|\s*$/gm;

/** Preserve the original capitalisation of a replaced word. */
function matchCase(source, replacement) {
  return /^[A-Z]/.test(source) ? replacement.charAt(0).toUpperCase() + replacement.slice(1) : replacement;
}

/**
 * Predicted evidence must not be presented as measured. "Measured/proven/
 * confirmed" are only legitimate for genuinely measured in-room data, which is
 * never what a calculated proposal draft carries, so every occurrence is
 * replaced with the approved evidence vocabulary.
 */
const EVIDENCE_LANGUAGE_REWRITES = Object.freeze([
  [/\bmeasured\b/gi, 'predicted'],
  [/\bmeasuring\b/gi, 'modelling'],
  [/\bmeasurements?\b/gi, 'predicted result'],
  [/\bproven\b/gi, 'assessed'],
  [/\bproves\b/gi, 'shows'],
  [/\bprove\b/gi, 'show'],
  [/\bconfirmed\b/gi, 'indicated'],
  [/\bconfirms\b/gi, 'indicates'],
  [/\bconfirming\b/gi, 'indicating'],
  [/\bconfirm\b/gi, 'indicate'],
]);

/**
 * Blanket tonal guarantees. Each is only defensible when P16 and P17 both
 * support it across every option, so when the P17 evidence differs the whole
 * sentence carrying the claim is removed rather than softened.
 */
const BLANKET_TONAL_CLAIMS = Object.freeze([
  /matched character throughout the room/i,
  /seamless tonal transition(?:s)? across all channels/i,
  /uniform tonal balance/i,
  /maintains? (?:its|their) character as (?:it|they) move/i,
  /sounds? like one cohesive system/i,
  /tonal consistency (?:throughout|across) (?:the|all) (?:room|channels|seats)/i,
  /every loudspeaker[^.!?<>]{0,60}matched family/i,
]);

/** Remove every table the model wrote. The report renders its own one table. */
export function stripNarrativeTables(html) {
  if (!html) return '';
  return String(html)
    .replace(TABLE_BLOCK, '')
    .replace(PIPE_TABLE_ROW, '')
    .replace(TABLE_TAG, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Replace predicted data presented as measured with the approved vocabulary. */
export function enforcePredictedLanguage(html) {
  if (!html) return '';
  return EVIDENCE_LANGUAGE_REWRITES.reduce(
    (out, [pattern, replacement]) => out.replace(pattern, match => matchCase(match, replacement)),
    String(html),
  );
}

/** Remove a sentence carrying a blanket tonal guarantee. */
export function removeBlanketTonalClaims(html) {
  if (!html) return '';
  const cleaned = BLANKET_TONAL_CLAIMS.reduce((out, pattern) => {
    // Stay inside one text node: the surrounding context never crosses a tag.
    const sentence = new RegExp(`[^.!?<>]*(?:${pattern.source})[^.!?<>]*[.!?]`, 'gi');
    return out.replace(sentence, '');
  }, String(html));
  return cleaned
    .replace(/<p>\s*<\/p>/gi, '')
    .replace(/<h3>\s*<\/h3>/gi, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Each theme section carries its own parameters only. A sentence that names a
 * parameter belonging to another theme is removed, so Spatial Resolution does
 * not restate dynamic range, Dynamic Range does not argue timbre, and Timbre
 * Matching does not restate output capability. The section's own subject is
 * always kept.
 */
const OUT_OF_SCOPE_PARAMETERS = Object.freeze({
  spatial_resolution: /\bP1[234]\b|dynamic range|timbre/i,
  dynamic_range: /\bP1[6-9]\b|\bP20\b|timbre/i,
  timbre_matching: /\bP1[23]\b|screen dynamic range|non-screen dynamic range/i,
});

/** Remove sentences in a theme section that name another theme's parameters. */
export function enforceSectionScope(html, sectionType) {
  const pattern = OUT_OF_SCOPE_PARAMETERS[sectionType];
  if (!html || !pattern) return html || '';
  const sentence = new RegExp(`[^.!?<>]*(?:${pattern.source})[^.!?<>]*[.!?]`, 'gi');
  return String(html)
    .replace(sentence, '')
    .replace(/<p>\s*<\/p>/gi, '')
    .replace(/<h3>\s*<\/h3>/gi, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * The option the frozen evidence shows with the stronger P17 result is the only
 * option that may be named for it. A sentence crediting a different option — or
 * naming one option and then another around a single claim — is replaced with the
 * evidence's own wording. A correctly attributed sentence is left exactly as the
 * writer wrote it, and a sentence that names no option at all cannot invert an
 * attribution, so it stands.
 */
const P17_STRENGTH_CLAIM = /\b(?:stronger|strongest|higher|highest|best|better|leads?|wins?)\b[^.!?<>]{0,80}?(?:P17|surround and overhead timbre|surround\/overhead timbre|timbre result|timbre matching|timbre consistency)/i;

/** Index of the strength claim inside a sentence, or -1. */
function strengthClaimIndex(sentence) {
  const match = P17_STRENGTH_CLAIM.exec(sentence);
  return match ? match.index : -1;
}

/** The option named as the subject of the claim: the name closest before it. */
function claimSubject(sentence, claimIndex, names) {
  const text = sentence.toLowerCase();
  return names.reduce((subject, name) => {
    const at = text.lastIndexOf(String(name).toLowerCase(), claimIndex);
    return at > subject.at ? { at, name } : subject;
  }, { at: -1, name: null }).name;
}

/**
 * Replace a reversed P17 attribution with the frozen evidence's own sentence, and
 * carry the balanced explanation when the body does not already state it.
 *
 * @param {string} html
 * @param {object} tradeoff - resolved by resolveP17Tradeoff(); nothing happens without it
 */
export function enforceP17Attribution(html, tradeoff) {
  const canonical = p17TradeoffSentences(tradeoff);
  if (!html || !canonical) return html || '';
  const names = tradeoff.names || [];
  const weaker = new Set(tradeoff.weakerNames || []);
  const balanceAlreadyStated = /(?:does not|doesn['’]t) make[^.!?<>]{0,80}\bpoor\b/i.test(String(html));
  return String(html)
    .replace(/[^.!?<>]*[.!?]/g, (sentence) => {
      const claimIndex = strengthClaimIndex(sentence);
      if (claimIndex < 0) return sentence;
      const subject = claimSubject(sentence, claimIndex, names);
      if (subject === tradeoff.strongerName) return sentence;
      const mentioned = names.filter(name => sentence.toLowerCase().includes(String(name).toLowerCase()));
      if (mentioned.length === 0) return sentence;
      if (!subject && mentioned.includes(tradeoff.strongerName) && !mentioned.some(name => weaker.has(name))) return sentence;
      const leading = (sentence.match(/^\s*/) || [''])[0];
      return `${leading}${canonical.evidence}${balanceAlreadyStated ? '' : ` ${canonical.balance}`}`;
    })
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * P19 and P20 answer different questions and must never be merged: P19 is the bass
 * response at the reference listening position against target, P20 is seat-to-seat
 * consistency. A sentence that assigns one concept to the other parameter is
 * removed; a sentence that separates them is kept, because that framing is
 * required.
 */
const CONFLATED_BASS_CONCEPTS = Object.freeze([
  /\bP19\b[^.!?<>]{0,60}?\b(?:is|are|shows?|showing|describes?|describing|measures?|measuring|indicates?|indicating|reports?|reporting|reflects?|gives|delivers?|covers?|relates?)\b[^.!?<>]{0,60}?(?:seat[- ]to[- ]seat|between seats|across (?:all |every )?seats?|every seat|seat consistency|consistency (?:between|across) seats?)/i,
  /(?:seat[- ]to[- ]seat|between seats|across (?:all |every )?seats?|every seat|seat consistency|consistency (?:between|across) seats?)[^.!?<>]{0,60}?\b(?:is|are|shown|described|measured|assessed|graded|reported|predicted|given|delivered)\b[^.!?<>]{0,40}?\bP19\b/i,
  /\bP20\b[^.!?<>]{0,60}?\b(?:is|are|shows?|describes?|measures?|indicates?|reports?|covers?|relates?)\b[^.!?<>]{0,60}?(?:reference (?:listening )?position|against the target|response (?:versus|vs\.?) target|tonal balance at the reference)/i,
]);

/** A negation or separation cue inside the claim means the concepts are being kept apart. */
const CONCEPT_SEPARATION_CUE = /\bnot\b|n['’]t\b|\bnever\b|\bseparate(?:ly|d)?\b|\bdistinct\b|\bnot the same\b/i;

/** Remove a sentence that merges the P19 and P20 bass concepts. */
export function enforceBassConceptSeparation(html) {
  if (!html) return '';
  const source = String(html);
  const cleaned = source
    .replace(/[^.!?<>]*[.!?]/g, (sentence) => {
      const claim = CONFLATED_BASS_CONCEPTS.map(pattern => sentence.match(pattern)).find(Boolean);
      if (!claim || CONCEPT_SEPARATION_CUE.test(claim[0])) return sentence;
      return '';
    })
    .replace(/<p>\s*<\/p>/gi, '')
    .replace(/<h3>\s*<\/h3>/gi, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  // A body that was nothing but a merged sentence is kept rather than emptied:
  // an empty body would fail the section instead of merely reading badly.
  return cleaned || source;
}

/**
 * The section titles the app renders itself. A generated body is prose only, so
 * a heading the model wrote for another section of the report is removed rather
 * than left to duplicate the app's own heading.
 */
const REPORT_SECTION_TITLES = Object.freeze([
  'System Options Summary', 'System Design Summary', 'Executive Summary', 'Design Philosophy',
  'System Overview', 'Project Images', 'Room Images', 'Spatial Resolution', 'Dynamic Range',
  'Timbre Matching', 'Key Differences', 'Key Performance Highlights', 'Overall Design',
  'Products', 'Performance', 'Comparison', 'Conclusion', 'Appendix', 'Cover',
]);

/** Remove a heading the model wrote for a different report section. */
export function removeStraySectionHeadings(html) {
  if (!html) return '';
  return String(html)
    .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (match, level, inner) => {
      const text = String(inner).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      const isReportTitle = REPORT_SECTION_TITLES.some(title => title.toLowerCase() === text.toLowerCase());
      return isReportTitle ? '' : match;
    })
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Approved vocabulary. These banned marketing words are rewritten rather than
 * left in a client-facing section, so the prose reads as a designer explaining a
 * room rather than as a brochure.
 */
const APPROVED_VOCABULARY_REWRITES = Object.freeze([
  [/\butilis(e|es|ed|ing)\b/gi, match => match.toLowerCase().endsWith('es') ? 'uses' : match.toLowerCase().endsWith('ed') ? 'used' : match.toLowerCase().endsWith('ing') ? 'using' : 'use'],
  [/\butiliz(e|es|ed|ing)\b/gi, match => match.toLowerCase().endsWith('es') ? 'uses' : match.toLowerCase().endsWith('ed') ? 'used' : match.toLowerCase().endsWith('ing') ? 'using' : 'use'],
  [/\breference[- ]style\s+/gi, 'dedicated '],
  [/\breference[- ]grade\s+/gi, 'dedicated '],
  [/\bit is important to note that\s+/gi, ''],
  [/\bit is important to note,?\s+/gi, ''],
  [/\brobust\b/gi, 'solid'],
  [/\bseamlessly\b/gi, 'smoothly'],
  [/\bseamless\b/gi, 'smooth'],
]);

/** Replace banned marketing wording with the approved design vocabulary. */
export function enforceApprovedVocabulary(html) {
  if (!html) return '';
  return APPROVED_VOCABULARY_REWRITES.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), String(html));
}

/** True when the frozen P17 evidence shows the options differently graded. */
export function p17DiffersAcrossVersions(comparisonTable) {
  const row = comparisonTable?.rows?.find(item => item.key === 'p17');
  return Boolean(row) && row.identical === false && new Set(row.values || []).size > 1;
}

/**
 * Apply every narrative rule to one section body.
 *
 * @param {string} html - the model's returned section body
 * @param {{ p17Tradeoff?: object, p17Differs?: boolean, sectionType?: string, parameterPolicy?: object }} [options]
 * @returns {string} the sanitised body
 */
export function sanitizeNarrativeHtml(html, options = {}) {
  const tradeoff = options.p17Tradeoff || null;
  const p17Differs = Boolean(options.p17Differs) || Boolean(tradeoff?.differs);
  const withoutTables = stripNarrativeTables(html);
  const withEvidenceLanguage = enforcePredictedLanguage(withoutTables);
  const withAttribution = enforceP17Attribution(withEvidenceLanguage, tradeoff);
  const withTonalRule = p17Differs ? removeBlanketTonalClaims(withAttribution) : withAttribution;
  const withSeparatedBass = enforceBassConceptSeparation(withTonalRule);
  const scoped = enforceSectionScope(withSeparatedBass, options.sectionType);
  const withoutAssumptions = stripExcludedParameterSentences(scoped, options.parameterPolicy);
  return enforceApprovedVocabulary(removeStraySectionHeadings(withoutAssumptions));
}

export default sanitizeNarrativeHtml;