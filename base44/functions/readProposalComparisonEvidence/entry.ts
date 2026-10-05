import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { buildSelectedVersionEvidence } from '../../shared/comparisonEvidence.js';
import { buildComparisonTable } from '../../shared/comparisonTable.js';
import { isCompleteComparisonTable } from '../../shared/comparisonPersistence.js';

// Read-only recovery for comparison records whose undeclared metadata was lost.
// Uses historical frozen proposal evidence only, never live design state.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    if (!await base44.auth.me()) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { proposal_id } = await req.json();
    const proposal = await base44.entities.Proposal.get(proposal_id);
    if (proposal?.proposal_type !== 'comparison') return Response.json({ error: 'Comparison required' }, { status: 400 });
    const ids = proposal.selected_version_ids || [];
    if (ids.length < 2 || new Set(ids).size !== ids.length) return Response.json({ error: 'Distinct selected versions required' }, { status: 409 });
    const storedEvidence = proposal.metadata?.selected_versions || [];
    if (storedEvidence.length === ids.length && storedEvidence.every((v, i) => v.available && v.version_id === ids[i])) {
      const table = isCompleteComparisonTable(proposal.metadata?.comparison_table, ids)
        ? proposal.metadata.comparison_table : buildComparisonTable(storedEvidence);
      if (isCompleteComparisonTable(table, ids)) return Response.json({ evidence: storedEvidence, table, sources: [] });
    }
    const entries = await Promise.all(ids.map(async (id) => {
      if (proposal.engineering_snapshot?.identity?.versionId === id) return { version_id: id, version_name: proposal.engineering_snapshot.version?.name, snapshot: proposal.engineering_snapshot, source_id: proposal.id };
      const page = await base44.entities.Proposal.filter({ project_id: proposal.project_id, account_id: proposal.account_id, version_id: id, proposal_type: 'system_summary', created_date: { $lte: proposal.created_date } }, { sort: '-created_date', limit: 1 });
      const source = page.items?.[0];
      return { version_id: id, version_name: source?.engineering_snapshot?.version?.name, snapshot: source?.engineering_snapshot, source_id: source?.id || null };
    }));
    const evidence = buildSelectedVersionEvidence(entries);
    const table = buildComparisonTable(evidence);
    if (!evidence.every((version) => version.available) || !isCompleteComparisonTable(table, ids)) return Response.json({ error: 'Comparison evidence could not be built for both selected versions. Regenerate the Visual and Technical Reports for each version, then try again.', sources: entries.map(({ snapshot, ...source }) => source) }, { status: 409 });
    return Response.json({ evidence, table, sources: entries.map(({ snapshot, ...source }) => source) });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}