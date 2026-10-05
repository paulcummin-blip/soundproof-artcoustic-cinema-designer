import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { prepareProposalEvidence, prepareProposalInterpretation, generateProposalDraftContent } from '../../shared/proposalDraftPipeline.js';
import { resolveSections, buildProjectContext } from '../../shared/proposalGenerationPrompts.js';
import { resolveSectionTitle } from '../../shared/systemDesignSummarySections.js';
import { isCompleteComparisonTable } from '../../shared/comparisonPersistence.js';
import { buildPreviewAtAGlance, readFrozenPreviewSnapshots } from '../../shared/proposalPreviewAuthority.js';

// DRY RUN ONLY. No call to live generation, no persistence, no rollback, no export.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({dry_run:true,error:'Unauthorized'},{status:401});
    if (user.role !== 'admin') return Response.json({dry_run:true,error:'Admin-only proposal preview'},{status:403});
    const input = await req.json();
    if (!input.source_proposal_id) return Response.json({dry_run:true,error:'source_proposal_id required for frozen preview'},{status:400});
    // Only read operations are exposed to the snapshot loader.
    const reads = { Proposal:{filter:(...args)=>base44.entities.Proposal.filter(...args)} };
    const source = await base44.entities.Proposal.get(input.source_proposal_id);
    if (source?.proposal_type !== 'comparison') return Response.json({dry_run:true,error:'A frozen comparison source is required'},{status:400});
    const ids = input.selected_version_ids || source.selected_version_ids || [];
    if (!Array.isArray(ids) || ids.length<2 || new Set(ids).size!==ids.length
      || ids.length!==source.selected_version_ids?.length || !ids.every(id=>source.selected_version_ids.includes(id))) {
      return Response.json({dry_run:true,error:'Select exactly the distinct versions covered by the frozen source'},{status:400});
    }
    const project = await base44.entities.Project.get(source.project_id);
    const versionPage = await base44.entities.ProjectVersion.filter({project_id:source.project_id,id:{$in:ids}},{limit:50});
    const projectVersions = versionPage.items;
    if (projectVersions.length!==ids.length || !project?.account_id || project.account_id!==source.account_id) {
      return Response.json({dry_run:true,error:'Project/version source identity mismatch'},{status:409});
    }
    const brandPage = await base44.entities.BrandAsset.filter({account_id:project.account_id},{limit:1});
    const suppliedSnapshots = await readFrozenPreviewSnapshots(reads,source,ids);
    if (suppliedSnapshots.some(entry=>entry.snapshot?.available!==true
      || entry.snapshot.identity?.versionId!==entry.version_id
      || (entry.snapshot.identity?.projectId && entry.snapshot.identity.projectId!==project.id))) {
      return Response.json({dry_run:true,error:'Frozen evidence missing or mismatched; nothing was saved'},{status:409});
    }
    const resolvedType = 'comparison';
    const {versionEvidence,comparisonTable,comparisonEvidenceText} = prepareProposalEvidence(suppliedSnapshots,projectVersions,resolvedType);
    if (!isCompleteComparisonTable(comparisonTable,ids)) return Response.json({dry_run:true,error:'Complete comparison evidence required; nothing was saved'},{status:409});
    const versionLabelById = new Map(ids.map((id,index)=>{
      const version=projectVersions.find(v=>v.id===id);
      return [id,`Version ${version?.version_number ?? index+1} - ${version?.version_name || 'Untitled'}`];
    }));
    const client_brief = typeof input.client_brief==='string' ? input.client_brief : source.client_brief || '';
    const {interpretationBlock} = prepareProposalInterpretation({suppliedSnapshots,project,client_brief,resolvedType,resolvedVersionIds:ids,versionLabelById});
    const engineering_snapshot = suppliedSnapshots[0].snapshot;
    const sourceIdentity = {project_id:project.id,version_id:ids[0],version_label:versionLabelById.get(ids[0]),
      engineering_fingerprint:engineering_snapshot.identity?.engineeringFingerprint || null,published_at:engineering_snapshot.identity?.generatedAt || null};
    const projectContext = buildProjectContext(project,source.narrative_goal,brandPage.items?.[0] || null,client_brief,
      engineering_snapshot,resolvedType,versionEvidence.map(v=>v.version_name),sourceIdentity,comparisonEvidenceText);
    const sectionDefs = resolveSections(resolvedType);
    const sectionRecords = sectionDefs.map((s,index)=>({section_type:s.type,section_key:s.key,
      title:resolveSectionTitle(s.type,s.title,resolvedType),body:'',order_index:index,is_enabled:true}));
    const generatedContent = await generateProposalDraftContent({invokeLLM:args=>base44.integrations.Core.InvokeLLM(args),
      sectionRecords,sectionDefs,resolvedType,engineering_snapshot,comparisonTable,versionEvidence,projectContext,interpretationBlock,clientBrief:client_brief});
    const sections = sectionRecords.map(section=>{
      const generated=generatedContent.find(item=>item.section.section_key===section.section_key);
      return {...section,body:generated?.html || '',metadata:generated?.metadata || null,generated:!!generated};
    });
    return Response.json({dry_run:true,preview_only:true,persisted:false,status:'dry_run',
      notice:'DRY RUN — unsaved AI preview from historical frozen evidence. No proposal, section, library entry or report/export status was changed.',
      project_id:project.id,project_name:project.name,source_proposal_id:source.id,source_mode:'historical_frozen_snapshots',
      selected_version_ids:ids,versions:versionEvidence,sections,
      at_a_glance:buildPreviewAtAGlance(comparisonTable),key_differences:comparisonTable,
      evidence_identities:suppliedSnapshots.map(entry=>({version_id:entry.version_id,source_record_id:entry.source_record_id,
        ...(entry.snapshot.identity || {})})),section_count:sections.length});
  } catch(error) {
    // There is no cleanup/rollback path because this handler never writes.
    return Response.json({dry_run:true,preview_only:true,persisted:false,error:error?.message || 'Preview failed; nothing was saved'},{status:500});
  }
}