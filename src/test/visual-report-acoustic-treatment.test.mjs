// visual-report-acoustic-treatment.test.mjs
// ---------------------------------------------------------------------------
// ACCEPTANCE — Acoustic Treatment is a real printed Visual Report page.
//
//   TEST 1  The printed page is composed for print and declared printable
//   TEST 2  Marquee: the page exists and states the design's 8 Abfuser panels
//   TEST 3  The quantity is the design's included quantity — never invented
//   TEST 4  No treatment data → no page at all (so no blank / loading sheet)
//   TEST 5  The page carries the required client copy, and no loading state
//   TEST 6  The printed page can never render empty, and never invents a
//           placement it has no geometry for
//   TEST 7  Acoustic Treatment prints before About Sound Proof
// ---------------------------------------------------------------------------
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { buildClientAcousticTreatmentPage } from '@/components/report/client/acousticTreatmentPageAuthority';
import { resolveIncludedAbfuserQuantity } from '@/components/utils/abfuserInclusionAuthority';

const ROOT = path.resolve(process.cwd());
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

/** Source without its comments — what the module actually renders/builds. */
const stripComments = (source) => String(source)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const AUTHORITY = 'src/components/report/client/acousticTreatmentPageAuthority.js';
const PRINT_PAGE = 'src/components/report/client/print/PrintAcousticTreatmentContent.jsx';
const PAGE_WRAPPER = 'src/components/report/client/ClientReportPage.jsx';
const VISUAL_REPORT = 'src/pages/RP22ClientReport.jsx';

// ── The Marquee project as it stands: room 5.18 × 7.29 × 2.8 m, two rows of
//    seating, 9 panels carried in the design, quantity followed from ADI. ─────
const MARQUEE = {
  roomDims: { widthM: 5.18, lengthM: 7.29, heightM: 2.8 },
  seatingPositions: [
    { id: 'seat-r1-c1', x: 1.69, y: 3.78 },
    { id: 'seat-r1-c2', x: 2.29, y: 3.78 },
    { id: 'seat-r1-c3', x: 2.89, y: 3.78 },
    { id: 'seat-r1-c4', x: 3.49, y: 3.78 },
    { id: 'seat-r2-c1', x: 1.39, y: 5.58 },
    { id: 'seat-r2-c2', x: 1.99, y: 5.58 },
    { id: 'seat-r2-c3', x: 2.59, y: 5.58 },
    { id: 'seat-r2-c4', x: 3.19, y: 5.58 },
    { id: 'seat-r2-c5', x: 3.79, y: 5.58 },
  ],
  placedSpeakers: [
    { role: 'FL', x: 0.594, y: 0.116 },
    { role: 'FC', x: 2.59, y: 0.065 },
    { role: 'FR', x: 4.586, y: 0.116 },
    { role: 'SL', x: 0.051, y: 4.777 },
    { role: 'SR', x: 5.129, y: 4.777 },
    { role: 'SBL', x: 1.28, y: 7.239 },
    { role: 'SBR', x: 3.9, y: 7.239 },
  ],
  rsp: { x: 2.59, y: 4.637 },
  acousticTreatmentEnabled: true,
  selectedAbfuserQty: 8,
  legacyAutoQuantity: 6,
  abfuserQtySource: 'recommended',
};

// ── TEST 1 — composed for print and declared printable ─────────────────────
test('TEST 1 — the Acoustic Treatment page is composed for print', () => {
  const wrapper = read(PAGE_WRAPPER);
  const declared = wrapper.match(/const PRINTABLE_PAGE_TYPES = new Set\(\[([\s\S]*?)\]\);/)[1];
  assert.ok(declared.includes('"acoustic-treatment"'), 'the page is declared printable');
  assert.ok(
    wrapper.includes('printData?.type === "acoustic-treatment"'),
    'the wrapper composes the printed Acoustic Treatment page',
  );
  assert.ok(
    wrapper.includes('import PrintAcousticTreatmentContent'),
    'the print composition is a real component, not an empty branch',
  );
});

// ── TEST 2 — Marquee: a real page stating 8 Abfuser panels ────────────────
test('TEST 2 — Marquee prints a real Acoustic Treatment page with 8 panels', () => {
  const page = buildClientAcousticTreatmentPage(MARQUEE);

  assert.equal(page.hasPage, true, 'the page exists for Marquee');
  assert.equal(page.quantity, 8, 'the quantity is 8 Abfuser panels');
  assert.equal(page.panelType, 'Artcoustic Abfuser');
  assert.equal(
    page.summaryRows.find((row) => row.key === 'quantity').value,
    '8 panels',
    'the treatment summary states 8 panels',
  );
  assert.equal(
    page.summaryRows.find((row) => row.key === 'type').value,
    'Artcoustic Abfuser',
  );
  assert.equal(page.summaryRows.length, 4, 'type · quantity · purpose · role');

  assert.ok(page.placement, 'placement geometry exists for this room');
  const counted = page.placement.countedZones.reduce((sum, zone) => sum + zone.panels, 0);
  assert.equal(counted, page.placement.totalPanels, 'the zone counts match the drawn panels');
  assert.ok(page.opening.length > 0 && page.practical.length > 0 && page.performance.length > 0);
  assert.equal(page.quantityNote, null, 'no conflicting quantity to reconcile for Marquee');
});

