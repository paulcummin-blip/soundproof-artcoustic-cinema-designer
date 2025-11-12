
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

  // --- SPEAKER VISIBILITY (FIXED: Robust layout parsing + layout-aware surround rules) ---
  // ✅ UPDATED: Ensure 9.x shows all 6 bed surrounds
  const getSpeakerVisibility = useCallback((role, model) => {
    const canon = String(role || "").toUpperCase();

    // Hide LFE + explicit off/none
    if (canon === "LFE" || canon === "LFE1" || canon === "LFE2") return false;
    const modelStr = String(model || "").toLowerCase().trim();
    if (!modelStr || modelStr === "off" || modelStr === "none") return false;

    // --- NORMALISE LAYOUT STRING ---
    const layoutString = (() => {
      if (typeof dolbyLayout === "string" && dolbyLayout.trim()) return dolbyLayout.trim();
      if (typeof dolbyConfig === "string" && dolbyConfig.trim()) return dolbyConfig.trim();

      if (dolbyConfig && typeof dolbyConfig === "object") {
        if (typeof dolbyConfig.layout === "string" && dolbyConfig.layout.trim()) return dolbyConfig.layout.trim();
        if (typeof dolbyConfig.preset === "string" && dolbyConfig.preset.trim()) return dolbyConfig.preset.trim();
        if (typeof dolbyConfig.value === "string" && dolbyConfig.value.trim()) return dolbyConfig.value.trim();
      }

      return "5.1";
    })();

    const major = parseInt(layoutString.split(".")[0], 10) || 5;

    // ✅ 9.x: All six bed surrounds + LCR visible
    if (major >= 9) {
      return ['FL','FC','FR','SL','SR','SBL','SBR','LW','RW'].includes(canon);
    }

    // LCR always shown when model is valid
    if (canon === "FL" || canon === "FC" || canon === "FR") {
      return true;
    }

    // 5.x — sides only
    if (major === 5) {
      return canon === "SL" || canon === "SR";
    }

    // 7.x — sides + (rears XOR wides based on toggle)
    if (major === 7) {
      if (canon === "SL" || canon === "SR") return true;

      if (useWidesInsteadOfRears) {
        // Show wides, hide rears
        if (canon === "LW" || canon === "RW") return true;
        if (canon === "SBL" || canon === "SBR") return false;
      } else {
        // Show rears, hide wides (default 7.x)
        if (canon === "SBL" || canon === "SBR") return true;
        if (canon === "LW" || canon === "RW") return false;
      }

      return false;
    }

    // Fallback: show if it has a valid model
    return true;
  }, [dolbyLayout, dolbyConfig, useWidesInsteadOfRears]);

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

  // Normalization wrapper with epoch increment
  const setSpeakerSystem = useCallback(
    (updater) => {
      _setSpeakerSystem((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        if (!next) return next;

        let speakers = Array.isArray(next.placedSpeakers)
          ? next.placedSpeakers.slice()
          : Array.isArray(prev.placedSpeakers)
          ? prev.placedSpeakers.slice()
          : [];

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
        const major = parseInt(layoutString.split(".")[0], 10) || 5;
        const isSevenDotX = major === 7;

        console.log('[AS] setSpeakerSystem LAYOUT', {
          layoutString,
          major,
          isSevenDotX,
          useWidesInsteadOfRears
        });

        speakers = speakers.filter((spk) => {
          const role = String(spk.role || "").toUpperCase();
          const model = String(spk.model || "").toLowerCase().trim();
          
          if (role === "FL" || role === "FC" || role === "FR") {
            return true;
          }
          
          if (!model || model === "off" || model === "none") {
            console.log('[AS] Filtering out speaker with off/none model', { role, model });
            return false;
          }
          
          return true;
        });

        // ✅ FENCE: Only apply 7.x XOR filtering; 9.x passes through untouched
        if (isSevenDotX) {
          console.log('[AS] Applying 7.x XOR logic', { useWidesInsteadOfRears });
          
          if (useWidesInsteadOfRears) {
            const beforeCount = speakers.length;
            speakers = speakers.filter((spk) => {
              const r = String(spk.role || "").toUpperCase();
              return r !== "SBL" && r !== "SBR";
            });
            console.log('[AS] Filtered out SBL/SBR', { before: beforeCount, after: speakers.length });
          } else {
            const beforeCount = speakers.length;
            speakers = speakers.filter((spk) => {
              const r = String(spk.role || "").toUpperCase();
              return r !== "LW" && r !== "RW";
            });
            console.log('[AS] Filtered out LW/RW', { before: beforeCount, after: speakers.length });
          }
        } else {
          console.log('[AS] NOT 7.x - no XOR filtering applied', { major });
        }

        console.log('[AS] setSpeakerSystem AFTER normalization');
        console.table(speakers.map(s => ({
          role: s.role,
          model: s.model,
          x: s.position?.x?.toFixed(3),
          y: s.position?.y?.toFixed(3)
        })));

        if (typeof window !== "undefined") {
          window.__LAST_SPEAKERS__ = (speakers || []).map(s => ({
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
          placedSpeakers: speakers,
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
    setFrontSubWarning: (msg) => setSubWarnings(prev => ({ ...prev, front: msg ? [msg] : [] })),
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
  ]), [
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
  const SCREEN_HALF_THICKNESS_M = 0.025;

  if (screen?.mountMode === 'floating' && Number.isFinite(screen?.floatDepthM)) {
    return screen.floatDepthM;
  }
  
  if (Number.isFinite(screenCentreDepthM)) {
    return Math.max(0, screenCentreDepthM - SCREEN_HALF_THICKNESS_M);
  }
  
  return 0;
}
