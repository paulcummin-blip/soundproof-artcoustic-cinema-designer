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
  if (existing?.id) {
    return base44.entities.ReportSnapshot.update(existing.id, record);
  }
  return base44.entities.ReportSnapshot.create(record);
}