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
import { resolveSoundbarCabinetLengthMm } from '@/components/models/speakers/soundbarCabinetVariant';
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

/** Speaker categories never offered as a physical centre cabinet. */
export const DUAL_CENTRE_EXCLUDED_CATEGORIES = Object.freeze(['ARCHITECT', 'SUBWOOFERS']);

/**
 * Nominal impedance at or below which a cabinet carries the series/parallel
 * wiring note. LOW IMPEDANCE IS NEVER A RESTRICTION: a 4 Ω (or lower) model is
 * offered and may be selected exactly like any other — the note is advice, not
 * a block, and no electrical calculation is performed.
 */
export const DUAL_CENTRE_WARN_IMPEDANCE_OHM = 4;

/**
 * The fixed allowance the Centre SPL card adds for the dual-centre arrangement:
 * two cabinets, one centre channel. Deliberately a flat figure — no summation
 * model is introduced.
 */
export const DUAL_CENTRE_SPL_GAIN_DB = 4;

/**
 * Whether a model may be used as a physical centre cabinet in this mode.
 *
 * The WHOLE Artcoustic catalogue is offered — Spitfire, Evolve, Q, C-1, C4-1,
 * Multi and HSPL alike, in whatever orientation the cabinet is normally drawn
 * (a TV-width bar is never excluded for being drawn horizontally). The only
 * exclusions are the Architect range and subwoofers. Impedance is never a
 * restriction; a 4 Ω or lower model is allowed and carries a wiring note.
 */
export function isEligibleDualCentreCentreModel(modelKey) {
  const key = String(modelKey ?? '').trim();
  if (!key) return false;
  const meta = getSpeakerModelMeta(key);
  if (!meta || meta.notFound) return false;

  return !DUAL_CENTRE_EXCLUDED_CATEGORIES.includes(String(meta.category || '').toUpperCase());
}

/** Whether the selected cabinet carries the series/parallel wiring note. */
export function needsSeriesParallelWarning(modelKey) {
  const key = String(modelKey ?? '').trim();
  if (!key) return false;
  const meta = getSpeakerModelMeta(key);
  if (!meta || meta.notFound) return false;
  const ohms = Number(meta.nominalOhms);
  return Number.isFinite(ohms) && ohms > 0 && ohms <= DUAL_CENTRE_WARN_IMPEDANCE_OHM;
}

/** Filter a product-option list to the eligible centre cabinets. */
export function eligibleDualCentreCentreOptions(options) {
  const list = Array.isArray(options) ? options : [];
  return list.filter((option) => isEligibleDualCentreCentreModel(
    option?.key ?? option?.value ?? option?.engineering_key ?? option?.label,
  ));
}

/**
 * The SMALLEST eligible centre cabinet, measured from the catalogue's own
 * dimensions — never inferred from a model name.
 *
 * "Smallest" is the cabinet's physical volume (width × height × depth), resolved
 * through the same catalogue authority the drawings use, so a TV-linked bar is
 * measured at its real installed size rather than by the number in its code.
 * Volume does not change with orientation, so the answer is the same whether the
 * cabinets are installed horizontally or vertically. A model the catalogue
 * cannot measure never wins: an unknown size is never treated as small.
 *
 * Ties fall back to the front-baffle footprint, then to the catalogue's own
 * option order, so the default is deterministic.
 *
 * @returns the smallest eligible option, or null when nothing is measurable.
 */
export function smallestEligibleCentreModel(options, tvPresetKey = null) {
  const measured = eligibleDualCentreCentreOptions(options)
    .map((option) => {
      const key = option?.key ?? option?.value ?? option?.engineering_key ?? option?.label;
      const meta = getSpeakerModelMeta(String(key ?? '').trim(), tvPresetKey || null);
      const widthM = Number(meta?.widthM);
      const heightM = Number(meta?.heightM);
      const depthM = Number(meta?.depthM);
      const measurable = !!meta && !meta.notFound
        && Number.isFinite(widthM) && widthM > 0
        && Number.isFinite(heightM) && heightM > 0
        && Number.isFinite(depthM) && depthM > 0;
      return {
        option,
        volume: measurable ? widthM * heightM * depthM : null,
        footprint: measurable ? widthM * heightM : null,
      };
    })
    .filter((candidate) => candidate.volume !== null);

  if (measured.length === 0) return null;

  return measured.reduce((best, candidate) => {
    if (candidate.volume < best.volume - 1e-12) return candidate;
    if (candidate.volume > best.volume + 1e-12) return best;
    if (candidate.footprint < best.footprint - 1e-12) return candidate;
    return best;
  }).option;
}

/**
 * The label the dual-centre centre selector starts on: the smallest eligible
 * cabinet from the catalogue. Empty only when no eligible cabinet is measurable.
 */
