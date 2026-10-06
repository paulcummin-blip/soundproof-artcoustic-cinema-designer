// Phase 1: the frozen proposalEvidence pack.
//
// The pack is built from saved-report evidence only, and it carries Sound
// Proof's own deterministic interpretation of a comparison. These tests prove
// the facts are the reports' facts, that the classification and the claim rules
// behave, and that no live project state can enter the pack.
//
// The snapshot shape used here is the one the report-evidence reader assembles
// (base44/shared/proposalReportEvidenceReader.js, buildSnapshot): each field in
// ./fixtures/proposalEvidenceFixtures.mjs is a field that reader fills from a
// version's own saved Visual and Technical Report evidence, and nothing else.
//
// Tests A–G are the Phase 1 safety fixes: the version-name source, the explicit
// room classification, the framing guard, the bass wording rule, the
// whole-design claims, and the Marquee pack the audit recorded.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  buildProposalEvidence,
} from '../base44/shared/proposalEvidence/proposalEvidenceBuilder.js';
import {
  CLASSIFICATION,
  CLAIM_KIND,
  BLOCK_REASON,
} from '../base44/shared/proposalEvidence/evidencePackSchema.js';
import { isBassConsistencyClaim } from '../base44/shared/proposalEvidence/proposalEvidenceWording.js';
import {
  EVIDENCE_AT as AT,
  LIVE_VERSION_NAME_DECOY,
  MARQUEE_LEVELS_FOUR,
  MARQUEE_LEVELS_ONE,
  MARQUEE_SUBWOOFER_SUMMARY,
  MARQUEE_VALUES_FOUR,
  MARQUEE_VALUES_ONE,
  marqueeOptions,
  option,
  twoOptions,
} from './fixtures/proposalEvidenceFixtures.mjs';

const DIR = new URL('../base44/shared/proposalEvidence/', import.meta.url);

/* The fixtures — a snapshot in the shape the report-evidence reader produces,
   the reference pair, and the Marquee pair — live in
   ./fixtures/proposalEvidenceFixtures.mjs. */

const pack = (versions = twoOptions(), generatedAt = AT) => buildProposalEvidence({ versions, generatedAt });
const area = (built, key) => built.classification.find((row) => row.area === key);
const claims = (built, key) => built.allowed_claims.filter((claim) => claim.area === key);

/* ── Facts ────────────────────────────────────────────────────────────────── */

test('the pack states its source and carries the reports own facts', () => {
  const built = pack();
  assert.deepEqual(built.evidence_basis.sources, ['saved-report-evidence']);
  assert.equal(built.schema_version, 2);
  assert.equal(built.mode, 'comparison');
  assert.equal(built.options.length, 2);
  assert.deepEqual(built.options[0].label, 'Option A');

  const facts = built.options[0].facts;
  assert.deepEqual(facts.report_snapshot_ids, { visual: 'a-visual', technical: 'a-technical' });
  assert.equal(facts.fingerprints.engineering, 'eng:v1:design');
  assert.equal(facts.fingerprints.technical_evidence, 're-a-technical');
  assert.deepEqual(facts.system.products.map((row) => row.value), ['Q8-5 x 3', 'Q8-3 x 6', 'Q8-2 x 6', 'SUB3-12 x 2', 'None specified']);
  assert.equal(facts.system.amplification, '500 W');
  assert.equal(facts.system.layout, '9.1.6 (15 discrete channels)');
  assert.equal(facts.room.dimensions_text, '6.0 x 4.5 x 2.4 m');
  assert.equal(facts.screen.size_inches, 120);
  assert.equal(facts.seating.seat_count, 6);
  assert.equal(facts.parameters.find((row) => row.parameter_id === 12).text, 'L2 · 100 dBC');
  assert.equal(facts.parameters.find((row) => row.parameter_id === 12).structure, 'Dynamic Range');
  assert.deepEqual(built.options.map((entry) => entry.version_id), ['a', 'b']);
});

