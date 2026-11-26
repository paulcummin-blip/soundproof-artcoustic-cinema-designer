import test from 'node:test';
import assert from 'node:assert/strict';
import { cloneSavedDesignVersion } from '../src/components/versions/cloneSavedDesignVersion.js';
import { saveBeforeVersionCreation } from '../src/components/versions/versionSwitchSafety.js';
const clone = x => JSON.parse(JSON.stringify(x));
function fixture() {
  const source={id:'source',project_id:'internal',account_id:'account',design_state:{
    room_orientation:'width_front',
    seating_positions:[{id:'seat',x:1.7,y:3.1,z:1.2}],
    selected_speakers:[{id:'FL',model:'evolve-4-2',x:.5,y:.2,z:1.3}],
    subwooferInstances:[{id:'sub',model:'SUB2-12',x:1,y:.3,gainDb:-2,delayMs:3.4,polarity:-1,phaseControlDeg:45}],
    applied_calibration:{basisFingerprint:'same-geometry',values:[{gainDb:-2,delayMs:3.4}]},
    optimiser_plan:{versionId:'source',recordKind:'run_evidence'},
  }};
  const calls=[];let created;
  const client={entities:{
    Project:{filter:async()=>[{id:'internal',account_id:'account',active_version_id:'other',room_width:4.25}],update:async(id,data)=>calls.push(['activate',id,data])},
    ProjectVersion:{filter:async q=>q.version_number?[]:q.id==='new'?[clone(created)]:[clone(source)],create:async data=>{calls.push(['create']);created={id:'new',...clone(data)};return clone(created);}},
  }};
  return {source,calls,client,run:options=>cloneSavedDesignVersion({client,projectId:'internal',sourceVersionId:'source',slot:2,name:'Internal option',...options})};
}
test('fresh exact source retains seating, speakers and actual calibration without publishing old evidence',async()=>{
  const f=fixture();const r=await f.run();
  for(const key of ['room_orientation','seating_positions','selected_speakers','subwooferInstances','applied_calibration'])assert.deepEqual(r.design_state[key],f.source.design_state[key]);
  assert.equal(r.design_state.optimiser_plan,null);assert.equal(f.source.design_state.optimiser_plan.versionId,'source');
  assert.equal(r.published_fingerprint,undefined);assert.equal(f.calls.filter(c=>c[0]==='activate').length,1);
});
test('fresh read supersedes a previously loaded source snapshot',async()=>{
  const f=fixture();const stale=clone(f.source);f.source.design_state.seating_positions[0].x=2.1;
  const r=await f.run();assert.equal(r.design_state.seating_positions[0].x,2.1);assert.equal(stale.design_state.seating_positions[0].x,1.7);
});
for(const field of ['id','project_id','account_id'])test('rejects wrong source '+field,async()=>{
  const f=fixture();f.source[field]='wrong';await assert.rejects(f.run(),/does not match/);assert.equal(f.calls.length,0);
});
test('failed source read creates nothing',async()=>{
  const f=fixture();f.client.entities.ProjectVersion.filter=async()=>{throw Error('offline')};await assert.rejects(f.run(),/offline/);assert.equal(f.calls.length,0);
});
test('occupied target is never overwritten',async()=>{
  const f=fixture();const read=f.client.entities.ProjectVersion.filter;f.client.entities.ProjectVersion.filter=q=>q.version_number?Promise.resolve([{id:'occupied'}]):read(q);await assert.rejects(f.run(),/occupied/);assert.equal(f.calls.length,0);
});
test('failed new-record readback never activates the unverified option',async()=>{
  const f=fixture();const read=f.client.entities.ProjectVersion.filter;f.client.entities.ProjectVersion.filter=q=>q.id==='new'?Promise.resolve([]):read(q);await assert.rejects(f.run(),/could not be verified/);assert.deepEqual(f.calls,[['create']]);
});
test('scope changed during reads creates nothing',async()=>{
  const f=fixture();let n=0;await assert.rejects(f.run({assertScope:()=>{if(++n>1)throw Error('scope changed')}}),/scope changed/);assert.equal(f.calls.length,0);
});
test('pending autosave is awaited before latest save callback',async()=>{
  const bucket={inFlight:true,dirty:true};const events=[];
  await saveBeforeVersionCreation({assertScope:()=>{},readBucket:()=>bucket,wait:async()=>{events.push('wait');bucket.inFlight=false},save:async()=>{events.push('save');bucket.dirty=false;return {success:true}}});
  assert.deepEqual(events,['wait','save']);
});
for(const result of [undefined,{success:false,error:'controlled save failure'}])test('unconfirmed save blocks creation '+JSON.stringify(result),async()=>{
  await assert.rejects(saveBeforeVersionCreation({assertScope:()=>{},readBucket:()=>({}),save:async()=>result}),/save|saved/);
});
test('new edits while saving remain open',async()=>{
  await assert.rejects(saveBeforeVersionCreation({assertScope:()=>{},readBucket:()=>({dirty:true}),save:async()=>({success:true})}),/latest changes remain open/);
});
test('stalled save stops with recoverable error',async()=>{
  let time=0;let saves=0;await assert.rejects(saveBeforeVersionCreation({assertScope:()=>{},readBucket:()=>({inFlight:true}),timeoutMs:100,now:()=>time,wait:async()=>{time+=50},save:async()=>{saves++}}),/still running/);assert.equal(saves,0);
});
