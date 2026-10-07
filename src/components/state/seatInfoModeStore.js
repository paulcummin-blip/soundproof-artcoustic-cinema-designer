/**
 * seatInfoModeStore
 *
 * Shared external store for the Plan View seat click mode: 'hud' | 'dimensions'.
 *
 * The mode is chosen in the Plan View toolbar and consumed by the plan canvas,
 * which do not share this piece of state through props. useSyncExternalStore
 * keeps both in sync with one authority instead of duplicating it.
 *
 * UI state only: it never recalculates, saves or changes project data.
 */
let mode = 'hud';
const listeners = new Set();

export function subscribeSeatInfoMode(listener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getSeatInfoMode() {
  return mode;
}

export function setSeatInfoMode(value) {
  const next = value === 'dimensions' ? 'dimensions' : 'hud';
  if (next === mode) return;
  mode = next;
  listeners.forEach((l) => l());
}