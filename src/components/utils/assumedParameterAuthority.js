// src/components/utils/assumedParameterAuthority.js
// ---------------------------------------------------------------------------
// Single canonical authority for the designer-assumed RP22 parameters P15
// (background noise floor) and P21 (early reflections).
//
// P15 and P21 are design-stage assumptions, not measured results. The designer
// selects an L1–L4 level; it persists against the project/version and feeds
// every consumer — Room Designer, Design Review, Technical/Visual reports,
// PDFs, Design Rating and AI Summary — through this one authority.
//
// A future measured result must enter through the measured-result authority;
// while no measured result exists, the designer's selected assumption is used.
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

/** Default assumption when no level has been selected. */
export const DEFAULT_ASSUMED_LEVEL = "L2";

/**
 * Resolve the effective design assumption. Returns the normalised stored
 * level, falling back to the default (L2) when the stored value is absent or
 * invalid. Measured results do not pass through this helper.
 */
export function getEffectiveAssumedLevel(storedLevel) {
  return normalizeAssumedLevel(storedLevel) || DEFAULT_ASSUMED_LEVEL;
}

/** Build the P15 assumption result object for a given level. */
export function buildP15AssumptionResult(level) {
  const lvl = getEffectiveAssumedLevel(level);
  return Object.freeze({
    parameter: 15,
    level: lvl,
    value: P15_LEVEL_TO_NCB[lvl],
    formatted: `NCB ${P15_LEVEL_TO_NCB[lvl]}`,
    hudLabel: `NCB ${P15_LEVEL_TO_NCB[lvl]}`,
    status: "assumed",
    state: "scored",
    assumed: true,
    assumptionText: `Design target: NCB ${P15_LEVEL_TO_NCB[lvl]}`,
  });
}

/** Build the P21 assumption result object for a given level. */
export function buildP21AssumptionResult(level) {
  const lvl = getEffectiveAssumedLevel(level);
  const db = P21_LEVEL_TO_DB[lvl];
  const assumptionText = lvl === "L1"
    ? "Early reflections control is not applicable at this level."
    : "Early reflections have not been measured. This level is used as the design assumption.";
  return Object.freeze({
    parameter: 21,
    level: lvl,
    value: db,
    formatted: lvl === "L1" ? "N/A" : "Assumed",
    hudLabel: lvl === "L1" ? "N/A" : "Assumed",
    status: "assumed",
    state: "scored",
    assumed: true,
    assumptionText,
  });
}

// Backward-compat frozen L2 defaults (used by callers that need the default
// without calling the builder).
export const P15_ASSUMPTION_RESULT = buildP15AssumptionResult("L2");
export const P21_ASSUMPTION_RESULT = buildP21AssumptionResult("L2");

/**
 * Return a measured result when one is explicitly published; otherwise return
 * the designer's assumed level presentation for P15/P21.
 */
export function resolveAssumedParameterResult(parameterId, measuredResult = null, assumedLevel = null) {
  if (measuredResult?.status === "measured" && normalizeAssumedLevel(measuredResult?.level)) {
    return { ...measuredResult, assumed: false };
  }
  if (Number(parameterId) === 15) return { ...buildP15AssumptionResult(assumedLevel) };
  if (Number(parameterId) === 21) return { ...buildP21AssumptionResult(assumedLevel) };
  return measuredResult;
}

/** Derive the P15 display value (e.g. "NCB 22") from an assumed level. Defaults to L2 / NCB 22. */
export function getAssumedP15DisplayValue(level) {
  const lvl = getEffectiveAssumedLevel(level);
  return `NCB ${P15_LEVEL_TO_NCB[lvl]}`;
}

/** Derive the P21 display value from an assumed level. Defaults to L2 / −8 dB. */
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