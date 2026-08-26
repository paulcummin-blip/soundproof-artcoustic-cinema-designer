/**
 * useClientReportAuthority
 * ------------------------
 * Page-local, hydration-gated authority hook for the Visual Report.
 *
 * Pipeline:
 *   projectId → fetch project → hydrateProjectIntoAppState → wait for hydration
 *   → resolve canonical RSP → useAnalysisSpeakers → compute one memoised P5 snapshot
 *
 * Mounts exactly ONE useRP22AnalysisEngine instance (includeBassAnalysis:false) with
 * the same production inputs as RP22Report. Mounts useCompletedBassAuthority for
 * P14/P18/P19/P20. Does NOT mount useSeatResponses, RoomVisualisation, SideElevation,
 * or hidden report captures.
 */

import { useEffect, useMemo, useState } from "react";
import { useAppState } from "@/components/AppStateProvider";
import { base44 } from "@/api/base44Client";
import { hydrateProjectIntoAppState } from "@/components/utils/hydrateProjectIntoAppState";
import { useAnalysisSpeakers } from "@/components/hooks/useAnalysisSpeakers";
import { useEffectiveRsp } from "@/components/room/rsp/useEffectiveRsp";
import { computeMLPAndPrimary } from "@/components/utils/computeMLPAndPrimary";
import { computeSurroundRingGaps, rp22LevelForP5 } from "@/components/utils/p5SurroundGaps";
import { getCanonicalRole } from "@/components/utils/surroundRoleMap";
import { distanceFor57_5FromWidth } from "@/components/room/seatingUtils";
import { getUpperSpeakersForSeat, computeUpperVerticalAnglesForSeat } from "@/components/utils/rp22UpperSeatMetrics";
import { levelP9_upperSpacing } from "@/components/utils/rp22/levels";
import { useOverheadZonesComputed } from "@/components/room/rv/hooks/useOverheadZonesComputed";
import { useRP22AnalysisEngine } from "@/components/hooks/useRP22AnalysisEngine";
import { useCompletedBassAuthority } from "@/components/room/bass/completedBassResultStore";
import { buildComplianceBassPresentation } from "@/components/room/bass/bassCompliancePresentation";
import { computeAllSeatSplMetrics } from "@/components/utils/spl/centralSplEngine";
import { getSpeakerModelMeta } from "@/components/models/speakers/registry";
import { useActiveProjectId } from "@/components/state/project-session";
import { resolveEffectiveVisibleWidthInches, isManualOverrideActive } from "@/components/models/screen/resolveEffectiveScreen";

// TV preset → viewable width in inches (matches RoomDesigner TV_KEY_TO_INCHES)
const TV_KEY_TO_INCHES = { tv65: 55.55, tv77: 67.36, tv83: 72.52, tv100: 87.80 };

function resolveScreenVisibleWidthInches(screen) {
  if (!screen) return 120;
  // Manual override is the single screen-size authority when active.
  if (isManualOverrideActive(screen)) return resolveEffectiveVisibleWidthInches(screen);
  if (screen.tvPresetKey && TV_KEY_TO_INCHES[screen.tvPresetKey]) {
    return TV_KEY_TO_INCHES[screen.tvPresetKey];
  }
  const vwi = Number(screen.visibleWidthInches);
  if (Number.isFinite(vwi) && vwi > 0) return vwi;
  const mw = Number(screen.manualWidthM);
  if (Number.isFinite(mw) && mw > 0) return mw / 0.0254;
  const mh = Number(screen.manualHeightM);
  const ar = Number(screen.aspectRatio);
  if (Number.isFinite(mh) && mh > 0 && Number.isFinite(ar) && ar > 0) {
    return (mh * ar) / 0.0254;
  }
  return 120;
}

