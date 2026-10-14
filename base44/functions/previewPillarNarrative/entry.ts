import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { readProposalReportEvidence } from '../../shared/proposalReportEvidenceReader.js';
import { buildProposalEvidence } from '../../shared/proposalEvidence/proposalEvidenceBuilder.js';
import { buildProposalNarrativeContext } from '../../shared/proposalNarrativeContext.js';
import { buildWriterInput } from '../../shared/proposalWriter/writerInputBuilder.js';

/**
 * previewPillarNarrative
 * ----------------------
 * DESIGNER-FACING DIAGNOSTIC, READ ONLY. It reads one project version's saved
 * report evidence and returns what the narrative pipeline actually assembled from
 * it: the three pillar stories with the results beneath them, the parts of the bass
 * story, the seating design rationale and the scoped seat claims.
 *
 * It exists so the narrative can be inspected against real projects — what reaches
 * the writer, at which emphasis, at which scope — without generating a proposal.
 * It writes nothing, changes no stored record and makes no provider call, and it
 * adds no rule: every value returned is built by the same shared authorities the
 * generation path uses.
 *
 * POST { project_id, version_ids[], proposal_id?, client_brief?, narrative_steer? }
 */
export default async function (req) {
  try {
    const client = createClientFromRequest(req);
    const user = await client.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const projectId = body?.project_id || null;
    const versionIds = Array.isArray(body?.version_ids)
      ? body.version_ids.filter((id: string) => typeof id === 'string' && id.length > 0)
      : [];
    if (!projectId || versionIds.length === 0) {
      return Response.json({ error: 'A project and at least one version are required.' }, { status: 400 });
    }

    const page = await client.entities.ProjectVersion.filter(
      { project_id: projectId, id: { $in: versionIds } },
      { limit: 10 },
    );
    const versions = versionIds.map((id: string) => (page.items || []).find((v: any) => v.id === id));
    if (versions.some((v: any) => !v)) {
      return Response.json({ error: 'Selected version not found in this project.' }, { status: 404 });
    }

    const snapshots = await readProposalReportEvidence(client.entities, projectId, versions, {
      authorityEntities: client.asServiceRole.entities,
    });

    // The proposal the narrative is written FOR, where one exists: its brief, its
    // steer and the ADI interpretation Stage 1 produced. The caller may override the
    // brief and the steer to inspect the same evidence under a different context.
    let proposal: any = null;
    if (body?.proposal_id) {
      try {
        proposal = await client.entities.Proposal.get(body.proposal_id);
      } catch (error) {
        proposal = null;
      }
    }
    const clientBrief = body?.client_brief ?? proposal?.client_brief ?? '';
    const narrativeSteer = body?.narrative_steer !== undefined
      ? body.narrative_steer
      : (proposal?.metadata?.narrative_steer ?? null);
    const interpretation = body?.interpretation ?? proposal?.metadata?.project_interpretation ?? null;

    const proposalForContext = {
      client_brief: clientBrief,
      narrative_brief: body?.narrative_brief ?? proposal?.narrative_brief ?? null,
      metadata: { narrative_steer: narrativeSteer },
    };

    const pack = buildProposalEvidence({
      versions: snapshots,
      requestContext: { clientBrief, narrativeBrief: proposalForContext.narrative_brief },
      narrativeContext: buildProposalNarrativeContext({
        proposal: proposalForContext,
        interpretation,
      }),
    });
    const writerInput = buildWriterInput({ pack, narrativeSteer });

    const options = pack.options.map((option: any) => ({
      version_id: option.version_id,
      label: option.label,
      intent: option.narrative_context?.intent ?? null,
      intent_basis: option.narrative_context?.intent_basis ?? null,
      brief_reasons: option.narrative_context?.brief_reasons ?? null,
      room_type: option.narrative_context?.room_type ?? null,
      suppressed_areas: option.narrative_context?.suppressed_areas || [],
      excluded_topics: option.narrative_context?.excluded_topics || [],
      brief_relevance: option.narrative_context?.brief_relevance || null,
      pillars: (option.client_story_pillars || []).map((pillar: any) => ({
        pillar: pillar.pillar,
        label: pillar.label,
        role: pillar.role,
        role_label: pillar.role_label,
        rank: pillar.rank,
        emphasis_note: pillar.emphasis_note,
        brief_relevance: pillar.brief_relevance,
        seat_scope: pillar.seat_scope,
        scope_wording: pillar.scope_wording,
        banned_scope_wording: pillar.banned_scope_wording,
        infrasonic: pillar.infrasonic,
        evidence_text: pillar.evidence_text,
        members: (pillar.members || []).map((member: any) => ({
          key: member.key,
          level: member.level,
          value: member.value,
          emphasis: member.emphasis,
          priority: member.priority,
          brief_relevance: member.brief_relevance,
          seat_scope: member.seat_scope,
          primary_seat_result: member.primary_seat_result,
          secondary_seat_result: member.secondary_seat_result,
        })),
        parts: (pillar.parts || []).map((part: any) => ({
          part: part.part,
          parameter_ids: part.parameter_ids,
          level: part.level,
          emphasis: part.emphasis,
          available: part.available,
          told: part.told,
          clause: part.clause,
        })),
        client_clauses: pillar.client_clauses || [],
        claim_ids: pillar.claim_ids || [],
      })),
      design_rationale: option.design_rationale || null,
      writer_design_rationale: (writerInput.evidence?.options || [])
        .find((o: any) => o.version_id === option.version_id)?.design_rationale ?? null,
      writer_pillar_count: ((writerInput.evidence?.options || [])
        .find((o: any) => o.version_id === option.version_id)?.client_story_pillars || []).length,
    }));

    return Response.json({
      mode: pack.mode,
      options,
      scoped_claims: (pack.allowed_claims || [])
        .filter((claim: any) => claim.kind === 'scoped_result')
        .map((claim: any) => ({
          claim_id: claim.claim_id,
          area: claim.area,
          scope: claim.scope,
          seat_count: claim.seat_count,
          level: claim.level,
          wording: claim.wording,
          statement: claim.statement,
          version_id: claim.option?.version_id ?? null,
        })),
      bass: {
        note: pack.bass_claims?.note ?? null,
        blocked_count: (pack.bass_claims?.blocked || []).length,
        parts: (pack.bass_claims?.parts || []).map((part: any) => ({
          part: part.part,
          level: part.level,
          available: part.available,
        })),
      },
      evidence_fingerprint: pack.evidence?.fingerprint ?? null,
    });
  } catch (error) {
    return Response.json({ error: error?.message || 'The narrative preview failed.' }, { status: 409 });
  }
}