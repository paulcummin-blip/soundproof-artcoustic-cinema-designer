import React from "react";
import { isRenderableSpeaker, SpeakerIcon, getSpeakerDims } from "@/components/room/rv/RenderPrimitives";
import { rvIsOverheadRole } from "@/components/room/rv/utils/roomVisualisationUtils";
import { resolveSurroundModel } from "@/components/utils/speakerModelResolver";
import { rolesForLayout } from "@/components/utils/surroundRoleMap";
import { getAimingYawDeg } from "@/components/room/rv/utils/rvAiming";
import { safeYawToMLP } from "@/components/room/rv/RenderPrimitives";
import { isDraggable } from "@/components/utils/speakerUtils";
import { WALL_BUFFER_M } from "@/components/room/constants/screenDepth";

const degToRad = (deg) => (deg * Math.PI) / 180;

const rotatedHalfExtentToWall = (yawDeg, widthM_spk, depthM_spk, wallAxis) => {
  const halfW = Math.max(0, (Number(widthM_spk) || 0) / 2);
  const halfD = Math.max(0, (Number(depthM_spk) || 0) / 2);
  const a = Math.abs(Math.cos(degToRad(Number(yawDeg) || 0)));
  const b = Math.abs(Math.sin(degToRad(Number(yawDeg) || 0)));

  return wallAxis === "x"
    ? (a * halfW + b * halfD)
    : (b * halfW + a * halfD);
};

