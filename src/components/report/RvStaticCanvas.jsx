"use client";

/**
 * RvStaticCanvas
 * --------------
 * A lightweight SVG compositor used only by RP22Report hidden captures.
 *
 * It reuses the existing RvPlanCanvas and all sub-layers (RvRoomBaseLayers,
 * RvZonesAndOverlays, RvSpeakerLayer, RvSeatLayer, etc.) but calls ONLY the
 * safe geometry hooks — never the acoustic engine, seat responses, live
 * impact, seat-metrics cache, drag handlers, hover logic, or HUD.
 *
 * appState is received as an explicit prop (not via useAppState()) so this
 * component can be used in contexts where the AppStateProvider context is
 * available but we want to avoid triggering any engine re-computation.
 */

import React, { useMemo, useCallback, useRef } from "react";

// Presentational compositor (reused as-is)
import RvPlanCanvas from "@/components/room/rv/render/RvPlanCanvas";
import RvMlpMarker from "@/components/room/rv/render/RvMlpMarker";

// Safe geometry hooks (pure computation, no engine, no appState writes)
import { useEffectiveRsp } from "@/components/room/rsp/useEffectiveRsp";
import { useMlpCalculation } from "@/components/room/rv/hooks/useMlpCalculation";
import { useRoomGeometry } from "@/components/room/rv/hooks/useRoomGeometry";
import { useFrontWideZonesComputed } from "@/components/room/rv/hooks/useFrontWideZonesComputed";
import { useOverheadZonesComputed } from "@/components/room/rv/hooks/useOverheadZonesComputed";
import { useRenderFrontWideZones } from "@/components/room/rv/hooks/useRenderFrontWideZones";
import { useZoneComponents } from "@/components/room/rv/hooks/useZoneComponents";
import { useVisiblePlanSpeakers } from "@/components/room/rv/hooks/useVisiblePlanSpeakers";
import { useOverheadIconElements } from "@/components/room/rv/hooks/useOverheadIconElements";
import { useRoomDerivedState } from "@/components/room/rv/hooks/useRoomDerivedState";

// Utilities and constants
import { getSpeakerModelMeta } from "@/components/models/speakers/registry";
import { rolesForLayout } from "@/components/utils/surroundRoleMap";
import { WALL_BUFFER_M } from "@/components/room/constants/screenDepth";
import { PADDING, SCREEN_THICKNESS_M } from "@/components/room/rv/RenderPrimitives";
import { CORNER_CLEAR_M, BACKWALL_HYSTERESIS_M, FADE_LEN_M } from "@/components/room/rvPlanHelpers";
import { floorDeg } from "@/components/room/rv/utils/rvGeometry";
import { getDolbyZoneSpecs } from "@/components/room/rv/utils/getDolbyZoneSpecs";
import { rvIsOverheadRole } from "@/components/room/rv/utils/roomVisualisationUtils";

// ─── Stable no-ops (module scope — never trigger re-renders) ─────────────────
const NO_OP = () => {};
const EMPTY_OBJECT = {};
const EMPTY_TOOLTIP = { show: false, text: "" };
const EMPTY_DRAG_WARNING = { show: false, message: "", x: 0, y: 0 };
const EMPTY_DRAG_IMPACT = { cardVisible: false };

// ─── Layout constants (match RoomVisualisation) ─────────────────────────────
const TOP_GUTTER_PX = 150;
const BOTTOM_GUTTER_PX = 220;
const SPEAKER_PLAN_TOP_GUTTER_PX = 90;
const SPEAKER_PLAN_BOTTOM_GUTTER_PX = 120;
const SPEAKER_PLAN_SIDE_GUTTER_PX = 90;

// ─── Component ───────────────────────────────────────────────────────────────

