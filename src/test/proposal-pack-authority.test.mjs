/**
 * Acceptance tests for the designed client specification pack.
 *
 * Covers: the at-a-glance summary fields, the room and brief facts and product
 * package, the per-structure evidence cards (correct parameters only, whole
 * numbers, every gain populated), the approved method and appendix copy, and
 * the rule that no pack copy invents a value or names the platform.
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
  buildAtAGlanceCards,
  buildDesignBriefNote,
  buildEvidenceCards,
  buildSelectedPackageRows,
  buildSystemHeadline,
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
      total_discrete_channels: 15,
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
    per_seat: [{ horizontal_angle_deg: 47.4 }, { horizontal_angle_deg: 61.8 }],
    primary_floor: 'L4',
    project_floor: 'L4',
    summary: 'Viewing angles calculated for 2 seats. Horizontal viewing angle ranges from 47° to 62°.',
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

describe('at a glance page', () => {
  const cards = buildAtAGlanceCards({
    snapshot: SNAPSHOT,
    projectName: 'Lords Hall',
    dealerName: 'Ribble AV',
    projectReference: 'LH-001',
    generatedDate: '2026-09-14',
  });
  const byLabel = new Map(cards.map((card) => [card.label, card]));

  it('carries the orienting fields the client needs', () => {
    [
      'Project',
      'Client',
      'Dealer',
      'Project reference',
      'Design version',
      'Date',
      'Room size',
      'Screen',
      'Seating',
      'Viewing geometry',
      'System layout',
    ].forEach((label) => assert.ok(byLabel.has(label), label));
  });

  it('states the project reference, the design version and the date', () => {
    assert.equal(byLabel.get('Project reference').value, 'LH-001');
    assert.equal(byLabel.get('Design version').value, 'Current Design · V1');
    assert.equal(byLabel.get('Date').value, '14/09/2026');
  });

  it('states the room, screen, seating and viewing geometry as facts', () => {
    assert.equal(byLabel.get('Room size').value, '7.0 × 5.0 × 2.6 m');
    assert.equal(byLabel.get('Room size').hint, 'L × W × H');
    // The canonical screen wording is the page's only screen statement: the
    // viewable image the screen is designed by, and the overall assembly.
    assert.equal(byLabel.get('Screen').value, '147" viewable 16:9 image');
    assert.equal(byLabel.get('Screen').hint, '169" overall screen assembly');
    assert.equal(byLabel.get('Seating').value, '8 seats');
    assert.equal(byLabel.get('Seating').hint, '2 rows');
    assert.equal(byLabel.get('Viewing geometry').value, 'L4 · 47° to 62°');
    assert.equal(byLabel.get('Viewing geometry').hint, 'Horizontal viewing angle');
  });

  it('states the system layout and how many channels it carries', () => {
    assert.equal(byLabel.get('System layout').value, '9.4.6');
    assert.equal(byLabel.get('System layout').hint, '15 discrete channels');
  });

  it('states each fact briefly, with no commentary inside a card', () => {
    // Treatment is not specified in this design, so the card is left out rather
    // than printing a sentence about what is absent.
    assert.ok(!byLabel.has('Acoustic treatment'), 'Acoustic treatment');

    // No card carries a sentence, a count of products, a publication date, a
    // room classification or an explanation: a fact card states its fact only.
    cards.forEach((card) => {
      const text = `${card.value} ${card.hint || ''}`;
      assert.ok(!/rectangular room|near-cubic|golden ratio/i.test(text), card.label);
      assert.ok(!/products specified/i.test(text), card.label);
      assert.ok(!/published/i.test(text), card.label);
      assert.ok(!/auto-calculated/i.test(text), card.label);
      assert.ok(!/none specified/i.test(text), card.label);
      assert.ok(!/\bRP23 viewing\b/i.test(text), card.label);
    });
  });

  it('names the speaker families in one headline, in the design order', () => {
    assert.equal(buildSystemHeadline(SNAPSHOT), 'EVOLVE 2-1 · SL-EVOLVE 1-1 · SUB2-12');
  });

  it('never prints an empty card and never names the platform', () => {
    cards.forEach((card) => assert.ok(card.value, card.label));
    assert.ok(!JSON.stringify(cards).toLowerCase().includes('base44'));
  });
});

describe('the package and the brief on the same page', () => {
  it('states the package once, grouped by channel, in design order', () => {
    assert.deepEqual(buildSelectedPackageRows(SNAPSHOT), [
      { role: 'LCR', model: 'EVOLVE 2-1' },
      { role: 'Surrounds / wides', model: 'SL-EVOLVE 1-1' },
      { role: 'Subwoofers', model: '4 × SUB2-12' },
    ]);
  });

  it('groups a snapshot written before the role keys were stored the same way', () => {
    const legacy = {
      ...SNAPSHOT,
      system: {
        ...SNAPSHOT.system,
        product_roles: [
          { role_description: 'Left/Centre/Right (screen wall)', model_label: 'EVOLVE 2-1' },
          { role_description: 'Side surround', model_label: 'SL-EVOLVE 1-1' },
          { role_description: 'Overhead/height', model_label: 'ARCHITECT 2-1' },
        ],
      },
    };
    assert.deepEqual(buildSelectedPackageRows(legacy).map((row) => row.role), [
      'LCR',
      'Surrounds / wides',
      'Overheads',
      'Subwoofers',
    ]);
  });

  it('states the design question the seating sets, and the room constraint', () => {
    const note = buildDesignBriefNote(SNAPSHOT);
    assert.equal(note.length, 2);
    assert.ok(/two rows/i.test(note[0]));
    assert.ok(/modal/i.test(note[1]));
  });

  it('writes no note at all when the design has nothing to say', () => {
    assert.deepEqual(buildDesignBriefNote({}), []);
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