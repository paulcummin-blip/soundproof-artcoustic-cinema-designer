/**
 * The client brief is an instruction, and it is answered only where the finished
 * copy explains it. These tests hold the coverage audit to the MEANING of each
 * request — the passage that answers it, or the gap the client is left with — and
 * hold the one controlled revision to its bounds: the sections that carry the gap,
 * and nothing else.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { buildClientBriefCoverage } from '../base44/shared/proposalWriter/writerClientBriefCoverage.js';
import { buildBriefRevision, mergeRevisedDraft } from '../base44/shared/proposalWriter/writerBriefRevision.js';
import { buildWriterProviderRequest } from '../base44/shared/proposalWriter/writerPromptBuilder.js';
import { readDisplayIdentity } from '../base44/shared/canonicalDisplayIdentity.js';

const briefOf = (clientBrief) => ({ supplied: true, client_brief: clientBrief, narrative_brief: null, designer_notes: null });
const section = (id, text) => ({ section: id, text, claim_ids: [] });

/** A pack whose evidence states the display, P7 (front wide position) and P20. */
const PACK = {
  options: [{
    version_id: 'v1',
    facts: {
      screen: { display_type: 'projector_screen', aspect_ratio: '2.35:1', display_label: '185" 2.35:1 projection screen' },
      parameters: [{ parameter_id: 7, value: 'L2' }, { parameter_id: 20, value: 'L2' }],
    },
  }],
};

/* ── the reason the request asks for is not stated ─────────────────────────── */

test('a request for a reason is unaddressed while the copy only mentions the subject', () => {
  const sections = [
    section('spatial_resolution', 'The front-wide, side and rear loudspeakers, together with six overhead speakers, provide the physical locations that support this movement. The front row has a 64.6 degree viewing angle.'),
    section('what_changes', 'Our recommendation centres on substantial soundtrack scale.'),
    section('overall_design', 'The broad projected image gives this room its visual scale.'),
  ];
  const coverage = buildClientBriefCoverage({
    brief: briefOf('Mention the front wides are outside their ideal location due to the door position'),
    pack: PACK,
    sections,
  });
  const row = coverage.items[0];

  assert.equal(row.status, 'unaddressed');
  assert.equal(row.reason, 'the_item_asks_for_the_reason_and_the_copy_states_no_reason_for_it');
  // No passage explains it: the subject is mentioned, and nothing states the reason.
  assert.equal(row.evidence.length, 0);
  assert.ok(row.mention.passage.includes('front-wide'));
  assert.ok(row.missing_subject.includes('door'));
  assert.equal(row.revision_section, 'spatial_resolution');
  assert.equal(coverage.complete, false);
  assert.equal(coverage.outstanding.length, 1);
  assert.equal(coverage.revision_requests[0].section, 'spatial_resolution');
});

/* ── the subject is explained as a subject, not as the specific matter ─────── */

test('a subject mentioned without the matter the brief named is partially addressed', () => {
  const sections = [
    section('spatial_resolution', 'The overhead speakers sit within the recommended placement zones.'),
    section('what_stays_same', 'The seating faces the 115" TV, with 1.8m centre-to-centre spacing between rows.'),
  ];
  const coverage = buildClientBriefCoverage({
    brief: briefOf('Explain the overhead speaker spacing logic'),
    pack: PACK,
    sections,
  });
  const row = coverage.items[0];

  assert.equal(row.status, 'partially_addressed');
  assert.equal(row.evidence.length, 0);
  assert.ok(row.mention.passage.includes('overhead'));
  // The word "spacing" does appear in the draft, in the seating row spacing: a
  // coincidental match elsewhere in the document is not an explanation of this
  // request, which is why the verdict rests on the mention and the passage list is
  // empty.
  assert.equal(row.missing_subject, 'logic');
  assert.equal(coverage.complete, false);
});

test('the same request is addressed once the copy explains the specific matter', () => {
  const sections = [
    section('spatial_resolution', 'The overhead speaker spacing follows the arrangement the room allows, with the six height loudspeakers spaced within the recommended limit.'),
  ];
  const coverage = buildClientBriefCoverage({
    brief: briefOf('Explain the overhead speaker spacing logic'),
    pack: PACK,
    sections,
  });
  const row = coverage.items[0];

  assert.equal(row.status, 'addressed');
  assert.equal(row.reason, null);
  // Every ADDRESSED verdict carries the passage it was read from.
  assert.equal(row.evidence.length, 1);
  assert.equal(row.evidence[0].section, 'spatial_resolution');
  assert.ok(row.evidence[0].passage.includes('overhead speaker spacing'));
  assert.equal(coverage.complete, true);
  assert.deepEqual(coverage.revision_requests, []);
});

