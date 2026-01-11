"use client";

import React, { useMemo, useCallback, useState, useRef, useImperativeHandle, useEffect, forwardRef } from "react";
import { Layers3, Compass } from 'lucide-react';
import SeatHud from "@/components/room/SeatHud";
import { getSpeakerModelMeta } from "@/components/models/speakers/registry";
import {
  rp23HorizontalAngleForSeat,
  verticalViewingAngleDeg,
} from '@/components/utils/seatHover';
import { buildRoleMap, isDraggable, clampSideSurroundDrag, clampRearSurroundDrag } from "@/components/utils/speakerUtils";
import { calibratedSplAtSeat, normalizeToRsp, p4DeltaAndLevel, euclideanDistance } from "@/components/utils/splMath";
import { rolesForLayout } from "@/components/utils/surroundRoleMap";
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

import { computeOverheadZones, renderOverheadBandsSVG } from '@/components/room/overlays/OverheadZones';
import { clampOverheadToZone, clampSymmetricOverheadPair, clampOverheadPairPosition } from '@/components/utils/overheadDragClamping';
import { useOverheadAutoPlacement } from '@/components/hooks/useOverheadAutoPlacement';
import { useEnsureOverheadPairs } from '@/components/hooks/useEnsureOverheadPairs';
import FrontSubsLayer from "@/components/room/overlays/FrontSubsLayer";
import PlanMessages from '@/components/room/PlanMessages';
import SvgDefs from '@/components/room/SvgDefs';
import SpeakerPositionsOverlay from '@/components/room/overlays/SpeakerPositionsOverlay';

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
  TML: 'TMR',
  TMR: 'TML',
  TRL: 'TRR',
  TRR: 'TRL',
};

// --- OVERHEAD HELPERS (RoomVisualisation) ---
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

// NEW: Shared MLP aiming function (used by all speaker groups)
const getAimingYawDeg = (speaker, mlpTarget) => {
  if (!speaker?.position) return 0;
  return safeYawToMLP(speaker.position, mlpTarget);
};

