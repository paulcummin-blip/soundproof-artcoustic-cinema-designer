"use client";

import React, { useMemo, useCallback, useState, useRef, useImperativeHandle, useEffect, useLayoutEffect, forwardRef } from "react";

import SeatHud from "@/components/room/SeatHud";
import RP22GradingPill from "@/components/ui/RP22GradingPill";
import { getSpeakerModelMeta, normaliseModelKey as registryNormaliseModelKey } from "@/components/models/speakers/registry";
import { rp23HorizontalAngleForSeat, verticalViewingAngleDeg } from "@/components/utils/seatHover";
import { isDraggable, clampSideSurroundDrag, clampRearSurroundDrag } from "@/components/utils/speakerUtils";
import { calibratedSplAtSeat, normalizeToRsp, p4DeltaAndLevel, euclideanDistance } from "@/components/utils/splMath";
import { rolesForLayout, getCanonicalRole } from "@/components/utils/surroundRoleMap";
import { calculateLcrConstraints } from "../room/constraints/lcrConstraints";
import { SCREEN_BUFFER_M, WALL_BUFFER_M } from "./constants/screenDepth";
import { resolveSurroundModel } from "@/components/utils/speakerModelResolver";
import RvRp22AnglesOverlay from "@/components/room/rv/render/RvRp22AnglesOverlay";
import { useAppState } from "@/components/AppStateProvider";
import { timeNowMs } from "@/components/utils/timeNow";
import { calculateViewingAngle, rp23LevelForAngleDeg } from "@/components/utils/viewingAngleUtils";
import CanvasMessages from "@/components/room/CanvasMessages";
import RvRoomElementsLayer from "@/components/room/rv/render/RvRoomElementsLayer";
import { clampOverheadToZone, clampSymmetricOverheadPair, clampOverheadPairPosition } from "@/components/utils/overheadDragClamping";
import RvDolbyZones from "@/components/room/rv/render/RvDolbyZones";
import RvBaffleAndScreen from "@/components/room/rv/render/RvBaffleAndScreen";
import RvSpeakerTooltip from "@/components/room/rv/render/RvSpeakerTooltip";
import RvPlanCanvas from "@/components/room/rv/render/RvPlanCanvas";
import { useOverheadAutoPlacement } from "@/components/hooks/useOverheadAutoPlacement";
import { useEnsureOverheadPairs } from "@/components/hooks/useEnsureOverheadPairs";
import PlanMessages from "@/components/room/PlanMessages";
import SvgDefs from "@/components/room/SvgDefs";
import SpeakerPositionsOverlay from "@/components/room/overlays/SpeakerPositionsOverlay";
import RvRoomBaseLayers from "@/components/room/rv/render/RvRoomBaseLayers";
import RvZonesAndOverlays from "@/components/room/rv/render/RvZonesAndOverlays";
import RvRenderSubwoofers from "@/components/room/rv/render/RvRenderSubwoofers";
import RvMlpRuler from "@/components/room/rv/render/RvMlpRuler";
import { SURROUND_WALL_GAP_M, sideWallX, rearWallY, fixedSideX, OVERHEAD_PAIR_MAP, floorDeg, mirrorX, clampToSegment, resolveSymmetricLCR, computeMinimumScreenDepthM } from "@/components/room/rv/utils/rvGeometry";
import { getAimingYawDeg, getPlanAimDeg, getYawForObject } from "@/components/room/rv/utils/rvAiming";
import { useMlpCalculation } from "@/components/room/rv/hooks/useMlpCalculation";
import { useSpeakersByRole } from "@/components/room/rv/hooks/useSpeakersByRole";
import { useEntitiesById } from "@/components/room/rv/hooks/useEntitiesById";
import { useExportMinScreenDepth } from "@/components/room/rv/hooks/useExportMinScreenDepth";
import { useActualScreenFrontY } from "@/components/room/rv/hooks/useActualScreenFrontY";
import { useRoomGeometry } from "@/components/room/rv/hooks/useRoomGeometry";
import { useScreenPlane } from "@/components/room/rv/hooks/useScreenPlane";
import { useRoomCoordinateConverters } from "@/components/room/rv/hooks/useRoomCoordinateConverters";
import { useFrontWideZonesComputed } from "@/components/room/rv/hooks/useFrontWideZonesComputed";
import { useOverheadZonesComputed } from "@/components/room/rv/hooks/useOverheadZonesComputed";
import { usePanZoomHandlers } from "@/components/room/rv/hooks/usePanZoomHandlers";
import { useZoneComponents } from "@/components/room/rv/hooks/useZoneComponents";
import { useRenderFrontWideZones } from "@/components/room/rv/hooks/useRenderFrontWideZones";
import { getDolbyZoneSpecs } from "@/components/room/rv/utils/getDolbyZoneSpecs";
import { useVisiblePlanSpeakers } from "@/components/room/rv/hooks/useVisiblePlanSpeakers";
import { useOverheadIconElements } from "@/components/room/rv/hooks/useOverheadIconElements";
import { useSideSurroundVisualSpanM } from "@/components/room/rv/hooks/useSideSurroundVisualSpanM";
import { useSeatMetricsCacheEffect } from "@/components/room/rv/hooks/useSeatMetricsCacheEffect";
import { useMouseUpHandler } from "@/components/room/rv/hooks/useMouseUpHandler";
import { useMouseDownHandler } from "@/components/room/rv/hooks/useMouseDownHandler";
import { useSpeakerDragUpdate } from "@/components/room/rv/hooks/useSpeakerDragUpdate";
import { useRoomCanvasMouseMove } from "@/components/room/rv/hooks/useRoomCanvasMouseMove";
import { useSubDragHandler } from "@/components/room/rv/hooks/useSubDragHandler";
import { useSeatDragHandler } from "@/components/room/rv/hooks/useSeatDragHandler";
import { useMlpDragHandler } from "@/components/room/rv/hooks/useMlpDragHandler";
import RvMlpMarker from "@/components/room/rv/render/RvMlpMarker";
import { useFrontWideAutoPlacement } from "@/components/room/rv/hooks/useFrontWideAutoPlacement";
import { useAutoHugSurroundsToWalls } from "@/components/room/rv/hooks/useAutoHugSurroundsToWalls";
import { useShiftSeatsToAngle } from "@/components/room/rv/hooks/useShiftSeatsToAngle";
import { useApplyLcrFromDetail } from "@/components/room/rv/hooks/useApplyLcrFromDetail";
import { usePlanResizeObserver } from "@/components/room/rv/hooks/usePlanResizeObserver";
import { useHudComputation } from "@/components/room/rv/hooks/useHudComputation";
import { useSeatHoverLogic } from "@/components/room/rv/hooks/useSeatHoverLogic";
import { useRoomDerivedState } from "@/components/room/rv/hooks/useRoomDerivedState";
import { useCanvasZoomHandlers } from "@/components/room/rv/hooks/useCanvasZoomHandlers";
import { rvIsOverheadRole, getByRoleArray } from "@/components/room/rv/utils/roomVisualisationUtils";

// New RP22 seat metrics import
import {
  metricP1_nearestWallM,
  rp22LevelForP1,
  rp22LevelForP4,
  metricP5_maxSurroundGapNoWrap,
  rp22LevelForP5_NoWrap,
  azimuthDegFromSeat
} from "@/components/utils/seatMetrics";

// NEW: Import centralized SPL engine
import { computeAllSeatSplMetrics, getSeatSplMetrics, getMlpSeat } from "@/components/utils/spl/centralSplEngine";

// NEW: Import shared seat HUD metrics calculator
import { computeSeatHudMetrics } from "@/components/utils/computeSeatHudMetrics";
import { buildSeatHudSnapshot } from "@/components/utils/buildSeatHudSnapshot";
import { useTooltipData } from '@/components/room/hooks/useTooltipData';
import { useRP22AnalysisEngine } from "@/components/hooks/useRP22AnalysisEngine";
import SeatingDragImpactCard from "@/components/room/SeatingDragImpactCard";

import {
  SIDE_ALLOW_OVERHANG,
  EPS,
  FADE_LEN_M,
  CORNER_CLEAR_M,
  BACKWALL_HYSTERESIS_M,
  RS_CLEAR_M,
  SS_RS_BUFFER_M,
  RS_EPS,
  DBG_RS,
  DBG_SS,
  DBG_UTIL,
  deg,
  clamp,
  horizontalAngleFromMLP,
  fwDeviationLevel,
  getCanonicalRoleGlobal,
  getSpeakerDims,
  rearSpeakerFootprintX,
  halfWidthOnWall,
  backWallYForDims,
  isOnBackWall,
  computeSymmetricXR,
  clampToAllowedWithExclusions,
  sideWallXAtBuffer,
  sideSurroundsOnBackWall,
  clampRearSideYWithSS,
  speakerOnWallYFootprint,
  nonCrossingClampDirectional,
  centerLaneForBackWall,
  computeBackWallInnerEdges,
  computeRearVisualLanes,
  resolveSymmetricY,
} from "@/components/room/rvPlanHelpers";

import {
  isSubRole,
  hasPos,
  isRenderableSpeaker,
  getChannelColor,
  RAD, rad2deg, yawDegToMLP, safeYawToMLP,
  PADDING, DEFAULT_W, DEFAULT_H,
  SCREEN_BAR_PX, SCREEN_BAR_HALF_PX,
  SCREEN_THICKNESS_M, toCmCeil,
  SPEAKER_STROKE_PX, STROKE_HALF_M,
  yHalfExtentM,
  targetMlpY57_5,
  SpeakerIcon,
  SpeakerRect,
} from "@/components/room/rv/RenderPrimitives";



