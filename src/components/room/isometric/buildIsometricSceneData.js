// buildIsometricSceneData.js
// ---------------------------------------------------------------------------
// Pure geometry builder for the Isometric View.
//
// Converts the active design version's authoritative Room Designer state into a
// normalised scene description in metres, using the SAME resolvers the existing
// Plan / Front / Side drawings consume. It creates NO isometric-only speaker,
// subwoofer, seating, screen or room coordinates: every position is read from
// the active-version state and only converted once.
//
// Coordinate convention (unchanged):
//   X = room width (0 = left wall)
//   Y = front-to-rear (0 = front wall)
//   Z = height above finished floor (0 = floor)
//
// This module is pure: no React, no Three.js, no side effects. The IsometricView
// component turns this description into Three.js meshes.
// ---------------------------------------------------------------------------

import { getSpeakerModelMeta } from "@/components/models/speakers/registry";
import { resolveEffectiveViewableDimsM } from "@/components/models/screen/resolveEffectiveScreen";
import { resolveScreenFrameGeometry, resolveScreenBorderM } from "@/components/models/screen/screenFrameGeometry";
import { resolveProjectorPosition } from "@/components/room/rv/utils/resolveProjectorPosition";
import { resolveActiveSpeakerLayout } from "@/components/room/rv/utils/resolveActiveSpeakerLayout";
import { getCanonicalRole } from "@/components/utils/surroundRoleMap";
import { resolveSpeakerYaw } from "@/components/utils/speakerAimResolver";
import { isCentreCabinetRole, resolveCentreCabinetFootprintM } from "@/components/utils/frontStageModeAuthority";
import { resolveSoundbarCabinetLengthMm } from "@/components/models/speakers/soundbarCabinetVariant";
import { bassInputAdapter } from "@/components/utils/subwooferInstanceMigration";
import { storedSubwooferBottomM, subwooferCentreZM } from "@/components/utils/subwooferDrawingHeight";

const NUM = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

// Room dimensions — reads the same object the existing drawings read.
export function resolveRoomDims(appState, stableDimensions) {
  const src = stableDimensions || appState?.roomDims || {};
  return {
    widthM: NUM(src?.widthM ?? src?.width, 4.5),
    lengthM: NUM(src?.lengthM ?? src?.length, 6.0),
    heightM: NUM(src?.heightM ?? src?.height, 2.8),
  };
}

// Screen front plane Y — same priority chain as SideElevation / RSP resolver.
function resolveScreenFrontPlaneY(screen, appStateFrontPlaneM) {
  const published = NUM(appStateFrontPlaneM, 0);
  if (published > 0) return published;
  const planeY = NUM(screen?.screenPlaneY_m, 0);
  if (planeY > 0) return planeY;
  const legacy = NUM(screen?.screenFrontPlane_m ?? screen?.screen_front_plane_m, 0);
  if (legacy > 0) return legacy;
  const floatDepth = NUM(screen?.floatDepthM, 0);
  if (floatDepth > 0) return floatDepth;
  return 0.20;
}

// Screen: build from the single effective-screen + frame geometry authority.
export function buildScreenMeshData({ screen, appStateFrontPlaneM }) {
  if (!screen) return null;
  const frame = resolveScreenFrameGeometry(screen);
  const frontY = resolveScreenFrontPlaneY(screen, appStateFrontPlaneM);
  const roomW = NUM(screen?._roomWidthM, 0); // not needed here but kept for parity
  return {
    kind: "screen",
    centreX: (screen?.screenCenterX ?? null), // unused; centred on room centreline downstream
    frontY,
    borderM: frame.borderM,
    viewableWidthM: frame.viewableWidthM,
    viewableHeightM: frame.viewableHeightM,
    overallWidthM: frame.overallWidthM,
    overallHeightM: frame.overallHeightM,
    frameBottomM: frame.frameBottomM,
    viewableBottomM: frame.viewableBottomM,
    viewableTopM: frame.viewableTopM,
    frameTopM: frame.frameTopM,
  };
}

// Projector: shared resolver consumed by Plan View and Side Elevation.
export function buildProjectorMeshData({ roomElements, roomDims }) {
  const pos = resolveProjectorPosition(roomElements, { heightM: roomDims?.heightM });
  if (!pos || pos.lensY === null) return null;
  return {
    kind: "projector",
    lensX: pos.lensX,
    lensY: pos.lensY,
    lensZ: pos.lensZ,
    bodyWidthM: pos.bodyWidthM,
    bodyDepthM: pos.bodyDepthM,
    bodyHeightM: pos.bodyHeightM,
  };
}

