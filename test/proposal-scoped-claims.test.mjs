//
// Scoped seat-group claims: a design may be strong for the primary seats and
// weak for the secondary ones, and the saved reports state both. These tests
// prove the four things that keep that honest —
//
//   MINTING   a scoped claim exists only where the saved evidence states that
//             scope's own level, at L2 or higher, with at least two seats in the
//             scope;
//   WORDING   the client adjective is the level's own (L4 Excellent, L3 Great,
//             L2 Good) and an L1 result mints nothing;
//   SCOPE     a sentence naming the primary seats must cite a primary claim, and
//             a sentence about the seating area needs support that is not scoped
//             to one group — a narrower result is never written as a wider one;
//   SEMANTICS the whole-seat P20 block still stands while a scoped claim is
//             allowed, so a primary-seat result can be positive while the room is
//             not, and never the other way round.
//
// Every pack here is built by the real evidence builder from report evidence in
// the shape `readProposalReportEvidence` returns it. No GPT call is made.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { buildProposalEvidence } from '../base44/shared/proposalEvidence/proposalEvidenceBuilder.js';
import { buildWriterInput } from '../base44/shared/proposalWriter/writerInputBuilder.js';
import { validateWriterOutput } from '../base44/shared/proposalWriter/writerOutputValidator.js';
import { WRITER_REJECTION } from '../base44/shared/proposalWriter/writerContractSchema.js';
import { CLAIM_KIND } from '../base44/shared/proposalEvidence/evidencePackSchema.js';
import { REPORT_SNAPSHOT_TYPE } from '../src/components/report/reportSnapshotAuthority.js';
import { buildReportEvidence } from '../src/components/report/reportEvidenceAuthority.js';
import {
  MARQUEE_LEVELS_FOUR, MARQUEE_LEVELS_ONE, MARQUEE_VALUES_FOUR, MARQUEE_VALUES_ONE,
  option, seatScopes,
} from './fixtures/proposalEvidenceFixtures.mjs';
import { validDraft } from './fixtures/proposalWriterFixtures.mjs';

const AT = '2026-10-06T10:00:00.000Z';

/**
 * The Marquee pair — both designs stay at RP22 Level 1 for whole-seat
 * consistency — carrying the scoped results a saved report states.
 *
 * @param {Object} [scoped] — { primary: { p20: 'L4' }, secondary: {…}, primarySeats }
 */
function packFor({
  primary = {}, secondary = {}, all = {},
  primarySeats = 3, secondarySeats = 3,
  levels = {},
} = {}) {
  const scopes = seatScopes({ primary, secondary, all, primarySeats, secondarySeats });
  return buildProposalEvidence({
    versions: [
      option('a', {
        levels: { ...MARQUEE_LEVELS_ONE, ...(levels.one || {}) },
        values: MARQUEE_VALUES_ONE,
        subwoofers: 'SUB3-12 x 2',
        seatScopes: scopes,
      }),
      option('b', {
        levels: { ...MARQUEE_LEVELS_FOUR, ...(levels.four || {}) },
        values: MARQUEE_VALUES_FOUR,
        subwoofers: 'SUB4-12 x 4',
        seatScopes: scopes,
      }),
    ],
    generatedAt: AT,
  });
}

const scopedClaimsOf = (pack, area) => pack.allowed_claims
  .filter((claim) => claim.kind === CLAIM_KIND.SCOPED_RESULT && claim.area === area);

const idsOf = (pack, filter) => pack.allowed_claims.filter(filter).map((claim) => claim.claim_id);

/** The pack's input, with one section replaced, so a single sentence is under test. */
function validateSentence(pack, section, sentence, claimIds) {
  const input = buildWriterInput({ pack });
  const draft = validDraft(input);
  const target = draft.sections.find((entry) => entry.section === section);
  target.text = sentence;
  target.claim_ids = claimIds;
  return validateWriterOutput({ input, output: draft });
}

const codes = (result) => result.violations.map((entry) => entry.code);

/* ── The scoped claim schema ───────────────────────────────────────────────── */

