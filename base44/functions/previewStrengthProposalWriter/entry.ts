import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { readProposalReportEvidence } from '../../shared/proposalReportEvidenceReader.js';
import { buildProposalEvidence } from '../../shared/proposalEvidence/proposalEvidenceBuilder.js';
import { buildWriterInput } from '../../shared/proposalWriter/writerInputBuilder.js';
import { assertWriterInputCarriesNoLiveState } from '../../shared/proposalWriter/writerPromptBuilder.js';
import { validateWriterOutput } from '../../shared/proposalWriter/writerOutputValidator.js';
import { buildWriterDesignContext } from '../../shared/proposalWriter/writerDesignContext.js';
import { buildProjectInterpretation } from '../../shared/adiProjectInterpretation.js';
import { buildClientBriefCoverage } from '../../shared/proposalWriter/writerClientBriefCoverage.js';
import { WRITER_PROMPT_VERSION } from '../../shared/proposalWriter/writerContractSchema.js';
import {
  SUPPORTED_WRITER_MODELS,
  buildModelAudit,
  resolveComparisonModel,
  runWriterModelPreview,
} from '../../shared/proposalWriter/writerComparisonPreview.js';

// READ-ONLY dry run of the strength-led proposal writer. It reads ONE version's
// canonical Project Report evidence, builds the frozen evidence pack and the
// writer input from it, calls the writer once, and returns the input, the output
// and the validation. It writes NOTHING: no proposal, no section, no library
// entry, no report or export status.
//
// The writer may be called with an EXPLICITLY selected model — gpt_6_astra (the
// production model) or gpt_5_mini (the lighter gateway model). The
// identifier is validated against the supported set before anything is sent, so
// two reviews can be run over ONE identical frozen input with the model as the
// only variable, and an unsupported identifier is refused rather than silently
// replaced. This selection exists for this read-only test tool alone: the normal
// Create Proposal workflow resolves its own model from the writer flag and is
// unchanged by anything here.
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

    // Phase 1: the frozen evidence pack, carrying the ranked strength stories —
    // and the supporting results the designer's brief asked for. The brief is
    // passed exactly as the live generation path passes it, so a read-only review
    // is given the same pack a real generation is given.
    const pack = buildProposalEvidence({
      versions: suppliedSnapshots,
      requestContext: {
        clientBrief: [proposal?.client_brief, proposal?.narrative_brief].filter(Boolean).join('\n'),
        dealerNotes: proposal?.metadata?.dealer_notes || '',
      },
    });

    // Phase 2: the one versioned writer input the writer is given — the frozen pack,
    // the verified design interpretation and the designer's brief. The context is
    // resolved by the SAME authority the live generation path uses, so a review here
    // and a real generation can never be given different guidance.
    // The interpretation is normally the one the proposal already carries, read
    // exactly as a live generation reads it. With interpretation_mode
    // 'derive_from_frozen_evidence' the SAME Stage 1 authority builds it here, in
    // memory, from this version's frozen Project Report evidence, so the review
    // shows the interpretation and its design philosophy that a NEW proposal would
    // receive. Nothing is written either way, and no proposal is created.
    const deriveInterpretation = body.interpretation_mode === 'derive_from_frozen_evidence';
    const derivedInterpretation = deriveInterpretation
      ? buildProjectInterpretation({
        snapshot: suppliedSnapshots[0]?.snapshot || null,
        project,
        clientBrief: [proposal?.client_brief, proposal?.narrative_brief].filter(Boolean).join('\n') || null,
        reportType: 'single',
        versions: [{ id: versionId, label: suppliedSnapshots[0]?.version_name || version.version_name || null }],
        reportLabel: suppliedSnapshots[0]?.version_name || version.version_name || null,
      })
      : null;

    const input = buildWriterInput({
      pack,
      designContext: buildWriterDesignContext({
        proposal, projectId, versionIds: [versionId], pack, dealerNotes,
        savedInterpretation: derivedInterpretation,
      }),
    });
    assertWriterInputCarriesNoLiveState(input);

    // Phase 6: the single provider call, with the model selected EXPLICITLY.
    // The identifier is resolved against the supported set before anything is
    // sent: an identifier this writer does not support is refused here, and no
    // other model is ever silently substituted for it.
    const modelSelection = resolveComparisonModel(body.model ?? null);
    if (!modelSelection.ok) {
      return Response.json({
        dry_run: true,
        persisted: false,
        code: 'unsupported_model',
        error: modelSelection.reason,
        requested_model: modelSelection.requested,
        supported_models: [...SUPPORTED_WRITER_MODELS],
      }, { status: 400 });
    }

    // An explicitly supplied editorial review is validated against the same
    // freshly read frozen pack, without another provider call or any write.
    // Otherwise one provider call is made with the selected model, and the draft
    // it returns stays in memory: nothing here is persisted.
    const suppliedOutput = body.writer_output ?? null;
    const preview = suppliedOutput == null
      ? await runWriterModelPreview({
        input,
        pack,
        requestedModel: body.model ?? null,
        invokeLLM: (request) => base44.integrations.Core.InvokeLLM(request),
      })
      : null;

    if (preview && preview.provider_error) {
      return Response.json({
        dry_run: true,
        persisted: false,
        code: preview.code,
        error: preview.message,
        prompt_version: WRITER_PROMPT_VERSION,
        pack_fingerprint: pack.pack_fingerprint,
        input_fingerprint: input.input_fingerprint,
        model_audit: preview.model_audit,
      }, { status: 502 });
    }

    const raw = suppliedOutput ?? preview?.output ?? null;
    const validation = raw == null ? null : validateWriterOutput({ input, output: raw });
    if (body.writer_output != null) {
      return Response.json({
        dry_run: true, persisted: false, editorial_review: true,
        prompt_version: WRITER_PROMPT_VERSION,
        pack_fingerprint: pack.pack_fingerprint, input_fingerprint: input.input_fingerprint,
        design_interpretation: input.design_interpretation,
        editorial_brief: input.editorial_brief,
        // What the draft did with the designer's own brief, item by item.
        client_brief_coverage: buildClientBriefCoverage({
          brief: input.editorial_brief,
          pack,
          sections: validation?.output?.sections || raw?.sections || [],
        }),
        // Which model wrote this review, and the fingerprint it was written from.
        model_audit: buildModelAudit({
          input, pack, selection: modelSelection, providerCalled: false, durationMs: null,
        }),
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
      // 'saved' = the interpretation the proposal carries; 'derive_from_frozen_evidence'
      // = built here from this version's frozen evidence, with the complete Stage 1
      // output returned alongside the writer's own view of it.
      interpretation_mode: deriveInterpretation ? 'derive_from_frozen_evidence' : 'saved',
      derived_interpretation: derivedInterpretation,
      design_interpretation: input.design_interpretation,
      editorial_brief: input.editorial_brief,
      // What the brief asked for and what the draft did with it, item by item.
      client_brief_coverage: preview?.client_brief_coverage ?? buildClientBriefCoverage({
        brief: input.editorial_brief,
        pack,
        sections: validation?.output?.sections || null,
      }),
      writer_input: input,
      writer_output: preview?.output ?? raw ?? null,
      // Which model wrote this draft, the identifier the request carried, the
      // fingerprint it was written from and how long the call took. The gateway
      // returns the draft rather than a model receipt, so no actual-model claim
      // and no token or credit figure is invented here.
      model_audit: preview.model_audit,
      validation: validation ? {
        valid: validation.valid,
        sections: validation.sections,
        violations: validation.violations,
      } : null,
    });
  } catch (error) {
    return Response.json({ dry_run: true, persisted: false, error: error?.message || 'Writer preview failed; nothing was saved' }, { status: 500 });
  }
}