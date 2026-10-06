//
// Validator precision against the saved live Marquee generation.
//
// The live generation (gen_7bf15603) was held on eighteen validation flags, and
// the forensic review found all eighteen to be false positives: the checker read
// words that merely occur in a sentence as claims about an area. These tests run
// the EXACT saved draft through the revised validator — no regeneration, no new
// GPT call — and then prove that genuine blocked claims are still refused.
//
// The fixture is the generation record itself: the input the writer was given,
// and the output it returned.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WRITER_REJECTION } from '../base44/shared/proposalWriter/writerContractSchema.js';
import { BLOCK_REASON } from '../base44/shared/proposalEvidence/evidencePackSchema.js';
import { validateWriterOutput } from '../base44/shared/proposalWriter/writerOutputValidator.js';

const saved = JSON.parse(readFileSync(new URL('./fixtures/marqueeLiveGeneration.json', import.meta.url), 'utf8'));
const input = saved.input;
const draft = saved.output;

const validate = (output, override = null) => validateWriterOutput({ input: override || input, output });
const codes = (result) => result.violations.map((entry) => entry.code);
const labels = (result) => result.violations.map((entry) => `${entry.section}|${entry.detail}`);

/** The eighteen flags the live generation recorded, exactly as it recorded them. */
const RECORDED_FLAGS = saved.recorded_validation_errors.map((entry) => `${entry.section}|${entry.detail}`);

/** The saved draft with one sentence appended to one section. */
const amend = (section, sentence, claimIds = []) => {
  const copy = JSON.parse(JSON.stringify(draft));
  const target = copy.sections.find((entry) => entry.section === section);
  target.text = `${target.text} ${sentence}`;
  for (const id of claimIds) if (!target.claim_ids.includes(id)) target.claim_ids.push(id);
  return copy;
};

const claimOf = (area, kind) => input.allowed_claims
  .find((claim) => claim.area === area && claim.kind === kind) || null;

/** A parameter and a Performance Level its own reports do not state. */
const unsupportedLevel = (() => {
  for (const row of input.evidence_pack.classification || []) {
    const id = /^p(\d+)$/.exec(row?.area || '');
    if (!id) continue;
    const stated = (row.levels || []).map(String).join(',');
    if (!stated) continue;
    if (!/L4/.test(stated)) return { id: Number(id[1]), level: 'L4' };
    if (!/L1/.test(stated)) return { id: Number(id[1]), level: 'L1' };
  }
  return null;
})();

/* ── Acceptance: the saved live copy, unchanged ────────────────────────────── */

test('the saved live Marquee draft now validates cleanly', () => {
  const result = validate(draft);

  assert.equal(saved.recorded_validation_errors.length, 18, 'the generation recorded eighteen flags');
  assert.equal(result.valid, true, JSON.stringify(result.violations));
  assert.deepEqual(result.violations, []);
  assert.equal(result.sections.length, 9);
  assert.equal(result.pack_fingerprint, input.evidence_pack.pack_fingerprint);
  assert.ok(result.sections.every((entry) => entry.words > 0 && entry.words <= entry.word_limit));
});

test('every one of the eighteen recorded flags is gone', () => {
  const live = labels(validate(draft));
  const still = RECORDED_FLAGS.filter((flag) => live.includes(flag));

  assert.deepEqual(still, [], `still flagged: ${still.join(', ')}`);
});

/* ── Rule 3: a word that merely occurs is not a claim about the area ───────── */

test('a word occurring in a sentence is not read as a claim about its area', () => {
  // Each of these is grounded in the section it sits in, so nothing but the
  // blocked-area scan can be what refuses them. A layer name carrying a gain
  // verb directly ("the surround layers gain headroom") is deliberately NOT
  // here: it does predicate a gain of that layer, so it stays fail-closed.
  const cases = [
    'Screen effects have more room to expand before the system sounds strained.',
    'The subwoofer system has more capability around and above the seats.',
    'The front wide positions bridge the screen and side speakers effectively.',
    'Level 4 version has more front-stage headroom.',
  ];

  for (const sentence of cases) {
    const result = validate(amend('dynamic_range', sentence));
    assert.equal(
      codes(result).includes(WRITER_REJECTION.UNSUPPORTED_IMPROVEMENT),
      false,
      `${sentence} -> ${JSON.stringify(result.violations)}`,
    );
  }
});

/* ── Rule 4: a denied claim is not a claim ────────────────────────────────── */

