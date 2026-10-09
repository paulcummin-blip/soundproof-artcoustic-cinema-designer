// ---------------------------------------------------------------------------
// Dual-centre side-elevation projection authority.
//
// A side elevation is a PROJECTION of the physical installation, so it consumes
// the same geometry the Plan View already consumes and never keeps an
// arrangement of its own:
//
//   • the INSTALLED cabinet footprint — a vertically mounted cabinet is the same
//     product rotated a quarter turn, so its plan width is the product's height,
//     its drawn height is the product's width and its depth is unchanged
//     (resolveCentreCabinetFootprintM);
//   • the cabinet's stored acoustic-centre height (position.z);
//   • the aim angle from the ONE aim resolver every view draws from, resolved
//     live from the cabinet's own stored position and the current RSP — never a
//     stored angle;
//   • the front-wall mounting rule the plan draws by. The cabinets are locked to
//     the front wall, so the stored Y is the wall anchor: the REAR face sits in
//     the front-wall gap and the projected centre moves into the room by the
//     yaw-projected half-depth, which is the shared physical half-extent helper
//     the placement authority uses. Seen from the side, the projected DEPTH is
//     twice that half-extent, so a rotated cabinet deepens its footprint and
//     never enters the wall.
//
// Both cabinets are mounted on the same front wall, so with matching heights and
// depths their projections coincide exactly and the pair is drawn ONCE: it is one
// physical installation seen edge-on, belonging to ONE centre channel. Only
// genuinely different projections are drawn as separate outlines.
//
// Pure: no React, no state, no side effects, and nothing is stored. The
// projection is derived from the saved position, model and orientation every
// time it is drawn, so saving and reopening restores exactly the same geometry.
// ---------------------------------------------------------------------------

import {
  centreCabinets,
  resolveCentreCabinetFootprintM,
} from '@/components/utils/frontStageModeAuthority';
import { getCanonicalRole } from '@/components/utils/surroundRoleMap';
import { resolveSpeakerYaw } from '@/components/utils/speakerAimResolver';
import { yHalfExtentM_physical } from '@/components/room/rv/RenderPrimitives';
import { FRONT_WALL_GAP_M } from '@/components/room/placement/initialSpeakerPlacement';

/**
 * Two projections whose rear face, depth, height and acoustic-centre height all
 * sit within this distance are the same outline at drawing scale. Below one
 * drawn pixel at any room size, so coincident cabinets are never shown twice.
 */
export const COINCIDENT_PROJECTION_TOLERANCE_M = 0.005;

/**
 * Each installed centre cabinet's side projection.
 *
 * @param {object}   args
 * @param {Array}    args.placedSpeakers - the design's speakers (FCL/FCR included)
 * @param {object?}  args.mlpPoint       - the canonical RSP, for the aim angle
 * @param {string?}  args.tvPresetKey    - TV preset, so a TV-linked model
 *                                         resolves its real installed size
 * @param {object?}  args.appState       - the same state the views draw from
 * @returns {Array<{
 *   key: string, role: string, roles: string[], label: string,
 *   yM: number, depthM: number, zM: number, heightM: number, widthM: number,
 *   model: string|null, orientation: string|null, yawDeg: number,
 * }>} one entry per installed cabinet, left first. Empty for every other front
 *     stage, so a conventional single centre never produces a cabinet outline.
 */
export function resolveCentreCabinetSideProjections({
  placedSpeakers,
  mlpPoint = null,
  tvPresetKey = null,
  appState = null,
} = {}) {
  return centreCabinets(placedSpeakers)
    .map((cabinet) => {
      const role = String(getCanonicalRole(cabinet?.role) || '');
      const zM = Number(cabinet?.position?.z);
      // A cabinet with no stored acoustic-centre height cannot be projected, and
      // its height is never guessed from another cabinet.
      if (!role || !Number.isFinite(zM)) return null;

      // The cabinet's own installed size. An unmeasurable model yields null here
      // and is skipped below: dimensions are never invented.
      const footprint = resolveCentreCabinetFootprintM(
        cabinet?.model,
        cabinet?.orientation,
        tvPresetKey,
      );
      if (!footprint) return null;

      // The live aim angle, from the cabinet's own stored position to the RSP.
      const yawDeg = Number(resolveSpeakerYaw({
        speaker: cabinet,
        mlpPos: mlpPoint,
        appState: appState || {},
      })) || 0;

      return {
        key: String(cabinet?.id || role),
        role,
        roles: [role],
        label: role,
        // Rear face in the front-wall gap: the cabinet stays locked to the wall
        // however it is aimed (the plan's own mounting rule).
        yM: FRONT_WALL_GAP_M,
        // The rotated footprint as seen from the side.
        depthM: 2 * yHalfExtentM_physical(footprint.depthM, footprint.widthM, yawDeg),
        zM,
        // Installed — a vertical cabinet is the product rotated, so its drawn
        // height is the product's width and its drawn width the product's height.
        heightM: footprint.heightM,
        widthM: footprint.widthM,
        model: cabinet?.model ?? null,
        orientation: footprint.orientation,
        yawDeg,
      };
    })
    .filter(Boolean);
}

/**
 * Collapse projections that coincide into ONE outline.
 *
 * The pair is a single physical installation seen edge-on, so two cabinets at the
 * same depth, height and height-above-floor are one shared outline labelled
 * "FCL / FCR". Projections that genuinely differ keep their own outline and their
 * own role label — no cabinet is offset to make them line up.
 *
 * @param {Array} projections - from resolveCentreCabinetSideProjections
 * @param {number} [toleranceM] - coincidence tolerance in metres
 */
export function groupCoincidentSideProjections(
  projections,
  toleranceM = COINCIDENT_PROJECTION_TOLERANCE_M,
) {
  const list = (Array.isArray(projections) ? projections : []).filter(Boolean);
  const tol = Math.abs(Number(toleranceM)) || COINCIDENT_PROJECTION_TOLERANCE_M;

  const groups = [];
  list.forEach((projection) => {
    const match = groups.find((group) => (
      Math.abs(group.yM - projection.yM) <= tol
      && Math.abs(group.depthM - projection.depthM) <= tol
      && Math.abs(group.zM - projection.zM) <= tol
      && Math.abs(group.heightM - projection.heightM) <= tol
    ));

    if (match) {
      match.projections.push(projection);
      match.roles.push(projection.role);
      match.label = match.roles.join(' / ');
      return;
    }

    groups.push({
      ...projection,
      roles: [projection.role],
      label: projection.role,
      projections: [projection],
    });
  });

  return groups;
}