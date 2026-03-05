"use client";

import React, { useMemo, useCallback, useState, useRef, useImperativeHandle, useEffect, forwardRef } from "react";
import { Layers3, Compass } from "lucide-react";
import SeatHud from "@/components/room/SeatHud";
import RP22GradingPill from "@/components/ui/RP22GradingPill";
import { getSpeakerModelMeta, normaliseModelKey as registryNormaliseModelKey } from "@/components/models/speakers/registry";
import { rp23HorizontalAngleForSeat, verticalViewingAngleDeg } from "@/components/utils/seatHover";
import { isDraggable, clampSideSurroundDrag, clampRearSurroundDrag } from "@/components/utils/speakerUtils";
import { calibratedSplAtSeat, normalizeToRsp, p4DeltaAndLevel, euclideanDistance } from "@/components/utils/splMath";
import { rolesForLayout, getCanonicalRole } from "@/components/utils/surroundRoleMap";
import { calculateLcrConstraints } from "../room/constraints/lcrConstraints";
import { SCREEN_BUFFER_M, WALL_BUFFER_M } from "./constants/screenDepth";
import RP22ZonesOverlay from "@/components/room/RP22ZonesOverlay";
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
import RvMlpRuler from "@/components/room/rv/render/RvMlpRuler";
import { SURROUND_WALL_GAP_M, sideWallX, rearWallY, fixedSideX, OVERHEAD_PAIR_MAP, floorDeg, mirrorX, clampToSegment, resolveSymmetricLCR, computeMinimumScreenDepthM } from "@/components/room/rv/utils/rvGeometry";
import { getAimingYawDeg, getPlanAimDeg, getYawForObject } from "@/components/room/rv/utils/rvAiming";
import { useMlpCalculation } from "@/components/room/rv/hooks/useMlpCalculation";
import { useSpeakersByRole } from "@/components/room/rv/hooks/useSpeakersByRole";
import { useEntitiesById } from "@/components/room/rv/hooks/useEntitiesById";
import { useExportMinScreenDepth } from "@/components/room/rv/hooks/useExportMinScreenDepth";
import { useActualScreenFrontY } from "@/components/room/rv/hooks/useActualScreenFrontY";
import { useRoomCoordinateConverters } from "@/components/room/rv/hooks/useRoomCoordinateConverters";
import { useFrontWideZonesComputed } from "@/components/room/rv/hooks/useFrontWideZonesComputed";
import { useOverheadZonesComputed } from "@/components/room/rv/hooks/useOverheadZonesComputed";
import { usePanZoomHandlers } from "@/components/room/rv/hooks/usePanZoomHandlers";
import { useZoneComponents } from "@/components/room/rv/hooks/useZoneComponents";
import { useRenderFrontWideZones } from "@/components/room/rv/hooks/useRenderFrontWideZones";
import { getDolbyZoneSpecs } from "@/components/room/rv/utils/getDolbyZoneSpecs"; import { useVisiblePlanSpeakers } from "@/components/room/rv/hooks/useVisiblePlanSpeakers"; import { useOverheadIconElements } from "@/components/room/rv/hooks/useOverheadIconElements"; import { useSideSurroundVisualSpanM } from "@/components/room/rv/hooks/useSideSurroundVisualSpanM"; import { useSeatMetricsCacheEffect } from "@/components/room/rv/hooks/useSeatMetricsCacheEffect"; import { useMouseUpHandler } from "@/components/room/rv/hooks/useMouseUpHandler"; import { useMouseDownHandler } from "@/components/room/rv/hooks/useMouseDownHandler"; import { useSpeakerDragUpdate } from "@/components/room/rv/hooks/useSpeakerDragUpdate"; import { useRoomCanvasMouseMove } from "@/components/room/rv/hooks/useRoomCanvasMouseMove"; import { useSubDragHandler } from "@/components/room/rv/hooks/useSubDragHandler"; import { useSeatDragHandler } from "@/components/room/rv/hooks/useSeatDragHandler"; import { useFrontWideAutoPlacement } from "@/components/room/rv/hooks/useFrontWideAutoPlacement"; import { useAutoHugSurroundsToWalls } from "@/components/room/rv/hooks/useAutoHugSurroundsToWalls"; import { usePlanResizeObserver } from "@/components/room/rv/hooks/usePlanResizeObserver"; import { useHudComputation } from "@/components/room/rv/hooks/useHudComputation.js"; import { useSeatHoverLogic } from "@/components/room/rv/hooks/useSeatHoverLogic.js";
const rvSafeCanonRole = (role) => String(role || '').toUpperCase();

const rvIsOverheadRole = (role) => {
  const r = rvSafeCanonRole(role);
  switch (r) {
    case 'TFL':
    case 'TFR':
    case 'TML':
    case 'TMR':
    case 'TRL':
    case 'TRR':
    case 'TFC':
    case 'TRC':
    case 'TBC':
    case 'TL':
    case 'TR':
    case 'TBL':
    case 'TBR':
      return true;
    default:
      return false;
  }
};
// --- END OVERHEAD HELPERS ---

const degToRad = (deg) => (deg * Math.PI) / 180;

const rotatedHalfExtentToWall = (yawDeg, widthM_spk, depthM_spk, wallAxis /* "x" | "y" */) => {
  const halfW = Math.max(0, (Number(widthM_spk) || 0) / 2);
  const halfD = Math.max(0, (Number(depthM_spk) || 0) / 2);
  const a = Math.abs(Math.cos(degToRad(Number(yawDeg) || 0)));
  const b = Math.abs(Math.sin(degToRad(Number(yawDeg) || 0)));

  // wallAxis = "x" => left/right wall (normal is X)
  // wallAxis = "y" => front/back wall (normal is Y)
  return wallAxis === "x"
    ? (a * halfW + b * halfD)
    : (b * halfW + a * halfD);
};

// Legacy aliases for backward compatibility
const canonRoleRV = rvSafeCanonRole;
const isOverheadRole = rvIsOverheadRole;

// Compute horizontal seat band used to clamp overhead speakers
function getSeatBandXBounds(seats) {
  if (!Array.isArray(seats) || seats.length === 0) {
    return { minX: null, maxX: null };
  }

  const xs = seats
    .map(s => Number(s?.position?.x ?? s?.x))
    .filter(Number.isFinite);

  if (!xs.length) {
    return { minX: null, maxX: null };
  }

  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
  };
}