test('excluded parameters never enter the pack', () => {
  const built = pack([{
    ...option('a'),
    snapshot: { ...option('a').snapshot, report_parameters: [
      ...option('a').snapshot.report_parameters,
      { parameter_id: 15, key: 'P15', title: 'Background noise', level: 'L2', value: 'NCB 22', text: 'L2 · NCB 22' },
      { parameter_id: 21, key: 'P21', title: 'Early reflections', level: 'L2', value: '-8 dB', text: 'L2 · -8 dB' },
      { parameter_id: 8, key: 'P8', title: 'Upfiring', level: 'L4', value: 'Used', text: 'L4 · Used' },
    ] },
  }, option('b')]);

  const serialised = JSON.stringify(built);
  for (const banned of [/P8\b/, /P15\b/, /P21\b/, /NCB/, /early reflection/i, /-8 dB/]) {
    assert.doesNotMatch(serialised, banned);
  }
  assert.equal(area(built, 'p15'), undefined);
  assert.equal(built.options[0].facts.parameters.some((row) => [8, 15, 21].includes(row.parameter_id)), false);
});

/* ── Classification ───────────────────────────────────────────────────────── */

test('a material dynamic-range gain is classified materially different', () => {
  const built = pack();
  for (const key of ['p12', 'p13', 'p14']) {
    assert.equal(area(built, key).classification, CLASSIFICATION.MATERIALLY_DIFFERENT, key);
    assert.equal(area(built, key).reason, 'higher_level_achieved');
  }
  const gain = claims(built, 'p12').find((claim) => claim.kind === CLAIM_KIND.MATERIAL_GAIN);
  assert.ok(gain, 'a material gain claim is minted for P12');
  assert.equal(gain.claim_id, 'claim_p12_material_gain_01');
  assert.equal(gain.favours, true);
  assert.equal(gain.option.version_name, 'Level 4');
  assert.match(gain.statement, /headroom/i);
  assert.deepEqual(gain.basis.report_snapshot_ids, [
    { version_id: 'a', visual_report_snapshot_id: 'a-visual', technical_report_snapshot_id: 'a-technical' },
    { version_id: 'b', visual_report_snapshot_id: 'b-visual', technical_report_snapshot_id: 'b-technical' },
  ]);
});

test('a difference between two low-grade results is not material, and blocks an improvement claim', () => {
  const built = pack([
    option('a', { levels: { 12: 'L1', 13: 'L1', 14: 'L1', 18: 'L4', 19: 'L4', 20: 'L1' }, values: { 12: '96 dBC', 13: '94 dBC', 14: '100 dB', 18: '22 Hz', 19: '+/-2 dB', 20: '+/-5 dB' } }),
    option('b', { levels: { 12: 'L2', 13: 'L2', 14: 'L2', 18: 'L4', 19: 'L4', 20: 'L1' }, values: { 12: '100 dBC', 13: '98 dBC', 14: '104 dB', 18: '22 Hz', 19: '+/-2 dB', 20: '+/-5 dB' } }),
  ]);

  assert.equal(area(built, 'p12').classification, CLASSIFICATION.NOT_MATERIALLY_DIFFERENT);
  assert.equal(area(built, 'p12').reason, 'both_results_low_grade');
  assert.equal(claims(built, 'p12').some((claim) => claim.kind === CLAIM_KIND.MATERIAL_GAIN), false);
  const modest = claims(built, 'p12').find((claim) => claim.kind === CLAIM_KIND.MODEST_RESULT);
  assert.ok(modest, 'the stated result is described honestly');
  assert.equal(modest.favours, false);
  assert.ok(built.blocked_claims.some((block) => block.area === 'p12' && block.reason === BLOCK_REASON.NO_CLAIMED_IMPROVEMENT));
});

