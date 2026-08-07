// Canonical P12 target-basis authority.
//
// The sole legal runtime values for appState.p12Mode are:
//   "minimum" | "recommended"
//
// Legacy projects may have stored the old radiation vocabulary:
//   half-space -> minimum
//   anechoic   -> recommended
//
// `radiationMode` (in splConfig) is a SEPARATE acoustical configuration
// value and must NOT be coupled to p12Mode after migration.

export const P12_MODE_MINIMUM = "minimum";
export const P12_MODE_RECOMMENDED = "recommended";

const LEGACY_MAP = {
  "half-space": P12_MODE_MINIMUM,
  "anechoic": P12_MODE_RECOMMENDED,
  "minimum": P12_MODE_MINIMUM,
  "recommended": P12_MODE_RECOMMENDED,
};

/**
 * Migrate any raw persisted value to a canonical p12Mode.
 * - Legacy vocabulary is translated (half-space/anechoic).
 * - Valid canonical values pass through.
 * - Unknown / missing / null / undefined -> "minimum" (safe default).
 */
export function migrateP12Mode(raw) {
  const v = LEGACY_MAP[String(raw)];
  return v === P12_MODE_RECOMMENDED ? P12_MODE_RECOMMENDED : P12_MODE_MINIMUM;
}

export function isCanonicalP12Mode(v) {
  return v === P12_MODE_MINIMUM || v === P12_MODE_RECOMMENDED;
}