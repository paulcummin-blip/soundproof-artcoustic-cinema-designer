import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildFrozenReportProject, buildAtomicParameterIndex, auditPublicationContract } from '../shared/engineeringPublicationContract.js';
import { discreteChannelCounts } from '../shared/channelArchitecture.js';
import { assessEngineeringReportCompleteness, isTerminalAssessment } from '../shared/assessmentTerminal.js';
import { validateReportEvidence } from '../shared/reportEvidenceCompleteness.js';
import { deriveReportReadiness } from '../src/components/report/reportReadinessAuthority.js';
const copy = x => JSON.parse(JSON.stringify(x));
function state() {
  return { name:'Contract fixture', versionName:'Original Design', roomDims:{widthM:3.88,lengthM:4.64,heightM:2.8},
    screen:{visibleWidthInches:67.36,aspectRatio:'16:9',manualMode:false,heightFromFloorM:0.5,mountMode:'baffle'},
    screenFrontPlaneM:0.1, dolbyLayout:'5.1', seatingRows:1,seatsPerRowByRow:[],
    seatingPositions:[1,2,3].map(i=>({id:'seat-r1-c'+i,rowNumber:1,x:i,y:3.6,z:1.2,priority:'primary'})),
    placedSpeakers:[['FC','multi-lcr'],['SL','sl-evolve-1-1'],['SR','sl-evolve-1-1']].map(([role,model],i)=>({id:role,role,model,position:{x:i,y:1,z:1.2}})),
    subwooferInstances:[{id:'sub',model:'sub2-12',enabled:true,position:{x:3.7,y:1.58},bottomHeightM:0.05}],
    acousticTreatmentEnabled:true,selectedAbfuserQty:6 };
}
function publication() {
  const d=state(), report=buildFrozenReportProject(d,{projectId:'project',versionId:'version'});
  const seatRows=d.seatingPositions.map((s,i)=>({seatId:s.id,row:1,column:i+1,priority:'primary',status:'scored',value:5,level:'L3',valueFormatted:'5 dB'}));
  const p={publication_contract_version:2,engineering_fingerprint:'eng:fixture',published_at:'2026-10-08T12:00:00Z',
    engine_version:'fixture',rp22_version:'fixture',algorithm_version:'fixture',provenance:{bass_fingerprint:'bass:fixture'},
    report_snapshot:{report_project:report.reportProject,seatingPositions:d.seatingPositions,placedSpeakers:d.placedSpeakers,priceData:{},analysisResult:{assessed:true}},
    engineering_summary:{parameterAuthority:{},roomResultsByParameter:{},viewing:{available:true},project:{seatIds:d.seatingPositions.map(s=>s.id),reportCounts:{seatResultsByParameter:{p10:copy(seatRows),p20:copy(seatRows)}}}}};
  for(let id=1;id<=21;id++) { p.engineering_summary.parameterAuthority['p'+id]={state:'scored',scope:'room',level:'L3'};
    p.engineering_summary.roomResultsByParameter[id]={state:'scored',status:'scored',value:5,formatted:'5 dB',level:'L3'}; }
  p.parameter_index=buildAtomicParameterIndex(p); return p;
}
function evidence(p=publication()) {
  const index=copy(p.parameter_index); for(const row of Object.values(index)) {row.authority_value=row.value;row.authority_level=row.level;}
  return {evidence_version:1,report_type:'technical',proposal_ready:true,
    identity:{project_id:'project',version_id:'version',report_type:'technical',source_fingerprint:p.engineering_fingerprint,bass_fingerprint:p.provenance.bass_fingerprint},
    room:{length_m:4.64,width_m:3.88,height_m:2.8},screen:{screen_type:'TV',format:'16:9',viewable_width_cm:171.1},
    system:{products_selected:[{model:'Multi LCR'}]},parameter_index:index,parameters:Object.values(index),
    seating:{seats:3,per_seat:state().seatingPositions.map((s,i)=>({seat_id:s.id,row:1,column:i+1,priority:'primary',distance_m:3.5,horizontal_angle_deg:27}))},
    bass:{p14:{raw_value:index.P14.raw_value,achieved_level:index.P14.level}}};
}
test('integrated LCR + SL + SR is five channels, not three cabinets',()=>assert.deepEqual(discreteChannelCounts(state().placedSpeakers),{bed:5,overhead:0}));
test('mono centre is not falsely counted as integrated LCR',()=>{const s=state();s.placedSpeakers[0].model='multi-mono';assert.equal(discreteChannelCounts(s.placedSpeakers).bed,3);});
test('absent row counts resolve from exact seat identities',()=>{const s=state();delete s.seatingRows;const r=buildFrozenReportProject(s,{projectId:'project',versionId:'version'});assert.deepEqual(r.missing,[]);assert.equal(r.reportProject.seating_rows,1);assert.deepEqual(r.reportProject.seats_per_row_by_row,[3]);assert.deepEqual(s.seatsPerRowByRow,[]);});
test('conflicting explicit counts are refused, not overwritten',()=>{const s=state();s.seatsPerRowByRow=[4];const r=buildFrozenReportProject(s,{projectId:'project',versionId:'version'});assert.equal(r.reportProject,null);assert.match(r.missing.join(';'),/conflicts/);assert.deepEqual(s.seatsPerRowByRow,[4]);});
test('conflicting explicit row number is refused',()=>{const s=state();s.seatingRows=2;assert.match(buildFrozenReportProject(s,{projectId:'p',versionId:'v'}).missing.join(';'),/seatingRows conflicts/);});
test('missing individual row identifiers still block',()=>{const s=state();delete s.seatingPositions[0].rowNumber;assert.equal(buildFrozenReportProject(s,{projectId:'p',versionId:'v'}).reportProject,null);});
test('complete publication and evidence pass matching shared contracts',()=>{const p=publication();assert.deepEqual(auditPublicationContract(p).missing,[]);assert.equal(validateReportEvidence(evidence(p)).complete,true);});
test('format mismatch still blocks',()=>{const p=publication();p.report_snapshot.report_project.dolby_config='7.1';assert.match(auditPublicationContract(p).missing.join(';'),/dolby_config/);});
test('terminal FAIL is accepted across all three contracts',()=>{const p=publication();p.engineering_summary.parameterAuthority.p13.level='FAIL';p.engineering_summary.roomResultsByParameter[13].level='FAIL';p.parameter_index=buildAtomicParameterIndex(p);assert.equal(assessEngineeringReportCompleteness(p.engineering_summary).complete,true);assert.equal(auditPublicationContract(p).allowed,true);assert.equal(validateReportEvidence(evidence(p)).complete,true);});
test('explicit N/A P20 is terminal without inventing seat values',()=>{const p=publication();p.engineering_summary.parameterAuthority.p20={state:'na',scope:'seat',level:null,reason:'No applicable comparison seats'};p.engineering_summary.project.reportCounts.seatResultsByParameter.p20=[];p.parameter_index=buildAtomicParameterIndex(p);assert.equal(p.parameter_index.P20.level,'N/A');assert.equal(p.parameter_index.P20.raw_value,null);assert.equal(assessEngineeringReportCompleteness(p.engineering_summary).complete,true);assert.equal(auditPublicationContract(p).allowed,true);assert.equal(validateReportEvidence(evidence(p)).complete,true);});
test('bare N/A without explicit applicability is rejected',()=>assert.equal(isTerminalAssessment({state:'scored',level:'N/A'}),false));
test('provisional parameter blocks even with a numeric level',()=>{const p=publication();p.engineering_summary.parameterAuthority.p12.state='provisional';assert.equal(auditPublicationContract(p).allowed,false);assert.deepEqual(assessEngineeringReportCompleteness(p.engineering_summary).missingParameterKeys,['p12']);});
test('provisional evidence blocks',()=>{const e=evidence();e.parameter_index.P13.source_row.status='provisional';assert.equal(validateReportEvidence(e).complete,false);});
test('unreliable and stale results remain blocked',()=>{assert.equal(isTerminalAssessment({state:'scored',level:'L3',verified:false}),false);const p=publication();p.engineering_summary.bassAuthorityCurrent=false;assert.equal(auditPublicationContract(p).allowed,false);});
test('publication rejection is not described as assessments never run',()=>{const r=deriveReportReadiness({assessment:{reportComplete:false,status:'publication_rejected',reason:'Channel contract rejected'}});assert.equal(r.canExport,false);assert.equal(r.reason,'Channel contract rejected');assert.deepEqual(r.missing.map(x=>x.label),['Assessment complete — publication rejected']);});
test('diagnostics distinguish missing/incomplete/stale/published',()=>{for(const status of ['assessment_missing','assessment_incomplete','stale_pointer']) assert.equal(deriveReportReadiness({assessment:{reportComplete:false,status,reason:status}}).canExport,false);assert.equal(deriveReportReadiness({assessment:{reportComplete:true,status:'durably_published'},roomDims:{widthM:3,lengthM:4},placedSpeakers:[{}],engineeringSummary:{},bassPerformance:{}}).canExport,true);});
test('only acknowledged publication invalidates old missing cache, version-scoped',async()=>{
  let available=false,calls=0,versionInvalidations=0,bassInvalidations=0;
  const source=fs.readFileSync(new URL('../src/components/engineering/versionedEngineeringAuthority.js',import.meta.url),'utf8').replace(/^import[\s\S]*?;\n/gm,'').replace(/export /g,'');
  const api=new Function('base44','invalidateProjectVersionRead','invalidateProjectAnalysisCacheRead',source+';return {fetchDurablePublication,refreshEngineeringPublicationReaders,subscribeDurablePublication};')(
    {functions:{invoke:async()=>{calls++;return {data:available?{status:'published',publication:{engineering_fingerprint:'eng:new'},version:{published_fingerprint:'eng:new'}}:{status:'not_calculated'}};}}},
    ()=>versionInvalidations++,()=>bassInvalidations++);
  assert.equal((await api.fetchDurablePublication('p','v')).publication,null);available=true;
  assert.equal((await api.fetchDurablePublication('p','v')).publication,null);
  let notifications=0;api.subscribeDurablePublication('p','v',()=>notifications++);
  let other=0;api.subscribeDurablePublication('p','other',()=>other++);
  api.refreshEngineeringPublicationReaders('p','v');
  assert.equal((await api.fetchDurablePublication('p','v')).publication.engineering_fingerprint,'eng:new');
  assert.equal(calls,2);assert.equal(notifications,1);assert.equal(other,0);assert.equal(versionInvalidations,1);assert.equal(bassInvalidations,1);
});
test('report presentation uses frozen facts despite newer live geometry',()=>{
  const source=fs.readFileSync(new URL('../src/components/report/frozenReportAppState.js',import.meta.url),'utf8').replace(/^import[^\n]*\n/gm,'').replace(/export /g,'');
  const project=publication();
  const adapt=new Function('getSpeakerVisibilityFor',source+';return frozenReportAppState;')(()=>new Set(['FC','SL','SR']));
  const newer={roomDims:{widthM:9,lengthM:10},screen:{visibleWidthInches:200},seatingPositions:[{id:'wrong'}],speakerSystem:{placedSpeakers:[]},selectedAbfuserQty:99};
  const result=adapt(newer,project);
  assert.equal(result.roomDims.widthM,3.88);assert.equal(result.screen.visibleWidthInches,67.36);
  assert.equal(result.seatingPositions.length,3);assert.equal(result.speakerSystem.placedSpeakers[0].model,'multi-lcr');
  assert.equal(result.selectedAbfuserQty,6);assert.equal(result.reportEngineeringFingerprint,'eng:fixture');
  assert.equal(newer.roomDims.widthM,9);
});
test('client/server shared contracts are identical',()=>{
  for(const file of ['channelArchitecture.js','assessmentTerminal.js','engineeringPublicationContract.js','reportEvidenceCompleteness.js'])
    assert.equal(fs.readFileSync(new URL('../shared/'+file,import.meta.url),'utf8'),fs.readFileSync(new URL('../base44/shared/'+file,import.meta.url),'utf8'));
});