/* ── a request no source states ────────────────────────────────────────────── */

test('a request no source states is unsupported and is never returned for revision', () => {
  const coverage = buildClientBriefCoverage({
    brief: briefOf('Mention the P15 background noise floor'),
    pack: PACK,
    sections: [section('dynamic_range', 'The screen channels are specified for 116 dBC at the reference seating position.')],
  });
  assert.equal(coverage.items[0].status, 'unsupported');
  assert.deepEqual(coverage.outstanding, []);
  assert.equal(coverage.complete, true);
});

/* ── the one controlled revision ───────────────────────────────────────────── */

test('the revision names the section that carries the gap and the material recorded for it', () => {
  const coverage = buildClientBriefCoverage({
    brief: briefOf('Mention the front wides are outside their ideal location due to the door position'),
    pack: PACK,
    sections: [section('spatial_resolution', 'The front-wide, side and rear loudspeakers provide the physical locations that support this movement.')],
  });
  const plan = buildBriefRevision({
    coverage,
    interpretationView: { constraints: ['Right wall doorway limits the ideal front-wide position'] },
  });

  assert.equal(plan.needed, true);
  assert.deepEqual(plan.sections, ['spatial_resolution']);
  assert.equal(plan.items.length, 1);
  assert.match(plan.items[0].recorded, /doorway/);
});

test('the revision puts back only the sections it asked for', () => {
  const accepted = {
    contract_version: 1,
    pack_fingerprint: 'pack',
    sections: [
      section('spatial_resolution', 'The front-wide loudspeakers provide the physical locations that support this movement.'),
      section('overall_design', 'The broad projected image gives this room its visual scale.'),
    ],
  };
  const revised = mergeRevisedDraft({
    output: accepted,
    revised: {
      sections: [
        section('spatial_resolution', 'The doorway on the right wall restricts the ideal front-wide position, and we have kept the wides as close to it as the room allows.'),
        section('overall_design', 'REWRITTEN AND NOT ASKED FOR'),
      ],
    },
    sections: ['spatial_resolution'],
  });

  assert.match(revised.sections.find((entry) => entry.section === 'spatial_resolution').text, /doorway/);
  assert.equal(
    revised.sections.find((entry) => entry.section === 'overall_design').text,
    'The broad projected image gives this room its visual scale.',
  );
});

test('the revision instruction reaches the writer only when a revision is needed', () => {
  const input = { contract_version: 1, evidence_pack: { pack_fingerprint: 'pack' } };
  const plain = buildWriterProviderRequest({ input, model: 'gpt_6_astra' });
  assert.equal(plain.prompt.includes('CONTROLLED REVISION'), false);

  const revised = buildWriterProviderRequest({
    input,
    model: 'gpt_6_astra',
    briefRevision: {
      needed: true,
      sections: ['spatial_resolution'],
      rule: 'the rule',
      items: [{ section: 'spatial_resolution', requested: 'the front-wide compromise to be explained', recorded: 'a recorded constraint of this project: "Right wall doorway limits the ideal front-wide position"' }],
    },
  });
  assert.equal(revised.prompt.includes('CONTROLLED REVISION'), true);
  assert.equal(revised.prompt.includes('Rewrite ONLY these sections: spatial_resolution'), true);
  assert.equal(revised.prompt.includes('Right wall doorway limits the ideal front-wide position'), true);
  // The frozen input is still sent whole and unmodified.
  assert.equal(revised.prompt.includes(JSON.stringify(input)), true);
});

/* ── the passages are read from the whole section ──────────────────────────── */

