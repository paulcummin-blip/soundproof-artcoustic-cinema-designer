import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { WORKFLOW_STATE } from '../src/components/documentWorkflow/documentWorkflowStatus.js';

const source = readFileSync(new URL('../src/components/documentWorkflow/DocumentWorkflowPanel.jsx', import.meta.url), 'utf8');
// Execute the production handlers, including their URL construction. No copy
// of the generation decision: the old OUTDATED-only condition fails this test.
function fixture(state, proceed = true) {
  const urls = [], opened = [];
  const start = source.indexOf('  const navigateToReportRenderer =');
  const end = source.indexOf('  const handleSpeakerDesignAct =', start);
  assert.ok(start >= 0 && end > start);
  const openStart = source.indexOf('  const openStoredPdf =');
  const openEnd = source.indexOf('\n  // Pre-generation', openStart);
  const context = vm.createContext({
    URLSearchParams, disabled: false, projectId: 'dixon', versionId: 'original',
    REPORT_ROUTE: { VISUAL: '/RP22ClientReport' },
    REPORT_UPDATE_PARAM: 'updateReport', REPORT_AUTOPRINT_PARAM: 'autoPrint',
    REPORT_AUTOSTORE_PARAM: 'autoStore', REPORT_REGENERATE_INTENT_PARAM: 'regenerateIntent',
    WORKFLOW_STATE, trState: state, console,
    contextReview: { review: async () => proceed, getSkippedQuestionIds: () => ['already-skipped'] },
    window: { location: { assign: url => urls.push(url) } },
    openIssuedDocument: async record => opened.push(record),
    alert: message => { throw new Error(message); },
  });
  vm.runInContext(source.slice(openStart, openEnd) + source.slice(start, end)
    + '\nthis.act = handleTechnicalReportAct; this.open = openStoredPdf;', context);
  return { context, urls, opened };
}
for (const [label, state] of [
  ['deleted PDF with surviving historical snapshot', WORKFLOW_STATE.NOT_CREATED],
  ['Create New with an existing PDF', WORKFLOW_STATE.READY],
  ['retry after failed creation', WORKFLOW_STATE.FAILED],
  ['outdated issued report', WORKFLOW_STATE.OUTDATED],
]) {
  test(label + ' requests current published evidence for this version', async () => {
    const f = fixture(state);
    await f.context.act();
    assert.equal(f.urls.length, 1);
    const url = new URL(f.urls[0], 'https://sound-proof.test');
    assert.equal(url.pathname, '/RP22ClientReport');
    assert.equal(url.searchParams.get('projectId'), 'dixon');
    assert.equal(url.searchParams.get('versionId'), 'original');
    assert.equal(url.searchParams.get('updateReport'), '1');
    assert.equal(url.searchParams.get('autoStore'), '1');
    assert.equal(url.searchParams.get('regenerateIntent'), '1');
    assert.equal(url.searchParams.get('skipCtx'), 'already-skipped');
    assert.equal(url.searchParams.has('autoPrint'), false);
  });
}
test('cancelled Design Context review never creates a report', async () => {
  const f = fixture(WORKFLOW_STATE.NOT_CREATED, false);
  await f.context.act();
  assert.deepEqual(f.urls, []);
});
test('opening a stored PDF never enters the report generation route', async () => {
  const f = fixture(WORKFLOW_STATE.READY);
  const issued = { id: 'issued-pdf', file_uri: 'private/existing.pdf' };
  await f.context.open(issued);
  assert.deepEqual(f.opened, [issued]);
  assert.deepEqual(f.urls, []);
});