test('an area every report states identically is the same, and an unstated area is not comparable', () => {
  const built = pack([
    option('a', { values: { 12: '112 dBC', 13: '108 dBC', 14: '115 dB', 18: '22 Hz', 19: '+/-2 dB', 20: '+/-3 dB' } }),
    option('b', { values: { 12: '112 dBC', 13: '108 dBC', 14: '115 dB', 18: '22 Hz', 19: '+/-2 dB', 20: '+/-3 dB' } }),
  ]);
  assert.equal(area(built, 'p12').classification, CLASSIFICATION.SAME);
  assert.equal(claims(built, 'p12')[0].kind, CLAIM_KIND.SHARED_RESULT);
  assert.ok(built.blocked_claims.some((block) => block.area === 'p12' && block.reason === BLOCK_REASON.NO_CLAIMED_CHANGE));

  // P18 is absent from the second option's report: no value is invented for it.
  const partial = pack([
    option('a'),
    { ...option('b'), snapshot: { ...option('b').snapshot, report_parameters: option('b').snapshot.report_parameters.filter((row) => row.parameter_id !== 18) } },
  ]);
  assert.equal(area(partial, 'p18').classification, CLASSIFICATION.NOT_COMPARABLE);
  assert.equal(claims(partial, 'p18').length, 0);
  assert.ok(partial.blocked_claims.some((block) => block.area === 'p18' && block.reason === BLOCK_REASON.NOT_COMPARABLE));
});

test('a shared format, screen and seating block any claimed change in them', () => {
  const built = pack();
  for (const key of ['system_layout', 'screen_size', 'seating']) {
    assert.equal(area(built, key).classification, CLASSIFICATION.SAME, key);
  }
  const reasons = built.blocked_claims.map((block) => block.reason);
  assert.ok(built.blocked_claims.some((block) => block.reason === BLOCK_REASON.NO_ADDED_CHANNELS));
  assert.ok(built.blocked_claims.some((block) => block.reason === BLOCK_REASON.NO_SCREEN_CHANGE));
  assert.ok(built.blocked_claims.some((block) => block.reason === BLOCK_REASON.NO_SEATING_CHANGE));
  assert.equal(reasons.includes(BLOCK_REASON.NO_CLAIMED_CHANGE), true);
});

test('a bass consistency result both reports state identically is never sold as solved', () => {
  const built = pack();
  assert.equal(area(built, 'p20').classification, CLASSIFICATION.SAME);
  assert.ok(built.blocked_claims.some((block) => block.area === 'p20' && block.reason === BLOCK_REASON.NO_SOLVED_BASS_CONSISTENCY));
  assert.equal(claims(built, 'p20').some((claim) => claim.kind === CLAIM_KIND.MATERIAL_GAIN), false);
  assert.ok(built.blocked_claims.some((block) => block.reason === BLOCK_REASON.NO_UNIVERSAL_IMPROVEMENT));
});

test('a change of equipment is a factual change, never a claimed gain', () => {
  const built = pack();
  assert.equal(area(built, 'subwoofers').classification, CLASSIFICATION.DIFFERENT);
  assert.equal(area(built, 'subwoofers').reason, 'different_equipment');
  const change = claims(built, 'subwoofers').find((claim) => claim.kind === CLAIM_KIND.FACTUAL_CHANGE);
  assert.ok(change);
  assert.equal(change.favours, false);
  assert.equal(change.option, null);
});

/* ── Decision framing ─────────────────────────────────────────────────────── */

