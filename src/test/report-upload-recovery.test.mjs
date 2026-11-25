import test from 'node:test';
import assert from 'node:assert/strict';
import { awaitExportOperation } from '../components/library/issuedDocument/issuedExportDurability.js';
test('unknown rejected upload remains one attempt and states the recovery limitation', async () => {
  const entry = {}; let calls = 0;
  const upload = async () => { calls++; throw new Error('Network Error'); };
  await assert.rejects(awaitExportOperation(entry, 'uploadOperation', upload, 20), /administrator recovery is required/);
  await assert.rejects(awaitExportOperation(entry, 'uploadOperation', upload, 20), /storage outcome is reconciled/);
  assert.equal(calls, 1);
});
test('a definitive refusal can retry the held PDF after access returns', async () => {
  const entry = {}; let calls = 0;
  const upload = async () => { calls++; if (calls === 1) throw Object.assign(new Error('Forbidden'), { status: 403 }); return { file_uri: 'private/exact-report' }; };
  await assert.rejects(awaitExportOperation(entry, 'uploadOperation', upload, 20), /Forbidden/);
  assert.deepEqual(await awaitExportOperation(entry, 'uploadOperation', upload, 20), { file_uri: 'private/exact-report' });
  assert.equal(calls, 2);
});
test('a timed-out upload is observed to completion without sending it again', async () => {
  const entry = {}; let calls = 0, finish;
  const upload = () => { calls++; return new Promise(resolve => { finish = resolve; }); };
  await assert.rejects(awaitExportOperation(entry, 'uploadOperation', upload, 5), /acknowledgement is still pending/);
  finish({ file_uri: 'private/recovered' });
  assert.deepEqual(await awaitExportOperation(entry, 'uploadOperation', upload, 20), { file_uri: 'private/recovered' });
  assert.equal(calls, 1);
});
