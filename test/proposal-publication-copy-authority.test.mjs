/**
 * proposal-publication-copy-authority.test.mjs
 * -------------------------------------------
 * THE COPY A DOCUMENT PUBLISHES, when a designer edits a section by hand.
 *
 *   npx vitest run test/proposal-publication-copy-authority.test.mjs
 *
 * The generation and its edit history are provenance. Once a designer's own
 * wording has replaced a draft section AND they have approved that wording as it
 * stands, that wording is the copy the client reads — and every publication check
 * has to be made against it, not against the draft it replaced. These fixtures
 * hold that rule in both directions, so it can never be satisfied by simply
 * relaxing an evidence check:
 *
 *   A  an approved hand edit            -> is the copy the document publishes
 *   B  a hand edit nobody approved      -> is still refused, and not published
 *   C  a layout-only change             -> keeps the approval, re-validates clean
 *   D  an unedited section              -> still publishes the validated copy
 *   E  the export gate                  -> allows the approved document
 *   F  wording changed after approval   -> the approval stops counting
 */

import assert from 'node:assert/strict';
import { it } from 'vitest';
import { validateCompleteDocument } from '../base44/shared/proposalEdit/completeDocumentValidation.js';
import { preparedPageSections } from '../base44/shared/proposalEdit/publicationCopyAuthority.js';
import { authorizeProposalExport } from '../base44/shared/proposalEdit/proposalExportAuthorization.js';
import { resolveSectionApproval } from '../base44/shared/proposalApproval/sectionApprovalAuthority.js';
import { completeFixture } from './fixtures/completeDocumentFixtures.mjs';

const EDITED_TYPE = 'overall_design';
const UNEDITED_TYPE = 'timbre_matching';

// The designer's own wording for one section. It states the room's design intent
// and carries no figure, level, product or claim, so nothing about it can be
// mistaken for a rewritten engineering result.
const MANUAL_BODY = '<p>The room reads as one considered space, because the picture, the seating and the loudspeaker positions were resolved together rather than one after another. Nothing sits between the front row and the image, and the space behind the seating is left open so the room breathes around the audience.</p>';

const bodyOf = (validation, sectionType) =>
  validation.document_sections.find(row => row.section_type === sectionType)?.body ?? null;

const plain = (value) => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

/** Replace one section's stored body with the designer's own wording, as a save does. */
function withHandEdit(fixture, body = MANUAL_BODY) {
  return {
    ...fixture,
    sections: fixture.sections.map(section => (section.section_type === EDITED_TYPE
      ? { ...section, body, last_user_edited_at: '2026-10-18T08:30:00Z' }
      : section)),
  };
}

/**
 * Approve every narrative section as it stands — the same resolution the editor
 * and the export gate read, so the fingerprint stored here is the one the app
 * would store.
 */
function approveAsItStands(fixture) {
  const published = preparedPageSections({
    sections: fixture.sections,
    proposalType: fixture.proposal.proposal_type,
  });
  const rows = resolveSectionApproval({ sections: fixture.sections, publishedSections: published }).sections;
  return {
    ...fixture,
    sections: fixture.sections.map((section) => {
      const row = rows.find(entry => entry.section_type === section.section_type);
      if (!row?.requires_approval) return section;
      return {
        ...section,
        metadata: {
          ...(section.metadata || {}),
          approval: {
            status: 'approved',
            approved_at: '2026-10-18T09:00:00Z',
            approved_by: 'Fixture Designer',
            fingerprint: row.fingerprint,
            revision_id: row.revision_id,
            generation_id: row.generation_id,
            edit_id: row.edit_id,
            published_page_fingerprint: row.published_page_fingerprint,
          },
        },
      };
    }),
  };
}

const approvalOf = (fixture) => resolveSectionApproval({
  sections: fixture.sections,
  publishedSections: preparedPageSections({ sections: fixture.sections, proposalType: fixture.proposal.proposal_type }),
});

const exportGate = (fixture, validation, approval) => authorizeProposalExport({
  validation,
  proposal: fixture.proposal,
  approval,
  copy: fixture.generationRecords[0].gpt_output.sections,
  request: {
    export_kind: 'export',
    rendered_sections: validation.document_sections,
    engineering_snapshot: fixture.proposal.engineering_snapshot,
  },
});

