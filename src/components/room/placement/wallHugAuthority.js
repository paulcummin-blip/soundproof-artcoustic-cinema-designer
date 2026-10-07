// wallHugAuthority.js
// ---------------------------------------------------------------------------
// ONE authority for where a wall-mounted surround belongs.
//
// Both consumers resolve their target through this module, so a newly installed
// speaker is placed where the plan view would place it and no second correction
// pass can move it afterwards:
//
//   1. the plan view's wall-hug effects (useAutoHugSurroundsToWalls)
//   2. initial placement, resolved in the same update that assigns the model
//
// Pure: no React, no side effects. Geometry comes from the shared wall helpers
// (sideWallX / rearWallY) and the shared aim resolver (getPlanAimDeg), so the
// target is identical to what the renderer draws.
// ---------------------------------------------------------------------------

import { sideWallX, rearWallY } from "@/components/room/rv/utils/rvGeometry";
import { getPlanAimDeg } from "@/components/room/rv/utils/rvAiming";
import { getCanonicalRole } from "@/components/utils/surroundRoleMap";
import { getSpeakerModelMeta } from "@/components/models/speakers/registry";

const SIDE_SURROUND_RE = /^(SL|SR)\d*$/;

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Physical dimensions for a model. Callers may supply their own resolver so the
 * authority never disagrees with the view that is drawing the speaker.
 */
export function resolveSpeakerDims(model, getModelDimsM) {
  if (typeof getModelDimsM === "function") {
    const dims = getModelDimsM(model) || {};
    return {
      widthM: num(dims.widthM) || 0.27,
      depthM: num(dims.depthM) || 0.082,
      heightM: num(dims.heightM) || 0.2,
    };
  }
  const meta = getSpeakerModelMeta(model) || {};
  return {
    widthM: num(meta.widthM) || 0.27,
    depthM: num(meta.depthM) || 0.082,
    heightM: num(meta.heightM) || 0.2,
  };
}

/** 'side' | 'rear' | 'wide' | null — the wall-mount class of a role. */
export function wallHugKind(role) {
  const canon = getCanonicalRole(role);
  if (SIDE_SURROUND_RE.test(canon)) return "side";
  if (canon === "SBL" || canon === "SBR") return "rear";
  if (canon === "LW" || canon === "RW") return "wide";
  return null;
}

/**
 * Resolve the wall target for one speaker.
 *
 * @param {object}   opts
 * @param {string}   opts.role           speaker role
 * @param {string}   opts.model          assigned model (dims are read from it)
 * @param {object}   opts.roomDims       { widthM, lengthM } (or width/length)
 * @param {object}   opts.mlp            canonical RSP { x, y }
 * @param {object}   opts.aimState       { aimFrontWidesAtMLP, aimSideSurroundsAtMLP, aimRearSurroundsAtMLP }
 * @param {object}   opts.lcrAngleInfo   LCR angle table (ignored for these roles)
 * @param {number}   opts.sideSurroundDefaultY  centre-line Y for side surrounds
 * @param {object}   opts.position       the position the live yaw is evaluated from
 * @param {function} [opts.getModelDimsM]
 * @param {string[]} [opts.kinds]        which classes this caller owns
 * @returns {{ kind: string, x: number, y: number, yawDeg: number } | null}
 */
export function resolveWallHugTarget({
  role,
  model,
  roomDims,
  mlp,
  aimState,
  lcrAngleInfo,
  sideSurroundDefaultY,
  position,
  getModelDimsM,
  kinds = ["side", "rear", "wide"],
}) {
  const kind = wallHugKind(role);
  if (!kind || !kinds.includes(kind)) return null;

  const x0 = num(position?.x);
  const y0 = num(position?.y);
  if (x0 === null || y0 === null) return null;

  const W = num(roomDims?.widthM ?? roomDims?.width) || 0;
  const L = num(roomDims?.lengthM ?? roomDims?.length) || 0;
  if (!(W > 0 && L > 0)) return null;

  const dims = resolveSpeakerDims(model, getModelDimsM);
  const canon = getCanonicalRole(role);

  const liveYaw = getPlanAimDeg(
    { x: x0, y: y0, role },
    mlp || null,
    W,
    L,
    false,
    kind === "wide" ? !!aimState?.aimFrontWidesAtMLP : false,
    kind === "side" ? !!aimState?.aimSideSurroundsAtMLP : false,
    kind === "rear" ? !!aimState?.aimRearSurroundsAtMLP : false,
    lcrAngleInfo || null
  );

  if (kind === "side") {
    const isLeft = canon.startsWith("SL");
    const defaultY = num(sideSurroundDefaultY);
    return {
      kind,
      x: sideWallX(W, dims, isLeft ? "L" : "R", liveYaw),
      y: defaultY === null ? L / 2 : defaultY,
      yawDeg: liveYaw,
    };
  }

  if (kind === "rear") {
    return { kind, x: x0, y: rearWallY(L, dims, liveYaw), yawDeg: liveYaw };
  }

  // Front wides keep their Y (they slide along the wall); only X is wall-pinned.
  const isLeft = canon === "LW";
  return {
    kind,
    x: sideWallX(W, dims, isLeft ? "L" : "R", liveYaw),
    y: y0,
    yawDeg: liveYaw,
  };
}