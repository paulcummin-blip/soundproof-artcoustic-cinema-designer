// p14TargetSoftPauseRequeue.js — Pure guard for requeuing an interrupted
// background P14 target on a SOFT (interaction) pause.
//
// SOFT PAUSE vs HARD CANCEL:
//   SOFT pause  — pointerdown / wheel / keydown / non-design UI interaction.
//                 The design fingerprint is unchanged. The interrupted target
//                 is requeued at the FRONT so it restarts first after the
//                 3-second idle period. The queue and completed cache are
//                 preserved. This is NOT a retry failure.
//   HARD cancel — bass-relevant design fingerprint change / project change /
//                 target change / invalidation / unmount. Goes through
//                 cancel(). The old target is NOT requeued against the changed
//                 fingerprint; the queue is rebuilt for the new design.
//
// Guards (all must hold to requeue):
//   1. target still belongs to the current baseDesignFingerprint
//   2. target is not already cached
//   3. target is not already present in the queue (no duplicate)
//   4. no completed pending result exists for that same target
//
// Exactly one outstanding representation is allowed at any time:
//   A. running worker  OR  B. pending completed result  OR  C. queued target.

import { getTargetCacheEntry } from "./p14TargetCache";

/**
 * Requeue an interrupted target at the front of the queue on a SOFT pause.
 * Mutates `queue` in place (unshift) only if all guards pass.
 * @returns {boolean} true if requeued, false if skipped.
 */
export function requeueInterruptedTargetOnSoftPause({
  queue,
  target,
  targetBaseDesignFingerprint,
  currentBaseDesignFingerprint,
  projectId,
  pendingCompletionTargetKey = null,
}) {
  if (!target) return false;
  // Guard 1: fingerprint unchanged (soft pause only).
  if (targetBaseDesignFingerprint !== currentBaseDesignFingerprint) return false;
  // Guard 2: not already cached.
  if (getTargetCacheEntry(projectId, currentBaseDesignFingerprint, target.key)) return false;
  // Guard 3: not already queued (no duplicate).
  if (queue.some((t) => t.key === target.key)) return false;
  // Guard 4: no pending completed result for this target.
  if (pendingCompletionTargetKey === target.key) return false;
  queue.unshift(target);
  return true;
}