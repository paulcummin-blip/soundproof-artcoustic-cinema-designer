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
import { useActiveProjectId } from "@/components/state/project-session";

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
import { computeAllSeatSplMetrics, getMlpSeat } from "@/components/utils/spl/centralSplEngine";
import { usePriceCalculation } from "@/components/pricing/usePriceCalculation";

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
const CANON_MAP = { 
  LS:'SL', SL:'SL', RS:'SR', SR:'SR', 
  RL:'SBL', RR:'SBR', RSL:'SBL', RSR:'SBR', LRS:'SBL', RRS:'SBR', 
  FWL:'LW', FWR:'RW', LW:'LW', RW:'RW', 
  SBL:'SBL', SBR:'SBR', 
  FL:"FL", L:"FL", FC:"FC", C:"FC", FR:"FR", R:"FR", 
  TFL:"TFL", TFR:"TFR", 
  TML:"TML", TMR:"TMR", TL:"TML", TR:"TMR", // Map legacy TL/TR to TML/TMR
  TRL:"TRL", TRR:"TRR", TBL:"TRL", TBR:"TRR", // Map legacy TBL/TBR to TRL/TRR
  TFC:"TFC", TRC:"TRC", TBC:"TRC"
};
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

// --- ATMOS OVERHEAD PRESERVATION HELPERS ---
function isOverheadRole(role) {
  const canon = safeCanon(role);
  const OVERHEAD_ROLES = new Set([
    'TFL', 'TFR', 'TML', 'TMR', 'TRL', 'TRR',
    'TFC', 'TRC', 'TBC', 'TL', 'TR', 'TBL', 'TBR'
  ]);
  return OVERHEAD_ROLES.has(canon);
}

