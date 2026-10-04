import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { REPORT_PRINT_HEADER, reportHeaderMetadata } from '../reportPrintHeader.js';
import { resolveReportFilenameDetails } from '../reportFilenameIdentity.js';
import {
  buildReportFilename,
  buildTechnicalReportTitle,
  buildVisualReportTitle,
  buildProposalReportTitle,
} from '../reportPdfTitle.js';

const read = (path) => fs.readFileSync(path, 'utf8');
const project = { id: 'project-1', account_id: 'account-1', name: 'Marquee Home', project_reference: '34 AR', client_name: null };
const account = { id: 'account-1', name: 'Sound Proof Admin Account', account_type: 'internal' };
const details = resolveReportFilenameDetails(project, account);
for (const [type, title] of [
  ['Technical', buildTechnicalReportTitle(project.name, null, details)],
  ['Visual', buildVisualReportTitle(project.name, null, details)],
  ['System Design Summary', buildProposalReportTitle(project.name, 'system_summary', details)],
]) {
  test(`${type}: exact project/account/reference filename`, () => {
    assert.equal(`${title}.pdf`, `Sound Proof - Artcoustic Cinema Designer - ${type} - Sound Proof - Marquee Home - 34 AR.pdf`);
  });
}
test('blank reference never falls back to the client or ID', () => {
  for (const blank of [null, undefined, '', '   ']) {
    const identity = resolveReportFilenameDetails({ ...project, project_reference: blank }, account);
    assert.equal(identity.projectReference, null);
    assert.equal(buildTechnicalReportTitle(project.name, null, identity), 'Sound Proof - Artcoustic Cinema Designer - Technical - Sound Proof - Marquee Home');
  }
});
test('dealer stamp takes precedence; unrelated account never supplies a filename', () => {
  assert.equal(resolveReportFilenameDetails({ ...project, dealer_name: 'Dealer' }, account).dealerName, 'Dealer');
  assert.equal(resolveReportFilenameDetails(project, { ...account, id: 'other' }).dealerName, null);
});
test('both print headers use one logo image and physical dimensions', () => {
  assert.equal(REPORT_PRINT_HEADER.logoWidthMm, 62);
  assert.equal(REPORT_PRINT_HEADER.logoWidthMm / REPORT_PRINT_HEADER.logoAspectRatio, 29.0625);
  const shared = read('src/components/report/ReportPrintHeader.jsx');
  assert.ok(shared.includes('header.logoWidthMm / header.logoAspectRatio'));
  assert.ok(shared.includes('REPORT_PROFILES.a4.header'));
  const technical = read('src/components/report/ReportCover.jsx');
  const visual = read('src/components/report/client/ClientReportPage.jsx');
  assert.ok(technical.includes('<ReportPrintHeader'));
  assert.ok(visual.includes('<ReportPrintHeader'));
  assert.ok(!technical.includes("width: '62mm'"));
  assert.ok(!read('src/components/report/client/ClientReportPrintStyles.jsx').includes('width: 62mm;'));
});
test('header references only the parent Project reference', () => {
  assert.equal(reportHeaderMetadata(project), 'Marquee Home · Ref: 34 AR');
  assert.equal(reportHeaderMetadata({ ...project, project_reference: '' }), 'Marquee Home');
});
test('fast and cold report loads both retain the filename fields', () => {
  for (const path of ['src/pages/RP22Report.jsx', 'src/components/report/client/useClientReportAuthority.jsx']) {
    const source = read(path);
    assert.equal((source.match(/dealer_name: p.dealer_name \|\| null/g) || []).length, 2);
    assert.equal((source.match(/project_reference: p.project_reference \|\| null/g) || []).length, 2);
  }
});
test('exports wait for identity; proposal filename does not use cover branding', () => {
  const technical = read('src/pages/RP22Report.jsx');
  const visual = read('src/pages/RP22ClientReport.jsx');
  assert.ok(technical.includes('exportDisabled={!filenameIdentity.ready'));
  assert.ok(technical.includes('if (!filenameIdentity.ready || reportHydrating'));
  assert.ok(visual.includes('disabled={!reportReady || !filenameIdentity.ready'));
  assert.ok(read('src/pages/ProposalEditor.jsx').includes('dealerName: projectContext.filenameDealerName'));
  assert.ok(!read('src/components/proposal/export/useProposalExport.js').includes("projectName || proposal?.title"));
});
// ── Every populated project identity field reaches the filename ─────────────
const MARQUEE = 'Marquee Home';
const MARQUEE_IDENTITY = { dealerName: 'Sound Proof' };

test('the resolver carries every project identity field into the export context', () => {
  assert.deepEqual(
    resolveReportFilenameDetails(
      { account_id: 'a1', name: ' Marquee Home ', client_name: ' 34 AR ', project_reference: ' MH-001 ' },
      { id: 'a1', name: 'Sound Proof Admin Account' },
    ),
    {
      dealerName: 'Sound Proof',
      projectName: 'Marquee Home',
      clientName: '34 AR',
      projectReference: 'MH-001',
    },
  );
});