test('the decision framing is allowed only when the evidence supports it', () => {
  const built = pack();
  assert.equal(built.decision_framing.allowed, true);
  assert.match(built.decision_framing.text, /^Level 1 gives the room the format\. Level 4 gives that format the authority/);
  assert.deepEqual(built.decision_framing.evidence.material_areas, ['p12', 'p13', 'p14']);
  assert.equal(built.decision_framing.evidence.option.version_name, 'Level 4');

  // A different format: there is no shared format for the framing to rest on.
  const differentFormat = pack([option('a'), option('b', { layout: '7.1.4' })]);
  assert.equal(differentFormat.decision_framing.allowed, false);
  assert.equal(differentFormat.decision_framing.reason, 'format_is_not_shared');
  assert.equal(differentFormat.decision_framing.text, null);
  assert.ok(differentFormat.blocked_claims.some((block) => block.reason === BLOCK_REASON.NO_DECISION_FRAMING));

  // The shared format, but no material dynamic-range difference to sell.
  const noGain = pack([
    option('a', { levels: { 12: 'L2', 13: 'L2', 14: 'L2', 18: 'L2', 19: 'L2', 20: 'L2' } }),
    option('b', { levels: { 12: 'L2', 13: 'L2', 14: 'L2', 18: 'L2', 19: 'L2', 20: 'L2' } }),
  ]);
  assert.equal(noGain.decision_framing.allowed, false);
  assert.equal(noGain.decision_framing.reason, 'no_material_dynamic_range_evidence');
});

/* ── Determinism and the live-state guard ─────────────────────────────────── */

test('the same evidence always mints the same pack, claim IDs and fingerprint', () => {
  const first = pack();
  const second = pack();
  assert.deepEqual(first, second);
  assert.equal(first.pack_fingerprint, second.pack_fingerprint);

  const changed = pack([option('a'), option('b', { values: { 12: '113 dBC', 13: '110 dBC', 14: '118 dB', 18: '20 Hz', 19: '+/-2 dB', 20: '+/-3 dB' } })]);
  assert.notEqual(changed.pack_fingerprint, first.pack_fingerprint, 'changed evidence changes the fingerprint');

  const ids = first.allowed_claims.map((claim) => claim.claim_id);
  assert.equal(new Set(ids).size, ids.length, 'every claim ID is unique');
  const blocks = first.blocked_claims.map((block) => block.block_id);
  assert.equal(new Set(blocks).size, blocks.length, 'every blocked claim ID is unique');
});

test('no live project state can enter the pack', () => {
  const clean = pack();

  // Live-project fields hung on the entries, including one that contradicts the
  // reports. The pack is built from the reports' evidence, so they are ignored.
  const decoy = twoOptions().map((entry) => ({
    ...entry,
    project: { roomDims: '{"widthM":99,"lengthM":99,"heightM":9}', active_version_id: 'other-version' },
    design_state: { seating_positions: [{ x: 99 }], selected_speakers: ['DECOY-SPEAKER'] },
    subwooferInstances: [{ model: 'DECOY-SUB' }],
    published_fingerprint: 'eng:v9:live',
  }));
  decoy[0].snapshot = { ...decoy[0].snapshot, liveProject: { seating_positions: [{ x: 99 }] } };

  const built = pack(decoy);
  assert.deepEqual(built, clean, 'the pack is identical whether or not live state is present');
  const serialised = JSON.stringify(built);
  for (const banned of ['DECOY', 'roomDims', 'subwooferInstances', 'seating_positions', 'selected_speakers', 'design_state', 'active_version_id']) {
    assert.equal(serialised.includes(banned), false, `${banned} must not appear`);
  }

  // The pack does read the evidence: change the report evidence and it changes.
  const changedEvidence = twoOptions();
  changedEvidence[1].snapshot.report_parameters = changedEvidence[1].snapshot.report_parameters
    .map((row) => (row.parameter_id === 12 ? { ...row, level: 'L3', text: 'L3 · 108 dBC' } : row));
  assert.notEqual(JSON.stringify(pack(changedEvidence)), serialised);
});

