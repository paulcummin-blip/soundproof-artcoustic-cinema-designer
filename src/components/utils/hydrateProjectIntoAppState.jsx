// Shared project hydration helper — used by both RoomDesigner (via useProjectLoader)
// and RP22Report for direct project loading.
// Extracted from components/hooks/useProjectLoader.js hydrateFromProject(...).
// Do not add logic here; keep it a pure pass-through to existing setters.

import { parseProjectJson } from "@/components/roomdesigner/RoomDesignerHelpers";

const parseMaybe = (val, fallback) => {
  if (val == null) return fallback;
  if (Array.isArray(val)) return val;
  if (typeof val === "object") return val;
  if (typeof val === "string" && val.trim()) {
    try { return JSON.parse(val); } catch { /* ignore */ }
  }
  return fallback;
};

/**
 * Hydrates all app state setters from a raw Project entity object.
 * Mirrors the hydrateFromProject logic in useProjectLoader exactly.
 *
 * @param {Object} p  - Raw project entity from the database
 * @param {Object} appState - From useAppState()
 * @param {Object} setters  - Additional setters that may not be on appState
 *   {
 *     setScreen, setDolbyConfig, setDolbyPreset, setSevenBedLayoutType,
 *     setLcrAimMode, setEnableFrontWides,
 *     setOverheadGlobalModel, setOverheadFrontOverride, setOverheadMidOverride, setOverheadRearOverride,
 *     setUseFrontGlobal, setUseMidGlobal, setUseRearGlobal,
 *     setRowSpacingM, setSeatsPerRowByRow,
 *     setOverlays, setSeatingPositions, setRoomElements,
 *     setFrontSubsCfg, setRearSubsCfg,
 *     setSelectedSpeakersByRole, setSpeakerNodes,
 *     setSpeakerSystem,
 *     setFreeMoveLcr, (optional)
 *   }
 */
