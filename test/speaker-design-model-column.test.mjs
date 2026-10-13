/**
 * speaker-design-model-column.test.mjs
 * -------------------------------------
 * The Current Speaker Design reads Position | Model | Qty, and the Model column
 * states the product name alone. The number of loudspeakers at a position is the
 * Qty column's only job, so a name is never printed beside its own count:
 *
 *   Side surrounds | Q4-3           | 2     (never "Q4-3 × 2 | 2")
 *   Top front     | SPITFIRE CLOUD  | 2
 *   Front subs    | SUB3-12         | 2
 *   Centre        | C4-1            | 2     (dual centre, stated in the note)
 *
 * It also checks the two surfaces that state that table — the panel and the
 * Speaker Design document — read the SAME model cell, so they can never disagree,
 * and that no product count changed: the Qty numbers are the physical counts, and
 * their total is the system's.
 */

import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import assert from 'node:assert/strict';

import { buildSpeakerDesignRows } from '../src/components/report/speakerDesign/speakerDesignRows.js';
import { buildSpeakerDesignMarkup } from '../src/components/roomdesigner/speakerDesignPdf.js';
import { productDisplayName } from '../src/components/report/reportProductsSelected.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const ROW_SOURCE = read('src/components/report/speakerDesign/speakerDesignRows.js');
const PANEL = read('src/components/roomdesigner/CurrentSpeakerDesignDialog.jsx');
const PDF_SOURCE = read('src/components/roomdesigner/speakerDesignPdf.js');

/** The name the app states a model by, without ever guessing it in this test. */
const displayName = (model) => productDisplayName(model) || model;

/** One 9.4.6-style system: left/right pair, dual centre, surrounds, overheads, subs. */
const PLACED_SPEAKERS = Object.freeze([
  { role: 'FL', model: 'Q4-5' },
  { role: 'FR', model: 'Q4-5' },
  { role: 'FCL', model: 'C4-1', orientation: 'vertical' },
  { role: 'FCR', model: 'C4-1', orientation: 'vertical' },
  { role: 'SL', model: 'Q4-3' },
  { role: 'SR', model: 'Q4-3' },
  { role: 'LW', model: 'Q4-3' },
  { role: 'RW', model: 'Q4-3' },
  { role: 'SBL', model: 'Q4-3' },
  { role: 'SBR', model: 'Q4-3' },
  { role: 'TFL', model: 'SPITFIRE CLOUD' },
  { role: 'TFR', model: 'SPITFIRE CLOUD' },
  { role: 'TML', model: 'SPITFIRE CLOUD' },
  { role: 'TMR', model: 'SPITFIRE CLOUD' },
  { role: 'TRL', model: 'SPITFIRE CLOUD' },
  { role: 'TRR', model: 'SPITFIRE CLOUD' },
]);

const subs = {
  frontSubsCfg: { count: 2, model: 'SUB3-12' },
  rearSubsCfg: { count: 2, model: 'SUB3-12' },
};

const design = buildSpeakerDesignRows({ placedSpeakers: PLACED_SPEAKERS, ...subs });
const rowByPosition = new Map(design.rows.map((row) => [row.position, row]));

/** Every Qty the schedule states, as numbers. */
const quantities = design.rows.map((row) => Number(row.quantityLabel));

/* ── 1 — the Model column ──────────────────────────────────────────────────── */

test('the Model column states the model name alone — never its own count', () => {
  design.rows.forEach((row) => {
    assert.doesNotMatch(row.model, /×/, `${row.position}'s model cell carries no multiplier`);
    assert.doesNotMatch(row.model, /\b\d+\s*[xX]\b/, `${row.position}'s model cell carries no count`);
    assert.doesNotMatch(row.model, /\(\d+\)/, `${row.position}'s model cell carries no bracketed count`);
  });

  // The row builder states ONE model cell and one Qty cell: there is no second,
  // count-bearing model field for a surface to read by mistake.
  assert.doesNotMatch(ROW_SOURCE, /modelNames/, 'no duplicated model cell exists in the authority');
  assert.doesNotMatch(ROW_SOURCE, /countLabel/, 'no name-plus-count formatter exists');
  assert.match(PDF_SOURCE, /escapeHtml\(row\.model\)/, 'the document reads the same model cell as the panel');
  assert.match(PANEL, /\{row\.model\}/, 'the panel reads the model cell');
});

