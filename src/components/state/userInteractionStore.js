// userInteractionStore.js — Shared Room Designer user-interaction authority.
//
// Tracks MEANINGFUL user interaction for background scheduling:
//   pointerdown, wheel, keydown, and the existing b44-bass-drag-start/end events.
//
// Hover / passive pointer movement are intentionally NOT tracked (Part 4).
//
// Runtime UI state only — never persisted.
//
// Consumers (P14TargetBackgroundScheduler) subscribe once and use:
//   - isUserInteracting(): true during an active drag OR within IDLE_QUIET_MS
//     of the last meaningful interaction.
//   - getIdleResumeDeadline(): lastInteractionAt + IDLE_QUIET_MS — background
//     work may resume only after this deadline (3s sustained inactivity).
//   - subscribe(listener): notified on every meaningful interaction so the
//     scheduler can pause speculative work immediately.

const IDLE_QUIET_MS = 3000;

let lastInteractionAt = 0;
let pointerDown = false;     // primary pointer button held — brackets ALL drag types
let bassDragActive = false;  // explicit b44-bass-drag-start/end events
let idleQuietMs = IDLE_QUIET_MS;
const listeners = new Set();

function now() { return Date.now(); }

function notify() {
  listeners.forEach((l) => { try { l(); } catch (_) { /* listener errors are non-fatal */ } });
}

/** Record a meaningful interaction (pointerdown / wheel / keydown). */
export function markInteraction() {
  lastInteractionAt = now();
  notify();
}

/** Set/clear the active-drag flag. Drag-start and drag-end both count as
 *  interactions (they bracket a sustained user activity). */
export function setDragActive(active) {
  bassDragActive = !!active;
  lastInteractionAt = now();
  notify();
}

export function getLastInteractionAt() { return lastInteractionAt; }
export function isDragActive() { return pointerDown || bassDragActive; }

/** True if the user is currently interacting: an active drag, OR a meaningful
 *  interaction within the last IDLE_QUIET_MS. Used to defer heavy background
 *  completion processing until the app is genuinely idle. */
export function isUserInteracting() {
  return isDragActive() || (now() - lastInteractionAt < idleQuietMs);
}

/** Deadline (ms timestamp) after which background work may resume. */
export function getIdleResumeDeadline() {
  return lastInteractionAt + idleQuietMs;
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ── Test-only helpers ──────────────────────────────────────────────────────
export function setIdleQuietMsForTest(ms) { idleQuietMs = ms; }
export function resetUserInteractionForTest() {
  lastInteractionAt = 0;
  pointerDown = false;
  bassDragActive = false;
  listeners.clear();
}

// ── Install window listeners (browser only, passive) ───────────────────────
// Hover / pointermove / mousemove are deliberately NOT registered.
// pointerdown with the primary button brackets ALL drag types (seat, RSP,
// speaker, subwoofer, bass) — not just bass drags. pointerup/pointercancel
// clear the bracket. This catches drags that don't dispatch the custom
// b44-bass-drag-start/end events.
if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", (e) => {
    if (e.button === 0 || e.button === undefined) pointerDown = true;
    markInteraction();
  }, { passive: true });
  window.addEventListener("wheel", markInteraction, { passive: true });
  window.addEventListener("keydown", markInteraction, { passive: true });
  const dragEndEvents = ["pointerup", "pointercancel"];
  dragEndEvents.forEach((evt) => {
    window.addEventListener(evt, () => {
      pointerDown = false;
      markInteraction();
    }, { passive: true });
  });
  window.addEventListener("b44-bass-drag-start", () => setDragActive(true));
  window.addEventListener("b44-bass-drag-end", () => setDragActive(false));
}