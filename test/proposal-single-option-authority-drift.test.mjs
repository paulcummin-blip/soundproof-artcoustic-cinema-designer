import { test } from 'vitest';
import assert from 'node:assert/strict';

import { buildProposalEvidence } from '../base44/shared/proposalEvidence/proposalEvidenceBuilder.js';
import { buildWriterInput } from '../base44/shared/proposalWriter/writerInputBuilder.js';
import { validateWriterOutput } from '../base44/shared/proposalWriter/writerOutputValidator.js';
import { buildWriterPrompt } from '../base44/shared/proposalWriter/writerPromptBuilder.js';
import { WRITER_REJECTION } from '../base44/shared/proposalWriter/writerContractSchema.js';
import { option, seatScopes } from './fixtures/proposalEvidenceFixtures.mjs';
import { validDraft } from './fixtures/proposalWriterFixtures.mjs';

const AT = '2026-10-14T21:42:07.437Z';

function marqueeSingleOptionInput() {
  const pack = buildProposalEvidence({
    versions: [option('a', {
      savedName: 'Original Design',
      liveName: 'Original Design',
      screen: '100" TV',
      layout: '5.1',
      subwoofers: 'SUB2-12 x 2',
      levels: {
        4: 'L4', 6: 'L4', 12: 'L4', 13: 'L4',
        14: 'L4', 18: 'L2', 19: 'L4', 20: 'L4',
      },
      values: {
        4: '+/-0.5 dB', 6: '+/-1.5 dB', 12: '112 dBC', 13: '108 dBC',
        14: '115 dB', 18: '26 Hz', 19: '+/-1 dB', 20: '+/-3 dB',
      },
      seatScopes: seatScopes({
        primary: { p4: 'L4', p6: 'L4', p19: 'L4', p20: 'L4' },
        secondary: { p4: 'L4', p6: 'L2', p19: 'L1', p20: 'L1' },
        primarySeats: 2,
        secondarySeats: 2,
      }),
    })],
    generatedAt: AT,
  });

  // These are the canonical stories carried by the failed Marquee generation.
  // The generic report fixture above provides the exact parameter and scoped
  // claims; these story claims reproduce the writer's real mixed authority.
  pack.allowed_claims.push(
    {
      claim_id: 'claim_story_spatial-resolution_01',
      area: 'spatial_resolution',
      label: 'Spatial resolution',
      kind: 'strength_story',
      statement: 'The loudspeakers hold their recommended geometry, supporting exceptionally precise placement and seamless movement around the room.',
      option: { version_id: 'a', version_name: 'Original Design', label: 'Option A' },
      favours: false,
      scope: null,
      level: 'L4',
      wording_class: 'strength',
      wording: 'Exceptionally precise placement',
    },
    {
      claim_id: 'claim_story_bass-extension-and-response_01',
      area: 'bass_extension_and_response',
      label: 'Bass extension and response',
      kind: 'strength_story',
      statement: 'Bass reaches 26 Hz and the modelled response at the reference position is within +/-1 dB, adding scale while remaining remarkably composed.',
      option: { version_id: 'a', version_name: 'Original Design', label: 'Option A' },
      favours: false,
      scope: null,
      level: 'L4',
      wording_class: 'strength',
      wording: 'Remarkably composed bass',
    },
    {
      claim_id: 'claim_story_tonal-consistency_01',
      area: 'tonal_consistency',
      label: 'Tonal consistency',
      kind: 'strength_story',
      statement: 'Screen and surround tonal consistency is excellent across the assessed seats.',
      option: { version_id: 'a', version_name: 'Original Design', label: 'Option A' },
      favours: false,
      scope: null,
      level: 'L4',
      wording_class: 'strength',
      wording: 'Excellent tonal consistency',
    },
    {
      claim_id: 'claim_story_low-frequency-extension_01',
      area: 'bass_extension',
      label: 'Low-frequency extension',
      kind: 'strength_story',
      statement: 'The system reaches 26 Hz in the room: deep bass that adds scale, impact and excitement to films and music.',
      option: { version_id: 'a', version_name: 'Original Design', label: 'Option A' },
      favours: false,
      scope: null,
      level: 'L2',
      wording_class: 'strength',
      wording: 'Deep bass that adds scale, impact and excitement to films and music.',
    },
  );
  return buildWriterInput({ pack });
}

const claim = (input, id) => {
  const found = input.allowed_claims.find((entry) => entry.claim_id === id);
  assert.ok(found, `missing fixture claim ${id}`);
  return found;
};

function validateSentence(input, section, sentence, claimIds) {
  const draft = validDraft(input);
  const target = draft.sections.find((entry) => entry.section === section);
  assert.ok(target, `missing writer section ${section}`);
  target.text = sentence;
  target.claim_ids = claimIds;
  return validateWriterOutput({ input, output: draft });
}

const codes = (result, section) => result.violations
  .filter((entry) => entry.section === section)
  .map((entry) => entry.code);

