/**
 * issuedExportSignal.js
 * ---------------------
 * One in-session announcement: an exported PDF has been stored in the Project
 * Library.
 *
 * An export is recorded in the background, after the download has already been
 * triggered, because capturing and uploading a multi-page PDF takes seconds.
 * A designer who downloads a report and goes straight back to the Project
 * Library arrives before the row exists. This signal is how the Library learns
 * the row has landed and reads again, so the export just made is listed instead
 * of "No PDF has been exported for this version yet".
 *
 * In-session only: nothing is persisted, and no reader depends on it.
 */

const listeners = new Set();

/**
 * Announce that an issued document for a project has been stored.
 * @param {string} projectId the project the stored document belongs to
 */
export function notifyIssuedExportStored(projectId) {
  if (!projectId) return;
  listeners.forEach((listener) => {
    try {
      listener(projectId);
    } catch (error) {
      // One listener failing must never stop the others from being told.
      console.error('[ProjectLibrary] Issued-export listener failed:', error);
    }
  });
}

/**
 * Listen for stored issued documents.
 * @param {(projectId: string) => void} listener
 * @returns {() => void} unsubscribe
 */
export function subscribeIssuedExportStored(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export default subscribeIssuedExportStored;