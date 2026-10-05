import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { prepareProposalEvidence, prepareProposalInterpretation, generateProposalDraftContent } from '../base44/shared/proposalDraftPipeline.js';
import { resolveSections, buildProjectContext } from '../base44/shared/proposalGenerationPrompts.js';
import { buildPreviewAtAGlance, readFrozenPreviewSnapshots } from '../base44/shared/proposalPreviewAuthority.js';
import { buildProposalNarrativeEvidenceGuard } from '../base44/shared/proposalNarrativeEvidenceGuard.js';
import { resolveSectionTitle } from '../base44/shared/systemDesignSummarySections.js';
import { buildComparisonGlance } from '../src/components/proposal/print/atAGlanceVersions.js';
// All calls below use fixtures; no SDK or database connection.
const snapshot=(id,name,p12,p13,p14,p17)=>({available:true,identity:{projectId:'fixture',versionId:id,engineeringFingerprint:`fp-${id}`},version:{name},
  system:{configuration:{dolby_config:'9.1.6'},channel_layout:{total_discrete:15},product_roles:[{role:'lcr',model_label:id==='low'?'Q6-3':'Q8-5'}]},
  rp22:{parameter_headlines:[{parameter_id:12,achieved_level:p12===106?'L3':'L4',formatted_value:`${p12} dBC`},{parameter_id:13,achieved_level:p13===100?'L2':'L4',formatted_value:`${p13} dBC`},{parameter_id:17,achieved_level:p17}]},
  bass:{available:true,p14:{available:true,achieved_level:p14===115?'L3':'L4',formatted_value:`${p14} dBC`}}});
const entries=[{version_id:'low',version_name:'Level 1 version',snapshot:snapshot('low','Level 1 version',106,100,115,'L3')},{version_id:'high',version_name:'Level 4 version',snapshot:snapshot('high','Level 4 version',116,108,118,'L2')}];
const versions=entries.map((e,i)=>({id:e.version_id,version_name:e.version_name,version_number:i+1}));
const evidence=prepareProposalEvidence(entries,versions,'comparison');
const labels=new Map(versions.map(v=>[v.id,v.version_name]));
const interpretation=prepareProposalInterpretation({suppliedSnapshots:entries,project:{name:'Fixture'},client_brief:'',resolvedType:'comparison',resolvedVersionIds:['low','high'],versionLabelById:labels});
const context=buildProjectContext({name:'Fixture'},'luxury_cinema',null,'',entries[0].snapshot,'comparison',[...labels.values()],null,evidence.comparisonEvidenceText);
const defs=resolveSections('comparison');
const sections=defs.map(s=>({section_type:s.type,section_key:s.key,title:resolveSectionTitle(s.type,s.title,'comparison')}));
const calls=[];
const results=await generateProposalDraftContent({invokeLLM:async args=>{calls.push(args);return args.response_json_schema?{intro_html:'<p>Fixture intro.</p>'}:'<p>Fixture text.</p>';},sectionRecords:sections,sectionDefs:defs,resolvedType:'comparison',engineering_snapshot:entries[0].snapshot,comparisonTable:evidence.comparisonTable,versionEvidence:evidence.versionEvidence,projectContext:context,interpretationBlock:interpretation.interpretationBlock});
test('dry-run is admin-only with no writes, live invocation or rollback',()=>{
 const src=fs.readFileSync('base44/functions/previewProposalGeneration/entry.ts','utf8');assert.match(src,/user.role !== 'admin'/);assert.match(src,/dry_run:true,preview_only:true,persisted:false/);
 assert.doesNotMatch(src,/\.(create|bulkCreate|update|bulkUpdate|updateMany|delete|deleteMany|upsert)\s*\(/);assert.doesNotMatch(src,/functions\.invoke|rollbackCreatedProposal|recordIssuedExport/);
});
test('live and preview call the identical extraction, interpretation and prompt pipeline',()=>{
 for(const name of ['generateProposal','previewProposalGeneration']){const src=fs.readFileSync(`base44/functions/${name}/entry.ts`,'utf8');for(const fn of ['prepareProposalEvidence','prepareProposalInterpretation','generateProposalDraftContent','buildProjectContext'])assert.match(src,new RegExp(`${fn}\\(`));}
 const pipeline=fs.readFileSync('base44/shared/proposalDraftPipeline.js','utf8');assert.match(pipeline,/buildSelectedVersionEvidence\(/);assert.match(pipeline,/buildComparisonTable\(/);assert.match(pipeline,/buildSectionPrompt\(/);assert.doesNotMatch(pipeline,/\.entities|functions\.invoke/);
});
test('both version objects preserve fingerprints',()=>{assert.deepEqual(evidence.versionEvidence.map(v=>v.version_id),['low','high']);assert.deepEqual(evidence.versionEvidence.map(v=>v.source_identity.engineeringFingerprint),['fp-low','fp-high']);});
test('At a Glance matches the printed two-version model',()=>{const glance=buildPreviewAtAGlance(evidence.comparisonTable);const printed=buildComparisonGlance({comparisonRows:evidence.comparisonTable.rows,comparisonVersions:evidence.comparisonTable.versions});assert.equal(glance.versionGroups.length,2);assert.deepEqual(glance.versionGroups.map(g=>({name:g.name,cards:g.cards.map(({label,value})=>({label,value}))})),printed.versionGroups);});
test('Key Differences preserves P12/P13/P14 and P17 trade-off',()=>{const row=k=>evidence.comparisonTable.rows.find(r=>r.key===k);assert.deepEqual(row('p12').values,['L3 · 106 dBC','L4 · 116 dBC']);assert.deepEqual(row('p13').values,['L2 · 100 dBC','L4 · 108 dBC']);assert.deepEqual(row('p14').values,['L3 · 115 dBC','L4 · 118 dBC']);assert.deepEqual(row('p17').values,['L3','L2']);assert.match(row('p17').client_meaning,/trade-off/);assert.equal(evidence.comparisonTable.rows.some(r=>r.key==='p20'),false);});
test('all six generated sections use the shared sales voice and calculated table',()=>{assert.equal(results.length,6);assert.equal(calls.length,6);assert.ok(results.every(r=>r.html && !r.failed));assert.ok(calls.every(c=>c.prompt.includes('PROPOSAL-ONLY SALES VOICE') && c.prompt.includes('NO POSITIVE P20 CLAIM IS AUTHORISED')));assert.equal(results.find(r=>r.section.section_type==='key_performance_highlights').metadata.comparison_rows,evidence.comparisonTable.rows);});
test('final guard does not infer positive P20 from weak neutral rows',()=>{assert.match(buildProposalNarrativeEvidenceGuard(evidence.comparisonTable,evidence.versionEvidence),/NEUTRAL DISCLOSURE ONLY/);});
const readCalls=[];const frozen=await readFrozenPreviewSnapshots({Proposal:{filter:async(...args)=>{readCalls.push(args);return {items:[{id:'summary',engineering_snapshot:entries[0].snapshot}]};}}},{id:'source',project_id:'fixture',account_id:'account',created_date:'2026-01-01',engineering_snapshot:entries[1].snapshot},['low','high']);
test('historical loader preserves order and reads at cutoff only',()=>{assert.deepEqual(frozen.map(v=>v.version_id),['low','high']);assert.equal(readCalls.length,1);assert.deepEqual(readCalls[0][0].created_date,{$lte:'2026-01-01'});assert.equal(frozen[1].source_record_id,'source');});