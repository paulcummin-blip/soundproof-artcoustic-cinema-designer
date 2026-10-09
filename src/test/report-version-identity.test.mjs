// report-version-identity.test.mjs
// ---------------------------------------------------------------------------
// ACCEPTANCE — design version identity on the Visual and Technical Reports.
//
//   TEST 1  Visual Report: front page and filename state the version
//   TEST 2  Technical Report: front page and filename state the version
//   TEST 3  The version segment rules (saved name stated exactly, blank fallback)
//   TEST 4  Filenames still carry dealer, project, client and reference
//   TEST 5  The first-page line is one line, and never invents a client/reference
//   TEST 6  Neither report page can build a version-less filename or line
//   TEST 7  Proposal Centre states the version its report status belongs to
//   TEST 8  A System Design Summary states the exact saved version name
//   TEST 9  A System Design Comparison names every version
//   TEST 10 The saved version name is read on every report load route
// ---------------------------------------------------------------------------
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  buildVisualReportTitle,
  buildTechnicalReportTitle,
  buildProposalReportTitle,
  buildProposalVersionSegment,
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
    `${VISUAL_PREFIX} - 34 AR - Original Design`,
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
    `${TECHNICAL_PREFIX} - 34 AR - Original Design`,
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
test('TEST 3 — the version segment states the saved name exactly, and never goes blank', () => {
  const barePrefix = 'Sound Proof - Artcoustic Cinema Designer - Technical - Marquee Home - ';
  const segment = (version) => buildTechnicalReportTitle(MARQUEE, version, {})
    .replace(barePrefix, '');

  // The name the designer saved is the identity, verbatim: no version slot
  // marker is ever appended to it.
  assert.equal(segment(ORIGINAL), 'Original Design', 'no V1 is appended to a saved name');
  assert.equal(segment(LEVEL_4), 'Level 4 version');
  assert.equal(segment({ number: 2, name: 'Twin SUB2-12' }), 'Twin SUB2-12', 'no V2 is appended');
  assert.equal(segment({ number: 3, name: 'Current Design' }), 'Current Design', 'no V3 is appended');
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
  // The saved name IS the identity, stated exactly: no slot marker is appended,
  // so a version called "Level 4 version" is never written "Level 4 version · V4".
  assert.equal(versionDisplayName({ version_name: 'Original Design', version_number: 1 }), 'Original Design');
  assert.equal(versionDisplayName({ version_name: LEVEL_4.name, version_number: 4 }), 'Level 4 version');
  assert.equal(versionDisplayName({ version_name: '  ', version_number: 3 }), 'Version 3');
  assert.equal(
    versionDisplayName({ version_name: 'Twin SUB2-12', version_number: 2 }),
    'Twin SUB2-12',
    'no V-slot suffix is ever appended to a saved version name',
  );

  const readiness = read('src/components/proposal/sourceAuthority/useProposalReadiness.js');
  assert.ok(readiness.includes('versionDisplayName('), 'each readiness row is named by its version');

  const table = read('src/components/proposal/sourceAuthority/VersionReadinessTable.jsx');
  assert.ok(table.includes('{row.versionName}'), 'the version name is shown on every row');
  assert.ok(table.includes('row.project'), 'each version states its canonical Project Report status');
  assert.ok(table.includes('READINESS_REPORT_LABEL'), 'the status uses the shared Project Report label');
  assert.ok(read('src/components/proposal/sourceAuthority/proposalReadinessAuthority.js').includes("'Project Report'"));
  assert.equal(table.includes('READINESS_COLUMNS.map'), false, 'retired dual-report columns are not rendered');
});

