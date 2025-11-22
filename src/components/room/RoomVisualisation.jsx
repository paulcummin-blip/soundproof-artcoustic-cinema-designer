"use client";

import React, { useMemo, useCallback, useState, useRef, useImperativeHandle, useEffect, forwardRef } from "react";
import { Layers3, Compass } from 'lucide-react';
import { getSpeakerModelMeta } from "@/components/models/speakers/registry";
import {
  rp23HorizontalAngleForSeat,
  verticalViewingAngleDeg,
} from '@/components/utils/seatHover';
import { buildRoleMap, isDraggable, clampSideSurroundDrag, clampRearSurroundDrag } from "@/components/utils/speakerUtils";
import { calibratedSplAtSeat, normalizeToRsp, p4DeltaAndLevel, euclideanDistance } from "@/components/utils/splMath";
import { calculateLcrConstraints } from '../room/constraints/lcrConstraints';
import { SCREEN_BUFFER_M, WALL_BUFFER_M } from "./constants/screenDepth";
import RP22ZonesOverlay from '@/components/room/RP22ZonesOverlay';
import { resolveSurroundModel } from "@/components/utils/speakerModelResolver";
import BackSweepOverlay from "./BackSweepOverlay";
import { useAppState } from "@/components/AppStateProvider";
import { timeNowMs } from "@/components/utils/timeNow";
import { computeFrontWideZonesStrict } from '@/components/utils/frontWideZones';
import { computeMLPAndPrimary } from '@/components/utils/computeMLPAndPrimary';
import { pickMLP } from '@/components/utils/seatingUtils';
import { calculateViewingAngle, rp23LevelForAngleDeg } from '@/components/utils/viewingAngleUtils';
import CanvasMessages from '@/components/room/CanvasMessages';
import ZoomButtons from '@/components/ui/ZoomButtons';
import { computeOverheadZones, renderOverheadBandsSVG } from '@/components/room/overlays/OverheadZones';
import { clampOverheadToZone, clampSymmetricOverheadPair, clampOverheadPairPosition } from '@/components/utils/overheadDragClamping';
import { useOverheadAutoPlacement } from '@/components/hooks/useOverheadAutoPlacement';
import { useEnsureOverheadPairs } from '@/components/hooks/useEnsureOverheadPairs';
import FrontSubsLayer from "@/components/room/overlays/FrontSubsLayer";
import PlanMessages from '@/components/room/PlanMessages';
import SvgDefs from '@/components/room/SvgDefs';

// local shim for fixedSideX — guaranteed available in this file
const fixedSideX = (roomWidth, dims, side, wallBufferM = WALL_BUFFER_M) => {
  const halfDepth = (dims?.depthM ?? 0.082) / 2;
  if (side === 'L') return wallBufferM + halfDepth;
  if (side === 'R') return roomWidth - (wallBufferM + halfDepth);
  return 0;
};

// Overhead speaker L/R pair map
const OVERHEAD_PAIR_MAP = {
  TFL: 'TFR',
  TFR: 'TFL',
  TL:  'TR',
  TR:  'TL',
  TML: 'TMR',
  TMR: 'TML',
  TBL: 'TBR',
  TBR: 'TBL',
};

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

// New mirror-lock helpers for LCR
const mirrorX = (x, cx) => 2 * cx - x;
const clampToSegment = (x, seg) => Math.max(seg.minX, seg.maxX === undefined ? x : Math.min(seg.maxX, x));

/**
 * Orchestrates the symmetrical clamping of LCR speakers.
 * Takes a desired position for one speaker and returns the final,
 * valid, and symmetrical positions for both.
*/
function resolveSymmetricLCR({ desiredX, isLeft, screenCenterX, leftZone, rightZone }) {
  if (!leftZone || !rightZone) {
    // If zones are not defined, perform basic mirroring without clamping
    const finalLeftX = isLeft ? desiredX : mirrorX(desiredX, screenCenterX);
    const finalRightX = isLeft ? mirrorX(desiredX, screenCenterX) : desiredX;
    return { finalLeftX, finalRightX };
  }

  // Determine which position is for which zone based on the dragged speaker
  const desiredLeftX = isLeft ? desiredX : mirrorX(desiredX, screenCenterX);
  const desiredRightX = isLeft ? mirrorX(desiredX, screenCenterX) : desiredX;

  // Tentatively clamp both to their zones
  let finalLeftX = clampToSegment(desiredLeftX, leftZone);
  let finalRightX = clampToSegment(desiredRightX, rightZone);

  // If clamping occurred on either side, we must re-enforce symmetry
  const leftClamped = finalLeftX !== desiredLeftX;
  const rightClamped = finalRightX !== desiredRightX;

  if (leftClamped || rightClamped) {
    // Determine the offset from the center for each clamped position
    const leftOffset = Math.abs(screenCenterX - finalLeftX);
    const rightOffset = Math.abs(finalRightX - screenCenterX);

    // The final offset must be the smaller of the two to keep both speakers inside their zones
    const finalOffset = Math.min(leftOffset, rightOffset);

    // Recalculate final positions based on the smallest valid offset
    finalLeftX = screenCenterX - finalOffset;
    finalRightX = screenCenterX + finalOffset;
  }

  return { finalLeftX: finalLeftX, finalRightX: finalRightX };
}