function mergePreserveOverheads(prevList, draftNextList) {
  const prev = Array.isArray(prevList) ? prevList : [];
  const next = Array.isArray(draftNextList) ? draftNextList : [];

  // Collect overhead speakers from both lists
  const prevOverheads = prev.filter(s => isOverheadRole(s.role));
  const nextOverheads = next.filter(s => isOverheadRole(s.role));

  // If the draft has overheads, use those; otherwise keep previous
  const overheadsToKeep = nextOverheads.length > 0 ? nextOverheads : prevOverheads;

  // Deduplicate overheads by canonical role (last one wins)
  const overheadMap = new Map();
  overheadsToKeep.forEach(s => {
    overheadMap.set(safeCanon(s.role), s);
  });

  // Build final list: bed speakers from draft + deduplicated overheads
  const nextBeds = next.filter(s => !isOverheadRole(s.role));
  const mergedOverheads = Array.from(overheadMap.values());
  const finalList = [...nextBeds, ...mergedOverheads];

  console.log('[RD] mergePreserveOverheads', {
    prevCount: prev.length,
    nextCount: next.length,
    finalCount: finalList.length,
    overheads: mergedOverheads.map(s => safeCanon(s.role))
  });

  return finalList;
}
// --- END ATMOS OVERHEAD PRESERVATION HELPERS ---

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
  // NEW: Seats Per Row By Row
  seatsPerRowByRow,
  setSeatsPerRowByRow,
}) {
  const [projectIdState, setProjectIdState] = useState(projectIdFromUrl);
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
    if (!p) return;

    // DEBUG: Log what we're loading
    console.log('[RD] hydrateFromProject', {
      id: p.id,
      name: p.name,
      client_name: p.client_name,
      roomDims: p.roomDims,
      room_width: p.room_width,
      room_length: p.room_length,
      room_height: p.room_height,
      seating_positions: typeof p.seating_positions === 'string' ? p.seating_positions.slice(0, 200) : p.seating_positions,
      selected_speakers: typeof p.selected_speakers === 'string' ? p.selected_speakers.slice(0, 200) : p.selected_speakers,
    });

    //
    // 1) ROOM DIMS (single source of truth)
    //
    if (appState?.setRoomDims) {
      if (p.roomDims) {
        try {
          const parsed = JSON.parse(p.roomDims);
          appState.setRoomDims({
            widthM: Number(parsed?.widthM) || Number(p?.room_width) || 4.5,
            lengthM: Number(parsed?.lengthM) || Number(p?.room_length) || 6.0,
            heightM: Number(parsed?.heightM) || Number(p?.room_height) || 2.4,
          });
        } catch {
          appState.setRoomDims({
            widthM: Number(p?.room_width) || 4.5,
            lengthM: Number(p?.room_length) || 6.0,
            heightM: Number(p?.room_height) || 2.4,
          });
        }
      } else {
        appState.setRoomDims({
          widthM: Number(p?.room_width) || 4.5,
          lengthM: Number(p?.room_length) || 6.0,
          heightM: Number(p?.room_height) || 2.4,
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
          typeof p?.screen_height_from_floor === "number"
            ? p.screen_height_from_floor
            : 0.5,
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

    // Row spacing + seats per row (correct field names)
    const rowSpacing = Number(p?.row_spacing_m) || 1.8;
    if (typeof setRowSpacingM === "function") {
      setRowSpacingM(rowSpacing);
    }

    const seatsPerRowByRowData = parseMaybe(p?.seats_per_row_by_row, []);
    if (
      Array.isArray(seatsPerRowByRowData) &&
      seatsPerRowByRowData.length > 0 &&
      typeof setSeatsPerRowByRow === "function"
    ) {
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
    // 5) SCREEN FRONT PLANE
    //
    if (typeof appState?.setScreenFrontPlaneM === "function") {
      const savedPlaneM = Number(p?.screen_front_plane_m);
      if (Number.isFinite(savedPlaneM)) {
        appState.setScreenFrontPlaneM(savedPlaneM);
      }
    }

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
      ROOM_DIMS: false, // NEW – plan dimension overlay
    };
    const overlaysData = parseMaybe(p?.overlays, defaultOverlays);
    if (typeof setOverlays === "function") {
      setOverlays({ ...defaultOverlays, ...overlaysData });
    }

    //
    // 7) SEATING
    //
    const sp = parseMaybe(p?.seating_positions, []);
    if (
      Array.isArray(sp) &&
      sp.length > 0 &&
      typeof setSeatingPositions === "function"
    ) {
      setSeatingPositions(sp);
    }

    //
    // 8) ROOM ELEMENTS
    //
    const re = parseMaybe(p?.room_elements, []);
    if (Array.isArray(re) && typeof setRoomElements === "function") {
      setRoomElements(re);
    }

    //
    // 9) SUB CONFIG (front/rear groups – config, not positions)
    //
    if (typeof setFrontSubsCfg === "function") {
      const frontCfg = parseMaybe(p?.front_subs_cfg, null);
      setFrontSubsCfg(
        frontCfg || { count: 1, model: "SUB2-12" }
      );
    }
    if (typeof setRearSubsCfg === "function") {
      const rearCfg = parseMaybe(p?.rear_subs_cfg, null);
      setRearSubsCfg(
        rearCfg || { count: 0, model: null }
      );
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
      if (splCfg) {
        appState.setSplConfig(splCfg);
      }
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
        // Prefer speakers stored with the Project entity when present.
        if (Array.isArray(loadedSpeakers) && loadedSpeakers.length > 0) {
          return {
            ...(prev || {}),
            placedSpeakers: loadedSpeakers,
          };
        }

        // If nothing was stored, keep whatever we already had in memory
        // (e.g. brand-new design that hasn't been saved yet).
        return prev || {};
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
    parseMaybe,
  ]);


  const loadProject = useCallback(async (signal, idOverride) => {
    const id = idOverride || projectIdState;
    if (!id) return;
    setLoadState({ phase: "loading", error: null, name: null });
    try {
      // AbortController signal is not directly supported by the SDK, but the operation is fast.
      const projects = await Project.filter({ id }, '-updated_date', 1);

      if (Array.isArray(projects) && projects.length) {
        const p = projects[0] || null;
        console.log('[RD] loadProject result', { projectIdState, id: p?.id, name: p?.name });
        hydrateFromProject(p);
        setProjectNameState(p?.name || "Project"); // Update internal projectName state
        setLoadState({ phase: "loaded", error: null, name: p?.name || "Project" });
      } else {
        // Project not found in cloud; keeping id so user can still save into it
        console.log('[RoomDesigner] Project not found in cloud; keeping id so user can continue working.');
        setLoadState({ phase: "idle", error: null, name: null });
      }
    } catch (err) {
      const errMsg = String(err?.message || err || '');

      // Abort is fine – usually navigating away or changing project.
      if (err?.name === "AbortError") {
        setLoadState(prev => ({ ...prev, phase: "idle" }));
        return;
      }

      // Stale / invalid ID / 404 – don't keep retrying, mark as error
      if (errMsg.includes("Invalid id value") || errMsg.includes("Object not found") || errMsg.includes("404")) {
        console.log("[RoomDesigner] Invalid project ID detected, keeping it but stopping auto-reload.");
        setLoadState({ phase: "error", error: errMsg, name: null });
        return;
      }

      // Any other load error (including 429 rate limit) – stop auto-reload
      window.__APP_DEBUG = window.__APP_DEBUG || [];
      window.__APP_DEBUG.push(`[RoomDesigner] Project load error: ${errMsg}`);
      console.error("[RoomDesigner] Failed to load project:", err);
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
        console.error("Failed to update URL:", e);
    }
    setProjectIdState(id);
  }, []);

  const debounceTimeoutRef = useRef(null);
  const isHydratingRef = useRef(false); // Initialize with false
  const hasBootstrappedRef = useRef(false);

  useEffect(() => {
    // Update the ref whenever loadState changes
    const isCurrentlyHydrating = loadState.phase === "loading" || (projectIdFromUrl && loadState.phase !== "loaded" && loadState.phase !== "error");
    isHydratingRef.current = isCurrentlyHydrating;
  }, [loadState.phase, projectIdFromUrl]);


  // Auto-save ONLY for an existing project.
  // If there is no real project id yet, do nothing (local / demo mode).
  useEffect(() => {
    // Work out a stable project id for this session.
    const effectiveProjectId = projectIdState || projectIdFromUrl || null;
    if (!effectiveProjectId) return; // never create via autosave

    // Skip if hydrating
    if (isHydratingRef.current) {
      setAutosaveStatus("hydrating");
      return;
    }

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    setAutosaveStatus("dirty");

    debounceTimeoutRef.current = setTimeout(async () => {
      try {
        const projectData = serializeProject({
          name: projectNameState,
          roomDims: appState.roomDims,
          dimensions,
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
          frontSubsCfg,
          rearSubsCfg,
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
          splConfig: appState.splConfig,
        });

        // IMPORTANT: autosave must never rename a project
        delete projectData.name;
        delete projectData.client_name;

        await Project.update(effectiveProjectId, projectData);
        // Ensure our local state keeps the id we just wrote to
        if (!projectIdState) {
          setProjectIdState(effectiveProjectId);
        }
        setAutosaveStatus("saved");
      } catch (e) {
        console.error("Error during autosave:", e);
        setAutosaveStatus("error");
      }
    }, 800);

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [
    projectIdState,
    projectIdFromUrl,
    projectNameState,
    dolbyPreset,
    dimensions,
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
  ]);

  // Boot logic: run ONCE – either load a project or initialise defaults
  useEffect(() => {
    // Already bootstrapped for this mount? Do nothing.
    if (hasBootstrappedRef.current) return;

    const controller = new AbortController();

    try {
      if (projectIdFromUrl || projectIdState) {
        // We have a real project (from URL or from session) – load it once.
        const idToLoad = projectIdFromUrl || projectIdState;
        if (idToLoad) {
          hasBootstrappedRef.current = true;
          setProjectIdState(idToLoad);
          loadProject(controller.signal);
        }
      } else {
        // No project at all – this is a fresh, local-only design.
        // Only initialise defaults if nothing has been laid out yet.
        const hasSpeakers =
          Array.isArray(placedSpeakers) && placedSpeakers.length > 0;
        const hasSeats =
          Array.isArray(seatingPositions) && seatingPositions.length > 0;

        if (!hasSpeakers && !hasSeats && appState?.roomDims) {
          hasBootstrappedRef.current = true;
          if (typeof initWithDefaultsAndRules === "function") {
            initWithDefaultsAndRules();
          }
        }
      }
    } catch (e) {
      console.error("[RoomDesigner] boot init error:", e);
    }

    return () => controller.abort();
  }, [
    projectIdFromUrl,
    projectIdState,
    appState?.roomDims,
    initWithDefaultsAndRules,
    loadProject,
    setProjectIdState,
  ]);

  const manualSaveProject = useCallback(async () => {
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
        placedSpeakerCount: Array.isArray(placedSpeakers) ? placedSpeakers.length : null,
      };

      const projectData = serializeProject({
        name: projectNameState,
        roomDims: appState.roomDims,
        dimensions,
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
        frontSubsCfg,
        rearSubsCfg,
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
        splConfig: appState.splConfig,
      });

      // DEBUG: Log what we're about to save
      console.log('[RD] manualSaveProject payload', effectiveProjectId, {
        room: { w: projectData.room_width, l: projectData.room_length, h: projectData.room_height },
        seating_count: projectData.seating_positions ? JSON.parse(projectData.seating_positions).length : 0,
        speakers_count: projectData.selected_speakers ? JSON.parse(projectData.selected_speakers).length : 0,
        screen_size: projectData.screen_size,
        dolby: projectData.dolby_config,
      });
      console.log('[RD] manualSaveProject payload', {
        debugSnapshot,
        projectDataPreview: {
          effectiveProjectId,
          name: projectData.name,
          room_width: projectData.room_width,
          room_length: projectData.room_length,
          room_height: projectData.room_height,
          seating_positions: typeof projectData.seating_positions === 'string'
            ? projectData.seating_positions.slice(0, 200)
            : projectData.seating_positions,
          selected_speakers: typeof projectData.selected_speakers === 'string'
            ? projectData.selected_speakers.slice(0, 200)
            : projectData.selected_speakers,
        },
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
            console.error("Failed to update URL with new project id:", e);
          }
        }
      }

      if (savedProject) {
        // DEBUG: Log what came back from save
        console.log('[RD] manualSaveProject result', {
          projectIdState,
          effectiveProjectId,
          savedId: savedProject?.id,
          name: savedProject?.name,
          client_name: savedProject?.client_name,
        });

        // DEBUG: One-shot reload to verify we can read back what we wrote
        if (effectiveProjectId && typeof loadProject === 'function') {
          console.log('[RD] manualSaveProject -> reloading project after save', { effectiveProjectId });
          try {
            await loadProject(undefined, effectiveProjectId);
          } catch (e) {
            console.error('[RD] reload after save failed', e);
          }
        }

        setAutosaveStatus("saved");
        return { success: true };
      } else {
        setAutosaveStatus("error");
        console.error("Failed to save project: No response from server.");
        return { success: false, error: "Save operation failed." };
      }
    } catch (e) {
      setAutosaveStatus("error");
      console.error("Error during manual save:", e);
      return { success: false, error: e.message || String(e) };
    }
  }, [
    projectIdState,
    projectIdFromUrl,
    projectNameState,
    dolbyPreset,
    dimensions,
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

// Canonical Dolby layout → role list
// This must be the single source of truth for all bed + height roles.
export const DOLBY_PRESETS = {
  // Bed-only layouts
  "5.1":  ["FL", "FC", "FR", "SL", "SR", "LFE"],
  "7.1":  ["FL", "FC", "FR", "SL", "SR", "SBL", "SBR", "LFE"],
  "9.1":  ["FL", "FC", "FR", "SL", "SR", "SBL", "SBR", "LW", "RW", "LFE"],

  // Atmos 5.x
  "5.1.2": ["FL", "FC", "FR", "SL", "SR", "TML", "TMR", "LFE"],
  "5.1.4": ["FL", "FC", "FR", "SL", "SR", "TFL", "TFR", "TRL", "TRR", "LFE"],
  "5.1.6": ["FL", "FC", "FR", "SL", "SR",
            "TFL", "TFR", "TML", "TMR", "TRL", "TRR", "LFE"],

  // Atmos 7.x
  "7.1.2": ["FL", "FC", "FR", "SL", "SR", "SBL", "SBR",
            "TML", "TMR", "LFE"],
  "7.1.4": ["FL", "FC", "FR", "SL", "SR", "SBL", "SBR",
            "TFL", "TFR", "TRL", "TRR", "LFE"],
  "7.1.6": ["FL", "FC", "FR", "SL", "SR", "SBL", "SBR",
            "TFL", "TFR", "TML", "TMR", "TRL", "TRR", "LFE"],

  // Atmos 9.x (future-friendly; LW/RW wides)
  "9.1.2": ["FL", "FC", "FR", "SL", "SR", "SBL", "SBR", "LW", "RW",
            "TML", "TMR", "LFE"],
  "9.1.4": ["FL", "FC", "FR", "SL", "SR", "SBL", "SBR", "LW", "RW",
            "TFL", "TFR", "TRL", "TRR", "LFE"],
  "9.1.6": ["FL", "FC", "FR", "SL", "SR", "SBL", "SBR", "LW", "RW",
            "TFL", "TFR", "TML", "TMR", "TRL", "TRR", "LFE"],
};

// For each Atmos layout, define exactly which overhead roles must exist.
// This is used by getTargetOverheadIds(...) and reconciliation.
const OVERHEAD_IDS_BY_LAYOUT = {
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

// DEBUG: log the available preset keys once at module load
if (typeof window !== "undefined" && window.console) {
  console.log("[RD PRESETS] keys:", Object.keys(DOLBY_PRESETS || {}));
}

function getTargetOverheadIds(preset) {
  if (!preset) return [];
  
  // Normalize: strip " Dolby Atmos" suffixes and other decorations
  // "5.1.4 Dolby Atmos" → "5.1.4"
  // "5.1.4_atmos" → "5.1.4"
  const normalized = String(preset)
    .split(" ")[0]      // Remove " Dolby Atmos" suffix
    .split("_")[0]      // Remove "_atmos" suffix
    .toLowerCase();
  
  return OVERHEAD_IDS_BY_LAYOUT[normalized] || [];
}

// --- ATMOS FAILSAFE: ensure overhead roles match the current layout ---
function ensureAtmosOverheads({ 
  placedSpeakers, 
  dolbyPreset, 
  roomDimensions,
  overheadGlobalModel = null,
  overheadFrontOverride = null,
  overheadMidOverride = null,
  overheadRearOverride = null,
  useFrontGlobal = true,
  useMidGlobal = true,
  useRearGlobal = true,
}) {
  const current = Array.isArray(placedSpeakers) ? placedSpeakers : [];

  // Normalise preset string, e.g. "5.1.4 Dolby Atmos" -> "5.1.4"
  const normalizedPreset = dolbyPreset
    ? String(dolbyPreset).split(" ")[0].split("_")[0]
    : "";

  const parts = normalizedPreset.split(".");
  const heights = parts.length >= 3 ? parseInt(parts[2], 10) || 0 : 0;

  // If no height layer, don't touch anything
  if (!heights) {
    return current;
  }

  const targetOverheadIds = getTargetOverheadIds(normalizedPreset);
  if (!targetOverheadIds || targetOverheadIds.length === 0) {
    return current;
  }

  // Split current speakers into bed + overheads
  const bedSpeakers = [];
  const currentOverheads = [];

  for (const spk of current) {
    const role = String(spk?.role || "").toUpperCase();
    if (role.startsWith("T")) {
      currentOverheads.push(spk);
    } else {
      bedSpeakers.push(spk);
    }
  }

  const targetSet = new Set(
    targetOverheadIds.map(id => String(id || "").toUpperCase())
  );

  // Map of existing overheads by role (canonical)
  const existingByRole = new Map(
    currentOverheads.map(spk => [
      String(spk.role || "").toUpperCase(),
      spk,
    ])
  );

  // Seed full speaker set once so we have default positions for any missing overheads
  const seeded = seedSpeakersFromPreset({
    preset: normalizedPreset,
    roomDimensions,
    listeningArea: null,
  }) || [];

  const seededOverheadsByRole = new Map(
    seeded
      .filter(spk =>
        typeof spk?.role === "string" &&
        spk.role.toUpperCase().startsWith("T")
      )
      .map(spk => [String(spk.role || "").toUpperCase(), spk])
  );

  const nextOverheads = [];

  // For each target overhead role, reuse existing one if possible, otherwise seed
  for (const id of targetOverheadIds) {
    const canon = String(id || "").toUpperCase();
    const existing = existingByRole.get(canon);
    if (existing) {
      nextOverheads.push(existing);
      continue;
    }

    const seededSpk = seededOverheadsByRole.get(canon);
    if (seededSpk) {
      nextOverheads.push(seededSpk);
    } else if (typeof window !== "undefined" && window.console) {
      console.warn(
        "[RD ATMOS FAILSAFE] No seeded overhead for role",
        canon,
        "in preset",
        normalizedPreset
      );
    }
  }

  let merged = [...bedSpeakers, ...nextOverheads];

  // FINAL SAFETY PASS: make sure all overhead speakers have a valid model
  // whenever a global overhead model is selected. This is crucial for:
  // - visibility independence from surrounds
  // - SPL calculations (Upper Front / Top Middle / Upper Rear)
  if (overheadGlobalModel) {
    const OVERHEAD_CANON_ROLES = new Set([
      "TFL", "TFR", "TML", "TMR", "TRL", "TRR",
      // legacy aliases kept for safety
      "TL", "TR", "TBL", "TBR", "TFC", "TRC", "TBC",
    ]);

    merged = merged.map(spk => {
      const canonRole = String(spk.role || "").toUpperCase();

      if (!OVERHEAD_CANON_ROLES.has(canonRole)) {
        return spk;
      }

      const currentModel = (spk.model || "").toString().trim().toLowerCase();

      // If this overhead has no usable model, assign based on position/global
      if (!currentModel || currentModel === "off" || currentModel === "none") {
        // Determine model from overrides
        let modelFromOverrides = overheadGlobalModel;

        if (['TFL', 'TFR', 'TFC'].includes(canonRole)) {
          modelFromOverrides = useFrontGlobal ? overheadGlobalModel : (overheadFrontOverride || overheadGlobalModel);
        } else if (['TML', 'TMR', 'TL', 'TR'].includes(canonRole)) {
          modelFromOverrides = useMidGlobal ? overheadGlobalModel : (overheadMidOverride || overheadGlobalModel);
        } else if (['TRL', 'TRR', 'TRC', 'TBL', 'TBR'].includes(canonRole)) {
          modelFromOverrides = useRearGlobal ? overheadGlobalModel : (overheadRearOverride || overheadGlobalModel);
        }

        return {
          ...spk,
          model: modelFromOverrides,
        };
      }

      return spk;
    });
  }

  if (typeof window !== "undefined" && window.console) {
    console.log("[RD ATMOS FAILSAFE] sync overheads for preset",
      normalizedPreset,
      "target=",
      targetOverheadIds,
      "final roles=",
      merged.map(s => s.role),
      "models=",
      merged.filter(s => s.role?.toUpperCase().startsWith('T')).map(s => ({ role: s.role, model: s.model }))
    );
  }

  return merged;
}

// Coarse seeding for a system preset (RoomDesigner refines later)
export function seedSpeakersFromPreset({
  preset,
  roomDimensions,
  listeningArea = null,
}) {
  console.log(
    "[RD SEED] called with preset =",
    preset,
    "DOLBY_PRESETS[preset] =",
    DOLBY_PRESETS ? DOLBY_PRESETS[preset] : undefined
  );

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
      case "TML": return { x: x25, y: l * 0.50, z: topZ }; // Top Mid Left
      case "TMR": return { x: x75, y: l * 0.50, z: topZ }; // Top Mid Right
      case "TFL": return { x: x25, y: l * 0.35, z: topZ }; // Top Front Left - 35% from front
      case "TFR": return { x: x75, y: l * 0.35, z: topZ }; // Top Front Right
      case "TFC": return { x: x50, y: l * 0.35, z: topZ }; // Top Front Center
      case "TRL": return { x: x25, y: l * 0.70, z: topZ }; // Top Rear Left - 70% from front
      case "TRR": return { x: x75, y: l * 0.70, z: topZ }; // Top Rear Right
      case "TRC": return { x: x50, y: l * 0.70, z: topZ }; // Top Rear Center
      // Legacy aliases
      case "TL":  return { x: x25, y: l * 0.50, z: topZ };
      case "TR":  return { x: x75, y: l * 0.50, z: topZ };
      case "TBL": return { x: x25, y: l * 0.70, z: topZ };
      case "TBR": return { x: x75, y: l * 0.70, z: topZ };
      case "TBC": return { x: x50, y: l * 0.70, z: topZ };
      // LFE
      case "LFE": return { x: x50, y: yFront + 0.20, z: 0.3 };
      default:    return { x: x50, y: l * 0.60, z: earZ };
    }
  };

  const roles = DOLBY_PRESETS[preset] || [];
  
  const seeded = roles.map((role) => ({
    id: role,
    role,
    label: role,
    model: undefined, // Neutralized default model seeding
    position: posForRole(role),
  }));

  console.log(
    "[RD SEED] result roles =",
    Array.isArray(seeded) ? seeded.map(s => s.role) : "(not array)"
  );

  return seeded;
}

// Thin store wrapper over AppStateProvider so the page can read/write speakers
export function useSpeakerSystemStore() {
  const {
    speakerSystem, setSpeakerSystem,
    roomDims, setRoomDims, // Use roomDims from AppState
    screen, setScreen,
    seatingPositions, setSeatingPositions,
    dolbyLayout, // Access current Dolby layout for seeding
    overheadGlobalModel,
    overheadFrontOverride,
    overheadMidOverride,
    overheadRearOverride,
    useFrontGlobal,
    useMidGlobal,
    useRearGlobal,
   } = useAppState() || {};

  const placedSpeakers = React.useMemo(
    () => (Array.isArray(speakerSystem?.placedSpeakers) ? speakerSystem.placedSpeakers : []),
    [speakerSystem?.placedSpeakers]
  );

  const setSpeakers = React.useCallback(
    (listOrUpdater) => {
      if (typeof setSpeakerSystem !== "function") return;

      // Resolve the final list immediately without re-merging with prev
      let finalList = typeof listOrUpdater === "function"
        ? listOrUpdater(Array.isArray(placedSpeakers) ? placedSpeakers : [])
        : (Array.isArray(listOrUpdater) ? listOrUpdater : []);

      // NEW: ensure Atmos overheads are present before we hand off to AppState
      finalList = ensureAtmosOverheads({
        placedSpeakers: finalList,
        dolbyPreset: dolbyLayout,
        roomDimensions: roomDims ? {
          width: roomDims.widthM,
          length: roomDims.lengthM,
          height: roomDims.heightM
        } : { width: 4.5, length: 6.0, height: 2.8 },
        overheadGlobalModel,
        overheadFrontOverride,
        overheadMidOverride,
        overheadRearOverride,
        useFrontGlobal,
        useMidGlobal,
        useRearGlobal,
      });

      // DEBUG: log what we're actually sending into AppStateProvider
      // (keep this for now while we verify overhead behaviour)
      // eslint-disable-next-line no-console
      console.log("[RD] setSpeakers sending to AppStateProvider:", {
        count: finalList.length,
        roles: finalList.map(s => s.role),
      });

      // Push the finished list into AppStateProvider in one shot
      setSpeakerSystem({
        placedSpeakers: finalList,
      });
    },
    [setSpeakerSystem, placedSpeakers, dolbyLayout, roomDims, overheadGlobalModel, overheadFrontOverride, overheadMidOverride, overheadRearOverride, useFrontGlobal, useMidGlobal, useRearGlobal]
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
      // Determine which preset to seed from based on the current Dolby layout
      const rawPreset = typeof dolbyLayout === "string" ? dolbyLayout : "5.1";
      const normalizedPreset = String(rawPreset)
        .split(" ")[0]   // "5.1.2 Dolby Atmos" -> "5.1.2"
        .split("_")[0];  // "5.1.2_atmos" -> "5.1.2"

      const presetKey = DOLBY_PRESETS[normalizedPreset] ? normalizedPreset : "5.1";

      const seeded = seedSpeakersFromPreset({
        preset: presetKey,
        roomDimensions: room,
        listeningArea: null,
      });
      console.log("[RD] SEED RESULT:", seeded.map(s => s.role));
      setSpeakerSystem((prev) => ({ ...(prev || {}), placedSpeakers: seeded }));
    }
  }, [roomDims, seatingPositions, dolbyLayout, setRoomDims, setScreen, setSeatingPositions, setSpeakerSystem]);

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
  const sessionActiveProjectId = useActiveProjectId();
  const { projectId: initialProjectIdFromUrl } = useUrlQuery();
  
  // Single source of truth for the project ID
  const resolvedProjectId = sessionActiveProjectId || initialProjectIdFromUrl || null;

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
  const _seatsPerRowByRow = appState?.seatsPerRowByRow; // NEW
  const _setSeatsPerRowByRow = appState?.setSeatsPerRowByRow; // NEW
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
  const _rowSpacingM = appState?.rowSpacingM;
  const _setRowSpacingM = appState?.setRowSpacingM;
  const _overheadGlobalModel = appState?.overheadGlobalModel;
  const _setOverheadGlobalModel = appState?.setOverheadGlobalModel;
  const _overheadFrontOverride = appState?.overheadFrontOverride;
  const _setOverheadFrontOverride = appState?.setOverheadFrontOverride;
  const _overheadMidOverride = appState?.overheadMidOverride;
  const _setOverheadMidOverride = appState?.setOverheadMidOverride;
  const _overheadRearOverride = appState?.overheadRearOverride;
  const _setOverheadRearOverride = appState?.setOverheadRearOverride;
  const _useFrontGlobal = appState?.useFrontGlobal;
  const _setUseFrontGlobal = appState?.setUseFrontGlobal;
  const _useMidGlobal = appState?.useMidGlobal;
  const _setUseMidGlobal = appState?.setUseMidGlobal;
  const _useRearGlobal = appState?.useRearGlobal;
  const _setUseRearGlobal = appState?.setUseRearGlobal;


  const store = useSpeakerSystemStore();
  
  // CRITICAL: Extract placedSpeakers early so it's available for allSeatSplMetrics
  const placedSpeakers = store.placedSpeakers;

  const visualisationRef = useRef(null);

  // Use session active project ID (from Projects page), fallback to URL param for legacy support
  const activeProjectId = sessionActiveProjectId || initialProjectIdFromUrl;

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
  
  // NEW: Options panel state
  const [showPrices, setShowPrices] = useState(false);
  const [difficultyMultiplier, setDifficultyMultiplier] = useState(1.0);

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
    const mlpReference = _mlpBasis; // 'front' | 'back' | 'all'

    // Must have screen plane and width
    if (!Number.isFinite(screenFrontPlaneM) || !Number.isFinite(screenVisibleWidthM)) {
      return;
    }

    // 1. Compute ideal distance for 57.5° FOV (base position)
    const idealDistM = distanceFor57_5FromWidth(screenVisibleWidthM);
    const mlpY_base = screenFrontPlaneM + idealDistM;

    // 2. Apply viewing offset to get FIXED MLP position (green dot)
    const fixedMlpY = mlpY_base + viewingOffsetM;

    // 3. Build row centers around the FIXED MLP according to reference mode
    let centersRaw = buildRowCenters?.(fixedMlpY, rows, rowSpacing, mlpReference) || [];

    // SAFETY: if buildRowCenters misbehaves or returns wrong length, force one centre per row
    if (!Array.isArray(centersRaw) || centersRaw.length !== rows) {
      if (SHOW_DEBUG_LOGS) {
        console.warn(`[Seats] buildRowCenters returned ${centersRaw?.length ?? 'null'} centers for ${rows} rows. Using fallback.`);
      }
      centersRaw = [];
      for (let i = 0; i < rows; i++) {
        centersRaw.push(fixedMlpY + i * rowSpacing);
      }
    }

    // 4. Clamp row centers to room bounds
    const len = Number(stableDimensions?.length) || Number(appState?.roomDims?.lengthM) || 6.0;
    const MIN_Y = 0.40;
    const MAX_Y = len - 0.40;
    const _clampY = (y) => Math.max(MIN_Y, Math.min(MAX_Y, y));

    const centers = centersRaw.map(y => _clampY(y));

    // Store the clamped row centers
    if (typeof appState?.setRowCentersM === 'function') {
      appState.setRowCentersM(centers);
    }

    // 5. Store the FIXED MLP position (for green dot and speaker placement)
    const mlpRounded = Math.round(fixedMlpY * 1000) / 1000;

    if (typeof appState?.setMlpY_m === 'function') {
      appState.setMlpY_m(prev => {
        const prevRounded = prev ? Math.round(prev * 1000) : null;
        const newRounded = Math.round(mlpRounded * 1000);
        return prevRounded === newRounded ? prev : mlpRounded;
      });
    }

    // Temporary telemetry (remove after verify)
    if (SHOW_DEBUG_LOGS && typeof console !== 'undefined' && Math.random() < 0.05) {
      console.log('[MLP]', {
        frontY: screenFrontPlaneM.toFixed(3),
        idealM: idealDistM.toFixed(3),
        offset: viewingOffsetM.toFixed(3),
        fixedMlpY: mlpRounded.toFixed(3)
      });
      console.log('[ROWS]', {
        mode: mlpReference,
        count: rows,
        spacing: rowSpacing.toFixed(3),
        frontY: centers[0]?.toFixed(3),
        backY: centers[centers.length - 1]?.toFixed(3),
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
    stableDimensions?.length,
    appState?.roomDims?.lengthM,
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

  // NEW: Compute centralized SPL data for all seats (powers sidebar SPL cards AND HUD)
  // Uses unified SPL logic with max_spl_cont_db_1m cap from speakerData.js
  const allSeatSplMetrics = useMemo(() => {
    const getCanonicalRoleLocal = (role) => {
      const map = { SL:'SL',LS:'SL', SR:'SR',RS:'SR', SBL:'SBL',SBR:'SBR', LW:'LW',RW:'RW', 
                    FL:'FL',L:'FL', FC:'FC',C:'FC', FR:'FR',R:'FR',
                    TFL:'TFL',TFR:'TFR',TL:'TL',TML:'TL',TR:'TR',TMR:'TR',TBL:'TBL',TBR:'TBR' };
      const r = String(role || '').toUpperCase();
      return map[r] || r;
    };

    // Get global SPL config from appState (same values used by HUD)
    const splConfig = appState?.splConfig || {};
    const screenLoss = Number(splConfig.screenLossDb) || 0;
    const eqHeadroom = Number(splConfig.globalEqHeadroomDb) || 0;

    return computeAllSeatSplMetrics({
      seats: _seatingPositions || [],
      placedSpeakers: placedSpeakers || [],
      getCanonicalRole: getCanonicalRoleLocal,
      getEffectiveSplInputs: appState?.getEffectiveSplInputs || (() => ({ powerW: 100, sensitivity_dB_1w1m: 87 })),
      getModelDimsM: (model) => {
        const meta = getSpeakerModelMeta(model);
        if (meta && !meta.notFound) {
          // Return full metadata including SPL-critical fields
          return {
            ...meta,
            // Ensure these critical SPL fields are present
            sensitivity_db_1w_1m: meta.sensitivity_dB_1w1m || meta.sensitivity || 87,
            power_handling_w: meta.max_power || Infinity,
            max_spl_cont_db_1m: meta.max_spl || null,
          };
        }
        // Fallback for unknown models
        return { widthM: 0.27, depthM: 0.082, sensitivity_dB_1w1m: 87 };
      },
      // Pass screen loss and EQ headroom from global splConfig
      screenLoss_dB: screenLoss,
      eqHeadroom_dB: eqHeadroom,
    });
  }, [_seatingPositions, placedSpeakers, appState?.getEffectiveSplInputs, appState?.splConfig]);

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
    seatSplMetrics: allSeatSplMetrics,
    overheadState: {
      globalModel: _overheadGlobalModel,
      frontOverride: _overheadFrontOverride,
      midOverride: _overheadMidOverride,
      rearOverride: _overheadRearOverride,
      useFrontGlobal: _useFrontGlobal,
      useMidGlobal: _useMidGlobal,
      useRearGlobal: _useRearGlobal,
    },
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

  // NEW: Calculate live room price total
  const priceData = usePriceCalculation({
    placedSpeakers,
    frontSubsCfg: _frontSubsCfg,
    rearSubsCfg: _rearSubsCfg,
    difficultyMultiplier,
  });
  
  // Publish price data to window for sidebar consumption
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__ROOM_DESIGNER_PRICE__ = {
        showPrices,
        baseTotal: priceData.baseTotal,
        finalTotal: priceData.finalTotal,
        difficultyMultiplier,
      };
    }
  }, [showPrices, priceData.baseTotal, priceData.finalTotal, difficultyMultiplier]);
  
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
  const setSeatsPerRowByRowGuarded = useGuardedSetter(appState?.setSeatsPerRowByRow, 'seating');
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
    projectIdFromUrl: resolvedProjectId,
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
    selectedSpeakersByRole: _selectedSpeakersByRole,
    setSelectedSpeakersByRole: _setSelectedSpeakersByRole,
    speakerNodes: _speakerNodes,
    setSpeakerNodes: _setSpeakerNodes,
    overheadGlobalModel: _overheadGlobalModel,
    overheadFrontOverride: _overheadFrontOverride,
    overheadMidOverride: _overheadMidOverride,
    overheadRearOverride: _overheadRearOverride,
    useFrontGlobal: _useFrontGlobal,
    useMidGlobal: _useMidGlobal,
    useRearGlobal: _useRearGlobal,
    setOverheadGlobalModel: _setOverheadGlobalModel,
    setOverheadFrontOverride: _setOverheadFrontOverride,
    setOverheadMidOverride: _setOverheadMidOverride,
    setOverheadRearOverride: _setOverheadRearOverride,
    setUseFrontGlobal: _setUseFrontGlobal,
    setUseMidGlobal: _setUseMidGlobal,
    setUseRearGlobal: _setUseRearGlobal,
    rowSpacingM: _rowSpacingM,
    setRowSpacingM: _setRowSpacingM,
    seatsPerRowByRow: _seatsPerRowByRow,
    setSeatsPerRowByRow: _setSeatsPerRowByRow,
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
        setSpeakers(prev => mergePreserveOverheads(prev, updatedSpeakers));
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
    // If we've just loaded a real project, don't overwrite its speaker layout
    if (loadState?.phase === "loaded") {
      return;
    }

    if (!dolbyPreset || (_isFrozen && _isFrozen('speakers'))) {
      return;
    }

    // Parse preset to extract height count
    const rawPreset = String(dolbyPreset || '').split(' ')[0].split('_')[0]; // "7.1.4 Dolby Atmos" → "7.1.4"
    const parts = rawPreset.split('.');
    const heights = parseInt(parts[2], 10) || 0; // 7.1.4 → 4, 7.1 → 0

    // Never run this 7.x bed swap logic for Atmos layouts (heights > 0)
    // For 7.1.2/7.1.4/7.1.6 we let the Dolby reconciliation effect handle everything
    if (heights > 0) {
      return;
    }

    const is7ChannelBed = dolbyPreset && (dolbyPreset.startsWith('7.1') || dolbyPreset.startsWith('7.2'));
    if (!is7ChannelBed) {
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
      console.log('[RD] 7.x swap -> nextList roles', nextList.map(s => safeCanon(s.role)));
      setSpeakers(prev => mergePreserveOverheads(prev, nextList));

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
      console.log('[RD] 7.x swap -> nextList roles', nextList.map(s => safeCanon(s.role)));
      setSpeakers(prev => mergePreserveOverheads(prev, nextList));
    }
  }, [_sevenBedLayoutType, dolbyPreset, placedSpeakers, setSpeakers, stableDimensions.width, stableDimensions.length, _isFrozen]);

  // Effect to reconcile overhead speakers when layout changes
  useEffect(() => {
    // Skip on initial project load (let project hydration complete first)
    if (loadState?.phase === "loaded" && !lastPresetRef.current) {
      return;
    }

    if (!dolbyPreset || (_isFrozen && _isFrozen('speakers'))) return;

    // --- DEBUG: reconciliation entry ---
    const normalizedPreset = dolbyPreset
      ? String(dolbyPreset).split(" ")[0].split("_")[0]
      : "";

    console.log(
      "[RD RECON] ENTER",
      {
        dolbyPreset,
        normalizedPreset,
        hasPlaced: Array.isArray(placedSpeakers) ? placedSpeakers.length : 0
      }
    );

    console.log(
      "[RD RECON] placed roles BEFORE =",
      Array.isArray(placedSpeakers)
        ? placedSpeakers.map(s => s.role)
        : "(no speakers)"
    );

    const noSpeakers = (placedSpeakers || []).length === 0;
    const presetChanged = lastPresetRef.current !== dolbyPreset;

    // Skip only if preset is unchanged AND we have speakers
    // CRITICAL: If preset changed, ALWAYS run reconciliation
    if (!presetChanged && !noSpeakers) {
      return;
    }

    // Early reseed for Atmos layouts without existing overheads
    const targetOverheadIds = getTargetOverheadIds(dolbyPreset);
    const hasOverheadTargets = targetOverheadIds.length > 0;
    const hasAnyExistingOverheads =
      Array.isArray(placedSpeakers) &&
      placedSpeakers.some((spk) => safeCanon(spk.role || "").startsWith("T"));

    if (hasOverheadTargets && !hasAnyExistingOverheads) {
      const seeded = seedSpeakersFromPreset({
        preset: normalizedPreset,
        roomDimensions: stableDimensions,
        listeningArea: null,
      });
      console.log('[RD] early reseed -> roles', seeded.map(s => safeCanon(s.role)));
      setSpeakers(seeded);
      return;
    }

    // Determine the expected roles based on the dolbyPreset and current sevenBedLayoutType
    const is7ChannelBed = normalizedPreset && (normalizedPreset.startsWith('7.1') || normalizedPreset.startsWith('7.2'));
    let expectedRoles = DOLBY_PRESETS[normalizedPreset] || [];

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

    console.log(
      "[RD RECON] expectedRoles =",
      expectedRoles,
      "hasCorrectRoles =",
      hasCorrectRoles,
      "noSpeakers =",
      noSpeakers
    );

    if (!hasCorrectRoles || noSpeakers) {
      console.log(
        "[RD RECON] about to reseed using normalizedPreset =",
        normalizedPreset
      ); 
       debug(`[Speakers] Reconciling speakers for ${dolbyPreset} (${presetChanged ? 'preset changed' : 'role mismatch'})`);
       // Seed with the canonical Dolby preset (which means SBL/SBR for 7.x)
       let seededSpeakers = seedSpeakersFromPreset({
         preset: normalizedPreset,
         roomDimensions: stableDimensions,
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
         
         // targetOverheadIds already computed above, reuse it
         const targetSet = new Set(targetOverheadIds.map(id => id.toUpperCase()));
         
         debug(`[Speakers] Target overheads for ${dolbyPreset}: [${targetOverheadIds.join(', ')}]`);
         
         // Known overhead roles (for filtering)
         const knownOverheadRoles = new Set(['TFL', 'TFR', 'TML', 'TMR', 'TRL', 'TRR', 'TL', 'TR', 'TFC', 'TRC', 'TBC', 'TBL', 'TBR']);
         
         // Separate existing speakers into bed layer and overheads
         const bedSpeakers = (prev || []).filter(s => !knownOverheadRoles.has(safeCanon(s.role)));
         const existingOverheads = (prev || []).filter(s => knownOverheadRoles.has(safeCanon(s.role)));
         
         debug(`[Speakers] Existing: ${bedSpeakers.length} bed + ${existingOverheads.length} overhead (${existingOverheads.map(s => s.role).join(', ')})`);
         
         // Keep only overheads that are in the target set
         const keptOverheads = existingOverheads.filter(s => targetSet.has(safeCanon(s.role)));
         
         // Create map of existing overheads by canonical role
         const overheadMap = new Map(keptOverheads.map(s => [safeCanon(s.role), s]));
         
         // Create map from bed speakers only
         const byCanonPrev = new Map(bedSpeakers.map(s => [safeCanon(s.role), s]));
         
         // Separate seeded speakers into bed-layer and overheads
         const seededBed = (seededSpeakers || []).filter(s => !knownOverheadRoles.has(safeCanon(s.role)));
         const seededOverheads = (seededSpeakers || []).filter(s => knownOverheadRoles.has(safeCanon(s.role)));
         
         debug(`[Speakers] Seeded: ${seededBed.length} bed + ${seededOverheads.length} overhead (${seededOverheads.map(s => s.role).join(', ')})`);
         
         // Process bed-layer speakers (preserve models from previous)
         const nextBed = seededBed.map(seed => {
           const prevMatch = byCanonPrev.get(safeCanon(seed.role));
           const finalModel = prevMatch?.model ?? hint ?? seed.model;
           return { ...seed, model: finalModel, draggable: true };
         });
         
         // Build final overhead list: reuse existing positions if available, otherwise use seeded defaults
         const nextOverheads = [];
         for (const targetId of targetOverheadIds) {
           const canonId = targetId.toUpperCase();
           const existing = overheadMap.get(canonId);
           
           if (existing) {
             // Reuse existing overhead speaker with its position
             debug(`[Speakers] Reusing existing overhead: ${canonId}`);
             nextOverheads.push(existing);
           } else {
             // Create new overhead speaker from seed
             const seeded = seededOverheads.find(s => safeCanon(s.role) === canonId);
             if (seeded) {
               let modelFromOverrides = undefined;

               if (['TFL', 'TFR', 'TFC'].includes(canonId)) {
                 modelFromOverrides = _useFrontGlobal ? _overheadGlobalModel : (_overheadFrontOverride || _overheadGlobalModel);
               } else if (['TML', 'TMR'].includes(canonId)) {
                 modelFromOverrides = _useMidGlobal ? _overheadGlobalModel : (_overheadMidOverride || _overheadGlobalModel);
               } else if (['TRL', 'TRR', 'TRC'].includes(canonId)) {
                 modelFromOverrides = _useRearGlobal ? _overheadGlobalModel : (_overheadRearOverride || _overheadGlobalModel);
               }

               const finalModel = modelFromOverrides || _overheadGlobalModel || seeded.model;
               debug(`[Speakers] Creating new overhead: ${canonId} with model ${finalModel}`);
               nextOverheads.push({ ...seeded, model: finalModel, draggable: true });
             } else {
               debug(`[Speakers] WARNING: Target overhead ${canonId} not found in seeded speakers!`);
             }
           }
         }
         
         const nextList = [...nextBed, ...nextOverheads];

         debug(`[Speakers] Final: ${nextBed.length} bed + ${nextOverheads.length} overhead = ${nextList.length} total`);
         console.log("[RD] RECONCILE nextList:", nextList.map(s => s.role));
         console.log(
           "[RD RECON] OUTPUT roles =",
           nextList.map(s => s.role)
         );
         
         safeGroup('[Speakers] Reconciliation result', () => {
           safeTable(nextList.map(s => ({ role: s.role, model: s.model ?? '(none)', hasPosition: !!s.position })));
         });

         // NEW: guarantee Atmos overheads exist & have models,
         // independent of surround model selection.
         const withOverheads = ensureAtmosOverheads({
           placedSpeakers: nextList,
           dolbyPreset,
           roomDimensions: stableDimensions,
           overheadGlobalModel: _overheadGlobalModel,
           overheadFrontOverride: _overheadFrontOverride,
           overheadMidOverride: _overheadMidOverride,
           overheadRearOverride: _overheadRearOverride,
           useFrontGlobal: _useFrontGlobal,
           useMidGlobal: _useMidGlobal,
           useRearGlobal: _useRearGlobal,
         });

         return withOverheads;
         });
         }
  }, [
    dolbyPreset, stableDimensions, setSpeakers, _isFrozen, placedSpeakers, _sevenBedLayoutType, lastPresetRef,
    _overheadGlobalModel, _overheadFrontOverride, _overheadMidOverride, _overheadRearOverride,
    _useFrontGlobal, _useMidGlobal, _useRearGlobal, loadState?.phase
  ]);

  // Ensure Atmos overheads exist as soon as an Atmos preset AND a
  // global overhead model are selected – WITHOUT relying on surrounds.
  useEffect(() => {
    if (!dolbyPreset || !_overheadGlobalModel) return;
    if (_isFrozen && _isFrozen("speakers")) return;

    // Normalise preset string, e.g. "5.1.4 Dolby Atmos" -> "5.1.4"
    const normalized = String(dolbyPreset).split(" ")[0].split("_")[0];
    const parts = normalized.split(".");
    const heights = parts.length >= 3 ? parseInt(parts[2], 10) || 0 : 0;

    // If layout has no height layer, do nothing
    if (!heights) return;

    // If we already have any T* roles, do nothing
    const hasAnyOverheads =
      Array.isArray(placedSpeakers) &&
      placedSpeakers.some((spk) =>
        safeCanon(spk.role || "").startsWith("T")
      );

    if (hasAnyOverheads) return;

    // Seed / fix overheads using the existing helper
    setSpeakers((prev) =>
      ensureAtmosOverheads({
        placedSpeakers: prev,
        dolbyPreset,
        roomDimensions: stableDimensions,
        overheadGlobalModel: _overheadGlobalModel,
        overheadFrontOverride: _overheadFrontOverride,
        overheadMidOverride: _overheadMidOverride,
        overheadRearOverride: _overheadRearOverride,
        useFrontGlobal: _useFrontGlobal,
        useMidGlobal: _useMidGlobal,
        useRearGlobal: _useRearGlobal,
      })
    );
  }, [
    dolbyPreset,
    placedSpeakers,
    stableDimensions,
    _overheadGlobalModel,
    _overheadFrontOverride,
    _overheadMidOverride,
    _overheadRearOverride,
    _useFrontGlobal,
    _useMidGlobal,
    _useRearGlobal,
    setSpeakers,
    _isFrozen,
  ]);

  // Build or rebuild seating positions whenever seating config changes
  useEffect(() => {
    // If we've just loaded a real project, don't overwrite its seating layout
    if (loadState?.phase === "loaded") {
      return;
    }

    const setSeats = appState?.setSeatingPositions;
    if (typeof setSeats !== 'function') return;

    // 1) Decide how many seats in each row
    const list = Array.isArray(_seatsPerRowByRow) && _seatsPerRowByRow.length
      ? _seatsPerRowByRow
      : Array.from(
          { length: Math.max(1, Number(_seatingRows) || 1) },
          () => Math.max(1, Number(_seatsPerRow) || 1)
        );

    // 2) Row centre Y positions - ALWAYS use pre-computed row centers from first effect
    //    Do NOT recalculate from _rowSpacingM here.
    let centers = Array.isArray(appState?.rowCentersM) && appState.rowCentersM.length
      ? appState.rowCentersM.slice(0, list.length)
      : [];

    // If we have no centers yet (e.g. first render before MLP effect runs), use a safe fallback
    // This fallback does NOT depend on _rowSpacingM - it's just a placeholder until the first effect runs.
    const fallbackStartY = 2; // 2m from screen as a safe default
    const fallbackSpacing = 1.8; // fixed fallback, not from state
    
    while (centers.length < list.length) {
      const i = centers.length;
      centers.push(fallbackStartY + i * fallbackSpacing);
    }

    // 3) Basic geometry
    const roomWidth = Number(stableDimensions?.width) || 4.5;
    const centerX = roomWidth / 2;
    const spacingX = Number(_seatSpacing) || 0.8;

    // 4) Build all seats
    const seats = [];

    list.forEach((rawCount, rowIndex) => {
      const count = Math.max(1, Number(rawCount) || 1);
      const y = Number(centers[rowIndex]) || (fallbackStartY + rowIndex * fallbackSpacing);

      const totalWidth = (count - 1) * spacingX;
      const startX = centerX - totalWidth / 2;

      for (let i = 0; i < count; i++) {
        seats.push({
          id: `seat-r${rowIndex + 1}-c${i + 1}`,
          x: startX + i * spacingX,
          y,
          z: 1.2,
          rowNumber: rowIndex + 1,
        });
      }
    });

    // 5) Commit to app state
    setSeats(seats);

    console.log(
      '[RD] seating rebuilt: rows=',
      list.length,
      'seats=',
      seats.length,
      'list=',
      list
    );
  }, [
    appState?.setSeatingPositions,
    _seatsPerRowByRow,
    _seatingRows,
    _seatsPerRow,
    _seatSpacing,
    // REMOVED: _rowSpacingM (row Y positions come from rowCentersM now)
    appState?.rowCentersM,
    stableDimensions?.width,
  ]);

  // Manual seating generation - single source of truth
