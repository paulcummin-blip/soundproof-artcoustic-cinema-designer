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
 * It only removes or rewrites wording. It never invents, changes or reorders a
 * value, a level, a parameter or a sentence's engineering meaning.
 *
 * Pure: no React, no SDK, no runtime-specific APIs. Safe in any backend function
 * and in the shared draft pipeline used by both the live and preview paths.
 */

import { stripExcludedParameterSentences } from './clientFacingParameterAuthority.js';

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
 * @param {{ p17Differs?: boolean, sectionType?: string }} [options]
 * @returns {string} the sanitised body
 */
export function sanitizeNarrativeHtml(html, options = {}) {
  const withoutTables = stripNarrativeTables(html);
  const withEvidenceLanguage = enforcePredictedLanguage(withoutTables);
  const withTonalRule = options.p17Differs ? removeBlanketTonalClaims(withEvidenceLanguage) : withEvidenceLanguage;
  const scoped = enforceSectionScope(withTonalRule, options.sectionType);
  const withoutAssumptions = stripExcludedParameterSentences(scoped, options.parameterPolicy);
  return enforceApprovedVocabulary(removeStraySectionHeadings(withoutAssumptions));
}

export default sanitizeNarrativeHtml;