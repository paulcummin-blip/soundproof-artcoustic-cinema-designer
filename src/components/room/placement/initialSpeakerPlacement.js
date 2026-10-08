// initialSpeakerPlacement.js
// ---------------------------------------------------------------------------
// Initial placement authority.
//
// Resolves a speaker's FINAL position at the moment its model is assigned, so
// the first visible frame already uses valid geometry and no later correction
// effect has to move it. Called from:
//   - buildFrontStageSeed        (LCR model selection)
//   - resetSurroundPositions     (surround / front-wide / rear model selection)
//
// Reuses the same authorities the renderer and the correction effects use:
//   - computeLcrZones             (the LCR 22.5°–30° zone authority)
//   - resolveWallHugTarget        (the single wall-mount authority)
//   - computeFrontWideZonesStrict (the RP22 median-angle front-wide zones)
//   - resolveSideSurroundVisualSpan (the plan view's side-surround Y band)
//
// Pure: no React, no side effects, no state writes.
// ---------------------------------------------------------------------------

import { getCanonicalRole, canonicalSide } from "@/components/utils/surroundRoleMap";
import {
  CENTRE_CABINET_ROLES,
  isCentreCabinetRole,
  resolveCentreCabinetFootprintM,
  resolveCentreCabinetX,
} from "@/components/utils/frontStageModeAuthority";
import { computeLcrZones, clampLcrZoneDepth } from "@/components/utils/rp22/lcrZoneAuthority";
import { computeFrontWideZonesStrict } from "@/components/utils/frontWideZones";
import { yHalfExtentM_physical } from "@/components/room/rv/RenderPrimitives";
import { resolveRspScreenFrontPlaneM } from "@/components/room/rsp/screenGeometryResolver";
import { SIDE_ALLOW_OVERHANG } from "@/components/room/rvPlanHelpers";
import { resolveSideSurroundVisualSpan } from "@/components/room/rv/hooks/useSideSurroundVisualSpanM";
import { resolveWallHugTarget, resolveSpeakerDims, wallHugKind } from "./wallHugAuthority";

export const FRONT_WALL_GAP_M = 0.01;
export const DEFAULT_EAR_Z_M = 1.1;

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const roomW = (roomDims) => num(roomDims?.widthM ?? roomDims?.width) || 0;
const roomL = (roomDims) => num(roomDims?.lengthM ?? roomDims?.length) || 0;
const roomH = (roomDims) => num(roomDims?.heightM ?? roomDims?.height) || 2.8;

/**
 * The canonical RSP (the green dot) published by the Room Designer, falling
 * back to a supplied MLP when the published value is not yet available.
 */
export function resolveCanonicalRsp({ roomDims, mlpX_m, mlpY_m, fallbackMlp }) {
  const x = num(mlpX_m);
  const y = num(mlpY_m);
  const fx = num(fallbackMlp?.x);
  const fy = num(fallbackMlp?.y);

  const resolvedX = x ?? fx ?? (roomW(roomDims) > 0 ? roomW(roomDims) / 2 : null);
  const resolvedY = y ?? fy ?? null;
  if (resolvedX === null || resolvedY === null) return null;
  return { x: resolvedX, y: resolvedY };
}

/**
 * Automatic surround height — the same rule the surround height effect applies,
 * so a newly installed surround is already at its final height.
 */
export function resolveAutoSurroundHeight(seatingPositions, roomHeightM) {
  const seats = Array.isArray(seatingPositions) ? seatingPositions : [];
  const earHeights = seats.map((s) =>
    Number.isFinite(s?.rowEarHeight) ? s.rowEarHeight : Number.isFinite(s?.z) ? s.z : DEFAULT_EAR_Z_M
  );
  const maxEarH = earHeights.length > 0 ? Math.max(...earHeights) : DEFAULT_EAR_Z_M;
  const raw = maxEarH + 0.05;
  const maxH = (num(roomHeightM) ?? 2.8) - 0.30;
  return Math.max(1.10, Math.min(maxH, raw));
}

/**
 * Whether an AUTOMATIC rear pair is demonstrably invalid: both speakers are
 * installed, neither was positioned by hand, and either they share a coordinate
 * or they are not each on their own side of the room.
 *
 * Used only to decide whether the placement pass must run — never as a
 * placement authority. A pair the designer positioned by hand is never
 * reported invalid, so deliberate adjustments stay protected.
 */
export function hasInvalidAutomaticRearPair(speakers, roomDims) {
  const W = roomW(roomDims);
  if (!(W > 0)) return false;

  const byCanon = new Map();
  (Array.isArray(speakers) ? speakers : []).forEach((speaker) => {
    byCanon.set(getCanonicalRole(speaker?.role), speaker);
  });

  const left = byCanon.get("SBL");
  const right = byCanon.get("SBR");
  if (!left || !right) return false;

  const isAutomatic = (speaker) => {
    const model = String(speaker?.model || "").trim().toLowerCase();
    const installed = !!model && model !== "off" && model !== "none";
    return installed && speaker?.positionSource !== "user";
  };
  if (!isAutomatic(left) || !isAutomatic(right)) return false;

  const xL = num(left?.position?.x);
  const xR = num(right?.position?.x);
  if (xL === null || xR === null) return true;

  const overlapping = Math.abs(xL - xR) < 0.001;
  const wronglySided = !(xL < W / 2 && xR > W / 2);
  return overlapping || wronglySided;
}

