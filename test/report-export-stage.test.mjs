import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveReportExportStage,
  REPORT_EXPORT_STEPS,
} from '../src/components/report/client/reportExportStage.js';

test('REPORT_EXPORT_STEPS lists the four user-facing stages in order', () => {
  assert.deepEqual(REPORT_EXPORT_STEPS, [
    'Preparing report',
    'Creating PDF',
    'Saving to Project Library',
    'Report ready',
  ]);
});

test('readiness stage maps to Preparing report (step 0)', () => {
  const result = resolveReportExportStage({ progress: { stage: 'readiness' }, publicationStatus: 'storing' });
  assert.equal(result.activeStep, 0);
  assert.equal(result.status, 'preparing');
});

test('capture and assemble stages map to Creating PDF (step 1)', () => {
  for (const stage of ['capture', 'assemble']) {
    const result = resolveReportExportStage({ progress: { stage }, publicationStatus: 'storing' });
    assert.equal(result.activeStep, 1, `${stage} should map to step 1`);
    assert.equal(result.status, 'creating');
  }
});

test('upload, reconcile, verify_file and record map to Saving (step 2)', () => {
  for (const stage of ['upload', 'reconcile', 'verify_file', 'record']) {
    const result = resolveReportExportStage({ progress: { stage }, publicationStatus: 'storing' });
    assert.equal(result.activeStep, 2, `${stage} should map to step 2`);
    assert.equal(result.status, 'saving');
  }
});

test('the raw complete stage alone does NOT produce Report ready', () => {
  // The 'complete' progress message can arrive slightly before publication.status
  // flips. Report ready is gated on publication.status === 'complete' only, so a
  // browser print dialog opening early can never show a false completion.
  const result = resolveReportExportStage({ progress: { stage: 'complete' }, publicationStatus: 'storing' });
  assert.notEqual(result.activeStep, 3);
  assert.notEqual(result.status, 'ready');
});

test('publication complete maps to Report ready (step 3) regardless of progress stage', () => {
  const result = resolveReportExportStage({ progress: { stage: 'record' }, publicationStatus: 'complete' });
  assert.equal(result.activeStep, 3);
  assert.equal(result.status, 'ready');
});

test('publication incomplete maps to a failed Saving step, never ready', () => {
  const result = resolveReportExportStage({ progress: { stage: 'upload' }, publicationStatus: 'incomplete' });
  assert.equal(result.activeStep, 2);
  assert.equal(result.status, 'failed');
});

test('null progress defaults to Preparing report while storing', () => {
  const result = resolveReportExportStage({ progress: null, publicationStatus: 'storing' });
  assert.equal(result.activeStep, 0);
  assert.equal(result.status, 'preparing');
});

test('idle publication with no progress is preparing, never ready', () => {
  const result = resolveReportExportStage({ progress: null, publicationStatus: 'idle' });
  assert.notEqual(result.status, 'ready');
  assert.notEqual(result.activeStep, 3);
});

test('no artificial percentage or timer is present in the resolved state', () => {
  const result = resolveReportExportStage({ progress: { stage: 'capture' }, publicationStatus: 'storing' });
  assert.equal(result.percent, undefined);
  assert.equal(result.timer, undefined);
  assert.equal(result.eta, undefined);
});