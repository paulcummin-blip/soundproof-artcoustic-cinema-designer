// Extracted verbatim from src/pages/RoomDesigner.jsx (lines 204–1132)
import { useState, useCallback, useEffect, useRef } from "react";
import { Project } from "@/entities/Project";
import { serializeProject } from "@/components/utils/serializeProject";
import { deriveSubwoofersFromCfg } from "@/components/utils/deriveSubwoofersFromCfg";
import { parseProjectJson } from "@/components/roomdesigner/RoomDesignerHelpers";
import { hydrateProjectIntoAppState } from "@/components/utils/hydrateProjectIntoAppState";

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
  // NEW: Bed-layer surround persistence
  globalSurroundModel,
  setGlobalSurroundModel,
  extraSurroundCount,
  setExtraSurroundCount,
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

  // SHARED PAYLOAD BUILDER — single source of truth for both autosave and manual save.
  // Both paths must use this function so their signatures are always identical.
  const buildSharedProjectPayload = useCallback(() => {
    const liveFrontSubsCfg = appState?.frontSubsCfg ?? frontSubsCfg;
    const liveRearSubsCfg  = appState?.rearSubsCfg  ?? rearSubsCfg;
    const projectData = serializeProject({
      name: projectNameState,
      roomDims: appState.roomDims,
      dimensions: appState.roomDims,
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
      lcrAimMode,
      enableFrontWides,
      free_move_lcr: !!freeMoveLcr,
      globalSurroundModel: appState?.globalSurroundModel ?? globalSurroundModel,
      extraSurroundCount: appState?.extraSurroundCount ?? extraSurroundCount,
      overheadGlobalModel,
      overheadFrontOverride,
      overheadMidOverride,
      overheadRearOverride,
      useFrontGlobal,
      useMidGlobal,
      useRearGlobal,
      screenFrontPlaneM: appState.screenFrontPlaneM,
      splConfig: appState.splConfig,
      p12Mode: appState.p12Mode,
      p12Level: appState.p12Level,
    });
    return projectData;
  }, [
    projectNameState, appState, frontSubsCfg, rearSubsCfg, screen,
    seatingPositions, seatsPerRowByRow, rowSpacingM, placedSpeakers,
    roomElements, dolbyPreset, overlays, frozenTabs, sevenBedLayoutType,
    lcrAimMode, enableFrontWides, freeMoveLcr,
    overheadGlobalModel, overheadFrontOverride, overheadMidOverride, overheadRearOverride,
    useFrontGlobal, useMidGlobal, useRearGlobal,
  ]);

  const parseMaybe = useCallback((val, fallback) => {
    if (val == null) return fallback;
    if (Array.isArray(val)) return val;
    if (typeof val === "object") return val; // plain object from API — return as-is
    if (typeof val === "string" && val.trim()) {
      try {return JSON.parse(val);} catch {/* ignore */}
    }
    return fallback;
  }, []);

  const activeProjectId = (() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get("projectId") || params.get("project") || params.get("id") || projectIdFromUrl || null;
    } catch {
      return projectIdFromUrl || null;
    }
  })();

  const hydrateFromProject = useCallback((p) => {
    if (!p) return;

    // DEBUG: Log what we're loading
    if (globalThis.__B44_LOGS) console.log('[RD] hydrateFromProject', {
      id: p.id, name: p.name,
      seating_positions: typeof p.seating_positions === 'string' ? p.seating_positions.slice(0, 200) : p.seating_positions,
      selected_speakers: typeof p.selected_speakers === 'string' ? p.selected_speakers.slice(0, 200) : p.selected_speakers
    });

    hydrateProjectIntoAppState(p, appState, {
      setScreen, setDolbyConfig, setDolbyPreset,
      setSevenBedLayoutType, setLcrAimMode, setEnableFrontWides, setFreeMoveLcr,
      setOverheadGlobalModel, setOverheadFrontOverride, setOverheadMidOverride, setOverheadRearOverride,
      setUseFrontGlobal, setUseMidGlobal, setUseRearGlobal,
      setRowSpacingM, setSeatsPerRowByRow,
      setOverlays, setSeatingPositions, setRoomElements,
      setFrontSubsCfg, setRearSubsCfg,
      setSelectedSpeakersByRole, setSpeakerNodes, setSpeakerSystem,
      setGlobalSurroundModel,
      setExtraSurroundCount,
    });
  }, [
  appState?.setRoomDims,
  setScreen, setDolbyConfig, setDolbyPreset, setSevenBedLayoutType, setLcrAimMode,
  setEnableFrontWides, setFreeMoveLcr,
  setOverheadGlobalModel, setOverheadFrontOverride, setOverheadMidOverride, setOverheadRearOverride,
  setUseFrontGlobal, setUseMidGlobal, setUseRearGlobal,
  setRowSpacingM, setSeatsPerRowByRow,
  setOverlays, setSeatingPositions, setRoomElements,
  setFrontSubsCfg, setRearSubsCfg,
  setSelectedSpeakersByRole, setSpeakerNodes, setSpeakerSystem]
  );


  const loadProject = useCallback(async (signal, idOverride) => {
    const id = idOverride || activeProjectId || projectIdState;
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

      // Stamp the loaded signature using the same serializeProject() shape that
      // autosave/manual save compare against, so the autosave effect does not
      // falsely mark the freshly loaded project as dirty.
      const loadedId = p?.id || id;
      if (loadedId) {
        const loadedRefKey = `__rdAutosaveRefs_${loadedId}`;
        if (!globalThis[loadedRefKey]) {
          globalThis[loadedRefKey] = {
            dirty: false, inFlight: false,
            lastSavedSig: "", lastQueuedSig: "",
            lastSaveAt: 0, intervalId: null, debounceId: null, saveToken: 0,
          };
        }
        const rLoad = globalThis[loadedRefKey];

        // Parse entity fields exactly as hydrateProjectIntoAppState does,
        // then feed them into serializeProject() so the sig format matches autosave.
        const _parseMaybe = (val, fallback) => {
          if (val == null) return fallback;
          if (Array.isArray(val) || (typeof val === "object")) return val;
          if (typeof val === "string" && val.trim()) { try { return JSON.parse(val); } catch { /* */ } }
          return fallback;
        };
        let loadedRoomDims = { widthM: 4.5, lengthM: 6.0, heightM: 2.4 };
        if (p?.roomDims) {
          try {
            const rd = JSON.parse(p.roomDims);
            loadedRoomDims = { widthM: Number(rd?.widthM ?? rd?.width) || 4.5, lengthM: Number(rd?.lengthM ?? rd?.length) || 6.0, heightM: Number(rd?.heightM ?? rd?.height) || 2.4 };
          } catch { loadedRoomDims = { widthM: Number(p?.room_width) || 4.5, lengthM: Number(p?.room_length) || 6.0, heightM: Number(p?.room_height) || 2.4 }; }
        } else {
          loadedRoomDims = { widthM: Number(p?.room_width) || 4.5, lengthM: Number(p?.room_length) || 6.0, heightM: Number(p?.room_height) || 2.4 };
        }
        const loadedScreen = {
          visibleWidthInches: Number(p?.screen_size) || 120,
          aspectRatio: p?.aspect_ratio || "16:9",
          manualMode: !!p?.manual_dimensions,
          manualWidthM: Number(p?.manual_width_m) || 0,
          manualHeightM: Number(p?.manual_height_m) || 0,
          mountMode: p?.screen_mount_mode || "floating",
          floatDepthM: Number(p?.float_depth_m) || 0.2,
          showScreenPlane: !!p?.show_screen_plane,
          showCavity: !!p?.show_cavity,
          speakerClearanceM: Number(p?.speaker_clearance_m) || 0.02,
          heightFromFloorM: typeof p?.screen_height_from_floor === "number" ? p.screen_height_from_floor : 0.5,
        };
        const loadedFrontSubsCfg = _parseMaybe(p?.front_subs_cfg ?? p?.frontSubsCfg, null);
        const loadedRearSubsCfg  = _parseMaybe(p?.rear_subs_cfg  ?? p?.rearSubsCfg,  null);
        const loadedProjectData = serializeProject({
          name: p?.name || "Untitled Room",
          roomDims: loadedRoomDims,
          dimensions: loadedRoomDims,
          screen: loadedScreen,
          seatingPositions: _parseMaybe(p?.seating_positions, []),
          seatsPerRowByRow: _parseMaybe(p?.seats_per_row_by_row, []),
          rowSpacingM: Number(p?.row_spacing_m) || 1.8,
          placedSpeakers: _parseMaybe(p?.selected_speakers, []),
          roomElements: _parseMaybe(p?.room_elements, []),
          selectedSpeakersByRole: _parseMaybe(p?.selected_speakers_by_role, {}),
          speakerNodes: _parseMaybe(p?.spl_speaker_nodes, []),
          dolbyLayout: p?.dolby_config || "5.1",
          overlays: _parseMaybe(p?.overlays, {}),
          frozenTabs: _parseMaybe(p?.frozen_tabs, {}),
          sevenBedLayoutType: p?.seven_bed_layout_type || "rears",
          frontSubsCfg: loadedFrontSubsCfg,
          rearSubsCfg: loadedRearSubsCfg,
          lcrAimMode: p?.lcr_aim_mode || "angled",
          enableFrontWides: !!p?.enable_front_wides,
          free_move_lcr: !!p?.free_move_lcr,
          globalSurroundModel: p?.global_surround_model || null,
          extraSurroundCount: Number(p?.extra_surround_count) || 0,
          overheadGlobalModel: p?.overhead_global_model || null,
          overheadFrontOverride: p?.overhead_front_override || null,
          overheadMidOverride: p?.overhead_mid_override || null,
          overheadRearOverride: p?.overhead_rear_override || null,
          useFrontGlobal: typeof p?.use_front_global === "boolean" ? p.use_front_global : true,
          useMidGlobal: typeof p?.use_mid_global === "boolean" ? p.use_mid_global : true,
          useRearGlobal: typeof p?.use_rear_global === "boolean" ? p.use_rear_global : true,
          screenFrontPlaneM: (() => { const v = Number(p?.screen_front_plane_m); return Number.isFinite(v) ? v : 0; })(),
          splConfig: _parseMaybe(p?.spl_config, null),
          p12Mode: p?.spl_config?.p12_mode ?? null,
          p12Level: p?.spl_config?.p12_level ?? null,
        });
        delete loadedProjectData.name;
        delete loadedProjectData.client_name;

        let loadedSig = "";
        try { loadedSig = JSON.stringify(loadedProjectData); } catch { loadedSig = ""; }
        rLoad.lastSavedSig = loadedSig;
        rLoad.lastQueuedSig = loadedSig;
        rLoad.dirty = false;
        // preserve saveToken if already set by a prior save in this session
      }
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
    const isCurrentlyHydrating = loadState.phase === "loading" || activeProjectId && loadState.phase !== "loaded" && loadState.phase !== "error";
    isHydratingRef.current = isCurrentlyHydrating;
  }, [loadState.phase, activeProjectId]);


  // Auto-save ONLY for an existing project.
  // Quiet autosave: mark dirty on changes, then commit at most every 10s (and also on short pauses).
  useEffect(() => {
    const effectiveProjectId = activeProjectId || projectIdState || null;
    if (!effectiveProjectId) {
      // Scratch mode: stay as "local", never touch backend
      setAutosaveStatus("local");
      return;
    }

    // Skip if hydrating
    if (isHydratingRef.current) {
      setAutosaveStatus("hydrating");
      return;
    }

    const AUTOSAVE_INTERVAL_MS = 30_000;
    const AUTOSAVE_DEBOUNCE_MS = 1_000;

    // --- refs (keyed per project so stale sigs from a previous project don't bleed in) ---
    const refKey = `__rdAutosaveRefs_${effectiveProjectId}`;
    if (!globalThis[refKey]) {
      globalThis[refKey] = {
        dirty: false,
        inFlight: false,
        lastSavedSig: "",
        lastQueuedSig: "",
        lastSaveAt: 0,
        intervalId: null,
        debounceId: null,
        saveToken: 0, // incremented by any save that wins; stale completions check this before stamping
      };
    }
    const r = globalThis[refKey];

    const buildProjectData = () => {
      const data = buildSharedProjectPayload();
      // Autosave must never rename a project
      delete data.name;
      delete data.client_name;
      return data;
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

      r.inFlight = true;
      setAutosaveStatus("saving");

      // Capture the token BEFORE the await so we can detect if a manual save
      // completed while this autosave was in flight and already incremented it.
      const myToken = r.saveToken;

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

        // If a manual save completed while we were awaiting, its token bump means
        // our result is now stale — do not overwrite the newer stamped state.
        if (r.saveToken !== myToken) {
          // Do not stamp old state, but resolve the badge to the correct calm
          // state based on what the winning save already recorded in the bucket.
          setAutosaveStatus(r.dirty ? "dirty" : "saved");
          return;
        }

        // Ensure our local state keeps the id we just wrote to
        if (!projectIdState) {
          setProjectIdState(effectiveProjectId);
        }

        r.lastSavedSig = sig;
        r.lastQueuedSig = sig;
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

    // Compute signature once — used to decide whether to queue a new debounce
    let currentSig = "";
    try {
      currentSig = computeSig(buildProjectData());
    } catch {
      currentSig = String(Date.now()); // treat as changed if build fails
    }

    if (currentSig === r.lastSavedSig) {
      // Already in sync — no need to queue anything
      if (!r.inFlight) setAutosaveStatus("saved");
      r.dirty = false;
    } else if (currentSig !== r.lastQueuedSig) {
      // Payload has changed AND differs from what is already queued — reschedule
      r.dirty = true;
      r.lastQueuedSig = currentSig;
      setAutosaveStatus("dirty");
      if (r.debounceId) clearTimeout(r.debounceId);
      r.debounceId = setTimeout(() => {
        void trySaveNow();
      }, AUTOSAVE_DEBOUNCE_MS);
    }
    // else: payload changed but matches what is already queued — leave the pending debounce alone

    // Interval: ensure we commit at least every 30 seconds while dirty
    if (!r.intervalId) {
      r.intervalId = setInterval(() => {
        void trySaveNow();
      }, AUTOSAVE_INTERVAL_MS);
    }

    // Cleanup: clear the interval and debounce for THIS project bucket when the effect
    // re-runs (project switch, scratch transition) or the component unmounts.
    // This prevents stale intervals from a previous effectiveProjectId continuing to
    // call trySaveNow() — and therefore Project.update() and setAutosaveStatus() —
    // against the wrong project or after the component is gone.
    return () => {
      if (r.intervalId) {
        clearInterval(r.intervalId);
        r.intervalId = null;
      }
      if (r.debounceId) {
        clearTimeout(r.debounceId);
        r.debounceId = null;
      }
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
  freeMoveLcr,
  appState?.globalSurroundModel,
  appState?.extraSurroundCount]
  );

  // Boot logic: run when hydrated or target changes – either load a project or initialise defaults
  useEffect(() => {
    // CRITICAL: Wait for AppStateProvider to finish autosave restore before applying defaults
    if (!appState?.isHydrated) return;

    const effectiveProjectId = activeProjectId || projectIdState || null;

    // Derive current boot target key
    const currentTargetKey = effectiveProjectId
      ? "project:" + effectiveProjectId
      : "scratch";

    // Already booted for this exact target? Do nothing.
    if (lastBootTargetRef.current === currentTargetKey) return;

    // Scratch mode: skip backend load entirely, ensure state reflects local draft
    if (!effectiveProjectId) {
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
      lastBootTargetRef.current = currentTargetKey;
      setProjectIdState(effectiveProjectId);
      loadProject(controller.signal, effectiveProjectId);
    } catch (e) {
      if (globalThis.__B44_LOGS) console.error("[RoomDesigner] boot init error:", e);
    }

    return () => controller.abort();
  }, [
  appState?.isHydrated,
  activeProjectId,
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

    // Reuse the same per-project bucket as autosave so we share the inFlight lock
    const savedRefKey = `__rdAutosaveRefs_${effectiveProjectId}`;
    if (!globalThis[savedRefKey]) {
      globalThis[savedRefKey] = {
        dirty: false,
        inFlight: false,
        lastSavedSig: "",
        lastQueuedSig: "",
        lastSaveAt: 0,
        intervalId: null,
        debounceId: null,
        saveToken: 0,
      };
    }
    const rMS = globalThis[savedRefKey];

    // Block if autosave already owns the lock
    if (rMS.inFlight) {
      setAutosaveStatus("saving");
      return { success: false, error: "Save already in progress." };
    }
    rMS.inFlight = true;

    try {
      // Use shared payload builder — identical shape to autosave so signatures always match.
      const projectData = buildSharedProjectPayload();

      // DEBUG: Log what we're about to save
      if (globalThis.__B44_LOGS) console.log('[RD] manualSaveProject payload', effectiveProjectId, {
        room: { w: projectData.room_width, l: projectData.room_length, h: projectData.room_height },
        seating_count: Array.isArray(projectData.seating_positions) ? projectData.seating_positions.length : 0,
        speakers_count: Array.isArray(projectData.selected_speakers) ? projectData.selected_speakers.length : 0,
        screen_size: projectData.screen_size,
        dolby: projectData.dolby_config
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
        if (globalThis.__B44_LOGS) console.log('[RD] manualSaveProject result', {
          projectIdState, effectiveProjectId, savedId: savedProject?.id,
        });

        // Stamp the saved signature NOW (before any reload that re-hydrates state)
        // so the autosave effect does not see the post-hydration state as dirty.
        const savedSig = (() => { try { return JSON.stringify(projectData); } catch { return ""; } })();
        // Bump the token so any autosave that was in-flight before this point
        // will see r.saveToken !== myToken after its own await and abort its stamp.
        rMS.saveToken = (rMS.saveToken || 0) + 1;
        rMS.lastSavedSig = savedSig;
        rMS.lastQueuedSig = savedSig;
        rMS.lastSaveAt = Date.now();
        rMS.dirty = false;

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
    } finally {
      rMS.inFlight = false;
    }
  }, [
  buildSharedProjectPayload,
  projectIdState,
  projectIdFromUrl,
  isProjectMode]
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