test('a scoped claim carries its scope, seat count, level and authority', () => {
  const pack = packFor({ primary: { p20: 'L4' }, secondary: { p20: 'L1' } });
  const claims = scopedClaimsOf(pack, 'p20');

  assert.deepEqual(
    claims.map((entry) => entry.claim_id),
    ['claim_p20_primary_consistency_01', 'claim_p20_primary_consistency_02'],
    'each option states its own primary-seat result',
  );
  const claim = claims[0];

  assert.equal(claim.claim_id, 'claim_p20_primary_consistency_01');
  assert.equal(claim.statement, 'Bass consistency is excellent across the primary seats.');
  assert.equal(claim.scope, 'primary');
  assert.equal(claim.seat_count, 3);
  assert.equal(claim.level, 'L4');
  assert.equal(claim.wording_class, 'consistency');
  assert.equal(claim.wording, 'Excellent');
  assert.equal(claim.kind, CLAIM_KIND.SCOPED_RESULT);
  // The scoped summary states a level, so no figure is claimed for it.
  assert.equal(claim.value, null);
  assert.equal(claim.authority_fingerprint, pack.options[0].facts.fingerprints.engineering);
  assert.equal(claim.scope_fingerprint, pack.options[0].facts.fingerprints.seating_scope ?? null);
  assert.equal(claim.basis.report_snapshot_ids[0].technical_report_snapshot_id, 'a-technical');
});

test('the adjective is the level\'s own, and an L1 result mints no claim', () => {
  const expected = [
    ['L4', 'Excellent', true],
    ['L3', 'Great', true],
    ['L2', 'Good', true],
    ['L1', null, false],
  ];

  for (const [level, adjective, minted] of expected) {
    const pack = packFor({ primary: { p20: level }, secondary: { p20: 'L1' } });
    const claims = scopedClaimsOf(pack, 'p20');

    assert.equal(claims.length > 0, minted, `${level} -> ${JSON.stringify(claims)}`);
    if (!minted) continue;
    assert.ok(claims.every((entry) => entry.wording === adjective), JSON.stringify(claims));
    assert.ok(
      claims.every((entry) => entry.statement === `Bass consistency is ${adjective.toLowerCase()} across the primary seats.`),
      JSON.stringify(claims.map((entry) => entry.statement)),
    );
  }
});

test('a scope needs at least two seats, and a stated level, before it carries a claim', () => {
  const single = packFor({ primary: { p20: 'L4' }, primarySeats: 1 });
  assert.deepEqual(scopedClaimsOf(single, 'p20'), [], 'one primary seat carries no group claim');

  const unstated = packFor({ primary: {}, secondary: {} });
  assert.deepEqual(scopedClaimsOf(unstated, 'p20'), [], 'no stated scoped level mints nothing');
});

test('a pack whose evidence states no scoped summary carries no scoped claim', () => {
  const pack = buildProposalEvidence({ versions: [option('a', {}), option('b', {})], generatedAt: AT });

  assert.deepEqual(pack.allowed_claims.filter((claim) => claim.kind === CLAIM_KIND.SCOPED_RESULT), []);
  // No scoped fact is added at all, so a pack built from unscoped evidence is
  // unchanged by the scoped-claim rule.
  assert.equal(pack.options[0].facts.seat_scopes, undefined);
  assert.equal(pack.options[0].facts.fingerprints.seating_scope, undefined);
});

/* ── A: P20 primary L4, secondary L1 ───────────────────────────────────────── */

test('A. an excellent primary-seat result passes; the same claim about the seating area is refused', () => {
  const pack = packFor({ primary: { p20: 'L4' }, secondary: { p20: 'L1' } });
  const primary = 'claim_p20_primary_consistency_01';

  const pass = validateSentence(pack, 'overall_design', 'Excellent bass consistency across the primary seats.', [primary]);
  assert.equal(pass.valid, true, JSON.stringify(pass.violations));

  const promoted = validateSentence(pack, 'overall_design', 'Excellent bass consistency across the seating area.', [primary]);
  assert.equal(promoted.valid, false, 'a primary-seat result may not be written as a whole-room one');
  assert.ok(codes(promoted).includes(WRITER_REJECTION.SCOPE_MISMATCH), JSON.stringify(promoted.violations));
  assert.ok(codes(promoted).includes(WRITER_REJECTION.P20_BASS_CONTRADICTION), JSON.stringify(promoted.violations));
});

