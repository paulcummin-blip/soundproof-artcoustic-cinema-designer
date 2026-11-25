/**
 * downloadStatusStore
 * ---------------------
 * Lightweight per-user, per-issued-document download tracking.
 *
 * Tracks which issued-document records (ProjectAssetExport ids) the current
 * user has downloaded. Persisted to localStorage so the status survives
 * navigation, refresh and reopening the project.
 *
 * Each issued document has a unique record id. When a replacement document is
 * generated it gets a new record id, so it starts as "not downloaded" until
 * the user downloads that specific document. Downloading an older document
 * marks only that document's record id, never its replacement.
 *
 * No backend, no entity, no regeneration: the stored PDF is the document and
 * the download only retrieves it. This store records that the retrieval
 * happened for this user.
 */

const STORAGE_KEY = 'b44_doc_downloads_v1';
const listeners = new Set();

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeAll(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // storage unavailable — tracking degrades gracefully
  }
  listeners.forEach((cb) => cb());
}

export function subscribeDownloadStatus(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * Returns true when the current user has downloaded the issued document with
 * the given record id.
 */
export function isDocumentDownloaded(userId, recordId) {
  if (!userId || !recordId) return false;
  const all = readAll();
  return Boolean(all[userId] && all[userId][recordId]);
}

/**
 * Marks an issued document as downloaded by the current user. Called only
 * after the existing file has been successfully retrieved and the download
 * initiated. Never called on a failed download.
 */
export function markDocumentDownloaded(userId, recordId) {
  if (!userId || !recordId) return;
  const all = readAll();
  if (!all[userId]) all[userId] = {};
  all[userId][recordId] = new Date().toISOString();
  writeAll(all);
}