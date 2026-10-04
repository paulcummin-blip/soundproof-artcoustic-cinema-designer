// report-version-identity.test.mjs
// ---------------------------------------------------------------------------
// ACCEPTANCE — design version identity on the Visual and Technical Reports.
//
//   TEST 1  Visual Report: front page and filename state the version
//   TEST 2  Technical Report: front page and filename state the version
//   TEST 3  The version segment rules (name, slot marker, blank fallback)
//   TEST 4  Filenames still carry dealer, project, client and reference
//   TEST 5  The first-page line is one line, and never invents a client/reference
//   TEST 6  Neither report page can build a version-less filename or line
//   TEST 7  Proposal Centre states the version its report status belongs to
// ---------------------------------------------------------------------------
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  buildVisualReportTitle,
  buildTechnicalReportTitle,
} from '../components/report/reportPdfTitle.js';
import { clientReportHeaderMeta } from '../components/report/client/clientReportHeaderMeta.js';
import { reportHeaderMetadata } from '../components/report/reportPrintHeader.js';
import { versionDisplayName } from '../components/proposal/sourceAuthority/proposalReadinessAuthority.js';

const ROOT = path.resolve(process.cwd());
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const MARQUEE = 'Marquee Home';
const PROJECT = {
  name: MARQUEE,
  client_name: null,
  project_reference: '34 AR',
  created_date: '2026-09-29T10:00:00.000Z',
};
const DATE_LINE = '29 September 2026';
const ORIGINAL = { number: 1, name: 'Original Design' };
const LEVEL_4 = { number: 4, name: 'Level 4 version' };
const DETAILS = { dealerName: 'Sound Proof', projectReference: '34 AR' };

const VISUAL_PREFIX = 'Sound Proof - Artcoustic Cinema Designer - Visual - Sound Proof - Marquee Home';
const TECHNICAL_PREFIX = 'Sound Proof - Artcoustic Cinema Designer - Technical - Sound Proof - Marquee Home';

// ── TEST 1 — Visual Report ─────────────────────────────────────────────────
test('TEST 1 — the Visual Report states its design version on the front page and in the filename', () => {
  assert.equal(
    buildVisualReportTitle(MARQUEE, ORIGINAL, DETAILS),
    `${VISUAL_PREFIX} - 34 AR - Original Design V1`,
  );
  assert.equal(
    buildVisualReportTitle(MARQUEE, LEVEL_4, DETAILS),
    `${VISUAL_PREFIX} - 34 AR - Level 4 version`,
  );

  const line = clientReportHeaderMeta(PROJECT, LEVEL_4);
  assert.ok(line.includes('Version: Level 4 version'), 'the front page states the version');
  assert.ok(line.includes(MARQUEE) && line.includes('Ref: 34 AR') && line.includes(DATE_LINE),
    'the front page keeps project, reference and date');
  assert.equal(clientReportHeaderMeta(PROJECT, ORIGINAL).includes('Version: Original Design'), true);
});

// ── TEST 2 — Technical Report ──────────────────────────────────────────────
test('TEST 2 — the Technical Report states the same version on its front page and in the filename', () => {
  assert.equal(
    buildTechnicalReportTitle(MARQUEE, ORIGINAL, DETAILS),
    `${TECHNICAL_PREFIX} - 34 AR - Original Design V1`,
  );
  assert.equal(
    buildTechnicalReportTitle(MARQUEE, LEVEL_4, DETAILS),
    `${TECHNICAL_PREFIX} - 34 AR - Level 4 version`,
  );

  // Both reports read ONE first-page line, so they can never state different
  // project, client, version, reference or date.
  for (const version of [ORIGINAL, LEVEL_4]) {
    assert.equal(
      reportHeaderMetadata(PROJECT, version),
      clientReportHeaderMeta(PROJECT, version),
    );
  }
  assert.equal(
    reportHeaderMetadata(PROJECT, LEVEL_4),
    `Marquee Home · Version: Level 4 version · Ref: 34 AR · ${DATE_LINE}`,
  );
});