/* ── B and C: P20 primary L3, then L2 ─────────────────────────────────────── */

test('B. a great primary-seat result passes where the primary seats are L3', () => {
  const pack = packFor({ primary: { p20: 'L3' }, secondary: { p20: 'L1' } });
  const result = validateSentence(pack, 'overall_design', 'Great bass consistency across the primary seats.', ['claim_p20_primary_consistency_01']);

  assert.equal(result.valid, true, JSON.stringify(result.violations));
});

test('C. a good primary-seat result passes where the primary seats are L2', () => {
  const pack = packFor({ primary: { p20: 'L2' }, secondary: { p20: 'L1' } });
  const result = validateSentence(pack, 'overall_design', 'Good bass consistency across the primary seats.', ['claim_p20_primary_consistency_01']);

  assert.equal(result.valid, true, JSON.stringify(result.violations));
});

test('an adjective above the stated level is refused', () => {
  const pack = packFor({ primary: { p20: 'L2' }, secondary: { p20: 'L1' } });
  const result = validateSentence(pack, 'overall_design', 'Excellent bass consistency across the primary seats.', ['claim_p20_primary_consistency_01']);

  assert.equal(result.valid, false, 'an L2 result may not be written as excellent');
  assert.ok(codes(result).includes(WRITER_REJECTION.SCOPE_MISMATCH), JSON.stringify(result.violations));
});

/* ── D: P20 primary L1 ────────────────────────────────────────────────────── */

test('D. positive consistency wording is refused where the primary seats are L1', () => {
  const pack = packFor({ primary: { p20: 'L1' }, secondary: { p20: 'L1' } });
  assert.deepEqual(scopedClaimsOf(pack, 'p20'), [], 'an L1 result mints no primary-seat claim');

  const result = validateSentence(pack, 'overall_design', 'Good bass consistency across the primary seats.', idsOf(pack, (claim) => claim.area === 'p20'));
  assert.equal(result.valid, false, JSON.stringify(result.violations));
  assert.ok(codes(result).includes(WRITER_REJECTION.SCOPE_MISMATCH), JSON.stringify(result.violations));
});

/* ── E: a single primary seat ─────────────────────────────────────────────── */

test('E. a single primary seat supports no consistency claim across the primary seats', () => {
  const pack = packFor({ primary: { p20: 'L4' }, primarySeats: 1 });

  assert.deepEqual(scopedClaimsOf(pack, 'p20'), [], 'one seat is not a group');
  const result = validateSentence(pack, 'overall_design', 'Excellent bass consistency across the primary seats.', idsOf(pack, (claim) => claim.area === 'p20'));
  assert.equal(result.valid, false, JSON.stringify(result.violations));
  assert.ok(codes(result).includes(WRITER_REJECTION.SCOPE_MISMATCH), JSON.stringify(result.violations));
});

/* ── F: P5 spacing, primary L4 while the design overall is lower ──────────── */

test('F. P5 spacing may be excellent for the primary seats and never generalised', () => {
  // The whole-seat P5 result is L2 in both designs: the primary seats are where
  // the L4 spacing result was achieved.
  const pack = packFor({
    primary: { p5: 'L4' }, secondary: { p5: 'L2' },
    levels: { one: { 5: 'L2' }, four: { 5: 'L2' } },
  });
  const primary = 'claim_p5_primary_spacing_01';

  const spacing = scopedClaimsOf(pack, 'p5').map((entry) => entry.claim_id);
  assert.ok(spacing.includes(primary), JSON.stringify(spacing));

  const pass = validateSentence(pack, 'key_performance_highlights', 'Excellent spacing across the primary seats.', [primary]);
  assert.equal(pass.valid, true, JSON.stringify(pass.violations));

  const promoted = validateSentence(pack, 'key_performance_highlights', 'Excellent spacing across all seats.', [primary]);
  assert.equal(promoted.valid, false, 'a primary-seat result may not be generalised to every seat');
  assert.ok(codes(promoted).includes(WRITER_REJECTION.SCOPE_MISMATCH), JSON.stringify(promoted.violations));

  // Nor may it be stated at the whole-seat level, which the evidence records as L2.
  const overstated = validateSentence(
    pack, 'key_performance_highlights', 'Excellent spacing across all seats.',
    idsOf(pack, (claim) => claim.area === 'p5' && claim.kind !== CLAIM_KIND.SCOPED_RESULT),
  );
  assert.equal(overstated.valid, false, JSON.stringify(overstated.violations));
  assert.ok(codes(overstated).includes(WRITER_REJECTION.SCOPE_MISMATCH), JSON.stringify(overstated.violations));
});