// ── TEST 3 — the quantity is the design's, never invented ─────────────────
test('TEST 3 — the page states the design’s included quantity', () => {
  // A designer override is the design: the page follows it, and says so.
  const overridden = buildClientAcousticTreatmentPage({
    ...MARQUEE,
    selectedAbfuserQty: 6,
    abfuserQtySource: 'user',
  });
  assert.equal(overridden.quantity, 6, 'a manual selection is what the page states');
  assert.ok(overridden.quantityNote, 'the difference from the recommendation is stated');

  // Following ADI: the included quantity is the recommendation, exactly.
  const followed = buildClientAcousticTreatmentPage(MARQUEE);
  const recommended = followed.placement.totalPanels;
  assert.equal(
    followed.quantity,
    resolveIncludedAbfuserQuantity({
      enabled: true,
      quantitySource: 'recommended',
      selectedQuantity: 8,
      recommendedQuantity: recommended,
    }),
    'the page reads the inclusion authority, not a number of its own',
  );
});

// ── TEST 4 — no treatment data → no page at all ───────────────────────────
test('TEST 4 — without treatment data the page does not exist', () => {
  const off = buildClientAcousticTreatmentPage({ ...MARQUEE, acousticTreatmentEnabled: false });
  assert.equal(off.hasPage, false, 'treatment switched off → no page');

  const noData = buildClientAcousticTreatmentPage({
    roomDims: null,
    seatingPositions: [],
    placedSpeakers: [],
    acousticTreatmentEnabled: true,
    selectedAbfuserQty: 0,
    abfuserQtySource: 'none',
  });
  assert.equal(noData.hasPage, false, 'no quantity and no geometry → no page');
  assert.equal(noData.quantity, 0);

  const report = read(VISUAL_REPORT);
  assert.ok(
    report.includes('if (acousticTreatmentPage.hasPage)'),
    'the report adds the page only when the authority says it exists',
  );
});

// ── TEST 5 — the required copy, and no loading state ──────────────────────
test('TEST 5 — the page carries the required client copy', () => {
  const authority = read(AUTHORITY);
  const printPage = read(PRINT_PAGE);

  assert.ok(
    authority.includes('Acoustic treatment is included to help the loudspeaker system perform as designed.'),
    'the opening statement is the approved wording',
  );
  assert.ok(
    authority.includes('The treatment is not there to make the room sound dead.'),
    'the practical statement is the approved wording',
  );
  assert.ok(
    authority.includes('Spatial Resolution, Dynamic Range and Timbre Matching.'),
    'the page links the treatment to the three design priorities',
  );
  assert.ok(!/Loading|loading\.\.\./i.test(printPage), 'the printed page has no loading state');
  assert.ok(
    printPage.includes('client-report-print-heading__title'),
    'the page uses the shared Visual Report page heading',
  );
  assert.ok(
    !/return null/.test(printPage),
    'the composed page never returns nothing — a page in the report always prints something',
  );
});

// ── TEST 6 — no inventing a placement, no empty page ─────────────────────
test('TEST 6 — the page states only what the project data supports', () => {
  const printPage = read(PRINT_PAGE);

  assert.ok(
    printPage.includes('placement ? (') && printPage.includes('treatment.productNote'),
    'the plan is drawn only when placement geometry exists, otherwise product facts are stated',
  );
  assert.ok(
    !/Loading|loading/i.test(stripComments(read(AUTHORITY))),
    'the authority produces no loading state',
  );

  // With no geometry the page still exists when the design carries a quantity,
  // and states the product rather than an invented location.
  const noGeometry = buildClientAcousticTreatmentPage({
    roomDims: null,
    seatingPositions: [],
    placedSpeakers: [],
    acousticTreatmentEnabled: true,
    selectedAbfuserQty: 4,
    abfuserQtySource: 'user',
  });
  assert.equal(noGeometry.hasPage, true, 'a stated design quantity is enough for a real page');
  assert.equal(noGeometry.placement, null, 'no placement is claimed without geometry');
  assert.equal(noGeometry.quantity, 4);
});

// ── TEST 7 — the closing order: treatment, then About Sound Proof ────────
test('TEST 7 — Acoustic Treatment prints before About Sound Proof', () => {
  const report = read(VISUAL_REPORT);
  const treatmentAt = report.indexOf('id: "acoustic-treatment"');
  const aboutAt = report.indexOf('id: "about-sound-proof"');

  assert.ok(treatmentAt > 0 && aboutAt > 0, 'both closing pages are declared');
  assert.ok(treatmentAt < aboutAt, 'About Sound Proof follows the treatment page');
  assert.ok(
    report.indexOf('printData: { type: "about-sound-proof"') > treatmentAt,
    'the About page is the last page in the report',
  );
});