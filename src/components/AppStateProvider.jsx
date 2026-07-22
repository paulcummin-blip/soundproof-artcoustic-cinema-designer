import React, { createContext, useContext, useMemo, useState, useEffect, useRef, useCallback } from "react";
import { timeNowMs } from "@/components/utils/timeNow";
import { safeTable } from '@/components/utils/safeLog';
import { SHOW_DEBUG_LOGS } from '@/components/utils/diagnostics';
import { getCanonicalRole } from "@/components/utils/surroundRoleMap";
import { loadAutosave, saveAutosave, clearAutosave as clearAutosaveStorage, getAutosaveMeta, isAutosavePayloadValid } from "@/components/utils/sessionAutosave";
import { computeMLPAndPrimary } from "@/components/utils/computeMLPAndPrimary";
import { getSpeakerModelMeta } from "@/components/models/speakers/registry";
import { resolveSurroundModel } from "@/components/utils/speakerModelResolver";
import { useRspState } from "@/components/state/useRspState";

const enforceOnePrimary = (seats, dims, mlpBasis = "front") => {
  if (!Array.isArray(seats) || seats.length === 0) return seats;
  const W = Number(dims?.widthM ?? dims?.width) || 4.5;
  const L = Number(dims?.lengthM ?? dims?.length) || 6.0;
  try {
    const { seatsWithFlags } = computeMLPAndPrimary(seats, W, L, mlpBasis, null);
    if (!Array.isArray(seatsWithFlags) || seatsWithFlags.length === 0) return seats;
    // Collapse: keep only the first primary as the single RSP
    const primaries = seatsWithFlags.filter(s => s.isPrimary);
    const rspId = primaries.length > 0 ? primaries[0].id : seatsWithFlags[0].id;
    return seatsWithFlags.map(s => ({ ...s, isPrimary: s.id === rspId }));
  } catch {
    return seats.map((s, i) => ({ ...s, isPrimary: i === 0 }));
  }
};

// --- SEATING POSITIONS NORMALISER ---
const normaliseSeatingPositions = (seats, roomDims) => {
  if (!Array.isArray(seats)) return [];

  const widthM = Number(roomDims?.widthM ?? roomDims?.width) || 4.5;
  const lengthM = Number(roomDims?.lengthM ?? roomDims?.length) || 6.0;

  const MIN = 0.40;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  const minX = MIN;
  const maxX = Math.max(minX, widthM - MIN);
  const minY = MIN;
  const maxY = Math.max(minY, lengthM - MIN);

  return seats
    .map((s, i) => {
      const px = s?.x ?? s?.position?.x;
      const py = s?.y ?? s?.position?.y;
      const pz = s?.z ?? s?.position?.z;

      const x = Number(px);
      const y = Number(py);
      const z = Number.isFinite(Number(pz)) ? Number(pz) : 1.2;

      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

      return {
        ...s,
        // force canonical flat coords
        x: clamp(x, minX, maxX),
        y: clamp(y, minY, maxY),
        z,
        // keep id stable if it exists
        id: s?.id ?? `seat-${i + 1}`,
        // keep rowNumber if present; otherwise leave as-is (seat rebuild can set it later)
        rowNumber: Number.isInteger(s?.rowNumber) ? s.rowNumber : s?.rowNumber,
        // drop legacy nested position to avoid disagreement between readers
        position: undefined
      };
    })
    .filter(Boolean);
};

// --- ROOM ELEMENTS NORMALISER ---
function normaliseRoomElements(list) {
  const arr = Array.isArray(list) ? list : [];
  return arr
    .filter(Boolean)
    .map((el, i) => {
      const id = el.id ?? el._id ?? (i + 1);
      const type = el.type ?? "door";
      const wall = el.wall ?? "front";
      const length_m = Number.isFinite(el.length_m) ? el.length_m : 0.9;
      const thickness_m = Number.isFinite(el.thickness_m) ? el.thickness_m : 0.05;
      const pos_m = Number.isFinite(el.pos_m) ? el.pos_m : 0;

      // keep BOTH id styles so any renderer/export code will find one
      const label = (el.label ?? el.__label ?? "").toString();

      // projector-specific fields (preserved as-is if present, left undefined if absent)
      const x_lens_m = Number.isFinite(Number(el?.x_lens_m)) ? Number(el.x_lens_m) : undefined;
      const y_lens_m = Number.isFinite(Number(el?.y_lens_m)) ? Number(el.y_lens_m) : undefined;
      const z_lens_m = Number.isFinite(Number(el?.z_lens_m)) ? Number(el.z_lens_m) : undefined;
      const body_width_m = Number.isFinite(Number(el?.body_width_m)) ? Number(el.body_width_m) : undefined;
      const body_height_m = Number.isFinite(Number(el?.body_height_m)) ? Number(el.body_height_m) : undefined;
      const body_depth_m = Number.isFinite(Number(el?.body_depth_m)) ? Number(el.body_depth_m) : undefined;

      return {
        ...el,
        id,
        _id: id,
        type,
        wall,
        length_m,
        thickness_m,
        pos_m,
        label,
        __label: label,
        // projector fields: only written when defined, undefined fields are stripped by spread
        ...(x_lens_m !== undefined && { x_lens_m }),
        ...(y_lens_m !== undefined && { y_lens_m }),
        ...(z_lens_m !== undefined && { z_lens_m }),
        ...(body_width_m !== undefined && { body_width_m }),
        ...(body_height_m !== undefined && { body_height_m }),
        ...(body_depth_m !== undefined && { body_depth_m }),
      };
    });
}

// --- ATMOS PROTECTION HELPERS ---
const safeCanonRole = (role) => {
  const raw = String(role || "").trim();
  const upper = raw.toUpperCase();

  // Local safety net for common aliases (in case getCanonicalRole is incomplete)
  const aliasMap = {
    LR: "SBL",
    RR: "SBR",
    FWL: "LW",
    FWR: "RW",
  };

  const preMapped = aliasMap[upper] || raw;

  try {
    return String(getCanonicalRole(preMapped) || preMapped || raw).trim().toUpperCase();
  } catch (e) {
    return String(preMapped || raw).trim().toUpperCase();
  }
};

// CRITICAL: This mapping must stay aligned with RoomDesigner's OVERHEAD_IDS_BY_LAYOUT
const OVERHEAD_IDS_BY_LAYOUT_APPSTATE = {
  "5.1.2": ["TML", "TMR"],
  "5.1.4": ["TFL", "TFR", "TRL", "TRR"],
  "5.1.6": ["TFL", "TFR", "TML", "TMR", "TRL", "TRR"],

  "7.1.2": ["TML", "TMR"],
  "7.1.4": ["TFL", "TFR", "TRL", "TRR"],
  "7.1.6": ["TFL", "TFR", "TML", "TMR", "TRL", "TRR"],

  "9.1.2": ["TML", "TMR"],
  "9.1.4": ["TFL", "TFR", "TRL", "TRR"],
  "9.1.6": ["TFL", "TFR", "TML", "TMR", "TRL", "TRR"],
};

function getTargetOverheadIdsForLayout(layout) {
  if (!layout) return [];
  const normalized = String(layout)
    .split(' ')[0] // "5.1.4 Dolby Atmos" -> "5.1.4"
    .split('_')[0]; // "5.1.4_atmos" -> "5.1.4"
  return OVERHEAD_IDS_BY_LAYOUT_APPSTATE[normalized] || [];
}

export function getSpeakerVisibilityFor(layoutString, sevenBedLayoutType) {
  const layout = String(layoutString || "5.1");
  const parts = layout.split(".");
  const major = parseInt(parts[0], 10) || 5;
  const heights = parseInt(parts[2], 10) || 0; // e.g., "5.1.2" → 2, "7.1.4" → 4

  // LCR are always visible
  const roles = new Set(["FL", "FC", "FR"]);

  const showSides = major >= 5;
  
  const useWides = sevenBedLayoutType === "wides";

  // 9.x layouts MUST show BOTH rears and wides.
  // 7.x layouts choose between them based on sevenBedLayoutType.
  const showRears = major >= 9 || (major >= 7 && !useWides);
  const showWides = major >= 9 || (major >= 7 && useWides);

  if (showSides) {
    roles.add("SL");
    roles.add("SR");
  }

  if (showRears) {
    roles.add("SBL");
    roles.add("SBR");
    // common aliases used elsewhere
    roles.add("LR");
    roles.add("RR");
  }

  if (showWides) {
    roles.add("LW");
    roles.add("RW");
    // common aliases used elsewhere
    roles.add("FWL");
    roles.add("FWR");
  }

  // Add overhead channels based on height count
  if (heights === 2) {
    // Canonical: Top Middle Left/Right
    roles.add("TML");
    roles.add("TMR");
  } else if (heights === 4) {
    // Canonical: Top Front + Top Rear
    roles.add("TFL");
    roles.add("TFR");
    roles.add("TRL");
    roles.add("TRR");
  } else if (heights === 6) {
    // Canonical: Top Front + Top Middle + Top Rear
    roles.add("TFL");
    roles.add("TFR");
    roles.add("TML");
    roles.add("TMR");
    roles.add("TRL");
    roles.add("TRR");
  }

  return roles;
}

// --- idempotence helper -----------------------------------------------------
const EPS = 1e-4;
const almostEq = (a, b) => Math.abs((a ?? 0) - (b ?? 0)) <= EPS;

function speakersShallowEqual(a = [], b = []) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;

  const byRole = (arr) => {
    const m = new Map();
    arr.forEach(s => m.set(safeCanonRole(s?.role), s));
    return m;
  };
  const A = byRole(a), B = byRole(b);

  if (A.size !== B.size) return false;

  for (const [role, sa] of A) {
    const sb = B.get(role);
    if (!sb) return false;

    // Model must match
    if ((sa.model || "off") !== (sb.model || "off")) return false;

    // Position must match
    const pa = sa.position || {};
    const pb = sb.position || {};
    if (
      !almostEq(pa.x, pb.x) ||
      !almostEq(pa.y, pb.y) ||
      !almostEq(pa.z, pb.z)
    ) {
      return false;
    }

    // Legacy rotation object (kept exactly as before)
    const ra = sa.rotation || {};
    const rb = sb.rotation || {};
    if (
      !almostEq(ra.x, rb.x) ||
      !almostEq(ra.y, rb.y) ||
      !almostEq(ra.z, rb.z)
    ) {
      return false;
    }

    // NEW: compare yaw / rotationDeg so toe-in changes are not ignored
    const yawA =
      sa.yaw ??
      sa.rotationDeg ??
      sa.rotation_deg ??
      (sa.rotation && sa.rotation.y);
    const yawB =
      sb.yaw ??
      sb.rotationDeg ??
      sb.rotation_deg ??
      (sb.rotation && sb.rotation.y);

    if (!almostEq(yawA, yawB)) return false;
  }
  return true;
}

