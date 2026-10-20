import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveBassAuthorityState as resolve, BASS_AUTHORITY_COPY } from '../src/components/room/bass/bassAuthorityState.js';
import { publicationBassIdentityMatches } from '../src/components/engineering/engineeringPublicationPreflight.js';
import { createBassResultsScope } from '../src/components/room/bass/bassResultsStore.js';
import { registerEngineeringPublishTrigger, readEngineeringPublishTrigger } from '../src/components/engineering/engineeringPublishTrigger.js';

const current = {
  projectId: 'project:a', versionId: 'version:a',
  completedBassAuthority: { authorityStatus: 'AUTHORITATIVE', currentFingerprint: 'cal:a', contract: { job: { resultFingerprint: 'cal:a' } } },
  engineeringFingerprint: 'eng:a', publicationBassFingerprint: 'cal:a',
};
const acknowledged = { status: 'acknowledged', fingerprint: 'eng:a' };
const durable = {
  // Actual readPublishedEngineering response: version contains id, not project_id.
  version: { id: 'version:a', published_fingerprint: 'eng:a' },
  publication: { engineering_fingerprint: 'eng:a', provenance: { bass_fingerprint: 'cal:a' }, report_snapshot: { report_project: { project_id:'project:a', version_id:'version:a' } } },
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
test('a different project or version cannot lend its durable publication', () => {
  assert.equal(resolve({ ...current, projectId:'project:b', durable }).code,'calculated_not_published');
  assert.equal(resolve({ ...current, versionId:'version:b', durable }).code,'calculated_not_published');
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
test('a blocked save is named as a save failure, and stays retryable', () => {
  for (const status of ['not_ready','failed']) {
    const state=resolve({ ...current, publicationAttempt:{ status, fingerprint:'eng:a', message:'P9 is incomplete' } });
    assert.equal(state.code,'save_failed');
    assert.equal(state.label,'Bass result could not be saved');
    // The bass panel speaks only in the bass domain: a P9 blocker is never
    // named as a bass problem, and a refusal that recorded no verified gate is
    // never read as Current. It stays the save failure it is, retryable.
    assert.equal(state.message,'The bass result could not be saved, so reports and proposals cannot use it yet.');
    assert.doesNotMatch(state.message,/\bp\d{1,2}\b/i);
    assert.doesNotMatch(state.message,/engineering_summary|parameter_index/);
    assert.equal(state.actionLabel,'Retry save');
    assert.equal(state.secondaryActionLabel,'Recalculate');
  }
});

test('a completed result saves itself: the band reports Saving and asks for nothing', () => {
  const saving = resolve(current);
  assert.equal(saving.code, 'calculated_not_published');
  assert.equal(saving.label, 'Saving');
  assert.equal(saving.message, 'Calculated — saving so reports and proposals can use it.');
  assert.equal(saving.actionLabel, null, 'no manual save step exists');

  const saved = resolve({ ...current, publicationAttempt: acknowledged });
  assert.equal(saved.code, 'current');
  assert.equal(saved.label, 'Performance Current');
  assert.equal(saved.message, 'Calculated and saved.');
  assert.equal(saved.actionLabel, null);
});

test('no manual save copy survives anywhere in the vocabulary', () => {
  const vocabulary = JSON.stringify(BASS_AUTHORITY_COPY);
  assert.doesNotMatch(vocabulary, /ready to save/i);
  assert.doesNotMatch(vocabulary, /save assessment/i);
  for (const entry of Object.values(BASS_AUTHORITY_COPY)) {
    assert.doesNotMatch(String(entry?.actionLabel || ''), /save/i, 'no state offers a manual save');
  }
});

test('a failed persistence for the saved result is never named Current', () => {
  const state = resolve({
    ...current, publicationAttempt: acknowledged, durable,
    durableWrite: { writeSucceeded: false, writeFailedFingerprint: 'cal:a' },
  });
  assert.equal(state.code, 'save_failed');
  assert.equal(state.label, 'Bass result could not be saved');
  assert.equal(state.actionLabel, 'Retry save');
  assert.equal(state.secondaryActionLabel, 'Recalculate');
  assert.equal(state.attention, true);
});

test('a failure that belongs to another result cannot hold this one back', () => {
  const state = resolve({
    ...current, publicationAttempt: acknowledged, durable,
    durableWrite: { writeSucceeded: false, writeFailedFingerprint: 'cal:older' },
  });
  assert.equal(state.code, 'current');
});

test('a completed result whose write has landed is Current, not Saving', () => {
  const state = resolve({
    ...current, publicationAttempt: acknowledged,
    durableWrite: { writeSucceeded: true, writeFailedFingerprint: null },
  });
  assert.equal(state.code, 'current');
});
test('publication refuses an earlier target while selected-target presentation advances', () => {
  const authority={currentFingerprint:'cal:a',contract:{job:{resultFingerprint:'cal:a'},requestedP14TargetDb:118,requestedP14Basis:'minimum',requestedP14Level:4}};
  const input={completedBassAuthority:authority,bassFingerprint:'cal:a',designState:{splConfig:{selectedP14TargetBasis:'minimum',selectedP14Level:4}}};
  assert.equal(publicationBassIdentityMatches(input),true);
  assert.equal(publicationBassIdentityMatches({...input,designState:{splConfig:{selectedP14TargetBasis:'minimum',selectedP14Level:3}}}),false);
  assert.equal(publicationBassIdentityMatches({...input,bassFingerprint:'cal:b'}),false);
  assert.equal(publicationBassIdentityMatches({...input,completedBassAuthority:null}),false);
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