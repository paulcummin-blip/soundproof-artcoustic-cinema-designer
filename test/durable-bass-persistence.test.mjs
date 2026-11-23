import test from 'node:test';
import assert from 'node:assert/strict';
import { persistBassAuthorityDurably } from '../src/components/room/bass/durableBassWrite.js';
import { buildCanonicalBassResult } from '../src/components/room/bass/canonicalBassResult.js';
import { isAuthoritativeBassContract } from '../src/components/room/bass/completedBassResultPersistence.js';
import { BASS_ANALYSIS_CONTRACT_VERSION, COMPLETED_BASS_CACHE_VERSION, INSTANCE_AUTHORITY_VERSION, RP22_BASS_METRIC_SCHEMA_VERSION } from '../src/lib/bassAuthorityVersion.js';
import { resolveBassEvidenceForPublication } from '../src/lib/bassEvidencePublication.js';
import frozenReportBass from '../src/components/report/frozenReportBass.js';

const copy=x=>JSON.parse(JSON.stringify(x));
function contract(fp='test-acoustic-inputs') {
  const c={version:BASS_ANALYSIS_CONTRACT_VERSION,instanceAuthorityVersion:INSTANCE_AUTHORITY_VERSION,
    metricSchemaVersion:RP22_BASS_METRIC_SCHEMA_VERSION,selectedCandidateId:'candidate',
    job:{status:'complete',resultFingerprint:fp,currentJobFingerprint:fp,metricSchemaVersion:RP22_BASS_METRIC_SCHEMA_VERSION},
    selectedCandidate:{id:'candidate',achievedP18FrequencyHz:20,perSeatP20Results:[{seatId:'seat',variationDbRaw:1,level:4}]},
    productAnalysis:{parameters:{p18:{value:20},p19:{status:'complete',value:1,level:4},p20:{status:'complete',value:1,level:4}}},
    provenance:{realSeatCount:1,primarySeatIds:['seat']},
    graphPayload:{postEqRspCurve:[{frequency:20,spl:100}],referenceEq:[{frequency:20,spl:100}],correctionCurve:[]},
    assessmentEnvelope:{achievedP18FrequencyHz:20,assessmentStartHz:20,assessmentEndHz:120,p19TargetIdentity:'house-curve-target'},
    metricPublication:{canonicalMetricPublicationValid:true}};
  c.bassResult=buildCanonicalBassResult(c);
  assert.equal(isAuthoritativeBassContract(c),true);
  return c;
}
function payload(c=contract()) {return {project_id:'audit',version_id:'v1',status:'complete',
  completed_cache_version:COMPLETED_BASS_CACHE_VERSION,instance_authority_version:INSTANCE_AUTHORITY_VERSION,
  metric_schema_version:RP22_BASS_METRIC_SCHEMA_VERSION,current_fingerprint:c.job.resultFingerprint,
  completed_by_fingerprint:{[c.job.resultFingerprint]:c}};}
