/**
 * proposalBriefRequests.js (shared)
 * ---------------------------------
 * WHAT THE DESIGNER'S BRIEF ASKS FOR, read as an engineering request.
 *
 * A client brief is an instruction about what the document must explain, and a
 * brief that asks for a result — the bass extension, the screen-channel dynamic
 * range, the difference between the front and rear rows — is asking for a result
 * the frozen evidence may or may not state. This module reads that request and
 * names the SUPPORTING RESULT it asks for, so the pack can make the evidence
 * available to the writer.
 *
 * Two boundaries are absolute:
 *
 *   1. A request is read from the brief's own words. Nothing is inferred from
 *      the design, the room or another requirement.
 *   2. A request never creates evidence. It only names which frozen result the
 *      brief asked for; whether that result exists is decided by the evidence, in
 *      proposalSupportingResults, and a request the evidence does not state is
 *      recorded as omitted rather than filled in.
 *
 * A supporting result is deliberately NOT a strength. A result the brief asked
 * for is stated because the client asked for it, at its own scope and value, and
 * never promoted to a headline, a grade or a comparison.
 *
 * Pure: no React, no SDK, no GPT, no side effects.
 */

/**
 * The supporting results a brief can ask for.
 *
 * `parameter_ids` are the RP22 parameters whose own frozen result answers the
 * request. `pattern` recognises the request in the brief's own words; a parameter
 * code named in the brief (P18, P12) is recognised too, so a designer who writes
 * in codes is understood exactly as one who writes in words.
 */
export const SUPPORT_REQUEST_RULES = Object.freeze([
  {
    key: 'bass_extension',
    area: 'p18',
    label: 'Bass extension',
    parameter_ids: [18],
    pattern: /\bextension\b|\bextends?\b|\bextending\b|\bHz\b|low[- ]frequency\s+(?:extension|reach)|how\s+(?:low|deep)\b|deepest\s+bass/i,
    description: 'the lowest frequency the subwoofer system is specified to reproduce',
  },
  {
    key: 'screen_dynamic_range',
    area: 'p12',
    label: 'Screen Dynamic Range',
    parameter_ids: [12],
    pattern: /screen\s+(?:channel\s+|stage\s+)?(?:dynamic\s+range|output|capability|headroom|spl)|(?:dynamic\s+range|output|capability|headroom)\s+(?:of|for|at)\s+the\s+screen|screen\s+speakers?\s+(?:spl|output|capability|dynamic)/i,
    description: 'the screen channel set\'s own output capability at the reference seating position',
  },
  {
    key: 'viewing_rows',
    area: 'rp23_viewing',
    label: 'Front and rear row viewing geometry',
    parameter_ids: [],
    pattern: /front[- ]row[^.]{0,60}rear[- ]row|rear[- ]row[^.]{0,60}front[- ]row|front\s+and\s+rear\s+rows?|(?:front|rear)[- ]row\s+(?:viewing\s+)?(?:angle|geometry|difference|position)|row[s]?\s+(?:viewing\s+)?(?:difference|comparison|geometry)/i,
    description: 'each seating row\'s own viewing angle, stated per row',
  },
]);

/** Every key a brief can request, for an audit to assert against. */
export const SUPPORT_REQUEST_KEYS = Object.freeze(SUPPORT_REQUEST_RULES.map((rule) => rule.key));

/** The brief's own text, whichever spelling the caller supplies. */
export function briefText(requestContext) {
  if (!requestContext || typeof requestContext !== 'object') return '';
  const sources = [
    requestContext.clientBrief,
    requestContext.client_brief,
    requestContext.narrativeBrief,
    requestContext.narrative_brief,
    requestContext.dealerNotes,
    requestContext.designer_notes,
  ];
  return sources
    .filter((source) => typeof source === 'string' && source.trim().length > 0)
    .join('\n');
}

/** The parameter codes a brief names ("P18", "P12"). */
export function namedParameterIds(text) {
  const found = [];
  const pattern = /\bP(\d{1,2})\b/g;
  let match = pattern.exec(String(text || ''));
  while (match) {
    const id = Number(match[1]);
    if (Number.isFinite(id) && id >= 1 && id <= 23 && !found.includes(id)) found.push(id);
    match = pattern.exec(text);
  }
  return found;
}

/**
 * The supporting results a brief asks for, in rules order.
 *
 * A rule fires when the brief names one of its parameters by code, or states its
 * own subject in words. Nothing else fires it: a brief that asks for nothing
 * engineering-specific requests nothing.
 *
 * @param {Object|null} requestContext — { clientBrief, narrativeBrief, dealerNotes }
 * @returns {Array<{ key, area, label, parameter_ids, description, requested_by }>}
 */
export function requestedSupportRules(requestContext) {
  const text = briefText(requestContext);
  if (text.trim().length === 0) return [];
  const codes = new Set(namedParameterIds(text));

  return SUPPORT_REQUEST_RULES
    .filter((rule) => {
      const byCode = rule.parameter_ids.some((id) => codes.has(id));
      return byCode || rule.pattern.test(text);
    })
    .map((rule) => ({
      key: rule.key,
      area: rule.area,
      label: rule.label,
      parameter_ids: [...rule.parameter_ids],
      description: rule.description,
      // Where the request was read from, so a minted result is always traceable
      // to the brief that asked for it.
      requested_by: rule.parameter_ids.some((id) => codes.has(id)) ? 'parameter_code' : 'brief_wording',
    }));
}

export default requestedSupportRules;