import {
  isSubRole,
  hasPos,
  isRenderableSpeaker,
  getChannelColor,
  normaliseModelKey,
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

// NEW: Helper function to compute yaw angle for a speaker
const getYawForObject = (speaker, lcrAngles, aimAtMLP, dimensions, getModelDimsM) => {
  if (!speaker) return 0;
  const role = String(speaker.role || '').toUpperCase();
  const W = Number(dimensions?.width) || 0;
  const L = Number(dimensions?.length) || 0;

  // 1) LCR: use precomputed angles when aiming at MLP (rotation only, no position move)
  if (aimAtMLP && (role === 'FL' || role === 'L')) return -(Number(lcrAngles?.L) || 0);
  if (aimAtMLP && (role === 'FR' || role === 'R')) return -(Number(lcrAngles?.R) || 0);
  if (role === 'FC' || role === 'C') return 0;

  // 2) Side/Rear surrounds must sit FLAT to the wall
  // Side wall: long edge vertical (±90). Back wall: long edge horizontal (0).
  const pos = speaker.position || {};
  const dims = getModelDimsM?.(speaker.model) || {};
  const halfDepth = (Number(dims.depthM) || 0.082) / 2;
  const leftX  = 0.05 + halfDepth;
  const rightX = (W ? (W - 0.05 - halfDepth) : NaN);
  const onLeftWall  = Number.isFinite(pos.x) && Math.abs(pos.x - leftX)  <= 0.035;
  const onRightWall = Number.isFinite(pos.x) && Math.abs(pos.x - rightX) <= 0.035;
  const onBackWall  = Number.isFinite(pos.y) && Math.abs(pos.y - (L - (0.05 + halfDepth))) <= 0.035;

  if (['SL', 'SR', 'LW', 'RW', 'SBL', 'SBR'].includes(role)) {
    // Side walls: speaker long edge along the wall, facing into room
    if (onLeftWall)  return +90;
    if (onRightWall) return -90;

    // Back wall: long edge across the back wall, facing forward
    if (onBackWall)  return 0;
  }

  // 3) Overheads/wides and anything else default to 0°
  return 0;
};

// Physical (no stroke) half-extent along +/-Y for a rotated rectangle
const _yHalfExtentM_physical = (depthM, widthM, yawDeg = 0) => {
  const t = Math.abs((yawDeg || 0) * Math.PI / 180);
  return (depthM * 0.5) * Math.abs(Math.cos(t)) +
         (widthM * 0.5) * Math.abs(Math.sin(t));
};

// NEW: pure function to compute the minimum screen depth in meters
function computeMinimumScreenDepthM({
  frontObjects = [],
  getDims,
  lcrAngles = { L: 0, R: 0 },
  aimAtMLP = false,
}) {
  if (!frontObjects.length) return WALL_BUFFER_M + SCREEN_BUFFER_M;

  const neededEach = frontObjects.map((s) => {
    // resolveSurroundModel is called inside getYawForObject. Here, just pass s.model
    const dims = getDims(s.model) || {};
    const widthM = Number(dims.widthM) || 0;
    const depthM = Number(dims.depthM) || 0;

    // subs are drawn round / not yawed; FC stays 0°
    const canonicalRole = getCanonicalRoleGlobal(s.role);
    const yawDeg = (canonicalRole === "FL")
      ? lcrAngles.L
      : (canonicalRole === "FR")
        ? lcrAngles.R
        : 0; // FC and subs remain 0 yaw for depth calculation

    // total projected Y depth of the box = 2 * half-extent
    const half = _yHalfExtentM_physical(depthM, widthM, yawDeg);
    const projectedY = 2 * half;

    // hard planes: wall (y=0) + screen plane
    return WALL_BUFFER_M + projectedY + SCREEN_BUFFER_M;
  });

  // the screen must clear the *deepest* front object
  return Math.max(...neededEach, WALL_BUFFER_M + SCREEN_BUFFER_M);
}

export default forwardRef(function RoomVisualisation(props, ref) {
  const {
    analysisResult,
    placedSpeakers = [],
    onSetSpeakers,
    onSetSeatingPositions,
    overlays: _overlays = {},
    sideLinked = false,
    seatingPositions = [],
    mlpPoint,
    roomElements = [],
    frontSubs = [],
    rearSubs = [],
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

  const centerX_m = widthM / 2;
  const clampY = (y) => Math.max(0.05, Math.min(lengthM - 0.05, Number(y) || 0));
  const EPS_M = 0.0005;
  const ALLOW_AUTO_DIMENSIONS = false;

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

  const MLP_calculated = React.useMemo(() => {
    // 1. If RoomDesigner sends an mlpPoint, trust it.
    //    That is your 57.5° / screen-based ideal.
    if (
      mlpPoint &&
      Number.isFinite(mlpPoint.x) &&
      Number.isFinite(mlpPoint.y)
    ) {
      return {
        x: Number(mlpPoint.x), // Use mlpPoint.x directly
        y: clampMlpY(Number(mlpPoint.y)),
        z: Number.isFinite(mlpPoint.z) ? Number(mlpPoint.z) : 1.2,
      };
    }

    // 2. If no mlpPoint, we FALL BACK to seats to choose something sensible.
    if (Array.isArray(seatingPositions) && seatingPositions.length > 0) {
      let picked = null;

      try {
        if (typeof pickMLP === 'function') {
          picked = pickMLP(mlpBasis || 'all', seatingPositions);
        }
      } catch (err) {
        console.error('pickMLP failed in RoomVisualisation:', err);
        picked = null;
      }

      if (picked && Number.isFinite(picked.x) && Number.isFinite(picked.y)) {
        return {
          x: Number(picked.x), // Use picked.x directly
          y: clampMlpY(Number(picked.y)),
          z: Number.isFinite(picked.z) ? Number(picked.z) : 1.2,
        };
      }
    }

    // 3. Last-resort fallback: middle of room, ~60% back
    const cx = roomWidthM > 0 ? roomWidthM / 2 : 0;
    const fy = clampMlpY(roomLengthM > 0 ? roomLengthM * 0.58 : 3);
    return { x: cx, y: fy, z: 1.2 };
  }, [mlpPoint, seatingPositions, mlpBasis, roomWidthM, roomLengthM]);

  const mlp = MLP_calculated;
  const mlpDotX_m = mlp.x;
  const mlpDotY_m = mlp.y;
  const mlpDotZ_m = mlp.z;

  const [hoveredSpeaker, setHoveredSpeaker] = useState(null);
  const [tooltip, setTooltip] = useState({ show: false, text: '' });
  const [dragState, setDragState] = useState({ dragging: false, draggedItemId: null, dragType: null });
  const { dragging, draggedItemId, dragType } = dragState;
  const [draggingRole, setDraggingRole] = useState(null);
  const [hasManualOverheadEdit, setHasManualOverheadEdit] = useState(false);
  const [dragWarning, setDragWarning] = useState({ show: false, message: '', x: 0, y: 0 });
  const [constraintZones, setConstraintZones] = useState(null);
  const [zoom, setZoom] = React.useState(1.0);
  const [calculatedMinScreenDepthM, setCalculatedMinScreenDepthM] = useState(WALL_BUFFER_M + SCREEN_BUFFER_M);
  const [containerW, setContainerW] = useState(0);
  const [containerH, setContainerH] = useState(0);
  const [hoveredSeat, setHoveredSeat] = useState(null);
  const [hudPinnedSeatId, setHudPinnedSeatId] = useState(null);
  const [hudHiddenWhenPinned, setHudHiddenWhenPinned] = useState(false);
  const [hudPinnedOffsetPx, setHudPinnedOffsetPx] = useState(null);
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
  useEffect(() => {
    const needsDefaultPosition = placedSpeakers.some(s => {
      const role = getCanonicalRole(s.role);
      return (role === 'SL' || role === 'SR') && !s.defaultPosition && s.position;
    });

    if (needsDefaultPosition) {
      onSetSpeakers(prev => prev.map(s => {
        const role = getCanonicalRole(s.role);
        if ((role === 'SL' || role === 'SR') && !s.defaultPosition && s.position) {
          return { ...s, defaultPosition: { ...s.position } };
        }
        return s;
      }));
    }
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

  // NEW: Memo for speakers by canonical role, with safety checks
  const byRole = useMemo(() => {
    try {
      const speakersToMap = Array.isArray(placedSpeakers) ? placedSpeakers : [];
      // Check if the imported buildRoleMap is a function before calling
      if (typeof buildRoleMap === 'function') {
        const m = buildRoleMap(speakersToMap);
        // Ensure it returned a valid Map
        if (m instanceof Map) {
          return m;
        }
      }
      // If buildRoleMap is not a function or returned a non-Map, use the safe fallback.
      return _safeBuildRoleMapFallback(speakersToMap);
    } catch (e) {
      console.error("Error in buildRoleMap:", e);
      // If any error occurs during the call, use the fallback.
      return _safeBuildRoleMapFallback(Array.isArray(placedSpeakers) ? placedSpeakers : []);
    }
  }, [placedSpeakers, getCanonicalRole]);

  // NEW: Memo for LCR speakers, for P4 calculation
  const lcrSpeakers = useMemo(() => {
    return ['FL', 'FC', 'FR'].flatMap(role => getByRoleArray(byRole, role)).filter(Boolean);
  }, [byRole]);

  const byId = useMemo(() => {
    const map = new Map();
    [...(placedSpeakers || []), ...(seatingPositions || [])].forEach(item => {
      if (item && item.id) {
        map.set(item.id, item);
      }
    });
    return map;
  }, [placedSpeakers, seatingPositions]);

  const ids = React.useMemo(() => ({
    grid: `grid-${Math.random().toString(36).slice(2)}`,
    clip: `clip-${Math.random().toString(36).slice(2)}`
  }), []);

  // Resize observer with zero dimensions guard
  useEffect(() => {
    if (!planBoundsRef.current) return; // Changed from containerRef
    const ro = new ResizeObserver(entries => {
      const cr = entries[0]?.contentRect;
      if (!cr || cr.width === 0 || cr.height === 0) return;

      setContainerW(cr.width);
      // leave some breathing room for toolbars; never below 420px
      setContainerH(Math.max(420, cr.height || 0));
    });
    ro.observe(planBoundsRef.current); // Changed from containerRef
    return () => ro.disconnect();
  }, [planBoundsRef]); // Changed from containerRef


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

    if (typeof onLcrAngleComputed === "function") onLcrAngleComputed(averageAngle);

    return { L: angleL, R: angleR, averageAngle, maxAbs };
  }, [aimAtMLP, placedSpeakers, mlpDotX_m, mlpDotY_m, onLcrAngleComputed, getCanonicalRole]);

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

  // actualScreenFrontY declaration and calculation
  const actualScreenFrontY = React.useMemo(() => {
    const floatDepthM = Number(screen?.floatDepthM) || 0.0;
    const speakerClearanceM = Number(screen?.speakerClearanceM) || 0.02;

    const minDepthForSpeakersToClear = calculatedMinScreenDepthM + speakerClearanceM;

    if (screenPlaneMode === 'autoTight') {
      return minDepthForSpeakersToClear;
    } else {
      return Math.max(floatDepthM, minDepthForSpeakersToClear);
    }
  }, [
    calculatedMinScreenDepthM,
    screen?.floatDepthM,
    screen?.speakerClearanceM,
    screenPlaneMode
  ]);

  // Publish screen front plane to AppState with guards (rounded to mm)
  useEffect(() => {
    if (!appState?.setScreenFrontPlaneM) return;
    if (!Number.isFinite(actualScreenFrontY)) return;

    // Round to mm to avoid jitter/loops
    const v = Math.round(actualScreenFrontY * 1000) / 1000;
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

React.useEffect(() => {
  if (typeof onScreenPlaneChange !== 'function') return;
  if (!Number.isFinite(actualScreenFrontY)) return;

  // If unchanged, skip update
  if (lastSentRef.current === actualScreenFrontY) return;

  // Debounce updates to prevent API overload (1 second)
  clearTimeout(screenSendTimerRef.current);
  screenSendTimerRef.current = setTimeout(() => {
    if (lastSentRef.current !== actualScreenFrontY) {
      lastSentRef.current = actualScreenFrontY;
      onScreenPlaneChange(actualScreenFrontY);
    }
  }, 1000);

  return () => clearTimeout(screenSendTimerRef.current);
}, [actualScreenFrontY, onScreenPlaneChange]);

  const availW = (containerW || DEFAULT_W) - 2 * PADDING;
  const availH = (containerH || DEFAULT_H) - 2 * PADDING;
  const scale = useMemo(() =>
    Math.min(availW / widthM, availH / lengthM),
    [availW, availH, widthM, lengthM]);

  const roomRect = useMemo(() => ({
    x: PADDING, y: PADDING,
    width: widthM * scale, height: lengthM * scale
  }), [widthM, lengthM, scale]);

  // Update toPx for pixel-perfect rendering
  const toPx = useCallback((x_m, y_m) => {
    const x = roomRect.x + x_m * scale;
    const y = roomRect.y + y_m * scale;
    return [Math.round(x) + 0.5, Math.round(y) + 0.5];
  }, [roomRect, scale]);

  // New helper functions for single-axis meter to pixel conversion
  const meterToCanvasX = useCallback((xM) => {
    const x = roomRect.x + (xM * scale);
    return Math.round(x) + 0.5;
  }, [roomRect, scale]);

  const meterToCanvasY = useCallback((yM) => {
    const y = roomRect.y + (yM * scale);
    return Math.round(y) + 0.5;
  }, [roomRect, scale]);

  const canvasToRoom = useCallback((posPx) => {
    if (!posPx) return { x: 0, y: 0 };
    const xM = (posPx.x - roomRect.x) / scale;
    const yM = (posPx.y - roomRect.y) / scale;
    return { x: xM, y: yM };
  }, [roomRect, scale]);

  const roomToCanvas = useCallback((posM) => {
    if (!posM) return { x: 0, y: 0 };
    const xPx = roomRect.x + (posM.x * scale);
    const yPx = roomRect.y + (posM.y * scale);
    return { x: Math.round(xPx) + 0.5, y: Math.round(yPx) + 0.5 };
  }, [roomRect, scale]);


  // Calculate MLP position for use in zones, now from the internally derived MLP
  const { mlpPxX, mlpPxY, midX_m, mlpY_m } = useMemo(() => {
    const [_mlpPxX, _mlpPxY] = toPx(mlp.x, mlp.y);
    return { mlpPxX: _mlpPxX, mlpPxY: _mlpPxY, midX_m: mlp.x, mlpY_m: mlp.y };
  }, [mlp, toPx]);

  // Memo for the valid Y-range for the *center* of SL/SR speakers, incorporating overhang.
  const sideSurroundVisualSpanM = useMemo(() => {
    const roomLength = lengthM || 6.0;
    // These `zoneMinY_meters` and `zoneMaxY_meters` represent the visual extent of the zone polygon.
    const zoneMinY_meters = Math.max(0, mlpY_m - FADE_LEN_M);
    const zoneMaxY_meters = roomLength;

    // Determine an effective speaker height for calculating the valid center range.
    // We use the SL speaker if available, otherwise a reasonable default.
    const slSpeaker = placedSpeakers.find(s => getCanonicalRole(s.role) === 'SL');
    const representativeHeightM = slSpeaker ? (getModelDimsM(slSpeaker.model)?.heightM || 0.2) : 0.2;

    const speakerHalfHeight = representativeHeightM / 2;
    const allowedOverhangDistance = SIDE_ALLOW_OVERHANG * representativeHeightM;

    // The speaker's center can be placed such that its bottom edge is at `zoneMinY_meters - allowedOverhangDistance`
    // So, the center's minimum Y position is `zoneMinY_meters - allowedOverhangDistance + speakerHalfHeight`
    const effectiveMinY_forCenter = zoneMinY_meters - allowedOverhangDistance + speakerHalfHeight;

    // The speaker's center can be placed such that its top edge is at `zoneMaxY_meters + allowedOverhangDistance`
    // So, the center's maximum Y position is `zoneMaxY_meters + allowedOverhangDistance - speakerHalfHeight`
    const effectiveMaxY_forCenter = zoneMaxY_meters + allowedOverhangDistance - speakerHalfHeight;

    // Ensure these bounds are within the overall room length (0 to roomLength) for safety
    return {
      minY: Math.max(0, effectiveMinY_forCenter),
      maxY: Math.min(roomLength, effectiveMaxY_forCenter)
    };
  }, [mlpY_m, placedSpeakers, getModelDimsM, lengthM, getCanonicalRole]);

  // Initialize rear mode once (safe guard on mount or when speakers appear)
  React.useEffect(() => {
    const sbl = placedSpeakers.find(s => getCanonicalRole(s.role) === 'SBL');
    if (!sbl) return;
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
  const frontWideZones = useMemo(() => {
    // Zones are now computed independently of the overlay toggle.

    if (!mlp) return { status: 'loading' };

    const W = widthM || 0;
    const L = lengthM || 0;
    if (!(W > 0 && L > 0)) {
      return { status: 'invalid-geom', reason: 'room dims' };
    }

    const sl = placedSpeakers?.find(s => getCanonicalRole(s.role) === 'SL');
    const sr = placedSpeakers?.find(s => getCanonicalRole(s.role) === 'SR');

    if (!sl || !sr) {
      return { status: 'no-sides' };
    }

    let result;
    try {
      result = computeFrontWideZonesStrict({
        mlpPoint: mlp,
        dimensions: { width: widthM, length: lengthM, height: heightM }, // Pass as object
        placedSpeakers,
        getModelDimsM: getModelDimsM,
        rp22BoundDeg: 10,
      }) || { status: 'invalid-geom', reason: 'empty result' };
    } catch (e) {
      result = { status: 'error', reason: 'exception', error: e.message };
      if (appState_DBG_FW) {
        console.warn('[FW zones] compute failed', e);
      }
    }

    // Debug hook: expose computed zones
    if (typeof window !== 'undefined') {
      window.FW_DBG = result;
      if (appState_DBG_FW) {
        console.log('[FW] zones ->', result);
        if (result.status === 'ok') {
          console.log('[FW] L =', result.left, 'R =', result.right);
        }
      }
    }

    return result;
  }, [
    mlp?.x, mlp?.y,
    widthM, lengthM, heightM, // Use the new dimension variables
    placedSpeakers,
    speakersEpoch,
    getModelDimsM,
    appState_DBG_FW,
    getCanonicalRole
  ]);

  // Auto-seed FW speakers when enabled (runs once when conditions are met)
  useEffect(() => {
    if (!enableFrontWides || !onSetSpeakers) return;
    if (frontWideZones?.status !== 'ok') return;

    const hasLW = placedSpeakers?.some(s => getCanonicalRole(s.role) === 'LW');
    const hasRW = placedSpeakers?.some(s => getCanonicalRole(s.role) === 'RW');

    if (hasLW && hasRW) return;

    const W = widthM || 4.5;
    const WALL_BUFFER_FW = 0.02;

    // Get model from first surround speaker as fallback
    const surroundModel = placedSpeakers?.find(s =>
      ['SL', 'SR'].includes(getCanonicalRole(s.role))
    )?.model || 'off';

    if (surroundModel === 'off') return;

    const dims = getModelDimsM(surroundModel);
    const halfDepth = (Number(dims?.depthM) || 0.082) / 2;

    const newSpeakers = [...(placedSpeakers || [])];
    let speakersAdded = false;

    if (!hasLW && frontWideZones.left) {
      newSpeakers.push({
        id: `LW-${timeNowMs()}`,
        role: 'LW',
        model: surroundModel,
        position: {
          x: WALL_BUFFER_FW + halfDepth,
          y: frontWideZones.left.medianY,
          z: 1.1
        },
        draggable: true
      });
      speakersAdded = true;
    }

    if (!hasRW && frontWideZones.right) {
      newSpeakers.push({
        id: `RW-${timeNowMs() + 1}`,
        role: 'RW',
        model: surroundModel,
        position: {
          x: W - WALL_BUFFER_FW - halfDepth,
          y: frontWideZones.right.medianY,
          z: 1.1
        },
        rotation: { x: 0, y: 0, z: 0 },
        draggable: true
      });
      speakersAdded = true;
    }

    if (speakersAdded) {
      onSetSpeakers(newSpeakers);
    }
  }, [enableFrontWides, frontWideZones, placedSpeakers, widthM, getModelDimsM, onSetSpeakers, getCanonicalRole]);

  // --- OVERHEAD ZONES (must be declared EARLY, before handleSpeakerDrag) ---
  const overheadZones = useMemo(
    () =>
      computeOverheadZones({
        seatingPositions,
        heightM,
        widthM,
        lengthM,
        mlpY_m,
        mlpPoint: mlp,
        placedSpeakers,
        getCanonicalRole,
      }),
    [seatingPositions, heightM, widthM, lengthM, mlpY_m, mlp, placedSpeakers, getCanonicalRole]
  );

  // [B44 DISABLED] Auto-positioning of FW based on zones
  // FW median positioning is now FULLY handled by SpeakerPlacement only.
  // The overlay (when enabled) should ONLY:
  // - Draw the visual FW zone bands
  // - Constrain manual drags inside the band during user interaction
  useEffect(() => {
    // Legacy auto-positioning logic disabled
    return;
    
    /* ORIGINAL LOGIC DISABLED:
    if (!enableFrontWides || isDraggingFW.current) return;
    if (frontWideZones?.status !== 'ok') return;

    const W = widthM || 4.5;
    const L = lengthM || 6.0;
    const WALL_BUFFER_FW = 0.02;

    const lwSpeaker = placedSpeakers?.find(s => getCanonicalRole(s.role) === 'LW');
    const rwSpeaker = placedSpeakers?.find(s => getCanonicalRole(s.role) === 'RW');

    if (!lwSpeaker && !rwSpeaker) return;

    let needsUpdate = false;
    const updated = (placedSpeakers || []).map(s => {
      const role = getCanonicalRole(s.role);
      if (role !== 'LW' && role !== 'RW') return s;

      const zone = role === 'LW' ? frontWideZones.left : frontWideZones.right;
      if (!zone || !zone.medianY) return s;

      const dims = getModelDimsM(s.model);
      const halfDepth = (Number(dims?.depthM) || 0.082) / 2;
      const halfWidth = (Number(dims?.widthM) || 0.20) / 2;

      const xAtWall = role === 'LW'
        ? (WALL_BUFFER_FW + halfDepth)
        : (W - WALL_BUFFER_FW - halfDepth);

      const sideOffsetKey = role === 'LW' ? 'L' : 'R';
      const currentOffset = fwOffsetRef.current[sideOffsetKey] || 0;

      const targetYWithOffset = zone.medianY + currentOffset;
      const yMinClamped = (zone.yMin || 0) + (halfWidth * SIDE_ALLOW_OVERHANG);
      const yMaxClamped = (zone.yMax || L) - (halfWidth * SIDE_ALLOW_OVERHANG);

      const yClamped = clamp(targetYWithOffset, yMinClamped, yMaxClamped);

      const currentY = s.position?.y ?? 0;
      const currentX = s.position?.x ?? 0;

      if (Math.abs(currentY - yClamped) > EPS || Math.abs(currentX - xAtWall) > EPS) {
        needsUpdate = true;
        return {
          ...s,
          position: {
            ...s.position,
            x: xAtWall,
            y: yClamped,
            z: s.position?.z ?? 1.1
          }
        };
      }

      return s;
    });

    if (needsUpdate) {
      onSetSpeakers(updated);
    }
    */
  }, [
    enableFrontWides,
    frontWideZones,
    placedSpeakers,
    widthM,
    lengthM,
    speakersEpoch,
    getModelDimsM,
    onSetSpeakers,
    getCanonicalRole
  ]);

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
          }
        };
      }));
    };

    window.addEventListener('b44:fw:resetToMedian', handleReset);
    return () => window.removeEventListener('b44:fw:resetToMedian', handleReset);
  }, [frontWideZones, widthM, lengthM, getModelDimsM, onSetSpeakers, getCanonicalRole]);

  // Drag state management
  const handleMouseDown = useCallback(
    (e, id, type) => {
      e.preventDefault();
      e.stopPropagation();

      const target = byId.get(id);
      if (!target) return;

      const canonicalRole = getCanonicalRole(target.role);
      const isOverhead =
        typeof canonicalRole === "string" && canonicalRole.startsWith("T");

      // 1) For non-overhead speakers, keep the existing "renderable" guard.
      if (type === "speaker" && !isOverhead && !isRenderableSpeaker(target)) {
        return;
      }

      // 2) For non-overhead speakers, keep the existing "locked" behaviour.
      //    Overheads bypass this, so they never show "Position is locked".
      if (type === "speaker" && !isOverhead && !isDraggable(target)) {
        setTooltip({ show: true, text: "Position is locked" });
        setTimeout(() => {
          setTooltip((t) =>
            t.text === "Position is locked" ? { show: false } : t
          );
        }, 1500);
        return;
      }

      setDragState({
        dragging: true,
        draggedItemId: id,
        dragType: type,
      });
      setDragWarning({ show: false });
      rsDragLockRef.current = null;

      if (type === "speaker") {
        const speakerBeingDragged = byId.get(id);
        const canonRole = getCanonicalRole(speakerBeingDragged.role);
        if (canonRole === "SBL" || canonRole === "SBR") {
          isDraggingRearRef.current++;
        }
        if (canonRole === "LW" || canonRole === "RW") {
          isDraggingFW.current = true;
        }
      }
    },
    [byId, setDragState, setDragWarning, setTooltip, rsDragLockRef, getCanonicalRole]
  );

  const handleZoomIn = () => setZoom(prev => Math.min(2.0, prev + 0.1));
  const handleZoomOut = () => setZoom(prev => Math.max(0.5, prev - 0.1));

  // Memoize baffle and screen calculations for performance
  const { BaffleAndScreen, screenPlaneY, screenCenterX_m, visibleWidthM } = useMemo(() => {
    const inch2m = 0.0254;
    const viewableWidthM = Math.max(0.1, Number(screen?.visibleWidthInches || 100) * inch2m);
    const overallWidthM = viewableWidthM + 0.16;

    const planeDepthM = actualScreenFrontY;


    const roomCenterX_px = roomRect.x + roomRect.width / 2;
    const yFront = roomRect.y;
    const baffleW = viewableWidthM * scale;
    const screenW = overallWidthM * scale;

    const baffleH = Math.max(1, planeDepthM * scale);
    const screenH_px = SCREEN_THICKNESS_M * scale;
    const baffleX = roomCenterX_px - baffleW / 2;
    const screenX = roomCenterX_px - screenW / 2;

    const baffleTop = yFront;
    const screenPlaneY = yFront + baffleH;

    const component = (
      <>
        {showBaffle && (
          <rect x={baffleX} y={baffleTop} width={baffleW} height={baffleH}
            fill="none" stroke="#4A230F" strokeWidth="1.5" strokeDasharray="6 6" pointerEvents="none" />
        )}
        {showScreen && (
          <rect x={screenX} y={screenPlaneY} width={screenW} height={screenH_px}
            fill="#1a1a1a" stroke="#333" strokeWidth="0.5" pointerEvents="none" />
        )}
      </>
    );

    const roomWidthM = widthM || 4.5;
    const screenCenterX_m = roomWidthM / 2;
    const SAFETY_MARGIN_M = 0.05; // Declared here for local use if not globally defined
    const clampY = (y) => Math.max(SAFETY_MARGIN_M, Math.min(lengthM - SAFETY_MARGIN_M, y));

    return { BaffleAndScreen: component, screenPlaneY, screenCenterX_m, visibleWidthM: viewableWidthM };
  }, [screen?.visibleWidthInches, roomRect, scale, actualScreenFrontY, showBaffle, showScreen, widthM, SCREEN_THICKNESS_M, lengthM]);


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

  // Drag state management
  const handleSpeakerDrag = useCallback((speakerId, newCanvasPos) => {
    if (!onSetSpeakers) return;

    const spk = byId.get(speakerId);
    if (!spk) return;

    // Work out canonical role once, and decide if this is an overhead (T*).
    const canonicalRole = getCanonicalRole(spk.role);
    const isOverhead =
      typeof canonicalRole === "string" && canonicalRole.startsWith("T");

    // For NON-overhead speakers, keep the existing draggable guard.
    // Overheads bypass this, because their raw model may be null even though
    // they are rendered with a resolved overhead model.
    if (!isOverhead && !isDraggable(spk)) {
      return;
    }

    // --- LCR Mirror-Lock Drag Logic ---
    if (['FL', 'FC', 'FR'].includes(canonicalRole)) {
      // FC is locked to center, so this block should not apply to it
      if (canonicalRole === 'FC') {
        // Handle FC explicitly to just ensure its X position is centerX_m
        onSetSpeakers(prev => prev.map(s => {
          if (s.id === speakerId) {
            return { ...s, position: { ...s.position, x: centerX_m } };
          }
          return s;
        }));
      } else { // FL or FR
        if (!constraintZones?.FL || !constraintZones?.FR) {
          return;
        }

        const rawRoomPos = canvasToRoom(newCanvasPos);
        const desiredX = rawRoomPos.x;
        const isLeft = canonicalRole === 'FL';

        const { finalLeftX, finalRightX } = resolveSymmetricLCR({
          desiredX: desiredX,
          isLeft: isLeft,
          screenCenterX: screenCenterX_m,
          leftZone: constraintZones.FL.clamp,
          rightZone: constraintZones.FR.clamp,
        });

        // Apply positions
        onSetSpeakers(prev => {
          return prev.map(s => {
            const currentCanonRole = getCanonicalRole(s.role);
            if (currentCanonRole === 'FL') {
              return { ...s, position: { ...(s.position || {}), x: finalLeftX } };
            }
            if (currentCanonRole === 'FR') {
              return { ...s, position: { ...(s.position || {}), x: finalRightX } };
            }
            return s;
          });
        });
      }
      lastInteractionEpoch.current = timeNowMs();
      return;
    }

    // Handle special symmetrical drag for SL and SR
    if ((canonicalRole === 'SL' || canonicalRole === 'SR')) {
      const slSpeaker = placedSpeakers.find(s => getCanonicalRole(s.role) === 'SL');
      const srSpeaker = placedSpeakers.find(s => getCanonicalRole(s.role) === 'SR');
      if (!slSpeaker || !srSpeaker) return;

      const W = widthM || 0;
      const L = lengthM || 0;
      if (!(W > 0 && L > 0)) return;

      // Fixed X against side walls (unchanged)
      const dimsL = getSpeakerDims(slSpeaker.model);
      const dimsR = getSpeakerDims(srSpeaker.model);
      const xL_side = fixedSideX(W, dimsL, 'L');
      const xR_side = fixedSideX(W, dimsR, 'R');

      // Visual side band Y span with corner clearance at rear
      const yMin_side = Number(sideSurroundVisualSpanM?.minY) || 0;
      const yMax_visual = Number(sideSurroundVisualSpanM?.maxY) || 0;
      const yMax_clamp = Math.max(yMin_side, Math.min(yMax_visual, L - CORNER_CLEAR_M));

      const { y: proposedRoomY_m } = canvasToRoom(newCanvasPos);
      const yPtr = Number(proposedRoomY_m);

      const yMin = yMin_side;
      const yMax = yMax_clamp;


      // Decide mode with hysteresis (inlined logic for decideRearMode)
      const nextMode = (() => {
        const py = Number(yPtr);
        const yMx = Number(yMax_clamp);
        const hys = Number.isFinite(BACKWALL_HYSTERESIS_M) ? Number(BACKWALL_HYSTERESIS_M) : 0.10;
        if (slsrModeRef.current === 'back') return py < (yMx - hys) ? 'side' : 'back';
        return py > (yMx + hys) ? 'back' : 'side';
      })();

      if (DBG_SS) {
        try {
          console.log('[SS drag] modeDecision', {
            role: canonicalRole, yPtr: yPtr?.toFixed?.(3),
            yMax_side: yMax_clamp?.toFixed?.(3),
            hysteresis: BACKWALL_HYSTERESIS_M,
            prevModeRef: slsrModeRef.current, nextMode
          });
        } catch (_) {}
      }


      slsrModeRef.current = nextMode;

      if (nextMode === 'side') {
        const segL = sideSegmentAtX(_overlays?.sideSurroundZone, xL_side, L);
        const segR = sideSegmentAtX(_overlays?.sideSurroundZone, xR_side, L);

        const yStarRaw = resolveSymmetricY(yPtr, segL, segR);

        let yStar = Math.min(yMax, Math.max(yMin, yStarRaw));

        // Directional clearance vs same-side REAR
        const ssPrevY = Number((canonicalRole === 'SL' ? slSpeaker : srSpeaker)?.position?.y);

        // left side vs SBL
        const sblCandidate = placedSpeakers.find(s => getCanonicalRole(s.role)==='SBL');
        if (sblCandidate && isOnSideWall('L', sblCandidate, W)) {
          const halfSS = (speakerOnWallYFootprint(getModelDimsM(slSpeaker.model)) || 0) / 2;
          const halfRS = (speakerOnWallYFootprint(getModelDimsM(sblCandidate.model)) || 0) / 2;
          const minSep = halfSS + halfRS + 0.50;
          const yOther = Number(sblCandidate?.position?.y) || 0;
          yStar = nonCrossingClampDirectional(ssPrevY, yStar, yOther, minSep);
          yStar = Math.min(Math.max(yStar, yMin), yMax);
        }

        // right side vs SBR
        const sbrCandidate = placedSpeakers.find(s => getCanonicalRole(s.role)==='SBR');
        if (sbrCandidate && isOnSideWall('R', sbrCandidate, W)) {
          const halfSS = (speakerOnWallYFootprint(getModelDimsM(srSpeaker.model)) || 0) / 2;
          const halfRS = (speakerOnWallYFootprint(getModelDimsM(sbrCandidate.model)) || 0) / 2;
          const minSep = halfSS + halfRS + 0.50;
          const yOther = Number(sbrCandidate?.position?.y) || 0;
          yStar = nonCrossingClampDirectional(ssPrevY, yStar, yOther, minSep);
          yStar = Math.min(Math.max(yStar, yMin), yMax);
        }

        if (DBG_SS) {
          try {
            const sbl = placedSpeakers.find(s => getCanonicalRole(s.role) === 'SBL');
            const sbr = placedSpeakers.find(s => getCanonicalRole(s.role) === 'SBR');
            console.log('[SS drag] rear proximity inputs', {
              hasSBL: !!sbl, hasSBR: !!sbr,
              slsrYPtr: yPtr?.toFixed?.(3),
              ssBand: { minY: yMin?.toFixed?.(3), maxY: yMax?.toFixed?.(3) },
              sblY: Number(sbl?.position?.y)?.toFixed?.(3),
              sbrY: Number(sbr?.position?.y)?.toFixed?.(3)
            });
          } catch (_) {}
        }


        lastInteractionEpoch.current = timeNowMs();


        onSetSpeakers(prev => prev.map(s => {
          const role = getCanonicalRole(s.role);
          if (role === 'SL') return { ...s, position: { ...(s.position || {}), x: xL_side, y: yStar } };
          if (role === 'SR') return { ...s, position: { ...(s.position || {}), x: xR_side, y: yStar } };
          return s;
        }));
        return;
      }

      // back-wall mode (symmetric, lanes, fixed Y near back wall)
      const roomWidth = widthM || 0;
      // Use the precomputed lanes for consistency and proper fade/clearance application
      const lanes = rearSurroundVisualLanes;

      const leftLaneMin = lanes.left.minX;
      const leftLaneMax = lanes.left.maxX;

      const y_back_m_L = backWallYForDims(getSpeakerDims(slSpeaker.model), L, WALL_BUFFER_M);
      const y_back_m_R = backWallYForDims(getSpeakerDims(srSpeaker.model), L, WALL_BUFFER_M);

      const { x: proposedRoomX_m_slsr } = canvasToRoom(newCanvasPos);

      // normalize to LEFT lane space first (mirror SR pointer X)
      const rawXL = (canonicalRole === 'SL')
        ? proposedRoomX_m_slsr
        : (roomWidth - proposedRoomX_m_slsr);

      // clamp within back-wall left lane limits
      const xL_star = clamp(rawXL, leftLaneMin, leftLaneMax);

      // mirror for right
      const xR_star = roomWidth - xL_star;

      if (DBG_SS) {
        try {
          console.log('[SS back] lanes', {
            laneL: rearSurroundVisualLanes?.left,
            laneR: rearSurroundVisualLanes?.right,
            W: roomWidth?.toFixed?.(3),
            yPtr: yPtr?.toFixed?.(3),
            xPtr: proposedRoomX_m_slsr?.toFixed?.(3),
            rawXL: rawXL?.toFixed?.(3),
            xL_star: xL_star?.toFixed?.(3), xR_star: xR_star?.toFixed?.(3)
          });
        } catch (_) {}
      }


      lastInteractionEpoch.current = timeNowMs();


      // write positions (Y stays at back-wall Y you already computed: y_back_m)
      onSetSpeakers(prev =>
        prev.map(s => {
          const r = getCanonicalRole(s.role);
          if (r === 'SL') return { ...s, position: { ...(s.position||{}), x: xL_star, y: y_back_m_L } };
          if (r === 'SR') return { ...s, position: { ...(s.position||{}), x: xR_star, y: y_back_m_R } };
          return s;
        })
      );
      return;
    }

    // Handle SBL/SBR rear surrounds - ALWAYS keep them on back wall
    if (canonicalRole === 'SBL' || canonicalRole === 'SBR') {
      const isLeft = canonicalRole === 'SBL';
      const { x: rawX, y: rawY } = canvasToRoom(newCanvasPos);

      const W = widthM || 4.5;
      const L = lengthM || 6.0;

      // Get speaker dimensions
      const speakerMeta = getModelDimsM ? getModelDimsM(spk.model) : null;
      const spDims = {
        widthM: speakerMeta?.widthM || 0.20,
        depthM: speakerMeta?.depthM || 0.082
      };

      // [B44 REAR FIX] Always use rear corridor - ignore side wall proximity
      const side = (rawX <= W * 0.5) ? 'left' : 'right';
      const c = rsRearCorridor(side, { widthM: W, lengthM: L }, spDims);

      const finalX = clamp(rawX, c.xMin, c.xMax);
      const finalY = c.y; // Always back wall Y

      // Mirror partner
      const partnerRole = canonicalRole === 'SBL' ? 'SBR' : 'SBL';
      const partnerId = placedSpeakers.find(s => getCanonicalRole(s.role) === partnerRole)?.id;

      const partnerX = W - finalX;
      const partnerSide = (partnerX <= W * 0.5) ? 'left' : 'right';
      const cPartner = rsRearCorridor(partnerSide, { widthM: W, lengthM: L }, spDims);

      const partnerXClamped = clamp(partnerX, cPartner.xMin, cPartner.xMax);
      const partnerY = cPartner.y; // Always back wall Y

      // Update both speakers
      onSetSpeakers(prev => prev.map(s => {
        if (s.id === speakerId) {
          return { ...s, position: { ...s.position, x: finalX, y: finalY } };
        }
        if (partnerId && s.id === partnerId) {
          return { ...s, position: { ...s.position, x: partnerXClamped, y: partnerY } };
        }
        return s;
      }));

      lastInteractionEpoch.current = timeNowMs();
      return;
    }

    // Handle LW/RW front-wide speakers with corridor clamping and mirroring
    if (canonicalRole === 'LW' || canonicalRole === 'RW') {
      if (frontWideZones?.status !== 'ok') return;

      isDraggingFW.current = true;

      const W = widthM || 4.5;
      const L = lengthM || 6.0; // Added for yMinClamped, yMaxClamped
      const dims = getModelDimsM(spk.model);
      const halfDepth = (Number(dims?.depthM) || 0.082) / 2;
      const halfWidth = (Number(dims?.widthM) || 0.20) / 2;
      const WALL_BUFFER_FW = 0.02;

      const zone = (canonicalRole === 'LW') ? frontWideZones.left : frontWideZones.right;
      const partnerZone = (canonicalRole === 'LW') ? frontWideZones.right : frontWideZones.left;

      // Define partnerRole based on current speaker
      const partnerRole = (canonicalRole === 'LW') ? 'RW' : 'LW';

      if (!zone || !partnerZone) return;

      // Pin X to the wall
      const xAtWall = (canonicalRole === 'LW')
        ? (WALL_BUFFER_FW + halfDepth)
        : (W - WALL_BUFFER_FW - halfDepth);

      const { y: rawY } = canvasToRoom(newCanvasPos);
      // Allow 50% overhang
      const yMinClamped = (zone.yMin || 0) + (halfWidth * SIDE_ALLOW_OVERHANG);
      const yMaxClamped = (zone.yMax || L) - (halfWidth * SIDE_ALLOW_OVERHANG);

      const yClamped = clamp(rawY, yMinClamped, yMaxClamped);

      // Store offset from median for re-locking
      const offset = yClamped - zone.medianY;
      const sideOffsetKey = canonicalRole === 'LW' ? 'L' : 'R';
      fwOffsetRef.current[sideOffsetKey] = offset;

      const nextPos = { x: xAtWall, y: yClamped, z: spk.position?.z ?? 1.1 };

      // Mirror partner: same offset from its own median
      const partner = placedSpeakers.find(s => getCanonicalRole(s.role) === partnerRole);

      let partnerPos = null;
      if (partner) {
        const partnerDims = getModelDimsM(partner.model);
        const partnerHalfDepth = (Number(partnerDims?.depthM) || 0.082) / 2;
        const partnerHalfWidth = (Number(partnerDims?.widthM) || 0.20) / 2;

        const partnerXAtWall = (canonicalRole === 'LW')
          ? (W - WALL_BUFFER_FW - partnerHalfDepth)
          : (WALL_BUFFER_FW + partnerHalfDepth);

        // Partner uses same offset from its own median
        const partnerTargetY = partnerZone.medianY + offset;
        const partnerYMinClamped = (partnerZone.yMin || 0) + (partnerHalfWidth * SIDE_ALLOW_OVERHANG);
        const partnerYMaxClamped = (partnerZone.yMax || L) - (partnerHalfWidth * SIDE_ALLOW_OVERHANG);
        const partnerYClamped = clamp(partnerTargetY, partnerYMinClamped, partnerYMaxClamped);

        partnerPos = { x: partnerXAtWall, y: partnerYClamped, z: partner.position?.z ?? 1.1 };

        // Store partner offset too (ensure it's based on actual clamped position)
        const partnerSideOffsetKey = partnerRole === 'LW' ? 'L' : 'R';
        fwOffsetRef.current[partnerSideOffsetKey] = partnerYClamped - partnerZone.medianY;
      }

      // Compute deviation from median (RP22 Parameter 7)
      try {
        const mlpX = mlp.x ?? (W / 2);
        const mlpY = mlp.y ?? (lengthM || 6.0) * 0.6; // Use lengthM
        const currentDeg = horizontalAngleFromMLP(mlpX, mlpY, xAtWall, yClamped);
        const medianY = zone.medianY ?? yClamped;
        const medianDeg = horizontalAngleFromMLP(mlpX, mlpY, xAtWall, medianY);
        const deviation = Math.abs(currentDeg - medianDeg);
        const lvl = fwDeviationLevel(deviation);

        spk.meta = { ...(spk.meta || {}), fwDeviationDeg: deviation, fwDeviationLevel: lvl.level };
      } catch (_) { /* silent */ }

      // Update both speakers simultaneously
      if (nextPos && onSetSpeakers) {
        onSetSpeakers(prev => prev.map(s => {
          if (s.id === speakerId) {
            return { ...s, position: nextPos, meta: spk.meta };
          }
          if (partner && s.id === partner.id && partnerPos) {
            return { ...s, position: partnerPos };
          }
          return s;
        }));
      }

      lastInteractionEpoch.current = timeNowMs();
      return;
    }

    // Fallback for all other draggable speakers (including overheads)
    const { x: rawX, y: rawY } = canvasToRoom(newCanvasPos);

    // Overhead drag behaviour: L/R pairs, clamped to bands, mirrored horizontally
    if (canonicalRole && canonicalRole.startsWith('T')) {
      // Mark that the user has taken control of overheads
      setHasManualOverheadEdit(true);

      if (!overheadZones || overheadZones.status !== "ok") {
        return;
      }

      // Role group helpers
      const LEFT_ROLES = ['TFL', 'TL', 'TBL'];
      const RIGHT_ROLES = ['TFR', 'TR', 'TBR'];

      const isLeftRole = (role) => LEFT_ROLES.includes(role);
      const isRightRole = (role) => RIGHT_ROLES.includes(role);

      const isFrontRole = (role) => role === 'TFL' || role === 'TFR';
      const isMidRole = (role) => role === 'TL' || role === 'TR';
      const isRearRole = (role) => role === 'TBL' || role === 'TBR';

      // Raw room coords from the mouse
      const rawRoomPos = canvasToRoom(newCanvasPos);

      // Clamp dragged speaker inside its own band
      const primaryClamped = clampOverheadPairPosition(
        { x: rawRoomPos.x, y: rawRoomPos.y },
        canonicalRole,
        overheadZones,
        widthM,
        lengthM
      );

      // --- RP22 lateral clamp for overhead columns ---
      const lateral = overheadZones?.lateral;
      if (lateral && widthM > 0) {
        const centreX = Number(lateral.centreX_m) || (widthM / 2);
        const minHalf = Number(lateral.minHalfSpanM) || 0;
        const maxHalf = Number(lateral.maxHalfSpanM) || 0;

        if (maxHalf > 0) {
          const isLeftRole =
            canonicalRole === 'TFL' ||
            canonicalRole === 'TL' ||
            canonicalRole === 'TBL';

          // Current offset from centre (keep sign for left/right)
          let offset = primaryClamped.x - centreX;
          const sign = isLeftRole ? -1 : 1;

          // Work in positive half-span, clamp to RP22 band
          let half = Math.abs(offset);
          let clampedHalf = half;

          if (half < minHalf) clampedHalf = minHalf;
          if (maxHalf >= minHalf && half > maxHalf) clampedHalf = maxHalf;

          primaryClamped.x = centreX + sign * clampedHalf;
        }
      }

      // Derive shared column X
      const centerX = widthM / 2;
      let leftColumnX = null;
      let rightColumnX = null;

      if (isLeftRole(canonicalRole)) {
        leftColumnX = primaryClamped.x;
        rightColumnX = centerX + (centerX - leftColumnX);
      }

      if (isRightRole(canonicalRole)) {
        rightColumnX = primaryClamped.x;
        leftColumnX = centerX + (centerX - rightColumnX);
      }

      // Clamp both columns
      if (leftColumnX != null) {
        const leftClamped = clampOverheadPairPosition(
          { x: leftColumnX, y: primaryClamped.y },
          'TL',
          overheadZones,
          widthM,
          lengthM
        );
        leftColumnX = leftClamped.x;
      }

      if (rightColumnX != null) {
        const rightClamped = clampOverheadPairPosition(
          { x: rightColumnX, y: primaryClamped.y },
          'TR',
          overheadZones,
          widthM,
          lengthM
        );
        rightColumnX = rightClamped.x;
      }

      // Discover current Y positions from placedSpeakers
      let frontY = null;
      let midY = null;
      let rearY = null;

      for (const s of placedSpeakers) {
        const role = getCanonicalRole(s.role);
        const posY = s?.position?.y;
        if (!Number.isFinite(posY)) continue;

        if (isFrontRole(role)) frontY = posY;
        if (isMidRole(role)) midY = posY;
        if (isRearRole(role)) rearY = posY;
      }

      // Fallback: use dragged Y as mid anchor if missing
      if (!Number.isFinite(midY)) {
        midY = primaryClamped.y;
      }

      // Compute symmetric Y around mid
      let newFrontY = frontY;
      let newMidY = midY;
      let newRearY = rearY;

      if (isMidRole(canonicalRole)) {
        // Dragging mid: move front and rear in parallel
        const dFront = Number.isFinite(frontY) ? midY - frontY : 0;
        const dRear = Number.isFinite(rearY) ? rearY - midY : 0;

        newMidY = primaryClamped.y;
        newFrontY = newMidY - dFront;
        newRearY = newMidY + dRear;
      }

      if (isFrontRole(canonicalRole)) {
        // Dragging front: enforce symmetry around mid
        newFrontY = primaryClamped.y;
        const d = midY - newFrontY;
        newRearY = midY + d;
      }

      if (isRearRole(canonicalRole)) {
        // Dragging rear: enforce symmetry around mid
        newRearY = primaryClamped.y;
        const d = newRearY - midY;
        newFrontY = midY - d;
      }

      // Clamp Y for each row
      const clampYForRole = (x, y, role) => {
        const clamped = clampOverheadPairPosition(
          { x, y },
          role,
          overheadZones,
          widthM,
          lengthM
        );
        return clamped.y;
      };

      if (Number.isFinite(newFrontY)) {
        newFrontY = clampYForRole(leftColumnX ?? primaryClamped.x, newFrontY, 'TFL');
      }
      if (Number.isFinite(newMidY)) {
        newMidY = clampYForRole(leftColumnX ?? primaryClamped.x, newMidY, 'TL');
      }
      if (Number.isFinite(newRearY)) {
        newRearY = clampYForRole(leftColumnX ?? primaryClamped.x, newRearY, 'TBL');
      }

      // Write positions for all six overheads
      onSetSpeakers(prev => {
        if (!Array.isArray(prev)) return prev;

        return prev.map(spk => {
          const role = getCanonicalRole(spk.role);
          if (!role || !role.startsWith('T')) return spk;

          const current = { ...(spk.position || {}) };

          const isLeft = isLeftRole(role);
          const isRight = isRightRole(role);

          if (isLeft && leftColumnX != null) {
            current.x = leftColumnX;
          }
          if (isRight && rightColumnX != null) {
            current.x = rightColumnX;
          }

          if (isFrontRole(role) && Number.isFinite(newFrontY)) {
            current.y = newFrontY;
          }
          if (isMidRole(role) && Number.isFinite(newMidY)) {
            current.y = newMidY;
          }
          if (isRearRole(role) && Number.isFinite(newRearY)) {
            current.y = newRearY;
          }

          return { ...spk, position: current };
        });
      });

      // Check if any row moved outside its recommended core
      const checkCoreCompliance = () => {
        const frontZone = overheadZones?.frontZone;
        const midZone = overheadZones?.midZone;
        const rearZone = overheadZones?.backZone;

        const warnings = [];

        if (frontZone?.coreY1 != null && frontZone?.coreY2 != null && Number.isFinite(newFrontY)) {
          if (newFrontY < frontZone.coreY1 || newFrontY > frontZone.coreY2) {
            warnings.push('Front row outside core');
          }
        }

        if (midZone?.coreY1 != null && midZone?.coreY2 != null && Number.isFinite(newMidY)) {
          if (newMidY < midZone.coreY1 || newMidY > midZone.coreY2) {
            warnings.push('Mid row outside core');
          }
        }

        if (rearZone?.coreY1 != null && rearZone?.coreY2 != null && Number.isFinite(newRearY)) {
          if (newRearY < rearZone.coreY1 || newRearY > rearZone.coreY2) {
            warnings.push('Rear row outside core');
          }
        }

        if (warnings.length > 0) {
          setDragWarning({
            show: true,
            message: `RP22 P9: ${warnings.join(', ')} — Level may drop`,
            x: newCanvasPos.x,
            y: newCanvasPos.y
          });
        }
      };

      checkCoreCompliance();

      lastInteractionEpoch.current = timeNowMs();
      return;
    }

    // Generic fallback for any other speakers
    onSetSpeakers(prev => {
      let updated = prev.map(s => {
        if (s.id === speakerId) {
          return { ...s, position: { ...s.position, x: rawX, y: rawY } };
        }
        return s;
      });
      return updated;
    });
    lastInteractionEpoch.current = timeNowMs();
  }, [byId, canvasToRoom, widthM, lengthM, getModelDimsM, frontWideZones, mlp, onSetSpeakers, sideSurroundVisualSpanM, rearSurroundVisualLanes, _overlays?.sideSurroundZone, slsrModeRef, isOnSideWall, rsRearCorridor, fwOffsetRef, getCanonicalRole, constraintZones, screenCenterX_m, centerX_m, overheadZones, dolbyLayout]);

  const handleSeatDrag = useCallback((seatId, newCanvasPos) => {
    if (!onSetSeatingPositions) return;
    const { x: roomX, y: roomY } = canvasToRoom(newCanvasPos);
    onSetSeatingPositions(prev =>
        prev.map(seat =>
            seat.id === seatId ? { ...seat, x: roomX, y: roomY } : seat
        )
    );
  }, [onSetSeatingPositions, canvasToRoom]);

  // Mouse handling with CTM guard
  const handleMouseMove = useCallback((e) => {
    if (!dragging || !draggedItemId) return;
    setDragWarning({ show: false });

    if (!svgRef.current) return;
    const svgElement = svgRef.current;
    const point = svgElement.createSVGPoint();
    point.x = e.clientX;
    point.y = e.clientY;
    const ctm = svgElement.getScreenCTM();
    if (!ctm) return;
    const inverseCTM = ctm.inverse();
    const svgPoint = point.matrixTransform(inverseCTM);

    const speaker = placedSpeakers.find(s => s.id === draggedItemId);

    if (dragType === 'speaker' && speaker) {
      const canonicalRole = getCanonicalRole(speaker.role);

      // --- LCR Mirror-Lock Drag Logic ---
      if (['FL', 'FC', 'FR'].includes(canonicalRole)) {
        if (canonicalRole === 'FC') {
          // FC is locked to centerX_m, so no dragging behavior for X
          // But Y can still be dragged if it ever becomes draggable.
          const { y: rawRoomY } = canvasToRoom({ x: svgPoint.x, y: svgPoint.y });
          const nextPos = { x: centerX_m, y: rawRoomY }; // X is fixed
          handleSpeakerDrag(draggedItemId, roomToCanvas(nextPos)); // Convert back to canvas to use existing logic
          return;
        } else {
          if (!constraintZones?.FL || !constraintZones?.FR) {
            setDragWarning({ show: true, message: 'LCR CONSTRAINTS NOT READY', x: e.clientX, y: e.clientY });
            return;
          }

          const rawRoomPos = canvasToRoom({ x: svgPoint.x, y: svgPoint.y });
          const desiredX = rawRoomPos.x;
          const isLeft = canonicalRole === 'FL';

          const { finalLeftX, finalRightX } = resolveSymmetricLCR({
            desiredX: desiredX,
            isLeft: isLeft,
            screenCenterX: screenCenterX_m,
            leftZone: constraintZones.FL.clamp,
            rightZone: constraintZones.FR.clamp,
          });

          // Apply positions
          onSetSpeakers(prev => {
            // Find the actual FL and FR speakers by ID to ensure we update the correct ones
            const flSpeaker = prev.find(s => getCanonicalRole(s.role) === 'FL');
            const frSpeaker = prev.find(s => getCanonicalRole(s.role) === 'FR');

            return prev.map(s => {
              if (flSpeaker && s.id === flSpeaker.id) {
                return { ...s, position: { ...(s.position || {}), x: finalLeftX } };
              }
              if (frSpeaker && s.id === frSpeaker.id) {
                return { ...s, position: { ...(s.position || {}), x: finalRightX } };
              }
              return s;
            });
          });
          lastInteractionEpoch.current = timeNowMs();
          return;
        }
      }
    }


    const clampedCanvasX = Math.max(roomRect.x, Math.min(roomRect.x + roomRect.width, svgPoint.x));
    const clampedCanvasY = Math.max(roomRect.y, Math.min(roomRect.y + roomRect.height, svgPoint.y));

    if (dragType === 'speaker') {
      handleSpeakerDrag(draggedItemId, { x: clampedCanvasX, y: clampedCanvasY });
    } else if (dragType === 'seat') {
      handleSeatDrag(draggedItemId, { x: clampedCanvasX, y: clampedCanvasY });
    }
  }, [dragging, draggedItemId, dragType, roomRect, handleSpeakerDrag, handleSeatDrag, placedSpeakers, onSetSpeakers, constraintZones, svgRef, canvasToRoom, setDragWarning, screenCenterX_m, getCanonicalRole, centerX_m, roomToCanvas]);

  const handleMouseUp = useCallback(() => {
    setDragState({
      dragging: false,
      draggedItemId: null,
      dragType: null,
    });
    setDragWarning({ show: false });
    setTooltip({ show: false });
    rsDragLockRef.current = null;
    isDraggingRearRef.current = 0;
    isDraggingFW.current = false;

  }, [setDragState, setDragWarning, setTooltip, rsDragLockRef, isDraggingRearRef, isDraggingFW]);

  const handleSpeakerDragEnd = useCallback((role, newPosition) => {
    onSetSpeakers(prev => prev.map(s => (s.role === role ? { ...s, position: newPosition } : s)));
    setDraggingRole(null);
  }, [onSetSpeakers]);


  // NEW: Seat hover handlers
  const handleSeatClick = useCallback((seat) => {
    setHudPinnedSeatId(prev => (prev === seat.id ? null : seat.id));
  }, []);

  const handleSeatMouseEnter = useCallback((seat) => {
    if (!hudPinnedSeatId) setHoveredSeat(seat);
  }, [hudPinnedSeatId]);

  const handleSeatMouseLeave = useCallback(() => {
    if (!hudPinnedSeatId) setHoveredSeat(null);
  }, [hudPinnedSeatId]);

  const mlpAnchorEffective = mlp;

  // Combine hoveredSeat and pinnedSeat for effective display
  const effectiveHoveredSeat = useMemo(() => {
    if (hudPinnedSeatId) {
      return seatingPositions.find(s => s.id === hudPinnedSeatId) || null;
    }
    return hoveredSeat;
  }, [hudPinnedSeatId, hoveredSeat, seatingPositions]);


  // Build tooltip data with RP22 per-seat metrics
  const tooltipData = useMemo(() => {
    if (!effectiveHoveredSeat) return null;

    // Helper for safe number extraction
    const finite = (v, fallback) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : fallback;
    };

    // Extract seat coordinates
    const seatX = finite(effectiveHoveredSeat?.x ?? effectiveHoveredSeat?.position?.x, 0);
    const seatY = finite(effectiveHoveredSeat?.y ?? effectiveHoveredSeat?.position?.y, 0);
    const seatZ = finite(effectiveHoveredSeat?.z, 1.2);

    // Room dimensions with fallbacks
    const roomWidth = finite(widthM, 4.5);
    const roomLength = finite(lengthM, 6.0);
    const roomHeight = finite(heightM, 2.4);
    const halfW = roomWidth / 2;

    // Screen front plane position
    // const screenFrontPlaneM = finite(actualScreenFrontY, 0); // This was previously used but is now globally available as a prop

    // Distance to screen (from screen plane)
    const distanceToScreen = Math.abs(seatY - screenFrontPlaneM);

    // Distance to MLP
    let distanceToMLP = null;
    if (mlp && Number.isFinite(mlp.x) && Number.isFinite(mlp.y)) {
      const dx = seatX - mlp.x;
      const dy = seatY - mlp.y;
      distanceToMLP = Math.hypot(dx, dy);
    }

    // RP23 horizontal viewing angle
    let rp23AngleDeg = null;
    let rp23Level = null;
    if (screen?.visibleWidthInches && distanceToScreen > 0.1) {
      const screenWidthM = (screen.visibleWidthInches * 0.0254) || 0;
      if (screenWidthM > 0) {
        rp23AngleDeg = 2 * Math.atan((screenWidthM / 2) / distanceToScreen) * (180 / Math.PI);
        
        if (rp23AngleDeg >= 48 && rp23AngleDeg <= 67) rp23Level = 'L4';
        else if (rp23AngleDeg >= 45 && rp23AngleDeg <= 70) rp23Level = 'L3';
        else if (rp23AngleDeg >= 40 && rp23AngleDeg <= 75) rp23Level = 'L2';
        else if (rp23AngleDeg >= 35 && rp23AngleDeg <= 80) rp23Level = 'L1';
        else rp23Level = 'N/A';
      }
    }

    // Build base tooltip data
    const data = {
      seatId: effectiveHoveredSeat.id || 'Seat',
      isPrimary: effectiveHoveredSeat.isPrimary || false,
      position: `(${seatX.toFixed(2)}m, ${seatY.toFixed(2)}m)`,
      distanceToScreen: Number.isFinite(distanceToScreen) ? `${distanceToScreen.toFixed(2)}m` : '—',
      distanceToMLP: Number.isFinite(distanceToMLP) ? `${distanceToMLP.toFixed(2)}m` : '—',
      rp23: {
        angleDeg: rp23AngleDeg,
        level: rp23Level,
        formatted: Number.isFinite(rp23AngleDeg) ? `${rp23AngleDeg.toFixed(1)}°` : '—',
      }
    };

    // Initialize RP22 section with all metrics present (defaults to "—")
    data.rp22 = {
      p1: { valueM: null, level: '—', formatted: '—' },
      p4: { valueDb: null, level: '—', formatted: '—' },
      p5: { valueDeg: null, level: '—', formatted: '—' },
      p6: { valueDb: null, level: '—', formatted: '—' },
      p9: { valueDeg: null, level: '—', formatted: '—' },
      p10: { valueDb: null, level: '—', formatted: '—' },
      p16: { valueDeg: null, level: '—', formatted: '—' }, 
      p17: { valueDeg: null, level: '—', formatted: '—' }, 
      p20: { valueDeg: null, level: '—', formatted: '—' },
    };

    // Initialize SPL @ Seat section
    data.splAtSeat = {
      lcr: {},
      surrounds: {},
      overheads: {}
    };

    // Helper: check if speaker has valid position
    const hasPos = s => s?.position && Number.isFinite(s.position.x) && Number.isFinite(s.position.y);

    // Helper for low-level SPL calculation
    const _calculateSplFromComponentsForTooltip = (speakerPosition, seatPosition, sensitivityDb, powerW) => {
      if (!Number.isFinite(sensitivityDb) || !Number.isFinite(powerW) || powerW <= 0) return null;
      if (!speakerPosition || !Number.isFinite(speakerPosition.x) || !Number.isFinite(speakerPosition.y)) return null;
      if (!seatPosition || !Number.isFinite(seatPosition.x) || !Number.isFinite(seatPosition.y)) return null;

      const dx = speakerPosition.x - seatPosition.x;
      const dy = speakerPosition.y - seatPosition.y;
      const dz = (speakerPosition.z || 1.2) - (seatPosition.z || 1.2); 

      const distance = Math.max(0.10, Math.hypot(dx, dy, dz)); // 10cm floor
      
      const spl = sensitivityDb + 10 * Math.log10(powerW) - 20 * Math.log10(distance);
      
      return Number.isFinite(spl) ? spl : null;
    };


    // Role sets
    const screenRoles = new Set(['FL','FC','FR']);
    const surroundRoles = new Set(['SL','SR','SBL','SBR','LW','RW']);
    const overheadRoles = new Set(['TFL','TFR','TML','TMR','TBL','TBR','TL','TR','TFC','TBC']);

    // Filter placed speakers by category (only those with valid positions)
    const placed = Array.isArray(placedSpeakers) ? placedSpeakers.filter(hasPos) : [];
    const placedLCR = placed.filter(s => screenRoles.has(getCanonicalRole(s.role)));
    const placedSur = placed.filter(s => surroundRoles.has(getCanonicalRole(s.role)));
    const placedOH = placed.filter(s => overheadRoles.has(getCanonicalRole(s.role)));

    // Helper: max pairwise delta
    const maxPairwiseDelta = (values) => {
      if (!values || values.length < 2) return null;
      let maxDelta = 0;
      for (let i = 0; i < values.length; i++) {
        for (let j = i + 1; j < values.length; j++) {
          const delta = Math.abs(values[i] - values[j]);
          if (delta > maxDelta) maxDelta = delta;
        }
      }
      return maxDelta;
    };

    const seatPos = { x: seatX, y: seatY, z: seatZ };

    // --- Compute SPL @ Seat for all categories (using appState for power) ---
    const processSpeakersForSplAtSeat = (speakerArray, categoryKey) => {
      for (const spk of speakerArray) {
        const role = getCanonicalRole(spk.role);
        const speakerMeta = getModelDimsM(spk.model);
        const effectiveSplInputs = appState.getEffectiveSplInputs(spk.role); // Get power from appState

        const spl = _calculateSplFromComponentsForTooltip(
          spk.position,
          seatPos,
          effectiveSplInputs?.sensitivity_dB_1w1m || effectiveSplInputs?.sensitivity || speakerMeta?.sensitivity_dB_1w1m || speakerMeta?.sensitivity || 87, // Use effective sensitivity or fallback
          effectiveSplInputs?.powerW || 100 // Fallback to 100W if appState power is missing
        );

        if (Number.isFinite(spl)) {
          data.splAtSeat[categoryKey][role] = {
            value: spl,
            formatted: `${spl.toFixed(1)} dB`
          };
        }
      }
    };

    processSpeakersForSplAtSeat(placedLCR, 'lcr');
    processSpeakersForSplAtSeat(placedSur, 'surrounds');
    processSpeakersForSplAtSeat(placedOH, 'overheads');

    // --- Compute P1: Nearest boundary distance ---
    if (Number.isFinite(seatX) && Number.isFinite(seatY)) {
      const isCenterlineX = seatX < 0 || (
        Array.isArray(seatingPositions) && 
        seatingPositions.some(s => Number(s?.x) < 0)
      );

      const xLeftWall = isCenterlineX 
        ? Math.max(0, Math.min(roomWidth, halfW + seatX))
        : Math.max(0, Math.min(roomWidth, seatX));

      const yFromScreenPlane = Math.max(0, seatY);

      const p1ValueM = metricP1_nearestWallM({
        xLeftWall,
        yFromScreenPlane,
        widthM: roomWidth,
        lengthM: roomLength,
        screenFrontPlaneM,
      });

      if (Number.isFinite(p1ValueM)) {
        data.rp22.p1 = {
          valueM: p1ValueM,
          level: rp22LevelForP1(p1ValueM),
          formatted: `${p1ValueM.toFixed(2)}m (nearest)`
        };
      }
    }

    // --- Compute P4: Max SPL difference between screen speakers ---
    if (placedLCR.length >= 2) {
      const lcrSpls = [];
      
      for (let spk of placedLCR) {
        const speakerMeta = getModelDimsM(spk.model);
        const effectiveSplInputs = appState.getEffectiveSplInputs(spk.role);
        const sensitivity = effectiveSplInputs?.sensitivity_dB_1w1m || effectiveSplInputs?.sensitivity || speakerMeta?.sensitivity_dB_1w1m || speakerMeta?.sensitivity || 87;
        const powerW = effectiveSplInputs?.powerW || 100;

        if (!Number.isFinite(sensitivity)) continue;
        
        const spl = _calculateSplFromComponentsForTooltip(spk.position, seatPos, sensitivity, powerW);
        
        if (Number.isFinite(spl)) {
          lcrSpls.push({ role: getCanonicalRole(spk.role), spl });
        }
      }
      
      if (lcrSpls.length >= 2) {
        let maxDelta = 0;
        
        for (let i = 0; i < lcrSpls.length; i++) {
          for (let j = i + 1; j < lcrSpls.length; j++) {
            const delta = Math.abs(lcrSpls[i].spl - lcrSpls[j].spl);
            if (delta > maxDelta) maxDelta = delta;
          }
        }
        
        const valueDb = maxDelta;
        
        data.rp22.p4 = {
          valueDb,
          level: rp22LevelForP4(valueDb),
          formatted: `${Math.floor(valueDb)} dB (screen)`
        };
      }
    }

    // --- Compute P5: Max horizontal gap between adjacent surrounds (no wrap) ---
    // Build eligible surrounds for P5
    const allSurrounds = (placedSpeakers || []).filter(s => {
      const r = getCanonicalRole(s.role);
      return ['SL', 'SR', 'SBL', 'SBR', 'LW', 'RW'].includes(r);
    });

    const hasSL = allSurrounds.some(s => getCanonicalRole(s.role) === 'SL');
    const hasSR = allSurrounds.some(s => getCanonicalRole(s.role) === 'SR');

    const eligibleSurrounds = allSurrounds.filter(s => {
      const r = getCanonicalRole(s.role);
      if (r === 'LW' || r === 'RW') return hasSL && hasSR;
      return true;
    });

    let p5Val = null;
    let p5Level = '—';
    let p5Formatted = '—';

    if (effectiveHoveredSeat && Array.isArray(eligibleSurrounds) && eligibleSurrounds.length >= 2) {
      p5Val = metricP5_maxSurroundGapNoWrap({
        seat: effectiveHoveredSeat,
        surrounds: eligibleSurrounds,
        toPoint: sp => sp?.position,
      });
      
      if (Number.isFinite(p5Val)) {
        p5Level = rp22LevelForP5_NoWrap(p5Val);
        p5Formatted = `${p5Val.toFixed(1)}° (sur spacing)`;
      }
    }
    // Publish P5 to HUD
    data.rp22.p5 = { valueDeg: p5Val, level: p5Level, formatted: p5Formatted };

    // --- P6: Surround SPL delta (requires ≥2 surrounds) ---
    if (placedSur.length >= 2) {
      const rp22SplValues = [];
      for (const spk of placedSur) {
        const speakerMeta = getModelDimsM(spk.model);
        const effectiveSplInputs = appState.getEffectiveSplInputs(spk.role);
        const sensitivity = effectiveSplInputs?.sensitivity_dB_1w1m || effectiveSplInputs?.sensitivity || speakerMeta?.sensitivity_dB_1w1m || speakerMeta?.sensitivity || 87;
        const powerW = effectiveSplInputs?.powerW || 100;

        const spl = _calculateSplFromComponentsForTooltip(
          spk.position,
          seatPos,
          sensitivity,
          powerW
        );
        if (Number.isFinite(spl)) rp22SplValues.push(spl);
      }

      const p6ValueDb = maxPairwiseDelta(rp22SplValues);
      if (Number.isFinite(p6ValueDb)) {
        let level = '—';
        if (p6ValueDb <= 2) level = 'L4';
        else if (p6ValueDb <= 4) level = 'L3';
        else if (p6ValueDb <= 6) level = 'L2';
        else if (p6ValueDb <= 10) level = 'L1';

        data.rp22.p6 = {
          valueDb: p6ValueDb,
          level,
          formatted: `${Math.floor(p6ValueDb)} dB (sur)`
        };
      }
    }

    // --- P9: Overhead Row Gap Deg ---
    // Placeholder for now - uses SeatRP22 logic
    if (typeof metricP1_nearestWallM.p9_overheadRowGapDeg === 'function') { // corrected reference
      const valueDeg = metricP1_nearestWallM.p9_overheadRowGapDeg( // corrected reference
        { x: seatX, y: seatY, z: seatZ },
        placed // Pass all placed speakers for full context
      );
      if (Number.isFinite(valueDeg)) {
        data.rp22.p9 = {
          valueDeg,
          level: metricP1_nearestWallM.p9_level?.(valueDeg) || '—', // corrected reference
          formatted: `${valueDeg.toFixed(1)}° (upper spacing)`
        };
      }
    }
    
    // --- P10: Overhead SPL delta (requires ≥2 overheads) ---
    if (placedOH.length >= 2) {
      const rp22SplValues = [];
      for (const spk of placedOH) {
        const speakerMeta = getModelDimsM(spk.model);
        const effectiveSplInputs = appState.getEffectiveSplInputs(spk.role);
        const sensitivity = effectiveSplInputs?.sensitivity_dB_1w1m || effectiveSplInputs?.sensitivity || speakerMeta?.sensitivity_dB_1w1m || speakerMeta?.sensitivity || 87;
        const powerW = effectiveSplInputs?.powerW || 100;

        const spl = _calculateSplFromComponentsForTooltip(
          spk.position,
          seatPos,
          sensitivity,
          powerW
        );
        if (Number.isFinite(spl)) rp22SplValues.push(spl);
      }

      const p10ValueDb = maxPairwiseDelta(rp22SplValues);
      if (Number.isFinite(p10ValueDb)) {
        let level = '—';
        if (p10ValueDb <= 2) level = 'L4';
        else if (p10ValueDb <= 5) level = 'L3';
        else if (p10ValueDb <= 8) level = 'L2';
        else if (p10ValueDb <= 12) level = 'L1';

        data.rp22.p10 = {
          valueDb: p10ValueDb,
          level,
          formatted: `±${Math.floor(p10ValueDb)} dB (upper)`
        };
      }
    }

    // P16: Screen Angle H Deg
    if (typeof metricP1_nearestWallM.p16_screenAngleH_deg === 'function') { // corrected reference
      const valueDeg = metricP1_nearestWallM.p16_screenAngleH_deg( // corrected reference
        { x: seatX, y: seatY, z: seatZ },
        screen
      );
      if (Number.isFinite(valueDeg)) {
        data.rp22.p16 = {
          valueDeg,
          level: metricP1_nearestWallM.p16_level?.(valueDeg) || '—', // corrected reference
          formatted: `${valueDeg.toFixed(1)}° (H Angle)`
        };
      }
    }

    // P17: Screen Angle V Deg
    if (typeof metricP1_nearestWallM.p17_screenAngleV_deg === 'function') { // corrected reference
      const valueDeg = metricP1_nearestWallM.p17_screenAngleV_deg( // corrected reference
        { x: seatX, y: seatY, z: seatZ },
        screen,
        screenFrontPlaneM
      );
      if (Number.isFinite(valueDeg)) {
        data.rp22.p17 = {
          valueDeg,
          level: metricP1_nearestWallM.p17_level?.(valueDeg) || '—', // corrected reference
          formatted: `${valueDeg.toFixed(1)}° (V Angle)`
        };
      }
    }

    // P20: Seat Separation Deg
    if (typeof metricP1_nearestWallM.p20_seatSeparation_deg === 'function') { // corrected reference
      const valueDeg = metricP1_nearestWallM.p20_seatSeparation_deg( // corrected reference
        { x: seatX, y: seatY, z: seatZ },
        seatingPositions
      );
      if (Number.isFinite(valueDeg)) {
        data.rp22.p20 = {
          valueDeg,
          level: metricP1_nearestWallM.p20_level?.(valueDeg) || '—', // corrected reference
          formatted: `${valueDeg.toFixed(1)}° (seat sep)`
        };
      }
    }

    // Legacy bridge
    data.p1NearestM = data.rp22.p1.valueM;

    return data;
  }, [
    effectiveHoveredSeat,
    placedSpeakers, // Added for P5 and general SPL calculations
    widthM, // Use new widthM
    lengthM, // Use new lengthM
    screenFrontPlaneM, // Dependency for screenFrontPlaneM
    mlp,
    screen?.visibleWidthInches,
    seatingPositions, // Added for P1 convention detection and P20
    getModelDimsM, // Added for SPL calculations
    screen, // Added for P16/P17 to pass screen object
    appState, // Added for SPL calculations
    heightM, // Use new heightM
    getCanonicalRole
  ]);

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

      if (Object.keys(constraints).length > 0) {
        if (typeof console !== 'undefined' && typeof console.groupCollapsed === 'function') {
          console.groupCollapsed('[LCR Constraints] Phase 1 - Movement Corridors');

          Object.entries(constraints).forEach(([role, data]) => {
            const { clamp, currentX, iconWidthM, travelDistance, canMove } = data;
            console.log(`${role}:`, {
              currentX: currentX.toFixed(3),
              allowedRange: `[${clamp.minX.toFixed(3)}, ${clamp.maxX.toFixed(3)}]`,
              iconWidth: `${iconWidthM.toFixed(3)}m`,
              travelDistance: `${travelDistance.toFixed(3)}m`,
              canMove,
              model: data.model || 'undefined'
            });
          });

          if (typeof console.groupEnd === 'function') console.groupEnd();
        }
      }
    } catch (error) {
      if (typeof console !== "undefined" && typeof console.warn === "function") {
        console.warn('[LCR Constraints] Error calculating constraints:', error);
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

  // [NEW] Auto-hug surrounds to walls when room dimensions change
  useEffect(() => {
    if (!onSetSpeakers || !placedSpeakers?.length) return;

    const W = widthM || 0;
    const L = lengthM || 0;
    if (!(W > 0 && L > 0)) return;

    let needsUpdate = false;
    const updated = placedSpeakers.map(spk => {
      const canon = getCanonicalRole(spk.role);
      
      // [B44 REAR FIX] Only process SIDE wall speakers (SL/SR/LW/RW)
      // SBL/SBR are handled by SpeakerPlacement and should NOT be auto-hugged to side walls
      if (!['SL', 'SR', 'LW', 'RW'].includes(canon)) return spk;
      if (!spk.position || !spk.model) return spk;

      const dims = getModelDimsM(spk.model);
      const isLeft = ['SL', 'LW'].includes(canon);
      const side = isLeft ? 'L' : 'R';

      // Calculate correct wall-hugged X using same helper as drag code
      const targetX = fixedSideX(W, dims, side, WALL_BUFFER_M);
      const currentX = Number(spk.position.x) || 0;

      // Only update if position has actually changed
      if (Math.abs(currentX - targetX) > 0.001) {
        needsUpdate = true;
        return {
          ...spk,
          position: { ...spk.position, x: targetX }
        };
      }

      return spk;
    });

    if (needsUpdate) {
      onSetSpeakers(updated);
    }
  }, [widthM, lengthM, placedSpeakers, onSetSpeakers, getModelDimsM, getCanonicalRole]);

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

  // [B44] DISABLED: SL/SR positions now come from SpeakerPlacement only
  // This effect has been disabled to prevent RV from overwriting state-driven positions
  useEffect(() => {
    // [B44] Legacy corridor/constraint logic for SL/SR disabled.
    // Bed-layer geometry is fully handled by SpeakerPlacement / resetSurroundPositions.
    return; // Early exit - effect is now a no-op
    
    /* ORIGINAL LOGIC DISABLED:
    if (!onSetSpeakers) return;
    if (isDraggingRearRef.current > 0) return;
    if (timeNowMs() - lastInteractionEpoch.current < 500) return;

    const W = widthM || 0;
    const L = lengthM || 0;
    if (!(W > 0 && L > 0)) return;

    const sl = placedSpeakers.find(s => getCanonicalRole(s.role) === 'SL');
    const sr = placedSpeakers.find(s => getCanonicalRole(s.role) === 'SR');
    const sbl = placedSpeakers.find(s => getCanonicalRole(s.role) === 'SBL');
    const sbr = placedSpeakers.find(s => getCanonicalRole(s.role) === 'SBR');

    if (!sl || !sr) return;

    const dimsL = getSpeakerDims(sl.model);
    const dimsR = getSpeakerDims(sr.model);
    const curY_sl = Number(sl?.position?.y);
    const curY_sr = Number(sr?.position?.y);

    const yMax_side_for_hysteresis = Math.max(
      Number(sideSurroundVisualSpanM?.minY) || 0,
      Math.min(Number(sideSurroundVisualSpanM?.maxY) || 0, L - CORNER_CLEAR_M)
    );

    let currentRefMode = slsrModeRef.current;
    let nextModeBasedOnPosition = currentRefMode;

    if (currentRefMode === 'back') {
      if (curY_sl < (yMax_side_for_hysteresis - BACKWALL_HYSTERESIS_M)) {
        nextModeBasedOnPosition = 'side';
        if (DBG_SS) console.log('[SS live] position implies side mode: back -> side');
      }
    } else if (currentRefMode === 'side') {
      if (curY_sl > (yMax_side_for_hysteresis + BACKWALL_HYSTERESIS_M)) {
        nextModeBasedOnPosition = 'back';
        if (DBG_SS) console.log('[SS live] position implies back mode: side -> back');
      }
    }
    slsrModeRef.current = nextModeBasedOnPosition;

    if (DBG_SS) {
      try {
        const yMax_side_live = Number(sideSurroundVisualSpanM?.maxY) || 0;
        const onBackCheck = isOnBackWall(curY_sl, dimsL, L);

        console.log('[SS live] snapshot', {
          currentRefMode: currentRefMode,
          nextModeBasedOnPosition: nextModeBasedOnPosition,
          ySL: curY_sl?.toFixed?.(3), ySR: curY_sr?.toFixed?.(3),
          yMax_side_live: yMax_side_live?.toFixed?.(3),
          onBackCheck,
        });
      } catch (_) {}
    }

    if (slsrModeRef.current === 'side') {
      const xL_side = fixedSideX(W, dimsL, 'L');
      const xR_side = fixedSideX(W, dimsR, 'R');

      const segL = sideSegmentAtX(_overlays?.sideSurroundZone, xL_side, L);
      const segR = sideSegmentAtX(_overlays?.sideSurroundZone, xR_side, L);

      const yMin_side_calc = Number(sideSurroundVisualSpanM?.minY) || 0;
      const yMax_visual_calc = Number(sideSurroundVisualSpanM?.maxY) || 0;
      const yMax_clamp_calc = Math.max(yMin_side_calc, Math.min(yMax_visual_calc, L - CORNER_CLEAR_M));

      const yMin = yMin_side_calc;
      const yMax = yMax_clamp_calc;

      let yStar = resolveSymmetricY(curY_sl, segL, segR);

      const RS_SIDE_EPS = 0.02;
      if (yStar >= (yMax - RS_SIDE_EPS)) {
        yStar = Math.max(yMin, yMax - RS_SIDE_EPS);
      }

      try {
        // Check SBL vs SL - only adjust if actual overlap exists
        if (sbl && isOnSideWall('L', sbl, W)) {
          const halfRS = (speakerOnWallYFootprint(getModelDimsM(sbl.model)) || 0) / 2;
          const halfSS = (speakerOnWallYFootprint(getModelDimsM(sl.model)) || 0) / 2;
          const minSep = halfRS + halfSS + SS_RS_BUFFER_M;
          const yObstacle = Number(sbl?.position?.y)||0;
          const yPrevSBL = Number(sbl?.position?.y); // Use SBL's previous Y
          const yPrevSL = Number(sl?.position?.y); // Use SL's previous Y
          const overlap = (Math.abs(yStar - yObstacle) < (minSep - 0.005));
          if (overlap) {
            yStar = nonCrossingClampDirectional(yPrevSL, yStar, yObstacle, minSep);
            yStar = Math.min(Math.max(yStar, yMin), yMax);
          }
        }

        // Check SBR vs SR - only adjust if actual overlap exists
        if (sbr && isOnSideWall('R', sbr, W)) {
          const halfRS = (speakerOnWallYFootprint(getModelDimsM(sbr.model)) || 0) / 2;
          const halfSS = (speakerOnWallYFootprint(getModelDimsM(sr.model)) || 0) / 2;
          const minSep = halfRS + halfSS + SS_RS_BUFFER_M;
          const yObstacle = Number(sbr?.position?.y)||0;
          const yPrevSBR = Number(sbr?.position?.y); // Use SBR's previous Y
          const yPrevSR = Number(sr?.position?.y); // Use SR's previous Y
          const overlap = (Math.abs(yStar - yObstacle) < (minSep - 0.005));
          if (overlap) {
            yStar = nonCrossingClampDirectional(yPrevSR, yStar, yObstacle, minSep);
            yStar = Math.min(Math.max(yStar, yMin), yMax);
          }
        }

        if (DBG_SS) {
          console.log('[SS live] yStar with clearance', { yStar: yStar?.toFixed?.(3) });
        }

      } catch (_e) {
        console.warn("Error applying SL/SR vs SBL/SBR clearance during auto-adjust:", _e);
      }

      const xL_cur = Number(sl?.position?.x);
      const xR_cur = Number(sr?.position?.x);
      const needsUpdate = Math.abs(yStar - curY_sl) > RS_EPS ||
                          Math.abs(xL_cur - xL_side) > RS_EPS ||
                          Math.abs(xR_cur - xR_side) > RS_EPS;

      if (!needsUpdate) return;

      onSetSpeakers(prev => prev.map(s => {
        const role = getCanonicalRole(s.role);
        if (role === 'SL') return { ...s, position: { ...(s.position || {}), x: xL_side, y: yStar } };
        if (role === 'SR') return { ...s, position: { ...(s.position || {}), x: xR_side, y: yStar } };
        return s;
      }));

      return;
    }

    // back-wall enforcement
    const roomWidth = widthM || 0;
    const lanes = rearSurroundVisualLanes ?? {};
    const leftLane = lanes.left ?? { minX: 0, maxX: roomWidth };
    const leftLaneMin = leftLane.minX;
    const leftLaneMax = leftLane.maxX;

    const curXL = Number(sl?.position?.x);
    if (!Number.isFinite(curXL)) {
      return;
    }
    const xL_star = clamp(curXL, leftLaneMin, leftLaneMax);
    const xR_star = roomWidth - xL_star;

    const yL = backWallYForDims(getSpeakerDims(sl.model), L, WALL_BUFFER_M);
    const yR = backWallYForDims(getSpeakerDims(sr.model), L, WALL_BUFFER_M);

    const xL_cur = Number(sl?.position?.x);
    const yL_cur = Number(sl?.position?.y);
    const xR_cur = Number(sr?.position?.x);
    const yR_cur = Number(sr?.position?.y);

    const needsUpdate = Math.abs(xL_cur - xL_star) > RS_EPS ||
                          Math.abs(yL_cur - yL) > RS_EPS ||
                          Math.abs(xR_cur - xR_star) > RS_EPS ||
                          Math.abs(yR_cur - yR) > RS_EPS;

    if (DBG_SS) {
      console.log('[SS live] back-wall enforcement', {
        curXL: curXL?.toFixed?.(3), xL_star: xL_star?.toFixed?.(3),
        curYL: yL_cur?.toFixed?.(3), yL: yL?.toFixed?.(3),
        curXR: xR_cur?.toFixed?.(3), yR: yR?.toFixed?.(3),
        needsUpdate
      });
    }

    if (!needsUpdate) return;

    onSetSpeakers(prev => prev.map(s => {
      const r = getCanonicalRole(s.role);
      if (r === 'SL') return { ...s, position: { ...(s.position || {}), x: xL_star, y: yL } };
      if (r === 'SR') return { ...s, position: { ...(s.position || {}), x: xR_star, y: yR } };
      return s;
    }));
    */
  }, [placedSpeakers, widthM, lengthM, sideSurroundVisualSpanM, onSetSpeakers, rearSurroundVisualLanes, _overlays?.sideSurroundZone, slsrModeRef, getModelDimsM, getCanonicalRole]); // Use new dimension variables

  // [B44] DISABLED: SBL/SBR positions now come from SpeakerPlacement only
  // This effect has has been disabled to prevent RV from overwriting state-driven positions
  React.useEffect(() => {
    // [B44] Legacy corridor/constraint logic for SBL/SBR disabled.
    // Bed-layer geometry is fully handled by SpeakerPlacement / resetSurroundPositions.
    return; // Early exit - effect is now a no-op
    
    /* ORIGINAL LOGIC DISABLED:
    if (isDraggingRearRef.current > 0) {
      return;
    }

    if (timeNowMs() - (lastInteractionEpoch?.current || 0) < 500) return;
    if (!onSetSpeakers) return;

    rsLastLiveResetEpoch.current = timeNowMs();

    const sbl = placedSpeakers.find(s => getCanonicalRole(s.role) === 'SBL');
    const sbr = placedSpeakers.find(s => getCanonicalRole(s.role) === 'SBR');
    if (!sbl || !sbr) return;

    const W = widthM || 0;
    const L = lengthM || 0;
    if (!(W > 0 && L > 0)) return;

    const dimsL = getSpeakerDims(sbl.model);
    const dimsR = getSpeakerDims(sbr.model);
    const yL_sbl_cur = Number(sbl?.position?.y);
    const yR_sbr_cur = Number(sbr?.position?.y);

    const yMax_side_for_hysteresis = Math.max(
      Number(sideSurroundVisualSpanM?.minY) || 0,
      Math.min(Number(sideSurroundVisualSpanM?.maxY) || 0, L - CORNER_CLEAR_M)
    );

    let currentRefMode = rearModeRef.current;
    let nextModeBasedOnPosition = currentRefMode;

    if (currentRefMode === 'back') {
        if (yL_sbl_cur < (yMax_side_for_hysteresis - BACKWALL_HYSTERESIS_M)) {
            nextModeBasedOnPosition = 'side';
            if (DBG_RS) console.log('[RS live] position implies side mode: back -> side');
        }
    } else if (currentRefMode === 'side') {
        if (yL_sbl_cur > (yMax_side_for_hysteresis + BACKWALL_HYSTERESIS_M)) {
            nextModeBasedOnPosition = 'back';
            if (DBG_RS) console.log('[RS live] position implies back mode: side -> back');
        }
    }

    rearModeRef.current = nextModeBasedOnPosition;

    if (DBG_RS) {
      try {
        const yMax_side_live = Number(sideSurroundVisualSpanM?.maxY) || 0;
        const onBackCheck = isOnBackWall(yL_sbl_cur, dimsL, L);

        console.log('[RS live] snapshot', {
          currentRefMode: currentRefMode,
          nextModeBasedOnPosition: nextModeBasedOnPosition,
          ySBL: yL_sbl_cur?.toFixed?.(3), ySBR: yR_sbr_cur?.toFixed?.(3),
          yMax_side_live: yMax_side_live?.toFixed?.(3),
          onBackCheck,
          lanes: rearSurroundVisualLanes
        });
      } catch (_) {}
    }

    if (rearModeRef.current === 'side') {
      const xL_side = fixedSideX(W, dimsL, 'L');
      const xR_side = fixedSideX(W, dimsR, 'R');

      const yMin_side_calc = Number(sideSurroundVisualSpanM?.minY) || 0;
      const yMax_visual_calc = Number(sideSurroundVisualSpanM?.maxY) || 0;
      const yMax_clamp_calc = Math.max(yMin_side_calc, Math.min(yMax_visual_calc, L - CORNER_CLEAR_M));

      const yMin = yMin_side_calc;
      const yMax = yMax_clamp_calc;

      let yStar = Math.min(yMax, Math.max(yMin, yL_sbl_cur));

      const RS_SIDE_EPS = 0.02;
      if (yStar >= (yMax - RS_SIDE_EPS)) {
        yStar = Math.max(yMin, yMax - RS_SIDE_EPS);
      }

      const slSpeaker = placedSpeakers.find(s => getCanonicalRole(s.role) === 'SL');
      const srSpeaker = placedSpeakers.find(s => getCanonicalRole(s.role) === 'SR');

      if (slSpeaker && isOnSideWall('L', slSpeaker, W)) {
        const halfRS = (speakerOnWallYFootprint(getModelDimsM(sbl.model)) || 0) / 2;
        const halfSS = (speakerOnWallYFootprint(getModelDimsM(slSpeaker.model)) || 0) / 2;
        const minSep = halfRS + halfSS + SS_RS_BUFFER_M;
        const yObstacle = Number(slSpeaker?.position?.y)||0;
        const yPrevSBL = Number(sbl?.position?.y); // Use SBL's previous Y
        const overlap = (Math.abs(yStar - yObstacle) < (minSep - 0.005));
        if (overlap) {
          yStar = nonCrossingClampDirectional(yPrevSBL, yStar, yObstacle, minSep);
          yStar = Math.min(Math.max(yStar, yMin), yMax);
        }
      }

      if (srSpeaker && isOnSideWall('R', srSpeaker, W)) {
        const halfRS = (speakerOnWallYFootprint(getModelDimsM(sbr.model)) || 0) / 2;
        const halfSS = (speakerOnWallYFootprint(getModelDimsM(srSpeaker.model)) || 0) / 2;
        const minSep = halfRS + halfSS + SS_RS_BUFFER_M;
        const yObstacle = Number(srSpeaker?.position?.y)||0;
        const yPrevSBR = Number(sbr?.position?.y); // Use SBR's previous Y
        const overlap = (Math.abs(yStar - yObstacle) < (minSep - 0.005));
        if (overlap) {
          yStar = nonCrossingClampDirectional(yPrevSBR, yStar, yObstacle, minSep);
          yStar = Math.min(Math.max(yStar, yMin), yMax);
        }
      }

      const curXL = Number(sbl?.position?.x);
      const curXR = Number(sbr?.position?.x);
      const xL_target = fixedSideX(W, dimsL, 'L');
      const xR_target = fixedSideX(W, dimsR, 'R');

      const need = Math.abs(curXL - xL_target) > RS_EPS ||
                   Math.abs(curXR - xR_target) > RS_EPS ||
                   Math.abs(yL_sbl_cur - yStar) > RS_EPS ||
                   Math.abs(yR_sbr_cur - yStar) > RS_EPS;

      if (DBG_RS && need) {
        console.log('[RS live] side-wall auto-correct:', {
          curXL: curXL?.toFixed?.(3), xL_target: xL_target?.toFixed?.(3),
          curXR: curXR?.toFixed?.(3), xR_target: xR_target?.toFixed?.(3),
          curYL: yL_sbl_cur?.toFixed?.(3), curYR: yR_sbr_cur?.toFixed?.(3),
          yStar: yStar?.toFixed?.(3),
          need
        });
      }

      if (!need) {
        return;
      }

      onSetSpeakers(prev => prev.map(s => {
        const r = getCanonicalRole(s.role);
        if (r === 'SBL') return { ...s, position: { ...(s.position||{}), x: xL_side, y: yStar } };
        if (r === 'SBR') return { ...s, position: { ...(s.position||{}), x: xR_side, y: yStar } };
        return s;
      }));

      return;
    }

    // BACK-WALL MODE MAINTENANCE for rears (keep existing logic)
    const yBackL = backWallYForDims(dimsL, L, WALL_BUFFER_M);
    const yBackR = backWallYForDims(dimsR, L, WALL_BUFFER_M);
    const yBack = Math.max(yBackL, yBackR);

    const lanes = rearSurroundVisualLanes ?? {};
    const leftLane  = lanes.left  ?? { minX: 0, maxX: W };
    const rightLane = lanes.right ?? { minX: 0, maxX: W };

    let baseMin = Number(leftLane.minX ?? 0);
    let baseMax = Number(leftLane.maxX ?? W);

    if (!(baseMax > baseMin)) {
      baseMin = 0;
      baseMax = W;
    }

    const halfRS = Math.max(halfWidthOnWall(dimsL), halfWidthOnWall(dimsR));
    baseMin += halfRS;
    baseMax -= halfRS;

    const exclusions = [];
    if (sideSurroundsOnBackWall(placedSpeakers, L)) {
      const sl = placedSpeakers.find(s => getCanonicalRole(s.role) === 'SL');
      const sr = placedSpeakers.find(s => getCanonicalRole(s.role) === 'SR');
      function addEx(ss) {
        if (!ss) return;
        const d = getSpeakerDims(ss.model);
        if (!isOnBackWall(ss?.position?.y, d, L)) return;
        const halfSS = halfWidthOnWall(d);
        const cx = Number(ss?.position?.x) || 0;
        const pad = halfSS + halfRS + RS_CLEAR_M;
        exclusions.push([cx - pad, cx + pad]);
      }
      addEx(sl);
      addEx(sr);
    }

    const curXL = Number(sbl?.position?.x);
    if (!Number.isFinite(curXL)) {
      return;
    }
    const xL_star = clampToAllowedWithExclusions(curXL, baseMin, baseMax, exclusions);
    const xR_star = computeSymmetricXR(W, xL_star);

    const need = Math.abs(curXL - xL_star) > RS_EPS ||
                 Math.abs((sbr?.position?.x||0) - xR_star) > RS_EPS ||
                 Math.abs(yL_sbl_cur - yBack) > RS_EPS ||
                 Math.abs(yR_sbr_cur - yBack) > RS_EPS;

    if (DBG_RS && need) {
      console.log('[RS live] back-wall auto-correct:', {
        curXL: curXL?.toFixed?.(3), xL_star: xL_star?.toFixed?.(3),
        curXR: (sbr?.position?.x||0)?.toFixed?.(3), xR_star: xR_star?.toFixed?.(3),
        curYL: yL_sbl_cur?.toFixed?.(3), yBackL: yBackL?.toFixed?.(3),
        curYR: yR_sbr_cur?.toFixed?.(3), yBackR: yBackR?.toFixed?.(3),
        need
      });
    }


    if (!need) {
      return;
    }

    onSetSpeakers(prev => prev.map(s => {
      const r = getCanonicalRole(s.role);
      if (r === 'SBL') return { ...s, position: { ...(s.position||{}), x: xL_star, y: yBack } };
      if (r === 'SBR') return { ...s, position: { ...(s.position||{}), x: xR_star, y: yBack } };
      return s;
    }));
    */
  }, [placedSpeakers, onSetSpeakers, widthM, lengthM, sideSurroundVisualSpanM, rearSurroundVisualLanes, rearModeRef, getModelDimsM, getCanonicalRole]); // Use new dimension variables

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
    
    // Add overhead zones to overlay state - only when toggle is enabled
    base.OVERHEADS = (_overlays?.OVERHEADS && overheadZones?.status === 'ok') ? overheadZones : null;

    return base;
  }, [_overlays, listeningAreaBounds, frontWideZones, enableFrontWides, rp22AnglesEnabled, overheadZones]);

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

    // Respect visibleRoles from appState if it exists
    const vis = appState?.visibleRoles;
    if (!vis || !(vis instanceof Set)) {
      return withoutLfe;
    }

    // Only keep speakers whose canonical role is in the visibleRoles set
    return withoutLfe.filter((spk) => vis.has(getCanonicalRole(spk.role)));
  }, [placedSpeakers, appState?.visibleRoles, getCanonicalRole]);


  // Light diagnostics (temporary)
  if (appState_DBG_FW) {
    if (typeof console !== 'undefined') console.log(`[FrontWides] dolbyLayout: "${dolbyLayout}", enableFrontWides: ${enableFrontWides}, zones:`, frontWideZones);
  }

  // Get overhead count from dolbyLayout
  const overheadCount = useMemo(() => {
    if (!dolbyLayout) return 0;
    const parts = String(dolbyLayout).split('.');
    if (parts.length < 3) return 0;
    return parseInt(parts[2]) || 0;
  }, [dolbyLayout]);

  // Ensure all required overhead pairs exist before auto-placement
  useEnsureOverheadPairs({
    dolbyConfiguration: dolbyLayout,
    placedSpeakers,
    setPlacedSpeakers: onSetSpeakers,
    useWidesInsteadOfRears: appState?.useWidesInsteadOfRears || false
  });

  // Auto-place overhead speakers at zone centers
  useOverheadAutoPlacement({
    placedSpeakers,
    setPlacedSpeakers: onSetSpeakers,
    overheadZones,
    getCanonicalRole,
    overheadCount,
    hasManualOverheadEdit
  });

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

  // Get effective model for each overhead position
  const getOverheadModelForPosition = useCallback((position) => {
    if (!overheadGlobalModel || overheadGlobalModel === 'OFF') return null;

    if (position === 'front') {
      return useFrontGlobal ? overheadGlobalModel : (overheadFrontOverride || overheadGlobalModel);
    }
    if (position === 'mid') {
      return useMidGlobal ? overheadGlobalModel : (overheadMidOverride || overheadGlobalModel);
    }
    if (position === 'rear') {
      return useRearGlobal ? overheadGlobalModel : (overheadRearOverride || overheadGlobalModel);
    }
    return null;
  }, [overheadGlobalModel, useFrontGlobal, useMidGlobal, useRearGlobal, overheadFrontOverride, overheadMidOverride, overheadRearOverride]);


