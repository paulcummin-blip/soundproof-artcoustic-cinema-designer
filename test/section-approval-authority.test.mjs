/**
 * section-approval-authority.test.mjs
 * -----------------------------------
 * THE HUMAN APPROVAL OF GENERATED COPY, guarded.
 *
 * The product rule is that no proposal PDF is created until every generated
 * narrative section has been approved by a person. Two things make that rule real,
 * and both are guarded here:
 *
 *   which sections have to be approved — the sections the client reads generated
 *   narrative in, and no others. The cover, the fixed evidence tables, the
 *   equipment schedule and the project's own metadata carry no generated copy, so
 *   they are never counted and can never block an export.
 *
 *   whether an approval still counts — an approval is stored against the exact
 *   wording it was given for, so a section that has been edited, regenerated or
 *   rewritten since is awaiting approval again, automatically, and only that
 *   section. Nothing has to be reset by hand.
 *
 * Finally the export gate itself: a document that passes its evidence check and
 * still has one unapproved section is NOT issuable.
 *
 * Run: node --test test/section-approval-authority.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  APPROVAL_STATUS,
  GENERATED_NARRATIVE_SECTION_TYPES,
  approvalRowForSection,
  approvalStatusByType,
  requiresSectionApproval,
  resolveSectionApproval,
  sectionApprovalFingerprint,
} from '../base44/shared/proposalApproval/sectionApprovalAuthority.js';
import { authorizeProposalExport } from '../base44/shared/proposalEdit/proposalExportAuthorization.js';

/** The stored rows, as the editor holds them. */
const storedSections = () => [
  { id: 's1', section_key: 'k1', section_type: 'system_design_summary', title: 'System Design Summary', body: '<p>Design overview copy.</p>' },
  { id: 's2', section_key: 'k2', section_type: 'dynamic_range', title: 'Dynamic Range', body: '<p>Dynamic range copy.</p>' },
  { id: 's3', section_key: 'k3', section_type: 'cover', title: 'Cover', body: '<p>Cover.</p>' },
  { id: 's4', section_key: 'k4', section_type: 'products', title: 'Equipment', body: '<p>Equipment schedule.</p>' },
];

/** The same sections as the document publishes them (in document order). */
const publishedSections = (stored = storedSections()) => stored.map((section) => ({ ...section }));

/** What an approval records, for a section approved as it stands. */
const approvalFor = (stored, published, sectionId, at = '2026-10-15T10:00:00.000Z', by = 'Paul') => {
  const row = resolveSectionApproval({ sections: stored, publishedSections: published })
    .sections.find((entry) => entry.section_id === sectionId);
  return { status: 'approved', approved_at: at, approved_by: by, fingerprint: row.fingerprint };
};

test('only the sections the client reads generated narrative in have to be approved', () => {
  assert.deepEqual(
    [...GENERATED_NARRATIVE_SECTION_TYPES].sort(),
    ['appendix', 'dynamic_range', 'key_performance_highlights', 'overall_design',
      'presented_options', 'spatial_resolution', 'system_design_summary', 'timbre_matching'],
  );
  const approval = resolveSectionApproval({ sections: storedSections(), publishedSections: publishedSections() });
  const byType = Object.fromEntries(approval.sections.map((row) => [row.section_type, row]));
  assert.equal(byType.system_design_summary.requires_approval, true);
  assert.equal(byType.dynamic_range.requires_approval, true);
  // Factual content carries no generated copy: nothing to read, nothing to approve.
  assert.equal(byType.cover.requires_approval, false);
  assert.equal(byType.products.requires_approval, false);
  assert.equal(byType.cover.status, null);
  assert.equal(approval.required_count, 2);
});

test('a freshly generated document starts with every generated section needing review', () => {
  const approval = resolveSectionApproval({ sections: storedSections(), publishedSections: publishedSections() });
  assert.equal(approval.approved_count, 0);
  assert.equal(approval.all_approved, false);
  assert.equal(approval.sections.every((row) => row.status !== APPROVAL_STATUS.APPROVED), true);
  // In document order, so "review next" opens the first the client would meet.
  assert.deepEqual(approval.awaiting.map((row) => row.section_type), ['system_design_summary', 'dynamic_range']);
  assert.match(approval.block_reason, /still has to be approved/);
});

test('an approval given for this wording counts, and one section does not approve another', () => {
  const stored = storedSections();
  const published = publishedSections(stored);
  stored[0].metadata = { approval: approvalFor(stored, published, 's1') };

  const approval = resolveSectionApproval({ sections: stored, publishedSections: published });
  assert.equal(approvalRowForSection(approval, 's1').status, APPROVAL_STATUS.APPROVED);
  assert.equal(approvalRowForSection(approval, 's2').status, APPROVAL_STATUS.NEEDS_REVIEW);
  assert.equal(approval.approved_count, 1);
  assert.equal(approval.all_approved, false);
  assert.deepEqual(approvalStatusByType(approval), {
    system_design_summary: APPROVAL_STATUS.APPROVED,
    dynamic_range: APPROVAL_STATUS.NEEDS_REVIEW,
  });
});

