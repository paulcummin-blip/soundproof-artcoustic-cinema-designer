import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildReportDesignIntentAttempt} from '../base44/shared/reportDesignIntent/buildReportDesignIntentAttempt.js';
import {buildProposalEvidence} from '../base44/shared/proposalEvidence/proposalEvidenceBuilder.js';
import {MARQUEE_GENERATED_AT as AT,marqueeVersion} from './fixtures/marqueeOriginalGuardFixture.mjs';
import {reviewDesignIntentCoverage,requiredDesignReasons} from '../base44/shared/reportDesignIntent/designIntentCoverage.js';
import {contextRevision} from '../base44/shared/designContext/designContextPersistence.js';
let checks=0;const check=(v,msg)=>{assert.ok(v,msg);checks++;};
check(readFileSync('base44/shared/designContext/designContextPersistence.js','utf8')===readFileSync('src/components/adi/designContext/designContextPersistence.js','utf8'),'frontend/backend revision parity');
const original='This cinema is arranged around a large television and a single loudspeaker system. The display occupies the front wall, the viewing position is set so the distance suits its scale, and the screen channels, the surrounds and the rear subwoofer pair work together as one system. The arrangement keeps dialogue, music and effects in their proper places around the listener.';
const sentence='The row is positioned to leave room for a wheelchair turning space behind the audience.';
const reason='seating: Leave wheelchair turning space behind the audience.';
const pack=buildProposalEvidence({versions:[marqueeVersion()],generatedAt:AT});
function draft(text){return{contract_version:2,pack_fingerprint:pack.pack_fingerprint,sections:[{section:'decision_summary',text,claim_ids:['claim_p4_primary_performance_01','claim_p6_primary_performance_01','claim_p20_primary_consistency_01','claim_p4_secondary_performance_01','claim_p6_secondary_performance_01']}]};}
function review(pass){return{reasons:[{reason_index:0,fully_covered:pass,relationships:[{source_quote:'wheelchair turning space',covered:pass,narrative_quote:pass?sentence:'',explanation:pass?'Arrangement allows wheelchair turning.':'The wheelchair turning reason is missing.'}],missing_meaning:pass?'':'Wheelchair turning space behind seating is missing.'}]};}
function harness(context=true){const rows={Project:[{id:'p1',name:'Test',account_id:'acct'}],ProjectVersion:[{id:'a',project_id:'p1',version_name:'Original Design'}],ReportSnapshot:[{id:'s1',project_id:'p1',version_id:'a',report_type:'project',status:'current',generated_at:AT,payload:{pages:[],design_intent:null},source_fingerprints:{engineeringFingerprint:'eng:original-design',calculationFingerprint:'calc:original-design',seatPriorityFingerprint:'seat:original-design'}}],ProposalAsset:[],SystemConfig:[{id:'cfg',gpt_proposal_writer:{enabled:true,accounts:[],emails:[]}}],DesignContext:context?[{id:'ctx',project_id:'p1',version_id:'a',context_items:[{question_id:'access',status:'answered',area:'seating',answer:reason.slice(9)}]}]:[]};
let reads=0;const entities=new Proxy({}, {get:(_,name)=>({get:async id=>(rows[name]||[]).find(r=>r.id===id),filter:async q=>{if(name==='DesignContext')reads++;return{items:(rows[name]||[]).filter(r=>Object.entries(q).every(([k,v])=>v?.$in?v.$in.includes(r[k]):r[k]===v))}}})});
return{rows,get reads(){return reads},run:invokeLLM=>({entities,authorityEntities:entities,invokeLLM,projectId:'p1',versionId:'a',isMasterAdmin:true,user:{email:'admin@example.com'},now:AT,evidenceReader:async()=>[marqueeVersion()]})};}
for(const eventualSuccess of [true,false]){
const h=harness(),before=JSON.stringify(h.rows),calls=[];let writer=0,reviewer=0;
const outcome=await buildReportDesignIntentAttempt(h.run(async request=>{
calls.push(request);if(request.prompt.startsWith('DESIGN INTENT COVERAGE'))return review(++reviewer===2&&eventualSuccess);
writer++;return draft(writer===2&&eventualSuccess?original+' '+sentence:original);
}));
check(outcome.ok,'core ran');check(outcome.attempt.ok===eventualSuccess,'bounded correction outcome');check(writer===2&&reviewer===2,'exactly one writer correction and two coverage checks');check(calls.every(c=>c.model===calls[0].model),'same configured model throughout');check(outcome.attempt.correction.attempted,'correction recorded');check(outcome.attempt.correction.succeeded===eventualSuccess,'correction success truthful');check(JSON.stringify(h.rows)===before,'no saved state modified');
if(eventualSuccess)check(outcome.attempt.record.context_revision===contextRevision(h.rows.DesignContext[0]),'confirmed revision attached');
}
const h=harness();let calls=0;
const stale=await buildReportDesignIntentAttempt({...h.run(async()=>{calls++;return draft(original)}),expectedContextRevision:'dc2:stale'});
check(!stale.ok&&stale.block.code==='design_context_changed'&&calls===0,'revision mismatch blocks writer');
const changed=await buildReportDesignIntentAttempt(h.run(async request=>{if(request.prompt.startsWith('DESIGN INTENT COVERAGE')){h.rows.DesignContext[0].context_items[0].answer='Changed during generation';return review(true);}return draft(original+' '+sentence);}));
check(!changed.ok&&changed.block.code==='design_context_changed','change during generation blocks acceptance');
const n=harness(false);calls=0;const noContext=await buildReportDesignIntentAttempt(n.run(async()=>{calls++;return draft(original)}));
check(noContext.attempt.ok&&calls===1,'ordinary report without context uses writer once');
const input={design_intent_scope:{section:'decision_summary',required_saved_reasons:[reason]},design_interpretation:{view:{design_decisions:[]}}};
check(requiredDesignReasons(input)[0]===reason,'raw intention survives interpretation filtering');
for(const response of [null,{}, {reasons:[]},review(true)]){
const result=await reviewDesignIntentCoverage({input,text:original,invokeLLM:async()=>response});
check(!result.valid,'malformed/uncited positive reviews fail closed');
}
const error=await reviewDesignIntentCoverage({input,text:original,invokeLLM:async()=>{throw Error('provider down')}});
check(!error.valid,'review provider error fails closed');
const otherScope=await reviewDesignIntentCoverage({input:{...input,design_intent_scope:{section:'system_summary',required_saved_reasons:[reason]}},text:original,invokeLLM:async()=>{throw Error('must not run')}});
check(otherScope.valid&&!otherScope.applies,'other report sections unaffected');
console.log(checks+' coverage, correction, revision and authority assertions passed');
