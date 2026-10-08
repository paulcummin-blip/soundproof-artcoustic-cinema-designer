"use client";

import React, { useCallback, useMemo } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppState } from "@/components/AppStateProvider";
import { generateDXF, downloadTextFile } from "@/components/utils/cadExport";
import { useMlpCalculation } from "@/components/room/rv/hooks/useMlpCalculation";
import { resolveRspScreenFrontPlaneM } from "@/components/room/rsp/screenGeometryResolver";
import { resolveActiveSpeakerLayout } from "@/components/room/rv/utils/resolveActiveSpeakerLayout";
import { getCanonicalRole } from "@/components/utils/surroundRoleMap";
import {
  buildProjectCadPayload,
  buildScreenMetrics,
  buildLcrAngleInfo,
  buildSubwooferCfgs,
} from "./buildProjectCadPayload";

/**
 * ProjectCadExportButton
 * ----------------------
 * Downloads the active design version as a CAD drawing (DXF R12, millimetres,
 * layered) using the existing shared cadExport utilities — no second generator.
 *
 * Everything is read from the live Room Designer state at click time, through
 * the same authorities Plan View uses, so the drawing is never an old saved
 * snapshot. If required geometry is unavailable the action is disabled and the
 * reason is shown on the button instead of producing a misleading drawing.
 */
export default function ProjectCadExportButton({
  projectName,
  versionName,
  disabled = false,
}) {
  const appState = useAppState() || {};

  const roomDims = appState?.roomDims || {};
  const widthM = Number(roomDims.widthM) || 0;
  const lengthM = Number(roomDims.lengthM) || 0;
  const seatingPositions = Array.isArray(appState?.seatingPositions)
    ? appState.seatingPositions
    : [];
  const placedSpeakers = Array.isArray(appState?.speakerSystem?.placedSpeakers)
    ? appState.speakerSystem.placedSpeakers
    : [];
  const roomElements = Array.isArray(appState?.roomElements) ? appState.roomElements : [];
  const dolbyLayout = appState?.dolbyLayout || appState?.speakerSystem?.dolbyLayout || "5.1";

  // Plan View's own active-layout filter. Roles without an assigned model are
  // dropped by isRenderableSpeaker(), so "Not Selected" roles are never exported.
  const installedSpeakers = useMemo(
    () =>
      resolveActiveSpeakerLayout({
        placedSpeakers,
        appState,
        dolbyLayout,
        getCanonicalRoleFn: getCanonicalRole,
        getSpeakerVisibility: appState?.getSpeakerVisibility,
      }),
    [
      placedSpeakers,
      appState?.speakerSystem,
      appState?.sevenBedLayoutType,
      appState?.overheadGlobalModel,
      appState?.getSpeakerVisibility,
      dolbyLayout,
    ]
  );

  // Canonical RSP — the same hook Plan View uses, so CAD aim matches the drawing.
  const mlp = useMlpCalculation({
    mlpPoint: null,
    seatingPositions,
    mlpBasis: "front",
    roomWidthM: widthM,
    roomLengthM: lengthM,
    seatingBlockOffset: 0,
    lockedMlpY: appState?.mlpY_m,
    lockedMlpX: appState?.mlpX_m,
  });
  const mlpX = mlp?.x ?? null;
  const mlpY = mlp?.y ?? null;

  const subwooferInstances = appState?.subwooferInstances;
  const frontSubsCfg = appState?.frontSubsCfg;
  const rearSubsCfg = appState?.rearSubsCfg;
  const screen = appState?.screen;
  const screenFrontPlaneM = appState?.screenFrontPlaneM;
  const lcrAimMode = appState?.lcrAimMode;
  const aimFrontWidesAtMLP = appState?.aimFrontWidesAtMLP;
  const aimSideSurroundsAtMLP = appState?.aimSideSurroundsAtMLP;
  const aimRearSurroundsAtMLP = appState?.aimRearSurroundsAtMLP;

  const cadPayload = useMemo(() => {
    const mlpPoint = Number.isFinite(mlpX) && Number.isFinite(mlpY)
      ? { x: mlpX, y: mlpY }
      : null;
    const { frontSubsCfg: frontCfg, rearSubsCfg: rearCfg } = buildSubwooferCfgs(
      subwooferInstances,
      { frontSubsCfg, rearSubsCfg }
    );

    return buildProjectCadPayload({
      projectName,
      versionName,
      roomDims,
      seatingPositions,
      installedSpeakers,
      screenMetrics: buildScreenMetrics(screen),
      screenFrontPlaneM: resolveRspScreenFrontPlaneM(screenFrontPlaneM, screen),
      mlp: mlpPoint,
      frontSubsCfg: frontCfg,
      rearSubsCfg: rearCfg,
      roomElements,
      projector: roomElements.find((el) => el?.type === "projector") || null,
      lcrAngleInfo: buildLcrAngleInfo({
        placedSpeakers: installedSpeakers,
        mlp: mlpPoint,
        lcrAimMode,
      }),
      aimToggles: {
        aimFrontWidesAtMLP,
        aimSideSurroundsAtMLP,
        aimRearSurroundsAtMLP,
      },
      showScreenWall: !!screen?.showScreenWall,
    });
  }, [
    projectName,
    versionName,
    roomDims,
    seatingPositions,
    installedSpeakers,
    mlpX,
    mlpY,
    screen,
    screenFrontPlaneM,
    subwooferInstances,
    frontSubsCfg,
    rearSubsCfg,
    roomElements,
    lcrAimMode,
    aimFrontWidesAtMLP,
    aimSideSurroundsAtMLP,
    aimRearSurroundsAtMLP,
  ]);

  const isReady = cadPayload.ready === true;

  const handleExport = useCallback(() => {
    if (disabled || !cadPayload.ready) return;
    const dxfContent = generateDXF(cadPayload.data);
    downloadTextFile(dxfContent, cadPayload.filename, "application/dxf");
  }, [disabled, cadPayload]);

  return (
    <Button
      size="sm"
      variant="outline"
      className="font-medium whitespace-nowrap"
      onClick={handleExport}
      disabled={disabled || !isReady}
      title={
        isReady
          ? `Download ${cadPayload.filename}`
          : (cadPayload.reason || "Preparing the project CAD drawing…")
      }
      style={{ whiteSpace: "nowrap", flexShrink: 0 }}
    >
      <Download className="w-4 h-4 mr-2" style={{ flexShrink: 0 }} />
      Project CAD Download
    </Button>
  );
}