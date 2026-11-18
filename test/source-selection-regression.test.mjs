import { test } from 'vitest';
import assert from 'node:assert/strict';
import { resolvePublicationBodies } from '../base44/shared/proposalEdit/publicationCopyAuthority.js';
import {
  composeWriterSectionBodies,
  writerDraftsFromProposalSectionBody,
  PROPOSAL_SECTION_FOR_WRITER_SECTION,
} from '../base44/shared/proposalWriter/writerSectionMapping.js';
import { resolveSectionApproval, sectionApprovalFingerprint } from '../base44/shared/proposalApproval/sectionApprovalAuthority.js';

// ── Source-selection regression tests for the editor field seeding ────────
//
// The editor fields use writer contract IDs (decision_summary, what_stays_same,
// what_changes, etc.). The stored sections use document section types
// (system_design_summary, etc.). The mapping between the two is handled by the
// shared section mapping module, which parses the structured <h2> headings.
//
// These tests verify:
// 1. An APPROVED stored body overrides the validated copy (the designer's
//    approved manual revision is what the editor opens).
// 2. An UNAPPROVED stored body does NOT override the validated copy (a stale
//    raw body never replaces the latest valid edit).
// 3. The structured heading parser correctly splits the opening section
//    (which carries three writer sections) back into its parts.
// 4. A manually edited body that breaks the heading structure falls back to
//    the validated copy (the editor is never broken).

// Writer-section copy as the editor layer builds it (plain text).
const WRITER_COPY = [
  { section: 'decision_summary', text: 'This cinema is designed around a 75-inch TV for daily viewing.', claim_ids: ['claim_1'] },
  { section: 'what_stays_same', text: 'The system uses a 7.1.4 layout with Artcoustic loudspeakers throughout.', claim_ids: ['claim_2'] },
  { section: 'what_changes', text: 'A fabric screen wall conceals the front subwoofers.', claim_ids: ['claim_3'] },
  { section: 'key_performance_highlights', text: 'The design delivers strong bass output and even tonal balance.', claim_ids: ['claim_4'] },
  { section: 'spatial_resolution', text: 'Sound is placed precisely where the action is on screen.', claim_ids: ['claim_5'] },
  { section: 'dynamic_range', text: 'The system has headroom for demanding film soundtracks.', claim_ids: ['claim_6'] },
  { section: 'timbre_matching', text: 'Voices keep a familiar tonal character as the soundtrack develops.', claim_ids: ['claim_7'] },
  { section: 'overall_design', text: 'The design suits this particular cinema and what it gives the client.', claim_ids: ['claim_8'] },
];

// Build the document-section HTML bodies from the writer copy.
const composed = composeWriterSectionBodies({
  output: { sections: WRITER_COPY },
  mode: 'single',
});
const copyBodies = new Map();
for (const entry of composed.bodies || []) {
  if (entry?.section_type && typeof entry.html === 'string') {
    copyBodies.set(entry.section_type, entry.html);
  }
}

// The opening section carries three writer sections under <h2> headings.
test('the opening section carries three writer sections under structured headings', () => {
  const opening = copyBodies.get('system_design_summary');
  assert.ok(opening, 'system_design_summary body exists');
  assert.match(opening, /<h2[^>]*>Design Summary<\/h2>/i, 'carries the Design Summary heading');
  assert.match(opening, /<h2[^>]*>Design Overview<\/h2>/i, 'carries the Design Overview heading');
  assert.match(opening, /<h2[^>]*>Why This Specification<\/h2>/i, 'carries the Why This Specification heading');
});

// ── Scenario 1: APPROVED stored body overrides the validated copy ─────────
test('an approved stored body overrides the validated copy', () => {
  // The designer manually revised the opening section and approved it.
  const approvedBody = '<p>This is the designer\'s approved manual revision of the opening section.</p>';
  const fingerprint = sectionApprovalFingerprint({
    publishedBody: approvedBody,
    storedBody: approvedBody,
  });
  const storedSections = [
    {
      section_type: 'system_design_summary',
      body: approvedBody,
      is_enabled: true,
      metadata: {
        approval: {
          status: 'approved',
          approved_at: '2026-11-18T00:00:00Z',
          approved_by: 'designer@test.com',
          fingerprint,
        },
      },
    },
  ];

  const { bodies, approved } = resolvePublicationBodies({
    sections: storedSections,
    copyBodies,
  });

  // The approved body should be used, not the copy body.
  assert.equal(bodies.get('system_design_summary'), approvedBody,
    'approved stored body overrides the validated copy');
  assert.ok(approved.has('system_design_summary'),
    'the section is in the approved map');
});

