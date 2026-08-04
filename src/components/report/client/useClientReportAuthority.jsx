/**
 * useClientReportAuthority
 * ------------------------
 * Page-local, hydration-gated authority hook for the Client Visual Report.
 *
 * Pipeline:
 *   projectId → fetch project → hydrateProjectIntoAppState → wait for hydration
 *   → resolve canonical RSP → useAnalysisSpeakers → compute one memoised P5 snapshot
 *
 * Does NOT mount useRP22AnalysisEngine, useSeatResponses, or RoomVisualisation.
 * The P5 snapshot depends only on settled project geometry.
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
import { useOverheadZonesComputed } from "@/components/room/rv/hooks/useOverheadZonesComputed";

// TV preset → viewable width in inches (matches RoomDesigner TV_KEY_TO_INCHES)
const TV_KEY_TO_INCHES = { tv65: 55.55, tv77: 67.36, tv83: 72.52, tv100: 87.80 };

function resolveScreenVisibleWidthInches(screen) {
  if (!screen) return 120;
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

export function useClientReportAuthority(projectId) {
  const app = useAppState();

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

  const { effectiveRspY_m, rspSourceLabel } = useEffectiveRsp({
    rspMode,
    manualRspY_m,
    screenFrontPlaneM,
    screenWidthM,
    rowCentersM: app?.rowCentersM || [],
    seatingPositions,
    currentMlpY_m,
    rowDerivedRspYByMode,
  });

  // RSP x is always room centre; y from effectiveRspY_m with safe fallback
  const rsp = useMemo(() => {
    const cx = roomDims.widthM / 2;
    const y = Number.isFinite(effectiveRspY_m) ? effectiveRspY_m : currentMlpY_m;
    if (!Number.isFinite(y)) return null;
    return { x: cx, y, z: 1.2 };
  }, [roomDims.widthM, effectiveRspY_m, currentMlpY_m]);

  // ── 5) Analysis speakers (bed-layer, layout-allowed) ─────────────────────
  const placedSpeakers = useMemo(
    () => Array.isArray(app?.speakerSystem?.placedSpeakers) ? app.speakerSystem.placedSpeakers : [],
    [app?.speakerSystem?.placedSpeakers]
  );

  const reportDolbyLayout = app?.dolbyLayout ?? app?.dolbyConfig ?? app?.speakerSystem?.dolbyLayout ?? "5.1";

  const analysisSpeakers = useAnalysisSpeakers({
    placedSpeakers,
    speakerSystem: app?.speakerSystem,
    sevenBedLayoutType: app?.sevenBedLayoutType,
    getSpeakerVisibility: app?.getSpeakerVisibility,
    dolbyPreset: reportDolbyLayout,
  });

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

  // ── 8) Overhead zone bands (preferred placement) ────────────────────────
  const zoneBands = useOverheadZonesComputed({
    seatingPositions,
    heightM: roomDims.heightM,
    widthM: roomDims.widthM,
    lengthM: roomDims.lengthM,
    mlpY_m: rsp?.y,
    mlp: rsp,
    placedSpeakers,
    getCanonicalRole,
  });

  // ── 9) P9 snapshot — overhead spatial resolution ─────────────────────────
  // Uses the SAME production helpers as useRP22AnalysisEngine:
  //   getUpperSpeakersForSeat + computeUpperVerticalAnglesForSeat
  // Level mapping matches the engine exactly (≤50→L4, ≤60→L3, ≤80→L2, else L1).
  const p9Snapshot = useMemo(() => {
    if (!rsp || !analysisSpeakers.length) return null;

    const roomCenterX = roomDims.widthM / 2;
    const rspSeat = { id: "rsp", x: rsp.x, y: rsp.y, z: earHeightM };
    const upperSpeakers = getUpperSpeakersForSeat(rspSeat, analysisSpeakers, getCanonicalRole);

    if (upperSpeakers.length < 2) return null;

    const result = computeUpperVerticalAnglesForSeat(rspSeat, upperSpeakers, roomCenterX);
    const { maxVerticalGapDeg, gaps, rowElevations } = result;

    if (!Number.isFinite(maxVerticalGapDeg)) return null;

    let level9 = 1;
    if (maxVerticalGapDeg <= 50) level9 = 4;
    else if (maxVerticalGapDeg <= 60) level9 = 3;
    else if (maxVerticalGapDeg <= 80) level9 = 2;

    // Merge row elevations by row (combine left+right for side view)
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

    const rowGroups = [];
    for (const group of rowMap.values()) {
      const avgY = group.sumY / group.count;
      const avgZ = group.sumZ / group.count;
      const dz = avgZ - earHeightM;
      const dy = avgY - rsp.y;
      const elevDeg = Math.atan2(dz, dy) * 180 / Math.PI;
      rowGroups.push({
        rowName: group.rowName,
        rowIndex: group.rowIndex,
        avgY,
        avgZ,
        elevDeg,
      });
    }
    rowGroups.sort((a, b) => a.rowIndex - b.rowIndex);

    // Merged gaps for side-view display (front→mid, mid→rear)
    const mergedGaps = [];
    for (let i = 1; i < rowGroups.length; i++) {
      const prev = rowGroups[i - 1];
      const next = rowGroups[i];
      mergedGaps.push({
        fromRow: prev.rowName,
        toRow: next.rowName,
        deg: Math.abs(next.elevDeg - prev.elevDeg),
        fromElevDeg: prev.elevDeg,
        toElevDeg: next.elevDeg,
      });
    }

    return {
      rsp,
      earHeightM,
      rowGroups,
      gaps,
      mergedGaps,
      level: `L${level9}`,
      worstGapDeg: maxVerticalGapDeg,
      zoneBands,
      upperSpeakers,
    };
  }, [rsp, analysisSpeakers, roomDims.widthM, earHeightM, zoneBands]);

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
    p5Snapshot,
    p9Snapshot,
    analysisSpeakers,
  };
}