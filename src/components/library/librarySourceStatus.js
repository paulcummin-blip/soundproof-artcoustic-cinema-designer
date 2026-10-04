/**
 * librarySourceStatus.js
 * ----------------------
 * The Project Library's source vocabulary, and how each row's state is derived.
 *
 * The labels are fixed:
 *   Current · Source changed · Missing source · Superseded by newer export
 *
 * Nothing here rewrites an issued document. A document that has been superseded
 * or whose source has moved on stays exactly as it was stored; only its label
 * changes, and its file is never touched.
 *
 * Derivation only: pure functions, no reads, no writes.
 */

export const LIBRARY_SOURCE_STATE = Object.freeze({
  CURRENT: 'current',
  SOURCE_CHANGED: 'source_changed',
  MISSING_SOURCE: 'missing_source',
  SUPERSEDED: 'superseded',
});

export const LIBRARY_SOURCE_LABEL = Object.freeze({
  [LIBRARY_SOURCE_STATE.CURRENT]: 'Current',
  [LIBRARY_SOURCE_STATE.SOURCE_CHANGED]: 'Source changed',
  [LIBRARY_SOURCE_STATE.MISSING_SOURCE]: 'Missing source',
  [LIBRARY_SOURCE_STATE.SUPERSEDED]: 'Superseded by newer export',
});

export const LIVE_REPORT_LABEL = 'Current live report';
export const EXPORTED_PDF_LABEL = 'Exported PDF';

/** A saved report's own status word, in Library vocabulary. */
export function liveReportStatusLabel(snapshotStatus) {
  return snapshotStatus === 'stale'
    ? LIBRARY_SOURCE_LABEL[LIBRARY_SOURCE_STATE.SOURCE_CHANGED]
    : LIBRARY_SOURCE_LABEL[LIBRARY_SOURCE_STATE.CURRENT];
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