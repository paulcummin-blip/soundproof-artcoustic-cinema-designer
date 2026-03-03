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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
import { yHalfExtentM, isRenderableSpeaker } from "@/components/room/rv/RenderPrimitives"; // NEW: For stroke-aware positioning
import { calculateLcrConstraints } from "@/components/room/constraints/lcrConstraints"; // NEW: For LCR constraints
import { placeSubwoofers } from '@/components/room/placement/placeSubwoofers'; // NEW import // FIX: Added 'from' keyword
import { computeFrontWideZonesStrict } from "@/components/utils/frontWideZones"; // NEW import
import { SHOW_DEBUG_LOGS } from '../components/utils/diagnostics'; // NEW: Import SHOW_DEBUG_LOGS
import { distanceFor57_5FromWidth, buildRowCenters } from '@/components/room/seatingUtils';
import { computeAllSeatSplMetrics, getMlpSeat } from "@/components/utils/spl/centralSplEngine";
import { usePriceCalculation } from "@/components/pricing/usePriceCalculation";
import { computeSeatHudMetrics } from "@/components/utils/computeSeatHudMetrics";
import { rolesForLayout } from "@/components/utils/surroundRoleMap";
import { deriveSubwoofersFromCfg } from "@/components/utils/deriveSubwoofersFromCfg";
import { safeCanon, mergePreserveOverheads, cloneRoleWithModel, speakersEqual, preserveSurroundModels } from "@/components/room/utils/speakerHelpers";
import { DOLBY_PRESETS, seedSpeakersFromPreset, getTargetOverheadIds, ensureAtmosOverheads } from "@/components/room/utils/dolbyHelpers";
import { getModelDimsM } from "@/components/roomdesigner/utils/getModelDimsM";
import { useUrlQuery, useSurroundGroupDepths, parseProjectJson, getMlpPoint } from "@/components/roomdesigner/RoomDesignerHelpers";
import { useProjectLoader } from "@/components/hooks/useProjectLoader";
import { useSpeakerSystemStore } from "@/components/hooks/useSpeakerSystemStore";

// REMOVED: useRoomDimensions hook - now expanded to load SPL speaker data
// The functionalities of useRoomDimensions are now absorbed into AppStateProvider (for dimensions)
// and useProjectLoader (for speaker handoff data).


// useProjectLoader and useSpeakerSystemStore are imported from external files (see imports above).
// The duplicate inline bodies have been removed to fix the build errors.




// Safe lazy imports that work with both named and default exports
const RoomDimensions = React.lazy(() =>
import("@/components/room/RoomDimensions").
then((m) => ({ default: m.default ?? m.RoomDimensions }))
);

const ScreenConfiguration = React.lazy(() =>
import("@/components/room/ScreenConfiguration").
then((m) => ({ default: m.default ?? m.ScreenConfiguration }))
);

const SeatingLayout = React.lazy(() =>
import("@/components/room/SeatingLayout").
then((m) => ({ default: m.default ?? m.SeatingLayout }))
);

const SpeakerPlacement = React.lazy(() =>
import("@/components/room/SpeakerPlacement").
then((m) => ({ default: m.default ?? m.SpeakerPlacement }))
);

const RoomElements = React.lazy(() =>
import("@/components/room/RoomElements").
then((m) => ({ default: m.default ?? m.RoomElements }))
);

const BassResponse = React.lazy(() =>
import("@/components/room/BassResponse").
then((m) => ({ default: m.default ?? m.BassResponse }))
);

// Direct imports (these are default exports)
// Fix: Change RoomVisualisation to be lazy-loaded as it's used within Suspense.
const RoomVisualisation = React.lazy(() =>
import("@/components/room/RoomVisualisation").
then((m) => ({ default: m.default ?? m.RoomVisualisation }))
);
import { ErrorBoundary } from "@/components/dev/ErrorBoundary";
import SubwooferMenu from "@/components/room/SubwooferMenu"; // new
import SpeakerPositionsReadout from "@/components/room/SpeakerPositionsReadout";

import RP22CompliancePanel from "@/components/rp22/RP22CompliancePanel";

