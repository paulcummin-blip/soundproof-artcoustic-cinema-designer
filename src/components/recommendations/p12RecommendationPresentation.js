/**
 * p12RecommendationPresentation.js
 * --------------------------------
 * Stage E1 — P12/P13 dual Minimum/Recommended presentation formatter.
 *
 * Replaces the single active-mode "P12: L3 → L4" collapse with a concise dual
 * result that distinguishes Minimum from Recommended performance and shows the
 * raw solved dB. This is presentation only — it does not change ranking, which
 * continues to use unique physical threshold crossings (Stage B impact vector).
 *
 * Example outputs:
 *   "P12: 111 dBC · Minimum L3 → L4 · Recommended L2 → L4"
 *   "P12: 109 dBC · Minimum L4 · Recommended L3"
 */

import { resolveRp22DesignValue } from "@/components/utils/rp22/resolveRp22DesignValue";

function isLevel(v) {
  return typeof v === "string" && /^L[1-4]$/.test(v);
}

function designDb(paramId, rawDb) {
  const v = Number(rawDb);
  if (!Number.isFinite(v)) return null;
  return resolveRp22DesignValue(paramId, v);
}

/**
 * Format one parameter (P12 or P13) as a dual Min/Rec consequence string.
 * Returns null when no candidate level is available.
 */
function formatDualConsequence(label, rawDb, baselineMin, candidateMin, baselineRec, candidateRec) {
  const paramId = parseInt(String(label).replace(/\D/g, ""), 10) || 12;
  const raw = Number(rawDb);
  const rawText = Number.isFinite(raw) ? `${resolveRp22DesignValue(paramId, raw)} dBC` : null;

  const minChanged = isLevel(baselineMin) && isLevel(candidateMin) && baselineMin !== candidateMin;
  const recChanged = isLevel(baselineRec) && isLevel(candidateRec) && baselineRec !== candidateRec;

  const minText = minChanged
    ? `Minimum ${baselineMin} → ${candidateMin}`
    : isLevel(candidateMin)
      ? `Minimum ${candidateMin}`
      : null;
  const recText = recChanged
    ? `Recommended ${baselineRec} → ${candidateRec}`
    : isLevel(candidateRec)
      ? `Recommended ${candidateRec}`
      : null;

  const parts = [rawText, minText, recText].filter(Boolean);
  if (parts.length === 0) return null;
  return `${label}: ${parts.join(" · ")}`;
}

/**
 * Build P12/P13 consequence strings for a recommendation item.
 * Returns an array (empty when no P12/P13 data is available).
 */
export function formatP12P13Consequences(item) {
  const out = [];
  const p12 = formatDualConsequence(
    "P12",
    item?.p12RawDb,
    item?.p12BaselineMinimumLevel,
    item?.p12MinimumLevel,
    item?.p12BaselineRecommendedLevel,
    item?.p12RecommendedLevel,
  );
  if (p12) out.push(p12);
  const p13 = formatDualConsequence(
    "P13",
    item?.p13RawDb,
    item?.p13BaselineMinimumLevel,
    item?.p13MinimumLevel,
    item?.p13BaselineRecommendedLevel,
    item?.p13RecommendedLevel,
  );
  if (p13) out.push(p13);
  return out;
}

/**
 * Non-scoring calibration headroom flag. True when an LCR upgrade candidate
 * materially increases available capability (stronger model and/or more useful
 * amplifier power). Used for a short narrative note only — never an RP22 level
 * and never ranking weight.
 */
export function hasAdditionalCalibrationHeadroom(item) {
  if (!item || item?.kind !== "lcr" || item?.recommendationDirection !== "upgrade") return false;
  const candidateCap = Number(item?.candidateModelCapabilityDb);
  const currentCap = Number(item?.currentModelCapabilityDb);
  if (Number.isFinite(candidateCap) && Number.isFinite(currentCap) && candidateCap > currentCap) return true;
  return item?.amplifierUpgradeRequired === true;
}

// ── Stage E1: Structured LCR capability presentation ──────────────────

/**
 * Format one level consequence line: "Minimum L3 → L4" or "Minimum L4".
 */
