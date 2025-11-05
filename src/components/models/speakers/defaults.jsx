// components/models/speakers/defaults.js

// Intent: NO default models. Designers pick everything.
// This file only honours explicit per-role overrides (splMap).

// Keep an empty table to preserve imports elsewhere.
export const ROLE_MODEL_DEFAULTS = {};

// Normalise common variants to canonical keys (unchanged behaviour).
function NORMALISE(role) {
  return String(role || "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/^RS$/, "SR") // legacy alias guard
    .replace(/^LS$/, "SL");
}

/**
 * Resolve a model for a channel role.
 * Priority (reduced):
 *  1) splMap override (exact, normalised, or raw key)
 *  2) otherwise: undefined (NO defaults, NO family fallbacks)
 *
 * @param {string} role  e.g. "SL", "SR", "SBL", "TFL", etc.
 * @param {Record<string,string>} [splMap] optional per-role override map
 * @returns {string|undefined} the chosen model, or undefined if none
 */
export function modelForRole(role, splMap) {
  const R = NORMALISE(role);

  // 1) SPL override map wins (try canonical, raw, and re-normalised)
  if (splMap && typeof splMap === "object") {
    const fromMap =
      splMap[R] ||
      splMap[role || ""] ||
      splMap[NORMALISE(role || "")];

    if (fromMap) return fromMap;
  }

  // 2) DO NOT fall back to hard defaults or families.
  // Explicitly return undefined so UI starts blank.
  return undefined;
}

// Preserve default export shape used by existing imports.
export default { modelForRole, ROLE_MODEL_DEFAULTS };