function db() {
 const state={rows:[],writes:0,reads:0};
 const entity={
  filter:async()=>{state.reads++;return copy(state.rows);},
  create:async data=>{state.writes++;const row={...copy(data),id:'row'};state.rows.push(row);return copy(row);},
  update:async(id,data)=>{state.writes++;const row=state.rows.find(r=>r.id===id);Object.assign(row,copy(data));return copy(row);}
 };return {state,entity};
}
test('completed save requires a fresh matching durable readback',async()=>{
 const {state,entity}=db();const r=await persistBassAuthorityDurably(entity,payload(),{accountId:'owner'});
 assert.equal(r.disposition,'verified-readback');assert.equal(state.reads,2);assert.equal(r.row.account_id,'owner');
});
test('same save and retry reuse the durable row without duplicate writes',async()=>{
 const {state,entity}=db();await persistBassAuthorityDurably(entity,payload());await persistBassAuthorityDurably(entity,payload());
 assert.equal(state.rows.length,1);assert.equal(state.writes,1);assert.equal(state.reads,3);
});
test('lost acknowledgement after commit is reconciled as durable success',async()=>{
 const {state,entity}=db();const create=entity.create;entity.create=async p=>{await create(p);throw Error('response lost');};
 const r=await persistBassAuthorityDurably(entity,payload());assert.equal(r.disposition,'reconciled-after-uncertain-write');
 await persistBassAuthorityDurably(entity,payload());assert.equal(state.writes,1);
});
test('successful HTTP response without stored data is rejected',async()=>{
 const {entity}=db();entity.create=async()=>({id:'not-written'});
 await assert.rejects(persistBassAuthorityDurably(entity,payload()),/readback/);
});
test('explicit unsuccessful response does not count as a save',async()=>{
 const {entity}=db();entity.create=async()=>({success:false,message:'refused'});
 await assert.rejects(persistBassAuthorityDurably(entity,payload()),/refused/);
});
test('read failure after committed save remains unverified; retry reconciles without another create',async()=>{
 const {state,entity}=db();const read=entity.filter;entity.filter=async(...args)=>{if(state.reads===1){state.reads++;throw Error('offline');}return read(...args);};
 await assert.rejects(persistBassAuthorityDurably(entity,payload()),/unverified/);
 entity.filter=read;await persistBassAuthorityDurably(entity,payload());assert.equal(state.rows.length,1);assert.equal(state.writes,1);
});
test('delayed readback cannot resolve save early',async()=>{
 const {state,entity}=db();const read=entity.filter;let release;
 entity.filter=async(...args)=>{if(state.reads===1) await new Promise(resolve=>{release=resolve;});return read(...args);};
 let settled=false;const saving=persistBassAuthorityDurably(entity,payload()).then(()=>{settled=true;});
 for(let n=0;n<10&&!release;n++)await Promise.resolve();
 assert.equal(settled,false);release();await saving;assert.equal(settled,true);
});
test('same fingerprint keys cannot conceal different saved contract content',async()=>{
 const {state,entity}=db();await persistBassAuthorityDurably(entity,payload());
 const changed=payload();changed.completed_by_fingerprint[changed.current_fingerprint].recommendation={text:'new saved recommendation'};
 await persistBassAuthorityDurably(entity,changed);assert.equal(state.writes,2);
});
test('conflicting duplicate current authorities fail closed',async()=>{
 const {state,entity}=db();const p=payload();state.rows=[{...copy(p),id:'one'},{...copy(p),id:'two'}];
 state.rows[1].completed_by_fingerprint[p.current_fingerprint].selectedCandidateId='different';
 await assert.rejects(persistBassAuthorityDurably(entity,p),/Conflicting/);assert.equal(state.writes,0);
});
test('invalid fingerprint cannot be saved as complete',async()=>{
 const {state,entity}=db();const p=payload();p.current_fingerprint='changed-input';
 await assert.rejects(persistBassAuthorityDurably(entity,p),/does not match/);assert.equal(state.writes,0);
});
test('frozen publication remains fully verifiable after bounded cache eviction',()=>{
 const p=payload();const pub={provenance:{bass_fingerprint:p.current_fingerprint},bass_evidence:resolveBassEvidenceForPublication(p,p.current_fingerprint)};
 const r=frozenReportBass([],copy(pub));assert.equal(r.authoritative,true);assert.equal(isAuthoritativeBassContract(r.contract),true);
});
test('frozen historic report accepts completed result when live row moved on, never a changed fingerprint',()=>{
 const p=payload();p.status='stale';p.current_fingerprint='new-acoustic-inputs';
 const pub={provenance:{bass_fingerprint:'test-acoustic-inputs'}};
 assert.equal(frozenReportBass([p],pub).authoritative,true);
 assert.equal(frozenReportBass([p],{provenance:{bass_fingerprint:'new-acoustic-inputs'}}).authoritative,false);
});
test('corrupt retained curve cannot pass a complete contract check',()=>{
 const p=payload();const pub={provenance:{bass_fingerprint:p.current_fingerprint},bass_evidence:resolveBassEvidenceForPublication(p,p.current_fingerprint)};
 pub.bass_evidence=copy(pub.bass_evidence);pub.bass_evidence.graphPayload.postEqRspCurve[0].spl=null;
 assert.equal(frozenReportBass([p],pub).authoritative,false);
});