/* ── G: scope fidelity, both ways ─────────────────────────────────────────── */

test('G. a primary claim id cannot support an all-seat sentence, and a scope may not be over-claimed', () => {
  const pack = packFor({ primary: { p20: 'L4', p10: 'L4' }, secondary: { p20: 'L1', p10: 'L2' } });

  assert.deepEqual(
    scopedClaimsOf(pack, 'p10').map((claim) => claim.claim_id).sort(),
    [
      'claim_p10_primary_consistency_01', 'claim_p10_primary_consistency_02',
      'claim_p10_secondary_consistency_01', 'claim_p10_secondary_consistency_02',
    ],
  );

  // The primary claim supports the primary sentence …
  const scoped = validateSentence(pack, 'overall_design', 'Excellent bass consistency across the primary seats.', ['claim_p20_primary_consistency_01']);
  assert.equal(scoped.valid, true, JSON.stringify(scoped.violations));

  // … and never the wider one, whichever way the sentence is worded.
  for (const sentence of [
    'Excellent bass consistency across the seating area.',
    'Excellent bass consistency for every seat.',
    'The room achieves excellent bass consistency.',
  ]) {
    const wider = validateSentence(pack, 'overall_design', sentence, ['claim_p20_primary_consistency_01']);
    assert.ok(codes(wider).includes(WRITER_REJECTION.SCOPE_MISMATCH), `${sentence} -> ${JSON.stringify(wider.violations)}`);
  }

  // The secondary seats are L2, so their own result may be claimed as good.
  const secondary = validateSentence(pack, 'overall_design', 'Good overhead consistency across the secondary seats.', ['claim_p10_secondary_consistency_01']);
  assert.equal(secondary.valid, true, JSON.stringify(secondary.violations));

  // A secondary sentence may not borrow the primary seats' claim.
  const borrowed = validateSentence(pack, 'overall_design', 'Excellent overhead consistency across the secondary seats.', ['claim_p10_primary_consistency_01']);
  assert.equal(borrowed.valid, false, JSON.stringify(borrowed.violations));
  assert.ok(codes(borrowed).includes(WRITER_REJECTION.SCOPE_MISMATCH), JSON.stringify(borrowed.violations));
});

test('the whole-seat P20 block still stands while a scoped claim is allowed', () => {
  const pack = packFor({ primary: { p20: 'L4' }, secondary: { p20: 'L1' } });

  assert.equal(pack.bass_claims.p20.supports_consistency, false, 'the whole-seat result still supports none');
  assert.ok(
    pack.bass_claims.blocked.some((entry) => entry.reason === 'no_solved_bass_consistency'),
    JSON.stringify(pack.bass_claims.blocked),
  );
  assert.ok(
    pack.blocked_claims.some((block) => block.area === 'p20' && block.reason === 'no_solved_bass_consistency'),
    JSON.stringify(pack.blocked_claims.filter((block) => block.area === 'p20')),
  );
  // The block itself now says which scope it applies to, and what may still be said.
  const block = pack.blocked_claims.find((entry) => entry.area === 'p20' && entry.reason === 'no_solved_bass_consistency');
  assert.match(block.prohibited, /seating area as a whole/);
  // And the scoped claim is carried as an allowed bass claim, for that scope alone.
  assert.ok(
    pack.bass_claims.allowed.some((entry) => entry.claim_id === 'claim_p20_primary_consistency_01' && entry.seat_scope === 'primary'),
    JSON.stringify(pack.bass_claims.allowed),
  );
});