function normalizeSeat(seat) {
  if (!seat) return null;
  const x = Number(seat.x ?? seat.position?.x);
  const y = Number(seat.y ?? seat.position?.y);
  const z = Number(seat.z ?? seat.position?.z ?? seat.earHeightM ?? seat.ear_h ?? 1.2);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  return {
    id: seat.id || `seat-${x.toFixed(2)}-${y.toFixed(2)}`,
    x,
    y,
    z,
    isPrimary: seat.isPrimary === true,
  };
}

export function useClientReportAuthority(projectId) {
  const app = useAppState();
  const activeProjectId = useActiveProjectId();

  const [projectDetails, setProjectDetails] = useState(null);
  const [hydrating, setHydrating] = useState(true);
  const [hydratedProjectId, setHydratedProjectId] = useState(null);

  // ── 1) Fetch + hydrate ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    if (!app) return;

    if (!projectId) {
      setProjectDetails(null);
      setHydrating(false);
      setHydratedProjectId(null);
      return;
    }

    // ── FAST PATH (SPA navigation from Room Designer) ──────────────────────
    // If the shared AppStateProvider is already hydrated for the EXACT
    // requested project (identity match via session store + usable hydrated
    // design state via isProjectHydrationReady), skip the redundant network
    // hydration and mark ready immediately. Project details fetched
    // non-blocking. Hard refresh fails this check and falls through to the
    // full fetch/hydrate path below.
    const sharedProviderReady =
      activeProjectId === projectId &&
      app?.isProjectHydrationReady === true &&
      Number.isFinite(Number(app?.roomDims?.widthM)) &&
      Number.isFinite(Number(app?.roomDims?.lengthM));

    if (sharedProviderReady) {
      setHydrating(false);
      setHydratedProjectId(projectId);
      base44.entities.Project.filter({ id: projectId }).then((results) => {
        if (cancelled) return;
        const p = Array.isArray(results) && results.length > 0 ? results[0] : null;
        if (!p) return;
        setProjectDetails({
          id: p.id,
          name: p.name,
          client_name: p.client_name,
          created_date: p.created_date,
        });
      }).catch(() => { /* non-blocking metadata fetch */ });
      return () => { cancelled = true; };
    }

    if (hydratedProjectId === projectId && !hydrating) return;

    setHydrating(true);

    base44.entities.Project.filter({ id: projectId }).then((results) => {
      if (cancelled) return;
      const p = Array.isArray(results) && results.length > 0 ? results[0] : null;
      if (!p) {
        setProjectDetails(null);
        setHydrating(false);
        setHydratedProjectId(null);
        return;
      }
      setProjectDetails({
        id: p.id,
        name: p.name,
        client_name: p.client_name,
        created_date: p.created_date,
      });
      hydrateProjectIntoAppState(p, app, {
        setScreen: app.setScreen,
        setDolbyConfig: app.setDolbyConfig,
        setDolbyPreset: app.setDolbyLayout,
        setSevenBedLayoutType: app.setSevenBedLayoutType,
        setLcrAimMode: app.setLcrAimMode,
        setEnableFrontWides: app.setEnableFrontWides,
        setOverheadGlobalModel: app.setOverheadGlobalModel,
        setOverheadFrontOverride: app.setOverheadFrontOverride,
        setOverheadMidOverride: app.setOverheadMidOverride,
        setOverheadRearOverride: app.setOverheadRearOverride,
        setUseFrontGlobal: app.setUseFrontGlobal,
        setUseMidGlobal: app.setUseMidGlobal,
        setUseRearGlobal: app.setUseRearGlobal,
        setRowSpacingM: app.setRowSpacingM,
        setSeatsPerRowByRow: app.setSeatsPerRowByRow,
        setOverlays: app.setOverlays,
        setSeatingPositions: app.setSeatingPositions,
        setRoomElements: app.setRoomElements,
        setFrontSubsCfg: app.setFrontSubsCfg,
        setRearSubsCfg: app.setRearSubsCfg,
        setSpeakerSystem: app.setSpeakerSystem,
        setSeatingRows: app.setSeatingRows,
        setSeatsPerRow: app.setSeatsPerRow,
        setSeatSpacing: app.setSeatSpacing,
        setMlpBasis: app.setMlpBasis,
        setSeatingBlockOffset: app.setSeatingBlockOffset,
        setRowEarHeights: app.setRowEarHeights,
        setSelectedSpeakersByRole: app.setSelectedSpeakersByRole,
        setSpeakerNodes: app.setSpeakerNodes,
        setGlobalSurroundModel: app.setGlobalSurroundModel,
        setExtraSurroundCount: app.setExtraSurroundCount,
        setRspMode: app.setRspMode,
        setManualRspY_m: app.setManualRspY_m,
      });
      setHydratedProjectId(p.id);
      setHydrating(false);
    }).catch(() => {
      if (cancelled) return;
      setProjectDetails(null);
      setHydrating(false);
      setHydratedProjectId(null);
    });

    return () => { cancelled = true; };
  }, [projectId]);

  // ── 2) Derived room + screen geometry ───────────────────────────────────
  const roomDims = useMemo(() => ({
    widthM: Number(app?.roomDims?.widthM) || 4.5,
    lengthM: Number(app?.roomDims?.lengthM) || 6.0,
    heightM: Number(app?.roomDims?.heightM) || 2.4,
  }), [app?.roomDims?.widthM, app?.roomDims?.lengthM, app?.roomDims?.heightM]);

  // ── 2a) Stable dimensions (mirrors RP22Report) ──────────
  // P1 reads dimensions.widthM / lengthM / heightM, while the legacy contract
  // uses width / length / height. Provide both aliases from the same canonical
  // numeric values so P1 computes non-negative right/rear distances.
  const stableDimensions = useMemo(() => {
    const width = Number(app?.roomDims?.widthM) || 4.5;
    const length = Number(app?.roomDims?.lengthM) || 6.0;
    const height = Number(app?.roomDims?.heightM) || 2.4;
    return { width, length, height, widthM: width, lengthM: length, heightM: height };
  }, [app?.roomDims?.widthM, app?.roomDims?.lengthM, app?.roomDims?.heightM]);

  const screen = app?.screen || {};

  const screenVisibleWidthInches = useMemo(
    () => resolveScreenVisibleWidthInches(screen),
    [screen?.tvPresetKey, screen?.visibleWidthInches, screen?.manualWidthM, screen?.manualHeightM, screen?.aspectRatio]
  );

  const screenWidthM = useMemo(
    () => Number(screenVisibleWidthInches) * 0.0254,
    [screenVisibleWidthInches]
  );

  const screenFrontPlaneM = useMemo(() => {
    const raw = Number(app?.screenFrontPlaneM);
    if (Number.isFinite(raw) && raw > 0) return raw;
    const floatDepth = Number(screen?.floatDepthM);
    if (Number.isFinite(floatDepth) && floatDepth > 0) return floatDepth;
    return 0.20;
  }, [app?.screenFrontPlaneM, screen?.floatDepthM]);

  // ── 3) Seating + row-derived RSP Y by mode ───────────────────────────────
  const seatingPositions = useMemo(
    () => Array.isArray(app?.seatingPositions) ? app.seatingPositions : [],
    [app?.seatingPositions]
  );

  const rowDerivedRspYByMode = useMemo(() => {
    if (!seatingPositions.length) return {};
    try {
      const result = computeMLPAndPrimary(
        seatingPositions,
        roomDims.widthM,
        roomDims.lengthM,
        "front"
      );
      return result?.rowDerivedRspYByMode ?? {};
    } catch {
      return {};
    }
  }, [seatingPositions, roomDims.widthM, roomDims.lengthM]);

  // ── 4) Resolve canonical RSP via useEffectiveRsp ────────────────────────
  const rspMode = app?.rspMode || "auto_from_screen";
  const manualRspY_m = app?.manualRspY_m ?? null;
  const currentMlpY_m = app?.mlpY_m ?? null;

  const manualRspX_m = app?.manualRspX_m ?? null;

  const { effectiveRspX_m, effectiveRspY_m, rspSourceLabel } = useEffectiveRsp({
    rspMode,
    manualRspY_m,
    manualRspX_m,
    roomWidthM: roomDims.widthM,
    screenFrontPlaneM,
    screenWidthM,
    rowCentersM: app?.rowCentersM || [],
    seatingPositions,
    currentMlpY_m,
    rowDerivedRspYByMode,
  });

  // Stage B1: RSP uses canonical green-dot X (effectiveRspX_m) — no centreline reconstruction.
  const rsp = useMemo(() => {
    const x = Number.isFinite(effectiveRspX_m) ? effectiveRspX_m : (roomDims.widthM / 2);
    const y = Number.isFinite(effectiveRspY_m) ? effectiveRspY_m : currentMlpY_m;
    if (!Number.isFinite(y)) return null;
    return { x, y, z: 1.2 };
  }, [roomDims.widthM, effectiveRspX_m, effectiveRspY_m, currentMlpY_m]);

  // ── 5) Analysis speakers (bed-layer, layout-allowed) ─────────────────────
  const placedSpeakers = useMemo(
    () => Array.isArray(app?.speakerSystem?.placedSpeakers) ? app.speakerSystem.placedSpeakers : [],
    [app?.speakerSystem?.placedSpeakers]
  );

  const reportDolbyLayout = app?.dolbyLayout ?? app?.dolbyConfig ?? app?.speakerSystem?.dolbyLayout ?? "5.1";
  const canonicalP2Layout = app?.dolbyLayout ?? app?.dolbyConfig ?? app?.speakerSystem?.dolbyLayout ?? app?.speakerSystem?.dolbyPreset ?? null;

  const analysisSpeakers = useAnalysisSpeakers({
    placedSpeakers,
    speakerSystem: app?.speakerSystem,
    sevenBedLayoutType: app?.sevenBedLayoutType,
    getSpeakerVisibility: app?.getSpeakerVisibility,
    dolbyPreset: reportDolbyLayout,
  });

  // ── 5b) All-seat SPL metrics (mirrors RP22Report exactly) ───────────────
  const mlpBasis = app?.mlpBasis || "front";
  const hasSeats = seatingPositions.length > 0;
  const hasSpeakers = placedSpeakers.length > 0;

  const allSeatSplMetrics = useMemo(() => {
    if (!hasSeats || !hasSpeakers) return [];
    const getCanonicalRoleSpl = (role) => {
      const map = { SL: 'SL', LS: 'SL', SR: 'SR', RS: 'SR', SBL: 'SBL', SBR: 'SBR', LW: 'LW', RW: 'RW', FL: 'FL', L: 'FL', FC: 'FC', C: 'FC', FR: 'FR', R: 'FR', TFL: 'TFL', TFR: 'TFR', TML: 'TML', TMR: 'TMR', TRL: 'TRL', TRR: 'TRR' };
      return map[String(role || '').toUpperCase()] || String(role || '').toUpperCase();
    };
    return computeAllSeatSplMetrics({
      seats: seatingPositions, placedSpeakers, getCanonicalRole: getCanonicalRoleSpl,
      getEffectiveSplInputs: app?.getEffectiveSplInputs || (() => ({ powerW: 100, eqHeadroomDb: 0 })),
      getModelDimsM: (model) => {
        const meta = getSpeakerModelMeta(model);
        if (meta && !meta.notFound) return { ...meta, sensitivity_db_1w_1m: meta.sensitivity_dB_1w1m || 87, power_handling_w: meta.max_power || Infinity, max_spl_cont_db_1m: meta.max_spl || null };
        return { widthM: 0.27, depthM: 0.082, sensitivity_dB_1w1m: 87 };
      },
      screenLoss_dB: Number(app?.splConfig?.screenLossDb) || 0,
      eqHeadroom_dB: Number(app?.splConfig?.globalEqHeadroomDb) || 0,
      mlpPoint: rsp,
    });
  }, [seatingPositions, placedSpeakers, rsp, app?.splConfig, app?.getEffectiveSplInputs, hasSeats, hasSpeakers]);

  // ── 5c) Canonical RP22 analysis engine (exactly one mount, same inputs as RP22Report) ──
  const analysisResult = useRP22AnalysisEngine({
    diagnosticOwner: "client-report-authority",
    placedSpeakers,
    visiblePlanSpeakers: analysisSpeakers,
    seatingPositions,
    dimensions: stableDimensions,
    mlpBasis,
    sevenBedLayoutType: app?.sevenBedLayoutType,
    extraSurroundCount: app?.extraSurroundCount,
    seatSplMetrics: allSeatSplMetrics,
    mlpPointOverride: rsp,
    overheadState: { globalModel: app?.overheadGlobalModel, frontOverride: app?.overheadFrontOverride, midOverride: app?.overheadMidOverride, rearOverride: app?.overheadRearOverride, useFrontGlobal: app?.useFrontGlobal ?? true, useMidGlobal: app?.useMidGlobal ?? true, useRearGlobal: app?.useRearGlobal ?? true, aimFrontWidesAtMLP: app?.aimFrontWidesAtMLP, aimSideSurroundsAtMLP: app?.aimSideSurroundsAtMLP, aimRearSurroundsAtMLP: app?.aimRearSurroundsAtMLP },
    aimState: { aimFrontWidesAtMLP: app?.aimFrontWidesAtMLP, aimSideSurroundsAtMLP: app?.aimSideSurroundsAtMLP, aimRearSurroundsAtMLP: app?.aimRearSurroundsAtMLP, lcrAimMode: app?.lcrAimMode },
    p15ConstructionLevel: app?.p15ConstructionLevel,
    screen,
    dolbyLayout: canonicalP2Layout,
    includeBassAnalysis: false,
  });

  // ── 5d) Completed bass authority (lightweight useSyncExternalStore, no engine) ──
  const completedBassAuthority = useCompletedBassAuthority(projectId || "free");
  const completedBassContract = completedBassAuthority.contract;
  const bassErrorMessage = completedBassAuthority.errorMessage || null;
  const bassPresentation = useMemo(
    () => buildComplianceBassPresentation({ completedBassAuthority }, bassErrorMessage),
    [completedBassAuthority, bassErrorMessage]
  );

  // ── 6) P5 snapshot — depends only on settled RSP + analysis speakers ─────
  const p5Snapshot = useMemo(() => {
    if (!rsp || !analysisSpeakers.length) return null;

    const ringGaps = computeSurroundRingGaps({
      seat: rsp,
      speakers: analysisSpeakers,
      getCanonicalRole,
    });

    const worstGapDeg = ringGaps.worstGapDeg;
    const level = rp22LevelForP5(worstGapDeg);

    // Bed-layer speakers for display (exclude overheads)
    const bedSpeakers = analysisSpeakers.filter((s) => {
      const canon = getCanonicalRole(s?.role);
      return !canon.startsWith("T") && !canon.startsWith("U");
    });

    // Azimuth from RSP for each bed speaker
    const azimuthDegFromRsp = (pt) => {
      if (!rsp || !pt) return null;
      const dx = Number(pt.x) - Number(rsp.x);
      const dy = Number(pt.y) - Number(rsp.y);
      if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
      const rad = Math.atan2(dx, -dy);
      let deg = rad * (180 / Math.PI);
      if (deg > 180) deg -= 360;
      if (deg <= -180) deg += 360;
      return deg;
    };

    const speakersWithAzimuth = bedSpeakers
      .map((s) => ({
        speaker: s,
        role: s.role,
        canon: getCanonicalRole(s.role),
        azimuth: azimuthDegFromRsp(s.position),
        position: s.position,
      }))
      .filter((item) => item.azimuth !== null && Number.isFinite(item.azimuth))
      .sort((a, b) => a.azimuth - b.azimuth);

    return {
      rsp,
      rspSourceLabel,
      worstGapDeg,
      level,
      gaps: ringGaps.gaps,
      sortedSurrounds: ringGaps.sortedSurrounds,
      speakersWithAzimuth,
      eligibleSurroundCount: ringGaps.sortedSurrounds.length,
    };
  }, [rsp, analysisSpeakers, rspSourceLabel]);

  // ── 7) Ear height ───────────────────────────────────────────────────────
  const earHeightM = useMemo(() => {
    const rowHeights = Array.isArray(app?.rowEarHeights) ? app.rowEarHeights : [];
    const validRowHeights = rowHeights.map(Number).filter((h) => Number.isFinite(h) && h > 0);
    if (validRowHeights.length > 0) {
      return validRowHeights.reduce((a, b) => a + b, 0) / validRowHeights.length;
    }
    if (seatingPositions.length > 0) {
      const heights = seatingPositions
        .map((s) => Number(s?.earHeightM ?? s?.ear_h ?? s?.z ?? s?.position?.z))
        .filter((h) => Number.isFinite(h) && h > 0);
      if (heights.length > 0) {
        return heights.reduce((a, b) => a + b, 0) / heights.length;
      }
    }
    return 1.2;
  }, [app?.rowEarHeights, seatingPositions]);

  // ── 8) Authoritative P9 seat (Technical-equivalent locked-seat rule) ──────
  // Seat selection order (Client pure-helper path):
  //   1. closest real seat to effective RSP, only when within 0.05 m
  //   2. first real seatingPosition marked isPrimary
  //   3. first available real seat
  // Do not use the synthetic RSP as the authoritative P9 seat.
  const authoritativeSeat = useMemo(() => {
    if (!rsp || !seatingPositions.length) return null;

    const normalized = seatingPositions.map(normalizeSeat).filter(Boolean);
    if (normalized.length === 0) return null;

    // 1. Closest real seat within 0.05 m of effective RSP
    let closest = null;
    let closestDist = Infinity;
    for (const seat of normalized) {
      const dist = Math.hypot(seat.x - rsp.x, seat.y - rsp.y);
      if (dist < closestDist) {
        closestDist = dist;
        closest = seat;
      }
    }
    if (closest && closestDist <= 0.05) return closest;

    // 2. First real primary seat
    const primary = normalized.find((s) => s.isPrimary);
    if (primary) return primary;

    // 3. First available real seat (closest fallback)
    return closest || normalized[0];
  }, [rsp, seatingPositions]);

  // ── 9) Overhead zone bands (preferred placement) ────────────────────────
  // zoneBands must use the authoritative seat, not the synthetic RSP.
  const zoneBands = useOverheadZonesComputed({
    seatingPositions,
    heightM: roomDims.heightM,
    widthM: roomDims.widthM,
    lengthM: roomDims.lengthM,
    mlpY_m: authoritativeSeat?.y,
    mlp: authoritativeSeat,
    placedSpeakers,
    getCanonicalRole,
  });

  // ── 10) P9 snapshot — overhead spatial resolution ─────────────────────────
  // Uses the SAME production helpers as useRP22AnalysisEngine:
  //   getUpperSpeakersForSeat + computeUpperVerticalAnglesForSeat + levelP9_upperSpacing
  // Uses raw placedSpeakers (not filtered analysisSpeakers) for authoritative P9.
  // Uses the authoritative locked seat (not synthetic RSP) for P9 grading.
  // Representative (averaged) row positions are visual-only.
  const p9Snapshot = useMemo(() => {
    if (!rsp || !placedSpeakers.length) return null;

    // Stage B1: P9 headline geometry uses the synthetic green-dot RSP (rsp),
    // not the nearest real authoritativeSeat. authoritativeSeat is retained
    // in the return object for presentation/identification only.
    const p9RefSeat = { ...rsp, id: "mlp", isPrimary: true };
    const roomCenterX = roomDims.widthM / 2;
    const upperSpeakers = getUpperSpeakersForSeat(p9RefSeat, placedSpeakers, getCanonicalRole);

    // A. No overheads
    if (upperSpeakers.length === 0) {
      return {
        authoritativeSeatId: authoritativeSeat.id,
        authoritativeSeat,
        value: null,
        level: "N/A",
        worstGapDeg: null,
        rowElevations: [],
        gaps: [],
        representativeRows: [],
        representativeGaps: [],
        applicable: false,
        reason: "no_overhead_speakers",
        upperSpeakers: [],
        zoneBands,
        rsp,
        earHeightM,
      };
    }

    const result = computeUpperVerticalAnglesForSeat(p9RefSeat, upperSpeakers, roomCenterX);
    const { maxVerticalGapDeg, gaps, worstGap, rowElevations } = result;

    // Build representative rows for visual drawing (merge left+right by row)
    const rowMap = new Map();
    for (const elev of rowElevations) {
      if (!rowMap.has(elev.rowName)) {
        rowMap.set(elev.rowName, {
          rowName: elev.rowName,
          rowIndex: elev.rowIndex,
          sumY: 0,
          sumZ: 0,
          count: 0,
        });
      }
      const group = rowMap.get(elev.rowName);
      group.sumY += elev.avgY;
      group.sumZ += elev.avgZ;
      group.count += 1;
    }

    const representativeRows = [];
    for (const group of rowMap.values()) {
      const avgY = group.sumY / group.count;
      const avgZ = group.sumZ / group.count;
      const dz = avgZ - p9RefSeat.z;
      const dy = avgY - p9RefSeat.y;
      const elevDeg = Math.atan2(dz, dy) * 180 / Math.PI;
      representativeRows.push({
        rowName: group.rowName,
        rowIndex: group.rowIndex,
        avgY,
        avgZ,
        elevDeg,
      });
    }
    representativeRows.sort((a, b) => a.rowIndex - b.rowIndex);

    // Representative gaps for side-view display (front→mid, mid→rear)
    const representativeGaps = [];
    for (let i = 1; i < representativeRows.length; i++) {
      const prev = representativeRows[i - 1];
      const next = representativeRows[i];
      representativeGaps.push({
        fromRow: prev.rowName,
        toRow: next.rowName,
        deg: Math.abs(next.elevDeg - prev.elevDeg),
        fromElevDeg: prev.elevDeg,
        toElevDeg: next.elevDeg,
      });
    }

    // B. Single overhead row: P9 not applicable
    if (!Number.isFinite(maxVerticalGapDeg) || representativeRows.length < 2) {
      return {
        authoritativeSeatId: authoritativeSeat.id,
        authoritativeSeat,
        value: null,
        level: "N/A",
        worstGapDeg: null,
        rowElevations,
        gaps: [],
        representativeRows,
        representativeGaps,
        applicable: false,
        reason: "single_overhead_row",
        upperSpeakers,
        zoneBands,
        rsp,
        earHeightM,
      };
    }

    // C. Two or three overhead rows: authoritative P9
    const levelResult = levelP9_upperSpacing(maxVerticalGapDeg);

    return {
      authoritativeSeatId: authoritativeSeat.id,
      authoritativeSeat,
      value: maxVerticalGapDeg,
      level: levelResult.level,
      worstGapDeg: worstGap?.deg ?? maxVerticalGapDeg,
      rowElevations,
      gaps,
      representativeRows,
      representativeGaps,
      applicable: true,
      reason: null,
      upperSpeakers,
      zoneBands,
      rsp,
      earHeightM,
    };
  }, [authoritativeSeat, placedSpeakers, roomDims.widthM, earHeightM, zoneBands, rsp]);

  // ── 10a) Canonical display override — P5/P9 display fields from perSeatRp22 ──
  // Helper geometry (gaps, rows, arcs, speaker positions) is preserved for drawing.
  // Display fields (level, worstGapDeg/value) are overridden from canonical perSeatRp22
  // when available. Helper originals are retained as geometryWorstGapDeg / geometryLevel
  // so the parity safeguard can still compare helper vs canonical.
  // Client P5 is intentionally RSP-based (not canonical per-seat).
  // canonicalP5 override removed — p5Snapshot already computes from the effective RSP.
  // Stage B1: P9 headline reads the synthetic green-dot RSP (id="mlp") from the engine,
  // matching the live engine's canonical RSP — not the nearest real authoritativeSeat.
  const canonicalP9 = useMemo(() => {
    if (!analysisResult || !rsp) return null;
    const c = analysisResult.perSeatRp22?.["mlp"]?.rp22?.[9];
    return (c && Number.isFinite(c.value)) ? c : null;
  }, [analysisResult, rsp]);

  // Client P5 is RSP-based. p5Snapshot already computes from the effective RSP
  // via computeSurroundRingGaps + rp22LevelForP5. The real-seat engine result
  // remains in analysisResult for the Technical Report and future seat maps.
  const p5SnapshotFinal = useMemo(() => {
    if (!p5Snapshot) return null;
    return {
      ...p5Snapshot,
      geometryWorstGapDeg: p5Snapshot.worstGapDeg,
      geometryLevel: p5Snapshot.level,
    };
  }, [p5Snapshot]);

  const p9SnapshotFinal = useMemo(() => {
    if (!p9Snapshot) return null;
    const geometryWorstGapDeg = p9Snapshot.worstGapDeg;
    const geometryLevel = p9Snapshot.level;
    if (!canonicalP9) {
      return { ...p9Snapshot, canonical: false, geometryWorstGapDeg, geometryLevel };
    }
    return {
      ...p9Snapshot,
      level: canonicalP9.level ?? geometryLevel,
      value: canonicalP9.value ?? p9Snapshot.value,
      formatted: canonicalP9.formatted ?? null,
      status: canonicalP9.status ?? null,
      canonical: true,
      geometryWorstGapDeg,
      geometryLevel,
    };
  }, [p9Snapshot, canonicalP9]);

  // ── 10b) P5/P9 parity safeguard — development-only divergence warnings ────
  // Compares helper geometry (geometryWorstGapDeg) against canonical perSeatRp22 values.
  // Display fields are already canonical in the final snapshots; this warns if the
  // helper geometry diverges from the canonical engine result by more than 0.5°.
  useEffect(() => {
    if (!analysisResult || !rsp) return;
    const isDev = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV;
    if (!isDev) return;

    // P5 is intentionally RSP-based for the Client Report; no canonical parity check.
    // P9 headline is canonical green-dot RSP; warn on helper vs engine divergence.
    if (p9SnapshotFinal && p9SnapshotFinal.applicable && canonicalP9 && Number.isFinite(canonicalP9.value) && Number.isFinite(p9SnapshotFinal.geometryWorstGapDeg)) {
      const delta = Math.abs(p9SnapshotFinal.geometryWorstGapDeg - canonicalP9.value);
      if (delta > 0.5) {
        console.warn(`[ClientReportAuthority] P9 divergence: helper=${p9SnapshotFinal.geometryWorstGapDeg.toFixed(1)}° canonical=${canonicalP9.value.toFixed(1)}° (rsp=mlp)`);
      }
    }
  }, [analysisResult, rsp, p9SnapshotFinal, canonicalP9]);

  return {
    projectId,
    projectDetails,
    hydrating,
    hydrated: hydratedProjectId === projectId && !hydrating,
    roomDims,
    screen,
    screenFrontPlaneM,
    screenWidthM,
    rsp,
    rspSourceLabel,
    p5Snapshot: p5SnapshotFinal,
    p9Snapshot: p9SnapshotFinal,
    analysisSpeakers,
    // Canonical authorities (Stage B)
    analysisResult,
    completedBassAuthority,
    completedBassContract,
    bassPresentation,
    allSeatSplMetrics,
    authoritativeSeat,
    seatingPositions,
    placedSpeakers,
  };
}