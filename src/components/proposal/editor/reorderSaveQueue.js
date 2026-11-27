/**
 * reorderSaveQueue.js
 * -------------------
 * A serialized, coalescing save queue for proposal section reordering.
 *
 * Reordering must not issue a separate database write on every drag-over event:
 * the editor updates the visible order live during a drag, and commits the
 * completed order once, when the drag finishes. This queue accepts those commits.
 *
 * Two invariants the dealer relies on:
 *
 *   1. Only one save runs at a time (serialized). An earlier request can never
 *      finish after a newer one, because no two saves run concurrently.
 *   2. Every save reads the LATEST committed order, so a newer intended order
 *      always wins. Commits made while a save is in flight are coalesced into a
 *      single follow-up save — not dropped, and not run as a second concurrent
 *      write that could overwrite the latest one.
 *
 * On failure the queue stops and reports `failed`; the intended order is
 * retained (the editor never reverts it), and a Retry is a fresh commit of the
 * same order. The chain never rejects, so a later commit always proceeds even
 * after an earlier one failed.
 *
 * Pure-ish: no React. The persist callback and status reporter are supplied by
 * the caller, which makes the queue unit-testable with a deferred mock persist.
 */
export function createReorderSaveQueue({ persist, onStatus = () => {} } = {}) {
  if (typeof persist !== 'function') {
    throw new Error('createReorderSaveQueue requires a persist function.');
  }

  let chain = Promise.resolve();
  let pendingOrder = null;
  let hasPending = false;

  async function runNext() {
    if (!hasPending) return;
    const order = pendingOrder;
    pendingOrder = null;
    hasPending = false;
    onStatus('saving');
    try {
      await persist(order);
      onStatus('saved');
    } catch (err) {
      // The intended order is retained by the editor; a Retry is a fresh commit.
      onStatus('failed');
    }
    if (hasPending) {
      await runNext();
    }
  }

  return {
    /** Enqueue the latest intended order. Coalesces with any pending commit. */
    commit(order) {
      pendingOrder = Array.isArray(order) ? order : [];
      hasPending = true;
      chain = chain.then(runNext).catch(() => {
        // The chain never rejects: failures are reported via onStatus, and a
        // rejected earlier link must not prevent a later commit from running.
      });
      return chain;
    },
    /** Whether a commit is waiting or a save is in flight. */
    isBusy() {
      return hasPending;
    },
  };
}

export default createReorderSaveQueue;