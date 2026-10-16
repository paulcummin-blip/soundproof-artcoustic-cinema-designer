// Synchronous pointer authority. React state is presentation, not gesture ownership.
export const isPrimaryDragStart = (event) =>
  event?.isPrimary !== false && (event?.button == null || event.button === 0);

export const isDragPointer = (gesture, event) =>
  !!gesture && (gesture.pointerId == null || event?.pointerId == null ||
    gesture.pointerId === event.pointerId);

export const primaryButtonHeld = (event) =>
  typeof event?.buttons === "number" && (event.buttons & 1) === 1;

export function beginPointerDrag(ref, event, { id, type, captureTarget }) {
  if (ref.current || !isPrimaryDragStart(event)) return false;
  // A new drag replaces any suppression the previous gesture left unconsumed.
  clearCompletedSeatDrag();
  ref.current = { id, type, pointerId: event.pointerId, captureTarget };
  // Capture on the stable SVG, not an icon/seat that can be replaced on a tick.
  try {
    if (event.pointerId != null) captureTarget?.setPointerCapture?.(event.pointerId);
  } catch (_) { /* Window listeners remain the fallback. */ }
  return true;
}

export function finishPointerDrag(ref, event) {
  if (!isDragPointer(ref.current, event)) return null;
  const gesture = ref.current;
  ref.current = null; // End BEFORE commit/releaseCapture can synchronously emit events.
  return gesture;
}

export function releaseDragCapture(gesture) {
  try {
    if (gesture?.pointerId != null) {
      gesture.captureTarget?.releasePointerCapture?.(gesture.pointerId);
    }
  } catch (_) { /* Capture may already have been cancelled or implicitly released. */ }
}

// ── A completed seat drag owns the click the browser dispatches after it ───────
// A seat drag ends at pointer release, and the browser then dispatches a
// compatibility click at the release point. That click is the end of the drag,
// never a click-away on the plan — so the drag's own completion, and nothing
// else, arms a one-shot token that the plan's background click consumes before
// it dismisses the seat HUD or clears the active seat. Ownership lives here,
// with the gesture lifecycle that already decides drag start, movement and
// completion, so exactly one authority answers "was that a drag?".
let completedSeatDrag = false;

/** Arms the one-shot token when the gesture that just completed was a seat drag. */
export function markSeatDragCompleted(gesture) {
  if (gesture?.type !== "seat") return false;
  completedSeatDrag = true;
  return true;
}

/**
 * True exactly once, for the click the browser dispatches after that release.
 * Consumed by the first caller and cleared immediately, so it can never suppress
 * a later genuine click on empty plan.
 */
export function consumeCompletedSeatDragClick() {
  if (!completedSeatDrag) return false;
  completedSeatDrag = false;
  return true;
}

/**
 * A new plan gesture has begun. Clears a token left behind by a release the
 * browser never turned into a click (a cancel, or a lost capture), so a stale
 * suppression can never swallow the next genuine background click.
 */
export function clearCompletedSeatDrag() {
  completedSeatDrag = false;
}