test('changing the wording of an approved section returns that section, and only that one, to review', () => {
  const stored = storedSections();
  const published = publishedSections(stored);
  stored[0].metadata = { approval: approvalFor(stored, published, 's1') };
  stored[1].metadata = { approval: approvalFor(stored, published, 's2') };
  assert.equal(resolveSectionApproval({ sections: stored, publishedSections: published }).all_approved, true);

  // The published wording the client reads moves on (a copy edit, a rewrite).
  const edited = publishedSections(stored);
  edited[0].body = '<p>Rewritten design overview copy.</p>';

  const approval = resolveSectionApproval({ sections: stored, publishedSections: edited });
  assert.equal(approvalRowForSection(approval, 's1').status, APPROVAL_STATUS.NEEDS_REVIEW);
  assert.equal(approvalRowForSection(approval, 's1').content_changed, true);
  assert.equal(approvalRowForSection(approval, 's2').status, APPROVAL_STATUS.APPROVED);
  assert.equal(approval.approved_count, 1);
  assert.deepEqual(approval.awaiting.map((row) => row.section_type), ['system_design_summary']);
});

test('a manual edit or a regeneration also returns the section to review', () => {
  const stored = storedSections();
  const published = publishedSections(stored);
  stored[0].metadata = { approval: approvalFor(stored, published, 's1') };

  const editedByHand = stored.map((row) => (row.id === 's1'
    ? { ...row, body: '<p>Design overview copy, corrected by hand.</p>', last_user_edited_at: '2026-10-15T11:00:00.000Z' }
    : row));
  assert.equal(
    resolveSectionApproval({ sections: editedByHand, publishedSections: published })
      .sections.find((row) => row.section_id === 's1').status,
    APPROVAL_STATUS.NEEDS_REVIEW,
  );

  const regenerated = stored.map((row) => (row.id === 's1'
    ? { ...row, last_gpt_generated_at: '2026-10-15T12:00:00.000Z' }
    : row));
  assert.equal(
    resolveSectionApproval({ sections: regenerated, publishedSections: published })
      .sections.find((row) => row.section_id === 's1').status,
    APPROVAL_STATUS.NEEDS_REVIEW,
  );
});

test('the fingerprint carries every way the wording can move, and is stable otherwise', () => {
  const base = sectionApprovalFingerprint({ publishedBody: '<p>Same words.</p>', storedBody: '<p>Same words.</p>' });
  assert.equal(base, sectionApprovalFingerprint({ publishedBody: '<p>Same   words.</p>', storedBody: 'Same words.' }));
  assert.notEqual(base, sectionApprovalFingerprint({ publishedBody: '<p>Other words.</p>', storedBody: '<p>Same words.</p>' }));
  assert.notEqual(base, sectionApprovalFingerprint({ publishedBody: '<p>Same words.</p>', storedBody: '<p>Same words.</p>', lastUserEditedAt: '2026-10-15T11:00:00.000Z' }));
});

test('the export is refused while one generated section is unapproved, and allowed once all are', () => {
  const stored = storedSections();
  const published = publishedSections(stored);
  const validation = { valid: true, blocked_reason: null, document_sections: published, generation_id: 'g1', edit_id: null };
  const proposal = { engineering_snapshot: { identity: { projectId: 'p', versionId: 'v' } } };
  const request = { rendered_sections: published, engineering_snapshot: proposal.engineering_snapshot };

  const partial = resolveSectionApproval({ sections: stored, publishedSections: published });
  const refused = authorizeProposalExport({ validation, proposal, request, approval: partial });
  assert.equal(refused.allowed, false);
  assert.equal(refused.reason, partial.block_reason);

  const complete = stored.map((row, index) => (row.id === 's1' || row.id === 's2'
    ? { ...row, metadata: { approval: approvalFor(stored, published, row.id, `2026-10-15T1${index}:00:00.000Z`) } }
    : row));
  const approved = resolveSectionApproval({ sections: complete, publishedSections: published });
  assert.equal(approved.all_approved, true);
  assert.equal(approved.block_reason, null);

  const allowed = authorizeProposalExport({
    validation,
    proposal,
    request: { ...request, rendered_sections: published },
    approval: approved,
  });
  assert.equal(allowed.allowed, true);
});

test('a section with no generated copy is never held to the approval rule', () => {
  assert.equal(requiresSectionApproval({ section_type: 'cover', body: '<p>Cover</p>' }), false);
  assert.equal(requiresSectionApproval({ section_type: 'dynamic_range', body: '<p>Copy</p>', is_enabled: false }), false);
  assert.equal(requiresSectionApproval({ section_type: 'dynamic_range', body: '   ' }), false);
  assert.equal(requiresSectionApproval({ section_type: 'dynamic_range', body: '<p>Copy</p>' }), true);
});