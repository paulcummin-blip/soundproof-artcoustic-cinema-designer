
"use client";
import React, { useState, useMemo, useCallback, useEffect, useRef, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Save, AlertCircle, RotateCcw, Compass, Layers3, Ruler, Monitor, Users, Speaker, Waves, Box, FileText } from "lucide-react";
import { Project } from "@/entities/Project"; // Import the Project entity SDK
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SidebarInset } from "@/components/ui/sidebar"; // NEW: Import SidebarInset
import { CollapsiblePanel } from "@/components/ui/CollapsiblePanel";

import AppStateProvider, { useAppState, useScreenFrontPlaneY } from "@/components/AppStateProvider";

// Hooks and utils (kept eager; they are light and provide guards below)
import { useRP22AnalysisEngine } from "@/components/hooks/useRP22AnalysisEngine";
import { getQueryParam } from "@/components/utils/query";
import { computeMLPAndPrimary } from "@/components/utils/computeMLPAndPrimary";
import { serializeProject } from "@/components/utils/serializeProject";
import { equalizeBedAngles } from "@/components/optimizer/equalizeBedAngles";
import { getBedPads, computeFrontRowCenter } from "@/components/room/padsGeometry";
import { backSweepGaps, backSweepGap2 } from "@/components/utils/surroundBackSweep";
import { placeSubsForFrontWall } from "@/components/room/utils/placeSubs";
import { debug } from "@/components/utils/consolePolyfill";
import { safeGroup, safeTable } from "@/components/utils/safeLog"; // NEW: Import safe logging
import { getSpeakerModelMeta } from "@/components/models/speakers/registry"; // NEW: For model metadata
import { calculateLcrConstraints } from "@/components/room/constraints/lcrConstraints"; // NEW: For LCR constraints
import { placeSubwoofers } from '@/components/room/placement/placeSubwoofers'; // NEW import // FIX: Added 'from' keyword
import { computeFrontWideZonesStrict } from "@/components/utils/frontWideZones"; // NEW import
import { SHOW_DEBUG_LOGS } from '../components/utils/diagnostics'; // NEW: Import SHOW_DEBUG_LOGS
import { distanceFor57_5FromWidth, buildRowCenters } from '@/components/room/seatingUtils';

// NEW: Helper hook for URL query parameters - SSR Safe
function useUrlQuery() {
  const [projectId, setProjectId] = React.useState(null);

  React.useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      setProjectId(params.get("project"));
    } catch {
      setProjectId(null);
    }
  }, []);

  return { projectId };
}

// Put near your other helpers in RoomDesigner.js
const CANON_MAP = { LS:'SL', SL:'SL', RS:'SR', SR:'SR', RL:'SBL', RR:'SBR', RSL:'SBL', RSR:'SBR', LRS:'SBL', RRS:'SBR', FWL:'LW', FWR:'RW', LW:'LW', RW:'RW', SBL:'SBL', SBR:'SBR', FL:"FL", L:"FL", FC:"FC", C:"FC", FR:"FR", R:"FR", TFL:"TFL", TFR:"TFR", TL:"TL", TML:"TL", TR:"TR", TMR:"TR", TBL:"TBL", TBR:"TBR" };
const canon = r => CANON_MAP[String(r||'').toUpperCase()] || String(r||'').toUpperCase();

// Safe wrapper for role canonicalization
const safeCanon = (r) => {
  try { return canon(r); } catch { return String(r || "").toUpperCase(); }
};

function carryModel(prevSpeakers, roleFrom, roleTo, fallbackHint = null) {
  const byCanon = new Map();
  (prevSpeakers||[]).forEach(s => byCanon.set(safeCanon(s.role), s));

  const from = byCanon.get(safeCanon(roleFrom));
  const existing = byCanon.get(safeCanon(roleTo));
  // Priority: keep existing target's model -> carry from source -> fallback hint -> undefined
  return existing?.model ?? from?.model ?? fallbackHint ?? undefined;
}

function cloneRoleWithModel(byRole, fromRole, toRole, fallbackModel) {
  const src = byRole.get(fromRole);
  return {
    id: toRole, role: toRole, label: toRole,
    model: src?.model ?? fallbackModel ?? undefined,
    position: null, // Will be set by caller
  };
}

// Safe debug logging function
function logPlacedSpeakers(message, speakers) {
  const rows = (speakers || []).map(s => ({
    roleRaw: s.role,
    roleCanon: canon(s.role), // Using existing 'canon' function
    model: s.model || "(none)"
  }));

  if (typeof console !== 'undefined' && typeof console.groupCollapsed === 'function') {
    console.groupCollapsed(message);
    if (typeof console.table === 'function') console.table(rows);
    if (typeof console.groupEnd === 'function') console.groupEnd();
  } else if (typeof console !== 'undefined' && typeof console.log === 'function') {
    console.log(message, rows);
  }
}

// NEW: Helper for parsing JSON from project properties
function parseProjectJson(value, defaultValue = null) {
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return parsed;
    } catch (e) {
      console.warn("Failed to parse project JSON:", e);
      return defaultValue;
    }
  }
  return value === undefined ? defaultValue : value;
}

// Helper to extract MLP coordinates from computeMLPAndPrimary
const getMlpPoint = (seatingPositions, mlpBasis, roomDimensions) => {
  if (!Array.isArray(seatingPositions) || seatingPositions.length === 0 || !roomDimensions || !roomDimensions.width || !roomDimensions.length) {
    return null;
  }
  const { mlp } = computeMLPAndPrimary(
    seatingPositions,
    roomDimensions.width,
    roomDimensions.length,
    mlpBasis
  );
  return mlp;
};


// REMOVED: useRoomDimensions hook - now expanded to load SPL speaker data
// The functionalities of useRoomDimensions are now absorbed into AppStateProvider (for dimensions)
// and useProjectLoader (for speaker handoff data).


