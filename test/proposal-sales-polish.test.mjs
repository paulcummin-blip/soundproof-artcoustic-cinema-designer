import { test, expect } from 'vitest';
import { crossSectionDuplicates, internalLevelLanguage, unexplainedOverhead, singleOptionFraming, tonalScopeStretch } from '../base44/shared/proposalWriter/writerSalesPolishRules.js';
import { reportVoicePhrase } from '../base44/shared/proposalWriter/writerEditorialRules.js';
import { writerSectionsForMode } from '../base44/shared/proposalWriter/writerContractSchema.js';
import { buildProposalEvidence } from '../base44/shared/proposalEvidence/proposalEvidenceBuilder.js';
import { buildWriterInput } from '../base44/shared/proposalWriter/writerInputBuilder.js';
import { validateWriterOutput } from '../base44/shared/proposalWriter/writerOutputValidator.js';
import { EVIDENCE_AT, option } from './fixtures/proposalEvidenceFixtures.mjs';

const tonalClaims = [{ claim_id: 'claim_story_tonal-consistency_01', area: 'timbre' }];
const sentence = 'The screen stage has enough output capability for demanding film soundtracks.';

test('ten-word complete sentences are rejected across sections, with attribution', () => {
  const sections = [{ section: 'what_changes', text: sentence }, { section: 'dynamic_range', text: sentence }];
  const found = crossSectionDuplicates(sections);
  expect(found).toHaveLength(1);
  expect(found[0].code).toBe('cross_section_duplication');
  expect(found[0].section).toBe('dynamic_range');
  expect(found[0].detail).toBe('sentence_repeated_from:what_changes');
  expect(found[0].rule_id).toBe('cross_section_verbatim:ten_or_more_words');
});

test('nine words and within-section repetition do not trip the cross-section rule', () => {
  const short = 'One two three four five six seven eight nine.';
  expect(crossSectionDuplicates([{ section: 'a', text: short }, { section: 'b', text: short }])).toEqual([]);
  expect(crossSectionDuplicates([{ section: 'a', text: `${sentence} ${sentence}` }])).toEqual([]);
});

test('whitespace changes and decimal/channel figures do not evade duplicate checking', () => {
  const text = 'Our 9.1.6 architecture gives effects a convincing path around and above you.';
  expect(crossSectionDuplicates([{ section: 'a', text }, { section: 'b', text: text.replace(' gives ', '  gives ') }])).toHaveLength(1);
  const ten = 'One two three four five six seven eight nine ten.';
  expect(crossSectionDuplicates([{ section: 'a', text: ten }, { section: 'b', text: ten }])).toHaveLength(1);
});

test('Genesis tonal scope stretch is rejected without rejecting tonal consistency', () => {
  expect(tonalScopeStretch('The system holds this character across all eight seats, ensuring the experience is balanced whether the audience is in the front or rear row.', tonalClaims)).toBe(true);
  expect(tonalScopeStretch('Across all eight seats, voices and effects retain a consistent tonal character as they move between the screen, surround and overhead channels.', tonalClaims)).toBe(false);
  expect(tonalScopeStretch('Every seat enjoys consistent bass performance.', tonalClaims)).toBe(true);
  expect(tonalScopeStretch('Voices have a balanced tonal character across all eight seats.', tonalClaims)).toBe(false);
  expect(tonalScopeStretch('The design achieves consistent tonal performance across all 8 assessed seating positions, ensuring the sound character remains uniform as audio moves through the room.', tonalClaims)).toBe(false);
});

test('extended report register is main-prose only; appendix does not waive grounding', () => {
  for (const phrase of ['assessed at', 'published result', 'results are derived from', 'technical evaluation of', 'engineering model', 'stated on its own result']) {
    expect(reportVoicePhrase(phrase)).not.toBeNull();
    expect(reportVoicePhrase(phrase, { section: 'appendix_notes' })).toBeNull();
  }
  expect(reportVoicePhrase('performance results')).not.toBeNull();
  expect(reportVoicePhrase('according to the report')).not.toBeNull();
});

test('prose grades, OH and decision filler are rejected while plain English passes', () => {
  for (const phrase of ['L4 result', 'L3 result', 'L2 result', 'L1', 'RP22 Level 4']) expect(internalLevelLanguage(phrase)).toBe(true);
  expect(internalLevelLanguage('The sound stays tonally coherent.')).toBe(false);
  expect(unexplainedOverhead('108 dBC (OH)')).toBe(true);
  expect(unexplainedOverhead('overhead channels')).toBe(false);
  for (const phrase of ['This proposal outlines', 'This design presents', 'this option', 'decision', 'selected option']) expect(singleOptionFraming(phrase)).toBe(true);
  expect(singleOptionFraming('A large picture and convincing movement draw you into the film.')).toBe(false);
});

test('single Design Summary changes no comparison purpose, IDs or limits', () => {
  const single = writerSectionsForMode('single');
  const comparison = writerSectionsForMode('comparison');
  expect(single[0].title).toBe('Design Summary');
  expect(single[0].requirement).toContain('2–3');
  expect(comparison[0].title).toBe('Decision Summary');
  expect(comparison[0].requirement).toContain('decision between the options');
  expect(single.map(s => [s.section, s.word_limit])).toEqual(comparison.map(s => [s.section, s.word_limit]));
});

test('validator integrates duplication, level, jargon, register and framing checks', () => {
  const pack = buildProposalEvidence({ versions: [option('a')], generatedAt: EVIDENCE_AT });
  const input = buildWriterInput({ pack });
  const output = {
    contract_version: input.contract_version, pack_fingerprint: pack.pack_fingerprint,
    sections: writerSectionsForMode('single').map((s, i) => ({ section: s.section, text: `Source note number ${i}.`, claim_ids: [] })),
  };
  output.sections[0].text = 'This proposal outlines an L4 result assessed at 108 dBC (OH).';
  output.sections[1].text = sentence;
  output.sections[2].text = sentence;
  const codes = validateWriterOutput({ input, output }).violations.map(v => v.code);
  for (const code of ['cross_section_duplication', 'internal_level_language', 'unexplained_abbreviation', 'report_voice', 'single_option_framing']) expect(codes).toContain(code);
});