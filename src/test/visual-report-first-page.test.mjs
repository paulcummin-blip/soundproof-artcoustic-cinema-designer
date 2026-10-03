// visual-report-first-page.test.mjs
// ---------------------------------------------------------------------------
// ACCEPTANCE — Visual Report PDF filename and first page.
//
//   TEST 1  Filename uses the shared project-aware format, matching the example
//   TEST 2  Filename rules: never Base44, never a generic app title, optional
//           dealer and project reference omitted when blank
//   TEST 3  The Visual Report prints from the app-owned window under the shared
//           filename, so the browser cannot name the file after the host tab
//   TEST 4  The proposal pack and the Visual Report share ONE print-window
//           implementation and ONE filename helper
//   TEST 5  No separate cover page and no oversized image cover block
//   TEST 6  First-page masthead: logo at Technical Report size, title, meta
//   TEST 7  The highlighted summary statement is centred and moved down
// ---------------------------------------------------------------------------
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  buildVisualReportTitle,
  buildTechnicalReportTitle,
  buildReportPdfFilename,
} from '../components/report/reportPdfTitle.js';

const ROOT = path.resolve(process.cwd());
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

// ── TEST 1 — the required filename ─────────────────────────────────────────
test('TEST 1 — the Visual Report filename matches the required format', () => {
  const filename = buildVisualReportTitle(
    'Marquee Home',
    null,
    { dealerName: 'Sound Proof', projectReference: '34 AR' },
  );

  assert.equal(
    filename,
    'Sound Proof - Artcoustic Cinema Designer - Visual - Sound Proof - Marquee Home - 34 AR',
  );
  assert.equal(`${filename}.pdf`, buildReportPdfFilename(
    'Visual', 'Marquee Home', null, { dealerName: 'Sound Proof', projectReference: '34 AR' },
  ));

  // The Technical Report keeps the same shape with its own type token.
  assert.equal(
    buildTechnicalReportTitle('Marquee Home', null, { dealerName: 'Sound Proof', projectReference: '34 AR' }),
    'Sound Proof - Artcoustic Cinema Designer - Technical - Sound Proof - Marquee Home - 34 AR',
  );
});

// ── TEST 2 — filename rules ────────────────────────────────────────────────
test('TEST 2 — no platform name, no generic title, optional segments omitted', () => {
  const withoutOptionals = buildVisualReportTitle('Marquee Home', null, {});
  assert.equal(withoutOptionals, 'Sound Proof - Artcoustic Cinema Designer - Visual - Marquee Home');

  // A blank dealer or reference leaves no empty segment and no placeholder.
  assert.ok(!withoutOptionals.includes(' -  - '), 'no empty segment');
  assert.ok(!withoutOptionals.includes('null'));
  assert.ok(!withoutOptionals.includes('undefined'));

  // Every required token is present in every filename.
  for (const value of [withoutOptionals, buildVisualReportTitle('Marquee Home', null, { dealerName: 'Ribble AV' })]) {
    assert.ok(value.includes('Sound Proof'), 'Sound Proof always present');
    assert.ok(value.includes('Artcoustic Cinema Designer'), 'product always present');
    assert.ok(value.includes('Visual'), 'report type always present');
    assert.ok(value.includes('Marquee Home'), 'project name always present');
    assert.ok(!/base\s*44/i.test(value), 'the platform is never named');
  }

  // The platform name is stripped even when it was typed into a project or dealer.
  const scrubbed = buildVisualReportTitle('Base44 Demo Room', null, { dealerName: 'Base 44 Ltd' });
  assert.ok(!/base\s*44/i.test(scrubbed), 'platform name removed from every segment');

  // A missing project name still states the report type — never a generic tab title.
  const unnamed = buildVisualReportTitle('', null, {});
  assert.ok(unnamed.includes('Visual') && unnamed.includes('Untitled Project'));
  assert.notEqual(unnamed, 'SoundProof - Artcoustic Cinema Designer');
});

// ── TEST 3 — the Visual Report prints from the app-owned window ────────────
test('TEST 3 — the export is named by the report, not by the host tab', () => {
  const hook = read('src/components/report/client/useClientReportPdfExport.js');

  assert.ok(hook.includes("from \"@/components/report/reportPdfTitle\""), 'uses the shared filename helper');
  assert.ok(hook.includes('buildVisualReportTitle('), 'builds the Visual Report filename');
  assert.ok(hook.includes('openReportPrintWindow('), 'opens the app-owned print window');
  assert.ok(hook.includes('printReportInWindow('), 'prints from the app-owned window');

  // The window must be opened synchronously, before any await, while the click
  // is still a user gesture — otherwise the browser blocks it.
  const openAt = hook.indexOf('openReportPrintWindow(');
  const firstAwaitAt = hook.indexOf('await ');
  assert.ok(openAt > 0 && openAt < firstAwaitAt, 'the window is opened before the first await');

  // The in-place print remains as the fallback when the window is refused.
  assert.ok(hook.includes('window.print()'), 'in-place fallback preserved');
  assert.ok(hook.includes('applyPrintDocumentTitle('), 'fallback still applies the report title');
});

