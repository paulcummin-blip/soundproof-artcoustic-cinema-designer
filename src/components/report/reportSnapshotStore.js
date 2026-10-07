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
import { resolveEvidenceWrite, selectCanonicalReportSnapshot } from '@/components/report/reportSnapshotCanonical';

// Database object-key order is not evidence content.
function stableEvidence(value) {
  if (Array.isArray(value)) return value.map(stableEvidence);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableEvidence(value[key])]));
  }
  return value;
}

/**
 * Read the saved report for one project version and report type.
 *
 * @param {Object} params
 * @param {string|Object|null} [params.currentFingerprint] the authority this
 *   version holds now. With it, the row frozen against that authority outranks
 *   any newer duplicate that is stale or incomplete.
 */
export async function loadReportSnapshot({ projectId, versionId, reportType, currentFingerprint = null }) {
  if (!projectId || !versionId || !reportType) return null;

  const result = await base44.entities.ReportSnapshot.filter(
    { project_id: projectId, version_id: versionId, report_type: reportType },
    { sort: '-generated_at', limit: 50 },
  );
  // A filter with options returns a page; tolerate a plain array as well.
  const items = Array.isArray(result) ? result : (result?.items || []);
  // The CANONICAL row for this version and report type: complete evidence first,
  // then the row frozen against the CURRENT durable authority, and only then the
  // newest. A newer stale or incomplete duplicate never displaces the valid
  // Current report. Selection never consults the live design, so opening a
  // project or exporting a PDF cannot change which report is the saved report.
  return selectCanonicalReportSnapshot(items, { reportType, currentFingerprint });
}

/**
 * Write the saved report. An existing record for this project version and report
 * type is overwritten (regenerate); otherwise one is created.
 *
 * The write is ATOMIC: the candidate is built and judged before anything is
 * touched, and a candidate that is refused writes NOTHING at all. A refusal can
 * therefore never leave old evidence sitting beside a new report identity,
 * timestamp or fingerprint — the saved snapshot is returned exactly as it stands.
 *
 * @param {Object} params
 * @param {Object|null} [params.existing] the row the caller believes is saved
 * @param {Object} params.record the candidate snapshot
 * @param {string|Object|null} [params.currentFingerprint] the authority this
 *   version holds now, so the write targets the row the version's own reports
 *   resolve to.
 */
export async function saveReportSnapshot({ existing = null, record, currentFingerprint = null }) {
  if (!record) return null;
  // Resolve again at the write boundary: an unloaded/stale page must not
  // create a duplicate or overwrite a different row from readiness's newest.
  const canonical = await loadReportSnapshot({
    projectId: record.project_id,
    versionId: record.version_id,
    reportType: record.report_type,
    currentFingerprint,
  });
  const target = canonical || existing;
  // Upgrade-only. Complete evidence already on the row is never replaced by an
  // incomplete payload, and evidence is never cleared: a save can only improve
  // what the row carries.
  const write = resolveEvidenceWrite({
    existing: target,
    incoming: record.payload?.reportEvidence ?? null,
  });
  // ── ATOMIC REFUSAL ───────────────────────────────────────────────────────
  // The candidate was refused: no database mutation of any kind is performed,
  // so evidence, identity, metadata, generated_at and source fingerprints all
  // stay exactly as they were stored.
  if (target?.id && write.rejected) {
    console.warn(
      '[reportSnapshot] the incoming report was refused; the saved report is left exactly as it stands:',
      write.rejectedReason,
    );
    return target;
  }
  const nextRecord = {
    ...record,
    payload: {
      ...(record.payload || {}),
      reportEvidence: write.evidence,
      evidence_parity: write.preserved
        ? (target?.payload?.evidence_parity ?? record.payload?.evidence_parity ?? null)
        : (record.payload?.evidence_parity ?? null),
    },
  };
  const response = target?.id
    ? await base44.entities.ReportSnapshot.update(target.id, nextRecord)
    : await base44.entities.ReportSnapshot.create(nextRecord);
  const savedId = response?.id || target?.id;
  if (!savedId) throw new Error('The saved report snapshot ID was not returned.');
  // Announce only a database-confirmed save, never a local success object.
  const saved = await base44.entities.ReportSnapshot.get(savedId);
  if (saved?.id !== savedId
    || saved.project_id !== record.project_id
    || saved.version_id !== record.version_id
    || saved.report_type !== record.report_type
    || JSON.stringify(stableEvidence(saved.payload?.reportEvidence ?? null))
      !== JSON.stringify(stableEvidence(nextRecord.payload?.reportEvidence ?? null))) {
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