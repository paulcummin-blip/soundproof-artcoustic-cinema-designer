// engineeringModeStore.js
// Global Engineering Mode toggle — a single shared authority so the Options
// panel can enable it and every consuming surface (Bass, future panels) can
// read it without prop drilling or AppStateProvider bloat.
//
// Default OFF. Not persisted — a session-scoped developer preference.

let engineeringMode = false;
const listeners = new Set();

export function subscribeEngineeringMode(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getEngineeringMode() {
  return engineeringMode;
}

export function setEngineeringMode(next) {
  const value = !!next;
  if (value === engineeringMode) return;
  engineeringMode = value;
  listeners.forEach((l) => l());
}

export function toggleEngineeringMode() {
  setEngineeringMode(!engineeringMode);
}