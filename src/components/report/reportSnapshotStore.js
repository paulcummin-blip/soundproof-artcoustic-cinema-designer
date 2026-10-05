/**
 * reportSnapshotStore.js
 * ----------------------
 * Database persistence for saved report snapshots. One saved report per project
 * version and report type: the first generation creates the record, every
 * regeneration overwrites that same record in place.
 *
 * Storage only — no report content is built here, and no status is decided here.
 */

import { base44 } from '@/api/base44Client';
import { notifyReportSourceStored } from '@/components/proposal/sourceAuthority/reportSourceSignal';

/** Read the saved report for one project version and report type. */
export async function loadReportSnapshot({ projectId, versionId, reportType }) {
  if (!projectId || !versionId || !reportType) return null;

  const result = await base44.entities.ReportSnapshot.filter(
    { project_id: projectId, version_id: versionId, report_type: reportType },
    { sort: '-generated_at', limit: 1 },
  );
  // A filter with options returns a page; tolerate a plain array as well.
  const items = Array.isArray(result) ? result : (result?.items || []);
  return items[0] || null;
}

/**
 * Write the saved report. An existing record for this project version and report
 * type is overwritten (regenerate); otherwise one is created.
 */
export async function saveReportSnapshot({ existing = null, record }) {
  if (!record) return null;
  // Resolve again at the write boundary: an unloaded/stale page must not
  // create a duplicate or overwrite a different row from readiness's newest.
  const canonical = await loadReportSnapshot({
    projectId: record.project_id,
    versionId: record.version_id,
    reportType: record.report_type,
  });
  const target = canonical || existing;
  const response = target?.id
    ? await base44.entities.ReportSnapshot.update(target.id, record)
    : await base44.entities.ReportSnapshot.create(record);
  const savedId = response?.id || target?.id;
  if (!savedId) throw new Error('The saved report snapshot ID was not returned.');
  // Announce only a database-confirmed save, never a local success object.
  const saved = await base44.entities.ReportSnapshot.get(savedId);
  if (saved?.id !== savedId
    || saved.project_id !== record.project_id
    || saved.version_id !== record.version_id
    || saved.report_type !== record.report_type
    || JSON.stringify(saved.payload?.reportEvidence ?? null)
      !== JSON.stringify(record.payload?.reportEvidence ?? null)) {
    throw new Error('Report evidence persistence could not be verified.');
  }
  // One in-session announcement, so the proposal readiness read (which judges
  // each version by its saved reports) knows a report has landed and reads again
  // instead of reporting the version from before the report existed.
  notifyReportSourceStored({
    projectId: saved?.project_id || record.project_id || null,
    versionId: saved?.version_id || record.version_id || null,
  });
  return saved;
}