function formatLevelLine(label, baselineLevel, candidateLevel) {
  const changed = isLevel(baselineLevel) && isLevel(candidateLevel) && baselineLevel !== candidateLevel;
  if (changed) return `${label} ${baselineLevel} → ${candidateLevel}`;
  if (isLevel(candidateLevel)) return `${label} ${candidateLevel}`;
  return null;
}

/**
 * Format the P12 capability line: "P12: 106 → 113 dBC (+7 dB)"
 * Returns null when no candidate design value is available.
 */
export function formatP12CapabilityLine(item) {
  const candidateDesign = designDb(12, item?.p12RawDb);
  const baselineDesign = designDb(12, item?.p12BaselineRawDb);
  if (candidateDesign == null) return null;
  if (baselineDesign != null) {
    const gain = candidateDesign - baselineDesign;
    const gainText = gain > 0 ? ` (+${gain} dB)` : gain < 0 ? ` (${gain} dB)` : "";
    return `P12: ${baselineDesign} → ${candidateDesign} dBC${gainText}`;
  }
  return `P12: ${candidateDesign} dBC`;
}

/**
 * Format the P13 capability line: "P13: 102 → 105 dBC (+3 dB)"
 */
export function formatP13CapabilityLine(item) {
  const candidateDesign = designDb(13, item?.p13RawDb);
  const baselineDesign = designDb(13, item?.p13BaselineRawDb);
  if (candidateDesign == null) return null;
  if (baselineDesign != null) {
    const gain = candidateDesign - baselineDesign;
    const gainText = gain > 0 ? ` (+${gain} dB)` : gain < 0 ? ` (${gain} dB)` : "";
    return `P13: ${baselineDesign} → ${candidateDesign} dBC${gainText}`;
  }
  return `P13: ${candidateDesign} dBC`;
}

/**
 * Format P12 Minimum/Recommended consequence lines.
 * Returns { minLine, recLine } or null.
 */
export function formatP12MinRecLines(item) {
  const minLine = formatLevelLine("Minimum", item?.p12BaselineMinimumLevel, item?.p12MinimumLevel);
  const recLine = formatLevelLine("Recommended", item?.p12BaselineRecommendedLevel, item?.p12RecommendedLevel);
  return (minLine || recLine) ? { minLine, recLine } : null;
}

/**
 * Format P13 Minimum/Recommended consequence lines.
 */
export function formatP13MinRecLines(item) {
  const minLine = formatLevelLine("Minimum", item?.p13BaselineMinimumLevel, item?.p13MinimumLevel);
  const recLine = formatLevelLine("Recommended", item?.p13BaselineRecommendedLevel, item?.p13RecommendedLevel);
  return (minLine || recLine) ? { minLine, recLine } : null;
}

/**
 * Format capability reserve: "Capability reserve: +2 dB above Recommended L4"
 * Returns null when reserve <= 0 or not available.
 */
export function formatCapabilityReserveText(item) {
  const reserveDb = Number(item?.p12CapabilityReserveDb);
  if (!Number.isFinite(reserveDb) || reserveDb <= 0) return null;
  return `Capability reserve: +${Math.round(reserveDb)} dB above Recommended L4`;
}

/**
 * Format amplification guidance for LCR candidates.
 * Case A: No amplifier change — "No amplifier change required · Full modelled capability reached at approximately X W/ch"
 * Case B/C: Amplifier upgrade — "Recommended amplification: approximately X W/ch"
 * Returns null for non-LCR candidates or when useful power is not available.
 */
export function formatAmplificationGuidance(item) {
  if (item?.kind !== "lcr") return null;
  const usefulPowerW = Number(item?.usefulPowerW);
  if (!Number.isFinite(usefulPowerW) || usefulPowerW <= 0) return null;

  if (item?.amplifierUpgradeRequired === true) {
    return `Recommended amplification: approximately ${Math.round(usefulPowerW)} W/ch`;
  }

  return `No amplifier change required · Full modelled capability reached at approximately ${Math.round(usefulPowerW)} W/ch`;
}