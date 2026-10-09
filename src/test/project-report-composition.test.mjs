// project-report-composition.test.mjs
// ---------------------------------------------------------------------------
// ACCEPTANCE — the consolidated Project Report is an EDIT of the existing
// Visual and Technical Reports, not a third report.
//
//   TEST 1  The document opens on its three pages: the Project Summary, the ADI
//           Design Highlights, then System & Products.
//   TEST 2  The Visual Report's pages keep their existing order, their print
//           composition and their presentation, and no page is lost.
//   TEST 3  No front page and no About page is duplicated: the Visual Report's
//           own design-summary page, its cover and its About page are not
//           restated anywhere in the document.
//   TEST 4  The Technical Report's pages follow the Visual pages in their own
//           order, with the complete P1–P21 parameter-card block intact and the
//           drawing set kept together.
//   TEST 5  Exactly one About Sound Proof page exists, as the closing page.
//
// These are composition/layout rules, so they are asserted against the
// composition source — exactly as the other report layout tests in this suite
// do — plus the Technical Report's own print layout for the technical order.
// ---------------------------------------------------------------------------
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = (rel) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');

const PROJECT_REPORT_PAGE = 'src/pages/RP22ClientReport.jsx';
const PROJECT_REPORT_HOOK = 'src/components/report/projectReport/useProjectReportPages.jsx';
const CLIENT_REPORT_PAGE = 'src/components/report/client/ClientReportPage.jsx';
const TECHNICAL_REPORT_PAGE = 'src/pages/RP22Report.jsx';
const TECHNICAL_DOCUMENT = 'src/components/report/technical/TechnicalReportDocument.jsx';

/** Assert every needle is present, in the order given. */
function assertInOrder(source, needles) {
  const found = needles.map((needle) => {
    const index = source.indexOf(needle);
    assert.notEqual(index, -1, `expected to find ${needle}`);
    return index;
  });
  for (let i = 1; i < found.length; i += 1) {
    assert.ok(found[i] > found[i - 1], `"${needles[i]}" must come after "${needles[i - 1]}"`);
  }
}

/** The page ids pushed into one of the Visual composition's page groups. */
function pushedIds(source, arrayName) {
  const ids = [];
  const re = new RegExp(`${arrayName}\\.push\\(\\{\\s*\\n\\s*id: "([^"]+)"`, 'g');
  let match;
  while ((match = re.exec(source))) ids.push(match[1]);
  return ids;
}

/** The Technical Report's printed pages, from its own print layout. */
function technicalPrintLayout() {
  const source = read(TECHNICAL_REPORT_PAGE);
  const start = source.indexOf('id="pdf-cover"');
  assert.notEqual(start, -1, 'the Technical Report print layout must start at pdf-cover');
  return source.slice(start);
}

/* ── TEST 1 — the front section comes first ─────────────────────────────── */

test('TEST 1 — the Project Report opens on three pages: Project Summary, ADI Design Highlights, then System & Products', () => {
  const hook = read(PROJECT_REPORT_HOOK);

  // The document begins with the three opening pages, then the Visual pages.
  assert.match(
    hook,
    /return \[projectSummaryPage, adiHighlightsPage, systemProductsPage, \.\.\.pageList\];/,
    'the document must open on the three opening pages, followed by the Visual pages',
  );

  // Page 01 — the Project Summary: the design's key facts and one short
  // project-specific paragraph, and nothing else on the page.
  assert.match(hook, /id: "project-report-design-summary"/);
  assert.match(hook, /type: "design-summary"/);
  assert.match(hook, /<ProjectReportDesignSummary/);
  assert.ok(hook.includes('summaryOpening={summaryOpening}'), 'the summary page carries the report’s own paragraph');
  assert.ok(!hook.includes('highlights={highlights}'), 'the summary page must not carry the highlights');

  // Page 02 — the ADI Design Highlights: the highlights ADI selects from this
  // design's own frozen evidence. Never a fixed list.
  assert.match(hook, /id: "project-report-adi-highlights"/);
  assert.match(hook, /type: "adi-highlights"/);
  assert.match(hook, /<AdiDesignHighlightsPage/);
  assert.ok(hook.includes('buildAdiDesignHighlights('), 'the highlights are selected from the evidence');
  assert.ok(!hook.includes('selectClientDesignHighlights'), 'the fixed highlight list must not reach the report');

  // Page 03 — the equipment brought forward: the System specification schedule,
  // each layer's engineering job and the viewing geometry by row.
  assert.match(hook, /id: "project-report-system-overview"/);
  assert.match(hook, /type: "system-overview"/);
  assert.match(hook, /<ProjectReportSystemOverview/);
  assert.ok(hook.includes('productsSelected={productsSelected}'), 'the third page carries the products schedule');
  assert.ok(hook.includes('rows={screenSeating.rows}'), 'the third page carries the viewing geometry');

  // All three opening pages print: each has a print composition in the wrapper.
  const clientPage = read(CLIENT_REPORT_PAGE);
  assert.ok(clientPage.includes('"design-summary"'), 'the summary page type must be printable');
  assert.ok(clientPage.includes('"adi-highlights"'), 'the highlights page type must be printable');
  assert.ok(clientPage.includes('"system-overview"'), 'the products page type must be printable');
  assert.match(clientPage, /printData\?\.type === "design-summary"/);
  assert.match(clientPage, /printData\?\.type === "adi-highlights"/);
  assert.match(clientPage, /printData\?\.type === "system-overview"/);

  // …and the products are stated on the opening pages: the products schedule is
  // no longer stated on its own page at the back of the document.
  assert.ok(!hook.includes('id: "products-selected"'), 'no separate products page may remain');
});