/* ── 2 — the Qty column, and no count changed ─────────────────────────────── */

test('the Qty column is the physical count, and the system total is unchanged', () => {
  assert.equal(rowByPosition.get('Front left').quantityLabel, '1');
  assert.equal(rowByPosition.get('Front right').quantityLabel, '1');
  assert.equal(rowByPosition.get('Centre').quantityLabel, '2', 'two physical centre cabinets');
  assert.equal(rowByPosition.get('Side surrounds').quantityLabel, '2');
  assert.equal(rowByPosition.get('Front wides').quantityLabel, '2');
  assert.equal(rowByPosition.get('Rear surrounds').quantityLabel, '2');
  assert.equal(rowByPosition.get('Top front').quantityLabel, '2');
  assert.equal(rowByPosition.get('Top middle').quantityLabel, '2');
  assert.equal(rowByPosition.get('Top rear').quantityLabel, '2');
  assert.equal(rowByPosition.get('Front subwoofers').quantityLabel, '2');
  assert.equal(rowByPosition.get('Rear subwoofers').quantityLabel, '2');

  // The design holds 20 physical loudspeakers; stating them is not recounting them.
  assert.equal(quantities.reduce((total, value) => total + value, 0), 20);
  design.rows.forEach((row) => assert.match(row.quantityLabel, /^\d+$/, 'a Qty is a plain number'));
});

/* ── 3 — each layer reads cleanly ─────────────────────────────────────────── */

test('surrounds, overheads and subwoofers state the model alone', () => {
  assert.equal(rowByPosition.get('Side surrounds').model, displayName('Q4-3'));
  assert.equal(rowByPosition.get('Front wides').model, displayName('Q4-3'));
  assert.equal(rowByPosition.get('Rear surrounds').model, displayName('Q4-3'));

  assert.equal(rowByPosition.get('Top front').model, displayName('SPITFIRE CLOUD'));
  assert.equal(rowByPosition.get('Top middle').model, displayName('SPITFIRE CLOUD'));
  assert.equal(rowByPosition.get('Top rear').model, displayName('SPITFIRE CLOUD'));

  assert.equal(rowByPosition.get('Front subwoofers').model, displayName('SUB3-12'));
  assert.equal(rowByPosition.get('Rear subwoofers').model, displayName('SUB3-12'));

  // A single-speaker position: the name, and a Qty of one.
  assert.equal(rowByPosition.get('Front left').model, displayName('Q4-5'));
  assert.equal(rowByPosition.get('Front right').model, displayName('Q4-5'));
});

/* ── 4 — the dual centre stays clear ──────────────────────────────────────── */

test('the dual centre states one name, its two cabinets and one logical channel', () => {
  const centre = rowByPosition.get('Centre');

  assert.equal(centre.model, displayName('C4-1'), 'the model cell is the name alone');
  assert.doesNotMatch(centre.model, /×/, 'never "C4-1 × 2" beside a Qty of 2');
  assert.equal(centre.quantityLabel, '2', 'the two physical cabinets');
  assert.match(centre.note, /Dual physical centre cabinets/, 'the arrangement is stated');
  assert.match(centre.note, /one logical centre channel/, 'ONE logical centre channel');
  assert.match(centre.note, /vertically/, 'the cabinets\u2019 own orientation');
});

/* ── 5 — the document states the same table as the panel ──────────────────── */

test('the Speaker Design document states the panel\u2019s own rows', () => {
  const markup = buildSpeakerDesignMarkup({
    groups: design.groups,
    projectName: 'Genesis AV',
    clientName: 'Jooced',
    versionName: 'Original Design',
    layout: '9.4.6',
    dateLabel: '13 October 2026',
  });

  const models = [...markup.matchAll(/<span class="model-name">([^<]*)<\/span>/g)].map((m) => m[1]);
  const qtys = [...markup.matchAll(/<td class="qty">([^<]*)<\/td>/g)].map((m) => m[1]);

  assert.deepEqual(models, design.rows.map((row) => row.model), 'the same model cells, in order');
  assert.deepEqual(qtys, design.rows.map((row) => row.quantityLabel), 'the same Qty cells, in order');
  models.forEach((model) => assert.doesNotMatch(model, /×/, 'no multiplier reaches the document'));
  assert.match(markup, /<th class="model">Model<\/th><th class="qty">Qty<\/th>/);
});

export default null;