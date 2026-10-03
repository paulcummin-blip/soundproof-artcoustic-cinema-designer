// technical-report-filename.test.mjs
// ---------------------------------------------------------------------------
// ACCEPTANCE — Technical Report PDF filename.
//
//   TEST 1  The required filename, exactly
//   TEST 2  Required tokens present, forbidden tokens absent
//   TEST 3  A blank project reference is omitted cleanly
//   TEST 4  Illegal filename characters sanitised, readable hyphen separators
//   TEST 5  Every Technical Report print path prints from the app-owned window
//   TEST 6  No path falls back to the browser/app tab title or a generic name
//   TEST 7  One shared filename helper across Proposal, Visual and Technical
// ---------------------------------------------------------------------------
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  buildTechnicalReportTitle,
  buildVisualReportTitle,
  buildProposalReportTitle,
} from '../components/report/reportPdfTitle.js';

const ROOT = path.resolve(process.cwd());
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const MARQUEE_DETAILS = { dealerName: 'Sound Proof', projectReference: '34 AR' };

// ── TEST 1 — the required filename ─────────────────────────────────────────
test('TEST 1 — the Technical Report filename matches the required format', () => {
  assert.equal(
    buildTechnicalReportTitle('Marquee Home', null, MARQUEE_DETAILS),
    'Sound Proof - Artcoustic Cinema Designer - Technical - Sound Proof - Marquee Home - 34 AR',
  );
});

// ── TEST 2 — required tokens present, forbidden tokens absent ──────────────
test('TEST 2 — required tokens present, forbidden tokens absent', () => {
  const filename = buildTechnicalReportTitle('Marquee Home', null, MARQUEE_DETAILS);

  for (const token of ['Sound Proof', 'Artcoustic Cinema Designer', 'Technical', 'Marquee Home', '34 AR']) {
    assert.ok(filename.includes(token), `includes ${token}`);
  }

  assert.ok(!/base\s*44/i.test(filename), 'never names the platform');
  assert.ok(!filename.includes('SoundProof'), 'brand is always spaced "Sound Proof"');
  assert.ok(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(filename),
    'never an ID on its own');

  // Not a generic browser/app title.
  for (const generic of [
    'SoundProof - Artcoustic Cinema Designer',
    'Sound Proof - Artcoustic Cinema Designer',
    'RP22Report',
    'Technical Report',
    'Document',
    'Untitled',
  ]) {
    assert.notEqual(filename, generic, `never the generic title "${generic}"`);
  }

  // The project name is present even when the project has no reference yet.
  const noReference = buildTechnicalReportTitle('Marquee Home', null, { dealerName: 'Ribble AV' });
  assert.ok(noReference.includes('Marquee Home') && noReference.includes('Technical'));
});

// ── TEST 3 — blank reference omitted cleanly ───────────────────────────────
test('TEST 3 — a blank project reference is omitted cleanly', () => {
  const expected = 'Sound Proof - Artcoustic Cinema Designer - Technical - Sound Proof - Marquee Home';

  for (const blank of [null, undefined, '', '   ']) {
    const filename = buildTechnicalReportTitle('Marquee Home', null, {
      dealerName: 'Sound Proof',
      projectReference: blank,
    });
    assert.equal(filename, expected, `reference ${JSON.stringify(blank)} leaves no segment`);
    assert.ok(!filename.includes(' -  - '), 'no empty segment');
    assert.ok(!filename.endsWith('-') && !filename.endsWith(' '), 'no dangling separator');
    assert.ok(!filename.includes('null') && !filename.includes('undefined'));
  }

  // A dealer-less project still names brand, product, type and project.
  assert.equal(
    buildTechnicalReportTitle('Marquee Home', null, {}),
    'Sound Proof - Artcoustic Cinema Designer - Technical - Marquee Home',
  );
});

