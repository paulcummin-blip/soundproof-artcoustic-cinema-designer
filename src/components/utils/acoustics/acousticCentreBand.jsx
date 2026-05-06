// components/utils/acoustics/acousticCentreBand.js
// ─────────────────────────────────────────────────────────────────────────────
// SHARED UTILITY — LCR Acoustic Centre Height Guidance
//
// Pure calculation — no React, no imports, no side effects.
// This is design guidance only. It does NOT create an RP22 pass/fail parameter.
//
// Design intent:
//   - RP22 treats screen speaker positions as recommended zones, not strict points.
//   - The acoustic centre should fall within the middle third of the viewable
//     image height where practical.
//   - Listener-level speakers should be at or slightly above seated ear height.
//   - For Artcoustic LCR speakers, speaker.position.z is the acoustic centre
//     (tweeter is at cabinet midpoint).
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_EAR_HEIGHT_M = 1.2;
const DEFAULT_SCREEN_BOTTOM_M = 0;
const DEFAULT_IMAGE_HEIGHT_M = 0;

/**
 * Clamp a value between min and max.
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Format a height value in metres for UI display.
 * Returns "—" for invalid inputs, otherwise "x.xx m".
 *
 * @param {*} value
 * @returns {string}
 */
export function formatHeightM(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(2)} m`;
}

/**
 * Calculate live LCR acoustic centre height guidance for screen wall speakers.
 *
 * @param {Object} params
 * @param {number} params.screenBottomHeightM   - Height from floor to bottom of viewable image (m)
 * @param {number} params.viewableImageHeightM  - Viewable image height (m)
 * @param {number} params.seatedEarHeightM      - Listener ear height (m), defaults to 1.2m
 * @param {number} params.speakerHeightM        - Physical height of the LCR cabinet (m), informational only
 * @param {number} params.currentAcousticCentreM - Current speaker.position.z (m)
 *
 * @returns {{
 *   isValid: boolean,
 *   screenTopM: number|null,
 *   imageMiddleThirdBottomM: number|null,
 *   imageMiddleThirdTopM: number|null,
 *   minHeightM: number|null,
 *   idealHeightM: number|null,
 *   maxHeightM: number|null,
 *   currentAcousticCentreM: number|null,
 *   status: "ideal"|"below"|"above"|"unknown",
 *   explanationText: string
 * }}
 */
export function calculateLcrAcousticCentreBand({
  screenBottomHeightM,
  viewableImageHeightM,
  seatedEarHeightM,
  speakerHeightM,
  currentAcousticCentreM,
} = {}) {

  // ── Defensive input resolution ──────────────────────────────────────────
  const screenBottom = Number.isFinite(Number(screenBottomHeightM))
    ? Number(screenBottomHeightM)
    : DEFAULT_SCREEN_BOTTOM_M;

  const imageHeight = Number.isFinite(Number(viewableImageHeightM))
    ? Number(viewableImageHeightM)
    : DEFAULT_IMAGE_HEIGHT_M;

  const earHeight = Number.isFinite(Number(seatedEarHeightM)) && Number(seatedEarHeightM) > 0
    ? Number(seatedEarHeightM)
    : DEFAULT_EAR_HEIGHT_M;

  const currentZ = Number.isFinite(Number(currentAcousticCentreM))
    ? Number(currentAcousticCentreM)
    : null;

  // ── Guard: screen geometry must be valid ─────────────────────────────────
  if (imageHeight <= 0) {
    return {
      isValid: false,
      screenTopM: null,
      imageMiddleThirdBottomM: null,
      imageMiddleThirdTopM: null,
      minHeightM: null,
      idealHeightM: null,
      maxHeightM: null,
      currentAcousticCentreM: currentZ,
      status: "unknown",
      explanationText:
        "Screen geometry is unavailable. Set screen size and height to see LCR acoustic centre guidance.",
    };
  }

  // ── Core calculations ────────────────────────────────────────────────────
  const screenTopM = screenBottom + imageHeight;
  const imageMiddleThirdBottomM = screenBottom + imageHeight / 3;
  const imageMiddleThirdTopM = screenBottom + (imageHeight * 2) / 3;

  // The recommended range must be at least at ear height, and within the image middle third.
  const earGuidanceMinM = earHeight;
  const minHeightM = Math.max(earGuidanceMinM, imageMiddleThirdBottomM);
  const maxHeightM = imageMiddleThirdTopM;

  // Ideal: slightly above ear height, clamped to the valid band.
  // If the band is inverted (ear level is above the middle third), minHeightM === maxHeightM === imageMiddleThirdTopM.
  const idealHeightM = clamp(earHeight + 0.1, minHeightM, maxHeightM);

  // ── Status ───────────────────────────────────────────────────────────────
  let status;
  if (currentZ === null) {
    status = "unknown";
  } else if (currentZ < minHeightM) {
    status = "below";
  } else if (currentZ > maxHeightM) {
    status = "above";
  } else {
    status = "ideal";
  }

  // ── Explanation text ─────────────────────────────────────────────────────
  let explanationText;
  const bandStr = `${formatHeightM(minHeightM)} – ${formatHeightM(maxHeightM)}`;

  switch (status) {
    case "ideal":
      explanationText = `Acoustic centre at ${formatHeightM(currentZ)} is within the recommended band (${bandStr}). Aligned with screen middle third and seated ear level.`;
      break;
    case "below":
      explanationText = `Acoustic centre at ${formatHeightM(currentZ)} is below the recommended band (${bandStr}). Consider raising the speaker or screen.`;
      break;
    case "above":
      explanationText = `Acoustic centre at ${formatHeightM(currentZ)} is above the recommended band (${bandStr}). Consider lowering the speaker or raising the screen bottom.`;
      break;
    case "unknown":
    default:
      explanationText = `Recommended acoustic centre band: ${bandStr}. No current speaker height available to evaluate.`;
      break;
  }

  return {
    isValid: true,
    screenTopM,
    imageMiddleThirdBottomM,
    imageMiddleThirdTopM,
    minHeightM,
    idealHeightM,
    maxHeightM,
    currentAcousticCentreM: currentZ,
    status,
    explanationText,
  };
}