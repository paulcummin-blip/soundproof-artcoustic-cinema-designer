import { test } from 'vitest';
import assert from 'node:assert/strict';
import { resolveWorkflowStatus } from '../src/components/documentWorkflow/documentWorkflowStatus.js';
const file = (type, overrides = {}) => ({
 document_type: type, version_id: 'v1', selected_version_ids: ['v1'],
 file_uri: 'private/stored.pdf', source_fingerprints: { engineeringFingerprint: 'fp1' }, ...overrides
});
const status = (exports) => resolveWorkflowStatus({exports, versionId:'v1', engineeringFingerprint:'fp1'});
test('Two source PDFs unlock creation but do not claim a proposal exists', () => {
 const s=status([file('project'),file('speaker_design')]);
 assert.equal(s.proposalAvailable,true);
 assert.equal(s.clientProposal.state,'not_created');
});
test('Stored System Design Summary is the current client proposal', () => {
 assert.equal(status([file('system_design_summary')]).clientProposal.state,'ready');
});
test('A stale proposal remains historical and cannot become Ready', () => {
 assert.equal(status([file('system_design_summary',{source_fingerprints:{engineeringFingerprint:'old'}})]).clientProposal.state,'outdated');
});
test('A different version, comparison, absent fingerprint or absent file cannot satisfy proposal readiness', () => {
 for (const record of [
  file('proposal',{version_id:'v2',selected_version_ids:['v2']}),
  file('proposal',{selected_version_ids:['v1','v2']}),
  file('proposal',{file_uri:null}),
  file('proposal',{source_fingerprints:{}})
 ]) assert.notEqual(status([record]).clientProposal.state,'ready');
});
test('A text-only fallback or incomplete proposal is not Ready', () => {
 for (const overrides of [{rendering:'text_vector'}, {preview_status:'partial'}]) {
  assert.notEqual(status([file('system_design_summary',overrides)]).clientProposal.state,'ready');
 }
});
test('Historical stale files do not hide a matching current PDF', () => {
 assert.equal(status([file('proposal',{source_fingerprints:{engineeringFingerprint:'old'}}),file('proposal')]).clientProposal.state,'ready');
});