// Hook to encapsulate project loading, saving, and state management
function useProjectLoader(
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
}) {
  const [projectIdState, setProjectIdState] = useState(projectIdFromUrl || null);
  const [projectNameState, setProjectNameState] = useState("Untitled Room"); // Internal projectName for loader
  const [loadState, setLoadState] = useState({ phase: "idle", error: null, name: null });
  const [autosaveStatus, setAutosaveStatus] = useState("idle");

  const parseMaybe = useCallback((val, fallback) => {
    if (Array.isArray(val)) return val;
    if (typeof val === "string" && val.trim()) {
      try { return JSON.parse(val); } catch { /* ignore */ }
    }
    return fallback;
  }, []);

  const hydrateFromProject = useCallback((p) => {
    // NEW: Load roomDims first (single source of truth)
    if (p?.roomDims && appState?.setRoomDims) {
      try {
        const parsed = JSON.parse(p.roomDims);
        appState.setRoomDims({
          widthM: Number(parsed?.widthM) || Number(p?.room_width) || 4.5,
          lengthM: Number(parsed?.lengthM) || Number(p?.room_length) || 6.0,
          heightM: Number(parsed?.heightM) || Number(p?.room_height) || 2.4,
        });
      } catch (e) {
        // Fallback to legacy fields
        appState.setRoomDims({
          widthM: Number(p?.room_width) || 4.5,
          lengthM: Number(p?.room_length) || 6.0,
          heightM: Number(p?.room_height) || 2.4,
        });
      }
    } else if (appState?.setRoomDims) { // Fallback if no roomDims but legacy fields exist
      appState.setRoomDims({
        widthM: Number(p?.room_width) || 4.5,
        lengthM: Number(p?.room_length) || 6.0,
        heightM: Number(p?.room_height) || 2.4,
      });
    }

    // REMOVED: Redundant `setDimensions` call for legacy fields, now handled by appState.setRoomDims above
    // const width = Number(p?.room_width) || 4.5;
    // const length = Number(p?.room_length) || 6.0;
    // const height = Number(p?.room_height) || 2.8;
    // if (typeof setDimensions === "function") setDimensions({ width_m: width, length_m: length, height_m: height });

    const screenSizeInches = Number(p?.screen_size) || 100;
    const aspectRatio = p?.aspect_ratio || "16:9";
    if (typeof setScreen === "function") setScreen(prev => ({
      ...prev,
      visibleWidthInches: screenSizeInches,
      aspectRatio,
      manualMode: !!p?.manual_dimensions,
      manualWidthM: Number(p?.manual_width_m) || 0,
      manualHeightM: Number(p?.manual_height_m) || 0,
      mountMode: 'floating', // Always force floating mode on load
      floatDepthM: Number(p?.float_depth_m) || 0.2, // Default to 20cm if not present
      showScreenPlane: !!p?.show_screen_plane,
      showCavity: !!p?.show_cavity,
      speakerClearanceM: Number(p?.speaker_clearance_m) || 0.02,
      heightFromFloorM: (typeof (p?.screen_height_from_floor) === "number") ? p.screen_height_from_floor : 0.5,
    }));

    if (typeof setDolbyConfig === "function") setDolbyConfig(p?.dolby_config || "5.1");
    if (typeof setDolbyPreset === "function") setDolbyPreset(p?.dolby_config || "5.1"); // Update local Dolby preset state in RoomDesignerWithState
    if (typeof setSevenBedLayoutType === "function") setSevenBedLayoutType(p?.seven_bed_layout_type || "rears");

    // NEW: Hydrate LCR Aiming Mode
    const hydratedLcrAimMode = p?.lcr_aim_mode;
    if (hydratedLcrAimMode === "flat" || hydratedLcrAimMode === "angled") {
        if (typeof setLcrAimMode === "function") setLcrAimMode(hydratedLcrAimMode);
    }

    // NEW: Hydrate Front Wide Overlay setting
    const hydratedEnableFrontWides = p?.enable_front_wides ?? false;
    if (typeof setEnableFrontWides === "function") setEnableFrontWides(hydratedEnableFrontWides);

    // NEW: Hydrate Overhead channel settings
    if (typeof setOverheadGlobalModel === "function") setOverheadGlobalModel(p?.overheadGlobalModel || null);
    if (typeof setOverheadFrontOverride === "function") setOverheadFrontOverride(p?.overheadFrontOverride || null);
    if (typeof setOverheadMidOverride === "function") setOverheadMidOverride(p?.overheadMidOverride || null);
    if (typeof setOverheadRearOverride === "function") setOverheadRearOverride(p?.overheadRearOverride || null);
    if (typeof setUseFrontGlobal === "function") setUseFrontGlobal(p?.useFrontGlobal ?? true); // Default to true
    if (typeof setUseMidGlobal === "function") setUseMidGlobal(p?.useMidGlobal ?? true);     // Default to true
    if (typeof setUseRearGlobal === "function") setUseRearGlobal(p?.useRearGlobal ?? true);     // Default to true

    // NEW: Hydrate Row Spacing
    if (typeof setRowSpacingM === "function") setRowSpacingM(Number(p?.row_spacing_m) || 1.8);

    // Hydrate screen front plane position
    if (typeof appState?.setScreenFrontPlaneM === 'function') {
      const savedPlaneM = Number(p?.screen_front_plane_m);
      if (Number.isFinite(savedPlaneM)) {
        appState.setScreenFrontPlaneM(savedPlaneM);
      }
    }

    const defaultOverlays = {
        LCR: false, FRONT_WIDE: false, SIDE_SURROUND: false, REAR_SURROUND: false,
        OVERHEADS_2: false, OVERHEADS_4: false, OVERHEADS_6: false, RP22_ANGLES: false, enableDolbyZones: false
    };
    const overlaysData = parseMaybe(p?.overlays, defaultOverlays);
    if(typeof setOverlays === "function") setOverlays({...defaultOverlays, ...overlaysData});

    const sp = parseMaybe(p?.seating_positions, []);
    if (Array.isArray(sp) && typeof setSeatingPositions === "function") setSeatingPositions(sp);

    const re = parseMaybe(p?.room_elements, []);
    if (Array.isArray(re) && typeof setRoomElements === "function") setRoomElements(re);

    // Subwoofers are now automatically placed, so we only need to hydrate their configuration, not positions.
    if (typeof setFrontSubsCfg === "function") setFrontSubsCfg(p?.frontSubsCfg || { count: 1, model: "SUB2-12" });
    if (typeof setRearSubsCfg === "function") setRearSubsCfg(p?.rearSubsCfg || { count: 0, model: null });

    // NEW: Hydrate selectedSpeakersByRole and speakerNodes directly into appState
    if (typeof setSelectedSpeakersByRole === "function") {
      setSelectedSpeakersByRole(p ? parseProjectJson(p?.selected_speakers_by_role) : null);
    }
    if (typeof setSpeakerNodes === "function") {
      setSpeakerNodes(p ? parseProjectJson(p?.spl_speaker_nodes) : null);
    }

    // Hydrate speakers from persistence, but DO NOT clobber runtime state with empties.
    // Prefer new schema (selected_speakers), fall back to legacy (placedSpeakers), else leave as-is.
    const loadedSpeakers = (() => {
      const v1 = parseMaybe(p?.selected_speakers, null);
      if (Array.isArray(v1)) return v1;
      const legacy = parseMaybe(p?.placedSpeakers, null);
      if (Array.isArray(legacy)) return legacy;
      return null;
    })();

    if (typeof setSpeakerSystem === "function") {
      setSpeakerSystem((prev) => {
        // Only adopt loaded speakers if we actually have some.
        if (Array.isArray(loadedSpeakers) && loadedSpeakers.length > 0) {
          return { ...(prev || {}), placedSpeakers: loadedSpeakers };
        }
        // Otherwise, keep current in-memory speakers (prevents the "flash then disappear").
        return prev || {};
      });
    }

  }, [
    appState?.setRoomDims, setScreen, setDolbyConfig, setDolbyPreset, setSevenBedLayoutType, setSeatingPositions,
    setRoomElements, setOverlays, parseMaybe, setSpeakerSystem, setFrontSubsCfg, setRearSubsCfg, setLcrAimMode,
    setEnableFrontWides, setOverheadGlobalModel, setOverheadFrontOverride, setOverheadMidOverride,
    setOverheadRearOverride, setUseFrontGlobal, setUseMidGlobal, setUseRearGlobal, setRowSpacingM,
    setSelectedSpeakersByRole, setSpeakerNodes, appState?.setScreenFrontPlaneM // Add screenFrontPlaneM setter
  ]);


  const loadProject = useCallback(async (signal) => {
    if (!projectIdState) return;
    setLoadState({ phase: "loading", error: null, name: null });
    try {
      // AbortController signal is not directly supported by the SDK, but the operation is fast.
      const projects = await Project.filter({ id: projectIdState }, '-updated_date', 1);

      if (Array.isArray(projects) && projects.length) {
        const p = projects[0] || null;
        hydrateFromProject(p);
        setProjectNameState(p?.name || "Project"); // Update internal projectName state
        setLoadState({ phase: "loaded", error: null, name: p?.name || "Project" });
      } else {
        setLoadState({ phase: "error", error: "Project not found.", name: null });
      }
    } catch (err) {
      if (err?.name === "AbortError") {
        setLoadState(prev => ({ ...prev, phase: "idle" }));
        return;
      }
      window.__APP_DEBUG = window.__APP_DEBUG || [];
      window.__APP_DEBUG.push(`[RoomDesigner] Project load error: ${err?.message || err}`);
      setLoadState({ phase: "error", error: err?.message || "Failed to fetch project data.", name: null });
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
        console.error("Failed to update URL:", e);
    }
    setProjectIdState(id);
  }, []);

  const debounceTimeoutRef = useRef(null);
  const isHydratingRef = useRef(false); // Initialize with false

  useEffect(() => {
    // Update the ref whenever loadState changes
    const isCurrentlyHydrating = loadState.phase === "loading" || (projectIdFromUrl && loadState.phase !== "loaded" && loadState.phase !== "error");
    isHydratingRef.current = isCurrentlyHydrating;
  }, [loadState.phase, projectIdFromUrl]);


  useEffect(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    if (isHydratingRef.current) {
        setAutosaveStatus("hydrating");
        return;
    }

    setAutosaveStatus("dirty");

    debounceTimeoutRef.current = setTimeout(async () => {
      try {
        const projectData = serializeProject({
          // NEW: Pass roomDims as JSON string
          roomDims: JSON.stringify(appState.roomDims), // Use appState.roomDims
          // Keep dimensions for backward compatibility with `room_width` etc. fields in Project entity
          dimensions, screen, seatingPositions,
          placedSpeakers,
          roomElements, overlays,
          projectName: projectNameState,
          dolbyPreset, frozenTabs,
          sevenBedLayoutType,
          frontSubsCfg,
          rearSubsCfg,
          lcrAimMode,
          enableFrontWides,
          // Use selectedSpeakersByRole and speakerNodes from appState
          selectedSpeakersByRole: JSON.stringify(appState.selectedSpeakersByRole),
          spl_speaker_nodes: JSON.stringify(appState.speakerNodes),
          overheadGlobalModel,
          overheadFrontOverride,
          overheadMidOverride,
          overheadRearOverride,
          useFrontGlobal,
          useMidGlobal,
          useRearGlobal,
          row_spacing_m: rowSpacingM,
          screenFrontPlaneM: appState.screenFrontPlaneM,
        });

        let savedProject;
        if (projectIdState) {
          savedProject = await Project.update(projectIdState, projectData);
        } else {
          savedProject = await Project.create(projectData);
        }

        if (savedProject) {
          setAutosaveStatus("saved");
          if (!projectIdState) {
            const newProjectId = savedProject.id;
            if (newProjectId) {
              handleProjectCreated(newProjectId);
            }
          }
        } else {
          console.error("Autosave failed: Project could not be saved.");
          setAutosaveStatus("error");
        }
      } catch (e) {
        console.error("Error during autosave:", e.message);
        setAutosaveStatus("error");
      }
    }, 800); // debounceMs
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [
    projectIdState, projectNameState, dolbyPreset, dimensions, screen, seatingPositions, placedSpeakers,
    roomElements, overlays, frozenTabs, handleProjectCreated, sevenBedLayoutType, frontSubsCfg, rearSubsCfg, lcrAimMode, enableFrontWides,
    appState.roomDims, appState.selectedSpeakersByRole, appState.speakerNodes, // NEW dependencies
    overheadGlobalModel, overheadFrontOverride, overheadMidOverride, overheadRearOverride,
    useFrontGlobal, useMidGlobal, useRearGlobal,
    rowSpacingM, appState.screenFrontPlaneM // Add screenFrontPlaneM to dependencies
  ]);

  useEffect(() => {
    const controller = new AbortController();
    try {
      if (projectIdFromUrl) {
        setProjectIdState(projectIdFromUrl); // Ensure initial projectId is set
        loadProject(controller.signal);
      } else {
        // Only initialise if there are no speakers yet, and dimensions have loaded
        const hasSpeakers =
          Array.isArray(placedSpeakers) && placedSpeakers.length > 0;
        if (!hasSpeakers && appState?.roomDims) { // Ensure roomDims is available before init
          initWithDefaultsAndRules();
        }
      }
    } catch (e) {
      console.error("[RoomDesigner] boot init error:", e);
    }
    return () => controller.abort();
  }, [loadProject, initWithDefaultsAndRules, placedSpeakers, projectIdFromUrl, setProjectIdState, appState?.roomDims]); // Added appState.roomDims to deps for init

  const manualSaveProject = useCallback(async () => {
    setAutosaveStatus("saving");
    try {
      const projectData = serializeProject({
        // NEW: Pass roomDims as JSON string
        roomDims: JSON.stringify(appState.roomDims), // Use appState.roomDims
        // Keep dimensions for backward compatibility with `room_width` etc. fields in Project entity
        dimensions, screen, seatingPositions,
        placedSpeakers,
        roomElements, overlays,
        projectName: projectNameState, dolbyPreset, frozenTabs,
        sevenBedLayoutType,
        frontSubsCfg,
        rearSubsCfg,
        lcrAimMode,
        enableFrontWides,
        // Use selectedSpeakersByRole and speakerNodes from appState
        selectedSpeakersByRole: JSON.stringify(appState.selectedSpeakersByRole),
        spl_speaker_nodes: JSON.stringify(appState.speakerNodes),
        overheadGlobalModel,
        overheadFrontOverride,
        overheadMidOverride,
        overheadRearOverride,
        useFrontGlobal,
        useMidGlobal,
        useRearGlobal,
        row_spacing_m: rowSpacingM,
        screenFrontPlaneM: appState.screenFrontPlaneM,
      });

      let savedProject;
      if (projectIdState) {
        savedProject = await Project.update(projectIdState, projectData);
      } else {
        savedProject = await Project.create(projectData);
      }

      if (savedProject) {
        setAutosaveStatus("saved");
        if (!projectIdState) {
          const newProjectId = savedProject.id;
            if (newProjectId) {
              handleProjectCreated(newProjectId);
            }
          }
        return { success: true };
      } else {
        setAutosaveStatus("error");
        console.error("Failed to save project: No response from server.");
        return { success: false, error: "Save operation failed." };
      }
    } catch (e) {
      setAutosaveStatus("error");
      console.error("Error during autosave:", e.message);
      return { success: false, error: e.message };
    }
  }, [
    projectIdState, projectNameState, dolbyPreset, dimensions, screen, seatingPositions, placedSpeakers,
    roomElements, overlays, frozenTabs, handleProjectCreated, sevenBedLayoutType, frontSubsCfg, rearSubsCfg, lcrAimMode, enableFrontWides,
    appState.roomDims, appState.selectedSpeakersByRole, appState.speakerNodes, // NEW dependencies
    overheadGlobalModel, overheadFrontOverride, overheadMidOverride, overheadRearOverride,
    useFrontGlobal, useMidGlobal, useRearGlobal,
    rowSpacingM, appState.screenFrontPlaneM // Add screenFrontPlaneM to dependencies
  ]);

  return {
    projectId: projectIdState,
    projectName: projectNameState,
    loadState,
    autosaveStatus,
    handleSaveProject: manualSaveProject,
    reloadProject
  };
}


// Safe lazy imports that work with both named and default exports
const RoomDimensions = React.lazy(() =>
  import("@/components/room/RoomDimensions")
    .then(m => ({ default: m.default ?? m.RoomDimensions }))
);

const ScreenConfiguration = React.lazy(() =>
  import("@/components/room/ScreenConfiguration")
    .then(m => ({ default: m.default ?? m.ScreenConfiguration }))
);

const SeatingLayout = React.lazy(() =>
  import("@/components/room/SeatingLayout")
    .then(m => ({ default: m.default ?? m.SeatingLayout }))
);

const SpeakerPlacement = React.lazy(() =>
  import("@/components/room/SpeakerPlacement")
    .then(m => ({ default: m.default ?? m.SpeakerPlacement }))
);

const RoomElements = React.lazy(() =>
  import("@/components/room/RoomElements")
    .then(m => ({ default: m.default ?? m.RoomElements }))
);

const BassResponse = React.lazy(() =>
  import("@/components/room/BassResponse")
    .then(m => ({ default: m.default ?? m.BassResponse }))
);

// Direct imports (these are default exports)
// Fix: Change RoomVisualisation to be lazy-loaded as it's used within Suspense.
const RoomVisualisation = React.lazy(() =>
  import("@/components/room/RoomVisualisation")
    .then(m => ({ default: m.default ?? m.RoomVisualisation }))
);
import { ErrorBoundary } from "@/components/dev/ErrorBoundary";
import SubwooferMenu from "@/components/room/SubwooferMenu"; // new

import RP22CompliancePanel from "@/components/rp22/RP22CompliancePanel";

// Dolby-style role sets used by the System Configuration selector
export const DOLBY_PRESETS = {
  "5.1":    ["FL","FC","FR","SL","SR","LFE"],
  "7.1":    ["FL","FC","FR","SL","SR","SBL","SBR","LFE"],
  "5.1.2":  ["FL","FC","FR","SL","SR","TL","TR","LFE"],
  "5.1.4":  ["FL","FC","FR","SL","SR","TFL","TFR","TBL","TBR","LFE"],
  "5.1.6":  ["FL","FC","FR","SL","TFC","SR","TFL","TBL","TBR","LFE"], // TFC/TFL are Front Heights, TBL/TBR are Rear Heights. TML/TMR not explicitly used in this 5.1.6
  "7.1.2":  ["FL","FC","FR","SL","SR","SBL","SBR","TL","TR","LFE"],
  "7.1.4":  ["FL","FC","FR","SL","SR","SBL","SBR","TFL","TFR","TBL","TBR","LFE"],
  "7.1.6":  ["FL","FC","FR","SL","TFC","SR","SBL","SBR","TFL","TBL","TBR","LFE"], // TFC/TFL are Front Heights, TBL/TBR are Rear Heights. TML/TMR not explicitly used in this 7.1.6
  "9.1.2":  ["FL","FCL","FC","FCR","FR","SL","SR","TL","TR","LFE"],
  "9.1.4":  ["FL","FCL","FC","FCR","FR","SL","SR","TFL","TFR","TBL","TBR","LFE"],
  "9.1.6":  ["FL","FCL","FC","FCR","FR","SL","TFC","SR","TFL","TBL","TBR","LFE"], // TFC/TFL are Front Heights, TBL/TBR are Rear Heights. TML/TMR not explicitly used in this 9.1.6
};

