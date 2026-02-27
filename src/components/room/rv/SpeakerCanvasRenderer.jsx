/**
 * SpeakerCanvasRenderer
 *
 * Extracted from RoomVisualisation.jsx (renderSpeakers useCallback).
 * Renders all bed-layer speaker icons (non-overhead) as SVG elements.
 * Overhead icons are handled separately by overheadIconElements in RoomVisualisation.
 */

import React from "react";
import { resolveSurroundModel } from "@/components/utils/speakerModelResolver";
import { rolesForLayout, getCanonicalRole as getCanonicalRoleUtil } from "@/components/utils/surroundRoleMap";
import { getSpeakerModelMeta } from "@/components/models/speakers/registry";
import {
  isRenderableSpeaker,
  SpeakerIcon,
  yHalfExtentM,
  safeYawToMLP,
} from "@/components/room/rv/RenderPrimitives";
import { isDraggable } from "@/components/utils/speakerUtils";
import { WALL_BUFFER_M } from "@/components/room/constants/screenDepth";
import { getSpeakerDims } from "@/components/room/rvPlanHelpers";

// Role helpers (inlined to avoid import cycles)
const rvIsOverheadRole = (role) => {
  const r = String(role || "").toUpperCase();
  switch (r) {
    case "TFL": case "TFR": case "TML": case "TMR":
    case "TRL": case "TRR": case "TFC": case "TRC":
    case "TBC": case "TL": case "TR": case "TBL": case "TBR":
      return true;
    default:
      return false;
  }
};

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

const getAimingYawDeg = (speaker, mlpTarget) => {
  if (!speaker?.position) return 0;
  return safeYawToMLP(speaker.position, mlpTarget);
};

