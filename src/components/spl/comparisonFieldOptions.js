// comparisonFieldOptions.js
// ---------------------------------------------------------------------------
// Pure, dependency-free option lists for the competitor comparison form and the
// ADI source-reading path. Kept in a standalone module so the parity-mapping
// logic (adiParityMapping.js) and its tests can import them without pulling the
// base44/AuthContext chain.
// ---------------------------------------------------------------------------

export const SENSITIVITY_REFERENCES = [
  { value: "2.83V/1m", label: "2.83 V / 1 m" },
  { value: "1W/1m", label: "1 W / 1 m" },
  { value: "unknown", label: "Not stated" },
];

export const POWER_BASES = [
  { value: "amplifier", label: "Recommended amplifier maximum" },
  { value: "continuous", label: "Continuous speaker rating" },
];

export const MEASUREMENT_SPACES = [
  { value: "unspecified", label: "Unspecified" },
  { value: "half-space", label: "Half Space" },
  { value: "free-space", label: "Full Space" },
];

// How the manufacturer states a published maximum SPL. The stored values are the
// existing basis vocabulary, so the RP22 evidence authority classifies them
// exactly as it classifies every other model. A peak / short-term figure is kept
// distinct from continuous — it is useful evidence but is not continuous
// capability, and the comparison reflects that uncertainty.
export const SPL_BASES = [
  { value: "continuous", label: "Measured / rated (continuous) figure" },
  { value: "calculated", label: "Calculated figure" },
  { value: "peak", label: "Peak / short-term (not continuous)" },
  { value: "manufacturer unspecified", label: "Not stated" },
];