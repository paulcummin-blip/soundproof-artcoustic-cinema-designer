/**
 * clientFacingParameterAuthority.js (shared)
 * ------------------------------------------
 * The one authority for which RP22 parameters may appear in a client proposal.
 *
 * Assumed and administrative parameters — P8 (upfiring / elevation speakers),
 * P15 (background noise floor) and P21 (early reflections) — are part of the
 * RP22 evidence set and belong in the Technical Report, but they are not client
 * decision points: they add noise, they distract from the choice between
 * options, and they are rarely a meaningful differentiator in a sales context.
 *
 * They are therefore excluded from every client-facing proposal surface:
 * narrative prose, the Key Differences table, Key Performance Highlights, the
 * At a Glance page, section prompts and refinement prompts.
 *
 * EXCEPTION: when the designer explicitly asks for one of them (in the Client
 * Brief or in the dealer notes), it may be stated once and must be labelled
 * clearly as an assumption, kept out of the main sales story and never treated
 * as a differentiator or as a comparison row.
 *
 * This module only decides what may be written and what may be shown. It never
 * changes a calculation, a level, a score or a stored result.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

/** The parameters proposals must not mention, with the words that signal each. */
export const EXCLUDED_CLIENT_PARAMETERS = Object.freeze([
  {
    id: 8,
    code: 'P8',
    label: 'Upfiring / elevation speakers',
    // A reference to the parameter itself. Describing that the overhead layer
    // uses ceiling speakers is design information, not the P8 allowance, so
    // only an explicit code reference is caught.
    sentence: /\bP8\b|\bParameter\s*8\b/i,
    row: /\bP8\b|\bParameter\s*8\b|up-?firing|elevation speaker/i,
  },
  {
    id: 15,
    code: 'P15',
    label: 'Background noise floor',
    sentence: /\bP15\b|\bParameter\s*15\b|NCB\s?\d+|assumed[^.!?<>]{0,30}(?:background )?noise floor|(?:background )?noise floor[^.!?<>]{0,40}?\b(?:assumed|assumption|level|L[1-4]\b|NCB)/i,
    row: /\bP15\b|\bParameter\s*15\b|background noise|noise floor/i,
  },
  {
    id: 21,
    code: 'P21',
    label: 'Early reflections',
    sentence: /\bP21\b|\bParameter\s*21\b|assumed early reflections|early reflections?[^.!?<>]{0,40}\b(?:assumed|assumption|at\s-?\d|dB|level|not (?:been )?measured)/i,
    // Room treatment genuinely controls early reflections, so a row is only
    // excluded when it is about the parameter itself.
    row: /\bP21\b|\bParameter\s*21\b|early reflection/i,
  },
]);

export const EXCLUDED_CLIENT_PARAMETER_IDS = Object.freeze(EXCLUDED_CLIENT_PARAMETERS.map((entry) => entry.id));
export const EXCLUDED_CLIENT_PARAMETER_CODES = Object.freeze(EXCLUDED_CLIENT_PARAMETERS.map((entry) => entry.code));

/**
 * The parameters proposal storytelling does focus on, by theme. Stated in the
 * prompts so the writer knows what it may use, not only what it must avoid.
 */
export const CLIENT_FACING_PARAMETER_SET = Object.freeze({
  spatial_resolution: Object.freeze(['P2', 'P4', 'P5', 'P6', 'P7', 'P9', 'P10']),
  dynamic_range: Object.freeze(['P12', 'P13', 'P14']),
  timbre_matching: Object.freeze(['P16', 'P17', 'P18', 'P19', 'P20']),
  viewing: Object.freeze(['RP23']),
});

/** The words that show the designer is asking for a parameter rather than naming it. */
const REQUEST_VERBS = 'ask|asking|asked|request|requested|requests|want|wanted|wants|need|needed|needs|include|included|includes|including|cover|covered|covers|discuss|discussed|mention|mentioned|mentions|show|shown|report|reported|state|stated|detail|detailed|explain|explained|add|added';

/** The excluded parameters a text explicitly asks for, as codes. */
export function requestedExcludedParameters(text) {
  const value = String(text ?? '');
  if (!value) return [];
  const requested = [];
  for (const entry of EXCLUDED_CLIENT_PARAMETERS) {
    if (entry.sentence.test(value)) { requested.push(entry.code); continue; }
    const ask = new RegExp(`(?:${REQUEST_VERBS})\\b[^.!?\\n]{0,60}?(?:${entry.row.source})|(?:${entry.row.source})[^.!?\\n]{0,60}?(?:${REQUEST_VERBS})\\b`, 'i');
    if (ask.test(value)) requested.push(entry.code);
  }
  return requested;
}

