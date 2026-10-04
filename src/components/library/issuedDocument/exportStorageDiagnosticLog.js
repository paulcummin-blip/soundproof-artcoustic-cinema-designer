/**
 * exportStorageDiagnosticLog.js
 * -----------------------------
 * Where a failed export-storage attempt is written down.
 *
 * One structured record per failure — which step failed, what it said, which
 * project/version/report it belonged to, where the file went — so a failure can
 * be diagnosed after the fact instead of reproduced.
 *
 * The log never holds file contents: a record is identifiers, a reason and a
 * timestamp. It is in-session only (a refresh starts a fresh log), and the most
 * recent records are mirrored on
 * `window.__SOUNDPROOF_EXPORT_STORAGE_LOG__` so "Check the export log" means
 * something to whoever is looking.
 */

const MAX_RECORDS = 20;
const records = [];

/**
 * Write one diagnostic record. Never throws: a diagnostic that broke the export
 * path would be worse than the failure it describes.
 */
export function writeExportStorageDiagnostic(record) {
  if (!record || typeof record !== 'object') return null;
  try {
    records.unshift(record);
    if (records.length > MAX_RECORDS) records.length = MAX_RECORDS;
    console.error(
      `[ExportStorage] ${record.stage_label || 'Storage'} failed — ${record.reason || 'unknown reason'}`,
      record,
    );
    if (typeof window !== 'undefined') {
      window.__SOUNDPROOF_EXPORT_STORAGE_LOG__ = records;
    }
  } catch {
    // Nothing about logging may fail the export.
  }
  return record;
}

/** The most recent failed storage attempts, newest first. */
export function readExportStorageDiagnostics() {
  return records.slice();
}

export function clearExportStorageDiagnostics() {
  records.length = 0;
  if (typeof window !== 'undefined') window.__SOUNDPROOF_EXPORT_STORAGE_LOG__ = records;
}

export default writeExportStorageDiagnostic;