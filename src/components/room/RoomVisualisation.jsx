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
  const [dragWarning, setDragWarning] = useState({ show: false, message: '', x: 0, y: 0 });
  const [constraintZones, setConstraintZones] = useState(null);
  const [zoom, setZoom] = React.useState(1.0);
  const [calculatedMinScreenDepthM, setCalculatedMinScreenDepthM] = useState(WALL_BUFFER_M + SCREEN_BUFFER_M);
  const [containerW, setContainerW] = useState(0);
  const [containerH, setContainerH] = useState(0);
  const [hoveredSeat, setHoveredSeat] = useState(null);
  const [hudPinnedSeatId, setHudPinnedSeatId] = useState(null);
  const [seatPanelPos, setSeatPanelPos] = useState(null);
  const seatPanelDragRef = useRef({
    dragging: false,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
  });
  const [hudHiddenWhenPinned, setHudHiddenWhenPinned] = useState(false);
  const [planBoundsRect, setPlanBoundsRect] = useState(null);
  const planBoundsRef = useRef(null);
  const svgRef = useRef(null);
  const slsrModeRef = React.useRef('side');
  const rearModeRef = React.useRef('back');
  const lastInteractionEpoch = React.useRef(0);
  const rsLastLiveResetEpoch = React.useRef(0);
  const dragStartCanvasPosRef = useRef(null);
  const dragStartRoomPosRef = useRef(null);
  const dragStartSpeakerPosRef = useRef(null);
  const rsDragLockRef = useRef(null);
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
      setHudHiddenWhenPinned(false);
    }
  }, [isHudPinned]);

  React.useLayoutEffect(() => {
    if (!planBoundsRef.current) return;
    const rect = planBoundsRef.current.getBoundingClientRect();
    setPlanBoundsRect(rect);
  }, [containerW, containerH]);

  // ---------------------------------------------------------------------------
  // HELPER FUNCTIONS (declare early to avoid TDZ)
  // ---------------------------------------------------------------------------




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

  // Combine hoveredSeat and pinnedSeat for effective display
  const effectiveHoveredSeat = useMemo(() => {
    if (hudPinnedSeatId) {
      return seatingPositions.find(s => s.id === hudPinnedSeatId) || null;
    }
    return hoveredSeat;
  }, [hudPinnedSeatId, hoveredSeat, seatingPositions]);

  // Calculate HUD position
  const hudPosition = useMemo(() => {
    if (!effectiveHoveredSeat || !toPx || !roomRect) return null;

    const [seatX_px, seatY_px] = toPx(Number(effectiveHoveredSeat.x || effectiveHoveredSeat.position?.x || 0), Number(effectiveHoveredSeat.y || effectiveHoveredSeat.position?.y || 0));
    
    const HUD_EST_W = 280;
    const HUD_EST_H = 340;

    const pad = 8;
    let preferredX = seatX_px + 16;
    let preferredY = seatY_px - HUD_EST_H / 2;

    // Flip to left if not enough space on right
    if (preferredX + HUD_EST_W + pad > roomRect.x + roomRect.width) {
      preferredX = seatX_px - HUD_EST_W - 16;
    }

    // Clamp to canvas bounds
    const clampedX = Math.min(
      roomRect.x + roomRect.width - HUD_EST_W - pad,
      Math.max(roomRect.x + pad, preferredX)
    );

    const clampedY = Math.min(
      roomRect.y + roomRect.height - HUD_EST_H - pad,
      Math.max(roomRect.y + pad, preferredY)
    );

    return { x: clampedX, y: clampedY };
  }, [effectiveHoveredSeat, toPx, roomRect]);

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
  const handleMouseDown = useCallback((e, id, type) => {
    e.preventDefault();
    e.stopPropagation();

    const target = byId.get(id);
    if (!target) return;

    // Prevent dragging invisible placeholders
    if (type === 'speaker' && !isRenderableSpeaker(target)) return;

    if (type === 'speaker' && !isDraggable(target)) {
      setTooltip({ show: true, text: "Position is locked" });
      setTimeout(() => setTooltip(t => (t.text === "Position is locked" ? { show: false } : t)), 1500);
      return;
    }

    setDragState({
      dragging: true,
      draggedItemId: id,
      dragType: type,
    });
    setDragWarning({ show: false });
    rsDragLockRef.current = null;

    if (type === 'speaker') {
      const speakerBeingDragged = byId.get(id);
      const canonRole = getCanonicalRole(speakerBeingDragged.role);
      if (canonRole === 'SBL' || canonRole === 'SBR') {
        isDraggingRearRef.current++;
      }
      if (canonRole === 'LW' || canonRole === 'RW') {
        isDraggingFW.current = true;
      }
    }
  }, [byId, setDragState, setDragWarning, setTooltip, rsDragLockRef, getCanonicalRole]);

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

    const canonicalRole = getCanonicalRole(spk.role);

    if (!isDraggable(spk)) {
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
    if (canonicalRole.startsWith('T')) {
      if (!overheadZones || overheadZones.status !== 'ok') {
        // Allow free placement within room if zones not ready
        const clampedX = Math.max(0, Math.min(widthM, rawX));
        const clampedY = Math.max(0, Math.min(lengthM, rawY));
        
        onSetSpeakers(prev => prev.map(s => {
          if (s.id === speakerId) {
            return { ...s, position: { ...s.position, x: clampedX, y: clampedY, outOfZone: false } };
          }
          return s;
        }));
        
        lastInteractionEpoch.current = timeNowMs();
        return;
      }

      // Map overhead role to zone
      let targetZone = null;
      let rowKey = null;
      if (['TFL', 'TFR'].includes(canonicalRole)) {
        targetZone = overheadZones.frontZone;
        rowKey = 'front';
      } else if (['TL', 'TR', 'TML', 'TMR'].includes(canonicalRole)) {
        targetZone = overheadZones.midZone;
        rowKey = 'mid';
      } else if (['TBL', 'TBR'].includes(canonicalRole)) {
        targetZone = overheadZones.backZone;
        rowKey = 'back';
      }

      if (!targetZone || !targetZone.active) {
        // Zone not active, allow free placement
        const clampedX = Math.max(0, Math.min(widthM, rawX));
        const clampedY = Math.max(0, Math.min(lengthM, rawY));
        
        onSetSpeakers(prev => prev.map(s => {
          if (s.id === speakerId) {
            return { ...s, position: { ...s.position, x: clampedX, y: clampedY, outOfZone: false } };
          }
          return s;
        }));
        
        lastInteractionEpoch.current = timeNowMs();
        return;
      }

      // Clamp to zone bounds (RP22-compliant)
      const { x1, x2, y1, y2 } = targetZone;
      const { x: rawX, y: rawY } = canvasToRoom(newCanvasPos); // Redeclared
      const clampedY = Math.max(y1, Math.min(y2, rawY));
      const outOfZone = rawY < y1 || rawY > y2;

      // Determine if this is .4 or .6 layout (requires pair snapping)
      const requiresPairSnapping = dolbyLayout?.split('.')?.[2] && 
        (parseInt(dolbyLayout.split('.')[2]) === 4 || parseInt(dolbyLayout.split('.')[2]) === 6);

      if (requiresPairSnapping && rowKey) {
        // Find partner in the same row
        const isLeft = ['TFL', 'TL', 'TBL'].includes(canonicalRole);
        const partnerRole = isLeft 
          ? (rowKey === 'front' ? 'TFR' : rowKey === 'mid' ? 'TR' : 'TBR')
          : (rowKey === 'front' ? 'TFL' : rowKey === 'mid' ? 'TL' : 'TBL');

        const partner = placedSpeakers.find(s => getCanonicalRole(s.role) === partnerRole);

        // Update both speakers in the row with same Y, keep their X on overhead lines
        onSetSpeakers(prev => prev.map(s => {
          const sRole = getCanonicalRole(s.role);
          if (sRole === canonicalRole) {
            return { 
              ...s, 
              position: { 
                ...s.position, 
                x: isLeft ? x1 : x2, 
                y: clampedY 
              },
              outOfZone 
            };
          }
          if (partner && sRole === partnerRole) {
            return { 
              ...s, 
              position: { 
                ...s.position, 
                x: isLeft ? x2 : x1, 
                y: clampedY 
              },
              outOfZone 
            };
          }
          return s;
        }));
      } else {
        // .2 or single speaker: just clamp to zone
        const isLeft = ['TFL', 'TL', 'TBL'].includes(canonicalRole);
        onSetSpeakers(prev => prev.map(s => {
          if (s.id === speakerId) {
            return { 
              ...s, 
              position: { 
                ...s.position, 
                x: isLeft ? x1 : x2, 
                y: clampedY 
              },
              outOfZone 
            };
          }
          return s;
        }));
      }

      lastInteractionEpoch.current = timeNowMs();
      return;
    }

    // Generic fallback for any other speakers
    const { x: rawX, y: rawY } = canvasToRoom(newCanvasPos); // Redeclared
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
    setSeatPanelPos(null);
  }, []);

  const handleSeatMouseEnter = useCallback((seat) => {
    if (!hudPinnedSeatId) setHoveredSeat(seat);
  }, [hudPinnedSeatId]);

  const handleSeatMouseLeave = useCallback(() => {
    if (!hudPinnedSeatId) setHoveredSeat(null);
  }, [hudPinnedSeatId]);

  // Drag handlers for seat panel (defined after hudPosition)
  const onHudHeaderMouseDown = useCallback((e) => {
    if (!planBoundsRect) return;
    e.preventDefault();

    const currentPos = seatPanelPos || {
      x: hudPosition?.x || (planBoundsRect.width / 2) - 140,
      y: hudPosition?.y || 20,
    };

    seatPanelDragRef.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      origX: currentPos.x,
      origY: currentPos.y,
    };

    window.addEventListener("mousemove", handleHudMouseMove);
    window.addEventListener("mouseup", handleHudMouseUp);
  }, [planBoundsRect, seatPanelPos, hudPosition]);

  const handleHudMouseMove = useCallback((e) => {
    const state = seatPanelDragRef.current;
    if (!state.dragging || !planBoundsRect) return;

    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;

    let newX = state.origX + dx;
    let newY = state.origY + dy;

    const panelWidth = 320;
    const panelHeight = 450;

    const minX = 0;
    const minY = 0;
    const maxX = planBoundsRect.width - panelWidth;
    const maxY = planBoundsRect.height - panelHeight;

    newX = Math.max(minX, Math.min(maxX, newX));
    newY = Math.max(minY, Math.min(maxY, newY));

    setSeatPanelPos({ x: newX, y: newY });
  }, [planBoundsRect]);

  const handleHudMouseUp = useCallback(() => {
    seatPanelDragRef.current.dragging = false;
    window.removeEventListener("mousemove", handleHudMouseMove);
    window.removeEventListener("mouseup", handleHudMouseUp);
  }, [handleHudMouseMove]);

  const mlpAnchorEffective = mlp;

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

  // Build HUD style safely
  const hudDynamicStyle = useMemo(() => {
    if (seatPanelPos) {
      return {
        left: seatPanelPos.x,
        top: seatPanelPos.y,
      };
    }
    
    // Default positioning when not dragged
    return {
      left: hudPosition?.x || 20,
      top: hudPosition?.y || 20,
    };
  }, [seatPanelPos, hudPosition]);

  const hudVisibilityStyle = useMemo(() => {
    if (isHudPinned && hudHiddenWhenPinned) {
      return {
        visibility: 'hidden',
        pointerEvents: 'none',
      };
    }
    return {};
  }, [isHudPinned, hudHiddenWhenPinned]);


  const containerRect = planBoundsRef.current?.getBoundingClientRect();

  const svgW = containerW;
  const svgH = containerH;

  const canvasStyle = {
    position: 'relative',
    width: '100%',
    height: '100%',
  };

  const overlaysForRendering = _overlays || {};

  const augmentedZones = {
    lcrZoneBlocks,
    frontWideZones,
    sideSurroundBounds,
    rearSurroundZones,
    overheadZones,
  };

  // Render functions
  const renderRoomElements = () => null;
  const renderSubwoofers = () => null;
  const renderSeatingPositions = () => {
    return seatingPositions.map(seat => {
      const [x, y] = toPx(seat.x, seat.y);
      return (
        <circle
          key={seat.id}
          cx={x}
          cy={y}
          r={8}
          fill={seat.isPrimary ? '#10B981' : '#3B82F6'}
          stroke="white"
          strokeWidth="2"
          style={{ cursor: 'pointer' }}
          onMouseDown={(e) => handleMouseDown(e, seat.id, 'seat')}
          onMouseEnter={() => handleSeatMouseEnter(seat)}
          onMouseLeave={handleSeatMouseLeave}
          onClick={() => handleSeatClick(seat)}
        />
      );
    });
  };
  
  const overheadIconElements = null;
  const renderSpeakers = () => {
    return placedSpeakers.filter(isRenderableSpeaker).map(spk => {
      const [x, y] = toPx(spk.position.x, spk.position.y);
      const dims = getModelDimsM(spk.model);
      const yawDeg = getYawForObject(spk, lcrAngleInfo, aimAtMLP, { width: widthM, length: lengthM }, getModelDimsM);
      
      return (
        <SpeakerIcon
          key={spk.id}
          speaker={spk}
          x={x}
          y={y}
          dims={dims}
          scale={scale}
          yawDeg={yawDeg}
          onMouseDown={(e) => handleMouseDown(e, spk.id, 'speaker')}
          onMouseEnter={() => setHoveredSpeaker(spk)}
          onMouseLeave={() => setHoveredSpeaker(null)}
        />
      );
    });
  };
  
  const renderSpeakerLabels = () => {
    return placedSpeakers.filter(isRenderableSpeaker).map(spk => {
      const [x, y] = toPx(spk.position.x, spk.position.y);
      return (
        <text
          key={`label-${spk.id}`}
          x={x}
          y={y - 20}
          fontSize="10"
          textAnchor="middle"
          fill="#625143"
          pointerEvents="none"
        >
          {getCanonicalRole(spk.role)}
        </text>
      );
    });
  };
  
  const renderRp22AnglesOverlay = () => null;
  const renderDolbyZones = () => null;
  
  const ZoneComponents = {
    LCR: null,
    SIDE_SURROUND: null,
    REAR_SURROUND: null,
    OVERHEADS: null,
    FRONT_WIDE: null,
  };
  
  const MLPMarker = mlp ? (
    <circle
      cx={mlpPxX}
      cy={mlpPxY}
      r={6}
      fill="#10B981"
      stroke="white"
      strokeWidth="2"
      pointerEvents="none"
    />
  ) : null;

  const renderLevelBadge = useCallback((level) => {
    if (!level || level === 'N/A' || level === '—' || level === 'Below L1') {
      return <span style={{ fontSize: 10, color: '#999' }}>{level || '—'}</span>;
    }
    
    const bgColor = level === 'L4' ? '#10B981' :
                    level === 'L3' ? '#FBBF24' :
                    level === 'L2' ? '#F97316' : '#EF4444';
    
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
      borderRadius: 0,
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
            {!!overlaysForRendering?.OVERHEADS && ZoneComponents.OVERHEADS}
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
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
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
              background: 'white',
              border: '1px solid #DCDBD6',
              borderRadius: 8,
              padding: 12,
              ...hudDynamicStyle,
              ...hudVisibilityStyle,
              pointerEvents: isHudPinned ? 'auto' : 'none', // Allow interaction when pinned
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
                cursor: 'move',
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