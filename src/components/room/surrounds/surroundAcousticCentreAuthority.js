// surroundAcousticCentreAuthority.js
// ---------------------------------------------------------------------------
// ONE authority for a surround or front-wide speaker's height.
//
// A wall speaker's height is stored in exactly one place: `position.z` — the
// vertical centre of its cabinet, the ACOUSTIC CENTRE, measured from the
// finished floor. The control panel, the Side Elevation drawing and the hover
// card all read and write that same coordinate, so no two views can report a
// different position for the same speaker.
//
// This module owns:
//   - the DEFAULT acoustic centre of each group, taken from the seating risers
//   - which group a role's height belongs to
//   - what the installed speakers of a group currently read
//   - the room bounds a height may take, and the canonical write
//
// Pure: no React, no SDK, no side effects.
// ---------------------------------------------------------------------------

import { getCanonicalRole } from "@/components/utils/surroundRoleMap";
import { getSpeakerModelMeta } from "@/components/models/speakers/registry";

/** The acoustic centre a group sits at before any riser is added. */
export const SURROUND_ACOUSTIC_CENTRE_BASE_M = 1.20;

/** Floor/ceiling guard used when a cabinet's own size is not known. */
export const ACOUSTIC_CENTRE_FLOOR_GUARD_M = 0.10;

const HEIGHT_EPS_M = 0.0005;

const mm = (value) => Math.round(value * 1000) / 1000;

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/** The height a seat is listened from: its stated ear height, else its z. */
const seatEarHeight = (seat) => num(seat?.rowEarHeight) ?? num(seat?.z) ?? null;

/**
 * The platform height of each seating row, in row order.
 *
 * The project's OWN risers are used, never an assumed 0.4 m step: a row's
 * stored platform height is read directly, and a row that states none falls
 * back to its ear-height rise above the first row.
 */
export function resolveRowPlatformHeights(seatingPositions) {
  const seats = Array.isArray(seatingPositions) ? seatingPositions : [];
  const byRow = new Map();

  seats.forEach((seat) => {
    const stated = Number(seat?.rowNumber ?? seat?.rowIndex ?? seat?.row ?? 1);
    const rowNo = Number.isFinite(stated) && stated >= 1 ? Math.floor(stated) : 1;
    if (!byRow.has(rowNo)) byRow.set(rowNo, []);
    byRow.get(rowNo).push(seat);
  });

  const rowNos = Array.from(byRow.keys()).sort((a, b) => a - b);
  const earHeights = rowNos.map((rowNo) => {
    const values = byRow.get(rowNo).map(seatEarHeight).filter((value) => value !== null);
    return values.length ? Math.max(...values) : null;
  });
  const baseEar = earHeights.find((value) => value !== null) ?? null;

  return rowNos.map((rowNo, index) => {
    const stated = byRow
      .get(rowNo)
      .map((seat) => num(seat?.platformHeightM))
      .filter((value) => value !== null);
    if (stated.length) return Math.max(0, Math.max(...stated));

    const ear = earHeights[index];
    if (ear === null || baseEar === null) return 0;
    // Rounded to the millimetre, so a 0.4 m riser reads as 0.4 and never as
    // 0.3999999999999999.
    return mm(Math.max(0, ear - baseEar));
  });
}

/**
 * The DEFAULT acoustic centre of each wall-speaker group.
 *
 * The rule: a group sits 1.20 m above the floor of the row it serves — front
 * wides above the first row, side surrounds above the second row (the first,
 * when only one row exists), rear surrounds above the last row. With the usual
 * 0.4 m riser pattern that gives 1.20 / 1.60 / 2.00 m; a project with
 * different risers gets its own actual heights instead.
 *
 * This is a CREATION default. It never rewrites a speaker the designer has
 * already placed by hand.
 */
export function resolveSurroundAcousticCentreDefaults(seatingPositions, roomHeightM) {
  const platforms = resolveRowPlatformHeights(seatingPositions);
  const lastIndex = platforms.length > 0 ? platforms.length - 1 : 0;
  const sideIndex = Math.min(1, lastIndex);
  const roomH = num(roomHeightM) ?? 2.8;
  const bounds = resolveAcousticCentreBounds({ cabinetHeightM: null, roomHeightM: roomH });
  const at = (index) => SURROUND_ACOUSTIC_CENTRE_BASE_M + (platforms[index] || 0);

  return {
    rows: platforms.length,
    wideM: clampAcousticCentreHeight(at(0), bounds),
    sideM: clampAcousticCentreHeight(at(sideIndex), bounds),
    rearM: clampAcousticCentreHeight(at(lastIndex), bounds),
  };
}

/** Which group a role's height belongs to: 'side' | 'rear' | 'wide' | null. */
export function groupForSurroundRole(role) {
  const canon = getCanonicalRole(role);
  if (/^(LW|RW)\d*$/.test(canon)) return "wide";
  if (/^(SBL|SBR)\d*$/.test(canon)) return "rear";
  if (/^(SL|SR)\d*$/.test(canon)) return "side";
  return null;
}

