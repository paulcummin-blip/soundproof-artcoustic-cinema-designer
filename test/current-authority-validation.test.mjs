import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {attachCurrentCanonicalValidation} from '../src/components/room/bass/improveBassV2/currentAuthorityValidation.js';
const fixture=JSON.parse(fs.readFileSync(new URL('./_current-authority-fixture.json',import.meta.url)));
const adapt=x=>attachCurrentCanonicalValidation(x.comparison,x);
test('Published Current seat metrics are preserved exactly without reassessment',()=>{
 const before=structuredClone(fixture);const r=adapt(fixture);assert.ok(r);
 assert.deepEqual(r.perSeatP19,fixture.comparison.perSeatP19);
 assert.deepEqual(r.perSeatP20,fixture.comparison.perSeatP20);
 assert.equal(r.operatingOutputDb,115);assert.equal(r.physicalValidation.passed,true);
 assert.equal(r.perSeatP19.find(s=>s.seatId==='seat-r1-c2').variationDbRaw,1.5705481366141996);
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