test('a sentence that denies the claim is not rejected for making it', () => {
  const cases = [
    ['overall_design', 'The bass results do not indicate improved seat-to-seat consistency.'],
    ['overall_design', 'The distinction is not the format, but the greater headroom recorded for Level 4 version.'],
    ['what_changes', 'Level 4 does not add more channels.'],
    ['what_stays_same', 'The screen is not larger in this option.'],
  ];

  for (const [section, sentence] of cases) {
    const result = validate(amend(section, sentence));
    assert.equal(
      codes(result).includes(WRITER_REJECTION.UNSUPPORTED_IMPROVEMENT),
      false,
      `${sentence} -> ${JSON.stringify(result.violations)}`,
    );
  }
});

/* ── The style the sales authority asks for passes ─────────────────────────── */

test('the intended sales style passes where the pack records the result', () => {
  // The prompt's own exemplars, written about results this pack supports: the
  // screen-stage headroom is the pack's P12 gain, and the surround and height
  // layer headroom is its P13 gain. None of them may be refused as a claim about
  // a blocked area — "the screen stage" is the front stage, not the screen.
  const p12 = claimOf('p12', 'material_gain');
  const p13 = claimOf('p13', 'material_gain');

  const cases = [
    ['dynamic_range', 'The screen stage has substantially more headroom. Dialogue, music and effects can build in scale without the front speakers sounding compressed or strained when the film becomes demanding.', [p12?.claim_id]],
    ['dynamic_range', 'The surround and overhead channels have enough reserve to keep their presence when the front stage becomes busy. Effects around and above the audience do not disappear behind the main soundtrack.', [p13?.claim_id]],
    ['overall_design', 'The additional headroom means the front stage, surrounds and overhead channels can all maintain their scale during the busiest parts of a soundtrack.', [p12?.claim_id, p13?.claim_id]],
  ];

  for (const [section, sentence, claimIds] of cases) {
    const result = validate(amend(section, sentence, claimIds.filter(Boolean)));
    assert.equal(
      codes(result).includes(WRITER_REJECTION.UNSUPPORTED_IMPROVEMENT),
      false,
      `${sentence} -> ${JSON.stringify(result.violations)}`,
    );
  }
});

/* ── Rule 6: genuine blocked claims still fail ─────────────────────────────── */

test('genuine blocked claims are still refused', () => {
  const cases = [
    ['what_stays_same', 'Level 4 has a larger screen.', [], WRITER_REJECTION.UNSUPPORTED_IMPROVEMENT],
    ['what_stays_same', 'Level 4 adds more channels.', [], WRITER_REJECTION.UNSUPPORTED_IMPROVEMENT],
    ['what_stays_same', 'The seating improves considerably with this option.', [claimOf('seating', 'shared_result').claim_id], WRITER_REJECTION.INVENTED_BENEFIT],
    ['key_performance_highlights', 'P12 now delivers 121 dBC.', [], WRITER_REJECTION.CHANGED_PARAMETER_VALUE],
    ['what_changes', 'The Level 4 design is specified with SUB6-15 x 2.', [], WRITER_REJECTION.UNSELECTED_PRODUCT],
  ];

  for (const [section, sentence, claimIds, expected] of cases) {
    const result = validate(amend(section, sentence, claimIds));
    assert.equal(result.valid, false, `${sentence} must be refused`);
    assert.ok(codes(result).includes(expected), `${sentence} -> ${expected} (${JSON.stringify(codes(result))})`);
  }
});

test('a solved or uniform bass consistency claim is still refused', () => {
  // The pack's own prohibited-wording rule catches this one, and so does the
  // blocked P20 improvement.
  const solved = validate(amend('overall_design', 'Level 4 solves bass consistency across the room.'));
  assert.equal(solved.valid, false, JSON.stringify(solved.violations));
  assert.ok(codes(solved).includes(WRITER_REJECTION.P20_BASS_CONTRADICTION), JSON.stringify(codes(solved)));
  assert.ok(codes(solved).includes(WRITER_REJECTION.UNSUPPORTED_IMPROVEMENT), JSON.stringify(codes(solved)));

  const uniform = validate(amend('overall_design', 'Both designs now deliver uniform bass across all seats.'));
  assert.ok(codes(uniform).includes(WRITER_REJECTION.P20_BASS_CONTRADICTION), JSON.stringify(codes(uniform)));

  // Written the other way round, the claim is refused by the P20 block.
  const seatToSeat = validate(amend('overall_design', 'Level 4 solves seat-to-seat bass consistency across the room.'));
  assert.equal(seatToSeat.valid, false, JSON.stringify(seatToSeat.violations));
  assert.ok(codes(seatToSeat).includes(WRITER_REJECTION.UNSUPPORTED_IMPROVEMENT), JSON.stringify(seatToSeat.violations));
});

