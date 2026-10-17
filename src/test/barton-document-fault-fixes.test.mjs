/**
 * barton-document-fault-fixes.test.mjs
 * ------------------------------------
 * The five document faults traced on the Barton documents, held fixed:
 *
 *   1. CLIENT-FACING FORMAT — the client reads 9.3.6, resolved by the one shared
 *      format authority, and the decoder layout is never stated as the client's
 *      system format.
 *   2. LAST UPDATED — the frozen report identity carries the report's own real
 *      update timestamp, and a known identity or date field is never printed as a
 *      dash.
 *   3. P19 CURVE PAYLOAD — the Project Report's P19 page (page 15) and the
 *      Technical Report's P19 page (page 37) read ONE saved curve payload instead
 *      of each rebuilding a graph of its own.
 *   4. PER-ROLE QUANTITIES — each position states its own loudspeakers (Front
 *      wides 2, Side surrounds 2, Rear surrounds 2 = 6), and the layer total is
 *      never read onto every position of that layer.
 *   5. LIBRARY SAVE ORDER — a page raster that failed is left out of the stored
 *      copy and never cancels the stored PDF.
 *
 * The quantity rule is exercised on the real authority with a Barton-shaped
 * package; the rest are read as source, because they are the lines that decide
 * what a document states.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'vitest';

import { buildPackageRows } from '../components/proposal/print/proposalPackAuthority.js';
import { systemFormat } from '../shared/systemFormat.js';

const read = (relative) => fs.readFileSync(path.resolve(process.cwd(), relative), 'utf8');

/* ── 4. PER-ROLE EVOLVE 2-1 QUANTITIES ─────────────────────────────────── */

/** One surround-layer position of a Barton-shaped package. */
const evolveRole = (role, quantity) => ({
  role,
  model_key: 'evolve-2-1',
  model_label: 'Evolve 2-1',
  ...(quantity === null ? {} : { quantity }),
});

const bartonSystem = ({ quantity, layer }) => ({
  product_roles: [
    evolveRole('front_wide', quantity),
    evolveRole('surround', quantity),
    evolveRole('rear_surround', quantity),
  ],
  products_selected_by_layer: layer,
  subwoofer_strategy: { instances: [], count: 0 },
});

const packageRows = (system) => Object.fromEntries(
  buildPackageRows({ system }).map((row) => [row.role, row.qty]),
);

test('4. each surround position states its own two loudspeakers, and the three total six', () => {
  const rows = packageRows(bartonSystem({ quantity: 2, layer: {} }));

  assert.equal(rows['Front wides'], 2);
  assert.equal(rows['Side surrounds'], 2);
  assert.equal(rows['Rear surrounds'], 2);
  assert.equal(rows['Front wides'] + rows['Side surrounds'] + rows['Rear surrounds'], 6);
});

test('4. a frozen snapshot stating only the layer total never reads it onto every position', () => {
  // The frozen evidence states the model once per LAYER — "Evolve 2-1 × 6" — which
  // is what used to be printed at each of the three positions.
  const rows = packageRows(bartonSystem({
    quantity: null,
    layer: { surrounds: [{ model: 'Evolve 2-1', quantity: 6 }] },
  }));

  assert.equal(rows['Front wides'], 2, 'the front wides state their own two, never the layer total');
  assert.equal(rows['Side surrounds'], 2, 'the side surrounds state their own two');
  assert.equal(rows['Rear surrounds'], 2, 'the rear surrounds state their own two');
  assert.equal(rows['Front wides'] + rows['Side surrounds'] + rows['Rear surrounds'], 6,
    'the layer still totals the six loudspeakers it holds');
});

/* ── 1. CLIENT-FACING FORMAT AUTHORITY ─────────────────────────────────── */

test('1. the client-facing system format is 9.3.6, from the one shared authority', () => {
  assert.equal(systemFormat({ layout: '9.1.6', subwooferCount: 3 }), '9.3.6');
});

test('1. no report or pack surface states the decoder layout as the system format', () => {
  const surfaces = [
    'src/components/report/projectReport/projectReportOpening.js',
    'src/components/report/projectReport/projectReportSummaryOpening.js',
    'src/components/report/projectReport/ProjectReportSystemOverview.jsx',
    'src/components/report/projectReport/ProjectReportDesignSummary.jsx',
    'src/components/proposal/print/proposalPackAuthority.js',
  ];

  for (const surface of surfaces) {
    const source = read(surface);
    assert.ok(!/systemFormat\s*\|\|[^;\n]*dolby_config/.test(source),
      `${surface} never falls back to the decoder layout`);
    assert.ok(!/\|\|\s*configuration\.dolby_config/.test(source),
      `${surface} never prints the decoder layout`);
  }
});