export default function RvStaticCanvas({
  // Geometry data
  placedSpeakers = [],
  seatingPositions = [],
  mlpPoint,
  screen = {},
  dolbyLayout = "5.1",
  frontSubs = [],
  rearSubs = [],
  frontSubsCfg,
  rearSubsCfg,
  roomElements = [],

  // Export / view configuration
  exportMode = "dimensions",
  exportWidthPx,
  exportHeightPx,
  showBaffle = true,
  showScreen = true,
  screenFrontPlaneM: propScreenFrontPlaneM,
  screenPlaneMode = "fixed",
  speakerPositionsView = "off",
  showMlpRuler = false,
  showThrowDistance = false,
  showRoomModesOverlay = false,

  // Overlays
  overlays = {},

  // Aim
  lcrAimMode = "flat",
  aimAtMLP = false,

  // RSP
  rspMode = "auto_from_screen",
  manualRspY_m,

  // AppState passed explicitly (NOT via useAppState)
  appState,
}) {
  // ── Room dimensions from explicit appState prop ────────────────────────────
  const widthM = Number(appState?.roomDims?.widthM) || 4.5;
  const lengthM = Number(appState?.roomDims?.lengthM) || 6.0;
  const heightM = Number(appState?.roomDims?.heightM) || 2.4;
  const tvPresetKey = screen?.tvPresetKey || null;

  // ── getCanonicalRole (matches RoomVisualisation inline definition) ─────────
  const getCanonicalRole = useCallback((role) => {
    const map = {
      "SL": "SL", "LS": "SL", "SR": "SR", "RS": "SR",
      "SBL": "SBL", "SBR": "SBR", "LW": "LW", "RW": "RW",
      "FL": "FL", "L": "FL", "FC": "FC", "C": "FC",
      "FR": "FR", "R": "FR",
    };
    const r = String(role || "").toUpperCase();
    return map[r] || r;
  }, []);

  // ── getModelDimsM (matches RoomVisualisation) ──────────────────────────────
  const getModelDimsM = useCallback(
    (modelName, orientation = "vertical") => {
      const meta = getSpeakerModelMeta?.(modelName, tvPresetKey || orientation);
      return {
        widthM: Number(meta?.widthM) || 0.27,
        heightM: Number(meta?.heightM) || 0.27,
        depthM: Number(meta?.depthM) || 0.082,
        diameterM: Number(meta?.diameterM) || 0.27,
        round: !!meta?.round,
        notFound: !meta,
        sensitivity: meta?.sensitivity || 87,
        impedance: meta?.impedance || 8,
        sensitivity_dB_1w1m: meta?.sensitivity_dB_1w1m || meta?.sensitivity || 87,
      };
    },
    [tvPresetKey]
  );

  // ── Screen plane (direct computation — no useScreenPlane, no appState writes)
  const screenFrontPlaneM = Number.isFinite(Number(propScreenFrontPlaneM))
    ? Number(propScreenFrontPlaneM)
    : Number(appState?.screenFrontPlaneM ?? 0);

  const actualScreenFrontY = screenFrontPlaneM;

  const ZONE_DEPTH_M = useMemo(() => {
    const y = Number(screenFrontPlaneM);
    const fallback = 0.30;
    const raw = Number.isFinite(y) ? y : fallback;
    return Math.max(0.10, Math.min(0.60, raw));
  }, [screenFrontPlaneM]);

  // ── RSP / MLP (safe hooks — pure computation) ───────────────────────────────
  const screenWidthM = Number(
    screen?.visibleWidthM ??
      (Number(screen?.visibleWidthInches || 100) * 0.0254)
  );

  const { effectiveRspY_m } = useEffectiveRsp({
    rspMode,
    manualRspY_m,
    screenFrontPlaneM,
    screenWidthM,
    currentMlpY_m: appState?.mlpY_m ?? null,
    rowDerivedRspYByMode: {},
  });

  const lockedMlpY = Number.isFinite(effectiveRspY_m) ? effectiveRspY_m : undefined;

  const mlp = useMlpCalculation({
    mlpPoint,
    seatingPositions,
    mlpBasis: "front",
    roomWidthM: widthM,
    roomLengthM: lengthM,
    seatingBlockOffset: 0,
    lockedMlpY,
  });

  const mlpDotX_m = mlp?.x;
  const mlpDotY_m = mlp?.y;

  // ── Container size (use export dimensions directly — no ResizeObserver) ───
  const containerW = Number.isFinite(Number(exportWidthPx))
    ? Number(exportWidthPx)
    : 1200;
  const containerH = Number.isFinite(Number(exportHeightPx))
    ? Number(exportHeightPx)
    : 800;

  // ── Dummy refs for hooks that expect them ──────────────────────────────────
  const rearModeRef = useRef("side");
  const svgRef = useRef(null);
  const planBoundsRef = useRef(null);
  const rvWrapRef = useRef(null);
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const hudElRef = useRef(null);
  const draftFrontSubsRef = useRef(null);
  const draftRearSubsRef = useRef(null);
  const draftSeatsRef = useRef(null);
  const draftSpeakersRef = useRef(null);
  const isPanningRef = useRef(false);

  // ── Room geometry (safe — pure computation) ────────────────────────────────
  const {
    effectiveContainerW,
    effectiveContainerH,
    scale,
    roomRect,
    hasRoomRect,
    toPx,
    meterToCanvasX,
    meterToCanvasY,
    mlpY_m,
  } = useRoomGeometry({
    exportWidthPx,
    exportHeightPx,
    containerW,
    containerH,
    widthM,
    lengthM,
    viewOffsetPx: { x: 0, y: 0 },
    mlp,
    seatingPositions,
    placedSpeakers,
    getModelDimsM,
    getCanonicalRole,
    PADDING,
    TOP_GUTTER_PX,
    CORNER_CLEAR_M,
    BACKWALL_HYSTERESIS_M,
    FADE_LEN_M,
    WALL_BUFFER_M,
    ZONE_DEPTH_M,
    rearModeRef,
  });

  // ── LCR angle info (zeros when flat — matches RoomVisualisation) ────────────
  const lcrAimAngled = lcrAimMode === "angled";
  const lcrAngleInfo = useMemo(() => {
    if (!lcrAimAngled) return { L: 0, R: 0, averageAngle: 0, maxAbs: 0 };
    const mlpTarget = { x: mlpDotX_m, y: mlpDotY_m };
    const fl = placedSpeakers?.find(
      (s) => getCanonicalRole(s.role) === "FL" && s?.position
    );
    const fr = placedSpeakers?.find(
      (s) => getCanonicalRole(s.role) === "FR" && s?.position
    );
    const yawTo = (pos) => {
      if (!pos?.x || !pos?.y || !mlpTarget) return 0;
      const dx = mlpTarget.x - pos.x;
      const dy = mlpTarget.y - pos.y;
      return Math.atan2(dx, -dy) * (180 / Math.PI);
    };
    const angleL = fl?.position ? yawTo(fl.position) : 0;
    const angleR = fr?.position ? yawTo(fr.position) : 0;
    const avg = (Math.abs(angleL) + Math.abs(angleR)) / 2;
    return {
      L: angleL,
      R: angleR,
      averageAngle: Number.isFinite(avg) ? avg : 0,
      maxAbs: Math.max(Math.abs(angleL), Math.abs(angleR)),
    };
  }, [lcrAimAngled, placedSpeakers, mlpDotX_m, mlpDotY_m, getCanonicalRole]);

  // ── LCR zone blocks (for useZoneComponents) ─────────────────────────────────
  const lcrZoneBlocks = useMemo(() => {
    if (!mlp) return null;
    const angle1 = 22.5 * (Math.PI / 180);
    const angle2 = 30.0 * (Math.PI / 180);
    const baffleInnerY = ZONE_DEPTH_M;
    const x_inner_left = mlp.x + (mlp.y - baffleInnerY) * Math.tan(-angle1);
    const x_outer_left = mlp.x + (mlp.y - baffleInnerY) * Math.tan(-angle2);
    const x_inner_right = mlp.x + (mlp.y - baffleInnerY) * Math.tan(angle1);
    const x_outer_right = mlp.x + (mlp.y - baffleInnerY) * Math.tan(angle2);
    return {
      left: {
        x_start: Math.min(x_inner_left, x_outer_left),
        x_end: Math.max(x_inner_left, x_outer_left),
        y_top: 0,
        y_bottom: ZONE_DEPTH_M,
      },
      right: {
        x_start: Math.min(x_inner_right, x_outer_right),
        x_end: Math.max(x_inner_right, x_outer_right),
        y_top: 0,
        y_bottom: ZONE_DEPTH_M,
      },
    };
  }, [mlp, ZONE_DEPTH_M]);

  // ── Front-wide zones (safe — pure computation) ──────────────────────────────
  const frontWideZones = useFrontWideZonesComputed({
    mlp,
    widthM,
    lengthM,
    heightM,
    placedSpeakers,
    speakersEpoch: appState?.speakersEpoch || 0,
    getModelDimsM,
    appState_DBG_FW: false,
    getCanonicalRole,
  });

  // ── Overhead zones (safe — pure computation) ───────────────────────────────
  const overheadZones = useOverheadZonesComputed({
    seatingPositions,
    heightM,
    widthM,
    lengthM,
    mlpY_m,
    mlp,
    placedSpeakers,
    getCanonicalRole,
  });

  // ── Overhead count ─────────────────────────────────────────────────────────
  const overheadCount = Array.isArray(placedSpeakers)
    ? placedSpeakers.filter((s) => rvIsOverheadRole(s?.role)).length
    : 0;

  // ── Overlays for rendering (simplified — no listeningArea) ─────────────────
  const overlaysForRendering = useMemo(() => {
    if (!hasRoomRect) return {};
    const base = { ...(overlays || {}) };
    base.FRONT_WIDE = frontWideZones;
    base.enableFrontWides = appState?.enableFrontWides || false;
    base.enableRp22Angles = false;
    return base;
  }, [overlays, hasRoomRect, frontWideZones, appState?.enableFrontWides]);

  // ── Augmented zones (LCR adapter — matches RoomVisualisation) ──────────────
  const augmentedZones = useMemo(() => {
    const newZones = {};
    if (!newZones.LCR?.points?.length) {
      const fl = placedSpeakers?.find(
        (s) => ["FL", "L"].includes(String(s?.role || "").toUpperCase())
      );
      const fr = placedSpeakers?.find(
        (s) => ["FR", "R"].includes(String(s?.role || "").toUpperCase())
      );
      if (fl?.position && fr?.position) {
        const WALL_BUFFER_ADAPTER = 0.01;
        const roomWidth = widthM || 4.5;
        newZones.LCR = {
          points: [
            { x: Math.max(0, fl.position.x - 0.2), y: WALL_BUFFER_ADAPTER },
            {
              x: Math.min(roomWidth, fr.position.x + 0.2),
              y: WALL_BUFFER_ADAPTER + ZONE_DEPTH_M,
            },
            { x: Math.min(roomWidth, fr.position.x + 0.2), y: WALL_BUFFER_ADAPTER },
            {
              x: Math.max(0, fl.position.x - 0.2),
              y: WALL_BUFFER_ADAPTER + ZONE_DEPTH_M,
            },
          ],
        };
      }
    }
    return newZones;
  }, [placedSpeakers, widthM, ZONE_DEPTH_M]);

  // ── Front-wide zone rendering helper ───────────────────────────────────────
  const renderFrontWideZones = useRenderFrontWideZones({
    hasRoomRect,
    frontWideZones,
    widthM,
    lengthM,
    roomRect,
    scale,
    ZONE_DEPTH_M,
  });

  // ── Zone components (safe — pure useMemo) ──────────────────────────────────
  const ZoneComponents = useZoneComponents({
    seatingPositions,
    widthM,
    lengthM,
    scale,
    toPx,
    roomRect,
    mlpY_m,
    placedSpeakers,
    heightM,
    screen,
    lcrZoneBlocks,
    ZONE_DEPTH_M,
    frontWideZones,
    renderFrontWideZones,
    mlp,
    getCanonicalRole,
    overheadCount,
    overheadZones,
    overlaysForRendering,
    dolbyLayout,
    FADE_LEN_M,
  });

  // ── Visible plan speakers (safe — pure useMemo) ────────────────────────────
  const visiblePlanSpeakers = useVisiblePlanSpeakers({
    placedSpeakers,
    getCanonicalRole,
    getSpeakerVisibility: appState?.getSpeakerVisibility || (() => true),
    appState,
    dolbyLayout,
  });

  // ── Overhead icon elements (no-op handlers) ────────────────────────────────
  const overheadIconElements = useOverheadIconElements({
    placedSpeakers,
    toPx,
    scale,
    setHoveredSpeaker: NO_OP,
    overheadGlobalModel: appState?.overheadGlobalModel,
    useFrontGlobal: appState?.useFrontGlobal ?? true,
    useMidGlobal: appState?.useMidGlobal ?? true,
    useRearGlobal: appState?.useRearGlobal ?? true,
    overheadFrontOverride: appState?.overheadFrontOverride,
    overheadMidOverride: appState?.overheadMidOverride,
    overheadRearOverride: appState?.overheadRearOverride,
    bedLayerSpeakerMouseDownHandler: NO_OP,
    handleIconEnter: NO_OP,
    handleIconMove: NO_OP,
    handleIconLeave: NO_OP,
  });

  // ── Room derived state (seat labels) ───────────────────────────────────────
  const { rowFrontWallLabelSeatIds, rowDistanceLabelSeatIds } =
    useRoomDerivedState({
      placedSpeakers,
      seatingPositions,
      dolbyLayout,
      speakerPositionsView,
      overlays,
      appState,
      getCanonicalRole,
    });

  // ── MLP marker (no drag handler) ────────────────────────────────────────────
  const MLPMarker = (
    <RvMlpMarker
      toPx={toPx}
      mlpDotX_m={mlpDotX_m}
      mlpDotY_m={mlpDotY_m}
      _overlays={overlays}
      exportMode={exportMode}
      rspMode={rspMode}
    />
  );

  // ── Arc path helper (for RvDolbyZones) ──────────────────────────────────────
  const arcPathForBand = useCallback(
    (seatX, seatY, radiusM, minDeg, maxDeg, toPxFn) => {
      const a0 = Number(minDeg);
      const a1 = Number(maxDeg);
      if (!Number.isFinite(a0) || !Number.isFinite(a1) || a1 <= a0) return null;
      const steps = 24;
      const pts = [];
      for (let i = 0; i <= steps; i++) {
        const t = a0 + (i * (a1 - a0) / steps);
        const rad = (t * Math.PI) / 180;
        const dx = Math.sin(rad) * radiusM;
        const dy = -Math.cos(rad) * radiusM;
        const [cx, cy] = toPxFn(seatX + dx, seatY + dy);
        pts.push(`${i === 0 ? "M" : "L"}${cx},${cy}`);
      }
      return pts.join(" ");
    },
    []
  );

  // ── SVG defs IDs ───────────────────────────────────────────────────────────
  const ids = useMemo(
    () => ({
      grid: `static-grid-${Math.random().toString(36).slice(2)}`,
      clip: `static-clip-${Math.random().toString(36).slice(2)}`,
    }),
    []
  );

  // ── Subwoofer safety (matches RoomVisualisation) ───────────────────────────
  const frontSubsActive =
    Array.isArray(frontSubs) &&
    Number(frontSubsCfg?.count) > 0 &&
    frontSubsCfg?.model;
  const rearSubsActive =
    Array.isArray(rearSubs) &&
    Number(rearSubsCfg?.count) > 0 &&
    rearSubsCfg?.model;
  const safeFrontSubs = frontSubsActive ? frontSubs : [];
  const safeRearSubs = rearSubsActive ? rearSubs : [];

  // ── SVG dimensions ─────────────────────────────────────────────────────────
  const svgW = containerW;
  const svgH = containerH;
  const svgWSafe = Number(svgW) || Math.max(1, Number(roomRect?.width) || 1200);
  const svgHSafe =
    (Number(svgH) || Math.max(1, Number(roomRect?.height) || 800)) +
    BOTTOM_GUTTER_PX;

  // ── Resolved showThrowDistance (matches RoomVisualisation) ─────────────────
  const resolvedShowThrowDistance =
    showThrowDistance || overlaysForRendering?.ROOM_DIMS === true;

  // ── Canvas style (matches RoomVisualisation) ──────────────────────────────
  const canvasStyle = {
    margin: "0 auto",
    padding: "24px",
    width: "100%",
    maxWidth: "none",
    overflow: "hidden",
    position: "relative",
  };

  const aspect = `${Math.max(0.1, widthM)} / ${Math.max(0.1, lengthM)}`;

  // ── Render RvPlanCanvas with all geometry + no-op interactive props ─────────
  return (
    <RvPlanCanvas
      svgRef={svgRef}
      planBoundsRef={planBoundsRef}
      rvWrapRef={rvWrapRef}
      aspect={aspect}
      zoomMode="off"
      handlePlanClick={NO_OP}
      lastPointerRef={lastPointerRef}
      canvasStyle={canvasStyle}
      svgWSafe={svgWSafe}
      svgHSafe={svgHSafe}
      idsGrid={ids.grid}
      idsClip={ids.clip}
      ids={ids}
      scale={scale}
      svgW={svgW}
      svgH={svgH}
      handleMouseMove={NO_OP}
      handleMouseUp={NO_OP}
      roomRect={roomRect}
      placedSpeakers={placedSpeakers}
      getCanonicalRole={getCanonicalRole}
      dolbyLayout={dolbyLayout}
      onPanPointerDown={NO_OP}
      onPanPointerMove={NO_OP}
      onPanPointerUp={NO_OP}
      isPanningRef={isPanningRef}
      zoom={1}
      panX={0}
      panY={0}
      viewOffsetPx={{ x: 0, y: 0 }}
      widthM={widthM}
      lengthM={lengthM}
      heightM={heightM}
      meterToCanvasX={meterToCanvasX}
      meterToCanvasY={meterToCanvasY}
      toPx={toPx}
      exportMode={exportMode}
      speakerPositionsView={speakerPositionsView}
      overlaysForRendering={overlaysForRendering}
      SPEAKER_PLAN_SIDE_GUTTER_PX={SPEAKER_PLAN_SIDE_GUTTER_PX}
      TOP_GUTTER_PX={TOP_GUTTER_PX}
      SPEAKER_PLAN_TOP_GUTTER_PX={SPEAKER_PLAN_TOP_GUTTER_PX}
      BOTTOM_GUTTER_PX={BOTTOM_GUTTER_PX}
      SPEAKER_PLAN_BOTTOM_GUTTER_PX={SPEAKER_PLAN_BOTTOM_GUTTER_PX}
      screen={screen}
      actualScreenFrontY={actualScreenFrontY}
      showBaffle={showBaffle}
      showScreen={showScreen}
      SCREEN_THICKNESS_M={SCREEN_THICKNESS_M}
      screenFrontPlaneM={screenFrontPlaneM}
      screenPlaneMode={screenPlaneMode}
      mlp={mlp}
      mlpPoint={mlpPoint}
      seatingPositions={seatingPositions}
      augmentedZones={augmentedZones}
      getModelDimsM={getModelDimsM}
      WALL_BUFFER_M={WALL_BUFFER_M}
      overheadZones={overheadZones}
      dragging={false}
      draggedItemId={null}
      frontWideZones={frontWideZones}
      hasRoomRect={hasRoomRect}
      ZoneComponents={ZoneComponents}
      getDolbyZoneSpecs={getDolbyZoneSpecs}
      arcPathForBand={arcPathForBand}
      roomElements={roomElements}
      getSpeakerVisibility={appState?.getSpeakerVisibility || (() => true)}
      appState={appState}
      rolesForLayout={rolesForLayout}
      showMlpRuler={showMlpRuler}
      draftFrontSubsRef={draftFrontSubsRef}
      draftRearSubsRef={draftRearSubsRef}
      frontSubs={safeFrontSubs}
      rearSubs={safeRearSubs}
      frontSubsCfg={frontSubsCfg}
      rearSubsCfg={rearSubsCfg}
      showRoomModesOverlay={showRoomModesOverlay}
      showThrowDistance={resolvedShowThrowDistance}
      handleMouseDown={NO_OP}
      rowFrontWallLabelSeatIds={rowFrontWallLabelSeatIds}
      rowDistanceLabelSeatIds={rowDistanceLabelSeatIds}
      _overlays={overlays}
      hudPinnedSeatId={null}
      handleSeatMouseEnter={NO_OP}
      handleSeatMouseLeave={NO_OP}
      handleSeatClick={NO_OP}
      clampMlpY={(y) => y}
      MLPMarker={MLPMarker}
      overheadIconElements={overheadIconElements}
      aimAtMLP={aimAtMLP}
      aimFrontWidesAtMLP={appState?.aimFrontWidesAtMLP ?? false}
      aimSideSurroundsAtMLP={appState?.aimSideSurroundsAtMLP ?? false}
      aimRearSurroundsAtMLP={appState?.aimRearSurroundsAtMLP ?? false}
      lcrAngleInfo={lcrAngleInfo}
      bedLayerSpeakerMouseDownHandler={NO_OP}
      onSpeakerAimToggle={NO_OP}
      handleIconEnter={NO_OP}
      handleIconMove={NO_OP}
      handleIconLeave={NO_OP}
      effectiveHoveredSeat={null}
      visiblePlanSpeakers={visiblePlanSpeakers}
      floorDeg={floorDeg}
      dragWarning={EMPTY_DRAG_WARNING}
      tooltip={EMPTY_TOOLTIP}
      hoveredSpeaker={null}
      tooltipData={null}
      hudDynamicStyle={EMPTY_OBJECT}
      onHudHeaderMouseDown={NO_OP}
      hudElRef={hudElRef}
      setHudHiddenWhenPinned={NO_OP}
      hudHiddenWhenPinned={false}
      isHudPinned={false}
      speakerTooltip={EMPTY_TOOLTIP}
      hudPosition={null}
      subDragTick={0}
      subSnapState={null}
      lastValidDraftFrontSubs={null}
      lastValidDraftRearSubs={null}
      draftSeatsRef={draftSeatsRef}
      seatDragTick={0}
      draftSpeakersRef={draftSpeakersRef}
      speakerDragTick={0}
      dragImpact={EMPTY_DRAG_IMPACT}
      onAcceptBaseline={NO_OP}
      onDismissCard={NO_OP}
      isPostDrag={false}
      roomElementDragInfo={null}
      mlpDragInfo={null}
      dragType={null}
      isSeatSnapping={false}
      liveImpactMode="off"
    />
  );
}