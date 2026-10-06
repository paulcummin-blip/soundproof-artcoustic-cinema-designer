// Phase 1: the frozen proposalEvidence pack.
//
// The pack is built from saved-report evidence only, and it carries Sound
// Proof's own deterministic interpretation of a comparison. These tests prove
// the facts are the reports' facts, that the classification and the claim rules
// behave, and that no live project state can enter the pack.
//
// The snapshot shape used here is the one the report-evidence reader assembles
// (base44/shared/proposalReportEvidenceReader.js, buildSnapshot): each field
// below is a field that reader fills from a version's own saved Visual and
// Technical Report evidence, and nothing else.
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

const AT = '2026-10-06T09:00:00.000Z';
const DIR = new URL('../base44/shared/proposalEvidence/', import.meta.url);

/* ── A snapshot in the shape the report-evidence reader produces ──────────── */

function snapshot({
  id,
  levels = { 12: 'L4', 13: 'L4', 14: 'L4', 18: 'L4', 19: 'L4', 20: 'L4' },
  values = { 12: '112 dBC', 13: '108 dBC', 14: '115 dB', 18: '22 Hz', 19: '+/-2 dB', 20: '+/-3 dB' },
  layout = '9.1.6',
  screen = '120" (16:9)',
  seating = 'Two rows of three',
  subwoofers = 'SUB4-12 x 2',
  fingerprint = 'eng:v1:design',
  reports = {},
}) {
  const parameters = Object.entries(levels).map(([parameter_id, level]) => {
    const value = values[parameter_id] ?? null;
    const label = `P${parameter_id}`;
    return {
      parameter_id: Number(parameter_id), key: label, title: label, area: 'RP22',
      level, value, text: `${level} · ${value}`, unit: null, context: null, source: 'technical_report',
    };
  });
  return {
    available: true,
    identity: {
      projectId: 'project', versionId: id,
      project_name: 'Kinema House', client_name: 'Mr and Mrs Client', project_reference: 'AC-2026-014',
      dealer_name: 'Sound Proof', engineeringFingerprint: fingerprint,
      generatedAt: '2026-10-06T08:00:00Z',
      technicalReportId: reports.technical || `${id}-technical`,
      visualReportId: reports.visual || `${id}-visual`,
      technicalEvidenceFingerprint: `re-${id}-technical`,
      visualEvidenceFingerprint: `re-${id}-visual`,
    },
    version: { id, name: id === 'a' ? 'Level 1' : 'Level 4' },
    room: {
      dimensions: { length_m: 6, width_m: 4.5, height_m: 2.4 }, volume_m3: 64.8,
      dimensions_text: '6.0 x 4.5 x 2.4 m', interpretation: 'A dedicated room',
      screen: {
        size_inches: screen === '120" (16:9)' ? 120 : 150,
        aspect_ratio: '16:9', screen_type: 'Projection screen',
        viewable_width_cm: 265.5, viewable_height_cm: 149.4,
        manual_dimensions: false, manual_width_m: null, manual_height_m: null,
        interpretation: `Screen: ${screen}`,
      },
      seating: { interpretation: seating, seat_count: 6, row_count: 2 },
    },
    seats: [{ id: 'r1c1', row: 1 }],
    viewing: {
      available: true, summary: 'Comfortable from every row', primary_floor: 'Level 4',
      per_seat: [{ seatId: 'r1c1', label: 'Row 1 seat 1', row: 1, distance_m: 3.2, horizontal_angle_deg: 0, vertical_angle_deg: 0, level: 'Level 4' }],
    },
    system: {
      configuration: { dolby_config: layout, text: `Dolby Atmos ${layout}` },
      channel_layout: { bed_channels: 9, overhead_channels: 6, dolby_subwoofer_channels: 1, total_discrete: 15, subwoofer_count: 2 },
      products_selected: {
        lcr: ['Q8-5 x 3'], surrounds: ['Q8-3 x 6'], overheads: ['Q8-2 x 6'], subwoofers: [subwoofers], acoustic_treatment: ['None specified'],
        rows: [
          { key: 'lcr', area: 'LCR', value: 'Q8-5 x 3' },
          { key: 'surrounds', area: 'Surrounds / wides', value: 'Q8-3 x 6' },
          { key: 'overheads', area: 'Overheads', value: 'Q8-2 x 6' },
          { key: 'subwoofers', area: 'Subwoofers', value: subwoofers },
          { key: 'acoustic_treatment', area: 'Acoustic treatment', value: 'None specified' },
        ],
      },
      products_selected_by_layer: {},
      product_roles: [{ role: 'lcr', role_description: 'LCR', model_label: 'Q8-5' }],
      subwoofer_strategy: null,
      amplification: { specified: true, power_w: 500 },
      acoustic_treatment: [],
    },
    rp22: { parameter_headlines: parameters, weaknesses: [], strengths: [] },
    report_parameters: parameters,
    bass: { available: true, p14: null, p18: null, p19: null, p20: null, subwoofer_strategy_summary: null },
    report_evidence: { visual_report_snapshot_id: `${id}-visual`, technical_report_snapshot_id: `${id}-technical` },
  };
}

/** One selected version, as the report-evidence reader returns it. */
const option = (id, overrides = {}) => ({
  version_id: id,
  version_name: id === 'a' ? 'Level 1' : 'Level 4',
  source: 'report-evidence',
  snapshot: snapshot({ id, ...overrides }),
});

/* The two options of the reference comparison: a Level 1 design and a Level 4
   design, the same room, screen, seating and system layout, different
   subwoofers, and the same bass consistency result (`+/-5 dB`) in both. */
const LEVELS_ONE = { 12: 'L2', 13: 'L2', 14: 'L2', 18: 'L3', 19: 'L3', 20: 'L1' };
const VALUES_ONE = { 12: '100 dBC', 13: '96 dBC', 14: '104 dB', 18: '25 Hz', 19: '+/-3 dB', 20: '+/-5 dB' };
const LEVELS_FOUR = { 12: 'L4', 13: 'L4', 14: 'L4', 18: 'L4', 19: 'L4', 20: 'L1' };
const VALUES_FOUR = { 12: '114 dBC', 13: '110 dBC', 14: '118 dB', 18: '20 Hz', 19: '+/-2 dB', 20: '+/-5 dB' };

/** The two-option fixture used by most tests below. */
const twoOptions = () => [
  option('a', { levels: LEVELS_ONE, values: VALUES_ONE, subwoofers: 'SUB3-12 x 2' }),
  option('b', { levels: LEVELS_FOUR, values: VALUES_FOUR, subwoofers: 'SUB4-12 x 2' }),
];

const pack = (versions = twoOptions(), generatedAt = AT) => buildProposalEvidence({ versions, generatedAt });
const area = (built, key) => built.classification.find((row) => row.area === key);
const claims = (built, key) => built.allowed_claims.filter((claim) => claim.area === key);

/* ── Facts ────────────────────────────────────────────────────────────────── */

test('the pack states its source and carries the reports own facts', () => {
  const built = pack();
  assert.deepEqual(built.evidence_basis.sources, ['saved-report-evidence']);
  assert.equal(built.schema_version, 1);
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