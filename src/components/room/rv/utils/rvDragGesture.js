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