// Render overhead speaker icons (one per speaker, using their own positions)
  const overheadIconElements = useMemo(() => {
    // Guard: no speakers array
    if (!Array.isArray(placedSpeakers)) return null;

    // Select overhead speakers from placedSpeakers
    const overheadSpeakers = placedSpeakers.filter((speaker) => {
      const canonical = getCanonicalRole?.(speaker.role) || speaker.role;
      if (typeof canonical !== 'string') return false;
      // Any canonical role that starts with 'T' is an overhead (TFL/TFR/TML/TMR/TBL/TBR/TL/TR)
      if (!canonical.startsWith('T')) return false;
      // Must have valid position
      const pos = speaker.position || {};
      return Number.isFinite(pos.x) && Number.isFinite(pos.y);
    });

    // No overhead speakers to render
    if (overheadSpeakers.length === 0) return null;

    // Render one icon per overhead speaker using SpeakerIcon
    return overheadSpeakers.map((speaker) => {
      const { id, role, model, position } = speaker;
      if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
        return null;
      }

      // Determine which zone position this role belongs to (front/mid/rear)
      const canonicalRole = getCanonicalRole?.(role) || role;
      let zonePosition = null;
      if (['TFL', 'TFR', 'TFC'].includes(canonicalRole)) {
        zonePosition = 'front';
      } else if (['TL', 'TR', 'TML', 'TMR'].includes(canonicalRole)) {
        zonePosition = 'mid';
      } else if (['TBL', 'TBR', 'TBC'].includes(canonicalRole)) {
        zonePosition = 'rear';
      }

      // Resolve the actual model using the overhead position helper
      const resolvedModel = zonePosition && getOverheadModelForPosition
        ? getOverheadModelForPosition(zonePosition)
        : model;

      // Skip if no model selected
      if (!resolvedModel || resolvedModel === 'OFF') {
        return null;
      }

      // IMPORTANT: build an effective speaker that includes the resolved model
      const effectiveSpeaker = { ...speaker, model: resolvedModel };

      // Overheads always get a drag handler because they bypass isDraggable checks
      const speakerMouseDownHandler = (e) => handleMouseDown(e, id, "speaker");

      return (
        <SpeakerIcon
          key={id}
          speaker={effectiveSpeaker}
          canvasX={roomRect.x + (position.x * scale)}
          canvasY_raw={roomRect.y + (position.y * scale)}
          yaw={speaker.yaw || 0}
          scale={scale}
          speakerMouseDownHandler={speakerMouseDownHandler}
          setHoveredSpeaker={setHoveredSpeaker}
        />
      );
    }).filter(Boolean);
  }, [
    placedSpeakers,
    getCanonicalRole,
    getOverheadModelForPosition,
    scale,
    roomRect,
    setHoveredSpeaker,
    handleMouseDown
  ]);

  // Front-wide zone rendering helper (shows zones whenever toggle is on, regardless of status)
  const renderFrontWideZones = useCallback(() => {
    // This function is now called conditionally by `overlaysForRendering.enableFrontWides`.
    // It should only render if frontWideZones are available and valid.
    // The enableFrontWides from appState is passed through overlaysForRendering, so we check it there.

    const W = widthM || 4.5; // Use new widthM
    const L = lengthM || 6.0; // Use new lengthM
    const WALL = 0.02;

    // If we have valid zones, render them
    if (frontWideZones?.status === 'ok') {
      const leftZone = frontWideZones.left;
      const rightZone = frontWideZones.right;

      if (!leftZone || !rightZone) return null;

      const zoneOpacity = 0.25;
      const strokeOpacity = 0.4;

      return (
        <g pointerEvents="none">
          {/* Left zone */}
          <rect
            x={roomRect.x + (WALL * scale)}
            y={roomRect.y + (leftZone.yMin * scale)}
            width={ZONE_DEPTH_M * scale}
            height={(leftZone.yMax - leftZone.yMin) * scale}
            fill="#4A230F"
            opacity={zoneOpacity}
            stroke="#4A230F"
            strokeWidth="1"
            strokeOpacity={strokeOpacity}
            strokeDasharray="4,4"
          />
          <line
            x1={roomRect.x + (WALL * scale)}
            y1={roomRect.y + (leftZone.medianY * scale)}
            x2={roomRect.x + ((WALL + ZONE_DEPTH_M) * scale)}
            y2={roomRect.y + (leftZone.medianY * scale)}
            stroke="#4A230F"
            strokeWidth="2"
            strokeOpacity={0.6}
          />

          {/* Right zone */}
          <rect
            x={roomRect.x + roomRect.width - ((WALL + ZONE_DEPTH_M) * scale)}
            y={roomRect.y + (rightZone.yMin * scale)}
            width={ZONE_DEPTH_M * scale}
            height={(rightZone.yMax - rightZone.yMin) * scale}
            fill="#213428"
            opacity={zoneOpacity}
            stroke="#213428"
            strokeWidth="1"
            strokeOpacity={strokeOpacity}
            strokeDasharray="4,4"
          />
          <line
            x1={roomRect.x + roomRect.width - ((WALL + ZONE_DEPTH_M) * scale)}
            y1={roomRect.y + (rightZone.medianY * scale)}
            x2={roomRect.x + roomRect.width - (WALL * scale)}
            y2={roomRect.y + (rightZone.medianY * scale)}
            stroke="#213428"
            strokeWidth="2"
            strokeOpacity={0.6}
          />
        </g>
      );
    }

    // Fallback: if zones can't be computed (no sides, invalid geom, etc.)
    // Renders only when overlay is enabled AND status !== 'ok'
    if (frontWideZones?.status !== 'ok') {
      const W = Number(widthM) || 4.5;
      const L = Number(lengthM) || 6.0;
      const WALL = 0.02;

      const approxYmin   = L * 0.35;
      const approxYmax   = L * 0.65;
      const approxMedian = L * 0.50;
      const placeholderOpacity = 0.15;

      // Centre label using actual canvas rect
      const labelX = roomRect.x + (roomRect.width / 2);
      const labelY = roomRect.y + (approxMedian * scale) - 10;

      return (
        <g pointerEvents="none">
          {/* Left placeholder zone */}
          <rect
            x={roomRect.x + (WALL * scale)}
            y={roomRect.y + (approxYmin * scale)}
            width={ZONE_DEPTH_M * scale}
            height={(approxYmax - approxYmin) * scale}
            fill="#4A230F"
            opacity={placeholderOpacity}
            stroke="#4A230F"
            strokeWidth="1"
            strokeOpacity={0.3}
            strokeDasharray="8,8"
          />
          <line
            x1={roomRect.x + (WALL * scale)}
            y1={roomRect.y + (approxMedian * scale)}
            x2={roomRect.x + ((WALL + ZONE_DEPTH_M) * scale)}
            y2={roomRect.y + (approxMedian * scale)}
            stroke="#4A230F"
            strokeWidth="1.5"
            strokeOpacity={0.4}
            strokeDasharray="4,4"
          />

          {/* Right placeholder zone */}
          <rect
            x={roomRect.x + roomRect.width - ((WALL + ZONE_DEPTH_M) * scale)}
            y={roomRect.y + (approxYmin * scale)}
            width={ZONE_DEPTH_M * scale}
            height={(approxYmax - approxYmin) * scale}
            fill="#213428"
            opacity={placeholderOpacity}
            stroke="#213428"
            strokeWidth="1"
            strokeOpacity={0.3}
            strokeDasharray="8,8"
          />
          <line
            x1={roomRect.x + roomRect.width - ((WALL + ZONE_DEPTH_M) * scale)}
            y1={roomRect.y + (approxMedian * scale)}
            x2={roomRect.x + roomRect.width - (WALL * scale)}
            y2={roomRect.y + (approxMedian * scale)}
            stroke="#213428"
            strokeWidth="1.5"
            strokeOpacity={0.4}
            strokeDasharray="4,4"
          />

          {/* Status text for user feedback */}
          <text
            x={labelX}
            y={labelY}
            textAnchor="middle"
            fill="#666"
            fontSize="11"
            fontFamily="system-ui, sans-serif"
          >
            Front-Wide zones (place L/C/R + SL/SR for precise positioning)
          </text>
        </g>
      );
    }
    return null;
  }, [
    frontWideZones,
    widthM, // Use new widthM
    lengthM, // Use new lengthM
    roomRect,
    scale,
    ZONE_DEPTH_M
  ]);

  // Parse something like "5.1", "7.1", "9.1.2" → {base: 5|7|9, hasWides: boolean}
  const parseDolbyLayout = useCallback((dolbyLayoutStr) => {
    if (!dolbyLayoutStr || typeof dolbyLayoutStr !== 'string') return { base: 5, hasWides: false };
    const parts = dolbyLayoutStr.split('.');
    const base = Math.max(2, Number(parts[0]) || 5);
    const hasWides = base >= 9;
    return { base, hasWides };
  }, []);

  const getDolbyZoneSpecs = useCallback((dolbyLayoutStr) => {
    const { base, hasWides } = parseDolbyLayout(dolbyLayoutStr);

    const C_WIDE = '#3b82f6';
    const C_SIDE = '#f59e0b';
    const C_REAR = '#10b981';
    const DASH   = '6,6';

    const specs = [];

    if (base === 5) {
      specs.push({
        label: 'Dolby Side (5.1: 110–120°)',
        stroke: C_SIDE,
        dash: DASH,
        ranges: [[110,120], [-120,-110]],
      });
    } else if (base === 7) {
      specs.push({
        label: 'Dolby Side (90–110°)',
        stroke: C_SIDE,
        dash: DASH,
        ranges: [[90,110], [-110,-90]],
      });
      specs.push({
        label: 'Dolby Rear (135–150°)',
        stroke: C_REAR,
        dash: DASH,
        ranges: [[135,150], [-150,-135]],
      });
    } else if (base >= 9) {
      if (hasWides) {
        specs.push({
          label: 'Dolby Wide (50–70°)',
          stroke: C_WIDE,
          dash: DASH,
          ranges: [[50,70], [-70,-50]],
        });
      }
      specs.push({
        label: 'Dolby Side (90–110°)',
        stroke: C_SIDE,
        dash: DASH,
        ranges: [[90,110], [-110,-90]],
      });
      specs.push({
        label: 'Dolby Rear (135–150°)',
        stroke: C_REAR,
        dash: DASH,
        ranges: [[135,150], [-150,-135]],
      });
    }

    return specs;
  }, [parseDolbyLayout]);

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

  const renderDolbyZones = useCallback(() => {
    if (!overlaysForRendering?.enableDolbyZones) return null;

    const seat = mlp;
    if (!seat || !Number.isFinite(seat.x) || !Number.isFinite(seat.y)) return null;
    if (!toPx) return null;

    const w = widthM || 4.5;
    const l = lengthM || 6.0;

    const specs = getDolbyZoneSpecs(dolbyLayout || '5.1');
    if (!specs || !specs.length) return null;

    const rM = Math.max(0.5, Math.min(w, l) * 0.35);
    const rLabel = rM * 0.35;

    const intersectRay = (sx, sy, deg) => {
      const rad = (deg * Math.PI) / 180;
      const dx = Math.sin(rad);
      const dy = -Math.cos(rad);
      
      const tVals = [];
      const xMin = 0, xMax = w, yMin = 0, yMax = l;
      
      if (Math.abs(dx) > 1e-9) {
        const t1 = (xMin - sx) / dx;
        const y1 = sy + t1 * dy;
        if (t1 > 0 && y1 >= yMin && y1 <= yMax) tVals.push(t1);
        
        const t2 = (xMax - sx) / dx;
        const y2 = sy + t2 * dy;
        if (t2 > 0 && y2 >= yMin && y2 <= yMax) tVals.push(t2);
      }
      
      if (Math.abs(dy) > 1e-9) {
        const t3 = (yMin - sy) / dy;
        const x3 = sx + t3 * dx;
        if (t3 > 0 && x3 >= xMin && x3 <= xMax) tVals.push(t3);
        
        const t4 = (yMax - sy) / dy;
        const x4 = sx + t4 * dx;
        if (t4 > 0 && x4 >= xMin && x4 <= yMax) tVals.push(t4); // Corrected yMax
      }
      
      if (!tVals.length) return null;
      const t = Math.min(...tVals);
      return { x: sx + t * dx, y: sy + t * dy };
    };

    const elements = [];

    specs.forEach((spec, si) => {
      spec.ranges.forEach((rng, ri) => {
        const d = arcPathForBand(seat.x, seat.y, rM, rng[0], rng[1], toPx);
        if (d) {
          elements.push(
            <path
              key={`band-${si}-${ri}`}
              d={d}
              fill="none"
              stroke={spec.stroke}
              strokeWidth={1.5}
              strokeDasharray="6,6"
              opacity={0.85}
              pointerEvents="none"
            />
          );
        }

        [rng[0], rng[1]].forEach((deg, di) => {
          const hit = intersectRay(seat.x, seat.y, deg);
          if (!hit) return;

          const [sx, sy] = toPx(seat.x, seat.y);
          const [ex, ey] = toPx(hit.x, hit.y);

          elements.push(
            <line
              key={`spoke-${si}-${ri}-${di}`}
              x1={sx} y1={sy} x2={ex} y2={ey} // Corrected x2 y2 to hit.x, hit.y converted to px
              stroke={spec.stroke}
              strokeWidth={1}
              strokeDasharray="3,6"
              opacity={0.7}
              pointerEvents="none"
            />
          );

          const rad = (deg * Math.PI) / 180;
          const lx = seat.x + Math.sin(rad) * rLabel;
          const ly = seat.y - Math.cos(rad) * rLabel;
          const [lpx, lpy] = toPx(lx, ly);

          elements.push(
            <g key={`label-${si}-${ri}-${di}`} pointerEvents="none" opacity={0.95}>
              <rect x={lpx - 12} y={lpy - 10} width={24} height={16} rx={3} fill="white" opacity={0.9}/>
              <text x={lpx} y={lpy + 2} fontSize="11" textAnchor="middle" fill={spec.stroke}>{Math.round(deg)}°</text>
            </g>
          );
        });
      });
    });

    return <g data-testid="dolby-zones">{elements}</g>;
  }, [overlaysForRendering?.enableDolbyZones, mlp, toPx, widthM, lengthM, dolbyLayout, getDolbyZoneSpecs, arcPathForBand]);


  // Memoize individual zone components with unique IDs
  const ZoneComponents = useMemo(() => {
    // LCR Zone Component - Updated to use lcrZoneBlocks
    const LCRZoneComponent = ({ side }) => {
      // Only show LCR zone if floating mode is enabled and lcrZoneBlocks are available
      if (!lcrZoneBlocks || screen?.mountMode !== 'floating') return null;

      const zone = lcrZoneBlocks[side];
      if (!zone) return null;

      // Convert room meter coordinates to canvas pixel coordinates
      const [xStartPx] = toPx(zone.x_start, 0);
      const [x2Px] = toPx(zone.x_end, 0);

      // Y-coordinates are from the front wall (y=0) to ZONE_DEPTH_M
      const yTopPx = roomRect.y;
      const yBottomPx = roomRect.y + (ZONE_DEPTH_M * scale);

      const rectX = Math.min(xStartPx, x2Px);
      const rectWidth = Math.abs(x2Px - xStartPx);
      const rectY = yTopPx;
      const rectHeight = yBottomPx - yTopPx;

      const fill = side === 'left' ? '#4A230F' : '#213428';

      // Apply visual overhang for the display, similar to previous LCRZoneComponent
      const overhangM = 0.50;
      // Calculate extended room bounds in pixels from room's meter dimensions
      const [extendedRoomLeftPx] = toPx(0 - overhangM, 0);
      const [extendedRoomRightPx] = toPx(widthM + overhangM, 0); // Use new widthM

      // Clamp the visual rectangle to the extended bounds for display
      const finalX = Math.max(extendedRoomLeftPx, rectX);
      const finalWidth = Math.min(extendedRoomRightPx, rectX + rectWidth) - finalX;

      return (
        <rect
          id={`LCR_ZONE_${side.toUpperCase()}`}
          x={finalX}
          y={rectY}
          width={finalWidth}
          height={rectHeight}
          fill={fill}
          fillOpacity="0.35"
        />
      );
    };

    // Side Surround Zone Component (Corrected positioning and seamless rendering)
    const SideSurroundZoneComponent = ({ side }) => {
      const fadeLen_px = FADE_LEN_M * scale;

      // ROOM BOUNDS
      const roomLeft = roomRect.x;
      const roomRight = roomRect.x + roomRect.width;
      const roomTop = roomRect.y;
      const roomBottom = roomRect.y + roomRect.height;

      // CORE POSITIONS
      const [, mlpY_px] = toPx(0, mlpY_m);
      const [, rearWallY_px] = toPx(0, lengthM); // Use new lengthM
      const [, screenWallY_px] = toPx(0, 0);

      const bandW_px = ZONE_DEPTH_M * scale;
      const isLeft = side === "left";
      const fill = isLeft ? '#4A230F' : '#213428';

      // SIDE WALL X (inside room)
      const sideX_px = isLeft ? roomLeft : (roomRight - bandW_px);

      // VERTICAL BAND: Rendered as a single seamless rectangle
      const vTop_px = Math.max(roomTop, screenWallY_px);
      const vBottom_px = Math.min(roomBottom, rearWallY_px);
      const mlpClamped_px = Math.max(vTop_px, Math.min(vBottom_px, mlpY_px));

      const fadeEndY_px = mlpClamped_px;
      const fadeStartY_px = Math.max(vTop_px, fadeEndY_px - fadeLen_px);
      const vBandStartY_px = fadeStartY_px;
      const vBandTotalHeight_px = Math.max(0, vBottom_px - vBandStartY_px);

      // HORIZONTAL BAND Y POSITION: Corrected to be inside the room
      const backH_px = bandW_px;
      const backY_px = Math.min(roomBottom, rearWallY_px) - backH_px;

      // HORIZONTAL BAND X extents (logic remains the same)
      const seatXs = seatingPositions.map(s => Number(s.x)).filter(Number.isFinite);
      const leftmostSeatX_m = seatXs.length ? Math.min(...seatXs) : widthM * 0.35; // Use new widthM
      const rightmostSeatX_m = seatXs.length ? Math.max(...seatXs) : widthM * 0.65; // Use new widthM
      const [leftSeat_px] = toPx(leftmostSeatX_m, 0);
      const [rightSeat_px] = toPx(rightmostSeatX_m, 0);

      const backSolidStart_px = isLeft ? roomLeft : Math.max(roomLeft, rightSeat_px);
      const backSolidEnd_px = isLeft ? Math.min(roomRight, leftSeat_px) : roomRight;
      const backSolidW_px = Math.max(0, backSolidEnd_px - backSolidStart_px);

      const backFadeW_px = fadeLen_px;
      const totalBackW_px = backSolidW_px + backFadeW_px;

      const gidV = `grad_side_vertical_${side}`;
      const gidB = `grad_side_back_${side}`;

      // NEW: Pre-calculate offset ratios for clarity and correctness
      const mlpOffsetRatio = vBandTotalHeight_px > 0 ? (mlpClamped_px - vBandStartY_px) / vBandTotalHeight_px : 0;
      const solidOffsetRatio = totalBackW_px > 0 ? backSolidW_px / totalBackW_px : 0;
      const fadeOffsetRatio = totalBackW_px > 0 ? backFadeW_px / totalBackW_px : 0;

      // Handle backRectWidth and backRectX properly for horizontal band
      let backRectWidth = 0;
      let backRectX = 0;
      if (isLeft) {
        backRectX = roomLeft;
        backRectWidth = Math.max(0, leftSeat_px - roomLeft + fadeLen_px);
      } else {
        backRectX = rightSeat_px - fadeLen_px;
        backRectWidth = Math.max(0, roomRight - rightSeat_px + fadeLen_px);
      }

      return (
        <g pointerEvents="none">
          {vBandTotalHeight_px > 0 && (
            <>
              <defs>
                <linearGradient id={gidV} gradientUnits="userSpaceOnUse"
                  x1={sideX_px} y1={vBandStartY_px}
                  x2={sideX_px} y2={vBottom_px}>
                  <stop offset="0" stopColor={fill} stopOpacity="0.0" />
                  <stop offset={mlpOffsetRatio} stopColor={fill} stopOpacity="0.35" />
                  <stop offset="1" stopColor={fill} stopOpacity="0.35" />
                </linearGradient>
              </defs>
              <rect
                x={sideX_px}
                y={vBandStartY_px}
                width={bandW_px}
                height={vBandTotalHeight_px}
                fill={`url(#${gidV})`}
              />
            </>
          )}

          {backRectWidth > 0 && (
            <>
              <defs>
                <linearGradient id={gidB} gradientUnits="userSpaceOnUse"
                  x1={backRectX} y1={backY_px}
                  x2={backRectX + backRectWidth} y2={backY_px}>
                  {isLeft ? (
                    <>
                      <stop offset={solidOffsetRatio} stopColor={fill} stopOpacity="0.35" />
                      <stop offset="1" stopColor={fill} stopOpacity="0" />
                    </>
                  ) : (
                    <>
                      <stop offset="0" stopColor={fill} stopOpacity="0.0" />
                      <stop offset={fadeOffsetRatio} stopColor={fill} stopOpacity="0.35" />
                      <stop offset="1" stopColor={fill} stopOpacity={0.35} />
                    </>
                  )}
                </linearGradient>
              </defs>
              <rect
                x={backRectX}
                y={backY_px}
                width={backRectWidth}
                height={backH_px}
                fill={`url(#${gidB})`}
                pointerEvents="none"
              />
            </>
          )}
        </g>
      );
    };

    // Rear Surround Zone Component
    const RearSurroundZoneComponent = () => {
      // Rule: Do not render if no seats exist.
      if (!seatingPositions || seatingPositions.length === 0) return null;

      const fadeLen_px = FADE_LEN_M * scale;

      // Room bounds and core positions
      const roomLeft = roomRect.x;
      const roomRight = roomRect.x + roomRect.width;
      const roomTop = roomRect.y;
      const roomBottom = roomRect.y + roomRect.height;
      const [, rearWallY_px] = toPx(0, lengthM); // Use new lengthM
      const bandW_px = ZONE_DEPTH_M * scale;

      // Find rearmost seat line (global last-seat line)
      const seatYs = seatingPositions.map(s => Number(s.y)).filter(Number.isFinite);
      const lastSeatY_m = seatYs.length ? Math.max(...seatYs) : mlp.y;
      const [, lastSeatY_px_raw] = toPx(0, lastSeatY_m);
      const lastSeatY_px = Math.max(roomTop, Math.min(roomBottom, lastSeatY_px_raw));

      // Vertical bands: from last-seat line to rear wall
      const vHeight_px = Math.max(0, Math.min(roomBottom, rearWallY_px) - lastSeatY_px);

      // Horizontal bands: use first-seat X positions
      const seatXs = seatingPositions.map(s => Number(s.x)).filter(Number.isFinite);
      const leftmostSeatX_m = seatXs.length ? Math.min(...seatXs) : widthM * 0.35; // Use new widthM
      const rightmostSeatX_m = seatXs.length ? Math.max(...seatXs) : widthM * 0.65; // Use new widthM
      const [leftSeat_px] = toPx(leftmostSeatX_m, 0);
      const [rightSeat_px] = toPx(rightmostSeatX_m, 0);

      // Position horizontal band inside the room
      const backY_px = Math.min(roomBottom, rearWallY_px) - bandW_px;

      const renderBand = (side) => {
        const isLeft = side === 'left';
        const fillColor = isLeft ? '#4A230F' : '#213428';
        const sideX_px = isLeft ? roomLeft : roomRight - bandW_px;

        const verticalRect = vHeight_px > 0 ? (
          <rect
            key={`vert-${side}`}
            x={sideX_px}
            y={lastSeatY_px}
            width={bandW_px}
            height={vHeight_px}
            fill={fillColor}
            opacity={0.35}
          />
        ) : null;

        const solidStartX = isLeft ? roomLeft : Math.max(roomLeft, rightSeat_px);
        const solidEndX = isLeft ? Math.min(roomRight, leftSeat_px) : roomRight;
        const solidW = Math.max(0, solidEndX - solidStartX);
        const backFadeW_px = fadeLen_px;
        const totalW = solidW + backFadeW_px;

        const gidH = `grad_rear_horiz_${side}`;
        const bandX = isLeft ? solidStartX : (solidStartX - backFadeW_px);
        const offsetSolid = totalW > 0 ? solidW / totalW : 0;
        const offsetFade = totalW > 0 ? backFadeW_px / totalW : 0;

        return (
          <g key={side} pointerEvents="none">
            {verticalRect}
            {totalW > 0 && (
              <>
                <defs>
                  <linearGradient
                    id={gidH}
                    gradientUnits="userSpaceOnUse"
                    x1={bandX}
                    y1={backY_px}
                    x2={bandX + totalW}
                    y2={backY_px}
                  >
                    {isLeft ? (
                      <>
                        <stop offset={offsetSolid} stopColor={fillColor} stopOpacity="0.35" />
                        <stop offset="1" stopColor={fillColor} stopOpacity="0" />
                      </>
                    ) : (
                      <>
                        <stop offset="0" stopColor={fillColor} stopOpacity="0.0" />
                        <stop offset={offsetFade} stopColor={fillColor} stopOpacity="0.35" />
                        <stop offset="1" stopColor={fillColor} stopOpacity={0.35} />
                    </>
                    )}
                  </linearGradient>
                </defs>
                <rect
                  x={bandX}
                  y={backY_px}
                  width={totalW}
                  height={bandW_px}
                  fill={`url(#${gidH})`}
                  pointerEvents="none"
                />
              </>
            )}
          </g>
        );
      };

      return (
        <g pointerEvents="none">
          {renderBand('left')}
          {renderBand('right')}
        </g>
      );
    };

return {
  LCR: (
    <g pointerEvents="none">
      <LCRZoneComponent side="left" />
      <LCRZoneComponent side="right" />
    </g>
  ),
  SIDE_SURROUND: (
    <g pointerEvents="none">
      <SideSurroundZoneComponent side="left" />
      <SideSurroundZoneComponent side="right" />
    </g>
  ),
  REAR_SURROUND: <RearSurroundZoneComponent />,

  OVERHEADS: (() => {
    // Derive overhead config from dolbyLayout without using overheadCount variable
    const parts = String(dolbyLayout || '5.1').split('.');
    const ohCount = parts.length >= 3 ? parseInt(parts[2]) || 0 : 0;
    const config = ohCount === 2 ? ".2" : ohCount === 4 ? ".4" : ohCount === 6 ? ".6" : "off";
    
    return renderOverheadBandsSVG({
      zones: overheadZones,
      config,
      toPx,
      scale,
      roomRect,
      placedSpeakers,
      getCanonicalRole,
      widthM,
    });
  })(),

  FRONT_WIDE: renderFrontWideZones(),
  // DOLBY removed
};
  }, [seatingPositions, widthM, lengthM, scale, toPx, roomRect, mlpY_m, placedSpeakers, heightM, screen?.mountMode, lcrZoneBlocks, ZONE_DEPTH_M, frontWideZones, renderFrontWideZones, mlp, getCanonicalRole, overheadCount, overheadZones]); // Added overheadZones to dependencies


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
      if (typeof console !== 'undefined') console.error("Failed to attach Base44Overlay.setLCR:", e);
    }

    return () => {
      window.removeEventListener("b44:overlay:setLCR", handler);
      try {
        if (window.Base44Overlay && window.Base44Overlay.setLCR === applyLcrFromDetail) {
          delete window.Base44Overlay.setLCR;
        }
      } catch (e) {
        if (typeof console !== 'undefined') console.error("Failed to detach Base44Overlay.setLCR:", e);
      }
    };
  }, [applyLcrFromDetail]);

  const renderSpeakers = useCallback(() => {
  // Normalise input
  const raw = Array.isArray(speakersToRender) ? speakersToRender : [];

  // 1) Basic structural filter (existing helper)
  const afterRenderable = raw.filter(isRenderableSpeaker);

  // 2) Visibility filter (layout + model) – but never hard-fail on errors
  const afterVisibility = afterRenderable.filter((spk) => {
    try {
      const canon = String(spk.role || "").toUpperCase();
      
      // OVERHEADS: icons must always be visible when speakers exist.
      // Do NOT use the Overheads toggle here (that only affects zone bands).
      if (canon && canon.startsWith('T')) {
        return true;
      }
      
      const result = getSpeakerVisibility(spk.role, spk.model);
      
      // TEMP DEBUG: Log each visibility check
      if (['SBL', 'SBR', 'LW', 'RW'].includes(canon)) {
        console.log('[RV filter]', {
          role: canon,
          model: spk.model,
          visibilityResult: result
        });
      }
      
      return result;
    } catch (err) {
      console.warn("[RV] getSpeakerVisibility error; allowing speaker through", {
        role: spk.role,
        model: spk.model,
        err,
      });
      return true;
    }
  });

  // DEBUG: Expose to window for manual inspection
  if (typeof window !== 'undefined') {
    window.__LAST_RV__ = { raw, afterVisibility };
  }

  // DEBUG: Table of afterVisibility with positions
  try {
    console.groupCollapsed("[RV] speakersToRender DEBUG");
    console.log('Raw speakers:');
    console.table(
      raw.map((s) => ({
        id: s.id,
        role: s.role,
        model: s.model || "(none)",
      }))
    );
    console.log('After visibility:');
    console.table(
      afterVisibility.map((s) => ({
        id: s.id,
        role: s.role,
        model: s.model || "(none)",
        posX: s.position?.x?.toFixed?.(3) || '—',
        posY: s.position?.y?.toFixed?.(3) || '—',
      }))
    );
    console.groupEnd();
  } catch (_) {
    // ignore console errors in strange environments
  }

  // Local NaN-safe coordinate mappers (must be inside this loop)
  const toCanvasX = (xM) => {
    const safeX = Number.isFinite(xM) ? xM : 0;
    return roomRect.x + (safeX * scale);
  };

  const toCanvasY = (yM) => {
    const safeY = Number.isFinite(yM) ? yM : 0;
    return roomRect.y + (safeY * scale);
  };

  // [B44] Debug log to confirm bed-surround positions are not mutated by RV
  console.log('[RV] speakers BEFORE icon-map',
    afterVisibility.map(s => ({
      role: s.role,
      canon: getCanonicalRole(s.role),
      x: s.position?.x?.toFixed(3),
      y: s.position?.y?.toFixed(3),
    }))
  );

  // [B44] Debug log to confirm bed-surround positions are not mutated by RV
  console.log('[RV] speakers BEFORE icon-map',
    afterVisibility.map(s => ({
      role: s.role,
      canon: getCanonicalRole(s.role),
      x: s.position?.x?.toFixed(3),
      y: s.position?.y?.toFixed(3),
    }))
  );

  // 3) Map to icons
  return afterVisibility.map((speaker) => {
    const { id, role, model, position = {} } = speaker;
    const canon = getCanonicalRole(role);

    // NEW: overhead speakers are rendered only by overheadIconElements,
    // so skip them here to avoid duplicate / rectangular icons.
    if (typeof canon === "string" && canon.startsWith("T")) {
      return null;
    }

    // Resolve model & dimensions using your existing helpers
    const resolvedModel = resolveSurroundModel(model, canon);
    const dims = getSpeakerDims(resolvedModel);
    const widthM_spk = dims.widthM || 0;
    const depthM_spk = dims.depthM || 0;

    // Compute yaw: prefer explicit speaker.yaw (seeded by SpeakerPlacement)
    // and fall back to the existing helper if it's not set / not finite.
    let yawDeg;

    if (Number.isFinite(speaker?.yaw)) {
      yawDeg = Number(speaker.yaw);
    } else {
      yawDeg = getYawForObject(
        speaker,
        { L: lcrAngleInfo.L, R: lcrAngleInfo.R },
        aimAtMLP,
        { width: widthM, length: lengthM, height: heightM },
        getModelDimsM
      );
    }

    // Position coordinates from speaker.position (with safe fallbacks)
    const pos_x = position.x ?? 0;
    const pos_y = position.y ?? 0;

    // --- Rear surround wall-aware yaw ---
    // If SBL/SBR are dragged onto a side wall, rotate them 90° so the
    // long edge sits flat on that wall (matching SL/SR behaviour).
    if (canon === "SBL" || canon === "SBR") {
      const distLeft  = Math.abs(pos_x - 0);
      const distRight = Math.abs(widthM - pos_x);
      const distBack  = Math.abs(lengthM - pos_y); // back wall at y = lengthM

      const minDist = Math.min(distLeft, distRight, distBack);

      if (minDist === distBack) {
        // Closest to back wall: keep standard rear orientation (flat to back)
        yawDeg = 0;
      } else if (minDist === distLeft) {
        // Now effectively on left wall
        yawDeg = 90;
      } else if (minDist === distRight) {
        // Now effectively on right wall
        yawDeg = -90;
      }
    }

    // Convert to canvas coordinates
    let canvasX, canvasY;

    if (canon === "FL" || canon === "FC" || canon === "FR") {
      // LCR: pinned to front wall using WALL_BUFFER_M
      const half = yHalfExtentM(depthM_spk, widthM_spk, yawDeg);
      const y_m = WALL_BUFFER_M + half;
      canvasX = toCanvasX(pos_x);
      canvasY = toCanvasY(y_m);
    } else {
      // Everyone else: use their stored world coords directly
      canvasX = toCanvasX(pos_x);
      canvasY = toCanvasY(pos_y);
    }

    // NaN safety: ensure we never pass invalid coordinates
    const safeCanvasX = Number.isFinite(canvasX) ? canvasX : 0;
    const safeCanvasY = Number.isFinite(canvasY) ? canvasY : 0;

    // Log any invalid coordinates
    if (!Number.isFinite(canvasX) || !Number.isFinite(canvasY)) {
      console.warn('[RV] INVALID CANVAS COORDS', {
        id,
        role,
        pos: position,
        pos_x,
        pos_y,
        canvasX,
        canvasY,
      });
    }

    // DEBUG: Log icon generation for rear/wide speakers
    if (['SBL', 'SBR', 'LW', 'RW'].includes(canon)) {
      console.log('[RV icon]', {
        id,
        role,
        canon,
        model,
        resolvedModel,
        pos: position,
        pos_x,
        pos_y,
        canvasX: safeCanvasX,
        canvasY: safeCanvasY,
        yawDeg,
        widthM_spk,
        depthM_spk,
      });
    }

    const speakerMouseDownHandler = isDraggable(speaker)
      ? (e) => handleMouseDown(e, id, "speaker")
      : undefined;

    return (
      <SpeakerIcon
        key={id}
        speaker={{ ...speaker, model: resolvedModel }}
        canvasX={safeCanvasX}
        canvasY_raw={safeCanvasY}
        yawDeg={yawDeg}
        widthM={widthM_spk}
        depthM={depthM_spk}
        scale={scale}
        speakerMouseDownHandler={speakerMouseDownHandler}
        setHoveredSpeaker={setHoveredSpeaker}
      />
    );
  });
}, [
  speakersToRender,
  isRenderableSpeaker,
  getSpeakerVisibility,
  getCanonicalRole,
  resolveSurroundModel,
  getSpeakerDims,
  getYawForObject,
  yHalfExtentM,
  WALL_BUFFER_M,
  roomRect,
  scale,
  widthM,
  lengthM,
  heightM,
  lcrAngleInfo,
  aimAtMLP,
  isDraggable,
  handleMouseDown,
  setHoveredSpeaker,
  SpeakerIcon,
]);

  // Renders rear subwoofers using SpeakerRect
  const renderSubwoofers = React.useCallback(() => {
    const subsToRender = Array.isArray(rearSubs) ? rearSubs : [];
    if (!subsToRender.length) return null;
    return (
      <g data-layer="rear-subwoofers" pointerEvents="none">
        {subsToRender.map((sub, i) => {
          if (!hasPos(sub)) return null;
          // No suffix resolution for subwoofers
          const { widthM, depthM } = getModelDimsM(sub.model);
          return (
            <SpeakerRect
              key={sub.id || `sub-${i}`}
              speaker={sub}
              widthM={widthM}
              depthM={depthM}
              opacity={0.8}
              scale={scale}
              toPx={toPx}
            />
          );
        })}
      </g>
    );
  }, [rearSubs, getModelDimsM, scale, toPx]);

  // Renders generic room elements. `roomElements` prop is available.
  const renderRoomElements = useCallback(() => {
    return <g data-layer="room-elements"></g>;
  }, []);

  // Renders speaker labels. Not implemented in the original code, so a placeholder.
  const renderSpeakerLabels = useCallback(() => {
    return <g data-layer="speaker-labels"></g>;
  }, []);

  // --- Seats: always render from the latest seatingPositions prop ---
  const renderSeatingPositions = () => {
    if (!Array.isArray(seatingPositions) || seatingPositions.length === 0) {
      console.log('RoomVisualisation: rendering seats = 0');
      return null;
    }

    const RX_M = 0.10;
    const RY_M = 0.125;

    console.log('RoomVisualisation: rendering seats =', seatingPositions.length);

    return (
      <g className="seats-layer" style={{ pointerEvents: 'auto' }}>
        {seatingPositions.map((seat) => {
          // accept either { x, y } or { position: { x, y } }
          const xM = Number(
            seat.x ??
            seat.position?.x ??
            0
          );
          const yM = Number(
            seat.y ??
            seat.position?.y ??
            0
          );

          const [seatX, seatY] = toPx(xM, yM);
          const isPinned = hudPinnedSeatId === seat.id;

          return (
            <ellipse
              key={seat.id}
              cx={seatX}
              cy={seatY}
              rx={RX_M * scale}
              ry={RY_M * scale}
              fill="rgba(0,0,0,0)"
              pointerEvents="all"
              stroke="#213428"
              strokeWidth={seat.isPrimary ? 2.5 : isPinned ? 2 : 1}
              strokeDasharray={isPinned ? '4 2' : 'none'}
              style={{ cursor: 'pointer' }}
              aria-label="Seat — hover for RP23 and P1 analysis"
              onMouseDown={(e) => handleMouseDown(e, seat.id, 'seat')}
              onMouseEnter={() => handleSeatMouseEnter(seat)}
              onMouseLeave={handleSeatMouseLeave}
              onClick={(e) => {
                e.stopPropagation();
                handleSeatClick(seat);
              }}
            />
          );
        })}
      </g>
    );
  };
  
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
      </g>
    );
  }, [toPx, mlpDotX_m, mlpDotY_m]);


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