// Coarse seeding for a system preset (RoomDesigner refines later)
export function seedSpeakersFromPreset({
  preset,
  roomDimensions,
  listeningArea = null,
}) {
  const w = Number(roomDimensions?.width) || 4.5;
  const l = Number(roomDimensions?.length) || 6.0;
  const h = Number(roomDimensions?.height) || 2.8;

  const m = 0.02; // wall margin
  const yFront = m;
  const yRear  = l - m;
  const earZ   = 1.1;
  const topZ   = Math.max(0.3, h - 0.15); // Ceiling height minus 15cm from ceiling

  const x25 = w * 0.25;
  const x50 = w * 0.50;
  const x75 = w * 0.75;

  const la = listeningArea && typeof listeningArea === "object" ? listeningArea : null;
  const sideY = la ? la.midY : l * 0.60;
  const backLeftX  = la ? Math.max(m, la.minX) : x25;
  const backRightX = la ? Math.min(w - m, la.maxX) : x75;

  const posForRole = (role) => {
    switch (role) {
      // Fronts
      case "FL":  return { x: x25, y: yFront, z: earZ };
      case "FC":  return { x: x50, y: yFront, z: earZ };
      case "FR":  return { x: x75, y: yFront, z: earZ };
      case "FCL": return { x: Math.max(m, x25 - 0.2), y: yFront, z: earZ };
      case "FCR": return { x: Math.min(w - m, x75 + 0.2), y: yFront, z: earZ };
      // Sides
      case "SL":  return { x: m,     y: Math.max(m, Math.min(sideY, la ? la.maxY : sideY)), z: earZ };
      case "SR":  return { x: w - m, y: Math.max(m, Math.min(sideY, la ? la.maxY : sideY)), z: earZ };
      // Backs
      case "SBL": return { x: backLeftX,  y: yRear, z: earZ };
      case "SBR": return { x: backRightX, y: yRear, z: earZ };
      // New Wides for 7.x swap (arbitrary initial positions, can be refined)
      case "LW": return { x: w * 0.15, y: l * 0.4, z: earZ }; // Example position for Left Wide
      case "RW": return { x: w * 0.85, y: l * 0.4, z: earZ }; // Example position for Right Wide

      // Tops
      case "TL":  return { x: x25, y: l * 0.50, z: topZ };
      case "TR":  return { x: x75, y: l * 0.50, z: topZ };
      case "TFL": return { x: x25, y: l * 0.35, z: topZ }; // 35% of room length from front
      case "TFR": return { x: x75, y: l * 0.35, z: topZ };
      case "TFC": return { x: x50, y: l * 0.35, z: topZ }; // Top Front Center
      case "TBL": return { x: x25, y: l * 0.70, z: topZ }; // 70% of room length from front
      case "TBR": return { x: x75, y: l * 0.70, z: topZ };
      case "TBC": return { x: x50, y: l * 0.70, z: topZ }; // Top Back Center
      // LFE
      case "LFE": return { x: x50, y: yFront + 0.20, z: 0.3 };
      default:    return { x: x50, y: l * 0.60, z: earZ };
    }
  };

  const roles = DOLBY_PRESETS[preset] || [];
  
  return roles.map((role) => ({
    id: role,
    role,
    label: role,
    model: undefined, // Neutralized default model seeding
    position: posForRole(role),
  }));
}

// Thin store wrapper over AppStateProvider so the page can read/write speakers
export function useSpeakerSystemStore() {
  const {
    speakerSystem, setSpeakerSystem,
    roomDims, setRoomDims, // Use roomDims from AppState
    screen, setScreen,
    seatingPositions, setSeatingPositions,
   } = useAppState() || {};

  const placedSpeakers = React.useMemo(
    () => (Array.isArray(speakerSystem?.placedSpeakers) ? speakerSystem.placedSpeakers : []),
    [speakerSystem?.placedSpeakers]
  );

  const setSpeakers = React.useCallback(
    (listOrUpdater) => {
      if (typeof setSpeakerSystem !== "function") return;
      setSpeakerSystem((prev) => {
        const current = prev?.placedSpeakers || [];
        const nextList =
          typeof listOrUpdater === "function" ? listOrUpdater(current) : (listOrUpdater || []);
        return { ...(prev || {}), placedSpeakers: Array.isArray(nextList) ? nextList : [] };
      });
    },
    [setSpeakerSystem]
  );

  const initWithDefaultsAndRules = React.useCallback(() => {
    // This function now relies on `roomDims` from `useAppState`
    const room = {
      width:  typeof roomDims?.widthM  === "number" ? roomDims.widthM  : 4.5,
      length: typeof roomDims?.lengthM === "number" ? roomDims.lengthM : 6.0,
      height: typeof roomDims?.heightM === "number" ? roomDims.heightM : 2.8,
    };
    if (typeof setRoomDims === "function") { // Update appState.roomDims
      setRoomDims(room); // Simplified as roomDims stores {widthM, lengthM, heightM}
    }

    if (typeof setScreen === "function") {
      setScreen(prev => ({
        ...prev,
        visibleWidthInches: prev?.visibleWidthInches || 100,
        aspectRatio: prev?.aspectRatio || "16:9",
        mountMode: "floating", // Enforce floating as default on init
        floatDepthM: (typeof prev?.floatDepthM === "number") ? prev.floatDepthM : 0.2, // Default to 0.2 for floating
        heightFromFloorM: (typeof prev?.heightFromFloorM === "number") ? prev.heightFromFloorM : 0.5,
      }));
    }

    if (typeof setSeatingPositions === "function" && (!Array.isArray(seatingPositions) || seatingPositions.length === 0)) {
      const cx = room.width / 2;
      const THETA = (57.5 * Math.PI) / 180;
      const viewWidthM = (100 * 0.0254);
      const d = (viewWidthM / 2) / Math.tan(THETA / 2);
      const y = Math.max(0.10, Math.min(room.length - 1.2, d));
      const spacing = 0.6;
      setSeatingPositions([
        { id: "seat-left",  x: cx - spacing, y, z: 1.2, rowNumber: 1, seatNumber: 1 },
        { id: "seat-center",x: cx,           y, z: 1.2, rowNumber: 1, isPrimary: true },
        { id: "seat-right", x: cx + spacing, y, z: 1.2, rowNumber: 1, seatNumber: 3 },
      ]);
    }

    if (typeof setSpeakerSystem === "function") {
      const seeded = seedSpeakersFromPreset({
        preset: "5.1",
        roomDimensions: room,
        listeningArea: null,
      });
      setSpeakerSystem((prev) => ({ ...(prev || {}), placedSpeakers: seeded }));
    }
  }, [roomDims, seatingPositions, setRoomDims, setScreen, setSeatingPositions, setSpeakerSystem]);

  return {
    placedSpeakers,
    setSpeakers,
    initWithDefaultsAndRules,
    setSpeakerSystem // Expose for useProjectLoader
  };
}

// NEW: Guarded setter hook
function useGuardedSetter(setter, tabName) {
  const { isFrozen } = useAppState(); // isFrozen here is a function from AppStateProvider
  return React.useCallback((next) => {
    if (isFrozen?.(tabName)) return; // ignore edits when frozen
    setter?.(next); // Use optional chaining for setter
  }, [setter, isFrozen, tabName]);
}


