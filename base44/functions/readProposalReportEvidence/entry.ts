import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { readProposalReportEvidence } from '../../shared/proposalReportEvidenceReader.js';

export default async function(req) {
  try {
    const client = createClientFromRequest(req);
    const user = await client.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { project_id, version_ids } = await req.json();
    if (!project_id || !Array.isArray(version_ids) || !version_ids.length) return Response.json({ error: 'Project and version IDs are required.' }, { status: 400 });
    const page = await client.entities.ProjectVersion.filter({ project_id, id: { $in: version_ids } }, { limit: 50 });
    const versions = version_ids.map((id) => page.items.find((v) => v.id === id));
    if (versions.some((v) => !v)) return Response.json({ error: 'Selected version not found in this project.' }, { status: 404 });
    const snapshots = await readProposalReportEvidence(client.entities, project_id, versions);
    return Response.json({ snapshots });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 409 });
  }
}