test('1. the writer-facing system statement is the client format, not the decoder digit', () => {
  const authority = read('src/components/proposal/engineeringAuthority/buildSystemAuthority.js');

  assert.match(authority, /import \{ systemFormat \} from '@\/shared\/systemFormat';/);
  assert.match(authority, /configuration_text: clientFormat/);
  assert.ok(!/configuration_text: dolbyConfig\.text/.test(authority),
    'the decoder notation is never the client statement');
  // The decoder identity itself is untouched, so the analysis and the high-channel
  // rules keep reading the codec layout they always read.
  assert.match(authority, /dolby_config: project\?\.dolby_config \|\| null,/);
});

/* ── 2. LAST UPDATED ───────────────────────────────────────────────────── */

test('2. the frozen report identity carries the report’s own update timestamp', () => {
  const frozen = read('src/components/report/frozenPublicationProject.js');

  assert.match(frozen, /updated_date: saved\?\.generated_at \|\| p\.updated_date/,
    'the real report update timestamp is persisted with the frozen identity');
});

test('2. a known identity or date field is never printed as a dash', () => {
  const overview = read('src/components/report/technical/TechnicalProjectOverview.jsx');

  assert.ok(!/projectDetails\?\.name \|\| "—"/.test(overview), 'the project name is never dashed');
  assert.ok(!/projectDetails\?\.client_name \|\| "—"/.test(overview), 'the client is never dashed');
  assert.ok(!/exportSystemConfiguration \|\| "—"/.test(overview), 'the system configuration is never dashed');
  assert.match(overview, /\.filter\(\(item\) => item\.value\)/,
    'a field with no value is left out rather than dashed');

  const formatter = overview.slice(
    overview.indexOf('function formatDateShort'),
    overview.indexOf('export default function TechnicalProjectOverview'),
  );
  assert.ok(!formatter.includes('"—"'), 'the date formatter holds no dash fallback');
});

/* ── 3. P19 CURVE PAYLOAD ──────────────────────────────────────────────── */

test('3. the Technical P19 page draws the payload handed in, not a graph of its own', () => {
  const section = read('src/components/report/technical/BassResponseGraphSection.jsx');

  assert.match(section, /p19Graph = null,/, 'the section accepts the document’s saved payload');
  assert.match(section, /const savedP19 = p19Graph\?\.series\?\.length \? p19Graph : null;/);
  assert.match(section, /resolveP19CurveAvailability\(\{ graph: savedP19 \|\| graphs\.p19 \}\)/);
  assert.match(section, /<P19RspGraphContent graph=\{p19Curve\.graph\}/,
    'the page draws the curve it resolved through the one authority');
});

test('3. the Project Report hands its one saved payload to the Technical pages', () => {
  assert.match(read('src/pages/RP22ClientReport.jsx'), /<TechnicalReportDocument p19Graph=\{p19Graph\} \/>/);
  assert.match(read('src/components/report/technical/TechnicalReportDocument.jsx'),
    /<TechnicalReportEmbedded p19Graph=\{p19Graph\} \/>/);
  assert.match(read('src/pages/RP22Report.jsx'), /<RP22ReportInner embed p19Graph=\{p19Graph\} \/>/);
  assert.equal(
    (read('src/pages/RP22Report.jsx').match(/p19Graph=\{p19Graph\}/g) || []).length,
    3,
    'the payload reaches both P19 mounts (the section in the review layout and the print layout)',
  );
});

/* ── 5. LIBRARY SAVE ORDER ─────────────────────────────────────────────── */

test('5. a failed page raster is recorded and left out — it never cancels the PDF', () => {
  const resilience = read('src/components/library/libraryCaptureResilience.js');

  assert.match(resilience, /diagnostics\.incomplete = diagnostics\.failed\.length > 0;/);
  assert.ok(!/if \(diagnostics\.failed\.length > 0\) throw buildResilienceFailure\(diagnostics\);\n\n  return/.test(resilience),
    'an incomplete capture is stored, not thrown away');
  assert.match(resilience, /if \(stored === 0\) \{[\s\S]*?throw buildResilienceFailure\(diagnostics\);/,
    'only a document with no usable page is refused');
});

test('5. a 0 × 0 raster is a page that paints nothing, never a failed page', () => {
  const capture = read('src/components/library/capturePagePng.js');

  assert.equal((capture.match(/diagnostics\.zeroSize = true;/g) || []).length, 2,
    'both the empty canvas and the zero-dimension PNG are named as nothing to draw');
  assert.match(read('src/components/library/compositionCapture.js'), /if \(!raster\) continue;/,
    'the PDF is assembled from the pages that resolved, so the valid PDF is stored');
});