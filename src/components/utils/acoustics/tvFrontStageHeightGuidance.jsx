// components/utils/acoustics/tvFrontStageHeightGuidance.js
// Pure utility for TV-specific front-stage height guidance.
// Separate from the projector / acoustically transparent screen acoustic centre band.
// No React. No imports. No side effects.

/**
 * Calculate TV-specific front-stage height guidance.
 *
 * @param {Object} params
 * @param {boolean} params.isTv - Whether a TV preset is active
 * @param {string}  params.frontStageMode - "standard" | "center_only" | "integrated_lcr"
 * @param {number}  params.screenBottomHeightM - Bottom edge of TV image from floor (m)
 * @param {number}  params.viewableImageHeightM - Viewable image height (m)
 * @param {number}  params.soundbarHeightM - Physical height of soundbar model (m) — used in soundbar modes
 * @param {number}  params.placementOffsetFromScreenBottomMm - Fixed gap below TV bottom to soundbar top (mm)
 * @param {number}  params.currentAcousticCentreM - Current LCR speaker acoustic centre height (m)
 * @returns {Object} Guidance object
 */
export function calculateTvFrontStageHeightGuidance({
  isTv,
  frontStageMode,
  screenBottomHeightM,
  viewableImageHeightM,
  soundbarHeightM,
  placementOffsetFromScreenBottomMm,
  currentAcousticCentreM,
} = {}) {

  // Rule 1: Not a TV — guidance not applicable.
  if (!isTv) {
    return {
      isValid: false,
      mode: 'not_tv',
      status: 'unknown',
      explanationText: 'TV front-stage guidance is not applicable.',
    };
  }

  const screenBottom = Number(screenBottomHeightM);
  const imageHeight  = Number(viewableImageHeightM);
  const currentAC   = Number(currentAcousticCentreM);

  // Rule 6: Guard core inputs needed by all modes.
  if (!Number.isFinite(screenBottom) || !Number.isFinite(imageHeight) || imageHeight <= 0) {
    return {
      isValid: false,
      mode: frontStageMode === 'standard' ? 'tv_separate_lcr' : 'tv_soundbar',
      status: 'unknown',
      explanationText: 'Screen dimensions are not available.',
    };
  }

  // Rule 2: Shared derived value.
  const screenCentreHeightM = screenBottom + imageHeight / 2;

  const hasCurrentAC = Number.isFinite(currentAC);

  // ─── Rule 3: Separate LCR speakers with TV ───────────────────────────────
  if (frontStageMode === 'standard') {
    const ideal = screenCentreHeightM;
    let status = 'unknown';
    if (hasCurrentAC) {
      const delta = currentAC - ideal;
      if (Math.abs(delta) <= 0.05)  status = 'ideal';
      else if (delta < 0)           status = 'below';
      else                          status = 'above';
    }

    return {
      isValid: true,
      mode: 'tv_separate_lcr',
      idealHeightM: ideal,
      screenCentreHeightM,
      currentAcousticCentreM: hasCurrentAC ? currentAC : null,
      status,
      explanationText:
        'For TV layouts with separate left/right speakers, align the speaker acoustic centre with the middle of the TV image where practical.',
    };
  }

  // ─── Rule 4: Soundbar modes (center_only or integrated_lcr) ──────────────
  if (frontStageMode === 'center_only' || frontStageMode === 'integrated_lcr') {
    const sbHeight = Number(soundbarHeightM);

    // Rule 7: Soundbar height must be valid in soundbar modes.
    if (!Number.isFinite(sbHeight) || sbHeight <= 0) {
      return {
        isValid: false,
        mode: 'tv_soundbar',
        status: 'unknown',
        explanationText: 'Soundbar dimensions are not available.',
      };
    }

    const rawOffsetMm = Number(placementOffsetFromScreenBottomMm);
    const placementOffsetM = Number.isFinite(rawOffsetMm) && rawOffsetMm >= 0
      ? rawOffsetMm / 1000
      : 0.02; // fallback 20 mm

    // soundbar top sits (placementOffsetM) below screenBottom;
    // soundbar centre is half the physical height below that top edge.
    const soundbarCentreHeightM = screenBottom - placementOffsetM - sbHeight / 2;

    let status = 'unknown';
    if (hasCurrentAC) {
      const delta = currentAC - soundbarCentreHeightM;
      if (Math.abs(delta) <= 0.03)  status = 'ideal';
      else if (delta < 0)           status = 'below';
      else                          status = 'above';
    }

    return {
      isValid: true,
      mode: 'tv_soundbar',
      idealHeightM: soundbarCentreHeightM,
      soundbarCentreHeightM,
      screenCentreHeightM,
      placementOffsetM,
      currentAcousticCentreM: hasCurrentAC ? currentAC : null,
      status,
      explanationText:
        'For TV soundbar layouts, the soundbar is positioned at the fixed design offset below the TV screen.',
    };
  }

  // Unrecognised mode — return safe fallback.
  return {
    isValid: false,
    mode: 'unknown',
    status: 'unknown',
    explanationText: 'Unrecognised front-stage mode.',
  };
}