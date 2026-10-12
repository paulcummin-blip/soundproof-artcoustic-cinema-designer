import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { readProposalReportEvidence } from '../../shared/proposalReportEvidenceReader.js';
import { buildProposalEvidence } from '../../shared/proposalEvidence/proposalEvidenceBuilder.js';
import { buildWriterInput } from '../../shared/proposalWriter/writerInputBuilder.js';
import { buildWriterProviderRequest, assertWriterInputCarriesNoLiveState } from '../../shared/proposalWriter/writerPromptBuilder.js';
import { validateWriterOutput } from '../../shared/proposalWriter/writerOutputValidator.js';
import { buildWriterDesignContext } from '../../shared/proposalWriter/writerDesignContext.js';
import { WRITER_PROMPT_VERSION } from '../../shared/proposalWriter/writerContractSchema.js';

// READ-ONLY dry run of the strength-led proposal writer. It reads ONE version's
// canonical Project Report evidence, builds the frozen evidence pack and the
// writer input from it, calls the writer once, and returns the input, the output
// and the validation. It writes NOTHING: no proposal, no section, no library
// entry, no report or export status.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin-only proposal writer preview' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const projectId = body.project_id;
    const versionId = body.version_id;
    if (!projectId || !versionId) return Response.json({ error: 'project_id and version_id are required' }, { status: 400 });

    const project = await base44.entities.Project.get(projectId);
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });
    const version = await base44.entities.ProjectVersion.get(versionId);
    if (!version || version.project_id !== projectId) {
      return Response.json({ error: 'Version does not belong to this project' }, { status: 400 });
    }

    // An optional saved proposal supplies the design interpretation and the
    // designer's notes for this read-only review. Nothing is written: the proposal
    // and its sections are only read.
    const proposalId = body.proposal_id || null;
    let proposal = null;
    let dealerNotes = null;
    if (proposalId) {
      proposal = await base44.entities.Proposal.get(proposalId).catch(() => null);
      if (!proposal || proposal.project_id !== projectId) {
        return Response.json({ error: 'proposal_id must be a proposal of this project' }, { status: 400 });
      }
      const sectionPage = await base44.entities.ProposalSection.filter({ proposal_id: proposal.id }, { limit: 50 });
      dealerNotes = (Array.isArray(sectionPage) ? sectionPage : (sectionPage?.items || []))
        .map((section) => (typeof section?.dealer_notes === 'string' ? section.dealer_notes.trim() : ''))
        .filter(Boolean)
        .join('\n\n') || null;
    }

    // The canonical Project Report evidence, read exactly as a proposal reads it.
    const suppliedSnapshots = await readProposalReportEvidence(base44.entities, projectId, [version]);
    if (!suppliedSnapshots.length) return Response.json({ error: 'No Project Report evidence for this version' }, { status: 409 });

    // Phase 1: the frozen evidence pack, carrying the ranked strength stories.
    const pack = buildProposalEvidence({ versions: suppliedSnapshots });

    // Phase 2: the one versioned writer input the writer is given — the frozen pack,
    // the verified design interpretation and the designer's brief. The context is
    // resolved by the SAME authority the live generation path uses, so a review here
    // and a real generation can never be given different guidance.
    const input = buildWriterInput({
      pack,
      designContext: buildWriterDesignContext({
        proposal, projectId, versionIds: [versionId], pack, dealerNotes,
      }),
    });
    assertWriterInputCarriesNoLiveState(input);

    // Phase 6: the single provider call.
    const request = buildWriterProviderRequest({ input });
    // An explicitly supplied editorial review is validated against the same
    // freshly read frozen pack, without another provider call or any write.
    const raw = body.writer_output ?? await base44.integrations.Core.InvokeLLM({
      prompt: request.prompt,
      response_json_schema: request.response_json_schema,
    });

    const validation = validateWriterOutput({ input, output: raw });
    if (body.writer_output != null) {
      return Response.json({
        dry_run: true, persisted: false, editorial_review: true,
        prompt_version: WRITER_PROMPT_VERSION,
        pack_fingerprint: pack.pack_fingerprint, input_fingerprint: input.input_fingerprint,
        design_interpretation: input.design_interpretation,
        editorial_brief: input.editorial_brief,
        writer_output: raw, validation,
      });
    }

    const options = (pack.options || []).map((option) => ({
      version_id: option.version_id,
      version_name: option.version_name,
      strength_stories: option.strength_stories || [],
      omitted_stories: option.omitted_stories || [],
    }));

    return Response.json({
      dry_run: true,
      persisted: false,
      editorial_review: body.writer_output != null,
      prompt_version: WRITER_PROMPT_VERSION,
      pack_schema_version: pack.schema_version,
      pack_fingerprint: pack.pack_fingerprint,
      input_fingerprint: input.input_fingerprint,
      mode: pack.mode,
      project_id: projectId,
      version_id: versionId,
      project_name: project.name || null,
      version_name: version.version_name || null,
      story_claim_ids: (pack.allowed_claims || []).filter((claim) => claim.kind === 'strength_story').map((claim) => claim.claim_id),
      blocked_claim_count: (pack.blocked_claims || []).length,
      options,
      design_interpretation: input.design_interpretation,
      editorial_brief: input.editorial_brief,
      writer_input: input,
      writer_output: validation.output || raw || null,
      validation: {
        valid: validation.valid,
        sections: validation.sections,
        violations: validation.violations,
      },
    });
  } catch (error) {
    return Response.json({ dry_run: true, persisted: false, error: error?.message || 'Writer preview failed; nothing was saved' }, { status: 500 });
  }
}