export default function RvSpeakerLayer({
  placedSpeakers,
  roomRect,
  scale,
  getCanonicalRole,
  getSpeakerVisibility,
  appState,
  dolbyLayout,
  exportMode,
  aimAtMLP,
  aimFrontWidesAtMLP,
  aimSideSurroundsAtMLP,
  aimRearSurroundsAtMLP,
  lcrAngleInfo,
  mlp,
  widthM,
  lengthM,
  bedLayerSpeakerMouseDownHandler,
  handleIconEnter,
  handleIconMove,
  handleIconLeave,
}) {
  if (!roomRect || !Number.isFinite(scale)) return null;

  const rawSpeakers = Array.isArray(placedSpeakers) ? placedSpeakers : [];
  const renderList = rawSpeakers;

  // 1) Basic structural filter
  const afterRenderable = renderList.filter(isRenderableSpeaker);

  // 2) Layout visibility filter
  const speakerSystem = appState?.speakerSystem;
  const sevenBedLayoutType = appState?.sevenBedLayoutType;

  const layoutRaw =
    speakerSystem?.dolbyLayout ??
    speakerSystem?.dolbyPreset ??
    dolbyLayout ??
    "5.1";

  const layoutKey =
    (typeof layoutRaw === "string" ? layoutRaw : layoutRaw?.layout || "5.1")
      .toString()
      .trim()
      .split(" ")[0]
      .split("_")[0];

  const useWidesInsteadOfRears =
    !!speakerSystem?.useWidesInsteadOfRears ||
    speakerSystem?.sevenBedLayoutType === "wides" ||
    sevenBedLayoutType === "wides" ||
    false;

  const allowedRoles = new Set(
    rolesForLayout({
      dolbyLayout: layoutKey,
      useWidesInsteadOfRears: !!useWidesInsteadOfRears,
    })
  );

  // Overheads OFF check
  const overheadGlobalModel =
    appState?.overheadGlobalModel ??
    appState?.overheadState?.globalModel ??
    speakerSystem?.overheadGlobalModel ??
    null;

  const overheadsAreOff = (() => {
    const ms = String(overheadGlobalModel ?? "").trim().toLowerCase();
    return !ms || ms === "off" || ms === "none";
  })();

  const afterVisibility = afterRenderable.filter((s) => {
    const canon = getCanonicalRole(s?.role);

    // Always hide LFE
    if (canon === "LFE") return false;

    // Extra surrounds visibility
    const extraSurroundPattern = /^(SL|SR)\d+$/;
    const isExtraSurround = extraSurroundPattern.test(canon);

    if (isExtraSurround) {
      return allowedRoles.has("SL") || allowedRoles.has("SR");
    }

    // Overheads
    if (String(canon).toUpperCase().startsWith("T")) {
      if (!allowedRoles.has(canon)) return false;
      if (overheadsAreOff) return false;
      return true;
    }

    // Bed surrounds
    if (["SL", "SR", "SBL", "SBR", "LW", "RW"].includes(canon)) {
      return allowedRoles.has(canon);
    }

    return getSpeakerVisibility(s.role, s.model);
  });

  // Local coordinate mappers
  const toCanvasX = (xM) => {
    const safeX = Number.isFinite(xM) ? xM : 0;
    return (roomRect?.x ?? 0) + (safeX * scale);
  };

  const toCanvasY = (yM) => {
    const safeY = Number.isFinite(yM) ? yM : 0;
    return (roomRect?.y ?? 0) + (safeY * scale);
  };

  // Render speaker icons
  return afterVisibility.map((speaker) => {
    const { id, role: rawRole, model, position = {} } = speaker;

    const canon = getCanonicalRole(rawRole);
    const role = canon;

    // Skip overheads (rendered separately)
    if (rvIsOverheadRole(role)) {
      return null;
    }

    // Resolve model
    let resolvedModel = resolveSurroundModel(model, canon);

    if (!resolvedModel && ['SL', 'SR', 'SBL', 'SBR', 'LW', 'RW'].includes(canon)) {
      const globalSurroundModel = placedSpeakers?.find(s => {
        const c = getCanonicalRole(s.role);
        return ['SL', 'SR', 'SBL', 'SBR', 'LW', 'RW'].includes(c) && s.model && s.model !== 'off';
      })?.model;

      resolvedModel = globalSurroundModel || 'evolve-2-1_s';
    }

    const dims = getSpeakerDims(resolvedModel);
    const widthM_spk = dims.widthM || 0.27;
    const depthM_spk = dims.depthM || 0.082;

    // Position
    const pos_x = position.x ?? 0;
    const pos_y = position.y ?? 0;

    // YAW CALCULATION
    let yawDeg;

    const isExport = typeof exportMode === "string" && exportMode.length > 0;
    if (isExport) {
      const savedYaw = speaker?.rotation?.y;
      const hasMeaningfulSavedYaw =
        (typeof savedYaw === "number" && Number.isFinite(savedYaw) && Math.abs(savedYaw) > 0.001);

      if (hasMeaningfulSavedYaw) {
        yawDeg = -savedYaw;
      }
    }

    const isLCR = (canon === "FL" || canon === "FR" || canon === "FC");
    const isFrontWide = (canon === "LW" || canon === "RW");
    const extraSurroundPattern = /^(SL|SR)\d+$/;
    const isExtraSurround = extraSurroundPattern.test(canon);
    const isSideSurround = (canon === "SL" || canon === "SR" || isExtraSurround);
    const isRearSurround = (canon === "SBL" || canon === "SBR");

    if (yawDeg == null && isLCR) {
      if (aimAtMLP) {
        if (canon === 'FL') yawDeg = lcrAngleInfo?.L ?? 0;
        else if (canon === 'FR') yawDeg = lcrAngleInfo?.R ?? 0;
        else yawDeg = 0;
      } else {
        yawDeg = 0;
      }
    } else if (yawDeg == null && isFrontWide) {
      if (aimFrontWidesAtMLP) {
        yawDeg = getAimingYawDeg(speaker, mlp);
      } else {
        yawDeg = (canon === "LW") ? +90 : -90;
      }
    } else if (yawDeg == null && isSideSurround) {
      if (aimSideSurroundsAtMLP) {
        yawDeg = getAimingYawDeg(speaker, mlp);
      } else {
        yawDeg = (canon === "SL") ? 90 : -90;
      }
    } else if (yawDeg == null && isRearSurround) {
      if (aimRearSurroundsAtMLP) {
        yawDeg = getAimingYawDeg(speaker, mlp);
      } else {
        const pos = speaker.position || {};
        const distLeft = Math.abs(pos.x - 0);
        const distRight = Math.abs(widthM - pos.x);
        const distBack = Math.abs(lengthM - pos.y);
        const minDist = Math.min(distLeft, distRight, distBack);

        if (minDist === distBack) yawDeg = 180;
        else if (minDist === distLeft) yawDeg = 90;
        else if (minDist === distRight) yawDeg = -90;
        else yawDeg = 180;
      }
    } else if (yawDeg == null) {
      yawDeg = 0;
    }

    let finalYawDeg = Number.isFinite(yawDeg) ? yawDeg : 0;

    // Wall-safe clamp
    const W = Number(widthM) || 0;
    const L = Number(lengthM) || 0;

    if (W > 0 && L > 0 && speaker?.position) {
      const wall = Number(WALL_BUFFER_M) || 0.01;
      const canonRole = getCanonicalRole(speaker.role);

      const isLeftWallRole = (canonRole === "LW" || canonRole === "SL");
      const isRightWallRole = (canonRole === "RW" || canonRole === "SR");
      const isBackWallRole = (canonRole === "SBL" || canonRole === "SBR");

      if (isLeftWallRole || isRightWallRole) {
        const halfToWall = rotatedHalfExtentToWall(finalYawDeg, widthM_spk, depthM_spk, "x");
        const xMin = wall + halfToWall;
        const xMax = W - wall - halfToWall;

        speaker = {
          ...speaker,
          position: {
            ...speaker.position,
            x: Math.min(xMax, Math.max(xMin, Number(speaker.position.x) || 0)),
          }
        };
      }

      if (isBackWallRole) {
        const halfToWall = rotatedHalfExtentToWall(finalYawDeg, widthM_spk, depthM_spk, "y");
        const yMin = wall + halfToWall;
        const yMax = L - wall - halfToWall;

        speaker = {
          ...speaker,
          position: {
            ...speaker.position,
            y: Math.min(yMax, Math.max(yMin, Number(speaker.position.y) || 0)),
          }
        };
      }
    }

    // Canvas coords
    const canvasX = toCanvasX(speaker.position.x ?? 0);
    const canvasY = toCanvasY(speaker.position.y ?? 0);

    const safeCanvasX = Number.isFinite(canvasX) ? canvasX : 0;
    const safeCanvasY = Number.isFinite(canvasY) ? canvasY : 0;

    if (!Number.isFinite(canvasX) || !Number.isFinite(canvasY)) {
      if (globalThis.__B44_LOGS) {
        console.warn('[RV] INVALID CANVAS COORDS', {
          id, role, pos: position, canvasX, canvasY,
        });
      }
    }

    if (['SBL', 'SBR', 'LW', 'RW'].includes(canon)) {
      if (globalThis.__B44_LOGS) {
        console.log('[RV icon]', {
          id, role, canon, model, resolvedModel,
          pos: position, canvasX: safeCanvasX, canvasY: safeCanvasY,
          yawDeg: finalYawDeg, widthM_spk, depthM_spk,
        });
      }
    }

    const speakerDragHandler = isDraggable(speaker)
      ? (e) => bedLayerSpeakerMouseDownHandler(e, id)
      : undefined;

    return (
      <SpeakerIcon
        key={id}
        speaker={{ ...speaker, model: resolvedModel }}
        canvasX={safeCanvasX}
        canvasY_raw={safeCanvasY}
        yawDeg={finalYawDeg}
        widthM={widthM_spk}
        depthM={depthM_spk}
        scale={scale}
        speakerMouseDownHandler={speakerDragHandler}
        onIconEnter={handleIconEnter}
        onIconMove={handleIconMove}
        onIconLeave={handleIconLeave}
      />
    );
  });
}