// Helper to render level badge
const renderLevelBadge = useCallback((level) => {
  if (!level || level === 'N/A' || level === '—' || level === 'Below L1') {
    return <span style={{ fontSize: 10, color: '#999' }}>{level || '—'}</span>;
  }

  const bgColor = level === 'L4' ? '#213428' :
                  level === 'L3' ? '#3E4349' :
                  level === 'L2' ? '#625143' :
                  '#4A230F';

  return (
    <span 
      style={{
        fontWeight: 600, 
        fontSize: 10,
        padding: '2px 6px',
        borderRadius: 4,
        background: bgColor,
        color: 'white'
      }}
    >
      {level}
    </span>
  );
}, []);

const renderRp22AnglesOverlay = useCallback(() => {
  // For now, always try to render when a seat is hovered.
  if (!Number.isFinite(scale)) return null;
  if (!effectiveHoveredSeat) return null;

  // 1) Collect all surround-type speakers around this seat
  const allSurrounds = (placedSpeakers || []).filter((s) => {
    const r = getCanonicalRole(s.role);
    return ["SL", "SR", "SBL", "SBR", "LW", "RW"].includes(r);
  });

  if (allSurrounds.length < 2) return null;

  // 2) Wides only count if proper SL/SR exist
  const hasSL = allSurrounds.some((s) => getCanonicalRole(s.role) === "SL");
  const hasSR = allSurrounds.some((s) => getCanonicalRole(s.role) === "SR");

  const eligibleSurrounds = allSurrounds.filter((s) => {
    const r = getCanonicalRole(s.role);
    if (r === "LW" || r === "RW") return hasSL && hasSR;
    return true;
  });

  if (eligibleSurrounds.length < 2) return null;

  // 3) Compute azimuth of each surround from this seat
  const az = [];
  for (const sp of eligibleSurrounds) {
    const a = azimuthDegFromSeat(effectiveHoveredSeat, sp.position);
    if (Number.isFinite(a)) az.push({ a, sp });
  }

  if (az.length < 2) return null;

  // 4) Sort by raw angle (-180..+180)
  const sortedItems = az.sort((a, b) => a.a - b.a);

  // 5) Build segments between each neighbour
  const segments = [];
  for (let i = 0; i < sortedItems.length; i++) {
    const current = sortedItems[i];
    const next = sortedItems[(i + 1) % sortedItems.length];

    let angle1 = current.a;
    let angle2 = next.a;

    if (angle2 < angle1) angle2 += 360;

    segments.push({ sp1: current.sp, sp2: next.sp, angleA: angle1, angleB: angle2 });
  }

  const seatPx = toPx(effectiveHoveredSeat.x, effectiveHoveredSeat.y);
  const labelGroup = [];

  segments.forEach(({ sp1, sp2, angleA, angleB }, idx) => {
    // 1) Work out the mid-angle of this segment
    const rawMid = (angleA + angleB) / 2;

    // Normalise mid-angle to range -180..+180 (0° = straight ahead to screen)
    const midNorm = ((rawMid + 540) % 360) - 180;

    // 2) Skip segments whose midpoint is in front of the listener
    //    RP22 P5 cares about the surround field, not a gap across the screen.
    //    Anything within ±60° of straight ahead is treated as "front" and ignored.
    if (Math.abs(midNorm) < 60) {
      return;
    }

    // 3) Compute the smaller arc angle between the two speakers
    let deg = angleB - angleA;
    if (deg > 180) deg = 360 - deg;

    if (!Number.isFinite(deg) || deg <= 0) {
      return;
    }

    // 4) Draw lines from seat to each speaker
    const [x1, y1] = toPx(sp1.position.x, sp1.position.y);
    const [x2, y2] = toPx(sp2.position.x, sp2.position.y);

    labelGroup.push(
      <line
        key={`rp22-angle-line1-${idx}`}
        x1={x1}
        y1={y1}
        x2={seatPx[0]}
        y2={seatPx[1]}
        stroke="#888"
        strokeWidth="1"
        opacity="0.6"
      />
    );
    labelGroup.push(
      <line
        key={`rp22-angle-line2-${idx}`}
        x1={x2}
        y1={y2}
        x2={seatPx[0]}
        y2={seatPx[1]}
        stroke="#888"
        strokeWidth="1"
        opacity="0.6"
      />
    );

    // 5) Position the label slightly away from the seat along the segment midpoint
    const R = 0.6; // metres offset from seat for the text

    const [px, py] = toPx(
      effectiveHoveredSeat.x + R * Math.sin((rawMid * Math.PI) / 180),
      effectiveHoveredSeat.y - R * Math.cos((rawMid * Math.PI) / 180)
    );

    const text = `${deg.toFixed(1)}°`;

    labelGroup.push(
      <text
        key={`rp22-angle-text-${idx}`}
        x={px}
        y={py}
        fill="#666"
        fontSize="11"
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {text}
      </text>
    );
  });

  if (!labelGroup.length) return null;

  return <g aria-label="rp22-surround-angles">{labelGroup}</g>;
}, [effectiveHoveredSeat, placedSpeakers, scale, toPx, getCanonicalRole]);

  // Build HUD style safely
  const hudDynamicStyle = useMemo(() => {
    const s = {};
    if (isHudPinned && hudPinnedOffsetPx) {
      s.transform = `translate3d(${hudPinnedOffsetPx.x}px, ${hudPinnedOffsetPx.y}px, 0)`;
    }
    if (isHudPinned && hudHiddenWhenPinned) {
      s.visibility = 'hidden';
      s.pointerEvents = 'none';
    }
    return s;
  }, [isHudPinned, hudPinnedOffsetPx, hudHiddenWhenPinned]);