export function defaultDualCentreCentreModelLabel(options, tvPresetKey = null) {
  return String(smallestEligibleCentreModel(options, tvPresetKey)?.label ?? '');
}

// ── Cabinet orientation ────────────────────────────────────────────────────
//
// Each physical centre cabinet may be installed horizontally or vertically.
// Vertical is the SAME cabinet rotated a quarter turn: its drawn width and
// height swap, its depth is unchanged and its acoustic centre is still the
// cabinet centre. The logical centre channel is never rotated and the two
// cabinets are still ONE channel.

export const CABINET_ORIENTATION_HORIZONTAL = 'horizontal';
export const CABINET_ORIENTATION_VERTICAL = 'vertical';

/** Orientation choices, in selector order. */
export const CABINET_ORIENTATION_OPTIONS = Object.freeze([
  { value: CABINET_ORIENTATION_HORIZONTAL, label: 'Horizontal' },
  { value: CABINET_ORIENTATION_VERTICAL, label: 'Vertical' },
]);

/** A stored orientation, validated: anything unrecognised is horizontal. */
export function normaliseCabinetOrientation(value) {
  return String(value || '').trim().toLowerCase() === CABINET_ORIENTATION_VERTICAL
    ? CABINET_ORIENTATION_VERTICAL
    : CABINET_ORIENTATION_HORIZONTAL;
}

/**
 * The orientation a NEW centre cabinet starts in — always VERTICAL.
 *
 * The two cabinets flank the TV outside its left and right edges, so whatever
 * form the product is normally drawn in they are installed standing vertically.
 * The designer's own selection always overrides this.
 */
export function defaultCentreCabinetOrientation(modelKey, tvPresetKey = null) {
  return CABINET_ORIENTATION_VERTICAL;
}

/** The model's normal (as-drawn) footprint in metres, or null when unknown. */
export function centreCabinetNormalFootprintM(modelKey, tvPresetKey = null, options = {}) {
  // A TV-linked cabinet is drawn at its INSTALLED cabinet length. In the
  // dual-centre arrangement the catalogue names that variant itself (the C4-1's
  // 1222 mm cabinet), so a wider screen never substitutes a longer bar for the
  // two flanking cabinets; the designer's own recorded length still wins.
  const cabinetLengthMm = resolveSoundbarCabinetLengthMm({
    modelKey,
    screen: { tvPresetKey },
    dualCentre: true,
    explicitMm: options?.cabinetLengthMm ?? null,
  });

  const meta = getSpeakerModelMeta(String(modelKey || '').trim(), tvPresetKey || null, { cabinetLengthMm });
  const widthM = Number(meta?.widthM);
  const heightM = Number(meta?.heightM);
  const depthM = Number(meta?.depthM);
  if (!Number.isFinite(widthM) || !Number.isFinite(heightM) || widthM <= 0 || heightM <= 0) return null;
  return {
    widthM,
    heightM,
    depthM: Number.isFinite(depthM) && depthM > 0 ? depthM : 0.08,
    cabinetLengthMm: Number.isFinite(Number(meta?.cabinetLengthMm)) ? Number(meta.cabinetLengthMm) : null,
  };
}

/**
 * The cabinet's INSTALLED footprint in metres.
 *
 * horizontal → the product's normal footprint.
 * vertical   → the same cabinet rotated a quarter turn: width and height swap,
 *              the depth is unchanged and the acoustic centre stays the centre.
 *
 * @returns {{widthM:number, heightM:number, depthM:number, orientation:string}|null}
 */
export function resolveCentreCabinetFootprintM(modelKey, orientation, tvPresetKey = null, options = {}) {
  const normal = centreCabinetNormalFootprintM(modelKey, tvPresetKey, options);
  if (!normal) return null;
  const value = normaliseCabinetOrientation(orientation);
  if (value === CABINET_ORIENTATION_HORIZONTAL) return { ...normal, orientation: value };
  return {
    widthM: normal.heightM,
    heightM: normal.widthM,
    depthM: normal.depthM,
    // The installed cabinet length travels with the footprint, so the drawings
    // can pick the artwork for the variant actually installed.
    cabinetLengthMm: normal.cabinetLengthMm,
    orientation: value,
  };
}

/**
 * The orientation the INSTALLED centre cabinets carry.
 * They are installed as a pair and always share one orientation; horizontal is
 * returned when nothing is installed or nothing is recorded.
 */
export function centreCabinetOrientation(placedSpeakers) {
  const recorded = centreCabinets(placedSpeakers).find((c) => String(c?.orientation || '').trim());
  return normaliseCabinetOrientation(recorded?.orientation);
}