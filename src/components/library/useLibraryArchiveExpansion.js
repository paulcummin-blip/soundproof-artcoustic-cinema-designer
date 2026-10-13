/**
 * useLibraryArchiveExpansion
 * --------------------------
 * Whether the Project Library's archive section is open.
 *
 * The archive is collapsed by default, so the Library opens on the documents the
 * project holds now. It remembers whether the designer left it open — including
 * while they move between design versions or between the Library's own sections —
 * so a designer reviewing the history does not have to open it again each time.
 *
 * Presentation only: one preference for the session, no record, report or issued
 * document is read or written here. A browser that refuses the session store
 * keeps the preference in memory and simply forgets it on reload.
 */

import { useCallback, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'b44.projectLibrary.archiveExpanded.v1';

/** The preference, held for this session. Null until it is first read. */
let preference = null;
const listeners = new Set();

function readPreference() {
  if (preference !== null) return preference;
  preference = false;
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      preference = window.sessionStorage.getItem(STORAGE_KEY) === 'true';
    }
  } catch {
    // A blocked storage area leaves the default (collapsed) in place.
  }
  return preference;
}

function writePreference(expanded) {
  preference = expanded;
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(STORAGE_KEY, expanded ? 'true' : 'false');
    }
  } catch {
    // Held in memory for this session when storage refuses the write.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The archive's expanded state, and the one action that toggles it. */
export function useLibraryArchiveExpansion() {
  const expanded = useSyncExternalStore(subscribe, readPreference, () => false);
  const toggle = useCallback(() => writePreference(!readPreference()), []);
  return { expanded, toggle };
}

export default useLibraryArchiveExpansion;