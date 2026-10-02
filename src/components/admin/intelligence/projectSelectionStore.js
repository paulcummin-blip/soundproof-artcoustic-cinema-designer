// projectSelectionStore.js
// ------------------------
// Local report selection storage for Project Intelligence.
//
// The admin's include/exclude and counted-version choices are REPORT SELECTION
// ONLY. No reporting-preferences entity exists, so nothing is written to the
// database: the choices are held in this browser under one versioned key and are
// labelled in the UI as local report selection.
//
// Nothing here writes to Project, ProjectVersion or any other entity.

export const SELECTION_STORAGE_KEY = 'sound-proof:project-intelligence:selection:v1';

export const SELECTION_STORAGE_LABEL =
  'Local report selection: saved in this browser only. Nothing is written to the project database.';

/** The only fields a stored entry may carry. */
const ENTRY_FIELDS = ['included', 'counted_version_id', 'count_basis', 'manually_overridden'];

function sanitiseEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const clean = {};
  for (const field of ENTRY_FIELDS) {
    if (entry[field] !== undefined) clean[field] = entry[field];
  }
  return Object.keys(clean).length > 0 ? clean : null;
}

/** Every stored preference, keyed by project id. Never throws. */
export function readSelection() {
  try {
    const raw = window.localStorage.getItem(SELECTION_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const clean = {};
    for (const [projectId, entry] of Object.entries(parsed)) {
      const sanitised = sanitiseEntry(entry);
      if (sanitised) clean[projectId] = sanitised;
    }
    return clean;
  } catch {
    // A browser that blocks storage simply starts from the defaults.
    return {};
  }
}

/** Persist the whole selection. Never throws. */
export function writeSelection(selection) {
  try {
    window.localStorage.setItem(SELECTION_STORAGE_KEY, JSON.stringify(selection || {}));
  } catch {
    // Storage unavailable: the selection still works for this session.
  }
}

/** Clear the stored selection. Never throws. */
export function clearSelection() {
  try {
    window.localStorage.removeItem(SELECTION_STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
}