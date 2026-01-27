import React, { createContext, useContext, useMemo, useState, useEffect, useRef, useCallback } from "react";
import { timeNowMs } from "@/components/utils/timeNow";
import { safeTable } from '@/components/utils/safeLog';
import { SHOW_DEBUG_LOGS } from '@/components/utils/diagnostics';
import { getCanonicalRole } from "@/components/utils/surroundRoleMap";
import { loadAutosave, saveAutosave, clearAutosave as clearAutosaveStorage, getAutosaveMeta, isAutosavePayloadValid } from "@/components/utils/sessionAutosave";
import { computeMLPAndPrimary } from "@/components/utils/computeMLPAndPrimary";

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
// --- END ATMOS PROTECTION HELPERS ---

// --- SINGLE SOURCE OF TRUTH FOR VISIBILITY -----------------------------
// Simple, explicit visibility rules for bed-layer channels + overhead channels
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
    if (!Number.isFinite(newVal)) return;
    setRoomDims(d => {
      if (Math.abs((d?.widthM ?? 0) - newVal) < 0.001) return d;
      return { ...d, widthM: newVal };
    });
  }, []);
  
  const setRoomLengthM = useCallback((v) => {
    const newVal = Number(v);
    if (!Number.isFinite(newVal)) return;
    setRoomDims(d => {
      if (Math.abs((d?.lengthM ?? 0) - newVal) < 0.001) return d;
      return { ...d, lengthM: newVal };
    });
  }, []);
  
  const setRoomHeightM = useCallback((v) => {
    const newVal = Number(v);
    if (!Number.isFinite(newVal)) return;
    setRoomDims(d => {
      if (Math.abs((d?.heightM ?? 0) - newVal) < 0.001) return d;
      return { ...d, heightM: newVal };
    });
  }, []);

  const [dimensions, setDimensions] = useState({}); 

  const [screen, setScreen] = useState(() => (
    (__autosavePayload && __autosavePayload.screen) ? __autosavePayload.screen : {
      visibleWidthInches: 100, aspectRatio: "16:9", mountMode: "baffle",
      floatDepthM: 0, showScreenPlane: false, showCavity: false, speakerClearanceM: 0.02,
    }
  ));
  const [screenHeight, setScreenHeight] = useState(() => (
    (__autosavePayload && typeof __autosavePayload.screenHeight === "number") ? __autosavePayload.screenHeight : 0.5
  ));
  const [screenWallState, _setScreenWall] = useState("front");
  const setScreenWall = useCallback(() => _setScreenWall("front"), []);
  const screenWall = screenWallState;

  const [dolbyConfig, _setDolbyConfig] = useState(() => (
    (__autosavePayload && typeof __autosavePayload.dolbyConfig === "string") ? __autosavePayload.dolbyConfig : "5.1"
  ));
  const [dolbyLayout, setDolbyLayout] = useState(() => (
    (__autosavePayload && typeof __autosavePayload.dolbyLayout === "string") ? __autosavePayload.dolbyLayout : "5.1"
  ));
  const setDolbyConfig = useCallback((v) => {
    const p = v || "5.1";
    _setDolbyConfig(p);
    setDolbyLayout(p);
  }, []);

  const [seededChannels, setSeededChannels] = useState([]);
  const [sevenBedLayoutType, setSevenBedLayoutType] = useState('rears');
  const [seatingPositions, setSeatingPositions] = useState(() => (
    (__autosavePayload && Array.isArray(__autosavePayload.seatingPositions)) ? __autosavePayload.seatingPositions : []
  ));
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
  const [autoSeatByRP23, setAutoSeatByRP23] = useState(() => (
    (__autosavePayload && typeof __autosavePayload.autoSeatByRP23 === "boolean") ? __autosavePayload.autoSeatByRP23 : true
  ));
  const [roomElements, setRoomElements] = useState([]);
  const [subwoofers, setSubwoofers] = useState([]);
  const [frontSubsCfg, setFrontSubsCfg] = useState(() => (
    (__autosavePayload && __autosavePayload.frontSubsCfg) ? __autosavePayload.frontSubsCfg : {
      model: "SUB2-12",
      count: 0,
      positions: [],
      tuning: []
    }
  ));
  const [rearSubsCfg, setRearSubsCfg] = useState(() => (
    (__autosavePayload && __autosavePayload.rearSubsCfg) ? __autosavePayload.rearSubsCfg : {
      model: "SUB2-12",
      count: 0,
      positions: [],
      tuning: []
    }
  ));
  const [subWarnings, setSubWarnings] = useState({ front: [], rear: [] });
  const [aimAtMLP, setAimAtMLP] = useState(true);
  const [overheadOffsetM, setOverheadOffsetM] = useState(0);
  const [overheadMode, setOverheadMode] = useState("optimised");
  const [rowTarget, setRowTarget] = useState("front");
  
  const [overlays, setOverlays] = useState({
    LCR: false, FRONT_WIDE: false, SIDE_SURROUND: false, REAR_SURROUND: false,
    OVERHEADS_2: false, OVERHEADS_4: false, OVERHEADS_6: false, RP22_ANGLES: false,
    enableDolbyZones: false,
  });

  const [speakerSystem, _setSpeakerSystem] = useState(() => (
    (__autosavePayload && __autosavePayload.speakerSystem) ? __autosavePayload.speakerSystem : { placedSpeakers: [], lastUpdated: timeNowMs() }
  ));
  const [speakersEpoch, setSpeakersEpoch] = useState(0);
  const [enableLayoutSPLWidget, setEnableLayoutSPLWidget] = useState(true);
  
  const [enableFrontWides, setEnableFrontWides] = useState(false);
  const [useFrontWidesInsteadOfRear, setUseFrontWidesInsteadOfRear] = useState(false);
  const [useWidesInsteadOfRears, setUseWidesInsteadOfRears] = useState(false);
  
  const DBG_FW = typeof window !== 'undefined' && window.DBG_FW;

  const [frozenTabs, setFrozenTabs] = useState({
    room: false, screen: false, seating: false, speakers: false,
    elements: false, bass: false, report: false,
  });

  const [screenCentreDepthM, setScreenCentreDepthM] = useState(null);
  const [screenFrontPlaneM, _setScreenFrontPlaneM] = useState(null);
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
    (__autosavePayload && __autosavePayload.overheadGlobalModel) ? __autosavePayload.overheadGlobalModel : null
  ));
  const [overheadFrontOverride, setOverheadFrontOverride] = useState(() => (
    (__autosavePayload && __autosavePayload.overheadFrontOverride) ? __autosavePayload.overheadFrontOverride : null
  ));
  const [overheadMidOverride, setOverheadMidOverride] = useState(() => (
    (__autosavePayload && __autosavePayload.overheadMidOverride) ? __autosavePayload.overheadMidOverride : null
  ));
  const [overheadRearOverride, setOverheadRearOverride] = useState(() => (
    (__autosavePayload && __autosavePayload.overheadRearOverride) ? __autosavePayload.overheadRearOverride : null
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

  const [autosaveMeta, setAutosaveMeta] = useState(null);
  const [globalSurroundModel, _setGlobalSurroundModel] = useState(() => (
    (__autosavePayload && __autosavePayload.globalSurroundModel) ? stripSurroundSuffix(__autosavePayload.globalSurroundModel) : null
  ));
  const [isHydrated, setIsHydrated] = useState(true);
  const [perSeatMetrics, setPerSeatMetrics] = useState({});
  const [roomResetEpoch, setRoomResetEpoch] = useState(0);
  const [seatMetricsById, setSeatMetricsById] = useState(() => (
    (__autosavePayload && __autosavePayload.seatMetricsById) ? __autosavePayload.seatMetricsById : {}
  ));

  const [p15ConstructionLevel, setP15ConstructionLevel] = useState(() => (
    (__autosavePayload && __autosavePayload.p15ConstructionLevel) ? __autosavePayload.p15ConstructionLevel : 'standard'
  ));

  const setP15ConstructionLevelSafe = useCallback((next) => {
    const allowed = new Set(["standard", "purpose-built", "reference", "studio"]);
    const v = allowed.has(next) ? next : "standard";
    setP15ConstructionLevel(v);
  }, []);

  const [p21EarlyReflectionPreset, setP21EarlyReflectionPreset] = useState(() => (
    (__autosavePayload && __autosavePayload.p21EarlyReflectionPreset) ? __autosavePayload.p21EarlyReflectionPreset : 'l2'
  ));

  const setP21EarlyReflectionPresetSafe = useCallback((next) => {
    const allowed = new Set(["l1", "l2", "l3", "l4"]);
    const v = allowed.has(next) ? next : "l2";
    setP21EarlyReflectionPreset(v);
  }, []);

  // Compute MLP point from seating positions (stable, always available when seats exist)
  const mlp = useMemo(() => {
    if (!Array.isArray(seatingPositions) || seatingPositions.length === 0) return null;
    
    const widthM = Number(roomDims?.widthM) || 4.5;
    const lengthM = Number(roomDims?.lengthM) || 6.0;
    
    try {
      const { primary } = computeMLPAndPrimary(
        seatingPositions,
        widthM,
        lengthM,
        mlpBasis
      );
      
      if (!primary || !Number.isFinite(primary.y)) return null;
      
      return {
        x: widthM / 2, // MLP is always centered on room width
        y: primary.y,
        z: primary.z || 1.2,
      };
    } catch (e) {
      console.warn('[AppState] MLP computation failed:', e);
      return null;
    }
  }, [seatingPositions, roomDims?.widthM, roomDims?.lengthM, mlpBasis]);

  const setGlobalSurroundModel = useCallback((model) => {
    if (globalThis.__B44_LOGS) console.log('[AppState] setGlobalSurroundModel', { model });
    _setGlobalSurroundModel(model);
  }, []);

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
        perRole: autosaveConfig.perRole || {}
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

  const hasSurroundModelSelected = useMemo(() => {
    if (!splConfig) return false;

    const surroundRoles = ['SL', 'SR', 'SBL', 'SBR', 'LR', 'RR'];

    return surroundRoles.some((role) => {
      const cfg =
        splConfig.perRole?.[role] ||
        splConfig.byRole?.[role] ||
        splConfig[role] ||
        splConfig.surround ||
        splConfig.surroundModel;

      const model = cfg && (cfg.model || cfg);

      return !!(
        model &&
        typeof model === 'string' &&
        model.toUpperCase() !== 'NONE'
      );
    });
  }, [splConfig]);

  // --- CANONICAL VISIBILITY HELPER (used everywhere) ---------------------
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

    // IMPORTANT: one source of truth for 7.x behaviour
    const useWidesInsteadOfRears =
      !!speakerSystem?.useWidesInsteadOfRears ||
      speakerSystem?.sevenBedLayoutType === "wides" ||
      sevenBedLayoutType === "wides" ||
      false;

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
      try { window.__SPL_MODELS__ = obj; } catch (e) {}
      
      if (SHOW_DEBUG_LOGS) {
        try {
          window.__APP_DEBUG = window.__APP_DEBUG || [];
          window.__APP_DEBUG.push(`[SPL] Models mapping applied: ${Object.keys(obj).join(", ") || "(empty)"}`);
        } catch (e) {}
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
    } catch (e) {}

    let last = "";
    const timer = window.setInterval(() => {
      try {
        const curr = JSON.stringify(window.__SPL_MODELS__ || {});
        if (curr !== last) {
          last = curr;
          apply(window.__SPL_MODELS__ || {});
        }
      } catch (e) {}
    }, 750);

    return () => {
      window.removeEventListener("spl:models", onModelsEvent);
      try { window.clearInterval(timer); } catch (e) {}
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

  // --- Autosave: Restore on mount ---
  useEffect(() => {
    // OLD RESTORE LOGIC (disabled - now happens in useState initializers)
    const data = loadAutosave();
    if (!data?.payload) {
      setIsHydrated(true);
      return;
    }

    // Only restore if the current state looks "empty"
    const hasAlready = Array.isArray(seatingPositions) && seatingPositions.length > 0;
    const hasSpk = Array.isArray(speakerSystem?.placedSpeakers) && speakerSystem.placedSpeakers.length > 0;

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
      if (p.seatingPositions) setSeatingPositions(p.seatingPositions);
      if (p.speakerSystem) setSpeakerSystem(p.speakerSystem);
      if (p.frontSubsCfg) setFrontSubsCfg(p.frontSubsCfg);
      if (p.rearSubsCfg) setRearSubsCfg(p.rearSubsCfg);
      if (typeof p.dolbyLayout === "string") setDolbyLayout(p.dolbyLayout);
      if (p.dolbyConfig) setDolbyConfig(p.dolbyConfig);
      if (p.screen) setScreen(p.screen);
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

      setAutosaveMeta(getAutosaveMeta());
    } catch {
      // never crash
    } finally {
      setIsHydrated(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      frontSubsCfg,
      rearSubsCfg,
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
      p21EarlyReflectionPreset
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
    p15ConstructionLevel
    ]);

    // --- ALWAYS-SAVE EFFECT (instant working copy on every change) ---
    useEffect(() => {
    const payload = {
      roomDims,
      dimensions,
      seatingPositions,
      speakerSystem,
      frontSubsCfg,
      rearSubsCfg,
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
      p21EarlyReflectionPreset
      };

      try {
      saveAutosave(payload);
      } catch (e) {
      console.warn("Autosave failed:", e);
      }
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
    p15ConstructionLevel
    ]);

    // --- Autosave: Manual restore/clear functions ---
  const restoreAutosave = useCallback(() => {
    const data = loadAutosave();
    if (!data?.payload) return false;
    const p = data.payload;
    if (!isAutosavePayloadValid(p)) return false;

    try {
      if (p.roomDims) setRoomDims(p.roomDims);
      if (p.dimensions) setDimensions(p.dimensions);
      if (p.seatingPositions) setSeatingPositions(p.seatingPositions);
      if (p.speakerSystem) setSpeakerSystem(p.speakerSystem);
      if (p.frontSubsCfg) setFrontSubsCfg(p.frontSubsCfg);
      if (p.rearSubsCfg) setRearSubsCfg(p.rearSubsCfg);
      if (typeof p.dolbyLayout === "string") setDolbyLayout(p.dolbyLayout);
      if (p.dolbyConfig) setDolbyConfig(p.dolbyConfig);
      if (p.screen) setScreen(p.screen);
      if (typeof p.screenHeight === "number") setScreenHeight(p.screenHeight);
      if (typeof p.seatingRows === "number") setSeatingRows(p.seatingRows);
      if (typeof p.seatsPerRow === "number") setSeatsPerRow(p.seatsPerRow);
      if (Array.isArray(p.seatsPerRowByRow)) setSeatsPerRowByRow(p.seatsPerRowByRow);
      if (typeof p.seatSpacing === "number") setSeatSpacing(p.seatSpacing);
      if (typeof p.rowSpacingM === "number") setRowSpacingM(p.rowSpacingM);
      if (typeof p.mlpBasis === "string") setMlpBasis(p.mlpBasis);
      if (typeof p.autoSeatByRP23 === "boolean") setAutoSeatByRP23(p.autoSeatByRP23);
      if (typeof p.seatingBlockOffset === "number") setSeatingBlockOffset(p.seatingBlockOffset);

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
      frontSubsCfg,
      rearSubsCfg,
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
      useRearGlobal
    };
    try {
      saveAutosave(payload);
    } catch (e) {
      console.warn("Autosave failed:", e);
    }
  }, [roomDims, dimensions, seatingPositions, speakerSystem, frontSubsCfg, rearSubsCfg, dolbyLayout, dolbyConfig, screen, screenHeight, seatingRows, seatsPerRow, seatsPerRowByRow, seatSpacing, rowSpacingM, mlpBasis, autoSeatByRP23, seatingBlockOffset, aimFrontWidesAtMLP, aimSideSurroundsAtMLP, aimRearSurroundsAtMLP, globalSurroundModel, overheadGlobalModel, overheadFrontOverride, overheadMidOverride, overheadRearOverride, useFrontGlobal, useMidGlobal, useRearGlobal]);

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
      tuning: []
    });
    setRearSubsCfg({
      model: "SUB2-12",
      count: 0,
      positions: [],
      tuning: []
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
      perRole: {}
    });

    // Per-seat metrics
    setPerSeatMetrics({});

    // 3. Increment reset epoch to force rebuild
    setRoomResetEpoch(prev => prev + 1);

    if (globalThis.__B44_LOGS) {
      console.log('[AppState] Reset to defaults complete, epoch:', roomResetEpoch + 1);
    }
  }, []);

  const value = useMemo(() => ({
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
    DBG_FW, frozenTabs, isFrozen, freezeTab, unfreezeTab, showToast,
    screenCentreDepthM, setScreenCentreDepthM,
    screenFrontPlaneM, setScreenFrontPlaneM,
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
    perSeatMetrics,
    setPerSeatMetricsForSeat,
    seatMetricsById,
    setSeatMetricsById,
    roomResetEpoch,
    resetRoomDesignerToDefaults,
  }), [
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
    DBG_FW, frozenTabs, isFrozen, freezeTab, unfreezeTab, showToast,
    screenCentreDepthM,
    screenFrontPlaneM, setScreenFrontPlaneM,
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
    perSeatMetrics,
    setPerSeatMetricsForSeat,
    seatMetricsById,
    roomResetEpoch,
    resetRoomDesignerToDefaults,
    p15ConstructionLevel,
    setP15ConstructionLevelSafe,
    p21EarlyReflectionPreset,
    setP21EarlyReflectionPresetSafe,
    ]);

  // Export p21 setter as convenience (same pattern as p15)
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