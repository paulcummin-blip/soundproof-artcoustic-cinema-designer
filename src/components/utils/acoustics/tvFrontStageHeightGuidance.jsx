// components/utils/acoustics/tvFrontStageHeightGuidance.js
// Pure utility — no React, no imports, no side effects.
// Calculates TV-specific front-stage height guidance.
// For projector / AT screen guidance, use acousticCentreBand.js instead.

/**
 * @param {object} params
 * @param {boolean}      params.isTv
 * @param {string}       params.frontStageMode          "standard" | "center_only" | "integrated_lcr"
 * @param {number|null}  params.screenBottomHeightM     Height of TV bottom edge from floor (m)
 * @param {number|null}  params.viewableImageHeightM    Viewable image height (m)
 * @param {number|null}  params.soundbarHeightM         Physical height of soundbar model (m) — only used in soundbar modes
 * @param {number|null}  params.placementOffsetFromScreenBottomMm  Fixed offset below TV bottom (mm) from speaker registry
 * @param {number|null}  params.currentAcousticCentreM  Current speaker acoustic centre height (m)
 * @returns {object}
 */
export function calculateTvFrontStageHeightGuidance({
  isTv,
  frontStageMode,
  screenBottomHeightM,
  viewableImageHeightM,
  soundbarHeightM,
  placementOffsetFromScreenBottomMm,
  currentAcousticCentreM,
}) {
  // ── 1. Not a TV ──────────────────────────────────────────────────────────
  if (!isTv) {
    return {
      isValid: false,
      mode: 'not_tv',
      status: 'unknown',
      explanationText: 'TV front-stage guidance is not applicable.',
    };
  }

  // ── Guard: core screen geometry must be finite ────────────────────────────
  const screenBottom = Number(screenBottomHeightM);
  const imageHeight  = Number(viewableImageHeightM);

  if (!Number.isFinite(screenBottom) || !Number.isFinite(imageHeight) || imageHeight <= 0) {
    return {
      isValid: false,
      mode: frontStageMode === 'standard' ? 'tv_separate_lcr' : 'tv_soundbar',
      status: 'unknown',
      explanationText: 'Screen geometry data is missing or invalid.',
    };
  }

  // ── 2. Shared derived value ───────────────────────────────────────────────
  const screenCentreHeightM = screenBottom + imageHeight / 2;

  const currentIsValid = Number.isFinite(Number(currentAcousticCentreM));
  const current = currentIsValid ? Number(currentAcousticCentreM) : null;

  // ── 3. Separate LCR speakers with TV ─────────────────────────────────────
  if (frontStageMode === 'standard') {
    const TOLERANCE_M = 0.05;

    let status = 'unknown';
    if (current !== null) {
      const diff = current - screenCentreHeightM;
      if (Math.abs(diff) <= TOLERANCE_M) status = 'ideal';
      else if (diff < 0)                  status = 'below';
      else                                status = 'above';
    }

    return {
      isValid: true,
      mode: 'tv_separate_lcr',
      idealHeightM: screenCentreHeightM,
      currentAcousticCentreM: current,
      status,
      explanationText:
        'For TV layouts with separate left/right speakers, align the speaker acoustic centre with the middle of the TV image where practical.',
    };
  }

  // ── 4. Soundbar modes: center_only or integrated_lcr ─────────────────────
  if (frontStageMode === 'center_only' || frontStageMode === 'integrated_lcr') {
    const soundbarH = Number(soundbarHeightM);
    if (!Number.isFinite(soundbarH) || soundbarH <= 0) {
      return {
        isValid: false,
        mode: 'tv_soundbar',
        status: 'unknown',
        explanationText: 'Soundbar height data is missing or invalid.',
      };
    }

    const rawOffsetMm = Number(placementOffsetFromScreenBottomMm);
    const placementOffsetM = Number.isFinite(rawOffsetMm) && rawOffsetMm >= 0
      ? rawOffsetMm / 1000
      : 0.02; // fallback: 20 mm

    const soundbarCentreHeightM = screenBottom - placementOffsetM - soundbarH / 2;

    const TOLERANCE_M = 0.03;

    let status = 'unknown';
    if (current !== null) {
      const diff = current - soundbarCentreHeightM;
      if (Math.abs(diff) <= TOLERANCE_M) status = 'ideal';
      else if (diff < 0)                  status = 'below';
      else                                status = 'above';
    }

    return {
      isValid: true,
      mode: 'tv_soundbar',
      idealHeightM: soundbarCentreHeightM,
      currentAcousticCentreM: current,
      placementOffsetM,
      status,
      explanationText:
        'For TV soundbar layouts, the soundbar is positioned at the fixed design offset below the TV screen.',
    };
  }

  // ── Fallback for unrecognised mode ────────────────────────────────────────
  return {
    isValid: false,
    mode: frontStageMode || 'unknown',
    status: 'unknown',
    explanationText: 'Unrecognised front-stage mode.',
  };
}