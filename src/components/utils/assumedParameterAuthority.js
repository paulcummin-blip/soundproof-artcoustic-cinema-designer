// src/components/utils/assumedParameterAuthority.js
// ---------------------------------------------------------------------------
// Single canonical authority for the designer-assumed RP22 parameters P15
// (background noise floor) and P21 (early reflections).
//
// P15 and P21 are ASSUMED design parameters — the designer selects the
// achieved RP22 Performance Level (L1–L4); the display value (NCB / dB) is
// derived from the canonical RP22 threshold definitions. They are NOT
// calculated acoustic results.
//
// One project-level value per parameter (assumed_p15_level / assumed_p21_level).
// null = no explicit user selection; the effective level defaults to L2.
// Both Compliance Report and Technical Report read and write the same shared
// value. The rating engine consumes the same effective level.
//
// Presentation only — no thresholds or grading maths of its own; the level
// mapping below mirrors the existing RP22 catalog definitions.
// ---------------------------------------------------------------------------

/** P15: RP22 level → NCB noise floor value. */
export const P15_LEVEL_TO_NCB = Object.freeze({
  L1: 26,
  L2: 22,
  L3: 18,
  L4: 15,
});

/** P21: RP22 level → early-reflection level (dB relative to direct). L1 = N/A. */
export const P21_LEVEL_TO_DB = Object.freeze({
  L1: null,
  L2: -8,
  L3: -10,
  L4: -12,
});

/** Selector options for P15 — L1–L4 with derived NCB sublabel. */
export const ASSUMED_P15_OPTIONS = Object.freeze([
  { level: "L1", sublabel: "NCB 26" },
  { level: "L2", sublabel: "NCB 22" },
  { level: "L3", sublabel: "NCB 18" },
  { level: "L4", sublabel: "NCB 15" },
]);

/** Selector options for P21 — L1–L4 with derived dB sublabel. */
export const ASSUMED_P21_OPTIONS = Object.freeze([
  { level: "L1", sublabel: "N/A" },
  { level: "L2", sublabel: "−8 dB" },
  { level: "L3", sublabel: "−10 dB" },
  { level: "L4", sublabel: "−12 dB" },
]);

const VALID_LEVELS = new Set(["L1", "L2", "L3", "L4"]);

/** Returns true when the level is a valid L1–L4 string (i.e. user has assumed). */
export function isAssumedLevelSet(level) {
  return level != null && VALID_LEVELS.has(String(level));
}

/** Normalise any input to a valid L1–L4 string or null. */
export function normalizeAssumedLevel(raw) {
  if (raw == null) return null;
  const s = String(raw).toUpperCase().trim();
  if (VALID_LEVELS.has(s)) return s;
  // Accept legacy lowercase l1–l4
  const m = s.match(/^l([1-4])$/);
  return m ? `L${m[1]}` : null;
}

/** Default assumed level when the designer has not made a selection. */
export const DEFAULT_ASSUMED_LEVEL = "L2";

/**
 * Resolve the effective assumed level, defaulting to L2 when the designer
 * has not made an explicit selection. This is the single canonical
 * effective-value authority — every consumer should call this (or one of
 * the resolveAssumed* wrappers) rather than normalizeAssumedLevel directly
 * when it needs the level that actually applies.
 */
export function getEffectiveAssumedLevel(level) {
  return normalizeAssumedLevel(level) || DEFAULT_ASSUMED_LEVEL;
}

/** Derive the P15 display value (e.g. "NCB 22") from an assumed level. Defaults to L2 / NCB 22. */
export function getAssumedP15DisplayValue(level) {
  const lvl = getEffectiveAssumedLevel(level);
  return `NCB ${P15_LEVEL_TO_NCB[lvl]}`;
}

/** Derive the P21 display value (e.g. "−10 dB" or "N/A") from an assumed level. Defaults to L2 / −8 dB. */
export function getAssumedP21DisplayValue(level) {
  const lvl = getEffectiveAssumedLevel(level);
  if (lvl === "L1") return "N/A";
  const db = P21_LEVEL_TO_DB[lvl];
  if (!Number.isFinite(db)) return null;
  return `${db} dB`;
}

/** Resolve the RP22 level string for P15 from the assumed level. Defaults to L2. */
export function resolveAssumedP15Level(level) {
  return getEffectiveAssumedLevel(level);
}

/** Resolve the RP22 level string for P21 from the assumed level. Defaults to L2. */
export function resolveAssumedP21Level(level) {
  return getEffectiveAssumedLevel(level);
}

/** Get the effective assumed level for rating-engine consumption. Defaults to L2. */
export function getAssumedLevelForRating(level) {
  return getEffectiveAssumedLevel(level);
}