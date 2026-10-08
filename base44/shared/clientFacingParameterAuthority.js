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

export const CLIENT_FACING_PROPOSAL_PARAMETER_IDS = Object.freeze([
  2, 4, 5, 6, 7, 9, 10, 12, 13, 14, 16, 17, 18, 19, 20,
]);

/** The label every explicitly requested assumed parameter must be stated with. */
export const ASSUMED_PARAMETER_LABEL = 'assumption / administrative check';

/** True when a parameter is an assumed or administrative check (P8, P15, P21). */
export function isAssumedAdministrativeParameter(parameterId) {
  return EXCLUDED_CLIENT_PARAMETER_IDS.includes(Number(parameterId));
}

/** True when a parameter may appear in a client-facing proposal by default. */
export function isClientFacingProposalParameter(parameterId) {
  const id = Number(parameterId);
  if (!Number.isFinite(id)) return false;
  return CLIENT_FACING_PROPOSAL_PARAMETER_IDS.includes(id);
}

/** The plain-language label of one assumed parameter. */
export function assumedParameterLabel(code) {
  const match = EXCLUDED_CLIENT_PARAMETERS.find((entry) => entry.code === String(code).toUpperCase());
  return match ? match.label : String(code);
}

/** The assumed parameter codes a text names, by the careful sentence patterns. */
export function assumedParameterMentions(text) {
  const value = String(text ?? '');
  if (!value) return [];
  return EXCLUDED_CLIENT_PARAMETERS
    .filter((entry) => entry.sentence.test(value))
    .map((entry) => entry.code);
}

/** The assumed parameter codes a text names, including a bare subject reference. */
export function assumedParameterRowMentions(text) {
  const value = String(text ?? '');
  if (!value) return [];
  return EXCLUDED_CLIENT_PARAMETERS
    .filter((entry) => entry.sentence.test(value) || entry.row.test(value))
    .map((entry) => entry.code);
}

/** Wording that labels an assumed parameter as an assumption, not a result. */
const ASSUMPTION_LABEL = /\b(?:assum\w*|administrative|not\s+(?:a\s+)?(?:calculated|measured|assessed|verified)|design\s+(?:assumption|input)|input\s+assumption)\b/i;

/** Wording that treats an assumed parameter as a performance differentiator. */
const ASSUMPTION_DIFFERENTIATOR = /\b(?:improve\w*|better|best|great\w*|excellent|outstanding|superior|gain\w*|advantage\w*|benefit\w*|stronger|higher|boost\w*|differentiat\w*|headline|win\w*|recommend\w*|highlight\w*)\b/i;

/** True when a text labels an assumed parameter as an assumption, not a result. */
export function isAssumptionLabelled(text) {
  return ASSUMPTION_LABEL.test(String(text ?? ''));
}

/** True when a text uses an assumed parameter as a performance differentiator. */
export function isAssumedParameterDifferentiator(text) {
  return ASSUMPTION_DIFFERENTIATOR.test(String(text ?? ''));
}

/**
 * Room treatment genuinely controls early reflections, so copy about the
 * treatment itself is design information rather than the P21 administrative
 * assumption. A mention of early reflections in that context is left alone.
 */
const TREATMENT_CONTEXT = /\b(?:treatment|treatments|absor\w*|diffus\w*|abfuser|panel|panels|reverberation|reverb)\b/i;

/**
 * Whether the designer explicitly asked for one assumed parameter. Accepts a
 * resolved policy (buildExcludedParameterPolicy output) or the raw request
 * context ({ clientBrief, narrativeBrief, dealerNotes }).
 */
export function isExplicitlyRequestedAssumedParameter(parameterId, requestContext) {
  if (!isAssumedAdministrativeParameter(parameterId)) return false;
  if (!requestContext) return false;
  const code = `P${Number(parameterId)}`;
  if (typeof requestContext.allows === 'function') return requestContext.allows(code) === true;
  const { clientBrief = '', narrativeBrief = '', dealerNotes = '' } = requestContext;
  const policy = buildExcludedParameterPolicy({
    clientBrief: [clientBrief, narrativeBrief].filter(Boolean).join('\n'),
    dealerNotes,
  });
  return policy.allows(code) === true;
}

/**
 * The ONE question a proposal-facing surface asks about a sentence, a chip or a
 * row: may this text name this assumed parameter, and is it written correctly?
 *
 * @param {string} text
 * @param {Object|null} policy — a resolved exclusion policy
 * @param {{ broad?: boolean }} [options] — broad also catches a bare subject
 *   reference ("compare the noise floor"), which only a chip label needs
 * @returns {{ rule: string, code: string }|null}
 */
export function assumedParameterUseIssue(text, policy, { broad = false } = {}) {
  const value = String(text ?? '');
  const codes = (broad ? assumedParameterRowMentions(value) : assumedParameterMentions(value))
    .filter((code) => !(code === 'P21' && TREATMENT_CONTEXT.test(value)));
  if (codes.length === 0) return null;
  const unrequested = codes.filter((code) => policy?.allows?.(code) !== true);
  if (unrequested.length > 0) {
    return { rule: 'assumed_parameter_not_requested', code: unrequested[0] };
  }
  if (isAssumedParameterDifferentiator(value)) {
    return { rule: 'assumed_parameter_used_as_a_differentiator', code: codes[0] };
  }
  if (!isAssumptionLabelled(value)) {
    return { rule: 'assumed_parameter_not_labelled_as_an_assumption', code: codes[0] };
  }
  return null;
}

/** The chips a client proposal may offer: none that names an unrequested assumed parameter. */
export function filterAssumedParameterChips(chips, policy) {
  return (Array.isArray(chips) ? chips : []).filter((entry) => {
    const label = String(entry?.label ?? entry ?? '');
    return !assumedParameterUseIssue(label, policy, { broad: true });
  });
}

/** The rule text stating how an explicitly requested assumed parameter may be used. */
export function buildRequestedAssumptionRule(codes = []) {
  if (codes.length === 0) return null;
  const plural = codes.length > 1;
  return `DESIGNER-REQUESTED ASSUMPTIONS: ${codes.join(', ')} may be stated once, labelled as an ${ASSUMED_PARAMETER_LABEL} rather than a calculated or measured result. Never present ${plural ? 'them' : 'it'} as a performance differentiator, never as a headline claim, and never as a reason one option is better.`;
}

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