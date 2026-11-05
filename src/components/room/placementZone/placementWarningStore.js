/**
 * placementWarningStore.js
 * ------------------------
 * Session-first external store for the temporary placement-zone warning.
 *
 * A speaker that the designer moves or places outside its recommended
 * placement zone is highlighted in Artcoustic dark red (#4A230F) for five
 * seconds, then returns to its normal appearance. Moving it again while
 * outside restarts the five-second period; moving it back inside clears the
 * warning immediately.
 *
 * The store is driven ONLY by explicit user placement/movement — it is never
 * populated from a saved project on open. Recording is a no-op when the
 * evaluated state matches the current state, so callers may record on every
 * drag tick without spamming timers.
 *
 * React consumers read it through `usePlacementWarnings` (useSyncExternalStore).
 */

const WARN_DURATION_MS = 5000;

/** id -> { outside: boolean, expiresAt: number, timer: number|null } */
const warned = new Map();
const listeners = new Set();
let snapshot = Object.freeze(new Set());

function emit() {
  const next = new Set();
  for (const [id, entry] of warned) {
    if (entry?.outside) next.add(id);
  }
  snapshot = Object.freeze(next);
  for (const listener of listeners) {
    try { listener(); } catch { /* a listener error never breaks the store */ }
  }
}

function clearTimer(entry) {
  if (entry?.timer) {
    clearTimeout(entry.timer);
    entry.timer = null;
  }
}

/**
 * Record a placement evaluation for one speaker. Call this on user-initiated
 * movement or placement (drag ticks, drag commit, elevation moves).
 *
 * @param {string} id       - Speaker identity (speaker.id or canonical role)
 * @param {boolean} isOutside - true when outside the applicable zone
 */
export function recordPlacementEvaluation(id, isOutside) {
  if (!id) return;
  const existing = warned.get(id);

  if (isOutside) {
    // (Re)start the five-second hold every time the speaker is moved while
    // still outside. An existing timer is cleared first so only one expiry
    // is ever pending.
    clearTimer(existing);
    const timer = setTimeout(() => {
      const entry = warned.get(id);
      if (entry?.timer === timer) {
        warned.delete(id);
        emit();
      }
    }, WARN_DURATION_MS);
    warned.set(id, { outside: true, expiresAt: Date.now() + WARN_DURATION_MS, timer });
    emit();
    return;
  }

  // Inside the zone: clear any pending warning immediately.
  if (existing) {
    clearTimer(existing);
    warned.delete(id);
    emit();
  }
}

/** Clear every pending warning (used on project switch / reset). */
export function clearAllPlacementWarnings() {
  for (const [, entry] of warned) clearTimer(entry);
  if (warned.size === 0) return;
  warned.clear();
  emit();
}

/** Read the frozen set of currently-warned speaker IDs. */
export function getWarnedSpeakerIds() {
  return snapshot;
}

/** Subscribe to warned-set changes (useSyncExternalStore compatible). */
export function subscribePlacementWarnings(listener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}