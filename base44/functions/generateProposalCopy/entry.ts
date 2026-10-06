import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { resolveAccountAccess } from '../../shared/accountAccessAuthority.js';
import { readProposalReportEvidence } from '../../shared/proposalReportEvidenceReader.js';
import { generationEntityPayload } from '../../shared/proposalGeneration/proposalGenerationEntity.js';
import {
  WRITER_REFUSAL,
  runProposalCopyGeneration,
  writerRefusalStatus,
} from '../../shared/proposalGeneration/proposalGenerationRunner.js';
import { GPT_WRITER_FLAG_FIELD, resolveGptWriterFlag } from '../../shared/proposalWriter/proposalWriterFlag.js';

/**
 * Generate one controlled GPT proposal copy — Phase 6.
 *
 * This is a SECOND path, never a replacement: the existing proposal generator and
 * the legacy/manual proposal flow are untouched, and nothing here writes to a
 * Proposal, a ProposalSection or a report. The only record it writes is one
 * append-only ProposalGeneration attempt, whether that attempt produced copy, was
 * rejected by the writer contract, or never reached the provider.
 *
 * The feature flag is resolved here, on the server, from SystemConfig, and it is
 * checked before anything else: while it is off no report evidence is read, no
 * pack is built and no provider call is possible. A browser cannot enable it.
 *
 * The writer is given the frozen Phase 1 evidence pack and the Phase 2 contract
 * and nothing else — no live Project, no ProjectVersion, no product catalogue, no
 * report page. The provider is the platform AI gateway, called with the server
 * session: there is no API key in this app, in the browser bundle or in any
 * client payload, and no dealer or user is ever asked to supply one.
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { proposal_id, retry_of_generation_id } = body || {};
    if (!proposal_id) return Response.json({ error: 'proposal_id required' }, { status: 400 });

    const accessContext = await resolveAccountAccess(base44, user);
    if (accessContext?.allowed !== true || accessContext.capabilities?.soundProof !== true) {
      return Response.json({ error: 'Sound Proof access is required to write a proposal copy.' }, { status: 403 });
    }

    // ── The flag, before anything at all is read ──
    const configResult = await base44.asServiceRole.entities.SystemConfig.filter({}, { limit: 1 });
    const configRecord = (Array.isArray(configResult) ? configResult : (configResult?.items || []))[0] || null;
    const flag = resolveGptWriterFlag({
      config: configRecord?.[GPT_WRITER_FLAG_FIELD] || null,
      accountId: accessContext.user?.account_id || accessContext.account?.id || null,
      email: user.email || null,
      isMasterAdmin: accessContext.isMasterAdmin === true,
    });

    if (flag.enabled !== true) {
      return Response.json({
        error: flag.reason === 'not_authorised'
          ? 'The GPT proposal writer is switched on, but it is not enabled for this login.'
          : 'The GPT proposal writer is switched off. No evidence was read and no provider call was made.',
        code: WRITER_REFUSAL.FLAG_OFF,
        writer_enabled: false,
      }, { status: 403 });
    }

    // ── The proposal, and the account it belongs to ──
    const proposal = await base44.entities.Proposal.get(proposal_id).catch(() => null);
    if (!proposal?.id) return Response.json({ error: 'That proposal was not found.' }, { status: 404 });

    const proposalAccountId = proposal.account_id || null;
    const sameAccount = accessContext.isMasterAdmin === true
      || (proposalAccountId && proposalAccountId === (accessContext.user?.account_id || accessContext.account?.id || null));
    if (!sameAccount) {
      return Response.json({ error: 'That proposal belongs to another account.' }, { status: 403 });
    }

    const existingResult = await base44.entities.ProposalGeneration.filter(
      { proposal_id: proposal.id },
      { sort: '-created_at', limit: 100 },
    );
    const existingGenerations = Array.isArray(existingResult) ? existingResult : (existingResult?.items || []);

    const projectId = proposal.project_id || null;
    if (!projectId) return Response.json({ error: 'That proposal is not attached to a project.' }, { status: 409 });

    // ── One attempt ──
    const attempt = await runProposalCopyGeneration({
      proposal,
      projectId,
      accountId: proposalAccountId,
      existingGenerations,
      flag,
      user,
      now: new Date().toISOString(),
      retryOfGenerationId: retry_of_generation_id || null,
      readEvidence: async ({ versionIds }) => {
        const page = await base44.entities.ProjectVersion.filter(
          { project_id: projectId, id: { $in: versionIds } },
          { limit: 50 },
        );
        const rows = Array.isArray(page) ? page : (page?.items || []);
        const versions = versionIds.map((id) => rows.find((row) => row.id === id));
        if (versions.some((version) => !version)) {
          throw new Error('A selected version was not found in this project, so its saved report evidence could not be read.');
        }
        return readProposalReportEvidence(base44.entities, projectId, versions);
      },
      invokeLLM: (request) => base44.integrations.Core.InvokeLLM(request),
    });

    if (!attempt.ok) {
      return Response.json({ error: attempt.message, code: attempt.code }, { status: writerRefusalStatus(attempt.code) });
    }

    // ── The one write: an append-only record of the attempt ──
    const created = await base44.entities.ProposalGeneration.create(
      generationEntityPayload({ record: attempt.record, accountId: proposalAccountId }),
    );

    // The provider, model and contract versions are logged so a live attempt can
    // always be traced to exactly what read and wrote it.
    console.log(
      `[generateProposalCopy] ${attempt.status} proposal=${proposal.id} generation=${attempt.generation_id} `
      + `provider=${attempt.provider || 'none'} model=${attempt.model || 'none'} prompt=${attempt.prompt_version} `
      + `schema=${attempt.schema_version} contract=${attempt.contract_version} retry_of=${attempt.retry_of_generation_id || 'none'} `
      + `by=${user.email || user.id}`,
    );

    return Response.json({
      ok: true,
      generation_id: attempt.generation_id,
      generation_number: attempt.generation_number,
      status: attempt.status,
      valid: attempt.valid,
      retry_of_generation_id: attempt.retry_of_generation_id,
      validation_errors: attempt.validation_errors,
      provider: attempt.provider,
      model: attempt.model,
      prompt_version: attempt.prompt_version,
      schema_version: attempt.schema_version,
      contract_version: attempt.contract_version,
      evidence_pack_fingerprint: attempt.evidence_pack_fingerprint,
      record: created,
    });
  } catch (error) {
    return Response.json({ error: error?.message || 'The proposal copy could not be generated.' }, { status: 500 });
  }
}