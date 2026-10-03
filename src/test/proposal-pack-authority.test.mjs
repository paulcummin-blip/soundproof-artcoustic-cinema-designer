/**
 * Acceptance tests for the designed client specification pack.
 *
 * Covers: the at-a-glance page (project, room, screen, viewing, system and the
 * package, stated once), the per-structure evidence cards (correct parameters
 * only, whole numbers, every gain populated), the approved method and appendix
 * copy, and the rule that no pack copy invents a value or names the platform.
 *
 * Pure: no React, no database, no browser.
 *
 * Run: npx vitest run test/proposal-pack-authority.test.mjs
 */

import assert from 'node:assert/strict';
import { describe, it } from 'vitest';

import {
  APPENDIX_PAGE,
  METHOD_PAGE,
  buildAtAGlance,
  buildEvidenceCards,
  parameterReferenceList,
  ukDate,
} from '../../src/components/proposal/print/proposalPackAuthority.js';

const SNAPSHOT = {
  available: true,
  project: { project_name: 'Lords Hall', client_name: 'Mr Clarke', dealer_company: 'Ribble AV' },
  version: { name: 'Current Design', number: 1 },
  identity: { generatedAt: '2026-09-14T10:00:00.000Z' },
  room: {
    dimensions_text: '7.0m × 5.0m × 2.6m (L × W × H)',
    volume_m3: 91,
    classification: { statement: 'rectangular room' },
    ratio: { statement: '1.40:1 length-to-width ratio' },
    acoustic_implication: { statement: 'Standard modal distribution in this room.' },
    screen: {
      size_inches: 169,
      viewable_width_inches: 147,
      aspect_ratio: '16:9',
      mount_mode: 'baffle',
    },
    screen_wall: {
      construction_type: { statement: 'baffle wall' },
      detail: { statement: 'Speakers mounted behind an acoustically transparent screen.' },
    },
    seating: { row_count: 2, total_seats: 8, row_spacing_m: 1.8 },
    acoustic_treatment: { enabled: false },
  },
  system: {
    configuration: {
      dolby_config: '9.4.6',
      text: '9.4.6 Dolby Atmos configuration (9 bed channels, 4 subwoofers, 6 overhead channels)',
    },
    channel_layout: { total_discrete: 15, subwoofer_count: 4 },
    product_roles: [
      { role: 'lcr', role_description: 'Left/Centre/Right (screen wall)', model_label: 'EVOLVE 2-1' },
      { role: 'surround', role_description: 'Side surround', model_label: 'SL-EVOLVE 1-1' },
      { role: 'subwoofer', role_description: 'Subwoofer', model_label: 'SUB2-12' },
    ],
  },
  viewing: {
    available: true,
    summary: 'Viewing angles calculated for 8 seats. Horizontal viewing angle ranges from 47° to 56°.',
    primary_floor: 'L4',
    project_floor: 'L4',
    per_seat: [
      { seat_id: 's1', horizontal_angle_deg: 55.5, rp23_level: 'L4' },
      { seat_id: 's2', horizontal_angle_deg: 47.2, rp23_level: 'L4' },
    ],
  },
  products: [{ model_key: 'evolve-2-1' }, { model_key: 'sl-evolve-1-1' }],
};

const ROWS = [
  { key: 'rp23_viewing', area: 'RP23 viewing', result: 'L4 · 55.5°', what_the_room_gains: '' },
  { key: 'p2', area: 'Discrete channels', result: 'L4 · 15', what_the_room_gains: '' },
  { key: 'p5', area: 'Horizontal spacing', result: 'L1 · 47.8', what_the_room_gains: '' },
  { key: 'p9', area: 'Overhead spacing', result: 'L2 · 39.4°', what_the_room_gains: '' },
  { key: 'p12', area: 'Screen Dynamic Range', result: 'L4 · 106.0 dBC', what_the_room_gains: '' },
  { key: 'p14', area: 'LFE and subwoofer Dynamic Range', result: 'L4 · 112.2 dBC', what_the_room_gains: '' },
  { key: 'p16', area: 'Screen timbre', result: 'L3 · 2.4 dB', what_the_room_gains: '' },
  { key: 'p18', area: 'Bass extension', result: 'L4 · 16.4 Hz', what_the_room_gains: '' },
  { key: 'p20', area: 'Bass consistency', result: 'L3 · 5.6 dB', what_the_room_gains: '' },
];