export function hydrateProjectIntoAppState(p, appState, setters = {}) {
  if (!p) return;

  const {
    setScreen,
    setDolbyConfig,
    setDolbyPreset,
    setSevenBedLayoutType,
    setLcrAimMode,
    setEnableFrontWides,
    setOverheadGlobalModel,
    setOverheadFrontOverride,
    setOverheadMidOverride,
    setOverheadRearOverride,
    setUseFrontGlobal,
    setUseMidGlobal,
    setUseRearGlobal,
    setRowSpacingM,
    setSeatsPerRowByRow,
    setOverlays,
    setSeatingPositions,
    setRoomElements,
    setFrontSubsCfg,
    setRearSubsCfg,
    setSelectedSpeakersByRole,
    setSpeakerNodes,
    setSpeakerSystem,
    setFreeMoveLcr,
    setGlobalSurroundModel,
    setExtraSurroundCount,
  } = setters;

  // 1) ROOM DIMS
  if (appState?.setRoomDims) {
    let nextWidthM, nextLengthM, nextHeightM;
    if (p.roomDims) {
      try {
        const parsed = JSON.parse(p.roomDims);
        nextWidthM = Number(parsed?.widthM ?? parsed?.width) || Number(p?.room_width) || 4.5;
        nextLengthM = Number(parsed?.lengthM ?? parsed?.length) || Number(p?.room_length) || 6.0;
        nextHeightM = Number(parsed?.heightM ?? parsed?.height) || Number(p?.room_height) || 2.4;
      } catch {
        nextWidthM = Number(p?.room_width) || 4.5;
        nextLengthM = Number(p?.room_length) || 6.0;
        nextHeightM = Number(p?.room_height) || 2.4;
      }
    } else {
      nextWidthM = Number(p?.room_width) || 4.5;
      nextLengthM = Number(p?.room_length) || 6.0;
      nextHeightM = Number(p?.room_height) || 2.4;
    }
    appState.setRoomDims({ widthM: nextWidthM, lengthM: nextLengthM, heightM: nextHeightM });
  }

  // 2) SCREEN
  const screenSizeInches = Number(p?.screen_size) || 120;
  const aspectRatio = p?.aspect_ratio || "16:9";
  if (typeof setScreen === "function") {
    setScreen((prev) => ({
      ...prev,
      visibleWidthInches: screenSizeInches,
      aspectRatio,
      manualMode: !!p?.manual_dimensions,
      manualWidthM: Number(p?.manual_width_m) || 0,
      manualHeightM: Number(p?.manual_height_m) || 0,
      mountMode: p?.screen_mount_mode || "floating",
      floatDepthM: Number(p?.float_depth_m) || 0.2,
      showScreenPlane: !!p?.show_screen_plane,
      showCavity: !!p?.show_cavity,
      speakerClearanceM: Number(p?.speaker_clearance_m) || 0.02,
      heightFromFloorM: typeof p?.screen_height_from_floor === "number" ? p.screen_height_from_floor : 0.5,
    }));
  }

  // 3) LAYOUT / DOLBY
  if (typeof setDolbyConfig === "function") setDolbyConfig(p?.dolby_config || "5.1");
  if (typeof setDolbyPreset === "function") setDolbyPreset(p?.dolby_config || "5.1");
  if (typeof setSevenBedLayoutType === "function") setSevenBedLayoutType(p?.seven_bed_layout_type || "rears");

  const hydratedLcrAimMode = p?.lcr_aim_mode;
  if ((hydratedLcrAimMode === "flat" || hydratedLcrAimMode === "angled") && typeof setLcrAimMode === "function") {
    setLcrAimMode(hydratedLcrAimMode);
  }
  if (typeof setEnableFrontWides === "function") setEnableFrontWides(p?.enable_front_wides ?? false);
  if (typeof setFreeMoveLcr === "function") setFreeMoveLcr(!!p?.free_move_lcr);

  if (typeof setGlobalSurroundModel === "function") {
    setGlobalSurroundModel(p?.global_surround_model || null);
  }

  if (typeof setExtraSurroundCount === "function") {
    const nextExtraCount = Number(p?.extra_surround_count);
    setExtraSurroundCount(Number.isFinite(nextExtraCount) ? nextExtraCount : 0);
  }

  const rowSpacing = Number(p?.row_spacing_m) || 1.8;
  if (typeof setRowSpacingM === "function") setRowSpacingM(rowSpacing);

  const seatsPerRowByRowData = parseMaybe(p?.seats_per_row_by_row, []);
  if (Array.isArray(seatsPerRowByRowData) && typeof setSeatsPerRowByRow === "function") {
    setSeatsPerRowByRow(seatsPerRowByRowData);
  }

  // 4) OVERHEAD CONFIG
  if (typeof setOverheadGlobalModel === "function") setOverheadGlobalModel(p?.overhead_global_model || null);
  if (typeof setOverheadFrontOverride === "function") setOverheadFrontOverride(p?.overhead_front_override || null);
  if (typeof setOverheadMidOverride === "function") setOverheadMidOverride(p?.overhead_mid_override || null);
  if (typeof setOverheadRearOverride === "function") setOverheadRearOverride(p?.overhead_rear_override || null);
  if (typeof setUseFrontGlobal === "function") setUseFrontGlobal(typeof p?.use_front_global === "boolean" ? p.use_front_global : true);
  if (typeof setUseMidGlobal === "function") setUseMidGlobal(typeof p?.use_mid_global === "boolean" ? p.use_mid_global : true);
  if (typeof setUseRearGlobal === "function") setUseRearGlobal(typeof p?.use_rear_global === "boolean" ? p.use_rear_global : true);

  // 5) OVERLAYS
  const defaultOverlays = {
    LCR: false, FRONT_WIDE: false, SIDE_SURROUND: false, REAR_SURROUND: false,
    OVERHEADS_2: false, OVERHEADS_4: false, OVERHEADS_6: false, RP22_ANGLES: false,
    enableDolbyZones: false, ROOM_DIMS: false,
  };
  const overlaysData = parseMaybe(p?.overlays, defaultOverlays);
  if (typeof setOverlays === "function") setOverlays({ ...defaultOverlays, ...overlaysData });

  // 6) SEATING
  const sp = parseMaybe(p?.seating_positions, []);
  if (Array.isArray(sp) && typeof setSeatingPositions === "function") setSeatingPositions(sp);

  // 7) ROOM ELEMENTS
  const re = parseMaybe(p?.room_elements, []);
  if (typeof setRoomElements === "function") setRoomElements(Array.isArray(re) ? re : []);

  // 8) SUB CONFIG
  if (typeof setFrontSubsCfg === "function" && typeof setRearSubsCfg === "function") {
    const defaultInactive = { model: null, count: 0, positions: [], tuning: [] };
    const frontCfgRaw = parseProjectJson((p?.front_subs_cfg ?? p?.frontSubsCfg), null);
    const rearCfgRaw = parseProjectJson((p?.rear_subs_cfg ?? p?.rearSubsCfg), null);
    const loadedSubs = parseProjectJson(p?.subwoofers, []);
    const subsList = Array.isArray(loadedSubs) ? loadedSubs : [];
    const frontSubs = subsList.filter(s => (s?.group === "front") || String(s?.role || "").startsWith("SUBF"));
    const rearSubs = subsList.filter(s => (s?.group === "rear") || String(s?.role || "").startsWith("SUBR"));

    const isCfgUsable = (cfg) => {
      if (!cfg || typeof cfg !== "object") return false;
      const hasModel = typeof cfg.model === "string" && cfg.model.trim().length > 0;
      const hasCount = Number.isFinite(Number(cfg.count)) && Number(cfg.count) > 0;
      return hasModel || hasCount;
    };
    const deriveCfgFromSubs = (subs) => {
      if (!subs.length) return null;
      const model = String(subs?.[0]?.model || "SUB2-12").trim() || "SUB2-12";
      const positions = subs.map(s => ({ x: Number(s?.position?.x) })).filter(pos => Number.isFinite(pos.x));
      return { model, count: subs.length, positions, tuning: [] };
    };

    setFrontSubsCfg(isCfgUsable(frontCfgRaw) ? frontCfgRaw : (deriveCfgFromSubs(frontSubs) || defaultInactive));
    setRearSubsCfg(isCfgUsable(rearCfgRaw) ? rearCfgRaw : (deriveCfgFromSubs(rearSubs) || defaultInactive));
    if (typeof appState?.setSubwoofers === "function" && subsList.length) appState.setSubwoofers(subsList);
  }

  // 9) SPEAKER ROLES + SPL NODES
  if (typeof setSelectedSpeakersByRole === "function") {
    setSelectedSpeakersByRole(parseMaybe(p?.selected_speakers_by_role, {}));
  }
  if (typeof setSpeakerNodes === "function") {
    const nodes = parseMaybe(p?.spl_speaker_nodes, []);
    setSpeakerNodes(Array.isArray(nodes) ? nodes : []);
  }

  // 10) SPL CONFIG
  if (typeof appState?.setSplConfig === "function") {
    const splCfg = parseMaybe(p?.spl_config, null);
    const defaultSplConfig = {
      lcrW: 100, surroundsW: 100, overheadsW: 100, globalPowerW: 100,
      globalEqHeadroomDb: 0, radiationMode: 'half-space', p13Mode: 'minimum', perRole: {}
    };
    appState.setSplConfig(splCfg || defaultSplConfig);
  }

  // 10b) P12 mode/level (stored inside spl_config on the entity)
  if (typeof appState?.setP12Mode === "function") {
    appState.setP12Mode(p?.spl_config?.p12_mode ?? null);
  }
  if (typeof appState?.setP12Level === "function") {
    appState.setP12Level(p?.spl_config?.p12_level ?? null);
  }

  // 10c) screenFrontPlaneM — restore persisted value so signature matches on first autosave tick
  if (typeof appState?.setScreenFrontPlaneM === "function") {
    const sfp = Number(p?.screen_front_plane_m);
    appState.setScreenFrontPlaneM(Number.isFinite(sfp) ? sfp : 0);
  }

  // 11) PLACED SPEAKERS
  const loadedSpeakers = (() => {
    const v1 = parseMaybe(p?.selected_speakers, null);
    if (Array.isArray(v1)) return v1;
    const legacy = parseMaybe(p?.placedSpeakers, null);
    if (Array.isArray(legacy)) return legacy;
    return null;
  })();

  if (typeof setSpeakerSystem === "function") {
    setSpeakerSystem((prev) => ({
      ...(prev || {}),
      placedSpeakers: Array.isArray(loadedSpeakers) ? loadedSpeakers : [],
    }));
  }
}