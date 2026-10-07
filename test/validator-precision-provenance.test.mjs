import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { validateWriterOutput } from '../base44/shared/proposalWriter/writerOutputValidator.js';
import { VALIDATOR_SOURCE_MANIFEST } from '../base44/shared/proposalWriter/validatorSourceManifest.js';
import { buildGenerationRecord } from '../base44/shared/proposalGeneration/proposalGenerationRecord.js';
import { generationEntityPayload } from '../base44/shared/proposalGeneration/proposalGenerationEntity.js';
import { createGenerationHistory } from '../base44/shared/proposalGeneration/proposalGenerationRepository.js';
const saved = JSON.parse(readFileSync(new URL('./fixtures/marqueeLiveGeneration.json', import.meta.url)));
const input = saved.input;
function run(text, areas = ['speakers','lcr','surrounds','overheads', 'p12', 'p13', 'p14']) {
  const output = structuredClone(saved.output);
  const section = output.sections.find(s => s.section === 'what_changes');
  section.text = text;
  section.claim_ids = input.allowed_claims.filter(c => areas.includes(c.area) && ['material_gain','factual_change'].includes(c.kind)).map(c => c.claim_id);
  return validateWriterOutput({ input, output });
}
for (const text of [
  'The choice is not between different cinema formats; it is between different equipment and levels of performance within that format.',
  'The difference is not a different room; it is a different loudspeaker package.',
  'The choice is not a different cinema format, but a different loudspeaker package.',
  'The speaker package changes at the screen, around the seating and overhead.',
  'The screen stage uses a different loudspeaker package.',
  'The screen channels have greater headroom.',
  'Greater screen, surround and height headroom.',
  'More front-stage headroom and bass authority.',
]) test(`supported clause passes: ${text}`, () => expect(run(text).violations).toEqual([]));
for (const text of [
  'The cinema format is different.', 'The Level 4 version uses a different room.',
  'Level 4 has a larger screen.', 'The screen is larger.', 'The screen size improves.', 'The screen is wider.',
]) test(`real area change blocked: ${text}`, () => expect(run(text).valid).toBe(false));
test('denied clause never excuses the asserted unsupported equipment change', () => {
  expect(run('The choice is not a different cinema format, but a different loudspeaker package.', ['p12']).valid).toBe(false);
  expect(run('The choice is not between different formats; it is between different equipment.', ['p12']).valid).toBe(false);
});
test('violation has exact clause and rule attribution', () => {
  const text = 'The screen is wider.';
  const r = run(text);
  const v = r.violations.find(v => v.code === 'unsupported_improvement');
  expect(v.sentence).toBe(text); expect(v.clause).toBe(text);
  expect(v.rule_id).toMatch(/^blocked_area:/); expect(v.block_id).toMatch(/^block_/);
  expect(v.validator_rules_fingerprint).toBe(r.validator_rules_fingerprint);
  expect(text.slice(v.span.start, v.span.end)).toBe(v.matched_substring);
});
test('generation record stores provenance from its own validation', () => {
  const validation = run('The screen channels have greater headroom.');
  const record = buildGenerationRecord({proposalId:'audit',projectId:'audit',pack:input.evidence_pack,writerInput:input,output:saved.output,validation,createdBy:'audit',createdAt:'2026-10-06T20:00:00Z',generationNumber:1});
  expect(record.validator_rules_fingerprint).toBe(validation.validator_rules_fingerprint);
  expect(record.writer_rules_fingerprint).toBe(validation.writer_rules_fingerprint);
  expect(record.validator_version).toBe('proposal-validator-3');
  expect(Object.isFrozen(record.validator_source_manifest)).toBe(true);
  expect(generationEntityPayload({record}).validator_rules_fingerprint).toBe(record.validator_rules_fingerprint);
});
test('historical records stay byte-identical and are not backfilled', () => {
  const historical = structuredClone(saved);
  const before = JSON.stringify(historical);
  validateWriterOutput({input: historical.input, output: historical.output});
  createGenerationHistory({records:[historical]});
  expect(JSON.stringify(historical)).toBe(before);
  expect(historical.validator_version).toBeUndefined();
});
test('failed generations persist attributed violations without changing old attempts', () => {
  const validation = run('The screen is wider.');
  const r = buildGenerationRecord({proposalId:'audit',projectId:'audit',pack:input.evidence_pack,writerInput:input,output:saved.output,validation,createdBy:'audit',createdAt:'2026-10-06T20:00:00Z',generationNumber:1});
  expect(r.validation_errors[0].clause).toBe('The screen is wider.');
  expect(r.validation_errors[0].validator_rules_fingerprint).toBe(r.validator_rules_fingerprint);
  expect(r.status).toBe('needs_human_review');
});
test('manifest names the exact source bytes, preventing silent stale rule identities', () => {
  expect(Object.keys(VALIDATOR_SOURCE_MANIFEST).length).toBeGreaterThan(5);
  for (const [path, hash] of Object.entries(VALIDATOR_SOURCE_MANIFEST)) {
    const source = readFileSync(new URL(`../${path}`, import.meta.url));
    expect(createHash('sha256').update(source).digest('hex'), path).toBe(hash);
  }
});