// ── TEST 4 — one implementation, shared ────────────────────────────────────
test('TEST 4 — proposal and Visual Report share the print window and helper', () => {
  const proposalWindow = read('src/components/proposal/export/proposalPrintWindow.js');
  assert.ok(proposalWindow.includes("@/components/report/reportPrintWindow"), 'proposal reuses the shared window module');
  assert.ok(!proposalWindow.includes('window.open('), 'the proposal keeps no private window implementation');
  assert.ok(!proposalWindow.includes('document.write('), 'no duplicated document writer');

  const proposalExport = read('src/components/proposal/export/useProposalExport.js');
  assert.ok(proposalExport.includes('buildProposalReportTitle'), 'proposal uses the shared filename helper');

  // One filename helper owns the whole format.
  const helper = read('src/components/report/reportPdfTitle.js');
  assert.ok(helper.includes('const BRAND = "Sound Proof"'));
  assert.ok(helper.includes('const PRODUCT = "Artcoustic Cinema Designer"'));
});

// ── TEST 5 — no separate cover page, no oversized cover image ──────────────
test('TEST 5 — the report starts on its own first page', () => {
  const page = read('src/pages/RP22ClientReport.jsx');
  assert.ok(!/id:\s*["']cover["']/.test(page), 'the page list has no standalone cover page');
  assert.ok(page.includes('id: "design-summary"'), 'the first page is the Design Summary page');

  const highlights = read('src/components/report/client/ClientDesignHighlights.jsx');
  assert.ok(!highlights.includes('width: 290'), 'the oversized cover logo is gone');
  assert.ok(!highlights.includes('LOGO_URL'), 'the highlights page no longer renders its own cover image');
});

// ── TEST 6 — first-page masthead matches the Technical Report ──────────────
test('TEST 6 — the first-page logo matches the Technical Report cover', () => {
  const styles = read('src/components/report/client/ClientReportPrintStyles.jsx');
  assert.equal((styles.match(/width: 62mm;/g) || []).length >= 3, true,
    'logo sized at 62mm on screen, in print mode and in print media');
  assert.ok(!styles.includes('--client-report-logo-height'), 'the old smaller logo height is gone');
  assert.ok((styles.match(/max-height: 54mm/g) || []).length === 2, 'header height allows the larger logo');

  // The Technical Report cover is the sizing authority: 62mm wide, centred.
  const cover = read('src/components/report/ReportCover.jsx');
  assert.ok(cover.includes("width: '62mm'"), 'Technical Report cover uses 62mm');

  // The masthead is no longer print-only: the first page shows it on screen too.
  const page = read('src/components/report/client/ClientReportPage.jsx');
  assert.ok(page.includes('className="client-report-page__header"'), 'masthead class applied');
  assert.ok(!page.includes('className="client-report-page__header client-report-print-only"'),
    'the masthead is no longer hidden on screen');
  assert.ok(page.includes('client-report-page__header-title'), 'Visual Report title on the first page');
  assert.ok(page.includes('client-report-page__header-meta'), 'project metadata on the first page');
  assert.ok(/\.client-report-page__header\s*\{[^}]*border-bottom/s.test(styles), 'divider line under the masthead');
});

// ── TEST 7 — the summary statement is centred and moved down ──────────────
test('TEST 7 — the highlighted summary statement is centred and given room', () => {
  const page = read('src/components/report/client/ClientReportPage.jsx');
  assert.ok(/printData\.coverageSentence[\s\S]{0,260}textAlign: "center"/.test(page),
    'the printed statement is centred');
  assert.ok(/printData\.coverageSentence[\s\S]{0,260}marginTop: "8mm"/.test(page),
    'the printed statement is moved down below the heading');

  const highlights = read('src/components/report/client/ClientDesignHighlights.jsx');
  assert.ok(/coverageSentence[\s\S]{0,200}textAlign: "center"/.test(highlights),
    'the on-screen statement is centred');
  assert.ok(/coverageSentence[\s\S]{0,200}marginTop: 22/.test(highlights),
    'the on-screen statement is moved down below the heading');
});