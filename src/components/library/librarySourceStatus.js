/**
 * librarySourceStatus.js
 * ----------------------
 * The Project Library's source vocabulary, and how each row's state is derived.
 *
 * The labels are the product's own words:
 *   Reports      Current · Update needed · Not generated
 *   Issued PDFs  Issued PDF · Issued PDF — older than current design
 *
 * A report row's state is read from the version's proposal-readiness cell — the
 * SAME authority the Library banner and the Proposal Centre use — so a row can
 * never read Current while the banner says that report needs updating.
 *
 * A generated report is permanent: it stays Current while the readiness
 * authority accepts it as a proposal source, and exporting it, opening it or
 * using it in a proposal never changes it.
 *
 * Nothing here rewrites an issued document. A document that has been superseded
 * or whose source has moved on stays exactly as it was stored; only its label
 * changes, and its file is never touched.
 *
 * Derivation only: pure functions, no reads, no writes.
 */

import { compareSourceFingerprints } from '@/components/report/reportSnapshotAuthority';
import { selectCanonicalReportSnapshot } from '@/components/report/reportSnapshotCanonical';
import { READINESS_STATE } from '@/components/proposal/sourceAuthority/proposalReadinessAuthority';

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
  [LIBRARY_SOURCE_STATE.SAME_AS_CURRENT]: 'Issued PDF',
  [LIBRARY_SOURCE_STATE.OLDER_EXPORT]: 'Issued PDF',
});

/** One issued PDF, whether or not it still matches the design. */
export const ISSUED_PDF_LABEL = 'Issued PDF';

/**
 * The wording an issued PDF carries when the design moved on after it was issued
 * — the same source-changed state, stated from the PDF's side. It never implies
 * the PDF itself needs regenerating: the PDF is history, and it is simply older
 * than the design the project now holds.
 */
export const EXPORT_SOURCE_CHANGED_LABEL = 'Issued PDF — older than current design';

/**
 * The one line that older-than-design PDF carries, so the designer reads it as
 * history rather than as something that stands in the way of a proposal.
 */
export const EXPORT_DESIGN_CHANGED_NOTE =
  'This PDF is still available, but it was issued before the latest report update.';

/**
 * The one sentence that separates the Issued PDFs section from the reports above
 * it: proposals read the reports, never these fixed exports.
 */
export const ISSUED_PDFS_HELPER =
  'Issued PDFs are fixed exports from the date shown. They remain available for records; proposals use the current reports above.';

export const LIVE_REPORT_LABEL = 'Current report';
export const EXPORTED_PDF_LABEL = 'Issued PDF';

/**
 * An issued PDF judged inside the Library's Generated Reports states what it IS.
 * It never borrows the report vocabulary, so no export row can ever read
 * "Current" or "Older export" again.
 */
const ISSUED_PDF_STATE_LABEL = Object.freeze({
  [LIBRARY_SOURCE_STATE.CURRENT]: ISSUED_PDF_LABEL,
  [LIBRARY_SOURCE_STATE.SAME_AS_CURRENT]: ISSUED_PDF_LABEL,
  [LIBRARY_SOURCE_STATE.OLDER_EXPORT]: ISSUED_PDF_LABEL,
  [LIBRARY_SOURCE_STATE.SOURCE_CHANGED]: EXPORT_SOURCE_CHANGED_LABEL,
  // A version that no longer resolves says nothing about the issued document:
  // the document exists, so that is what it reads.
  [LIBRARY_SOURCE_STATE.MISSING_SOURCE]: ISSUED_PDF_LABEL,
});

/** Re-state an exported document's own source state as an Issued PDF label. */
function asIssuedPdfState({ state, label }) {
  return { state, label: ISSUED_PDF_STATE_LABEL[state] || label };
}

/**
 * The three states a version's report row can be in, in the dealer's words:
 *   current        ready to use in a proposal
 *   update_needed  a report exists, and the design moved past it or the report
 *                  must be recreated before a proposal may read it
 *   missing        no report has been generated for this version
 *   checking       the readiness read is in flight, so nothing is claimed yet
 */
export const LIVE_REPORT_STATE = Object.freeze({
  CURRENT: 'current',
  UPDATE_NEEDED: 'update_needed',
  MISSING: 'missing',
  CHECKING: 'checking',
});

export const LIVE_REPORT_STATE_LABEL = Object.freeze({
  [LIVE_REPORT_STATE.CURRENT]: 'Current',
  [LIVE_REPORT_STATE.UPDATE_NEEDED]: 'Update needed',
  [LIVE_REPORT_STATE.MISSING]: 'Not generated',
  [LIVE_REPORT_STATE.CHECKING]: null,
});

