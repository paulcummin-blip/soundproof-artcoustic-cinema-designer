/** Read the immutable contract named by the report's publication, not current_fingerprint. */
export default function frozenReportBass(rows, publication) {
  const fingerprint = publication?.provenance?.bass_fingerprint;
  const contract = (rows || []).map(row => row.completed_by_fingerprint?.[fingerprint]).find(Boolean) || null;
  return { contract, authoritative: !!contract, hydrationSettled: true,
    projectId: `${publication?.report_snapshot?.report_project?.project_id}::${publication?.report_snapshot?.report_project?.version_id}`,
    currentFingerprint: fingerprint, authorityStatus: contract ? 'CURRENT' : 'ERROR' };
}