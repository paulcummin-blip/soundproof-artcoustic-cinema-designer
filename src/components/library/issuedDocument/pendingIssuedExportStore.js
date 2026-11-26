/**
 * pendingIssuedExportStore.js
 * ---------------------------
 * The captured PDF of one export attempt, held so a failed Library storage can
 * be retried against that exact file.
 *
 * Why it exists: storage happens after the download, in the background. When it
 * fails the designer must be able to retry storing the PDF they already have —
 * without exporting again, and without a second download. That is only possible
 * while the captured blob is still in memory, so the attempt is held here under
 * a key built from the project, the document type and the filename.
 *
 * Held state, deliberately:
 *   - PDF bytes stay in memory; bounded recovery metadata survives a tab reload
 *   - the identity is the export's own (project, version, selected versions,
 *     source context) and is never re-resolved on retry, so a retry can never
 *     drift onto another version
 *   - bounded to the few most recent attempts, so a long session cannot collect
 *     PDFs in memory
 */

const MAX_HELD_ATTEMPTS = 5;

const held = new Map();
const RECOVERY_KEY = 'soundproof.pending-issued-export.v1';
const metadataKeys = ['key', 'identity', 'issued', 'filename', 'pageCount', 'attemptStartedAt',
  'fileUri', 'previewStatus', 'rendering', 'uploadStarted', 'recordStarted', 'uploadSha256', 'uploadSize'];
function persistRecovery() {
  try {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(RECOVERY_KEY, JSON.stringify([...held.values()].map(entry =>
      Object.fromEntries(metadataKeys.map(key => [key, entry[key]]))
    )));
  } catch { /* The in-session recovery remains available when storage is unavailable. */ }
}
try {
  if (typeof window !== 'undefined') {
    const records = JSON.parse(window.sessionStorage.getItem(RECOVERY_KEY) || '[]');
    for (const record of records.slice(-MAX_HELD_ATTEMPTS)) {
      if (record?.key && record?.issued?.projectId) held.set(record.key, { ...record, blob: null });
    }
  }
} catch { /* Invalid recovery metadata never changes project records. */ }


/** The key a failed export is held and retried under. */
export function pendingExportKey({ projectId, documentType, filename } = {}) {
  return [projectId || '', documentType || '', filename || ''].join('|');
}

/**
 * Hold one export attempt.
 * @returns {string} the key it is held under
 */
export function holdPendingExport({ identity = {}, filename = null, issued = null, blob = null, pageCount = null, retryExport = null, attemptStartedAt = new Date() } = {}) {
  const key = pendingExportKey({ projectId: identity.projectId, documentType: identity.documentType, filename });
  const prior = held.get(key);
  if ((prior && (prior.blob || prior.fileUri || prior.uploadStarted)) || (!prior && held.size >= MAX_HELD_ATTEMPTS)) throw new Error('An earlier PDF still needs storage recovery. Finish that operation before starting another export.');
  held.set(key, {
    key,
    identity,
    filename,
    issued: issued || identity,
    blob,
    pageCount,
    retryExport: typeof retryExport === 'function' ? retryExport : null,
    attemptStartedAt: (attemptStartedAt instanceof Date ? attemptStartedAt : new Date(attemptStartedAt)).toISOString(),
  });

  persistRecovery();
  return key;
}

/** Add what is only known once the source identity resolved and the PDF exists. */
export function updatePendingExport(key, patch = {}) {
  const current = held.get(key);
  if (!current) return null;
  const next = Object.assign(current, patch);
  held.set(key, next);
  persistRecovery();
  return next;
}

export function peekPendingExport(key) {
  return held.get(key) || null;
}

export function clearPendingExport(key) {
  if (!key) return;
  const entry = held.get(key);
  if (entry) entry.blob = null;
  held.delete(key);
  persistRecovery();
}

export function heldPendingExportCount() {
  return held.size;
}

export default holdPendingExport;