test('client name and project reference are both stated when both are populated', () => {
  assert.equal(
    buildTechnicalReportTitle(MARQUEE, null, { ...MARQUEE_IDENTITY, clientName: '34 AR', projectReference: 'MH-001' }),
    'Sound Proof - Artcoustic Cinema Designer - Technical - Sound Proof - Marquee Home - 34 AR - MH-001',
  );
});

test('an identical client name and reference are written once', () => {
  assert.equal(
    buildTechnicalReportTitle(MARQUEE, null, { ...MARQUEE_IDENTITY, clientName: '34 AR', projectReference: '34 AR' }),
    'Sound Proof - Artcoustic Cinema Designer - Technical - Sound Proof - Marquee Home - 34 AR',
  );
  assert.equal((buildReportFilename('Technical', MARQUEE, null, { clientName: '34 AR', projectReference: '34 AR' }).match(/34 AR/g) || []).length, 1);
});

test('blank client name and blank reference leave both segments out', () => {
  for (const blank of [null, undefined, '', '   ']) {
    assert.equal(
      buildTechnicalReportTitle(MARQUEE, null, { ...MARQUEE_IDENTITY, clientName: blank, projectReference: blank }),
      'Sound Proof - Artcoustic Cinema Designer - Technical - Sound Proof - Marquee Home',
    );
  }
});

test('a blank client is never filled from the reference, or the reverse', () => {
  assert.equal(
    buildVisualReportTitle(MARQUEE, null, { ...MARQUEE_IDENTITY, clientName: 'Noble Projects', projectReference: '' }),
    'Sound Proof - Artcoustic Cinema Designer - Visual - Sound Proof - Marquee Home - Noble Projects',
  );
  assert.equal(
    buildVisualReportTitle(MARQUEE, null, { ...MARQUEE_IDENTITY, clientName: '', projectReference: 'MH-001' }),
    'Sound Proof - Artcoustic Cinema Designer - Visual - Sound Proof - Marquee Home - MH-001',
  );
});

test('every report type states the same populated identity segments', () => {
  const details = { dealerName: 'Ribble AV', clientName: 'Noble Projects', projectReference: 'LH-001' };
  assert.equal(
    buildVisualReportTitle("Lord's Hall", null, details),
    'Sound Proof - Artcoustic Cinema Designer - Visual - Ribble AV - Lords Hall - Noble Projects - LH-001',
  );
  assert.equal(
    buildProposalReportTitle(MARQUEE, 'system_summary', { ...MARQUEE_IDENTITY, clientName: '34 AR', projectReference: 'MH-001' }),
    'Sound Proof - Artcoustic Cinema Designer - System Design Summary - Sound Proof - Marquee Home - 34 AR - MH-001',
  );
  assert.equal(
    buildProposalReportTitle(MARQUEE, 'comparison', MARQUEE_IDENTITY),
    'Sound Proof - Artcoustic Cinema Designer - System Design Comparison - Sound Proof - Marquee Home',
  );
});

test('every export consumer passes its client name to the shared helper', () => {
  assert.ok(read('src/pages/RP22ClientReport.jsx').includes('clientName: filenameIdentity.clientName'),
    'the Visual Report passes the client name');
  assert.ok(read('src/components/report/client/useClientReportPdfExport.js').includes('{ dealerName, clientName, projectReference }'),
    'the Visual export builds one filename from all three');
  assert.ok(read('src/components/proposal/export/useProposalExport.js').includes('{ dealerName, clientName, projectReference }'),
    'the proposal export builds one filename from all three');
  assert.ok(read('src/pages/ProposalEditor.jsx').includes('clientName: projectContext.filenameClientName'),
    'the proposal passes the client name');
  assert.ok(read('src/pages/RP22Report.jsx').includes('filenameIdentity'),
    'the Technical Report takes the whole resolved identity as its details');
});

test('the export identity context is stated before the filename is built', () => {
  const identity = read('src/components/report/reportFilenameIdentity.js');
  for (const field of ['report_type', 'dealer', 'project_name', 'client_name', 'project_reference']) {
    assert.ok(identity.includes(field), `states ${field}`);
  }
  assert.ok(read('src/components/report/useReportFilenameIdentity.js').includes('logReportExportIdentity'),
    'the report pages log the identity they export with');
  assert.ok(read('src/pages/ProposalEditor.jsx').includes('logReportExportIdentity'),
    'the proposal logs the identity it exports with');
});

test('platform names are stripped by the single shared filename builder', () => {
  assert.ok(!/base\s*44/i.test(buildVisualReportTitle('Base44 Marquee Home', null, { dealerName: 'Base44 Sound Proof', projectReference: '34 AR' })));
});