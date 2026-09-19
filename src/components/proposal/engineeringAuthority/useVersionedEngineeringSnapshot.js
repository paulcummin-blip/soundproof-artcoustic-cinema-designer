/**
 * useVersionedEngineeringSnapshot.js
 * --------------------------------
 * Loads a specific Project + ProjectVersion, hydrates the shared AppState
 * from the version's design_state, runs the canonical RP22 analysis engine,
 * and assembles the frozen Engineering Snapshot via useEngineeringSnapshot.
 *
 * This follows the SAME hydration + engine-mounting pattern as
 * useClientReportAuthority — the snapshot reads from the exact same settled
 * authorities as Room Designer / Compliance / Design Rating.
 *
 * Stage 2A: the snapshot is assembled and stored on the Proposal at
 * generation time. The AI does NOT consume it yet.
 */

import { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useAppState } from '@/components/AppStateProvider';
import { mergeProjectAndVersion, resolveEffectiveVersionId } from '@/lib/versionAuthority';
import { hydrateProjectIntoAppState } from '@/components/utils/hydrateProjectIntoAppState';
import { useAnalysisSpeakers } from '@/components/hooks/useAnalysisSpeakers';
import { useEffectiveRsp } from '@/components/room/rsp/useEffectiveRsp';
import { resolveDesignatedRspSeat } from '@/components/room/rsp/rspInputResolver';
import { resolveRspScreenFrontPlaneM, resolveRspScreenWidthM } from '@/components/room/rsp/screenGeometryResolver';
import { computeMLPAndPrimary } from '@/components/utils/computeMLPAndPrimary';
import { computeAllSeatSplMetrics } from '@/components/utils/spl/centralSplEngine';
import { getSpeakerModelMeta } from '@/components/models/speakers/registry';
import { useRP22AnalysisEngine } from '@/components/hooks/useRP22AnalysisEngine';
import { resolveEffectiveVisibleWidthInches, isManualOverrideActive } from '@/components/models/screen/resolveEffectiveScreen';
import { useEngineeringSnapshot } from './useEngineeringSnapshot';

const TV_KEY_TO_INCHES = { tv65: 55.55, tv77: 67.36, tv83: 72.52, tv100: 87.80 };

function resolveScreenVisibleWidthInches(screen) {
  if (!screen) return 120;
  if (isManualOverrideActive(screen)) return resolveEffectiveVisibleWidthInches(screen);
  if (screen.tvPresetKey && TV_KEY_TO_INCHES[screen.tvPresetKey]) return TV_KEY_TO_INCHES[screen.tvPresetKey];
  const vwi = Number(screen.visibleWidthInches);
  if (Number.isFinite(vwi) && vwi > 0) return vwi;
  const mw = Number(screen.manualWidthM);
  if (Number.isFinite(mw) && mw > 0) return mw / 0.0254;
  const mh = Number(screen.manualHeightM);
  const ar = Number(screen.aspectRatio);
  if (Number.isFinite(mh) && mh > 0 && Number.isFinite(ar) && ar > 0) return (mh * ar) / 0.0254;
  return 120;
}

/**
 * @param {string|null} projectId
 * @param {string|null} versionId — explicit version; falls back to project.active_version_id
 * @param {Object} [options] — { proposalAssets, brandAsset, proposalMetadata, assumedLevels, assessmentModes }
 * @returns {{ snapshot: Object|null, loading: boolean, error: string|null, project: Object|null, version: Object|null }}
 */