// local sideSegmentAtX — safe fallback if polygons are missing
function sideSegmentAtX(zonePolygonPoints, x, roomLength = 6.0) {
  const safeMinY = 0.5;
  const safeMaxY = Math.max(roomLength - 0.5, safeMinY + 0.1);

  if (!Array.isArray(zonePolygonPoints) || zonePolygonPoints.length < 3) {
    return { x, minY: safeMinY, maxY: safeMaxY, source: "fallback" };
  }

  try {
    const intersections = [];
    for (let i = 0; i < zonePolygonPoints.length; i++) {
      const p1 = zonePolygonPoints[i];
      const p2 = zonePolygonPoints[(i + 1) % zonePolygonPoints.length];

      if (!p1 || !p2 || typeof p1.x !== 'number' || typeof p1.y !== 'number' ||
          typeof p2.x !== 'number' || typeof p2.y !== 'number') continue;

      // intersect with vertical line at x (tolerant)
      if ((p1.x <= x + EPS && p2.x >= x - EPS) || (p1.x >= x - EPS && p2.x <= x + EPS)) {
        if (Math.abs(p1.x - p2.x) > EPS) {
          const t = (x - p1.x) / (p2.x - p1.x);
          const y = p1.y + t * (p2.y - p1.y);
          if (Number.isFinite(y) && t >= -EPS && t <= 1 + EPS) intersections.push(y);
        } else if (Math.abs(p1.x - x) < EPS) {
          intersections.push(p1.y, p2.y);
        }
      }
    }

    if (intersections.length >= 2) {
      return {
        x,
        minY: Math.min(...intersections),
        maxY: Math.max(...intersections),
        source: "poly"
      };
    }

    // fallback if nothing sensible found
    return { x, minY: safeMinY, maxY: safeMaxY, source: "fallback" };
  } catch {
    return { x, minY: safeMinY, maxY: safeMaxY, source: "fallback" };
  }
}

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
import { getLevelColors } from '@/components/utils/rp22Colors';
import { useTooltipData } from '@/components/room/hooks/useTooltipData';

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


// SAFE ROLE ACCESSOR – works with Map or plain object; always returns an array
function getByRoleArray(mapOrObj, role) {
  if (!mapOrObj || !role) return [];
  // If it's a Map, use .get()
  if (typeof mapOrObj.get === 'function') {
    return mapOrObj.get(role) || [];
  }
  // If it's a plain object (fallback in some cases), use direct property access
  return mapOrObj[role] || [];
};

// Front-channel role check (LCR + subs)
const isFrontObject = (role = "") => {
  const r = getCanonicalRoleGlobal(role);
  return r === "FL" || r === "FC" || r === "FR" || String(role).toUpperCase().includes("SUB");
};




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
  yHalfExtentM, yHalfExtentM_physical,
  targetMlpY57_5,
  SpeakerIcon,
  SpeakerRect,
} from "@/components/room/rv/RenderPrimitives";



// Physical (no stroke) half-extent along +/-Y for a rotated rectangle
const _yHalfExtentM_physical = (depthM, widthM, yawDeg = 0) => {
  const t = Math.abs((yawDeg || 0) * Math.PI / 180);
  return (depthM * 0.5) * Math.abs(Math.cos(t)) +
         (widthM * 0.5) * Math.abs(Math.sin(t));
};



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
    allSeatSplMetrics: allSeatSplMetricsProp = null,
    speakerPositionsView = 'off',
    showMlpRuler = false,
    zoomMode: zoomModeProp = 'off',
    onZoomModeChange,
    exportMode = 'default',
    exportWidthPx,
    exportHeightPx,
    freeMoveLcr = false,
  } = props;

  const appState = useAppState();
  const widthM  = Number(appState?.roomDims?.widthM)  || 4.5;
  const lengthM = Number(appState?.roomDims?.lengthM) || 6.0;
  const heightM = Number(appState?.roomDims?.heightM) || 2.4;
  const screenFrontPlaneM = Number(appState?.screenFrontPlaneM ?? 0);
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
  const ALLOW_AUTO_DIMENSIONS = false;
  const PLAN_TOP_PAD_PX = 60; // headroom for top dimension line + labels
  const BOTTOM_GUTTER_PX = 220; // ensures bottom speaker dimension lanes never clip

  const getModelDimsM = useCallback((modelName) => {
    const meta = getSpeakerModelMeta?.(modelName);
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
  }, []);

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

  const mlp = useMlpCalculation({
    mlpPoint,
    seatingPositions,
    mlpBasis,
    roomWidthM: widthM,
    roomLengthM: lengthM
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
  const [calculatedMinScreenDepthM, setCalculatedMinScreenDepthM] = useState(WALL_BUFFER_M + SCREEN_BUFFER_M);
  const lastCalcMinScreenDepthRef = React.useRef(null);
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
  // Absolute HUD position in canvas pixels (top-left of the HUD card)
const [hudBasePosPx, setHudBasePosPx] = useState(null);
  const hudPosition = hudBasePosPx;
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
    }
  }, [isHudPinned]);

  useEffect(() => {
    if (isHudPinned && hudPinnedOffsetPx == null) {
      setHudPinnedOffsetPx({ x: 24, y: 24 });
    }
  }, [isHudPinned, hudPinnedOffsetPx]);

  /* …rest of the component continues below… */


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
  if (!hudBasePosPx && !hudPosition) return;

  event.preventDefault();

  const startBase = hudBasePosPx || hudPosition || { x: 20, y: 20 };
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
}, [clampHudOffset, hudBasePosPx, hudPosition]);


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

  // NEW: Add a safe local fallback for buildRoleMap to prevent crashes
  // This local function will only be used if the external buildRoleMap fails or is not a function.
  // It ensures that 'byRole' is always a Map, compatible with getByRoleArray.
  const _safeBuildRoleMapFallback = (arr) => {
    const out = new Map();
    if (!arr) return out;
    for (const s of arr) {
      const canonical = getCanonicalRole(s?.role);
      if (canonical) {
        if (!out.has(canonical)) {
          out.set(canonical, []);
        }
        out.get(canonical).push(s);
      }
    }
    return out;
  };

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

  // ANGLE HELPERS — always aim at the current green-dot MLP (no other logic changed)
  const lcrAngleInfo = useMemo(() => {
    if (!aimAtMLP) return { L: 0, R: 0, averageAngle: 0, maxAbs: 0 };

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
  }, [aimAtMLP, placedSpeakers, mlpDotX_m, mlpDotY_m, getCanonicalRole]);

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

  // LIVE EMIT: recompute minimum screen depth whenever anything relevant changes
  useEffect(() => {
    // Filter and map front objects for the pure calculation function
    // Only include placedSpeakers (LCR) and frontSubs for screen depth calculation
    const frontObjectsToCalculate = [...(placedSpeakers || []), ...(frontSubs || [])]
      .filter(s => {
        const r = getCanonicalRole(s.role);
        return r === 'FL' || r === 'FC' || r === 'FR' || isSubRole(r);
      })
      .map(s => ({ // Map to relevant properties for the pure function
        model: s.model,
        role: s.role,
        position: s.position
      }));

    const calculatedValue = computeMinimumScreenDepthM({
      frontObjects: frontObjectsToCalculate,
      getDims: getModelDimsM,
      lcrAngles: { L: lcrAngleInfo.L, R: lcrAngleInfo.R },
      aimAtMLP: aimAtMLP,
    });

    // Guard: only update if value actually changed (prevent loops)
    const prev = lastCalcMinScreenDepthRef.current;
    if (typeof calculatedValue === "number" && typeof prev === "number") {
      const nextR = Math.round(calculatedValue * 1000) / 1000;
      const prevR = Math.round(prev * 1000) / 1000;
      if (nextR === prevR) return;
    }

    lastCalcMinScreenDepthRef.current = calculatedValue;
    setCalculatedMinScreenDepthM(calculatedValue);

  }, [
    placedSpeakers,
    frontSubs,
    aimAtMLP,
    lcrAngleInfo.L,
    lcrAngleInfo.R,
    screen?.visibleWidthInches,
    screen?.floatDepthM,
    getModelDimsM,
    mlpDotY_m,
    getCanonicalRole
  ]);

  const exportMinScreenDepthM = useExportMinScreenDepth({
    exportMode,
    placedSpeakers,
    frontSubs,
    aimAtMLP,
    lcrAngleInfo,
    screenVisibleWidthInches: screen?.visibleWidthInches,
    getModelDimsM,
    getCanonicalRole
  });

  // Effective min depth: export uses sync value (if available), live uses state (effect-driven)
  const effectiveMinScreenDepthM =
    (exportMode === 'dimensions' && Number.isFinite(exportMinScreenDepthM))
      ? exportMinScreenDepthM
      : calculatedMinScreenDepthM;

  const actualScreenFrontY = useActualScreenFrontY({
    effectiveMinScreenDepthM,
    screenFloatDepthM: screen?.floatDepthM,
    screenPlaneMode
  });

  // Publish screen front plane to AppState with guards (rounded to mm + change detection)
  const lastScreenFrontPlaneRef = React.useRef(null);
  
  useEffect(() => {
    if (!appState?.setScreenFrontPlaneM) return;
    if (!Number.isFinite(actualScreenFrontY)) return;

    // Round to mm to avoid jitter/loops
    const v = Math.round(actualScreenFrontY * 1000) / 1000;
    
    // Only update if value actually changed
    if (lastScreenFrontPlaneRef.current === v) return;
    lastScreenFrontPlaneRef.current = v;
    
    appState.setScreenFrontPlaneM(v);
  }, [actualScreenFrontY, appState?.setScreenFrontPlaneM]);


  // Define ZONE_DEPTH_M from live screen plane (component scope)
  const ZONE_DEPTH_M = useMemo(() => {
    const y = Number(actualScreenFrontY);
    const fallback = 0.30;
    const raw = Number.isFinite(y) ? y : fallback;
    // clamp between 0.10 m and 0.60 m to avoid absurd values but keep existing visuals
    return Math.max(0.10, Math.min(0.60, raw));
  }, [actualScreenFrontY]);

  // Push live plane up to RoomDesigner when it changes (debounced + change guard)
