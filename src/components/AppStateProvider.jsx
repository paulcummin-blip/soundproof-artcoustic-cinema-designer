
import React, { createContext, useContext, useMemo, useState, useEffect, useRef, useCallback } from "react";
import { timeNowMs } from "@/components/utils/timeNow";
import { safeTable } from '@/components/utils/safeLog';
import { SHOW_DEBUG_LOGS } from '@/components/utils/diagnostics';
import { isRoleVisible } from "@/components/utils/surroundRoleMap";

function getCanonicalRole(role) {
  if (typeof role !== 'string') return role;
  const upper = role.toUpperCase();

  const aliases = {
    // Map legacy / odd labels TO the Dolby-style roles used everywhere else
    'LS': 'SL',
    'RS': 'SR',
    'LSR': 'SL',
    'RSR': 'SR',
  };

  return aliases[upper] || upper;
}

const AppStateContext = createContext(null);

export function useAppState() {
  const ctx = useContext(AppStateContext);
  return ctx;
}

function useDesignerState() {
  // [ROOMDIMS_SOT] — Single source of truth for room dimensions
  const [roomDims, setRoomDims] = useState({
    widthM: 4.5,
    lengthM: 6.0,
    heightM: 2.4,
  });

  // Stable setters
  const setRoomWidthM = useCallback((v) => {
    setRoomDims(d => ({ ...d, widthM: Number(v) }));
  }, []);
  
  const setRoomLengthM = useCallback((v) => {
    setRoomDims(d => ({ ...d, lengthM: Number(v) }));
  }, []);
  
  const setRoomHeightM = useCallback((v) => {
    setRoomDims(d => ({ ...d, heightM: Number(v) }));
  }, []);

  // Changed: don't initialize with hardcoded defaults that clobber hydrated values
  // The 'dimensions' state is being phased out in favor of 'roomDims' for core room dimensions.
  // Kept temporarily if other parts of the app still rely on it, but should eventually be removed.
  // For now, it will be an empty object to avoid conflicts.
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
  const [seatsPerRowByRow, setSeatsPerRowByRow] = useState([]); // NEW: per-row seat counts
  const [seatingBlockOffset, setSeatingBlockOffset] = useState(0);
  const [seatSpacing, setSeatSpacing] = useState(0.8);
  const [rowSpacingM, setRowSpacingM] = useState(1.8); // NEW: centre-to-centre spacing between rows
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
  
  // Single source of truth for Front-Wide feature
  const [enableFrontWides, setEnableFrontWides] = useState(false);
  const [useFrontWidesInsteadOfRear, setUseFrontWidesInsteadOfRear] = useState(false);
  
  // NEW: 7-bed XOR switch for rears vs wides
  const [useWidesInsteadOfRears, setUseWidesInsteadOfRears] = useState(false);
  
  const DBG_FW = typeof window !== 'undefined' && window.DBG_FW;

  const [frozenTabs, setFrozenTabs] = useState({
    room: false, screen: false, seating: false, speakers: false,
    elements: false, bass: false, report: false,
  });

  // Screen centre depth from front wall - starts null until computed
  const [screenCentreDepthM, setScreenCentreDepthM] = useState(null);

  // NEW: Screen front plane Y (published from RoomVisualisation)
  const [screenFrontPlaneM, _setScreenFrontPlaneM] = useState(null);
  
  // NEW: Computed MLP Y (derived from screen plane)
  const [mlpY_m, setMlpY_m] = useState(null);
  
  // NEW: Computed row centers (derived from MLP)
  const [rowCentersM, _setRowCentersM] = useState([]);

  // Simple, reliable setter. Accepts either an array or an updater fn.
  const setRowCentersM = useCallback(
    (next) => {
      _setRowCentersM(prev => {
        const value = typeof next === 'function' ? next(prev) : next;
        return Array.isArray(value) ? value.slice() : prev;
      });
    },
    []
  );

  // NEW: Overhead channel selections (default to null = OFF)
  const [overheadGlobalModel, setOverheadGlobalModel] = useState(null);
  const [overheadFrontOverride, setOverheadFrontOverride] = useState(null);
  const [overheadMidOverride, setOverheadMidOverride] = useState(null);
  const [overheadRearOverride, setOverheadRearOverride] = useState(null);
  const [useFrontGlobal, setUseFrontGlobal] = useState(true);
  const [useMidGlobal, setUseMidGlobal] = useState(true); // Fixed: was missing useState
  const [useRearGlobal, setUseRearGlobal] = useState(true);

  // NEW: SPL configuration state
  const [splConfig, setSplConfig] = useState({
    globalPowerW: 100,
    globalEqHeadroomDb: 0,
    perRole: {}
  });

  // NEW: Get effective SPL inputs for a role
  const getEffectiveSplInputs = useCallback((role) => {
    const roleConfig = splConfig.perRole[role];
    
    if (roleConfig && !roleConfig.useGlobal) {
      return {
        powerW: roleConfig.powerW ?? splConfig.globalPowerW,
        eqHeadroomDb: roleConfig.eqHeadroomDb ?? splConfig.globalEqHeadroomDb
      };
    }
    
    return {
      powerW: splConfig.globalPowerW,
      eqHeadroomDb: splConfig.globalEqHeadroomDb
    };
  }, [splConfig]);

  // NEW: Update global SPL settings
  const updateGlobalSpl = useCallback((updates) => {
    setSplConfig(prev => ({
      ...prev,
      ...updates
    }));
  }, []);

  // NEW: Update per-role SPL settings
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

  // Detect if any surround model has been chosen.
  // This is intentionally defensive: it looks in a few likely places on splConfig.
  // If your real shape is splConfig.roles[role].model, this will pick it up.
  const hasSurroundModelSelected = useMemo(() => {
    if (!splConfig) return false;

    const surroundRoles = ['SL', 'SR', 'SBL', 'SBR', 'LR', 'RR'];

    // Try to find a non-empty model for any surround role
    return surroundRoles.some((role) => {
      const cfg =
        splConfig.perRole?.[role] || // Corrected from splConfig.roles to splConfig.perRole
        splConfig.byRole?.[role] ||
        splConfig[role] ||
        splConfig.surround || // e.g. a shared surround config
        splConfig.surroundModel;

      const model = cfg && (cfg.model || cfg);

      return !!(
        model &&
        typeof model === 'string' &&
        model.toUpperCase() !== 'NONE'
      );
    });
  }, [splConfig]);

  // --- SAFE SPEAKER VISIBILITY SELECTOR ---
  const layoutStr = String(dolbyLayout || '5.1');
  const widesFlag = !!useWidesInsteadOfRears;

  // 2) Visibility helper used by RoomVisualisation to decide which roles to draw
  const getSpeakerVisibility = useCallback(
    (role, model) => {
      const canon = String(role || "").toUpperCase();

      // Always show core front + LFE
      if (["FL", "FC", "FR", "LFE"].includes(canon)) {
        return true;
      }

      // Only show surrounds / wides / backs if:
      // 1) They are allowed for this layout
      // 2) They have a model selected (not empty / NONE)
      const isAllowed = isRoleVisible(canon, {
        dolbyLayout: layoutStr,
        useFrontWidesInsteadOfRears: widesFlag, // ✅ FIXED: correct parameter name
      });

      if (!isAllowed) return false;

      const hasModel =
        !!model &&
        typeof model === "string" &&
        model.toUpperCase() !== "NONE";

      return hasModel;
    },
    [layoutStr, widesFlag]
  );

  const isFrozen = useCallback((tab) => !!frozenTabs[tab], [frozenTabs]);
  const freezeTab = useCallback((tab) => {
    setFrozenTabs(prev => ({ ...prev, [tab]: true }));
  }, []);
  const unfreezeTab = useCallback((tab) => {
    setFrozenTabs(prev => ({ ...prev, [tab]: false }));
  }, []);

  // Guarded setter to avoid loops
  const setScreenFrontPlaneM = useCallback((m) => {
    if (!Number.isFinite(m)) return;
    _setScreenFrontPlaneM(prev => {
      // Only update if changed (rounded to mm)
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

  // Dev hooks for console access
  useEffect(() => {
    if (typeof window !== "undefined") {
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
      
      // Silence this log unless debug is enabled:
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

  // Effect to compute and set screenCentreDepthM
  useEffect(() => {
    // Placeholder computation for actualScreenFrontY and screenThicknessM
    // In a real application, these would be derived from more complex logic
    // involving screen and room dimensions, mount mode, etc.

    // Convert screen width from inches to meters
    const screenWidthM = screen.visibleWidthInches * 0.0254;

    // A rough estimation for screen thickness. Could be from speaker model data.
    const screenThicknessM = 0.05; // 5cm default thickness

    let actualScreenFrontY = 0; // Distance from the front wall to the *front* face of the screen

    if (screen.mountMode === "floating") {
      actualScreenFrontY = screen.floatDepthM || 0;
    } else if (screen.mountMode === "recessed") {
      // Example: If recessed, it might be set to a fixed depth or derived from room geometry
      actualScreenFrontY = 0.15; // 15cm recess as an example
    }
    // For "baffle" mode, actualScreenFrontY remains 0

    // Add speaker clearance if present
    actualScreenFrontY += screen.speakerClearanceM || 0;

    const computedScreenCentreDepthM = actualScreenFrontY + screenThicknessM / 2;
    
    // Set the state
    setScreenCentreDepthM(computedScreenCentreDepthM);

  }, [
    screen.visibleWidthInches,
    screen.aspectRatio,
    screen.mountMode,
    screen.floatDepthM,
    screen.speakerClearanceM,
    roomDims.lengthM, // Now using roomDims.lengthM instead of dimensions.roomDepthM
    speakersEpoch, // If speaker system changes could influence screen depth calculations
    screenWall, // If screenWall affects the reference point for depth
  ]);


  // Normalization wrapper with epoch increment
const setSpeakerSystem = useCallback((updater) => {
  _setSpeakerSystem(prev => {
    const next = typeof updater === 'function' ? updater(prev) : updater;
    if (!next) return next;

    // If this update didn't bring its own speakers,
    // keep whatever speakers we already had instead of dropping them.
    let speakers = Array.isArray(next.placedSpeakers)
      ? [...next.placedSpeakers]
      : Array.isArray(prev?.placedSpeakers)
        ? [...prev.placedSpeakers]
        : [];

    // Use the real 7-bed toggle (the one SpeakerPlacement and rolesForLayout use)
    const useFWInsteadOfRS = useWidesInsteadOfRears === true;

    const keptRoles = [];
    const prunedRoles = [];

    speakers = speakers.filter(s => {
      const role = getCanonicalRole(s.role);

      // Always keep core LCR and classic sides
      if (['FL', 'FC', 'FR', 'SL', 'SR', 'LS', 'RS'].includes(role)) {
        keptRoles.push(role);
        return true;
      }

      // Front-wide speakers: keep only when they have a model
      if (role === 'LW' || role === 'RW') {
        if (s.model && s.model !== 'undefined') {
          keptRoles.push(role);
          return true;
        } else {
          prunedRoles.push(role);
          return false;
        }
      }

      // Rear surrounds: drop only when "use wides instead of rears" is active
      if (role === 'SBL' || role === 'SBR') {
        if (useFWInsteadOfRS) {
          prunedRoles.push(role);
          return false;
        } else {
          keptRoles.push(role);
          return true;
        }
      }

      // Keep all other roles (overheads, subs, etc.)
      keptRoles.push(role);
      return true;
    });

    if (typeof window !== 'undefined' && DBG_FW) {
      console.log('[FW normalize]', {
        keptRoles,
        prunedRoles,
        useFWInsteadOfRS
      });
    }

    // Bump epoch so anything watching speakers refreshes
    setSpeakersEpoch(prevEpoch => prevEpoch + 1);

    // Merge prev + next, but always use the normalised speakers array
    return {
      ...prev,
      ...next,
      placedSpeakers: speakers,
    };
  });
}, [useWidesInsteadOfRears, DBG_FW]);

  const value = useMemo(() => ({
    // dimensions and setDimensions are now deprecated in favor of roomDims
    dimensions, setDimensions, 
    roomDims, setRoomDims, // NEW
    setRoomWidthM, setRoomLengthM, setRoomHeightM, // NEW
    screen, setScreen, screenHeight, setScreenHeight,
    screenWall, setScreenWall, dolbyConfig, setDolbyConfig, dolbyLayout, setDolbyLayout,
    seededChannels, setSeededChannels, sevenBedLayoutType, setSevenBedLayoutType,
    seatingPositions, setSeatingPositions, 
    baselineSeatingPositions, setBaselineSeatingPositions,
    seatingRows, setSeatingRows,
    seatsPerRow, setSeatsPerRow,
    seatsPerRowByRow, setSeatsPerRowByRow, // NEW: per-row counts
    seatingBlockOffset, setSeatingBlockOffset,
    seatSpacing, setSeatSpacing, 
    rowSpacingM, setRowSpacingM, // NEW
    mlpBasis, setMlpBasis, autoSeatByRP23, setAutoSeatByRP23,
    roomElements, setRoomElements, subwoofers, setSubwoofers,
    frontSubsCfg, setFrontSubsCfg, rearSubsCfg, setRearSubsCfg,
    subWarnings, setSubWarnings,
    setFrontSubWarning: (msg) => setSubWarnings(prev => ({ ...prev, front: msg ? [msg] : [] })),
    aimAtMLP, setAimAtMLP, overheadOffsetM, setOverheadOffsetM,
    overheadMode, setOverheadMode, rowTarget, setRowTarget,
    overlays, setOverlays, speakerSystem, setSpeakerSystem,
    speakersEpoch,
    enableLayoutSPLWidget, setEnableLayoutSPLWidget,
    enableFrontWides, setEnableFrontWides,
    useFrontWidesInsteadOfRear, setUseFrontWidesInsteadOfRear,
    useWidesInsteadOfRears, setUseWidesInsteadOfRears, // NEW
    DBG_FW, frozenTabs, isFrozen, freezeTab, unfreezeTab, showToast,
    screenCentreDepthM, setScreenCentreDepthM,
    screenFrontPlaneM, setScreenFrontPlaneM, // NEW
    mlpY_m, setMlpY_m, // NEW
    rowCentersM, setRowCentersM, // NEW
    overheadGlobalModel, setOverheadGlobalModel,
    overheadFrontOverride, setOverheadFrontOverride,
    overheadMidOverride, setOverheadMidOverride,
    overheadRearOverride, setOverheadRearOverride,
    useFrontGlobal, setUseFrontGlobal,
    useMidGlobal, setUseMidGlobal,
    useRearGlobal, setUseRearGlobal,
    splConfig,
    setSplConfig, // Keeping this for direct state updates if needed, though updateGlobalSpl/updateRoleSpl are preferred
    getEffectiveSplInputs,
    updateGlobalSpl,
    updateRoleSpl,
    getSpeakerVisibility, // ADDED
  }), [
    // dimensions and setDimensions are now deprecated in favor of roomDims
    dimensions, setDimensions, // keeping for now for backward compatibility
    roomDims, setRoomDims, // NEW
    setRoomWidthM, setRoomLengthM, setRoomHeightM, // NEW
    screen, setScreen, 
    screenHeight, setScreenHeight,
    screenWall, setScreenWall, dolbyConfig, setDolbyConfig, 
    dolbyLayout, setDolbyLayout,
    seededChannels, setSeededChannels, sevenBedLayoutType, setSevenBedLayoutType,
    seatingPositions, setSeatingPositions, 
    baselineSeatingPositions, setBaselineSeatingPositions,
    seatingRows, setSeatingRows,
    seatsPerRow, setSeatsPerRow,
    seatsPerRowByRow, setSeatsPerRowByRow, // NEW
    seatingBlockOffset, setSeatingBlockOffset,
    seatSpacing, setSeatSpacing, 
    rowSpacingM, setRowSpacingM, // NEW
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
    useWidesInsteadOfRears, setUseWidesInsteadOfRears, // NEW
    DBG_FW, frozenTabs, isFrozen, freezeTab, unfreezeTab, showToast,
    screenCentreDepthM,
    screenFrontPlaneM, setScreenFrontPlaneM, // NEW
    mlpY_m, setMlpY_m, // NEW
    rowCentersM, setRowCentersM, // NEW
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
    getSpeakerVisibility, // ADDED
  ]);

  return value;
}

export default function AppStateProvider({ children }) {
  const state = useDesignerState();
  return (
    <AppStateContext.Provider value={state}>
      {children}
    </AppStateContext.Provider>
  );
}

export function useScreenFrontPlaneY() {
  const { screen, screenCentreDepthM } = useAppState() || {};
  const SCREEN_HALF_THICKNESS_M = 0.025; // This should ideally come from screen model or be a derived state

  // Priority 1: Use floatDepthM if in floating mode (this is the front face)
  if (screen?.mountMode === 'floating' && Number.isFinite(screen?.floatDepthM)) {
    return screen.floatDepthM;
  }
  
  // Priority 2: Calculate from centre depth
  // Note: screenCentreDepthM is calculated in useDesignerState's useEffect
  if (Number.isFinite(screenCentreDepthM)) {
    return Math.max(0, screenCentreDepthM - SCREEN_HALF_THICKNESS_M);
  }
  
  // Fallback: assume screen is at front wall (Y=0)
  return 0;
}