test('same-fingerprint target promotion cannot erase saved room curves',async()=>{
 const {state,entity}=db();const rich=payload();
 rich.completed_by_fingerprint[rich.current_fingerprint].graphPayload.roomResponseCurve=[{frequency:20,spl:95}];
 rich.completed_by_fingerprint[rich.current_fingerprint].graphPayload.perSeatRoomResponseCurves=[{seatId:'seat',responseData:[{frequency:20,spl:95}]}];
 await persistBassAuthorityDurably(entity,rich);
 await persistBassAuthorityDurably(entity,payload());
 assert.equal(state.rows[0].completed_by_fingerprint[rich.current_fingerprint].graphPayload.roomResponseCurve.length,1);
 assert.equal(state.rows[0].completed_by_fingerprint[rich.current_fingerprint].graphPayload.perSeatRoomResponseCurves.length,1);
});
test('cold hydration restores missing supplemental curves only from the exact retained calculation',async()=>{
 const {buildHydratedPersistedWrapper}=await import('../src/components/room/bass/completedBassResultPersistence.js');
 const row=payload();const rich=copy(row.completed_by_fingerprint[row.current_fingerprint]);
 rich.graphPayload.roomResponseCurve=[{frequency:20,spl:95}];
 const pub={provenance:{bass_fingerprint:row.current_fingerprint},bass_evidence:{fingerprint:row.current_fingerprint,graphPayload:rich.graphPayload}};
 row.engineering_publications={eng:pub};
 assert.equal(buildHydratedPersistedWrapper(row).completedByFingerprint[row.current_fingerprint].graphPayload.roomResponseCurve.length,1);
 pub.bass_evidence.fingerprint='different-acoustic-input';
 assert.equal(buildHydratedPersistedWrapper(row).completedByFingerprint[row.current_fingerprint].graphPayload.roomResponseCurve,undefined);
});
test('different post-EQ result prevents supplemental-curve borrowing despite matching key',async()=>{
 const {retainCompletedBassGraphEvidence}=await import('../src/components/room/bass/completedBassResultPersistence.js');
 const c=contract();const prior=copy(c);prior.graphPayload.postEqRspCurve[0].spl=80;prior.graphPayload.roomResponseCurve=[{frequency:20,spl:95}];
 assert.equal(retainCompletedBassGraphEvidence(c,prior),c);
});
test('both cache writers share one serialized critical section',async()=>{
 const {withBassCacheWriteLock}=await import('../src/components/room/bass/bassCacheWriteLock.js');
 const events=[];let release;
 const first=withBassCacheWriteLock('p::v',async()=>{events.push('first-start');await new Promise(r=>{release=r;});events.push('first-end');});
 const second=withBassCacheWriteLock('p::v',async()=>events.push('second-start'));
 for(let i=0;i<10&&!release;i++)await Promise.resolve();
 assert.deepEqual(events,['first-start']);release();await Promise.all([first,second]);
 assert.deepEqual(events,['first-start','first-end','second-start']);
});

import { restorePublicationBassGraphEvidence } from '../src/lib/bassEvidencePublication.js';
test('report read restores omitted curves from exact saved calculation without mutating frozen publication',()=>{
 const full=contract();full.graphPayload.roomResponseCurve=[{frequency:20,spl:99}];
 const evidence=resolveBassEvidenceForPublication(payload(full),full.job.resultFingerprint);
 const pub={provenance:{bass_fingerprint:full.job.resultFingerprint},bass_evidence:copy(evidence)};
 pub.bass_evidence.graphPayload.roomResponseCurve=[];
 const record={engineering_publications:{older:{...pub,bass_evidence:evidence}}};
 const restored=restorePublicationBassGraphEvidence(pub,record);
 assert.equal(restored.bass_evidence.graphPayload.roomResponseCurve.length,1);
 assert.equal(pub.bass_evidence.graphPayload.roomResponseCurve.length,0);
 record.engineering_publications.older.bass_evidence.graphPayload.postEqRspCurve[0].spl+=0.001;
 assert.equal(restorePublicationBassGraphEvidence(pub,record),pub);
});
