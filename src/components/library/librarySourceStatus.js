/**
 * librarySourceStatus.js
 * ----------------------
 * The Project Library's source vocabulary, and how each row's state is derived.
 *
 * The labels are fixed:
 *   Live reports     Current · Source changed · Missing source
 *   Exported PDFs    Same as current · Older export · Source changed since export ·
 *                    Superseded by newer export
 *
 * Nothing here rewrites an issued document. A document that has been superseded
 * or whose source has moved on stays exactly as it was stored; only its label
 * changes, and its file is never touched.
 *
 * Derivation only: pure functions, no reads, no writes.
 */

import { compareSourceFingerprints } from '@/components/report/reportSnapshotAuthority';

export const LIBRARY_SOURCE_STATE = Object.freeze({
  CURRENT: 'current',
  SOURCE_CHANGED: 'source_changed',
  MISSING_SOURCE: 'missing_source',
  SUPERSEDED: 'superseded',
  /** An exported report that still matches the latest live report of its type. */
  SAME_AS_CURRENT: 'same_as_current',
  /** An exported report older than the latest live report of its type. */
  OLDER_EXPORT: 'older_export',
});

export const LIBRARY_SOURCE_LABEL = Object.freeze({
  [LIBRARY_SOURCE_STATE.CURRENT]: 'Current',
  [LIBRARY_SOURCE_STATE.SOURCE_CHANGED]: 'Source changed',
  [LIBRARY_SOURCE_STATE.MISSING_SOURCE]: 'Missing source',
  [LIBRARY_SOURCE_STATE.SUPERSEDED]: 'Superseded by newer export',
  [LIBRARY_SOURCE_STATE.SAME_AS_CURRENT]: 'Same as current',
  [LIBRARY_SOURCE_STATE.OLDER_EXPORT]: 'Older export',
});

/**
 * The wording an exported report carries when the design moved on after it was
 * exported — the same source-changed state, stated from the export's side.
 */
export const EXPORT_SOURCE_CHANGED_LABEL = 'Source changed since export';

export const LIVE_REPORT_LABEL = 'Current live report';
export const EXPORTED_PDF_LABEL = 'Exported PDF';

/** A saved report's own status word, in Library vocabulary. */
export function liveReportStatusLabel(snapshotStatus) {
  return snapshotStatus === 'stale'
    ? LIBRARY_SOURCE_LABEL[LIBRARY_SOURCE_STATE.SOURCE_CHANGED]
    : LIBRARY_SOURCE_LABEL[LIBRARY_SOURCE_STATE.CURRENT];
}

/**
 * The three states a version's report row can be in, as the Library states them:
 * the report exists and matches the version, it exists but the design has moved
 * on, or it has not been generated for this version at all.
 */
export const LIVE_REPORT_STATE = Object.freeze({
  CURRENT: 'current',
  STALE: 'stale',
  MISSING: 'missing',
});

export const LIVE_REPORT_STATE_LABEL = Object.freeze({
  [LIVE_REPORT_STATE.CURRENT]: 'Current',
  [LIVE_REPORT_STATE.STALE]: 'Stale',
  [LIVE_REPORT_STATE.MISSING]: 'Missing',
});

/** The state of one report row: no saved report is "Missing", never "Current". */
export function resolveLiveReportState(snapshot) {
  if (!snapshot) return LIVE_REPORT_STATE.MISSING;
  return snapshot.status === 'stale' ? LIVE_REPORT_STATE.STALE : LIVE_REPORT_STATE.CURRENT;
}

export function liveReportStateLabel(state) {
  return LIVE_REPORT_STATE_LABEL[state] || LIVE_REPORT_STATE_LABEL[LIVE_REPORT_STATE.CURRENT];
}

/** The version ids a document covers, oldest field first. */
export function documentVersionIds(record) {
  if (!record) return [];
  const selected = Array.isArray(record.selected_version_ids) ? record.selected_version_ids : [];
  if (selected.length > 0) return selected.filter(Boolean);
  return record.version_id ? [record.version_id] : [];
}

