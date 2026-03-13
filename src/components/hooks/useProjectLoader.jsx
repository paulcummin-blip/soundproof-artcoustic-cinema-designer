// Extracted verbatim from src/pages/RoomDesigner.jsx (lines 204–1132)
import { useState, useCallback, useEffect, useRef } from "react";
import { Project } from "@/entities/Project";
import { serializeProject } from "@/components/utils/serializeProject";
import { deriveSubwoofersFromCfg } from "@/components/utils/deriveSubwoofersFromCfg";
import { parseProjectJson } from "@/components/roomdesigner/RoomDesignerHelpers";

// Hook to encapsulate project loading, saving, and state management
export function useProjectLoader(
appState, // Pass appState directly for setters
{
  projectIdFromUrl,
  dolbyPreset,
  dimensions, // This will now be stableDimensions, derived from appState.roomDims
  screen, seatingPositions, roomElements, overlays, frozenTabs,
  setDimensions, // This will now be appState.setRoomDims
  setScreen, setSeatingPositions, setRoomElements, setOverlays, setDolbyConfig,
  setDolbyPreset, // Added to update the local state in RoomDesignerWithState
  setSpeakerSystem, // From useSpeakerSystemStore, passed down
  initWithDefaultsAndRules, // From useSpeakerSystemStore, passed down
  placedSpeakers, // Now taken from the prop
  sevenBedLayoutType, // This is now passed in
  setSevenBedLayoutType,
  frontSubsCfg, // Pass sub config for saving
  rearSubsCfg, // Pass sub config for saving
  setFrontSubsCfg, // Pass setter
  setRearSubsCfg, // Pass setter
  // NEW: LCR Aiming props
  lcrAimMode,
  setLcrAimMode,
  // NEW: Front Wide Toggle
  enableFrontWides,
  setEnableFrontWides,
  // NEW: SPL Handoff data for saving
  selectedSpeakersByRole, // Now comes from appState
  setSelectedSpeakersByRole, // Setter for appState
  speakerNodes, // Now comes from appState
  setSpeakerNodes, // Setter for appState
  // NEW: Overhead selections for persistence
  overheadGlobalModel,
  setOverheadGlobalModel,
  overheadFrontOverride,
  setOverheadFrontOverride,
  overheadMidOverride,
  setOverheadMidOverride,
  overheadRearOverride,
  setOverheadRearOverride,
  useFrontGlobal,
  setUseFrontGlobal,
  useMidGlobal,
  setUseMidGlobal,
  useRearGlobal,
  setUseRearGlobal,
  // NEW: Row Spacing
  rowSpacingM,
  setRowSpacingM,
  // NEW: Seats Per Row By Row
  seatsPerRowByRow,
  setSeatsPerRowByRow,
  // NEW: Free Move LCR
  freeMoveLcr,
  setFreeMoveLcr,
  // stableDimensions alias (needed in save/autosave buildProjectData)
  stableDimensions,
  // Explicit mode: true = real saved project, false = local draft
  isProjectMode,
}) {
  const [projectIdState, setProjectIdState] = useState(projectIdFromUrl);
  const [projectNameState, setProjectNameState] = useState("Untitled Room"); // Internal projectName for loader
  const [loadState, setLoadState] = useState(
    isProjectMode ? { phase: "idle", error: null, name: null } : { phase: "scratch" }
  );
  const [autosaveStatus, setAutosaveStatus] = useState(isProjectMode ? "idle" : "local");
  const hydratedRoomDimsProjectIdRef = useRef(null);

  const parseMaybe = useCallback((val, fallback) => {
    if (Array.isArray(val)) return val;
    if (typeof val === "string" && val.trim()) {
      try {return JSON.parse(val);} catch {/* ignore */}
    }
    return fallback;
  }, []);

  const hydrateFromProject = useCallback((p) => {
    if (!p) return;

    // DEBUG: Log what we're loading
    if (globalThis.__B44_LOGS) console.log('[RD] hydrateFromProject', {
      id: p.id,
      name: p.name,
      client_name: p.client_name,
      roomDims: p.roomDims,
      room_width: p.room_width,
      room_length: p.room_length,
      room_height: p.room_height,
      seating_positions: typeof p.seating_positions === 'string' ? p.seating_positions.slice(0, 200) : p.seating_positions,
      selected_speakers: typeof p.selected_speakers === 'string' ? p.selected_speakers.slice(0, 200) : p.selected_speakers
    });

    //
    // 1) ROOM DIMS (single source of truth)
//
if (appState?.setRoomDims && appState?.roomDims) {

  const pid = p?.id || null;
  const alreadyHydratedDims = pid && hydratedRoomDimsProjectIdRef.current === pid;
  if (pid) hydratedRoomDimsProjectIdRef.current = pid;

  let nextWidthM, nextLengthM, nextHeightM;

      if (p.roomDims) {
        try {
          const parsed = JSON.parse(p.roomDims);
          // Map legacy width/length/height to widthM/lengthM/heightM if needed
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

      // Always apply on first hydration for this project.
      // On subsequent calls for the same project, only update if dimension differs by >= 0.001m.
      const current = appState.roomDims;
      const widthChanged = Math.abs((current?.widthM ?? 0) - nextWidthM) >= 0.001;
      const lengthChanged = Math.abs((current?.lengthM ?? 0) - nextLengthM) >= 0.001;
      const heightChanged = Math.abs((current?.heightM ?? 0) - nextHeightM) >= 0.001;

      if (!alreadyHydratedDims || widthChanged || lengthChanged || heightChanged) {
        appState.setRoomDims({
          widthM: nextWidthM,
          lengthM: nextLengthM,
          heightM: nextHeightM
        });
      }
    }

    //
    // 2) SCREEN
    //
    const screenSizeInches = Number(p?.screen_size) || 100;
    const aspectRatio = p?.aspect_ratio || "16:9";

    if (typeof setScreen === "function") {
      setScreen((prev) => ({
        ...prev,
        visibleWidthInches: screenSizeInches,
        aspectRatio,
        manualMode: !!p?.manual_dimensions,
        manualWidthM: Number(p?.manual_width_m) || 0,
        manualHeightM: Number(p?.manual_height_m) || 0,
        mountMode: "floating",
        floatDepthM: Number(p?.float_depth_m) || 0.2,
        showScreenPlane: !!p?.show_screen_plane,
        showCavity: !!p?.show_cavity,
        speakerClearanceM: Number(p?.speaker_clearance_m) || 0.02,
        heightFromFloorM:
        typeof p?.screen_height_from_floor === "number" ?
        p.screen_height_from_floor :
        0.5
      }));
    }

    //
    // 3) LAYOUT / DOLBY / ROWS
    //
    if (typeof setDolbyConfig === "function") {
      setDolbyConfig(p?.dolby_config || "5.1");
    }
    if (typeof setDolbyPreset === "function") {
      setDolbyPreset(p?.dolby_config || "5.1");
    }
    if (typeof setSevenBedLayoutType === "function") {
      setSevenBedLayoutType(p?.seven_bed_layout_type || "rears");
    }

    // Hydrate LCR aim mode (safe/idempotent; no hooks here)
    const hydratedLcrAimMode = p?.lcr_aim_mode;

    if (
      (hydratedLcrAimMode === "flat" || hydratedLcrAimMode === "angled") &&
      typeof setLcrAimMode === "function"
    ) {
      setLcrAimMode(hydratedLcrAimMode);
    }

    const hydratedEnableFrontWides = p?.enable_front_wides ?? false;
    if (typeof setEnableFrontWides === "function") {
      setEnableFrontWides(hydratedEnableFrontWides);
    }

    if (typeof setFreeMoveLcr === "function") {
      setFreeMoveLcr(!!p?.free_move_lcr);
    }

    // Row spacing + seats per row (correct field names)
    const rowSpacing = Number(p?.row_spacing_m) || 1.8;
    if (typeof setRowSpacingM === "function") {
      setRowSpacingM(rowSpacing);
    }

    const seatsPerRowByRowData = parseMaybe(p?.seats_per_row_by_row, []);
    // CRITICAL: Always set seats per row, even if empty array
    if (Array.isArray(seatsPerRowByRowData) && typeof setSeatsPerRowByRow === "function") {
      setSeatsPerRowByRow(seatsPerRowByRowData);
    }

    //
    // 4) OVERHEAD CONFIG (correct snake_case field names)
    //
    if (typeof setOverheadGlobalModel === "function") {
      setOverheadGlobalModel(p?.overhead_global_model || null);
    }
    if (typeof setOverheadFrontOverride === "function") {
      setOverheadFrontOverride(p?.overhead_front_override || null);
    }
    if (typeof setOverheadMidOverride === "function") {
      setOverheadMidOverride(p?.overhead_mid_override || null);
    }
    if (typeof setOverheadRearOverride === "function") {
      setOverheadRearOverride(p?.overhead_rear_override || null);
    }
    if (typeof setUseFrontGlobal === "function") {
      setUseFrontGlobal(
        typeof p?.use_front_global === "boolean" ? p.use_front_global : true
      );
    }
    if (typeof setUseMidGlobal === "function") {
      setUseMidGlobal(
        typeof p?.use_mid_global === "boolean" ? p.use_mid_global : true
      );
    }
    if (typeof setUseRearGlobal === "function") {
      setUseRearGlobal(
        typeof p?.use_rear_global === "boolean" ? p.use_rear_global : true
      );
    }

    //
    // 5) SCREEN FRONT PLANE — intentionally NOT restored from storage.
    // screenFrontPlaneM is a derived value (computed from screen geometry + LCR placement).
    // Restoring it pins the MLP effect to stale row centres on project open.
    // The MLP effect will recompute it from live floatDepthM on first render,
    // exactly as it does in Free Use mode.
    //

    //
    // 6) OVERLAYS
    //
    const defaultOverlays = {
      LCR: false,
      FRONT_WIDE: false,
      SIDE_SURROUND: false,
      REAR_SURROUND: false,
      OVERHEADS_2: false,
      OVERHEADS_4: false,
      OVERHEADS_6: false,
      RP22_ANGLES: false,
      enableDolbyZones: false,
      ROOM_DIMS: false // NEW – plan dimension overlay
    };
    const overlaysData = parseMaybe(p?.overlays, defaultOverlays);
    if (typeof setOverlays === "function") {
      setOverlays({ ...defaultOverlays, ...overlaysData });
    }

    //
    // 7) SEATING
    //
    const sp = parseMaybe(p?.seating_positions, []);
    // CRITICAL: Always set seating positions, even if empty array
    if (Array.isArray(sp) && typeof setSeatingPositions === "function") {
      setSeatingPositions(sp);
    }

    //
    // 8) ROOM ELEMENTS
    //
    const re = parseMaybe(p?.room_elements, []);
    // CRITICAL: Always set room elements, ensuring it's always an array (even if empty)
    if (typeof setRoomElements === "function") {
      setRoomElements(Array.isArray(re) ? re : []);
    }

 //
// 9) SUB CONFIG (front/rear groups – config, not positions)
//
if (typeof setFrontSubsCfg === "function" && typeof setRearSubsCfg === "function") {
  const defaultInactive = { model: null, count: 0, positions: [], tuning: [] };

  const frontCfgRaw = parseProjectJson((p?.front_subs_cfg ?? p?.frontSubsCfg), null);
  const rearCfgRaw  = parseProjectJson((p?.rear_subs_cfg ?? p?.rearSubsCfg), null);

  // Also look for a persisted sub list
  const loadedSubs = parseProjectJson(p?.subwoofers, []);
  const subsList = Array.isArray(loadedSubs) ? loadedSubs : [];

  const frontSubs = subsList.filter(s => (s?.group === "front") || String(s?.role || "").startsWith("SUBF"));
  const rearSubs  = subsList.filter(s => (s?.group === "rear")  || String(s?.role || "").startsWith("SUBR"));

  const isCfgUsable = (cfg) => {
    if (!cfg || typeof cfg !== "object") return false;
    const hasModel = typeof cfg.model === "string" && cfg.model.trim().length > 0;
    const hasCount = Number.isFinite(Number(cfg.count)) && Number(cfg.count) > 0;
    return hasModel || hasCount;
  };

  const deriveCfgFromSubs = (subs) => {
    if (!subs.length) return null;
    const model = String(subs?.[0]?.model || "SUB2-12").trim() || "SUB2-12";
    const positions = subs.map(s => ({ x: Number(s?.position?.x) })).filter(p => Number.isFinite(p.x));
    return {
      model,
      count: subs.length,
      positions,
      tuning: []
    };
  };

  const frontCfg = isCfgUsable(frontCfgRaw) ? frontCfgRaw : (deriveCfgFromSubs(frontSubs) || defaultInactive);
  const rearCfg  = isCfgUsable(rearCfgRaw)  ? rearCfgRaw  : (deriveCfgFromSubs(rearSubs)  || defaultInactive);

  setFrontSubsCfg(frontCfg);
  setRearSubsCfg(rearCfg);

  // Optional but usually helpful: restore the sub list immediately if present
  if (typeof appState?.setSubwoofers === "function" && subsList.length) {
    appState.setSubwoofers(subsList);
  }
} else {
  // Fallback to previous behaviour if setters not present
  if (typeof setFrontSubsCfg === "function") {
    const frontCfg = parseProjectJson((p?.front_subs_cfg ?? p?.frontSubsCfg), null);
    const defaultInactive = { model: null, count: 0, positions: [], tuning: [] };
    setFrontSubsCfg(frontCfg != null ? frontCfg : defaultInactive);
  }
  if (typeof setRearSubsCfg === "function") {
    const rearCfg = parseProjectJson((p?.rear_subs_cfg ?? p?.rearSubsCfg), null);
    const defaultInactive = { model: null, count: 0, positions: [], tuning: [] };
    setRearSubsCfg(rearCfg != null ? rearCfg : defaultInactive);
  }
}

    //
    // 10) SPEAKER ROLES + SPL NODES
    //
    if (typeof setSelectedSpeakersByRole === "function") {
      const byRole = parseMaybe(p?.selected_speakers_by_role, {});
      setSelectedSpeakersByRole(byRole || {});
    }

    if (typeof setSpeakerNodes === "function") {
      const nodes = parseMaybe(p?.spl_speaker_nodes, []);
      setSpeakerNodes(Array.isArray(nodes) ? nodes : []);
    }

    //
    // 10A) SPL CONFIG
    //
    if (typeof appState?.setSplConfig === "function") {
      const splCfg = parseMaybe(p?.spl_config, null);
      // CRITICAL: Always set splConfig to explicit default if missing
      const defaultSplConfig = {
        lcrW: 100,
        surroundsW: 100,
        overheadsW: 100,
        globalPowerW: 100,
        globalEqHeadroomDb: 0,
        radiationMode: 'half-space',
        p13Mode: 'minimum',
        perRole: {}
      };
      appState.setSplConfig(splCfg || defaultSplConfig);
    }

    //
    // 11) PLACED SPEAKERS – ALWAYS HYDRATE FROM PROJECT
    //
    const loadedSpeakers = (() => {
      const v1 = parseMaybe(p?.selected_speakers, null);
      if (Array.isArray(v1)) return v1;
      const legacy = parseMaybe(p?.placedSpeakers, null);
      if (Array.isArray(legacy)) return legacy;
      return null;
    })();

    if (typeof setSpeakerSystem === "function") {
      setSpeakerSystem((prev) => {
        // CRITICAL: Always set placedSpeakers from loaded data, even if empty.
        // If loadedSpeakers is an array (even []), use it directly.
        // If loadedSpeakers is null/missing, explicitly set to [] to clear state.
        const speakers = Array.isArray(loadedSpeakers) ? loadedSpeakers : [];
        
        return {
          ...(prev || {}),
          placedSpeakers: speakers
        };
      });
    }
  }, [
  appState?.setRoomDims,
  appState?.setScreenFrontPlaneM,
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
  parseMaybe]
  );


  const loadProject = useCallback(async (signal, idOverride) => {
    const id = idOverride || projectIdFromUrl || projectIdState;
    if (!id) return;
    setLoadState({ phase: "loading", error: null, name: null });
    try {
      // AbortController signal is not directly supported by the SDK, but the operation is fast.
      const projects = await Project.filter({ id }, '-updated_date', 1);

      if (Array.isArray(projects) && projects.length) {
        const p = projects[0] || null;
        if (globalThis.__B44_LOGS) console.log('[RD] loadProject result', { projectIdState, id: p?.id, name: p?.name });
        hydrateFromProject(p);
        setProjectNameState(p?.name || "Project"); // Update internal projectName state
        setLoadState({ phase: "loaded", error: null, name: p?.name || "Project" });
      } else {
        // Project not found in cloud; keeping id so user can still save into it
        if (globalThis.__B44_LOGS) console.log('[RoomDesigner] Project not found in cloud; keeping id so user can continue working.');
        setLoadState({ phase: "idle", error: null, name: null });
      }
    } catch (err) {
      const errMsg = String(err?.message || err || '');

      // Abort is fine – usually navigating away or changing project.
      if (err?.name === "AbortError") {
        setLoadState((prev) => ({ ...prev, phase: "idle" }));
        return;
      }

      // Stale / invalid ID / 404 – don't keep retrying, mark as error
      if (errMsg.includes("Invalid id value") || errMsg.includes("Object not found") || errMsg.includes("404")) {
        if (globalThis.__B44_LOGS) console.log("[RoomDesigner] Invalid project ID detected, keeping it but stopping auto-reload.");
        setLoadState({ phase: "error", error: errMsg, name: null });
        return;
      }

      // Any other load error (including 429 rate limit) – stop auto-reload
      window.__APP_DEBUG = window.__APP_DEBUG || [];
      window.__APP_DEBUG.push(`[RoomDesigner] Project load error: ${errMsg}`);
      if (globalThis.__B44_LOGS) console.error("[RoomDesigner] Failed to load project:", err);
      setLoadState({ phase: "error", error: errMsg, name: null });
    }
  }, [projectIdState, hydrateFromProject, setProjectNameState]);

  const reloadProject = useCallback((signal) => {
    // No project? nothing to reload.
    if (!projectIdState) return;
    return loadProject(signal);
  }, [projectIdState, loadProject]);

  const handleProjectCreated = useCallback((id) => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("project", id);
      window.history.replaceState({}, "", url.toString());
    } catch (e) {
      if (globalThis.__B44_LOGS) console.error("Failed to update URL:", e);
    }
    setProjectIdState(id);
  }, []);

  const isHydratingRef = useRef(false); // Initialize with false
  const lastBootTargetRef = useRef("");

  useEffect(() => {
    // Update the ref whenever loadState changes
    const isCurrentlyHydrating = loadState.phase === "loading" || projectIdFromUrl && loadState.phase !== "loaded" && loadState.phase !== "error";
    isHydratingRef.current = isCurrentlyHydrating;
  }, [loadState.phase, projectIdFromUrl]);


  // Auto-save ONLY for an existing project.
  // Quiet autosave: mark dirty on changes, then commit at most every 10s (and also on short pauses).
  useEffect(() => {
    const effectiveProjectId = projectIdState || projectIdFromUrl || null;
    if (!effectiveProjectId || !isProjectMode) {
      // Scratch mode: stay as "local", never touch backend
      setAutosaveStatus("local");
      return;
    }

    // Skip if hydrating
    if (isHydratingRef.current) {
      setAutosaveStatus("hydrating");
      return;
    }

    const AUTOSAVE_INTERVAL_MS = 10_000;
    const AUTOSAVE_DEBOUNCE_MS = 1_200;

    // --- refs (created once) ---
    if (!globalThis.__rdAutosaveRefs) {
      globalThis.__rdAutosaveRefs = {
        dirty: false,
        inFlight: false,
        lastSavedSig: "",
        lastSaveAt: 0,
        intervalId: null,
        debounceId: null,
      };
    }
    const r = globalThis.__rdAutosaveRefs;

    const buildProjectData = () => {
      const liveFrontSubsCfg = appState?.frontSubsCfg ?? frontSubsCfg;
      const liveRearSubsCfg  = appState?.rearSubsCfg  ?? rearSubsCfg;
      const projectData = serializeProject({
        name: projectNameState,
        roomDims: appState.roomDims,
        dimensions: appState.roomDims, // legacy fields
        screen,
        seatingPositions: appState?.seatingPositions || seatingPositions || [],
        seatsPerRowByRow,
        rowSpacingM,
        placedSpeakers: appState?.speakerSystem?.placedSpeakers || placedSpeakers || [],
        roomElements,
        selectedSpeakersByRole: appState.selectedSpeakersByRole,
        speakerNodes: appState.speakerNodes,
        dolbyLayout: dolbyPreset,
        overlays,
        frozenTabs,
        sevenBedLayoutType,
        frontSubsCfg: liveFrontSubsCfg,
        rearSubsCfg: liveRearSubsCfg,
        subwoofers:
  (Array.isArray(appState?.subwoofers) && appState.subwoofers.length > 0)
    ? appState.subwoofers
    : deriveSubwoofersFromCfg(liveFrontSubsCfg, liveRearSubsCfg, appState?.roomDims, stableDimensions),
        lcrAimMode,
        enableFrontWides,
        free_move_lcr: !!freeMoveLcr,
        overheadGlobalModel,
        overheadFrontOverride,
        overheadMidOverride,
        overheadRearOverride,
        useFrontGlobal,
        useMidGlobal,
        useRearGlobal,
        screenFrontPlaneM: appState.screenFrontPlaneM,
        splConfig: appState.splConfig
      });

      // IMPORTANT: autosave must never rename a project
      delete projectData.name;
      delete projectData.client_name;

      return projectData;
    };

    const computeSig = (data) => {
      try {
        return JSON.stringify(data);
      } catch {
        // If something non-serialisable ever slips in, treat as "changed"
        return String(Date.now());
      }
    };

    const trySaveNow = async () => {
      if (!effectiveProjectId) return;
      if (isHydratingRef.current) return;

      // Only save when dirty, and avoid overlapping writes
      if (!r.dirty || r.inFlight) return;

      // Enforce "no-noise" cadence
      const now = Date.now();
      if (r.lastSaveAt && (now - r.lastSaveAt) < AUTOSAVE_INTERVAL_MS) {
        return;
      }

      r.inFlight = true;
      setAutosaveStatus("saving");

      try {
        const data = buildProjectData();
        const sig = computeSig(data);

        // If nothing really changed since last commit, clear dirty and stop
        if (sig === r.lastSavedSig) {
          r.dirty = false;
          setAutosaveStatus("saved");
          r.inFlight = false;
          return;
        }

        await Project.update(effectiveProjectId, data);

        // Ensure our local state keeps the id we just wrote to
        if (!projectIdState) {
          setProjectIdState(effectiveProjectId);
        }

        r.lastSavedSig = sig;
        r.lastSaveAt = Date.now();
        r.dirty = false;
        setAutosaveStatus("saved");
      } catch (e) {
        if (globalThis.__B44_LOGS) console.error("Error during autosave:", e);
        setAutosaveStatus("error");
      } finally {
        r.inFlight = false;
      }
    };

    // Mark dirty (but only if the serialised payload changed)
    try {
      const sig = computeSig(buildProjectData());
      if (sig !== r.lastSavedSig) {
        r.dirty = true;
        setAutosaveStatus("dirty");
      } else {
        // If we're already in sync, keep it calm
        if (!r.inFlight) setAutosaveStatus("saved");
        r.dirty = false;
      }
    } catch {
      // If build fails for any reason, stay dirty (but do not crash)
      r.dirty = true;
      setAutosaveStatus("dirty");
    }

    // Debounce: save soon after a pause, but still obey the 10s cadence inside trySaveNow()
    if (r.debounceId) clearTimeout(r.debounceId);
    r.debounceId = setTimeout(() => {
      void trySaveNow();
    }, AUTOSAVE_DEBOUNCE_MS);

    // Interval: ensure we commit at least every 10 seconds while dirty
    if (!r.intervalId) {
      r.intervalId = setInterval(() => {
        void trySaveNow();
      }, AUTOSAVE_INTERVAL_MS);
    }

    return () => {
      if (r.debounceId) {
        clearTimeout(r.debounceId);
        r.debounceId = null;
      }
      // NOTE: we intentionally keep the interval alive for this mounted RoomDesigner instance
      // It will be naturally cleared when the page unmounts (full navigation / remount).
    };
  }, [
  projectIdState,
  projectIdFromUrl,
  projectNameState,
  dolbyPreset,
  screen,
  seatingPositions,
  placedSpeakers,
  roomElements,
  overlays,
  frozenTabs,
  sevenBedLayoutType,
  appState.frontSubsCfg,
  appState.rearSubsCfg,
  lcrAimMode,
  enableFrontWides,
  appState.roomDims,
  appState.selectedSpeakersByRole,
  appState.speakerNodes,
  overheadGlobalModel,
  overheadFrontOverride,
  overheadMidOverride,
  overheadRearOverride,
  useFrontGlobal,
  useMidGlobal,
  useRearGlobal,
  rowSpacingM,
  appState.screenFrontPlaneM,
  seatsPerRowByRow,
  appState.splConfig,
  freeMoveLcr]
  );

  // Boot logic: run when hydrated or target changes – either load a project or initialise defaults
  useEffect(() => {
    // CRITICAL: Wait for AppStateProvider to finish autosave restore before applying defaults
    if (!appState?.isHydrated) return;

    // Derive current boot target key
    const currentTargetKey = !isProjectMode
      ? "scratch"
      : "project:" + (projectIdFromUrl || projectIdState || "");

    // Already booted for this exact target? Do nothing.
    if (lastBootTargetRef.current === currentTargetKey) return;

    // Scratch mode: skip backend load entirely, ensure state reflects local draft
    if (!isProjectMode) {
      setLoadState({ phase: "scratch" });
      setAutosaveStatus("local");
      // Free Use starter: always apply clean state on scratch boot, overrides any stale autosave
      {
        const freeUseRoom = { widthM: 4.0, lengthM: 6.0, heightM: 2.4 };
        if (typeof appState?.setRoomDims === "function") {
          appState.setRoomDims(freeUseRoom);
        }
        if (typeof setScreen === "function") {
          setScreen((prev) => ({
            ...prev,
            visibleWidthInches: 120,
            aspectRatio: prev?.aspectRatio || "16:9",
            mountMode: "floating",
            floatDepthM: typeof prev?.floatDepthM === "number" ? prev.floatDepthM : 0.2,
            heightFromFloorM: 0.5,
          }));
        }
        // 57.5° seating row for 120" screen, measured from the screen plane (not the front wall)
        const cx = freeUseRoom.widthM / 2;
        const THETA = 57.5 * Math.PI / 180;
        const viewWidthM = 120 * 0.0254;
        const d = (viewWidthM / 2) / Math.tan(THETA / 2);
        const screenPlaneY = 0.20; // matches default floatDepthM used by MLP effect fallback
        const y = Math.max(0.4, Math.min(freeUseRoom.lengthM - 0.4, screenPlaneY + d));
        const spacing = 0.6;

        // Publish matching seating/MLP state so all downstream logic starts from the same anchor
        if (typeof appState?.setSeatingRows === "function") appState.setSeatingRows(1);
        if (typeof appState?.setSeatsPerRow === "function") appState.setSeatsPerRow(3);
        if (typeof appState?.setSeatsPerRowByRow === "function") appState.setSeatsPerRowByRow([3]);
        if (typeof appState?.setSeatSpacing === "function") appState.setSeatSpacing(0.6);
        if (typeof appState?.setRowSpacingM === "function") appState.setRowSpacingM(1.8);
        if (typeof appState?.setSeatingBlockOffset === "function") appState.setSeatingBlockOffset(0);
        if (typeof appState?.setMlpBasis === "function") appState.setMlpBasis("front");
        if (typeof appState?.setRowCentersM === "function") appState.setRowCentersM([y]);
        if (typeof appState?.setMlpY_m === "function") appState.setMlpY_m(y);
        if (typeof appState?.setMlpOverride === "function") appState.setMlpOverride(null);

        if (typeof setSeatingPositions === "function") {
          setSeatingPositions([
            { id: "seat-left",   x: cx - spacing, y, z: 1.2, rowNumber: 1, seatNumber: 1 },
            { id: "seat-center", x: cx,            y, z: 1.2, rowNumber: 1, seatNumber: 2, isPrimary: true },
            { id: "seat-right",  x: cx + spacing,  y, z: 1.2, rowNumber: 1, seatNumber: 3 },
          ]);
        }
        // Explicitly clear speakers — no preset seeding
        if (typeof setSpeakerSystem === "function") {
          setSpeakerSystem((prev) => ({ ...(prev || {}), placedSpeakers: [] }));
        }
      }
      lastBootTargetRef.current = currentTargetKey;
      return;
    }

    const controller = new AbortController();

    try {
      if (projectIdFromUrl || projectIdState) {
        // We have a real project (from URL or from session) – load it once per target.
        const idToLoad = projectIdFromUrl || projectIdState;
        if (idToLoad) {
          lastBootTargetRef.current = currentTargetKey;
          setProjectIdState(idToLoad);
          loadProject(controller.signal, idToLoad);
        }
      } else {
        // No project at all – this is a fresh, local-only design.
        // Only initialise defaults if nothing has been laid out yet.
        const hasSpeakers =
        Array.isArray(placedSpeakers) && placedSpeakers.length > 0;
        const hasSeats =
        Array.isArray(seatingPositions) && seatingPositions.length > 0;

        if (!hasSpeakers && !hasSeats && appState?.roomDims) {
          lastBootTargetRef.current = currentTargetKey;
          if (typeof initWithDefaultsAndRules === "function") {
            initWithDefaultsAndRules();
          }
        }
      }
    } catch (e) {
      if (globalThis.__B44_LOGS) console.error("[RoomDesigner] boot init error:", e);
    }

    return () => controller.abort();
  }, [
  appState?.isHydrated,
  isProjectMode,
  projectIdFromUrl,
  projectIdState,
  appState?.roomDims,
  initWithDefaultsAndRules,
  loadProject,
  setProjectIdState]
  );

  const manualSaveProject = useCallback(async () => {
    // Scratch mode: no backend write, stay local
    if (!isProjectMode) {
      setAutosaveStatus("local");
      return { success: true, local: true };
    }

    setAutosaveStatus("saving");

    // Work out which project we are saving into:
    // 1) local state set by loader
    // 2) id from URL query (?project=...)
    const effectiveProjectId = projectIdState || projectIdFromUrl || null;

    try {
      // DEBUG: Capture pre-save snapshot
      const debugSnapshot = {
        projectIdState,
        projectIdFromUrl,
        effectiveProjectId,
        projectNameState,
        roomDims: appState.roomDims,
        seatingCount: Array.isArray(seatingPositions) ? seatingPositions.length : null,
        placedSpeakerCount: Array.isArray(placedSpeakers) ? placedSpeakers.length : null
      };
const liveFrontSubsCfg = appState?.frontSubsCfg ?? frontSubsCfg;
const liveRearSubsCfg  = appState?.rearSubsCfg  ?? rearSubsCfg;
      const projectData = serializeProject({
        name: projectNameState,
        roomDims: appState.roomDims,
        dimensions: appState.roomDims, // Use appState.roomDims directly (serializeProject needs legacy fields)
        screen,
        seatingPositions: appState?.seatingPositions || seatingPositions || [],
        seatsPerRowByRow,
        rowSpacingM,
        placedSpeakers: appState?.speakerSystem?.placedSpeakers || placedSpeakers || [],
        roomElements,
        selectedSpeakersByRole: appState.selectedSpeakersByRole,
        speakerNodes: appState.speakerNodes,
        dolbyLayout: dolbyPreset,
        overlays,
        frozenTabs,
        sevenBedLayoutType,
        frontSubsCfg: liveFrontSubsCfg,
        rearSubsCfg: liveRearSubsCfg,
        subwoofers:
  (Array.isArray(appState?.subwoofers) && appState.subwoofers.length > 0)
    ? appState.subwoofers
    : deriveSubwoofersFromCfg(liveFrontSubsCfg, liveRearSubsCfg, appState?.roomDims, stableDimensions),
        lcrAimMode,
        enableFrontWides,
        overheadGlobalModel,
        overheadFrontOverride,
        overheadMidOverride,
        overheadRearOverride,
        useFrontGlobal,
        useMidGlobal,
        useRearGlobal,
        screenFrontPlaneM: appState.screenFrontPlaneM,
        splConfig: appState.splConfig
      });

      // DEBUG: Log what we're about to save
      if (globalThis.__B44_LOGS) console.log('[RD] manualSaveProject payload', effectiveProjectId, {
        room: { w: projectData.room_width, l: projectData.room_length, h: projectData.room_height },
        seating_count: projectData.seating_positions ? JSON.parse(projectData.seating_positions).length : 0,
        speakers_count: projectData.selected_speakers ? JSON.parse(projectData.selected_speakers).length : 0,
        screen_size: projectData.screen_size,
        dolby: projectData.dolby_config
      });
      if (globalThis.__B44_LOGS) console.log('[RD] manualSaveProject payload', {
        debugSnapshot,
        projectDataPreview: {
          effectiveProjectId,
          name: projectData.name,
          room_width: projectData.room_width,
          room_length: projectData.room_length,
          room_height: projectData.room_height,
          seating_positions: typeof projectData.seating_positions === 'string' ?
          projectData.seating_positions.slice(0, 200) :
          projectData.seating_positions,
          selected_speakers: typeof projectData.selected_speakers === 'string' ?
          projectData.selected_speakers.slice(0, 200) :
          projectData.selected_speakers
        }
      });

      let savedProject;

      if (effectiveProjectId) {
        // Updating an existing project.
        // Do not let RoomDesigner rename it.
        delete projectData.name;
        delete projectData.client_name;

        savedProject = await Project.update(effectiveProjectId, projectData);

        // Make sure our local state tracks this id
        if (!projectIdState) {
          setProjectIdState(effectiveProjectId);
        }
      } else {
        // First-time save: create a brand new project.
        savedProject = await Project.create(projectData);

        if (savedProject?.id) {
          const newId = savedProject.id;
          setProjectIdState(newId);
          // Keep URL in sync so future loads work correctly
          try {
            const url = new URL(window.location.href);
            url.searchParams.set("project", newId);
            window.history.replaceState({}, "", url.toString());
          } catch (e) {
            if (globalThis.__B44_LOGS) console.error("Failed to update URL with new project id:", e);
          }
        }
      }

      if (savedProject) {
        // DEBUG: Log what came back from save
        if (globalThis.__B44_LOGS) console.log('[RD] manualSaveProject result', {
          projectIdState,
          effectiveProjectId,
          savedId: savedProject?.id,
          name: savedProject?.name,
          client_name: savedProject?.client_name
        });

        // DEBUG: One-shot reload to verify we can read back what we wrote
        if (effectiveProjectId && typeof loadProject === 'function') {
          if (globalThis.__B44_LOGS) console.log('[RD] manualSaveProject -> reloading project after save', { effectiveProjectId });
          try {
            await loadProject(undefined, effectiveProjectId);
          } catch (e) {
            if (globalThis.__B44_LOGS) console.error('[RD] reload after save failed', e);
          }
        }

        setAutosaveStatus("saved");
        return { success: true };
      } else {
        setAutosaveStatus("error");
        if (globalThis.__B44_LOGS) console.error("Failed to save project: No response from server.");
        return { success: false, error: "Save operation failed." };
      }
    } catch (e) {
      setAutosaveStatus("error");
      if (globalThis.__B44_LOGS) console.error("Error during manual save:", e);
      return { success: false, error: e.message || String(e) };
    }
  }, [
  projectIdState,
  projectIdFromUrl,
  projectNameState,
  dolbyPreset,
  screen,
  seatingPositions,
  placedSpeakers,
  roomElements,
  overlays,
  frozenTabs,
  sevenBedLayoutType,
  frontSubsCfg,
  rearSubsCfg,
  lcrAimMode,
  enableFrontWides,
  appState.roomDims,
  appState.selectedSpeakersByRole,
  appState.speakerNodes,
  overheadGlobalModel,
  overheadFrontOverride,
  overheadMidOverride,
  overheadRearOverride,
  useFrontGlobal,
  useMidGlobal,
  useRearGlobal,
  rowSpacingM,
  appState.screenFrontPlaneM,
  seatsPerRowByRow,
  appState.splConfig,
  freeMoveLcr]
  );

  return {
    projectId: projectIdState,
    projectName: projectNameState,
    loadState,
    autosaveStatus,
    handleSaveProject: manualSaveProject,
    reloadProject
  };
}