// --- Main render ---
// SAFETY: local fallbacks in case parent metrics/ids are not initialised yet
const svgWSafe = Number(svgW) || Math.max(1, Number(roomRect?.width)  || 1200);
const svgHSafe = Number(svgH) || Math.max(1, Number(roomRect?.height) || 800);
const idsGrid = (ids && ids.grid) ? ids.grid : 'b44_grid_fallback';
const idsClip = (ids && ids.clip) ? ids.clip : 'b44_clip_fallback';

return (
  <div
    ref={planBoundsRef} // Renamed from containerRef
    className="relative w-full h-full overflow-auto bg-gray-50"
    style={{
      aspectRatio: aspect,
      border: '1px solid #DCDBD6',
      borderRadius: '0px', // Square corners - no rounded edges
      backgroundColor: '#F8F8F7',
    }}
  >
    {/* Toolbar has been moved to the parent component's accordion */}

    {/* CANVAS WRAPPER (no tailwind) */}
    <div style={canvasStyle}>
<ZoomButtons onZoomIn={handleZoomIn} onZoomOut={handleZoomOut} />

      {/* ROOT SVG */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${svgWSafe} ${svgHSafe}`}
        preserveAspectRatio="xMidYMid meet"
        shapeRendering="geometricPrecision"
        style={{
          display: 'block',
          width: '100%',
          height: 'auto',
          background: '#F8F8F7',
          maxWidth: '100%',
          overflow: 'hidden',
          position: 'relative',
          zIndex: 1,
        }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
<SvgDefs ids={ids} scale={scale} svgW={svgW} svgH={svgH} />

{/* Removed debug label (zoneKeysLabel) */}

          {/* ZOOM GROUP — CLIPPED TO VIEWPORT, SO IT CAN'T ESCAPE */}
          <g
              clipPath={`url(#${idsClip})`}
  transform={
    `translate(${svgWSafe / 2}, ${roomRect.y || 0}) ` +
    `scale(${Number(zoom) || 1}) ` +
    `translate(${-svgWSafe / 2}, ${-(roomRect.y || 0)})`
  }
          >
            {/* Layer 1: Grid Backdrop (Bottom Layer) - Now centre-anchored */}
            <g data-layer="grid">
              {/* Draw vertical grid lines (centre-anchored) */}
              {(() => {
                const GRID_STEP_M = 0.5;
                const centreXM = widthM / 2;
                const verticalLines = [];

                // Centre line
                const centreXCanvas = meterToCanvasX(centreXM);
                verticalLines.push(
                  <line
                    key="grid-x-centre"
                    x1={centreXCanvas}
                    y1={roomRect.y}
                    x2={centreXCanvas}
                    y2={roomRect.y + roomRect.height}
                    stroke="#E6E4DD"
                    strokeWidth="0.5"
                  />
                );

                // Step outwards from centre
                let offsetIndex = 1;
                while (true) {
                  const leftXM = centreXM - offsetIndex * GRID_STEP_M;
                  const rightXM = centreXM + offsetIndex * GRID_STEP_M;
                  let anyDrawn = false;

                  if (leftXM >= 0) {
                    const xCanvas = meterToCanvasX(leftXM);
                    verticalLines.push(
                      <line
                        key={`grid-x-left-${offsetIndex}`}
                        x1={xCanvas}
                        y1={roomRect.y}
                        x2={xCanvas}
                        y2={roomRect.y + roomRect.height}
                        stroke="#E6E4DD"
                        strokeWidth="0.5"
                      />
                    );
                    anyDrawn = true;
                  }

                  if (rightXM <= widthM) {
                    const xCanvas = meterToCanvasX(rightXM);
                    verticalLines.push(
                      <line
                        key={`grid-x-right-${offsetIndex}`}
                        x1={xCanvas}
                        y1={roomRect.y}
                        x2={xCanvas}
                        y2={roomRect.y + roomRect.height}
                        stroke="#E6E4DD"
                        strokeWidth="0.5"
                      />
                    );
                    anyDrawn = true;
                  }

                  if (!anyDrawn) break;
                  offsetIndex += 1;
                }

                return verticalLines;
              })()}

              {/* Draw horizontal grid lines (front-anchored, unchanged) */}
              {(() => {
                const GRID_STEP_M = 0.5;
                const horizontalLines = [];

                for (let yM = 0; yM <= lengthM + 1e-6; yM += GRID_STEP_M) {
                  const yCanvas = meterToCanvasY(yM);
                  horizontalLines.push(
                    <line
                      key={`grid-y-${yM}`}
                      x1={roomRect.x}
                      y1={yCanvas}
                      x2={roomRect.x + roomRect.width}
                      y2={yCanvas}
                      stroke="#E6E4DD"
                      strokeWidth="0.5"
                    />
                  );
                }

                return horizontalLines;
              })()}
            </g>

            {/* Layer 2: Room Outline and Furniture */}
            <rect
              x={roomRect.x}
              y={roomRect.y}
              width={roomRect.width}
              height={roomRect.height}
              fill="none"
              stroke="#DCDBD6"
              strokeWidth={2}
            />

            {/* Screen and baffle - Layer 3: Visual representation of the screen and baffle */}
            {BaffleAndScreen}


            {/* SCREEN WALL LABEL */}
            <text x={svgW / 2} y={roomRect.y - 10} fontSize="12" textAnchor="middle" fill="#625143" style={{ fontFamily: 'Didact Gothic, sans-serif' }}>
              Screen Wall
            </text>

            {/* RP22 Zones Overlay - UNCONDITIONAL MOUNT */}
            <g className="rp22-zones-layer" pointerEvents="none">
              <RP22ZonesOverlay
                overlays={overlaysForRendering}
                zones={augmentedZones}
                toPx={toPx}
                lcrOnly={false}
                placedSpeakers={placedSpeakers}
                mlpPoint={mlp}
                dimensions={{ width: widthM, length: lengthM, height: heightM }} // Pass room dims object
                getModelDimsM={getModelDimsM}
                WALL_BUFFER_M={WALL_BUFFER_M}
                roomRect={roomRect}
              />
            </g>

            {/* Layer 5: Other Informational Zone Overlays */}
            {!!overlaysForRendering?.LCR && ZoneComponents.LCR}
            {!!overlaysForRendering?.SIDE_SURROUND && ZoneComponents.SIDE_SURROUND}
            {!!overlaysForRendering?.REAR_SURROUND && ZoneComponents.REAR_SURROUND}
            {overlaysForRendering?.OVERHEADS?.status === 'ok' && ZoneComponents.OVERHEADS}
            {overlaysForRendering?.enableDolbyZones && renderDolbyZones()}
            
            {/* NEW: Front Wide Zones - Rendered conditionally based on overlaysForRendering.enableFrontWides */}
            {overlaysForRendering?.enableFrontWides && ZoneComponents.FRONT_WIDE}

            {/* Layer 6: Static Room Elements (furniture, etc.) */}
            {renderRoomElements()}

            {/* Layer 7: MLP Marker (Fixed point, generally on top of zones but under draggable items) */}
            {MLPMarker}


            {/* Layer 8: Subwoofers (generally non-draggable, but present) */}
            {Array.isArray(frontSubs) && frontSubs.length > 0 && (
              <FrontSubsLayer
                frontSubs={frontSubs}
                toPx={toPx}
                getModelDimsM={getModelDimsM}
                scale={scale}
              />
            )}
            {renderSubwoofers()}

            {/* Layer 9: Draggable Seating Positions */}
            {renderSeatingPositions()}

            {/* NEW: Render overhead icons */}
            {overheadIconElements}

            {/* Layer 10: Draggable Speakers (now on top of overheads) */}
            {renderSpeakers()}

            {/* Layer 11: Speaker Labels (on top of speakers) */}
            {renderSpeakerLabels()}

            {/* RP22 Surround Angles Overlay */}
            {renderRp22AnglesOverlay()}

<PlanMessages
  dragWarning={dragWarning}
  tooltip={tooltip}
  hoveredSpeaker={hoveredSpeaker}
  svgW={svgW}
/>

          </g>
        </svg>

        {/* SEAT HOVER HUD - updated with drag and hide/show */}
        {effectiveHoveredSeat && tooltipData && (
          <div
            ref={hudElRef}
            className="seat-hud"
            style={{
              position: 'absolute',
              left: hudPosition?.x || 20,
              top: hudPosition?.y || 20,
              background: 'white',
              border: '1px solid #DCDBD6',
              borderRadius: 8,
              padding: 12,
              boxShadow: '0 44px 12px rgba(0,0,0,0.15)',
              pointerEvents: isHudPinned ? 'auto' : 'none', // Allow interaction when pinned
              zIndex: 1000,
              minWidth: 260,
              maxWidth: 320,
              fontSize: 11,
              color: '#625143',
              maxHeight: '80vh',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              ...hudDynamicStyle
            }}
          >
            {/* Header with drag handle and eye icon */}
            <div
              onMouseDown={onHudHeaderMouseDown}
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: '#1B1A1A',
                marginBottom: 4,
                paddingBottom: 4,
                borderBottom: '1px solid #E6E4DD',
                cursor: isHudPinned ? 'move' : 'default',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div>
                {tooltipData.seatId} {tooltipData.isPrimary ? '(MLP)' : ''}
                {isHudPinned && (
                  <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 500, color: '#999' }}>(Pinned)</span>
                )}
              </div>

              {isHudPinned && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setHudHiddenWhenPinned(v => !v);
                  }}
                  aria-label={hudHiddenWhenPinned ? 'Show HUD' : 'Hide HUD'}
                  title={hudHiddenWhenPinned ? 'Show HUD (H)' : 'Hide HUD (H)'}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    padding: '2px 4px',
                    lineHeight: 1,
                    fontSize: 14
                  }}
                >
                  {hudHiddenWhenPinned ? '👁️‍🗨️' : '👁️'}
                </button>
              )}
            </div>

            {/* Basic info */}
            <div style={{ marginBottom: 4 }}>
              <div>Position: {tooltipData.position}</div>
              <div>Distance to Screen: {tooltipData.distanceToScreen}</div>
              {tooltipData.distanceToMLP !== '—' && (
                <div>Distance to MLP: {tooltipData.distanceToMLP}</div>
              )}
            </div>

            {/* RP23 */}
            {tooltipData.rp23.formatted !== '—' && (
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                padding: '4px 0',
                borderTop: '1px solid #E6E4DD'
              }}>
                <span>RP23 Horizontal: {tooltipData.rp23.formatted}</span>
                {renderLevelBadge(tooltipData.rp23.level)}
              </div>
            )}

            {/* SPL @ Seat section */}
            {(Object.keys(tooltipData.splAtSeat.lcr).length > 0 || 
              Object.keys(tooltipData.splAtSeat.surrounds).length > 0 || 
              Object.keys(tooltipData.splAtSeat.overheads).length > 0) && (
              <div style={{ 
                borderTop: '1px solid #E6E4DD',
                marginTop: '8px',
                paddingTop: '8px'
              }}>
                <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '6px', color: '#1B1A1A' }}>
                  SPL @ Seat (Target: 100W)
                </div>
                
                {Object.keys(tooltipData.splAtSeat.lcr).length > 0 && (
                  <div style={{ marginBottom: '4px' }}>
                    <div style={{ fontSize: '11px', color: '#888', marginBottom: '2px' }}>Screen:</div>
                    {Object.entries(tooltipData.splAtSeat.lcr).map(([role, spl]) => (
                      <div key={role} style={{ fontSize: '12px', paddingLeft: '8px' }}>
                        {role}: {spl.formatted}
                      </div>
                    ))}
                  </div>
                )}

                {Object.keys(tooltipData.splAtSeat.surrounds).length > 0 && (
                  <div style={{ fontSize: '11px', color: '#888', marginBottom: '2px' }}>Surrounds:</div>
                )}
                  {Object.entries(tooltipData.splAtSeat.surrounds).map(([role, spl]) => (
                    <div key={role} style={{ fontSize: '12px', paddingLeft: '8px' }}>
                      {role}: {spl.formatted}
                    </div>
                  ))}
                
                {Object.keys(tooltipData.splAtSeat.overheads).length > 0 && (
                  <div style={{ marginBottom: '4px' }}>
                    <div style={{ fontSize: '11px', color: '#888', marginBottom: '2px' }}>Overheads:</div>
                    {Object.entries(tooltipData.splAtSeat.overheads).map(([role, spl]) => (
                      <div key={role} style={{ fontSize: '12px', paddingLeft: '8px' }}>
                        {role}: {spl.formatted}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}


            {/* RP22 Metrics */}
            <div style={{ borderTop: '1px solid #E6E4DD', paddingTop: 4, marginTop: 4 }}>
              <div style={{ fontWeight: 600, fontSize: 11, marginBottom: 4, color: '#1B1A1A' }}>
                RP22 Per-Seat Metrics
              </div>
              
              {/* Always show all RP22 metrics */}
              {['p1','p4','p5','p6','p9','p10','p16','p17','p20'].map(key => {
                const metric = tooltipData.rp22?.[key];
                if (!metric) return null; // Should not happen with robust initialization
                
                return (
                  <div key={key} style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    padding: '2px 0',
                    fontSize: '12px'
                  }}>
                    <span>{key.toUpperCase()}: {metric.formatted || '—'}</span>
                    {renderLevelBadge(metric.level || '—')}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});