test('an explanation in the last paragraph of a section is found, not truncated away', () => {
  // The real Genesis wording, with the spacing explanation in the section's last
  // paragraph: a passage read from part of a section would miss it entirely.
  const spatial = 'Effects have distinct positions around and above the audience, helping the soundtrack describe action beyond the picture. '
    + 'The 15 discrete channels include front wides, side and rear surrounds, and six overhead channels. '
    + 'The screen-wall speakers occupy their recommended zones, the wides meet their positioning limit, and the surround and overhead speakers sit within the recommended locations. '
    + 'The height layer uses dedicated speakers above the audience rather than relying on the ear-level channels to suggest height. '
    + 'Overhead spacing is 66.5\u00b0; this is the specified angular spacing for the layout.';
  const coverage = buildClientBriefCoverage({
    brief: briefOf('Explain the overhead speaker spacing logic'),
    pack: PACK,
    sections: [section('spatial_resolution', spatial)],
  });

  assert.equal(coverage.items[0].status, 'addressed');
  assert.match(coverage.items[0].evidence[0].passage, /Overhead spacing is 66\.5/);
  assert.equal(coverage.complete, true);
});

test('a slash-joined pair in a request is two of its own words, not one slug', () => {
  const coverage = buildClientBriefCoverage({
    brief: briefOf('Explain the 4 subwoofer front/rear configuration'),
    pack: PACK,
    sections: [section('what_stays_same', 'The bass arrangement uses four SUB3-12 subwoofers: two at the front and two at the rear.')],
  });

  assert.equal(coverage.items[0].status, 'addressed');
  assert.match(coverage.items[0].evidence[0].passage, /two at the front and two at the rear/);
});

/* ── the accepted Genesis copy, read back through the corrected audit ──────── */

test('the Genesis brief is answered by the accepted copy, passage by passage', () => {
  // The copy the acceptance run produced, read back item by item. Three requests
  // were reported as unanswered by the audit this work corrects; each is now read
  // from the sentence that actually answers it.
  const sections = [
    section('decision_summary', 'Sound is designed to extend beyond the picture, with channels around the audience and a dedicated overhead layer. The 9.1.6 arrangement provides the architecture for that experience, while four subwoofers form the bass system at the front and rear of the room.'),
    section('what_stays_same', 'The 9.1.6 format means 9 ear-level channels, 1 low-frequency effects channel and 6 overhead channels: 15 discrete loudspeaker channels, excluding the subwoofers. The bass arrangement uses four SUB3-12 subwoofers: two at the front and two at the rear.'),
    section('spatial_resolution', 'Effects have distinct positions around and above the audience, helping the soundtrack describe action beyond the picture. The screen-wall speakers occupy their recommended zones. The height layer uses dedicated speakers above the audience rather than relying on the ear-level channels to suggest height. Overhead spacing is 66.5\u00b0; this is the specified angular spacing for the layout.'),
  ];
  const coverage = buildClientBriefCoverage({
    brief: briefOf('Explain the 9.1.6 system layout\nExplain the 4 subwoofer front/rear configuration\nExplain the overhead speaker spacing logic'),
    pack: PACK,
    sections,
  });

  assert.deepEqual(coverage.items.map((row) => row.status), ['addressed', 'addressed', 'addressed']);
  assert.equal(coverage.complete, true);
  assert.deepEqual(coverage.outstanding, []);
  for (const row of coverage.items) assert.ok(row.evidence.length >= 1, 'every ADDRESSED verdict carries its passage');
});

test('a figure the evidence contradicts is the designer\'s, never the writer\'s', () => {
  const coverage = buildClientBriefCoverage({
    brief: briefOf('Emphasise the 170 inch 2.35:1 screen'),
    pack: PACK,
    sections: [section('decision_summary', 'The specified projection screen is 185 inches with a 2.35:1 aspect ratio, giving the picture a wide format.')],
  });
  const row = coverage.items[0];

  assert.equal(row.status, 'partially_addressed');
  assert.equal(row.figure_conflict, true);
  assert.equal(row.needs_designer_attention, true);
  assert.deepEqual(coverage.revision_requests, []);
  assert.equal(coverage.designer_attention.length, 1);
  assert.equal(coverage.complete, false);
  assert.equal(buildBriefRevision({ coverage }).needed, false);
});

/* ── the display is stated from its own identity ───────────────────────────── */

test('a television is described as a television, from the frozen display identity', () => {
  const genesis = readDisplayIdentity({ display_type: 'tv', screen_type: 'Television', diagonal_inches: 115, size_inches: 115 });
  assert.equal(genesis.isTv, true);
  assert.equal(genesis.tvPhrase, '115" TV');

  const marquee = readDisplayIdentity({ display_type: 'projector_screen', screen_type: 'Projection screen', diagonal_inches: 185 });
  assert.equal(marquee.isTv, false);
  assert.equal(marquee.tvPhrase, null);
});