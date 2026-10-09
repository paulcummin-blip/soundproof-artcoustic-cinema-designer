// ---------------------------------------------------------------------------
// soundbarCabinetVariant.js
// ---------------------------------------------------------------------------
// The ONE cabinet-length (variant) authority for the TV-linked soundbars
// (C4-1, Multi, HSPL).
//
// A TV-linked soundbar is not one size: the catalogue publishes it in several
// cabinet lengths. Which one is installed follows the SCREEN'S PHYSICAL WIDTH —
// never its diagonal, and never a fixed default — and the length installed is
// the closest available catalogue length. Every drawing and every measurement
// resolves the variant here, so Front Elevation, Plan View and the reports can
// never disagree about which cabinet is installed.
//
// The dual-centre arrangement is the one exception: there the required variant
// is named by the catalogue itself (the C4-1's 1222 mm cabinet), so a wider
// screen never substitutes a longer bar for the two flanking cabinets.
//
// Pure: catalogue data and screen geometry only. No React, no state, no
// acoustics — nothing here touches SPL, RP22 or the amplifier calculations.
// ---------------------------------------------------------------------------

import {
  getSoundbarCabinetLengthsMm,
  getDualCentreCabinetLengthMm,
  getSpeakerModelMeta,
} from '@/components/models/speakers/registry';
import { resolveEffectiveViewableDimsM } from '@/components/models/screen/resolveEffectiveScreen';

/**
 * The screen's PHYSICAL width in millimetres.
 *
 * The viewable image width is the authority (a manual size wins over a preset),
 * because that is the physical width the cabinet has to sit under or beside —
 * a screen's diagonal size is never used. A TV preset's own outer width is the
 * fallback, and it agrees with the viewable width for every preset.
 */
export function resolveScreenPhysicalWidthMm(screen) {
  const viewable = resolveEffectiveViewableDimsM(screen);
  const widthM = Number(viewable?.widthM);
  if (Number.isFinite(widthM) && widthM > 0) return widthM * 1000;

  const tvMm = Number(screen?.tvWidthMm);
  return Number.isFinite(tvMm) && tvMm > 0 ? tvMm : null;
}

/** The catalogue length closest to a target width, or null when nothing is comparable. */
export function nearestCabinetLengthMm(lengthsMm, targetMm) {
  const lengths = (Array.isArray(lengthsMm) ? lengthsMm : [])
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
  if (lengths.length === 0) return null;

  const target = Number(targetMm);
  if (!Number.isFinite(target)) return null;

  return lengths.reduce(
    (best, length) => (Math.abs(length - target) < Math.abs(best - target) ? length : best),
    lengths[0],
  );
}

/**
 * The cabinet length (mm) installed for a model, or null when the model is not
 * a TV-linked soundbar.
 *
 * Order of precedence:
 *   1. the designer's own recorded length, when it is a real catalogue variant;
 *   2. the variant the catalogue names for the dual-centre arrangement;
 *   3. otherwise the catalogue length closest to the screen's physical width.
 *
 * @param {{modelKey?: string, screen?: object|null, dualCentre?: boolean, explicitMm?: number|null}} args
 * @returns {number|null}
 */
export function resolveSoundbarCabinetLengthMm({
  modelKey,
  screen = null,
  dualCentre = false,
  explicitMm = null,
}) {
  const lengths = getSoundbarCabinetLengthsMm(modelKey);
  if (lengths.length === 0) return null;

  // An explicitly selected length is never overridden by a screen change.
  const explicit = Number(explicitMm);
  if (Number.isFinite(explicit) && lengths.includes(explicit)) return explicit;

  if (dualCentre) {
    const required = getDualCentreCabinetLengthMm(modelKey);
    if (Number.isFinite(required) && lengths.includes(required)) return required;
  }

  return nearestCabinetLengthMm(lengths, resolveScreenPhysicalWidthMm(screen));
}

/** A placed speaker's own recorded cabinet length, when it records one. */
export function explicitCabinetLengthMm(speaker) {
  const value = Number(speaker?.cabinetLengthMm);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * The installed cabinet length for a PLACED speaker — its own recorded choice
 * first, then the variant resolution above.
 */
export function resolvePlacedCabinetLengthMm(speaker, screen = null, { dualCentre = false } = {}) {
  return resolveSoundbarCabinetLengthMm({
    modelKey: speaker?.model,
    screen,
    dualCentre,
    explicitMm: explicitCabinetLengthMm(speaker),
  });
}

/**
 * The catalogue metadata with the installed cabinet length applied.
 * For every model that is not a TV-linked soundbar this is the plain catalogue
 * lookup it has always been.
 */
export function resolveSoundbarMetaM(modelKey, screen = null, options = {}) {
  const cabinetLengthMm = resolveSoundbarCabinetLengthMm({
    modelKey,
    screen,
    dualCentre: options?.dualCentre === true,
    explicitMm: options?.explicitMm ?? null,
  });

  return getSpeakerModelMeta(
    modelKey,
    options?.tvPresetKey ?? screen?.tvPresetKey ?? null,
    { cabinetLengthMm },
  );
}