/** The key two issued documents must share to supersede one another. */
export function supersessionKey(record) {
  const versions = documentVersionIds(record).slice().sort().join('+');
  return `${record?.document_type || ''}::${versions}::${record?.source_record_id || ''}`;
}

/**
 * Mark supersession across a set of issued documents. The newest export of each
 * document type, version set and source is the current one; every earlier export
 * is superseded by newer export and stays available.
 *
 * @returns {Array<{record: Object, superseded: boolean}>}
 */
export function markSuperseded(records = []) {
  const newestByKey = new Map();
  (Array.isArray(records) ? records : []).forEach((record) => {
    const key = supersessionKey(record);
    const current = newestByKey.get(key);
    if (!current || String(record.exported_at || '') > String(current.exported_at || '')) {
      newestByKey.set(key, record);
    }
  });

  return (Array.isArray(records) ? records : []).map((record) => ({
    record,
    superseded: newestByKey.get(supersessionKey(record))?.id !== record.id,
  }));
}

/* ── Latest export per version and report type ─────────────────────────────── */

/**
 * The key two exports must share to be the same version-and-type slot:
 * the document type plus the version (or version set) it covers. Unlike
 * supersession this ignores the source record, because the Library keeps ONE
 * exported PDF per version and report type however often the report behind it
 * was regenerated.
 */
export function latestExportKey(record) {
  const versions = documentVersionIds(record).slice().sort().join('+');
  return `${record?.document_type || ''}::${versions}`;
}

/**
 * The Latest exported PDFs: the newest export of each project version and
 * document type, and nothing older.
 *
 * The Library's default view is the current state of each version, not the
 * export history: an export that has been replaced by a newer one of the same
 * version and type is left in storage, untouched, and is simply not listed.
 * Reports are regenerated and re-exported quickly, so the older copies carry no
 * value a designer needs to read day to day.
 *
 * @param {Array<{record: Object}|Object>} entries issued documents, in any order
 * @returns {Array} the newest entry per version and document type, in input order
 */
export function selectLatestExports(entries = []) {
  const list = Array.isArray(entries) ? entries : [];
  const newestByKey = new Map();

  list.forEach((entry) => {
    const record = entry?.record || entry;
    const key = latestExportKey(record);
    const current = newestByKey.get(key);
    if (!current || String(record?.exported_at || '') > String(current.exported_at || '')) {
      newestByKey.set(key, record);
    }
  });

  return list.filter((entry) => {
    const record = entry?.record || entry;
    return newestByKey.get(latestExportKey(record))?.id === record.id;
  });
}

/**
 * The source state of an issued document against the project as it stands now.
 *
 * @param {Object} params
 * @param {Object} params.record  the issued document
 * @param {Object|null} params.version  the ProjectVersion it was issued for
 */
export function resolveExportedSourceState({ record, version = null } = {}) {
  if (!record) return { state: LIBRARY_SOURCE_STATE.MISSING_SOURCE, label: LIBRARY_SOURCE_LABEL.missing_source };

  if (!version && documentVersionIds(record).length > 0) {
    return { state: LIBRARY_SOURCE_STATE.MISSING_SOURCE, label: LIBRARY_SOURCE_LABEL.missing_source };
  }

  const pointer = String(version?.published_fingerprint || '').trim();
  const issued = String(record.source_fingerprints?.engineeringFingerprint || '').trim();

  // A version with no current published engineering result has moved on, and an
  // issued document that cannot be compared keeps the state it was issued under.
  if (!pointer) {
    return { state: LIBRARY_SOURCE_STATE.SOURCE_CHANGED, label: LIBRARY_SOURCE_LABEL.source_changed };
  }
  if (!issued) {
    const issuedState = record.source_status_at_export;
    return issuedState && issuedState !== 'current'
      ? { state: issuedState, label: LIBRARY_SOURCE_LABEL[issuedState] || LIBRARY_SOURCE_LABEL.source_changed }
      : { state: LIBRARY_SOURCE_STATE.CURRENT, label: LIBRARY_SOURCE_LABEL.current };
  }
  if (issued !== pointer) {
    return { state: LIBRARY_SOURCE_STATE.SOURCE_CHANGED, label: LIBRARY_SOURCE_LABEL.source_changed };
  }
  return { state: LIBRARY_SOURCE_STATE.CURRENT, label: LIBRARY_SOURCE_LABEL.current };
}

