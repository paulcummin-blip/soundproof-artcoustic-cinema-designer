import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveBassAuthorityState as resolve } from '../src/components/room/bass/bassAuthorityState.js';
import { createBassResultsScope } from '../src/components/room/bass/bassResultsStore.js';
import { registerEngineeringPublishTrigger, readEngineeringPublishTrigger } from '../src/components/engineering/engineeringPublishTrigger.js';

const current = {
  completedBassAuthority: { authorityStatus: 'AUTHORITATIVE', currentFingerprint: 'cal:a', contract: { job: { resultFingerprint: 'cal:a' } } },
  engineeringFingerprint: 'eng:a', publicationBassFingerprint: 'cal:a',
};
const acknowledged = { status: 'acknowledged', fingerprint: 'eng:a' };
const durable = {
  version: { published_fingerprint: 'eng:a' },
  publication: { engineering_fingerprint: 'eng:a', provenance: { bass_fingerprint: 'cal:a' } },
  acknowledgement: { durably_published: true },
};
test('completed bass without publication is calculated-not-published', () => assert.equal(resolve(current).code, 'calculated_not_published'));
test('matching acknowledgement names Current', () => assert.equal(resolve({ ...current, publicationAttempt: acknowledged }).code, 'current'));
test('prior engineering acknowledgement cannot name a new assessment Current', () => assert.equal(resolve({ ...current, engineeringFingerprint: 'eng:b', publicationAttempt: acknowledged }).code, 'calculated_not_published'));
test('different bass identity cannot name Current', () => assert.equal(resolve({ ...current, publicationBassFingerprint: 'cal:b', publicationAttempt: acknowledged }).code, 'calculated_not_published'));
test('cold restored durable matching publication names Current', () => assert.equal(resolve({ ...current, durable }).code, 'current'));
test('unacknowledged or wrong-pointer durable evidence cannot name Current', () => {
  assert.equal(resolve({ ...current, durable: { ...durable, acknowledgement: null } }).code, 'calculated_not_published');
  assert.equal(resolve({ ...current, durable: { ...durable, version: { published_fingerprint: 'eng:b' } } }).code, 'calculated_not_published');
});
test('settling remains unpublished; Publishing starts only when this request sends', () => {
  for (const status of ['queued','publishing']) {
    assert.equal(resolve({ ...current, publicationAttempt: { status, fingerprint:'eng:a' } }).code, status === 'queued' ? 'calculated_not_published' : 'publishing');
    assert.equal(resolve({ ...current, publicationAttempt: { status, fingerprint:'eng:b' } }).code, 'calculated_not_published');
  }
});
test('calculation and placement preview precede existing acknowledgement', () => {
  assert.equal(resolve({ ...current, publicationAttempt: acknowledged, calculationInProgress:true }).code, 'calculating');
  assert.equal(resolve({ ...current, publicationAttempt: acknowledged, placementPreviewActive:true }).code, 'preview_only');
});
test('changed design needs calculation and retains prior evidence', () => {
  const stale = { ...current.completedBassAuthority, authorityStatus:'STALE', currentFingerprint:'cal:b' };
  assert.equal(resolve({ ...current, completedBassAuthority:stale, durable }).code, 'needs_calculation');
  assert.equal(stale.contract.job.resultFingerprint, 'cal:a');
});
test('preflight and backend failure reasons are visible and safely retryable', () => {
  for (const status of ['not_ready','failed']) {
    const state=resolve({ ...current, publicationAttempt:{ status, fingerprint:'eng:a', message:'P9 is incomplete' } });
    assert.equal(state.code,'calculated_not_published');
    assert.match(state.message,/P9 is incomplete/);
    assert.equal(state.actionLabel,'Publish Current Assessment');
  }
});
test('scope preserves exact project/version and dispatches only its registered publisher', () => {
  const free=createBassResultsScope('p','free'), saved=createBassResultsScope('p','v');
  let calls=0; const unregister=registerEngineeringPublishTrigger('p','v',()=>calls++);
  free.replace({ contract:{} }); saved.replace({ contract:{} });
  assert.equal(readEngineeringPublishTrigger(free.getSnapshot().scopeId,free.getSnapshot().versionId),null);
  const snapshot=saved.getSnapshot();
  readEngineeringPublishTrigger(snapshot.scopeId,snapshot.versionId)();
  assert.equal(calls,1);
  assert.equal(readEngineeringPublishTrigger('p','other'),null);
  unregister(); assert.equal(readEngineeringPublishTrigger('p','v'),null);
});