export default function SpeakerCanvasRenderer({
  placedSpeakers,
  roomRect,
  scale,
  widthM,
  lengthM,
  heightM,
  lcrAngleInfo,
  aimAtMLP,
  aimFrontWidesAtMLP,
  aimSideSurroundsAtMLP,
  aimRearSurroundsAtMLP,
  mlp,
  dolbyLayout,
  appState,
  exportMode,
  getSpeakerVisibility,
  getCanonicalRole,
  bedLayerSpeakerMouseDownHandler,
  handleIconEnter,
  handleIconMove,
  handleIconLeave,
}) {
  if (!roomRect) return null;

  const toCanvasX = (xM) => {
    const safeX = Number.isFinite(xM) ? xM : 0;
    return (roomRect?.x ?? 0) + (safeX * scale);
  };

  const toCanvasY = (yM) => {
    const safeY = Number.isFinite(yM) ? yM : 0;
    return (roomRect?.y ?? 0) + (safeY * scale);
  };

  // 1) Basic structural filter
  const rawSpeakers = Array.isArray(placedSpeakers) ? placedSpeakers : [];
  const afterRenderable = rawSpeakers.filter(isRenderableSpeaker);

  // 2) Visibility filter (layout roles)
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

  const overheadGlobalModel =
    appState?.overheadGlobalModel ??
    appState?.overheadState?.globalModel ??
    speakerSystem?.overheadGlobalModel ??
    null;

  const overheadsAreOff = (() => {
    const ms = String(overheadGlobalModel ?? "").trim().toLowerCase();
    return !ms || ms === "off" || ms === "none";
  })();

  const extraSurroundPattern = /^(SL|SR)\d+$/;

  const afterVisibility = afterRenderable.filter((s) => {
    const canon = getCanonicalRole(s?.role);

    if (canon === "LFE") return false;

    const isExtraSurround = extraSurroundPattern.test(canon);
    if (isExtraSurround) {
      return allowedRoles.has("SL") || allowedRoles.has("SR");
    }

    if (String(canon).toUpperCase().startsWith("T")) {
      if (!allowedRoles.has(canon)) return false;
      if (overheadsAreOff) return false;
      return true;
    }

    if (["SL", "SR", "SBL", "SBR", "LW", "RW"].includes(canon)) {
      return allowedRoles.has(canon);
    }

    return getSpeakerVisibility(s.role, s.model);
  });

  // 3) Map to icons
  return afterVisibility.map((speaker) => {
    const { id, role: rawRole, model, position = {} } = speaker;

    const canon = getCanonicalRole(rawRole);
    const role = canon;

    // Overhead icons are rendered elsewhere
    if (rvIsOverheadRole(role)) return null;

    let resolvedModel = resolveSurroundModel(model, canon);

    if (!resolvedModel && ["SL", "SR", "SBL", "SBR", "LW", "RW"].includes(canon)) {
      const globalSurroundModel = placedSpeakers?.find((s) => {
        const c = getCanonicalRole(s.role);
        return ["SL", "SR", "SBL", "SBR", "LW", "RW"].includes(c) && s.model && s.model !== "off";
      })?.model;
      resolvedModel = globalSurroundModel || "evolve-2-1_s";
    }

    const dims = getSpeakerDims(resolvedModel);
    const widthM_spk = dims.widthM || 0.27;
    const depthM_spk = dims.depthM || 0.082;

    // Yaw calculation
    let yawDeg;

    const isExport = typeof exportMode === "string" && exportMode.length > 0;
    if (isExport) {
      const savedYaw = speaker?.rotation?.y;
      const hasMeaningfulSavedYaw =
        typeof savedYaw === "number" && Number.isFinite(savedYaw) && Math.abs(savedYaw) > 0.001;
      if (hasMeaningfulSavedYaw) {
        yawDeg = -savedYaw;
      }
    }

    const isLCR = canon === "FL" || canon === "FR" || canon === "FC";
    const isFrontWide = canon === "LW" || canon === "RW";
    const isExtraSurround2 = extraSurroundPattern.test(canon);
    const isSideSurround = canon === "SL" || canon === "SR" || isExtraSurround2;
    const isRearSurround = canon === "SBL" || canon === "SBR";

    if (yawDeg == null && isLCR) {
      if (aimAtMLP) {
        if (canon === "FL") yawDeg = lcrAngleInfo?.L ?? 0;
        else if (canon === "FR") yawDeg = lcrAngleInfo?.R ?? 0;
        else yawDeg = 0;
      } else {
        yawDeg = 0;
      }
    } else if (yawDeg == null && isFrontWide) {
      yawDeg = aimFrontWidesAtMLP
        ? getAimingYawDeg(speaker, mlp)
        : canon === "LW" ? +90 : -90;
    } else if (yawDeg == null && isSideSurround) {
      yawDeg = aimSideSurroundsAtMLP
        ? getAimingYawDeg(speaker, mlp)
        : canon === "SL" ? 90 : -90;
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

    // Wall-safe center clamp
    const W = Number(widthM) || 0;
    const L = Number(lengthM) || 0;

    if (W > 0 && L > 0 && speaker?.position) {
      const wall = Number(WALL_BUFFER_M) || 0.01;
      const canonRole = getCanonicalRole(speaker.role);

      const isLeftWallRole = canonRole === "LW" || canonRole === "SL";
      const isRightWallRole = canonRole === "RW" || canonRole === "SR";
      const isBackWallRole = canonRole === "SBL" || canonRole === "SBR";

      if (isLeftWallRole || isRightWallRole) {
        const halfToWall = rotatedHalfExtentToWall(finalYawDeg, widthM_spk, depthM_spk, "x");
        const xMin = wall + halfToWall;
        const xMax = W - wall - halfToWall;
        speaker = {
          ...speaker,
          position: {
            ...speaker.position,
            x: Math.min(xMax, Math.max(xMin, Number(speaker.position.x) || 0)),
          },
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
          },
        };
      }
    }

    const canvasX = toCanvasX(speaker.position.x ?? 0);
    const canvasY = toCanvasY(speaker.position.y ?? 0);
    const safeCanvasX = Number.isFinite(canvasX) ? canvasX : 0;
    const safeCanvasY = Number.isFinite(canvasY) ? canvasY : 0;

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