/** The label one issued document carries: supersession first, then source state. */
export function exportedDocumentStatus({ record, version = null, superseded = false } = {}) {
  if (superseded) return LIBRARY_SOURCE_LABEL[LIBRARY_SOURCE_STATE.SUPERSEDED];
  return resolveExportedSourceState({ record, version }).label;
}

/* ── Current live report rows ─────────────────────────────────────────────── */

/** The key a live report and the exports of the same version and type share. */
export function liveReportKey(versionId, reportType) {
  return `${versionId || ''}::${reportType || ''}`;
}

/** A row's own date, whichever field states it. */
function timestampOf(row) {
  return String(row?.generated_at || row?.generatedAt || row?.updated_date || row?.created_date || '');
}

/**
 * ONE live report per project version and report type: the newest generated.
 *
 * A report is saved against a version and type and overwritten in place when it
 * is regenerated, but an earlier generation that stayed behind as its own record
 * must never produce a second row. Nothing is deleted or modified here — the
 * duplicate records are left exactly as they are and only the newest one is
 * listed.
 *
 * @param {Array<Object>} snapshots saved reports, any order
 * @returns {Array<Object>} the newest saved report per version and report type
 */
export function collapseLiveReports(snapshots = []) {
  const newestByKey = new Map();
  (Array.isArray(snapshots) ? snapshots : []).forEach((snapshot) => {
    const key = liveReportKey(snapshot?.version_id, snapshot?.report_type);
    const current = newestByKey.get(key);
    if (!current || timestampOf(snapshot) > timestampOf(current)) {
      newestByKey.set(key, snapshot);
    }
  });
  return Array.from(newestByKey.values());
}

/* ── Exported report PDF rows ─────────────────────────────────────────────── */

/**
 * What one exported report PDF is, judged against the current live report of the
 * SAME project version and report type.
 *
 * The comparison never crosses a version or a report type: a Technical Report
 * export is never judged against a Visual Report live report, and a Level 4
 * version export is never judged against a Level 1 version live report.
 *
 *   newer live report, design moved on   → "Source changed since export"
 *   newer live report, same source       → "Older export"
 *   matches the live report              → "Same as current"
 *   no live report to compare against    → the export's own source state
 *
 * @returns {{state: string, label: string}}
 */
export function resolveExportLiveState({ record, version = null, liveReport = null, superseded = false } = {}) {
  if (superseded) {
    return {
      state: LIBRARY_SOURCE_STATE.SUPERSEDED,
      label: LIBRARY_SOURCE_LABEL[LIBRARY_SOURCE_STATE.SUPERSEDED],
    };
  }

  if (!liveReport) return resolveExportedSourceState({ record, version });

  const liveIsNewer = timestampOf(liveReport) > String(record?.exported_at || '');
  const { changed, compared } = compareSourceFingerprints(
    liveReport.sourceFingerprints,
    record?.source_fingerprints,
  );

  if (liveIsNewer && changed.length > 0) {
    return { state: LIBRARY_SOURCE_STATE.SOURCE_CHANGED, label: EXPORT_SOURCE_CHANGED_LABEL };
  }
  if (liveIsNewer) {
    return {
      state: LIBRARY_SOURCE_STATE.OLDER_EXPORT,
      label: LIBRARY_SOURCE_LABEL[LIBRARY_SOURCE_STATE.OLDER_EXPORT],
    };
  }
  if (compared.length > 0 && changed.length === 0) {
    return {
      state: LIBRARY_SOURCE_STATE.SAME_AS_CURRENT,
      label: LIBRARY_SOURCE_LABEL[LIBRARY_SOURCE_STATE.SAME_AS_CURRENT],
    };
  }
  return resolveExportedSourceState({ record, version });
}