/**
 * Final position for FL / FC / FR.
 *
 * X sits at the centre of the role's permitted LCR zone (the same zone the
 * overlay draws and the drag constraint clamps to), Y keeps the cabinet clear
 * of the front wall for the assigned model, and Z uses the LCR height
 * authority. The result is therefore already the value every downstream
 * correction would compute.
 */
export function resolveInitialLcrPosition({
  role,
  model,
  orientation = null,
  roomDims,
  rsp,
  screenFrontPlaneM,
  screen,
  lcrHeightM,
  lcrAimMode,
  getModelDimsM,
  fallbackSpreadM,
}) {
  const canon = getCanonicalRole(role);
  const isCentreCabinet = isCentreCabinetRole(canon);
  if (canon !== "FL" && canon !== "FC" && canon !== "FR" && !isCentreCabinet) return null;

  const W = roomW(roomDims);
  const L = roomL(roomDims);
  if (!(W > 0 && L > 0)) return null;

  // A dual-centre cabinet is placed from its INSTALLED footprint: when it is
  // mounted vertically the cabinet is rotated, so both the TV-edge offset and the
  // front-wall clearance follow the rotated width and the unchanged depth.
  const cabinetFootprint = isCentreCabinet
    ? resolveCentreCabinetFootprintM(model, orientation, screen?.tvPresetKey || null)
    : null;
  const dims = cabinetFootprint
    ? { widthM: cabinetFootprint.widthM, depthM: cabinetFootprint.depthM }
    : resolveSpeakerDims(model, getModelDimsM);
  const z = num(lcrHeightM) ?? roomH(roomDims) * 0.5;

  // ── X: the role's canonical position ────────────────────────────────────
  let x = W / 2;
  if (canon === "FL" || canon === "FR") {
    let span = null;
    if (rsp) {
      const planeM = resolveRspScreenFrontPlaneM(screenFrontPlaneM, screen);
      const zoneDepthM = clampLcrZoneDepth(planeM);
      const zones = zoneDepthM === null ? null : computeLcrZones({ mlpX: rsp.x, mlpY: rsp.y, zoneDepthM });
      if (zones) span = canon === "FL" ? zones.left : zones.right;
    }
    // With no RSP the zone cannot be constructed, so the nominal lateral spread
    // is kept as the fallback (unchanged behaviour).
    const spread = num(fallbackSpreadM) ?? Math.min(1.2, W * 0.22);
    x = span ? (span.xMin + span.xMax) / 2 : (canon === "FL" ? W / 2 - spread : W / 2 + spread);
  } else if (isCentreCabinet) {
    // Dual centre: each cabinet flanks one edge of the TV (symmetric about the
    // room centreline), placed from the TV geometry when it is available. With
    // no TV geometry the nominal lateral spread keeps the pair usable.
    const spread = num(fallbackSpreadM) ?? Math.min(1.2, W * 0.22);
    const tvX = resolveCentreCabinetX({ screen, role: canon, cabinetWidthM: dims.widthM, roomWidthM: W });
    x = Number.isFinite(tvX)
      ? tvX
      : (canon === CENTRE_CABINET_ROLES.left ? W / 2 - spread : W / 2 + spread);
  }

  // ── Y: front-wall clearance for this model, at its final aim ────────────
  let y = FRONT_WALL_GAP_M + dims.depthM / 2;
  const aimAngled = String(lcrAimMode || "flat") === "angled";
  if (aimAngled && canon !== "FC" && rsp) {
    // Two passes reach the fixed point of (yaw from position → clearance), so
    // the stored Y already equals the value the LCR lock effect would write.
    for (let i = 0; i < 2; i += 1) {
      const yawDeg = Math.abs((Math.atan2(rsp.x - x, rsp.y - y) * 180) / Math.PI);
      y = FRONT_WALL_GAP_M + yHalfExtentM_physical(dims.depthM, dims.widthM, yawDeg);
    }
  }

  return { x, y, z };
}

/**
 * Y for a front wide (LW/RW).
 *
 * PRIMARY — the RP22 median-angle zone, i.e. the exact value the front-wide
 * overlay and its placement effect use, including the same overhang clamp.
 *
 * FALLBACK — when the zones are unavailable (overlay off, or the side surrounds
 * are not on their walls) the median between the front and side surround Y is
 * used, which is the value the plan view's fallback pass would apply.
 *
 * @returns {number|null}
 */