const AppStateContext = createContext(null);

export function useAppState() {
  const ctx = useContext(AppStateContext);
  return ctx;
}

function useDesignerState() {
  // --- AUTOSAVE RESTORE (read once, sync) ---
  let __autosavePayload = null;
  try {
    const d = loadAutosave();
    __autosavePayload = d?.payload || null;
  } catch {
    __autosavePayload = null;
  }

  // FREE-USE GUARD: detect whether a real project is open via URL
  // If no projectId is present, this is a free-use / local draft session.
  // In free-use mode, only room/screen/seating are restored from autosave.
  // Speaker state always starts clean so stale speaker config does not bleed across sessions.
  const __isFreeUse = (() => {
    try {
      const url = new URL(window.location.href);
      const pid = url.searchParams.get("projectId") || url.searchParams.get("project") || url.searchParams.get("id");
      if (pid) return false;
      const uuidMatch = url.pathname.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      return !uuidMatch;
    } catch {
      return true; // safe default: treat as free-use if URL cannot be read
    }
  })();

  // Strip legacy "_s" suffix from surround models (UI hygiene)
  const stripSurroundSuffix = (v) => {
    const s = String(v || "");
    return s.endsWith("_s") ? s.slice(0, -2) : s;
  };

  // Log what we're restoring (debug)
  if (__autosavePayload && globalThis.__B44_LOGS) {
    console.log('[AppState] Autosave payload loaded:', {
      hasGlobalSurroundModel: !!__autosavePayload.globalSurroundModel,
      hasOverheadGlobalModel: !!__autosavePayload.overheadGlobalModel,
      globalSurroundModel: __autosavePayload.globalSurroundModel,
      overheadGlobalModel: __autosavePayload.overheadGlobalModel,
    });
  }

  const [roomDims, _setRoomDims] = useState(() => (
    (__autosavePayload && __autosavePayload.roomDims) ? __autosavePayload.roomDims : {
      widthM: 4.5,
      lengthM: 6.0,
      heightM: 2.4,
    }
  ));

  // CRITICAL: Normalizer - ensure roomDims is NEVER {} and always has finite numbers
  const setRoomDims = useCallback((updater) => {
    _setRoomDims(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      
      // Default fallback values
      const DEFAULT_WIDTH = 4.5;
      const DEFAULT_LENGTH = 6.0;
      const DEFAULT_HEIGHT = 2.4;
      
      // Normalize: extract from any key variant, fallback to defaults
      const normalized = {
        widthM: Number(next?.widthM ?? next?.width) || DEFAULT_WIDTH,
        lengthM: Number(next?.lengthM ?? next?.length) || DEFAULT_LENGTH,
        heightM: Number(next?.heightM ?? next?.height) || DEFAULT_HEIGHT,
        // Mirror keys for compatibility
        width: Number(next?.widthM ?? next?.width) || DEFAULT_WIDTH,
        length: Number(next?.lengthM ?? next?.length) || DEFAULT_LENGTH,
        height: Number(next?.heightM ?? next?.height) || DEFAULT_HEIGHT,
      };
      
      return normalized;
    });
  }, []);

  const setRoomWidthM = useCallback((v) => {
    const newVal = Number(v);
    if (!Number.isFinite(newVal) || newVal === 0) return;
    setRoomDims(d => {
      if (Math.abs((d?.widthM ?? 0) - newVal) < 0.001) return d;
      return { ...d, widthM: newVal };
    });
  }, []);
  
  const setRoomLengthM = useCallback((v) => {
    const newVal = Number(v);
    if (!Number.isFinite(newVal) || newVal === 0) return;
    setRoomDims(d => {
      if (Math.abs((d?.lengthM ?? 0) - newVal) < 0.001) return d;
      return { ...d, lengthM: newVal };
    });
  }, []);
  
  const setRoomHeightM = useCallback((v) => {
    const newVal = Number(v);
    if (!Number.isFinite(newVal) || newVal === 0) return;
    setRoomDims(d => {
      if (Math.abs((d?.heightM ?? 0) - newVal) < 0.001) return d;
      return { ...d, heightM: newVal };
    });
  }, []);

  const [dimensions, setDimensions] = useState({}); 

  // SINGLE SOURCE OF TRUTH for TV preset widths — must match registry.js tvWidthMap and ScreenConfiguration
  const TV_PRESET_WIDTH_MM = {
    tv65:  1411,
    tv77:  1711,
    tv83:  1872,
    tv100: 2230,
  };

  // Reverse map: mm value → preset key (for backfilling tvPresetKey from tvWidthMm)
  const TV_WIDTH_MM_TO_KEY = Object.fromEntries(
    Object.entries(TV_PRESET_WIDTH_MM).map(([k, v]) => [v, k])
  );

  const backfillTvPresetKey = (s) => {
    if (!s) return s;
    let result = s;

    // Case 1: tvPresetKey exists but tvWidthMm is missing/zero → derive from key
    if (result.tvPresetKey && !result.tvWidthMm) {
      const mm = TV_PRESET_WIDTH_MM[result.tvPresetKey];
      if (mm) result = { ...result, tvWidthMm: mm };
    }

    // Case 2: tvWidthMm exists but tvPresetKey is missing → derive from width
    if (!result.tvPresetKey && Number(result.tvWidthMm) > 0) {
      const key = TV_WIDTH_MM_TO_KEY[Number(result.tvWidthMm)];
      if (key) result = { ...result, tvPresetKey: key };
    }

    return result;
  };

  const [screen, setScreen] = useState(() => {
    if (__autosavePayload && __autosavePayload.screen) {
      return backfillTvPresetKey(__autosavePayload.screen);
    }
    return {
      visibleWidthInches: 100, aspectRatio: "16:9", mountMode: "baffle",
      floatDepthM: 0, showScreenPlane: false, showCavity: false, speakerClearanceM: 0.02,
      borderThicknessM: 0.08,
      tvPresetKey: null,
      tvWidthMm: null,
    };
  });
  const [screenHeight, setScreenHeight] = useState(() => (
    (__autosavePayload && typeof __autosavePayload.screenHeight === "number") ? __autosavePayload.screenHeight : 0.5
  ));
  const [screenWallState, _setScreenWall] = useState("front");
  const setScreenWall = useCallback(() => _setScreenWall("front"), []);
  const screenWall = screenWallState;

  const [dolbyConfig, _setDolbyConfig] = useState(() => (
    (!__isFreeUse && __autosavePayload && typeof __autosavePayload.dolbyConfig === "string") ? __autosavePayload.dolbyConfig : "5.1"
  ));
  const [dolbyLayout, setDolbyLayout] = useState(() => (
    (!__isFreeUse && __autosavePayload && typeof __autosavePayload.dolbyLayout === "string") ? __autosavePayload.dolbyLayout : "5.1"
  ));
  const setDolbyConfig = useCallback((v) => {
    const p = v || "5.1";
    _setDolbyConfig(p);
    setDolbyLayout(p);
  }, []);

  const [seededChannels, setSeededChannels] = useState([]);
  const [sevenBedLayoutType, setSevenBedLayoutType] = useState(() => (
    (!__isFreeUse && __autosavePayload && typeof __autosavePayload.sevenBedLayoutType === "string")
      ? __autosavePayload.sevenBedLayoutType
      : "rears"
  ));
  const [seatingPositions, setSeatingPositions] = useState(() => {
    if (__autosavePayload && Array.isArray(__autosavePayload.seatingPositions)) {
      const dims = __autosavePayload.roomDims || __autosavePayload.roomDimensions || null;
      const normalised = normaliseSeatingPositions(__autosavePayload.seatingPositions, dims);
      return enforceOnePrimary(normalised, dims, __autosavePayload.mlpBasis || "front");
    }
    return [];
  });
  const [baselineSeatingPositions, setBaselineSeatingPositions] = useState([]);
  const [seatingRows, setSeatingRows] = useState(() => (
    (__autosavePayload && typeof __autosavePayload.seatingRows === "number") ? __autosavePayload.seatingRows : 1
  ));
  const [seatsPerRow, setSeatsPerRow] = useState(() => (
    (__autosavePayload && typeof __autosavePayload.seatsPerRow === "number") ? __autosavePayload.seatsPerRow : 3
  ));
  const [seatsPerRowByRow, setSeatsPerRowByRow] = useState(() => (
    (__autosavePayload && Array.isArray(__autosavePayload.seatsPerRowByRow)) ? __autosavePayload.seatsPerRowByRow : []
  ));
  const [seatingBlockOffset, setSeatingBlockOffset] = useState(() => (
    (__autosavePayload && typeof __autosavePayload.seatingBlockOffset === "number") ? __autosavePayload.seatingBlockOffset : 0
  ));
  const [seatSpacing, setSeatSpacing] = useState(() => (
    (__autosavePayload && typeof __autosavePayload.seatSpacing === "number") ? __autosavePayload.seatSpacing : 0.8
  ));
  const [rowSpacingM, setRowSpacingM] = useState(() => (
    (__autosavePayload && typeof __autosavePayload.rowSpacingM === "number") ? __autosavePayload.rowSpacingM : 1.8
  ));
  const [mlpBasis, setMlpBasis] = useState(() => (
    (__autosavePayload && typeof __autosavePayload.mlpBasis === "string") ? __autosavePayload.mlpBasis : "front"
  ));
  const [rowEarHeights, setRowEarHeights] = useState(() => {
    if (__autosavePayload && Array.isArray(__autosavePayload.rowEarHeights) && __autosavePayload.rowEarHeights.length > 0) {
      return __autosavePayload.rowEarHeights;
    }
    return [1.2, 1.5, 1.8];
  });
  const [autoSeatByRP23, setAutoSeatByRP23] = useState(() => (
    (__autosavePayload && typeof __autosavePayload.autoSeatByRP23 === "boolean") ? __autosavePayload.autoSeatByRP23 : true
  ));
  const [roomElements, setRoomElements] = useState(() => (
    (!__isFreeUse && __autosavePayload && Array.isArray(__autosavePayload.roomElements))
      ? normaliseRoomElements(__autosavePayload.roomElements)
      : []
  ));
  const [subwoofers, setSubwoofers] = useState([]);
  const [frontSubsCfg, setFrontSubsCfg] = useState(() => (
    (!__isFreeUse && __autosavePayload && __autosavePayload.frontSubsCfg) ? __autosavePayload.frontSubsCfg : {
      model: "SUB2-12",
      count: 0,
      positions: [],
      tuning: [],
      orientation: "vertical",
      placementMode: "default"
    }
  ));
  const [rearSubsCfg, setRearSubsCfg] = useState(() => (
    (!__isFreeUse && __autosavePayload && __autosavePayload.rearSubsCfg) ? __autosavePayload.rearSubsCfg : {
      model: "SUB2-12",
      count: 0,
      positions: [],
      tuning: [],
      orientation: "vertical",
      placementMode: "default"
    }
  ));
  const [subWarnings, setSubWarnings] = useState({ front: [], rear: [] });
  // LCR aim is derived exclusively from lcrAimMode — not a separate independent flag.
  // aimAtMLP is kept for non-LCR callers (surrounds, overheads) and defaults to false
  // so it does not independently influence LCR yaw.
  const [aimAtMLP, setAimAtMLP] = useState(false);
  const [overheadOffsetM, setOverheadOffsetM] = useState(0);
  const [overheadMode, setOverheadMode] = useState("optimised");
  const [rowTarget, setRowTarget] = useState("front");
  
  const [overlays, setOverlays] = useState({
    LCR: false, FRONT_WIDE: false, SIDE_SURROUND: false, REAR_SURROUND: false,
    OVERHEADS_2: false, OVERHEADS_4: false, OVERHEADS_6: false, RP22_ANGLES: false,
    enableDolbyZones: false,
  });

  const [speakerSystem, _setSpeakerSystem] = useState(() => (
    (!__isFreeUse && __autosavePayload && __autosavePayload.speakerSystem) ? __autosavePayload.speakerSystem : { placedSpeakers: [], lastUpdated: timeNowMs() }
  ));
  const [speakersEpoch, setSpeakersEpoch] = useState(0);
  const [enableLayoutSPLWidget, setEnableLayoutSPLWidget] = useState(true);
  
  const [enableFrontWides, setEnableFrontWides] = useState(false);
  const [useFrontWidesInsteadOfRear, setUseFrontWidesInsteadOfRear] = useState(false);
  const [useWidesInsteadOfRears, setUseWidesInsteadOfRears] = useState(false);
  const [showRoomModesOverlay, setShowRoomModesOverlay] = useState(false);
  
  const DBG_FW = typeof window !== 'undefined' && window.DBG_FW;

  const [frozenTabs, setFrozenTabs] = useState({
    room: false, screen: false, seating: false, speakers: false,
    elements: false, bass: false, report: false,
  });

  const [screenCentreDepthM, setScreenCentreDepthM] = useState(null);
  const [screenFrontPlaneM, _setScreenFrontPlaneM] = useState(null);
  const [screenPlaneLocked, setScreenPlaneLocked] = useState(false);
  const [lockedScreenFrontPlaneM, setLockedScreenFrontPlaneM] = useState(null);
  const [mlpY_m, setMlpY_m] = useState(null);
  const [rowCentersM, _setRowCentersM] = useState([]);

  const setRowCentersM = useCallback(
    (next) => {
      _setRowCentersM(prev => {
        const value = typeof next === 'function' ? next(prev) : next;
        return Array.isArray(value) ? value.slice() : prev;
      });
    },
    []
  );

  const [overheadGlobalModel, setOverheadGlobalModel] = useState(() => (
    (!__isFreeUse && __autosavePayload && __autosavePayload.overheadGlobalModel) ? __autosavePayload.overheadGlobalModel : null
  ));
  const [overheadFrontOverride, setOverheadFrontOverride] = useState(() => (
    (!__isFreeUse && __autosavePayload && __autosavePayload.overheadFrontOverride) ? __autosavePayload.overheadFrontOverride : null
  ));
  const [overheadMidOverride, setOverheadMidOverride] = useState(() => (
    (!__isFreeUse && __autosavePayload && __autosavePayload.overheadMidOverride) ? __autosavePayload.overheadMidOverride : null
  ));
  const [overheadRearOverride, setOverheadRearOverride] = useState(() => (
    (!__isFreeUse && __autosavePayload && __autosavePayload.overheadRearOverride) ? __autosavePayload.overheadRearOverride : null
  ));
  const [useFrontGlobal, setUseFrontGlobal] = useState(() => (
    (__autosavePayload && typeof __autosavePayload.useFrontGlobal === "boolean") ? __autosavePayload.useFrontGlobal : true
  ));
  const [useMidGlobal, setUseMidGlobal] = useState(() => (
    (__autosavePayload && typeof __autosavePayload.useMidGlobal === "boolean") ? __autosavePayload.useMidGlobal : true
  ));
  const [useRearGlobal, setUseRearGlobal] = useState(() => (
    (__autosavePayload && typeof __autosavePayload.useRearGlobal === "boolean") ? __autosavePayload.useRearGlobal : true
  ));

  const [aimFrontWidesAtMLP, setAimFrontWidesAtMLP] = useState(() => (
    (__autosavePayload && typeof __autosavePayload.aimFrontWidesAtMLP === "boolean") ? __autosavePayload.aimFrontWidesAtMLP : false
  ));
  const [aimSideSurroundsAtMLP, setAimSideSurroundsAtMLP] = useState(() => (
    (__autosavePayload && typeof __autosavePayload.aimSideSurroundsAtMLP === "boolean") ? __autosavePayload.aimSideSurroundsAtMLP : false
  ));
  const [aimRearSurroundsAtMLP, setAimRearSurroundsAtMLP] = useState(() => (
    (__autosavePayload && typeof __autosavePayload.aimRearSurroundsAtMLP === "boolean") ? __autosavePayload.aimRearSurroundsAtMLP : false
  ));

  // LCR aim mode (persisted) — "flat" | "angled"
  const [lcrAimMode, _setLcrAimMode] = useState(() => (
    (__autosavePayload && typeof __autosavePayload.lcrAimMode === "string")
      ? __autosavePayload.lcrAimMode
      : "flat"
  ));

  const [liveImpactMode, setLiveImpactMode] = useState(() => ((__autosavePayload && typeof __autosavePayload.liveImpactMode === "string") ? __autosavePayload.liveImpactMode : "summary"));

  const setLcrAimMode = useCallback((mode) => {
    const m = (mode === "angled") ? "angled" : "flat";
    _setLcrAimMode(m);
  }, []);

  const [autosaveMeta, setAutosaveMeta] = useState(null);
  const [globalSurroundModel, _setGlobalSurroundModel] = useState(() => (
    (!__isFreeUse && __autosavePayload && __autosavePayload.globalSurroundModel) ? stripSurroundSuffix(__autosavePayload.globalSurroundModel) : null
  ));
  const [isHydrated, setIsHydrated] = useState(false);
  const [isProjectHydrationReady, setProjectHydrationReady] = useState(() => __isFreeUse);
  const [perSeatMetrics, setPerSeatMetrics] = useState({});
  const [roomResetEpoch, setRoomResetEpoch] = useState(0);
  const [seatMetricsById, setSeatMetricsById] = useState(() => (
    (__autosavePayload && __autosavePayload.seatMetricsById) ? __autosavePayload.seatMetricsById : {}
  ));

  // Latest seat snapshot (no signature, just seat.id -> full snapshot)
  const [seatSnapshotBySeatId, setSeatSnapshotBySeatId] = useState({});

  const [p15ConstructionLevel, setP15ConstructionLevel] = useState(() => (
    (__autosavePayload && __autosavePayload.p15ConstructionLevel) ? __autosavePayload.p15ConstructionLevel : 'purpose-built'
  ));

  const setP15ConstructionLevelSafe = useCallback((next) => {
    const allowed = new Set(["standard", "purpose-built", "reference", "studio"]);
    const v = allowed.has(next) ? next : "standard";
    setP15ConstructionLevel(v);
  }, []);

  const [p21EarlyReflectionPreset, setP21EarlyReflectionPreset] = useState(() => (
    (__autosavePayload && __autosavePayload.p21EarlyReflectionPreset) ? __autosavePayload.p21EarlyReflectionPreset : 'l3'
  ));

  const [designEqEnabled, setDesignEqEnabled] = useState(() => (
    (__autosavePayload && typeof __autosavePayload.designEqEnabled === "boolean") ? __autosavePayload.designEqEnabled : false
  ));
  const setDesignEqEnabledSafe = useCallback((v) => setDesignEqEnabled(!!v), []);

  const [p12Mode, setP12Mode] = useState(null);
  const [p12Level, setP12Level] = useState(null);

  const setP21EarlyReflectionPresetSafe = useCallback((next) => {
    const allowed = new Set(["l1", "l2", "l3", "l4"]);
    const v = allowed.has(next) ? next : "l2";
    setP21EarlyReflectionPreset(v);
  }, []);

  const [mlpOverride, setMlpOverride] = useState(() => (
    (__autosavePayload && __autosavePayload.mlpOverride) ? __autosavePayload.mlpOverride : null
  ));

  const clearMlpOverride = useCallback(() => {
    setMlpOverride(null);
  }, []);

  const [extraSurroundCount, _setExtraSurroundCount] = useState(() => (
    (!__isFreeUse && __autosavePayload && typeof __autosavePayload.extraSurroundCount === 'number') ? __autosavePayload.extraSurroundCount : 0
  ));

  const setExtraSurroundCount = useCallback((next) => {
    const allowed = new Set([0, 2, 4, 6, 8]);
    const v = Number(next);
    const clamped = allowed.has(v) ? v : 0;
    _setExtraSurroundCount(clamped);
  }, []);

  // ── RSP STATE (composed from isolated hook) ──────────────────────────────
  const { rspMode, setRspMode, manualRspY_m, setManualRspY_m, resetRspState } = useRspState(__autosavePayload);
  // ── END RSP STATE ─────────────────────────────────────────────────────────

  // Compute MLP point from seating positions (stable, always available when seats exist)
  const mlp = useMemo(() => {
    if (!Array.isArray(seatingPositions) || seatingPositions.length === 0) return null;
    
    const widthM = Number(roomDims?.widthM) || 4.5;
    const lengthM = Number(roomDims?.lengthM) || 6.0;
    
    try {
      const { mlp: computedMlp } = computeMLPAndPrimary(
        seatingPositions,
        widthM,
        lengthM,
        mlpBasis,
        mlpOverride // pass live override if user has moved the green dot
      );
      
      if (!computedMlp || !Number.isFinite(computedMlp.x) || !Number.isFinite(computedMlp.y)) return null;
      
      return {
        x: computedMlp.x,
        y: computedMlp.y,
        z: computedMlp.z || 1.2,
      };
    } catch (e) {
      console.warn('[AppState] MLP computation failed:', e);
      return null;
    }
  }, [seatingPositions, roomDims?.widthM, roomDims?.lengthM, mlpBasis, mlpOverride]);

  const setGlobalSurroundModel = useCallback((model) => {
    if (globalThis.__B44_LOGS) console.log('[AppState] setGlobalSurroundModel', { model });
    // Only update the global state reference — per-role model assignment is handled
    // by handleSurroundModelChange in UnifiedSurroundsConfig, which writes individual
    // models (sideModel / rearModel / wideModel) directly onto placedSpeakers.
    // Mass-syncing all SL/SR/SBL/SBR/LW/RW here would overwrite per-role overrides.
    _setGlobalSurroundModel(model);
  }, []);

  const setSpeakerSystem = useCallback(
    (updater) => {
      _setSpeakerSystem((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        if (!next) return prev;

        // Start from next.placedSpeakers if present, otherwise keep previous.
        let speakers = Array.isArray(next.placedSpeakers)
          ? next.placedSpeakers.slice()
          : Array.isArray(prev.placedSpeakers)
          ? prev.placedSpeakers.slice()
          : [];

        // IDEMPOTENCE CHECK: if speakers haven't actually changed, don't update state
        if (speakersShallowEqual(prev.placedSpeakers, speakers)) {
          if (globalThis.__B44_LOGS) {
            console.log("[AS] setSpeakerSystem: speakers unchanged, returning prev");
          }
          return prev;
        }

        // DEBUG: show exactly what roles we are receiving and storing.
        if (globalThis.__B44_LOGS) {
          console.log("[AS] setSpeakerSystem RAW incoming roles:",
            speakers.map(s => s && String(s.role)));
        }

        const result = {
          ...prev,
          ...next,
          placedSpeakers: speakers,
        };

        if (globalThis.__B44_LOGS) {
          console.log("[AS] setSpeakerSystem STORED roles:",
            (result.placedSpeakers || []).map(s => s && String(s.role)));
        }

        return result;
      });
    },
    []
  );

  useEffect(() => {
    if (!isHydrated) return;

    const global = overheadGlobalModel;
    if (!global) return; // No global model selected — nothing to sync

    const resolveForRole = (role) => {
      const r = String(role || '').toUpperCase();
      if (!r.startsWith('T')) return null;
      let zone = null;
      if (['TFL', 'TFR', 'TFC'].includes(r)) zone = 'front';
      else if (['TL', 'TR', 'TML', 'TMR'].includes(r)) zone = 'mid';
      else if (['TBL', 'TBR', 'TBC', 'TRL', 'TRR', 'TRC'].includes(r)) zone = 'rear';
      if (!zone) return global || null;
      if (zone === 'front') return useFrontGlobal ? global : (overheadFrontOverride || global);
      if (zone === 'mid') return useMidGlobal ? global : (overheadMidOverride || global);
      if (zone === 'rear') return useRearGlobal ? global : (overheadRearOverride || global);
      return global || null;
    };

    setSpeakerSystem(prev => {
      const current = Array.isArray(prev?.placedSpeakers) ? prev.placedSpeakers : [];
      let changed = false;
      const next = current.map(spk => {
        const role = String(spk?.role || '').toUpperCase();
        if (!role.startsWith('T')) return spk;
        const resolved = resolveForRole(role);
        if (!resolved || spk.model === resolved) return spk;
        changed = true;
        return { ...spk, model: resolved };
      });
      if (!changed) return prev;
      return { ...prev, placedSpeakers: next };
    });
  }, [isHydrated, overheadGlobalModel, overheadFrontOverride, overheadMidOverride, overheadRearOverride, useFrontGlobal, useMidGlobal, useRearGlobal, setSpeakerSystem]);

  const prevProjectHydrationReadyRef = useRef(isProjectHydrationReady);

  useEffect(() => {
    const didJustFinishProjectHydration = !prevProjectHydrationReadyRef.current && isProjectHydrationReady;
    prevProjectHydrationReadyRef.current = isProjectHydrationReady;

    // HYDRATION GUARD: do not run until autosave restore has completed
    // and any saved-project hydration has finished.
    // Without this, the effect can fire while extraSurroundCount is still 0
    // and delete saved SL2/SR2/... speakers before project data is applied.
    if (!isHydrated || !isProjectHydrationReady) return;

    // Prevent running before model is ready (fixes load-order bug)
    if (!globalSurroundModel || globalSurroundModel === 'off') return;

    const count = extraSurroundCount || 0;
    
    // Always keep modelKey aligned to the current surround model
    const modelKey = (() => {
      const rawModel = String(globalSurroundModel || '').trim();
      if (!rawModel) return 'off';
      const resolved = resolveSurroundModel(rawModel, 'SL');
      const resolvedLower = String(resolved || '').trim().toLowerCase();
      return (!resolvedLower || resolvedLower === 'off' || resolvedLower === 'none') ? 'off' : resolved;
    })();
    
    // 1cm wall buffer (single source of truth for ALL surrounds)
    const WALL_BUFFER_M = 0.01;

    // Get SL/SR positions to calculate spawn positions
    const slSpeaker = (speakerSystem?.placedSpeakers || []).find(s => {
      const r = String(s?.role || '').toUpperCase();
      return r === 'SL' || r === 'LS';
    });
    const srSpeaker = (speakerSystem?.placedSpeakers || []).find(s => {
      const r = String(s?.role || '').toUpperCase();
      return r === 'SR' || r === 'RS';
    });

    const slY = Number.isFinite(slSpeaker?.position?.y) ? slSpeaker.position.y : null;
    const srY = Number.isFinite(srSpeaker?.position?.y) ? srSpeaker.position.y : null;
    // Compute wall-hugging X the same way sideWallX() does: halfDepth + WALL_BUFFER_M from each wall.
    // Fall back to the base SL/SR X if already placed, otherwise compute from model dims.
    const _extraModel = globalSurroundModel && globalSurroundModel !== 'off' ? globalSurroundModel : null;
    const _extraMeta = _extraModel ? getSpeakerModelMeta(_extraModel) : null;
    const _extraHalfDepth = _extraMeta?.depthM ? _extraMeta.depthM / 2 : 0.041; // default ~EVOLVE 2-1 half-depth
    const _roomW = Number(roomDims?.widthM) || 4.5;
    const _computedSlX = WALL_BUFFER_M + _extraHalfDepth;
    const _computedSrX = _roomW - WALL_BUFFER_M - _extraHalfDepth;
    const slX = Number.isFinite(slSpeaker?.position?.x) ? slSpeaker.position.x : _computedSlX;
    const srX = Number.isFinite(srSpeaker?.position?.x) ? srSpeaker.position.x : _computedSrX;

    // Inject extra speakers directly into placedSpeakers array
    console.log('[EXTRA sync start]', {
      extraSurroundCount,
      globalSurroundModel,
      roles: Array.isArray(speakerSystem?.placedSpeakers) ? speakerSystem.placedSpeakers.map(s => String(s?.role)) : []
    });
    setSpeakerSystem(prev => {
      const current = Array.isArray(prev?.placedSpeakers) ? prev.placedSpeakers : [];
      
      // Find existing extra surrounds (roles SL2, SR2, SL3, SR3, ...)
      const extraRolePattern = /^(SL|SR)\d+$/;
      const existing = current.filter(s => extraRolePattern.test(String(s.role).toUpperCase()));
      const nonExtras = current.filter(s => !extraRolePattern.test(String(s.role).toUpperCase()));
      
      // If count is 0, remove all extras
      if (count === 0) {
        if (didJustFinishProjectHydration && existing.length > 0) return prev;
        if (existing.length === 0) return prev; // Already clean
        const nextPlaced = nonExtras;
        
        console.log('[EXTRA sync remove]', {
          existing: existing.map(s => String(s?.role)),
          nonExtras: nonExtras.map(s => String(s?.role))
        });

        // Use speakersShallowEqual for true idempotence
        if (speakersShallowEqual(current, nextPlaced)) return prev;
        return { ...prev, placedSpeakers: nextPlaced };
      }
      
      // Calculate how many pairs we need (count is total speakers, pairs are count/2)
      const pairsNeeded = count / 2;
      
      // Build required extra speakers, preserving user edits
      const nextExtras = [];
      
      for (let pairIndex = 0; pairIndex < pairsNeeded; pairIndex++) {
        const pairNumber = pairIndex + 2; // SL2/SR2 start at pair 2
        const roleSL = `SL${pairNumber}`;
        const roleSR = `SR${pairNumber}`;
        
        // Calculate default Y position: each pair is 1.00m further from screen than the previous
        const offsetM = pairIndex * 1.00;
        const baseY = (slY !== null && srY !== null) 
          ? ((slY + srY) / 2) + 1.00 + offsetM
          : (Number(roomDims?.lengthM) || 6.0) * 0.65 + offsetM;
        
        // CRITICAL: if speaker already exists, preserve it exactly — do not overwrite position,
        // positionSource, or rotation fields. Only seed a new speaker if the role is missing.
        const existingSL = existing.find(s => String(s.role).toUpperCase() === roleSL);
        const existingSR = existing.find(s => String(s.role).toUpperCase() === roleSR);
        
        // SL speaker (left) — preserve placement state, but keep model synced to current surround model
        nextExtras.push(existingSL ? {
          ...existingSL,
          model: modelKey && modelKey !== 'off' ? modelKey : undefined,
        } : {
          id: `${roleSL.toLowerCase()}-${timeNowMs() + pairIndex * 2}`,
          role: roleSL,
          model: modelKey && modelKey !== 'off' ? modelKey : undefined,
          position: { x: _computedSlX, y: baseY, z: 1.2 },
          rotation: { x: 0, y: 0, z: 0 },
          draggable: true,
          positionSource: 'auto',
        });
        
        // SR speaker (right) — preserve placement state, but keep model synced to current surround model
        nextExtras.push(existingSR ? {
          ...existingSR,
          model: modelKey && modelKey !== 'off' ? modelKey : undefined,
        } : {
          id: `${roleSR.toLowerCase()}-${timeNowMs() + pairIndex * 2 + 1}`,
          role: roleSR,
          model: modelKey && modelKey !== 'off' ? modelKey : undefined,
          position: { x: _computedSrX, y: baseY, z: 1.2 },
          rotation: { x: 0, y: 0, z: 0 },
          draggable: true,
          positionSource: 'auto',
        });
      }
      
      // Build final speaker list
      const nextPlaced = [...nonExtras, ...nextExtras];

      console.log('[EXTRA sync add/check]', {
        nextExtras: nextExtras.map(s => String(s?.role)),
        nextPlaced: nextPlaced.map(s => String(s?.role))
      });
      
      // IDEMPOTENCE CHECK: use speakersShallowEqual for robust comparison
      if (speakersShallowEqual(current, nextPlaced)) {
        if (globalThis.__B44_LOGS) {
          console.log('[ExtraSurrounds] No change detected, skipping update');
        }
        return prev;
      }
      
      return { ...prev, placedSpeakers: nextPlaced };
    });
  }, [isHydrated, isProjectHydrationReady, extraSurroundCount, globalSurroundModel, speakerSystem?.placedSpeakers, roomDims?.widthM, roomDims?.lengthM, setSpeakerSystem]);

  const [splConfig, setSplConfig] = useState(() => {
      const autosaveConfig = __autosavePayload?.splConfig || {};

      // Migration: if old globalPowerW exists but new split powers don't, migrate
      const oldGlobalPower = autosaveConfig.globalPowerW;
      const hasNewPowers = autosaveConfig.lcrW || autosaveConfig.surroundsW || autosaveConfig.overheadsW;

      return {
        // NEW: Independent power controls (migrate from old global if present)
        lcrW: autosaveConfig.lcrW || oldGlobalPower || 100,
        surroundsW: autosaveConfig.surroundsW || oldGlobalPower || 100,
        overheadsW: autosaveConfig.overheadsW || oldGlobalPower || 100,
        // Keep old globalPowerW for backwards compatibility (not used in calculations)
        globalPowerW: oldGlobalPower || 100,
        globalEqHeadroomDb: autosaveConfig.globalEqHeadroomDb || 0,
        radiationMode: autosaveConfig.radiationMode || 'half-space',
        p13Mode: autosaveConfig.p13Mode || 'minimum',
        p14Mode: autosaveConfig.p14Mode || 'minimum',
        perRole: autosaveConfig.perRole || {},
        // Separate L/R and centre heights for center_only soundbar override mode
        lcrHeightM: autosaveConfig.lcrHeightM,
        lcrLRHeightM: autosaveConfig.lcrLRHeightM,
      };
    });

  const getEffectiveSplInputs = useCallback((role) => {
    const roleConfig = splConfig.perRole[role];
    
    // Determine which group power to use based on role
    const canon = String(role || '').toUpperCase();
    let groupPowerW;
    
    if (['FL', 'FC', 'FR', 'L', 'C', 'R'].includes(canon)) {
      groupPowerW = splConfig.lcrW || 100;
    } else if (['SL', 'SR', 'SBL', 'SBR', 'LW', 'RW', 'LS', 'RS', 'LR', 'RR', 'FWL', 'FWR'].includes(canon)) {
      groupPowerW = splConfig.surroundsW || 100;
    } else if (canon.startsWith('T') || canon.startsWith('U')) {
      // Overheads: any role starting with T (TFL, TFR, TML, TMR, etc.) or U (up-firing)
      groupPowerW = splConfig.overheadsW || 100;
    } else {
      // Fallback to LCR power for unknown roles
      groupPowerW = splConfig.lcrW || 100;
    }
    
    if (roleConfig && !roleConfig.useGlobal) {
            return {
              powerW: roleConfig.powerW ?? groupPowerW,
              eqHeadroomDb: roleConfig.eqHeadroomDb ?? splConfig.globalEqHeadroomDb,
              radiationMode: splConfig.radiationMode || 'half-space',
            };
          }

          return {
            powerW: groupPowerW,
            eqHeadroomDb: splConfig.globalEqHeadroomDb,
            radiationMode: splConfig.radiationMode || 'half-space',
          };
  }, [splConfig]);

  const updateGlobalSpl = useCallback((updates) => {
    setSplConfig(prev => ({
      ...prev,
      ...updates
    }));
  }, []);

  const updateRoleSpl = useCallback((role, updates) => {
    setSplConfig(prev => ({
      ...prev,
      perRole: {
        ...prev.perRole,
        [role]: {
          ...(prev.perRole[role] || { useGlobal: true }),
          ...updates
        }
      }
    }));
  }, []);

  const visibleRoles = useMemo(() => {
    // --- B44 VISIBILITY FIX: robust layout + correct rears/wides rules ---
    const layoutRaw =
      speakerSystem?.dolbyLayout ??
      speakerSystem?.dolbyPreset ??
      dolbyLayout ??
      "5.1";

    // layoutRaw may be "9.1.6 Dolby Atmos" OR { layout: "9.1.6" }
    const layoutNorm =
      (typeof layoutRaw === "string" && layoutRaw.trim())
        ? layoutRaw.trim()
        : (layoutRaw && typeof layoutRaw === "object" && typeof layoutRaw.layout === "string" && layoutRaw.layout.trim())
          ? layoutRaw.layout.trim()
          : "5.1";

    // keep only "9.1.6" part
    const layoutKey = layoutNorm.split(" ")[0].split("_")[0];
    const major = parseInt(layoutKey.split(".")[0], 10) || 5;

    // IMPORTANT: one canonical source of truth for 7.x behaviour
    const resolvedSevenBedLayoutType =
      (typeof sevenBedLayoutType === "string" && sevenBedLayoutType)
        ? sevenBedLayoutType
        : (typeof speakerSystem?.sevenBedLayoutType === "string" && speakerSystem.sevenBedLayoutType)
          ? speakerSystem.sevenBedLayoutType
          : "rears";

    const useWidesInsteadOfRears = resolvedSevenBedLayoutType === "wides";

    // 7.x chooses rears OR wides, 9.x+ MUST include BOTH
    const showRears = (major >= 9) || (major === 7 && !useWidesInsteadOfRears);
    const showWides = (major >= 9) || (major === 7 &&  useWidesInsteadOfRears);

    const roles = new Set(["FL", "FC", "FR"]);
    if (major >= 5) { roles.add("SL"); roles.add("SR"); }
    if (showRears) { roles.add("SBL"); roles.add("SBR"); }
    if (showWides) { roles.add("LW"); roles.add("RW"); }

    // Add overhead channels (from original getSpeakerVisibilityFor)
    const heights = parseInt(layoutKey.split(".")[2], 10) || 0;
    if (heights === 2) {
      roles.add("TML");
      roles.add("TMR");
    } else if (heights === 4) {
      roles.add("TFL");
      roles.add("TFR");
      roles.add("TRL");
      roles.add("TRR");
    } else if (heights === 6) {
      roles.add("TFL");
      roles.add("TFR");
      roles.add("TML");
      roles.add("TMR");
      roles.add("TRL");
      roles.add("TRR");
    }

    // Optional debug:
    if (globalThis.__B44_LOGS) {
      console.log("[VIS roles]", { layoutRaw, layoutNorm, layoutKey, major, useWidesInsteadOfRears, showRears, showWides, roles: Array.from(roles) });
    }
    
    return roles;
  }, [dolbyLayout, sevenBedLayoutType, speakerSystem?.dolbyLayout, speakerSystem?.dolbyPreset, speakerSystem?.useWidesInsteadOfRears, speakerSystem?.sevenBedLayoutType]);

  const OVERHEAD_CANON_ROLES = useMemo(() => new Set([
    "TFL", "TFR", "TML", "TMR", "TRL", "TRR",
    "TL", "TR", "TBL", "TBR", "TFC", "TRC", "TBC"
  ]), []);

  const getSpeakerVisibility = useCallback((role, model) => {
    const canon = safeCanonRole(role);

    // Never show LFE
    if (canon.startsWith("LFE")) return false;

    // Overheads must be visible solely based on layout (visibleRoles)
    if (OVERHEAD_CANON_ROLES.has(canon)) {
      return visibleRoles.has(canon);
    }

    // CRITICAL: Extra surrounds (SL2/SR2/SL3/SR3...) are treated as Side Surrounds
    // Check for numbered side surround pattern: SL2+, SR2+
    const extraSurroundPattern = /^(SL|SR)\d+$/;
    const isExtraSurround = extraSurroundPattern.test(canon);

    if (isExtraSurround) {
      // Extra surrounds are visible when base SL/SR are expected by layout
      const isSideSurroundExpected = visibleRoles.has("SL") || visibleRoles.has("SR");
      if (globalThis.__B44_LOGS) {
        console.log("[VIS]", { role, canon, expected: isSideSurroundExpected, reason: "extra surround" });
      }
      return isSideSurroundExpected;
    }

    // For bed channels: if the layout expects this channel, show it even if model is blank
    // This prevents LW/RW and SBL/SBR from vanishing due to model assignment timing
    const isExpectedByLayout = visibleRoles.has(canon);

    if (isExpectedByLayout) {
      // Debug log if enabled
      if (globalThis.__B44_LOGS) {
        console.log("[VIS]", { role, canon, model, expected: true });
      }
      return true;
    }

    // Otherwise keep strict behaviour for non-expected channels
    const modelStr = String(model || "").toLowerCase().trim();
    if (!modelStr || modelStr === "off" || modelStr === "none") {
      if (globalThis.__B44_LOGS) {
        console.log("[VIS]", { role, canon, model, expected: false, reason: "no model" });
      }
      return false;
    }

    if (globalThis.__B44_LOGS) {
      console.log("[VIS]", { role, canon, model, expected: false, reason: "not in layout" });
    }
    return false;
  }, [visibleRoles, OVERHEAD_CANON_ROLES]);

  const isFrozen = useCallback((tab) => !!frozenTabs[tab], [frozenTabs]);
  const freezeTab = useCallback((tab) => {
    setFrozenTabs(prev => ({ ...prev, [tab]: true }));
  }, []);
  const unfreezeTab = useCallback((tab) => {
    setFrozenTabs(prev => ({ ...prev, [tab]: false }));
  }, []);

  const setScreenFrontPlaneM = useCallback((m) => {
    if (!Number.isFinite(m)) return;
    _setScreenFrontPlaneM(prev => {
      const prevRounded = prev ? Math.round(prev * 1000) : null;
      const newRounded = Math.round(m * 1000);
      return prevRounded === newRounded ? prev : m;
    });
  }, []);

  const showToast = useCallback((message, type = 'info') => {
    if (typeof window !== 'undefined' && window.alert) {
      console.log(`Toast [${type}]: ${message}`);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__APPSTATE__ = window.__APPSTATE__ || {};
      window.__APPSTATE__.getEnableFrontWides = () => enableFrontWides;
      window.__APPSTATE__.setEnableFrontWides = (v) => {
        setEnableFrontWides(!!v);
        showToast(v ? 'Front-wide overlay on' : 'Front-wide overlay off', 'info');
      };
      window.__APPSTATE__.p15ConstructionLevel = p15ConstructionLevel;
      window.__APPSTATE__.setP15ConstructionLevel = setP15ConstructionLevel;
    }
  }, [enableFrontWides, showToast, p15ConstructionLevel]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const apply = (map) => {
      const obj = (map && typeof map === "object") ? map : {};
      setScreen((prev) => ({ ...(prev || {}), splModels: obj }));
      try { window.__SPL_MODELS__ = obj; } catch (e) { /* ignore */ }
      
      if (SHOW_DEBUG_LOGS) {
        try {
          window.__APP_DEBUG = window.__APP_DEBUG || [];
          window.__APP_DEBUG.push(`[SPL] Models mapping applied: ${Object.keys(obj).join(", ") || "(empty)"}`);
        } catch (e) { /* ignore */ }
      }
    };

    const onModelsEvent = (e) => {
      const map = (e && e.detail) || {};
      apply(map);
    };

    window.addEventListener("spl:models", onModelsEvent);

    try {
      if (window.__SPL_MODELS__ && typeof window.__SPL_MODELS__ === "object") {
        apply(window.__SPL_MODELS__);
      }
    } catch (e) { /* ignore */ }

    let last = "";
    const timer = window.setInterval(() => {
      try {
        const curr = JSON.stringify(window.__SPL_MODELS__ || {});
        if (curr !== last) {
          last = curr;
          apply(window.__SPL_MODELS__ || {});
        }
      } catch (e) { /* ignore */ }
    }, 750);

    return () => {
      window.removeEventListener("spl:models", onModelsEvent);
      try { window.clearInterval(timer); } catch (e) { /* ignore */ }
    };
  }, []);

  useEffect(() => {
    const screenWidthM = screen.visibleWidthInches * 0.0254;
    const screenThicknessM = 0.05;
    let actualScreenFrontY = 0;

    if (screen.mountMode === "floating") {
      actualScreenFrontY = screen.floatDepthM || 0;
    } else if (screen.mountMode === "recessed") {
      actualScreenFrontY = 0.15;
    }

    actualScreenFrontY += screen.speakerClearanceM || 0;
    const computedScreenCentreDepthM = actualScreenFrontY + screenThicknessM / 2;
    setScreenCentreDepthM(computedScreenCentreDepthM);
  }, [
    screen.visibleWidthInches,
    screen.aspectRatio,
    screen.mountMode,
    screen.floatDepthM,
    screen.speakerClearanceM,
    roomDims.lengthM,
    speakersEpoch,
    screenWall,
  ]);

  useEffect(() => {
    // OLD RESTORE LOGIC (disabled - now happens in useState initializers)
    const data = loadAutosave();
    if (!data?.payload) {
      setIsHydrated(true);
      return;
    }

    // Only restore if the current state looks "empty"
    const hasAlready = Array.isArray(seatingPositions) && seatingPositions.length > 0;
    const hasSpk =
      Array.isArray(speakerSystem?.placedSpeakers) &&
      speakerSystem.placedSpeakers.length > 0 &&
      speakerSystem.placedSpeakers.every(
        s =>
          s &&
          s.model &&
          s.model !== 'off' &&
          s.position &&
          Number.isFinite(s.position?.x) &&
          Number.isFinite(s.position?.y)
      );

    if (hasAlready || hasSpk) {
      setIsHydrated(true);
      return; // don't stomp a real loaded session
    }

    const p = data.payload;
    if (!isAutosavePayloadValid(p)) {
      setIsHydrated(true);
      return;
    }

    // Apply (use the existing setters)
    try {
      if (p.roomDims) setRoomDims(p.roomDims);
      if (p.dimensions) setDimensions(p.dimensions);
      if (p.seatingPositions) {
        const dims = p.roomDims || p.roomDimensions || roomDims || null;
        const normalised = normaliseSeatingPositions(p.seatingPositions, dims);
        setSeatingPositions(enforceOnePrimary(normalised, dims, p.mlpBasis || "front"));
      }
      if (p.screen) setScreen(p.screen);

      // Restore speaker/config state from autosave for all modes (saved project and free-run).
      if (p.speakerSystem) setSpeakerSystem(p.speakerSystem);
      // Restore sub configs explicitly (even if count = 0)
      if (Object.prototype.hasOwnProperty.call(p, "frontSubsCfg")) {
        setFrontSubsCfg(p.frontSubsCfg || {
          model: "SUB2-12",
          count: 0,
          positions: [],
          tuning: [],
          orientation: "vertical",
          placementMode: "default"
        });
      }
      if (Object.prototype.hasOwnProperty.call(p, "rearSubsCfg")) {
        setRearSubsCfg(p.rearSubsCfg || {
          model: "SUB2-12",
          count: 0,
          positions: [],
          tuning: [],
          orientation: "vertical",
          placementMode: "default"
        });
      }
      if (typeof p.dolbyLayout === "string") setDolbyLayout(p.dolbyLayout);
      if (p.dolbyConfig) setDolbyConfig(p.dolbyConfig);
      if (p.globalSurroundModel) _setGlobalSurroundModel(stripSurroundSuffix(p.globalSurroundModel));
      if (p.overheadGlobalModel) setOverheadGlobalModel(p.overheadGlobalModel);
      if (p.overheadFrontOverride) setOverheadFrontOverride(p.overheadFrontOverride);
      if (p.overheadMidOverride) setOverheadMidOverride(p.overheadMidOverride);
      if (p.overheadRearOverride) setOverheadRearOverride(p.overheadRearOverride);
      if (typeof p.useFrontGlobal === "boolean") setUseFrontGlobal(p.useFrontGlobal);
      if (typeof p.useMidGlobal === "boolean") setUseMidGlobal(p.useMidGlobal);
      if (typeof p.useRearGlobal === "boolean") setUseRearGlobal(p.useRearGlobal);
      if (typeof p.aimFrontWidesAtMLP === "boolean") setAimFrontWidesAtMLP(p.aimFrontWidesAtMLP);
      if (typeof p.aimSideSurroundsAtMLP === "boolean") setAimSideSurroundsAtMLP(p.aimSideSurroundsAtMLP);
      if (typeof p.aimRearSurroundsAtMLP === "boolean") setAimRearSurroundsAtMLP(p.aimRearSurroundsAtMLP);
      if (typeof p.lcrAimMode === "string") setLcrAimMode(p.lcrAimMode);
      if (typeof p.sevenBedLayoutType === "string") setSevenBedLayoutType(p.sevenBedLayoutType);
      if (typeof p.extraSurroundCount === "number") _setExtraSurroundCount(p.extraSurroundCount);
      if (Array.isArray(p.rowEarHeights) && p.rowEarHeights.length > 0) setRowEarHeights(p.rowEarHeights);
      if (typeof p.rsp_mode === "string") setRspMode(p.rsp_mode);
      if (p.manual_rsp_y_m !== undefined) setManualRspY_m(typeof p.manual_rsp_y_m === "number" ? p.manual_rsp_y_m : null);

      setAutosaveMeta(getAutosaveMeta());
      
      // Derived geometry must always be recalculated live
      setScreenFrontPlaneM(null);
      setMlpY_m(null);
      setRowCentersM([]);
    } catch {
      // never crash
    } finally {
      setIsHydrated(true);
    }
  }, []);

  // --- Autosave: Debounced save on change ---
  const autosaveTimerRef = useRef(null);

  useEffect(() => {
    // Build payload (ONLY what we need to restore the room session)
    const payload = {
      roomDims,
      dimensions,
      seatingPositions,
      speakerSystem,
      // Ensure sub configs are always serialised explicitly
      frontSubsCfg: {
        ...frontSubsCfg,
        model: frontSubsCfg?.model || "SUB2-12",
        count: Number(frontSubsCfg?.count) || 0,
        positions: Array.isArray(frontSubsCfg?.positions) ? frontSubsCfg.positions : [],
        tuning: Array.isArray(frontSubsCfg?.tuning) ? frontSubsCfg.tuning : [],
        orientation: frontSubsCfg?.orientation || "vertical",
        placementMode: frontSubsCfg?.placementMode || "default"
      },
      rearSubsCfg: {
        ...rearSubsCfg,
        model: rearSubsCfg?.model || "SUB2-12",
        count: Number(rearSubsCfg?.count) || 0,
        positions: Array.isArray(rearSubsCfg?.positions) ? rearSubsCfg.positions : [],
        tuning: Array.isArray(rearSubsCfg?.tuning) ? rearSubsCfg.tuning : [],
        orientation: rearSubsCfg?.orientation || "vertical",
        placementMode: rearSubsCfg?.placementMode || "default"
      },
      dolbyLayout: typeof dolbyLayout === "string" ? dolbyLayout : undefined,
      dolbyConfig,
      screen,
      screenHeight,
      seatingRows,
      seatsPerRow,
      seatsPerRowByRow,
      seatSpacing,
      rowSpacingM,
      mlpBasis,
      autoSeatByRP23,
      seatingBlockOffset,
      rowEarHeights,
      aimFrontWidesAtMLP,
      aimSideSurroundsAtMLP,
      aimRearSurroundsAtMLP,
      lcrAimMode,
      liveImpactMode,
      globalSurroundModel,
      sevenBedLayoutType,
      overheadGlobalModel,
      overheadFrontOverride,
      overheadMidOverride,
      overheadRearOverride,
      useFrontGlobal,
      useMidGlobal,
      useRearGlobal,
      seatMetricsById,
      p15ConstructionLevel,
      p21EarlyReflectionPreset,
      splConfig,
      mlpOverride,
      extraSurroundCount,
      rsp_mode: rspMode,
      manual_rsp_y_m: manualRspY_m,
      // screenFrontPlaneM, mlpY_m, rowCentersM intentionally excluded — always recalculated from live inputs
      roomElements: normaliseRoomElements(roomElements),
      };

      if (!isAutosavePayloadValid(payload)) return;

    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);

    autosaveTimerRef.current = setTimeout(() => {
      saveAutosave(payload);
      setAutosaveMeta(getAutosaveMeta());
    }, 500);

    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
    }, [
    roomDims,
    dimensions,
    seatingPositions,
    speakerSystem,
    frontSubsCfg,
    rearSubsCfg,
    dolbyLayout,
    dolbyConfig,
    screen,
    screenHeight,
    seatingRows,
    seatsPerRow,
    seatsPerRowByRow,
    seatSpacing,
    rowSpacingM,
    mlpBasis,
    autoSeatByRP23,
    seatingBlockOffset,
    rowEarHeights,
    aimFrontWidesAtMLP,
    aimSideSurroundsAtMLP,
    aimRearSurroundsAtMLP,
    globalSurroundModel,
    overheadGlobalModel,
    overheadFrontOverride,
    overheadMidOverride,
    overheadRearOverride,
    useFrontGlobal,
    useMidGlobal,
    useRearGlobal,
    seatMetricsById,
    p15ConstructionLevel,
    p21EarlyReflectionPreset,
    splConfig,
    mlpOverride,
    extraSurroundCount,
    rspMode,
    manualRspY_m,
    roomElements
    ]);

  const restoreAutosave = useCallback(() => {
    const data = loadAutosave();
    if (!data?.payload) return false;
    const p = data.payload;
    if (!isAutosavePayloadValid(p)) return false;

    try {
      if (p.roomDims) setRoomDims(p.roomDims);
      if (p.dimensions) setDimensions(p.dimensions);
      if (p.seatingPositions) {
        const dims = p.roomDims || p.roomDimensions || roomDims || null;
        const normalised = normaliseSeatingPositions(p.seatingPositions, dims);
        setSeatingPositions(enforceOnePrimary(normalised, dims, p.mlpBasis || "front"));
      }
      if (p.speakerSystem) setSpeakerSystem(p.speakerSystem);
      // Restore sub configs explicitly (even if count = 0)
      if (Object.prototype.hasOwnProperty.call(p, "frontSubsCfg")) {
        setFrontSubsCfg(p.frontSubsCfg || {
          model: "SUB2-12",
          count: 0,
          positions: [],
          tuning: [],
          orientation: "vertical",
          placementMode: "default"
        });
      }

      if (Object.prototype.hasOwnProperty.call(p, "rearSubsCfg")) {
        setRearSubsCfg(p.rearSubsCfg || {
          model: "SUB2-12",
          count: 0,
          positions: [],
          tuning: [],
          orientation: "vertical",
          placementMode: "default"
        });
      }
      if (typeof p.dolbyLayout === "string") setDolbyLayout(p.dolbyLayout);
      if (p.dolbyConfig) setDolbyConfig(p.dolbyConfig);
      if (p.screen) setScreen(p.screen);
      if (p.splConfig && typeof p.splConfig === "object") setSplConfig(p.splConfig);
      if (typeof p.screenHeight === "number") setScreenHeight(p.screenHeight);
      if (typeof p.seatingRows === "number") setSeatingRows(p.seatingRows);
      if (typeof p.seatsPerRow === "number") setSeatsPerRow(p.seatsPerRow);
      if (Array.isArray(p.seatsPerRowByRow)) setSeatsPerRowByRow(p.seatsPerRowByRow);
      if (typeof p.seatSpacing === "number") setSeatSpacing(p.seatSpacing);
      if (typeof p.rowSpacingM === "number") setRowSpacingM(p.rowSpacingM);
      if (typeof p.mlpBasis === "string") setMlpBasis(p.mlpBasis);
      if (typeof p.autoSeatByRP23 === "boolean") setAutoSeatByRP23(p.autoSeatByRP23);
      if (typeof p.seatingBlockOffset === "number") setSeatingBlockOffset(p.seatingBlockOffset);
      if (Array.isArray(p.roomElements)) setRoomElements(normaliseRoomElements(p.roomElements));
      if (p.overlays) setOverlays(p.overlays);
      if (Array.isArray(p.rowEarHeights) && p.rowEarHeights.length > 0) setRowEarHeights(p.rowEarHeights);

      setAutosaveMeta(getAutosaveMeta());
      return true;
    } catch {
      return false;
    }
  }, []);

  const clearAutosaveNow = useCallback(() => {
    clearAutosaveStorage();
    setAutosaveMeta(null);
  }, []);

  const saveWorkingCopyNow = useCallback(() => {
    const payload = {
      roomDims,
      dimensions,
      seatingPositions,
      speakerSystem,
      // Ensure sub configs are always serialised explicitly
      frontSubsCfg: {
        ...frontSubsCfg,
        model: frontSubsCfg?.model || "SUB2-12",
        count: Number(frontSubsCfg?.count) || 0,
        positions: Array.isArray(frontSubsCfg?.positions) ? frontSubsCfg.positions : [],
        tuning: Array.isArray(frontSubsCfg?.tuning) ? frontSubsCfg.tuning : [],
        orientation: frontSubsCfg?.orientation || "vertical",
        placementMode: frontSubsCfg?.placementMode || "default"
      },
      rearSubsCfg: {
        ...rearSubsCfg,
        model: rearSubsCfg?.model || "SUB2-12",
        count: Number(rearSubsCfg?.count) || 0,
        positions: Array.isArray(rearSubsCfg?.positions) ? rearSubsCfg.positions : [],
        tuning: Array.isArray(rearSubsCfg?.tuning) ? rearSubsCfg.tuning : [],
        orientation: rearSubsCfg?.orientation || "vertical",
        placementMode: rearSubsCfg?.placementMode || "default"
      },
      dolbyLayout: typeof dolbyLayout === "string" ? dolbyLayout : undefined,
      dolbyConfig,
      screen,
      screenHeight,
      seatingRows,
      seatsPerRow,
      seatsPerRowByRow,
      seatSpacing,
      rowSpacingM,
      mlpBasis,
      autoSeatByRP23,
      seatingBlockOffset,
      rowEarHeights,
      aimFrontWidesAtMLP,
      aimSideSurroundsAtMLP,
      aimRearSurroundsAtMLP,
      lcrAimMode,
      globalSurroundModel,
      sevenBedLayoutType,
      overheadGlobalModel,
      overheadFrontOverride,
      overheadMidOverride,
      overheadRearOverride,
      useFrontGlobal,
      useMidGlobal,
      useRearGlobal,
      splConfig
    };
    try {
      saveAutosave(payload);
    } catch (e) {
      console.warn("Autosave failed:", e);
    }
  }, [roomDims, dimensions, seatingPositions, speakerSystem, frontSubsCfg, rearSubsCfg, dolbyLayout, dolbyConfig, screen, screenHeight, seatingRows, seatsPerRow, seatsPerRowByRow, seatSpacing, rowSpacingM, mlpBasis, autoSeatByRP23, seatingBlockOffset, aimFrontWidesAtMLP, aimSideSurroundsAtMLP, aimRearSurroundsAtMLP, globalSurroundModel, overheadGlobalModel, overheadFrontOverride, overheadMidOverride, overheadRearOverride, useFrontGlobal, useMidGlobal, useRearGlobal, splConfig]);

  const clearWorkingCopy = useCallback(() => {
    try {
      clearAutosaveStorage();
    } catch (e) {
      console.warn("Clear autosave failed:", e);
    }
  }, []);

  const setPerSeatMetricsForSeat = useCallback((seatId, data) => {
    if (!seatId || !data) return;
    setPerSeatMetrics(prev => ({
      ...prev,
      [seatId]: data
    }));
  }, []);

  // RESET TO DEFAULTS - Single source of truth for clean reset
  const resetRoomDesignerToDefaults = useCallback(() => {
    // 1. Clear autosave/persistence
    try {
      clearAutosaveStorage();
      setAutosaveMeta(null);
    } catch (e) {
      console.warn("Failed to clear autosave:", e);
    }

    // 2. Reset all state to original defaults
    // Room dimensions
    setRoomDims({
      widthM: 4.5,
      lengthM: 6.0,
      heightM: 2.4,
      width: 4.5,
      length: 6.0,
      height: 2.4
    });

    // Screen
    setScreen({
      visibleWidthInches: 100,
      aspectRatio: "16:9",
      mountMode: "floating",
      floatDepthM: 0.2,
      showScreenPlane: false,
      showCavity: false,
      speakerClearanceM: 0.02,
      heightFromFloorM: 0.5
    });

    // Seating (will rebuild from these values)
    setSeatingRows(1);
    setSeatsPerRow(3);
    setSeatsPerRowByRow([]);
    setSeatSpacing(0.8);
    setRowSpacingM(1.8);
    setSeatingBlockOffset(0);
    setMlpBasis("front");
    setAutoSeatByRP23(true);

    // Clear seating positions (will rebuild from row config)
    setSeatingPositions([]);
    
    // Clear MLP override
    setMlpOverride(null);

    // Extra Surrounds
    _setExtraSurroundCount(0);

    // Speaker system
    _setSpeakerSystem({
      placedSpeakers: [],
      lastUpdated: timeNowMs()
    });

    // Subs
    setFrontSubsCfg({
      model: "SUB2-12",
      count: 0,
      positions: [],
      tuning: [],
      orientation: "vertical",
      placementMode: "default"
    });
    setRearSubsCfg({
      model: "SUB2-12",
      count: 0,
      positions: [],
      tuning: [],
      orientation: "vertical",
      placementMode: "default"
    });

    // Layout/Config
    setDolbyLayout("5.1");
    _setDolbyConfig("5.1");
    setSevenBedLayoutType("rears");

    // Aim toggles
    setAimFrontWidesAtMLP(false);
    setAimSideSurroundsAtMLP(false);
    setAimRearSurroundsAtMLP(false);

    // Overhead config
    _setGlobalSurroundModel(null);
    setOverheadGlobalModel(null);
    setOverheadFrontOverride(null);
    setOverheadMidOverride(null);
    setOverheadRearOverride(null);
    setUseFrontGlobal(true);
    setUseMidGlobal(true);
    setUseRearGlobal(true);

    // Overlays
    setOverlays({
      LCR: false,
      FRONT_WIDE: false,
      SIDE_SURROUND: false,
      REAR_SURROUND: false,
      OVERHEADS_2: false,
      OVERHEADS_4: false,
      OVERHEADS_6: false,
      RP22_ANGLES: false,
      enableDolbyZones: false,
      ROOM_DIMS: false
    });

    // Room elements
    setRoomElements([]);

    // SPL Config
    setSplConfig({
      globalPowerW: 100,
      globalEqHeadroomDb: 0,
      radiationMode: 'half-space',
      p13Mode: 'minimum',
      p14Mode: 'minimum',
      perRole: {}
    });

    // Per-seat metrics
    setPerSeatMetrics({});

    // RSP state
    resetRspState();

    // 3. Increment reset epoch to force rebuild
    setRoomResetEpoch(prev => prev + 1);

    if (globalThis.__B44_LOGS) {
      console.log('[AppState] Reset to defaults complete, epoch:', roomResetEpoch + 1);
    }
  }, []);

  const value = useMemo(() => {
    return {
    dimensions, setDimensions, 
    roomDims, setRoomDims,
    setRoomWidthM, setRoomLengthM, setRoomHeightM,
    screen, setScreen, screenHeight, setScreenHeight,
    screenWall, setScreenWall, dolbyConfig, setDolbyConfig, dolbyLayout, setDolbyLayout,
    seededChannels, setSeededChannels, sevenBedLayoutType, setSevenBedLayoutType,
    seatingPositions, setSeatingPositions, 
    baselineSeatingPositions, setBaselineSeatingPositions,
    seatingRows, setSeatingRows,
    seatsPerRow, setSeatsPerRow,
    seatsPerRowByRow, setSeatsPerRowByRow,
    seatingBlockOffset, setSeatingBlockOffset,
    seatSpacing, setSeatSpacing, 
    rowSpacingM, setRowSpacingM,
    mlpBasis, setMlpBasis, autoSeatByRP23, setAutoSeatByRP23,
    rowEarHeights, setRowEarHeights,
    roomElements, setRoomElements, subwoofers, setSubwoofers,
    frontSubsCfg, setFrontSubsCfg, rearSubsCfg, setRearSubsCfg,
    subWarnings, setSubWarnings, 
    aimAtMLP, setAimAtMLP, overheadOffsetM, setOverheadOffsetM,
    overheadMode, setOverheadMode, rowTarget, setRowTarget,
    overlays, setOverlays, speakerSystem, setSpeakerSystem,
    speakersEpoch,
    enableLayoutSPLWidget, setEnableLayoutSPLWidget,
    enableFrontWides, setEnableFrontWides,
    useFrontWidesInsteadOfRear, setUseFrontWidesInsteadOfRear,
    useWidesInsteadOfRears, setUseWidesInsteadOfRears,
    showRoomModesOverlay, setShowRoomModesOverlay,
    DBG_FW, frozenTabs, isFrozen, freezeTab, unfreezeTab, showToast,
    screenCentreDepthM, setScreenCentreDepthM,
    screenFrontPlaneM, setScreenFrontPlaneM,
    screenPlaneLocked, setScreenPlaneLocked,
    lockedScreenFrontPlaneM, setLockedScreenFrontPlaneM,
    mlpY_m, setMlpY_m,
    rowCentersM, setRowCentersM,
    overheadGlobalModel, setOverheadGlobalModel,
    overheadFrontOverride, setOverheadFrontOverride,
    overheadMidOverride, setOverheadMidOverride,
    overheadRearOverride, setOverheadRearOverride,
    useFrontGlobal, setUseFrontGlobal,
    useMidGlobal, setUseMidGlobal,
    useRearGlobal, setUseRearGlobal,
    aimFrontWidesAtMLP, setAimFrontWidesAtMLP,
    aimSideSurroundsAtMLP, setAimSideSurroundsAtMLP,
    aimRearSurroundsAtMLP, setAimRearSurroundsAtMLP,
    lcrAimMode, setLcrAimMode,
    splConfig,
    setSplConfig,
    getEffectiveSplInputs,
    updateGlobalSpl,
    updateRoleSpl,
    getSpeakerVisibility,
    visibleRoles, // export for RV
    autosaveMeta,
    restoreAutosave,
    clearAutosave: clearAutosaveNow,
    saveWorkingCopyNow,
    clearWorkingCopy,
    globalSurroundModel,
    setGlobalSurroundModel,
    isHydrated,
    isProjectHydrationReady,
    setProjectHydrationReady,
    perSeatMetrics,
    setPerSeatMetricsForSeat,
    seatMetricsById,
    roomResetEpoch,
    resetRoomDesignerToDefaults,
    p15ConstructionLevel,
    setP15ConstructionLevelSafe,
    p21EarlyReflectionPreset,
    setP21EarlyReflectionPresetSafe,
    designEqEnabled,
    setDesignEqEnabled: setDesignEqEnabledSafe,
    mlpOverride,
    setMlpOverride,
    clearMlpOverride,
    extraSurroundCount,
    setExtraSurroundCount,
    mlp,
    seatSnapshotBySeatId,
    setSeatSnapshotBySeatId,
    p12Mode,
    setP12Mode,
    p12Level,
    setP12Level,
    rspMode,
    setRspMode,
    manualRspY_m,
    setManualRspY_m,
    resetRspState,
    };
  }, [
    dimensions, setDimensions,
    roomDims, setRoomDims,
    setRoomWidthM, setRoomLengthM, setRoomHeightM,
    screen, setScreen, 
    screenHeight, setScreenHeight,
    screenWall, setScreenWall, dolbyConfig, setDolbyConfig, 
    dolbyLayout, setDolbyLayout,
    seededChannels, setSeededChannels, sevenBedLayoutType, setSevenBedLayoutType,
    seatingPositions, setSeatingPositions, 
    baselineSeatingPositions, setBaselineSeatingPositions,
    seatingRows, setSeatingRows,
    seatsPerRow, setSeatsPerRow,
    seatsPerRowByRow, setSeatsPerRowByRow,
    seatingBlockOffset, setSeatingBlockOffset,
    seatSpacing, setSeatSpacing, 
    rowSpacingM, setRowSpacingM,
    mlpBasis, setMlpBasis, autoSeatByRP23, setAutoSeatByRP23,
    rowEarHeights, setRowEarHeights,
    roomElements, setRoomElements, subwoofers, setSubwoofers,
    frontSubsCfg, setFrontSubsCfg, rearSubsCfg, setRearSubsCfg,
    subWarnings, setSubWarnings, 
    aimAtMLP, setAimAtMLP, overheadOffsetM, setOverheadOffsetM,
    overheadMode, setOverheadMode, rowTarget, setRowTarget,
    overlays, setOverlays, speakerSystem, setSpeakerSystem, 
    speakersEpoch,
    enableLayoutSPLWidget, setEnableLayoutSPLWidget,
    enableFrontWides, setEnableFrontWides,
    useFrontWidesInsteadOfRear, setUseFrontWidesInsteadOfRear,
    useWidesInsteadOfRears, setUseWidesInsteadOfRears,
    showRoomModesOverlay, setShowRoomModesOverlay,
    DBG_FW, frozenTabs, isFrozen, freezeTab, unfreezeTab, showToast,
    screenCentreDepthM,
    screenFrontPlaneM, setScreenFrontPlaneM,
    screenPlaneLocked, setScreenPlaneLocked,
    lockedScreenFrontPlaneM, setLockedScreenFrontPlaneM,
    mlp,
    mlpY_m, setMlpY_m,
    rowCentersM, setRowCentersM,
    overheadGlobalModel, setOverheadGlobalModel,
    overheadFrontOverride, setOverheadFrontOverride,
    overheadMidOverride, setOverheadMidOverride,
    overheadRearOverride, setOverheadRearOverride,
    useFrontGlobal, setUseFrontGlobal,
    useMidGlobal, setUseMidGlobal,
    useRearGlobal, setUseRearGlobal,
    aimFrontWidesAtMLP, setAimFrontWidesAtMLP,
    aimSideSurroundsAtMLP, setAimSideSurroundsAtMLP,
    aimRearSurroundsAtMLP, setAimRearSurroundsAtMLP,
    lcrAimMode,
    setLcrAimMode,
    liveImpactMode,
    setLiveImpactMode,
    splConfig,
    getEffectiveSplInputs,
    updateGlobalSpl,
    updateRoleSpl,
    getSpeakerVisibility,
    visibleRoles,
    autosaveMeta,
    restoreAutosave,
    clearAutosaveNow,
    saveWorkingCopyNow,
    clearWorkingCopy,
    globalSurroundModel,
    setGlobalSurroundModel,
    isHydrated,
    isProjectHydrationReady,
    perSeatMetrics,
    setPerSeatMetricsForSeat,
    seatMetricsById,
    roomResetEpoch,
    resetRoomDesignerToDefaults,
    p15ConstructionLevel,
    setP15ConstructionLevelSafe,
    p21EarlyReflectionPreset,
    setP21EarlyReflectionPresetSafe,
    designEqEnabled,
    setDesignEqEnabledSafe,
    mlpOverride,
    setMlpOverride,
    clearMlpOverride,
    extraSurroundCount,
    setExtraSurroundCount,
    seatSnapshotBySeatId,
    p12Mode,
    setP12Mode,
    p12Level,
    setP12Level,
    rspMode,
    setRspMode,
    manualRspY_m,
    setManualRspY_m,
    resetRspState,
  ]);

  value.setP21EarlyReflectionPreset = setP21EarlyReflectionPresetSafe;

  return value;
}

export function AppStateProvider({ children }) {
  const state = useDesignerState();
  return (
    <AppStateContext.Provider value={state}>
      {children}
    </AppStateContext.Provider>
  );
}

export default AppStateProvider;

export function useScreenFrontPlaneY() {
  const { screen, screenCentreDepthM } = useAppState() || {};
  const SCREEN_HALF_THICKNESS_M = 0.025;

  if (screen?.mountMode === 'floating' && Number.isFinite(screen?.floatDepthM)) {
    return screen.floatDepthM;
  }
  
  if (Number.isFinite(screenCentreDepthM)) {
    return Math.max(0, screenCentreDepthM - SCREEN_HALF_THICKNESS_M);
  }
  
  return 0;
}