// ── Scenario 2: UNAPPROVED stored body does NOT override ───────────────────
test('an unapproved stored body does not override the validated copy', () => {
  // The designer manually revised the opening section but did NOT approve it.
  const unapprovedBody = '<p>This is the designer\'s unapproved manual revision.</p>';
  const storedSections = [
    {
      section_type: 'system_design_summary',
      body: unapprovedBody,
      is_enabled: true,
      // No approval metadata — the section is not approved.
    },
  ];

  const { bodies, approved } = resolvePublicationBodies({
    sections: storedSections,
    copyBodies,
  });

  // The validated copy should be used, not the unapproved stored body.
  assert.notEqual(bodies.get('system_design_summary'), unapprovedBody,
    'unapproved stored body does not override the validated copy');
  assert.equal(approved.size, 0,
    'no sections are approved');
  // The copy body should be the fallback.
  assert.ok(bodies.has('system_design_summary'),
    'the copy body is the fallback');
});

// ── Scenario 3: Structured heading parser recovers writer drafts ──────────
test('the heading parser recovers writer drafts from a publication body', () => {
  const opening = copyBodies.get('system_design_summary');
  const drafts = writerDraftsFromProposalSectionBody({
    sectionType: 'system_design_summary',
    body: opening,
    mode: 'single',
  });

  assert.ok(drafts.decision_summary, 'decision_summary draft recovered');
  assert.match(drafts.decision_summary, /75-inch TV/i, 'decision_summary text is correct');
  assert.ok(drafts.what_stays_same, 'what_stays_same draft recovered');
  assert.match(drafts.what_stays_same, /7\.1\.4/i, 'what_stays_same text is correct');
  assert.ok(drafts.what_changes, 'what_changes draft recovered');
  assert.match(drafts.what_changes, /fabric screen wall/i, 'what_changes text is correct');
});

// ── Scenario 4: A broken heading structure falls back gracefully ──────────
test('a manually edited body with broken headings falls back to the copy', () => {
  // The designer removed the <h2> headings from the opening section.
  const brokenBody = '<p>This opening section has no headings anymore.</p>';
  const fingerprint = sectionApprovalFingerprint({
    publishedBody: brokenBody,
    storedBody: brokenBody,
  });
  const storedSections = [
    {
      section_type: 'system_design_summary',
      body: brokenBody,
      is_enabled: true,
      metadata: {
        approval: {
          status: 'approved',
          approved_at: '2026-11-18T00:00:00Z',
          approved_by: 'designer@test.com',
          fingerprint,
        },
      },
    },
  ];

  const { bodies } = resolvePublicationBodies({
    sections: storedSections,
    copyBodies,
  });

  // The approved body is used for the publication, but the heading parser
  // would throw on it. The readProposalEditLayer catches that and falls back
  // to the copy body. Here we verify the parser does throw, so the fallback
  // path is the correct one.
  assert.equal(bodies.get('system_design_summary'), brokenBody,
    'the approved broken body is in the publication bodies');

  assert.throws(
    () => writerDraftsFromProposalSectionBody({
      sectionType: 'system_design_summary',
      body: brokenBody,
      mode: 'single',
    }),
    /missing the validated heading/,
    'the parser throws on a broken heading structure',
  );
});

// ── Scenario 5: A single-writer section round-trips correctly ─────────────
test('a single-writer section round-trips through publication and parsing', () => {
  const dynamicRange = copyBodies.get('dynamic_range');
  assert.ok(dynamicRange, 'dynamic_range body exists');

  const drafts = writerDraftsFromProposalSectionBody({
    sectionType: 'dynamic_range',
    body: dynamicRange,
    mode: 'single',
  });

  assert.ok(drafts.dynamic_range, 'dynamic_range draft recovered');
  assert.match(drafts.dynamic_range, /headroom/i, 'dynamic_range text is correct');
});

// ── Scenario 6: The proposal section for writer section mapping ──────────
test('the writer-to-document-section mapping is correct', () => {
  assert.equal(PROPOSAL_SECTION_FOR_WRITER_SECTION.decision_summary, 'system_design_summary');
  assert.equal(PROPOSAL_SECTION_FOR_WRITER_SECTION.what_stays_same, 'system_design_summary');
  assert.equal(PROPOSAL_SECTION_FOR_WRITER_SECTION.what_changes, 'system_design_summary');
  assert.equal(PROPOSAL_SECTION_FOR_WRITER_SECTION.key_performance_highlights, 'key_performance_highlights');
  assert.equal(PROPOSAL_SECTION_FOR_WRITER_SECTION.spatial_resolution, 'spatial_resolution');
  assert.equal(PROPOSAL_SECTION_FOR_WRITER_SECTION.dynamic_range, 'dynamic_range');
  assert.equal(PROPOSAL_SECTION_FOR_WRITER_SECTION.timbre_matching, 'timbre_matching');
  assert.equal(PROPOSAL_SECTION_FOR_WRITER_SECTION.overall_design, 'overall_design');
});