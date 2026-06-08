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
import ResizableTwoColumnLayout from "@/components/ui/ResizableTwoColumnLayout";
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
import { useEffectiveRsp } from '@/components/room/rsp/useEffectiveRsp';
import { computeAllSeatSplMetrics, getMlpSeat } from "@/components/utils/spl/centralSplEngine";
import { usePriceCalculation } from "@/components/pricing/usePriceCalculation";
import { computeSeatHudMetrics } from "@/components/utils/computeSeatHudMetrics";
import { rolesForLayout } from "@/components/utils/surroundRoleMap";
import { deriveSubwoofersFromCfg } from "@/components/utils/deriveSubwoofersFromCfg";
import { safeCanon, mergePreserveOverheads, cloneRoleWithModel, speakersEqual, preserveSurroundModels } from "@/components/room/utils/speakerHelpers";
import { DOLBY_PRESETS, seedSpeakersFromPreset, getTargetOverheadIds, ensureAtmosOverheads } from "@/components/room/utils/dolbyHelpers";
import { getModelDimsM } from "@/components/roomdesigner/utils/getModelDimsM";
import { useUrlQuery, useSurroundGroupDepths, parseProjectJson, getMlpPoint } from "@/components/roomdesigner/RoomDesignerHelpers";
import { _isNum, _degToRad, _wrap180, _projectHalfExtent, _getDimsM } from "@/components/roomdesigner/utils/speakerDepthHelpers";
import { useFrontWideZones } from "@/components/hooks/useFrontWideZones";
import { useAnalysisSpeakers } from "@/components/hooks/useAnalysisSpeakers";
import { useAllSeatSplMetrics } from "@/components/hooks/useAllSeatSplMetrics";
import { useProjectLoader } from "@/components/hooks/useProjectLoader";
import { useSpeakerSystemStore } from "@/components/hooks/useSpeakerSystemStore";
import { useSpeakerReconciliation } from "@/components/hooks/useSpeakerReconciliation";
import { useSeatingRebuild } from "@/components/hooks/useSeatingRebuild";
import { useSubwooferSync } from "@/components/hooks/useSubwooferSync";
import { useInRoomDepths } from "@/components/hooks/useInRoomDepths";
import RoomDesignerHeader from "@/components/roomdesigner/RoomDesignerHeader";
import NewProjectDialog from "@/components/projects/NewProjectDialog";
import RoomDesignerPlanToolbar from "@/components/roomdesigner/RoomDesignerPlanToolbar";
import AimLoudspeakerControls from "@/components/roomdesigner/AimLoudspeakerControls";
import OptionsPanel from "@/components/roomdesigner/OptionsPanel";
import RoomDesignerControlsPanel from "@/components/roomdesigner/RoomDesignerControlsPanel";
import FrontElevation from "@/components/room/FrontElevation";
import SideElevation from "@/components/room/SideElevation";
import { useGuardedSetter } from "@/components/roomdesigner/useGuardedSetter";

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

// (debug log removed to save space)