export default forwardRef(function RoomVisualisation(props, ref) {
  const {
    analysisResult,
    placedSpeakers = [],
    onSetSpeakers,
    onSetSeatingPositions,
    onSetFrontSubs,
    onSetRearSubs,
    overlays: _overlays = {},
    sideLinked = false,
    seatingPositions = [],
    mlpPoint,
    roomElements = [],
    onSetRoomElements,
    frontSubs = [],
    rearSubs = [],
    frontSubsCfg,
    rearSubsCfg,
    dolbyLayout = "5.1",
    aimAtMLP = false,
    rowTarget,
    viewingDistanceOffsetM = 0,
    onLcrAngleComputed,
    onScreenPlaneChange,
    screen = {},
    mlpBasis = "front",
    showBaffle = true,
    showScreen = true,
    showBaffleWallLine = true,
    showScreenPlane = false,
    screenPlaneMode = 'autoTight',
    rp22AnglesEnabled = false,
    rspMode = 'auto_from_screen',
    manualRspY_m,
    onSetManualRspY_m,
    allSeatSplMetrics: allSeatSplMetricsProp = null,
    speakerPositionsView = 'off',
    showMlpRuler = false,
    zoomMode: zoomModeProp = 'off',
    onZoomModeChange,
    exportMode = 'default',
    exportWidthPx,
    exportHeightPx,
    freeMoveLcr = false,
    showRoomModesOverlay = false,
    showThrowDistance = false,
    liveImpactMode = "summary",
  } = props;

  const appState = useAppState();
  const widthM  = Number(appState?.roomDims?.widthM)  || 4.5;
  const lengthM = Number(appState?.roomDims?.lengthM) || 6.0;
  const heightM = Number(appState?.roomDims?.heightM) || 2.4;
  const getSpeakerVisibility = appState?.getSpeakerVisibility || (() => true);

  const speakersEpoch = appState?.speakersEpoch || 0;
  const enableFrontWides = appState?.enableFrontWides || false;
  const appState_DBG_FW = appState?.DBG_FW || false;
  const overheadGlobalModel = appState?.overheadGlobalModel;
  const overheadFrontOverride = appState?.overheadFrontOverride;
  const overheadMidOverride = appState?.overheadMidOverride;
  const overheadRearOverride = appState?.overheadRearOverride;
  const useFrontGlobal = appState?.useFrontGlobal ?? true;
  const useMidGlobal   = appState?.useMidGlobal   ?? true;
  const useRearGlobal  = appState?.useRearGlobal  ?? true;
  const aimFrontWidesAtMLP = appState?.aimFrontWidesAtMLP ?? false;
  const aimSideSurroundsAtMLP = appState?.aimSideSurroundsAtMLP ?? false;
  const aimRearSurroundsAtMLP = appState?.aimRearSurroundsAtMLP ?? false;

  const centerX_m = widthM / 2;
  const clampY = (y) => Math.max(0.05, Math.min(lengthM - 0.05, Number(y) || 0));
  const EPS_M = 0.0005;
  const PLAN_TOP_PAD_PX = 60; // headroom for top dimension line + labels
  const BOTTOM_GUTTER_PX = 220; // ensures bottom speaker dimension lanes never clip

  const tvPresetKey = screen?.tvPresetKey || null;

  const getModelDimsM = useCallback((modelName, orientation = "vertical") => {
    const meta = getSpeakerModelMeta?.(modelName, tvPresetKey || orientation);
    
    return {
      widthM:    Number(meta?.widthM)    || 0.27,
      heightM:   Number(meta?.heightM)   || 0.27,
      depthM:    Number(meta?.depthM)    || 0.082,
      diameterM: Number(meta?.diameterM) || 0.27,
      round:     !!meta?.round,
      notFound:  !meta,
      sensitivity:           meta?.sensitivity || 87,
      impedance:             meta?.impedance || 8,
      sensitivity_dB_1w1m:   meta?.sensitivity_dB_1w1m || meta?.sensitivity || 87,
    };
  }, [tvPresetKey]);

  const getCanonicalRole = useCallback((role) => {
    const map = { SL:'SL',LS:'SL', SR:'SR',RS:'SR', SBL:'SBL',SBR:'SBR', LW:'LW',RW:'RW', FL:'FL',L:'FL', FC:'FC',C:'FC', FR:'FR',R:'FR' };
    const r = String(role || '').toUpperCase();
    return map[r] || r;
  }, []);

  // --- MLP: use RoomDesigner anchor if available; DO NOT stick to seats ---

  // We assume widthM and lengthM are already defined earlier in this file.
  // If not, you can safely use 0 as fallback.
  const roomWidthM  = Number(widthM)  || 0;
  const roomLengthM = Number(lengthM) || 0;

  // Keep MLP Y safely inside the room
  const clampMlpY = (y) => {
    if (!Number.isFinite(y)) return roomLengthM > 0 ? roomLengthM * 0.58 : 3;
    const margin = 0.4; // 40cm buffer from front/back walls
    const minY = margin;
    const maxY = roomLengthM > 0 ? Math.max(minY, roomLengthM - margin) : y;
    return Math.max(minY, Math.min(maxY, y));
  };

  // The fixed RSP is always the pure 57.5° position from screen, independent of seat offset.
  // appState.mlpY_m is now the true RSP (never includes seatingBlockOffset).
  const _fixedRspY = rspMode === 'manual_position'
    ? (Number.isFinite(Number(props.manualRspY_m)) ? Number(props.manualRspY_m) : undefined)
    : (Number.isFinite(appState?.mlpY_m) ? appState.mlpY_m : undefined);

  const mlp = useMlpCalculation({
    mlpPoint,
    seatingPositions,
    mlpBasis,
    roomWidthM: widthM,
    roomLengthM: lengthM,
    seatingBlockOffset: 0, // always treat as 0 so lockedMlpY wins (fixed RSP dot)
    lockedMlpY: _fixedRspY,
  });
  const mlpDotX_m = mlp.x;
  const mlpDotY_m = mlp.y;
  const mlpDotZ_m = mlp.z;

  const [hoveredSpeaker, setHoveredSpeaker] = useState(null);
  const [tooltip, setTooltip] = useState({ show: false, text: '' });
  const [dragState, setDragState] = useState({ dragging: false, draggedItemId: null, dragType: null });
  const [subDragTick, setSubDragTick] = useState(0);
  const rvWrapRef = useRef(null);
  const { dragging, draggedItemId, dragType } = dragState;
  const [draggingRole, setDraggingRole] = useState(null);
  const [hasManualOverheadEdit, setHasManualOverheadEdit] = useState(false);
  const [dragWarning, setDragWarning] = useState({ show: false, message: '', x: 0, y: 0 });
  const [constraintZones, setConstraintZones] = useState(null);
  const [zoom, setZoom] = React.useState(1.0);
  const [panX, setPanX] = React.useState(0);
  const [panY, setPanY] = React.useState(0);
  const [viewOffsetPx, setViewOffsetPx] = React.useState({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const zoomMode = zoomModeProp;
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const [containerW, setContainerW] = useState(null);
  const [containerH, setContainerH] = useState(null);

  // Force a real measurement on mount/visibility.
  // (ResizeObserver sometimes doesn't fire until a later layout change.)
  const measurePlanBoundsNow = React.useCallback(() => {
    const el = planBoundsRef.current;
    if (!el) return;

    const r = el.getBoundingClientRect();
    if (!r || r.width <= 0 || r.height <= 0) return;

    // Round to 0.1px to avoid tiny wobble
    const w = Math.round(r.width * 10) / 10;
    const h = Math.round(r.height * 10) / 10;

    setContainerW((prev) => (prev === w ? prev : w));
    setContainerH((prev) => {
      const next = Math.max(420, h);
      return prev === next ? prev : next;
    });
  }, []);
  const [hudPinnedSeatId, setHudPinnedSeatId] = useState(null);
  const [hudHiddenWhenPinned, setHudHiddenWhenPinned] = useState(false);
  const [hudPinnedOffsetPx, setHudPinnedOffsetPx] = useState(null);
  
  // Draft positions for smooth dragging (only update real positions on drag end)
  const draftFrontSubsRef = useRef(null);
  const draftRearSubsRef = useRef(null);
  const isDraggingSubRef = useRef(false);
  const idleCommitTimerRef = useRef(null);
  const _lastValidDraftFrontSubsRef = useRef(null);
  const _lastValidDraftRearSubsRef = useRef(null);
  // Absolute HUD position in canvas pixels (top-left of the HUD card)
const [hudBasePosPx, setHudBasePosPx] = useState(null);
  const planBoundsRef = useRef(null);
  const svgRef = useRef(null);
  const slsrModeRef = React.useRef('side');
  const rearModeRef = React.useRef('back');
  const lastInteractionEpoch = React.useRef(0);
  const rsLastLiveResetEpoch = React.useRef(0);
  const dragStartCanvasPosRef = useRef(null);
  const dragStartRoomPosRef = useRef(null);
  const dragStartSpeakerPosRef = useRef(null);
  const rsDragLockRef = useRef(null); // Declare rsDragLockRef here
  rsDragLockRef.current = null;
  const fwOffsetRef = React.useRef({ L: 0, R: 0 });
  const isDraggingFW = React.useRef(false);
  const isDraggingRearRef = React.useRef(0);
  const isDraggingSpeakerRef = useRef(false);
  const isAnyDraggingRef = React.useRef(false);
  const dragOffsetRoomRef = useRef({ x: 0, y: 0 });
  const seatDragStartRef = useRef(null);
  const draggedSubWallRef = useRef(null);
  const draggedSubTypeRef = useRef(null);
  const lastSentRef = useRef(null);
  const hudDragRef = useRef(null);
  const hudElRef = useRef(null);
  const isHudPinned = Boolean(hudPinnedSeatId);

  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (!isHudPinned) return;
      if (e.key === 'h' || e.key === 'H') {
        setHudHiddenWhenPinned(v => !v);
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isHudPinned]);

  useEffect(() => {
    if (!isHudPinned) {
      setHudPinnedOffsetPx(null);
      setHudHiddenWhenPinned(false);
      setHudBasePosPx(null); // allow auto-position on next hover
    }
  }, [isHudPinned]);

  useEffect(() => {
    if (isHudPinned && hudPinnedOffsetPx == null) {
      setHudPinnedOffsetPx({ x: 24, y: 24 });
    }
  }, [isHudPinned, hudPinnedOffsetPx]);

  // ---------------------------------------------------------------------------
  // HELPER FUNCTIONS (declare early to avoid TDZ)
  // ---------------------------------------------------------------------------

  // Helper to detect which wall a subwoofer is on
  const detectSubWall = useCallback((sub, W, L) => {
    if (!sub?.position) return null;
    const x = sub.position.x;
    const y = sub.position.y;
    const threshold = 0.05;
    
    if (Math.abs(y) < threshold) return 'front';
    if (Math.abs(y - L) < threshold) return 'rear';
    if (Math.abs(x) < threshold) return 'left';
    if (Math.abs(x - W) < threshold) return 'right';
    
    // Default to closest wall
    const distFront = y;
    const distRear = L - y;
    const distLeft = x;
    const distRight = W - x;
    const minDist = Math.min(distFront, distRear, distLeft, distRight);
    
    if (minDist === distFront) return 'front';
    if (minDist === distRear) return 'rear';
    if (minDist === distLeft) return 'left';
    return 'right';
  }, []);

  // Clamp helper (keeps HUD within the plan; safe fallback = window)
const clampHudOffset = useCallback((x, y) => {
  const hud = hudElRef.current;
  const host = planBoundsRef.current;
  if (!hud || !host) {
    return { x, y };
  }

  const hudRect = hud.getBoundingClientRect();
  const hostRect = host.getBoundingClientRect();

  const hudW = hudRect.width;
  const hudH = hudRect.height;

  // Allowed range so the HUD card stays fully inside the canvas
  const minX = 0;
  const minY = 0;
  const maxX = Math.max(0, hostRect.width  - hudW);
  const maxY = Math.max(0, hostRect.height - hudH);

  return {
    x: Math.max(minX, Math.min(maxX, x)),
    y: Math.max(minY, Math.min(maxY, y)),
  };
}, []);

  // Drag handlers (defined BEFORE they're used in JSX)
const onHudHeaderMouseDown = useCallback((event) => {
  if (!planBoundsRef.current) return;
  if (!hudBasePosPx) return;

  event.preventDefault();

  const startBase = hudBasePosPx || { x: 20, y: 20 };
  const startMouseX = event.clientX;
  const startMouseY = event.clientY;

  const handleMove = (moveEvent) => {
    const dx = moveEvent.clientX - startMouseX;
    const dy = moveEvent.clientY - startMouseY;

    const unclamped = {
      x: startBase.x + dx,
      y: startBase.y + dy,
    };

    const clamped = clampHudOffset(unclamped.x, unclamped.y);
    setHudBasePosPx(clamped);
  };

  const handleUp = () => {
    window.removeEventListener("mousemove", handleMove);
    window.removeEventListener("mouseup", handleUp);
  };

  window.addEventListener("mousemove", handleMove);
  window.addEventListener("mouseup", handleUp);
}, [clampHudOffset, hudBasePosPx]);


  // Helper to clamp HUD within canvas, pick side dynamically
  const placeHudForSeat = useCallback(({ seatX_px, seatY_px, hudW_px, hudH_px, canvasRect, padding = 8 }) => {
    if (!canvasRect) return { x: seatX_px + 14, y: seatY_px };

    const seatOnLeft = seatX_px < (canvasRect.x + canvasRect.width / 2);
    const targetX = seatOnLeft ? (seatX_px + 14) : (seatX_px - hudW_px - 14);
    const targetY = seatY_px - Math.min(24, hudH_px / 2);

    const minX = canvasRect.x + padding;
    const maxX = canvasRect.x + canvasRect.width - padding - hudW_px;
    const minY = canvasRect.y + padding;
    const maxY = canvasRect.y + canvasRect.height - padding - hudH_px;

    return { x: Math.max(minX, Math.min(maxX, targetX)), y: Math.max(minY, Math.min(maxY, targetY)) };
  }, []);

  // Safe value formatter for HUD
  const safeVal = useCallback((v, unit = '') => {
    return Number.isFinite(v) ? `${v.toFixed(1)}${unit}` : '—';
  }, []);

  // Equality check for subwoofer arrays during held-draft transition
  const areSubsEffectivelyEqual = useCallback((arr1, arr2, epsilon = EPS_M) => {
    const a = arr1 || [];
    const b = arr2 || [];

    if (a.length !== b.length) return false;

    for (let i = 0; i < a.length; i++) {
      const s1 = a[i];
      const s2 = b[i];
      if (!s1?.position || !s2?.position) return false;
      if (Math.abs(s1.position.x - s2.position.x) > epsilon) return false;
      if (Math.abs(s1.position.y - s2.position.y) > epsilon) return false;
    }
    return true;
  }, [EPS_M]);

  // Clear held draft refs when committed state has caught up
  useEffect(() => {
    if (_lastValidDraftFrontSubsRef.current &&
        areSubsEffectivelyEqual(_lastValidDraftFrontSubsRef.current, frontSubs)) {
      _lastValidDraftFrontSubsRef.current = null;
    }

    if (_lastValidDraftRearSubsRef.current &&
        areSubsEffectivelyEqual(_lastValidDraftRearSubsRef.current, rearSubs)) {
      _lastValidDraftRearSubsRef.current = null;
    }
  }, [frontSubs, rearSubs, areSubsEffectivelyEqual]);

  // 4. HOOKS AND DERIVED STATE
  // Effect to cache the default position of side surrounds when they are first added
  // CRITICAL: Must be one-shot per speaker id to avoid update loops when other code rehydrates speakers.
  const slsrDefaultCapturedRef = useRef(new Set());

  useEffect(() => {
    if (typeof onSetSpeakers !== "function") return;
    if (!Array.isArray(placedSpeakers) || placedSpeakers.length === 0) return;

    // Quick check: do we have any SL/SR that lacks defaultPosition but has a real position?
    const needs = placedSpeakers.some(s => {
      const canon = getCanonicalRole(s?.role);
      if (canon !== "SL" && canon !== "SR") return false;

      const id = String(s?.id || "");
      if (!id) return false;

      // already captured once -> never try again (prevents loops if other code keeps dropping the field)
      if (slsrDefaultCapturedRef.current.has(id)) return false;

      const hasPos = Number.isFinite(s?.position?.x) && Number.isFinite(s?.position?.y);
      const hasDefault = !!s?.defaultPosition;
      return hasPos && !hasDefault;
    });

    if (!needs) return;

    onSetSpeakers(prev => {
      if (!Array.isArray(prev) || prev.length === 0) return prev;

      let changed = false;

      const next = prev.map(s => {
        const canon = getCanonicalRole(s?.role);
        if (canon !== "SL" && canon !== "SR") return s;

        const id = String(s?.id || "");
        if (!id) return s;

        // If we've already captured once for this id, never write again
        if (slsrDefaultCapturedRef.current.has(id)) return s;

        const hasPos = Number.isFinite(s?.position?.x) && Number.isFinite(s?.position?.y);
        const hasDefault = !!s?.defaultPosition;

        if (hasPos && !hasDefault) {
          changed = true;
          slsrDefaultCapturedRef.current.add(id);
          return { ...s, defaultPosition: { ...s.position } };
        }

        // Even if it already has defaultPosition, mark captured so we don't keep checking it
        if (hasDefault) {
          slsrDefaultCapturedRef.current.add(id);
        }

        return s;
      });

      return changed ? next : prev; // IMPORTANT: return prev to avoid pointless rerenders
    });
  }, [placedSpeakers, onSetSpeakers, getCanonicalRole]);

  // [B44] Bed surrounds are now seeded by SpeakerPlacement only.
  // RoomVisualisation is a READ-ONLY renderer for these roles.
  const BED_SURROUND_ROLES = new Set(['SL', 'SR', 'SBL', 'SBR', 'LW', 'RW']);

  // Unified "on side wall" test - used throughout the component
  const isOnSideWall = useCallback((side, spk, roomW, wallBufferM = WALL_BUFFER_M, tolM = 0.035) => {
    if (!spk || !spk.position || !spk.model) return false;

    const dims = getModelDimsM(spk.model);
    const halfDepth = (dims?.depthM ?? 0.082) / 2;
    const expectedX = side === 'L'
      ? (wallBufferM + halfDepth)
      : (roomW - (wallBufferM + halfDepth));

    const dx = Math.abs(Number(spk.position.x) - expectedX);
    return dx <= tolM;
  }, [getModelDimsM]);

  const byRole = useSpeakersByRole({
    placedSpeakers,
    getCanonicalRole
  });

  // NEW: Memo for LCR speakers, for P4 calculation
  const lcrSpeakers = useMemo(() => {
    return ['FL', 'FC', 'FR'].flatMap(role => getByRoleArray(byRole, role)).filter(Boolean);
  }, [byRole]);

const byId = useEntitiesById({
  placedSpeakers,
  seatingPositions,
  frontSubs,
  rearSubs
});

  // Removed seatBandXBounds - computed after overheadZones is defined

  const ids = React.useMemo(() => ({
    grid: `grid-${Math.random().toString(36).slice(2)}`,
    clip: `clip-${Math.random().toString(36).slice(2)}`
  }), []);

  // Resize observer with zero dimensions guard — delegated to hook
  usePlanResizeObserver({ planBoundsRef, setContainerW, setContainerH });

  // First-paint measurement (and a second pass on the next frame) so the plan
  // doesn't wait for some unrelated UI change (like opening Screen Size) to align.
  React.useLayoutEffect(() => {
    measurePlanBoundsNow();

    const raf1 = requestAnimationFrame(() => {
      measurePlanBoundsNow();
      const raf2 = requestAnimationFrame(() => {
        measurePlanBoundsNow();
      });
      // store raf2 id in closure
      (globalThis.__rvRaf2 = raf2);
    });

    return () => {
      cancelAnimationFrame(raf1);
      if (globalThis.__rvRaf2) cancelAnimationFrame(globalThis.__rvRaf2);
      globalThis.__rvRaf2 = null;
    };
  }, [measurePlanBoundsNow]);


  const aspect = `${Math.max(0.1, widthM)} / ${Math.max(0.1, lengthM)}`;

  // ANGLE HELPERS — lcrAimMode is the single source of truth for LCR yaw.
  // lcrAimMode === 'angled' → compute yaw to green dot / RSP
  // lcrAimMode === 'flat'   → zero angles (wall-flat rendering)
  const lcrAimAngled = appState?.lcrAimMode === 'angled';

  const lcrAngleInfo = useMemo(() => {
    if (!lcrAimAngled) return { L: 0, R: 0, averageAngle: 0, maxAbs: 0 };

    // Use the green dot as the live MLP target
    const mlpTarget = { x: mlpDotX_m, y: mlpDotY_m };

    const flSpeaker = placedSpeakers?.find(s => getCanonicalRole(s.role) === "FL" && isRenderableSpeaker(s));
    const frSpeaker = placedSpeakers?.find(s => getCanonicalRole(s.role) === "FR" && isRenderableSpeaker(s));

    const angleL = flSpeaker?.position ? safeYawToMLP(flSpeaker.position, mlpTarget) : 0;
    const angleR = frSpeaker?.position ? safeYawToMLP(frSpeaker.position, mlpTarget) : 0;

    const avg = (Math.abs(angleL) + Math.abs(angleR)) / 2;
    const averageAngle = Number.isFinite(avg) ? avg : 0;
    const maxAbs = Math.max(Math.abs(angleL), Math.abs(angleR));

    return { L: angleL, R: angleR, averageAngle, maxAbs };
  }, [lcrAimAngled, placedSpeakers, mlpDotX_m, mlpDotY_m, getCanonicalRole]);

  // Report LCR angle to parent (guarded - only when rounded value changes)
  const lastReportedLcrAngleRef = useRef(null);
  
  useEffect(() => {
    if (typeof onLcrAngleComputed !== "function") return;
    if (!Number.isFinite(lcrAngleInfo.averageAngle)) return;
    
    // Round to 0.1° to prevent float noise triggering updates
    const rounded = Math.round(lcrAngleInfo.averageAngle * 10) / 10;
    
    // Only call if value actually changed
    if (lastReportedLcrAngleRef.current === rounded) return;
    lastReportedLcrAngleRef.current = rounded;
    
    onLcrAngleComputed(rounded);
  }, [lcrAngleInfo.averageAngle, onLcrAngleComputed]);

  const { screenPlaneY, minScreenDepth } = useScreenPlane({
    placedSpeakers,
    frontSubs,
    aimAtMLP,
    lcrAngleInfo,
    screen,
    getModelDimsM,
    getCanonicalRole,
    mlpDotY_m,
    appState,
    onScreenPlaneChange,
    onScreenPlaneYChange: props.onScreenPlaneYChange,
    isDraggingRef: isDraggingSpeakerRef,
  });

  // Alias for backward compatibility with rest of component
  const actualScreenFrontY = screenPlaneY;

  // Single source of truth: prefer the live computed plane; fall back to app state only if not yet ready
  const screenFrontPlaneM = Number.isFinite(Number(screenPlaneY))
    ? Number(screenPlaneY)
    : Number(appState?.screenFrontPlaneM ?? 0);

  // ZONE_DEPTH_M: derived from screenPlaneY (matches useScreenPlane's internal computation)
  const ZONE_DEPTH_M = useMemo(() => {
    const y = Number(screenPlaneY);
    const fallback = 0.30;
    const raw = Number.isFinite(y) ? y : fallback;
    return Math.max(0.10, Math.min(0.60, raw));
  }, [screenPlaneY]);

  const TOP_GUTTER_PX = 150; // reserved space above room for dimension lines
  const SPEAKER_PLAN_TOP_GUTTER_PX = 90;
  const SPEAKER_PLAN_BOTTOM_GUTTER_PX = 120;
  const SPEAKER_PLAN_SIDE_GUTTER_PX = 90;

  const {
    effectiveContainerW,
    effectiveContainerH,
    availW,
    availH,
    scale,
    roomRect,
    hasRoomRect,
    toPx,
    meterToCanvasX,
    meterToCanvasY,
    canvasToRoom,
    roomToCanvas,
    mlpPxX,
    mlpPxY,
    midX_m,
    mlpY_m,
    sideSurroundVisualSpanM,
    sideSurroundBounds,
    rearSurroundVisualLanes,
    rearSurroundZones,
    clampToSideBand,
    RS_BAND_W_M,
    lastSeatY_m,
    rsSideCorridor,
    rsRearCorridor,
  } = useRoomGeometry({
    exportWidthPx,
    exportHeightPx,
    containerW,
    containerH,
    widthM,
    lengthM,
    viewOffsetPx,
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

  // --- FRONT-WIDE ZONES (must be declared before any use) ---
  const frontWideZones = useFrontWideZonesComputed({
    mlp,
    widthM,
    lengthM,
    heightM,
    placedSpeakers,
    speakersEpoch,
    getModelDimsM,
    appState_DBG_FW,
    getCanonicalRole
  });

  // [DISABLED] Auto-seed FW speakers when enabled
  // Reason: RoomDesigner already creates LW/RW via 7.x swap logic.
  // This auto-seed introduces duplicate creation / re-creation timing issues.

  // --- OVERHEAD ZONES (must be declared EARLY, before handleSpeakerDrag) ---
  const overheadZones = useOverheadZonesComputed({
    seatingPositions,
    heightM,
    widthM,
    lengthM,
    mlpY_m,
    mlp,
    placedSpeakers,
    getCanonicalRole
  });

  // Overheads must never come further inboard than the outermost seat on that side.
  // We allow a tiny margin (tweeter centred in the baffle), but no more.
  const OVERHEAD_SEAT_MARGIN_M = 0.05; // 5 cm each side of seat centre

  function clampOverheadXToSeatSpan(xRoom, seatMinX, seatMaxX) {
    if (!Number.isFinite(xRoom) || !Number.isFinite(seatMinX) || !Number.isFinite(seatMaxX)) {
      return xRoom;
    }

    const roomCenterX = (seatMinX + seatMaxX) / 2;

    // LEFT side overhead: xRoom < roomCenterX
    // Do not allow it to move more inboard than (seatMinX + margin)
    if (xRoom < roomCenterX) {
      const innerLimitLeft = seatMinX + OVERHEAD_SEAT_MARGIN_M;
      if (xRoom > innerLimitLeft) {
        return innerLimitLeft;
      }
      return xRoom;
    }

    // RIGHT side overhead: xRoom > roomCenterX
    // Do not allow it to move more inboard than (seatMaxX - margin)
    if (xRoom > roomCenterX) {
      const innerLimitRight = seatMaxX - OVERHEAD_SEAT_MARGIN_M;
      if (xRoom < innerLimitRight) {
        return innerLimitRight;
      }
      return xRoom;
    }

    // Exactly on centre line – leave it (this should not normally happen for overheads)
    return xRoom;
  }

  // [B44] Auto-positioning of FW based on zones (delegated to hook)
  useFrontWideAutoPlacement({
    isAnyDraggingRef,
    isDraggingFW,
    placedSpeakers,
    widthM,
    lengthM,
    frontWideZones,
    speakersEpoch,
    fwOffsetRef,
    onSetSpeakers,
    getModelDimsM,
    getCanonicalRole,
    clamp,
    SIDE_ALLOW_OVERHANG,
    mlp,
    aimFrontWidesAtMLP,
    lcrAngleInfo,
  });

  // Listen for reset-to-median event
  useEffect(() => {
    const handleReset = () => {
      // Reset offsets to zero
      fwOffsetRef.current = { L: 0, R: 0 };

      if (frontWideZones?.status !== 'ok') return;

      const W = widthM || 4.5;
      const L = lengthM || 6.0; // Added for yMaxClamped
      const WALL_BUFFER_FW = 0.02;

      onSetSpeakers(prev => (prev || []).map(s => {
        const role = getCanonicalRole(s.role);
        if (role !== 'LW' && role !== 'RW') return s;

        const zone = role === 'LW' ? frontWideZones.left : frontWideZones.right;
        if (!zone) return s;

        const dims = getModelDimsM(s.model);
        const halfDepth = (Number(dims?.depthM) || 0.082) / 2;
        const halfWidth = (Number(dims?.widthM) || 0.20) / 2;

        const xAtWall = role === 'LW'
          ? (WALL_BUFFER_FW + halfDepth)
          : (W - WALL_BUFFER_FW - halfDepth);

        // Calculate clamped Y for median
        const yMinClamped = (zone.yMin || 0) + (halfWidth * SIDE_ALLOW_OVERHANG);
        const yMaxClamped = (zone.yMax || L) - (halfWidth * SIDE_ALLOW_OVERHANG);
        const yClamped = clamp(zone.medianY, yMinClamped, yMaxClamped);


        return {
          ...s,
          position: {
            ...s.position,
            x: xAtWall,
            y: yClamped,
            z: s.position?.z ?? 1.1
          },
          positionSource: 'auto' // Clear user lock on reset
        };
      }));
    };

    window.addEventListener('b44:fw:resetToMedian', handleReset);
    return () => window.removeEventListener('b44:fw:resetToMedian', handleReset);
  }, [frontWideZones, widthM, lengthM, getModelDimsM, onSetSpeakers, getCanonicalRole]);

  // Drag state management — extracted to hook
  const { handleMouseDown } = useMouseDownHandler({
    byId, setDragState, setDragWarning, setTooltip, rsDragLockRef, getCanonicalRole,
    widthM, lengthM, canvasToRoom, svgRef,
    isAnyDraggingRef, isDraggingSpeakerRef, isDraggingRearRef, isDraggingFW,
    isDraggingSubRef, dragOffsetRoomRef, draggedSubWallRef, draggedSubTypeRef,
    draftFrontSubsRef, draftRearSubsRef, idleCommitTimerRef,
    frontSubs, rearSubs, frontSubsCfg, rearSubsCfg,
    isRenderableSpeaker, isDraggable,
    roomElements,
    rspMode,
    mlpDotY_m,
    meterToCanvasY,
    seatDragStartRef,
    seatingPositions,
  });

  // Shared drag handler wrapper for all speakers (bed-layer and overhead)
  const bedLayerSpeakerMouseDownHandler = useCallback(
    (e, id) => handleMouseDown(e, id, "speaker"),
    [handleMouseDown]
  );

  const handleBedLayerSpeakerAimToggle = useCallback((speaker) => {
    const role = String(getCanonicalRole(speaker?.role) || '').toUpperCase();

    if (role === 'FL' || role === 'FR' || role === 'L' || role === 'R') {
      const nextMode = appState?.lcrAimMode === 'angled' ? 'flat' : 'angled';
      appState?.setLcrAimMode?.(nextMode);
      return;
    }

    if (role === 'LW' || role === 'RW') {
      appState?.setAimFrontWidesAtMLP?.(!(appState?.aimFrontWidesAtMLP ?? false));
      return;
    }

    if (role === 'SL' || role === 'SR' || /^SL\d+$/.test(role) || /^SR\d+$/.test(role)) {
      appState?.setAimSideSurroundsAtMLP?.(!(appState?.aimSideSurroundsAtMLP ?? false));
      return;
    }

    if (role === 'SBL' || role === 'SBR') {
      appState?.setAimRearSurroundsAtMLP?.(!(appState?.aimRearSurroundsAtMLP ?? false));
    }
  }, [appState, getCanonicalRole]);

  // Zoom handlers — delegated to hook
  const { handlePlanClick } = useCanvasZoomHandlers({
    zoom,
    zoomMode,
    planBoundsRef,
    panX,
    panY,
    setPanX,
    setPanY,
    setZoom,
  });

  // Pan handlers - extracted to hook
  const { onPanPointerDown: hookOnPanDown, onPanPointerMove: hookOnPanMove, onPanPointerUp: hookOnPanUp } = usePanZoomHandlers({
    zoom,
    panStartRef,
    isPanningRef,
    setViewOffsetPx,
  });

  // Wrap hook handlers with additional context guards (speaker drag, etc.)
  const onPanPointerDown = useCallback((e) => {
    // Never pan if event was already handled (sub/speaker drag)
    if (e.defaultPrevented) return;
    
    // Never pan if dragging anything
    if (isDraggingSpeakerRef.current) return;
    if (dragging) return;
    
    // Only pan when zoomed
    if (zoom <= 1) return;
    
    // Left click only
    if (e.button !== 0) return;
    
    // Avoid modifier conflicts
    if (e.shiftKey || e.altKey || e.metaKey || e.ctrlKey) return;
    
    // Only proceed if clicking the rect itself (not a child element)
    if (e.currentTarget !== e.target) return;
    
    hookOnPanDown(e);
  }, [zoom, hookOnPanDown, isDraggingSpeakerRef, dragging]);

  const onPanPointerMove = useCallback((e) => {
    hookOnPanMove(e);
  }, [hookOnPanMove]);

  const onPanPointerUp = useCallback((e) => {
    hookOnPanUp(e);
  }, [hookOnPanUp]);

  // Derived screen values still needed in RoomVisualisation (for LCR constraints, drag logic)
  const screenCenterX_m = (widthM || 4.5) / 2;
  const visibleWidthM = Math.max(0.1, Number(screen?.visibleWidthInches || 100) * 0.0254);

  // Compute LCR zone blocks with ZONE_DEPTH_M
  const lcrZoneBlocks = useMemo(() => {
    if (!mlp) return null;

    const angle1 = 22.5 * (Math.PI / 180);
    const angle2 = 30.0 * (Math.PI / 180);
    const baffleInnerY = ZONE_DEPTH_M;

    const yTopM = 0;
    const yBottomM = ZONE_DEPTH_M;

    const x_inner_left = mlp.x + (mlp.y - baffleInnerY) * Math.tan(-angle1);
    const x_outer_left = mlp.x + (mlp.y - baffleInnerY) * Math.tan(-angle2);

    const x_inner_right = mlp.x + (mlp.y - baffleInnerY) * Math.tan(angle1);
    const x_outer_right = mlp.x + (mlp.y - baffleInnerY) * Math.tan(angle2);

    return {
      left: {
        x_start: Math.min(x_inner_left, x_outer_left),
        x_end: Math.max(x_inner_left, x_outer_left),
        y_top: yTopM,
        y_bottom: yBottomM
      },
      right: {
        x_start: Math.min(x_inner_right, x_outer_right),
        x_end: Math.max(x_inner_right, x_outer_right),
        y_top: yTopM,
        y_bottom: yBottomM
      }
    };
  }, [mlp, screen?.mountMode, ZONE_DEPTH_M]);

  // This useMemo prepares the visual zones for `calculateLcrConstraints`
  const visualConstraintZones = useMemo(() => {
    if (!lcrZoneBlocks) return null;
    return {
      LCR: {
        FL: { points: [{ x: lcrZoneBlocks.left.x_start }, { x: lcrZoneBlocks.left.x_end }] },
        FR: { points: [{ x: lcrZoneBlocks.right.x_start }, { x: lcrZoneBlocks.right.x_end }] },
      }
    };
  }, [lcrZoneBlocks]);

  // Compute listening area bounds from seating
  const listeningAreaBounds = useMemo(() => {
    if (!seatingPositions || seatingPositions.length === 0) {
      return null;
    }

    // Estimate seat depth (front-to-back) - typical cinema seat is ~0.6m
    const SEAT_DEPTH_M = 0.6;
    const halfDepth = SEAT_DEPTH_M / 2;

    const frontY = Math.min(...seatingPositions.map(s => (s.y || 0) - halfDepth));
    const rearY = Math.max(...seatingPositions.map(s => (s.y || 0) + halfDepth));

    return {
      frontY: Math.max(0, frontY),
      rearY: Math.min(lengthM || 6.0, rearY)
    };
  }, [seatingPositions, lengthM]);

  // ── Layer 2: speaker drag update hook ─────────────────────────────────────
  const handleSpeakerDragUpdate = useSpeakerDragUpdate({
    byId, onSetSpeakers, canvasToRoom,
    lastInteractionEpoch, fwOffsetRef, slsrModeRef, isDraggingFW,
    setHasManualOverheadEdit, setDragWarning,
    widthM, lengthM, screenCenterX_m, centerX_m,
    constraintZones, frontWideZones, overheadZones,
    placedSpeakers, seatingPositions, mlpDotY_m, freeMoveLcr, _overlays,
    sideSurroundVisualSpanM, rearSurroundVisualLanes, mlp,
    getModelDimsM, getCanonicalRole, getSpeakerDims, rsRearCorridor,
    clampOverheadXToSeatSpan, nonCrossingClampDirectional, fwDeviationLevel,
    horizontalAngleFromMLP, isOnSideWall, speakerOnWallYFootprint, clamp,
    isDraggable, isRenderableSpeaker,
    aimFrontWidesAtMLP, aimSideSurroundsAtMLP, aimRearSurroundsAtMLP, lcrAngleInfo,
    CORNER_CLEAR_M, BACKWALL_HYSTERESIS_M, SURROUND_WALL_GAP_M, SIDE_ALLOW_OVERHANG,
    WALL_BUFFER_M, EPS, timeNowMs,
  });

  // ── Layer 3: lightweight wrapper (~5 lines) ───────────────────────────────
  const handleSpeakerDrag = useCallback((speakerId, newCanvasPos) => {
    handleSpeakerDragUpdate(speakerId, newCanvasPos);
  }, [handleSpeakerDragUpdate]);

  const { handleMlpDrag } = useMlpDragHandler({
    canvasToRoom,
    lengthM,
    setManualRspY_m: onSetManualRspY_m,
    dragOffsetRoomRef,
  });

  const { handleSeatDrag, isSnapping: isSeatSnapping, clearSnap: clearSeatSnap, clearSeatDragBaseline } = useSeatDragHandler({
    onSetSeatingPositions,
    canvasToRoom,
    lengthM,
    seatDragStartRef,
    setSeatingBlockOffset: appState?.setSeatingBlockOffset,
    setRowCentersM: appState?.setRowCentersM,
  });

  // Room element drag info (structured, only visible during roomElement drag)
  const [roomElementDragInfo, setRoomElementDragInfo] = useState(null);

  useEffect(() => {
    if (dragType !== 'roomElement') setRoomElementDragInfo(null);
  }, [dragType]);

  // Room Element drag — wall-constrained movement, updates pos_m + drag info live
  const handleRoomElementDrag = useCallback((elementId, canvasPos) => {
    if (!onSetRoomElements || !canvasToRoom) return;
    const roomPos = canvasToRoom(canvasPos);
    const el = Array.isArray(roomElements)
      ? roomElements.find(re => String(re?.id) === String(elementId))
      : null;
    if (!el) return;
    const wall = String(el?.wall || 'front').toLowerCase();
    const isFrontRear = wall === 'front' || wall === 'rear';
    const elLen = Number(el?.length_m) || 0.9;
    const wallLength = isFrontRear ? widthM : lengthM;
    const raw = isFrontRear
      ? (roomPos.x + dragOffsetRoomRef.current.x)
      : (roomPos.y + dragOffsetRoomRef.current.y);
    const clamped = Math.max(0, Math.min(wallLength - elLen, raw - elLen / 2));
    const distA = clamped;
    const distB = Math.max(0, wallLength - elLen - clamped);
    setRoomElementDragInfo({
      visible: true, wall, posM: clamped, lengthM: elLen,
      distA, distB,
      labelA: isFrontRear ? 'Left Distance' : 'Front Distance',
      labelB: isFrontRear ? 'Right Distance' : 'Rear Distance',
    });
    onSetRoomElements(prev =>
      (Array.isArray(prev) ? prev : []).map(re =>
        String(re?.id) === String(elementId)
          ? { ...re, pos_m: clamped, x_m: clamped, y_m: clamped }
          : re
      )
    );
  }, [onSetRoomElements, canvasToRoom, roomElements, widthM, lengthM, dragOffsetRoomRef]);

  // Projector drag — Y-axis only, clamped to room bounds
  const handleProjectorDrag = useCallback((projectorId, canvasPos) => {
    if (!onSetRoomElements || !canvasToRoom) return;
    const roomPos = canvasToRoom(canvasPos);
    const rawY = roomPos.y + dragOffsetRoomRef.current.y;
    const projEl = Array.isArray(roomElements)
      ? roomElements.find(e => e?.type === 'projector')
      : null;
    const bodyD = Number(projEl?.body_depth_m) || 0.517;
    const halfD = bodyD / 2;
    const clampedY = Math.max(halfD, Math.min(lengthM - halfD, rawY));
    onSetRoomElements(prev =>
      (Array.isArray(prev) ? prev : []).map(el =>
        el?.type === 'projector' ? { ...el, y_lens_m: clampedY } : el
      )
    );
  }, [onSetRoomElements, canvasToRoom, roomElements, lengthM]);

  // Memo: speakers that are actually rendered as icons (single source of truth for overlays/metrics)
  const visiblePlanSpeakers = useVisiblePlanSpeakers({ placedSpeakers, getCanonicalRole, getSpeakerVisibility, appState, dolbyLayout });

  // ── Live RP22 analysis (always running) ──────────────────────────────────
  const engineDimensions = useMemo(() => ({ widthM, lengthM, heightM }), [widthM, lengthM, heightM]);
  const engineState = useMemo(() => ({
    lcrAimMode: appState?.lcrAimMode,
    globalModel: overheadGlobalModel,
    frontOverride: overheadFrontOverride,
    midOverride: overheadMidOverride,
    rearOverride: overheadRearOverride,
    useFrontGlobal, useMidGlobal, useRearGlobal,
    aimFrontWidesAtMLP, aimSideSurroundsAtMLP, aimRearSurroundsAtMLP,
    speakerSystem: appState?.speakerSystem,
    getSpeakerVisibility,
  }), [
    appState?.lcrAimMode, appState?.speakerSystem,
    overheadGlobalModel, overheadFrontOverride, overheadMidOverride, overheadRearOverride,
    useFrontGlobal, useMidGlobal, useRearGlobal,
    aimFrontWidesAtMLP, aimSideSurroundsAtMLP, aimRearSurroundsAtMLP, getSpeakerVisibility,
  ]);
  const liveRp22 = useRP22AnalysisEngine({
    placedSpeakers,
    seatingPositions,
    dimensions: engineDimensions,
    mlpBasis,
    mlpPointOverride: mlpPoint,
    seatSplMetrics: allSeatSplMetricsProp,
    overheadState: engineState,
    aimState: engineState,
    p15ConstructionLevel: appState?.p15ConstructionLevel ?? null,
    screen,
    visiblePlanSpeakers,
  });

  // ── Universal drag impact baseline — captured at ANY Plan View drag start ─
  const [baselineRp22, setBaselineRp22] = useState(null);
  const [baselineMlp, setBaselineMlp] = useState(null);
  const baselineCapturedRef = useRef(false);

  useEffect(() => {
    if (dragging) {
      // Capture baseline once at drag start
      if (!baselineCapturedRef.current) {
        baselineCapturedRef.current = true;
        setBaselineRp22(liveRp22);
        setBaselineMlp(mlp ? { ...mlp } : null);
      }
    } else {
      // Drag ended — clear baseline
      baselineCapturedRef.current = false;
      setBaselineRp22(null);
      setBaselineMlp(null);
    }
  // liveRp22 intentionally excluded — baseline is a snapshot, not a live value
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

  // Helper to commit draft sub positions to real state
  const commitDraftSubPositions = useCallback(() => {
    if (draftFrontSubsRef.current && onSetFrontSubs) {
      const positions = draftFrontSubsRef.current.map(s => ({ x: s.position.x, y: s.position.y }));
      onSetFrontSubs(prev => ({
        ...prev,
        positions,
        count: Array.isArray(positions) ? positions.length : 0,
        placementMode: 'manual',
        isManual: true,
      }));
    }
    if (draftRearSubsRef.current && onSetRearSubs) {
      const positions = draftRearSubsRef.current.map(s => ({ x: s.position.x, y: s.position.y }));
      onSetRearSubs(prev => ({
        ...prev,
        positions,
        count: Array.isArray(positions) ? positions.length : 0,
        placementMode: 'manual',
        isManual: true,
      }));
    }
  }, [onSetFrontSubs, onSetRearSubs]);

  // Sub drag — delegated to hook (instantiated here so commitDraftSubPositions is in scope)
  const { handleSubDrag } = useSubDragHandler({
    byId, canvasToRoom, widthM, lengthM, getModelDimsM,
    draggedSubTypeRef, draggedSubWallRef, dragOffsetRoomRef,
    draftFrontSubsRef, draftRearSubsRef,
    setSubDragTick, idleCommitTimerRef, commitDraftSubPositions,
  });

  // Mouse handling — delegated to extracted hook
  const { handleMouseMove } = useRoomCanvasMouseMove({
    dragging,
    draggedItemId,
    dragType,
    dragState,
    setDragState,
    setDragWarning,
    svgRef,
    canvasToRoom,
    roomToCanvas,
    dragOffsetRoomRef,
    roomRect,
    placedSpeakers,
    onSetSpeakers,
    constraintZones,
    centerX_m,
    screenCenterX_m,
    getCanonicalRole,
    lastInteractionEpoch,
    handleSpeakerDrag,
    handleSeatDrag,
    handleSubDrag,
    handleProjectorDrag,
    handleRoomElementDrag,
    handleMlpDrag,
  });

  const { handleMouseUp } = useMouseUpHandler({
    dragType, draggedItemId, byId, getCanonicalRole, overheadZones, onSetSpeakers,
    setDragState, setDragWarning, setTooltip, rsDragLockRef, isDraggingRearRef, isDraggingFW,
    isDraggingSubRef, isAnyDraggingRef, isDraggingSpeakerRef, dragOffsetRoomRef,
    draggedSubWallRef, draggedSubTypeRef, draftFrontSubsRef, draftRearSubsRef, idleCommitTimerRef,
    isDraggingRef: props.isDraggingRef,
    widthM, getModelDimsM, commitDraftSubPositions,
    _lastValidDraftFrontSubsRef, _lastValidDraftRearSubsRef,
  });

  // Window-level drag cleanup — fires for ALL drag types when mouse is released outside the SVG
  useEffect(() => {
    const onWindowMouseUp = (e) => {
      if (isAnyDraggingRef.current) { handleMouseUp(e); clearSeatSnap(); clearSeatDragBaseline(); }
    };
    const onWindowBlur = () => {
      if (isAnyDraggingRef.current) { handleMouseUp({}); clearSeatSnap(); clearSeatDragBaseline(); }
    };
    window.addEventListener('mouseup', onWindowMouseUp);
    window.addEventListener('blur', onWindowBlur);
    return () => {
      window.removeEventListener('mouseup', onWindowMouseUp);
      window.removeEventListener('blur', onWindowBlur);
    };
  }, [handleMouseUp, clearSeatSnap, clearSeatDragBaseline]);

  const handleSpeakerDragEnd = useCallback((role, newPosition) => {
    onSetSpeakers(prev => prev.map(s => (s.role === role ? { ...s, position: newPosition } : s)));
    setDraggingRole(null);
  }, [onSetSpeakers]);


  // Seat hover logic — delegated to hook
  const {
    effectiveHoveredSeat,
    tooltipData,
    speakerTooltip,
    handleSeatClick,
    handleSeatMouseEnter,
    handleSeatMouseLeave,
    handleIconEnter,
    handleIconMove,
    handleIconLeave,
  } = useSeatHoverLogic({
    seatingPositions,
    appState,
    hudPinnedSeatId,
    setHudPinnedSeatId,
    placedSpeakers,
    widthM,
    lengthM,
    heightM,
    screenFrontPlaneM,
    screen,
    mlp,
    allSeatSplMetricsProp,
    aimAtMLP,
    aimFrontWidesAtMLP,
    aimSideSurroundsAtMLP,
    aimRearSurroundsAtMLP,
    lcrAngleInfo,
    analysisResult,
    dolbyLayout,
    getCanonicalRole,
    registryNormaliseModelKey,
    getSpeakerModelMeta,
    rvWrapRef,
    computeAllSeatSplMetrics,
  });

  // AUTOMATIC SEAT METRICS CACHE — extracted to hook
  // ---- Stable primitive revision inputs (avoid update loops) ----
  const analysisRev =
    Number.isFinite(Number(analysisResult?.__rev)) ? Number(analysisResult.__rev) : 0;
  const splRev =
    Number.isFinite(Number(allSeatSplMetricsProp?.__rev)) ? Number(allSeatSplMetricsProp.__rev) : 0;
  const mlpX = Number.isFinite(Number(mlp?.x)) ? Number(mlp.x) : NaN;
  const mlpY = Number.isFinite(Number(mlp?.y)) ? Number(mlp.y) : NaN;
  const mlpZ = Number.isFinite(Number(mlp?.z)) ? Number(mlp.z) : NaN;
  const lcrL = Number.isFinite(Number(lcrAngleInfo?.L)) ? Number(lcrAngleInfo.L) : 0;
  const lcrR = Number.isFinite(Number(lcrAngleInfo?.R)) ? Number(lcrAngleInfo.R) : 0;

  useSeatMetricsCacheEffect({
    seatingPositions, placedSpeakers, widthM, lengthM, heightM,
    screenFrontPlaneM, screen, mlp, allSeatSplMetrics: allSeatSplMetricsProp,
    aimAtMLP, aimFrontWidesAtMLP, aimSideSurroundsAtMLP, aimRearSurroundsAtMLP,
    lcrAngleInfo, analysisResult, dolbyLayout, appState,
    exportMode, isPrinting: props.isPrinting,
    analysisRev, splRev, mlpX, mlpY, mlpZ, lcrL, lcrR,
    getCanonicalRole,
  });

// 1) Auto-position HUD near the currently hovered/pinned seat
//    BUT only when there is no manual position yet.
useEffect(() => {
  if (!effectiveHoveredSeat || !toPx) return;
  if (hudBasePosPx) return; // already manually placed, don't move it

  const [seatX_px, seatY_px] = toPx(
    Number(effectiveHoveredSeat.x ?? effectiveHoveredSeat.position?.x ?? 0),
    Number(effectiveHoveredSeat.y ?? effectiveHoveredSeat.position?.y ?? 0)
  );

  const HUD_EST_W = 320;
  const HUD_EST_H = 520;
  const pad = 8;

  const canvasW = containerW || 1200;
  const canvasH = containerH || 800;

  let preferredX = seatX_px + 16;
  let preferredY = seatY_px - HUD_EST_H / 2;

  if (preferredX + HUD_EST_W + pad > canvasW) {
    preferredX = seatX_px - HUD_EST_W - 16;
  }

  const clamped = {
    x: Math.min(canvasW - HUD_EST_W - pad, Math.max(pad, preferredX)),
    y: Math.min(canvasH - HUD_EST_H - pad, Math.max(pad, preferredY)),
  };

  setHudBasePosPx(clamped);
}, [effectiveHoveredSeat, toPx, containerW, containerH, hudBasePosPx]);


  // Phase 1: Calculate and log LCR constraints, and store them in state
  React.useEffect(() => {
    // Only consider speakers that are on the plan
    const activeSpeakers = placedSpeakers.filter(isRenderableSpeaker);

    // Use visualConstraintZones here as the input for calculation
    if (!activeSpeakers.length || !visualConstraintZones) return;

    try {
      const constraints = calculateLcrConstraints({
        placedSpeakers: activeSpeakers,
        zones: visualConstraintZones,
        room: { width: widthM, length: lengthM, height: heightM }, // Pass as object
        screen,
        getModelDimsM: getModelDimsM
      });
      setConstraintZones(constraints);
    } catch (error) {
      if (typeof console !== "undefined" && typeof console.warn === "function") {
        if (globalThis.__B44_LOGS) if (globalThis.__B44_LOGS) console.warn('[LCR Constraints] Error calculating constraints:', error);
      }
    }
  }, [placedSpeakers, widthM, lengthM, heightM, screen, visualConstraintZones, getModelDimsM]); // Use new dimension variables

  // Snap FL/FR to zone midpoints once constraintZones are ready.
  // This corrects generic seed positions (e.g. w*0.25) to the real approved zone centres.
  // Only snaps if the current X is outside the valid clamp range — speakers already
  // inside the zone (i.e. placed by a drag) are not moved.
  useEffect(() => {
    if (isAnyDraggingRef.current) return; // Skip while drag is active
    if (!onSetSpeakers || !constraintZones?.FL || !constraintZones?.FR) return;

    const flSpeaker = placedSpeakers.find(s => getCanonicalRole(s.role) === 'FL');
    const frSpeaker = placedSpeakers.find(s => getCanonicalRole(s.role) === 'FR');
    const fcSpeaker = placedSpeakers.find(s => getCanonicalRole(s.role) === 'FC');

    const flClamp = constraintZones.FL.clamp;
    const frClamp = constraintZones.FR.clamp;

    // Zone midpoints: the natural resting position for each LCR speaker
    const flZoneMid = (flClamp.minX + flClamp.maxX) / 2;
    const frZoneMid = (frClamp.minX + frClamp.maxX) / 2;

    const flCurrentX = Number(flSpeaker?.position?.x);
    const frCurrentX = Number(frSpeaker?.position?.x);
    const fcCurrentX = Number(fcSpeaker?.position?.x);

    // Only snap if currently outside the allowed zone (i.e. still at hardcoded seed)
    // Never snap a speaker that has ever been user-positioned (positionSource === 'user').
    const isUserPositioned = (s) => s?.positionSource === 'user';

    const flNeedsSnap = flSpeaker && !isUserPositioned(flSpeaker) && Number.isFinite(flCurrentX) &&
      (flCurrentX < flClamp.minX - EPS || flCurrentX > flClamp.maxX + EPS);
    const frNeedsSnap = frSpeaker && !isUserPositioned(frSpeaker) && Number.isFinite(frCurrentX) &&
      (frCurrentX < frClamp.minX - EPS || frCurrentX > frClamp.maxX + EPS);
    const fcNeedsSnap = fcSpeaker && !isUserPositioned(fcSpeaker) && Number.isFinite(fcCurrentX) &&
      Math.abs(fcCurrentX - centerX_m) > EPS_M;

    if (!flNeedsSnap && !frNeedsSnap && !fcNeedsSnap) return;

    onSetSpeakers(prev => prev.map(s => {
      const role = getCanonicalRole(s.role);
      if (role === 'FL' && flNeedsSnap) return { ...s, position: { ...(s.position || {}), x: flZoneMid } };
      if (role === 'FR' && frNeedsSnap) return { ...s, position: { ...(s.position || {}), x: frZoneMid } };
      if (role === 'FC' && fcNeedsSnap) return { ...s, position: { ...(s.position || {}), x: centerX_m } };
      return s;
    }));
  }, [constraintZones, centerX_m, placedSpeakers, onSetSpeakers, getCanonicalRole]);

  // [REMOVED] Redundant useEffect for LCR yaw was here.

  // [NEW] Auto-hug ALL surrounds to walls — delegated to hook
  useAutoHugSurroundsToWalls({
    placedSpeakers,
    widthM,
    lengthM,
    onSetSpeakers,
    isAnyDraggingRef,
    getCanonicalRole,
    getModelDimsM,
    sideSurroundVisualSpanM,
    mlp,
    aimSideSurroundsAtMLP,
    aimRearSurroundsAtMLP,
    aimFrontWidesAtMLP,
    lcrAngleInfo,
  });

  // [FC_CENTERLINE_LOCK] — Enforce FC X = room centerline only. Never moves other fields.
  // Skips user-positioned FC so drag result is never overwritten.
  useEffect(() => {
    if (isAnyDraggingRef.current) return; // Skip while drag is active
    if (!placedSpeakers?.length || !onSetSpeakers) return;

    let needsFix = false;
    const next = placedSpeakers.map(sp => {
      const role = getCanonicalRole(sp.role);
      if (role === 'FC' && sp.positionSource !== 'user') {
        const x = Number(sp.position?.x);
        if (!Number.isFinite(x) || Math.abs(x - centerX_m) > EPS_M) {
          needsFix = true;
          // Surgical: only fix position.x, preserve everything else exactly
          return { ...sp, position: { ...sp.position, x: centerX_m } };
        }
      }
      return sp;
    });

    if (needsFix) onSetSpeakers(next);
  }, [placedSpeakers, onSetSpeakers, centerX_m, getCanonicalRole]);

  // [B44] DISABLED: SL/SR auto-adjust removed — was a no-op (early return).
  // SBL/SBR auto-adjust (disabled) removed — was a no-op (early return) and only added noise/size.

  // A) Hard-gate the legacy front-wide ribbon generation
  const ENABLE_LEGACY_FRONT_WIDE_RIBBON = false;

  // ADDED: Step 1 & 3: Confirm missing keys and create a temporary adapter for LCR
  const { augmentedZones, zoneKeysLabel } = useMemo(() => {
    const newZones = analysisResult?.zones ? { ...analysisResult.zones } : {};

    // Step 3: If LCR zone data is missing from the analysis engine, create a temporary one.
    if (!newZones.LCR?.points?.length) {
      const fl = placedSpeakers.find(s => ['FL', 'L'].includes(String(s.role).toUpperCase()));
      const fr = placedSpeakers.find(s => ['FR', 'R'].includes(String(s.role).toUpperCase()));

      if (fl?.position && fr?.position) { // Check if speaker positions exist before using widthM and lengthM
        const WALL_BUFFER_M_LCR_ADAPTER = 0.01;
        const LCR_ZONE_DEPTH_M = ZONE_DEPTH_M;
        const roomWidth = widthM || 4.5; // Use new widthM

        newZones.LCR = {
          points: [
            { x: Math.max(0, fl.position.x - 0.2), y: WALL_BUFFER_M_LCR_ADAPTER },
            { x: Math.min(roomWidth, fr.position.x + 0.2), y: WALL_BUFFER_M_LCR_ADAPTER + LCR_ZONE_DEPTH_M },
            { x: Math.min(roomWidth, fr.position.x + 0.2), y: WALL_BUFFER_M_LCR_ADAPTER },
            { x: Math.max(0, fl.position.x - 0.2), y: WALL_BUFFER_M_LCR_ADAPTER + LCR_ZONE_DEPTH_M },
          ]
        };
      }
    }

    // Step 1: Create a QA label to display the keys present in the final zones object
    const label = `zones: ${Object.keys(newZones).join(',')}`;

    return { augmentedZones: newZones, zoneKeysLabel: label };
  }, [analysisResult?.zones, placedSpeakers, widthM, lengthM, ZONE_DEPTH_M, getCanonicalRole]);

  // Consolidate overlays for rendering
  const overlaysForRendering = useMemo(() => {
    if (!hasRoomRect) return {};

    const base = { ...(_overlays || {}) };

    // NEW: Add listening area bounds for overhead zone clamping
    if (listeningAreaBounds) {
      base.listeningArea = listeningAreaBounds;
    }

    // FW zones are always computed, but overlay visibility is controlled separately
    base.FRONT_WIDE = frontWideZones;

    // This flag controls ONLY the visual overlay band, not icon rendering
    // Use `enableFrontWides` from appState to control overlay visibility.
    base.enableFrontWides = enableFrontWides;
    base.enableRp22Angles = rp22AnglesEnabled;
    
    // REMOVED: base.showOverheadZones and base.OVERHEADS derivations
    // Overhead corridors are controlled directly by OVERHEADS_2/4/6 toggles

    // Debug: Log overlay state for diagnostics
    if (typeof console !== 'undefined') {
      if (globalThis.__B44_LOGS) console.log('[RV] overlaysForRendering built', {
        overheadToggles: {
          OVERHEADS_2: !!_overlays?.OVERHEADS_2,
          OVERHEADS_4: !!_overlays?.OVERHEADS_4,
          OVERHEADS_6: !!_overlays?.OVERHEADS_6,
          enableDolbyZones: !!_overlays?.enableDolbyZones,
        }
      });
    }

    return base;
  }, [_overlays, listeningAreaBounds, frontWideZones, enableFrontWides, rp22AnglesEnabled]);

  // Overhead speaker icons — extracted to hook
  const overheadIconElements = useOverheadIconElements({ placedSpeakers, toPx, scale, setHoveredSpeaker, overheadGlobalModel, useFrontGlobal, useMidGlobal, useRearGlobal, overheadFrontOverride, overheadMidOverride, overheadRearOverride, bedLayerSpeakerMouseDownHandler, handleIconEnter, handleIconMove, handleIconLeave });

  // Front-wide zone rendering helper — extracted to hook
  const renderFrontWideZones = useRenderFrontWideZones({
    hasRoomRect,
    frontWideZones,
    widthM,
    lengthM,
    roomRect,
    scale,
    ZONE_DEPTH_M,
  });

  // Derived overhead count — used by useZoneComponents and overheadCorridorsOn
  const overheadCount = Array.isArray(placedSpeakers)
    ? placedSpeakers.filter(s => rvIsOverheadRole(s?.role)).length
    : 0;

  const arcPathForBand = useCallback((seatX, seatY, radiusM, minDeg, maxDeg, toPxFn) => {
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
      pts.push(`${i === 0 ? 'M' : 'L'}${cx},${cy}`);
    }
    return pts.join(' ');
  }, []);

  // Memoize individual zone components with unique IDs
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


  // Seating shift helper — extracted to hook
  const { shiftSeatsToMaintainAngle } = useShiftSeatsToAngle({ lengthM, screen, seatingPositions, onSetSeatingPositions });

  // UPDATED: Reset side surrounds to their cached default positions
  const resetSideSurroundsToDefault = useCallback(() => {
    onSetSpeakers(prev => {
      const slSpeaker = prev.find(s => getCanonicalRole(s.role) === 'SL');
      const srSpeaker = prev.find(s => getCanonicalRole(s.role) === 'SR');

      if (!slSpeaker && !srSpeaker) return prev;

      const roomWidth = widthM || 4.5; // Use new widthM
      const roomLengthM = lengthM || 6.0; // Use new lengthM

      // Determine fixed X positions for both, even if only one exists for robustness
      // Use getSpeakerDims directly to get dimensions.
      const dimsL = slSpeaker ? getSpeakerDims(slSpeaker.model, tvPresetKey) : { heightM: 0.2, depthM: 0.082 };
      const dimsR = srSpeaker ? getSpeakerDims(srSpeaker.model, tvPresetKey) : { heightM: 0.2, depthM: 0.082 };

      const xL = fixedSideX(roomWidth, dimsL, 'L');
      const xR = fixedSideX(roomWidth, dimsR, 'R');

      // Get the y-range for the speaker center (already includes overhang)
      const yMin_center = Number(sideSurroundVisualSpanM?.minY) ?? 0;
      const yMax_center = Number(sideSurroundVisualSpanM?.maxY) ?? 0;

      // Calculate a default Y position, e.g., the midpoint of the available range
      let defaultY = (yMin_center + yMax_center) / 2;
      // If the span is invalid (e.g., yMin_center >= yMax_center), clamp to a safe default in the room center
      if (!(yMax_center > yMin_center)) {
        defaultY = roomLengthM / 2;
      }

      return prev.map(s => {
        const role = getCanonicalRole(s.role);
        if (role === 'SL' || role === 'SR') {
          const targetX = role === 'SL' ? xL : xR;
          const targetY = defaultY;

          // Cache this as the new default position
          const newDefaultPos = { x: targetX, y: targetY };
          return { ...s, defaultPosition: newDefaultPos, position: { ...s.position, x: targetX, y: targetY } };
        }
        return s;
      });
    });
  }, [onSetSpeakers, widthM, lengthM, sideSurroundVisualSpanM, getCanonicalRole]); // Use new widthM, lengthM

  useEffect(() => {
    window.addEventListener('b44:resetSideSurrounds', resetSideSurroundsToDefault);
    return () => {
      window.removeEventListener('b44:resetSideSurrounds', resetSideSurroundsToDefault);
    };
  }, [resetSideSurroundsToDefault]);

  // Expose functions so parent components can call them
  useImperativeHandle(ref, () => ({
    shiftSeatsToMaintainAngle,
    resetSideSurrounds: resetSideSurroundsToDefault,
    rebaseline: () => { setBaselineRp22(liveRp22); },
    hasBaseline: () => baselineRp22 !== null,
  }), [shiftSeatsToMaintainAngle, resetSideSurroundsToDefault, liveRp22, baselineRp22]);

  // LCR overlay event listener — extracted to hook
  useApplyLcrFromDetail({ onSetSpeakers, widthM, lengthM, getCanonicalRole });

  // Derived state: seat label sets
  const {
    rowFrontWallLabelSeatIds,
    rowDistanceLabelSeatIds,
  } = useRoomDerivedState({
    dolbyLayout,
    placedSpeakers,
    seatingPositions,
    speakerPositionsView,
    overlays: _overlays,
    appState,
    getCanonicalRole,
  });

  // MLPMarker is rendered by RvMlpMarker (see JSX below)
  const handleMlpMarkerMouseDown = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    handleMouseDown(e, 'mlp-marker-dot', 'mlpMarker');
  }, [handleMouseDown]);

  const MLPMarker = (
    <RvMlpMarker
      toPx={toPx}
      mlpDotX_m={mlpDotX_m}
      mlpDotY_m={mlpDotY_m}
      _overlays={_overlays}
      exportMode={exportMode}
      rspMode={rspMode}
      onMouseDown={handleMlpMarkerMouseDown}
    />
  );

  const canvasStyle = {
    margin: '0 auto',
    padding: '24px',
    width: '100%',
    maxWidth: 'none',
    overflow: 'hidden',
    position: 'relative'
  };

  const svgW = containerW;
  const svgH = containerH;


  const { renderLevelBadge, hudDynamicStyle } = useHudComputation({ isHudPinned, hudPinnedOffsetPx, hudHiddenWhenPinned });

  // RP22 overhead corridors: shown whenever overheads are present in the layout  
  const overheadCorridorsOn = overheadCount > 0;


// --- Main render ---
// SAFETY: local fallbacks in case parent metrics/ids are not initialised yet
const svgWSafe = Number(svgW) || Math.max(1, Number(roomRect?.width)  || 1200);
const svgHSafe = (Number(svgH) || Math.max(1, Number(roomRect?.height) || 800)) + BOTTOM_GUTTER_PX;
const idsGrid = (ids && ids.grid) ? ids.grid : 'b44_grid_fallback';
const idsClip = (ids && ids.clip) ? ids.clip : 'b44_clip_fallback';

  // Derive frontSubs and rearSubs: empty array when config is inactive
  const frontSubsActive = Array.isArray(frontSubs) && Number(frontSubsCfg?.count) > 0 && frontSubsCfg?.model;
  const rearSubsActive = Array.isArray(rearSubs) && Number(rearSubsCfg?.count) > 0 && rearSubsCfg?.model;
  const safeFrontSubs = frontSubsActive ? frontSubs : [];
  const safeRearSubs = rearSubsActive ? rearSubs : [];

  return (
      <RvPlanCanvas
        svgRef={svgRef}
        planBoundsRef={planBoundsRef}
        rvWrapRef={rvWrapRef}
        aspect={aspect}
        zoomMode={zoomMode}
        handlePlanClick={handlePlanClick}
        lastPointerRef={lastPointerRef}
        canvasStyle={canvasStyle}
        svgWSafe={svgWSafe}
        svgHSafe={svgHSafe}
        idsGrid={idsGrid}
        idsClip={idsClip}
        ids={ids}
        scale={scale}
        svgW={svgW}
        svgH={svgH}
        handleMouseMove={handleMouseMove}
        handleMouseUp={handleMouseUp}
        roomRect={roomRect}
        placedSpeakers={placedSpeakers}
        getCanonicalRole={getCanonicalRole}
        dolbyLayout={dolbyLayout}
        onPanPointerDown={onPanPointerDown}
        onPanPointerMove={onPanPointerMove}
        onPanPointerUp={onPanPointerUp}
        isPanningRef={isPanningRef}
        zoom={zoom}
        panX={panX}
        panY={panY}
        viewOffsetPx={viewOffsetPx}
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
        dragging={dragging}
        draggedItemId={draggedItemId}
        frontWideZones={frontWideZones}
        hasRoomRect={hasRoomRect}
        ZoneComponents={ZoneComponents}
        getDolbyZoneSpecs={getDolbyZoneSpecs}
        arcPathForBand={arcPathForBand}
        roomElements={roomElements}
        getSpeakerVisibility={getSpeakerVisibility}
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
        showThrowDistance={showThrowDistance || overlaysForRendering?.ROOM_DIMS === true}
        handleMouseDown={handleMouseDown}
        rowFrontWallLabelSeatIds={rowFrontWallLabelSeatIds}
        rowDistanceLabelSeatIds={rowDistanceLabelSeatIds}
        _overlays={_overlays}
        hudPinnedSeatId={null}
        handleSeatMouseEnter={handleSeatMouseEnter}
        handleSeatMouseLeave={handleSeatMouseLeave}
        handleSeatClick={handleSeatClick}
        clampMlpY={clampMlpY}
        MLPMarker={MLPMarker}
        overheadIconElements={overheadIconElements}
        aimAtMLP={aimAtMLP}
        aimFrontWidesAtMLP={aimFrontWidesAtMLP}
        aimSideSurroundsAtMLP={aimSideSurroundsAtMLP}
        aimRearSurroundsAtMLP={aimRearSurroundsAtMLP}
        lcrAngleInfo={lcrAngleInfo}
        bedLayerSpeakerMouseDownHandler={bedLayerSpeakerMouseDownHandler}
        onSpeakerAimToggle={handleBedLayerSpeakerAimToggle}
        handleIconEnter={handleIconEnter}
        handleIconMove={handleIconMove}
        handleIconLeave={handleIconLeave}
        effectiveHoveredSeat={effectiveHoveredSeat}
        visiblePlanSpeakers={visiblePlanSpeakers}
        floorDeg={floorDeg}
        dragWarning={dragWarning}
        tooltip={tooltip}
        hoveredSpeaker={hoveredSpeaker}
        tooltipData={tooltipData}
        hudDynamicStyle={hudDynamicStyle}
        onHudHeaderMouseDown={onHudHeaderMouseDown}
        hudElRef={hudElRef}
        setHudHiddenWhenPinned={setHudHiddenWhenPinned}
        hudHiddenWhenPinned={hudHiddenWhenPinned}
        renderLevelBadge={renderLevelBadge}
        isHudPinned={isHudPinned}
        speakerTooltip={speakerTooltip}
        hudPosition={hudBasePosPx}
        subDragTick={subDragTick}
        lastValidDraftFrontSubs={_lastValidDraftFrontSubsRef.current}
        lastValidDraftRearSubs={_lastValidDraftRearSubsRef.current}
        dragImpact={{ baseline: baselineRp22, live: liveRp22, isActive: !!dragging }}
        liveImpactMode={liveImpactMode}
        roomElementDragInfo={roomElementDragInfo}
        dragType={dragType}
        isSeatSnapping={isSeatSnapping}
      />
  );
});