import React, { createContext, useContext, useMemo, useState, useEffect, useRef, useCallback } from "react";
import { timeNowMs } from "@/components/utils/timeNow";
import { safeTable } from '@/components/utils/safeLog';
import { SHOW_DEBUG_LOGS } from '@/components/utils/diagnostics';
import { getCanonicalRole } from "@/components/utils/surroundRoleMap";

// --- ATMOS PROTECTION HELPERS ---
const safeCanonRole = (role) => String(role || '').toUpperCase();

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
export function getSpeakerVisibilityFor(layoutString, useWidesInsteadOfRears) {
  const layout = String(layoutString || "5.1");
  const parts = layout.split(".");
  const major = parseInt(parts[0], 10) || 5;
  const heights = parseInt(parts[2], 10) || 0; // e.g., "5.1.2" → 2, "7.1.4" → 4

  // LCR are always visible
  const roles = new Set(["FL", "FC", "FR"]);

  const showSides = major >= 5;
  const showRears = major >= 7 && !useWidesInsteadOfRears;
  const showWides = (major >= 7 && !!useWidesInsteadOfRears) || major >= 9;

  if (showSides) {
    roles.add("SL");
    roles.add("SR");
  }

  if (showRears) {
    roles.add("SBL");
    roles.add("SBR");
  }

  if (showWides) {
    roles.add("LW");
    roles.add("RW");
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
    arr.forEach(s => m.set(String(s.role).toUpperCase(), s));
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
  const [roomDims, setRoomDims] = useState({
    widthM: 4.5,
    lengthM: 6.0,
    heightM: 2.4,
  });

  const setRoomWidthM = useCallback((v) => {
    setRoomDims(d => ({ ...d, widthM: Number(v) }));
  }, []);
  
  const setRoomLengthM = useCallback((v) => {
    setRoomDims(d => ({ ...d, lengthM: Number(v) }));
  }, []);
  
  const setRoomHeightM = useCallback((v) => {
    setRoomDims(d => ({ ...d, heightM: Number(v) }));
  }, []);

  const [dimensions, setDimensions] = useState({}); 

  const [screen, setScreen] = useState({
    visibleWidthInches: 100, aspectRatio: "16:9", mountMode: "baffle",
    floatDepthM: 0, showScreenPlane: false, showCavity: false, speakerClearanceM: 0.02,
  });
  const [screenHeight, setScreenHeight] = useState(0.5);
  const [screenWallState, _setScreenWall] = useState("front");
  const setScreenWall = useCallback(() => _setScreenWall("front"), []);
  const screenWall = screenWallState;

  const [dolbyConfig, _setDolbyConfig] = useState("5.1");
  const [dolbyLayout, setDolbyLayout] = useState("5.1");
  const setDolbyConfig = useCallback((v) => {
    const p = v || "5.1";
    _setDolbyConfig(p);
    setDolbyLayout(p);
  }, []);

  const [seededChannels, setSeededChannels] = useState([]);
  const [sevenBedLayoutType, setSevenBedLayoutType] = useState('rears');
  const [seatingPositions, setSeatingPositions] = useState([]);
  const [baselineSeatingPositions, setBaselineSeatingPositions] = useState([]);
  const [seatingRows, setSeatingRows] = useState(1);
  const [seatsPerRow, setSeatsPerRow] = useState(3);
  const [seatsPerRowByRow, setSeatsPerRowByRow] = useState([]);
  const [seatingBlockOffset, setSeatingBlockOffset] = useState(0);
  const [seatSpacing, setSeatSpacing] = useState(0.8);
  const [rowSpacingM, setRowSpacingM] = useState(1.8);
  const [mlpBasis, setMlpBasis] = useState("front");
  const [autoSeatByRP23, setAutoSeatByRP23] = useState(true);
  const [roomElements, setRoomElements] = useState([]);
  const [subwoofers, setSubwoofers] = useState([]);
  const [frontSubsCfg, setFrontSubsCfg] = useState({ model: "SUB2-12", qty: 0 });
  const [rearSubsCfg, setRearSubsCfg] = useState({ model: "SUB2-12", qty: 0 });
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

  const [speakerSystem, _setSpeakerSystem] = useState({ placedSpeakers: [], lastUpdated: timeNowMs() });
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

  const [overheadGlobalModel, setOverheadGlobalModel] = useState(null);
  const [overheadFrontOverride, setOverheadFrontOverride] = useState(null);
  const [overheadMidOverride, setOverheadMidOverride] = useState(null);
  const [overheadRearOverride, setOverheadRearOverride] = useState(null);
  const [useFrontGlobal, setUseFrontGlobal] = useState(true);
  const [useMidGlobal, setUseMidGlobal] = useState(true);
  const [useRearGlobal, setUseRearGlobal] = useState(true);

  const [splConfig, setSplConfig] = useState({
        globalPowerW: 100,
        globalEqHeadroomDb: 0,
        radiationMode: 'half-space', // 'half-space' | 'anechoic'
        perRole: {}
      });

  const getEffectiveSplInputs = useCallback((role) => {
    const roleConfig = splConfig.perRole[role];
    
    if (roleConfig && !roleConfig.useGlobal) {
            return {
              powerW: roleConfig.powerW ?? splConfig.globalPowerW,
              eqHeadroomDb: roleConfig.eqHeadroomDb ?? splConfig.globalEqHeadroomDb,
              radiationMode: splConfig.radiationMode || 'half-space',
            };
          }

          return {
            powerW: splConfig.globalPowerW,
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
  const visibleRoles = useMemo(
    () => getSpeakerVisibilityFor(dolbyLayout || '5.1', useWidesInsteadOfRears),
    [dolbyLayout, useWidesInsteadOfRears]
  );

  const getSpeakerVisibility = useCallback((role, model) => {
    const canon = String(role || "").toUpperCase();

    if (canon === "LFE" || canon === "LFE1" || canon === "LFE2") return false;
    const modelStr = String(model || "").toLowerCase().trim();
    if (!modelStr || modelStr === "off" || modelStr === "none") return false;

    return visibleRoles.has(canon);
  }, [visibleRoles]);

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
    }
  }, [enableFrontWides, showToast]);

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
        if (!next) return next;

        // Capture previous speakers for Atmos repair
        const prevSpeakers = Array.isArray(prev.placedSpeakers)
          ? prev.placedSpeakers
          : [];

        let speakers = Array.isArray(next.placedSpeakers)
          ? next.placedSpeakers.slice()
          : Array.isArray(prev.placedSpeakers)
          ? prev.placedSpeakers.slice()
          : [];

        console.log("[AS] RECEIVED placedSpeakers:", speakers.map(s => s.role));
        console.log('[AS] setSpeakerSystem BEFORE normalization', {
          count: speakers.length,
          roles: speakers.map(s => ({ role: s.role, model: s.model }))
        });

        const layoutStringRaw =
          (typeof next.dolbyLayout === "string" && next.dolbyLayout) ||
          (typeof prev.dolbyLayout === "string" && prev.dolbyLayout) ||
          (typeof dolbyLayout === "string" && dolbyLayout) ||
          (dolbyConfig &&
            typeof dolbyConfig.layout === "string" &&
            dolbyConfig.layout) ||
          "";

        const layoutString = (layoutStringRaw || "").trim() || "5.1";

        // --- PASSTHROUGH MODE: AppStateProvider is now a dumb container ---
        // RoomDesigner is the single source of truth for speaker seeding/reconciliation
        // We do NOT filter speakers by layout visibility here - that's RoomVisualisation's job
        
        // Simple normalization: ensure we have an array
        const normalizedSpeakers = Array.isArray(speakers) ? speakers : [];

        console.log("[AS] AFTER normalization:", normalizedSpeakers.map(s => s.role));
        console.log('[AS] setSpeakerSystem AFTER normalization', {
          count: normalizedSpeakers.length,
          roles: normalizedSpeakers.map(s => ({ role: s.role, model: s.model }))
        });

        console.log("[AS] candidate yaw by role",
          normalizedSpeakers.map(s => ({
            role: String(s.role || "").toUpperCase(),
            yaw: s.yaw ?? null,
          }))
        );

        // ✅ If speakers didn't actually change, return prev to avoid churn
        if (speakersShallowEqual(prev.placedSpeakers, normalizedSpeakers)) {
          return prev;
        }

        if (typeof window !== "undefined") {
          window.__LAST_SPEAKERS__ = (normalizedSpeakers || []).map(s => ({
            role: String(s.role),
            model: s.model || null,
          }));
          if (DBG_FW) {
            console.log("[AS] placedSpeakers(normalized)",
              window.__LAST_SPEAKERS__);
          }
        }

        setSpeakersEpoch(prevEpoch => prevEpoch + 1);

        return {
          ...prev,
          ...next,
          placedSpeakers: normalizedSpeakers,
        };
      });
    },
    [useWidesInsteadOfRears, dolbyLayout, dolbyConfig, DBG_FW]
  );

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
    splConfig,
    setSplConfig,
    getEffectiveSplInputs,
    updateGlobalSpl,
    updateRoleSpl,
    getSpeakerVisibility,
    visibleRoles, // export for RV
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
    mlpY_m, setMlpY_m,
    rowCentersM, setRowCentersM,
    overheadGlobalModel, setOverheadGlobalModel,
    overheadFrontOverride, setOverheadFrontOverride,
    overheadMidOverride, setOverheadMidOverride,
    overheadRearOverride, setOverheadRearOverride,
    useFrontGlobal, setUseFrontGlobal,
    useMidGlobal, setUseMidGlobal,
    useRearGlobal, setUseRearGlobal,
    splConfig,
    getEffectiveSplInputs,
    updateGlobalSpl,
    updateRoleSpl,
    getSpeakerVisibility,
    visibleRoles,
  ]);

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