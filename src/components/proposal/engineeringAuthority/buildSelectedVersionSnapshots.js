import { base44 } from '@/api/base44Client';

// Every selected version is read through the server's strict saved-report reader.

/**
 * @param {Object} input
 * @param {string} input.projectId
 * @param {Array<string>} input.versionIds — selected versions, in report order
 * @param {string|null} [input.primaryVersionId] — the already-built version
 * @param {Object|null} [input.primarySnapshot] — its already-built snapshot
 * @returns {Promise<Array<{ version_id, version_name, snapshot, source, error }>>}
 */
export async function buildSelectedVersionSnapshots({
  projectId,
  versionIds = [],
  primaryVersionId = null,
  primarySnapshot = null,
} = {}) {
  const ids = (versionIds || []).filter(Boolean);
  if (!projectId || !ids.length) return [];
  const response = await base44.functions.invoke('readProposalReportEvidence', {
    project_id: projectId, version_ids: ids,
  });
  if (response.data?.error) throw new Error(response.data.error);
  return response.data.snapshots;
}

export default buildSelectedVersionSnapshots;