// ── TEST 4 — sanitising and separators ─────────────────────────────────────
test('TEST 4 — illegal characters are sanitised and separators are readable hyphens', () => {
  const filename = buildTechnicalReportTitle(
    'Marquee: Home / "34 AR"?',
    null,
    { dealerName: 'Sound Proof <UK>', projectReference: '34|AR' },
  );

  assert.ok(!/[\\/:*?"<>|]/.test(filename), 'no illegal filename characters survive');
  assert.ok(filename.includes(' - '), 'segments are joined with spaced hyphens');
  assert.ok(filename.startsWith('Sound Proof - Artcoustic Cinema Designer - Technical - '), 'fixed prefix intact');
});

// ── TEST 5 — every print path uses the app-owned window ────────────────────
test('TEST 5 — every Technical Report print path prints from the app-owned window', () => {
  const windowModule = read('src/components/report/technical/technicalReportPrintWindow.js');
  assert.ok(windowModule.includes('@/components/report/reportPrintWindow'), 'reuses the shared print window');
  assert.ok(!windowModule.includes('window.open('), 'no private window implementation');
  assert.ok(!windowModule.includes('document.write('), 'no duplicated document writer');
  assert.ok(windowModule.includes(".print-only.print-keep-layout"), 'prints the whole print-only layout');
  assert.ok(windowModule.includes('title'), 'carries the report filename into the window');

  // The shared printer sets the printed document's own title — which is the
  // filename the browser offers in "Save as PDF".
  const shared = read('src/components/report/reportPrintWindow.js');
  assert.ok(shared.includes('<title>${escapeHtmlText(title)}</title>'), 'the window document title is the filename');

  // Path 1 — the export button click opens the window, then the report prints.
  const header = read('src/components/report/ReportHeader.jsx');
  assert.ok(header.includes('openTechnicalReportPrintWindow(printTitle)'), 'the click opens the app-owned window');
  const openAt = header.indexOf('openTechnicalReportPrintWindow(printTitle)');
  const captureAt = header.indexOf('setIsPrinting(true)');
  assert.ok(openAt > 0 && openAt < captureAt, 'opened before the capture pipeline, on the click');

  // Path 2 — the report's print pipeline fills and prints that window.
  const report = read('src/pages/RP22Report.jsx');
  assert.ok(report.includes('printTechnicalReportInWindow('), 'prints into the app-owned window');
  assert.ok(report.includes('findTechnicalReportPrintNode()'), 'prints the report layout');
  assert.ok(report.includes('printTechnicalReport();'), 'the print trigger uses the shared print path');
  assert.ok(report.includes('printWindowRef={printWindowRef}'), 'the click handler receives the window slot');
  assert.ok(report.includes('onPrintFallback={printTechnicalReport}'), 'the stalled/failed fallbacks use the same path');

  // Path 3 — capture-failure fallback.
  const capture = read('src/components/report/usePlanCapture.jsx');
  assert.ok(capture.includes('onPrintFallback'), 'capture failure routes through the report print path');

  // Path 4 — the stalled-export fallback.
  assert.ok(header.includes('onPrintFallback();'), 'stalled export routes through the report print path');

  // Path 5 — Design Review's "Download Technical Report" delegates to the report,
  // so there is no separate print/title path to name the file.
  const review = read('src/components/designreview/DesignReviewActions.jsx');
  assert.ok(review.includes('/RP22Report?projectId=') && review.includes('autoPrint=1'), 'delegates to the report');
  assert.ok(!review.includes('window.print()'), 'no second print path');
  assert.ok(!review.includes('applyPrintDocumentTitle'), 'no second title path');
});

// ── TEST 6 — no generic-title path is left ─────────────────────────────────
test('TEST 6 — no path names the file after the browser or app tab', () => {
  const report = read('src/pages/RP22Report.jsx');
  // In-place printing is reachable ONLY as a fallback: when no app-owned window
  // could be opened, and when the opened window refused to print.
  assert.ok(
    /if \(!printWindow\) \{[\s\S]{0,60}printInPlace\(\);/.test(report),
    'in-place printing is guarded by "no app-owned window"',
  );
  assert.ok(
    /if \(printed\) return;[\s\S]{0,220}closeTechnicalReportPrintWindow\(printWindow\);[\s\S]{0,60}printInPlace\(\);/.test(report),
    'a refused window also falls back to printing in place',
  );
  assert.equal((report.match(/printInPlace\(\)/g) || []).length, 2,
    'the in-place print is reachable from those two fallbacks and nowhere else');

  // The in-place fallback still applies the report's own filename to both documents.
  assert.ok(report.includes('applyPrintDocumentTitle(technicalReportPrintTitle)'), 'fallback applies the filename');
  assert.ok(report.includes('restorePrintDocumentTitle()'), 'fallback restores the tab title afterwards');

  // No blob/download path names the report PDF separately.
  assert.ok(!/download=[^>]*\.pdf/.test(report), 'no separate download filename for the report');

  // The capture fallback no longer applies a title itself: it has one path only.
  const capture = read('src/components/report/usePlanCapture.jsx');
  assert.ok(!capture.includes('applyPrintDocumentTitle'), 'capture fallback does not name the file itself');
  assert.ok(!capture.includes('window.print()'), 'capture fallback does not print on its own');

  // The report opens its window under the report's own filename.
  const reportWindow = report.slice(report.indexOf('openTechnicalReportPrintWindow('), report.indexOf('openTechnicalReportPrintWindow(') + 120);
  assert.ok(reportWindow.includes('technicalReportPrintTitle'), 'window titled by the report filename');
});

// ── TEST 7 — one shared filename helper ────────────────────────────────────
test('TEST 7 — Technical, Visual and Proposal share one filename helper', () => {
  const helper = read('src/components/report/reportPdfTitle.js');
  assert.ok(helper.includes('const BRAND = "Sound Proof"'));
  assert.ok(helper.includes('const PRODUCT = "Artcoustic Cinema Designer"'));

  const details = MARQUEE_DETAILS;
  assert.equal(
    buildVisualReportTitle('Marquee Home', null, details),
    'Sound Proof - Artcoustic Cinema Designer - Visual - Sound Proof - Marquee Home - 34 AR',
  );
  assert.equal(
    buildProposalReportTitle('Marquee Home', 'single', details),
    'Sound Proof - Artcoustic Cinema Designer - Proposal - Sound Proof - Marquee Home - 34 AR',
  );

  // Every report names itself with the same prefix and the same separators.
  for (const title of [
    buildTechnicalReportTitle('Marquee Home', null, details),
    buildVisualReportTitle('Marquee Home', null, details),
    buildProposalReportTitle('Marquee Home', 'single', details),
  ]) {
    assert.ok(title.startsWith('Sound Proof - Artcoustic Cinema Designer - '), 'shared prefix');
  }
});