const handleGenerateSeating = React.useCallback((overrides = {}) => {
  // If the seating tab is locked, do nothing
  if (_isFrozen && _isFrozen('seating')) return;

  // 1. Spacing (use override if given, otherwise keep current)
  const seatSpacingVal =
    Number(overrides.seatSpacing ?? _seatSpacing ?? 0.8) || 0.8;

  const rowSpacingVal =
    Number(overrides.rowSpacingM ?? _rowSpacingM ?? 1.8) || 1.8;

  // 2. Build the list of seats per row

  let list = [];

  // Case A: caller sends an explicit list, e.g. [3,3] or [4,3,2]
  if (Array.isArray(overrides.seatsPerRowByRow) && overrides.seatsPerRowByRow.length) {
    list = overrides.seatsPerRowByRow.map((n) =>
      Math.max(1, parseInt(n || 1, 10))
    );
  } else {
    // Case B: fall back to "numberOfRows" + "seatsPerRow"
    const rows = Math.max(
      1,
      parseInt(overrides.numberOfRows ?? _seatingRows ?? 1, 10)
    );
    const seats = Math.max(
      1,
      parseInt(overrides.seatsPerRow ?? _seatsPerRow ?? 3, 10)
    );
    list = Array.from({ length: rows }, () => seats);
  }

  // Safety: always at least one row
  if (!list.length) {
    list = [Math.max(1, parseInt(_seatsPerRow ?? 3, 10))];
  }

  const rowsCount = list.length;

  // 3. Update global state (this is what drives the plan view)

  // how many rows
  if (typeof setSeatingRowsGuarded === 'function') {
    setSeatingRowsGuarded(rowsCount);
  }

  // legacy single "seatsPerRow" — keep roughly in sync (first row)
  if (typeof setSeatsPerRowGuarded === 'function') {
    setSeatsPerRowGuarded(list[0] ?? 3);
  }

  // spacing
  if (typeof setSeatSpacingGuarded === 'function') {
    setSeatSpacingGuarded(seatSpacingVal);
  }

  // REMOVED: Do not write rowSpacingM here. Let the control be the only writer.
  // The spacing value is already in state and will be used by the seat-builder effect.

  // NEW: per-row list used by the seat-builder effect
  if (typeof setSeatsPerRowByRowGuarded === 'function') {
    setSeatsPerRowByRowGuarded([...list]); // spread = new array so React notices
  }
}, [
  _isFrozen,
  _seatSpacing,
  _seatingRows,
  _seatsPerRow,
  setSeatingRowsGuarded,
  setSeatsPerRowGuarded,
  setSeatsPerRowByRowGuarded,
  setSeatSpacingGuarded,
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

      console.log('[RD] optimiseAll -> roles', merged.map(s => safeCanon(s.role)));
      setSpeakers(prev => mergePreserveOverheads(prev, merged));
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
    
    // REMOVED: base.OVERHEADS derivation - overhead corridors controlled by individual OVERHEADS_X toggles
    // REMOVED: base.showOverheadZones - overhead zones gated by OVERHEADS_X, not enableDolbyZones
    
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
    // Overhead state from AppStateProvider (single source of truth)
    overheadGlobalModel: overheadGlobalModelFromState,
    setOverheadGlobalModel: setOverheadGlobalModelFromState,
    overheadFrontOverride: overheadFrontOverrideFromState,
    setOverheadFrontOverride: setOverheadFrontOverrideFromState,
    overheadMidOverride: overheadMidOverrideFromState,
    setOverheadMidOverride: setOverheadMidOverrideFromState,
    overheadRearOverride: overheadRearOverrideFromState,
    setOverheadRearOverride: setOverheadRearOverrideFromState,
    useFrontGlobal: useFrontGlobalFromState,
    setUseFrontGlobal: setUseFrontGlobalFromState,
    useMidGlobal: useMidGlobalFromState,
    setUseMidGlobal: setUseMidGlobalFromState,
    useRearGlobal: useRearGlobalFromState,
    setUseRearGlobal: setUseRearGlobalFromState,
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
            {projectIdState && (
              <span className="text-xs text-gray-400 ml-auto">ID: {projectIdState.slice(0, 12)}…</span>
            )}
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
              <strong
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  color: "#213428",
                  display: "flex",
                  alignItems: "center",
                  height: "100%",
                  marginLeft: "12px",
                }}
              >
                {(dolbyPreset || "").split(" ")[0] || ""}
              </strong>
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
                {(() => {
                  console.log('[RD] passing placedSpeakers to RoomVisualisation', {
                    count: Array.isArray(placedSpeakers) ? placedSpeakers.length : 0,
                    roles: (placedSpeakers || []).map(s => safeCanon(s.role)),
                    dolbyPreset,
                  });
                  return null;
                })()}
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
                  allSeatSplMetrics={allSeatSplMetrics}
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
                        seatsPerRowByRow={_seatsPerRowByRow}
                        onSeatsPerRowByRowChange={setSeatsPerRowByRowGuarded}
                        seatsPerRow={seatsPerRow} 
                        onSeatsPerRowChange={setSeatsPerRowGuarded} 
                        seatingRows={seatingRows} 
                        onSeatingRowsChange={setSeatingRowsGuarded} 
                        seatSpacing={seatSpacing} 
                        onSeatSpacingChange={setSeatSpacingGuarded} 
                        rowSpacingM={_rowSpacingM || 1.8}
                        onRowSpacingChange={(val) => {
                          // Hard guard: only accept finite numbers
                          const next = Number(val);
                          if (!Number.isFinite(next)) return;

                          // Use guarded setter (respects frozen state)
                          if (typeof setRowSpacingGuarded === 'function') {
                            setRowSpacingGuarded(next);
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

                        overheadGlobalModel={overheadGlobalModelFromState}
                        setOverheadGlobalModel={setOverheadGlobalModelFromState}
                        overheadFrontOverride={overheadFrontOverrideFromState}
                        setOverheadFrontOverride={setOverheadFrontOverrideFromState}
                        overheadMidOverride={overheadMidOverrideFromState}
                        setOverheadMidOverride={setOverheadMidOverrideFromState}
                        overheadRearOverride={overheadRearOverrideFromState}
                        setOverheadRearOverride={setOverheadRearOverrideFromState}
                        useFrontGlobal={useFrontGlobalFromState}
                        setUseFrontGlobal={setUseFrontGlobalFromState}
                        useMidGlobal={useMidGlobalFromState}
                        setUseMidGlobal={setUseMidGlobalFromState}
                        useRearGlobal={useRearGlobalFromState}
                        setUseRearGlobal={setUseRearGlobalFromState}
                        
                        allSeatSplMetrics={allSeatSplMetrics}
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
              
              <CollapsiblePanel
                title="Options"
                icon={<Box className="w-5 h-5" />}
                defaultOpen={false}
              >
                  <div className="space-y-4 p-4">
                    {/* Show Prices Toggle */}
                    <div className="flex items-center justify-between">
                      <Label htmlFor="show-prices" className="text-sm font-medium">
                        Show Prices
                      </Label>
                      <Switch
                        id="show-prices"
                        checked={showPrices}
                        onCheckedChange={setShowPrices}
                      />
                    </div>
                    
                    {/* Difficulty Rating */}
                    <div className="space-y-2">
                      <Label htmlFor="difficulty" className="text-sm font-medium">
                        Difficulty Rating
                      </Label>
                      <div className="text-xs text-gray-500 mb-2">
                        Multiplies hardware prices to reflect installation difficulty (1.00 = baseline)
                      </div>
                      <input
                        id="difficulty"
                        type="number"
                        step="0.01"
                        value={difficultyMultiplier.toFixed(2)}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (Number.isFinite(val) && val > 0) {
                            setDifficultyMultiplier(Math.round(val * 100) / 100);
                          }
                        }}
                        onBlur={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!Number.isFinite(val) || val <= 0) {
                            setDifficultyMultiplier(1.0);
                          }
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                      />
                    </div>
                  </div>
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