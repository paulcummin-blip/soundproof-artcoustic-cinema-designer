/**
 * asdrVisibilityStore.js
 * --------------------------------
 * Single shared visibility state for the Artcoustic System Design Rating.
 * One option controls both the Room Designer app card and Technical Report Page 3.
 *
 * Default: ON (true).
 * The underlying rating may still calculate internally; only its presentation is hidden.
 */

const listeners = new Set();
let state = { showAsdr: true };

export function getAsdrVisibility() {
  return state.showAsdr;
}

export function setAsdrVisibility(value) {
  const next = !!value;
  if (next === state.showAsdr) return;
  state = { showAsdr: next };
  listeners.forEach((fn) => fn(state));
}

export function subscribeAsdrVisibility(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}