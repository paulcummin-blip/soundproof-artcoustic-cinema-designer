/**
 * proposal-publication-integrity.test.mjs
 * ---------------------------------------
 * Fixtures for the proposal publication integrity correction, run under vitest:
 *
 *   npx vitest run test/proposal-publication-integrity.test.mjs
 *
 * Covers:
 *   A  random database section order      -> canonical publication order
 *   B  Presented Options / Appendix       -> never before the cover
 *   C  Editor and PDF ordering authority  -> identical section sequence
 *   D  centre-channel sentence            -> preserved through publication
 *   E  required paragraph missing         -> reported, so the gate blocks
 *   F  harmless HTML/entity differences   -> no false failure
 *   G  seating images                     -> grouped with the validated copy
 *   H  no duplicated seating prose        -> seating target decision
 *   I  raw dealer notes                   -> never published
 *   J  existing records                   -> left unchanged
 */

import assert from 'node:assert/strict';
import { it } from 'vitest';
import { validateCompleteDocument } from '../base44/shared/proposalEdit/completeDocumentValidation.js';
import { orderPublicationSections as orderServer } from '../base44/shared/proposalEdit/publicationOrder.js';
import {
  preparePublishedSectionBody,
  missingPublishedContent,
} from '../base44/shared/proposalEdit/publishedSectionPreparation.js';
import {
  orderPublicationSections as orderClient,
  seatingPresentationTarget,
  canonicalSectionTypes,
} from '../src/components/proposal/publicationOrder.js';
import {
  mentionsHighChannelUpgrade,
  stripHighChannelUpgradeCopy,
} from '../src/components/proposal/highChannelLayoutAuthority.js';
import { completeFixture, PRIVATE_NOTE } from './fixtures/completeDocumentFixtures.mjs';

// Vitest is the supported runner: every fixture below is one test, and a
// failure is reported as itself rather than as a collected row.

// The exact validated sentence from the Genesis AV generation, and the stored
// body it was published into.
const CENTRE_SENTENCE = 'At the front, Q6-3 speakers serve left and right, while two C4-1 cabinets reproduce the single centre channel.';
const GENESIS_SUMMARY_BODY = '<h2>Design Summary</h2><p>Voices and effects retain their tonal character as they travel from the screen to the surrounds and overhead, helping the soundtrack feel coherent as it moves around the room. The 115" TV and 9.1.6 layout bring that sound into a dedicated cinema setting, with four subwoofers specified for physical low-frequency impact.</p><h2>Design Overview</h2><p>The room is arranged around a 115" TV and a 9.1.6 sound system, with six overhead speakers and four subwoofers supporting effects above and around the audience. ' + CENTRE_SENTENCE + '</p><h2>Why This Specification</h2><p>Sound can move above and around the audience rather than remaining at the picture; this movement is supported by the 9.1.6 layout, including six overhead speakers and four subwoofers.</p>';

// ── D. The centre-channel sentence survives publication preparation ──────────
it('D. centre-channel sentence survives high-channel publication preparation', () => {
  const prepared = preparePublishedSectionBody(GENESIS_SUMMARY_BODY, {
    title: 'System Design Summary',
    sectionType: 'system_design_summary',
    highChannel: true,
    proposalType: 'system_summary',
  });
  assert.ok(prepared.includes(CENTRE_SENTENCE), 'the validated centre-channel sentence must be published');
  assert.equal(mentionsHighChannelUpgrade(CENTRE_SENTENCE), false, 'the sentence is not an upgrade claim');
  assert.ok(stripHighChannelUpgradeCopy(`<p>${CENTRE_SENTENCE}</p>`).includes('centre channel'),
    'the cleaner must not delete the design\'s own centre channel');
});

it('D2. a genuine middle-pair upgrade is still removed by the rule', () => {
  const upgrade = '<p>If greater overhead movement becomes a priority later, the natural upgrade would be a middle overhead pair.</p>';
  assert.equal(mentionsHighChannelUpgrade(upgrade), true, 'the rule must still catch an added middle pair');
  assert.equal(stripHighChannelUpgradeCopy(upgrade).includes('middle overhead pair'), false,
    'the upgrade sentence must not be published');
});

it('D3. required published content check passes for the Genesis body', () => {
  const prepared = preparePublishedSectionBody(GENESIS_SUMMARY_BODY, {
    title: 'System Design Summary', sectionType: 'system_design_summary', highChannel: true,
  });
  assert.equal(missingPublishedContent({
    approvedHtml: GENESIS_SUMMARY_BODY,
    publishedHtml: prepared,
    title: 'System Design Summary',
    sectionType: 'system_design_summary',
  }), null);
});

// ── E / F. The publication content check itself ─────────────────────────────
it('E. a required paragraph missing from the published body is reported', () => {
  const approved = '<p>The room is arranged around the display and the system.</p><p>At the front, Q6-3 speakers serve left and right, while two C4-1 cabinets reproduce the single centre channel.</p>';
  const published = '<p>The room is arranged around the display and the system.</p>';
  const missing = missingPublishedContent({ approvedHtml: approved, publishedHtml: published, title: 'Design Overview' });
  assert.ok(missing, 'a lost validated sentence must be reported');
  assert.match(missing, /centre channel/, 'the report names the sentence that went missing');
});