const GLANCE = buildAtAGlance({
  snapshot: SNAPSHOT,
  projectName: 'Lords Hall',
  dealerName: 'Ribble AV',
  projectReference: 'LH-001',
  generatedDate: '2026-09-14',
});

const ALL_CARDS = [...GLANCE.projectCards, ...GLANCE.roomCards, ...GLANCE.systemCards];
const byLabel = new Map(ALL_CARDS.map((card) => [card.label, card]));

describe('at a glance page', () => {
  it('carries the project facts the client needs', () => {
    ['Project', 'Client', 'Dealer', 'Project reference', 'Design version', 'Date'].forEach((label) => {
      assert.ok(byLabel.has(label), label);
    });
    assert.equal(byLabel.get('Project').value, 'Lords Hall');
    assert.equal(byLabel.get('Project reference').value, 'LH-001');
    assert.equal(byLabel.get('Design version').value, 'Current Design · V1');
    assert.equal(byLabel.get('Date').value, '14/09/2026');
  });

  it('states the room, screen, seating and viewing geometry as facts', () => {
    assert.equal(byLabel.get('Room size').value, '7.0 × 5.0 × 2.6 m');
    assert.equal(byLabel.get('Room size').hint, 'L × W × H');
    assert.equal(byLabel.get('Screen').value, '147" 16:9 viewable image');
    assert.equal(byLabel.get('Screen').hint, '169" overall screen assembly');
    assert.equal(byLabel.get('Seating').value, '8 seats');
    assert.equal(byLabel.get('Seating').hint, '2 rows');
    // Whole degrees, and never the viewing authority's prose sentence.
    assert.equal(byLabel.get('Viewing geometry').value, 'L4 · 47° to 56°');
  });

  it('states the layout and the channel count on the system card', () => {
    assert.equal(byLabel.get('System layout').value, '9.4.6');
    assert.equal(byLabel.get('System layout').hint, '15 discrete channels');
  });

  it('states the selected package once, grouped by channel role', () => {
    assert.deepEqual(GLANCE.packageRows, [
      { role: 'LCR', model: 'EVOLVE 2-1' },
      { role: 'Surrounds / wides', model: 'SL-EVOLVE 1-1' },
      { role: 'Subwoofers', model: '4 × SUB2-12' },
    ]);
  });

  it('states the room’s own constraint as one short brief line', () => {
    assert.equal(GLANCE.briefNote, 'Standard modal distribution in this room.');
    assert.ok(!GLANCE.briefNote.includes('\n'));
  });

  it('keeps every card to a fact, with no commentary', () => {
    ALL_CARDS.forEach((card) => {
      const text = `${card.value} ${card.hint || ''}`;
      assert.ok(!/rectangular room|near-cubic|golden ratio/i.test(text), card.label);
      assert.ok(!/products specified/i.test(text), card.label);
      assert.ok(!/published/i.test(text), card.label);
      assert.ok(!/\bRP23 viewing\b/i.test(text), card.label);
      assert.ok(!/auto-calculated/i.test(text), card.label);
      // No card carries a sentence: a value is a figure, a name or a short label.
      assert.ok(text.split(/\s+/).length <= 6, `${card.label}: ${text}`);
    });
  });

  it('leaves out the facts that would repeat another page or card', () => {
    ['Loudspeakers', 'Modelled against', 'Prepared by', 'Room form', 'Room', 'Viewing', 'Acoustic treatment']
      .forEach((label) => assert.ok(!byLabel.has(label), label));
    assert.deepEqual(GLANCE.systemCards.map((card) => card.label), ['System layout']);
  });

  it('never prints an empty card and never names the platform', () => {
    ALL_CARDS.forEach((card) => assert.ok(card.value, card.label));
    assert.ok(!JSON.stringify(GLANCE).toLowerCase().includes('base44'));
  });

  it('says nothing about treatment when none is specified, and states it briefly when it is', () => {
    const withTreatment = buildAtAGlance({
      snapshot: {
        ...SNAPSHOT,
        room: { ...SNAPSHOT.room, acoustic_treatment: { enabled: true, quantity: 8 } },
      },
      projectName: 'Lords Hall',
    });
    const treatment = withTreatment.roomCards.find((card) => card.label === 'Acoustic treatment');
    assert.equal(treatment.value, '8 Abfuser panels');
    assert.equal(treatment.hint, null);
  });
});