export function resolveFrontWideY({ role, model, placedSpeakers, roomDims, rsp, enableFrontWides, getModelDimsM }) {
  const canon = getCanonicalRole(role);

  if (enableFrontWides && rsp) {
    const zones = computeFrontWideZonesStrict({
      mlpPoint: rsp,
      dimensions: { width: roomW(roomDims), length: roomL(roomDims) },
      placedSpeakers,
      getModelDimsM: (m) => resolveSpeakerDims(m, getModelDimsM),
    });

    if (zones?.status === "ok") {
      const zone = canon === "LW" ? zones.left : zones.right;
      const medianY = num(zone?.medianY);
      if (medianY !== null) {
        const dims = resolveSpeakerDims(model, getModelDimsM);
        const halfWidth = dims.widthM / 2;
        const lo = num(zone?.yMin) ?? 0;
        const hi = num(zone?.yMax) ?? roomL(roomDims);
        return Math.max(
          lo + halfWidth * SIDE_ALLOW_OVERHANG,
          Math.min(hi - halfWidth * SIDE_ALLOW_OVERHANG, medianY)
        );
      }
    }
  }

  const list = Array.isArray(placedSpeakers) ? placedSpeakers : [];
  const yOf = (r) => num(list.find((s) => getCanonicalRole(s?.role) === r)?.position?.y);
  const flY = yOf("FL");
  const frY = yOf("FR");
  const slY = yOf("SL");
  const srY = yOf("SR");
  if (flY === null || frY === null || slY === null || srY === null) return null;
  return ((flY + slY) / 2 + (frY + srY) / 2) / 2;
}

/**
 * Final position for a wall-mounted surround (SL/SR/SBL/SBR/LW/RW).
 *
 * Reuses the shared wall authority with the live yaw iterated to its fixed
 * point, so the stored position is exactly the position the wall-hug effect
 * would keep — that effect then finds nothing to change.
 */
export function resolveInitialWallPosition({
  role,
  model,
  roomDims,
  rsp,
  aimState,
  lcrAngleInfo,
  seatingPositions,
  enableFrontWides,
  placedSpeakers,
  existingPosition,
  getModelDimsM,
  getCanonicalRoleFn,
}) {
  const kind = wallHugKind(role);
  if (!kind) return null;

  const W = roomW(roomDims);
  const L = roomL(roomDims);
  if (!(W > 0 && L > 0)) return null;

  const canonFn = getCanonicalRoleFn || getCanonicalRole;
  const canon = canonFn(role);
  // The canonical side authority. A literal list here is what classified SBL as
  // a RIGHT-hand speaker, so the rear pair was seeded onto one coordinate and
  // SBR's X was reused for SBL.
  const isLeft = canonicalSide(canon) === "L";

  // A dims resolver is always supplied to the shared span rule.
  const dimsFn = typeof getModelDimsM === "function" ? getModelDimsM : (m) => resolveSpeakerDims(m);

  // Side-surround centre-line Y: the plan view's own band, from the same hook
  // the wall-hug effect uses.
  const span = resolveSideSurroundVisualSpan({
    mlpY_m: rsp?.y ?? null,
    seatingPositions,
    placedSpeakers: Array.isArray(placedSpeakers) ? placedSpeakers : [],
    getModelDimsM: dimsFn,
    lengthM: L,
    getCanonicalRole: canonFn,
  });
  const sideY = span && span.maxY > span.minY ? (span.minY + span.maxY) / 2 : L / 2;

  // Provisional Y: an existing position is respected, otherwise the role's
  // natural resting place for this wall.
  let y = num(existingPosition?.y);
  if (y === null) {
    if (kind === "side") y = sideY;
    else if (kind === "rear") y = Math.max(0, L - 0.10);
    else y = L * 0.5;
  }

  // Front wides: the RP22 median-angle authority decides Y.
  if (kind === "wide") {
    const wideY = resolveFrontWideY({
      role,
      model,
      placedSpeakers,
      roomDims,
      rsp,
      enableFrontWides,
      getModelDimsM,
    });
    if (wideY !== null) y = wideY;
  }

  let x = num(existingPosition?.x);
  if (x === null) {
    if (kind === "side" || kind === "wide") x = isLeft ? 0.01 : W - 0.01;
    else x = isLeft ? W * 0.25 : W * 0.75;
  }

  // Iterate the wall authority to its fixed point (the yaw depends on X).
  for (let i = 0; i < 2; i += 1) {
    const target = resolveWallHugTarget({
      role,
      model,
      roomDims,
      mlp: rsp,
      aimState,
      lcrAngleInfo,
      sideSurroundDefaultY: sideY,
      position: { x, y },
      getModelDimsM,
    });
    if (!target) break;
    x = target.x;
    y = target.y;
  }

  // Wides are excluded from the surround height effect, so they keep their own
  // height; sides and rears take the automatic surround height.
  const z = kind === "wide"
    ? (num(existingPosition?.z) ?? DEFAULT_EAR_Z_M)
    : resolveAutoSurroundHeight(seatingPositions, roomH(roomDims));

  return { x, y, z };
}