// ── A. The approved hand edit is the published copy ─────────────────────────
it('A. an approved hand edit is the copy the document publishes', () => {
  const fixture = approveAsItStands(withHandEdit(completeFixture({ alternatives: false })));
  const validation = validateCompleteDocument(fixture);

  assert.equal(validation.valid, true, 'an approved hand edit must not be blocked by the draft it replaced');
  assert.equal(plain(bodyOf(validation, EDITED_TYPE)), plain(MANUAL_BODY),
    'the published section must be the wording the designer approved');
  assert.equal(validation.errors.some(error => error.code === 'unvalidated_document_text'), false);
  assert.equal(approvalOf(fixture).all_approved, true);
});

// ── B. An unapproved hand edit is still refused ─────────────────────────────
it('B. a hand edit nobody has approved is refused, and the approved copy is what the document publishes', () => {
  const fixture = withHandEdit(completeFixture({ alternatives: false })); // no approval stamped
  const validation = validateCompleteDocument(fixture);
  const codes = validation.errors.map(error => error.code);

  assert.equal(validation.valid, false, 'approval is what makes hand-edited wording publishable');
  assert.ok(codes.includes('unvalidated_document_text'),
    'the section must be reported as wording that is neither the validated copy nor an approved body');
  assert.ok(codes.includes('published_content_missing'),
    'the approved copy is reported as not reaching the page');
  // The wording stays readable in the editor so the designer can review it — the
  // document itself is invalid, so it can never be issued, exported or printed.
  assert.equal(plain(bodyOf(validation, EDITED_TYPE)), plain(MANUAL_BODY));
  assert.equal(approvalOf(fixture).all_approved, false);
  assert.equal(exportGate(fixture, validation, approvalOf(fixture)).allowed, false);
});

// ── C. A layout-only change keeps the approval ──────────────────────────────
it('C. a layout-only change keeps the approval and re-validates clean', () => {
  const approved = approveAsItStands(withHandEdit(completeFixture({ alternatives: false })));
  const relaid = {
    ...approved,
    sections: approved.sections.map(section => ({
      ...section,
      order_index: (section.order_index ?? 0) + 3,
      metadata: { ...(section.metadata || {}), layout: 'relaid' },
    })),
  };

  assert.equal(approvalOf(relaid).all_approved, true,
    'reordering and presentation metadata are not a change of wording');
  assert.equal(validateCompleteDocument(relaid).valid, true);
});

// ── D. An unedited section still publishes the validated copy ───────────────
it('D. a section nobody edited still publishes the validated generation copy', () => {
  const untouched = completeFixture({ alternatives: false });
  const fixture = approveAsItStands(withHandEdit(untouched));
  const validation = validateCompleteDocument(fixture);
  const generationBody = bodyOf(validateCompleteDocument(untouched), UNEDITED_TYPE);

  assert.equal(plain(bodyOf(validation, UNEDITED_TYPE)), plain(generationBody),
    'the generation copy remains the publication copy wherever nobody has edited');
});

// ── E. The export gate allows the approved document ────────────────────────
it('E. the export gate allows the approved document', () => {
  const fixture = approveAsItStands(withHandEdit(completeFixture({ alternatives: false })));
  const validation = validateCompleteDocument(fixture);
  const authorization = exportGate(fixture, validation, approvalOf(fixture));

  assert.equal(authorization.allowed, true, authorization.reason || '');
});

// ── F. Wording changed after approval stops counting ───────────────────────
it('F. wording changed after it was approved stops counting', () => {
  const approved = approveAsItStands(withHandEdit(completeFixture({ alternatives: false })));
  const changedAgain = withHandEdit(approved, `${MANUAL_BODY}<p>The rows were then moved closer to the screen.</p>`);
  const approval = approvalOf(changedAgain);
  const validation = validateCompleteDocument(changedAgain);

  assert.equal(approval.all_approved, false, 'the approval describes wording that is no longer there');
  assert.equal(approval.sections.find(row => row.section_type === EDITED_TYPE)?.content_changed, true);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.map(error => error.code).includes('unvalidated_document_text'));
});