const screenSendTimerRef = React.useRef(null);
const lastSentScreenPlaneRef = React.useRef(null);

React.useEffect(() => {
  if (typeof onScreenPlaneChange !== 'function') return;
  if (!Number.isFinite(actualScreenFrontY)) return;

  // Round to 0.1mm to prevent float jitter
  const rounded = Math.round(actualScreenFrontY * 10000) / 10000;

  // If unchanged, skip update
  if (lastSentRef.current === rounded) return;

  // Debounce updates to prevent API overload (1 second)
  clearTimeout(screenSendTimerRef.current);
  screenSendTimerRef.current = setTimeout(() => {
    if (lastSentRef.current !== rounded) {
      lastSentRef.current = rounded;
      onScreenPlaneChange(rounded);
    }
  }, 1000);

  return () => clearTimeout(screenSendTimerRef.current);
}, [actualScreenFrontY, onScreenPlaneChange]);

// NEW: Publish live screen plane Y to screen object for Live Metrics (immediate, no debounce)
const lastSentScreenPlaneYRef = React.useRef(null);

React.useEffect(() => {
  if (typeof props.onScreenPlaneYChange !== 'function') return;
  if (!Number.isFinite(actualScreenFrontY)) return;

  // Round to mm to prevent jitter
  const rounded = Math.round(actualScreenFrontY * 1000) / 1000;
  
  // Only call if value actually changed
  if (lastSentScreenPlaneYRef.current === rounded) return;
  lastSentScreenPlaneYRef.current = rounded;
  
  props.onScreenPlaneYChange(rounded);
}, [actualScreenFrontY, props.onScreenPlaneYChange]);

  const TOP_GUTTER_PX = 150; // reserved space above room for dimension lines
  const SPEAKER_PLAN_TOP_GUTTER_PX = 90;
  const SPEAKER_PLAN_BOTTOM_GUTTER_PX = 120;
  const SPEAKER_PLAN_SIDE_GUTTER_PX = 90;
  
  const effectiveContainerW = Number.isFinite(Number(exportWidthPx))
    ? Number(exportWidthPx)
    : (Number.isFinite(containerW) ? containerW : 0);

  const effectiveContainerH = Number.isFinite(Number(exportHeightPx))
    ? Number(exportHeightPx)
    : (Number.isFinite(containerH) ? containerH : 0);

  const availW = effectiveContainerW - 2 * PADDING;
  const availH = effectiveContainerH - 2 * PADDING - TOP_GUTTER_PX;
  const scale = useMemo(() => {
    if (!Number.isFinite(availW) || !Number.isFinite(availH)) return null;
    if (availW <= 0 || availH <= 0) return null;
    if (!Number.isFinite(widthM) || !Number.isFinite(lengthM)) return null;
    if (widthM <= 0 || lengthM <= 0) return null;
    return Math.min(availW / widthM, availH / lengthM);
  }, [availW, availH, widthM, lengthM]);

  const roomRect = useMemo(() => {
    if (!Number.isFinite(scale)) return null;
    return {
      x: PADDING,
      y: PADDING + TOP_GUTTER_PX,
      width: widthM * scale,
      height: lengthM * scale,
    };
  }, [widthM, lengthM, scale]);

  const hasRoomRect = !!roomRect && Number.isFinite((roomRect?.x ?? 0)) && Number.isFinite((roomRect?.y ?? 0));

  const {
    toPx,
    meterToCanvasX,
    meterToCanvasY,
    canvasToRoom,
    roomToCanvas
  } = useRoomCoordinateConverters({
    roomRect,
    scale,
    viewOffsetPx
  });


  // Calculate MLP position for use in zones, now from the internally derived MLP
  const { mlpPxX, mlpPxY, midX_m, mlpY_m } = useMemo(() => {
    const [_mlpPxX, _mlpPxY] = toPx(mlp.x, mlp.y);
    return { mlpPxX: _mlpPxX, mlpPxY: _mlpPxY, midX_m: mlp.x, mlpY_m: mlp.y };
  }, [mlp, toPx]);

  // Memo for the valid Y-range for the *center* of SL/SR speakers — extracted to hook
  const sideSurroundVisualSpanM = useSideSurroundVisualSpanM({ mlpY_m, seatingPositions, placedSpeakers, getModelDimsM, lengthM, getCanonicalRole });

  // Initialize rear mode once (safe guard on mount or when speakers appear)
  React.useEffect(() => {
    const sbl = placedSpeakers.find(s => getCanonicalRole(s.role) === 'SBL');
    if (!sbl) {
      // Rear surrounds not yet hydrated; skip rear mode init this pass
      return;
    }
    const L = lengthM || 0;
    if (!(L > 0)) return;

    // Inlined logic for decideRearMode
    const yMn = Number(sideSurroundVisualSpanM?.minY) || 0;
    const yMx = Math.max(yMn, Math.min(Number(sideSurroundVisualSpanM?.maxY) || 0, L - CORNER_CLEAR_M));
    const hys = BACKWALL_HYSTERESIS_M;
    const py = Number(sbl?.position?.y) || 0;
    rearModeRef.current = py > (yMx + hys) ? 'back' : 'side';
  }, [placedSpeakers, lengthM, sideSurroundVisualSpanM?.minY, sideSurroundVisualSpanM?.maxY, getCanonicalRole]);

  // Bounds for side surround speaker placement (in room-meter coordinates)
  // This memo seems to be for fixed side speakers (like SBL/SBR, RL, RW, LW)
  // which is distinct from the draggable SL/SR.
  const sideSurroundBounds = useMemo(() => {
    return {
      left: {
        yMin: Math.max(0, mlpY_m - FADE_LEN_M),
        yMax: lengthM,
      },
      right: {
        yMin: Math.max(0, mlpY_m - FADE_LEN_M),
        yMax: lengthM,
      }
    };
  }, [mlpY_m, lengthM]);

  // Visual X lanes for SBL/SBR centers, matching the back-wall overlay
  const rearSurroundVisualLanes = React.useMemo(() => {
    const roomWidth = widthM || 0;
    const FADE_LEN_M = 0.50;
    return computeRearVisualLanes(roomWidth, seatingPositions, FADE_LEN_M);
  }, [widthM, seatingPositions]);

  // NEW: Define specific corridor zones for SBL/SBR
  const rearSurroundZones = useMemo(() => {
    const W = widthM || 4.5;
    const L = lengthM || 6.0;

    // Side bands (along Y on side walls)
    // These should start behind the primary seating area, perhaps from mlpY_m + a buffer,
    // and extend towards the back wall, respecting corner clearance.
    // A reasonable start for SBL/SBR on side walls could be from the max Y of SL/SR, or a fixed percentage.
    const sideY1 = Math.max(mlpY_m + FADE_LEN_M, L * 0.60);
    const sideY2 = L - WALL_BUFFER_M - CORNER_CLEAR_M;

    // Rear band (along X on back wall)
    // This should use the rearSurroundVisualLanes already computed, which respect seating positions.
    const rearX1 = rearSurroundVisualLanes.left.minX;
    const rearX2 = rearSurroundVisualLanes.right.maxX;
    const rearY = L - WALL_BUFFER_M;

    return {
      leftSideBand: { y1: sideY1, y2: sideY2 },
      rightSideBand: { y1: sideY1, y2: sideY2 },
      rearBand: { x1: rearX1, x2: rearX2, y: rearY },
    };
  }, [widthM, lengthM, mlpY_m, rearSurroundVisualLanes, FADE_LEN_M, WALL_BUFFER_M, CORNER_CLEAR_M]);

  // Enhanced clampToSideBand with wall offset support
  const clampToSideBand = useCallback((speaker, proposedRoomX_m, proposedRoomY_m, wallOffsetM = 0) => {
    const canonicalRole = getCanonicalRole(speaker.role);
    // This function is specifically for SBL/SBR/RL/RW/LW. SL/SR handle their own clamping.
    if (!["RL", "LW", "RW"].includes(canonicalRole)) return { x: proposedRoomX_m, y: proposedRoomY_m };

    const isLeft = ["RL", "LW"].includes(canonicalRole);
    const bandBounds = sideSurroundBounds[isLeft ? "left" : "right"];
    if (!bandBounds) return { x: proposedRoomX_m, y: proposedRoomY_m };

    // Resolve model for accurate dimensions
    // Use speaker.model directly as getModelDimsM will resolve it
    const { widthM: wM, depthM: dM } = getModelDimsM(speaker.model);
    const speakerLongSideM = Math.max(wM, dM);
    const speakerShortSideM = Math.min(wM, dM);

    const roomWidth = widthM || 0;
    const roomLength = lengthM || 0;

    let clampedX = proposedRoomX_m;
    let clampedY = proposedRoomY_m;

    // X constraints with wall offset (in meters)
    if (isLeft) {
      const targetX = wallOffsetM + speakerShortSideM / 2;
      clampedX = targetX;
    }
    if (!isLeft) {
      const targetX = roomWidth - (wallOffsetM + speakerShortSideM / 2);
      clampedX = targetX;
    }

    // Y constraints within band bounds and room (in meters)
    const minY = Math.max(bandBounds.yMin, 0 + speakerLongSideM / 2);
    const maxY = Math.min(bandBounds.yMax, roomLength - speakerLongSideM / 2);
    clampedY = Math.max(minY, Math.min(maxY, proposedRoomY_m));

    return { x: clampedX, y: clampedY };
  }, [sideSurroundBounds, widthM, lengthM, getModelDimsM, getCanonicalRole]);

  // ----- Rear Surround corridor helpers (meters) -----
  // Using ZONE_DEPTH_M as the nominal band width for these specific corridors.
  const RS_BAND_W_M = ZONE_DEPTH_M;

  const lastSeatY_m = React.useMemo(() => {
    if (!Array.isArray(seatingPositions) || seatingPositions.length === 0) return mlp.y;
    const ys = (Array.isArray(seatingPositions) ? seatingPositions : [])
      .map(s => Number(s.x)) // Changed from Y to X as it is for corridor.
      .filter(Number.isFinite);
    return ys.length ? Math.max(...ys) : mlp.y;
  }, [seatingPositions, mlp.y]);

  const rsSideCorridor = React.useCallback((side, dims, spk) => {
    const WALL_BUFFER_M_LOCAL = 0.02;
    const CORNER_BUFFER_M_LOCAL = 0.20;

    const halfW = (Number(spk.widthM) || 0) / 2;
    const halfD = (Number(spk.depthM) || 0) / 2;
    const W = widthM || 4.5;
    const L = lengthM || 6.0;

    const x = side === 'left'
      ? (WALL_BUFFER_M_LOCAL + halfD)
      : (W - (WALL_BUFFER_M_LOCAL + halfD));

    const yMin = Math.max(lastSeatY_m + halfW, CORNER_BUFFER_M_LOCAL + halfW);
    const yMax = Math.min(L - RS_BAND_W_M - halfW, L - CORNER_BUFFER_M_LOCAL - halfW);

    return { x, yMin, yMax };
  }, [lastSeatY_m, RS_BAND_W_M, widthM, lengthM]);

  const rsRearCorridor = React.useCallback((side, dims, spk) => {
    const WALL_BUFFER_M_LOCAL = 0.02;
    const CORNER_BUFFER_M_LOCAL = 0.20;

    const halfW = (Number(spk.widthM) || 0) / 2;
    const halfD = (Number(spk.depthM) || 0) / 2;
    const W = widthM || 4.5;
    const L = lengthM || 6.0;

    const y = L - (WALL_BUFFER_M_LOCAL + halfD);

    const seatXs = (Array.isArray(seatingPositions) ? seatingPositions : [])
      .map(s => Number(s.x)).filter(Number.isFinite);
    const leftmostSeatX = seatXs.length ? Math.min(...seatXs) : W * 0.35;
    const rightmostSeatX = seatXs.length ? Math.max(...seatXs) : W * 0.65;

    const fadeM = 0.50;

    const xMinL = CORNER_BUFFER_M_LOCAL + halfW;
    const xMaxL = Math.max(xMinL, Math.min(leftmostSeatX + fadeM, W - CORNER_BUFFER_M_LOCAL) - halfW);

    const xMinR = Math.max(CORNER_BUFFER_M_LOCAL, rightmostSeatX - fadeM) + halfW;
    const xMaxR = W - (CORNER_BUFFER_M_LOCAL + halfW);

    return side === 'left'
      ? { y, xMin: xMinL, xMax: xMaxL }
      : { y, xMin: xMinR, xMax: xMaxR };
  }, [seatingPositions, widthM, lengthM]);

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
  });

  // Shared drag handler wrapper for all speakers (bed-layer and overhead)
  const bedLayerSpeakerMouseDownHandler = useCallback(
    (e, id) => handleMouseDown(e, id, "speaker"),
    [handleMouseDown]
  );

  // Zoom at point helper
  const zoomAtPoint = useCallback((newZoom, clientX, clientY) => {
    if (!planBoundsRef.current) return;
    
    const rect = planBoundsRef.current.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    
    // Keep world point under cursor fixed
    const worldX = (px - panX) / zoom;
    const worldY = (py - panY) / zoom;
    
    const newPanX = px - worldX * newZoom;
    const newPanY = py - worldY * newZoom;
    
    // Clamp pan to keep plan visible (at least 40px of roomRect within viewport)
    const MIN_VISIBLE = 40;
    const maxPanX = rect.width - MIN_VISIBLE;
    const minPanX = -rect.width + MIN_VISIBLE;
    const maxPanY = rect.height - MIN_VISIBLE;
    const minPanY = -rect.height + MIN_VISIBLE;
    
    setPanX(Math.max(minPanX, Math.min(maxPanX, newPanX)));
    setPanY(Math.max(minPanY, Math.min(maxPanY, newPanY)));
    setZoom(Math.max(0.5, Math.min(2.0, newZoom)));
  }, [zoom, panX, panY]);

  // Handle plan click for zoom
  const handlePlanClick = useCallback((e) => {
    if (zoomMode === 'off') return;
    
    // Don't zoom if clicking on draggable elements
    if (e.target.tagName === 'ellipse' || e.target.closest('[data-draggable]')) return;
    
    const step = 0.15;
    const newZoom = zoomMode === 'in' ? zoom + step : zoom - step;
    
    zoomAtPoint(newZoom, e.clientX, e.clientY);
  }, [zoomMode, zoom, zoomAtPoint]);

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
    if (!mlp || screen?.mountMode !== 'floating') return null;

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
    CORNER_CLEAR_M, BACKWALL_HYSTERESIS_M, SURROUND_WALL_GAP_M, SIDE_ALLOW_OVERHANG,
    WALL_BUFFER_M, EPS, timeNowMs,
  });

  // ── Layer 3: lightweight wrapper (~5 lines) ───────────────────────────────
  const handleSpeakerDrag = useCallback((speakerId, newCanvasPos) => {
    handleSpeakerDragUpdate(speakerId, newCanvasPos);
  }, [handleSpeakerDragUpdate]);

  const { handleSeatDrag } = useSeatDragHandler({ onSetSeatingPositions, canvasToRoom });

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
  });

  // Helper to commit draft sub positions to real state
  const commitDraftSubPositions = useCallback(() => {
    if (draftFrontSubsRef.current && onSetFrontSubs) {
      const positions = draftFrontSubsRef.current.map(s => ({ x: s.position.x }));
      onSetFrontSubs(prev => ({ ...prev, positions }));
    }
    if (draftRearSubsRef.current && onSetRearSubs) {
      const positions = draftRearSubsRef.current.map(s => ({ x: s.position.x }));
      onSetRearSubs(prev => ({ ...prev, positions }));
    }
  }, [onSetFrontSubs, onSetRearSubs]);

  // Sub drag — delegated to hook (instantiated here so commitDraftSubPositions is in scope)
  const { handleSubDrag } = useSubDragHandler({
    byId, canvasToRoom, widthM, lengthM, getModelDimsM,
    draggedSubTypeRef, draggedSubWallRef, draftFrontSubsRef, draftRearSubsRef,
    setSubDragTick, idleCommitTimerRef, commitDraftSubPositions,
  });

  const { handleMouseUp } = useMouseUpHandler({
    dragType, draggedItemId, byId, getCanonicalRole, overheadZones, onSetSpeakers,
    setDragState, setDragWarning, setTooltip, rsDragLockRef, isDraggingRearRef, isDraggingFW,
    isDraggingSubRef, isAnyDraggingRef, isDraggingSpeakerRef, dragOffsetRoomRef,
    draggedSubWallRef, draggedSubTypeRef, draftFrontSubsRef, draftRearSubsRef, idleCommitTimerRef,
    isDraggingRef: props.isDraggingRef,
    widthM, getModelDimsM, commitDraftSubPositions,
  });

  const handleSpeakerDragEnd = useCallback((role, newPosition) => {
    onSetSpeakers(prev => prev.map(s => (s.role === role ? { ...s, position: newPosition } : s)));
    setDraggingRole(null);
  }, [onSetSpeakers]);


  const mlpAnchorEffective = mlp;

  // Seat hover logic — delegated to hook
  const {
    hoveredSeat: _unused_hoveredSeat,
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
    Number.isFinite(Number(allSeatSplMetrics?.__rev)) ? Number(allSeatSplMetrics.__rev) : 0;
  const mlpX = Number.isFinite(Number(mlp?.x)) ? Number(mlp.x) : NaN;
  const mlpY = Number.isFinite(Number(mlp?.y)) ? Number(mlp.y) : NaN;
  const mlpZ = Number.isFinite(Number(mlp?.z)) ? Number(mlp.z) : NaN;
  const lcrL = Number.isFinite(Number(lcrAngleInfo?.L)) ? Number(lcrAngleInfo.L) : 0;
  const lcrR = Number.isFinite(Number(lcrAngleInfo?.R)) ? Number(lcrAngleInfo.R) : 0;

  useSeatMetricsCacheEffect({
    seatingPositions, placedSpeakers, widthM, lengthM, heightM,
    screenFrontPlaneM, screen, mlp, allSeatSplMetrics,
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

  // Auto-adjust LCR speakers on screen/zone changes
  // [B44] This effect is LCR-only; bed surrounds are not touched
  useEffect(() => {
    if (!onSetSpeakers || !constraintZones?.FL || !constraintZones?.FR) {
      return;
    }

    const flSpeaker = placedSpeakers.find(s => getCanonicalRole(s.role) === 'FL');
    if (!flSpeaker) return;

    // Use the current FL speaker position as the source of truth for re-calculation
    const { finalLeftX, finalRightX } = resolveSymmetricLCR({
      desiredX: flSpeaker.position.x,
      isLeft: true,
      screenCenterX: screenCenterX_m,
      leftZone: constraintZones.FL.clamp,
      rightZone: constraintZones.FR.clamp,
    });

    // Only update if positions have changed to avoid an infinite loop
    const frSpeaker = placedSpeakers.find(s => getCanonicalRole(s.role) === 'FR');
    const flNeedsUpdate = Math.abs((flSpeaker.position.x || 0) - finalLeftX) > EPS;
    const frNeedsUpdate = frSpeaker && Math.abs((frSpeaker.position.x || 0) - finalRightX) > EPS;

    if (flNeedsUpdate || frNeedsUpdate) {
      onSetSpeakers(prev => {
        return prev.map(s => {
          const role = getCanonicalRole(s.role);
          if (role === 'FL') {
            return { ...s, position: { ...(s.position || {}), x: finalLeftX } };
          }
          if (role === 'FR') {
            if (frSpeaker) {
              return { ...s, position: { ...(s.position || {}), x: finalRightX } };
            }
          }
          return s;
        });
      });
    }

  }, [constraintZones, screenCenterX_m, onSetSpeakers, placedSpeakers, getCanonicalRole]);

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
  });

  // [FC_CENTERLINE_LOCK] — Enforce FC always at room centerline
  useEffect(() => {
    if (!placedSpeakers?.length || !onSetSpeakers) return;

    let needsFix = false;
    const next = placedSpeakers.map(sp => {
      const role = getCanonicalRole(sp.role);
      if (role === 'FC') {
        const x = Number(sp.position?.x);
        if (!Number.isFinite(x) || Math.abs(x - centerX_m) > EPS_M) {
          needsFix = true;
          return {
            ...sp,
            position: { ...sp.position, x: centerX_m }
          };
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

  // In the scope where we work with speakers, add safe aliases
  const sl = placedSpeakers.find(s => getCanonicalRole(s.role) === 'SL');
  const sr = placedSpeakers.find(s => getCanonicalRole(s.role) === 'SR');
  const slSpeaker = sl || null;
  const srSpeaker = sr || null;

  // Filter and position speakers for rendering
  const speakersToRender = React.useMemo(() => {
    // Make sure we always have an array
    const base = Array.isArray(placedSpeakers) ? placedSpeakers : [];

    // Always skip LFE – it’s not drawn as a normal speaker
    const withoutLfe = base.filter((spk) => {
      const canonicalRole = getCanonicalRole(spk.role);
      return canonicalRole !== "LFE";
    });

    // CRITICAL: Speaker icons render based on system config, not overlay toggles.
    // Debug log to confirm LW/RW roles are present
    if (globalThis.__B44_LOGS) {
      const roles = withoutLfe.map(s => getCanonicalRole(s.role));
      console.log("[RV] roles present:", roles);
    }

    return withoutLfe;
  }, [placedSpeakers, appState?.visibleRoles, getCanonicalRole]);






  // Light diagnostics (temporary)
  if (appState_DBG_FW) {
    if (typeof console !== 'undefined') if (globalThis.__B44_LOGS) console.log(`[FrontWides] dolbyLayout: "${dolbyLayout}", enableFrontWides: ${enableFrontWides}, zones:`, frontWideZones);
  }







  // Get overhead count from dolbyLayout
  const overheadCount = useMemo(() => {
    if (!dolbyLayout) return 0;
    const parts = String(dolbyLayout).split('.');
    if (parts.length < 3) return 0;
    return parseInt(parts[2]) || 0;
  }, [dolbyLayout]);

  // [DISABLED] Legacy overhead creation hooks - no longer needed
  // Overheads are now created immediately when layout changes in RoomDesigner
  // These hooks were creating speakers on drag/zones toggle, which is no longer desired
  
  // useEnsureOverheadPairs - DISABLED
  // useOverheadAutoPlacement - DISABLED

  // Determine which overhead positions are visible
  const visibleOverheadPositions = useMemo(() => {
    const positions = [];
    if (overheadCount === 2) {
      positions.push('mid');
    } else if (overheadCount === 4) {
      positions.push('front', 'rear');
    } else if (overheadCount === 6) {
      positions.push('front', 'mid', 'rear');
    }
    return positions;
  }, [overheadCount]);

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


  // constants for seating block shift
  const TARGET_ANGLE_DEG = 57.5;
  const SAFETY_MARGIN_M = 0.05;

  // seating row helpers
  const findFrontRowY = useCallback((seats = []) => {
    if (!seats.length) return null;
    return Math.min(...seats.map(s => Number(s.y) || 0));
  }, []);

  const findBackRowY = useCallback((seats = []) => {
    if (!seats.length) return null;
    return Math.max(...seats.map(s => Number(s.y) || 0));
  }, []);

  // This function shifts all seats as a block to align the specified row (front or back)
  // with the target 57.5 degree MLP from the screen.
  const shiftSeatsToMaintainAngle = useCallback((mlpRefKey) => {
    // room + screen
    const roomLenM = lengthM || 6.0; // Use new lengthM
    // target MLP y (from front wall): now directly using the shared utility
    const targetMLP_Y = targetMlpY57_5(screen, 0);

    if (!Array.isArray(seatingPositions) || seatingPositions.length === 0) return;

    // find current MLP row y
    const currentRowY = (mlpRefKey === "BACK_ROW_CENTER")
      ? findBackRowY(seatingPositions)
      : findFrontRowY(seatingPositions);

    if (currentRowY == null) return;

    // compute delta to apply to ALL seats as a rigid block
    let deltaY = targetMLP_Y - currentRowY;

    // clamp block movement so we don't cross front/back walls
    const minY = Math.min(...seatingPositions.map(s => Number(s.y) || 0));
    const maxY = Math.max(...seatingPositions.map(s => Number(s.y) || 0));

    // after shifting, enforce bounds [SAFETY, roomLen - SAFETY]
    const newMinY = minY + deltaY;
    const newMaxY = maxY + deltaY;
    const minAllowed = SAFETY_MARGIN_M;
    const maxAllowed = roomLenM - SAFETY_MARGIN_M;

    if (newMinY < minAllowed) {
      deltaY += (minAllowed - newMinY);
    }
    if (newMaxY > maxAllowed) {
      deltaY -= (newMaxY - maxAllowed);
    }

    // apply translation
    onSetSeatingPositions?.((prev) =>
      (prev || []).map(s => ({
        ...s,
        y: (Number(s.y) || 0) + deltaY
      }))
    );
  }, [lengthM, screen, seatingPositions, onSetSeatingPositions, findFrontRowY, findBackRowY]); // Use new lengthM

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
      const dimsL = slSpeaker ? getSpeakerDims(slSpeaker.model) : { heightM: 0.2, depthM: 0.082 };
      const dimsR = srSpeaker ? getSpeakerDims(srSpeaker.model) : { heightM: 0.2, depthM: 0.082 };

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

  // Expose the shift function so parent components can call it
  useImperativeHandle(ref, () => ({
    shiftSeatsToMaintainAngle,
    resetSideSurrounds: resetSideSurroundsToDefault
  }), [shiftSeatsToMaintainAngle, resetSideSurroundsToDefault]);

  const applyLcrFromDetail = useCallback((detail) => {
    if (!detail || !onSetSpeakers) return;

    const W = widthM || 4.5; // Use new widthM
    const L = lengthM || 6.0; // Use new lengthM

    const coords = detail.coords || {};
    const speakers = detail.speakers || {};

    // coords are normalized [0..1]; convert to room metres
    const toRoom = (p) => (!p ? { x: W * 0.5, y: 0.03 * L } : { x: (p.x || 0.5) * W, y: (p.y || 0.03) * L });

    const Lpos = toRoom(coords.L);
    const Cpos = toRoom(coords.C);
    const Rpos = toRoom(coords.R);

    const Lmodel = speakers.L || "";
    const Cmodel = speakers.C || "";
    const Rmodel = speakers.R || "";

    // Build or merge FL/FC/FR entries; keep all other speakers/subs as-is
    onSetSpeakers((prev = []) => {
      // Filter out existing LCR speakers using canonical roles for robustness
      const keep = prev.filter(s => !["FL", "FC", "FR"].includes(getCanonicalRole(s.role)));

      const next = [
        { id: "auto-fl", role: "FL", model: Lmodel, position: { x: Lpos.x, y: Lpos.y } },
        { id: "auto-fc", role: "FC", model: Cmodel, position: { x: Cpos.x, y: Cpos.y } },
        { id: "auto-fr", role: "FR", model: Rmodel, position: { x: Rpos.x, y: Rpos.y } },
      ];

      return [...keep, ...next];
    });
  }, [onSetSpeakers, widthM, lengthM, getCanonicalRole]); // Use new widthM, lengthM

  // Listen for LCR events and expose a direct hook
  useEffect(() => {
    const handler = (e) => applyLcrFromDetail(e?.detail);
    window.addEventListener("b44:overlay:setLCR", handler);

    // Optional direct hook: window.Base44Overlay.setLCR = applyLcrFromDetail
    try {
      window.Base44Overlay = window.Base44Overlay || {};
      window.Base44Overlay.setLCR = applyLcrFromDetail;
    } catch (e) {
      if (typeof console !== 'undefined') if (globalThis.__B44_LOGS) if (globalThis.__B44_LOGS) if (globalThis.__B44_LOGS) console.error("Failed to attach Base44Overlay.setLCR:", e);
    }

    return () => {
      window.removeEventListener("b44:overlay:setLCR", handler);
      try {
        if (window.Base44Overlay && window.Base44Overlay.setLCR === applyLcrFromDetail) {
          delete window.Base44Overlay.setLCR;
        }
      } catch (e) {
        if (typeof console !== 'undefined') if (globalThis.__B44_LOGS) if (globalThis.__B44_LOGS) if (globalThis.__B44_LOGS) console.error("Failed to detach Base44Overlay.setLCR:", e);
      }
    };
  }, [applyLcrFromDetail]);

  const lastRvLogSigRef = React.useRef(null);

  // Memo: speakers that are actually rendered as icons (single source of truth for overlays/metrics)
  const visiblePlanSpeakers = useVisiblePlanSpeakers({ placedSpeakers, getCanonicalRole, getSpeakerVisibility, appState, dolbyLayout });

  // Removed: renderSpeakers function (now RvSpeakerLayer component)

  // Renders rear subwoofers using SpeakerRect
  const renderSubwoofers = React.useCallback(() => {
    if (!hasRoomRect) return null;

    const subsToRender = Array.isArray(rearSubs) ? rearSubs : [];
    if (!subsToRender.length) return null;
    return (
      <g data-layer="rear-subwoofers">
        {subsToRender.map((sub, i) => {
          if (!hasPos(sub)) return null;
          const { widthM, depthM } = getModelDimsM(sub.model);
          const subId = sub.id || `rear-sub-${i}`;
          
          const [cx, cy] = toPx(sub.position.x, sub.position.y);
          const w = widthM * scale;
          const d = depthM * scale;
          
          const handlePointerDown = (e) => {
            e.preventDefault();
            e.stopPropagation();
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch (err) {}
            handleMouseDown(e, subId, 'sub');
          };
          
          const handlePointerMove = (e) => {
            if (!dragging || draggedItemId !== subId) return;
            e.preventDefault();
            e.stopPropagation();
            handleMouseMove(e);
          };
          
          const handlePointerUp = (e) => {
            e.preventDefault();
            e.stopPropagation();
            try {
              e.currentTarget.releasePointerCapture(e.pointerId);
            } catch (err) {}
            handleMouseUp(e);
          };
          
          return (
            <g
              key={subId}
              style={{ cursor: dragging && draggedItemId === subId ? 'grabbing' : 'grab', pointerEvents: 'all' }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            >
              <rect
                x={cx - w / 2}
                y={cy - d / 2}
                width={w}
                height={d}
                fill="transparent"
                pointerEvents="all"
              />
              <SpeakerRect
                speaker={sub}
                widthM={widthM}
                depthM={depthM}
                opacity={0.8}
                scale={scale}
                toPx={toPx}
                pointerEvents="none"
              />
            </g>
          );
        })}
      </g>
    );
  }, [rearSubs, getModelDimsM, scale, toPx, handleMouseDown, handleMouseMove, handleMouseUp, dragging, draggedItemId]);

  // Renders speaker labels. Not implemented in the original code, so a placeholder.
  const renderSpeakerLabels = useCallback(() => {
    return <g data-layer="speaker-labels"></g>;
  }, []);

  // --- Row front-wall distance labels (only for Speaker Positions plan) ---
  const rowFrontWallLabelSeatIds = useMemo(() => {
    if (speakerPositionsView !== 'plan') return new Set();
    if (!Array.isArray(seatingPositions) || seatingPositions.length === 0) return new Set();
    
    // Cluster seats into rows (same logic as SpeakerPositionsOverlay)
    const allSeatsWithY = seatingPositions
      .map(s => ({ seat: s, y: Number(s?.y ?? s?.position?.y ?? 0) }))
      .filter(item => Number.isFinite(item.y))
      .sort((a, b) => a.y - b.y);
    
    const rows = [];
    for (const item of allSeatsWithY) {
      const lastRow = rows[rows.length - 1];
      if (!lastRow || Math.abs(item.y - lastRow.y) > 0.20) {
        rows.push({ y: item.y, seats: [item.seat] });
      } else {
        lastRow.seats.push(item.seat);
      }
    }
    
    // For each row, pick one seat to label (center or left-of-center)
    const labeledSeatIds = new Set();
    for (const row of rows) {
      const sortedByX = row.seats
        .map(s => ({ seat: s, x: Number(s?.x ?? s?.position?.x ?? 0) }))
        .filter(item => Number.isFinite(item.x))
        .sort((a, b) => a.x - b.x);
      
      if (sortedByX.length === 0) continue;
      
      const count = sortedByX.length;
      const chosenIndex = count % 2 === 1 
        ? Math.floor(count / 2) 
        : (count / 2 - 1);
      
      const chosenSeat = sortedByX[chosenIndex]?.seat;
      if (chosenSeat?.id) labeledSeatIds.add(chosenSeat.id);
    }
    
    return labeledSeatIds;
  }, [speakerPositionsView, seatingPositions]);

  // --- Row distance labels (ROOM_DIMS overlay) - furthest-right seat per row ---
  const rowDistanceLabelSeatIds = useMemo(() => {
    if (!_overlays?.ROOM_DIMS) return new Set();
    if (!Array.isArray(seatingPositions) || seatingPositions.length === 0) return new Set();
    
    // Cluster seats into rows
    const allSeatsWithY = seatingPositions
      .map(s => ({ seat: s, y: Number(s?.y ?? s?.position?.y ?? 0) }))
      .filter(item => Number.isFinite(item.y))
      .sort((a, b) => a.y - b.y);
    
    const rows = [];
    for (const item of allSeatsWithY) {
      const lastRow = rows[rows.length - 1];
      if (!lastRow || Math.abs(item.y - lastRow.y) > 0.20) {
        rows.push({ y: item.y, seats: [item.seat] });
      } else {
        lastRow.seats.push(item.seat);
      }
    }
    
    // For each row, pick the furthest-right seat
    const labeledSeatIds = new Set();
    for (const row of rows) {
      const sortedByX = row.seats
        .map(s => ({ seat: s, x: Number(s?.x ?? s?.position?.x ?? 0) }))
        .filter(item => Number.isFinite(item.x))
        .sort((a, b) => b.x - a.x); // Descending - furthest right first
      
      if (sortedByX.length === 0) continue;
      
      const furthestRight = sortedByX[0]?.seat;
      if (furthestRight?.id) labeledSeatIds.add(furthestRight.id);
    }
    
    return labeledSeatIds;
  }, [_overlays?.ROOM_DIMS, seatingPositions]);

  // MLP marker: always draw at computed MLP (mlpDotX_m, mlpDotY_m),
  // never snap horizontally to a specific seat.
  const MLPMarker = useMemo(() => {
    if (!Number.isFinite(mlpDotX_m) || !Number.isFinite(mlpDotY_m)) {
      return null;
    }

    const [x, y] = toPx(mlpDotX_m, mlpDotY_m);

    return (
      <g data-testid="mlp-marker">
        <circle
          cx={x}
          cy={y}
          r={4}
          fill="#22c55e"
          stroke="#ffffff"
          strokeWidth={2}
          opacity={0.9}
        />
        {_overlays?.ROOM_DIMS && exportMode !== 'dimensions' && (
          <text
            x={x}
            y={y + 36}
            textAnchor="middle"
            fontSize={12}
            fontWeight={600}
            fill="#22c55e"
            pointerEvents="none"
          >
            RSP
          </text>
        )}
      </g>
    );
  }, [toPx, mlpDotX_m, mlpDotY_m, _overlays?.ROOM_DIMS]);


  const containerStyle = {
    position: 'relative',
    width: '100%',
    aspectRatio: aspect,
    maxHeight: 'none',
    border: '1px solid #DCDBD6',
    borderRadius: '88px',
    backgroundColor: '#F8F8F7',
    overflow: 'hidden',
  };

  const canvasStyle = {
    margin: '0 auto',
    padding: '24px',
    width: '100%',
    maxWidth: 'none',
    overflow: 'hidden',
    position: 'relative'
  };

  const containerRect = planBoundsRef.current?.getBoundingClientRect(); // Changed from containerRef

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
      globalThis={globalThis}
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
      frontFallback={frontFallback}
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
      frontSubs={frontSubs}
      rearSubs={rearSubs}
      frontSubsCfg={frontSubsCfg}
      rearSubsCfg={rearSubsCfg}
      handleMouseDown={handleMouseDown}
      hasPos={hasPos}
      rowFrontWallLabelSeatIds={rowFrontWallLabelSeatIds}
      rowDistanceLabelSeatIds={rowDistanceLabelSeatIds}
      _overlays={_overlays}
      hudPinnedSeatId={hudPinnedSeatId}
      handleSeatMouseEnter={handleSeatMouseEnter}
      handleSeatMouseLeave={handleSeatMouseLeave}
      handleSeatClick={handleSeatClick}
      clampMlpY={clampMlpY}
      MLPMarker={MLPMarker}
      overheadIconElements={overheadIconElements}
      renderSpeakers={renderSpeakers}
      renderSpeakerLabels={renderSpeakerLabels}
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
      speakerTooltip={speakerTooltip}
    />
  );
});