// Speakers: use the canonical active-layout resolver + existing yaw authority.
// Cabinet dimensions come from getSpeakerModelMeta (the same registry the
// Front/Side elevations use). Dual-centre cabinets use their installed footprint.
export function buildSpeakerMeshData({
  placedSpeakers,
  appState,
  dolbyLayout,
  getSpeakerVisibility,
  mlpPoint,
  screen,
}) {
  const resolved = resolveActiveSpeakerLayout({
    placedSpeakers,
    appState,
    dolbyLayout,
    getCanonicalRoleFn: getCanonicalRole,
    getSpeakerVisibility,
  });
  if (!Array.isArray(resolved)) return [];

  const tvPresetKey = screen?.tvPresetKey || null;
  const out = [];
  for (const s of resolved) {
    const role = String(s?.role || "").toUpperCase();
    const canon = getCanonicalRole(role);
    const pos = s?.position || {};
    if (!Number.isFinite(NUM(pos?.x, NaN)) || !Number.isFinite(NUM(pos?.y, NaN))) continue;

    const isCabinet = isCentreCabinetRole(canon);
    const footprint = isCabinet
      ? resolveCentreCabinetFootprintM(s?.model, s?.orientation, tvPresetKey, { cabinetLengthMm: s?.cabinetLengthMm })
      : null;

    const cabinetLengthMm = isCabinet
      ? (footprint?.cabinetLengthMm ?? null)
      : resolveSoundbarCabinetLengthMm({ modelKey: s?.model, screen, explicitMm: s?.cabinetLengthMm });

    const meta = getSpeakerModelMeta(s?.model, tvPresetKey, { cabinetLengthMm });
    const widthM = footprint ? footprint.widthM : (Number.isFinite(meta?.widthM) && meta.widthM > 0 ? meta.widthM : 0.20);
    const heightM = footprint ? footprint.heightM : (Number.isFinite(meta?.heightM) && meta.heightM > 0 ? meta.heightM : 0.20);
    const depthM = footprint ? footprint.depthM : (Number.isFinite(meta?.depthM) && meta.depthM > 0 ? meta.depthM : 0.10);
    const round = !!meta?.round;

    // Yaw: the existing authority. Never read raw rotation.y as a new authority.
    const yawDeg = resolveSpeakerYaw({
      speaker: { ...s, position: pos },
      mlpPos: mlpPoint,
      appState,
      getCanonicalRole,
    });

    out.push({
      kind: "speaker",
      role,
      canon,
      model: s?.model || null,
      isCabinet,
      round,
      x: NUM(pos?.x, 0),
      y: NUM(pos?.y, 0),
      z: NUM(pos?.z, 1.2),
      widthM,
      heightM,
      depthM,
      yawDeg,
      isOverhead: /^T/.test(canon),
    });
  }
  return out;
}

// Subwoofers: appState.subwooferInstances through the existing bassInputAdapter,
// exactly as RoomDesigner derives frontSubsForRendering / rearSubsForRendering.
export function buildSubwooferMeshData({ appState, stableDimensions }) {
  const instances = Array.isArray(appState?.subwooferInstances) ? appState.subwooferInstances : [];
  if (!instances.length) return [];
  const adapted = bassInputAdapter(instances, {
    frontOrientation: appState?.frontSubsCfg?.orientation ?? null,
    rearOrientation: appState?.rearSubsCfg?.orientation ?? null,
  });
  const out = [];
  for (const s of adapted) {
    if (!s || s.enabled === false) continue;
    const meta = getSpeakerModelMeta(s?.model, s?.orientation) || {};
    const widthM = Number.isFinite(meta?.widthM) && meta.widthM > 0 ? meta.widthM : 0.50;
    const heightM = Number.isFinite(meta?.heightM) && meta.heightM > 0 ? meta.heightM : 0.50;
    const depthM = Number.isFinite(meta?.depthM) && meta.depthM > 0 ? meta.depthM : 0.30;
    // centreZ is already derived by bassInputAdapter (bottomHeightM + h/2).
    const z = Number.isFinite(s?.z) ? s.z : subwooferCentreZM(s, heightM, s?.group === "front" ? appState?.frontSubsCfg : appState?.rearSubsCfg);
    out.push({
      kind: "subwoofer",
      role: s?.role || "SUB",
      model: s?.model || null,
      x: NUM(s?.x, 0),
      y: NUM(s?.y, 0),
      z,
      widthM,
      heightM,
      depthM,
      rotationDeg: NUM(s?.rotationDeg, 0),
      group: s?.group || null,
    });
  }
  return out;
}

// Listening positions: simple 3D heads. Stored {x,y,z} is the EXACT centre of
// the head. Head size is presentation-only (0.16 × 0.22 × 0.20). platformHeightM
// is NOT added — stored z is already absolute (Old Coastguards row 2 z = 1.6 m).
export const HEAD_SIZE_M = { width: 0.16, height: 0.22, depth: 0.20 };