/** An installed wall speaker: a real model, with a stored acoustic centre. */
export function isInstalledWallSpeaker(speaker) {
  const model = String(speaker?.model || "").trim().toLowerCase();
  const installed = !!model && model !== "off" && model !== "none";
  return installed && num(speaker?.position?.z) !== null;
}

/** The cabinet extent the registry states for a model, in metres. */
function cabinetDimsFor(model) {
  if (!model) return { heightM: null, widthM: null };
  const meta = getSpeakerModelMeta(model) || {};
  if (meta.notFound) return { heightM: null, widthM: null };
  return { heightM: num(meta.heightM), widthM: num(meta.widthM) };
}

/**
 * The bounds a height may take: the WHOLE cabinet stays inside the room, so the
 * acoustic centre never sits below its own half height, nor above the ceiling
 * less that half height.
 */
export function resolveAcousticCentreBounds({ cabinetHeightM = null, roomHeightM = null } = {}) {
  const roomH = num(roomHeightM) ?? 2.8;
  const cabinetH = num(cabinetHeightM);
  const half = cabinetH !== null && cabinetH > 0 ? cabinetH / 2 : ACOUSTIC_CENTRE_FLOOR_GUARD_M;
  const minM = Math.min(half, roomH / 2);
  const maxM = Math.max(minM, roomH - half);
  return { minM: mm(minM), maxM: mm(maxM) };
}

/** Clamp a stated height to its bounds. Null for a value that cannot be used. */
export function clampAcousticCentreHeight(valueM, bounds) {
  const value = num(valueM);
  if (value === null) return null;
  const minM = num(bounds?.minM);
  const maxM = num(bounds?.maxM);
  const lower = minM === null ? 0 : minM;
  const upper = maxM === null ? Number.MAX_SAFE_INTEGER : Math.max(lower, maxM);
  return mm(Math.min(Math.max(value, lower), upper));
}

/**
 * What each group currently reads, straight from its installed speakers: the
 * shared acoustic centre, whether the group's speakers disagree, the group's
 * own cabinet extent, and the bounds a value may take.
 */
export function readAcousticCentreGroups(placedSpeakers, roomHeightM) {
  const list = Array.isArray(placedSpeakers) ? placedSpeakers : [];
  const members = { side: [], rear: [], wide: [] };

  list.forEach((speaker) => {
    const group = groupForSurroundRole(speaker?.role);
    if (group && isInstalledWallSpeaker(speaker)) members[group].push(speaker);
  });

  const read = {};
  ["side", "rear", "wide"].forEach((group) => {
    const speakers = members[group];
    const heights = speakers.map((speaker) => mm(num(speaker.position.z)));
    const valueM = heights.length ? heights[0] : null;
    const cabinetHeightM = speakers.reduce((tallest, speaker) => {
      const { heightM } = cabinetDimsFor(speaker.model);
      if (heightM === null) return tallest;
      return tallest === null ? heightM : Math.max(tallest, heightM);
    }, null);
    const bounds = resolveAcousticCentreBounds({ cabinetHeightM, roomHeightM });

    read[group] = {
      count: speakers.length,
      valueM,
      mixed: heights.some((height) => Math.abs(height - valueM) > HEIGHT_EPS_M),
      cabinetHeightM,
      minM: bounds.minM,
      maxM: bounds.maxM,
    };
  });

  return read;
}

/**
 * THE write: set one group's acoustic centre on the speakers themselves.
 *
 * The designer's stated value is recorded as the speaker's own override
 * (positionSource 'user'), which is the flag every placement pass already
 * respects — so a default can never move a speaker the designer has set, and no
 * second position store is introduced.
 */
export function applyAcousticCentreForGroup(placedSpeakers, group, valueM, roomHeightM) {
  const list = Array.isArray(placedSpeakers) ? placedSpeakers : [];
  if (!group) return list;
  if (num(valueM) === null) return list;

  let changed = false;
  const next = list.map((speaker) => {
    if (groupForSurroundRole(speaker?.role) !== group) return speaker;
    if (!isInstalledWallSpeaker(speaker)) return speaker;

    const { heightM: cabinetHeightM } = cabinetDimsFor(speaker.model);
    const bounds = resolveAcousticCentreBounds({ cabinetHeightM, roomHeightM });
    const height = clampAcousticCentreHeight(valueM, bounds);
    if (height === null) return speaker;

    const current = num(speaker.position.z);
    const alreadyStated =
      current !== null &&
      Math.abs(height - current) < HEIGHT_EPS_M &&
      speaker.positionSource === "user";
    if (alreadyStated) return speaker;

    changed = true;
    return {
      ...speaker,
      positionSource: "user",
      position: { ...speaker.position, z: height },
    };
  });

  return changed ? next : list;
}