export function useVersionedEngineeringSnapshot(projectId, versionId, options = {}) {
  const app = useAppState();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [project, setProject] = useState(null);
  const [version, setVersion] = useState(null);
  const [mergedProject, setMergedProject] = useState(null);
  const [hydratedProjectId, setHydratedProjectId] = useState(null);

  // ── 1) Fetch + merge + hydrate ──
  useEffect(() => {
    let cancelled = false;
    if (!app || !projectId) {
      setLoading(false);
      setError(null);
      setProject(null);
      setVersion(null);
      setMergedProject(null);
      setHydratedProjectId(null);
      return;
    }

    setLoading(true);
    setError(null);

    (async () => {
      try {
        const results = await base44.entities.Project.filter({ id: projectId });
        if (cancelled) return;
        const p = Array.isArray(results) && results.length > 0 ? results[0] : null;
        if (!p) {
          setError('Project not found');
          setLoading(false);
          return;
        }
        setProject(p);

        const targetVersionId = versionId || p.active_version_id || null;
        let v = null;
        let merged = p;
        if (targetVersionId) {
          try {
            const versions = await base44.entities.ProjectVersion.filter({ id: targetVersionId });
            if (cancelled) return;
            if (versions && versions.length > 0) {
              v = versions[0];
              merged = mergeProjectAndVersion(p, v);
            }
          } catch (verErr) {
            console.warn('[useVersionedEngineeringSnapshot] Version fetch failed:', verErr);
          }
        }
        if (cancelled) return;
        setVersion(v);
        setMergedProject(merged);

        hydrateProjectIntoAppState(merged, app, {
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
          setManualRspX_m: app.setManualRspX_m,
          setDesignatedRspSeatId: app.setDesignatedRspSeatId,
        });
        setHydratedProjectId(p.id);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err?.message || 'Failed to load project');
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [projectId, versionId]);

  // ── 2) Derived room + screen geometry (mirrors useClientReportAuthority) ──
  const roomDims = useMemo(() => ({
    widthM: Number(app?.roomDims?.widthM) || 4.5,
    lengthM: Number(app?.roomDims?.lengthM) || 6.0,
    heightM: Number(app?.roomDims?.heightM) || 2.4,
  }), [app?.roomDims?.widthM, app?.roomDims?.lengthM, app?.roomDims?.heightM]);

  const stableDimensions = useMemo(() => {
    const width = Number(app?.roomDims?.widthM) || 4.5;
    const length = Number(app?.roomDims?.lengthM) || 6.0;
    const height = Number(app?.roomDims?.heightM) || 2.4;
    return { width, length, height, widthM: width, lengthM: length, heightM: height };
  }, [app?.roomDims?.widthM, app?.roomDims?.lengthM, app?.roomDims?.heightM]);

  const screen = app?.screen || {};
  const screenWidthM = useMemo(() => resolveRspScreenWidthM(screen), [screen?.tvPresetKey, screen?.tvWidthMm, screen?.visibleWidthInches, screen?.manualWidthM, screen?.manualHeightM, screen?.aspectRatio, screen?.manualSize]);
  const screenFrontPlaneM = useMemo(() => resolveRspScreenFrontPlaneM(app?.screenFrontPlaneM, screen), [app?.screenFrontPlaneM, screen?.floatDepthM, screen?.screenPlaneY_m]);

  const seatingPositions = useMemo(() => Array.isArray(app?.seatingPositions) ? app.seatingPositions : [], [app?.seatingPositions]);

  const rowDerivedRspYByMode = useMemo(() => {
    if (!seatingPositions.length) return {};
    try {
      const result = computeMLPAndPrimary(seatingPositions, roomDims.widthM, roomDims.lengthM, 'front');
      return result?.rowDerivedRspYByMode ?? {};
    } catch { return {}; }
  }, [seatingPositions, roomDims.widthM, roomDims.lengthM]);

  const rspMode = app?.rspMode || 'auto_from_screen';
  const manualRspY_m = app?.manualRspY_m ?? null;
  const currentMlpY_m = app?.mlpY_m ?? null;
  const manualRspX_m = app?.manualRspX_m ?? null;

  const designatedRspSeat = useMemo(() => resolveDesignatedRspSeat(app?.designatedRspSeatId, seatingPositions), [app?.designatedRspSeatId, seatingPositions]);

  const { effectiveRspX_m, effectiveRspY_m } = useEffectiveRsp({
    rspMode, manualRspY_m, manualRspX_m,
    roomWidthM: roomDims.widthM, screenFrontPlaneM, screenWidthM,
    rowCentersM: app?.rowCentersM || [], seatingPositions,
    currentMlpY_m, rowDerivedRspYByMode, designatedRspSeat,
  });

  const rsp = useMemo(() => {
    const x = Number.isFinite(effectiveRspX_m) ? effectiveRspX_m : (roomDims.widthM / 2);
    const y = Number.isFinite(effectiveRspY_m) ? effectiveRspY_m : currentMlpY_m;
    if (!Number.isFinite(y)) return null;
    return { x, y, z: 1.2 };
  }, [roomDims.widthM, effectiveRspX_m, effectiveRspY_m, currentMlpY_m]);

  const placedSpeakers = useMemo(() => Array.isArray(app?.speakerSystem?.placedSpeakers) ? app.speakerSystem.placedSpeakers : [], [app?.speakerSystem?.placedSpeakers]);

  const reportDolbyLayout = app?.dolbyLayout ?? app?.dolbyConfig ?? app?.speakerSystem?.dolbyLayout ?? '5.1';
  const canonicalP2Layout = app?.dolbyLayout ?? app?.dolbyConfig ?? app?.speakerSystem?.dolbyLayout ?? app?.speakerSystem?.dolbyPreset ?? null;

  const analysisSpeakers = useAnalysisSpeakers({
    placedSpeakers,
    speakerSystem: app?.speakerSystem,
    sevenBedLayoutType: app?.sevenBedLayoutType,
    getSpeakerVisibility: app?.getSpeakerVisibility,
    dolbyPreset: reportDolbyLayout,
  });

  const mlpBasis = app?.mlpBasis || 'front';
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
        return { widthM: 0.27, depthM: 0.082, sensitivity_dB_1w_1m: 87 };
      },
      screenLoss_dB: Number(app?.splConfig?.screenLossDb) || 0,
      eqHeadroom_dB: Number(app?.splConfig?.globalEqHeadroomDb) || 0,
      mlpPoint: rsp,
    });
  }, [seatingPositions, placedSpeakers, rsp, app?.splConfig, app?.getEffectiveSplInputs, hasSeats, hasSpeakers]);

  // ── 3) Canonical RP22 analysis engine ──
  const analysisResult = useRP22AnalysisEngine({
    diagnosticOwner: 'engineering-snapshot',
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
    assumedP15Level: app?.assumedP15Level,
    screen,
    dolbyLayout: canonicalP2Layout,
    includeBassAnalysis: false,
  });

  // ── 4) Assemble the snapshot ──
  const effectiveVersionId = versionId || version?.id || project?.active_version_id || null;
  const snapshotResult = useEngineeringSnapshot({
    projectId,
    versionId: effectiveVersionId,
    project,
    version,
    mergedProject,
    appState: app,
    seats: seatingPositions,
    analysisResult,
    placedSpeakers,
    proposalAssets: options.proposalAssets,
    brandAsset: options.brandAsset,
    proposalMetadata: options.proposalMetadata,
    assumedLevels: options.assumedLevels,
    assessmentModes: options.assessmentModes,
  });

  const isReady = !loading && hydratedProjectId === projectId && !!snapshotResult.snapshot;

  return {
    snapshot: snapshotResult.snapshot,
    loading: loading || snapshotResult.loading,
    error: error || snapshotResult.error,
    project,
    version,
    isReady,
  };
}