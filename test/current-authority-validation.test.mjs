import test from 'node:test';
import assert from 'node:assert/strict';
import {attachCurrentCanonicalValidation} from '../src/components/room/bass/improveBassV2/currentAuthorityValidation.js';
import {BASS_OPTIMISER_VERSIONS} from '../src/components/room/bass/bassOptimiserWorkerProtocol.js';
// Entirely synthetic identities and values. Actual browser evidence stays local.
const rows=[{seatId:'synthetic-seat',variationDbRaw:2,level:'L4'}];
const fixture={
 comparison:{perSeatP19:structuredClone(rows),perSeatP20:structuredClone(rows)},
 authority:{authoritative:true,currentFingerprint:'synthetic-live',contract:{selectedCandidate:{perSeatP19Results:structuredClone(rows),perSeatP20Results:structuredClone(rows)},selectedCandidateId:'synthetic-candidate',provenance:{postEqCurveSignature:'synthetic-curve'},requestedP14TargetDb:112,assessmentEnvelope:{assessmentStartHz:30,assessmentEndHz:120}}},
 canonical:{...BASS_OPTIMISER_VERSIONS,cacheKey:'synthetic-live',completedContractFingerprint:'synthetic-live',selectedCandidateId:'synthetic-candidate',postEqCurveSignature:'synthetic-curve',physicalValidation:{passed:true},perSeatP19Results:structuredClone(rows),perSeatP20Results:structuredClone(rows),requestedP14Pass:true,finalOptimisedBassResponse:{selectedOperatingOutputDb:112}},
 sources:[{id:'synthetic-a',tuning:{delayMs:0,gainDb:0,polarity:1}},{id:'synthetic-b',tuning:{delayMs:5,gainDb:0,polarity:1}}],sourceIds:['synthetic-a','synthetic-b'],liveCacheKey:'synthetic-live'
};
const adapt=x=>attachCurrentCanonicalValidation(x.comparison,x);
test('Published Current seat metrics are preserved exactly without reassessment',()=>{
 const before=structuredClone(fixture);const r=adapt(fixture);assert.ok(r);
 assert.deepEqual(r.perSeatP19,fixture.comparison.perSeatP19);
 assert.deepEqual(r.perSeatP20,fixture.comparison.perSeatP20);
 assert.equal(r.operatingOutputDb,112);assert.equal(r.physicalValidation.passed,true);
 assert.equal(r.perSeatP19[0].variationDbRaw,2);
 assert.deepEqual(fixture,before);
});
for(const [name,edit] of [
 ['stale',x=>x.authority.currentFingerprint='old'],
 ['unpublished',x=>x.authority.authoritative=false],
 ['full identity',x=>x.canonical.cacheKey='other'],
 ['completed identity',x=>x.canonical.completedContractFingerprint='other'],
 ['candidate',x=>x.canonical.selectedCandidateId='other'],
 ['curve receipt',x=>x.canonical.postEqCurveSignature='other'],
 ['version',x=>x.canonical.engineVersion='old'],
 ['physical',x=>x.canonical.physicalValidation.passed=false],
 ['seat value',x=>x.canonical.perSeatP19Results[0].variationDbRaw+=.1],
 ['missing seat',x=>x.canonical.perSeatP20Results.pop()],
 ['source ID',x=>x.sources[0].id='wrong'],
 ['duplicate source',x=>x.sources[0].id=x.sources[1].id],
])test('Current metadata rejects '+name,()=>{const x=structuredClone(fixture);edit(x);assert.equal(adapt(x),null);});
test('Current effective tuning is bound by source ID across reordering',()=>{
 const x=structuredClone(fixture);x.sources.reverse();assert.deepEqual(adapt(x).appliedTuning,adapt(fixture).appliedTuning);
});