test('the pack modules can reach no live project, entity client or session store', () => {
  const files = readdirSync(DIR).filter((name) => name.endsWith('.js'));
  assert.ok(files.length >= 5, 'the pack is a set of focused modules');

  const allowed = new Set([
    './evidencePackSchema.js',
    './proposalEvidenceFacts.js',
    './proposalEvidenceClassification.js',
    './proposalEvidenceClaims.js',
    './proposalEvidenceDesignClaims.js',
    './proposalEvidenceIdentity.js',
    './proposalEvidenceWording.js',
    '../comparisonTable.js',
    '../comparisonClientMeaning.js',
    '../comparisonEvidence.js',
    '../adiReportEvidenceRules.js',
  ]);

  for (const name of files) {
    const source = readFileSync(new URL(name, DIR), 'utf8');
    for (const specifier of source.match(/from '[^']+'/g) || []) {
      const target = specifier.slice(6, -1);
      assert.ok(allowed.has(target), `${name} may not import ${target}`);
    }
    for (const banned of ['base44/entities', 'entities.', 'localStorage', 'sessionStorage', 'window.', 'subwooferInstances', 'roomDims', 'design_state']) {
      assert.equal(source.includes(banned), false, `${name} must not reference ${banned}`);
    }
  }
});

test('a single version is not a comparison: no classification and no claims are invented', () => {
  const built = pack([option('a')]);
  assert.equal(built.mode, 'single');
  assert.deepEqual(built.classification, []);
  assert.deepEqual(built.allowed_claims, []);
  assert.equal(built.decision_framing.allowed, false);
  assert.equal(built.decision_framing.reason, 'single_option');
  assert.ok(built.blocked_claims.length > 0, 'the global rules still apply');
  assert.equal(built.options[0].facts.system.products.length, 5);
});

/* ── A. The version-name source ────────────────────────────────────────────
   Every client-facing version name comes from the saved report evidence. The
   live ProjectVersion name, and the live name the reader also returns on the
   snapshot, are never read — and a version whose saved evidence states no name
   blocks the pack instead of being named from live state. */

test('A. a client-facing name is the saved evidence name, never the live version name', () => {
  const [first, second] = marqueeOptions();
  first.version_name = LIVE_VERSION_NAME_DECOY;
  first.snapshot.version.name = `${LIVE_VERSION_NAME_DECOY}-SNAPSHOT`;
  const built = pack([first, second]);

  assert.deepEqual(built.options.map((entry) => entry.version_name), ['Level 1', 'Level 4']);
  assert.deepEqual(built.options.map((entry) => entry.version_name_source.source), [
    'saved-report-evidence', 'saved-report-evidence',
  ]);
  assert.deepEqual(built.options.map((entry) => entry.version_name_source.from), [
    'technical_report', 'technical_report',
  ]);
  assert.equal(built.evidence_basis.version_names[0].reports_agree, true);

  const serialised = JSON.stringify(built);
  for (const live of [LIVE_VERSION_NAME_DECOY, `${LIVE_VERSION_NAME_DECOY}-SNAPSHOT`]) {
    assert.equal(serialised.includes(live), false, `${live} must not appear`);
  }

  // Every client-facing surface names an option with a saved-evidence name.
  const saved = new Set(['Level 1', 'Level 4']);
  assert.ok(built.allowed_claims.filter((claim) => claim.option)
    .every((claim) => saved.has(claim.option.version_name)));
  assert.ok(built.materiality_notes.filter((note) => note.option)
    .every((note) => saved.has(note.option.version_name)));
  assert.match(built.decision_framing.text, /^Level 1 gives the room the format\. Level 4 /);

  // No saved-evidence name: the pack is not generated at all.
  assert.throws(
    () => pack([option('a', { savedName: null }), option('b')]),
    /does not state this version's name/,
  );
});

/* ── B. The explicit room classification ──────────────────────────────────── */