test('a changed Performance Level is still refused', () => {
  assert.ok(unsupportedLevel, 'the pack states a parameter with an unstated level');
  const { id, level } = unsupportedLevel;
  const result = validate(amend('overall_design', `P${id} now reaches ${level}.`));

  assert.ok(
    codes(result).includes(WRITER_REJECTION.CHANGED_LEVEL),
    `P${id} now reaches ${level}. -> ${JSON.stringify(result.violations)}`,
  );
});

test('a recommendation is still refused where the pack allows none', () => {
  const withoutRecommendation = {
    ...input,
    allowed_claims: input.allowed_claims.filter((claim) => claim.kind !== 'recommendation'),
  };

  const result = validate(draft, withoutRecommendation);
  assert.ok(
    codes(result).includes(WRITER_REJECTION.UNSUPPORTED_RECOMMENDATION),
    JSON.stringify(codes(result)),
  );

  // And with the claim in place, the same copy raises no such rejection.
  assert.equal(
    codes(validate(draft)).includes(WRITER_REJECTION.UNSUPPORTED_RECOMMENDATION),
    false,
  );
});

/* ── Seat-to-seat consistency, where P20 supports none ─────────────────────── */

/** The claims a client reads as "there are no weak seats in this room". */
const SEAT_CONSISTENCY = [
  'The bass remains consistent across the seating area.',
  'Bass response is consistent across all seats.',
  'The system delivers even bass across the seats.',
  'The result is uniform bass across the room.',
  'Every seat gets the same bass.',
  'You hear similar bass in every seat.',
  'There are no bad seats in this design.',
  'There are no cheap seats in this room.',
];

/** The saved draft with one section's text replaced, so its word count stays inside its limit. */
const replaceSection = (section, text, claimIds = []) => {
  const copy = JSON.parse(JSON.stringify(draft));
  const target = copy.sections.find((entry) => entry.section === section);
  target.text = text;
  target.claim_ids = claimIds;
  return copy;
};

/** The same input, with P20 no longer blocking a seat-to-seat consistency claim. */
const p20Supported = () => ({
  ...input,
  bass: {
    ...input.bass,
    blocked: (input.bass.blocked || []).filter((entry) => entry.reason !== BLOCK_REASON.NO_SOLVED_BASS_CONSISTENCY),
  },
});

test('a seat-to-seat consistency claim is refused where P20 does not support it', () => {
  assert.equal(
    input.bass.blocked.some((entry) => entry.reason === BLOCK_REASON.NO_SOLVED_BASS_CONSISTENCY),
    true,
    'the live pack records that P20 supports no seat-to-seat consistency',
  );

  for (const sentence of SEAT_CONSISTENCY) {
    const result = validate(amend('overall_design', sentence));
    assert.ok(
      codes(result).includes(WRITER_REJECTION.P20_BASS_CONTRADICTION),
      `${sentence} -> ${JSON.stringify(result.violations)}`,
    );
  }
});

test('the same claims pass where P20 supports the consistency', () => {
  const supported = p20Supported();

  for (const sentence of SEAT_CONSISTENCY) {
    const result = validate(amend('overall_design', sentence), supported);
    assert.equal(
      codes(result).includes(WRITER_REJECTION.P20_BASS_CONTRADICTION),
      false,
      `${sentence} -> ${JSON.stringify(result.violations)}`,
    );
  }
});

test('naming consistency as an open item passes, worded either way', () => {
  const p20 = claimOf('p20', 'modest_result') || claimOf('p20', 'shared_result');
  const grounded = [p20?.claim_id].filter(Boolean);

  for (const sentence of [
    'Bass consistency remains an area for calibration attention.',
    'Seat-to-seat consistency still needs calibration attention.',
  ]) {
    // The section holds this sentence alone, so its word count is not what is
    // being read here: the copy has to be valid outright.
    const result = validate(replaceSection('overall_design', sentence, grounded));
    assert.equal(result.valid, true, `${sentence} -> ${JSON.stringify(result.violations)}`);
  }
});

test('the bass wording the pack does allow still passes', () => {
  for (const sentence of [
    'The additional subwoofer package adds bass output authority.',
    'The design brings more bass impact.',
    'Bass extension reaches further down.',
    'The response is controlled at the RSP.',
  ]) {
    const result = validate(amend('overall_design', sentence));
    assert.equal(
      codes(result).includes(WRITER_REJECTION.P20_BASS_CONTRADICTION),
      false,
      `${sentence} -> ${JSON.stringify(result.violations)}`,
    );
  }
});