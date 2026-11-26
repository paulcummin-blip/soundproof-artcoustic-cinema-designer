import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureReportRegistration } from '../src/components/report/client/reportOperationRegistration.js';
const fixture = invoke => ({ attempt: { operationId: 'one-operation' }, invoke,
  projectId: 'internal-project', versionId: 'original', timeoutMs: 5 });

test('registration acknowledgement is required before continuation', async () => {
  let resolve; let continued = false;
  const f = fixture(() => new Promise(r => { resolve = r; }));
  const promise = ensureReportRegistration(f).then(() => { continued = true; });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(continued, false);
  resolve({ data: { recorded: true, operation_id: 'one-operation' } });
  await promise; assert.equal(continued, true);
});
test('offline preflight performs no registration or capture and can retry online', async () => {
  let calls = 0;
  const f = fixture(async () => { calls++; return { data: { recorded: true, operation_id: 'one-operation' } }; });
  await assert.rejects(ensureReportRegistration({ ...f, online: false }), /offline/);
  assert.equal(calls, 0); await ensureReportRegistration(f); assert.equal(calls, 1);
});
test('lost start response reconciles the existing operation without a second start', async () => {
  const calls = [];
  const f = fixture(async body => {
    calls.push(body.action);
    if (body.action === 'start') throw Error('response lost');
    return { data: { state: 'unprepared' } };
  });
  await ensureReportRegistration(f); await ensureReportRegistration(f);
  assert.deepEqual(calls, ['start', 'report_upload_status']);
});
test('unconfirmed registration stays recoverable without silently capturing or duplicating start', async () => {
  let starts = 0; let available = false;
  const f = fixture(async body => {
    if (body.action === 'start') { starts++; return { data: { recorded: false } }; }
    if (!available) throw Error('not registered yet');
    return { data: { state: 'unprepared' } };
  });
  for (let i = 0; i < 2; i++) await assert.rejects(ensureReportRegistration(f), /No PDF capture/);
  available = true; await ensureReportRegistration(f); assert.equal(starts, 1);
});
test('pending start acknowledgement can be reconciled without restarting the request', async () => {
  let starts = 0;
  const f = fixture(body => {
    if (body.action === 'start') { starts++; return new Promise(() => {}); }
    return Promise.resolve({ data: { state: 'unprepared' } });
  });
  await ensureReportRegistration(f); assert.equal(starts, 1);
});
test('missing version cannot start or capture a report', async () => {
  let calls = 0;
  const f = fixture(async () => { calls++; });
  await assert.rejects(ensureReportRegistration({ ...f, versionId: null }), /saved project and design version/);
  assert.equal(calls, 0);
});
