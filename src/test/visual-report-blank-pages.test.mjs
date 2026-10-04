// visual-report-blank-pages.test.mjs
// ---------------------------------------------------------------------------
// ACCEPTANCE — No blank pages in the exported Visual Report PDF.
//
//   TEST 1  Every page type the wrapper composes for print is declared in the
//           printable set (the two can never drift apart)
//   TEST 2  Every page type the Visual Report emits is either composed for
//           print or a known screen-only page — a new page type can never slip
//           into the PDF as an empty A4 shell
//   TEST 3  A page with no printable composition is dropped from the print
//           layout, so its empty page shell is never exported
//   TEST 4  The drop rule exists in both print pathways — the pre-print
//           measurement body class and the print media query
//   TEST 5  Exactly one forced page break exists per printed page (none after
//           the last page), so no break can open a blank page
// ---------------------------------------------------------------------------
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const PAGE_WRAPPER = 'src/components/report/client/ClientReportPage.jsx';
const PRINT_STYLES = 'src/components/report/client/ClientReportPrintStyles.jsx';
const VISUAL_REPORT = 'src/pages/RP22ClientReport.jsx';

const wrapper = read(PAGE_WRAPPER);
const printStyles = read(PRINT_STYLES);

/** Page types the Visual Report emits — one per rendered report page. */
function emittedPageTypes() {
  const source = read(VISUAL_REPORT);
  return [...new Set([...source.matchAll(/type:\s*"([a-z0-9-]+)"/g)].map((m) => m[1]))];
}

/** Page types the wrapper composes for print, read from its JSX branches. */
function composedPageTypes() {
  return [...new Set(
    [...wrapper.matchAll(/printData\?\.type === "([a-z0-9-]+)"/g)].map((m) => m[1]),
  )];
}

/** The declared printable set the wrapper classifies pages with. */
function declaredPrintableTypes() {
  const block = wrapper.match(/const PRINTABLE_PAGE_TYPES = new Set\(\[([\s\S]*?)\]\);/);
  assert.ok(block, 'the wrapper declares its printable page types');
  return [...new Set([...block[1].matchAll(/"([a-z0-9-]+)"/g)].map((m) => m[1]))];
}

// Pages the wrapper has no print composition for: they carry nothing on paper,
// so they are shown on screen only and dropped from the printed report.
const SCREEN_ONLY_PAGE_TYPES = ['adi-design-summary'];

// ── TEST 1 — the declared set and the print branches agree ─────────────────
test('TEST 1 — every print composition is declared in the printable set', () => {
  const declared = declaredPrintableTypes();
  const composed = composedPageTypes();

  assert.ok(composed.length >= 16, 'the wrapper still composes the report pages for print');
  for (const type of composed) {
    assert.ok(declared.includes(type), `${type} is composed for print and declared printable`);
  }
  for (const type of declared) {
    assert.ok(composed.includes(type), `${type} is declared printable and actually composed`);
  }
});

// ── TEST 2 — every emitted page is printable or knowingly screen-only ──────
test('TEST 2 — no emitted page type can print as an empty shell', () => {
  const declared = declaredPrintableTypes();
  const emitted = emittedPageTypes();

  assert.ok(emitted.length >= 18, 'the Visual Report still emits its page set');

  const screenOnly = emitted.filter((type) => !declared.includes(type));
  assert.deepEqual(
    screenOnly.sort(),
    [...SCREEN_ONLY_PAGE_TYPES].sort(),
    'only the known screen-only pages print nothing — a new page type must be composed for print',
  );
});

// ── TEST 3 — a page with no printable content is dropped in print ──────────
test('TEST 3 — pages with no printable composition are dropped from print', () => {
  assert.ok(
    wrapper.includes('const prints = PRINTABLE_PAGE_TYPES.has(printData?.type);'),
    'the wrapper classifies each page by its printable content',
  );
  assert.ok(
    wrapper.includes('client-report-page--no-print'),
    'the wrapper marks a page that has no printable content',
  );
  assert.equal(
    [...printStyles.matchAll(/\.client-report-page--no-print \{\s*display: none !important;/g)].length,
    2,
    'both stylesheet blocks drop the empty page shell',
  );
  assert.ok(
    !/\.client-report-page--no-print \{[^}]*height: 271mm/.test(printStyles),
    'the dropped page keeps no A4 page frame',
  );
});

// ── TEST 4 — the drop rule covers both print pathways ─────────────────────
test('TEST 4 — the drop rule is present in the measurement and print blocks', () => {
  assert.ok(
    printStyles.includes('body.client-report-printing .client-report-page--no-print'),
    'the pre-print measurement pathway drops the page',
  );
  const printBlock = printStyles.slice(printStyles.indexOf('@media print'));
  assert.ok(
    printBlock.includes('.client-report-page--no-print {\n          display: none !important;'),
    'the print media query drops the page',
  );
});

// ── TEST 5 — one forced break per page, none after the last ───────────────
test('TEST 5 — the page break cannot open a blank page', () => {
  const breaks = [...printStyles.matchAll(/break-after: page;/g)];
  assert.equal(breaks.length, 2, 'the forced page break is declared once per print pathway');
  assert.equal(
    [...printStyles.matchAll(/\.client-report-page:last-child \{/g)].length,
    2,
    'both pathways clear the break after the final page',
  );
  assert.ok(
    !/break-before|page-break-before/.test(printStyles),
    'no page forces a break before itself — the break belongs to the page that ends',
  );
});