// ── TEST 8 — a System Design Summary ───────────────────────────────────────
test('TEST 8 — a System Design Summary states the exact saved version name on its cover and in its filename', () => {
  const versionNames = [LEVEL_4.name];

  assert.equal(buildProposalVersionSegment(versionNames), 'Level 4 version');
  assert.equal(
    buildProposalReportTitle(MARQUEE, 'system_summary', { ...DETAILS, versionNames }),
    'Sound Proof - Artcoustic Cinema Designer - System Design Summary - Sound Proof - Marquee Home'
      + ' - 34 AR - Level 4 version',
  );

  // The cover says "Version" and the stored name, never a generic slot label.
  const block = read('src/components/proposal/cover/CoverVersionBlock.jsx');
  assert.ok(block.includes("comparing ? 'Comparing' : 'Version'"), 'one version is labelled Version');
  assert.ok(block.includes('{name}'), 'the saved name is printed exactly as stored');

  const cover = read('src/components/proposal/cover/ProposalCoverPage.jsx');
  assert.ok(cover.includes('<CoverVersionBlock versionNames={versionNames} />'),
    'the cover page renders the version block');

  // The on-screen cover, the printed pack and the exported filename are given
  // the same saved names, so they cannot state different versions.
  const pack = read('src/components/proposal/print/ProposalPackDocument.jsx');
  assert.ok(pack.includes('versionNames = []') && pack.includes('versionNames={versionNames}'),
    'the printed pack carries the saved names onto its cover');
  const editor = read('src/pages/ProposalEditor.jsx');
  assert.ok(editor.includes('versionNames={proposalVersionNames}'), 'the editor passes the saved names');
  assert.ok(editor.includes('versionNames: proposalVersionNames'), 'the export is given the saved names');
  const exportHook = read('src/components/proposal/export/useProposalExport.js');
  assert.ok(exportHook.includes('versionNames = []') && exportHook.includes('{ ...identitySegments, versionNames }'),
    'the filename is built from the saved names');
});

// ── TEST 9 — a System Design Comparison ────────────────────────────────────
test('TEST 9 — a System Design Comparison names every version, on the cover and in the filename', () => {
  const versionNames = [LEVEL_4.name, 'Level 1 version'];

  assert.equal(buildProposalVersionSegment(versionNames), 'Comparing Level 4 version and Level 1 version');
  assert.equal(
    buildProposalReportTitle(MARQUEE, 'comparison', { ...DETAILS, versionNames }),
    'Sound Proof - Artcoustic Cinema Designer - System Design Comparison - Sound Proof - Marquee Home'
      + ' - 34 AR - Comparing Level 4 version and Level 1 version',
  );
  assert.ok(
    buildProposalReportTitle(MARQUEE, 'comparison', { ...DETAILS, versionNames }).includes('Level 4 version')
      && buildProposalReportTitle(MARQUEE, 'comparison', { ...DETAILS, versionNames }).includes('Level 1 version'),
    'both compared versions are named',
  );

  // Three or more are listed in full; a very long set shortens cleanly.
  assert.equal(
    buildProposalVersionSegment(['Alpha Design', 'Beta Design', 'Gamma Design']),
    'Comparing Alpha Design, Beta Design and Gamma Design',
  );
  const long = [
    'Reference Design With An Exceptionally Long Saved Version Name',
    'Second Very Long Saved Version Name',
  ];
  assert.equal(buildProposalVersionSegment(long), `Comparing ${long[0]} vs ${long[1]}`);
  assert.ok(buildProposalVersionSegment(long).length < 200, 'the comparison segment stays filename-sized');

  // A comparison with no known names states no version rather than a generic one.
  assert.equal(buildProposalVersionSegment([]), '');
  assert.equal(
    buildProposalReportTitle(MARQUEE, 'comparison', DETAILS),
    'Sound Proof - Artcoustic Cinema Designer - System Design Comparison - Sound Proof - Marquee Home - 34 AR',
  );

  // Several versions are listed one per line under a "Comparing" label.
  const block = read('src/components/proposal/cover/CoverVersionBlock.jsx');
  assert.ok(block.includes("comparing ? 'Comparing' : 'Version'"), 'the label switches to Comparing');
  assert.ok(block.includes('names.map'), 'every selected version is listed by name');
});

// ── TEST 10 — every load route states the saved version name ───────────────
test('TEST 10 — both reports read the saved version name on the in-session route too', () => {
  for (const file of [
    'src/components/report/client/useClientReportAuthority.jsx',
    'src/pages/RP22Report.jsx',
  ]) {
    const source = read(file);
    assert.ok(source.includes('readVersionIdentity'), `${file} imports the shared version reader`);
    assert.ok(source.includes('const version = await readVersionIdentity('),
      `${file} reads the saved version name on the in-session route`);
    assert.ok(source.includes('readProjectVersionRecord'), `${file} still reads it on the cold route`);
    // The version read is the version ASKED FOR — the request is resolved
    // explicitly, never taken from whichever version is loaded.
    assert.ok(source.includes('requestedVersionId'), `${file} reads the requested version`);
    assert.ok(source.includes('resolveReportVersionId'), `${file} resolves the request explicitly`);
  }

  // The name comes from the stored ProjectVersion record — the designer's own
  // name — and an unreadable one is left unstated rather than guessed.
  const identity = read('src/components/report/activeVersionIdentity.js');
  assert.ok(identity.includes('version_name'), 'the name is the stored version_name');
  assert.ok(identity.includes('readProjectVersionRecord'), 'read from the ProjectVersion record');
});