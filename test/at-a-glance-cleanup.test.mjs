/**
 * Acceptance: the cleaned-up At a Glance page.
 * --------------------------------------------
 * A–I of the request:
 *   A no generic intro sentence under the heading
 *   B the dealer card is gone
 *   C the room size reads as three clean dimensions, with no axis line
 *   D the screen states the viewable image and never the assembly size
 *   E the seating states the seat count and not the row count
 *   F the viewing geometry states both rows, each with its own RP23 level
 *   G no single level is stated for the room, and no rows are averaged
 *   H no design brief block without a genuine brief
 *   I no filler subtext in any fact card
 *
 * Pure: no React, no database, no browser.
 *
 * Run: npx vitest run test/at-a-glance-cleanup.test.mjs
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'vitest';

import { buildAtAGlance } from '../src/components/proposal/print/proposalPackAuthority.js';

// Marquee Home, as the designer sees it in the Room Designer: a 2.35:1
// projection screen, 9 seats over 2 rows, 9.1.6.
const SNAPSHOT = {
  available: true,
  project: { project_name: 'Marquee Home', client_name: '34 AR', dealer_company: 'Sound Proof' },
  version: { name: 'Original Design', number: 1 },
  room: {
    dimensions: { length_m: 7.29, width_m: 5.18, height_m: 2.8 },
    dimensions_text: '7.29m × 5.18m × 2.8m (L × W × H)',
    classification: { statement: 'rectangular room' },
    acoustic_implication: {
      statement: 'Standard modal distribution; bass performance depends on subwoofer placement and acoustic treatment.',
    },
    screen: { size_inches: 185, viewable_width_inches: 170, diagonal_inches: 185, aspect_ratio: '2.35:1' },
    seating: { row_count: 2, total_seats: 9, row_spacing_m: 1.8 },
    acoustic_treatment: { enabled: false },
  },
  // The centre seat of each row is the seat the report states its RP23 row by.
  seats: [
    { id: 'r1-l', row: 1, column: 0, position: { x: 1.4 } },
    { id: 'r1-c', row: 1, column: 1, position: { x: 2.59 } },
    { id: 'r1-r', row: 1, column: 2, position: { x: 3.78 } },
    { id: 'r2-l', row: 2, column: 0, position: { x: 1.4 } },
    { id: 'r2-c', row: 2, column: 1, position: { x: 2.59 } },
    { id: 'r2-r', row: 2, column: 2, position: { x: 3.78 } },
    // The reference seat is never a row's representative seat.
    { id: 'rsp', row: 1, column: 1, position: { x: 2.59 }, is_reference: true },
  ],
  system: {
    configuration: { dolby_config: '9.1.6' },
    channel_layout: { total_discrete: 16, subwoofer_count: 2 },
    product_roles: [
      { role: 'lcr', role_description: 'Left/Centre/Right (screen wall)', model_label: 'Q6-3' },
      { role: 'surround', role_description: 'Side surround', model_label: 'EVOLVE 2-1' },
      { role: 'overhead', role_description: 'Overhead', model_label: 'ARCHITECT 2-1' },
      { role: 'subwoofer', role_description: 'Subwoofer', model_label: 'SUB4-12' },
    ],
  },
  viewing: {
    available: true,
    primary_floor: 'L4',
    project_floor: 'L3',
    per_seat: [
      { seat_id: 'r1-c', horizontal_angle_deg: 63.2, rp23_level: 'L4' },
      { seat_id: 'r1-l', horizontal_angle_deg: 78.4, rp23_level: 'L1' },
      { seat_id: 'r1-r', horizontal_angle_deg: 49.1, rp23_level: 'L3' },
      // Marquee-style row-2 value: 44.2° is displayed as 45° by rp23DisplayAngleDeg.
      { seat_id: 'r2-c', horizontal_angle_deg: 44.2, rp23_level: 'L3' },
      { seat_id: 'r2-l', horizontal_angle_deg: 68.7, rp23_level: 'L1' },
      { seat_id: 'r2-r', horizontal_angle_deg: 43.8, rp23_level: 'L2' },
      { seat_id: 'rsp', horizontal_angle_deg: 50.0, rp23_level: 'L4' },
    ],
  },
};

const GLANCE = buildAtAGlance({
  snapshot: SNAPSHOT,
  projectName: 'Marquee Home',
  projectReference: '34 AR',
  generatedDate: '2026-10-03',
});

const CARDS = [...GLANCE.projectCards, ...GLANCE.roomCards, ...GLANCE.systemCards];
const card = (label) => CARDS.find((entry) => entry.label === label);
const ALL_TEXT = JSON.stringify(GLANCE);
const PAGE_SOURCE = fs.readFileSync(
  new URL('../src/components/proposal/print/AtAGlancePage.jsx', import.meta.url),
  'utf8'
);

describe('A–B. what the page carries', () => {
  it('A. has no generic intro sentence under the heading', () => {
    assert.ok(!/room it is designed for/i.test(PAGE_SOURCE));
    assert.ok(!/\blead=/.test(PAGE_SOURCE));
  });

  it('B. has no dealer card: the dealer is named on the cover', () => {
    assert.ok(!card('Dealer'));
    assert.ok(!/Sound Proof/.test(ALL_TEXT));
  });

  it('keeps the project facts, and the reference only when it is set', () => {
    assert.equal(card('Project').value, 'Marquee Home');
    assert.equal(card('Client').value, '34 AR');
    assert.equal(card('Project reference').value, '34 AR');
    assert.equal(card('Design version').value, 'Original Design · V1');
    assert.equal(card('Prepared date').value, '03/10/2026');

    const withoutReference = buildAtAGlance({
      snapshot: SNAPSHOT,
      projectName: 'Marquee Home',
      generatedDate: '2026-10-03',
    });
    assert.ok(!withoutReference.projectCards.some((entry) => entry.label === 'Project reference'));
  });
});

describe('C–E. the room, screen and seating facts', () => {
  it('C. states the room size as three dimensions, with no axis line', () => {
    assert.equal(card('Room size').value, '7.29 × 5.18 × 2.8 m');
    assert.ok(!/L × W × H/.test(ALL_TEXT));
  });

  it('D. states the viewable image, and never the assembly size', () => {
    assert.equal(card('Screen').value, '170" 2.35:1 viewable image');
    assert.ok(!/185/.test(ALL_TEXT));
    assert.ok(!/assembly/i.test(ALL_TEXT));
  });

  it('E. states the seat count, and not the row count', () => {
    assert.equal(card('Seating').value, '9 seats');
    assert.ok(!/2 rows/.test(ALL_TEXT));
  });
});

describe('F–G. viewing geometry follows the report, row by row', () => {
  it('F. states both rows, each with its own published level', () => {
    assert.equal(
      card('Viewing geometry').value,
      'Row 1 · 63° · RP23 L4\nRow 2 · 45° · RP23 L3'
    );
  });

  it('F. reads the report’s representative seat, not the widest seat in a row', () => {
    const viewing = card('Viewing geometry').value;
    // Row 1's outer seats sit at 78.4° and 49.1°, row 2's at 68.7° and 43.8°,
    // and the reference seat at 50°: none of them is a row's stated result.
    assert.ok(!/78|49|69|44°|50/.test(viewing), viewing);
  });

  it('G. never states one level for the room, and never averages the rows', () => {
    const viewing = card('Viewing geometry').value;
    assert.ok(!/^L[1-4]\b/.test(viewing), viewing);
    assert.ok(!/ to /.test(viewing), viewing);
    const levels = viewing.split('\n').map((line) => line.split(' · ').pop());
    assert.deepEqual(levels, ['RP23 L4', 'RP23 L3']);
    // The rows genuinely differ, so one level for the room would have been wrong.
    assert.equal(new Set(levels).size, 2);
  });

  it('G. withholds a level entirely when the snapshot carries no per-row seats', () => {
    const anglesOnly = buildAtAGlance({
      snapshot: { ...SNAPSHOT, seats: [], viewing: { available: true, primary_floor: 'L3', per_seat: SNAPSHOT.viewing.per_seat } },
      projectName: 'Marquee Home',
    });
    const viewing = anglesOnly.roomCards.find((entry) => entry.label === 'Viewing geometry');
    assert.equal(viewing.value, '44° to 78°');
    assert.ok(!/L[1-4]/.test(viewing.value));
  });
});

describe('H–I. nothing else on the page', () => {
  it('H. shows no design brief when no genuine brief has been entered', () => {
    assert.ok(!('briefNote' in GLANCE));
    assert.ok(!/modal distribution/i.test(ALL_TEXT));
    assert.ok(!/Design brief/.test(PAGE_SOURCE));
  });

  it('I. carries no filler subtext in any fact card', () => {
    assert.ok(CARDS.length > 0);
    CARDS.forEach((entry) => {
      assert.equal(entry.hint, undefined, entry.label);
      assert.ok(entry.value, entry.label);
      assert.ok(!/\n\n/.test(entry.value), entry.label);
    });
  });

  it('states the system layout alone, with no channel commentary', () => {
    assert.equal(card('System layout').value, '9.1.6');
    assert.equal(card('System layout').hint, undefined);
  });

  it('carries the cards the client needs, and nothing else', () => {
    assert.deepEqual(CARDS.map((entry) => entry.label), [
      'Project',
      'Client',
      'Project reference',
      'Design version',
      'Prepared date',
      'Room size',
      'Screen',
      'Seating',
      'Viewing geometry',
      'System layout',
    ]);
  });
});