test('the eight Marquee sentences are grounded by a strength story plus its precise scoped result', () => {
  const input = marqueeSingleOptionInput();
  const cases = [
    {
      section: 'what_changes',
      sentence: 'The picture and seating distance have been set together, while the front and side speakers occupy their recommended positions.',
      claims: ['claim_story_spatial-resolution_01', 'claim_p20_primary_consistency_01'],
    },
    {
      section: 'what_changes',
      sentence: 'Music and effects gain depth from the rear subwoofer pair, whose modelled extension reaches 26 Hz.',
      claims: ['claim_story_bass-extension-and-response_01', 'claim_p20_primary_consistency_01'],
    },
    {
      section: 'key_performance_highlights',
      sentence: 'The primary seating area also benefits from excellent bass consistency, sharing that low-frequency balance across the main listening positions.',
      claims: ['claim_story_bass-extension-and-response_01', 'claim_p20_primary_consistency_01'],
    },
    {
      section: 'spatial_resolution',
      sentence: 'The front speakers and side surrounds sit within their recommended locations, supporting exceptionally precise placement as the soundtrack moves from the action in view into the surrounding scene.',
      claims: ['claim_story_spatial-resolution_01', 'claim_p4_primary_performance_01'],
    },
    {
      section: 'spatial_resolution',
      sentence: 'Excellent surround level consistency across those same seats supports a balanced presentation of effects around the listeners.',
      claims: ['claim_story_tonal-consistency_01', 'claim_p6_primary_performance_01'],
    },
    {
      section: 'dynamic_range',
      sentence: 'Deep bass adds scale to the score, while the modelled response at the reference position keeps that depth remarkably composed.',
      claims: ['claim_story_bass-extension-and-response_01', 'claim_p20_primary_consistency_01'],
    },
    {
      section: 'key_performance_highlights',
      sentence: 'Deep bass adds scale to music and effects, supported by a remarkably composed modelled response at the reference position.',
      claims: ['claim_story_tonal-consistency_01', 'claim_story_bass-extension-and-response_01', 'claim_p20_primary_consistency_01', 'claim_p6_primary_performance_01'],
    },
    {
      section: 'dynamic_range',
      sentence: 'Deep bass adds scale to those moments, with a remarkably controlled modelled response at the reference position.',
      claims: ['claim_story_bass-extension-and-response_01', 'claim_story_low-frequency-extension_01', 'claim_p20_primary_consistency_01'],
    },
  ];

  for (const example of cases) {
    example.claims.forEach((id) => claim(input, id));
    const result = validateSentence(input, example.section, example.sentence, example.claims);
    assert.deepEqual(
      codes(result, example.section),
      [],
      `${example.section}: ${JSON.stringify(result.violations)}`,
    );
  }
});

test('a pack without a recommendation claim tells the writer to use judgement, not recommendation wording', () => {
  const input = marqueeSingleOptionInput();
  assert.equal(input.allowed_claims.some((entry) => entry.kind === 'recommendation'), false);
  assert.match(input.editorial_rules.recommendation_authority, /pack carries no recommendation claim/i);
  assert.match(input.editorial_rules.recommendation_authority, /Do not write recommend/i);

  const prompt = buildWriterPrompt({ input });
  assert.match(prompt, /RECOMMENDATION AUTHORITY: the pack carries no recommendation claim/);
  assert.match(prompt, /Express professional judgement by explaining why the specified design suits the brief/);
});

test('descriptive recommended placement passes, but a real unsupported recommendation still fails', () => {
  const input = marqueeSingleOptionInput();
  const ids = ['claim_story_spatial-resolution_01', 'claim_p4_primary_performance_01'];
  ids.forEach((id) => claim(input, id));

  const description = validateSentence(
    input,
    'spatial_resolution',
    'The front speakers sit within their recommended positions.',
    ids,
  );
  assert.ok(!codes(description, 'spatial_resolution').includes(WRITER_REJECTION.UNSUPPORTED_RECOMMENDATION));

  const instruction = validateSentence(
    input,
    'spatial_resolution',
    'We recommend adding two more subwoofers.',
    ids,
  );
  assert.ok(
    codes(instruction, 'spatial_resolution').includes(WRITER_REJECTION.UNSUPPORTED_RECOMMENDATION),
    JSON.stringify(instruction.violations),
  );
});

test('the authority widening is narrow: a scoped result alone cannot invent a benefit', () => {
  const input = marqueeSingleOptionInput();
  const id = 'claim_p20_primary_consistency_01';
  claim(input, id);

  const result = validateSentence(
    input,
    'key_performance_highlights',
    'The primary seats gain total immunity from room modes.',
    [id],
  );
  assert.ok(
    codes(result, 'key_performance_highlights').includes(WRITER_REJECTION.INVENTED_BENEFIT),
    JSON.stringify(result.violations),
  );
});

test('an altered unsupported figure still fails the evidence guard', () => {
  const input = marqueeSingleOptionInput();
  const id = 'claim_story_bass-extension-and-response_01';
  claim(input, id);

  const result = validateSentence(
    input,
    'dynamic_range',
    'The modelled bass response reaches 21 Hz at the reference position.',
    [id],
  );
  assert.ok(
    codes(result, 'dynamic_range').includes(WRITER_REJECTION.CHANGED_PARAMETER_VALUE),
    JSON.stringify(result.violations),
  );
});
