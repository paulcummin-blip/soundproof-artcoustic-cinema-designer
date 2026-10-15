/**
 * sectionApprovalAuthority.js (shared)
 * ------------------------------------
 * THE HUMAN APPROVAL OF GENERATED COPY.
 *
 * Evidence validation asks whether the document's own material holds. This asks a
 * different question, and it is deliberately a different one: has a person read
 * the generated wording of THIS section and accepted it? A copy that passed every
 * validator is not approved. Approval is a decision, taken once, per section, and
 * it is never inferred from a generation, a preview, an opened section, a passed
 * check or a click on Next.
 *
 * An approval is stored against the EXACT wording that was on screen when it was
 * given. The fingerprint below covers the section's published body, its stored
 * body, and the two timestamps that move when either is rewritten. When any of
 * them changes the stored approval no longer matches, so that section — and only
 * that section — is awaiting approval again. Nothing is re-read, unflagged or
 * reset by hand, and an approval can never carry onto wording nobody read.
 *
 * Which sections need approval is decided from the document itself: a section
 * needs it when the client will read generated narrative there. Factual content —
 * the cover, the fixed evidence tables, drawings, the equipment schedule, the
 * project's own metadata — carries no generated copy to approve and is never
 * counted, so the count the editor shows is only ever "sections to read".
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

import { PROPOSAL_SECTION_FOR_WRITER_SECTION } from '../proposalWriter/writerSectionMapping.js';

/** The two states a generated section can be in. */
export const APPROVAL_STATUS = Object.freeze({
  APPROVED: 'approved',
  NEEDS_REVIEW: 'needs_review',
});

/**
 * The document sections that carry generated client narrative: exactly the
 * sections the approved writer's own sections are published into. It is read from
 * the one boundary that already puts the two together, so a new writer section
 * is covered here without a second list to keep in step.
 */
export const GENERATED_NARRATIVE_SECTION_TYPES = Object.freeze(
  [...new Set(Object.values(PROPOSAL_SECTION_FOR_WRITER_SECTION))].sort(),
);

const ENTITIES = { nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' };

/** The words a reader would see, whichever form the wording is stored in. */
export function approvalPlainText(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code) => String.fromCodePoint(
      Math.min(0x10ffff, code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code)),
    ))
    .replace(/&(nbsp|amp|quot|apos|lt|gt);/gi, (_, name) => ENTITIES[name.toLowerCase()])
    .replace(/\s+/g, ' ')
    .trim();
}

/** A stable 32-bit content digest, so two readings of the same wording agree. */
function contentDigest(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * The fingerprint of the content a designer approved.
 *
 * All four parts are included because between them they carry every way this
 * section's wording can change: the published body is the wording the client
 * reads and the PDF prints, the stored body is the wording the editor shows, and
 * the two timestamps are stamped by a hand edit and by a regeneration.
 *
 * @param {Object} input
 * @returns {string} the fingerprint to store, and to compare against later
 */
export function sectionApprovalFingerprint({
  publishedBody = '',
  storedBody = '',
  lastUserEditedAt = null,
  lastGptGeneratedAt = null,
} = {}) {
  return contentDigest([
    approvalPlainText(publishedBody),
    approvalPlainText(storedBody),
    String(lastUserEditedAt || ''),
    String(lastGptGeneratedAt || ''),
  ].join('\u0000'));
}

/**
 * Whether the client will read generated narrative in this section, and so
 * whether it has to be approved before the document may be issued.
 */
export function requiresSectionApproval(section) {
  if (!section || section.is_enabled === false) return false;
  if (!GENERATED_NARRATIVE_SECTION_TYPES.includes(section.section_type)) return false;
  return approvalPlainText(section.body).length > 0;
}

/**
 * The approval state of one document, from the sections as they stand.
 *
 * @param {Object} input
 * @param {Array<Object>} [input.sections] — the stored ProposalSection records
 * @param {Array<Object>} [input.publishedSections] — the document's own published
 *   sections (the bodies the PDF prints), in document order
 * @returns {Object} the approval state the editor renders and the export gate reads
 */
export function resolveSectionApproval({ sections = [], publishedSections = [] } = {}) {
  const stored = Array.isArray(sections) ? sections : [];
  const storedById = new Map(stored.filter((row) => row?.id).map((row) => [row.id, row]));
  const storedByType = new Map(stored.filter((row) => row?.section_type).map((row) => [row.section_type, row]));

  const document = (Array.isArray(publishedSections) && publishedSections.length > 0 ? publishedSections : stored);

  const rows = document.map((published, index) => {
    const record = storedById.get(published?.id) || storedByType.get(published?.section_type) || null;
    const approval = record?.metadata?.approval || null;
    const fingerprint = sectionApprovalFingerprint({
      publishedBody: published?.body ?? record?.body ?? '',
      storedBody: record?.body ?? '',
      lastUserEditedAt: record?.last_user_edited_at ?? null,
      lastGptGeneratedAt: record?.last_gpt_generated_at ?? null,
    });
    const required = requiresSectionApproval(published);
    // An approval counts only while it still describes this section's wording.
    const approved = approval?.status === APPROVAL_STATUS.APPROVED && approval.fingerprint === fingerprint;
    return {
      section_id: record?.id ?? published?.id ?? null,
      section_key: record?.section_key ?? published?.section_key ?? null,
      section_type: published?.section_type ?? record?.section_type ?? null,
      title: published?.title || record?.title || null,
      order: index,
      requires_approval: required,
      status: required ? (approved ? APPROVAL_STATUS.APPROVED : APPROVAL_STATUS.NEEDS_REVIEW) : null,
      approved_at: approved ? (approval.approved_at ?? null) : null,
      approved_by: approved ? (approval.approved_by ?? null) : null,
      approved_fingerprint: approval?.fingerprint ?? null,
      fingerprint,
      // An approval that no longer matches: the section was changed after it was
      // approved, so it is awaiting approval again.
      content_changed: Boolean(approval) && !approved,
    };
  });

  const required = rows.filter((row) => row.requires_approval);
  const awaiting = required.filter((row) => row.status !== APPROVAL_STATUS.APPROVED);

  return {
    sections: rows,
    required_count: required.length,
    approved_count: required.length - awaiting.length,
    all_approved: awaiting.length === 0,
    awaiting: awaiting.map((row) => ({
      section_id: row.section_id,
      section_key: row.section_key,
      section_type: row.section_type,
      title: row.title,
      status: row.status,
    })),
    block_reason: awaiting.length === 0
      ? null
      : (awaiting.length === 1
        ? 'One generated section still has to be approved before the PDF can be issued.'
        : `${awaiting.length} generated sections still have to be approved before the PDF can be issued.`),
  };
}

/** The section_type → status map the editor's section list renders from. */
export function approvalStatusByType(approval) {
  const map = {};
  for (const row of approval?.sections || []) {
    if (row.status) map[row.section_type] = row.status;
  }
  return map;
}

/** The approval row for one stored section, or null. */
export function approvalRowForSection(approval, sectionId) {
  return (approval?.sections || []).find((row) => row.section_id === sectionId) || null;
}

export default resolveSectionApproval;