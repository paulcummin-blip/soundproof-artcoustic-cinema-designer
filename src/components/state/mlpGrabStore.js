/**
 * mlpGrabStore
 *
 * Shared external store for the RSP (green dot) GRABBED interaction state.
 *
 * The GRABBED state must be accessible from two parts of the tree that do not
 * share a common ancestor for this piece of state:
 *   - RoomVisualisation (owns the SVG mouse-move / click-to-place logic)
 *   - SeatingLayout    (owns the "Reset RSP to 57.5°" button)
 *
 * Using useSyncExternalStore keeps both in sync without prop-drilling through
 * the ControlsPanel layer.
 */
let grabbed = false;
const listeners = new Set();

export function subscribeMlpGrab(listener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getMlpGrab() {
  return grabbed;
}

export function setMlpGrab(value) {
  const next = !!value;
  if (next === grabbed) return;
  grabbed = next;
  listeners.forEach((l) => l());
}

export function cancelMlpGrab() {
  setMlpGrab(false);
}