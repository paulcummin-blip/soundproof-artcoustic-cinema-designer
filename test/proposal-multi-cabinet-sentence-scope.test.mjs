// proposal-multi-cabinet-sentence-scope.test.mjs
// ---------------------------------------------------------------------------
// ACCEPTANCE — the multi-cabinet arrangement rule, read sentence by sentence.
//
// The confirmed defect: the rule joined a sentence with the sentence after it
// BEFORE testing the channel description, and the count reader let ANY mention of
// the surround or overhead layer in that joined text blank the centre's own
// channel count. A correct centre description therefore failed as soon as the
// document continued onto another layer's subject — which is exactly what mapping
// a draft into the document's own sections does, so the SAME copy passed as a
// writer draft and failed as a published page.
//
// The copy under test is the live Genesis wording (proposal
// 6acc9617cdc0dcd3d09ae9c4, version 6ac7a189d093a8d8a68eec91), verbatim. Nothing
// here writes: the fixture is built in memory and the live records were only read.
//
//   A  the correct centre wording passes in the draft AND on the published page
//   B  the centre sentence alone passes
//   C  the centre sentence followed by another layer's sentence passes
//   D  the complete merged System Design Summary passes
//   E  the final prepared publication content passes
//   F  a wrong cabinet count still fails
//   G  two independent centre channels still fail
//   H  a contradiction elsewhere in the document is still detected
//   I  a single-cabinet design is unaffected
//   J  comparison attribution is preserved
//   K  draft and publication agree, on acceptance and on rejection
// ---------------------------------------------------------------------------
import { test } from 'vitest';
import assert from 'node:assert/strict';

import { writer12Fixture } from './fixtures/proposalWriter12Fixtures.mjs';
import { multiCabinetChannelViolations } from '../base44/shared/proposalWriter/writerMultiCabinetRules.js';
import { validateWriterOutput } from '../base44/shared/proposalWriter/writerOutputValidator.js';
import { validateCompleteDocument } from '../base44/shared/proposalEdit/completeDocumentValidation.js';
import {
  plainTextOf,
  preparePublishedSectionBody,
} from '../base44/shared/proposalEdit/publishedSectionPreparation.js';
import { composeWriterSectionBodies } from '../base44/shared/proposalWriter/writerSectionMapping.js';

/** The live centre wording: the description that was falsely refused. */
const CENTRE_SENTENCE =
  'At the front, the left and right channels use Q6-3; the centre channel uses two C4-1 cabinets working together as one audio channel.';

/** The live sentence that follows it on the published page — about other layers. */
const FOLLOWING_SENTENCE =
  'As voices and effects move between the screen, surround and overhead channels, their tonal character remains consistent across all eight assessed seating positions.';

/** The published System Design Summary as the client reads it (verbatim). */
const PUBLISHED_SUMMARY_HTML = '<h2>Design Summary</h2>'
  + '<p>Voices and effects retain their tonal character as sound travels from the screen to the surround and overhead channels, keeping changes in direction natural to follow. The 115" TV and 9.1.6 layout bring that sound into a cinema with two seating rows, while four subwoofers provide the specified low-frequency authority.</p>'
  + `<h2>Design Overview</h2><p>${CENTRE_SENTENCE}</p>`
  + `<h2>Why This Specification</h2><p>${FOLLOWING_SENTENCE}</p>`;

const OMITTED = 'required_arrangement_not_described';
const MULTIPLIED = 'physical_cabinets_described_as_multiple_channels';
const COUNT = 'cabinet_count_contradicts_the_frozen_specification';

/** The arrangement of the draft, stated in the writer's own sections. */
function describeInSections(text, section = 'what_stays_same') {
  const fixture = writer12Fixture();
  const row = fixture.output.sections.find((entry) => entry.section === section);
  row.text = text;
  return fixture;
}

/** The proposal's own sections as the document composes them, from the draft. */
function publicationSections(fixture) {
  return composeWriterSectionBodies({ output: fixture.output, mode: fixture.pack.mode }).bodies
    .map((body, index) => ({
      id: `section-${index}`,
      section_type: body.section_type,
      title: body.section_type,
      body: body.html,
      is_enabled: true,
      order_index: index,
    }));
}

/**
 * The Genesis arrangement as the live proposal holds it: the approved copy in the
 * writer's own sections, with the claims the writer cited for the paragraph that
 * asserts a result, and the document's sections composed from that draft.
 */
function genesisArrangement() {
  const fixture = writer12Fixture();
  const row = (section) => fixture.output.sections.find((entry) => entry.section === section);
  const claims = fixture.input.allowed_claims
    .filter((claim) => ['shared_result', 'credibility'].includes(claim.kind))
    .map((claim) => claim.claim_id);
  row('what_stays_same').text = CENTRE_SENTENCE;
  row('what_changes').text = FOLLOWING_SENTENCE;
  row('what_changes').claim_ids = claims;
  fixture.sections = publicationSections(fixture);
  return fixture;
}