export function buildHeadMeshData({ seatingPositions, mlpPoint, screen, roomDims }) {
  const seats = Array.isArray(seatingPositions) ? seatingPositions : [];
  if (!seats.length && !(mlpPoint && Number.isFinite(mlpPoint?.x) && Number.isFinite(mlpPoint?.y))) return [];

  // Screen facing direction: toward the front wall (negative Y) from the seat.
  // Used only when no per-seat facing is stored.
  const screenFrontY = resolveScreenFrontPlaneY(screen, null);

  const out = [];
  for (const seat of seats) {
    const x = NUM(seat?.x, NaN);
    const y = NUM(seat?.y, NaN);
    const z = NUM(seat?.z, NaN);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    out.push({
      kind: "head",
      id: seat?.id || `seat-${x}-${y}`,
      x, y, z,
      isPrimary: !!seat?.isPrimary,
      rowNumber: seat?.rowNumber ?? null,
      isRsp: false,
      // Facing: toward the screen (negative Y). Presentation-only.
      facingYawDeg: 0, // 0° = facing -Y (front wall) under the room convention
    });
  }

  // RSP marker (separate reference marker) only if the MLP is NOT one of the seats.
  if (mlpPoint && Number.isFinite(mlpPoint?.x) && Number.isFinite(mlpPoint?.y)) {
    const mx = NUM(mlpPoint?.x, NaN);
    const my = NUM(mlpPoint?.y, NaN);
    const mz = Number.isFinite(mlpPoint?.z) ? mlpPoint.z : 1.2;
    if (Number.isFinite(mx) && Number.isFinite(my)) {
      const alreadyASeat = out.some((h) => Math.abs(h.x - mx) < 0.01 && Math.abs(h.y - my) < 0.01);
      if (!alreadyASeat) {
        out.push({
          kind: "head",
          id: "rsp-marker",
          x: mx, y: my, z: mz,
          isPrimary: false,
          rowNumber: null,
          isRsp: true,
          facingYawDeg: 0,
        });
      }
    }
  }
  return out;
}

// Room elements (doors, windows): using current conventions from RvRoomElementsLayer.
export function buildRoomElementMeshData({ roomElements, roomDims }) {
  if (!Array.isArray(roomElements)) return [];
  const out = [];
  for (const el of roomElements) {
    if (!el || el?.type === "projector") continue; // projector handled separately
    const type = el?.type || "element";
    const wallRaw = String(el?.wall || el?.side || "front").toLowerCase();
    const wall = wallRaw === "back" ? "rear" : wallRaw;

    const lengthM = NUM(el?.length_m ?? el?.lengthM ?? el?.width, 0.9);
    const thicknessM = NUM(el?.thickness_m ?? el?.thicknessM, 0.05);
    const height = NUM(el?.height ?? el?.height_m, type === "door" ? 2.1 : 1.0);
    const zPos = NUM(el?.z_position ?? el?.z_m ?? el?.z_m, 0);

    let posM = NUM(el?.pos_m, NaN);
    if (!Number.isFinite(posM)) posM = NUM(el?.x_m ?? el?.y_m, 0);

    let rect = null;
    if (wall === "front") rect = { x: posM, y: 0, w: lengthM, h: thicknessM };
    else if (wall === "rear") rect = { x: posM, y: (roomDims?.lengthM || 6) - thicknessM, w: lengthM, h: thicknessM };
    else if (wall === "left") rect = { x: 0, y: posM, w: thicknessM, h: lengthM };
    else if (wall === "right") rect = { x: (roomDims?.widthM || 4.5) - thicknessM, y: posM, w: thicknessM, h: lengthM };
    else continue;

    out.push({
      kind: "roomElement",
      type,
      wall,
      label: el?.label || el?.name || type,
      x: rect.x + rect.w / 2,
      y: rect.y + rect.h / 2,
      zBottom: zPos,
      zTop: zPos + height,
      widthM: rect.w,
      depthM: rect.h,
      heightM: height,
    });
  }
  return out;
}

// Top-level builder: assembles the full scene description.
export function buildIsometricSceneData({
  appState,
  stableDimensions,
  placedSpeakers,
  seatingPositions,
  mlpPoint,
  screen,
  roomElements,
  dolbyLayout,
  getSpeakerVisibility,
  showRspMarker = true,
}) {
  const roomDims = resolveRoomDims(appState, stableDimensions);
  const screenData = buildScreenMeshData({ screen, appStateFrontPlaneM: appState?.screenFrontPlaneM });
  if (screenData) {
    // Centre the screen on the room centreline (X = width / 2).
    screenData.centreX = roomDims.widthM / 2;
  }
  return {
    roomDims,
    screen: screenData,
    projector: buildProjectorMeshData({ roomElements, roomDims }),
    speakers: buildSpeakerMeshData({ placedSpeakers, appState, dolbyLayout, getSpeakerVisibility, mlpPoint, screen }),
    subwoofers: buildSubwooferMeshData({ appState, stableDimensions }),
    heads: buildHeadMeshData({ seatingPositions, mlpPoint, screen, roomDims }),
    roomElements: buildRoomElementMeshData({ roomElements, roomDims }),
    showRspMarker,
  };
}