function RoomDesignerWithState() {
  // All hook calls must be unconditional and at the top level
  const appState = useAppState();

  // Temporary variables for values that might be undefined if appState is null
  // (Assumes AppStateProvider has been updated to provide these)
  const _roomDims = appState?.roomDims;
  const _setRoomDims = appState?.setRoomDims;
  const _selectedSpeakersByRole = appState?.selectedSpeakersByRole;
  const _setSelectedSpeakersByRole = appState?.setSelectedSpeakersByRole;
  const _speakerNodes = appState?.speakerNodes;
  const _setSpeakerNodes = appState?.setSpeakerNodes;

  const _seatingPositions = appState?.seatingPositions;
  const _baselineSeatingPositions = appState?.baselineSeatingPositions;
  const _setBaselineSeatingPositions = appState?.setBaselineSeatingPositions;
  const _seatingRows = appState?.seatingRows;
  const _seatsPerRow = appState?.seatsPerRow;
  const _seatingBlockOffset = appState?.seatingBlockOffset;
  const _seatSpacing = appState?.seatSpacing;
  const _mlpBasis = appState?.mlpBasis;
  const _roomElements = appState?.roomElements;
  const _frozenTabs = appState?.frozenTabs;
  const _isFrozen = appState?.isFrozen;
  const _sevenBedLayoutType = appState?.sevenBedLayoutType;
  const _overlays = appState?.overlays;
  const _setOverlays = appState?.setOverlays;
  const _frontSubsCfg = appState?.frontSubsCfg;
  const _rearSubsCfg = appState?.rearSubsCfg;
  const setSubwoofers = appState?.setSubwoofers;
  const _screen = appState?.screen;
  const _setScreen = appState?.setScreen;
  const _enableFrontWides = appState?.enableFrontWides;
  const _setEnableFrontWides = appState?.setEnableFrontWides;
  const overheadGlobalModel = appState?.overheadGlobalModel;
  const setOverheadGlobalModel = appState?.setOverheadGlobalModel;
  const overheadFrontOverride = appState?.overheadFrontOverride;
  const setOverheadFrontOverride = appState?.setOverheadFrontOverride;
  const overheadMidOverride = appState?.overheadMidOverride;
  const setOverheadMidOverride = appState?.setOverheadMidOverride;
  const overheadRearOverride = appState?.overheadRearOverride;
  const setOverheadRearOverride = appState?.setOverheadRearOverride;
  const useFrontGlobal = appState?.useFrontGlobal;
  const setUseFrontGlobal = appState?.setUseFrontGlobal;
  const useMidGlobal = appState?.useMidGlobal;
  const setUseMidGlobal = appState?.setUseMidGlobal;
  const useRearGlobal = appState?.useRearGlobal;
  const setUseRearGlobal = appState?.setUseRearGlobal;
  const _rowSpacingM = appState?.rowSpacingM;
  const _setRowSpacingM = appState?.setRowSpacingM;
  const [seatsPerRowByRow, setSeatsPerRowByRow] = React.useState(null);


  const { projectId: initialProjectIdFromUrl } = useUrlQuery();
  const store = useSpeakerSystemStore();

  const visualisationRef = useRef(null);

  const activeProjectId = React.useMemo(() => {
    return appState?.activeProjectId || null;
  }, [appState?.activeProjectId]);

  // Don't block render - allow local-only mode
  const showLocalHint = !activeProjectId;

  // REMOVED: useRoomDimensions hook call and its related state
  // const { dims: sharedDims, setDims: setSharedDims, loadDims, loaded: dimsLoaded,
  //   selectedSpeakersByRole, loadSelectedSpeakers, speakerNodes, loadSpeakerNodes,
  // } = useRoomDimensions(activeProjectId);

  const [dolbyPreset, setDolbyPreset] = React.useState("5.1");
  const [lcrAimMode, setLcrAimMode] = useState("flat"); // "flat" | "angled"
  const [lcrAngleDeg, setLcrAngleDeg] = useState(0); // Live angle readout
  const [subWarnings, setSubWarnings] = useState({ front: [], rear: [] });

  // screen state is now managed directly by AppState, removed local useState here.

  // Track preset changes to prevent unnecessary re-seeding
  const lastPresetRef = React.useRef(dolbyPreset);
  useEffect(() => { lastPresetRef.current = dolbyPreset; }, [dolbyPreset]);

  // ⚠️ Hoisted memos so they’re initialized before any effects that depend on them
  // `stableDimensions` now directly depends on `appState.roomDims` (the source of truth)
  const stableDimensions = useMemo(() => ({
    width: Number(_roomDims?.widthM) || 4.5,
    length: Number(_roomDims?.lengthM) || 6.0,
    height: Number(_roomDims?.heightM) || 2.8,
  }), [_roomDims?.widthM, _roomDims?.lengthM, _roomDims?.heightM]);

  // stableScreen now directly depends on _screen from appState
  const stableScreen = useMemo(() => ({
    mountMode: _screen?.mountMode || "floating",
    visibleWidthInches: Number(_screen?.visibleWidthInches) || 100,
    aspectRatio: _screen?.aspectRatio || "16:9",
    floatDepthM: Number(_screen?.floatDepthM) || 0.20,
    heightFromFloorM: Number(_screen?.heightFromFloorM) || 0.5,
    manualMode: _screen?.manualMode || false,
    manualWidthM: Number(_screen?.manualWidthM) || 0,
    manualHeightM: Number(_screen?.manualHeightM) || 0,
  }), [_screen?.visibleWidthInches, _screen?.aspectRatio, _screen?.floatDepthM, _screen?.heightFromFloorM, _screen?.manualMode, _screen?.manualWidthM, _screen?.manualHeightM, _screen?.mountMode]);

  // Compute MLP (green dot) and row centers from screen plane
  useEffect(() => {
    // Pull needed values
    const screenFrontPlaneM = appState?.screenFrontPlaneM;
    const screenVisibleWidthM = stableScreen?.visibleWidthInches 
      ? stableScreen.visibleWidthInches * 0.0254 
      : null;
    /* Y-only viewing offset (lock X to centre) */
const viewingOffsetM = Number(_seatingBlockOffset) || 0;
const rows = Number(_seatingRows) || 1;
const rowSpacing = Number(_rowSpacingM) || 1.8; // default 1.8m
const mlpReference = _mlpBasis; // 'front' | 'back' | 'average'
const addOffsetY = (y) => Number((y + viewingOffsetM).toFixed(3)); // use on Y only

    // Must have screen plane and width
    if (!Number.isFinite(screenFrontPlaneM) || !Number.isFinite(screenVisibleWidthM)) {
      return;
    }

    // Compute ideal distance for 57.5° FOV
    const idealDistM = distanceFor57_5FromWidth(screenVisibleWidthM);
    
    // Dot is ideal distance from the screen front plane, plus the viewing offset
    const mlpY = screenFrontPlaneM + idealDistM + viewingOffsetM;

    // Publish MLP (guarded to 1 mm)
    const mlpRounded = Math.round(mlpY * 1000) / 1000;
    if (typeof appState?.setMlpY_m === 'function') {
      appState.setMlpY_m(prev => {
        const prevRounded = prev ? Math.round(prev * 1000) : null;
        const newRounded = Math.round(mlpRounded * 1000);
        return prevRounded === newRounded ? prev : mlpRounded;
      });
    }

    // Build row centers from the MLP and publish (guarded)
    const centers = buildRowCenters(mlpRounded, rows, rowSpacing, mlpReference);
    if (typeof appState?.setRowCentersM === 'function') {
      appState.setRowCentersM(prev => {
        if (!Array.isArray(prev) || prev.length !== centers.length) return centers;
        // shallow compare with 1 mm tolerance
        for (let i = 0; i < centers.length; i++) {
          if (Math.abs((prev[i] ?? NaN) - centers[i]) > 0.001) return centers;
        }
        return prev;
      });
    }

    // Temporary telemetry (remove after verify)
    if (SHOW_DEBUG_LOGS && typeof console !== 'undefined' && Math.random() < 0.05) {
      console.log('[MLP]', {
        frontY: screenFrontPlaneM.toFixed(3),
        idealM: idealDistM.toFixed(3),
        offset: viewingOffsetM.toFixed(3),
        mlpY: mlpRounded.toFixed(3)
      });
      console.log('[ROWS]', {
        mode: mlpReference,
        frontY: centers[0]?.toFixed(3),
        backY: centers[centers.length - 1]?.toFixed(3),
        spacing: rowSpacing.toFixed(3)
      });
    }
  }, [
    appState?.screenFrontPlaneM,
    stableScreen?.visibleWidthInches,
    _seatingBlockOffset,
    _seatingRows,
    _mlpBasis,
    _rowSpacingM,
    appState?.setMlpY_m,
    appState?.setRowCentersM,
  ]);

  // Use computed MLP as the effective anchor (for backwards compatibility)
  const mlpAnchorEffective = useMemo(() => {
    const mlpY = appState?.mlpY_m;
    if (!Number.isFinite(mlpY)) return null;
    
    const roomWidthM = Number(stableDimensions?.width) || 0;
    return {
      x: roomWidthM > 0 ? roomWidthM / 2 : 0,
      y: mlpY,
      z: 1.2,
    };
  }, [appState?.mlpY_m, stableDimensions?.width]);

  const placedSpeakers = store.placedSpeakers;

  // Compute diagnostic values
  const widthM =
    (typeof stableScreen?.widthMeters === 'number' && stableScreen.widthMeters > 0)
      ? stableScreen.widthMeters
      : ((Number(stableScreen?.visibleWidthInches) || 0) * 0.0254);

  // Derive primarySeatingPosition for backwards compatibility with existing code
  const primarySeatingPosition = useMemo(() => {
    const { primary } = computeMLPAndPrimary(
      _seatingPositions || [],
      stableDimensions.width,
      stableDimensions.length,
      _mlpBasis
    );
    // Lock MLP X to centerline for analysis purposes
    const roomWidth = stableDimensions.width;
    return primary ? { ...primary, x: roomWidth / 2 } : null;
  }, [_seatingPositions, stableDimensions.width, stableDimensions.length, _mlpBasis]);

  // ✅ Move analysisResult BEFORE any effects that depend on it
  const analysisResult = useRP22AnalysisEngine({
    placedSpeakers: placedSpeakers,
    seatingPositions: _seatingPositions,
    primarySeatingPosition: primarySeatingPosition,
    dimensions: stableDimensions, // Use stableDimensions (derived from appState.roomDims)
    mlpBasis: _mlpBasis,
  });

  const frontSubsForRendering = React.useMemo(() => {
    try {
      const model = _frontSubsCfg?.model;
      const qty = _frontSubsCfg?.count;
      const subsToRender = [];
      const warnings = [];

      if (!model || qty < 1) {
        setSubWarnings(prev => ({ ...prev, front: [] }));
        return [];
      }

      const byRole = new Map((placedSpeakers || []).map(s => [String(s.role).toUpperCase(), s]));
      const FL = byRole.get('FL');
      const FC = byRole.get('FC');
      const FR = byRole.get('FR');

      if (!FL?.position || !FC?.position || !FR?.position) {
        setSubWarnings(prev => ({ ...prev, front: ["Place L, C, and R speakers first."] }));
        return [];
      }

      const subDims = getSpeakerModelMeta(model) || {};
      const widthM = Number(subDims.widthM);
      const depthM = Number(subDims.depthM);
      const heightM = Number(subDims.heightM);

      if (isNaN(widthM) || isNaN(depthM) || isNaN(heightM) || widthM <= 0 || depthM <= 0 || heightM <= 0) {
          warnings.push("Invalid subwoofer model dimensions.");
          setSubWarnings(prev => ({ ...prev, front: warnings }));
          return [];
      }

      const getDims = (m) => getSpeakerModelMeta(m) || {};
      const flDims = getDims(FL.model);
      const fcDims = getDims(FC.model);
      const frDims = getDims(FR.model);

      const neededWidthForOneSub = widthM + 0.10; // 5cm buffer each side of the sub (total 10cm)
      const wallBuffer = 0.02;
      const centerY = wallBuffer + (depthM / 2);
      const zBottom = 0.800;
      const zCenter = zBottom + heightM / 2;

      // Process Left Sub (between FL and FC)
      if (qty >= 1) {
        const flRightEdge = FL.position.x + (Number(flDims.widthM) / 2 || 0);
        const fcLeftEdge = FC.position.x - (Number(fcDims.widthM) / 2 || 0);
        const availableSpaceWidth = fcLeftEdge - flRightEdge;
        const xPosLeftSub = (FL.position.x + FC.position.x) / 2;

        if (availableSpaceWidth < neededWidthForOneSub) {
          warnings.push("Front Left sub doesn't fit between L & C speakers.");
        } else {
          subsToRender.push({
            id: 'front-sub-left',
            role: 'SUB', model,
            position: { x: xPosLeftSub, y: centerY, z: zCenter },
            dims_m: { w: widthM, h: heightM, d: depthM },
            zBottomM: zBottom,
          });
        }
      }

      // Process Right Sub (between FC and FR)
      if (qty >= 2) {
        const fcRightEdge = FC.position.x + (Number(fcDims.widthM) / 2 || 0);
        const frLeftEdge = FR.position.x - (Number(frDims.widthM) / 2 || 0);
        const availableSpaceWidth = frLeftEdge - fcRightEdge;
        const xPosRightSub = (FC.position.x + FR.position.x) / 2;

        if (availableSpaceWidth < neededWidthForOneSub) {
          warnings.push("Front Right sub doesn't fit between C & R speakers.");
        } else {
          subsToRender.push({
            id: 'front-sub-right',
            role: 'SUB', model,
            position: { x: xPosRightSub, y: centerY, z: zCenter },
            dims_m: { w: widthM, h: heightM, d: depthM },
            zBottomM: zBottom,
          });
        }
      }

      setSubWarnings(prev => ({ ...prev, front: warnings }));

      // Screen depth check
      if (subsToRender.length > 0) {
          const subFrontY = centerY + (depthM / 2);
          const requiredScreenDepth = subFrontY + 0.01; // 1cm buffer
          if ((_screen?.floatDepthM || 0) < requiredScreenDepth) {
              _setScreen(prev => ({ ...prev, floatDepthM: requiredScreenDepth }));
          }
      }
      
      return subsToRender;

    } catch (e) {
      console.warn("Error calculating front subs for rendering:", e);
      setSubWarnings(prev => ({ ...prev, front: ["Error calculating position."] }));
      return [];
    }
  }, [_frontSubsCfg?.model, _frontSubsCfg?.count, placedSpeakers, _screen?.floatDepthM, _setScreen, setSubWarnings]);

  const rearSubsForRendering = React.useMemo(() => {
    try {
      const model = _rearSubsCfg?.model;
      const qty = _rearSubsCfg?.count;
      const subsToRender = [];
      const warnings = [];

      if (!model || qty < 1) {
        setSubWarnings(prev => ({ ...prev, rear: [] }));
        return [];
      }

      const byRole = new Map((placedSpeakers || []).map(s => [String(s.role).toUpperCase(), s]));
      const FL = byRole.get('FL');
      const FC = byRole.get('FC');
      const FR = byRole.get('FR');

      if (!FL?.position || !FC?.position || !FR?.position) {
        setSubWarnings(prev => ({ ...prev, rear: ["Place L, C, and R speakers first to determine X-axis positions."] }));
        return [];
      }

      const subDims = getSpeakerModelMeta(model) || {};
      const widthM = Number(subDims.widthM);
      const depthM = Number(subDims.depthM);
      const heightM = Number(subDims.heightM);

      if (!widthM || !depthM || !heightM) return [];

      const leftRefX = (FL.position.x + FC.position.x) / 2;
      const rightRefX = (FC.position.x + FR.position.x) / 2;

      const rearWallY = stableDimensions.length;
      const wallBuffer = 0.02; // 20mm
      const floorBuffer = 0.05; // 50mm
      const sideBuffer = 0.05; // 50mm

      const centerY = rearWallY - wallBuffer - (depthM / 2);
      const zCenter = floorBuffer + (heightM / 2);
      
      const checkFit = (xPos) => {
          return (xPos - widthM / 2 - sideBuffer) > 0 && (xPos + widthM / 2 + sideBuffer) < stableDimensions.width;
      };

      if (qty >= 1) {
        if (checkFit(leftRefX)) {
          subsToRender.push({
            id: 'rear-sub-left', role: 'SUB', model,
            position: { x: leftRefX, y: centerY, z: zCenter },
            dims_m: { w: widthM, h: heightM, d: depthM },
          });
        } else {
          warnings.push("Rear subwoofer doesn't fit in the allocated space.");
        }
      }
      
      if (qty >= 2) {
        if (checkFit(rightRefX)) {
          subsToRender.push({
            id: 'rear-sub-right', role: 'SUB', model,
            position: { x: rightRefX, y: centerY, z: zCenter },
            dims_m: { w: widthM, h: heightM, d: depthM },
          });
        } else {
          warnings.push("Rear subwoofer doesn't fit in the allocated space.");
        }
      }

      setSubWarnings(prev => ({ ...prev, rear: warnings }));
      return subsToRender;

    } catch (e) {
      console.warn("Error calculating rear subs for rendering:", e);
      setSubWarnings(prev => ({ ...prev, rear: ["Error calculating position."] }));
      return [];
    }
  }, [_rearSubsCfg?.model, _rearSubsCfg?.count, placedSpeakers, stableDimensions.width, stableDimensions.length, setSubWarnings]);

  const enableFrontWides = _enableFrontWides;

  // Safe front-wide zone memo with hard guards
  const frontWideZones = useMemo(() => {
    if (!enableFrontWides) {
      const result = { status: 'disabled' };
      if (typeof window !== 'undefined') {
        window.FW_DBG = result;
        if (SHOW_DEBUG_LOGS && window.DBG_FW) console.log('[FW] zones ->', result);
      }
      return result;
    }

    if (!mlpAnchorEffective) { // Use mlpAnchorEffective as the fixed reference
      const result = { status: 'no-mlp' };
      if (typeof window !== 'undefined') {
        window.FW_DBG = result;
        if (SHOW_DEBUG_LOGS && window.DBG_FW) console.log('[FW] zones ->', result);
      }
      return result;
    }

    const W = stableDimensions.width || 0;
    const L = stableDimensions.length || 0;
    if (!(W > 0 && L > 0)) {
      const result = { status: 'invalid-geom', reason: 'room dims' };
      if (typeof window !== 'undefined') {
        window.FW_DBG = result;
        if (SHOW_DEBUG_LOGS && window.DBG_FW) console.log('[FW] zones ->', result);
      }
      return result;
    }

    // safeCanon is already defined at the top level of the file
    const sl = placedSpeakers?.find(s => safeCanon(s?.role) === 'SL');
    const sr = placedSpeakers?.find(s => safeCanon(s?.role) === 'SR');
    
    if (!sl || !sr) {
      const result = { status: 'no-sides' };
      if (typeof window !== 'undefined') {
        window.FW_DBG = result;
        if (SHOW_DEBUG_LOGS && window.DBG_FW) console.log('[FW] zones ->', result);
      }
      return result;
    }

    let result;
    try {
      const getModelDims = (modelId) => getSpeakerModelMeta(modelId) || {};

      // Direct call to named export: computeFrontWideZonesStrict
      result = computeFrontWideZonesStrict({
        mlpPoint: mlpAnchorEffective, // Use mlpAnchorEffective (now derived from screen AND offset)
        dimensions: stableDimensions,
        placedSpeakers,
        getModelDims,
        rp22BoundDeg: 10,
      }) || { status: 'invalid-geom', reason: 'empty result' };
    } catch (e) {
      result = { status: 'invalid-geom', reason: 'exception', error: e.message };
      if (typeof window !== 'undefined' && window.DBG_FW && SHOW_DEBUG_LOGS) {
        console.warn('[FW zones] compute failed', e);
      }
    }

    // Debug hook: expose computed zones
    if (typeof window !== 'undefined') {
      window.FW_DBG = result;
      if (SHOW_DEBUG_LOGS && window.DBG_FW) {
        console.log('[FW] zones ->', result);
        if (result.status === 'ok') {
          console.log('[FW] L =', result.left, 'R =', result.right);
        }
      }
    }

    return result;
  }, [
    enableFrontWides,
    mlpAnchorEffective, // Depend on mlpAnchorEffective
    stableDimensions,
    placedSpeakers,
  ]);


  // Effect for subwoofer placement
  useEffect(() => {
    if (!placedSpeakers.length || !_roomDims || !_screen || (_isFrozen && _isFrozen('bass'))) return;

    const room = { width_m: _roomDims.widthM, length_m: _roomDims.lengthM, height_m: _roomDims.heightM };

    const byRole = new Map(placedSpeakers.map(s => [s.role, s]));
    const getDims = (model) => {
        const meta = getSpeakerModelMeta(model);
        return { w_m: meta?.widthM ?? 0.27, d_m: meta?.depthM ?? 0.082 };
    };

    const leftSpeaker = byRole.get("FL");
    const centreSpeaker = byRole.get("FC");
    const rightSpeaker = byRole.get("FR");

    if (!leftSpeaker || !centreSpeaker || !rightSpeaker) {
        if (typeof setSubwoofers === 'function') setSubwoofers([]);
        return;
    }

    const lcr = {
      L: { x_m: leftSpeaker.position.x, dims: getDims(leftSpeaker.model) },
      C: { x_m: centreSpeaker.position.x, dims: getDims(centreSpeaker.model) },
      R: { x_m: rightSpeaker.position.x, dims: getDims(rightSpeaker.model) }
    };
    
    const screenDepth_m = _screen.floatDepthM || 0.2;

    const front = placeSubwoofers({
      room,
      wallY_m: 0,
      screenPlaneY_m: screenDepth_m,
      lcr,
      group: "front",
      cfg: _frontSubsCfg
    });

    const rear = placeSubwoofers({
      room,
      wallY_m: 0, 
      screenPlaneY_m: stableDimensions.length, 
      lcr,
      group: "rear",
      cfg: _rearSubsCfg
    });
    
    if (typeof setSubwoofers === 'function') setSubwoofers([...front.placed, ...rear.placed]);
    
    setSubWarnings(prev => ({ ...prev, rear: rear.warnings }));
    
    const currentMinFromLcr_m = _screen.floatDepthM || 0;
    const needed_m = Math.max(front.neededScreenDepth_m || 0, currentMinFromLcr_m);

    if (needed_m > currentMinFromLcr_m && Math.abs(needed_m - currentMinFromLcr_m) > 0.001) {
        _setScreen(s => ({ ...s, floatDepthM: needed_m }));
    }

  }, [_roomDims?.widthM, _roomDims?.lengthM, _roomDims?.heightM, placedSpeakers, _frontSubsCfg, _rearSubsCfg, _screen, stableDimensions.length, _isFrozen, setSubwoofers, setSubWarnings, _setScreen]);


  const initWithDefaultsAndRules = React.useMemo(
    () => (typeof store?.initWithDefaultsAndRules === "function" ? store.initWithDefaultsAndRules : () => {}),
    [store?.initWithDefaultsAndRules]
  );
  const setSpeakers = React.useMemo(
    () => (typeof store?.setSpeakers === "function" ? store?.setSpeakers : () => {}),
    [store?.setSpeakers]
  );

  // NEW: Hydrate speaker system from handoff nodes (only if no speakers placed yet)
  useEffect(() => {
    // === Manual seeding mode (leave speakers empty until user acts)
    const AUTOSEED_ON_LOAD = false; // set true only if you want auto-hydration again

    if (!AUTOSEED_ON_LOAD) return; // <-- new hard guard, prevents any seeding

    // Only proceed if speakerNodes are available and not empty
    if (!_speakerNodes || !Array.isArray(_speakerNodes) || _speakerNodes.length === 0) {
      return;
    }

    // Check if we already have speakers in the scene that are 5.1 bed speakers
    // This uses canonical roles to be flexible (e.g., Ls maps to SL)
    const existingSpeakers = placedSpeakers || [];
    const has51BedRoles = ['FL', 'FC', 'FR', 'SL', 'SR'].some(role => 
      existingSpeakers.some(s => safeCanon(s.role) === role)
    );

    // Only hydrate from handoff if no 5.1 bed speakers exist yet in the current design
    if (!has51BedRoles && setSpeakers) {
      debug('[Speakers] Hydrating speakers from SPL handoff data (speakerNodes).');
      const hydratedSpeakers = _speakerNodes.map(node => ({
        id: node.id || node.role, // Use ID or role for unique ID
        role: canon(node.role), // Canonicalize roles (e.g., L -> FL, Ls -> SL)
        brand: node.brand,
        model: node.model,
        position: { x: node.x, y: node.y, z: node.z },
        rotation_deg: node.rotation_deg || 0,
        isLineSource: node.isLineSource || false
      }));

      // Set Dolby preset to 5.1 if handoff happens, to match the speaker set
      setDolbyPreset("5.1");

      setSpeakers(hydratedSpeakers);
    } else if (_speakerNodes && _speakerNodes.length > 0 && has51BedRoles) {
      debug('[Speakers] Skipping SPL handoff hydration: 5.1 speakers already present.');
    }
  }, [_speakerNodes, placedSpeakers, setSpeakers, setDolbyPreset]); // Dependencies: _speakerNodes, placedSpeakers (to check existence), setSpeakers, setDolbyPreset


  // NEW: Guarded setters for each tab (tab names align with UI below)
  const setScreenGuarded = useGuardedSetter(_setScreen, 'screen');
  const setSeatingPositionsGuarded = useGuardedSetter(appState?.setSeatingPositions, 'seating');
  const setSeatingRowsGuarded = useGuardedSetter(appState?.setSeatingRows, 'seating');
  const setSeatsPerRowGuarded = useGuardedSetter(appState?.setSeatsPerRow, 'seating');
  const setSeatSpacingGuarded = useGuardedSetter(appState?.setSeatSpacing, 'seating');
  const setRowSpacingGuarded = useGuardedSetter(_setRowSpacingM, 'seating');
  const setSeatingBlockOffsetGuarded = useGuardedSetter(appState?.setSeatingBlockOffset, 'seating');
  const setMlpBasisGuarded = useGuardedSetter(appState?.setMlpBasis, 'seating');
  const setRoomElementsGuarded = useGuardedSetter(appState?.setRoomElements, 'elements');

  // Pass appState as the first argument to useProjectLoader
  const {
    projectId: projectIdState,
    projectName,
    loadState,
    autosaveStatus,
    handleSaveProject: triggerSaveProject,
    reloadProject
   } = useProjectLoader(
    appState, // Pass appState here
    {
    projectIdFromUrl: initialProjectIdFromUrl,
    dolbyPreset,
    dimensions: stableDimensions, // Pass stableDimensions for serializeProject's old fields
    screen: _screen, seatingPositions: _seatingPositions, roomElements: _roomElements,
    overlays: _overlays, frozenTabs: _frozenTabs,
    setDimensions: _setRoomDims, // Set appState.roomDims directly
    setScreen: _setScreen, setSeatingPositions: appState?.setSeatingPositions,
    setRoomElements: appState?.setRoomElements,
    setOverlays: _setOverlays, setDolbyConfig: appState?.setDolbyConfig,
    setDolbyPreset,
    setSpeakerSystem: store.setSpeakerSystem,
    initWithDefaultsAndRules: initWithDefaultsAndRules,
    placedSpeakers: placedSpeakers,
    sevenBedLayoutType: _sevenBedLayoutType,
    setSevenBedLayoutType: appState?.setSevenBedLayoutType,
    frontSubsCfg: _frontSubsCfg,
    rearSubsCfg: _rearSubsCfg,
    setFrontSubsCfg: appState?.setFrontSubsCfg,
    setRearSubsCfg: appState?.setRearSubsCfg,
    lcrAimMode,
    setLcrAimMode,
    enableFrontWides: _enableFrontWides,
    setEnableFrontWides: _setEnableFrontWides,
    selectedSpeakersByRole: _selectedSpeakersByRole, // Pass from appState
    setSelectedSpeakersByRole: _setSelectedSpeakersByRole, // Pass setter for appState
    speakerNodes: _speakerNodes, // Pass from appState
    setSpeakerNodes: _setSpeakerNodes, // Pass setter for appState
    overheadGlobalModel: overheadGlobalModel,
    overheadFrontOverride: overheadFrontOverride,
    overheadMidOverride: overheadMidOverride,
    overheadRearOverride: overheadRearOverride,
    useFrontGlobal: useFrontGlobal,
    useMidGlobal: useMidGlobal,
    useRearGlobal: useRearGlobal,
    setOverheadGlobalModel: setOverheadGlobalModel,
    setOverheadFrontOverride: setOverheadFrontOverride,
    setOverheadMidOverride: setOverheadMidOverride,
    setOverheadRearOverride: setOverheadRearOverride,
    setUseFrontGlobal: setUseFrontGlobal,
    setUseMidGlobal: setUseMidGlobal,
    setUseRearGlobal: setUseRearGlobal,
    rowSpacingM: _rowSpacingM,
    setRowSpacingM: _setRowSpacingM,
  });

  useEffect(() => {
    if (appState && typeof appState.setSubWarnings === 'function') {
        appState.setSubWarnings(subWarnings);
    }
  }, [subWarnings, appState]);

  // NEW: Effect to re-clamp LCR speakers if their position becomes invalid after a model change
  useEffect(() => {
    if (loadState.phase !== 'loaded' || !placedSpeakers.length || !analysisResult?.zones) return;

    try {
      // Helper to get model dimensions
      const getModelDims = (modelId) => getSpeakerModelMeta(modelId) || {};
      
      const constraints = calculateLcrConstraints({
        placedSpeakers,
        zones: analysisResult.zones,
        room: stableDimensions, // Uses stableDimensions
        screen: stableScreen,
        getModelDims
      });
      
      let needsUpdate = false;
      const updatedSpeakers = placedSpeakers.map(speaker => {
        const constraint = constraints[speaker.role];
        if (!constraint) return speaker;

        const currentX = speaker.position.x;
        const { minX, maxX } = constraint.clamp;
        
        // If current position is outside the new valid corridor
        if (currentX < minX || currentX > maxX) {
          needsUpdate = true;
          const newX = Math.max(minX, Math.min(maxX, currentX));
          debug(`[Resize Re-clamp] Clamping ${speaker.role} X from ${currentX} to ${newX} (range: [${minX}, ${maxX}]).`);
          return { ...speaker, position: { ...speaker.position, x: newX } };
        }
        
        return speaker;
      });
      
      if (needsUpdate) {
        debug('[Resize Re-clamp] Adjusting LCR positions due to model change or constraint violation.');
        setSpeakers(updatedSpeakers);
      }
    } catch (error) {
      if (typeof console !== 'undefined' && typeof console.warn === 'function') {
        console.warn('[Resize Re-clamp] Error during re-clamping:', error);
      }
    }
  }, [placedSpeakers, analysisResult?.zones, stableDimensions, stableScreen, setSpeakers, loadState.phase]);

  // Effect to adjust LCR speaker positions in floating mode
  useEffect(() => {
    if (stableScreen.mountMode !== 'floating' || (_isFrozen && _isFrozen('speakers'))) return;
    const yLCR = stableScreen.floatDepthM || 0.20;
    const hasLCRChanges = placedSpeakers.some(spk => {
      const role = String(spk.role).toUpperCase();
      if (['FL', 'FC', 'FR'].includes(role)) {
        return Math.abs((spk.position.y || 0) - yLCR) > 0.01;
      }
      return false;
    });
    if (hasLCRChanges) {
      debug(`[Speakers] Adjusting LCR Y-position to ${yLCR}m for floating screen.`);
      setSpeakers(prevSpeakers => prevSpeakers.map(spk => {
        const role = String(spk.role).toUpperCase();
        if (['FL', 'FC', 'FR'].includes(role)) {
          return { ...spk, position: { ...(spk.position || {}), y: yLCR } };
        }
        return spk;
      }));
    }
  }, [stableScreen.mountMode, stableScreen.floatDepthM, placedSpeakers, _isFrozen, setSpeakers]);

  // NEW: Effect to lock FC speaker to room centerline
  useEffect(() => {
    if (!placedSpeakers.length || (_isFrozen && _isFrozen('speakers')) || !stableDimensions.width) return;

    const fcSpeaker = placedSpeakers.find(s => safeCanon(s.role) === 'FC');
    const centerX = stableDimensions.width / 2;

    if (fcSpeaker && Math.abs(fcSpeaker.position.x - centerX) > 0.001) { // 1mm tolerance
      debug('[Speakers] Locking FC speaker to room centerline.');
      setSpeakers(prevSpeakers => prevSpeakers.map(s => {
        if (safeCanon(s.role) === 'FC') {
          return { ...s, position: { ...(s.position || {}), x: centerX } };
        }
        return s;
      }));
    }
  }, [placedSpeakers, _isFrozen, stableDimensions.width, setSpeakers]);


  // Effect to swap between Rear Surrounds and Front Wides for 7.x layouts
  useEffect(() => {
    const is7ChannelBed = dolbyPreset && (dolbyPreset.startsWith('7.1') || dolbyPreset.startsWith('7.2'));
    if (!is7ChannelBed || (_isFrozen && _isFrozen('speakers'))) {
      return;
    }

    const currentSpeakers = placedSpeakers || [];
    const hasWides = currentSpeakers.some(s => s.role === 'LW' || s.role === 'RW');
    const hasRears = currentSpeakers.some(s => s.role === 'SBL' || s.role === 'SBR');
    
    const earZ = 1.1; // Standard ear height for bed speakers
    const hint = (typeof window !== "undefined" && window.__SURROUND_MODEL_HINT_) || null;
    const byRole = new Map(currentSpeakers.map(s => [s.role, s]));

    if (_sevenBedLayoutType === 'wides' && !hasWides && hasRears) {
      debug('[Speakers] Switching from Rear Surrounds (SBL/SBR) to Front Wides (LW/RW).');
      
      const lw = cloneRoleWithModel(byRole, 'SBL', 'LW', hint);
      lw.position = { x: stableDimensions.width * 0.15, y: stableDimensions.length * 0.4, z: earZ };
      
      const rw = cloneRoleWithModel(byRole, 'SBR', 'RW', hint);
      rw.position = { x: stableDimensions.width * 0.85, y: stableDimensions.length * 0.4, z: earZ };
      
      const nextList = currentSpeakers
        .filter(s => s.role !== 'SBL' && s.role !== 'SBR')
        .concat([lw, rw]);
      
      safeGroup('[Speakers] swap/reseed merge check (wides)', () => {
        safeTable(nextList.map(s => ({ role: s.role, model: s.model ?? '(none)' })));
      });
      setSpeakers(nextList);

    } else if (_sevenBedLayoutType === 'rears' && hasWides && !hasRears) {
      debug('[Speakers] Switching from Front Wides (LW/RW) to Rear Surrounds (SBL/SBR).');
      
      const sbl = cloneRoleWithModel(byRole, 'LW', 'SBL', hint);
      sbl.position = { x: stableDimensions.width * 0.25, y: stableDimensions.length - 0.1, z: earZ };
      
      const sbr = cloneRoleWithModel(byRole, 'RW', 'SBR', hint);
      sbr.position = { x: stableDimensions.width * 0.75, y: stableDimensions.length - 0.1, z: earZ };
      
      const nextList = currentSpeakers
        .filter(s => s.role !== 'LW' && s.role !== 'RW')
        .concat([sbl, sbr]);

      safeGroup('[Speakers] swap/reseed merge check (rears)', () => {
        safeTable(nextList.map(s => ({ role: s.role, model: s.model ?? '(none)' })));
      });
      setSpeakers(nextList);
    }
  }, [_sevenBedLayoutType, dolbyPreset, placedSpeakers, setSpeakers, stableDimensions.width, stableDimensions.length, _isFrozen]);

  // Effect to re-seed speakers when Dolby layout changes - now more selective
  useEffect(() => {
    if (!dolbyPreset || (_isFrozen && _isFrozen('speakers'))) return;

    const noSpeakers = (placedSpeakers || []).length === 0;
    const presetChanged = lastPresetRef.current !== dolbyPreset;

    // Only seed when the plan is empty or the user actually changed presets
    if (!noSpeakers && !presetChanged) {
      debug('[Speakers] Skipping re-seed: speakers exist and preset has not changed.');
      return;
    }

    // Determine the expected roles based on the dolbyPreset and current sevenBedLayoutType
    const is7ChannelBed = dolbyPreset && (dolbyPreset.startsWith('7.1') || dolbyPreset.startsWith('7.2'));
    let expectedRoles = DOLBY_PRESETS[dolbyPreset] || [];

    if (is7ChannelBed && _sevenBedLayoutType === 'wides') {
      expectedRoles = expectedRoles.map(role => {
        if (role === 'SBL') return 'LW';
        if (role === 'SBR') return 'RW';
        return role;
      });
    }

    const currentRolesSet = new Set(placedSpeakers.map(s => s.role));
    const expectedRolesSet = new Set(expectedRoles);

    // Check if current roles match expected roles
    const hasCorrectRoles = currentRolesSet.size === expectedRolesSet.size &&
      [...expectedRolesSet].every(role => currentRolesSet.has(role));

    if (!hasCorrectRoles || noSpeakers) { 
       debug(`[Speakers] Re-seeding speakers due to Dolby preset change (${presetChanged ? 'yes' : 'no'}) or inconsistency: ${dolbyPreset}, layout: ${_sevenBedLayoutType}`);
       // Seed with the canonical Dolby preset (which means SBL/SBR for 7.x)
       let seededSpeakers = seedSpeakersFromPreset({
         preset: dolbyPreset,
         roomDimensions: stableDimensions, // Use stableDimensions
         listeningArea: null,
       });

       // If it's a 7.x bed and the user wants 'wides', transform the seeded speakers
       if (is7ChannelBed && _sevenBedLayoutType === 'wides') {
         seededSpeakers = seededSpeakers
           .filter(s => s.role !== 'SBL' && s.role !== 'SBR')
           .concat([
             { id: 'LW', role: 'LW', label: 'LW', model: undefined, position: { x: stableDimensions.width * 0.15, y: stableDimensions.length * 0.4, z: 1.1 } },
             { id: 'RW', role: 'RW', label: 'RW', model: undefined, position: { x: stableDimensions.width * 0.85, y: stableDimensions.length * 0.4, z: 1.1 } },
           ]);
       }
       
       setSpeakers(prev => {
         const hint = (typeof window !== 'undefined' && window.__SURROUND_MODEL_HINT_) || null;
         const byCanonPrev = new Map((prev||[]).map(s => [safeCanon(s.role), s]));
         const nextList = (seededSpeakers||[]).map(seed => {
           const prevMatch = byCanonPrev.get(safeCanon(seed.role));
           let finalModel = prevMatch?.model ?? hint ?? undefined; // Start with previous or hint.

           // If it's an overhead speaker and no model yet from prevMatch or hint
           if (safeCanon(seed.role).startsWith('T')) {
               const canonRole = safeCanon(seed.role);
               let modelFromOverrides = undefined;

               if (['TFL', 'TFR', 'TFC'].includes(canonRole)) { // Front Overheads
                   modelFromOverrides = useFrontGlobal ? overheadGlobalModel : (overheadFrontOverride || overheadGlobalModel);
               } else if (['TL', 'TR'].includes(canonRole)) { // Mid Overheads (e.g. 5.1.2, 7.1.2)
                   modelFromOverrides = useMidGlobal ? overheadGlobalModel : (overheadMidOverride || overheadGlobalModel);
               } else if (['TBL', 'TBR', 'TBC'].includes(canonRole)) { // Rear Overheads
                   modelFromOverrides = useRearGlobal ? overheadGlobalModel : (overheadRearOverride || overheadGlobalModel);
               }
               
               finalModel = modelFromOverrides || overheadGlobalModel || finalModel; // Use override, then global, then whatever was there
           }
           // Fallback for non-overhead speakers if no model yet
           if (!finalModel) finalModel = seed.model; // seed.model is undefined, so this only matters if seedSpeakersFromPreset changes
           
           return { ...seed, model: finalModel };
         });

         safeGroup('[Speakers] preset re-seed merge check', () => {
           safeTable(nextList.map(s => ({ role: s.role, model: s.model ?? '(none)' })));
         });
         return nextList;
       });
    }
  }, [
    dolbyPreset, stableDimensions, setSpeakers, _isFrozen, placedSpeakers, _sevenBedLayoutType, lastPresetRef,
    overheadGlobalModel, overheadFrontOverride, overheadMidOverride, overheadRearOverride,
    useFrontGlobal, useMidGlobal, useRearGlobal
  ]);

  // Effect to build seat positions from computed row centers (using centerline)
  useEffect(() => {
    if ((_isFrozen && _isFrozen('seating')) || !appState?.rowCentersM?.length || !stableDimensions?.width || !stableDimensions?.length) return;
    
    const widthM = stableDimensions.width;
    const lengthM = stableDimensions.length;
    
    // Canonical centerline
    const centerX_m = widthM / 2;
    const EPS_M = 0.0005;
    
const spacing = Math.max(0, Number(_seatSpacing) || 0.8);

// Per-row seat counts: use seatsPerRowByRow if present, otherwise fall back to one number per row
const perRowCounts = Array.isArray(seatsPerRowByRow) && seatsPerRowByRow.length
  ? seatsPerRowByRow.map(n => Math.max(1, Number(n) || 1))
  : Array.from({ length: appState.rowCentersM.length }, () => Math.max(1, Number(_seatsPerRow) || 2));
    
    /* START: Y-only viewing offset seat builder */

// Viewing offset (Y-axis, forward/back). Keep X locked to centre.
const viewingOffsetM = Number(_seatingBlockOffset) || 0;

// X is always the room centre; do NOT add viewingOffsetM to X.
const centerSeatX_m = centerX_m;

const allSeats = [];

appState.rowCentersM.forEach((rowY, rowIdx) => {
  if (rowY === null || !Number.isFinite(rowY)) return;
    const rowSeatCount = perRowCounts[rowIdx] ?? perRowCounts[perRowCounts.length - 1];

  // Apply the offset on Y only
  const rawY = rowY;

  // Clamp Y to room bounds with clearance
  const MIN_Y = 0.4;
  const MAX_Y = lengthM - 0.4;
  const clampedY = Math.max(MIN_Y, Math.min(MAX_Y, rawY));

  // Build seats across the row
    for (let seatIdx = 0; seatIdx < rowSeatCount; seatIdx++) {
    const offsetFromCenter = (seatIdx - (seatCount - 1) / 2) * spacing;

    // X spans from centre; never include viewingOffsetM here
    const x = centerSeatX_m + offsetFromCenter;

    // Clamp X to room bounds with clearance
    const MIN_X = 0.4;
    const MAX_X = widthM - 0.4;
    const clampedX = Math.max(MIN_X, Math.min(MAX_X, x));

    // Ear height varies by row (unchanged)
    const z = 1.2 + rowIdx * 0.1;

    allSeats.push({
      id: `R${rowIdx + 1}S${seatIdx + 1}`,
      x: Number(clampedX.toFixed(3)),
      y: Number(clampedY.toFixed(3)),
      z: Number(z.toFixed(3)),
      rowNumber: rowIdx + 1,
      seatNumber: seatIdx + 1,
      isPrimary: false,
    });
  }
});

/* END: Y-only viewing offset seat builder */
    
    if (allSeats.length > 0 && typeof appState?.setSeatingPositions === 'function') {
      appState.setSeatingPositions(allSeats);
    }
  }, [
    appState?.rowCentersM,
    _seatsPerRow,
    _seatSpacing,
    _seatingBlockOffset,
    stableDimensions?.width,
    stableDimensions?.length,
    appState?.setSeatingPositions,
    _isFrozen
  ]);

  // Manual seating generation - now uses anchor-based positioning
const handleGenerateSeating = useCallback((overrides = {}) => {
  if (_isFrozen && _isFrozen('seating')) return;

  // 1) Read incoming values or fall back to current state
  const effectiveSeatSpacing = overrides.seatSpacing ?? (_seatSpacing ?? 0.8);
  const effectiveRowSpacing  = overrides.rowSpacingM ?? (_rowSpacingM ?? 1.8);

  // 2) Build a per-row list of seat counts
  const fromList = Array.isArray(overrides.seatsPerRowByRow) && overrides.seatsPerRowByRow.length
    ? overrides.seatsPerRowByRow.map(n => Math.max(1, Number(n) || 1))
    : null;

  const fallbackCount = overrides.seatsPerRow ?? (_seatsPerRow ?? 2);
  const fallbackRows  = overrides.numberOfRows ?? (_seatingRows ?? 1);

  const list = fromList
    ? fromList
    : Array.from({ length: Math.max(1, Number(fallbackRows) || 1) }, () => Math.max(1, Number(fallbackCount) || 1));

  // 3) Push changes to state
  //    – Always keep the row count in sync
  if (typeof setSeatingRowsGuarded === 'function') setSeatingRowsGuarded(list.length);

  //    – Only touch the old single “seatsPerRow” when we are NOT using a per-row list
  if (!fromList && typeof setSeatsPerRowGuarded === 'function') {
    setSeatsPerRowGuarded(Math.max(1, Number(fallbackCount) || 1));
  }

  //    – Save spacings
  if (typeof setSeatSpacingGuarded === 'function') setSeatSpacingGuarded(effectiveSeatSpacing);
  if (typeof setRowSpacingGuarded  === 'function') setRowSpacingGuarded(effectiveRowSpacing);

  setSeatsPerRowByRow(list);
}, [
  _seatsPerRow,
  _seatingRows,
  _seatSpacing,
  _rowSpacingM,
  _isFrozen,
  setSeatsPerRowGuarded,
  setSeatingRowsGuarded,
  setSeatSpacingGuarded,
  setRowSpacingGuarded,
  setSeatsPerRowByRow,   // keep this
]);

  // Normalise seat flags whenever seating or room size changes
  useEffect(() => {
    const { seatsWithFlags } = computeMLPAndPrimary(
      Array.isArray(_seatingPositions) ? _seatingPositions : [],
      _roomDims?.widthM || 0, // Use _roomDims properties
      _roomDims?.lengthM || 0, // Use _roomDims properties
      _mlpBasis
    );

    const sameLength = (_seatingPositions || []).length === seatsWithFlags.length;
    const flagsChanged = !sameLength || (_seatingPositions || []).some((s, i) => !!s.isPrimary !== !!seatsWithFlags[i].isPrimary);

    if (flagsChanged) {
      (appState?.setSeatingPositions || (() => {}))(seatsWithFlags); // Call appState setter
    }
  }, [_seatingPositions, _roomDims?.widthM, _roomDims?.lengthM, _mlpBasis, appState?.setSeatingPositions]); // Add _roomDims to dependencies

  const handleOptimiseAll = React.useCallback(() => {
    if (_isFrozen && _isFrozen('speakers')) return;
    try {
      const spks = Array.isArray(placedSpeakers) ? placedSpeakers : [];
      if (spks.length < 2) return;

      const bedRoles = new Set(["FWL","FWR","LW","RW","SL","SR","LS","RS","LRS","RRS","SBL","SBR","LR","RR"]);
      const bedSpeakers = spks
        .filter(s => bedRoles.has(String(s.role).toUpperCase()))
        .map(s => ({ id: String(s.id || s.role), role: String(s.role).toUpperCase(), position: { x: Number(s.position?.x) || 0, y: Number(s.position?.y) || 0 } }));

      if (bedSpeakers.length < 2) return;

      const pads = getBedPads({ dimensions: stableDimensions, seatingPositions: _seatingPositions });
      // Use the fixed mlpAnchorEffective if available, otherwise fallback to computing from seats for optimization
      const mlpForOptimization = mlpAnchorEffective || computeMLPAndPrimary(_seatingPositions, stableDimensions.width, stableDimensions.length, _mlpBasis).mlp;

      const eq = equalizeBedAngles({
        dimensions: { width: stableDimensions.width, length: stableDimensions.length }, // Use stableDimensions
        mlp: mlpForOptimization, // Use mlpAnchorEffective here for consistency
        speakers: bedSpeakers,
        pads,
        targets: [50, 60, 80],
        weights: { evenness: 1.0, pad: 5.0, target: 0.6 },
        steps: 250,
      });

      const byId = new Map(eq.map(s => [s.id, s]));
      const surRoles = new Set(["FWL","FWR","LW","RW","SL","SR","LS","RS","LRS","RRS","SBL","SBR","LR","RR"]);
      const surrogate = spks
        .filter(s => surRoles.has(String(s.role).toUpperCase()))
        .map(s => ({
          position: {
            x: byId.get(String(s.id || s.role))?.position?.x ?? s.position?.x ?? 0,
            y: byId.get(String(s.id || s.role))?.position?.y ?? s.position?.y ?? 0
          }
        }));

      const gaps = surrogate.length ? (surrogate.length === 2
        ? [backSweepGap2(mlpForOptimization, surrogate[0].position, surrogate[1].position)]
        : backSweepGaps(mlpForOptimization, surrogate.map(p => ({ position: p.position })))
      ) : [];

      let maxGap = gaps.length ? Math.max(...gaps) : 0;

      if (maxGap < 80) {
        for (const item of eq) {
          const pad = pads[item.role];
          if (!pad) continue;
          const EPS = 0.03;
          if (pad.axis === "y") {
            const mid = (pad.min + pad.max) / 2;
            item.position.y += item.position.y >= mid ? EPS : -EPS;
            item.position.y = Math.max(pad.min, Math.min(pad.max, item.position.y));
          } else {
            const mid = (pad.min + pad.max) / 2;
            item.position.x += item.position.x >= mid ? EPS : -EPS;
            item.position.x = Math.max(pad.min, Math.min(pad.max, item.position.x));
          }
        }
      }

      const byIdAfter = new Map(eq.map(s => [s.id, s]));
      const merged = spks.map(s => {
        const k = String(s.id || s.role);
        const u = byIdAfter.get(k);
        if (!u) return s;
        return { ...s, position: { ...(s.position || {}), x: u.position.x, y: u.position.y } };
      });

      setSpeakers(merged);
    } catch (e) {
      console.error("[OptimiseAll] failed:", e);
    }
  }, [placedSpeakers, stableDimensions, _seatingPositions, _mlpBasis, _isFrozen, setSpeakers, mlpAnchorEffective]);

  // Manual Save Project function now just calls the one from useProjectLoader
  const handleSaveProject = React.useCallback(async () => {
    await triggerSaveProject();
  }, [triggerSaveProject]);

  // decide which overlay toggles are relevant for the current system configuration
  const overlayRelevance = React.useMemo(() => {
    const preset = String(dolbyPreset || "5.1");
    const parts = preset.split(".");
    const major = Number(parts[0] || 5) || 5;     // 5, 7, 9...
    const heights = Number(parts[2] || 0) || 0;   // 0, 2, 4, 6...
    const type = String(_sevenBedLayoutType || "").toLowerCase(); // 'wides' | 'rears' | ''

    const is5x = major >= 5;
    const is7x = major >= 7;

    return {
      // always allowed
      LCR: true,
      RP22_ANGLES: true,
      enableDolbyZones: true, // NEW: Dolby Zones toggle is always relevant

      // bed surrounds
      SIDE_SURROUND: is5x,
      REAR_SURROUND: is7x && type === "rears",
      FRONT_WIDES: is7x, // Show Front Wide toggle for all 7.x configs

      // overheads — show only the matching count
      OVERHEADS_2: heights === 2,
      OVERHEADS_4: heights === 4,
      OVERHEADS_6: heights === 6,
    };
  }, [dolbyPreset, _sevenBedLayoutType]);

  // Consolidate overlays for rendering
  const overlaysForRendering = useMemo(() => {
    // Start with the existing _overlays from appState (which contains boolean toggles)
    const base = { ...(_overlays || {}) };
    
    // This `FRONT_WIDE` key in `base` will now hold the full `frontWideZones` object
    // (which includes status like 'disabled', 'no-mlp', 'ok', etc.)
    base.FRONT_WIDE = frontWideZones;
    
    // This flag is what RoomVisualisation will use to decide if it should render the zones
    // AND if it should show the HUD for front wides.
    base.enableFrontWides = _enableFrontWides;
    
    return base;
  }, [_overlays, frontWideZones, _enableFrontWides]);

  // IMPORTANT: This check must remain after all hook calls to avoid conditional hook call errors.
  if (!appState) {
    return <div className="p-6 text-sm">Loading Room Designer…</div>;
  }
  
  // Safely destructure appState properties for JSX or non-hook logic after the conditional return
  const {
    seatingPositions, seatingRows, seatsPerRow,
    seatingBlockOffset, seatSpacing, mlpBasis, roomElements, 
    subwoofers,
    setScreenWall, setDolbyConfig, isFrozen, freezeTab, unfreezeTab, frozenTabs,
    overlays, setOverlays, setSevenBedLayoutType,
    frontSubsCfg, setFrontSubsCfg, rearSubsCfg, setRearSubsCfg,
    enableFrontWides: appStateEnableFrontWides, setEnableFrontWides: appStateSetEnableFrontWides,
    rowSpacingM, setRowSpacingM,
  } = appState;

  return (
    <div className="flex flex-col h-full bg-[#F8F8F7]" style={{ minHeight: 0 }}>
      <style>{`
        .brand-btn{
          background:#213428 !important;
          color:#fff !important;
          border-color:transparent !important;
        }
        .brand-btn:hover{ background:#3E4349 !important; }
      `}</style>

      <header className="p-4 bg-white border-b border-[#DCDBD6] flex-shrink-0">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-[#1B1A1A] font-header">Cinema Designer</h1>
          
          <div className="flex items-center" style={{ gap: '12px' }}>
            <Button
              size="sm"
              className="brand-btn"
              onClick={handleOptimiseAll}
              disabled={isFrozen('speakers') || placedSpeakers.length < 2}
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Optimise
            </Button>

            <Button size="sm" className="brand-btn" onClick={handleSaveProject}>
              <Save className="w-4 h-4 mr-2" />
              Save Project
            </Button>
          </div>
        </div>
        <div className="mt-2 text-xs flex items-center gap-4">
            {showLocalHint && (
              <div className="text-xs text-amber-600 inline-flex items-center gap-2">
                Working locally — select a project to save to cloud
              </div>
            )}
            {loadState.phase === "loading" && ( <div className="text-xs text-gray-500 inline-flex items-center gap-2"> Loading project... </div> )}
            {loadState.phase === "loaded" && ( <div className="text-xs text-gray-600 inline-flex items-center gap-2"> Loaded "{loadState.name}" </div> )}
            {loadState.phase === "error" && ( <div className="text-xs text-red-600 inline-flex items-center gap-2"> Error: {loadState.error} <Button size="xs" variant="outline" className="ml-2 h-6 px-2" onClick={() => { const ctrl = new AbortController(); reloadProject(ctrl.signal); }}><RotateCcw className="w-3 h-3 mr-1" /> Retry</Button> </div> )}
            {autosaveStatus === "saving"  && <span className="text-gray-500">Saving…</span>}
            {autosaveStatus === "saved"   && <span className="text-[#3E4349]">All changes saved</span>}
            {autosaveStatus === "dirty"   && <span className="text-amber-600">Pending changes…</span>}
            {autosaveStatus === "hydrating" && <span>Loading project data...</span>}
        </div>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(560px, 48vw) 1fr",
          gap: 16,
          overflow: "hidden",
          padding: 16,
          flex: "1 1 auto",
          minWidth: 0,
          minHeight: 0,
        }}
      >
        <section
          className="relative bg-white border border-[#DCDBD6] rounded-2xl overflow-hidden" // Change from auto to hidden since we're managing scroll inside
          style={{
            minWidth: 0,
            minHeight: 0,
            height: "calc(100vh - 152px)", // Preserve height constraint
          }}
        >
          {/* NEW: Static top bar above the drawing (pushes canvas down; no cropping) */}
          <div
            className="plan-toolbar"
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 10px',
              borderBottom: '1px solid #DCDBD6',
              background: '#FFFFFF',
              zIndex: 1
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, color: '#625143' }}>Plan Tools</span>
            </div>

            {/* PLAN TOOLS — dynamic list, only show relevant items */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, auto)', gap: 12, alignItems: 'center' }}>
              {[
                { key: 'LCR',           label: 'LCR' },
                { key: 'SIDE_SURROUND', label: 'Side Surrounds' },
                { key: 'REAR_SURROUND', label: 'Rear Surrounds' },
                { key: 'OVERHEADS_2',   label: 'Overheads .2' },
                { key: 'OVERHEADS_4',   label: 'Overheads .4' },
                { key: 'OVERHEADS_6',   label: 'Overheads .6' },
                { key: 'RP22_ANGLES',   label: 'RP22 Angles' },
                { key: 'enableDolbyZones', label: 'Dolby Zones' },
              ]
                .filter(({ key }) => overlayRelevance[key] !== false)
                .map(({ key, label }) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <label htmlFor={`overlay-top-${key}`} style={{ fontSize: 12, color: '#3E4349' }}>{label}</label>
                    <Switch
                      id={`overlay-top-${key}`}
                      checked={!!_overlays?.[key]}
                      onCheckedChange={() => {
                        _setOverlays(prev => ({ ...prev, [key]: !prev[key] }));
                      }}
                    />
                  </div>
                ))}

              {overlayRelevance.FRONT_WIDES && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <label htmlFor="overlay-top-front-wides" style={{ fontSize: 12, color: '#3E4349' }}>Front Wides</label>
                  <Switch
                    id="overlay-top-front-wides"
                    checked={!!_enableFrontWides}
                    onCheckedChange={(checked) => {
                      _setEnableFrontWides(checked);
                    }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Content wrapper below the toolbar; canvas gets pushed down naturally */}
          <div style={{ height: 'calc(100% - 36px)', overflow: 'auto' }}>
            <ErrorBoundary name="RoomVisualisation">
              <Suspense fallback={<div className="p-4">Loading 3D View...</div>}>
                <RoomVisualisation
                  ref={visualisationRef}
                  mlpPoint={mlpAnchorEffective}
                  analysisResult={analysisResult || {}
                  }
                  placedSpeakers={placedSpeakers}
                  frontSubs={frontSubsForRendering}
                  rearSubs={rearSubsForRendering}
                  dimensions={stableDimensions}
                  seatingPositions={_seatingPositions}
                  screen={_screen}
                  onSetSpeakers={setSpeakers}
                  onSetSeatingPositions={appState?.setSeatingPositions}
                  overlays={overlaysForRendering}
                  roomElements={_roomElements}
                  dolbyLayout={dolbyPreset}
                  aimAtMLP={lcrAimMode === "angled"}
                  onLcrAngleComputed={setLcrAngleDeg}
                  rowTarget={null}
                  viewingDistanceOffsetM={_seatingBlockOffset}
                  mlpBasis={_mlpBasis}
                  rp22AnglesEnabled={_overlays?.RP22_ANGLES}
                />
              </Suspense>
            </ErrorBoundary>
          </div>

        </section>

        <aside className="relative z-30" style={{ minWidth: 0, minHeight: 0 }}>
          <div
            style={{
              height: "calc(100vh - 152px)",
              overflow: "auto",
              paddingRight: 8,
            }}
            className="space-y-3"
          >
              <CollapsiblePanel
                title="Room Dimensions"
                icon={<Ruler className="w-5 h-5" />}
                defaultOpen={true}
              >
                  {isFrozen('dimensions') && (
                    <div className="mb-3 text-xs px-3 py-2 rounded border border-amber-300 bg-amber-50 text-amber-800">
                      This tab is frozen. Unlock to make changes.
                    </div>
                  )}
                  <Suspense fallback={<div>Loading...</div>}>
                      <RoomDimensions 
                        width_m={_roomDims?.widthM} 
                        length_m={_roomDims?.lengthM} 
                        height_m={_roomDims?.heightM} 
                        onChange={(partial) => {
                          if (!isFrozen('dimensions') && _setRoomDims) {
                            _setRoomDims(prev => ({ ...prev, ...partial }));
                          }
                        }} 
                        disabled={isFrozen('dimensions')} 
                      />
                  </Suspense>
              </CollapsiblePanel>

              <CollapsiblePanel
                title="Screen Size"
                icon={<Monitor className="w-5 h-5" />}
                defaultOpen={false}
              >
                  {isFrozen('screen') && (
                    <div className="mb-3 text-xs px-3 py-2 rounded border border-amber-300 bg-amber-50 text-amber-800">
                      This tab is frozen. Unlock to make changes.
                    </div>
                  )}
                  <Suspense fallback={<div>Loading...</div>}>
                      <ScreenConfiguration 
                        dimensions={stableDimensions}
                        screen={_screen}
                        onScreenChange={setScreenGuarded}
                        seatingPositions={seatingPositions} 
                        dolbyConfig={dolbyPreset} 
                        disabled={isFrozen('screen')} 
                      />
                  </Suspense>
              </CollapsiblePanel>

              <CollapsiblePanel
                title="Seating Layout"
                icon={<Users className="w-5 h-5" />}
                defaultOpen={false}
              >
                  {isFrozen('seating') && (
                    <div className="mb-3 text-xs px-3 py-2 rounded border border-amber-300 bg-amber-50 text-amber-800">
                      This tab is frozen. Unlock to make changes.
                    </div>
                  )}
                  <Suspense fallback={<div>Loading...</div>}>
                      <SeatingLayout 
                        seatingPositions={seatingPositions} 
                        onGenerateSeating={handleGenerateSeating} 
                        seatsPerRow={seatsPerRow} 
                        onSeatsPerRowChange={setSeatsPerRowGuarded} 
                        seatingRows={seatingRows} 
                        onSeatingRowsChange={setSeatingRowsGuarded} 
                        seatSpacing={seatSpacing} 
                        onSeatSpacingChange={setSeatSpacingGuarded} 
                        rowSpacingM={rowSpacingM || 1.8}
                        onRowSpacingChange={(val) => {
                          if (!isFrozen('seating') && typeof setRowSpacingM === 'function') {
                            setRowSpacingM(val);
                          }
                        }}
                        seatingBlockOffset={_seatingBlockOffset} 
                        onSeatingBlockOffsetChange={setSeatingBlockOffsetGuarded} 
                        mlpBasis={mlpBasis} 
                        onMlpBasisChange={setMlpBasisGuarded} 
                        onSetSeatingPositions={appState?.setSeatingPositions} 
                        disabled={isFrozen('seating')} 
                        screen={_screen} 
                        dimensions={stableDimensions}
                        shiftSeatsToMaintainAngle={visualisationRef.current?.shiftSeatsToMaintainAngle} 
                      />
                  </Suspense>
              </CollapsiblePanel>

              <CollapsiblePanel
                title="Speakers"
                icon={<Speaker className="w-5 h-5" />}
                defaultOpen={false}
              >
                  {isFrozen('speakers') && (
                    <div className="mb-3 text-xs px-3 py-2 rounded border border-amber-300 bg-amber-50 text-amber-800">
                      This tab is frozen. Unlock to make changes.
                    </div>
                  )}
                  <Suspense fallback={<div>Loading...</div>}>
                      <SpeakerPlacement disabled={isFrozen('speakers')}
                        sevenBedLayoutType={_sevenBedLayoutType}
                        onSevenBedLayoutTypeChange={setSevenBedLayoutType}
                        dolbyPreset={dolbyPreset}
                        onDolbyPresetChange={setDolbyPreset}
                        lcrAimMode={lcrAimMode}
                        onChangeLcrAimMode={setLcrAimMode}
                        lcrAngleDeg={lcrAngleDeg}

                        overheadGlobalModel={overheadGlobalModel}
                        setOverheadGlobalModel={setOverheadGlobalModel}
                        overheadFrontOverride={overheadFrontOverride}
                        setOverheadFrontOverride={setOverheadFrontOverride}
                        overheadMidOverride={overheadMidOverride}
                        setOverheadMidOverride={setOverheadMidOverride}
                        overheadRearOverride={overheadRearOverride}
                        setOverheadRearOverride={setOverheadRearOverride}
                        useFrontGlobal={useFrontGlobal}
                        setUseFrontGlobal={setUseFrontGlobal}
                        useMidGlobal={useMidGlobal}
                        setUseMidGlobal={setUseMidGlobal}
                        useRearGlobal={useRearGlobal}
                        setUseRearGlobal={setUseRearGlobal}
                      />
                  </Suspense>
              </CollapsiblePanel>
              
              <CollapsiblePanel
                title="Bass Simulation"
                icon={<Waves className="w-5 h-5" />}
                defaultOpen={false}
              >
                  {isFrozen('bass') && (
                    <div className="mb-3 text-xs px-3 py-2 rounded border border-amber-300 bg-amber-50 text-amber-800">
                      This tab is frozen. Unlock to make changes.
                    </div>
                  )}
                  <Suspense fallback={<div>Loading...</div>}>
                      <BassResponse disabled={isFrozen('bass')} 
                        frontSubsCfg={frontSubsCfg}
                        setFrontSubsCfg={setFrontSubsCfg}
                        rearSubsCfg={rearSubsCfg}
                        setRearSubsCfg={setRearSubsCfg}
                        subWarnings={subWarnings}
                      />
                  </Suspense>
              </CollapsiblePanel>

              <CollapsiblePanel
                title="Room Elements"
                icon={<Box className="w-5 h-5" />}
                defaultOpen={false}
              >
                  {isFrozen('elements') && (
                    <div className="mb-3 text-xs px-3 py-2 rounded border border-amber-300 bg-amber-50 text-amber-800">
                      This tab is frozen. Unlock to make changes.
                    </div>
                  )}
                  <Suspense fallback={<div>Loading...</div>}>
                      <RoomElements elements={roomElements} onChange={setRoomElementsGuarded} disabled={isFrozen('elements')} />
                  </Suspense>
              </CollapsiblePanel>
              
              <CollapsiblePanel
                title="Compliance Report"
                icon={<FileText className="w-5 h-5" />}
                defaultOpen={false}
              >
                  {isFrozen('report') && (
                    <div className="mb-3 text-xs px-3 py-2 rounded border border-amber-300 bg-amber-50 text-amber-800">
                      This tab is frozen. Unlock to make changes.
                    </div>
                  )}
                  <Suspense fallback={<div>Loading...</div>}>
                      <RP22CompliancePanel analysisResult={analysisResult} screen={_screen} />
                  </Suspense>
              </CollapsiblePanel>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function RoomDesignerPage() {
  const disabled = typeof window !== "undefined" && window.__DISABLE_ROOM_DESIGNER === true;
  if (disabled) {
    return <div className="p-6 text-sm">Room Designer is temporarily disabled.</div>;
  }
  
  return (
    <SidebarInset>
      <div className="flex flex-col gap-4 px-4 md:px-6">
        <AppStateProvider>
          <Suspense fallback={<div className="p-6">Loading…</div>}>
            <ErrorBoundary fallback={<div className="p-6">Failed to mount Room Designer.</div>}>
              <RoomDesignerWithState />
            </ErrorBoundary>
          </Suspense>
        </AppStateProvider>
      </div>
    </SidebarInset>
  );
}
