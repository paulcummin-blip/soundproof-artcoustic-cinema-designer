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
export const STATUS_INCLUSION_STORAGE_KEY = 'sound-proof:project-intelligence:status-inclusion:v1';
export const CATEGORY_INCLUSION_STORAGE_KEY = 'sound-proof:project-intelligence:category-inclusion:v1';

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

/**
 * The forecast inclusion choices — one boolean per status key, one per category
 * key. Same rule as the project selection: local report selection only, kept in
 * this browser, never written to the database.
 */
function readBooleanMap(key) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const clean = {};
    for (const [entryKey, value] of Object.entries(parsed)) {
      if (typeof value === 'boolean') clean[entryKey] = value;
    }
    return clean;
  } catch {
    // A browser that blocks storage simply starts from the defaults.
    return {};
  }
}

function writeBooleanMap(key, map) {
  try {
    window.localStorage.setItem(key, JSON.stringify(map || {}));
  } catch {
    // Storage unavailable: the choice still works for this session.
  }
}

function clearBooleanMap(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing to clear.
  }
}

export const readStatusInclusion = () => readBooleanMap(STATUS_INCLUSION_STORAGE_KEY);
export const writeStatusInclusion = (map) => writeBooleanMap(STATUS_INCLUSION_STORAGE_KEY, map);
export const clearStatusInclusion = () => clearBooleanMap(STATUS_INCLUSION_STORAGE_KEY);

export const readCategoryInclusion = () => readBooleanMap(CATEGORY_INCLUSION_STORAGE_KEY);
export const writeCategoryInclusion = (map) => writeBooleanMap(CATEGORY_INCLUSION_STORAGE_KEY, map);
export const clearCategoryInclusion = () => clearBooleanMap(CATEGORY_INCLUSION_STORAGE_KEY);