// DEBUG: log the available preset keys once at module load
if (typeof window !== "undefined" && window.console) {
  if (globalThis.__B44_LOGS) console.log("[RD PRESETS] keys:", Object.keys(DOLBY_PRESETS || {}));
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

  // NEW: Refs for speaker rescue on room resize
  const prevRoomDimsRef = useRef(null);
  const isDraggingRef = useRef(false);
  const visualisationRef = React.useRef(null);
  const didUserRequestResetRef = useRef(false);
  const didInitialSeatSyncRef = useRef(false);

  // NEW: Seating config epoch tracking for loaded projects
  const [seatingConfigEpoch, setSeatingConfigEpoch] = useState(0);
  const seatingLoadedEpochRef = useRef(0);

  // Seats are "auto-generated" if they follow the standard ID pattern we create (seat-rX-cY).
  // We allow rebuilds for auto seats even when loadState.phase === "loaded" so first-load sync works.
  const areAutoGeneratedSeats = (seats) => {
    if (!Array.isArray(seats) || seats.length === 0) return true; // treat empty as auto
    for (const s of seats) {
      const id = String(s?.id || '');
      if (!/^seat-r\d+-c\d+$/i.test(id)) return false;
    }
    return true;
  };

  // Temporary variables for values that might be undefined if appState is null
  // (Assumes AppStateProvider has been updated to provide these)
  const _roomDims = appState?.roomDims;
  const _setRoomDims = appState?.setRoomDims;

  // CRITICAL: Define stableDimensions EARLY (before any hooks that use it)
  // This is the canonical room dimensions object used throughout RoomDesigner
  const stableDimensions = useMemo(() => {
    const dims = {
      width: Number(_roomDims?.widthM) || 4.5,
      length: Number(_roomDims?.lengthM) || 6.0,
      height: Number(_roomDims?.heightM) || 2.8
    };

    if (globalThis.__B44_LOGS) {
      console.log('[RoomDesigner] stableDimensions', dims);
    }

    return dims;
  }, [_roomDims?.widthM, _roomDims?.lengthM, _roomDims?.heightM]);

  const dimensions = stableDimensions; // legacy alias to prevent ReferenceError

  const _selectedSpeakersByRole = appState?.selectedSpeakersByRole;
  const _setSelectedSpeakersByRole = appState?.setSelectedSpeakersByRole;
  const _speakerNodes = appState?.speakerNodes;
  const _setSpeakerNodes = appState?.setSpeakerNodes;

  const _seatingPositions = appState?.seatingPositions;
  const seats = Array.isArray(_seatingPositions) ? _seatingPositions : [];

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



  // Use session active project ID (from Projects page), fallback to URL param for legacy support
  const activeProjectId = sessionActiveProjectId || initialProjectIdFromUrl;

  // Don't block render - allow local-only mode
  const showLocalHint = !activeProjectId;

  // REMOVED: useRoomDimensions hook call and its related state
  // const { dims: sharedDims, setDims: setSharedDims, loadDims, loaded: dimsLoaded,
  //   selectedSpeakersByRole, loadSelectedSpeakers, speakerNodes, loadSpeakerNodes,
  // } = useRoomDimensions(activeProjectId);

  // Use AppState dolbyLayout directly (no local state override)
  const dolbyPreset = appState?.dolbyLayout || "5.1";
  const setDolbyPreset = appState?.setDolbyLayout;
  const [lcrAngleDeg, setLcrAngleDeg] = useState(0); // Live angle readout
  const [subWarnings, setSubWarnings] = useState({ front: [], rear: [] });

  // NEW: Options panel state
  const [showPrices, setShowPrices] = useState(false);
  const [difficultyMultiplier, setDifficultyMultiplier] = useState(1.0);
  const [speakerPositionsView, setSpeakerPositionsView] = React.useState('off'); // 'off' | 'plan' | 'table' | 'both'
  const [showMlpRuler, setShowMlpRuler] = useState(false); // MLP Position Ruler toggle
  const [zoomMode, setZoomMode] = useState('off'); // 'off' | 'in' | 'out'
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [freeMoveLcr, setFreeMoveLcr] = useState(false); // Free Move (LCR) toggle

  // Layout emphasis: controls how wide the left plan vs right menu are.
  // "balanced" keeps your current look.
  // "plan" gives the plan more space (useful when talking room layout).
  // "controls" gives the right menu more space (useful when showing the bass graph).
  const [viewEmphasis, setViewEmphasis] = React.useState("balanced"); // "plan" | "balanced" | "controls"

  // --- bed rears required? (SBL/SBR) ---
  const layoutMajor = parseInt(String(dolbyPreset || "5.1").split(".")[0], 10) || 5;
  const isNineBedLayout = layoutMajor >= 9;
  const useWidesInsteadOfRears = _sevenBedLayoutType === "wides";
  const expectsRears = layoutMajor >= 9 || layoutMajor === 7 && !useWidesInsteadOfRears;
  
  // Extra surrounds only for 9.x.x layouts
  const allowExtraSurrounds = isNineBedLayout;
  
  // LCR aim from AppState (persisted)
  const lcrAimMode = appState?.lcrAimMode || "flat";
  const setLcrAimMode = appState?.setLcrAimMode;

  // screen state is now managed directly by AppState, removed local useState here.

  // Track preset changes to prevent unnecessary re-seeding
  const lastPresetRef = React.useRef(dolbyPreset);
  useEffect(() => {lastPresetRef.current = dolbyPreset;}, [dolbyPreset]);
  
  // NEW: Auto-reset extra surrounds count when layout doesn't allow them (idempotent)
  useEffect(() => {
    if (!isNineBedLayout) {
      // Only force reset when the control is not allowed
      if ((appState?.extraSurroundCount ?? 0) !== 0) {
        appState?.setExtraSurroundCount?.(0);
      }
    }
  }, [isNineBedLayout, appState?.extraSurroundCount, appState?.setExtraSurroundCount]);

  // NOTE: stableDimensions is already defined earlier (line 1539) - do not redeclare

  // ⚠️ Hoisted memos so they’re initialized before any effects that depend on them
  // stableScreen now directly depends on _screen from appState
  const stableScreen = useMemo(() => ({
    mountMode: _screen?.mountMode || "floating",
    visibleWidthInches: Number(_screen?.visibleWidthInches) || 100,
    aspectRatio: _screen?.aspectRatio || "16:9",
    floatDepthM: Number(_screen?.floatDepthM) || 0.20,
    heightFromFloorM: Number(_screen?.heightFromFloorM) || 0.5,
    manualMode: _screen?.manualMode || false,
    manualWidthM: Number(_screen?.manualWidthM) || 0,
    manualHeightM: Number(_screen?.manualHeightM) || 0
  }), [_screen?.visibleWidthInches, _screen?.aspectRatio, _screen?.floatDepthM, _screen?.heightFromFloorM, _screen?.manualMode, _screen?.manualWidthM, _screen?.manualHeightM, _screen?.mountMode]);

  // --- Screen width used for MLP + row centres (must be available even if Screen Size panel was never opened) ---
  const screenVisibleWidthInchesEffective = useMemo(() => {
    const s = stableScreen || _screen || appState?.screen || {};

    // 1) Preferred: already in inches
    const vwi = Number(s?.visibleWidthInches);
    if (Number.isFinite(vwi) && vwi > 0) return vwi;

    // 2) Manual width in metres -> inches
    const mw = Number(s?.manualWidthM);
    if (Number.isFinite(mw) && mw > 0) return mw / 0.0254;

    // 3) Manual height + aspect ratio -> width
    const mh = Number(s?.manualHeightM);
    const ar = Number(s?.aspectRatio);
    if (Number.isFinite(mh) && mh > 0 && Number.isFinite(ar) && ar > 0) {
      return (mh * ar) / 0.0254;
    }

    // 4) If nothing exists yet, use a conservative default so we DON'T drift
    // (This is only a temporary geometry anchor; once the real screen width arrives,
    //  the effect will run again and seats/MLP will update.)
    return 120; // 120" default
  }, [stableScreen, _screen, appState?.screen]);

  // Compute MLP (green dot) and row centers from screen plane
  useEffect(() => {
    // Pull needed values
    // Prefer the published screen front plane from RV.
    // IMPORTANT: Do NOT calculate/store mlpY_m until this is a real finite number,
    // otherwise the MLP dot "locks in" a consistent wrong offset on first load.
    const screenFrontPlaneM_raw = appState?.screenFrontPlaneM;
    if (!Number.isFinite(screenFrontPlaneM_raw)) {
      return;
    }
    const screenFrontPlaneM = Number(screenFrontPlaneM_raw);

    const screenVisibleWidthM =
      Number(screenVisibleWidthInchesEffective) * 0.0254;

    /* Y-only viewing offset (lock X to centre) */
    const viewingOffsetM = Number(_seatingBlockOffset) || 0;
    const rows = Number(_seatingRows) || 1;
    const rowSpacing = Number(_rowSpacingM) || 1.8; // default 1.8m
    const mlpReference = _mlpBasis; // 'front' | 'back' | 'all'

    // Must have screen width
    if (!Number.isFinite(screenVisibleWidthM)) {
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
        if (globalThis.__B44_LOGS) console.warn(`[Seats] buildRowCenters returned ${centersRaw?.length ?? 'null'} centers for ${rows} rows. Using fallback.`);
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

    const centers = centersRaw.map((y) => _clampY(y));

    // Store the clamped row centers
    if (typeof appState?.setRowCentersM === 'function') {
      appState.setRowCentersM(centers);
    }

    // 5. Store the FIXED MLP position (green dot).
    // This is always derived from the 57.5° distance + viewing offset, never from row centres.
    const mlpRounded = Math.round(fixedMlpY * 1000) / 1000;

    if (typeof appState?.setMlpY_m === 'function') {
      appState.setMlpY_m((prev) => {
        const prevRounded = Number.isFinite(prev) ? Math.round(prev * 1000) : null;
        const newRounded = Math.round(mlpRounded * 1000);
        return prevRounded === newRounded ? prev : mlpRounded;
      });
    }

    // Temporary telemetry (remove after verify)
    if (SHOW_DEBUG_LOGS && typeof console !== 'undefined' && Math.random() < 0.05) {
      if (globalThis.__B44_LOGS) console.log('[MLP]', {
        frontY: screenFrontPlaneM.toFixed(3),
        idealM: idealDistM.toFixed(3),
        offset: viewingOffsetM.toFixed(3),
        fixedMlpY: mlpRounded.toFixed(3)
      });
      if (globalThis.__B44_LOGS) console.log('[ROWS]', {
        mode: mlpReference,
        count: rows,
        spacing: rowSpacing.toFixed(3),
        frontY: centers[0]?.toFixed(3),
        backY: centers[centers.length - 1]?.toFixed(3)
      });
    }
  }, [
  appState?.screenFrontPlaneM,
  screenVisibleWidthInchesEffective,
  _seatingBlockOffset,
  _seatingRows,
  _mlpBasis,
  _rowSpacingM,
  appState?.setMlpY_m,
  appState?.setRowCentersM,
  stableDimensions?.length,
  appState?.roomDims?.lengthM,
  _screen?.screenPlaneY_m,
  _screen?.floatDepthM]
  );

  // Use computed MLP as the effective anchor (for backwards compatibility)
  const mlpAnchorEffective = useMemo(() => {
    const roomWidthM = Number(stableDimensions?.width) || 0;
    const cx = roomWidthM > 0 ? roomWidthM / 2 : 0;

    // Primary: use stored MLP Y when valid
    const mlpY = appState?.mlpY_m;
    if (Number.isFinite(mlpY)) {
      return { x: cx, y: mlpY, z: 1.2 };
    }

    // Fallback (only while mlpY_m is not ready):
    // lock the dot to the centre seat so it ALWAYS visually matches the seating layout.
    const seats = Array.isArray(appState?.seatingPositions) ? appState.seatingPositions : [];
    if (seats.length > 0 && Number.isFinite(roomWidthM)) {
      let best = null;
      let bestDx = Infinity;

      for (const s of seats) {
        const sx = Number(s?.x ?? s?.position?.x);
        const sy = Number(s?.y ?? s?.position?.y);
        if (!Number.isFinite(sx) || !Number.isFinite(sy)) continue;

        const dx = Math.abs(sx - cx);
        if (dx < bestDx) {
          bestDx = dx;
          best = s;
        }
      }

      if (best) {
        const by = Number(best.y ?? best.position?.y);
        const bz = Number(best.z ?? best.position?.z);
        if (Number.isFinite(by)) {
          const z = Number.isFinite(bz) ? bz : 1.2;
          return { x: cx, y: by, z };
        }
      }
    }

    // If no seats yet, keep null so RV can do its own last-resort fallback
    return null;
  }, [appState?.mlpY_m, appState?.seatingPositions, stableDimensions?.width]);

  const placedSpeakers = appState?.speakerSystem?.placedSpeakers || [];
  const engineSpeakers = Array.isArray(placedSpeakers) ? placedSpeakers : [];

  // ANALYSIS MUST ONLY USE SPEAKERS THAT ARE ACTUALLY "IN THE DRAWING"
  // (VALID POSITION + REAL MODEL + VISIBLE BY LAYOUT RULES)
  const analysisSpeakers = useMemo(() => {
    const raw = Array.isArray(placedSpeakers) ? placedSpeakers : [];

    // ANALYSIS IS STRICTER THAN DRAWING:
    // - VALID POSITION
    // - REAL MODEL SELECTED (NO "OFF/NONE/BLANK")
    // - NO REAR-SURROUND "MODEL LAG" EXCEPTION
    const isAnalysableSpeaker = (spk) => {
      if (!spk) return false;

      const pos = spk.position;
      if (
        !pos ||
        typeof pos.x !== "number" ||
        typeof pos.y !== "number" ||
        !Number.isFinite(pos.x) ||
        !Number.isFinite(pos.y)
      ) {
        return false;
      }

      const ms = String(spk?.model ?? "").trim().toLowerCase();
      if (!ms || ms === "off" || ms === "none") return false;

      return true;
    };

    const afterRenderable = raw.filter(isAnalysableSpeaker);

    // 2) Respect layout visibility (same logic concept as plan)
    const speakerSystem = appState?.speakerSystem;
    const sevenBedLayoutType = appState?.sevenBedLayoutType;

    const layoutRaw =
      speakerSystem?.dolbyLayout ??
      speakerSystem?.dolbyPreset ??
      dolbyPreset ??
      "5.1";

    const layoutKey =
      (typeof layoutRaw === "string" ? layoutRaw : layoutRaw?.layout || "5.1")
        .toString()
        .trim()
        .split(" ")[0]
        .split("_")[0];

    const useWidesInsteadOfRears =
      !!speakerSystem?.useWidesInsteadOfRears ||
      speakerSystem?.sevenBedLayoutType === "wides" ||
      sevenBedLayoutType === "wides" ||
      false;

    const allowedRoles = new Set(
      rolesForLayout({
        dolbyLayout: layoutKey,
        useWidesInsteadOfRears: !!useWidesInsteadOfRears,
      })
    );

    return afterRenderable.filter((s) => {
      const canon = safeCanon(s?.role);

      // Always exclude LFE from plan + analysis
      if (canon === "LFE") return false;

      // Bed surrounds are controlled by layout role visibility
      if (["SL","SR","SBL","SBR","LW","RW"].includes(canon)) {
        return allowedRoles.has(canon);
      }

      // FOR ANALYSIS: IF IT GOT THIS FAR, IT ALREADY HAS A REAL MODEL.
      // SO WE ONLY APPLY VISIBILITY IF IT IS EXPLICITLY TURNED OFF BY LAYOUT,
      // BUT WE DO NOT "AUTO-TRUE" JUST BECAUSE A ROLE IS EXPECTED.
      return appState?.getSpeakerVisibility
        ? appState.getSpeakerVisibility(s.role, s.model) === true
        : true;
    });
  }, [
    placedSpeakers,
    appState?.speakerSystem,
    appState?.sevenBedLayoutType,
    appState?.getSpeakerVisibility,
    dolbyPreset,
  ]);

  // For "Aim Loudspeaker" depth metrics: only consider speakers active in current layout
  // Parse bed count from Dolby preset (e.g., "5.1" → 5, "7.1" → 7, "9.1" → 9)
  const _parseBedCount = (layoutStr) => {
    const m = String(layoutStr || "").match(/^(\d+)(?:\.\d+)?/);
    return m ? Number(m[1]) : null;
  };

  const _bedCount = _parseBedCount(dolbyPreset);

  // Allowed bed speaker roles for the CURRENT layout (excludes ghost speakers from previous configs)
  const _allowedBedRoles = React.useMemo(() => {
    const s = new Set(["FL","FC","FR","SL","SR"]); // 5.1 minimum
    if (_bedCount >= 7) {
      // 7.x adds SBL/SBR OR LW/RW (based on sevenBedLayoutType)
      if (_sevenBedLayoutType === 'wides') {
        s.add("LW"); s.add("RW");
      } else {
        s.add("SBL"); s.add("SBR");
      }
    }
    if (_bedCount >= 9) {
      // 9.x includes BOTH rears AND wides
      s.add("SBL"); s.add("SBR");
      s.add("LW"); s.add("RW");
    }
    return s;
  }, [_bedCount, _sevenBedLayoutType]);

  // Filtered speaker list for "Aim Loudspeaker" depth calculation (excludes inactive roles)
  const placedSpeakersForAim = React.useMemo(() => {
    if (!Array.isArray(placedSpeakers) || placedSpeakers.length === 0) return [];
    return placedSpeakers.filter((sp) => {
      const r = safeCanon(sp?.role);
      return _allowedBedRoles.has(r);
    });
  }, [placedSpeakers, _allowedBedRoles]);

  // Helper functions for in-room depth calculation
  const _isNum = (v) => typeof v === "number" && Number.isFinite(v);
  
  const _degToRad = (deg) => (deg * Math.PI) / 180;
  
  const _wrap180 = (deg) => {
    let a = (Number(deg) || 0) % 360;
    if (a > 180) a -= 360;
    if (a < -180) a += 360;
    return a;
  };
  
  const _projectHalfExtent = (yawDeg, halfW, halfD, normalAxis) => {
    const a = _degToRad(_isNum(yawDeg) ? yawDeg : 0);
    const c = Math.abs(Math.cos(a));
    const s = Math.abs(Math.sin(a));
    if (normalAxis === "x") return halfW * c + halfD * s;
    return halfW * s + halfD * c;
  };
  
  const _getDimsM = (modelMeta) => {
    // Accept BOTH formats:
    // 1) meta.widthM / meta.depthM (metres)
    // 2) meta.widthMm / meta.depthMm (millimetres)
    // 3) meta.dims.widthM/depthM or meta.dimensions.widthM/depthM (older)
    const m = modelMeta || {};
    const d = m.dims || m.dimensions || {};

    const widthM =
      (_isNum(m.widthM) ? m.widthM : null) ??
      (_isNum(d.widthM) ? d.widthM : null) ??
      (_isNum(m.widthMm) ? m.widthMm / 1000 : null) ??
      (_isNum(d.widthMm) ? d.widthMm / 1000 : null) ??
      (_isNum(d.width) ? d.width : null) ??
      0.18;

    const depthM =
      (_isNum(m.depthM) ? m.depthM : null) ??
      (_isNum(d.depthM) ? d.depthM : null) ??
      (_isNum(m.depthMm) ? m.depthMm / 1000 : null) ??
      (_isNum(d.depthMm) ? d.depthMm / 1000 : null) ??
      (_isNum(d.depth) ? d.depth : null) ??
      0.10;

    return { widthM, depthM };
  };

  // Position signature for live updates when speaker positions change
  const _posSig = React.useMemo(() => {
    return (placedSpeakersForAim || [])
      .map(s => `${s.id || s.role}:${Number(s?.position?.x).toFixed(4)},${Number(s?.position?.y).toFixed(4)}`)
      .join("|");
  }, [placedSpeakersForAim]);

  // Yaw signature for live updates when speaker aim changes
  const _yawSig = React.useMemo(() => {
    return (placedSpeakersForAim || [])
      .map(s => `${s.id || s.role}:${Number(s?.yaw ?? s?.yawDeg ?? s?.rotation ?? s?.rotationDeg ?? 0).toFixed(2)}`)
      .join("|");
  }, [placedSpeakersForAim]);

  // NEW: In-room depth calculation (placed AFTER mlpAnchorEffective)
  // CRITICAL: Uses placedSpeakersForAim to only measure speakers active in current layout
  const inRoomDepthsCm = React.useMemo(() => {
    if (!Array.isArray(placedSpeakersForAim) || placedSpeakersForAim.length === 0) {
      return { frontWides: null, sideSurrounds: null, rearSurrounds: null };
    }

    const widthM = stableDimensions.width;
    const lengthM = stableDimensions.length;

    if (!_isNum(widthM) || !_isNum(lengthM) || widthM <= 0 || lengthM <= 0) {
      return { frontWides: null, sideSurrounds: null, rearSurrounds: null };
    }

    const aimFW = appState?.aimFrontWidesAtMLP || false;
    const aimSide = appState?.aimSideSurroundsAtMLP || false;
    const aimRear = appState?.aimRearSurroundsAtMLP || false;

    // Wall-hinge depth helpers (for FW, Side, Rear surrounds only)
    
    // Given a wall, return the wall normal yaw (direction pointing INTO the room)
    const _wallNormalYawDeg = (wall) => {
      // LEFT wall points rightwards -> +90
      // RIGHT wall points leftwards -> -90
      // BACK wall points forward -> 0
      if (wall === "LEFT") return 90;
      if (wall === "RIGHT") return -90;
      if (wall === "BACK") return 0;
      return 0;
    };

    // Hinge angle = smallest cabinet rotation away from wall normal (0..90)
    // IMPORTANT: yaw and yaw+180 represent the same cabinet orientation for clearance,
    // so we must fold the angle into an acute 0..90 range.
    const _hingeAngleDegFromWall = (wall, yawDeg) => {
      const normal = _wallNormalYawDeg(wall);

      // -180..+180 difference between yaw and wall normal
      const delta = _wrap180((Number(yawDeg) || 0) - normal);

      // Use cabinet orientation (mod 180): pick the acute equivalent
      // Example: 152° becomes 28°
      const abs = Math.abs(delta);
      const acute = Math.min(abs, 180 - abs);

      // Clamp to 0..90
      return Math.min(90, acute);
    };

    // Wall-hinge intrusion (metres) = D*cos(a) + W*sin(a)
    // where a is "away from flat-to-wall" in radians
    const _hingeIntrusionM = (widthM, depthM, hingeAngleDeg) => {
      const a = _degToRad(hingeAngleDeg);
      const c = Math.abs(Math.cos(a));
      const s = Math.abs(Math.sin(a));
      return depthM * c + widthM * s;
    };

    const computeGroupDepthCm = ({ roles, getYawDegForRole, speakersToProcess, widthM, lengthM, getModelMeta }) => {
      if (!Array.isArray(speakersToProcess) || speakersToProcess.length === 0) return null;
      const W = widthM;
      const L = lengthM;
      if (!(_isNum(W) && W > 0 && _isNum(L) && L > 0)) return null;

      let maxDepthM = null;

      for (const sp of speakersToProcess) {
        const role = safeCanon(sp?.role);
        if (!role || !roles.includes(role)) continue;

        const pos = sp?.position || {};
        if (!_isNum(pos.x) || !_isNum(pos.y)) continue;

        const meta = getModelMeta?.(sp) || null;
        const { widthM: wM, depthM: dM } = _getDimsM(meta);

        // Yaw for clearance must match the plan icon convention:
        // - Aim OFF: flat to wall (wall normal)
        // - Aim ON: aim to MLP using the existing getYawDegForRole(sp)
        const yawDeg = getYawDegForRole?.(sp) ?? 0;

        // Determine wall based on role
        let wall = null;
        if (role === "LW" || role === "SL") wall = "LEFT";
        else if (role === "RW" || role === "SR") wall = "RIGHT";
        else if (role === "SBL" || role === "SBR") wall = "BACK";

        if (!wall) continue;

        // Wall-hinge model: report how far the cabinet extends into room from wall plane
        const hingeAngleDeg = _hingeAngleDegFromWall(wall, yawDeg);
        const depthM_fromWall = _hingeIntrusionM(wM, dM, hingeAngleDeg);

        if (!_isNum(depthM_fromWall)) continue;
        if (maxDepthM === null || depthM_fromWall > maxDepthM) maxDepthM = depthM_fromWall;
      }

      if (maxDepthM === null) return null;
      return Math.round(maxDepthM * 100);
    };

    const getModelMeta = (sp) => {
      const meta = getSpeakerModelMeta(sp?.model);
      return meta && !meta.notFound ? meta : null;
    };

    const getYawDegForRole = (sp) => {
      const r = safeCanon(sp?.role);

      const aimToMLP = () => {
        if (!sp?.position || !mlpAnchorEffective) return 0;
        const dx = mlpAnchorEffective.x - sp.position.x;
        const dy = mlpAnchorEffective.y - sp.position.y;
        const yaw = -Math.atan2(dx, dy) * (180 / Math.PI);
        return _wrap180(yaw);
      };

      // Aim ON: compute yaw to MLP
      if ((r === "LW" || r === "RW") && aimFW) return aimToMLP();
      if ((r === "SL" || r === "SR") && aimSide) return aimToMLP();
      if ((r === "SBL" || r === "SBR") && aimRear) return aimToMLP();

      // Aim OFF: flat to wall (wall normal convention)
      if (r === "LW" || r === "SL") return 90;
      if (r === "RW" || r === "SR") return -90;
      if (r === "SBL" || r === "SBR") return 0;

      return 0;
    };

    const frontWides = computeGroupDepthCm({
      roles: ["LW", "RW"],
      getYawDegForRole,
      speakersToProcess: placedSpeakersForAim,
      widthM,
      lengthM,
      getModelMeta,
    });

    const sideSurrounds = computeGroupDepthCm({
      roles: ["SL", "SR"],
      getYawDegForRole,
      speakersToProcess: placedSpeakersForAim,
      widthM,
      lengthM,
      getModelMeta,
    });

    const rearSurrounds = computeGroupDepthCm({
      roles: ["SBL", "SBR"],
      getYawDegForRole,
      speakersToProcess: placedSpeakersForAim,
      widthM,
      lengthM,
      getModelMeta,
    });

    return { frontWides, sideSurrounds, rearSurrounds };
  }, [
    placedSpeakersForAim,
    _posSig,
    _yawSig,
    stableDimensions.width, 
    stableDimensions.length,
    mlpAnchorEffective,
    appState?.aimFrontWidesAtMLP,
    appState?.aimSideSurroundsAtMLP,
    appState?.aimRearSurroundsAtMLP
  ]);

  // NEW: Compute centralized SPL data for all seats (powers sidebar SPL cards AND HUD)
  // Uses unified SPL logic with max_spl_cont_db_1m cap from speakerData.js
  const allSeatSplMetrics = useMemo(() => {
    const getCanonicalRoleLocal = (role) => {
      const map = { SL: 'SL', LS: 'SL', SR: 'SR', RS: 'SR', SBL: 'SBL', SBR: 'SBR', LW: 'LW', RW: 'RW',
        FL: 'FL', L: 'FL', FC: 'FC', C: 'FC', FR: 'FR', R: 'FR',
        TFL: 'TFL', TFR: 'TFR', TL: 'TL', TML: 'TL', TR: 'TR', TMR: 'TR', TBL: 'TBL', TBR: 'TBR' };
      const r = String(role || '').toUpperCase();
      return map[r] || r;
    };

    // Get global SPL config from appState (same values used by HUD)
    const splConfig = appState?.splConfig || {};
    const screenLoss = Number(splConfig.screenLossDb) || 0;
    const eqHeadroom = Number(splConfig.globalEqHeadroomDb) || 0;
    const roomHeightM = Number(appState?.roomDims?.heightM) || 2.4;

    return computeAllSeatSplMetrics({
      seats: _seatingPositions || [],
      placedSpeakers: analysisSpeakers || [],
      heightM: roomHeightM,
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
            max_spl_cont_db_1m: meta.max_spl || null
          };
        }
        // Fallback for unknown models
        return { widthM: 0.27, depthM: 0.082, sensitivity_dB_1w1m: 87 };
      },
      // Pass screen loss and EQ headroom from global splConfig
      screenLoss_dB: screenLoss,
      eqHeadroom_dB: eqHeadroom,
      mlpPoint: mlpAnchorEffective // NEW: Pass green dot MLP for synthetic "mlp" seat
    });
  }, [
  _seatingPositions,
  analysisSpeakers,
  appState?.getEffectiveSplInputs,
  appState?.splConfig,
  mlpAnchorEffective,
  appState?.roomDims?.heightM
]);

  // Compute diagnostic values
  const widthM =
  typeof stableScreen?.widthMeters === 'number' && stableScreen.widthMeters > 0 ?
  stableScreen.widthMeters :
  (Number(stableScreen?.visibleWidthInches) || 0) * 0.0254;

  // Derive primarySeatingPosition for backwards compatibility with existing code
  const primarySeatingPosition = useMemo(() => {
    const { primary } = computeMLPAndPrimary(
      seats,
      stableDimensions.width,
      stableDimensions.length,
      _mlpBasis
    );
    // Lock MLP X to centerline for analysis purposes
    const roomWidth = stableDimensions.width;
    return primary ? { ...primary, x: roomWidth / 2 } : null;
  }, [seats, stableDimensions.width, stableDimensions.length, _mlpBasis]);

  // ✅ Compute frontWideZones BEFORE analysisResult to avoid TDZ
  const enableFrontWides = _enableFrontWides;

  const frontWideZones = useMemo(() => {
    if (!enableFrontWides) {
      const result = { status: 'disabled' };
      if (typeof window !== 'undefined') {
        window.FW_DBG = result;
        if (SHOW_DEBUG_LOGS && window.DBG_FW) if (globalThis.__B44_LOGS) console.log('[FW] zones ->', result);
      }
      return result;
    }

    if (!mlpAnchorEffective) {
      const result = { status: 'no-mlp' };
      if (typeof window !== 'undefined') {
        window.FW_DBG = result;
        if (SHOW_DEBUG_LOGS && window.DBG_FW) if (globalThis.__B44_LOGS) console.log('[FW] zones ->', result);
      }
      return result;
    }

    const W = stableDimensions.width || 0;
    const L = stableDimensions.length || 0;
    if (!(W > 0 && L > 0)) {
      const result = { status: 'invalid-geom', reason: 'room dims' };
      if (typeof window !== 'undefined') {
        window.FW_DBG = result;
        if (SHOW_DEBUG_LOGS && window.DBG_FW) if (globalThis.__B44_LOGS) console.log('[FW] zones ->', result);
      }
      return result;
    }

    const sl = placedSpeakers?.find((s) => safeCanon(s?.role) === 'SL');
    const sr = placedSpeakers?.find((s) => safeCanon(s?.role) === 'SR');

    if (!sl || !sr) {
      const result = { status: 'no-sides' };
      if (typeof window !== 'undefined') {
        window.FW_DBG = result;
        if (SHOW_DEBUG_LOGS && window.DBG_FW) if (globalThis.__B44_LOGS) console.log('[FW] zones ->', result);
      }
      return result;
    }

    let result;
    try {
      const getModelDims = (modelId) => getSpeakerModelMeta(modelId) || {};

      result = computeFrontWideZonesStrict({
        mlpPoint: mlpAnchorEffective,
        dimensions: stableDimensions,
        placedSpeakers,
        getModelDims,
        rp22BoundDeg: 10
      }) || { status: 'invalid-geom', reason: 'empty result' };
    } catch (e) {
      result = { status: 'invalid-geom', reason: 'exception', error: e.message };
      if (typeof window !== 'undefined' && window.DBG_FW && SHOW_DEBUG_LOGS) {
        if (globalThis.__B44_LOGS) console.warn('[FW zones] compute failed', e);
      }
    }

    if (typeof window !== 'undefined') {
      window.FW_DBG = result;
      if (SHOW_DEBUG_LOGS && window.DBG_FW) {
        if (globalThis.__B44_LOGS) console.log('[FW] zones ->', result);
        if (result.status === 'ok') {
          if (globalThis.__B44_LOGS) console.log('[FW] L =', result.left, 'R =', result.right);
        }
      }
    }

    return result;
  }, [
    enableFrontWides,
    mlpAnchorEffective,
    stableDimensions,
    placedSpeakers
  ]);

  // ✅ analysisResult uses internal overlay calculation (no props needed)
  const analysisResult = useRP22AnalysisEngine({
    placedSpeakers: engineSpeakers,
    visiblePlanSpeakers: analysisSpeakers,
    seatingPositions: seats,
    primarySeatingPosition: primarySeatingPosition,
    dimensions: stableDimensions, // Use stableDimensions (derived from appState.roomDims)
    mlpBasis: _mlpBasis,
    sevenBedLayoutType: appState?.sevenBedLayoutType,
    extraSurroundCount: appState?.extraSurroundCount,
    p15ConstructionLevel: appState?.p15ConstructionLevel,
    mlpPointOverride: mlpAnchorEffective, // Use same MLP as FW overlay (green dot)
    seatSplMetrics: allSeatSplMetrics,
    overheadState: {
      globalModel: _overheadGlobalModel,
      frontOverride: _overheadFrontOverride,
      midOverride: _overheadMidOverride,
      rearOverride: _overheadRearOverride,
      useFrontGlobal: _useFrontGlobal,
      useMidGlobal: _useMidGlobal,
      useRearGlobal: _useRearGlobal,
      aimFrontWidesAtMLP: appState?.aimFrontWidesAtMLP,
      aimSideSurroundsAtMLP: appState?.aimSideSurroundsAtMLP,
      aimRearSurroundsAtMLP: appState?.aimRearSurroundsAtMLP,
      speakerSystem: appState?.speakerSystem,
      sevenBedLayoutType: appState?.sevenBedLayoutType,
      getSpeakerVisibility: appState?.getSpeakerVisibility,
    },
    aimState: {
      aimFrontWidesAtMLP: appState?.aimFrontWidesAtMLP,
      aimSideSurroundsAtMLP: appState?.aimSideSurroundsAtMLP,
      aimRearSurroundsAtMLP: appState?.aimRearSurroundsAtMLP,
      speakerSystem: appState?.speakerSystem,
      sevenBedLayoutType: appState?.sevenBedLayoutType,
      getSpeakerVisibility: appState?.getSpeakerVisibility,
    }
  });

  // REMOVED: Duplicate seat metrics writer (RoomVisualisation is now the sole writer)

  const frontSubsForRendering = React.useMemo(() => {
    const subs = appState?.subwoofers || [];
    return subs.filter(s => s?.group === 'front');
  }, [appState?.subwoofers]);

  const rearSubsForRendering = React.useMemo(() => {
    const subs = appState?.subwoofers || [];
    return subs.filter(s => s?.group === 'rear');
  }, [appState?.subwoofers]);

  // NEW: Calculate live room price total
  const priceData = usePriceCalculation({
    placedSpeakers,
    frontSubsCfg: _frontSubsCfg,
    rearSubsCfg: _rearSubsCfg,
    difficultyMultiplier
  });

  // Publish price data to window for sidebar consumption
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__ROOM_DESIGNER_PRICE__ = {
        showPrices,
        baseTotal: priceData.baseTotal,
        finalTotal: priceData.finalTotal,
        difficultyMultiplier
      };
    }
  }, [showPrices, priceData.baseTotal, priceData.finalTotal, difficultyMultiplier]);

  // REMOVED: Duplicate frontWideZones declaration (moved earlier to avoid TDZ)





  const initWithDefaultsAndRules = React.useMemo(
    () => typeof store?.initWithDefaultsAndRules === "function" ? store.initWithDefaultsAndRules : () => {},
    [store?.initWithDefaultsAndRules]
  );
  const setSpeakers = React.useMemo(
    () => typeof store?.setSpeakers === "function" ? store?.setSpeakers : () => {},
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
    const has51BedRoles = ['FL', 'FC', 'FR', 'SL', 'SR'].some((role) =>
    existingSpeakers.some((s) => safeCanon(s.role) === role)
    );

    // Only hydrate from handoff if no 5.1 bed speakers exist yet in the current design
    if (!has51BedRoles && setSpeakers) {
      if (globalThis.__B44_LOGS) debug('[Speakers] Hydrating speakers from SPL handoff data (speakerNodes).');
      const hydratedSpeakers = _speakerNodes.map((node) => ({
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
      if (globalThis.__B44_LOGS) debug('[Speakers] Skipping SPL handoff hydration: 5.1 speakers already present.');
    }
  }, [_speakerNodes, placedSpeakers, setSpeakers, setDolbyPreset]); // Dependencies: _speakerNodes, placedSpeakers (to check existence), setSpeakers, setDolbyPreset


  // NEW: Guarded setters for each tab (tab names align with UI below)
  const setScreenGuarded = useGuardedSetter(_setScreen, 'screen');
  const setSeatingPositionsGuarded = useGuardedSetter(appState?.setSeatingPositions, 'seating');
  const setSeatingRowsGuarded = useGuardedSetter(appState?.setSeatingRows, 'seating');
  const setSeatsPerRowGuarded = useGuardedSetter(appState?.setSeatsPerRow, 'seating');
  const setSeatsPerRowByRowGuarded = useGuardedSetter(appState?.setSeatsPerRowByRow, 'seating');
  
  // Epoch-aware seating setters (bump epoch on user change)
  // Guarded setters MUST be created at top-level (hooks rule)
  const seatSpacingSetterGuarded = useGuardedSetter(appState?.setSeatSpacing, 'seating');
  const rowSpacingSetterGuarded = useGuardedSetter(_setRowSpacingM, 'seating');
  const seatingBlockOffsetSetterGuarded = useGuardedSetter(appState?.setSeatingBlockOffset, 'seating');

  // Wrapped callbacks that also bump the seating epoch
  const setSeatSpacingGuarded = React.useCallback((next) => {
    setSeatingConfigEpoch((n) => n + 1);
    seatSpacingSetterGuarded?.(next);
  }, [seatSpacingSetterGuarded]);

  const setRowSpacingGuarded = React.useCallback((next) => {
    setSeatingConfigEpoch((n) => n + 1);
    rowSpacingSetterGuarded?.(next);
  }, [rowSpacingSetterGuarded]);

  // IMPORTANT: do not depend on the guarded setter identity (it can change)
  // and always fall back to the raw setter if needed.
  const setSeatingBlockOffsetGuarded = React.useCallback((next) => {
    setSeatingConfigEpoch((n) => n + 1);

    // Prefer guarded setter, but never let a missing/changed ref block updates
    if (typeof seatingBlockOffsetSetterGuarded === 'function') {
      seatingBlockOffsetSetterGuarded(next);
      return;
    }

    if (typeof appState?.setSeatingBlockOffset === 'function') {
      appState.setSeatingBlockOffset(next);
    }
  }, [appState]);

  const setMlpBasisGuarded = useGuardedSetter(appState?.setMlpBasis, 'seating');
  const setRoomElementsGuarded = useGuardedSetter((next) => {
    const widthM = Number(appState?.roomDims?.widthM ?? appState?.dimensions?.widthM);
    const lengthM = Number(appState?.roomDims?.lengthM ?? appState?.dimensions?.lengthM);

    const safe = Array.isArray(next) ? next : [];

    const normalised = safe.map((e, idx) => {
      const wall = String(e?.wall || 'front');

      const L = Number.isFinite(Number(e?.length_m)) ? Number(e.length_m) : 0.9;
      const T = Number.isFinite(Number(e?.thickness_m)) ? Number(e.thickness_m) : 0.05;

      // pos_m is ALWAYS "along the wall":
      // front/rear => X distance from left
      // left/right => Y distance from front
      let p = Number(e?.pos_m);
      if (!Number.isFinite(p)) p = 0;

      // clamp so it never jumps out of range on restore
      if (Number.isFinite(widthM) && Number.isFinite(lengthM)) {
        if (wall === 'front' || wall === 'rear') {
          const maxP = Math.max(0, widthM - L);
          p = Math.min(Math.max(0, p), maxP);
        } else if (wall === 'left' || wall === 'right') {
          const maxP = Math.max(0, lengthM - L);
          p = Math.min(Math.max(0, p), maxP);
        }
      }

      return {
        ...e,
        // keep stable identity
        _id: e?._id ?? idx + 1,
        // keep types consistent across page changes
        wall,
        length_m: L,
        thickness_m: T,
        pos_m: p,
        // preserve projector-specific fields
        wall_offset_m: Number.isFinite(Number(e?.wall_offset_m)) ? Number(e.wall_offset_m) : undefined,
        height_m: Number.isFinite(Number(e?.height_m)) ? Number(e.height_m) : undefined,
        __label: String(e?.label || e?.__label || `Element ${idx + 1}`),
      };
    });

    appState?.setRoomElements(normalised);
  }, 'elements');

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
      freeMoveLcr: freeMoveLcr,
      setFreeMoveLcr: setFreeMoveLcr
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
      const updatedSpeakers = placedSpeakers.map((speaker) => {
        const constraint = constraints[speaker.role];
        if (!constraint) return speaker;

        const currentX = speaker.position.x;
        const { minX, maxX } = constraint.clamp;

        // If current position is outside the new valid corridor
        if (currentX < minX || currentX > maxX) {
          needsUpdate = true;
          const newX = Math.max(minX, Math.min(maxX, currentX));
          if (globalThis.__B44_LOGS) debug(`[Resize Re-clamp] Clamping ${speaker.role} X from ${currentX} to ${newX} (range: [${minX}, ${maxX}]).`);
          return { ...speaker, position: { ...speaker.position, x: newX } };
        }

        return speaker;
      });

      if (needsUpdate) {
        if (globalThis.__B44_LOGS) debug('[Resize Re-clamp] Adjusting LCR positions due to model change or constraint violation.');
        setSpeakers((prev) => mergePreserveOverheads(prev, updatedSpeakers, dolbyPreset));
      }
    } catch (error) {
      if (typeof console !== 'undefined' && typeof console.warn === 'function') {
        if (globalThis.__B44_LOGS) console.warn('[Resize Re-clamp] Error during re-clamping:', error);
      }
    }
  }, [placedSpeakers, analysisResult?.zones, stableDimensions, stableScreen, setSpeakers, loadState.phase]);

  // NEW: Rescue speakers that end up outside room bounds after resize
  useEffect(() => {
    // Skip if dragging
    if (isDraggingRef.current) return;

    // Skip if frozen
    if (_isFrozen && _isFrozen('speakers')) return;

    const W = stableDimensions.width;
    const L = stableDimensions.length;

    // Skip if no valid dimensions
    if (!(W > 0 && L > 0)) return;

    // Only run if dimensions actually changed
    const prev = prevRoomDimsRef.current;
    if (prev && prev.width === W && prev.length === L) return;

    // Update previous dimensions
    prevRoomDimsRef.current = { width: W, length: L };

    // If this is the first run, don't rescue (nothing to rescue from)
    if (!prev) return;

    // Check if any speakers are out of bounds
    const INSET = 0.01; // 1cm safety margin
    let anyOutOfBounds = false;

    const rescued = placedSpeakers.map((spk) => {
      if (!spk.position || !Number.isFinite(spk.position.x) || !Number.isFinite(spk.position.y)) {
        return spk;
      }

      const x = spk.position.x;
      const y = spk.position.y;

      // Test if out of bounds (strict 0...W and 0...L test)
      const outOfBounds = x < 0 || x > W || y < 0 || y > L;

      if (!outOfBounds) return spk;

      // Clamp to safe inset
      anyOutOfBounds = true;
      const clampedX = Math.max(INSET, Math.min(W - INSET, x));
      const clampedY = Math.max(INSET, Math.min(L - INSET, y));

      if (globalThis.__B44_LOGS) debug(`[Rescue] ${spk.role} was outside bounds (${x.toFixed(3)}, ${y.toFixed(3)}), clamped to (${clampedX.toFixed(3)}, ${clampedY.toFixed(3)})`);

      return {
        ...spk,
        position: { ...spk.position, x: clampedX, y: clampedY }
      };
    });

    // Only update if at least one speaker was rescued
    if (anyOutOfBounds) {
      setSpeakers((prev) => preserveSurroundModels(prev, rescued, appState));
    }
  }, [stableDimensions.width, stableDimensions.length, placedSpeakers, _isFrozen, setSpeakers]);

  // Effect to lock LCR to front wall + z=1.2
  useEffect(() => {
    if (_isFrozen && _isFrozen('speakers')) return;
    if (!placedSpeakers || !placedSpeakers.length) return;
    if (!mlpAnchorEffective) return;

    const gapM = 0.01; // 1cm air gap from wall
    let needsUpdate = false;

    const updated = placedSpeakers.map((spk) => {
      const role = safeCanon(spk.role);
      if (!['FL', 'FC', 'FR'].includes(role)) return spk;

      // Only lock if model is actually selected
      const m = spk.model;
      const ms = String(m ?? "").trim().toLowerCase();
      if (!ms || ms === "off" || ms === "none") return spk;

      // Get speaker dimensions
      const meta = getSpeakerModelMeta(spk.model) || {};
      const depthM = Number(meta.depthM) || 0.082;
      const widthM = Number(meta.widthM) || 0.27;

      // Compute target yaw angle if aiming at MLP (same logic as aiming effect)
      let targetYawDeg = 0;
      if (lcrAimMode === "angled" && spk.position) {
        const dx = mlpAnchorEffective.x - spk.position.x;
        const dy = mlpAnchorEffective.y - spk.position.y;
        const yawRad = Math.atan2(dx, dy);
        targetYawDeg = Math.abs(yawRad * 180 / Math.PI);
      }

      // Calculate wall-hugged Y using stroke-aware half extent with TARGET yaw
      const halfExtentM = yHalfExtentM(depthM, widthM, targetYawDeg);
      const wallY = gapM + halfExtentM;

      const currentY = spk.position?.y ?? 0;
      const currentZ = spk.position?.z ?? 1.2;

      // Only update if meaningful change
      if (Math.abs(currentY - wallY) > 0.001 || Math.abs(currentZ - 1.2) > 0.001) {
        needsUpdate = true;
        return {
          ...spk,
          position: {
            ...spk.position,
            y: wallY,
            z: 1.2
          }
        };
      }

      return spk;
    });

    if (needsUpdate) {
      setSpeakers((prev) => mergePreserveOverheads(prev, updated, dolbyPreset));
    }
  }, [placedSpeakers, _isFrozen, setSpeakers, lcrAimMode, mlpAnchorEffective]);

  // NEW: Effect to lock FC speaker to room centerline
  useEffect(() => {
    if (!placedSpeakers.length || _isFrozen && _isFrozen('speakers') || !stableDimensions.width) return;

    const fcSpeaker = placedSpeakers.find((s) => safeCanon(s.role) === 'FC');
    const centerX = stableDimensions.width / 2;

    if (fcSpeaker && Math.abs(fcSpeaker.position.x - centerX) > 0.001) {// 1mm tolerance
      if (globalThis.__B44_LOGS) debug('[Speakers] Locking FC speaker to room centerline.');
      setSpeakers((prevSpeakers) => prevSpeakers.map((s) => {
        if (safeCanon(s.role) === 'FC') {
          return { ...s, position: { ...(s.position || {}), x: centerX } };
        }
        return s;
      }));
    }
  }, [placedSpeakers, _isFrozen, stableDimensions.width, setSpeakers]);

  // NEW: Apply "Aim to MLP" rotation to LCR and Surrounds
  useEffect(() => {
    if (isDraggingRef.current) return;
    if (!placedSpeakers.length || _isFrozen && _isFrozen('speakers') || !mlpAnchorEffective) return;

    const aimLCR = lcrAimMode === "angled";
    const aimFW = appState?.aimFrontWidesAtMLP || false;
    const aimSide = appState?.aimSideSurroundsAtMLP || false;
    const aimRear = appState?.aimRearSurroundsAtMLP || false;

    // Helper: compute yaw from speaker to MLP (same as L/R uses)
    const yawToMLP = (spkPos, mlpPos) => {
      const dx = mlpPos.x - spkPos.x;
      const dy = mlpPos.y - spkPos.y;
      const yawRad = Math.atan2(dx, dy);
      return yawRad * 180 / Math.PI;
    };

    // Helper: check if rotated speaker fits in room with 0.01m buffer
    const canRotateSafely = (pos, yawDeg, model) => {
      const meta = getSpeakerModelMeta(model);
      const w = meta?.widthM || 0.27;
      const d = meta?.depthM || 0.082;

      const yawRad = yawDeg * Math.PI / 180;
      const cosY = Math.cos(yawRad);
      const sinY = Math.sin(yawRad);

      // Rotated bounding box half-extents
      const hw = w / 2;
      const hd = d / 2;
      const corners = [
      { x: hw * cosY - hd * sinY, y: hw * sinY + hd * cosY },
      { x: -hw * cosY - hd * sinY, y: -hw * sinY + hd * cosY },
      { x: hw * cosY + hd * sinY, y: hw * sinY - hd * cosY },
      { x: -hw * cosY + hd * sinY, y: -hw * sinY - hd * cosY }];


      const buffer = 0.01;
      for (const c of corners) {
        const wx = pos.x + c.x;
        const wy = pos.y + c.y;
        if (wx < buffer || wx > stableDimensions.width - buffer ||
        wy < buffer || wy > stableDimensions.length - buffer) {
          return false;
        }
      }
      return true;
    };

    const updated = placedSpeakers.map((spk) => {
      const canon = safeCanon(spk.role);
      if (!spk.position) return spk;

      // Determine if this speaker should aim
      let shouldAim = false;
      if (canon === 'FL' || canon === 'FR') shouldAim = aimLCR;else
      if (canon === 'LW' || canon === 'RW') shouldAim = aimFW;else
      if (canon === 'SL' || canon === 'SR') shouldAim = aimSide;else
      if (canon === 'SBL' || canon === 'SBR') shouldAim = aimRear;

      if (!shouldAim) {
        // IMPORTANT:
        // LCR reset is governed ONLY by lcrAimMode.
        // Other groups must not force a global reset cycle.
        if (canon === 'FL' || canon === 'FR') {
          if (lcrAimMode === "flat") {
            const currentYaw = spk.rotation?.y || 0;
            if (Math.abs(currentYaw) > 0.001) {
              return { ...spk, rotation: { ...(spk.rotation || {}), y: 0 } };
            }
          }
          return spk;
        }

        // Non-LCR groups reset only under their own toggles
        if (
          canon === 'LW' || canon === 'RW' ||
          canon === 'SL' || canon === 'SR' ||
          canon === 'SBL' || canon === 'SBR'
        ) {
          const currentYaw = spk.rotation?.y || 0;
          if (Math.abs(currentYaw) > 0.001) {
            return { ...spk, rotation: { ...(spk.rotation || {}), y: 0 } };
          }
        }

        return spk;
      }

      // Calculate target yaw to MLP
      const targetYaw = yawToMLP(spk.position, mlpAnchorEffective);

      // Check if rotation is safe
      const safe = canRotateSafely(spk.position, targetYaw, spk.model);
      const finalYaw = safe ? targetYaw : spk.rotation?.y || 0;

      // Only update if changed
      const currentYaw = spk.rotation?.y || 0;
      if (Math.abs(finalYaw - currentYaw) < 0.001) return spk;

      return { ...spk, rotation: { ...(spk.rotation || {}), y: finalYaw } };
    });

    // Only commit if something actually changed
    const changed = updated.some((spk, i) => {
      const oldYaw = placedSpeakers[i]?.rotation?.y || 0;
      const newYaw = spk?.rotation?.y || 0;
      return Math.abs(oldYaw - newYaw) > 0.001;
    });

    if (changed) {
      setSpeakers((prev) => preserveSurroundModels(prev, updated, appState));
    }
  }, [
  placedSpeakers,
  mlpAnchorEffective,
  lcrAimMode,
  appState?.aimFrontWidesAtMLP,
  appState?.aimSideSurroundsAtMLP,
  appState?.aimRearSurroundsAtMLP,
  stableDimensions.width,
  stableDimensions.length,
  _isFrozen,
  setSpeakers]
  );


  // Effect to swap between Rear Surrounds and Front Wides for 7.x layouts
  useEffect(() => {
    if (isDraggingRef.current) return;
    
    // If we've just loaded a real project, don't overwrite its speaker layout
    if (loadState?.phase === "loaded") {
      return;
    }

    if (!dolbyPreset || _isFrozen && _isFrozen('speakers')) {
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
    const hasWides = currentSpeakers.some((s) => s.role === 'LW' || s.role === 'RW');
    const hasRears = currentSpeakers.some((s) => s.role === 'SBL' || s.role === 'SBR');

    const earZ = 1.1; // Standard ear height for bed speakers

    // CRITICAL: Model preservation - use globalSurroundModel as primary source
    const globalSurroundModel = appState?.globalSurroundModel;
    const hint = typeof window !== "undefined" && window.__SURROUND_MODEL_HINT_ || null;
    const byRole = new Map(currentSpeakers.map((s) => [s.role, s]));

    if (_sevenBedLayoutType === 'wides' && !hasWides && hasRears) {
      if (globalThis.__B44_LOGS) debug('[Speakers] Switching from Rear Surrounds (SBL/SBR) to Front Wides (LW/RW).');

      // Use globalSurroundModel as primary fallback for new wides
      const lw = cloneRoleWithModel(byRole, 'SBL', 'LW', globalSurroundModel || hint);
      lw.position = { x: stableDimensions.width * 0.15, y: stableDimensions.length * 0.4, z: earZ };

      const rw = cloneRoleWithModel(byRole, 'SBR', 'RW', globalSurroundModel || hint);
      rw.position = { x: stableDimensions.width * 0.85, y: stableDimensions.length * 0.4, z: earZ };

      const nextList = currentSpeakers.
      filter((s) => s.role !== 'SBL' && s.role !== 'SBR').
      concat([lw, rw]);

      if (globalThis.__B44_LOGS) safeGroup('[Speakers] swap/reseed merge check (wides)', () => {
        if (globalThis.__B44_LOGS) safeTable(nextList.map((s) => ({ role: s.role, model: s.model ?? '(none)' })));
      });
      if (globalThis.__B44_LOGS) console.log('[RD] 7.x swap -> nextList roles', nextList.map((s) => safeCanon(s.role)));
      setSpeakers((prev) => {
        let merged = mergePreserveOverheads(prev, nextList, dolbyPreset);

        // CRITICAL: Ensure wides inherit globalSurroundModel if they have no model
        const globalSurroundModel = appState?.globalSurroundModel;
        if (globalSurroundModel) {
          const modelStr = String(globalSurroundModel).trim().toLowerCase();
          if (modelStr && modelStr !== 'off' && modelStr !== 'none') {
            merged = merged.map((spk) => {
              const canon = safeCanon(spk.role);
              if (canon !== 'LW' && canon !== 'RW') return spk;

              const currentModel = String(spk.model || '').trim().toLowerCase();
              if (!currentModel || currentModel === 'off' || currentModel === 'none') {
                return { ...spk, model: globalSurroundModel };
              }
              return spk;
            });
          }
        }

        if (speakersEqual(prev, merged)) return prev;
        return merged;
      });

    } else if (_sevenBedLayoutType === 'rears' && hasWides && !hasRears) {
      if (globalThis.__B44_LOGS) debug('[Speakers] Switching from Front Wides (LW/RW) to Rear Surrounds (SBL/SBR).');

      // Use globalSurroundModel as primary fallback for new rears
      const sbl = cloneRoleWithModel(byRole, 'LW', 'SBL', globalSurroundModel || hint);
      sbl.position = { x: stableDimensions.width * 0.25, y: stableDimensions.length - 0.1, z: earZ };

      const sbr = cloneRoleWithModel(byRole, 'RW', 'SBR', globalSurroundModel || hint);
      sbr.position = { x: stableDimensions.width * 0.75, y: stableDimensions.length - 0.1, z: earZ };

      const nextList = currentSpeakers.
      filter((s) => s.role !== 'LW' && s.role !== 'RW').
      concat([sbl, sbr]);

      if (globalThis.__B44_LOGS) safeGroup('[Speakers] swap/reseed merge check (rears)', () => {
        if (globalThis.__B44_LOGS) safeTable(nextList.map((s) => ({ role: s.role, model: s.model ?? '(none)' })));
      });
      if (globalThis.__B44_LOGS) console.log('[RD] 7.x swap -> nextList roles', nextList.map((s) => safeCanon(s.role)));
      setSpeakers((prev) => {
        let merged = mergePreserveOverheads(prev, nextList, dolbyPreset);

        // CRITICAL: Ensure rears inherit globalSurroundModel if they have no model
        const globalSurroundModel = appState?.globalSurroundModel;
        if (globalSurroundModel) {
          const modelStr = String(globalSurroundModel).trim().toLowerCase();
          if (modelStr && modelStr !== 'off' && modelStr !== 'none') {
            merged = merged.map((spk) => {
              const canon = safeCanon(spk.role);
              if (canon !== 'SBL' && canon !== 'SBR') return spk;

              const currentModel = String(spk.model || '').trim().toLowerCase();
              if (!currentModel || currentModel === 'off' || currentModel === 'none') {
                return { ...spk, model: globalSurroundModel };
              }
              return spk;
            });
          }
        }

        if (speakersEqual(prev, merged)) return prev;
        return merged;
      });
    }
  }, [_sevenBedLayoutType, dolbyPreset, placedSpeakers, setSpeakers, stableDimensions.width, stableDimensions.length, _isFrozen]);

  // Speaker reconciliation extracted to useSpeakerReconciliation hook
  useSpeakerReconciliation({
    appState, dolbyPreset, stableDimensions, setSpeakers, _isFrozen, placedSpeakers,
    _sevenBedLayoutType, lastPresetRef, _overheadGlobalModel, _overheadFrontOverride,
    _overheadMidOverride, _overheadRearOverride, _useFrontGlobal, _useMidGlobal, _useRearGlobal,
    loadState, resolvedProjectId, projectIdState, didUserRequestResetRef,
  });

  // Ensure Atmos overheads exist as soon as an Atmos preset AND a
  // global overhead model are selected – WITHOUT relying on surrounds.
  useEffect(() => {
    if (!dolbyPreset || !_overheadGlobalModel) return;
    if (_isFrozen && _isFrozen("speakers")) return;

    // STRICT GUARD: Do not auto-seed overheads for loaded projects with explicit empty state
    const hasProjectId = resolvedProjectId || projectIdState;
    if (loadState?.phase === "loaded" && hasProjectId) {
      // Only seed overheads if the user explicitly changed the overhead model
      // (do not seed just because a loaded project has no overheads saved)
      return;
    }

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
      useRearGlobal: _useRearGlobal
    })
    );
  }, [
  dolbyPreset,
  placedSpeakers,
  _overheadGlobalModel,
  _overheadFrontOverride,
  _overheadMidOverride,
  _overheadRearOverride,
  _useFrontGlobal,
  _useMidGlobal,
  _useRearGlobal,
  setSpeakers,
  _isFrozen]
  );

  // Build or rebuild seating positions whenever seating config changes
  useEffect(() => {
    // CRITICAL: Wait for autosave hydration
    if (!appState?.isHydrated) return;

    // STRICT GUARD: If we've just loaded a real project, NEVER auto-rebuild seats unless:
    // 1. User explicitly changed seating controls (epoch != loaded epoch), OR
    // 2. User explicitly triggered reset (didUserRequestResetRef.current), OR
    // 3. Room reset epoch changed (appState.roomResetEpoch > 0)
    // This prevents empty saved seats from being auto-filled.
    const currentSeats = Array.isArray(appState?.seatingPositions) ? appState.seatingPositions : [];
    const hasProjectId = resolvedProjectId || projectIdState;

    // If a saved project is loaded, we normally avoid auto-rebuilds.
    // BUT we MUST allow rebuilds when the user has changed seating controls since load,
    // or when Reset was requested, or when the room reset epoch changes.
    // Also: if there are *no seats*, allow rebuild so seats can't vanish forever.
    const isLoadedProject = loadState?.phase === "loaded" && !!hasProjectId;
    const userHasChangedSeatingSinceLoad =
      seatingConfigEpoch !== (seatingLoadedEpochRef?.current ?? 0);

    if (
      isLoadedProject &&
      currentSeats.length > 0 &&
      !userHasChangedSeatingSinceLoad &&
      !didUserRequestResetRef.current &&
      !(appState?.roomResetEpoch > 0)
    ) {
      return;
    }

    const setSeats = appState?.setSeatingPositions;
    if (typeof setSeats !== 'function') return;

    // 1) Decide how many seats in each row
    const list = Array.isArray(_seatsPerRowByRow) && _seatsPerRowByRow.length ?
    _seatsPerRowByRow :
    Array.from(
      { length: Math.max(1, Number(_seatingRows) || 1) },
      () => Math.max(1, Number(_seatsPerRow) || 1)
    );

    // 2) Row centre Y positions
    // IMPORTANT: Do NOT rebuild seats using fallback row centres.
    // That causes a temporary "drift" where seats are from fallback but MLP is already from the real computed mlpY.
    // Instead: if rowCentersM isn't ready, try to generate it once from the current MLP, store it, then exit.
    // The effect will re-run immediately with real rowCentersM and seats will match the MLP.

    let centers = Array.isArray(appState?.rowCentersM) ? appState.rowCentersM.slice(0, list.length) : [];

    // If rowCentersM is missing/too short, attempt to generate it from current mlpY_m
    if (centers.length < list.length) {
      const rowsNeeded = list.length;

      const mlpY = appState?.mlpY_m;
      const rowSpacing = Number(_rowSpacingM) || 1.8;
      const mlpReference = _mlpBasis; // 'front' | 'back' | 'all'

      if (Number.isFinite(mlpY) && typeof buildRowCenters === 'function' && typeof appState?.setRowCentersM === 'function') {
        let generated = [];

        try {
          generated = buildRowCenters(mlpY, rowsNeeded, rowSpacing, mlpReference) || [];
        } catch (e) {
          generated = [];
        }

        // Clamp to room bounds, mirroring the MLP/rows effect
        const len = Number(stableDimensions?.length) || Number(appState?.roomDims?.lengthM) || 6.0;
        const MIN_Y = 0.40;
        const MAX_Y = len - 0.40;
        const clampY = (y) => Math.max(MIN_Y, Math.min(MAX_Y, y));

        if (Array.isArray(generated) && generated.length === rowsNeeded) {
          const clamped = generated.map((y) => clampY(Number(y)));
          appState.setRowCentersM(clamped);
        }

        // Exit now — seats will rebuild on the next pass with real rowCentersM
        return;
      }

      // If we cannot generate centres yet, do NOT rebuild seats.
      // This prevents the "fallback seats" pass that creates drift.
      return;
    }

    // 3) Basic geometry
    const roomWidth = Number(stableDimensions?.width) || 4.5;
    const centerX = roomWidth / 2;
    const spacingX = Number(_seatSpacing) || 0.8;

    // 4) Build all seats
    const seats = [];

    list.forEach((rawCount, rowIndex) => {
      const count = Math.max(1, Number(rawCount) || 1);
      const y = Number(centers[rowIndex]) || fallbackStartY + rowIndex * fallbackSpacing;

      const totalWidth = (count - 1) * spacingX;
      const startX = centerX - totalWidth / 2;

      for (let i = 0; i < count; i++) {
        seats.push({
          id: `seat-r${rowIndex + 1}-c${i + 1}`,
          x: startX + i * spacingX,
          y,
          z: 1.2,
          rowNumber: rowIndex + 1
        });
      }
    });

    // 5) Commit to app state
    setSeats(seats);

    if (globalThis.__B44_LOGS) console.log(
      '[RD] seating rebuilt: rows=',
      list.length,
      'seats=',
      seats.length,
      'list=',
      list
    );
  }, [
  appState?.isHydrated,
  appState?.setSeatingPositions,
  _seatsPerRowByRow,
  _seatingRows,
  _seatsPerRow,
  _seatSpacing,
  // REMOVED: _rowSpacingM (row Y positions come from rowCentersM now)
  appState?.rowCentersM,
  stableDimensions?.width,
  appState?.roomResetEpoch,
  loadState?.phase,
  seatingConfigEpoch]
  );

  // Manual seating generation - single source of truth
  const handleGenerateSeating = React.useCallback((overrides = {}) => {
    // If the seating tab is locked, do nothing
    if (_isFrozen && _isFrozen('seating')) return;

    // Bump epoch to mark user-driven change
    setSeatingConfigEpoch((n) => n + 1);

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
  setSeatSpacingGuarded]
  );

  // Normalise seat flags whenever seating or room size changes
  useEffect(() => {
    const { seatsWithFlags } = computeMLPAndPrimary(
      Array.isArray(_seatingPositions) ? _seatingPositions : [],
      _roomDims?.widthM || 0,
      _roomDims?.lengthM || 0,
      _mlpBasis
    );

    // Only update if isPrimary flags actually changed
    const prev = _seatingPositions || [];
    const sameLength = prev.length === seatsWithFlags.length;
    
    if (!sameLength) {
      (appState?.setSeatingPositions || (() => {}))(seatsWithFlags);
      return;
    }

    // Check if any seat's isPrimary changed (must match by seatId)
    const prevById = new Map(prev.map(s => [s.id, s]));
    const flagsChanged = seatsWithFlags.some(s => {
      const p = prevById.get(s.id);
      return p && (!!p.isPrimary !== !!s.isPrimary);
    });

    if (flagsChanged) {
      (appState?.setSeatingPositions || (() => {}))(seatsWithFlags);
    }
  }, [_seatingPositions, _roomDims?.widthM, _roomDims?.lengthM, _mlpBasis, appState?.setSeatingPositions]);

  const handleResetPositions = React.useCallback(() => {
    if (_isFrozen && _isFrozen('speakers')) return;
    
    // Close dialog
    setShowResetConfirm(false);
    
    // Call single reset action from AppStateProvider
    if (typeof appState?.resetRoomDesignerToDefaults === 'function') {
      appState.resetRoomDesignerToDefaults();
    }
    
    // Set reset flag so reconciliation effects run
    didUserRequestResetRef.current = true;
    
    // Clear flag after effects complete
    setTimeout(() => {
      didUserRequestResetRef.current = false;
    }, 100);
  }, [_isFrozen, appState]);

  const handleOptimiseAll = React.useCallback(() => {
    if (_isFrozen && _isFrozen('speakers')) return;
    try {
      const spks = Array.isArray(placedSpeakers) ? placedSpeakers : [];
      if (spks.length < 2) return;

      const bedRoles = new Set(["FWL", "FWR", "LW", "RW", "SL", "SR", "LS", "RS", "LRS", "RRS", "SBL", "SBR", "LR", "RR"]);
      const bedSpeakers = spks.
      filter((s) => bedRoles.has(String(s.role).toUpperCase())).
      map((s) => ({ id: String(s.id || s.role), role: String(s.role).toUpperCase(), position: { x: Number(s.position?.x) || 0, y: Number(s.position?.y) || 0 } }));

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
        steps: 250
      });

      const byId = new Map(eq.map((s) => [s.id, s]));
      const surRoles = new Set(["FWL", "FWR", "LW", "RW", "SL", "SR", "LS", "RS", "LRS", "RRS", "SBL", "SBR", "LR", "RR"]);
      const surrogate = spks.
      filter((s) => surRoles.has(String(s.role).toUpperCase())).
      map((s) => ({
        position: {
          x: byId.get(String(s.id || s.role))?.position?.x ?? s.position?.x ?? 0,
          y: byId.get(String(s.id || s.role))?.position?.y ?? s.position?.y ?? 0
        }
      }));

      const gaps = surrogate.length ? surrogate.length === 2 ?
      [backSweepGap2(mlpForOptimization, surrogate[0].position, surrogate[1].position)] :
      backSweepGaps(mlpForOptimization, surrogate.map((p) => ({ position: p.position }))) :
      [];

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

      const byIdAfter = new Map(eq.map((s) => [s.id, s]));
      const merged = spks.map((s) => {
        const k = String(s.id || s.role);
        const u = byIdAfter.get(k);
        if (!u) return s;
        return { ...s, position: { ...(s.position || {}), x: u.position.x, y: u.position.y } };
      });

      if (globalThis.__B44_LOGS) console.log('[RD] optimiseAll -> roles', merged.map((s) => safeCanon(s.role)));
      setSpeakers((prev) => mergePreserveOverheads(prev, merged, dolbyPreset));
    } catch (e) {
      if (globalThis.__B44_LOGS) console.error("[OptimiseAll] failed:", e);
    }
  }, [placedSpeakers, stableDimensions, _seatingPositions, _mlpBasis, _isFrozen, setSpeakers, mlpAnchorEffective]);

  // Manual Save Project function now just calls the one from useProjectLoader
  const handleSaveProject = React.useCallback(async () => {
    // If no active project, save locally instead
    if (!resolvedProjectId) {
      if (typeof appState?.saveWorkingCopyNow === 'function') {
        appState.saveWorkingCopyNow();
        // Simple toast feedback
        if (typeof window !== 'undefined' && window.alert) {
          console.log("Saved locally (no active project)");
        }
      }
      return;
    }

    // Otherwise, save to cloud project
    await triggerSaveProject();
  }, [triggerSaveProject, resolvedProjectId, appState]);

  // decide which overlay toggles are relevant for the current system configuration
  const overlayRelevance = React.useMemo(() => {
    const preset = String(dolbyPreset || "5.1");
    const parts = preset.split(".");
    const major = Number(parts[0] || 5) || 5; // 5, 7, 9...
    const heights = Number(parts[2] || 0) || 0; // 0, 2, 4, 6...
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
      OVERHEADS_6: heights === 6
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
    setUseRearGlobal: setUseRearGlobalFromState
  } = appState;

  // Subwoofer sync extracted to useSubwooferSync hook (inline until hook file created)
  useEffect(() => {
    const setSubwoofers = appState?.setSubwoofers;
    if (typeof setSubwoofers !== "function") return;
    const widthM = Number(appState?.roomDims?.widthM) || Number(stableDimensions?.width) || 4.5;
    const lengthM = Number(appState?.roomDims?.lengthM) || Number(stableDimensions?.length) || 6.0;
    const normQty = (q) => Math.max(0, Math.min(8, Number(q?.count ?? q?.qty ?? q) || 0));
    const normModel = (m) => String(m || "").trim();
    const frontModel = normModel(frontSubsCfg?.model);
    const rearModel = normModel(rearSubsCfg?.model);
    const frontQty = normQty(frontSubsCfg);
    const rearQty = normQty(rearSubsCfg);
    const hasExplicitFrontCfg = frontSubsCfg && (Object.prototype.hasOwnProperty.call(frontSubsCfg, "count") || Object.prototype.hasOwnProperty.call(frontSubsCfg, "qty") || Object.prototype.hasOwnProperty.call(frontSubsCfg, "model"));
    const hasExplicitRearCfg = rearSubsCfg && (Object.prototype.hasOwnProperty.call(rearSubsCfg, "count") || Object.prototype.hasOwnProperty.call(rearSubsCfg, "qty") || Object.prototype.hasOwnProperty.call(rearSubsCfg, "model"));
    const hasPlacedSubs = Array.isArray(appState?.subwoofers) && appState.subwoofers.length > 0;
    const cfgExplicitNone = (frontSubsCfg && Object.prototype.hasOwnProperty.call(frontSubsCfg, "model") && Object.prototype.hasOwnProperty.call(frontSubsCfg, "count") && !String(frontSubsCfg.model || "").trim() && Number(frontSubsCfg.count) === 0) && (rearSubsCfg && Object.prototype.hasOwnProperty.call(rearSubsCfg, "model") && Object.prototype.hasOwnProperty.call(rearSubsCfg, "count") && !String(rearSubsCfg.model || "").trim() && Number(rearSubsCfg.count) === 0);
    if ((!frontModel || frontQty === 0) && (!rearModel || rearQty === 0)) {
      if (hasPlacedSubs) return;
      if (!cfgExplicitNone) return;
      setSubwoofers((prev) => (Array.isArray(prev) && prev.length ? [] : prev));
      return;
    }
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const EPS = 0.01;
    const getDepthM = (model) => { try { const dims = getModelDimsM?.(model) || {}; const d = Number(dims?.depthM); return Number.isFinite(d) && d > 0 ? d : 0.30; } catch (_) { return 0.30; } };
    const wallPinnedY = (wall, model) => { const d = getDepthM(model); const halfD = d / 2; if (wall === 'front') return halfD + EPS; if (wall === 'rear') return Math.max(halfD + EPS, lengthM - halfD - EPS); return 0.30; };
    const makeDefaultXs = (qty) => { if (qty <= 0) return []; if (qty === 1) return [widthM * 0.5]; const margin = widthM * 0.15; const span = Math.max(0.01, widthM - margin * 2); return Array.from({ length: qty }, (_, i) => margin + span * (i / (qty - 1))); };
    const safePositionsArray = (arr) => (Array.isArray(arr) ? arr : []);
    const buildGroup = (group, qty, model, cfgPositions, existingSubs) => {
      if (!model || qty <= 0) return [];
      const defaultsX = makeDefaultXs(qty);
      const cfgPos = safePositionsArray(cfgPositions);
      const yPinned = wallPinnedY(group === 'front' ? 'front' : 'rear', model);
      const minX = EPS; const maxX = Math.max(EPS, widthM - EPS);
      return Array.from({ length: qty }, (_, i) => {
        const prev = existingSubs?.[i] || null;
        const xFromCfg = Number(cfgPos?.[i]?.x); const xFromPrev = Number(prev?.position?.x); const xFromDefault = Number(defaultsX?.[i]);
        const pickedX = Number.isFinite(xFromCfg) ? xFromCfg : (Number.isFinite(xFromPrev) ? xFromPrev : xFromDefault);
        const finalX = clamp(pickedX, minX, maxX);
        return { ...(prev ? { ...prev } : {}), id: `sub-${group}-${i + 1}`, role: group === 'front' ? `SUBF${i + 1}` : `SUBR${i + 1}`, group, model, position: { x: finalX, y: yPinned, z: Number.isFinite(prev?.position?.z) ? prev.position.z : 0 } };
      });
    };
    setSubwoofers((prevAll) => {
      const prevList = Array.isArray(prevAll) ? prevAll : [];
      const prevFront = prevList.filter(s => s?.group === 'front');
      const prevRear = prevList.filter(s => s?.group === 'rear');
      const nextFront = buildGroup('front', frontQty, frontModel, frontSubsCfg?.positions, prevFront);
      const nextRear = buildGroup('rear', rearQty, rearModel, rearSubsCfg?.positions, prevRear);
      const next = [...nextFront, ...nextRear];
      const sameLen = prevList.length === next.length;
      const same = sameLen && prevList.every((p, i) => { const n = next[i]; if (!p || !n) return false; const px = Number(p?.position?.x), py = Number(p?.position?.y); const nx = Number(n?.position?.x), ny = Number(n?.position?.y); const close = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 0.001; return String(p.id) === String(n.id) && String(p.group) === String(n.group) && String(p.model) === String(n.model) && close(px, nx) && close(py, ny); });
      return same ? prevAll : next;
    });
  }, [appState?.setSubwoofers, appState?.roomDims?.widthM, appState?.roomDims?.lengthM, stableDimensions?.width, stableDimensions?.length, frontSubsCfg?.model, frontSubsCfg?.count, frontSubsCfg?.positions, rearSubsCfg?.model, rearSubsCfg?.count, rearSubsCfg?.positions, getModelDimsM]);

  return (
    <>
      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Room Designer?</AlertDialogTitle>
            <AlertDialogDescription>
              This will reset room, seating, screen, speakers and subs back to defaults. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleResetPositions} className="bg-red-600 hover:bg-red-700">
              Reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex flex-col h-full bg-[#F8F8F7]" style={{ minHeight: 0 }}>
        <style>{`
          .brand-btn{
            background:#213428 !important;
            color:#fff !important;
            border-color:transparent !important;
          }
          .brand-btn:hover{ background:#3E4349 !important; }
          details[open] summary svg {
            transform: rotate(180deg) !important;
          }
        `}</style>

      <RoomDesignerHeader
        showResetConfirm={showResetConfirm}
        setShowResetConfirm={setShowResetConfirm}
        isFrozen={isFrozen}
        handleResetPositions={handleResetPositions}
        handleSaveProject={handleSaveProject}
        showLocalHint={showLocalHint}
        loadState={loadState}
        autosaveStatus={autosaveStatus}
        reloadProject={reloadProject}
        projectIdState={projectIdState}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
          viewEmphasis === "plan" ?
          "minmax(720px, 62vw) 1fr" :
          viewEmphasis === "controls" ?
          "minmax(480px, 35vw) 1fr" :
          "minmax(560px, 48vw) 1fr",
          gap: 16,
          overflow: "hidden",
          padding: 16,
          flex: "1 1 auto",
          minWidth: 0,
          minHeight: 0
        }}>

        <section
          className="relative bg-white border border-[#DCDBD6] rounded-2xl overflow-hidden" // Change from auto to hidden since we're managing scroll inside
          style={{
            minWidth: 0,
            minHeight: 0,
            height: "calc(100vh - 152px)" // Preserve height constraint
          }}>

          {/* Plan toolbar extracted to RoomDesignerPlanToolbar */}
          <RoomDesignerPlanToolbar
            allowExtraSurrounds={allowExtraSurrounds}
            extraSurroundCount={appState?.extraSurroundCount}
            dolbyPreset={dolbyPreset}
            frontSubsCfg={_frontSubsCfg}
            rearSubsCfg={_rearSubsCfg}
            viewEmphasis={viewEmphasis}
            setViewEmphasis={setViewEmphasis}
            overlayRelevance={overlayRelevance}
            overlays={_overlays}
            setOverlays={_setOverlays}
            enableFrontWides={_enableFrontWides}
            setEnableFrontWides={_setEnableFrontWides}
            freeMoveLcr={freeMoveLcr}
            setFreeMoveLcr={setFreeMoveLcr}
            zoomMode={zoomMode}
            setZoomMode={setZoomMode}
          />

          {/* Content wrapper below the toolbar; canvas gets pushed down naturally */}
          <div style={{ height: 'calc(100% - 36px)', overflow: 'auto' }}>
            <ErrorBoundary name="RoomVisualisation">
              <Suspense fallback={<div className="p-4">Loading 3D View...</div>}>
                {(() => {
                  if (globalThis.__B44_LOGS) console.log('[RD] passing placedSpeakers to RoomVisualisation', {
                    count: Array.isArray(placedSpeakers) ? placedSpeakers.length : 0,
                    roles: (placedSpeakers || []).map((s) => safeCanon(s.role)),
                    dolbyPreset
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
                  frontSubsCfg={frontSubsCfg}
                  rearSubsCfg={rearSubsCfg}
                  dimensions={stableDimensions}
                  seatingPositions={_seatingPositions}
                  screen={_screen}
                  onSetSpeakers={setSpeakers}
                  onSetSeatingPositions={appState?.setSeatingPositions}
                  onSetFrontSubs={appState?.setFrontSubsCfg}
                  onSetRearSubs={appState?.setRearSubsCfg}
                  onScreenPlaneYChange={(y) => _setScreen?.((prev) => ({ ...prev, screenPlaneY_m: y }))}
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
                  speakerPositionsView={speakerPositionsView}
                  showMlpRuler={showMlpRuler}
                  zoomMode={zoomMode}
                  onZoomModeChange={setZoomMode}
                  isDraggingRef={isDraggingRef}
                  extraSurroundCount={appState?.extraSurroundCount ?? 0}
                  freeMoveLcr={freeMoveLcr} />

              </Suspense>
            </ErrorBoundary>
          </div>

        </section>

        <aside className="relative z-30" style={{ minWidth: 0, minHeight: 0 }}>
          <div
            style={{
              height: "calc(100vh - 152px)",
              overflow: "auto",
              paddingRight: 8
            }}
            className="space-y-3">

              <CollapsiblePanel
              title="Room Dimensions"
              icon={<Ruler className="w-5 h-5" />}
              defaultOpen={true}>

                  {isFrozen('dimensions') &&
              <div className="mb-3 text-xs px-3 py-2 rounded border border-amber-300 bg-amber-50 text-amber-800">
                      This tab is frozen. Unlock to make changes.
                    </div>
              }
                  <Suspense fallback={<div>Loading...</div>}>
                      <RoomDimensions
                  width_m={_roomDims?.widthM}
                  length_m={_roomDims?.lengthM}
                  height_m={_roomDims?.heightM}
                  onChange={(partial) => {
                    if (!isFrozen('dimensions') && _setRoomDims) {
                      _setRoomDims((prev) => ({ ...prev, ...partial }));
                    }
                  }}
                  disabled={isFrozen('dimensions')} />

                  </Suspense>
              </CollapsiblePanel>

              <CollapsiblePanel
              title="Room Elements"
              icon={<Box className="w-5 h-5" />}
              defaultOpen={false}>

                  {isFrozen('elements') &&
              <div className="mb-3 text-xs px-3 py-2 rounded border border-amber-300 bg-amber-50 text-amber-800">
                      This tab is frozen. Unlock to make changes.
                    </div>
              }
                  <Suspense fallback={<div>Loading...</div>}>
                      <RoomElements 
                        elements={roomElements} 
                        onChange={setRoomElementsGuarded} 
                        disabled={isFrozen('elements')}
                        roomDims={appState?.roomDims}
                      />
                  </Suspense>
              </CollapsiblePanel>

              <CollapsiblePanel
              title="Screen Size"
              icon={<Monitor className="w-5 h-5" />}
              defaultOpen={false}>

                  {isFrozen('screen') &&
              <div className="mb-3 text-xs px-3 py-2 rounded border border-amber-300 bg-amber-50 text-amber-800">
                      This tab is frozen. Unlock to make changes.
                    </div>
              }
                  <Suspense fallback={<div>Loading...</div>}>
                      <ScreenConfiguration
                  dimensions={stableDimensions}
                  screen={_screen}
                  onScreenChange={setScreenGuarded}
                  seatingPositions={seatingPositions}
                  dolbyConfig={dolbyPreset}
                  disabled={isFrozen('screen')} />

                  </Suspense>
              </CollapsiblePanel>

              <CollapsiblePanel
              title="Seating Layout"
              icon={<Users className="w-5 h-5" />}
              defaultOpen={false}>

                  {isFrozen('seating') &&
              <div className="mb-3 text-xs px-3 py-2 rounded border border-amber-300 bg-amber-50 text-amber-800">
                      This tab is frozen. Unlock to make changes.
                    </div>
              }
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
                  showMlpRuler={showMlpRuler}
                  onShowMlpRulerChange={setShowMlpRuler} />

                  </Suspense>
              </CollapsiblePanel>

              <CollapsiblePanel
              title="Speakers"
              icon={<Speaker className="w-5 h-5" />}
              defaultOpen={false}>

                  {isFrozen('speakers') &&
              <div className="mb-3 text-xs px-3 py-2 rounded border border-amber-300 bg-amber-50 text-amber-800">
                      This tab is frozen. Unlock to make changes.
                    </div>
              }
                  
                  {/* Aim Loudspeaker - Nested Collapsible */}
                  <details className="px-4 pb-4 border-b border-gray-200">
                    <summary className="cursor-pointer text-sm font-medium text-gray-700 mb-3 list-none flex items-center justify-between">
                      <span className="text-[#625143]">Aim Loudspeaker</span>
                      <svg className="w-4 h-4 transition-transform" style={{ transform: 'rotate(0deg)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </summary>
                    <div className="space-y-2 mt-3">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="aim-lcr" className="text-sm">Left / Right</Label>
                        <Switch
                      id="aim-lcr"
                      checked={lcrAimMode === "angled"}
                      onCheckedChange={(checked) => setLcrAimMode(checked ? "angled" : "flat")}
                      disabled={isFrozen('speakers')} />

                      </div>
                      <div className="text-xs text-gray-500 pl-1 pt-1 text-right">
                        Front wall → screen: {(() => {
                          const planeM = appState?.screenFrontPlaneM;
                          return _isNum(planeM) ? `${Math.round(planeM * 100)} cm` : '—';
                        })()}
                      </div>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="aim-front-wides" className="text-sm">Front Wides</Label>
                        <Switch
                      id="aim-front-wides"
                      checked={appState?.aimFrontWidesAtMLP || false}
                      onCheckedChange={(checked) => appState?.setAimFrontWidesAtMLP(checked)}
                      disabled={isFrozen('speakers')} />
                      </div>
                      <div className="text-xs text-gray-500 pl-1 pt-1 text-right">In-room depth: {inRoomDepthsCm.frontWides !== null ? `${inRoomDepthsCm.frontWides} cm` : '—'}</div>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="aim-side-surrounds" className="text-sm">Side Surrounds</Label>
                        <Switch
                      id="aim-side-surrounds"
                      checked={appState?.aimSideSurroundsAtMLP || false}
                      onCheckedChange={(checked) => appState?.setAimSideSurroundsAtMLP(checked)}
                      disabled={isFrozen('speakers')} />
                      </div>
                      <div className="text-xs text-gray-500 pl-1 pt-1 text-right">In-room depth: {inRoomDepthsCm.sideSurrounds !== null ? `${inRoomDepthsCm.sideSurrounds} cm` : '—'}</div>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="aim-rear-surrounds" className="text-sm">Rear Surrounds</Label>
                        <Switch
                      id="aim-rear-surrounds"
                      checked={appState?.aimRearSurroundsAtMLP || false}
                      onCheckedChange={(checked) => appState?.setAimRearSurroundsAtMLP(checked)}
                      disabled={isFrozen('speakers')} />
                      </div>
                      <div className="text-xs text-gray-500 pl-1 pt-1 text-right">In-room depth: {inRoomDepthsCm.rearSurrounds !== null ? `${inRoomDepthsCm.rearSurrounds} cm` : '—'}</div>
                    </div>
                  </details>
                  
                  <Suspense fallback={<div>Loading...</div>}>
                      <SpeakerPlacement disabled={isFrozen('speakers')}
                dimensions={stableDimensions}
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

                globalSurroundModel={appState?.globalSurroundModel}
                setGlobalSurroundModel={appState?.setGlobalSurroundModel}

                allSeatSplMetrics={allSeatSplMetrics}
                frontWideOverlay={frontWideZones}
                allowExtraSurrounds={isNineBedLayout}
                extraSurroundCount={isNineBedLayout ? (appState?.extraSurroundCount ?? 0) : 0}
                onExtraSurroundCountChange={isNineBedLayout ? appState?.setExtraSurroundCount : undefined} />

                 </Suspense>
                  
                  <div className="px-4 py-3 border-t border-gray-200">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-medium text-gray-700">Speaker Positions</div>
                      <select
                    value={speakerPositionsView}
                    onChange={(e) => setSpeakerPositionsView(e.target.value)}
                    className="text-xs px-2 py-1 border border-gray-300 rounded">

                        <option value="off">Off</option>
                        <option value="plan">Plan</option>
                        <option value="table">Table</option>
                        <option value="both">Both</option>
                      </select>
                    </div>
                  </div>
                  
                  <SpeakerPositionsReadout
                placedSpeakers={placedSpeakers}
                seatingPositions={_seatingPositions}
                roomWidth={stableDimensions.width}
                roomLength={stableDimensions.length}
                screenFrontPlaneM={appState?.screenFrontPlaneM}
                view={speakerPositionsView} />

              </CollapsiblePanel>
              
              <CollapsiblePanel
              title="Bass Simulation"
              icon={<Waves className="w-5 h-5" />}
              defaultOpen={false}>

                  {isFrozen('bass') &&
              <div className="mb-3 text-xs px-3 py-2 rounded border border-amber-300 bg-amber-50 text-amber-800">
                      This tab is frozen. Unlock to make changes.
                    </div>
              }
                  <Suspense fallback={<div>Loading...</div>}>
                      <BassResponse disabled={isFrozen('bass')}
                frontSubsCfg={frontSubsCfg}
                setFrontSubsCfg={setFrontSubsCfg}
                rearSubsCfg={rearSubsCfg}
                setRearSubsCfg={setRearSubsCfg}
                subWarnings={subWarnings}
                frontSubsLive={frontSubsForRendering}
                rearSubsLive={rearSubsForRendering} />

                  </Suspense>
              </CollapsiblePanel>
              
              <CollapsiblePanel
              title="Compliance Report"
              icon={<FileText className="w-5 h-5" />}
              defaultOpen={false}>

                  {isFrozen('report') &&
              <div className="mb-3 text-xs px-3 py-2 rounded border border-amber-300 bg-amber-50 text-amber-800">
                      This tab is frozen. Unlock to make changes.
                    </div>
              }
                  <Suspense fallback={<div>Loading...</div>}>
                      <RP22CompliancePanel 
                        analysisResult={analysisResult} 
                        screen={_screen}
                        seatingPositions={_seatingPositions}
                        seatHudSnapshots={
                          (appState?.seatSnapshotBySeatId && Object.keys(appState.seatSnapshotBySeatId).length > 0)
                            ? appState.seatSnapshotBySeatId
                            : ((appState?.seatMetricsById && Object.keys(appState.seatMetricsById).length > 0)
                                ? appState.seatMetricsById
                                : {})
                        }
                        roomHudSnapshot={appState?.roomHudSnapshot || analysisResult?.roomHudSnapshot || null}
                        mlpSeatId={primarySeatingPosition?.id || "mlp"}
                        dolbyLayout={appState?.dolbyLayout}
                        frontSubsCount={appState?.frontSubsCfg?.count}
                        rearSubsCount={appState?.rearSubsCfg?.count}
                        p15ConstructionLevel={appState?.p15ConstructionLevel}
                        p21EarlyReflectionPreset={appState?.p21EarlyReflectionPreset}
                        freeMoveLcr={freeMoveLcr} />
                  </Suspense>
              </CollapsiblePanel>
              
              <CollapsiblePanel
              title="Options"
              icon={<Box className="w-5 h-5" />}
              defaultOpen={false}>

                  <div className="space-y-4 p-4">
                    {/* Show Prices Toggle */}
                    <div className="flex items-center justify-between">
                      <Label htmlFor="show-prices" className="text-sm font-medium">
                        Show Prices
                      </Label>
                      <Switch
                    id="show-prices"
                    checked={showPrices}
                    onCheckedChange={setShowPrices} />

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
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />

                    </div>
                  </div>
              </CollapsiblePanel>
          </div>
        </aside>
      </div>
    </div>
    </>);

}

export default function RoomDesignerPage() {
  const disabled = typeof window !== "undefined" && window.__DISABLE_ROOM_DESIGNER === true;
  
  // Calculate project ID at page level to use as remount key
  const sessionActiveProjectId = useActiveProjectId();
  const { projectId: initialProjectIdFromUrl } = useUrlQuery();
  const resolvedProjectId = sessionActiveProjectId || initialProjectIdFromUrl || null;
  
  if (disabled) {
    return <div className="p-6 text-sm">Room Designer is temporarily disabled.</div>;
  }

  return (
    <SidebarInset>
      <div className="flex flex-col gap-4 px-4 md:px-6">
        <Suspense fallback={<div className="p-6">Loading…</div>}>
          <ErrorBoundary fallback={<div className="p-6">Failed to mount Room Designer.</div>}>
            <RoomDesignerWithState />
          </ErrorBoundary>
        </Suspense>
      </div>
    </SidebarInset>);

}