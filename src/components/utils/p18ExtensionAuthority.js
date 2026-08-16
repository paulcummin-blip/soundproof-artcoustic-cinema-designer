// Single RP22 authority for Parameter 18 grading, display rounding, and
// Artcoustic System Design Rating performance bands.
//
// RP22 reporting uses favourable whole-Hz resolution: the measured in-room
// -3 dB point remains precise internally, while grading uses Math.floor.
// Therefore 35.99 Hz is assessed as 35 Hz and exactly 36 Hz is FAIL.

export const P18_TARGET_BASIS_MINIMUM = "minimum";
export const P18_TARGET_BASIS_RECOMMENDED = "recommended";

export const P18_THRESHOLDS_BY_BASIS = Object.freeze({
  minimum: Object.freeze({ L1: 35, L2: 30, L3: 20, L4: 18 }),
  recommended: Object.freeze({ L1: 30, L2: 25, L3: 18, L4: 15 }),
});

// Six unique physical achievements across the eight RP22 Min./Rec. outcomes.
// 30 Hz and 18 Hz each occur in both rows and therefore share the same score
// wherever they occur; every different frequency receives a different score.
export const P18_PERFORMANCE_BANDS = Object.freeze([
  Object.freeze({ band: 6, maximumHz: 15, multiplier: 12, label: "Recommended L4" }),
  Object.freeze({ band: 5, maximumHz: 18, multiplier: 10, label: "Minimum L4 / Recommended L3" }),
  Object.freeze({ band: 4, maximumHz: 20, multiplier: 8, label: "Minimum L3" }),
  Object.freeze({ band: 3, maximumHz: 25, multiplier: 6, label: "Recommended L2" }),
  Object.freeze({ band: 2, maximumHz: 30, multiplier: 4, label: "Minimum L2 / Recommended L1" }),
  Object.freeze({ band: 1, maximumHz: 35, multiplier: 2, label: "Minimum L1" }),
]);

export function normalizeP18TargetBasis(value) {
  return value === P18_TARGET_BASIS_RECOMMENDED
    ? P18_TARGET_BASIS_RECOMMENDED
    : P18_TARGET_BASIS_MINIMUM;
}

export function resolveP18DesignHz(rawHz) {
  const value = Number(rawHz);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}

export function p18ThresholdsForBasis(basis) {
  return P18_THRESHOLDS_BY_BASIS[normalizeP18TargetBasis(basis)];
}

export function p18ThresholdHzForLevel(basis, level) {
  const numericLevel = Math.max(1, Math.min(4, Math.round(Number(level) || 4)));
  return p18ThresholdsForBasis(basis)[`L${numericLevel}`];
}

export function gradeP18ForBasis(rawHz, basis = P18_TARGET_BASIS_MINIMUM) {
  const designHz = resolveP18DesignHz(rawHz);
  if (designHz == null) return 0;
  const thresholds = p18ThresholdsForBasis(basis);
  if (designHz <= thresholds.L4) return 4;
  if (designHz <= thresholds.L3) return 3;
  if (designHz <= thresholds.L2) return 2;
  if (designHz <= thresholds.L1) return 1;
  return 0;
}

export function p18PerformanceBand(rawHz) {
  const designHz = resolveP18DesignHz(rawHz);
  if (designHz == null) return null;
  return P18_PERFORMANCE_BANDS.find(({ maximumHz }) => designHz <= maximumHz)?.band ?? 0;
}

export function p18PerformanceMultiplier(rawHz) {
  const designHz = resolveP18DesignHz(rawHz);
  if (designHz == null) return null;
  return P18_PERFORMANCE_BANDS.find(({ maximumHz }) => designHz <= maximumHz)?.multiplier ?? -5;
}

export function assessP18Extension(rawHz, basis = P18_TARGET_BASIS_MINIMUM) {
  const targetBasis = normalizeP18TargetBasis(basis);
  const designHz = resolveP18DesignHz(rawHz);
  if (designHz == null) {
    return {
      rawHz: null,
      designHz: null,
      targetBasis,
      level: null,
      levelLabel: null,
      performanceBand: null,
      performanceMultiplier: null,
      passed: null,
    };
  }
  const level = gradeP18ForBasis(designHz, targetBasis);
  const performanceBand = p18PerformanceBand(designHz);
  const performanceMultiplier = p18PerformanceMultiplier(designHz);
  return {
    rawHz: Number(rawHz),
    designHz,
    targetBasis,
    level,
    levelLabel: level > 0 ? `L${level}` : "FAIL",
    performanceBand,
    performanceMultiplier,
    passed: level > 0,
  };
}

export function formatP18TargetBasisDetail(basis) {
  const normalized = normalizeP18TargetBasis(basis);
  const thresholds = p18ThresholdsForBasis(normalized);
  return `${normalized === "recommended" ? "Recommended" : "Minimum"} · L1 ${thresholds.L1} Hz · L2 ${thresholds.L2} Hz · L3 ${thresholds.L3} Hz · L4 ${thresholds.L4} Hz`;
}
