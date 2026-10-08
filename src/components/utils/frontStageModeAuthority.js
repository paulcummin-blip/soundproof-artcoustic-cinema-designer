// frontStageModeAuthority.js
// ---------------------------------------------------------------------------
// The ONE authority for the Room Designer's front-stage modes and for the
// "TV with dual centre speakers" mode in particular.
//
// FOUR MODES
//   standard        separate LCR speakers (FL / FC / FR)
//   center_only     centre-only soundbar override (FC soundbar + FL/FR)
//   integrated_lcr  integrated LCR soundbar (one FC cabinet carrying L/R/C)
//   dual_centre     TV with DUAL CENTRE SPEAKERS — two physical centre
//                   cabinets (FCL centre-left, FCR centre-right) flanking the
//                   TV, fed from ONE centre channel
//
// The dual-centre mode is still ONE centre channel electrically and logically.
// It changes NO Dolby layout, NO channel count and NO RP22 threshold: the two
// cabinets are physical only, exactly like the two cabinets of a single
// subwoofer channel.
//
// Pure: no React, no state, no side effects.
// ---------------------------------------------------------------------------

import { getCanonicalRole } from '@/components/utils/surroundRoleMap';
import { getSpeakerModelMeta } from '@/components/models/speakers/registry';
import { resolveEffectiveViewableDimsM } from '@/components/models/screen/resolveEffectiveScreen';

// ── Modes ──────────────────────────────────────────────────────────────────

export const FRONT_STAGE_STANDARD = 'standard';
export const FRONT_STAGE_CENTER_ONLY = 'center_only';
export const FRONT_STAGE_INTEGRATED_LCR = 'integrated_lcr';
export const FRONT_STAGE_DUAL_CENTRE = 'dual_centre';

/** Every valid mode, in selector order. */
export const FRONT_STAGE_MODES = Object.freeze([
  FRONT_STAGE_STANDARD,
  FRONT_STAGE_CENTER_ONLY,
  FRONT_STAGE_INTEGRATED_LCR,
  FRONT_STAGE_DUAL_CENTRE,
]);

/** The mode's own label. The first three are unchanged existing wording. */
export const FRONT_STAGE_MODE_LABELS = Object.freeze({
  [FRONT_STAGE_STANDARD]: 'Separate LCR speakers',
  [FRONT_STAGE_CENTER_ONLY]: 'Center-only soundbar override',
  [FRONT_STAGE_INTEGRATED_LCR]: 'Integrated LCR soundbar',
  [FRONT_STAGE_DUAL_CENTRE]: 'TV with dual centre speakers',
});

/** Selector options, derived from the ONE label authority above. */
export const FRONT_STAGE_MODE_OPTIONS = Object.freeze(
  FRONT_STAGE_MODES.map((value) => ({ value, label: FRONT_STAGE_MODE_LABELS[value] })),
);

/**
 * A stored/supplied mode, validated. Anything unrecognised — an old, corrupt or
 * future value — falls back safely to the existing default ('standard'), so a
 * project can never open into an undefined front stage.
 */
export function normaliseFrontStageMode(value) {
  const v = String(value || '').trim();
  return FRONT_STAGE_MODES.includes(v) ? v : FRONT_STAGE_STANDARD;
}

export const isDualCentreMode = (mode) => normaliseFrontStageMode(mode) === FRONT_STAGE_DUAL_CENTRE;

// ── Physical centre cabinets ───────────────────────────────────────────────

/** The two physical centre cabinets of the dual-centre mode. */
export const CENTRE_CABINET_ROLES = Object.freeze({ left: 'FCL', right: 'FCR' });

/** Whether a role is one of the two physical centre cabinets. */
export function isCentreCabinetRole(role) {
  const canon = getCanonicalRole(role);
  return canon === CENTRE_CABINET_ROLES.left || canon === CENTRE_CABINET_ROLES.right;
}

/** Whether a role is the (single) logical centre channel of the bed layer. */
export function isCentreChannelRole(role) {
  const canon = getCanonicalRole(role);
  return canon === 'FC' || canon === 'C';
}

/** A model is installed when it names a real product (not the off/none sentinels). */
export function hasInstalledModel(model) {
  const value = String(model ?? '').trim().toLowerCase();
  return !!value && value !== 'off' && value !== 'none';
}

/** Number of physical cabinets the dual-centre mode places. */
export const DUAL_CENTRE_CABINET_COUNT = 2;

/**
 * Whether the design is in the dual-centre mode. Derived from the design itself
 * — the presence of an installed centre cabinet — so the mode travels with the
 * project (placed speakers) and needs no separate persisted flag.
 */
export function detectDualCentreStage(placedSpeakers) {
  const list = Array.isArray(placedSpeakers) ? placedSpeakers : [];
  return list.some((s) => isCentreCabinetRole(s?.role) && hasInstalledModel(s?.model));
}