/**
 * The exclusion policy for one proposal. Excluded parameters stay excluded
 * unless the designer explicitly asked for them in the Client Brief or the
 * dealer notes.
 *
 * @param {{ clientBrief?: string, dealerNotes?: string }} [input]
 * @returns {{ excluded: Array, requested: string[], allows: (code: string) => boolean }}
 */
export function buildExcludedParameterPolicy({ clientBrief = '', dealerNotes = '' } = {}) {
  const requested = [...new Set(requestedExcludedParameters([clientBrief, dealerNotes].filter(Boolean).join('\n')))];
  const excluded = EXCLUDED_CLIENT_PARAMETERS.filter((entry) => !requested.includes(entry.code));
  return {
    excluded,
    requested,
    allows: (code) => requested.includes(String(code).toUpperCase()),
  };
}

/** True when a row is an excluded parameter rather than a client-facing result. */
export function isExcludedClientParameterRow(row) {
  if (!row) return false;
  const key = String(row.key || '').trim().toLowerCase();
  if (EXCLUDED_CLIENT_PARAMETER_IDS.some((id) => key === `p${id}` || key.startsWith(`p${id}_`))) return true;
  const label = `${row.area || ''} ${row.label || ''}`;
  return EXCLUDED_CLIENT_PARAMETERS.some((entry) => entry.row.test(label));
}

/** The rows a client proposal may show: excluded and Design Index rows dropped. */
export function excludeExcludedClientParameterRows(rows) {
  return (Array.isArray(rows) ? rows : []).filter((row) => !isExcludedClientParameterRow(row));
}

/** True when a text names an excluded parameter anywhere. Used by audits/tests. */
export function mentionsExcludedClientParameter(text) {
  const value = String(text ?? '');
  return EXCLUDED_CLIENT_PARAMETERS.some((entry) => entry.sentence.test(value) || new RegExp(entry.row.source, 'i').test(value));
}

/**
 * Remove the sentences that reference an excluded parameter. Only a reference to
 * the parameter is removed: room treatment copy that legitimately says it
 * controls early reflections is left untouched.
 */
export function stripExcludedParameterSentences(html, policy) {
  if (!html) return '';
  const excluded = Array.isArray(policy?.excluded) ? policy.excluded : EXCLUDED_CLIENT_PARAMETERS;
  const cleaned = excluded.reduce((out, entry) => {
    const sentence = new RegExp(`[^.!?<>]*(?:${entry.sentence.source})[^.!?<>]*[.!?]`, 'gi');
    return out.replace(sentence, '');
  }, String(html));
  return cleaned
    .replace(/<p>\s*<\/p>/gi, '')
    .replace(/<li>\s*<\/li>/gi, '')
    .replace(/<h3>\s*<\/h3>/gi, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * The prompt rule. Always states the client-facing parameter set; states the
 * exclusion for whichever excluded parameters were not explicitly requested,
 * and the assumption-labelling exception for any that were.
 */
export function buildClientFacingParameterRule(policy) {
  const resolved = policy || buildExcludedParameterPolicy();
  const lines = [
    'CLIENT-FACING PARAMETER SET (what this proposal may use):',
    `- Spatial Resolution: ${CLIENT_FACING_PARAMETER_SET.spatial_resolution.join(', ')}`,
    `- Dynamic Range: ${CLIENT_FACING_PARAMETER_SET.dynamic_range.join(', ')}`,
    `- Timbre Matching: ${CLIENT_FACING_PARAMETER_SET.timbre_matching.join(', ')}`,
    `- Viewing: ${CLIENT_FACING_PARAMETER_SET.viewing.join(', ')}`,
  ];
  if (resolved.excluded.length > 0) {
    lines.push(
      `NEVER MENTION ${resolved.excluded.map((entry) => `${entry.code} (${entry.label.toLowerCase()})`).join(', ')} anywhere in this proposal.`,
      'They are assumed or administrative checks: no parameter code, no name, no level, no result and no table row for them, and never presented as a difference between options.',
      'Nothing is said about them either way — not that they were assessed, assumed, excluded or unavailable.',
    );
  }
  if (resolved.requested.length > 0) {
    lines.push(
      `DESIGNER-REQUESTED ASSUMPTIONS: ${resolved.requested.join(', ')} may be stated, because the designer asked about ${resolved.requested.length > 1 ? 'them' : 'it'} explicitly.`,
      'State each one once, label it clearly as an assumption or administrative check rather than a calculated or measured result, keep it out of the main sales story, and never use it to argue that one option is better.',
    );
  }
  return lines.join('\n');
}

export default buildExcludedParameterPolicy;