/** The rows the complete-document check itself validates: one row per section. */
function publicationRows(html, sectionType = 'system_design_summary', title = 'System Design Summary') {
  return [{
    section: sectionType,
    text: plainTextOf(preparePublishedSectionBody(html, { title, sectionType, proposalType: 'system_summary' })),
  }];
}

const details = (input, sections) => multiCabinetChannelViolations({ input, sections }).map((v) => v.detail);
const codes = (input, sections) => multiCabinetChannelViolations({ input, sections }).map((v) => v.code);

/* ── A · the live arrangement passes in the draft and on the published page ── */

test('A. the Genesis centre description passes as a draft and as a published page', () => {
  const fixture = genesisArrangement();
  const requirement = fixture.input.multi_cabinet_channels.required[0];
  assert.equal(requirement.cabinets, 2, 'the frozen evidence states two centre cabinets');
  assert.equal(requirement.channels, 1, 'and one logical centre channel');

  // The draft the writer returned: the arrangement is stated, and no arrangement
  // rejection of any kind is filed against it.
  assert.deepEqual(details(fixture.input, fixture.output.sections), [], 'the draft states the arrangement');
  assert.deepEqual(
    validateWriterOutput({ input: fixture.input, output: fixture.output }).violations
      .filter((violation) => violation.code === 'multi_cabinet_channel'),
    [],
    'the writer no longer refuses the correct centre description',
  );

  // The document the client reads, through the gate that decides issue. Whatever
  // else that gate reports about this fixture's invented copy (the shared fixture
  // holds repeated sentences and an empty claim inventory of its own, which are
  // pre-existing and unrelated), it no longer reports the arrangement as
  // undescribed — which is the defect this fix is about.
  const complete = validateCompleteDocument(fixture);
  assert.deepEqual(
    complete.errors.filter((error) => error.code === 'multi_cabinet_channel'),
    [],
    'the complete-document gate accepts the correct centre description',
  );
});

/* ── B · the sentence alone ────────────────────────────────────────────────── */

test('B. the centre sentence alone passes', () => {
  const fixture = genesisArrangement();
  assert.deepEqual(details(fixture.input, publicationRows(`<p>${CENTRE_SENTENCE}</p>`)), []);
});

/* ── C · the centre sentence with another layer's sentence after it ────────── */

test('C. a following surround or overhead sentence cannot invalidate the centre arrangement', () => {
  const fixture = genesisArrangement();

  // One row, both sentences: the exact adjacency that produced the false failure.
  assert.deepEqual(details(fixture.input, publicationRows(`<p>${CENTRE_SENTENCE} ${FOLLOWING_SENTENCE}</p>`)), []);

  // A follow-on sentence that carries its OWN counts for another layer cannot
  // have those counts attributed to the centre.
  const otherLayer = `${CENTRE_SENTENCE} The four surround cabinets reproduce two surround channels.`;
  assert.deepEqual(codes(fixture.input, publicationRows(`<p>${otherLayer}</p>`)), []);
  const heightLayer = `${CENTRE_SENTENCE} Six height cabinets reproduce three height channels.`;
  assert.deepEqual(codes(fixture.input, publicationRows(`<p>${heightLayer}</p>`)), []);
});

/* ── D and E · the merged document and the prepared publication ───────────── */

test('D. the complete merged System Design Summary passes', () => {
  const fixture = genesisArrangement();
  assert.deepEqual(details(fixture.input, publicationRows(PUBLISHED_SUMMARY_HTML)), []);
});

test('E. the final prepared publication content passes', () => {
  const fixture = genesisArrangement();
  const published = fixture.sections
    .filter((section) => section.is_enabled !== false)
    .map((section) => ({
      section: section.section_type,
      text: plainTextOf(preparePublishedSectionBody(section.body, {
        title: section.title, sectionType: section.section_type, proposalType: 'system_summary',
      })),
    }));
  assert.deepEqual(details(fixture.input, published), []);
});

/* ── F and G · the checks that must NOT soften ─────────────────────────────── */

test('F. a cabinet count the frozen evidence does not place still fails', () => {
  const fixture = genesisArrangement();
  const wrong = 'At the front, the centre channel uses three C4-1 cabinets working together as one audio channel.';
  const violations = multiCabinetChannelViolations({
    input: fixture.input,
    sections: publicationRows(`<p>${wrong}</p>`),
  });
  assert.ok(violations.some((v) => v.detail.startsWith(COUNT)), JSON.stringify(violations));
  assert.equal(validateWriterOutput({
    input: fixture.input,
    output: describeInSections(wrong).output,
  }).valid, false);
});

test('G. cabinets written as independent centre channels still fail', () => {
  const fixture = genesisArrangement();
  for (const wrong of [
    'The centre channel is built from two C4-1 cabinets reproducing two independent centre channels.',
    'The centre uses two cabinets fed from two discrete centre channels.',
  ]) {
    const violations = multiCabinetChannelViolations({
      input: fixture.input,
      sections: publicationRows(`<p>${wrong}</p>`),
    });
    assert.ok(violations.some((v) => v.detail.startsWith(MULTIPLIED)), wrong);
  }
});