describe('no fact is stated twice', () => {
  it('never repeats a value across the cards and the package', () => {
    const cardValues = ALL_CARDS.map((card) => card.value);
    assert.equal(new Set(cardValues).size, cardValues.length);

    // The speaker models are stated in the package and nowhere in a card.
    const packageModels = GLANCE.packageRows.map((row) => row.model);
    cardValues.forEach((value) => {
      packageModels.forEach((model) => {
        assert.ok(!value.includes(model.split(' · ')[0]) || value === model, value);
      });
    });
  });

  it('keeps one card per label', () => {
    const labels = ALL_CARDS.map((card) => card.label);
    assert.equal(new Set(labels).size, labels.length);
  });
});

describe('structure evidence cards', () => {
  it('shows only the parameters that belong to the section', () => {
    const spatial = buildEvidenceCards(ROWS, 'spatial_resolution').map((card) => card.key);
    assert.deepEqual(spatial, ['p2', 'p5', 'p9']);

    const dynamic = buildEvidenceCards(ROWS, 'dynamic_range').map((card) => card.key);
    assert.deepEqual(dynamic, ['p12', 'p14']);

    const timbre = buildEvidenceCards(ROWS, 'timbre_matching').map((card) => card.key);
    assert.deepEqual(timbre, ['p16', 'p18', 'p20']);
  });

  it('names the parameter source and keeps the gain populated', () => {
    const cards = buildEvidenceCards(ROWS, 'spatial_resolution');
    assert.equal(cards[0].parameter, 'P2 discrete channels');
    cards.forEach((card) => assert.ok(card.gain.length > 15, card.key));
  });

  it('states results as whole degrees, dB and Hz', () => {
    const all = [
      ...buildEvidenceCards(ROWS, 'spatial_resolution'),
      ...buildEvidenceCards(ROWS, 'dynamic_range'),
      ...buildEvidenceCards(ROWS, 'timbre_matching'),
    ];
    all.forEach((card) => {
      assert.ok(!/\d\.\d/.test(card.result), `${card.key}: ${card.result}`);
    });
    assert.equal(all.find((card) => card.key === 'p5').result, 'L1 · 48°');
    assert.equal(all.find((card) => card.key === 'p18').result, 'L4 · 16 Hz');
  });

  it('returns nothing for a section with no parameter set', () => {
    assert.deepEqual(buildEvidenceCards(ROWS, 'overall_design'), []);
  });
});

describe('approved explainer copy', () => {
  const text = [
    METHOD_PAGE.lead,
    ...METHOD_PAGE.blocks.flatMap((block) => [block.title, block.text]),
    ...METHOD_PAGE.notes,
    ...APPENDIX_PAGE.notes.flatMap((note) => [note.title, note.text]),
  ].join(' ');

  it('explains the method in plain English', () => {
    assert.ok(/models the room first/i.test(METHOD_PAGE.lead));
    assert.deepEqual(
      METHOD_PAGE.blocks.map((block) => block.title),
      ['Spatial Resolution', 'Dynamic Range', 'Timbre Matching']
    );
    assert.ok(METHOD_PAGE.notes.some((note) => /Level 4 is demanding/i.test(note)));
  });

  it('keeps the appendix factual and separate', () => {
    assert.ok(APPENDIX_PAGE.notes.some((note) => /calibration/i.test(note.text)));
    assert.ok(APPENDIX_PAGE.notes.some((note) => /internal design diagnostic/i.test(note.text)));
    assert.equal(parameterReferenceList().length, 15);
    assert.equal(parameterReferenceList()[0].label, 'P2 Discrete channels');
  });

  it('avoids em dashes and the banned marketing phrases', () => {
    assert.ok(!text.includes('\u2014'), 'em dash found');
    ['reference-grade', 'fluidly', 'unified approach', 'future considerations'].forEach((phrase) => {
      assert.ok(!text.toLowerCase().includes(phrase), phrase);
    });
  });

  it('formats dates in UK order', () => {
    assert.equal(ukDate('2026-09-14'), '14/09/2026');
    assert.equal(ukDate(null), null);
  });
});