/**
 * Projector light-output recommendation — single source of truth.
 *
 * Product rule: the recommended projector output is the light needed to reach
 * a 108 nit on-screen target through a 0.75 gain projection screen:
 *
 *   lumens = targetNits × visibleArea_m² × π / screenGain
 *
 * Both the value AND the assumption wording are exported from here, so every
 * consumer (visual report card, print/PDF, proposals, summaries) states the
 * same basis and the number can never drift from the sentence describing it.
 *
 * 0.6 gain is superseded. It must not be used in the active recommendation.
 */

/** Target on-screen brightness in nits. */
export const PROJECTOR_TARGET_NITS = 108;

/** Assumed screen gain for the recommendation. */
export const PROJECTOR_SCREEN_GAIN = 0.75;

/**
 * Assumption sentence shown wherever the recommendation is displayed.
 * Kept beside the constants so the stated basis always matches the maths.
 */
export const PROJECTOR_BASIS_COPY = `Based on ${PROJECTOR_TARGET_NITS} nits on a ${PROJECTOR_SCREEN_GAIN} gain screen`;

/**
 * Visible screen aspect ratio as a numeric ratio (defaults to 16:9).
 */
export function parseAspectRatio(arStr) {
  const str = (arStr || "16:9").toString();
  const parts = str.includes(":") ? str.split(":").map(Number) : [16, 9];
  const [arW, arH] = parts;
  return (Number.isFinite(arW) && Number.isFinite(arH) && arW > 0 && arH > 0)
    ? arW / arH
    : 16 / 9;
}

/**
 * Required projector output for the given visible screen width, rounded to
 * the nearest 10 lumens to avoid implying false precision.
 *
 * @param {number} screenWidthM - visible screen width in metres
 * @param {string} aspectRatio - e.g. "16:9" or "2.35:1"
 * @returns {number|null} lumens, or null when no usable width is supplied
 */
export function computeProjectorLumens(screenWidthM, aspectRatio) {
  const width = Number(screenWidthM);
  if (!width || width <= 0) return null;
  const visibleHeightM = width / parseAspectRatio(aspectRatio);
  const lumens =
    (PROJECTOR_TARGET_NITS * Math.PI * width * visibleHeightM) / PROJECTOR_SCREEN_GAIN;
  return Math.round(lumens / 10) * 10;
}