/** The line a report carries once the design has moved past it. */
export const LIVE_REPORT_DESIGN_CHANGED_NOTE = 'Design changed since this report was created.';

/** The same, for a report that must be recreated before a proposal may read it. */
export const LIVE_REPORT_UPDATE_NEEDED_NOTE = 'This report needs updating before a proposal can use it.';

/**
 * The actions a report row offers. "Create updated report" is the ONE refresh
 * word, and a Current report never carries it.
 */
export const REPORT_ROW_ACTION = Object.freeze({
  OPEN: 'Open',
  OPEN_SAVED: 'Open saved report',
  CREATE_UPDATED: 'Create updated report',
  EXPORT_PDF: 'Export PDF',
  GENERATE: 'Generate report',
});

/**
 * One report row's state, read from the version's proposal-readiness cell — the
 * same authority the Library banner and the Proposal Centre gate generation
 * with. A saved report the readiness authority will not accept as a proposal
 * source never reads Current: it reads Update needed.
 *
 * @param {Object} params
 * @param {Object|null} params.cell   the version's readiness cell for this report type
 * @param {boolean} params.hasReport  a saved report exists for this version and type
 * @returns {string} LIVE_REPORT_STATE
 */
export function resolveLiveReportState({ cell = null, hasReport = false } = {}) {
  if (!cell || cell.checking || cell.state === READINESS_STATE.CHECKING) return LIVE_REPORT_STATE.CHECKING;
  if (!hasReport) return LIVE_REPORT_STATE.MISSING;
  return cell.state === READINESS_STATE.CURRENT
    ? LIVE_REPORT_STATE.CURRENT
    : LIVE_REPORT_STATE.UPDATE_NEEDED;
}

/** The small line a row carries while its report is not ready to use. */
export function liveReportNote({ cell = null, hasReport = false } = {}) {
  if (!hasReport || !cell || cell.checking || cell.state === READINESS_STATE.CURRENT) return null;
  return cell.state === READINESS_STATE.STALE
    ? LIVE_REPORT_DESIGN_CHANGED_NOTE
    : LIVE_REPORT_UPDATE_NEEDED_NOTE;
}

export function liveReportStateLabel(state) {
  return LIVE_REPORT_STATE_LABEL[state] ?? null;
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

/** The current fingerprint held for one version id, from a Map or a plain object. */
function fingerprintFor(byVersion, versionId) {
  if (!byVersion || !versionId) return null;
  if (typeof byVersion.get === 'function') return byVersion.get(versionId) ?? null;
  return byVersion[versionId] ?? null;
}

/**
 * ONE live report per project version and report type — the CANONICAL one.
 *
 * A report is saved against a version and type and overwritten in place when it
 * is regenerated, but an earlier generation that stayed behind as its own record
 * must never produce a second row. Nothing is deleted or modified here — the
 * duplicate records are left exactly as they are.
 *
 * Which row is listed is not the newest generation: it is the row the ONE
 * canonical rule resolves (complete evidence, proposal-ready, frozen against the
 * CURRENT authority, parity, and only then newest), so a stale or incomplete
 * duplicate can never hide the valid Current report here while every other
 * surface shows it.
 *
 * @param {Array<Object>} snapshots saved reports, any order
 * @param {Object} [options]
 * @param {Map|Object|null} [options.currentFingerprintByVersion] each version's
 *   current authority fingerprint, keyed by version id.
 * @returns {Array<Object>} the canonical saved report per version and report type
 */
export function collapseLiveReports(snapshots = [], { currentFingerprintByVersion = null } = {}) {
  const order = [];
  const canonicalByKey = new Map();
  (Array.isArray(snapshots) ? snapshots : []).forEach((snapshot) => {
    const key = liveReportKey(snapshot?.version_id, snapshot?.report_type);
    if (!canonicalByKey.has(key)) order.push(key);
    const candidates = [canonicalByKey.get(key), snapshot].filter(Boolean);
    canonicalByKey.set(key, selectCanonicalReportSnapshot(candidates, {
      currentFingerprint: fingerprintFor(currentFingerprintByVersion, snapshot?.version_id),
    }));
  });
  return order.map((key) => canonicalByKey.get(key));
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
 *   design moved on since it was issued  → "Issued PDF — design changed since export"
 *   newer live report, same source       → "Issued PDF"
 *   matches the live report              → "Issued PDF"
 *   no live report to compare against    → "Issued PDF" (or its own source state)
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

  if (!liveReport) return asIssuedPdfState(resolveExportedSourceState({ record, version }));

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
  return asIssuedPdfState(resolveExportedSourceState({ record, version }));
}