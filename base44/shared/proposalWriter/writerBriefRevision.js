/**
 * writerBriefRevision.js (shared)
 * --------------------------------
 * THE one controlled revision of a draft against the designer's brief.
 *
 * A draft can pass the writer's contract and still leave a substantive, supported
 * request of the designer's brief unanswered. This module turns that audit into
 * ONE bounded revision: the sections that carry the unanswered requests, what each
 * one has to explain, and the material the interpretation already records for it.
 *
 * It adds no fact and invents no reason. Where the interpretation records nothing
 * for a request, the revision says so and the writer states the result without a
 * reason, exactly as the design philosophy requires. Every other section of the
 * draft is accepted and is returned unchanged: nothing else is re-written, and the
 * revision is validated by the same contract validator as the draft.
 *
 * A revision is a single pass by construction — a caller runs it at most once per
 * draft — so it can never become a generation loop.
 *
 * Pure: no React, no SDK, no provider call, no writes.
 */

import { WRITER_SECTION_IDS } from './writerContractSchema.js';

export const REVISION_RULE =
  'the designer\'s brief is an instruction, and a supported request in it is answered only where the finished copy explains it. '
  + 'This revision re-writes the sections that carry an unanswered request, from the same frozen evidence and the same verified '
  + 'interpretation, and changes nothing else.';

/** The interpretation's own recorded material for a request, when it records any. */
function recordedMaterial(view, terms) {
  if (!view || typeof view !== 'object' || !Array.isArray(terms) || terms.length === 0) return null;
  const sources = [
    ...(Array.isArray(view.constraints) ? view.constraints.map((text) => ({ where: 'a recorded constraint', text })) : []),
    ...(Array.isArray(view.design_decisions) ? view.design_decisions.map((text) => ({ where: 'a recorded design decision', text })) : []),
  ];
  const match = sources.find((entry) => terms.some((term) => String(entry.text || '').toLowerCase().includes(String(term).toLowerCase())));
  if (!match) return null;
  return `${match.where} of this project: "${match.text}"`;
}

/**
 * The revision a coverage audit asks for, or no revision at all.
 *
 * @param {Object} input
 * @param {Object} input.coverage — buildClientBriefCoverage output
 * @param {Object} [input.interpretationView] — the verified interpretation the writer was given
 * @returns {{ needed: boolean, sections: Array<string>, items: Array<Object>, rule: string }}
 */
export function buildBriefRevision({ coverage = null, interpretationView = null } = {}) {
  // A request the evidence itself contradicts is never sent to the writer: writing
  // it would contradict the frozen evidence, and writing around it would answer a
  // request the client did not make.
  const outstanding = (Array.isArray(coverage?.outstanding) ? coverage.outstanding : [])
    .filter((row) => row?.needs_designer_attention !== true);
  if (outstanding.length === 0) return { needed: false, sections: [], items: [], rule: REVISION_RULE };

  const items = outstanding.map((row) => {
    const terms = String(row?.missing_subject || '')
      .split(',')
      .map((term) => term.trim())
      .filter(Boolean);
    return {
      request: row?.item || null,
      section: row?.revision_section || 'what_changes',
      requested: row?.required_explanation || null,
      recorded: recordedMaterial(interpretationView, terms),
      status: row?.status || null,
    };
  });

  const sections = [...new Set(items.map((entry) => entry.section))]
    .filter((id) => WRITER_SECTION_IDS.includes(id));
  if (sections.length === 0) return { needed: false, sections: [], items: [], rule: REVISION_RULE };

  return { needed: true, sections, items, rule: REVISION_RULE };
}

/**
 * The revised sections put back into the accepted draft. A section the revision
 * did not ask for keeps the accepted text byte for byte, and an empty rewrite is
 * never taken as a replacement.
 *
 * @param {Object} input
 * @param {Object} input.output — the accepted draft
 * @param {Object} input.revised — the writer's answer to the revision
 * @param {Array<string>} input.sections — the sections the revision asked for
 */
export function mergeRevisedDraft({ output = null, revised = null, sections = [] } = {}) {
  const draft = Array.isArray(output?.sections) ? output.sections : [];
  const requested = new Set(Array.isArray(sections) ? sections : []);
  const incoming = new Map(
    (Array.isArray(revised?.sections) ? revised.sections : [])
      .filter((entry) => requested.has(entry?.section))
      .map((entry) => [entry.section, entry]),
  );
  const merged = draft.map((entry) => {
    const next = incoming.get(entry?.section);
    const text = String(next?.text || '').trim();
    if (!next || text.length === 0) return entry;
    return {
      ...entry,
      text,
      claim_ids: Array.isArray(next.claim_ids) ? next.claim_ids : entry.claim_ids,
    };
  });
  return { ...output, sections: merged };
}

export default buildBriefRevision;