test('two options each state their own scoped result, under their own claim ID', () => {
  const pack = packFor({ primary: { p20: 'L4' }, secondary: { p20: 'L1' } });
  const claims = scopedClaimsOf(pack, 'p20');

  assert.equal(claims.length, 2, JSON.stringify(claims.map((entry) => entry.claim_id)));
  assert.notEqual(claims[0].claim_id, claims[1].claim_id);
  assert.equal(claims[0].option.version_id, 'a');
  assert.equal(claims[1].option.version_id, 'b');
});

test('a scoped claim reaches the writer input with its scope and level', () => {
  const pack = packFor({ primary: { p20: 'L4', p5: 'L4' }, secondary: { p10: 'L2' } });
  const input = buildWriterInput({ pack });
  const scoped = input.allowed_claims.filter((claim) => claim.scope === 'primary' || claim.scope === 'secondary');

  const ids = scoped.map((claim) => claim.claim_id);
  assert.deepEqual([...new Set(ids)], ids, 'every scoped claim carries its own ID');
  for (const expected of ['claim_p10_secondary_consistency_01', 'claim_p20_primary_consistency_01', 'claim_p5_primary_spacing_01']) {
    assert.ok(ids.includes(expected), `${expected} is in ${JSON.stringify(ids)}`);
  }
  const primary = scoped.find((claim) => claim.claim_id === 'claim_p20_primary_consistency_01');
  assert.equal(primary.scope, 'primary');
  assert.equal(primary.level, 'L4');
  assert.equal(primary.seat_count, 3);
  assert.equal(primary.wording_class, 'consistency');
  assert.equal(primary.wording, 'Excellent');
  assert.equal(primary.scope_fingerprint, input.evidence_pack.options[0].facts.fingerprints.seating_scope ?? null);
  // An unscoped claim still states the levels behind it, so an adjective can be
  // held to the result the reports actually record.
  const shared = input.allowed_claims.find((claim) => claim.area === 'p20' && claim.kind !== CLAIM_KIND.SCOPED_RESULT);
  assert.ok(Array.isArray(shared.levels) && shared.levels.length > 0, JSON.stringify(shared.levels));
});

/* ── Where the scoped results come from ───────────────────────────────────── */

test('the saved evidence states the scoped summaries the reports carry, and only those', () => {
  const evidence = buildReportEvidence({
    reportType: REPORT_SNAPSHOT_TYPE.TECHNICAL,
    captured: {
      identity: { projectId: 'project', versionId: 'v1' },
      report_parameters: [],
      seats: [
        { id: 's1', priority: 'primary' },
        { id: 's2', priority: 'primary' },
        { id: 's3', priority: 'secondary' },
      ],
      report_engineering_summary: {
        parameterSummaries: {
          primary: { p20: { level: 'L4', scope: 'seat' }, p5: { level: 'L4', scope: 'seat' } },
          secondary: { p20: { level: 'L1', scope: 'seat' }, p5: { level: null, scope: 'seat' } },
          project: { p20: { level: 'L1', scope: 'seat' } },
        },
      },
    },
  });

  assert.equal(evidence.seat_scopes.primary.seat_count, 2);
  assert.equal(evidence.seat_scopes.primary.parameters.p20.level, 'L4');
  assert.equal(evidence.seat_scopes.primary.parameters.p5.level, 'L4');
  assert.equal(evidence.seat_scopes.secondary.seat_count, 1);
  assert.equal(evidence.seat_scopes.secondary.parameters.p20.level, 'L1');
  assert.equal(evidence.seat_scopes.secondary.parameters.p5.level, null);
  assert.equal(evidence.seat_scopes.all.parameters.p20.level, 'L1');

  // A capture that states no scoped summary states none in its evidence either:
  // no scope is available, so no scoped claim can ever be minted from it.
  const bare = buildReportEvidence({
    reportType: REPORT_SNAPSHOT_TYPE.TECHNICAL,
    captured: { identity: { projectId: 'project', versionId: 'v2' }, report_parameters: [] },
  });
  assert.equal(bare.seat_scopes.primary.available, false);
  assert.equal(bare.seat_scopes.primary.seat_count, 0);
  assert.deepEqual(bare.seat_scopes.primary.parameters, {});
});