/* ── TEST 2 — the Visual Report's pages are preserved ───────────────────── */

test('TEST 2 — the Visual Report keeps its pages, its order, and every print composition', () => {
  const hook = read(PROJECT_REPORT_HOOK);

  // The Visual Report's own page groups, unchanged, in their own membership.
  assert.deepEqual(pushedIds(hook, 'overviewPages'), ['adi-design-summary', 'screen-seating']);
  assert.deepEqual(pushedIds(hook, 'dynamicPages'), [
    'front-soundstage-dynamic-range',
    'non-screen-dynamic-range',
  ]);
  assert.deepEqual(pushedIds(hook, 'spatialPages'), [
    'p2-system-architecture',
    'p5-spatial-resolution',
    'p7-front-wides',
    'p9-spatial-resolution',
    'best-listening-area',
  ]);
  assert.deepEqual(pushedIds(hook, 'timbrePages'), ['timbre-consistency']);
  assert.deepEqual(pushedIds(hook, 'bassPages'), [
    'bass-capability',
    'bass-response',
    'p19-rsp',
    'recommended-seating-position',
  ]);
  // The per-seat page keeps its own print composition and its row-split pages.
  const summaryBlock = hook.slice(
    hook.indexOf('summaryPages.push({'),
    hook.indexOf('return [projectSummaryPage'),
  );
  assert.ok(summaryBlock.includes('type: "per-seat-performance"'), 'the per-seat page must keep its print composition');
  assert.ok(summaryBlock.includes('"per-seat-performance"'), 'the per-seat page must stay in the summary group');
  assert.deepEqual(pushedIds(hook, 'closingPages'), ['acoustic-treatment']);

  // …and their order is the Visual Report's existing order.
  assertInOrder(hook, [
    '...overviewPages,',
    '...dynamicPages,',
    '...spatialPages,',
    '...timbrePages,',
    '...bassPages,',
    '...summaryPages,',
    '...closingPages,',
  ]);

  // Every Visual page keeps the print composition it already had. A page whose
  // print branch disappeared is a page lost to the merge.
  const clientPage = read(CLIENT_REPORT_PAGE);
  const printTypes = [
    'p5',
    'p9',
    'best-listening-area',
    'timbre-consistency',
    'front-soundstage-dynamic-range',
    'non-screen-dynamic-range',
    'screen-seating',
    'p2-system-architecture',
    'p7-front-wides',
    'seating-position',
    'bass-capability',
    'bass-response',
    'p19-rsp',
    'per-seat-performance',
    'acoustic-treatment',
    'design-summary',
    'adi-highlights',
    'system-overview',
  ];
  for (const type of printTypes) {
    assert.ok(
      clientPage.includes(`printData?.type === "${type}"`),
      `the "${type}" page lost its print composition`,
    );
  }
});

/* ── TEST 3 — no front page, cover or About page is duplicated ──────────── */

test('TEST 3 — the Visual front page, the cover and the Visual About page are not restated', () => {
  const hook = read(PROJECT_REPORT_HOOK);

  // The Visual Report's own design-summary page and the separate cover page are
  // replaced by the merged front page.
  assert.ok(!hook.includes('id: "design-summary"'), 'the Visual design-summary page must not be restated');
  assert.ok(!hook.includes('project-report-cover'), 'the document must carry no separate cover page');
  assert.ok(!hook.includes('ProjectReportCover'), 'no cover component may be composed into the document');

  // The Visual Report's About page is replaced by the Technical Report's own.
  assert.ok(!hook.includes('about-sound-proof'), 'the Visual About page must not be restated');
  assert.ok(!hook.includes('AboutSoundProofReportPage'), 'the Visual About component must not be composed');
  assert.ok(!hook.includes('aboutSoundProofHtml'), 'the Visual About copy must not be carried');

  // No second composition authority re-orders or re-sections the document.
  const registry = read('src/components/report/projectReport/projectReportRegistry.js');
  assert.ok(!registry.includes('orderProjectReportPages'));
  assert.ok(!registry.includes('buildParameterIndexPages'));
  assert.ok(!registry.includes('technicalEvidenceForPage'));
  assert.ok(!hook.includes('orderProjectReportPages'), 'the document must not be re-ordered by a registry');
  assert.ok(!hook.includes('buildParameterIndexPages'), 'no category tables may be generated for the document');
  assert.ok(!hook.includes('sectionForPage'), 'no per-page re-sectioning may run');
});

/* ── TEST 4 — the Technical pages follow, whole ─────────────────────────── */

