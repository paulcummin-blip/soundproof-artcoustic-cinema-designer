import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveProposalPublicationSource } from '../src/components/proposal/library/proposalPublicationSource.js';
const old = 'eng:old', current = 'eng:current';
const facts = { room_width: 5, report_screen: { size: 120, displayType: 'projector_screen', displayLabel: '120 inch screen' } };
const publication = (fingerprint, project = facts) => ({ engineering_fingerprint: fingerprint, report_snapshot: { report_project: project } });
const proposal = { id: 'proposal', project_id: 'project', version_id: 'v', engineering_snapshot: { identity: { engineeringFingerprint: old } } };
const versionsById = new Map([['v', { published_fingerprint: current }]]);
const reports = new Map([['v', { project: { source_fingerprints: { engineeringFingerprint: old } } }]]);
const run = async (publications, overrides = {}) => resolveProposalPublicationSource({
  proposal, versionsById, savedReportsByVersionId: reports,
  readPublication: async (_p, _v, { engineeringFingerprint }) => ({ publication: publications[engineeringFingerprint] || null }),
  ...overrides,
});
test('same design and display facts survive an identity-only fingerprint move', async () => {
 const result = await run({ [old]: publication(old, {...facts, client_name:'Old spelling'}), [current]: publication(current, {...facts, client_name:'Correct spelling'}) });
 assert.equal(result.state, 'current'); assert.equal(result.frozenProposalMatchesCurrent, true);
 assert.equal(proposal.engineering_snapshot.identity.engineeringFingerprint, old);
});
test('a physical design change remains stale', async () => {
 const result = await run({ [old]:publication(old), [current]:publication(current,{...facts,room_width:6}) });
 assert.equal(result.state,'source_changed'); assert.equal(result.frozenProposalMatchesCurrent,false);
});
test('a different display description remains stale', async () => {
 const result = await run({ [old]:publication(old), [current]:publication(current,{...facts,report_screen:{...facts.report_screen,displayLabel:'150 inch screen'}}) });
 assert.equal(result.state,'source_changed');
});
test('missing historical facts and read failures never establish equivalence', async () => {
 assert.equal((await run({[current]:publication(current)})).state,'source_changed');
 assert.equal((await run({}, { readPublication:async()=>{throw Error('read failed');} })).state,'source_changed');
});
test('a mismatched returned publication cannot establish equivalence', async () => {
 assert.equal((await run({[old]:publication('wrong'),[current]:publication(current)})).state,'source_changed');
});
test('a missing report stays missing', async () => {
 assert.equal((await run({}, {savedReportsByVersionId:new Map()})).state,'missing_source');
});
test('comparison proposals preserve their strict per-version rule', async () => {
 const p = {...proposal, selected_version_ids:['v','v2']};
 const result = await run({}, {proposal:p});
 assert.equal(result.state,'missing_source');
});
