//
// Shared facts + a factual contrast, in one section.
//
// The live generation 5 draft stated what both options share and then placed
// the difference between them — "the choice is not between different cinema
// formats; it is between different equipment and levels of performance within
// that format" — while the section cited only the shared-result claims. That
// sentence is grounded only when the writer's own input carries the change
// evidence it points at.
//
// The fixture is the generation record itself (gen_093ef0ef): the input the
// writer was given, and the output it returned.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WRITER_REJECTION } from '../base44/shared/proposalWriter/writerContractSchema.js';
import { validateWriterOutput } from '../base44/shared/proposalWriter/writerOutputValidator.js';

const saved = JSON.parse(readFileSync(new URL('./fixtures/marqueeGeneration5.json', import.meta.url), 'utf8'));
const input = saved.input;
const draft = saved.output;

const SECTION_KEY = Object.prototype.hasOwnProperty.call(draft.sections[0], 'section_id') ? 'section_id' : 'section';
const sectionOf = (section) => draft.sections.find((entry) => entry[SECTION_KEY] === section);
const STAYS = 'what_stays_same';

const allowed = Array.isArray(input.allowed_claims) ? input.allowed_claims : [];
const sharedIds = allowed.filter((claim) => claim.kind === 'shared_result').map((claim) => claim.claim_id);
const changeId = (area) => (allowed.find((claim) => claim.area === area && claim.kind === 'factual_change') || {}).claim_id;
const gainId = (allowed.find((claim) => claim.kind === 'material_gain') || {}).claim_id;

const stays = sectionOf(STAYS);
const SAVED_TEXT = stays.text;
const SAVED_CLAIM_IDS = stays.claim_ids;

/** The saved draft with one section's copy and citations replaced. */
const withStays = (text, claimIds, inputOverride = null) => ({
  input: inputOverride || input,
  output: {
    ...draft,
    sections: draft.sections.map((entry) => (
      entry[SECTION_KEY] === STAYS ? { ...entry, text, claim_ids: claimIds } : entry
    )),
  },
});

const staysViolations = (result) => result.violations.filter((entry) => entry.section === STAYS);
const staysDetails = (result) => staysViolations(result).map((entry) => `${entry.code}|${entry.detail}`);

test('A. shared-only copy is grounded by the shared-result claims', () => {
  const text = 'Both options keep the same room, screen scale, seating and 9.1.6 layout. '
    + 'They also share the same acoustic treatment: Artcoustic Abfuser × 8.';
  const result = validateWriterOutput(withStays(text, sharedIds));
  assert.deepEqual(staysViolations(result), []);
  assert.ok(sharedIds.length > 0);
});

test('B. shared copy with a factual contrast is grounded by shared AND change claims', () => {
  const text = 'Both options keep the same room, screen scale, seating and 9.1.6 layout. '
    + 'The choice is not between different cinema formats; it is between different equipment '
    + 'and levels of performance within that format.';
  const claimIds = [sharedIds[0], changeId('speakers'), gainId].filter(Boolean);
  assert.ok(changeId('speakers'), 'the input carries a factual-change claim for the equipment');
  assert.ok(gainId, 'the input carries a material-gain claim for the performance');
  const result = validateWriterOutput(withStays(text, claimIds));
  assert.deepEqual(staysViolations(result), []);
});

test('C. an equipment difference is blocked unless the section cites the change claim', () => {
  const text = 'Both options keep the same room, but the loudspeaker package is different.';

  const unsupported = validateWriterOutput(withStays(text, sharedIds));
  assert.ok(staysDetails(unsupported).includes(
    `${WRITER_REJECTION.INVENTED_BENEFIT}|change_claim_not_supported_by_the_cited_claims`
  ), `expected a blocked change, got ${JSON.stringify(staysDetails(unsupported))}`);

  const supported = validateWriterOutput(withStays(text, [...sharedIds, changeId('speakers')]));
  assert.deepEqual(staysViolations(supported), []);
});

test('C2. framing is never an exemption — with no change evidence in the input, the contrast is blocked', () => {
  const strippedInput = {
    ...input,
    allowed_claims: allowed.filter((claim) => claim.kind !== 'factual_change' && claim.kind !== 'material_gain'),
  };
  const result = validateWriterOutput(withStays(SAVED_TEXT, SAVED_CLAIM_IDS, strippedInput));
  assert.ok(staysDetails(result).includes(
    `${WRITER_REJECTION.INVENTED_BENEFIT}|change_claim_not_supported_by_the_cited_claims`
  ), `expected the contrast to stay unsupported, got ${JSON.stringify(staysDetails(result))}`);
});

test('D. the exact saved generation 5 output replays with no violations', () => {
  const result = validateWriterOutput({ input, output: draft });
  assert.deepEqual(result.violations, []);
});