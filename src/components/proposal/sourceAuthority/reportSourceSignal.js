/**
 * reportSourceSignal.js
 * ---------------------
 * One in-session announcement: a saved report has been written for a project
 * version.
 *
 * The proposal readiness table is read from the saved reports and the version's
 * calculated engineering result. A designer who generates a report and returns
 * to the version step must see that report as Current straight away — without a
 * page reload and without the wizard being re-entered. This signal is how the
 * readiness read learns a report has landed, so it reads again.
 *
 * In-session only: nothing is persisted, and no reader depends on it.
 */

const listeners = new Set();

/**
 * Announce that a saved report was written for a project version.
 * @param {{projectId?: string, versionId?: string}} entry
 */
export function notifyReportSourceStored({ projectId = null, versionId = null } = {}) {
  if (!projectId) return;
  listeners.forEach((listener) => {
    try {
      listener({ projectId, versionId });
    } catch (error) {
      // One listener failing must never stop the others from being told.
      console.error('[proposalReadiness] Report-source listener failed:', error);
    }
  });
}

/**
 * Listen for saved reports being written.
 * @param {(entry: {projectId: string, versionId: string|null}) => void} listener
 * @returns {() => void} unsubscribe
 */
export function subscribeReportSourceStored(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export default subscribeReportSourceStored;