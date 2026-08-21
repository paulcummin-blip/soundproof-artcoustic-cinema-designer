/**
 * roomParameterLevelAuthority.js
 * ------------------------------
 * Canonical room-parameter level resolver shared by:
 *   - RP22ReportParameterGrid (detailed cards, pages 7–13)
 *   - TechnicalPerformanceSummary (Page 3 room summary)
 *
 * This ensures Page 3 and the detailed cards can never disagree on
 * room-parameter grading (e.g. P12/P13 mode-aware re-grading).
 */

import { getP21PresetResult, levelP21_earlyReflections } from "@/components/utils/rp22/levels";
import { p18ThresholdsForBasis } from "@/components/utils/p18ExtensionAuthority";

/* ---------- P12/P13/P14 mode-aware threshold resolver ---------- */

const P12_THRESHOLDS_MINIMUM = { direction: ">=", L1: 99, L2: 102, L3: 105, L4: 108 };
const P12_THRESHOLDS_RECOMMENDED = { direction: ">=", L1: 102, L2: 105, L3: 108, L4: 111 };
const P13_THRESHOLDS_MINIMUM = { direction: ">=", L1: 96, L2: 99, L3: 102, L4: 105 };
const P13_THRESHOLDS_RECOMMENDED = { direction: ">=", L1: 99, L2: 102, L3: 105, L4: 108 };
const P14_THRESHOLDS_MINIMUM = { direction: ">=", L1: 109, L2: 112, L3: 115, L4: 118 };
const P14_THRESHOLDS_RECOMMENDED = { direction: ">=", L1: 114, L2: 117, L3: 120, L4: 123 };

export function resolveParamThresholds(param, p12Mode, p13Mode, p14Mode, p18Mode) {
  if (param.id === 12) {
    return p12Mode === "recommended" ? P12_THRESHOLDS_RECOMMENDED : P12_THRESHOLDS_MINIMUM;
  }
  if (param.id === 13) {
    return p13Mode === "recommended" ? P13_THRESHOLDS_RECOMMENDED : P13_THRESHOLDS_MINIMUM;
  }
  if (param.id === 14) return p14Mode === "recommended" ? P14_THRESHOLDS_RECOMMENDED : P14_THRESHOLDS_MINIMUM;
  // P18 is basis-aware: the completed bass authority grades under Minimum or Recommended.
  // Use the same p18ThresholdsForBasis authority as the engine — never the flat legacy
  // `levels` field (which equals the Recommended row and would mislabel a Minimum result).
  if (param.id === 18) {
    const basis = p18Mode === "recommended" ? "recommended" : "minimum";
    return { ...param.thresholds, ...p18ThresholdsForBasis(basis) };
  }
  return param.thresholds;
}

/* ---------- P12/P13 dual Minimum/Recommended level resolver ---------- */

/**
 * Resolve both Minimum and Recommended levels for P12/P13 from a single
 * quantised design value. Returns { minimum: "L4"|…|"—", recommended: … }
 * using the canonical threshold tables. Presentation-only — does not
 * change which level the grid pill shows (that follows the active mode).
 */
const LEVEL_FROM_VALUE = (v, t) => {
  if (!Number.isFinite(v)) return "—";
  if (v >= t.L4) return "L4";
  if (v >= t.L3) return "L3";
  if (v >= t.L2) return "L2";
  if (v >= t.L1) return "L1";
  return "—";
};

export function resolveP12P13DualLevels(paramId, value) {
  const pid = Number(paramId);
  if (pid === 12) {
    return {
      minimum: LEVEL_FROM_VALUE(value, P12_THRESHOLDS_MINIMUM),
      recommended: LEVEL_FROM_VALUE(value, P12_THRESHOLDS_RECOMMENDED),
    };
  }
  if (pid === 13) {
    return {
      minimum: LEVEL_FROM_VALUE(value, P13_THRESHOLDS_MINIMUM),
      recommended: LEVEL_FROM_VALUE(value, P13_THRESHOLDS_RECOMMENDED),
    };
  }
  return null;
}

/* ---------- Level normalisation ---------- */

export function normalizeRoomLevel(rawLevel) {
  if (rawLevel == null) return null;
  if (typeof rawLevel === "number" && Number.isFinite(rawLevel)) {
    if (rawLevel >= 1 && rawLevel <= 4) return `L${rawLevel}`;
    return null;
  }
  if (typeof rawLevel === "string") {
    const m = rawLevel.trim().match(/^L([1-4])$/i);
    if (m) return `L${m[1]}`;
  }
  return null;
}

/* ---------- Canonical room-parameter level resolver ---------- */

export function resolveRoomParameterLevel(paramId, {
  analysisResult,
  p12Mode = "minimum",
  p13Mode = "minimum",
  p14Mode = "minimum",
  p15ConstructionLevel = "standard",
  p21EarlyReflectionPreset = "l2",
  bassPresentation,
}) {
  const pid = Number(paramId);

  // Bass-authority parameters
  if ([14, 18, 19].includes(pid)) {
    return bassPresentation?.parameters?.[`p${pid}`]?.level ?? "—";
  }
  if (pid === 20) {
    return bassPresentation?.parameters?.p20?.level ?? "—";
  }

  const res = analysisResult?.gradedParameters?.primary?.[pid] || null;

  // P12/P13: re-grade from raw value using user-selected mode thresholds
  if ((pid === 12 || pid === 13) && res && res.status !== "no_data" && Number.isFinite(res.value)) {
    const thresholds = pid === 12
      ? (p12Mode === "recommended" ? P12_THRESHOLDS_RECOMMENDED : P12_THRESHOLDS_MINIMUM)
      : (p13Mode === "recommended" ? P13_THRESHOLDS_RECOMMENDED : P13_THRESHOLDS_MINIMUM);
    const v = res.value;
    if (v >= thresholds.L4) return "L4";
    if (v >= thresholds.L3) return "L3";
    if (v >= thresholds.L2) return "L2";
    if (v >= thresholds.L1) return "L1";
    return "—";
  }

  if (pid === 21 && res?.status === "error") return "—";
  if (pid === 21 && res && res.status !== "no_data" && res.status !== "fail" && Number.isFinite(res.value)) {
    return levelP21_earlyReflections(res.value).level;
  }
  if (res && res.status !== "no_data" && res.status !== "fail" && res.level != null) return res.level;
  if (pid === 3) {
    const p3 = analysisResult?.gradedParameters?.primary?.[3];
    return (p3 && p3.status === "ok") ? p3.level : "—";
  }
  if (pid === 8) return "L4";
  if (pid === 11) return "L4";
  if (pid === 15) {
    const MAP = { standard: "L1", "purpose-built": "L2", reference: "L3", studio: "L4" };
    return MAP[p15ConstructionLevel || "standard"] || "—";
  }
  if (pid === 21) return getP21PresetResult(p21EarlyReflectionPreset || "l2").level;
  return "—";
}