/** The installed centre cabinets of a design, left first. */
export function centreCabinets(placedSpeakers) {
  const list = Array.isArray(placedSpeakers) ? placedSpeakers : [];
  return list
    .filter((s) => isCentreCabinetRole(s?.role) && hasInstalledModel(s?.model))
    .sort((a, b) => (String(getCanonicalRole(a?.role)) === CENTRE_CABINET_ROLES.left ? -1 : 1)
      - (String(getCanonicalRole(b?.role)) === CENTRE_CABINET_ROLES.left ? -1 : 1));
}

// ── SPL: ONE centre channel, split between two cabinets ────────────────────

/**
 * The power ONE centre cabinet receives.
 *
 * The two cabinets share the single centre-channel amplifier power: with a
 * channel power of X watts, centre-left receives X / 2 and centre-right receives
 * X / 2. NOTHING is added for the second cabinet — there is no +3 dB and no
 * +6 dB combining gain — so the channel is never overstated because it has two
 * physical cabinets.
 *
 * @param {number} centreChannelPowerW - the centre channel's amplifier power (X)
 * @returns {number} the per-cabinet power (X / 2)
 */
export function centreCabinetPowerW(centreChannelPowerW) {
  const x = Number(centreChannelPowerW);
  if (!Number.isFinite(x) || x <= 0) return x;
  return x / DUAL_CENTRE_CABINET_COUNT;
}

// ── Placement geometry ─────────────────────────────────────────────────────

/**
 * The TV's own physical width in metres.
 *
 * The exact TV width (mm) is the authority when the design carries a TV preset;
 * otherwise the viewable image width is used. NEVER a made-up bezel allowance.
 */
export function resolveTvOuterWidthM(screen) {
  const tvMm = Number(screen?.tvWidthMm);
  if (Number.isFinite(tvMm) && tvMm > 0) return tvMm / 1000;
  const viewable = resolveEffectiveViewableDimsM(screen);
  const widthM = Number(viewable?.widthM);
  return Number.isFinite(widthM) && widthM > 0 ? widthM : null;
}

/**
 * Where a centre cabinet sits across the room (X).
 *
 * Each cabinet flanks one edge of the TV: its acoustic centre sits half a
 * cabinet width OUTSIDE the TV edge, so the cabinet meets the TV edge without
 * overlapping the image. Symmetric about the room centreline, and clamped
 * inside the room's side walls.
 *
 * @returns {number|null} X in metres, or null when the geometry is unavailable.
 */
export function resolveCentreCabinetX({ screen, role, cabinetWidthM, roomWidthM }) {
  const roomW = Number(roomWidthM);
  const tvW = resolveTvOuterWidthM(screen);
  if (!Number.isFinite(roomW) || roomW <= 0 || !Number.isFinite(tvW)) return null;

  const cabinetHalfW = Number.isFinite(Number(cabinetWidthM)) ? Math.abs(Number(cabinetWidthM)) / 2 : 0;
  const offset = tvW / 2 + cabinetHalfW; // cabinet meets the TV edge
  const centreX = roomW / 2;
  const left = String(getCanonicalRole(role)) === CENTRE_CABINET_ROLES.left;

  const margin = 0.05;
  const raw = left ? centreX - offset : centreX + offset;
  return Math.max(margin, Math.min(roomW - margin, raw));
}

// ── Centre model eligibility ───────────────────────────────────────────────

/** A centre cabinet must be above this impedance to be offered. */
export const DUAL_CENTRE_MIN_IMPEDANCE_OHM = 4;

/**
 * Whether a model may be used as a physical centre cabinet in this mode:
 * an Artcoustic LCR-range product, above 4 Ω, excluding the Architect (in-ceiling
 * / overhead) range and the dedicated soundbar products (which are their own
 * front-stage modes, not a dual-centre cabinet).
 */
export function isEligibleDualCentreCentreModel(modelKey) {
  const key = String(modelKey ?? '').trim();
  if (!key) return false;
  const meta = getSpeakerModelMeta(key);
  if (!meta || meta.notFound) return false;

  if (meta.category !== 'LCR') return false;      // Artcoustic LCR range only
  if (meta.frontStageType) return false;          // soundbars stay in their own modes
  if (meta.round === true) return false;          // in-ceiling / overhead form factor

  const ohms = Number(meta.nominalOhms);
  return Number.isFinite(ohms) && ohms > DUAL_CENTRE_MIN_IMPEDANCE_OHM;
}

/** Filter a product-option list to the eligible centre cabinets. */
export function eligibleDualCentreCentreOptions(options) {
  const list = Array.isArray(options) ? options : [];
  return list.filter((option) => isEligibleDualCentreCentreModel(
    option?.key ?? option?.engineering_key ?? option?.label,
  ));
}