/* ── H · a contradiction elsewhere is never concealed ─────────────────────── */

test('H. a correct sentence never conceals a contradiction stated elsewhere', () => {
  const fixture = genesisArrangement();
  const contradicting = fixture.output.sections.find((entry) => entry.section === 'what_changes');
  contradicting.text = 'The centre uses two independent centre channels.';
  contradicting.claim_ids = [];

  const draft = multiCabinetChannelViolations({ input: fixture.input, sections: fixture.output.sections });
  assert.ok(draft.some((v) => v.detail.startsWith(MULTIPLIED)), JSON.stringify(draft));

  // The same copy as the client page reads it.
  const published = details(fixture.input, publicationRows(
    `<p>${CENTRE_SENTENCE} ${FOLLOWING_SENTENCE}</p><p>The centre uses two independent centre channels.</p>`,
  ));
  assert.ok(published.some((detail) => detail.startsWith(MULTIPLIED)), JSON.stringify(published));

  // The document gate reports it, whatever the correct sentence says.
  const complete = validateCompleteDocument(fixture);
  assert.equal(complete.valid, false);
  assert.equal(complete.errors.some((error) => error.code === 'multi_cabinet_channel'), true);
});

/* ── I · no requirement where the evidence states none ────────────────────── */

test('I. a single-cabinet design is unaffected', () => {
  const single = writer12Fixture({ cabinets: 1 });
  assert.deepEqual(single.input.multi_cabinet_channels.required, []);
  assert.deepEqual(multiCabinetChannelViolations({ input: single.input, sections: single.output.sections }), []);
  // And no requirement is invented for the centre description of such a design.
  assert.deepEqual(multiCabinetChannelViolations({
    input: single.input,
    sections: publicationRows(`<p>${CENTRE_SENTENCE}</p>`),
  }), []);
});

/* ── J · comparison attribution ───────────────────────────────────────────── */

test('J. the arrangement stays attributed to the design that has it', () => {
  const shared = writer12Fixture({ comparison: true });
  const genesis = shared.output.sections.find((entry) => entry.section === 'what_stays_same');
  genesis.text = `Genesis: ${CENTRE_SENTENCE}`;
  assert.deepEqual(multiCabinetChannelViolations({ input: shared.input, sections: shared.output.sections }), []);

  // The same description attributed to the other design does not satisfy the
  // arrangement of the design that has it.
  const misattributed = writer12Fixture({ comparison: true });
  const wrong = misattributed.output.sections.find((entry) => entry.section === 'what_stays_same');
  wrong.text = `Alternative Design: ${CENTRE_SENTENCE}`;
  const violations = multiCabinetChannelViolations({ input: misattributed.input, sections: misattributed.output.sections });
  assert.ok(violations.some((v) => v.detail.startsWith(OMITTED)), JSON.stringify(violations));

  // Differing arrangements are still validated per design.
  const differing = writer12Fixture({ comparison: true, secondCabinets: 3 });
  const perDesign = differing.output.sections.find((entry) => entry.section === 'what_stays_same');
  perDesign.text = CENTRE_SENTENCE;
  differing.output.sections.find((entry) => entry.section === 'what_changes').text =
    'Alternative Design: The centre uses two C4-1 cabinets to reproduce one centre channel.';
  const perDesignViolations = multiCabinetChannelViolations({ input: differing.input, sections: differing.output.sections });
  assert.ok(perDesignViolations.some((v) => v.version_id === 'b' && v.detail.startsWith(COUNT)), JSON.stringify(perDesignViolations));
});

/* ── K · draft and publication agree ─────────────────────────────────────── */

test('K. the draft and the published page agree on acceptance and on rejection', () => {
  const cases = [
    { text: CENTRE_SENTENCE, accepted: true },
    { text: `${CENTRE_SENTENCE} ${FOLLOWING_SENTENCE}`, accepted: true },
    { text: 'At the front, the centre channel uses four C4-1 cabinets working together as one audio channel.', accepted: false },
    { text: 'The centre is specified with two independent centre channels.', accepted: false },
    { text: 'The centre channel is specified.', accepted: false },
  ];

  for (const scenario of cases) {
    const fixture = describeInSections(scenario.text);
    const draft = codes(fixture.input, fixture.output.sections);
    const published = codes(fixture.input, publicationRows(`<p>${scenario.text}</p>`));
    const draftAccepted = draft.length === 0;
    const publishedAccepted = published.length === 0;
    assert.equal(draftAccepted, publishedAccepted, `draft and publication disagree: ${scenario.text}`);
    assert.equal(draftAccepted, scenario.accepted, `unexpected verdict: ${scenario.text} → ${JSON.stringify(draft)}`);
  }
});