// ── TEST 3 — the version segment rules ─────────────────────────────────────
test('TEST 3 — the version segment states the name, adds the slot once, and never goes blank', () => {
  const barePrefix = 'Sound Proof - Artcoustic Cinema Designer - Technical - Marquee Home - ';
  const segment = (version) => buildTechnicalReportTitle(MARQUEE, version, {})
    .replace(barePrefix, '');

  assert.equal(segment(ORIGINAL), 'Original Design V1', 'the original design is identifiable as V1');
  assert.equal(segment(LEVEL_4), 'Level 4 version', 'a name that already states its number is not doubled');
  assert.equal(segment({ number: 2, name: 'Twin SUB2-12' }), 'Twin SUB2-12 V2');
  assert.equal(segment({ number: 3, name: 'Current Design' }), 'Current Design V3');
  assert.equal(segment({ number: null, name: '' }), 'Version 1', 'blank name falls back to Version 1');
  assert.equal(segment({ number: 3, name: '   ' }), 'Version 3', 'blank name falls back to the stored slot');
  assert.equal(segment({ number: null, name: null }), 'Version 1');

  // Every produced segment is filename-safe and never names the platform.
  for (const version of [ORIGINAL, LEVEL_4, { number: 2, name: 'A/B: "test"' }]) {
    const title = buildTechnicalReportTitle('Base44 Marquee: Home', version, { dealerName: 'Base44' });
    assert.ok(!/base\s*44/i.test(title), 'never names the platform');
    assert.ok(!/[\\/:*?"<>|]/.test(title), 'no illegal filename characters survive');
    assert.ok(!title.includes(' -  - ') && !title.endsWith(' - '), 'no empty or dangling segment');
    assert.ok(!title.includes('null') && !title.includes('undefined'), 'no placeholder text');
  }
});

// ── TEST 4 — the rest of the identity is still stated ──────────────────────
test('TEST 4 — filenames still carry dealer, project, client and reference, with the version last', () => {
  const withClient = { dealerName: 'Ribble AV', clientName: 'Noble Projects', projectReference: 'LH-001' };
  assert.equal(
    buildTechnicalReportTitle('Lords Hall', LEVEL_4, withClient),
    'Sound Proof - Artcoustic Cinema Designer - Technical - Ribble AV - Lords Hall - Noble Projects - LH-001 - Level 4 version',
  );
  assert.equal(
    buildVisualReportTitle(MARQUEE, LEVEL_4, { dealerName: 'Sound Proof', clientName: 'Noble Projects', projectReference: '34 AR' }),
    `${VISUAL_PREFIX} - Noble Projects - 34 AR - Level 4 version`,
  );

  // An identical client name and reference are still written once.
  assert.equal(
    buildTechnicalReportTitle(MARQUEE, LEVEL_4, { dealerName: 'Sound Proof', clientName: '34 AR', projectReference: '34 AR' }),
    `${TECHNICAL_PREFIX} - 34 AR - Level 4 version`,
  );

  // A project with no reference keeps its project name and its version.
  const noReference = buildTechnicalReportTitle(MARQUEE, LEVEL_4, { dealerName: 'Sound Proof' });
  assert.equal(noReference, `${TECHNICAL_PREFIX} - Level 4 version`);
  assert.ok(noReference.includes(MARQUEE) && noReference.includes('Level 4 version'));
});

// ── TEST 5 — the first-page line ───────────────────────────────────────────
test('TEST 5 — the front page is one line, and a blank client never borrows the reference', () => {
  assert.equal(
    reportHeaderMetadata({ ...PROJECT, client_name: '', project_reference: '   ' }, ORIGINAL),
    `Marquee Home · Version: Original Design · ${DATE_LINE}`,
  );
  assert.equal(
    reportHeaderMetadata({ ...PROJECT, client_name: 'Noble Projects', project_reference: '' }, ORIGINAL),
    `Marquee Home · Noble Projects · Version: Original Design · ${DATE_LINE}`,
  );
  // No version stated when the caller states none (a caller that supplies one
  // always gets one — the report pages always supply one).
  assert.equal(reportHeaderMetadata({ name: MARQUEE, project_reference: '34 AR' }), 'Marquee Home · Ref: 34 AR');
});

// ── TEST 6 — no report path can leave the version out ──────────────────────
test('TEST 6 — both report pages state the version on their first page and in their filename', () => {
  const visualReport = read('src/pages/RP22ClientReport.jsx');
  assert.ok(visualReport.includes('const reportVersion = useMemo('), 'one version object for the report');
  assert.ok(visualReport.includes('version={reportVersion}'), 'the first page receives the version');
  assert.ok(visualReport.includes('versionNumber,\n    versionName,'), 'the export receives the version');

  const visualPage = read('src/components/report/client/ClientReportPage.jsx');
  assert.ok(visualPage.includes('clientReportHeaderMeta(projectDetails, version)'), 'the masthead states it');

  const visualExport = read('src/components/report/client/useClientReportPdfExport.js');
  assert.ok(visualExport.includes('{ number: versionNumber, name: versionName }'), 'the filename states it');

  const technicalReport = read('src/pages/RP22Report.jsx');
  assert.ok(
    technicalReport.includes('const technicalFirstPageMeta = reportHeaderMetadata(projectDetails, {'),
    'the Technical Report composes its first-page line with the version',
  );
  assert.ok(technicalReport.includes('meta={technicalFirstPageMeta}'), 'the cover renders that line');
  assert.ok(
    technicalReport.includes('const technicalReportPrintTitle = buildTechnicalReportTitle(')
      && technicalReport.includes('{ number: reportVersionNumber, name: reportVersionName }'),
    'the filename states the same version',
  );

  // One shared builder states the line for both reports.
  const printHeader = read('src/components/report/reportPrintHeader.js');
  assert.ok(printHeader.includes('return reportFirstPageMeta(project, version)'));
  assert.ok(read('src/components/report/client/clientReportHeaderMeta.js').includes('reportFirstPageMeta(projectDetails, version)'));
});

// ── TEST 7 — Proposal Centre report status names the version ───────────────
test('TEST 7 — Proposal Centre states which version each report status belongs to', () => {
  assert.equal(versionDisplayName({ version_name: 'Original Design', version_number: 1 }), 'Original Design · V1');
  assert.equal(versionDisplayName({ version_name: LEVEL_4.name, version_number: 4 }), 'Level 4 version · V4');
  assert.equal(versionDisplayName({ version_name: '  ', version_number: 3 }), 'Version 3');

  const readiness = read('src/components/proposal/sourceAuthority/useProposalReadiness.js');
  assert.ok(readiness.includes('versionDisplayName('), 'each readiness row is named by its version');

  const table = read('src/components/proposal/sourceAuthority/VersionReadinessTable.jsx');
  assert.ok(table.includes('{row.versionName}'), 'the version name is shown on every row');
  assert.ok(table.includes('READINESS_COLUMNS.map'), 'each version states its Visual and Technical report status');
  for (const column of ['Visual Report', 'Technical Report']) {
    assert.ok(read('src/components/proposal/sourceAuthority/proposalReadinessAuthority.js').includes(column),
      `the readiness columns include the ${column}`);
  }
});