function RoomDesignerWithState() {
  // All hook calls must be unconditional and at the top level
  const appState = useAppState();
  const sessionActiveProjectId = useActiveProjectId();
  const { projectId: initialProjectIdFromUrl } = useUrlQuery();

  // Single source of truth for the project ID
  // userProjectOverride: null = defer to session/URL, "free" = explicit Free Use, "<id>" = explicit project choice
  const [userProjectOverride, setUserProjectOverride] = useState(null);
  const [existingProjects, setExistingProjects] = useState([]);
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);

  // Only resolve from explicit URL param — session state is for display only.
  // Generic /RoomDesigner (no ?project=) must open as Free Use, not re-attach a stale project.
  const baseResolvedId = initialProjectIdFromUrl || null;
  const resolvedProjectId = baseResolvedId
    ? baseResolvedId
    : (userProjectOverride === "free" ? null : (userProjectOverride || null));
  const isProjectMode = !!resolvedProjectId;

  // NEW: Refs for speaker rescue on room resize
  const prevRoomDimsRef = useRef(null);
  const isDraggingRef = useRef(false);
  const visualisationRef = React.useRef(null);
  const didUserRequestResetRef = useRef(false);
  const lastScreenWidthForMlpRef = useRef(null);
  const lastScreenFrontPlaneForMlpRef = useRef(null);

  // NEW: Seating config epoch tracking for loaded projects
  const [seatingConfigEpoch, setSeatingConfigEpoch] = useState(0);
  const seatingLoadedEpochRef = useRef(0);



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
      height: Number(_roomDims?.heightM) || 2.8,
      widthM: Number(_roomDims?.widthM) || 4.5,
      lengthM: Number(_roomDims?.lengthM) || 6.0,
      heightM: Number(_roomDims?.heightM) || 2.8,
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


  const _seatingRows = appState?.seatingRows;
  const _seatsPerRow = appState?.seatsPerRow;
  const _seatsPerRowByRow = appState?.seatsPerRowByRow; // NEW
  const _setSeatsPerRowByRow = appState?.setSeatsPerRowByRow; // NEW
  const _seatingBlockOffset = appState?.seatingBlockOffset;
  const _seatSpacing = appState?.seatSpacing;
  const _mlpBasis = appState?.mlpBasis;
  // SEPARATION: seatingArrangementBasis controls how rows are distributed around the
  // fixed RSP anchor. It is independent of the true RSP position (driven by seatingBlockOffset).
  // Initialise from persisted mlpBasis so loaded projects restore correctly.
  const [seatingArrangementBasis, _setSeatingArrangementBasis] = useState(
    () => appState?.mlpBasis || 'front'
  );
  const setSeatingArrangementBasis = React.useCallback((next) => {
    _setSeatingArrangementBasis(next);
    // NOTE: intentionally not calling appState.setMlpBasis here.
    // seatingArrangementBasis is local to RoomDesigner for row-distribution only.
    // The true RSP is always derived from mlpY_m (screen geometry + offset).
  }, []);
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
  const showLocalHint = !isProjectMode;

  // Fetch existing projects for the "Save to Project" dropdown (name + id only)
  useEffect(() => {
    let cancelled = false;
    Project.list('-updated_date', 50).then((list) => {
      if (!cancelled && Array.isArray(list)) {
        setExistingProjects(list.map((p) => ({ id: p.id, name: p.name || "Untitled" })));
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Free Use: detach from any project, stay local
  const handleFreeUse = React.useCallback(() => {
    setUserProjectOverride("free");
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("project");
      url.searchParams.delete("projectId");
      window.history.replaceState({}, "", url.toString());
    } catch (e) { /* ignore */ }
  }, []);

  // New Project: open dialog
  const handleNewProject = React.useCallback(() => {
    setShowNewProjectDialog(true);
  }, []);



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
  const [leftPanelView, setLeftPanelView] = useState('plan'); // 'plan' | 'front' | 'side'
  const [rightPanelView, setRightPanelView] = useState('controls'); // 'controls' | 'isometric' | 'data'
  const [sideElevationWall, setSideElevationWall] = useState('right'); // 'left' | 'right'

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
  
  // NEW: Auto-reset extra surrounds count only after a real 9-bed -> non-9-bed transition
  const didSkipInitialLoadedExtraSurroundResetRef = useRef(false);
  const prevIsNineBedLayoutRef = useRef(isNineBedLayout);

  useEffect(() => {
    const wasNineBedLayout = prevIsNineBedLayoutRef.current;
    prevIsNineBedLayoutRef.current = isNineBedLayout;

    // Never reset on the first pass after mount / reopen.
    if (!didSkipInitialLoadedExtraSurroundResetRef.current) {
      didSkipInitialLoadedExtraSurroundResetRef.current = true;
      return;
    }

    // Only react to a real layout transition, not to loaded extraSurroundCount changes.
    if (wasNineBedLayout === isNineBedLayout) {
      return;
    }

    if (isNineBedLayout) {
      return;
    }

    // Only force reset after a real allowed -> disallowed layout change.
    if (wasNineBedLayout && (appState?.extraSurroundCount ?? 0) !== 0) {
      appState?.setExtraSurroundCount?.(0);
    }
  }, [
    isNineBedLayout,
    appState?.extraSurroundCount,
    appState?.setExtraSurroundCount
  ]);

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
    manualHeightM: Number(_screen?.manualHeightM) || 0,
    tvPresetKey: _screen?.tvPresetKey || null,
    tvWidthMm: Number(_screen?.tvWidthMm) || null,
  }), [_screen?.visibleWidthInches, _screen?.aspectRatio, _screen?.floatDepthM, _screen?.heightFromFloorM, _screen?.manualMode, _screen?.manualWidthM, _screen?.manualHeightM, _screen?.mountMode, _screen?.tvPresetKey, _screen?.tvWidthMm]);

  // --- Screen width used for MLP + row centres (must be available even if Screen Size panel was never opened) ---
  const screenVisibleWidthInchesEffective = useMemo(() => {
    const s = stableScreen || _screen || appState?.screen || {};

    // 0) TV preset is authoritative when present
    const TV_KEY_TO_INCHES = { tv65: 55.55, tv77: 67.36, tv83: 72.52, tv100: 87.80 };
    if (s?.tvPresetKey && TV_KEY_TO_INCHES[s.tvPresetKey]) {
      return TV_KEY_TO_INCHES[s.tvPresetKey];
    }

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
    // In manual_position mode, manualRspY_m is the sole authority for mlpY_m.
    // The effectiveRspY_m write-back effect (below) handles updates.
    // This screen-geometry writer must not run or it will overwrite the manual RSP.
    const currentRspMode = appState?.rspMode || "auto_from_screen";
    if (currentRspMode === "manual_position") return;

    // Pull needed values
    // Prefer the published screen front plane from RV.
    // IMPORTANT: Do NOT calculate/store mlpY_m until this is a real finite number,
    // otherwise the MLP dot "locks in" a consistent wrong offset on first load.
    const screenFrontPlaneM_raw = appState?.screenFrontPlaneM;
    // Use real value when available; otherwise derive a first-pass fallback so the
    // green dot is positioned correctly on first load without waiting for RV to publish.
    const screenFrontPlaneM =
      (Number.isFinite(screenFrontPlaneM_raw) && screenFrontPlaneM_raw > 0)
        ? Number(screenFrontPlaneM_raw)
        : (Number.isFinite(Number(_screen?.screenPlaneY_m)) && Number(_screen?.screenPlaneY_m) > 0
            ? Number(_screen?.screenPlaneY_m)
            : (Number.isFinite(Number(_screen?.floatDepthM)) && Number(_screen?.floatDepthM) > 0
                ? Number(_screen?.floatDepthM)
                : 0.20));

    const screenVisibleWidthM =
      Number(screenVisibleWidthInchesEffective) * 0.0254;

    const rows = Number(_seatingRows) || 1;
    const rowSpacing = Number(_rowSpacingM) || 1.8; // default 1.8m
    // SEPARATION: use seatingArrangementBasis (not _mlpBasis / true RSP basis)
    // to distribute rows around the fixed RSP anchor (fixedMlpY).
    const mlpReference = seatingArrangementBasis; // 'front' | 'back' | 'all'

    // Must have screen width
    if (!Number.isFinite(screenVisibleWidthM)) {
      return;
    }

    // First-load scratch guard: if starter mlpY_m is already written and user hasn't
    // changed seating yet, don't overwrite the clean starter anchor on first pass.
    // EXCEPTION: always re-run when the screen width has changed so MLP tracks 57.5°.
    const hasProjectId = resolvedProjectId || projectIdState;
    const screenWidthChanged = lastScreenWidthForMlpRef.current !== null &&
      Math.abs(lastScreenWidthForMlpRef.current - screenVisibleWidthInchesEffective) > 0.01;
    lastScreenWidthForMlpRef.current = screenVisibleWidthInchesEffective;

    // Also bypass the guard when the live screen plane has moved (e.g. front speaker clearance)
    // On first load (ref is null), treat it as changed if real plane differs from fallback
    const fallbackScreenPlaneM =
      (Number.isFinite(Number(_screen?.screenPlaneY_m)) && Number(_screen?.screenPlaneY_m) > 0)
        ? Number(_screen?.screenPlaneY_m)
        : Number(_screen?.floatDepthM) || 0.20;

    const screenPlaneChanged =
      lastScreenFrontPlaneForMlpRef.current === null
        ? Math.abs(screenFrontPlaneM - fallbackScreenPlaneM) > 0.005
        : Math.abs(lastScreenFrontPlaneForMlpRef.current - screenFrontPlaneM) > 0.005; // 5mm threshold

    lastScreenFrontPlaneForMlpRef.current = screenFrontPlaneM;

    // 1. Compute ideal distance for 57.5° FOV (base position)
    const idealDistM = distanceFor57_5FromWidth(screenVisibleWidthM);

    // AUTO RSP: always pure screen geometry, never offset by seatingBlockOffset.
    // seatingBlockOffset shifts seats only — it must NOT move the RSP green dot.
    const fixedMlpY = screenFrontPlaneM + idealDistM;

    if (
      loadState?.phase === "scratch" &&
      !hasProjectId &&
      (seatingLoadedEpochRef?.current ?? 0) === 0 &&
      !screenWidthChanged &&
      !screenPlaneChanged &&
      Number.isFinite(appState?.mlpY_m) &&
      Math.abs(Number(appState.mlpY_m) - fixedMlpY) <= 0.005
    ) {
      return;
    }
    if (SHOW_DEBUG_LOGS && globalThis.__B44_LOGS) console.log('[MLP 57.5° verify]', { screenFrontPlaneM: screenFrontPlaneM.toFixed(3), screenVisibleWidthM: screenVisibleWidthM.toFixed(3), idealDistM: idealDistM.toFixed(3), offset: Number(_seatingBlockOffset), fixedMlpY: fixedMlpY.toFixed(3) });

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
  seatingArrangementBasis, // row distribution — does NOT redefine RSP
  _rowSpacingM,
  appState?.setMlpY_m,
  appState?.setRowCentersM,
  stableDimensions?.length,
  appState?.roomDims?.lengthM,
  _screen?.screenPlaneY_m,
  _screen?.floatDepthM]
  );

  // Use computed MLP as the effective anchor (for backwards compatibility)
  // SEPARATION: mlpAnchorEffective is the true RSP position.
  // It is driven exclusively by appState.mlpY_m (which is set from seatingBlockOffset + screen).
  // It must NOT shift when seatingArrangementBasis changes — only Viewing Offset moves the RSP.
  const mlpAnchorEffective = useMemo(() => {
    const roomWidthM = Number(stableDimensions?.width) || 0;
    const cx = roomWidthM > 0 ? roomWidthM / 2 : 0;

    // Single source of truth: always use mlpY_m (set by the MLP useEffect from seatingBlockOffset).
    const mlpY = appState?.mlpY_m;
    if (Number.isFinite(mlpY)) {
      return { x: cx, y: mlpY, z: 1.2 };
    }

    // Fallback: if mlpY_m not yet computed, derive from primary seat as a one-time bootstrap.
    const seats = Array.isArray(appState?.seatingPositions) ? appState.seatingPositions : [];
    if (seats.length > 0 && Number.isFinite(roomWidthM)) {
      const primarySeat = seats.find(s => s.isPrimary);
      if (primarySeat) {
        const cy = Number(primarySeat.y ?? primarySeat.position?.y);
        const cz = Number(primarySeat.z ?? primarySeat.position?.z);
        if (Number.isFinite(cy)) return { x: cx, y: cy, z: Number.isFinite(cz) ? cz : 1.2 };
      }
    }

    return null;
  }, [appState?.mlpY_m, stableDimensions?.width, appState?.seatingPositions]);

  // ── RSP: effectiveRspY_m from useEffectiveRsp ────────────────────────────────
  // screenWidthM is derived the same way the existing MLP effect derives it.
  const _rspScreenWidthM = Number(screenVisibleWidthInchesEffective) * 0.0254;

  // Phase 3C: derive rowDerivedRspYByMode from the existing computeMLPAndPrimary result.
  // computeMLPAndPrimary already groups seats by row internally — no new calculation needed.
  const _rowDerivedRspYByMode = useMemo(() => {
    const result = computeMLPAndPrimary(
      Array.isArray(_seatingPositions) ? _seatingPositions : [],
      stableDimensions.width,
      stableDimensions.length,
      "front", // mlpBasis is irrelevant here; we only need rowDerivedRspYByMode
    );
    return result?.rowDerivedRspYByMode ?? {};
  }, [_seatingPositions, stableDimensions.width, stableDimensions.length]);

  const { effectiveRspY_m, rspSourceLabel } = useEffectiveRsp({
    rspMode: appState?.rspMode || "auto_from_screen",
    manualRspY_m: appState?.manualRspY_m ?? null,
    screenFrontPlaneM: appState?.screenFrontPlaneM,
    screenWidthM: _rspScreenWidthM,
    rowCentersM: appState?.rowCentersM || [],
    seatingPositions: appState?.seatingPositions || [],
    currentMlpY_m: appState?.mlpY_m ?? null,
    rowDerivedRspYByMode: _rowDerivedRspYByMode,
  });

  // Write effectiveRspY_m → appState.mlpY_m for auto_from_screen and manual_position.
  // Uses the identical rounding/tolerance pattern as the existing MLP useEffect so
  // React never sees a spurious state update and no loop is introduced.
  const _rspModeForEffect = appState?.rspMode || "auto_from_screen";
  useEffect(() => {
    if (_rspModeForEffect !== "auto_from_screen" && _rspModeForEffect !== "manual_position") return;
    if (!Number.isFinite(effectiveRspY_m)) return;
    if (typeof appState?.setMlpY_m !== "function") return;

    const mlpRounded = Math.round(effectiveRspY_m * 1000) / 1000;
    appState.setMlpY_m((prev) => {
      const prevRounded = Number.isFinite(prev) ? Math.round(prev * 1000) : null;
      const newRounded = Math.round(mlpRounded * 1000);
      return prevRounded === newRounded ? prev : mlpRounded;
    });
  }, [_rspModeForEffect, effectiveRspY_m, appState?.setMlpY_m]);

  // One-time initialisation: when rspMode first becomes "manual_position" and
  // manualRspY_m is not yet set, seed it from the current mlpY_m.
  // A ref prevents this from firing more than once per mode entry.
  const _didInitManualRspRef = useRef(false);
  useEffect(() => {
    if (_rspModeForEffect !== "manual_position") {
      // Reset the guard when leaving manual_position so it re-fires if mode is re-entered.
      _didInitManualRspRef.current = false;
      return;
    }
    if (_didInitManualRspRef.current) return;
    if (appState?.manualRspY_m != null && Number.isFinite(Number(appState.manualRspY_m))) return;

    const currentMlp = appState?.mlpY_m;
    if (!Number.isFinite(currentMlp)) return;
    if (typeof appState?.setManualRspY_m !== "function") return;

    _didInitManualRspRef.current = true;
    appState.setManualRspY_m(currentMlp);
  }, [_rspModeForEffect, appState?.manualRspY_m, appState?.mlpY_m, appState?.setManualRspY_m]);
  // ── END RSP ───────────────────────────────────────────────────────────────

  const placedSpeakers = appState?.speakerSystem?.placedSpeakers || [];
  console.log('[ROOM placedSpeakers]', placedSpeakers.map(s => String(s?.role)));
  const engineSpeakers = Array.isArray(placedSpeakers) ? placedSpeakers : [];

  // ANALYSIS MUST ONLY USE SPEAKERS THAT ARE ACTUALLY "IN THE DRAWING"
  // (VALID POSITION + REAL MODEL + VISIBLE BY LAYOUT RULES)
  // Extracted to useAnalysisSpeakers — uses canonical sevenBedLayoutType resolution
  // so visibility / reconciliation / analysis all agree on 7.x rears vs wides.
  const analysisSpeakers = useAnalysisSpeakers({
    placedSpeakers,
    speakerSystem: appState?.speakerSystem,
    sevenBedLayoutType: appState?.sevenBedLayoutType,
    getSpeakerVisibility: appState?.getSpeakerVisibility,
    dolbyPreset,
  });

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

  // Filtered speaker list for "Aim Loudspeaker" depth calculation (includes all active drawn surrounds)
  const placedSpeakersForAim = React.useMemo(() => {
    if (!Array.isArray(placedSpeakers) || placedSpeakers.length === 0) return [];
    const sideSurroundsAreActive = _allowedBedRoles.has("SL") || _allowedBedRoles.has("SR");
    return placedSpeakers.filter((sp) => {
      const r = safeCanon(sp?.role);
      return _allowedBedRoles.has(r) || (sideSurroundsAreActive && (/^SL\d*$/.test(r) || /^SR\d*$/.test(r)));
    });
  }, [placedSpeakers, _allowedBedRoles]);


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

  // In-room depth calculation (extracted to useInRoomDepths hook)
  const inRoomDepthsCm = useInRoomDepths({
    placedSpeakersForAim,
    posSig: _posSig,
    yawSig: _yawSig,
    widthM: stableDimensions.width,
    lengthM: stableDimensions.length,
    mlpAnchorEffective,
    aimFrontWidesAtMLP: appState?.aimFrontWidesAtMLP,
    aimSideSurroundsAtMLP: appState?.aimSideSurroundsAtMLP,
    aimRearSurroundsAtMLP: appState?.aimRearSurroundsAtMLP,
  });

  // NEW: Compute centralized SPL data for all seats (powers sidebar SPL cards AND HUD)
  const allSeatSplMetrics = useAllSeatSplMetrics({
    _seatingPositions,
    analysisSpeakers,
    appState,
    mlpAnchorEffective,
    getSpeakerModelMeta,
  });

  // Compute diagnostic values
  const widthM =
  typeof stableScreen?.widthMeters === 'number' && stableScreen.widthMeters > 0 ?
  stableScreen.widthMeters :
  (Number(stableScreen?.visibleWidthInches) || 0) * 0.0254;

  // Derive primarySeatingPosition: seat closest to the fixed RSP anchor (mlpAnchorEffective).
  // This is now independent of seatingArrangementBasis.
  const primarySeatingPosition = useMemo(() => {
    if (!Array.isArray(seats) || seats.length === 0) return null;
    const anchor = mlpAnchorEffective;
    if (!anchor || !Number.isFinite(anchor.y)) return seats[0] || null;
    // Find seat with minimum Euclidean distance to the fixed RSP anchor
    let closest = null;
    let minDist = Infinity;
    for (const seat of seats) {
      const dx = (Number(seat.x) || 0) - anchor.x;
      const dy = (Number(seat.y) || 0) - anchor.y;
      const dist = Math.hypot(dx, dy);
      if (dist < minDist) { minDist = dist; closest = seat; }
    }
    // Lock X to centerline for analysis purposes
    const roomWidth = stableDimensions.width;
    return closest ? { ...closest, x: roomWidth / 2 } : null;
  }, [seats, mlpAnchorEffective, stableDimensions.width]);

  // ✅ Compute frontWideZones BEFORE analysisResult to avoid TDZ
  const enableFrontWides = _enableFrontWides;

  const frontWideZones = useFrontWideZones({
    enableFrontWides,
    mlpAnchorEffective,
    stableDimensions,
    placedSpeakers,
    getSpeakerModelMeta,
    SHOW_DEBUG_LOGS,
  });

  // ✅ analysisResult uses internal overlay calculation (no props needed)
  const analysisResult = useRP22AnalysisEngine({
    placedSpeakers: engineSpeakers,
    visiblePlanSpeakers: analysisSpeakers,
    seatingPositions: seats,
    primarySeatingPosition: primarySeatingPosition,
    dimensions: stableDimensions, // Use stableDimensions (derived from appState.roomDims)
    mlpBasis: "front", // fixed stable value — does not vary with seating arrangement
    sevenBedLayoutType: appState?.sevenBedLayoutType,
    extraSurroundCount: appState?.extraSurroundCount,
    p15ConstructionLevel: appState?.p15ConstructionLevel,
    screen: _screen,
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
      lcrAimMode: appState?.lcrAimMode,
      aimFrontWidesAtMLP: appState?.aimFrontWidesAtMLP,
      aimSideSurroundsAtMLP: appState?.aimSideSurroundsAtMLP,
      aimRearSurroundsAtMLP: appState?.aimRearSurroundsAtMLP,
      speakerSystem: appState?.speakerSystem,
      sevenBedLayoutType: appState?.sevenBedLayoutType,
      getSpeakerVisibility: appState?.getSpeakerVisibility,
    }
  });


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
        role: safeCanon(node.role), // Canonicalize roles (e.g., L -> FL, Ls -> SL)
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
  }, [seatingBlockOffsetSetterGuarded, appState?.setSeatingBlockOffset]);

  const setMlpBasisGuarded = useGuardedSetter(appState?.setMlpBasis, 'seating');

  // Sync seatingArrangementBasis from persisted mlpBasis when a project loads.
  // This ensures a saved mlpBasis value (e.g., 'back') is correctly restored.
  const _syncedMlpBasisRef = React.useRef(null);
  React.useEffect(() => {
    const loaded = appState?.mlpBasis;
    if (typeof loaded === 'string' && loaded !== _syncedMlpBasisRef.current) {
      _syncedMlpBasisRef.current = loaded;
      _setSeatingArrangementBasis(loaded);
    }
  }, [appState?.mlpBasis]);
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
      isProjectMode,
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
      setFreeMoveLcr: setFreeMoveLcr,
      globalSurroundModel: appState?.globalSurroundModel,
      setGlobalSurroundModel: appState?.setGlobalSurroundModel,
      extraSurroundCount: appState?.extraSurroundCount,
      setExtraSurroundCount: appState?.setExtraSurroundCount,
    });

  // Called after NewProjectDialog creates the project
  const handleNewProjectCreated = React.useCallback(async (created) => {
    if (!created?.id) return;
    setUserProjectOverride(created.id);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("project", created.id);
      window.history.replaceState({}, "", url.toString());
    } catch (e) { /* ignore */ }
    setExistingProjects((prev) => [{ id: created.id, name: created.name || "Untitled" }, ...prev]);
    setTimeout(() => { triggerSaveProject?.(); }, 100);
  }, [triggerSaveProject]);

  // Called after overwrite confirmation for an existing project
  const handleSaveToExistingProject = React.useCallback((id) => {
    setUserProjectOverride(id);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("project", id);
      window.history.replaceState({}, "", url.toString());
    } catch (e) { /* ignore */ }
    setTimeout(() => { triggerSaveProject?.(); }, 100);
  }, [triggerSaveProject]);

  useEffect(() => {
    if (appState && typeof appState.setSubWarnings === 'function') {
      appState.setSubWarnings(subWarnings);
    }
  }, [subWarnings, appState]);

  // LCR re-clamp (compacted)
  useEffect(() => {
    if (isDraggingRef.current) return; // Skip while drag is active
    if (loadState.phase !== 'loaded' || !placedSpeakers.length || !analysisResult?.zones) return;
    try {
      const getModelDims = (modelId) => getSpeakerModelMeta(modelId) || {};
      const constraints = calculateLcrConstraints({ placedSpeakers, zones: analysisResult.zones, room: stableDimensions, screen: stableScreen, getModelDims });
      let needsUpdate = false;
      const updatedSpeakers = placedSpeakers.map((speaker) => { const constraint = constraints[speaker.role]; if (!constraint) return speaker; const currentX = speaker.position.x; const { minX, maxX } = constraint.clamp; if (currentX < minX || currentX > maxX) { needsUpdate = true; const newX = Math.max(minX, Math.min(maxX, currentX)); if (globalThis.__B44_LOGS) debug(`[Resize Re-clamp] Clamping ${speaker.role} X from ${currentX} to ${newX}`); return { ...speaker, position: { ...speaker.position, x: newX } }; } return speaker; });
      if (needsUpdate) { if (globalThis.__B44_LOGS) debug('[Resize Re-clamp] Adjusting LCR positions.'); setSpeakers((prev) => mergePreserveOverheads(prev, updatedSpeakers, dolbyPreset)); }
    } catch (error) { if (globalThis.__B44_LOGS) console.warn('[Resize Re-clamp] Error:', error); }
  }, [placedSpeakers, analysisResult?.zones, stableDimensions, stableScreen, setSpeakers, loadState.phase]);

  // Speaker rescue on room resize (compacted)
  useEffect(() => {
    if (isDraggingRef.current) return; if (_isFrozen && _isFrozen('speakers')) return;
    const W = stableDimensions.width; const L = stableDimensions.length;
    if (!(W > 0 && L > 0)) return;
    const prev = prevRoomDimsRef.current;
    if (prev && prev.width === W && prev.length === L) return;
    prevRoomDimsRef.current = { width: W, length: L };
    // On first pass (prev === null): still run rescue if any speaker is out of bounds.
    // This ensures loaded projects get the same correction as interactive Free Use resizes.
    const INSET = 0.01; let anyOutOfBounds = false;
    const rescued = placedSpeakers.map((spk) => { if (!spk.position || !Number.isFinite(spk.position.x) || !Number.isFinite(spk.position.y)) return spk; const x = spk.position.x; const y = spk.position.y; if (!(x < 0 || x > W || y < 0 || y > L)) return spk; anyOutOfBounds = true; return { ...spk, position: { ...spk.position, x: Math.max(INSET, Math.min(W - INSET, x)), y: Math.max(INSET, Math.min(L - INSET, y)) } }; });
    if (anyOutOfBounds) setSpeakers((prev) => preserveSurroundModels(prev, rescued, appState));
  }, [stableDimensions.width, stableDimensions.length, placedSpeakers, _isFrozen, setSpeakers]);

  // Effect to lock LCR to front wall + z=1.2, and drive screen clearance
  useEffect(() => {
    if (isDraggingRef?.current) return; // Skip entirely while drag is active
    if (_isFrozen && _isFrozen('speakers')) return;
    if (!placedSpeakers || !placedSpeakers.length) return;
    if (!mlpAnchorEffective) return;
    const gapM = 0.01;
    let needsUpdate = false;
    let maxFrontExtentY = 0;
    const updated = placedSpeakers.map((spk) => {
      const role = safeCanon(spk.role);
      if (!['FL', 'FC', 'FR'].includes(role)) return spk;
      const ms = String(spk.model ?? "").trim().toLowerCase();
      if (!ms || ms === "off" || ms === "none") return spk;
      const meta = getSpeakerModelMeta(spk.model) || {};
      const depthM = Number(meta.depthM) || 0.082;
      const widthM = Number(meta.widthM) || 0.27;
      let targetYawDeg = 0;
      if (lcrAimMode === "angled" && spk.position) {
        const dx = mlpAnchorEffective.x - spk.position.x;
        const dy = mlpAnchorEffective.y - spk.position.y;
        targetYawDeg = Math.abs(Math.atan2(dx, dy) * 180 / Math.PI);
      }
      const halfExtentM = yHalfExtentM(depthM, widthM, targetYawDeg);
      const wallY = gapM + halfExtentM;
      const actualCentreY = Number.isFinite(spk.position?.y) ? spk.position.y : wallY;
      const willStayAtActual = spk.positionSource === 'user' && actualCentreY >= wallY - 0.001;
      const finalCentreY = willStayAtActual ? actualCentreY : wallY;
      if (finalCentreY + halfExtentM > maxFrontExtentY) maxFrontExtentY = finalCentreY + halfExtentM;
      if (willStayAtActual) return spk;
      const lcrTargetZ = Number.isFinite(appState?.splConfig?.lcrHeightM) ? appState.splConfig.lcrHeightM : 1.2;
      if (Math.abs((spk.position?.y ?? 0) - wallY) > 0.001 || Math.abs((spk.position?.z ?? lcrTargetZ) - lcrTargetZ) > 0.001) {
        needsUpdate = true;
        return { ...spk, position: { ...spk.position, y: wallY, z: lcrTargetZ } };
      }
      return spk;
    });
    if (needsUpdate) setSpeakers((prev) => mergePreserveOverheads(prev, updated, dolbyPreset));
    // Push screen front plane out to maintain >= 1cm clearance from the farthest LCR extent.
    // Works for ALL mount modes: floating drives floatDepthM; baffle/recessed drives speakerClearanceM
    // (in AppStateProvider, screenFrontPlaneY = speakerClearanceM for baffle mode).
    if (maxFrontExtentY > 0 && _setScreen) {
      const req = Math.round((maxFrontExtentY + gapM) * 1000) / 1000;
      const mountMode = _screen?.mountMode || 'baffle';
      if (mountMode === 'floating') {
        if ((Number(_screen?.floatDepthM) || 0) < req) _setScreen(prev => ({ ...prev, floatDepthM: req }));
      } else {
        // baffle / recessed: speakerClearanceM IS the screen front plane in AppStateProvider
        if ((Number(_screen?.speakerClearanceM) || 0) < req) _setScreen(prev => ({ ...prev, speakerClearanceM: req }));
      }
    }
  }, [placedSpeakers, _isFrozen, setSpeakers, lcrAimMode, mlpAnchorEffective, _screen, _setScreen, appState?.splConfig?.lcrHeightM]);

  // NEW: Effect to lock FC speaker to room centerline
  useEffect(() => {
    if (isDraggingRef.current) return; // Skip while drag is active
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

  // Speaker aiming (inline, compacted)
  useEffect(() => {
    if (isDraggingRef.current) return;
    if (!placedSpeakers.length || _isFrozen && _isFrozen('speakers') || !mlpAnchorEffective) return;
    const aimLCR = lcrAimMode === "angled"; const aimFW = appState?.aimFrontWidesAtMLP || false; const aimSide = appState?.aimSideSurroundsAtMLP || false; const aimRear = appState?.aimRearSurroundsAtMLP || false;
    const yawToMLP = (spkPos, mlpPos) => { const dx = mlpPos.x - spkPos.x; const dy = mlpPos.y - spkPos.y; return Math.atan2(dx, dy) * 180 / Math.PI; };
    const canRotateSafely = (pos, yawDeg, model) => { const meta = getSpeakerModelMeta(model); const w = meta?.widthM || 0.27; const d = meta?.depthM || 0.082; const yawRad = yawDeg * Math.PI / 180; const cosY = Math.cos(yawRad); const sinY = Math.sin(yawRad); const hw = w / 2; const hd = d / 2; const corners = [{ x: hw * cosY - hd * sinY, y: hw * sinY + hd * cosY }, { x: -hw * cosY - hd * sinY, y: -hw * sinY + hd * cosY }, { x: hw * cosY + hd * sinY, y: hw * sinY - hd * cosY }, { x: -hw * cosY + hd * sinY, y: -hw * sinY - hd * cosY }]; const buffer = 0.01; for (const c of corners) { const wx = pos.x + c.x; const wy = pos.y + c.y; if (wx < buffer || wx > stableDimensions.width - buffer || wy < buffer || wy > stableDimensions.length - buffer) return false; } return true; };
    const updated = placedSpeakers.map((spk) => {
      const canon = safeCanon(spk.role); if (!spk.position) return spk;
      let shouldAim = false;
      if (canon === 'FL' || canon === 'FR') shouldAim = aimLCR; else if (canon === 'LW' || canon === 'RW') shouldAim = aimFW; else if (canon === 'SL' || canon === 'SR') shouldAim = aimSide; else if (canon === 'SBL' || canon === 'SBR') shouldAim = aimRear;
      if (!shouldAim) {
        if (canon === 'FL' || canon === 'FR') { if (lcrAimMode === "flat") { const cy = spk.rotation?.y || 0; if (Math.abs(cy) > 0.001) return { ...spk, rotation: { ...(spk.rotation || {}), y: 0 } }; } return spk; }
        if (['LW','RW','SL','SR','SBL','SBR'].includes(canon)) { const cy = spk.rotation?.y || 0; if (Math.abs(cy) > 0.001) return { ...spk, rotation: { ...(spk.rotation || {}), y: 0 } }; }
        return spk;
      }
      const targetYaw = yawToMLP(spk.position, mlpAnchorEffective);
      const safe = canRotateSafely(spk.position, targetYaw, spk.model);
      const finalYaw = safe ? targetYaw : spk.rotation?.y || 0;
      const currentYaw = spk.rotation?.y || 0;
      if (Math.abs(finalYaw - currentYaw) < 0.001) return spk;
      return { ...spk, rotation: { ...(spk.rotation || {}), y: finalYaw } };
    });
    const changed = updated.some((spk, i) => Math.abs((spk?.rotation?.y || 0) - (placedSpeakers[i]?.rotation?.y || 0)) > 0.001);
    if (changed) setSpeakers((prev) => preserveSurroundModels(prev, updated, appState));
  }, [placedSpeakers, mlpAnchorEffective, lcrAimMode, appState?.aimFrontWidesAtMLP, appState?.aimSideSurroundsAtMLP, appState?.aimRearSurroundsAtMLP, stableDimensions.width, stableDimensions.length, _isFrozen, setSpeakers]);


  // 7.x bed layout swap: inline (kept compact)
  useEffect(() => {
    if (isDraggingRef.current) return;
    if (loadState?.phase === "loaded") return;
    if (!dolbyPreset || _isFrozen && _isFrozen('speakers')) return;
    const rawPreset = String(dolbyPreset || '').split(' ')[0].split('_')[0];
    const parts = rawPreset.split('.');
    const heights = parseInt(parts[2], 10) || 0;
    if (heights > 0) return;
    const is7ChannelBed = dolbyPreset && (dolbyPreset.startsWith('7.1') || dolbyPreset.startsWith('7.2'));
    if (!is7ChannelBed) return;
    const currentSpeakers = placedSpeakers || [];
    const hasWides = currentSpeakers.some((s) => s.role === 'LW' || s.role === 'RW');
    const hasRears = currentSpeakers.some((s) => s.role === 'SBL' || s.role === 'SBR');
    const earZ = 1.1;
    const globalSurroundModel = appState?.globalSurroundModel;
    const hint = typeof window !== "undefined" && window.__SURROUND_MODEL_HINT_ || null;
    const byRole = new Map(currentSpeakers.map((s) => [s.role, s]));
    const applyGlobalModelToRoles = (list, roles) => {
      if (!globalSurroundModel) return list;
      const ms = String(globalSurroundModel).trim().toLowerCase();
      if (!ms || ms === 'off' || ms === 'none') return list;
      return list.map((spk) => {
        const canon = safeCanon(spk.role);
        if (!roles.includes(canon)) return spk;
        const cm = String(spk.model || '').trim().toLowerCase();
        if (!cm || cm === 'off' || cm === 'none') return { ...spk, model: globalSurroundModel };
        return spk;
      });
    };
    if (_sevenBedLayoutType === 'wides' && !hasWides && hasRears) {
      if (globalThis.__B44_LOGS) debug('[Speakers] Switching SBL/SBR -> LW/RW');
      const lw = cloneRoleWithModel(byRole, 'SBL', 'LW', globalSurroundModel || hint);
      lw.position = { x: stableDimensions.width * 0.15, y: stableDimensions.length * 0.4, z: earZ };
      const rw = cloneRoleWithModel(byRole, 'SBR', 'RW', globalSurroundModel || hint);
      rw.position = { x: stableDimensions.width * 0.85, y: stableDimensions.length * 0.4, z: earZ };
      const nextList = currentSpeakers.filter((s) => s.role !== 'SBL' && s.role !== 'SBR').concat([lw, rw]);
      setSpeakers((prev) => { let merged = mergePreserveOverheads(prev, nextList, dolbyPreset); merged = applyGlobalModelToRoles(merged, ['LW', 'RW']); if (speakersEqual(prev, merged)) return prev; return merged; });
    } else if (_sevenBedLayoutType === 'rears' && hasWides && !hasRears) {
      if (globalThis.__B44_LOGS) debug('[Speakers] Switching LW/RW -> SBL/SBR');
      const sbl = cloneRoleWithModel(byRole, 'LW', 'SBL', globalSurroundModel || hint);
      sbl.position = { x: stableDimensions.width * 0.25, y: stableDimensions.length - 0.1, z: earZ };
      const sbr = cloneRoleWithModel(byRole, 'RW', 'SBR', globalSurroundModel || hint);
      sbr.position = { x: stableDimensions.width * 0.75, y: stableDimensions.length - 0.1, z: earZ };
      const nextList = currentSpeakers.filter((s) => s.role !== 'LW' && s.role !== 'RW').concat([sbl, sbr]);
      setSpeakers((prev) => { let merged = mergePreserveOverheads(prev, nextList, dolbyPreset); merged = applyGlobalModelToRoles(merged, ['SBL', 'SBR']); if (speakersEqual(prev, merged)) return prev; return merged; });
    }
  }, [_sevenBedLayoutType, dolbyPreset, placedSpeakers, setSpeakers, stableDimensions.width, stableDimensions.length, _isFrozen]);

  // Speaker reconciliation extracted to useSpeakerReconciliation hook
  // Clean slate: Free Use (scratch) or immediately after a user-triggered reset
  const isCleanSlateMode = loadState?.phase === "scratch" || !!didUserRequestResetRef.current;

  useSpeakerReconciliation({
    appState, dolbyPreset, stableDimensions, setSpeakers, _isFrozen, placedSpeakers,
    _sevenBedLayoutType, lastPresetRef, _overheadGlobalModel, _overheadFrontOverride,
    _overheadMidOverride, _overheadRearOverride, _useFrontGlobal, _useMidGlobal, _useRearGlobal,
    loadState, resolvedProjectId, projectIdState, didUserRequestResetRef,
    isCleanSlateMode,
  });

  // Overhead seeding (compacted)
  useEffect(() => {
    if (!dolbyPreset || !_overheadGlobalModel) return;
    if (_isFrozen && _isFrozen("speakers")) return;
    const hasProjectId = resolvedProjectId || projectIdState;
    if (loadState?.phase === "loaded" && hasProjectId) return;
    const normalized = String(dolbyPreset).split(" ")[0].split("_")[0];
    const parts = normalized.split(".");
    const heights = parts.length >= 3 ? parseInt(parts[2], 10) || 0 : 0;
    if (!heights) return;
    const hasAnyOverheads = Array.isArray(placedSpeakers) && placedSpeakers.some((spk) => safeCanon(spk.role || "").startsWith("T"));
    if (hasAnyOverheads) return;
    setSpeakers((prev) => ensureAtmosOverheads({ placedSpeakers: prev, dolbyPreset, roomDimensions: stableDimensions, overheadGlobalModel: _overheadGlobalModel, overheadFrontOverride: _overheadFrontOverride, overheadMidOverride: _overheadMidOverride, overheadRearOverride: _overheadRearOverride, useFrontGlobal: _useFrontGlobal, useMidGlobal: _useMidGlobal, useRearGlobal: _useRearGlobal }));
  }, [dolbyPreset, placedSpeakers, _overheadGlobalModel, _overheadFrontOverride, _overheadMidOverride, _overheadRearOverride, _useFrontGlobal, _useMidGlobal, _useRearGlobal, setSpeakers, _isFrozen]);

  // Seating rebuild extracted to useSeatingRebuild hook
  useSeatingRebuild({
    appState, resolvedProjectId, projectIdState, loadState, seatingConfigEpoch,
    seatingLoadedEpochRef, didUserRequestResetRef, _seatsPerRowByRow, _seatingRows,
    _seatsPerRow, _seatSpacing, _rowSpacingM, _mlpBasis, seatingArrangementBasis,
    stableDimensions,
    _rowEarHeights: appState?.rowEarHeights,
  });

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

  // Normalise isPrimary flags: mark the seat closest to mlpAnchorEffective as primary.
  // This is now independent of seatingArrangementBasis.
  useEffect(() => {
    const prev = Array.isArray(_seatingPositions) ? _seatingPositions : [];
    if (prev.length === 0) return;

    const anchor = mlpAnchorEffective;

    // Find id of the seat closest to the fixed RSP anchor
    let closestId = null;
    if (anchor && Number.isFinite(anchor.y)) {
      let minDist = Infinity;
      for (const seat of prev) {
        const dx = (Number(seat.x) || 0) - anchor.x;
        const dy = (Number(seat.y) || 0) - anchor.y;
        const dist = Math.hypot(dx, dy);
        if (dist < minDist) { minDist = dist; closestId = seat.id; }
      }
    } else {
      closestId = prev[0]?.id;
    }

    // Only update if any isPrimary flag differs from what we want
    const flagsChanged = prev.some(s => !!s.isPrimary !== (s.id === closestId));
    if (!flagsChanged) return;

    const seatsWithFlags = prev.map(s => ({ ...s, isPrimary: s.id === closestId }));
    (appState?.setSeatingPositions || (() => {}))(seatsWithFlags);
  }, [_seatingPositions, mlpAnchorEffective, appState?.setSeatingPositions]);

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
      const bedSpeakers = spks.filter((s) => bedRoles.has(String(s.role).toUpperCase())).map((s) => ({ id: String(s.id || s.role), role: String(s.role).toUpperCase(), position: { x: Number(s.position?.x) || 0, y: Number(s.position?.y) || 0 } }));
      if (bedSpeakers.length < 2) return;
      const pads = getBedPads({ dimensions: stableDimensions, seatingPositions: _seatingPositions });
      // Use the fixed RSP anchor exclusively. If unavailable, fall back to room centre.
      const mlpForOptimization = mlpAnchorEffective || {
        x: stableDimensions.width / 2,
        y: stableDimensions.length * 0.6,
        z: 1.2,
      };
      const eq = equalizeBedAngles({ dimensions: { width: stableDimensions.width, length: stableDimensions.length }, mlp: mlpForOptimization, speakers: bedSpeakers, pads, targets: [50, 60, 80], weights: { evenness: 1.0, pad: 5.0, target: 0.6 }, steps: 250 });
      const byId = new Map(eq.map((s) => [s.id, s]));
      const surRoles = new Set(["FWL", "FWR", "LW", "RW", "SL", "SR", "LS", "RS", "LRS", "RRS", "SBL", "SBR", "LR", "RR"]);
      const surrogate = spks.filter((s) => surRoles.has(String(s.role).toUpperCase())).map((s) => ({ position: { x: byId.get(String(s.id || s.role))?.position?.x ?? s.position?.x ?? 0, y: byId.get(String(s.id || s.role))?.position?.y ?? s.position?.y ?? 0 } }));
      const gaps = surrogate.length ? surrogate.length === 2 ? [backSweepGap2(mlpForOptimization, surrogate[0].position, surrogate[1].position)] : backSweepGaps(mlpForOptimization, surrogate.map((p) => ({ position: p.position }))) : [];
      let maxGap = gaps.length ? Math.max(...gaps) : 0;
      if (maxGap < 80) { for (const item of eq) { const pad = pads[item.role]; if (!pad) continue; const EPS = 0.03; if (pad.axis === "y") { const mid = (pad.min + pad.max) / 2; item.position.y += item.position.y >= mid ? EPS : -EPS; item.position.y = Math.max(pad.min, Math.min(pad.max, item.position.y)); } else { const mid = (pad.min + pad.max) / 2; item.position.x += item.position.x >= mid ? EPS : -EPS; item.position.x = Math.max(pad.min, Math.min(pad.max, item.position.x)); } } }
      const byIdAfter = new Map(eq.map((s) => [s.id, s]));
      const merged = spks.map((s) => { const k = String(s.id || s.role); const u = byIdAfter.get(k); if (!u) return s; return { ...s, position: { ...(s.position || {}), x: u.position.x, y: u.position.y } }; });
      if (globalThis.__B44_LOGS) console.log('[RD] optimiseAll -> roles', merged.map((s) => safeCanon(s.role)));
      setSpeakers((prev) => mergePreserveOverheads(prev, merged, dolbyPreset));
    } catch (e) { if (globalThis.__B44_LOGS) console.error("[OptimiseAll] failed:", e); }
  }, [placedSpeakers, stableDimensions, _seatingPositions, seatingArrangementBasis, _isFrozen, setSpeakers, mlpAnchorEffective]);

  // Front Elevation LCR drag callback
  const handleLcrSpeakerMoved = useCallback(({ role, newX, newZ, axis }) => {
    const rW = stableDimensions.widthM || stableDimensions.width || 4.5;

    // Determine if all three LCR speakers share the same model (locked-together mode)
    const getModel = (r) => {
      const spk = placedSpeakers.find(s => safeCanon(s.role) === r);
      return spk?.model || null;
    };
    const flModel = getModel('FL');
    const fcModel = getModel('FC');
    const frModel = getModel('FR');
    const allSameModel = flModel && fcModel && frModel && flModel === fcModel && fcModel === frModel;

    setSpeakers(prev => prev.map(spk => {
      const canon = safeCanon(spk.role);
      const isLcrRole = canon === 'FL' || canon === 'FC' || canon === 'FR';

      if (canon === role) {
        return {
          ...spk,
          position: {
            ...spk.position,
            ...(axis === 'x' ? { x: newX } : {}),
            ...(axis === 'z' ? { z: newZ } : {}),
          },
        };
      }
      // FL <-> FR horizontal symmetry
      if (axis === 'x' && role === 'FL' && canon === 'FR') {
        return { ...spk, position: { ...spk.position, x: rW - newX } };
      }
      if (axis === 'x' && role === 'FR' && canon === 'FL') {
        return { ...spk, position: { ...spk.position, x: rW - newX } };
      }
      // Vertical: if all same model, lock all three LCR together
      if (axis === 'z' && isLcrRole) {
        if (allSameModel) {
          return { ...spk, position: { ...spk.position, z: newZ } };
        }
        // Different models: only keep FL/FR paired
        if ((role === 'FL' || role === 'FR') && (canon === 'FL' || canon === 'FR')) {
          return { ...spk, position: { ...spk.position, z: newZ } };
        }
      }
      return spk;
    }));

    // When dragging vertically, update the shared lcrHeightM so the field
    // and Acoustic Centre Guidance stay in sync with the drag
    if (axis === 'z') {
      appState?.updateGlobalSpl?.({ lcrHeightM: newZ });
    }
  }, [setSpeakers, stableDimensions.widthM, stableDimensions.width, placedSpeakers, appState?.updateGlobalSpl]);

  // Front Elevation subwoofer drag callback
  const handleFrontSubMoved = useCallback(({ index, newX, newZ, axis }) => {
    const roomW = stableDimensions.widthM || stableDimensions.width || 4.5;

    // 1. Immediate visual update
    setSubwoofers(prev => {
      if (!Array.isArray(prev)) return prev;
      const frontSubs = prev.filter(s => s?.group === 'front');
      const isPaired = frontSubs.length === 2;
      let frontCount = -1;
      return prev.map(sub => {
        if (sub?.group !== 'front') return sub;
        frontCount++;
        if (axis === 'x' && isPaired) {
          // Paired x: dragged sub gets newX, other gets mirror
          const mirrorX = roomW - newX;
          const thisX = frontCount === index ? newX : mirrorX;
          return { ...sub, position: { ...(sub.position || {}), x: thisX } };
        }
        if (axis === 'z' && isPaired) {
          // Paired z: both get same height
          return { ...sub, position: { ...(sub.position || {}), z: newZ } };
        }
        // Independent: only update the dragged sub
        if (frontCount !== index) return sub;
        return { ...sub, position: { ...(sub.position || {}), ...(axis === 'x' ? { x: newX } : {}), ...(axis === 'z' ? { z: newZ } : {}) } };
      });
    });

    // 2. Persist to config source-of-truth
    if (axis === 'x' && typeof appState?.setFrontSubsCfg === 'function') {
      appState.setFrontSubsCfg(prev => {
        const frontCount = (appState?.subwoofers || []).filter(s => s?.group === 'front').length;
        const isPaired = frontCount === 2;
        const positions = Array.isArray(prev?.positions) ? [...prev.positions] : [];
        if (isPaired) {
          while (positions.length < 2) positions.push({});
          const mirrorX = roomW - newX;
          positions[index] = { ...(positions[index] || {}), x: newX };
          positions[1 - index] = { ...(positions[1 - index] || {}), x: mirrorX };
        } else {
          while (positions.length <= index) positions.push({});
          positions[index] = { ...(positions[index] || {}), x: newX };
        }
        return { ...prev, positions, isManual: true };
      });
    }

    if (axis === 'z' && typeof appState?.setFrontSubsCfg === 'function') {
      const model = _frontSubsCfg?.model || '';
      const orientation = _frontSubsCfg?.orientation;
      const meta = getSpeakerModelMeta(model, orientation) || {};
      const subH = Number(meta.heightM);
      const resolvedH = Number.isFinite(subH) && subH > 0 ? subH : 0.50;
      const bottomHeightM = Math.max(0, newZ - resolvedH / 2);
      appState.setFrontSubsCfg(prev => ({ ...prev, bottomHeightM }));
    }
  }, [setSubwoofers, appState?.setFrontSubsCfg, _frontSubsCfg, _frontSubsCfg?.orientation, stableDimensions.widthM, stableDimensions.width, appState?.subwoofers]);

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

  // Subwoofer sync extracted to useSubwooferSync hook (must be before any conditional return)
  useSubwooferSync({ appState, stableDimensions, frontSubsCfg: _frontSubsCfg, rearSubsCfg: _rearSubsCfg });

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
    showRoomModesOverlay,
  } = appState;

  const updateGlobalSplWithProjectSync = (patch) => {
    appState?.updateGlobalSpl?.(patch);
  };

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

      <NewProjectDialog
        open={showNewProjectDialog}
        onOpenChange={setShowNewProjectDialog}
        onProjectCreated={handleNewProjectCreated}
      />

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
        activeProjectId={activeProjectId}
        isProjectMode={isProjectMode}
        onFreeUse={handleFreeUse}
        onNewProject={handleNewProject}
        onSaveToExistingProject={handleSaveToExistingProject}
        existingProjects={existingProjects}
      />

      <ResizableTwoColumnLayout
        initialLeftWidth={720}
        minLeftWidth={480}
        minRightWidth={420}
        leftContent={(
          <>

        <section
          className="relative bg-white border border-[#DCDBD6] rounded-2xl overflow-hidden"
          style={{
            minWidth: 0,
            minHeight: 0,
            height: "calc(100vh - 152px)"
          }}>

          {/* View selector bar */}
          <div style={{ display: 'flex', gap: 2, padding: '6px 10px', borderBottom: '1px solid #DCDBD6', background: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16 }}>
            {[['plan', 'PLAN VIEW'], ['front', 'FRONT ELEVATION'], ['side', 'SIDE ELEVATION']].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setLeftPanelView(key)}
                style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', padding: '4px 10px', borderRadius: 6, border: leftPanelView === key ? '1px solid #213428' : '1px solid transparent', background: leftPanelView === key ? '#213428' : 'transparent', color: leftPanelView === key ? '#fff' : '#625143', cursor: 'pointer', transition: 'all 0.15s' }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Plan toolbar — only shown in plan view */}
          {leftPanelView === 'plan' && <RoomDesignerPlanToolbar
            allowExtraSurrounds={allowExtraSurrounds}
            extraSurroundCount={appState?.extraSurroundCount}
            dolbyPreset={dolbyPreset}
            frontSubsCfg={_frontSubsCfg}
            rearSubsCfg={_rearSubsCfg}
            overlayRelevance={overlayRelevance}
            overlays={_overlays}
            setOverlays={_setOverlays}
            enableFrontWides={_enableFrontWides}
            setEnableFrontWides={_setEnableFrontWides}
            freeMoveLcr={freeMoveLcr}
            setFreeMoveLcr={setFreeMoveLcr}
            zoomMode={zoomMode}
            setZoomMode={setZoomMode}
          />}

          {/* Content area */}
          <div style={{ height: leftPanelView === 'plan' ? 'calc(100% - 76px)' : 'calc(100% - 44px)', overflow: 'auto' }}>
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
                {leftPanelView === 'plan' && <RoomVisualisation
                  ref={visualisationRef}
                  mlpPoint={mlpAnchorEffective}
                  analysisResult={analysisResult || {}}
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
                  onSetRoomElements={appState?.setRoomElements}
                  dolbyLayout={dolbyPreset}
                  aimAtMLP={lcrAimMode === "angled"}
                  onLcrAngleComputed={setLcrAngleDeg}
                  rowTarget={null}
                  viewingDistanceOffsetM={_seatingBlockOffset}
                  setSeatingBlockOffsetGuarded={setSeatingBlockOffsetGuarded}
                  mlpBasis={seatingArrangementBasis}
                  rp22AnglesEnabled={_overlays?.RP22_ANGLES}
                  allSeatSplMetrics={allSeatSplMetrics}
                  speakerPositionsView={speakerPositionsView}
                  showMlpRuler={showMlpRuler}
                  zoomMode={zoomMode}
                  onZoomModeChange={setZoomMode}
                  isDraggingRef={isDraggingRef}
                  extraSurroundCount={appState?.extraSurroundCount ?? 0}
                  showRoomModesOverlay={showRoomModesOverlay}
                  freeMoveLcr={freeMoveLcr}
                  rspMode={appState?.rspMode || "auto_from_screen"}
                  onSetManualRspY_m={appState?.setManualRspY_m} />}

                {leftPanelView === 'front' && (
                  <FrontElevation
                    dimensions={stableDimensions}
                    screen={_screen}
                    placedSpeakers={placedSpeakers}
                    frontSubs={frontSubsForRendering}
                    frontSubsCfg={frontSubsCfg}
                    onLcrSpeakerMoved={handleLcrSpeakerMoved}
                    onFrontSubMoved={handleFrontSubMoved}
                    isDraggingRef={isDraggingRef}
                  />
                )}

                {leftPanelView === 'side' && (
                  <>
                    {/* Left/Right wall toggle */}
                    <div style={{ display: 'flex', gap: 4, padding: '6px 12px', borderBottom: '1px solid #DCDBD6', background: '#FAFAF8' }}>
                      <span style={{ fontSize: 10, color: '#9B9890', fontWeight: 600, letterSpacing: '0.06em', alignSelf: 'center', marginRight: 4 }}>VIEWING WALL:</span>
                      {['left', 'right'].map(w => (
                        <button
                          key={w}
                          onClick={() => setSideElevationWall(w)}
                          style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', padding: '3px 10px', borderRadius: 5, border: sideElevationWall === w ? '1px solid #213428' : '1px solid #DCDBD6', background: sideElevationWall === w ? '#213428' : '#fff', color: sideElevationWall === w ? '#fff' : '#625143', cursor: 'pointer' }}
                        >
                          {w.toUpperCase()} WALL
                        </button>
                      ))}
                    </div>
                    <SideElevation
                      dimensions={stableDimensions}
                      screen={_screen}
                      seatingPositions={_seatingPositions}
                      mlpPoint={mlpAnchorEffective}
                      roomElements={_roomElements}
                      placedSpeakers={placedSpeakers}
                      frontSubs={frontSubsForRendering}
                      frontSubsCfg={frontSubsCfg}
                      rearSubs={rearSubsForRendering}
                      rearSubsCfg={rearSubsCfg}
                      wall={sideElevationWall}
                      onScreenHeightFromFloorChange={(h) => setScreenGuarded(prev => ({ ...prev, heightFromFloorM: h }))}
                      onSideSpeakerMoved={({ role, newZ }) => {
                        const PAIRS = { LW: 'RW', RW: 'LW', SL: 'SR', SR: 'SL', SBL: 'SBR', SBR: 'SBL' };
                        const paired = PAIRS[role] || null;
                        setSpeakers(prev => prev.map(s => {
                          const r = String(s.role).toUpperCase();
                          if (r === role || (paired && r === paired)) {
                            return { ...s, position: { ...s.position, z: newZ } };
                          }
                          return s;
                        }));
                      }}
                      onFrontSubHeightChange={(bottomHeightM) => setFrontSubsCfg(prev => ({ ...prev, bottomHeightM }))}
                      onRearSubHeightChange={(bottomHeightM) => setRearSubsCfg(prev => ({ ...prev, bottomHeightM }))}
                    />
                  </>
                )}

              </Suspense>
            </ErrorBoundary>
          </div>

        </section>
          </>
        )}
        rightContent={(
          <RoomDesignerControlsPanel
            appState={appState}
            isFrozen={isFrozen}
            _roomDims={_roomDims}
            _setRoomDims={_setRoomDims}
            roomElements={roomElements}
            setRoomElementsGuarded={setRoomElementsGuarded}
            stableDimensions={stableDimensions}
            _screen={_screen}
            setScreenGuarded={setScreenGuarded}
            seatingPositions={seatingPositions}
            dolbyPreset={dolbyPreset}
            handleGenerateSeating={handleGenerateSeating}
            _seatsPerRowByRow={_seatsPerRowByRow}
            setSeatsPerRowByRowGuarded={setSeatsPerRowByRowGuarded}
            seatsPerRow={seatsPerRow}
            setSeatsPerRowGuarded={setSeatsPerRowGuarded}
            seatingRows={seatingRows}
            setSeatingRowsGuarded={setSeatingRowsGuarded}
            seatSpacing={seatSpacing}
            setSeatSpacingGuarded={setSeatSpacingGuarded}
            _rowSpacingM={_rowSpacingM}
            setRowSpacingGuarded={setRowSpacingGuarded}
            _seatingBlockOffset={_seatingBlockOffset}
            setSeatingBlockOffsetGuarded={setSeatingBlockOffsetGuarded}
            seatingArrangementBasis={seatingArrangementBasis}
            setSeatingArrangementBasis={setSeatingArrangementBasis}
            visualisationRef={visualisationRef}
            showMlpRuler={showMlpRuler}
            setShowMlpRuler={setShowMlpRuler}
            _sevenBedLayoutType={_sevenBedLayoutType}
            setSevenBedLayoutType={setSevenBedLayoutType}
            setDolbyPreset={setDolbyPreset}
            lcrAimMode={lcrAimMode}
            setLcrAimMode={setLcrAimMode}
            lcrAngleDeg={lcrAngleDeg}
            overheadGlobalModelFromState={overheadGlobalModelFromState}
            setOverheadGlobalModelFromState={setOverheadGlobalModelFromState}
            overheadFrontOverrideFromState={overheadFrontOverrideFromState}
            setOverheadFrontOverrideFromState={setOverheadFrontOverrideFromState}
            overheadMidOverrideFromState={overheadMidOverrideFromState}
            setOverheadMidOverrideFromState={setOverheadMidOverrideFromState}
            overheadRearOverrideFromState={overheadRearOverrideFromState}
            setOverheadRearOverrideFromState={setOverheadRearOverrideFromState}
            useFrontGlobalFromState={useFrontGlobalFromState}
            setUseFrontGlobalFromState={setUseFrontGlobalFromState}
            useMidGlobalFromState={useMidGlobalFromState}
            setUseMidGlobalFromState={setUseMidGlobalFromState}
            useRearGlobalFromState={useRearGlobalFromState}
            setUseRearGlobalFromState={setUseRearGlobalFromState}
            allSeatSplMetrics={allSeatSplMetrics}
            updateGlobalSplWithProjectSync={updateGlobalSplWithProjectSync}
            frontWideZones={frontWideZones}
            isNineBedLayout={isNineBedLayout}
            speakerPositionsView={speakerPositionsView}
            setSpeakerPositionsView={setSpeakerPositionsView}
            placedSpeakers={placedSpeakers}
            _seatingPositions={_seatingPositions}
            frontSubsCfg={frontSubsCfg}
            setFrontSubsCfg={setFrontSubsCfg}
            rearSubsCfg={rearSubsCfg}
            setRearSubsCfg={setRearSubsCfg}
            subWarnings={subWarnings}
            frontSubsForRendering={frontSubsForRendering}
            rearSubsForRendering={rearSubsForRendering}
            analysisResult={analysisResult}
            freeMoveLcr={freeMoveLcr}
            showPrices={showPrices}
            setShowPrices={setShowPrices}
            difficultyMultiplier={difficultyMultiplier}
            setDifficultyMultiplier={setDifficultyMultiplier}
            priceData={priceData}
            _frontSubsCfg={_frontSubsCfg}
            _rearSubsCfg={_rearSubsCfg}
            rspMode={appState?.rspMode || "auto_from_screen"}
            onRspModeChange={appState?.setRspMode}
            manualRspY_m={appState?.manualRspY_m ?? null}
            onManualRspY_mChange={appState?.setManualRspY_m}
          />
        )}
      />
    </div>
    </>);

}

// RoomDesignerPage shell is in pages/RoomDesignerPage.jsx
export default RoomDesignerWithState;