test('B. the room is classified explicitly from the reports own room facts', () => {
  const built = pack(marqueeOptions());
  const room = area(built, 'room');
  assert.equal(room.classification, CLASSIFICATION.SAME);
  assert.equal(room.reason, 'identical_room_dimensions');
  assert.deepEqual(room.values, ['6.0 x 4.5 x 2.4 m', '6.0 x 4.5 x 2.4 m']);
  assert.ok(built.areas.some((entry) => entry.area === 'room'), 'the room is a classified area');

  // The same dimensions, worded differently: still the same room — the wording
  // is never what makes a room the same room, and it does not disturb the framing.
  const [first, second] = marqueeOptions();
  second.snapshot.room.dimensions_text = '6 x 4.5 x 2.4 metres';
  const reworded = pack([first, second]);
  assert.equal(area(reworded, 'room').classification, CLASSIFICATION.SAME);
  assert.equal(reworded.decision_framing.allowed, true);

  // A real dimension change: a different room, and no shared-format framing.
  const changed = pack([option('a'), option('b', { roomDims: { length_m: 7.2, width_m: 4.5, height_m: 2.4 } })]);
  assert.equal(area(changed, 'room').classification, CLASSIFICATION.DIFFERENT);
  assert.equal(area(changed, 'room').reason, 'different_room_dimensions');
  assert.equal(changed.decision_framing.allowed, false);
  assert.equal(changed.decision_framing.reason, 'room_is_not_shared');
  assert.equal(changed.decision_framing.text, null);

  // A report that states no room: not comparable, never filled in from the other.
  const unstated = pack([option('a'), option('b', { roomDims: null, roomText: null })]);
  assert.equal(area(unstated, 'room').classification, CLASSIFICATION.NOT_COMPARABLE);
  assert.equal(area(unstated, 'room').reason, 'not_stated_by_every_report');
});

/* ── C. The framing guard ──────────────────────────────────────────────────── */

test('C. a changed screen or seating blocks the same-format framing', () => {
  const screenChanged = pack([option('a'), option('b', { screen: '150" (16:9)' })]);
  assert.equal(area(screenChanged, 'screen_size').classification, CLASSIFICATION.DIFFERENT);
  assert.equal(screenChanged.decision_framing.allowed, false);
  assert.equal(screenChanged.decision_framing.reason, 'screen_is_not_shared');
  assert.equal(screenChanged.decision_framing.text, null);
  assert.equal(screenChanged.allowed_claims.some((claim) => claim.kind === CLAIM_KIND.RECOMMENDATION), false);
  assert.ok(screenChanged.blocked_claims.some((block) => block.reason === BLOCK_REASON.NO_DECISION_FRAMING));

  const seatingChanged = pack([option('a'), option('b', { seating: 'One row of four' })]);
  assert.equal(area(seatingChanged, 'seating').classification, CLASSIFICATION.DIFFERENT);
  assert.equal(seatingChanged.decision_framing.allowed, false);
  assert.equal(seatingChanged.decision_framing.reason, 'seating_is_not_shared');
  assert.equal(JSON.stringify(seatingChanged).includes('gives the room the format'), false);

  // The same screen, seating and room, but no material dynamic-range gain to
  // carry the framing: refused as well.
  const noGain = pack([option('a'), option('b', { layout: '7.1.4' })]);
  assert.equal(noGain.decision_framing.allowed, false);
  assert.equal(noGain.decision_framing.reason, 'format_is_not_shared');
});

/* ── D. The bass guard ─────────────────────────────────────────────────────── */

