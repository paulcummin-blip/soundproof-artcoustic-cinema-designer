/**
 * publicationCopyAuthority.js (shared)
 * ------------------------------------
 * WHICH COPY THE DOCUMENT PUBLISHES.
 *
 * The generation and its edit history are PROVENANCE. They record what the
 * writer produced, what a designer corrected, and how the two relate — and they
 * are read for exactly that. They are not, on their own, the copy a document
 * publishes: once a designer edits a section by hand and approves the wording
 * they have written, THAT wording is the copy the client reads, and every
 * publication check has to be made against it rather than against the draft it
 * replaced.
 *
 * So the copy authority is resolved section by section:
 *
 *   the designer has approved the section as it stands
 *     → the current saved ProposalSection body is the published copy;
 *
 *   nobody has edited the section
 *     → the validated generation (or latest valid edit) copy is the published
 *       copy, exactly as before this rule existed.
 *
 * Approval, and only approval, makes a hand-edited body publishable. A section
 * whose wording has moved on since it was read carries no current approval, so
 * it falls back to the validated copy and is reported the way it always was —
 * nothing is inferred from a save, an open section or a passed check.
 *
 * Nothing here writes, validates or calls a provider, and no record is modified:
 * the stored rows are read and the copy to publish is decided from them.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

import { APPROVAL_STATUS, resolveSectionApproval } from '../proposalApproval/sectionApprovalAuthority.js';
import { preparePublishedSectionBody } from './publishedSectionPreparation.js';

/**
 * The stored sections as the client page publishes them — the same preparation
 * the published document applies, so an approval is judged against the wording
 * the designer actually read on the page.
 *
 * @param {{ sections?: Array, highChannel?: boolean, proposalType?: string|null }} input
 * @returns {Array} the stored rows, with the enabled ones carrying their page body
 */
export function preparedPageSections({ sections = [], highChannel = false, proposalType = null } = {}) {
  return (Array.isArray(sections) ? sections : []).map((section) => (section?.is_enabled === false ? section : {
    ...section,
    body: preparePublishedSectionBody(section?.body, {
      title: section?.title,
      sectionType: section?.section_type,
      highChannel,
      proposalType,
    }),
  }));
}

/**
 * The current saved body of every section whose exact wording the designer has
 * approved — read through the ONE approval authority, so a body that was
 * changed after it was approved is not here.
 *
 * @param {{ sections?: Array, highChannel?: boolean, proposalType?: string|null }} input
 * @returns {Map<string, string>} section_type → the approved current body
 */
export function approvedCurrentSectionBodies({ sections = [], highChannel = false, proposalType = null } = {}) {
  const stored = (Array.isArray(sections) ? sections : []).filter((section) => section?.section_type);
  const approval = resolveSectionApproval({
    sections: stored,
    publishedSections: preparedPageSections({ sections: stored, highChannel, proposalType }),
  });

  const bodyByType = new Map(stored.map((section) => [section.section_type, section.body]));
  const approved = new Map();
  for (const row of approval.sections || []) {
    if (row.status !== APPROVAL_STATUS.APPROVED) continue;
    const body = bodyByType.get(row.section_type);
    if (String(body || '').trim()) approved.set(row.section_type, body);
  }
  return approved;
}

/**
 * The copy this document publishes, section by section.
 *
 * @param {Object} input
 * @param {Array<Object>} [input.sections] — the document's stored section records
 * @param {Map<string, string>} [input.copyBodies] — the validated copy's body per
 *   document section type (the generation, or the latest valid edit)
 * @param {boolean} [input.highChannel] — the design's own high-channel state
 * @param {string|null} [input.proposalType] — the report type being published
 * @returns {{ bodies: Map<string, string>, approved: Map<string, string> }}
 */
export function resolvePublicationBodies({
  sections = [],
  copyBodies = new Map(),
  highChannel = false,
  proposalType = null,
} = {}) {
  const approved = approvedCurrentSectionBodies({ sections, highChannel, proposalType });
  const bodies = new Map();
  for (const [sectionType, copyBody] of (copyBodies instanceof Map ? copyBodies : new Map()).entries()) {
    bodies.set(sectionType, approved.get(sectionType) ?? copyBody);
  }
  return { bodies, approved };
}

export default resolvePublicationBodies;