// NEW: Helper function to compute yaw angle for a speaker
const getYawForObject = (speaker, lcrAngles, aimAtMLP) => {
  if (!speaker) return 0;
  const role = String(speaker.role || '').toUpperCase();

  // LCR: use precomputed angles when aiming at MLP
  if (aimAtMLP && (role === 'FL' || role === 'L')) return (Number(lcrAngles?.L) || 0);
  if (aimAtMLP && (role === 'FR' || role === 'R')) return (Number(lcrAngles?.R) || 0);
  if (role === 'FC' || role === 'C') return 0;

  // Other speakers default to 0° (wall-hugging logic moved to renderSpeakers)
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
  const SCREEN_GAP_M = 0.01; // 1cm gap between speaker and screen
  if (!frontObjects.length) return WALL_BUFFER_M + SCREEN_GAP_M;

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

    // CRITICAL: Use stroke-aware calculation to match LCR positioning logic
    const half = yHalfExtentM(depthM, widthM, yawDeg);
    const projectedY = 2 * half;

    // hard planes: wall (y=0) + screen plane
    return WALL_BUFFER_M + projectedY + SCREEN_GAP_M;
  });

  // the screen must clear the *deepest* front object
  return Math.max(...neededEach, WALL_BUFFER_M + SCREEN_GAP_M);
}

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
        if (globalThis.__B44_LOGS) if (globalThis.__B44_LOGS) if (globalThis.__B44_LOGS) console.error('pickMLP failed in RoomVisualisation:', err);
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
  const [panX, setPanX] = React.useState(0);
  const [panY, setPanY] = React.useState(0);
  const [viewOffsetPx, setViewOffsetPx] = React.useState({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const zoomMode = zoomModeProp;
  const lastPointerRef = useRef({ x: 0, y: 0 });
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
      if (globalThis.__B44_LOGS) if (globalThis.__B44_LOGS) if (globalThis.__B44_LOGS) console.error("Error in buildRoleMap:", e);
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

  // Index speakers
  (placedSpeakers || []).forEach((spk) => {
    if (!spk) return;

    // 1) Primary key: id (if present)
    if (spk.id) map.set(spk.id, spk);

    // 2) Fallback key: role (needed for overheads when id is missing/unstable)
    if (spk.role) map.set(String(spk.role).toUpperCase(), spk);
  });

  // Index seats (keep existing behaviour)
  (seatingPositions || []).forEach((seat) => {
    if (!seat) return;
    if (seat.id) map.set(seat.id, seat);
  });

  // Index subwoofers
  (frontSubs || []).forEach((sub, idx) => {
    if (!sub) return;
    const id = sub.id || `front-sub-${idx}`;
    map.set(id, { ...sub, _subType: 'front' });
  });
  
  (rearSubs || []).forEach((sub, idx) => {
    if (!sub) return;
    const id = sub.id || `rear-sub-${idx}`;
    map.set(id, { ...sub, _subType: 'rear' });
  });

  return map;
}, [placedSpeakers, seatingPositions, frontSubs, rearSubs]);

  // Removed seatBandXBounds - computed after overheadZones is defined

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

    // calculatedMinScreenDepthM already includes the 1cm gap, don't add it again
    const minDepthForSpeakersToClear = calculatedMinScreenDepthM;

    if (screenPlaneMode === 'autoTight') {
      return minDepthForSpeakersToClear;
    } else {
      return Math.max(floatDepthM, minDepthForSpeakersToClear);
    }
  }, [
    calculatedMinScreenDepthM,
    screen?.floatDepthM,
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
const lastSentScreenPlaneRef = React.useRef(null);

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

// NEW: Publish live screen plane Y to screen object for Live Metrics (immediate, no debounce)
React.useEffect(() => {
  if (typeof props.onScreenPlaneYChange !== 'function') return;
  if (!Number.isFinite(actualScreenFrontY)) return;

  // Round to mm to prevent jitter
  const rounded = Math.round(actualScreenFrontY * 1000) / 1000;
  
  // Only call if value actually changed
  if (lastSentScreenPlaneRef.current === rounded) return;
  lastSentScreenPlaneRef.current = rounded;
  
  props.onScreenPlaneYChange(rounded);
}, [actualScreenFrontY, props.onScreenPlaneYChange]);

  const TOP_GUTTER_PX = 150; // reserved space above room for dimension lines
  
  const availW = (containerW || DEFAULT_W) - 2 * PADDING;
  const availH = (containerH || DEFAULT_H) - 2 * PADDING - TOP_GUTTER_PX;
  const scale = useMemo(() =>
    Math.min(availW / widthM, availH / lengthM),
    [availW, availH, widthM, lengthM]);

  const roomRect = useMemo(() => ({
    x: PADDING, 
    y: PADDING + TOP_GUTTER_PX,
    width: widthM * scale, 
    height: lengthM * scale
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
    // Account for view offset from pan
    const xM = (posPx.x - roomRect.x - viewOffsetPx.x) / scale;
    const yM = (posPx.y - roomRect.y - viewOffsetPx.y) / scale;
    return { x: xM, y: yM };
  }, [roomRect, scale, viewOffsetPx]);

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
        if (globalThis.__B44_LOGS) if (globalThis.__B44_LOGS) console.warn('[FW zones] compute failed', e);
      }
    }

    // Debug hook: expose computed zones
    if (typeof window !== 'undefined') {
      window.FW_DBG = result;
      if (appState_DBG_FW) {
        if (globalThis.__B44_LOGS) console.log('[FW] zones ->', result);
        if (result.status === 'ok') {
          if (globalThis.__B44_LOGS) console.log('[FW] L =', result.left, 'R =', result.right);
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
    if (!onSetSpeakers) return;
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
  }, [frontWideZones, placedSpeakers, widthM, getModelDimsM, onSetSpeakers, getCanonicalRole]);

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

  // [B44] Auto-positioning of FW based on zones (active for auto-positioned speakers only)
  // Keeps BOTH FWL+FWR paired when zones change (e.g., when SL/SR move)
  // Skip any speaker marked positionSource='user' to preserve manual placement
  useEffect(() => {
    if (isAnyDraggingRef.current) return;
    if (!onSetSpeakers) return;
    if (isDraggingFW.current) return;

    const lwSpeaker = placedSpeakers?.find(s => getCanonicalRole(s.role) === 'LW');
    const rwSpeaker = placedSpeakers?.find(s => getCanonicalRole(s.role) === 'RW');

    // Only attempt FW positioning when LW/RW are actually present
    if (!lwSpeaker && !rwSpeaker) return;

    // Only proceed when both have real models (not off/none)
    const lwModel = String(lwSpeaker?.model || '').toLowerCase();
    const rwModel = String(rwSpeaker?.model || '').toLowerCase();
    if (!lwModel || lwModel === 'off' || lwModel === 'none') return;
    if (!rwModel || rwModel === 'off' || rwModel === 'none') return;

    if (frontWideZones?.status !== 'ok') return;

    const W = widthM || 4.5;
    const L = lengthM || 6.0;
    const WALL_BUFFER_FW = 0.02;

    let needsUpdate = false;
    const updated = (placedSpeakers || []).map(s => {
      const role = getCanonicalRole(s.role);
      if (role !== 'LW' && role !== 'RW') return s;

      // [B44 FIX] Skip user-positioned speakers
      if (s.positionSource === 'user') return s;

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
    
  }, [
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
          },
          positionSource: 'auto' // Clear user lock on reset
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

      if (globalThis.__B44_LOGS) console.log("[DRAG] START", { id, type, role: target?.role, hasTarget: !!target });
      
      // Get SVG point for offset calculation
      if (!svgRef.current) return;
      const svgElement = svgRef.current;
      const point = svgElement.createSVGPoint();
      point.x = e.clientX;
      point.y = e.clientY;
      const ctm = svgElement.getScreenCTM();
      if (!ctm) return;
      const inverseCTM = ctm.inverse();
      const svgPoint = point.matrixTransform(inverseCTM);
      
      // Convert cursor position to room coords
      const cursorRoom = canvasToRoom({ x: svgPoint.x, y: svgPoint.y });
      
      // Store offset between speaker center and cursor
      if (type === "speaker" && target.position) {
        dragOffsetRoomRef.current = {
          x: target.position.x - cursorRoom.x,
          y: target.position.y - cursorRoom.y
        };
      } else if (type === "seat" && (target.x || target.position?.x)) {
        const seatX = target.x ?? target.position?.x ?? 0;
        const seatY = target.y ?? target.position?.y ?? 0;
        dragOffsetRoomRef.current = {
          x: seatX - cursorRoom.x,
          y: seatY - cursorRoom.y
        };
      } else if (type === "sub" && target.position) {
        dragOffsetRoomRef.current = {
          x: target.position.x - cursorRoom.x,
          y: target.position.y - cursorRoom.y
        };
        // Detect and store which wall this sub is on
        const x = target.position.x;
        const y = target.position.y;
        const threshold = 0.05;
        
        let wall = null;
        if (Math.abs(y) < threshold) wall = 'front';
        else if (Math.abs(y - lengthM) < threshold) wall = 'rear';
        else if (Math.abs(x) < threshold) wall = 'left';
        else if (Math.abs(x - widthM) < threshold) wall = 'right';
        else {
          // Default to closest wall
          const distFront = y;
          const distRear = lengthM - y;
          const distLeft = x;
          const distRight = widthM - x;
          const minDist = Math.min(distFront, distRear, distLeft, distRight);
          
          if (minDist === distFront) wall = 'front';
          else if (minDist === distRear) wall = 'rear';
          else if (minDist === distLeft) wall = 'left';
          else wall = 'right';
        }
        
        draggedSubWallRef.current = wall;
        draggedSubTypeRef.current = target._subType;
      }
      
      isAnyDraggingRef.current = true;
      
      setDragState({
        dragging: true,
        draggedItemId: id,
        dragType: type,
      });
      setDragWarning({ show: false });
      rsDragLockRef.current = null;

      if (type === "speaker") {
        isDraggingSpeakerRef.current = true;
        const speakerBeingDragged = byId.get(id);
        const canonRole = getCanonicalRole(speakerBeingDragged.role);
        if (canonRole === "SBL" || canonRole === "SBR") {
          isDraggingRearRef.current++;
        }
        if (canonRole === "LW" || canonRole === "RW") {
          isDraggingFW.current = true;
        }
        
        // Capture pointer on the target element
        try {
          if (e.target && typeof e.target.setPointerCapture === 'function') {
            e.target.setPointerCapture(e.pointerId);
          }
        } catch (err) {
          // Ignore capture errors
        }
      }
      
      if (type === "sub") {
        isDraggingSpeakerRef.current = true;
        
        // Capture pointer on the target element
        try {
          if (e.target && typeof e.target.setPointerCapture === 'function') {
            e.target.setPointerCapture(e.pointerId);
          }
        } catch (err) {
          // Ignore capture errors
        }
      }
    },
    [byId, setDragState, setDragWarning, setTooltip, rsDragLockRef, getCanonicalRole, widthM, lengthM, canvasToRoom, svgRef]
  );

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

  // Pan handlers for background rect only
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
    
    isPanningRef.current = true;
    panStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      ox: viewOffsetPx.x,
      oy: viewOffsetPx.y
    };
    
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (err) {
      // Ignore capture errors
    }
  }, [zoom, viewOffsetPx]);

  const onPanPointerMove = useCallback((e) => {
    if (!isPanningRef.current) return;
    
    const dx = e.clientX - panStartRef.current.x;
    const dy = e.clientY - panStartRef.current.y;
    
    setViewOffsetPx({
      x: panStartRef.current.ox + dx,
      y: panStartRef.current.oy + dy
    });
  }, []);

  const onPanPointerUp = useCallback((e) => {
    if (!isPanningRef.current) return;
    
    isPanningRef.current = false;
    
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (err) {
      // Ignore release errors
    }
  }, []);

  // Memoize baffle and screen calculations for performance
  const { BaffleAndScreen, screenPlaneY, screenCenterX_m, visibleWidthM } = useMemo(() => {
    const inch2m = 0.0254;
    
    // Border thickness in metres (default 8cm if not specified)
    const borderM = Math.max(0, (Number(screen?.borderThicknessCm ?? screen?.frameThicknessCm ?? 8) || 0) / 100);
    
    // Visible (image) width in metres
    const visibleWm = Math.max(0.1, Number(screen?.visibleWidthInches || 100) * inch2m);
    
    // Full frame (outer) width in metres = visible width + 2 * border
    const frameWm = visibleWm + (2 * borderM);
    
    // Screen front plane depth
    const planeDepthM = actualScreenFrontY;

    // Centre the screen on the room centreline
    const xCentre = widthM / 2;
    
    // Calculate canvas coordinates
    const roomCenterX_px = roomRect.x + roomRect.width / 2;
    const yFront = roomRect.y;
    
    // Dotted line (speaker space) = visible width (inset by border on each side)
    const xVisibleL = meterToCanvasX(xCentre - visibleWm / 2);
    const xVisibleR = meterToCanvasX(xCentre + visibleWm / 2);
    const visibleW_px = xVisibleR - xVisibleL;
    
    // Solid line (frame) = full frame width
    const xFrameL = meterToCanvasX(xCentre - frameWm / 2);
    const xFrameR = meterToCanvasX(xCentre + frameWm / 2);
    const frameW_px = xFrameR - xFrameL;

    const baffleH = Math.max(1, planeDepthM * scale);
    const screenH_px = SCREEN_THICKNESS_M * scale;
    
    const baffleTop = yFront;
    const screenPlaneY = yFront + baffleH;

    const component = (
      <>
        {showBaffle && (
          <>
            {/* Dotted line = speaker space (visible width, inset by border) */}
            <rect 
              x={xVisibleL} 
              y={baffleTop} 
              width={visibleW_px} 
              height={baffleH}
              fill="none" 
              stroke="#4A230F" 
              strokeWidth="1.5" 
              strokeDasharray="6 6" 
              pointerEvents="none" 
            />
            
            {/* Vertical end lines at visible edges */}
            <line
              x1={xVisibleL}
              y1={baffleTop}
              x2={xVisibleL}
              y2={screenPlaneY}
              stroke="#4A230F"
              strokeWidth="1.5"
              strokeDasharray="6 6"
              pointerEvents="none"
            />
            <line
              x1={xVisibleR}
              y1={baffleTop}
              x2={xVisibleR}
              y2={screenPlaneY}
              stroke="#4A230F"
              strokeWidth="1.5"
              strokeDasharray="6 6"
              pointerEvents="none"
            />
          </>
        )}
        {showScreen && (
          <rect 
            x={xFrameL} 
            y={screenPlaneY} 
            width={frameW_px} 
            height={screenH_px}
            fill="#1a1a1a" 
            stroke="#333" 
            strokeWidth="0.5" 
            pointerEvents="none" 
          />
        )}
      </>
    );

    const roomWidthM = widthM || 4.5;
    const screenCenterX_m = roomWidthM / 2;

    return { BaffleAndScreen: component, screenPlaneY, screenCenterX_m, visibleWidthM: visibleWm };
  }, [screen?.visibleWidthInches, screen?.borderThicknessCm, screen?.frameThicknessCm, roomRect, scale, actualScreenFrontY, showBaffle, showScreen, widthM, SCREEN_THICKNESS_M, lengthM, meterToCanvasX]);


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
    if (globalThis.__B44_LOGS) console.log("[DRAG] handleSpeakerDrag ENTER", { speakerId, role: byId.get(speakerId)?.role, newCanvasPos });

    if (!onSetSpeakers) {
      if (globalThis.__B44_LOGS) console.log("[DRAG] STOP: no onSetSpeakers");
      return;
    }

    const spk = byId.get(speakerId);
    if (!spk) {
      if (globalThis.__B44_LOGS) console.log("[DRAG] STOP: spk not found", speakerId);
      return;
    }

    // Work out canonical role once, and decide if this is an overhead (T*).
    const canonicalRole = getCanonicalRole(spk.role);
    const isOverhead =
      typeof canonicalRole === "string" && canonicalRole.startsWith("T");

    // [B44 PROMPT 2] Overheads ALWAYS allowed to move - bypass all drag guards
    // For bed speakers only, apply existing draggable/renderable rules
    if (!isOverhead && !isDraggable(spk)) {
      if (globalThis.__B44_LOGS) console.log("[DRAG] STOP: blocked by isDraggable", { speakerId, role: spk?.role });
      return;
    }

    // --- LCR Mirror-Lock Drag Logic ---
    if (['FL', 'FC', 'FR'].includes(canonicalRole)) {
      // FC is locked to center, so this block should not apply to it
      if (canonicalRole === 'FC') {
        // Handle FC explicitly to just ensure its X position is centerX_m
        const rawRoomPos = canvasToRoom(newCanvasPos);
        const currentY = spk.position?.y ?? rawRoomPos.y;
        const newY = rawRoomPos.y;
        
        // Only update if meaningful movement
        if (Math.abs(newY - currentY) > 0.001) {
          onSetSpeakers(prev => prev.map(s => {
            if (s.id === speakerId) {
              return { ...s, position: { ...s.position, x: centerX_m, y: newY } };
            }
            return s;
          }));
        }
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

        // Only update if meaningful movement
        const flSpeaker = placedSpeakers.find(s => getCanonicalRole(s.role) === 'FL');
        const frSpeaker = placedSpeakers.find(s => getCanonicalRole(s.role) === 'FR');
        
        const needsUpdate = 
          (flSpeaker && Math.abs((flSpeaker.position?.x ?? 0) - finalLeftX) > 0.001) ||
          (frSpeaker && Math.abs((frSpeaker.position?.x ?? 0) - finalRightX) > 0.001);
        
        if (!needsUpdate) return;
        
        // Apply positions
        if (globalThis.__B44_LOGS) console.log("[DRAG] APPLY: calling onSetSpeakers", { speakerId, role: spk?.role });
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
      if (globalThis.__B44_LOGS) console.log("[DRAG] STOP: LCR logic complete");
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
          if (globalThis.__B44_LOGS) console.log('[SS drag] modeDecision', {
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
            if (globalThis.__B44_LOGS) console.log('[SS drag] rear proximity inputs', {
              hasSBL: !!sbl, hasSBR: !!sbr,
              slsrYPtr: yPtr?.toFixed?.(3),
              ssBand: { minY: yMin?.toFixed?.(3), maxY: yMax?.toFixed?.(3) },
              sblY: Number(sbl?.position?.y)?.toFixed?.(3),
              sbrY: Number(sbr?.position?.y)?.toFixed?.(3)
            });
          } catch (_) {}
        }


        lastInteractionEpoch.current = timeNowMs();

        if (globalThis.__B44_LOGS) console.log("[DRAG] APPLY: calling onSetSpeakers", { speakerId, role: spk?.role });
        onSetSpeakers(prev => prev.map(s => {
          const role = getCanonicalRole(s.role);
          if (role === 'SL') return { ...s, position: { ...(s.position || {}), x: xL_side, y: yStar } };
          if (role === 'SR') return { ...s, position: { ...(s.position || {}), x: xR_side, y: yStar } };
          return s;
        }));
        if (globalThis.__B44_LOGS) console.log("[DRAG] STOP: SL/SR side mode complete");
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
          if (globalThis.__B44_LOGS) console.log('[SS back] lanes', {
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
      if (globalThis.__B44_LOGS) console.log("[DRAG] APPLY: calling onSetSpeakers", { speakerId, role: spk?.role });
      onSetSpeakers(prev =>
        prev.map(s => {
          const r = getCanonicalRole(s.role);
          if (r === 'SL') return { ...s, position: { ...(s.position||{}), x: xL_star, y: y_back_m_L } };
          if (r === 'SR') return { ...s, position: { ...(s.position||{}), x: xR_star, y: y_back_m_R } };
          return s;
        })
      );
      if (globalThis.__B44_LOGS) console.log("[DRAG] STOP: SL/SR back mode complete");
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
      if (globalThis.__B44_LOGS) console.log("[DRAG] APPLY: calling onSetSpeakers", { speakerId, role: spk?.role });
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
      if (globalThis.__B44_LOGS) console.log("[DRAG] STOP: SBL/SBR complete");
      return;
    }

    // Handle LW/RW front-wide speakers with corridor clamping and mirroring
    if (canonicalRole === 'LW' || canonicalRole === 'RW') {
      isDraggingFW.current = true;

      const W = widthM || 4.5;
      const L = lengthM || 6.0;
      const dims = getModelDimsM(spk.model);
      const halfDepth = (Number(dims?.depthM) || 0.082) / 2;
      const halfWidth = (Number(dims?.widthM) || 0.20) / 2;
      const WALL_BUFFER_FW = 0.02;

      const zonesReady = frontWideZones?.status === 'ok';
      const zone = zonesReady ? (canonicalRole === 'LW' ? frontWideZones.left : frontWideZones.right) : null;
      const partnerZone = zonesReady ? (canonicalRole === 'LW' ? frontWideZones.right : frontWideZones.left) : null;
      const partnerRole = (canonicalRole === 'LW') ? 'RW' : 'LW';

      // Pin X to the wall
      const xAtWall = (canonicalRole === 'LW')
        ? (WALL_BUFFER_FW + halfDepth)
        : (W - WALL_BUFFER_FW - halfDepth);

      const { y: rawY } = canvasToRoom(newCanvasPos);
      
      // Fallback: use safe room bounds when zones are not ready
      const fallbackYMin = WALL_BUFFER_FW + halfWidth;
      const fallbackYMax = L - WALL_BUFFER_FW - halfWidth;
      const fallbackMedianY = L / 2;
      
      const yMinClamped = zone ? ((zone.yMin || 0) + (halfWidth * SIDE_ALLOW_OVERHANG)) : fallbackYMin;
      const yMaxClamped = zone ? ((zone.yMax || L) - (halfWidth * SIDE_ALLOW_OVERHANG)) : fallbackYMax;

      const yClamped = clamp(rawY, yMinClamped, yMaxClamped);

      // Store offset from median for re-locking (only if zone exists)
      const medianY = zone?.medianY || fallbackMedianY;
      const offset = yClamped - medianY;
      const sideOffsetKey = canonicalRole === 'LW' ? 'L' : 'R';
      fwOffsetRef.current[sideOffsetKey] = offset;

      // CRITICAL: Lock LW/RW to wall during drag (no wall breaking)
      const fwWallBuffer = 0.05;
      const fwDims = getModelDimsM?.(spk.model) || {};
      const fwDepthM = Number(fwDims.depthM) || 0.082;
      const fwHalfDepth = fwDepthM / 2;

      const lockedX = (canonicalRole === "LW") 
        ? (fwWallBuffer + fwHalfDepth) 
        : (W - fwWallBuffer - fwHalfDepth);
      
      const fwFrontY = fwWallBuffer + fwHalfDepth;
      const fwBackY = (L - fwWallBuffer - fwHalfDepth);
      const fwClampedY = Math.max(fwFrontY, Math.min(fwBackY, yClamped));

      const nextPos = { x: lockedX, y: fwClampedY, z: spk.position?.z ?? 1.1 };

      // Update both speakers simultaneously, marking both as user-positioned
      if (nextPos && onSetSpeakers) {
        if (globalThis.__B44_LOGS) console.log("[DRAG] APPLY: calling onSetSpeakers", { speakerId, role: spk?.role });
        onSetSpeakers(prev => {
          // CRITICAL: Find partner from prev (current state), NOT from stale placedSpeakers
          const partner = prev.find(s => getCanonicalRole(s.role) === partnerRole);
          
          return prev.map(s => {
            // Update dragged speaker (mark as user-positioned)
            if (s.id === speakerId) {
              return { ...s, position: nextPos, meta: spk.meta, positionSource: 'user' };
            }
            
            // Update mirrored partner (also mark as user-positioned)
            if (partner && s.id === partner.id) {
              const partnerDims = getModelDimsM(partner.model);
              const partnerHalfDepth = (Number(partnerDims?.depthM) || 0.082) / 2;
              const partnerHalfWidth = (Number(partnerDims?.widthM) || 0.20) / 2;

              // CRITICAL: Lock partner to wall (same logic as dragged speaker)
              const fwPartnerDims = getModelDimsM?.(partner.model) || {};
              const fwPartnerDepthM = Number(fwPartnerDims.depthM) || 0.082;
              const fwPartnerHalfDepth = fwPartnerDepthM / 2;
              
              const partnerLockedX = (canonicalRole === 'LW')
                ? (W - fwWallBuffer - fwPartnerHalfDepth)
                : (fwWallBuffer + fwPartnerHalfDepth);

              // Fallback for partner zone bounds
              const partnerFallbackYMin = fwWallBuffer + fwPartnerHalfDepth;
              const partnerFallbackYMax = L - fwWallBuffer - fwPartnerHalfDepth;
              const partnerFallbackMedianY = L / 2;
              
              const partnerMedianY = partnerZone?.medianY || partnerFallbackMedianY;
              const partnerTargetY = partnerMedianY + offset;
              const partnerYMinClamped = partnerZone ? ((partnerZone.yMin || 0) + fwPartnerHalfDepth) : partnerFallbackYMin;
              const partnerYMaxClamped = partnerZone ? ((partnerZone.yMax || L) - fwPartnerHalfDepth) : partnerFallbackYMax;
              const partnerYClamped = clamp(partnerTargetY, partnerYMinClamped, partnerYMaxClamped);

              const partnerPos = { x: partnerLockedX, y: partnerYClamped, z: partner.position?.z ?? 1.1 };

              // Store partner offset too (ensure it's based on actual clamped position)
              const partnerSideOffsetKey = partnerRole === 'LW' ? 'L' : 'R';
              fwOffsetRef.current[partnerSideOffsetKey] = partnerYClamped - partnerMedianY;

              return { ...s, position: partnerPos, positionSource: 'user' };
            }
            
            return s;
          });
        });
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

      lastInteractionEpoch.current = timeNowMs();
      if (globalThis.__B44_LOGS) console.log("[DRAG] STOP: LW/RW complete");
      return;
    }

    // Fallback for all other draggable speakers (including overheads)
    const { x: rawX, y: rawY } = canvasToRoom(newCanvasPos);

    // Overhead drag behaviour: L/R pairs, clamped to RP22 corridors, mirrored horizontally
    if (canonicalRole && canonicalRole.startsWith('T')) {
      const OVERHEAD_ROLES = new Set(["TML", "TMR", "TFL", "TFR", "TRL", "TRR"]);
      // Mark that the user has taken control of overheads
      setHasManualOverheadEdit(true);

      // [B44 PROMPT] Allow overhead drag even when zones are missing/invalid
      // RP22 zones constrain final placement (on mouse up), not interaction.
      if (!overheadZones || overheadZones.status !== "ok") {
        if (globalThis.__B44_LOGS) console.log("[DRAG] overhead bypass: zone missing/invalid, allowing drag");
        
        // Proceed with basic movement using canvasToRoom conversion
        const rawRoomPos = canvasToRoom(newCanvasPos);
        
        if (globalThis.__B44_LOGS) console.log("[DRAG] APPLY: calling onSetSpeakers", { speakerId, role: spk?.role });
        onSetSpeakers(prev => prev.map(s => {
          if (s.id === speakerId) {
            return { 
              ...s, 
              position: { 
                ...s.position, 
                x: rawRoomPos.x, 
                y: rawRoomPos.y 
              } 
            };
          }
          return s;
        }));
        
        lastInteractionEpoch.current = timeNowMs();
        if (globalThis.__B44_LOGS) console.log("[DRAG] STOP: overhead drag without zones complete");
        return;
      }

      // Determine which RP22 zone this role belongs to
      let zoneKey = null;
      if (['TFL', 'TFR', 'TFC'].includes(canonicalRole)) {
        zoneKey = 'front';
      } else if (['TML', 'TMR'].includes(canonicalRole)) {
        zoneKey = 'mid';
      } else if (['TRL', 'TRR', 'TRC'].includes(canonicalRole)) {
        zoneKey = 'rear';
      }

      let zone = zoneKey && overheadZones[zoneKey];
      if (!zone) {
        if (globalThis.__B44_LOGS) console.log("[DRAG] overhead bypass: zone missing/invalid, allowing drag");
        // Create fallback zone using full room bounds (no clamping)
        zone = {
          xMin: 0,
          xMax: widthM,
          yMin: 0,
          yMax: lengthM
        };
      }

      // Check if this is a 5.1.4 layout (exactly 4 overheads: TFL, TFR, TRL, TRR)
      const overheadSpeakers = placedSpeakers.filter(s => {
        const r = getCanonicalRole(s.role);
        return r && r.startsWith('T');
      });
      const is514Layout = overheadSpeakers.length === 4 && 
                          overheadSpeakers.some(s => getCanonicalRole(s.role) === 'TFL') &&
                          overheadSpeakers.some(s => getCanonicalRole(s.role) === 'TFR') &&
                          overheadSpeakers.some(s => getCanonicalRole(s.role) === 'TRL') &&
                          overheadSpeakers.some(s => getCanonicalRole(s.role) === 'TRR');

      // Role group helpers
      const LEFT_ROLES = ['TFL', 'TML', 'TRL'];
      const RIGHT_ROLES = ['TFR', 'TMR', 'TRR'];

      const isLeftRole = (role) => LEFT_ROLES.includes(role);
      const isRightRole = (role) => RIGHT_ROLES.includes(role);

      const isFrontRole = (role) => role === 'TFL' || role === 'TFR';
      const isMidRole = (role) => role === 'TML' || role === 'TMR';
      const isRearRole = (role) => role === 'TRL' || role === 'TRR';

      // Raw room coords from the mouse
      const rawRoomPos = canvasToRoom(newCanvasPos);

      // Clamp dragged speaker exactly to its RP22 corridor
      const primaryClamped = {
        x: Math.min(Math.max(rawRoomPos.x, zone.xMin), zone.xMax),
        y: Math.min(Math.max(rawRoomPos.y, zone.yMin), zone.yMax),
      };

      // Derive shared column X with seat span clamping
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

      // Apply seat span clamping to mirrored column
      if (leftColumnX != null || rightColumnX != null) {
        const seatXs = (seatingPositions || [])
          .map(seat => seat?.position?.x ?? seat?.x)
          .filter(x => Number.isFinite(x));

        if (seatXs.length > 0) {
          const seatMinX = Math.min(...seatXs);
          const seatMaxX = Math.max(...seatXs);

          if (leftColumnX != null) {
            leftColumnX = clampOverheadXToSeatSpan(leftColumnX, seatMinX, seatMaxX);
          }
          if (rightColumnX != null) {
            rightColumnX = clampOverheadXToSeatSpan(rightColumnX, seatMinX, seatMaxX);
          }
        }
      }

      // NEW: For 5.1.4, mirror front/rear around MLP Y
      if (is514Layout) {
        const mlpY = mlpDotY_m || (lengthM / 2);
        
        // Determine if dragged speaker is front or rear
        const isFront = isFrontRole(canonicalRole);
        const isRear = isRearRole(canonicalRole);
        
        if (isFront || isRear) {
          let frontY, rearY;
          
          if (isFront) {
            // Dragging front: use clamped Y for front, mirror for rear
            frontY = primaryClamped.y;
            rearY = 2 * mlpY - frontY;
          } else {
            // Dragging rear: use clamped Y for rear, mirror for front
            rearY = primaryClamped.y;
            frontY = 2 * mlpY - rearY;
          }
          
          // Clamp both rows to their RP22 zones
          const frontZone = overheadZones.front;
          const rearZone = overheadZones.rear;
          
          if (frontZone) {
            frontY = Math.min(Math.max(frontY, frontZone.yMin), frontZone.yMax);
          }
          
          if (rearZone) {
            rearY = Math.min(Math.max(rearY, rearZone.yMin), rearZone.yMax);
          }
          
          // Update all four overheads
          if (globalThis.__B44_LOGS) console.log("[DRAG] APPLY: calling onSetSpeakers", { speakerId, role: spk?.role });
          onSetSpeakers(prev => {
            if (!Array.isArray(prev)) return prev;

            return prev.map(spk => {
              const role = getCanonicalRole(spk.role);
              if (!['TFL', 'TFR', 'TRL', 'TRR'].includes(role)) return spk;

              const current = { ...(spk.position || {}) };
              
              // Apply X mirroring (existing logic)
              const isLeft = ['TFL', 'TRL'].includes(role);
              const isRight = ['TFR', 'TRR'].includes(role);
              
              if (isLeft && leftColumnX != null) {
                current.x = leftColumnX;
              }
              if (isRight && rightColumnX != null) {
                current.x = rightColumnX;
              }

              // Apply Y based on row
              if (role === 'TFL' || role === 'TFR') {
                current.y = frontY;
              } else if (role === 'TRL' || role === 'TRR') {
                current.y = rearY;
              }

              return { ...spk, position: current };
            });
          });

          lastInteractionEpoch.current = timeNowMs();
          if (globalThis.__B44_LOGS) console.log("[DRAG] STOP: 5.1.4 overhead complete");
          return;
        }
      }

      // Original logic for other overhead layouts (5.1.2, 7.1.6, etc.)
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

      // Clamp Y for each row to RP22 zones
      if (Number.isFinite(newFrontY) && overheadZones.front) {
        newFrontY = Math.min(Math.max(newFrontY, overheadZones.front.yMin), overheadZones.front.yMax);
      }
      if (Number.isFinite(newMidY) && overheadZones.mid) {
        newMidY = Math.min(Math.max(newMidY, overheadZones.mid.yMin), overheadZones.mid.yMax);
      }
      if (Number.isFinite(newRearY) && overheadZones.rear) {
        newRearY = Math.min(Math.max(newRearY, overheadZones.rear.yMin), overheadZones.rear.yMax);
      }

      // Write positions for all six overheads
      if (globalThis.__B44_LOGS) console.log("[DRAG] APPLY: calling onSetSpeakers", { speakerId, role: spk?.role });
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

      lastInteractionEpoch.current = timeNowMs();
      if (globalThis.__B44_LOGS) console.log("[DRAG] STOP: overhead general complete");
      return;
    }

    // Generic fallback for any other speakers
    const currentX = spk.position?.x ?? 0;
    const currentY = spk.position?.y ?? 0;
    
    // Only update if meaningful movement
    if (Math.abs(rawX - currentX) > 0.001 || Math.abs(rawY - currentY) > 0.001) {
      if (globalThis.__B44_LOGS) console.log("[DRAG] APPLY: calling onSetSpeakers", { speakerId, role: spk?.role });
      onSetSpeakers(prev => {
        let updated = prev.map(s => {
          if (s.id === speakerId) {
            return { ...s, position: { ...s.position, x: rawX, y: rawY } };
          }
          return s;
        });
        return updated;
      });
    }
    lastInteractionEpoch.current = timeNowMs();
    if (globalThis.__B44_LOGS) console.log("[DRAG] STOP: generic fallback complete");
  }, [byId, canvasToRoom, widthM, lengthM, getModelDimsM, frontWideZones, mlp, onSetSpeakers, sideSurroundVisualSpanM, rearSurroundVisualLanes, _overlays?.sideSurroundZone, slsrModeRef, isOnSideWall, rsRearCorridor, fwOffsetRef, getCanonicalRole, constraintZones, screenCenterX_m, centerX_m, overheadZones, dolbyLayout, placedSpeakers]);

  const handleSeatDrag = useCallback((seatId, newCanvasPos) => {
    if (!onSetSeatingPositions) return;
    const { x: roomX, y: roomY } = canvasToRoom(newCanvasPos);
    onSetSeatingPositions(prev =>
        prev.map(seat =>
            seat.id === seatId ? { ...seat, x: roomX, y: roomY } : seat
        )
    );
  }, [onSetSeatingPositions, canvasToRoom]);

  const handleSubDrag = useCallback((subId, newCanvasPos) => {
    const sub = byId.get(subId);
    if (!sub) return;
    
    const subType = draggedSubTypeRef.current || sub._subType;
    const setter = subType === 'front' ? onSetFrontSubs : onSetRearSubs;
    const subsList = subType === 'front' ? frontSubs : rearSubs;
    if (!setter || !subsList) return;
    
    const wall = draggedSubWallRef.current;
    if (!wall) return;
    
    const { x: rawX, y: rawY } = canvasToRoom(newCanvasPos);
    
    // Robust dimension resolution with safe defaults
    const dims = getModelDimsM(sub.model);
    const w = (Number.isFinite(dims.widthM) && dims.widthM > 0) ? dims.widthM : 0.50;
    const d = (Number.isFinite(dims.depthM) && dims.depthM > 0) ? dims.depthM : 0.30;
    const halfW = w / 2;
    const halfD = d / 2;
    const EPS = 0.01;
    
    let finalX = rawX;
    let finalY = rawY;
    
    // Pin to wall using center-safe positioning (account for sub depth/width)
    if (wall === 'front') {
      finalY = halfD + EPS;
      finalX = Math.max(halfW + EPS, Math.min(widthM - halfW - EPS, rawX));
    } else if (wall === 'rear') {
      // Rear-specific corner-safe clamping
      const minX = halfW + EPS;
      const maxX = widthM - halfW - EPS;
      const rearPinnedY = lengthM - halfD - EPS;
      
      finalY = rearPinnedY;
      finalX = Math.max(minX, Math.min(maxX, rawX));
      
      // Safety: if finalX is invalid, fallback to previous or center
      if (!Number.isFinite(finalX)) {
        const prevX = sub.position?.x;
        finalX = Number.isFinite(prevX) ? prevX : (minX + maxX) / 2;
      }
    } else if (wall === 'left') {
      finalX = halfW + EPS;
      finalY = Math.max(halfD + EPS, Math.min(lengthM - halfD - EPS, rawY));
    } else if (wall === 'right') {
      finalX = widthM - halfW - EPS;
      finalY = Math.max(halfD + EPS, Math.min(lengthM - halfD - EPS, rawY));
    }
    
    // Final validation: never write invalid positions
    if (!Number.isFinite(finalX) || !Number.isFinite(finalY)) {
      return;
    }
    
    const currentX = sub.position?.x ?? 0;
    const currentY = sub.position?.y ?? 0;
    
    // Only update if meaningful movement
    if (Math.abs(finalX - currentX) > 0.001 || Math.abs(finalY - currentY) > 0.001) {
      const pairMode = subsList.length === 2;
      
      setter(prev => {
        const positions = prev?.positions || [];
        const subIndex = subId === 'front-sub-left' || subId === 'rear-sub-left' ? 0 : 1;
        
        // Initialize array with correct length if needed
        const updatedPositions = positions.length >= 2 ? [...positions] : [null, null];
        
        // Always use the wall-locked Y value
        const wallLockedY = finalY;
        
        // Update dragged sub (with validation)
        updatedPositions[subIndex] = { x: finalX, y: wallLockedY };
        
        // Paired mirror drag: when exactly 2 subs on same wall, mirror the other
        if (pairMode) {
          const otherIndex = subIndex === 0 ? 1 : 0;
          const mirrorX = widthM - finalX;
          const clampedMirrorX = Math.max(halfW + EPS, Math.min(widthM - halfW - EPS, mirrorX));
          
          // Validate mirrored position before writing
          if (Number.isFinite(clampedMirrorX)) {
            updatedPositions[otherIndex] = { x: clampedMirrorX, y: wallLockedY };
          } else {
            // Keep previous position for mirrored sub if calculation failed
            const prevPos = positions[otherIndex];
            if (prevPos) {
              updatedPositions[otherIndex] = prevPos;
            }
          }
        }
        
        return { ...prev, positions: updatedPositions };
      });
    }
  }, [byId, canvasToRoom, onSetFrontSubs, onSetRearSubs, frontSubs, rearSubs, widthM, lengthM, getModelDimsM]);

  // Mouse handling with CTM guard
  const handleMouseMove = useCallback((e) => {
    if (globalThis.__B44_LOGS) console.log("[DRAG] MOVE", { dragging: dragState.dragging, draggedItemId: dragState.draggedItemId, dragType: dragState.dragType });
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
    
    // Convert cursor to room coords and apply stored offset
    const cursorRoom = canvasToRoom({ x: svgPoint.x, y: svgPoint.y });
    const targetRoomPos = {
      x: cursorRoom.x + dragOffsetRoomRef.current.x,
      y: cursorRoom.y + dragOffsetRoomRef.current.y
    };
    
    // Convert back to canvas for existing logic
    const targetCanvasPos = roomToCanvas(targetRoomPos);

    const speaker = placedSpeakers.find(s => s.id === draggedItemId);
    if (globalThis.__B44_LOGS) console.log("[DRAG] MOVE_LOOKUP", { draggedItemId, found: !!speaker });

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


    const clampedCanvasX = Math.max(roomRect.x, Math.min(roomRect.x + roomRect.width, targetCanvasPos.x));
    const clampedCanvasY = Math.max(roomRect.y, Math.min(roomRect.y + roomRect.height, targetCanvasPos.y));

    if (dragType === 'speaker') {
      handleSpeakerDrag(draggedItemId, { x: clampedCanvasX, y: clampedCanvasY });
    } else if (dragType === 'seat') {
      handleSeatDrag(draggedItemId, { x: clampedCanvasX, y: clampedCanvasY });
    } else if (dragType === 'sub') {
      handleSubDrag(draggedItemId, { x: clampedCanvasX, y: clampedCanvasY });
    }
  }, [dragging, draggedItemId, dragType, roomRect, handleSpeakerDrag, handleSeatDrag, handleSubDrag, placedSpeakers, onSetSpeakers, constraintZones, svgRef, canvasToRoom, roomToCanvas, setDragWarning, screenCenterX_m, getCanonicalRole, centerX_m, dragOffsetRoomRef]);

  const handleMouseUp = useCallback((e) => {
    // Signal to RoomDesigner that dragging ended
    if (props.isDraggingRef) {
      props.isDraggingRef.current = false;
    }
    
    // Release pointer capture
    if (dragType === 'speaker' && e?.target) {
      try {
        if (typeof e.target.releasePointerCapture === 'function' && e.pointerId) {
          e.target.releasePointerCapture(e.pointerId);
        }
      } catch (err) {
        // Ignore release errors
      }
    }

    // [B44 PROMPT 4] Clamp overheads to RP22 zones after drag ends
    // CRITICAL: Overheads must be draggable. RP22 constrains placement, not interaction.
    // During drag = free movement. After release = snap to compliance.
    if (dragType === 'speaker' && draggedItemId) {
      const spk = byId.get(draggedItemId);
      if (spk) {
        const canonicalRole = getCanonicalRole(spk.role);
        const isOverhead = typeof canonicalRole === "string" && canonicalRole.startsWith("T");
        const isFrontWide = canonicalRole === 'LW' || canonicalRole === 'RW';
        
        if (isOverhead && overheadZones?.status === 'ok') {
          // Determine which zone this overhead belongs to
          let zone = null;
          if (['TFL', 'TFR', 'TFC'].includes(canonicalRole)) {
            zone = overheadZones.front;
          } else if (['TML', 'TMR'].includes(canonicalRole)) {
            zone = overheadZones.mid;
          } else if (['TRL', 'TRR', 'TRC'].includes(canonicalRole)) {
            zone = overheadZones.rear;
          }
          
          if (zone && Number.isFinite(spk.position?.x) && Number.isFinite(spk.position?.y)) {
            // Clamp position to zone bounds
            const clampedX = Math.min(Math.max(spk.position.x, zone.xMin), zone.xMax);
            const clampedY = Math.min(Math.max(spk.position.y, zone.yMin), zone.yMax);
            
            // Only update if clamping occurred
            if (Math.abs(clampedX - spk.position.x) > 0.001 || Math.abs(clampedY - spk.position.y) > 0.001) {
              onSetSpeakers(prev => prev.map(s => 
                s.id === draggedItemId 
                  ? { ...s, position: { ...s.position, x: clampedX, y: clampedY }, positionSource: 'user' }
                  : s
              ));
            } else {
              // No clamping needed, just mark as user-positioned
              onSetSpeakers(prev => prev.map(s => 
                s.id === draggedItemId 
                  ? { ...s, positionSource: 'user' }
                  : s
              ));
            }
          } else {
            // No zone or invalid position, still mark as user-positioned
            onSetSpeakers(prev => prev.map(s => 
              s.id === draggedItemId 
                ? { ...s, positionSource: 'user' }
                : s
            ));
          }
        } else if (isFrontWide) {
          // CRITICAL: Lock LW/RW to wall after drag (0.01m buffer)
          const W = widthM || 0;
          const FW_WALL_BUFFER_M = 0.01;
          const dims = getModelDimsM(spk.model);
          const halfDepth = (Number(dims?.depthM) || 0.082) / 2;
          
          const targetX = canonicalRole === 'LW'
            ? (FW_WALL_BUFFER_M + halfDepth)
            : (W - FW_WALL_BUFFER_M - halfDepth);
          
          // Force X to wall, keep Y from drag
          onSetSpeakers(prev => prev.map(s => 
            s.id === draggedItemId 
              ? { ...s, position: { ...s.position, x: targetX }, positionSource: 'user' }
              : s
          ));
        } else {
          // Non-overhead speaker: mark as user-positioned
          onSetSpeakers(prev => prev.map(s => 
            s.id === draggedItemId 
              ? { ...s, positionSource: 'user' }
              : s
          ));
        }
      }
    }
    
    isAnyDraggingRef.current = false;
    
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
    isDraggingSpeakerRef.current = false;
    dragOffsetRoomRef.current = { x: 0, y: 0 };
    draggedSubWallRef.current = null;
    draggedSubTypeRef.current = null;

  }, [dragType, draggedItemId, byId, getCanonicalRole, overheadZones, onSetSpeakers, setDragState, setDragWarning, setTooltip, rsDragLockRef, isDraggingRearRef, isDraggingFW, props.isDraggingRef]);

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

  // SPL metrics: Use prop from RoomDesigner if available (single source of truth)
  // Only compute locally if prop not provided (fallback for standalone use)
  const allSeatSplMetricsLocal = useMemo(() => {
    // If prop is provided, don't compute locally
    if (allSeatSplMetricsProp) return null;
    
    return computeAllSeatSplMetrics({
      seats: seatingPositions,
      placedSpeakers,
      getCanonicalRole,
      getEffectiveSplInputs: appState?.getEffectiveSplInputs || (() => ({ powerW: 100, sensitivity_dB_1w1m: 87 })),
      getModelDimsM,
      mlpPoint: mlp, // NEW: Pass green dot MLP for synthetic "mlp" seat
    });
  }, [allSeatSplMetricsProp, seatingPositions, placedSpeakers, getCanonicalRole, appState?.getEffectiveSplInputs, getModelDimsM, mlp]);

  // Use prop if available, otherwise use local computation
  const allSeatSplMetrics = allSeatSplMetricsProp || allSeatSplMetricsLocal;


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

    // Compute directional arrows and distance to nearest wall
    const distLeft = seatX;
    const distRight = roomWidth - seatX;
    const xNearest = Math.min(distLeft, distRight);
    const xArrow = distLeft <= distRight ? '⬅️' : '➡️';
    const yArrow = '⬆️';
    
    // Build base tooltip data
    const data = {
      seatId: effectiveHoveredSeat.id || 'Seat',
      isPrimary: effectiveHoveredSeat.isPrimary || false,
      position: `(${xArrow} ${xNearest.toFixed(2)}m, ${yArrow} ${seatY.toFixed(2)}m)`,
      distanceToScreen: Number.isFinite(distanceToScreen) ? `${distanceToScreen.toFixed(2)}m` : '—',
      distanceToMLP: Number.isFinite(distanceToMLP) ? `${distanceToMLP.toFixed(2)}m` : '—',
      rp23: {
        angleDeg: rp23AngleDeg,
        level: rp23Level,
        formatted: Number.isFinite(rp23AngleDeg) ? `${rp23AngleDeg.toFixed(1)}°` : '—',
      }
    };

    // RP22 per-seat metrics – initialise with defaults
    data.rp22 = {
      p1:  { valueM:  null, level: '—', formatted: '—' },
      p4:  { valueDb: null, level: '—', formatted: '—' },
      p5:  { valueDeg: null, level: '—', formatted: '—' },
      p6:  { valueDb: null, level: '—', formatted: '—' },
      p9:  { valueDeg: null, level: '—', formatted: '—' },
      p10: { valueDb: null, level: '—', formatted: '—' },
      p16: { valueDb: null, level: '—', formatted: '—' },
      p17: { valueDb: null, level: '—', formatted: '—' },
      p20: { valueDb: null, level: '—', formatted: '—' },
    };

    // Pull per-seat RP22 metrics from analysisResult (single source of truth)
    const seatMetrics = analysisResult?.seatMetrics?.get?.(effectiveHoveredSeat.id);
    if (seatMetrics) {
      if (seatMetrics.p9)  data.rp22.p9  = seatMetrics.p9;
      if (seatMetrics.p10) data.rp22.p10 = seatMetrics.p10;
      if (seatMetrics.p16) data.rp22.p16 = seatMetrics.p16;
      if (seatMetrics.p17) data.rp22.p17 = seatMetrics.p17;
      if (seatMetrics.p20) data.rp22.p20 = seatMetrics.p20;
    }

    // ALWAYS compute P17 locally using LIVE plan-view yaw logic (matches icon rotation)
    {
      const surroundAndOverheadRoles = new Set(['SL', 'SR', 'SBL', 'SBR', 'LW', 'RW', 'TFL', 'TFR', 'TML', 'TMR', 'TRL', 'TRR']);
      
      const relevantSpeakers = (placedSpeakers || []).filter(sp => {
        const canon = getCanonicalRole(sp.role);
        return surroundAndOverheadRoles.has(canon) && sp.position;
      });

      if (relevantSpeakers.length > 0) {
        const perSpeaker = [];
        let worstLossDb = -Infinity;
        let worstRole = null;
        let worstAngleDeg = null;

        for (const sp of relevantSpeakers) {
          const canon = getCanonicalRole(sp.role);
          const pos = sp.position;
          
          // Calculate direction from speaker to seat
          const dx = seatX - pos.x;
          const dy = seatY - pos.y;
          const dirDeg = Math.atan2(dx, dy) * 180 / Math.PI; // 0° = +Y (into room)
          
          // CRITICAL: Get speaker's aim using EXACT same logic as renderSpeakers
          let aimDeg = 0;
          const isLW_RW = (canon === 'LW' || canon === 'RW');
          const isSL_SR = (canon === 'SL' || canon === 'SR');
          const isSBL_SBR = (canon === 'SBL' || canon === 'SBR');
          const isOverhead = canon.startsWith('T');
          
          if (isOverhead) {
            // Overheads always aim down (0° in plan = into room)
            aimDeg = 0;
          } else if (isLW_RW) {
            // Front Wides: check toggle (LIVE)
            if (aimFrontWidesAtMLP) {
              aimDeg = safeYawToMLP(pos, mlp);
            } else {
              // Wall-flat: left wall = +90, right wall = -90
              aimDeg = (canon === 'LW') ? 90 : -90;
            }
          } else if (isSL_SR) {
            // Side Surrounds: check toggle (LIVE)
            if (aimSideSurroundsAtMLP) {
              aimDeg = safeYawToMLP(pos, mlp);
            } else {
              // Wall-flat: left wall = +90, right wall = -90
              aimDeg = (canon === 'SL') ? 90 : -90;
            }
          } else if (isSBL_SBR) {
            // Rear Surrounds: check toggle (LIVE)
            if (aimRearSurroundsAtMLP) {
              aimDeg = safeYawToMLP(pos, mlp);
            } else {
              // Wall-flat: detect which wall (same logic as renderSpeakers)
              const distLeft  = Math.abs(pos.x - 0);
              const distRight = Math.abs(widthM - pos.x);
              const distBack  = Math.abs(lengthM - pos.y);
              const minDist = Math.min(distLeft, distRight, distBack);

              if (minDist === distBack) aimDeg = 0;
              else if (minDist === distLeft) aimDeg = 90;
              else if (minDist === distRight) aimDeg = -90;
              else aimDeg = 0;
            }
          }
          
          // Calculate off-axis angle (shortest arc)
          let offAxisRaw = dirDeg - aimDeg;
          // Normalize to -180..+180
          while (offAxisRaw > 180) offAxisRaw -= 360;
          while (offAxisRaw < -180) offAxisRaw += 360;
          const offAxisDeg = Math.abs(offAxisRaw);
          
          // Clamp to 0..180 for HF falloff lookup
          const offAxisClamped = Math.min(180, Math.max(0, offAxisDeg));
          
          // Calculate loss using same dispersion logic as P16
          const meta = getSpeakerModelMeta(sp.model);
          const disp = meta?.dispersion?.horizontal;
          let lossDb = 0;
          
          if (disp && disp.minus1p5dB && disp.minus3dB && disp.minus5dB) {
            if (offAxisClamped <= disp.minus1p5dB) {
              lossDb = (offAxisClamped / disp.minus1p5dB) * 1.5;
            } else if (offAxisClamped <= disp.minus3dB) {
              const span = disp.minus3dB - disp.minus1p5dB;
              const t = (offAxisClamped - disp.minus1p5dB) / span;
              lossDb = 1.5 + t * 1.5;
            } else if (offAxisClamped <= disp.minus5dB) {
              const span = disp.minus5dB - disp.minus3dB;
              const t = (offAxisClamped - disp.minus3dB) / span;
              lossDb = 3.0 + t * 2.0;
            } else {
              lossDb = 5.0 + (offAxisClamped - disp.minus5dB) * 0.05;
            }
          } else {
            // Fallback: simple linear falloff
            lossDb = offAxisClamped * 0.05;
          }
          
          const isBeyondNonLcrLimit = offAxisClamped > 41;
          
          perSpeaker.push({
            role: canon,
            angleDeg: offAxisDeg,
            rawAngleDeg: offAxisDeg,
            lossDb: Math.round(lossDb * 10) / 10,
            isBeyondNonLcrLimit,
          });
          
          if (!isBeyondNonLcrLimit && lossDb > worstLossDb) {
            worstLossDb = lossDb;
            worstRole = canon;
            worstAngleDeg = offAxisDeg;
          }
        }
        
        // Calculate max loss for level
        let level17 = '—';
        if (Number.isFinite(worstLossDb)) {
          if (worstLossDb <= 1.5) level17 = 'L4';
          else if (worstLossDb <= 3.0) level17 = 'L3';
          else if (worstLossDb <= 5.0) level17 = 'L2';
          else level17 = 'L1';
        }
        
        data.rp22.p17 = {
          value: worstLossDb,
          formatted: Number.isFinite(worstLossDb) ? `±${worstLossDb.toFixed(1)} dB` : '—',
          level: level17,
          perSpeaker,
          worstRole,
          worstAngleDeg,
          worstLossDb,
          p17HasNaAngles: perSpeaker.some(s => s.isBeyondNonLcrLimit),
        };
      }
    }

    // NEW: Use centralized SPL calculation (single source of truth)
    const seatSplData = getSeatSplMetrics(allSeatSplMetrics, effectiveHoveredSeat.id);
    
    data.splAtSeat = {
      lcr: seatSplData?.screen || {},
      surrounds: seatSplData?.surrounds || {},
      overheads: seatSplData?.uppers || {},
    };

    // HUD-local P10 – Maximum SPL difference between upper speakers
    // Uses the same SPL data as the "Overheads" SPL @ Seat block
    {
      const upperEntries = seatSplData?.uppers
        ? Object.values(seatSplData.uppers)
        : [];

      const upperValues = upperEntries
        .map((o) =>
          o && typeof o.value === 'number' && Number.isFinite(o.value)
            ? o.value
            : null
        )
        .filter((v) => typeof v === 'number' && Number.isFinite(v));

      if (upperValues.length >= 2) {
        const maxSpl = Math.max(...upperValues);
        const minSpl = Math.min(...upperValues);
        const delta  = Math.abs(maxSpl - minSpl);

        // Round to 0.1 dB, same as elsewhere
        const deltaRounded = Math.round(delta * 10) / 10;

        // RP22 P10 thresholds:
        // L4: ≤ 2 dB, L3: ≤ 5 dB, L2: ≤ 8 dB, L1: > 8 dB
        let level10 = 1;
        if (deltaRounded <= 2)      level10 = 4;
        else if (deltaRounded <= 5) level10 = 3;
        else if (deltaRounded <= 8) level10 = 2;
        else                        level10 = 1;

        data.rp22.p10 = {
          value:     deltaRounded,
          formatted: `±${deltaRounded.toFixed(1)} dB`,
          level:     level10,
        };
      } else {
        // Less than 2 valid overhead SPL values – safe fallback
        data.rp22.p10 = {
          value:     null,
          formatted: 'N/A (insufficient data)',
          level:     '—',
        };
      }
    }

    // SPL meta: power + radiation mode for HUD caption
    const splConfig = appState?.splConfig;
    data.splAtSeatMeta = {
      powerW: splConfig?.globalPowerW ?? 100,
      radiationMode: splConfig?.radiationMode ?? 'half-space',
    };

    // Helper: check if speaker has valid position
    const hasPos = s => s?.position && Number.isFinite(s.position.x) && Number.isFinite(s.position.y);

    // Role sets
    const screenRoles = new Set(['FL','FC','FR']);
    const surroundRoles = new Set(['SL','SR','SBL','SBR','LW','RW']);
    const overheadRoles = new Set(['TFL','TFR','TML','TMR','TRL','TRR','TFC','TRC']);

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
    if (placedLCR.length >= 2 && seatSplData?.screen) {
      const lcrSplValues = Object.values(seatSplData.screen)
        .map(s => s.value)
        .filter(Number.isFinite);
      
      const valueDb = maxPairwiseDelta(lcrSplValues);
      
      if (Number.isFinite(valueDb)) {
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
    if (placedSur.length >= 2 && seatSplData?.surrounds) {
      const surSplValues = Object.values(seatSplData.surrounds)
        .map(s => s.value)
        .filter(Number.isFinite);

      const p6ValueDb = maxPairwiseDelta(surSplValues);
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

    // Legacy bridge
    data.p1NearestM = data.rp22.p1.valueM;

    return data;
  }, [
    effectiveHoveredSeat,
    placedSpeakers,
    widthM,
    lengthM,
    screenFrontPlaneM,
    mlp,
    screen?.visibleWidthInches,
    seatingPositions,
    getModelDimsM,
    screen,
    appState,
    heightM,
    getCanonicalRole,
    allSeatSplMetrics,
    aimFrontWidesAtMLP,
    aimSideSurroundsAtMLP,
    aimRearSurroundsAtMLP,
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
            if (globalThis.__B44_LOGS) console.log(`${role}:`, {
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

  // [NEW] Auto-hug surrounds to walls when room dimensions change (INCLUDES LW/RW)
  useEffect(() => {
    if (isAnyDraggingRef.current) return;
    if (!onSetSpeakers || !placedSpeakers?.length) return;

    const W = widthM || 0;
    const L = lengthM || 0;
    if (!(W > 0 && L > 0)) return;

    let needsUpdate = false;
    const updated = placedSpeakers.map(spk => {
      const canon = getCanonicalRole(spk.role);
      
      // Process ALL side wall speakers: SL/SR and LW/RW
      // SBL/SBR are handled by SpeakerPlacement and stay on back wall
      if (!['SL', 'SR', 'LW', 'RW'].includes(canon)) return spk;
      if (!spk.position || !spk.model) return spk;
      
      // [B44 POSITION LOCK] Skip user-positioned speakers (except during wall-hug restore)
      // Note: Even user-positioned FW speakers must hug the wall
      if (spk.positionSource === 'user' && !['LW', 'RW'].includes(canon)) return spk;

      const dims = getModelDimsM(spk.model);
      const isLeft = ['SL', 'LW'].includes(canon);
      const side = isLeft ? 'L' : 'R';

      // Calculate correct wall-hugged X using 0.01m buffer
      const FW_WALL_BUFFER_M = 0.01;
      const halfDepth = (Number(dims?.depthM) || 0.082) / 2;
      const targetX = isLeft 
        ? (FW_WALL_BUFFER_M + halfDepth)
        : (W - FW_WALL_BUFFER_M - halfDepth);
      
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
        if (DBG_SS) if (globalThis.__B44_LOGS) console.log('[SS live] position implies side mode: back -> side');
      }
    } else if (currentRefMode === 'side') {
      if (curY_sl > (yMax_side_for_hysteresis + BACKWALL_HYSTERESIS_M)) {
        nextModeBasedOnPosition = 'back';
        if (DBG_SS) if (globalThis.__B44_LOGS) console.log('[SS live] position implies back mode: side -> back');
      }
    }
    slsrModeRef.current = nextModeBasedOnPosition;

    if (DBG_SS) {
      try {
        const yMax_side_live = Number(sideSurroundVisualSpanM?.maxY) || 0;
        const onBackCheck = isOnBackWall(curY_sl, dimsL, L);

        if (globalThis.__B44_LOGS) console.log('[SS live] snapshot', {
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
          if (globalThis.__B44_LOGS) console.log('[SS live] yStar with clearance', { yStar: yStar?.toFixed?.(3) });
        }

      } catch (_e) {
        if (globalThis.__B44_LOGS) if (globalThis.__B44_LOGS) console.warn("Error applying SL/SR vs SBL/SBR clearance during auto-adjust:", _e);
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
      if (globalThis.__B44_LOGS) console.log('[SS live] back-wall enforcement', {
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

  // [B44] Auto-adjust SBL/SBR only if positionSource !== 'user'
  React.useEffect(() => {
    // Skip if user has manually placed these speakers
    const sbl = placedSpeakers.find(s => getCanonicalRole(s.role) === 'SBL');
    const sbr = placedSpeakers.find(s => getCanonicalRole(s.role) === 'SBR');
    
    if ((sbl?.positionSource === 'user') || (sbr?.positionSource === 'user')) {
      return; // User has taken control - don't auto-adjust
    }
    
    // Otherwise continue with existing auto-adjustment logic
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
            if (DBG_RS) if (globalThis.__B44_LOGS) console.log('[RS live] position implies side mode: back -> side');
        }
    } else if (currentRefMode === 'side') {
        if (yL_sbl_cur > (yMax_side_for_hysteresis + BACKWALL_HYSTERESIS_M)) {
            nextModeBasedOnPosition = 'back';
            if (DBG_RS) if (globalThis.__B44_LOGS) console.log('[RS live] position implies back mode: side -> back');
        }
    }

    rearModeRef.current = nextModeBasedOnPosition;

    if (DBG_RS) {
      try {
        const yMax_side_live = Number(sideSurroundVisualSpanM?.maxY) || 0;
        const onBackCheck = isOnBackWall(yL_sbl_cur, dimsL, L);

        if (globalThis.__B44_LOGS) console.log('[RS live] snapshot', {
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
        if (globalThis.__B44_LOGS) console.log('[RS live] side-wall auto-correct:', {
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
      if (globalThis.__B44_LOGS) console.log('[RS live] back-wall auto-correct:', {
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

  // Overhead speaker icons
  // Rules:
  // - Icons are driven purely by placedSpeakers (actual system design)
  // - Show an icon for any overhead-role speaker with a real model
  // - Hide icon when the effective model is OFF
  const overheadIconElements = useMemo(() => {
    if (!placedSpeakers || !placedSpeakers.length) return null;

    // Helper: map role → band
    const getBandForRole = (role) => {
      const r = String(role || "").toUpperCase();
      if (r === "TFL" || r === "TFR" || r === "TFC") return "front";
      if (r === "TML" || r === "TMR") return "mid";
      if (r === "TRL" || r === "TRR" || r === "TRC") return "rear";
      return null;
    };

    const isOff = (modelId) => {
      if (!modelId) return true;
      const up = String(modelId).toUpperCase();
      return up === "OFF" || up.startsWith("OFF ");
    };

    // Single source of truth for overhead icon model:
    // always derive from global + band overrides,
    // never let a stale per-speaker model win.
    const resolveModelForSpeaker = (spk) => {
      const band = getBandForRole(spk.role);
      if (!band) return null;

      let modelId = null;

      if (band === "front") {
        modelId = useFrontGlobal
          ? overheadGlobalModel
          : (overheadFrontOverride || overheadGlobalModel);
      } else if (band === "mid") {
        modelId = useMidGlobal
          ? overheadGlobalModel
          : (overheadMidOverride || overheadGlobalModel);
      } else if (band === "rear") {
        modelId = useRearGlobal
          ? overheadGlobalModel
          : (overheadRearOverride || overheadGlobalModel);
      }

      if (isOff(modelId)) return null;
      return modelId || null;
    };

    // Filter to only valid overhead speakers that should be visible
    const overheadSpeakers = (placedSpeakers || [])
      .filter((spk) => rvIsOverheadRole(spk.role) && hasPos(spk))
      .map((spk) => {
        const modelId = resolveModelForSpeaker(spk);

        // Debug – keep this for now
        if (globalThis.__B44_LOGS) console.log(
          "[RV overhead-icons]",
          spk.role,
          "modelId:",
          modelId,
          "pos:",
          spk.position
        );

        if (!modelId) return null;
        return { spk, modelId };
      })
      .filter(Boolean);

    if (!overheadSpeakers.length) return null;

    return (
      <g data-layer="overhead-icons">
        {overheadSpeakers.map(({ spk, modelId }) => {
          const [xPx, yPx] = toPx(spk.position.x, spk.position.y);

          return (
            <SpeakerIcon
              key={spk.id || spk.role}
              speaker={{ ...spk, model: modelId }}
              canvasX={xPx}
              canvasY_raw={yPx}
              yawDeg={0}
              widthM={0.27}
              depthM={0.27}
              scale={scale}
              speakerMouseDownHandler={(e) => bedLayerSpeakerMouseDownHandler(e, spk.id)}
              setHoveredSpeaker={setHoveredSpeaker}
            />
          );
        })}
      </g>
    );
  }, [
    placedSpeakers,
    toPx,
    scale,
    setHoveredSpeaker,
    overheadGlobalModel,
    useFrontGlobal,
    useMidGlobal,
    useRearGlobal,
    overheadFrontOverride,
    overheadMidOverride,
    overheadRearOverride,
    bedLayerSpeakerMouseDownHandler,
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

  const renderSpeakers = useCallback(() => {
  // Start from the prop (single source of truth)
  const rawSpeakers = Array.isArray(placedSpeakers) ? placedSpeakers : [];

  // TEMP TRACE (remove after): always log SBL/SBR state
  try {
    const pick = (role) => rawSpeakers.find(s => getCanonicalRole(s?.role) === role) || null;
    const sbl = pick("SBL");
    const sbr = pick("SBR");

    const row = (sp, role) => ({
      role,
      exists: !!sp,
      model: sp?.model ?? null,
      x: Number.isFinite(sp?.position?.x) ? sp.position.x : null,
      y: Number.isFinite(sp?.position?.y) ? sp.position.y : null,
      z: Number.isFinite(sp?.position?.z) ? sp.position.z : null,
    });

    const out = [row(sbl, "SBL"), row(sbr, "SBR")];

    if (typeof window !== "undefined") window.__SBL_SBR_TRACE__ = out;

    // ALWAYS log (not gated by __B44_LOGS)
    console.log("[SBL/SBR TRACE]", out);
    if (console.table) console.table(out);
  } catch (e) {
    console.warn("[SBL/SBR TRACE] failed", e);
  }

  // 1) Basic structural filter (existing helper)
  const afterRenderable = rawSpeakers.filter(isRenderableSpeaker);

  // 2) Bed/overhead visibility must come from the layout roles, not model timing.
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

  let afterVisibility = afterRenderable.filter((s) => {
    const canon = getCanonicalRole(s?.role);

    // Always hide LFE
    if (canon === "LFE") return false;

    // Bed surrounds are controlled by layout role visibility, not model.
    // This prevents "rear surrounds vanish" when model is null during hydration.
    if (["SL","SR","SBL","SBR","LW","RW"].includes(canon)) {
      return allowedRoles.has(canon);
    }

    // Everything else keeps existing behaviour
    return getSpeakerVisibility(s.role, s.model);
  });

  // Local NaN-safe coordinate mappers (must be inside this loop)
  const toCanvasX = (xM) => {
    const safeX = Number.isFinite(xM) ? xM : 0;
    return roomRect.x + (safeX * scale);
  };

  const toCanvasY = (yM) => {
    const safeY = Number.isFinite(yM) ? yM : 0;
    return roomRect.y + (safeY * scale);
  };

  // 3) Map to icons
  return afterVisibility.map((speaker) => {
    const { id, role: rawRole, model, position = {} } = speaker;

    // Canonicalise ONCE and use canonical role for ALL rendering decisions
    const canon = getCanonicalRole(rawRole);
    const role = canon; // <- critical: render role is canonical

    // CRITICAL: Overhead speakers are rendered by overheadIconElements,
    // skip them here to avoid duplicate icons
    if (rvIsOverheadRole(role)) {
      return null;
    }

    // [B44 VISIBILITY FIX] Resolve model with safe fallback for LW/RW/SBL/SBR
    let resolvedModel = resolveSurroundModel(model, canon);
    
    // If model is null but this is a surround role, use fallback for icon dimensions
    if (!resolvedModel && ['SL', 'SR', 'SBL', 'SBR', 'LW', 'RW'].includes(canon)) {
      // Try to get global surround model from AppState
      const globalSurroundModel = placedSpeakers?.find(s => {
        const c = getCanonicalRole(s.role);
        return ['SL', 'SR', 'SBL', 'SBR', 'LW', 'RW'].includes(c) && s.model && s.model !== 'off';
      })?.model;
      
      resolvedModel = globalSurroundModel || 'evolve-2-1_s'; // Fallback to small default
    }
    
    const dims = getSpeakerDims(resolvedModel);
    const widthM_spk = dims.widthM || 0.27; // Safe default
    const depthM_spk = dims.depthM || 0.082; // Safe default

    // Position coordinates from speaker.position (with safe fallbacks)
    const pos_x = position.x ?? 0;
    const pos_y = position.y ?? 0;

    // --- YAW CALCULATION ---
    let yawDeg;

    const isLCR = (canon === "FL" || canon === "FR" || canon === "FC");
    const isFrontWide = (canon === "LW" || canon === "RW");
    const isSideSurround = (canon === "SL" || canon === "SR");
    const isRearSurround = (canon === "SBL" || canon === "SBR");

    if (isLCR) {
      if (aimAtMLP) {
        if (canon === 'FL') yawDeg = lcrAngleInfo.L;
        else if (canon === 'FR') yawDeg = lcrAngleInfo.R;
        else yawDeg = 0; // FC is always 0
      } else {
        yawDeg = 0;
      }
    } else if (isFrontWide) {
      if (aimFrontWidesAtMLP) {
        yawDeg = getAimingYawDeg(speaker, mlp);
      } else {
        // Aim OFF: sit flat to side walls
        yawDeg = (canon === "LW") ? -90 : +90;
      }
    } else if (isSideSurround) {
      if (aimSideSurroundsAtMLP) {
        yawDeg = getAimingYawDeg(speaker, mlp);
      } else {
        // Aim OFF: sit flat to side walls
        yawDeg = (canon === "SL") ? 90 : -90;
      }
    } else if (isRearSurround) {
      if (aimRearSurroundsAtMLP) {
        yawDeg = getAimingYawDeg(speaker, mlp);
      } else {
        // Aim OFF: sit flat to back wall (0 deg) or side walls
        const pos = speaker.position || {};
        const distLeft  = Math.abs(pos.x - 0);
        const distRight = Math.abs(widthM - pos.x);
        const distBack  = Math.abs(lengthM - pos.y);
        const minDist = Math.min(distLeft, distRight, distBack);

        if (minDist === distBack) yawDeg = 0;
        else if (minDist === distLeft) yawDeg = 90;
        else if (minDist === distRight) yawDeg = -90;
        else yawDeg = 0;
      }
    } else {
      // Fallback for any other speaker type, including overheads
      yawDeg = 0;
    }

    let finalYawDeg = Number.isFinite(yawDeg) ? yawDeg : 0;

    // --- Wall-safe centre clamp (prevents rotated cabinet crossing the wall) ---
    const W = Number(widthM) || 0;
    const L = Number(lengthM) || 0;

    if (W > 0 && L > 0 && speaker?.position) {
      const wall = Number(WALL_BUFFER_M) || 0.01;

      // Determine if this role is intended to live on a wall
      const canonRole = getCanonicalRole(speaker.role);

      const isLeftWallRole = (canonRole === "LW" || canonRole === "SL");
      const isRightWallRole = (canonRole === "RW" || canonRole === "SR");
      const isBackWallRole = (canonRole === "SBL" || canonRole === "SBR");

      // Compute rotated half-extent towards the relevant wall
      if (isLeftWallRole || isRightWallRole) {
        const halfToWall = rotatedHalfExtentToWall(finalYawDeg, widthM_spk, depthM_spk, "x");
        const xMin = wall + halfToWall;
        const xMax = W - wall - halfToWall;

        // clamp x only (these speakers are on side walls)
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

        // clamp y only (rear surrounds live on back wall)
        speaker = {
          ...speaker,
          position: {
            ...speaker.position,
            y: Math.min(yMax, Math.max(yMin, Number(speaker.position.y) || 0)),
          }
        };
      }
    }
    // --- end wall-safe clamp ---

    // Convert to canvas coordinates - use stored position for all speakers
    const canvasX = toCanvasX(speaker.position.x ?? 0);
    const canvasY = toCanvasY(speaker.position.y ?? 0);

    // NaN safety: ensure we never pass invalid coordinates
    const safeCanvasX = Number.isFinite(canvasX) ? canvasX : 0;
    const safeCanvasY = Number.isFinite(canvasY) ? canvasY : 0;

    // Log any invalid coordinates
    if (!Number.isFinite(canvasX) || !Number.isFinite(canvasY)) {
      if (globalThis.__B44_LOGS) if (globalThis.__B44_LOGS) console.warn('[RV] INVALID CANVAS COORDS', {
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
      if (globalThis.__B44_LOGS) console.log('[RV icon]', {
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
        yawDeg: finalYawDeg,
        widthM_spk,
        depthM_spk,
      });
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
  aimFrontWidesAtMLP,
  aimSideSurroundsAtMLP,
  aimRearSurroundsAtMLP,
  isDraggable,
  bedLayerSpeakerMouseDownHandler,
  setHoveredSpeaker,
  SpeakerIcon,
  placedSpeakers,
]);

  // Renders rear subwoofers using SpeakerRect
  const renderSubwoofers = React.useCallback(() => {
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
      if (globalThis.__B44_LOGS) console.log('RoomVisualisation: rendering seats = 0');
      return null;
    }

    const RX_M = 0.10;
    const RY_M = 0.125;

    if (globalThis.__B44_LOGS) console.log('RoomVisualisation: rendering seats =', seatingPositions.length);

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

  // RP22 overhead corridors: controlled by the toggle matching current layout
  const overheadCorridorsOn = useMemo(() => {
    if (overheadCount === 2) return !!_overlays?.OVERHEADS_2;
    if (overheadCount === 4) return !!_overlays?.OVERHEADS_4;
    if (overheadCount === 6) return !!_overlays?.OVERHEADS_6;
    return false; // no overhead layer in current layout
  }, [overheadCount, _overlays?.OVERHEADS_2, _overlays?.OVERHEADS_4, _overlays?.OVERHEADS_6]);


// --- Main render ---
// SAFETY: local fallbacks in case parent metrics/ids are not initialised yet
const svgWSafe = Number(svgW) || Math.max(1, Number(roomRect?.width)  || 1200);
const svgHSafe = (Number(svgH) || Math.max(1, Number(roomRect?.height) || 800)) + BOTTOM_GUTTER_PX;
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
      cursor: zoomMode === 'in' ? 'zoom-in' : zoomMode === 'out' ? 'zoom-out' : 'default',
    }}
    onMouseMove={(e) => {
      // Track pointer position for zoom center
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
    }}
    onTouchMove={(e) => {
      if (e.touches.length === 1) {
        lastPointerRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    }}
    onClick={handlePlanClick}
  >
    {/* Toolbar has been moved to the parent component's accordion */}

    {/* CANVAS WRAPPER (no tailwind) */}
    <div style={canvasStyle}>



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


        {/* TEMP DEBUG: Surround Hydration State */}
        {globalThis.__B44_DEBUG_UI === true && (() => {
          const targets = ["SBL", "SBR", "LW", "RW"];
          const status = targets.map(role => {
            const spk = (placedSpeakers || []).find(s => getCanonicalRole(s?.role) === role);
            const exists = !!spk;
            const posValid = spk?.position && Number.isFinite(spk.position.x) && Number.isFinite(spk.position.y);
            const rawRole = spk?.role || "—";
            return `${role}: ${exists ? "yes" : "no"} pos:${posValid ? "yes" : "no"}${rawRole !== role ? ` (${rawRole})` : ""}`;
          }).join(" | ");
          
          return (
            <text
              x="12"
              y="36"
              fontSize="11"
              fill="#0066CC"
              fontFamily="monospace"
              style={{ pointerEvents: "none" }}
            >
              {dolbyLayout} → {status}
            </text>
          );
        })()}




<SvgDefs ids={ids} scale={scale} svgW={svgW} svgH={svgH} />

{/* Removed debug label (zoneKeysLabel) */}

          {/* ZOOM GROUP — CLIPPED TO VIEWPORT, WITH ZOOM-TO-CURSOR */}
          <g
              clipPath={`url(#${idsClip})`}
              transform={`translate(${panX + viewOffsetPx.x}, ${panY + viewOffsetPx.y}) scale(${zoom})`}
          >
            {/* Background hit area for pan (must be FIRST child, behind everything) */}
            {Number.isFinite(roomRect?.x) && Number.isFinite(roomRect?.y) && (
              <rect
                x={roomRect.x - 1000}
                y={roomRect.y - 1000}
                width={roomRect.width + 2000}
                height={roomRect.height + 2000}
                fill="transparent"
                pointerEvents={zoom > 1 ? "auto" : "none"}
                style={{ 
                  cursor: zoom > 1 ? (isPanningRef.current ? "grabbing" : "grab") : "default" 
                }}
                onPointerDown={onPanPointerDown}
                onPointerMove={onPanPointerMove}
                onPointerUp={onPanPointerUp}
                onPointerCancel={onPanPointerUp}
              />
            )}
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

            {/* Room Dimensions Overlay */}
            {overlaysForRendering?.ROOM_DIMS && (
              <g data-layer="room-dimensions">
                {/* Arrow markers */}
                <defs>
                  <marker
                    id="dim-arrow"
                    viewBox="0 0 10 10"
                    refX="5"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto"
                  >
                    <path
                      d="M 0 0 L 10 5 L 0 10 z"
                      fill="#DCDBD6"
                    />
                  </marker>
                </defs>

                {/* Horizontal (width) line – top of the room (screen wall) */}
                <line
                  x1={roomRect.x}
                  y1={roomRect.y - 20}
                  x2={roomRect.x + roomRect.width}
                  y2={roomRect.y - 20}
                  stroke="#DCDBD6"
                  strokeWidth={2}
                  markerStart="url(#dim-arrow)"
                  markerEnd="url(#dim-arrow)"
                />
                <text
                  x={roomRect.x + roomRect.width / 2}
                  y={roomRect.y - 28}
                  textAnchor="middle"
                  style={{ fontSize: 12, fill: "#1B1A1A" }}
                >
                  {`${(widthM ?? 0).toFixed(2)} m`}
                </text>

                {/* Vertical (length) line – left side of the room */}
                <line
                  x1={roomRect.x - 20}
                  y1={roomRect.y}
                  x2={roomRect.x - 20}
                  y2={roomRect.y + roomRect.height}
                  stroke="#DCDBD6"
                  strokeWidth={2}
                  markerStart="url(#dim-arrow)"
                  markerEnd="url(#dim-arrow)"
                />
                <text
                  x={roomRect.x - 28}
                  y={roomRect.y + roomRect.height / 2}
                  textAnchor="middle"
                  transform={`rotate(-90 ${roomRect.x - 28} ${roomRect.y + roomRect.height / 2})`}
                  style={{ fontSize: 12, fill: "#1B1A1A" }}
                >
                  {`${(lengthM ?? 0).toFixed(2)} m`}
                </text>
              </g>
            )}

            {/* Screen and baffle - Layer 3: Visual representation of the screen and baffle */}
            {BaffleAndScreen}




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
            {overheadCorridorsOn && overheadZones?.status === 'ok' && ZoneComponents.OVERHEADS}
            {overlaysForRendering?.enableDolbyZones && renderDolbyZones()}
            
            {/* NEW: Front Wide Zones - Rendered conditionally based on overlaysForRendering.enableFrontWides */}
            {overlaysForRendering?.enableFrontWides && ZoneComponents.FRONT_WIDE}

            {/* Layer 6: Static Room Elements (furniture, etc.) */}
            {renderRoomElements()}

            {/* Layer 7: MLP Marker (Fixed point, generally on top of zones but under draggable items) */}
            {MLPMarker}

            {/* Layer 7.5: MLP Position Ruler (when enabled) */}
            {showMlpRuler && (() => {
              // Render MLP position ruler using the same visual style as speaker rulers
              if (!Number.isFinite(mlpDotX_m) || !Number.isFinite(mlpDotY_m)) return null;

              const [mlpX_px, mlpY_px] = toPx(mlpDotX_m, mlpDotY_m);
              
              // Screen position (for screen → MLP distance)
              const screenY_px = roomRect.y + (screenFrontPlaneM * scale);
              
              // Ruler styling (match speaker rulers)
              const rulerColor = '#625143';
              const rulerStroke = 1.5;
              const dotRadius = 3;
              const fontSize = 11;
              const labelOffset = 16; // pixels from the line

              // Calculate distances
              const distLeftWall = mlpDotX_m; // Distance from left wall (x=0)
              const distRightWall = widthM - mlpDotX_m; // Distance from right wall
              const distScreen = mlpDotY_m - screenFrontPlaneM; // Distance from screen
              const distBackWall = lengthM - mlpDotY_m; // Distance from back wall
              const distFrontWall = mlpDotY_m; // Distance from front wall (y=0)

              // Secondary ruler X position: 20% from left wall toward MLP centerline
              // Formula: x = leftWallX + 0.20 * (mlpCenterX - leftWallX)
              const secondaryRulerX_px = roomRect.x + 0.20 * (mlpX_px - roomRect.x);

              return (
                <g data-layer="mlp-ruler" pointerEvents="none">
                  {/* Horizontal ruler (left wall ↔ MLP ↔ right wall) */}
                  <line
                    x1={roomRect.x}
                    y1={mlpY_px}
                    x2={roomRect.x + roomRect.width}
                    y2={mlpY_px}
                    stroke={rulerColor}
                    strokeWidth={rulerStroke}
                    opacity={0.6}
                  />
                  
                  {/* Left wall dot */}
                  <circle
                    cx={roomRect.x}
                    cy={mlpY_px}
                    r={dotRadius}
                    fill={rulerColor}
                    opacity={0.8}
                  />
                  
                  {/* Right wall dot */}
                  <circle
                    cx={roomRect.x + roomRect.width}
                    cy={mlpY_px}
                    r={dotRadius}
                    fill={rulerColor}
                    opacity={0.8}
                  />
                  
                  {/* Left wall → MLP distance label */}
                  <text
                    x={(roomRect.x + mlpX_px) / 2}
                    y={mlpY_px - labelOffset}
                    textAnchor="middle"
                    fontSize={fontSize}
                    fill={rulerColor}
                    fontFamily="system-ui, sans-serif"
                  >
                    {distLeftWall.toFixed(2)}m
                  </text>
                  
                  {/* MLP → Right wall distance label */}
                  <text
                    x={(mlpX_px + roomRect.x + roomRect.width) / 2}
                    y={mlpY_px - labelOffset}
                    textAnchor="middle"
                    fontSize={fontSize}
                    fill={rulerColor}
                    fontFamily="system-ui, sans-serif"
                  >
                    {distRightWall.toFixed(2)}m
                  </text>

                  {/* Vertical ruler (screen ↔ MLP ↔ back wall) */}
                  <line
                    x1={mlpX_px}
                    y1={screenY_px}
                    x2={mlpX_px}
                    y2={roomRect.y + roomRect.height}
                    stroke={rulerColor}
                    strokeWidth={rulerStroke}
                    opacity={0.6}
                  />
                  
                  {/* Screen plane dot */}
                  <circle
                    cx={mlpX_px}
                    cy={screenY_px}
                    r={dotRadius}
                    fill={rulerColor}
                    opacity={0.8}
                  />
                  
                  {/* Back wall dot */}
                  <circle
                    cx={mlpX_px}
                    cy={roomRect.y + roomRect.height}
                    r={dotRadius}
                    fill={rulerColor}
                    opacity={0.8}
                  />
                  
                  {/* Screen → MLP distance label (rotated, left side) */}
                  <text
                    x={mlpX_px - labelOffset}
                    y={(screenY_px + mlpY_px) / 2}
                    textAnchor="middle"
                    fontSize={fontSize}
                    fill={rulerColor}
                    fontFamily="system-ui, sans-serif"
                    transform={`rotate(-90 ${mlpX_px - labelOffset} ${(screenY_px + mlpY_px) / 2})`}
                  >
                    {distScreen.toFixed(2)}m
                  </text>
                  
                  {/* MLP → Back wall distance label (rotated, right side) */}
                  <text
                    x={mlpX_px + labelOffset}
                    y={(mlpY_px + roomRect.y + roomRect.height) / 2}
                    textAnchor="middle"
                    fontSize={fontSize}
                    fill={rulerColor}
                    fontFamily="system-ui, sans-serif"
                    transform={`rotate(-90 ${mlpX_px + labelOffset} ${(mlpY_px + roomRect.y + roomRect.height) / 2})`}
                  >
                    {distBackWall.toFixed(2)}m
                  </text>

                  {/* SECONDARY RULER: MLP → Front Wall depth */}
                  <defs>
                    <marker
                      id="mlp-depth-arrow"
                      viewBox="0 0 10 10"
                      refX="5"
                      refY="5"
                      markerWidth="4"
                      markerHeight="4"
                      orient="auto"
                    >
                      <path d="M 0 0 L 10 5 L 0 10 z" fill={rulerColor} />
                    </marker>
                  </defs>

                  {/* Vertical line from front wall to MLP horizontal ruler */}
                  <line
                    x1={secondaryRulerX_px}
                    y1={roomRect.y}
                    x2={secondaryRulerX_px}
                    y2={mlpY_px}
                    stroke={rulerColor}
                    strokeWidth={rulerStroke}
                    opacity={0.6}
                    markerStart="url(#mlp-depth-arrow)"
                    markerEnd="url(#mlp-depth-arrow)"
                  />
                  
                  {/* MLP → Front wall distance label (rotated, reading bottom to top) */}
                  <text
                    x={secondaryRulerX_px + labelOffset}
                    y={(roomRect.y + mlpY_px) / 2}
                    textAnchor="middle"
                    fontSize={fontSize}
                    fill={rulerColor}
                    fontFamily="system-ui, sans-serif"
                    transform={`rotate(-90 ${secondaryRulerX_px + labelOffset} ${(roomRect.y + mlpY_px) / 2})`}
                  >
                    {distFrontWall.toFixed(2)}m
                  </text>
                </g>
              );
            })()}


            {/* Layer 8: Subwoofers */}
            {Array.isArray(frontSubs) && frontSubs.length > 0 && (
              <FrontSubsLayer
                frontSubs={frontSubs}
                toPx={toPx}
                getModelDimsM={getModelDimsM}
                scale={scale}
                onSubPointerDown={(e, id) => handleMouseDown(e, id, 'sub')}
                onSubPointerMove={handleMouseMove}
                onSubPointerUp={handleMouseUp}
                dragging={dragging}
                draggedItemId={draggedItemId}
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

            {/* Speaker Positions Overlay */}
            <SpeakerPositionsOverlay
              speakers={placedSpeakers}
              seatingPositions={seatingPositions}
              dimensions={{ width: widthM, length: lengthM }}
              view={speakerPositionsView}
              meterToCanvasX={meterToCanvasX}
              meterToCanvasY={meterToCanvasY}
              roomRect={roomRect}
            />

<PlanMessages
  dragWarning={dragWarning}
  tooltip={tooltip}
  hoveredSpeaker={hoveredSpeaker}
  svgW={svgW}
/>

          </g>
        </svg>

        {/* SEAT HOVER HUD - updated with drag and hide/show */}
        <SeatHud
          tooltipData={tooltipData}
          effectiveHoveredSeat={effectiveHoveredSeat}
          hudPosition={hudPosition}
          isHudPinned={isHudPinned}
          hudDynamicStyle={hudDynamicStyle}
          onHudHeaderMouseDown={onHudHeaderMouseDown}
          hudElRef={hudElRef}
          setHudHiddenWhenPinned={setHudHiddenWhenPinned}
          hudHiddenWhenPinned={hudHiddenWhenPinned}
          renderLevelBadge={renderLevelBadge}
          splPowerW={tooltipData?.splAtSeatMeta?.powerW}
          splRadiationMode={tooltipData?.splAtSeatMeta?.radiationMode}
        />


      </div>
    </div>
  );
});