test('D. a bass consistency claim is blocked, and P20 cannot contradict the framing', () => {
  const built = pack(marqueeOptions());
  assert.equal(area(built, 'p20').classification, CLASSIFICATION.NOT_MATERIALLY_DIFFERENT);
  assert.equal(built.bass_claims.p20.supports_consistency, false);
  assert.equal(built.bass_claims.blocked.length, 1);
  assert.equal(built.bass_claims.blocked[0].reason, BLOCK_REASON.NO_SOLVED_BASS_CONSISTENCY);
  assert.equal(built.bass_claims.allowed.some((claim) => claim.scope === 'seat_to_seat_consistency'), false);
  assert.ok(
    built.blocked_claims.some((block) => block.block_id === built.bass_claims.blocked[0].block_id),
    'the bass rule is the one packed block, not a second copy of it',
  );

  // P20 materially favouring the other option contradicts the framing outright,
  // and a supported consistency claim is only ever the P20 result itself.
  const contradicted = pack([
    option('a', {
      levels: { ...MARQUEE_LEVELS_ONE, 20: 'L4' },
      values: { ...MARQUEE_VALUES_ONE, 20: '+/-2 dB' },
      subwoofers: 'SUB3-12 x 2',
    }),
    option('b', {
      levels: { ...MARQUEE_LEVELS_FOUR, 20: 'L1' },
      values: { ...MARQUEE_VALUES_FOUR, 20: '+/-13.2 dB' },
      subwoofers: 'SUB4-12 x 4',
    }),
  ]);
  assert.equal(area(contradicted, 'p20').classification, CLASSIFICATION.MATERIALLY_DIFFERENT);
  assert.equal(contradicted.bass_claims.p20.supports_consistency, true);
  assert.deepEqual(contradicted.bass_claims.blocked, []);
  assert.equal(contradicted.decision_framing.allowed, false);
  assert.equal(contradicted.decision_framing.reason, 'p20_contradicts_the_framing');
  assert.equal(contradicted.decision_framing.text, null);
});

/* ── E. The bass wording ───────────────────────────────────────────────────── */

test('E. no prohibited bass consistency wording appears while P20 remains Level 1', () => {
  assert.equal(isBassConsistencyClaim(MARQUEE_SUBWOOFER_SUMMARY), true, 'the fixture really states the claim');

  const built = pack(marqueeOptions());
  const serialised = JSON.stringify(built);
  for (const banned of [
    'maximum seat-to-seat bass consistency',
    'solves bass consistency',
    'materially even bass across all seats',
    'uniform bass across seats',
    'improved bass consistency',
  ]) {
    assert.equal(serialised.includes(banned), false, banned);
  }

  // The removal is audited by path and rule, never by the sentence itself.
  const removed = built.bass_claims.removed_wording
    .map((entry) => `${entry.version_id}:${entry.path}:${entry.rule}`)
    .sort();
  assert.deepEqual(removed, [
    'b:facts.bass.subwoofer_strategy_summary:maximum_consistency',
    'b:facts.system.subwoofer_strategy.strategy_text:maximum_consistency',
  ]);

  // What the report also said about the subwoofers survives.
  assert.equal(built.options[1].facts.bass.subwoofer_strategy_summary, '4 × SUB4-12');
  assert.equal(built.options[1].facts.system.subwoofer_strategy.strategy_text, '4 × SUB4-12');
  assert.equal(built.options[1].facts.system.products.find((row) => row.key === 'subwoofers').value, 'SUB4-12 x 4');

  // The bass claims the evidence does support, and the P20 note.
  assert.deepEqual(built.bass_claims.allowed.map((entry) => entry.scope), ['bass_output_authority', 'subwoofer_specification']);
  assert.equal(built.bass_claims.allowed[1].text, 'Level 4 is specified with SUB4-12 x 4 rather than SUB3-12 x 2.');
  assert.equal(
    built.materiality_notes.find((note) => note.area === 'p20').note,
    'Both designs remain Level 1 for seat-to-seat bass consistency. '
    + 'Level 4 improves bass output authority, not full-seat uniformity.',
  );
});

/* ── F. The Marquee pack ───────────────────────────────────────────────────── */

