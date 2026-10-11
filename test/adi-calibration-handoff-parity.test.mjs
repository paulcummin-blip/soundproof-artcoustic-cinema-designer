import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyCalibrationTuning } from '../src/components/room/bass/improveBassV2/improveBassV2ApplyCalibration.js';
import { bassInputAdapter } from '../src/components/utils/subwooferInstanceMigration.js';
import { buildAuthoritativeAutoAlignDelays, buildAuthoritativeBassSources, buildAuthoritativeResponseCurves } from '../src/components/room/bass/useAuthoritativeBassResponse.js';
import { simulateAuthoritativeBassResponse } from '../src/components/room/bass/authoritativeBassResponseEngine.js';
import { evaluateStage2Confirmation, evaluateStage2ConfirmationWithTuning, computeUsableLfHz, computeTransitionHz } from '../src/components/room/bass/stage2/stage2CanonicalEvaluation.js';
import { BASS_NORMALIZED_PHYSICS_DEFAULTS } from '../src/components/room/bass/bassPhysicsDefaults.js';
import { auditDurablePublication } from '../src/components/engineering/publicationGateAuthority.js';
import { buildFrozenReportProject, buildAtomicParameterIndex } from '../shared/engineeringPublicationContract.js';
const read = p => fs.readFileSync(new URL('../'+p, import.meta.url),'utf8');
const copy = x => JSON.parse(JSON.stringify(x));
const source = read('src/components/room/bass/optimiseWorkflow/OptimiseAndCalculate.jsx');
const helper = source.slice(source.indexOf('function applyRecommendationToInstances('),source.indexOf('export default function'));
const applyAuto = new Function('applyCalibrationTuning',helper+';return applyRecommendationToInstances;')(applyCalibrationTuning);
const roomDims={widthM:4.64,lengthM:5.09,heightM:2.6};
const rspPosition={id:'rsp',x:2.32,y:3.48,z:1.2,__isSyntheticRsp:true};
const instances=['front','rear'].flatMap((group,r)=>[.31,4.33].map((x,i)=>({id:'sub-'+group+'-'+(i+1),model:'sub3-12',legacyGroup:group,enabled:true,position:{x,y:r?4.9525:.1375},bottomHeightM:.05,rotationDeg:r?180:0,delayMs:0,gainDb:0,polarity:1,phaseControlDeg:0})));
const tuning=instances.map(s=>({sourceId:s.id,delayMs:s.legacyGroup==='front'?3:3.9626910966908078,gainDb:0,polarity:0,phaseControlDeg:0}));
const values=tuning.map(t=>({...t,id:t.sourceId,polarity:1}));
const seats=[2.58,4.38].flatMap((y,r)=>[1.42,2.02,2.62,3.22].map((x,c)=>({id:'seat-r'+(r+1)+'-c'+(c+1),x,y,z:r?1.5:1.2,rowNumber:r+1,priority:r===0&&(c===1||c===2)?'primary':'secondary'})));
function normalSources(saved) {
 const live=bassInputAdapter(saved), frontSubsLive=live.filter(s=>s.group==='front'),rearSubsLive=live.filter(s=>s.group==='rear');
 const args={enabled:true,rspPosition,frontSubsLive,rearSubsLive,frontSubsCfg:null,rearSubsCfg:null};
 return buildAuthoritativeBassSources({...args,autoAlignDelays:buildAuthoritativeAutoAlignDelays(args),amplifierPowerPerSubW:500});
}
test('auto-apply retains absolute effective tuning through save/hydration',()=>{
 const saved=copy(applyAuto(instances,values));
 assert.ok(saved.every(s=>s.tuningSource==='v2-optimised'));
 assert.deepEqual(normalSources(saved).map(s=>s.tuning.delayMs),tuning.map(t=>t.delayMs));
});
test('exact source IDs survive reordering; no physical fields change',()=>{
 const applied=applyAuto([...instances].reverse(),values);
 for(const s of applied) {
  const original=instances.find(i=>i.id===s.id),expected=tuning.find(t=>t.sourceId===s.id);
  assert.equal(s.delayMs,expected.delayMs);assert.deepEqual(s.position,original.position);
  for(const k of ['model','rotationDeg','bottomHeightM','enabled','legacyGroup']) assert.deepEqual(s[k],original[k]);
 }
 assert.deepEqual(instances.map(s=>s.delayMs),[0,0,0,0]);
});
test('invalid/missing source identity is rejected before applying',()=>{
 assert.throws(()=>applyAuto(instances,values.slice(1)),/source identities/);
 assert.throws(()=>applyAuto(instances,[values[0],values[0],...values.slice(2)]),/source identities/);
});
test('legacy manual delays still receive normal automatic alignment',()=>{
 const engine=normalSources(copy(instances));
 assert.ok(engine.some(s=>s.tuning.delayMs>0));
 assert.ok(engine.every(s=>s.tuning.gainDb===0&&s.tuning.polarity===0));
});
test('confirmed candidate complex-transfer path matches full applied-state recalculation P19/P20',()=>{
 const zeroSources=normalSources(instances).map(s=>({...s,tuning:{delayMs:0,gainDb:0,polarity:0,phaseControlDeg:0}}));
 const physics={...BASS_NORMALIZED_PHYSICS_DEFAULTS,rewSourceCurveMode:'product',disableLateField:true,disableModalPropagationPhase:true};
 const common={roomDims,seatingPositions:seats,rspPosition,physics,qStrategyOverride:'ab_corrected'};
 const zero=simulateAuthoritativeBassResponse({...common,sources:zeroSources,capturePerSourcePerSeat:true});
 const raw={sources:zeroSources,perSourcePerSeatComplexTransfers:zero.perSourcePerSeatComplexTransfers,seatIds:['rsp',...seats.map(s=>s.id)],
  seatPriorityMap:seats.map(s=>[s.id,s.priority]),usableLfHz:computeUsableLfHz(zeroSources),transitionHz:computeTransitionHz(roomDims)};
 const target={p14TargetBasis:'minimum',p14TargetLevel:3,p14TargetDb:115,p18TargetBasis:'minimum'};
 const predicted=evaluateStage2ConfirmationWithTuning(raw,{...target,tuning,tuningVariant:'delay-only'});
 const sources=normalSources(copy(applyAuto(instances,values)));
 const actualSimulation=simulateAuthoritativeBassResponse({...common,sources});
 const curves=buildAuthoritativeResponseCurves(actualSimulation.seatResponses);
 const actual=evaluateStage2Confirmation({...raw,...curves,sources},target);
 assert.ok(predicted&&actual,'both canonical evaluations must complete');
 for(const field of ['achievedP19VariationDb','achievedP20VariationDb','achievedP18Hz']) {
  assert.ok(Number.isFinite(predicted[field])&&Number.isFinite(actual[field]),field+' finite');
  assert.ok(Math.abs(predicted[field]-actual[field])<1e-7,field+': '+predicted[field]+' vs '+actual[field]);
 }
 assert.equal(actual.achievedP19Level,predicted.achievedP19Level);
 assert.equal(actual.achievedP20Level,predicted.achievedP20Level);
 const worst=x=>x.perSeatP20.reduce((a,b)=>a.variationDbRaw>b.variationDbRaw?a:b).seatId;
 assert.equal(worst(actual),worst(predicted));
 console.log('PARITY',JSON.stringify({predictedP19:predicted.achievedP19VariationDb,actualP19:actual.achievedP19VariationDb,predictedP20:predicted.achievedP20VariationDb,actualP20:actual.achievedP20VariationDb,limitingSeat:worst(actual)}));
});
test('recommendation retry reads fresh exact fingerprint rather than cached stale row',async()=>{
 const src=read('src/components/recommendationEngine/recommendationPersistence.js').replace(/^import[^\n]*\n/gm,'').replace(/export /g,'').replace('setTimeout(resolve, ms)','setTimeout(resolve, 0)');
 let reads=0,writes=0,row={id:'cache',completed_by_fingerprint:{old:{job:{resultFingerprint:'old'}}}};
 const api=new Function('base44','readProjectAnalysisCacheRecord','invalidateProjectAnalysisCacheRead',src+';return {publishRecommendation};')(
 {entities:{ProjectAnalysisCache:{update:async(id,payload)=>{writes++;row={...row,...payload};}}}},
 async(p,v,options)=>{reads++; if(options?.force && reads>1)row.completed_by_fingerprint.new??={job:{resultFingerprint:'new'}};return copy(row);},()=>{});
 const rec={id:'confirmed',generatedAt:'fixture'};
 assert.equal(await api.publishRecommendation('p','v',rec,'new'),true);
 assert.equal(writes,1);assert.ok(reads>=2);
 assert.deepEqual(row.completed_by_fingerprint.new.recommendation,rec);
 assert.ok(row.completed_by_fingerprint.old);
});
function publication(fp='eng:old') {
 const d={name:'fixture',versionName:'Original Design',roomDims,screen:{visibleWidthInches:67.36,aspectRatio:'16:9',manualMode:false,heightFromFloorM:.5,mountMode:'baffle'},screenFrontPlaneM:.1,dolbyLayout:'5.1',seatingRows:2,seatsPerRowByRow:[4,4],seatingPositions:seats,
 placedSpeakers:[['FC','multi-lcr'],['SL','sl-evolve-1-1'],['SR','sl-evolve-1-1']].map(([role,model],i)=>({id:role,role,model,position:{x:i,y:1,z:1.2}})),subwooferInstances:instances,acousticTreatmentEnabled:false,selectedAbfuserQty:0};
 const report=buildFrozenReportProject(d,{projectId:'p',versionId:'v'});assert.deepEqual(report.missing,[]);
 const p={publication_contract_version:2,engineering_fingerprint:fp,published_at:'fixture',engine_version:'fixture',rp22_version:'fixture',algorithm_version:'fixture',provenance:{bass_fingerprint:'bass:fixture'},
 report_snapshot:{report_project:report.reportProject,seatingPositions:seats,placedSpeakers:d.placedSpeakers,analysisResult:{assessed:true},priceData:{}},
 engineering_summary:{designRating:{rating:'L3'},seatPriorityFingerprint:'seats:fixture',parameterAuthority:{},roomResultsByParameter:{},viewing:{available:true},project:{seatIds:seats.map(s=>s.id),reportCounts:{seatResultsByParameter:{p10:[],p20:[]}}}}};
 for(let i=1;i<=21;i++){p.engineering_summary.parameterAuthority['p'+i]={state:'scored',scope:'room',level:'L3'};p.engineering_summary.roomResultsByParameter[i]={state:'scored',status:'scored',value:5,formatted:'5 dB',level:'L3'};}
 const rows=seats.map((s,i)=>({seatId:s.id,row:s.rowNumber,column:i%4+1,priority:s.priority,status:'scored',value:5,level:'L3',valueFormatted:'5 dB'}));
 p.engineering_summary.project.reportCounts.seatResultsByParameter={p10:rows,p20:rows};p.parameter_index=buildAtomicParameterIndex(p);return p;
}
test('frozen report read uses explicitly requested publication, not newer current pointer',()=>{
 const durable={publication:publication(),version:{published_fingerprint:'eng:new'},status:'published',readState:'success',requestedEngineeringFingerprint:'eng:old'};
 const gate=auditDurablePublication({durable,authorityComplete:true});
 assert.equal(gate.allowed,true,JSON.stringify(gate.missing));
});
test('current publication reads still reject pointer mismatch',()=>{
 const durable={publication:publication(),version:{published_fingerprint:'eng:new'},status:'published',readState:'success'};
 const result=auditDurablePublication({durable,authorityComplete:true});
 assert.equal(result.allowed,false);assert.equal(result.fingerprintMatches,false);
});
test('explicit historical read still rejects wrong returned publication',()=>{
 const durable={publication:publication('eng:wrong'),version:{published_fingerprint:'eng:new'},status:'published',readState:'success',requestedEngineeringFingerprint:'eng:old'};
 assert.equal(auditDurablePublication({durable,authorityComplete:true}).allowed,false);
});
test('durable reader retains requested identity for report gate',async()=>{
 const src=read('src/components/engineering/versionedEngineeringAuthority.js').replace(/^import[\s\S]*?;\n/gm,'').replace(/export /g,'');
 const api=new Function('base44','invalidateProjectVersionRead','invalidateProjectAnalysisCacheRead',src+';return {fetchDurablePublication};')(
 {functions:{invoke:async(name,args)=>({data:{publication:{engineering_fingerprint:args.engineering_fingerprint||'eng:new'},version:{published_fingerprint:'eng:new'},status:'published'}})}},()=>{},()=>{});
 const result=await api.fetchDurablePublication('p','v',{engineeringFingerprint:'eng:old'});
 assert.equal(result.requestedEngineeringFingerprint,'eng:old');
 const current=await api.fetchDurablePublication('p','v');assert.equal(current.requestedEngineeringFingerprint,null);
});
test('scoped bass flush completes before publication without flushing other versions',async()=>{
 const src=read('src/components/room/bass/bassAuthorityWriteQueue.js').replace(/^import[^\n]*\n/gm,'').replace(/export /g,'');
 const updates=[],api=new Function('base44','invalidateProjectAnalysisCacheRead','publishBassReconciliationStatus',src+';return {queueBassAuthorityWrite,flushBassAuthorityWrite,flushQueuedBassAuthorityWrites};')(
 {entities:{ProjectAnalysisCache:{update:async(id,payload)=>updates.push({id,...payload}),create:async()=>assert.fail('must update existing')}}},()=>{},()=>{});
 const pending=api.queueBassAuthorityWrite('p::v','new',{id:'row',current_fingerprint:'old'},{current_fingerprint:'new',status:'complete',completed_by_fingerprint:{new:{}}});
 const other=api.queueBassAuthorityWrite('p::other','other',{id:'other'},{current_fingerprint:'other',status:'complete',completed_by_fingerprint:{other:{}}});
 assert.equal(await api.flushBassAuthorityWrite('p','v'),true);assert.equal(await pending,true);
 assert.deepEqual(updates.map(x=>x.id),['row']);assert.equal(updates[0].current_fingerprint,'new');
 api.flushQueuedBassAuthorityWrites();await other;
});
