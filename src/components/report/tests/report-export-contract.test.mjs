import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { REPORT_PRINT_HEADER, reportHeaderMetadata } from '../reportPrintHeader.js';
import { resolveReportFilenameDetails } from '../reportFilenameIdentity.js';
import { buildTechnicalReportTitle, buildVisualReportTitle, buildProposalReportTitle } from '../reportPdfTitle.js';

const read = (path) => fs.readFileSync(path, 'utf8');
const project = { id: 'project-1', account_id: 'account-1', name: 'Marquee Home', project_reference: '34 AR', client_name: 'Not a reference' };
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
test('platform names are stripped by the single shared filename builder', () => {
  assert.ok(!/base\s*44/i.test(buildVisualReportTitle('Base44 Marquee Home', null, { dealerName: 'Base44 Sound Proof', projectReference: '34 AR' })));
});