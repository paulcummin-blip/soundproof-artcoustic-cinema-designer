import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { readProposalReportEvidence } from '../../shared/proposalReportEvidenceReader.js';
import { buildProposalEvidence } from '../../shared/proposalEvidence/proposalEvidenceBuilder.js';
import { buildWriterInput } from '../../shared/proposalWriter/writerInputBuilder.js';
import { assertWriterInputCarriesNoLiveState, findLiveStateKeyPaths } from '../../shared/proposalWriter/writerPromptBuilder.js';

/**
 * TEMPORARY preflight for one controlled live Phase 6 generation.
 *
 * Read-only: it builds exactly what the live writer would be given — the saved
 * report evidence, the frozen evidence pack and the Phase 2 writer input, plus
 * the proof that the input carries no live design state — and then stops. It
 * makes no provider call and writes no record. Master admin only, and deleted
 * as soon as the live test is done.
 */
const REQUIRED = ['P12', 'P13', 'P14', 'P18', 'P19', 'P20'];

function requiredLevels(entry = {}) {
  const index = entry?.evidence?.technical?.parameter_index || {};
  const out = {};
  for (const id of REQUIRED) {
    const row = index[id];
    out[id] = row ? `${row.level ?? '?'} (${row.value ?? '?'})` : 'missing';
  }
  return out;
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Master admin only.' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const proposalId = body.proposal_id;
    if (!proposalId) return Response.json({ error: 'proposal_id required' }, { status: 400 });

    const proposal = await base44.entities.Proposal.get(proposalId);
    if (!proposal?.id) return Response.json({ error: 'Proposal not found' }, { status: 404 });

    const projectId = proposal.project_id;
    const versionIds = Array.isArray(proposal.selected_version_ids) ? proposal.selected_version_ids : [];
    const project = await base44.entities.Project.get(projectId);

    const versionPage = await base44.entities.ProjectVersion.filter(
      { project_id: projectId, id: { $in: versionIds } },
      { limit: 50 },
    );
    const rows = Array.isArray(versionPage) ? versionPage : (versionPage?.items || []);
    const versions = versionIds.map((id) => rows.find((row) => row.id === id));
    if (versions.some((version) => !version)) {
      return Response.json({ error: 'A selected version was not found in this project.' }, { status: 409 });
    }

    const reportLines = [];
    for (const version of versions) {
      const page = await base44.entities.ReportSnapshot.filter(
        { project_id: projectId, version_id: version.id },
        { sort: '-generated_at', limit: 50 },
      );
      const all = Array.isArray(page) ? page : (page?.items || []);
      for (const type of ['visual', 'technical']) {
        const newest = all.filter((row) => row.report_type === type)[0] || null;
        reportLines.push(`${version.version_name} ${type}=${newest?.status ?? 'none'}`);
      }
    }

    const existing = await base44.entities.ProposalGeneration.filter(
      { proposal_id: proposal.id },
      { sort: '-created_at', limit: 50 },
    );
    const existingGenerations = Array.isArray(existing) ? existing : (existing?.items || []);

    let evidence = null;
    let pack = null;
    let writerInput = null;
    try {
      evidence = await readProposalReportEvidence(base44.entities, projectId, versions);
      pack = buildProposalEvidence({ versions: evidence, generatedAt: new Date().toISOString() });
      writerInput = buildWriterInput({ pack });
      assertWriterInputCarriesNoLiveState(writerInput);
    } catch (error) {
      return Response.json({
        ok: false,
        stage: 'evidence_or_pack',
        message: error?.message || 'failed',
        reports: reportLines,
        existing_generation_count: existingGenerations.length,
      });
    }

    const counts = {};
    for (const row of pack.classification) counts[row.classification] = (counts[row.classification] || 0) + 1;
    const changed = pack.classification
      .filter((row) => row.classification !== 'same')
      .map((row) => `${row.area}=${row.classification}`);

    return Response.json({
      ok: true,
      guard: 'passed',
      fingerprint: pack.pack_fingerprint,
      schema: pack.schema_version,
      mode: pack.mode,
      areas: pack.areas.length,
      counts,
      changed,
      framing: `${pack.decision_framing?.allowed} (${pack.decision_framing?.reason})`,
      claims: {
        allowed: pack.allowed_claims.length,
        blocked: pack.blocked_claims.length,
        blocked_reasons: [...new Set(pack.blocked_claims.map((row) => row.reason))],
      },
      materiality_notes: pack.materiality_notes.length,
      bass_blocked: (pack.bass_claims?.blocked || []).length,
      report_sources: pack.evidence_basis.report_snapshot_ids.length,
      sections: (writerInput.section_requirements || []).map((section) => section.section_id),
      input_fingerprint: writerInput.input_fingerprint,
      live_state_paths: findLiveStateKeyPaths(writerInput, undefined, { skipRootKeys: [] }),
      existing_generation_count: existingGenerations.length,
    });
  } catch (error) {
    return Response.json({ error: error?.message || 'Preflight failed' }, { status: 500 });
  }
}