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

function isLevel(v) {
  return typeof v === "string" && /^L[1-4]$/.test(v);
}

/**
 * Format one parameter (P12 or P13) as a dual Min/Rec consequence string.
 * Returns null when no candidate level is available.
 */
function formatDualConsequence(label, rawDb, baselineMin, candidateMin, baselineRec, candidateRec) {
  const raw = Number(rawDb);
  const rawText = Number.isFinite(raw) ? `${Math.round(raw)} dBC` : null;

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