test('F. the Marquee pack allows what the evidence supports and blocks the rest', () => {
  const built = pack(marqueeOptions());
  const statements = built.allowed_claims.map((claim) => claim.statement);

  // Allowed.
  assert.ok(statements.some((line) => /More front-stage headroom/.test(line)), 'P12 headroom');
  assert.ok(statements.some((line) => /More capability around and above the seating/.test(line)), 'P13 capability');
  assert.ok(statements.some((line) => /More bass authority and physical impact/.test(line)), 'P14 bass authority');
  assert.ok(statements.includes('Level 1 remains a credible 9.1.6 design.'), 'the Level 1 design is credible');
  assert.ok(
    statements.includes('Level 4 is the stronger recommendation where maximum performance and headroom are the priority.'),
    'the Level 4 design is the stronger recommendation',
  );

  const recommendation = built.allowed_claims.find((claim) => claim.kind === CLAIM_KIND.RECOMMENDATION);
  assert.equal(recommendation.option.version_name, 'Level 4');
  assert.equal(recommendation.favours, true);
  assert.deepEqual(recommendation.basis.material_areas, ['p12', 'p13', 'p14']);
  assert.deepEqual(recommendation.basis.product_differences, ['subwoofers']);
  assert.equal(recommendation.basis.bass_consistency_claims, 'blocked');

  const credibility = built.allowed_claims.find((claim) => claim.kind === CLAIM_KIND.CREDIBILITY);
  assert.equal(credibility.option.version_name, 'Level 1');
  assert.equal(credibility.favours, false, 'a credible design is never presented as the gain');

  // Blocked.
  const reasons = new Set(built.blocked_claims.map((block) => block.reason));
  for (const reason of [
    BLOCK_REASON.NO_ADDED_CHANNELS,
    BLOCK_REASON.NO_SCREEN_CHANGE,
    BLOCK_REASON.NO_SEATING_CHANGE,
    BLOCK_REASON.NO_SOLVED_BASS_CONSISTENCY,
    BLOCK_REASON.NO_UNIVERSAL_IMPROVEMENT,
    BLOCK_REASON.NO_REDESIGN_RECOMMENDATION,
  ]) {
    assert.ok(reasons.has(reason), reason);
  }
  for (const key of ['system_layout', 'screen_size', 'seating']) {
    assert.equal(area(built, key).classification, CLASSIFICATION.SAME, key);
  }

  // The framing the pack allows, and the evidence it rests on.
  assert.equal(built.decision_framing.allowed, true);
  assert.deepEqual(built.decision_framing.evidence.shared_areas, ['room', 'screen_size', 'seating', 'system_layout']);
  assert.deepEqual(built.decision_framing.evidence.excludes, ['seat_to_seat_bass_consistency']);
  assert.equal(built.decision_framing.evidence.p20.consistency_claims, 'blocked');
});

/* ── G. Saved-evidence-only facts ──────────────────────────────────────────── */

test('G. no client-facing fact is sourced from live project or version state', () => {
  const entries = marqueeOptions();
  entries[1].version_name = LIVE_VERSION_NAME_DECOY;
  entries[1].snapshot.version.name = `${LIVE_VERSION_NAME_DECOY}-SNAPSHOT`;
  for (const entry of entries) {
    entry.project = { roomDims: '{"widthM":99,"lengthM":99,"heightM":9}', active_version_id: 'other-version' };
    entry.design_state = { seating_positions: [{ x: 99 }], selected_speakers: ['DECOY-SPEAKER'] };
    entry.subwooferInstances = [{ model: 'DECOY-SUB' }];
  }

  const built = pack(entries);
  const serialised = JSON.stringify(built);
  for (const live of [
    LIVE_VERSION_NAME_DECOY,
    'roomDims',
    'design_state',
    'subwooferInstances',
    'selected_speakers',
    'active_version_id',
    'DECOY',
  ]) {
    assert.equal(serialised.includes(live), false, `${live} must not appear`);
  }

  // Every client-facing name the pack states is a saved-evidence name.
  const saved = new Set(['Level 1', 'Level 4']);
  assert.ok(built.options.every((entry) => saved.has(entry.version_name)));
  assert.ok(built.allowed_claims.filter((claim) => claim.option).every((claim) => saved.has(claim.option.version_name)));
  assert.ok(built.materiality_notes.filter((note) => note.option).every((note) => saved.has(note.option.version_name)));
  assert.ok(built.evidence_basis.version_names.every((entry) => entry.source === 'saved-report-evidence'));
  assert.deepEqual(built.evidence_basis.sources, ['saved-report-evidence']);
  assert.match(built.decision_framing.text, /Level 1 gives the room the format\. Level 4 /);
});