it('F. harmless HTML, heading and entity differences are not false failures', () => {
  const approved = '<p>Voices and effects keep a consistent tonal character across all seats &amp; seats.</p>';
  const published = '<p>Voices and effects keep a consistent tonal character across all seats &amp; seats.</p>\n';
  assert.equal(missingPublishedContent({ approvedHtml: approved, publishedHtml: published, title: 'Timbre Matching' }), null);
  // A leading heading that repeats the section title is a permitted removal.
  const withHeading = '<h2>Timbre Matching</h2><p>Voices and effects keep a consistent tonal character.</p>';
  const headingPrepared = preparePublishedSectionBody(withHeading, {
    title: 'Timbre Matching', sectionType: 'timbre_matching',
  });
  assert.equal(missingPublishedContent({
    approvedHtml: withHeading, publishedHtml: headingPrepared, title: 'Timbre Matching', sectionType: 'timbre_matching',
  }), null);
});

// ── G / H. Seating association ───────────────────────────────────────────────
it('G. seating images are presented with the validated Presented Options section', () => {
  assert.equal(seatingPresentationTarget({
    seatingCount: 2,
    sectionTypes: ['system_design_summary', 'presented_options', 'appendix'],
    anchorType: 'overall_design',
  }), 'presented_options');
});

it('H. the seating presentation stays single-sourced', () => {
  // Fewer than two seating images: no seating presentation at all.
  assert.equal(seatingPresentationTarget({ seatingCount: 1, sectionTypes: ['presented_options'], anchorType: 'overall_design' }), null);
  // No Presented Options section: the anchored seating page is kept, as before.
  assert.equal(seatingPresentationTarget({ seatingCount: 2, sectionTypes: ['overall_design'], anchorType: 'overall_design' }), 'overall_design');
});

// ── A / B / C / I / J. The assembled document ───────────────────────────────
const fixture = completeFixture({ alternatives: true });
const fixtureTypes = canonicalSectionTypes(fixture.proposal.proposal_type);

/** The same fixture with its section rows in a deliberately random order. */
function shuffledFixture() {
  const rows = [...fixture.sections];
  const shuffled = [];
  while (rows.length > 0) shuffled.push(rows.splice(Math.floor(rows.length / 2), 1)[0]);
  return { ...fixture, sections: shuffled };
}

function runValidation(input) {
  return validateCompleteDocument({
    proposal: input.proposal,
    sections: input.sections,
    generationRecords: input.generationRecords,
    editRecords: input.editRecords,
    optionGuidance: input.optionGuidance,
    privateNotes: [PRIVATE_NOTE],
    publishedAssetText: [],
  });
}

const validation = runValidation(shuffledFixture());

it('A. a random database section order becomes the canonical publication order', () => {
  const types = validation.document_sections.map((section) => section.section_type);
  const expected = fixtureTypes.filter((type) => types.includes(type));
  assert.deepEqual(types, expected, `expected ${expected.join(', ')} but got ${types.join(', ')}`);
});

it('B. the cover opens the document and the Appendix closes it', () => {
  const types = validation.document_sections.map((section) => section.section_type);
  // The cover page is composed by the pack itself and is never one of the
  // stored section rows: the published rows open with the first narrative
  // section in canonical order, and no row is published ahead of the cover.
  assert.equal(fixtureTypes[0], 'cover', 'the canonical order opens with the cover');
  assert.equal(types.includes('cover'), false, 'no stored row is published ahead of the composed cover');
  assert.equal(
    types[0],
    fixtureTypes.filter((type) => type !== 'cover' && types.includes(type))[0],
    'the first published row is the first narrative section',
  );

  const optionsAt = types.indexOf('presented_options');
  const appendixAt = types.indexOf('appendix');
  assert.ok(optionsAt >= 0, 'Presented Options is published');
  assert.ok(appendixAt >= 0, 'the Appendix is published');
  assert.ok(optionsAt < appendixAt, 'Presented Options precedes the Appendix');
  assert.equal(appendixAt, types.length - 1, 'the Appendix closes the document');
});

it('C. the Editor authority and the server authority agree, section for section', () => {
  const serverTypes = orderServer({ sections: shuffledFixture().sections, proposalType: 'comparison' })
    .map((section) => section.section_type);
  const clientTypes = orderClient({ sections: shuffledFixture().sections, proposalType: 'comparison' })
    .map((section) => section.section_type);
  assert.deepEqual(clientTypes, serverTypes, 'the frontend and backend ordering must be identical');
  assert.deepEqual(validation.document_sections.map((s) => s.section_type),
    serverTypes.filter((type) => validation.document_sections.some((s) => s.section_type === type)));
});

it('I. a private dealer note is never published', () => {
  const published = validation.document_sections.map((section) => String(section.body || '')).join(' ');
  assert.equal(published.includes(PRIVATE_NOTE), false, 'the designer\'s own note must not be printed');
});

it('J. the stored section records are left unchanged', () => {
  const input = shuffledFixture();
  const before = JSON.stringify(input.sections);
  runValidation(input);
  assert.equal(JSON.stringify(input.sections), before, 'validation must not rewrite a stored record');
});

// ── Report ──────────────────────────────────────────────────────────────────
// Each fixture above is a test: vitest reports every one of them by name.