test('TEST 4 — the Technical pages follow the Visual pages with the card block and drawings intact', () => {
  const page = read(PROJECT_REPORT_PAGE);

  // The Technical pages are mounted AFTER the Visual pages, by the report page.
  assertInOrder(page, ['orderedPages.map(', '<TechnicalReportDocument />']);
  assert.match(page, /\{reportReady && orderedPages\.length > 0 && <TechnicalReportDocument \/>\}/);

  // …and the mounted document is the Technical Report's own component.
  const embed = read(TECHNICAL_DOCUMENT);
  assert.match(embed, /import \{ TechnicalReportEmbedded \} from '@\/pages\/RP22Report';/);
  assert.match(embed, /<TechnicalReportEmbedded \/>/);
  assert.match(read(TECHNICAL_REPORT_PAGE), /export function TechnicalReportEmbedded\(\) \{\s*return <RP22ReportInner embed \/>;\s*\}/);

  const print = technicalPrintLayout();

  // The Technical Report's own printed page order, unchanged: the level
  // definitions, the room plan, the complete parameter block, the drawing set,
  // then the primary-seat bass curves and the closing About page.
  assertInOrder(print, [
    'id="pdf-cover"',
    'id="pdf-room-plan"',
    'id="pdf-room-plan-dims"',
    'id="pdf-room-plan-positions"',
    '<section id="pdf-room-parameters">',
    '<RP22ReportParameterGrid {...parameterGridProps} variant="print" />',
    'id="pdf-elevation-front"',
    'id="pdf-elevation-left"',
    'id="pdf-elevation-right"',
    'id="pdf-sightlines"',
    'id="pdf-screen-wall-construction"',
    '<TechnicalAboutSoundProofSection />',
  ]);

  // All P1–P21 cards stay together in ONE contiguous printed block: the grid is
  // printed exactly once, and no page between the room plan and the drawings
  // carries a card of its own.
  assert.equal(
    print.split('<RP22ReportParameterGrid {...parameterGridProps} variant="print" />').length - 1,
    1,
    'the parameter-card block must print exactly once',
  );
  const cardBlock = print.slice(
    print.indexOf('<section id="pdf-room-parameters">'),
    print.indexOf('id="pdf-elevation-front"'),
  );
  assert.ok(cardBlock.includes('<RP22ReportParameterGrid'), 'the card block must hold the parameter grid');
  assert.ok(
    print.indexOf('id="pdf-elevation-front"') > print.indexOf('<RP22ReportParameterGrid {...parameterGridProps} variant="print" />'),
    'no drawing may be printed inside the parameter-card block',
  );

  // The drawings stay together as the Technical Report's own drawing set.
  const drawings = print.slice(
    print.indexOf('id="pdf-elevation-front"'),
    print.indexOf('<TechnicalAboutSoundProofSection />'),
  );
  for (const needle of [
    'id="pdf-elevation-front"',
    'id="pdf-elevation-left"',
    'id="pdf-elevation-right"',
    'id="pdf-sightlines"',
    'id="pdf-screen-wall-construction"',
  ]) {
    assert.ok(drawings.includes(needle), `the drawing set must keep ${needle}`);
  }

  // The primary-seat bass curves stay with the technical pages.
  assert.ok(
    drawings.indexOf('<BassResponseGraphSection') > -1,
    'the primary-seat bass curves must stay in the Technical pages',
  );

  // No parameter card is inserted between the Visual pages.
  const clientPage = read(CLIENT_REPORT_PAGE);
  assert.ok(!clientPage.includes('TechnicalParameterCard'), 'the Visual wrapper must not print parameter cards');
  assert.ok(!clientPage.includes('technicalCardIds'), 'the Visual wrapper must not carry card ids');
  assert.ok(!clientPage.includes('ProjectReportParameterCards'), 'no card may be inserted into a Visual page');
});

/* ── TEST 5 — exactly one About page, at the end ────────────────────────── */

test('TEST 5 — exactly one About Sound Proof page exists and it closes the document', () => {
  const hook = read(PROJECT_REPORT_HOOK);
  const page = read(PROJECT_REPORT_PAGE);
  const print = technicalPrintLayout();

  // The Visual composition states no About page…
  assert.ok(!/about/i.test(hook.match(/id: "[^"]+"/g).join(' ')), 'no Visual page may be an About page');

  // …the report page mounts no About page of its own…
  assert.ok(!page.includes('AboutSoundProofReportPage'), 'the report page must not mount a Visual About page');
  assert.ok(!page.includes('<TechnicalAboutSoundProofSection'), 'the About page is mounted by the Technical document');

  // …and the Technical print layout carries exactly one, as its last page.
  assert.equal(
    print.split('<TechnicalAboutSoundProofSection />').length - 1,
    1,
    'exactly one About Sound Proof page may print',
  );
  const aboutIndex = print.indexOf('<TechnicalAboutSoundProofSection />');
  assert.ok(
    aboutIndex > print.lastIndexOf('<BassResponseGraphSection'),
    'the About page must close the document, after the bass curves',
  );
});