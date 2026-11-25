// projectEditDiff.js
// --------------------------------
// Pure diff builder for safe project editing. No external imports, no side
// effects — safe to unit-test in a plain Node environment.
//
// Principle: when editing an EXISTING project, submit only the fields the user
// has intentionally changed. Unchanged engineering-summary fields (room
// dimensions, Dolby configuration, target SPL, amplifier power, etc.) are never
// resubmitted, so a simple identity correction (e.g. fixing a client-name
// spelling) can never overwrite current information with stale parent-Project
// values, never touches ProjectVersion design state, and never triggers bass
// recalculation, RP22 changes, or document regeneration.

// The editable Project fields exposed by the edit dialogs, and how each is
// coerced from its raw form-string representation to its stored type. This map
// is the single source of truth for which fields an edit may touch.
const EDITABLE_FIELDS = Object.freeze({
  name: "string",
  client_name: "string",
  project_reference: "string",
  project_status: "string",
  room_length: "number_nullable",
  room_width: "number_nullable",
  room_height: "number_nullable",
  dolby_config: "string",
  target_spl: "number",
  amplifier_power: "number_nullable",
  notes: "string",
});

/** Coerce a raw form value to its stored representation for a given field. */
function coerceField(type, raw) {
  if (type === "number_nullable") {
    if (raw === "" || raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  if (type === "number") {
    if (raw === "" || raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : raw;
  }
  // string
  return raw == null ? "" : String(raw);
}

/** Whether two coerced field values are equal. */
function valuesEqual(a, b) {
  if (a === b) return true;
  if (a == null && b === "") return true;
  if (b == null && a === "") return true;
  if (a == null || b == null) return false;
  if (typeof a === "number" || typeof b === "number") {
    const na = Number(a);
    const nb = Number(b);
    if (!Number.isFinite(na) || !Number.isFinite(nb)) return String(a) === String(b);
    return Math.abs(na - nb) < 1e-9;
  }
  return String(a) === String(b);
}

/**
 * Build the update payload containing ONLY the fields that differ between the
 * original form (as captured when the dialog opened) and the current form.
 *
 * Returns { payload, hasChanges }:
 *   payload     — a sparse object of changed fields with coerced values, ready
 *                 for Project.update(id, payload). Empty when nothing changed.
 *   hasChanges  — true when at least one editable field changed.
 *
 * Both inputs are the raw form-value objects (strings for numeric fields). The
 * comparison is performed on the COERCED values, so "5" vs 5 is not treated as
 * a change, and a cleared numeric field ("" → null) is correctly detected.
 */
export function buildProjectEditPayload(originalForm, currentForm) {
  const payload = {};
  let hasChanges = false;
  for (const [field, type] of Object.entries(EDITABLE_FIELDS)) {
    const original = coerceField(type, originalForm?.[field]);
    const current = coerceField(type, currentForm?.[field]);
    if (!valuesEqual(original, current)) {
      payload[field] = current;
      hasChanges = true;
    }
  }
  return { payload, hasChanges };
}

export { EDITABLE_FIELDS };