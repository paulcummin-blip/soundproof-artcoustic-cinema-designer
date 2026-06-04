"use client";

import { useEffect, useRef } from "react";
import { buildSeatHudSnapshot } from "@/components/utils/buildSeatHudSnapshot";

export function useSeatMetricsCacheEffect({
  seatingPositions,
  placedSpeakers,
  widthM,
  lengthM,
  heightM,
  screenFrontPlaneM,
  screen,
  mlp,
  allSeatSplMetrics,
  aimAtMLP,
  aimFrontWidesAtMLP,
  aimSideSurroundsAtMLP,
  aimRearSurroundsAtMLP,
  lcrAngleInfo,
  analysisResult,
  dolbyLayout,
  appState,
  exportMode,
  isPrinting,
  // pre-computed primitive revisions (avoids passing full objects into deps)
  analysisRev,
  splRev,
  mlpX,
  mlpY,
  mlpZ,
  lcrL,
  lcrR,
  getCanonicalRole,
}) {
  const lastCacheSignatureRef = useRef(null);
  const captureDoneRef = useRef(false);

  useEffect(() => {
    if (!appState?.setSeatMetricsById && !appState?.setSeatSnapshotBySeatId) return;

    // CRITICAL: Freeze during print/export to prevent update loops
    if (exportMode === 'dimensions' || isPrinting) {
      if (!captureDoneRef.current) {
        captureDoneRef.current = true;
      } else {
        return;
      }
    } else {
      captureDoneRef.current = false;
    }

    // Guard: if no seats, clear cache and exit
    if (!Array.isArray(seatingPositions) || seatingPositions.length === 0) {
      if (appState?.setSeatMetricsById) appState.setSeatMetricsById({});
      if (appState?.setSeatSnapshotBySeatId) appState.setSeatSnapshotBySeatId({});
      lastCacheSignatureRef.current = null;
      return;
    }

    if (!Number.isFinite(widthM) || !Number.isFinite(lengthM)) {
      return;
    }

    const seatIds = seatingPositions.map(s => s.id).join(',');
    const seatPosFingerprint = seatingPositions
      .map(s => `${s.id}:${Math.round((s.x || 0) * 1000)}:${Math.round((s.y || 0) * 1000)}`)
      .join(',');

    const extraSurroundPattern = /^(SL|SR)\d+$/;
    const speakerRevision = (placedSpeakers || [])
      .filter(s => {
        if (!s?.id || !s?.position) return false;
        const r = getCanonicalRole(s.role);
        const roleUpper = String(s.role || '').toUpperCase();
        const isOverhead = String(r || '').startsWith('T');
        return (
          ['SL', 'SR', 'SBL', 'SBR', 'LW', 'RW'].includes(r) ||
          isOverhead ||
          extraSurroundPattern.test(roleUpper) ||
          String(r || '').startsWith('U')
        );
      })
      .slice()
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
      .map(s => {
        const p = s.position || {};
        return `${s.id}:${getCanonicalRole(s.role)}:${(p.x || 0).toFixed(4)}:${(p.y || 0).toFixed(4)}:${(p.z || 0).toFixed(4)}:${String(s.model || '')}`;
      })
      .join('|');

    const layout = dolbyLayout || '5.1';
    const aimFlags = `${!!aimAtMLP}-${!!aimFrontWidesAtMLP}-${!!aimSideSurroundsAtMLP}-${!!aimRearSurroundsAtMLP}`;
    const sevenBedMode = String(
      appState?.sevenBedLayoutType
      || appState?.speakerSystem?.sevenBedLayoutType
      || (appState?.speakerSystem?.useWidesInsteadOfRears ? 'wides' : '')
      || 'rears'
    ).toLowerCase();

    const mlpFingerprint =
      Number.isFinite(mlpX) && Number.isFinite(mlpY)
        ? `${Math.round(mlpX * 1000)}:${Math.round(mlpY * 1000)}:${Math.round((Number.isFinite(mlpZ) ? mlpZ : 1.2) * 1000)}`
        : "na";

    const screenRounded      = Math.round((screenFrontPlaneM || 0) * 1000);
    const screenPlaneYRounded = Math.round((screen?.screenPlaneY_m || 0) * 1000);
    const frontPlaneRounded   = Math.round((screen?.frontPlaneM    || 0) * 1000);
    const floatDepthRounded   = Math.round((screen?.floatDepthM    || 0) * 1000);

    const signature =
      `${seatIds}|${seatPosFingerprint}|${speakerRevision}|${layout}|${aimFlags}|MLP${mlpFingerprint}|SCR${screenRounded}:${screenPlaneYRounded}:${frontPlaneRounded}:${floatDepthRounded}|7B${sevenBedMode}|A${analysisRev}|S${splRev}|LCR${Math.round(lcrL*10)}:${Math.round(lcrR*10)}`;

    if (lastCacheSignatureRef.current === signature) {
      return;
    }

    const nextByCacheKey = {};
    const nextBySeatId = {};

    for (const seat of seatingPositions) {
      if (!seat?.id) continue;

      try {
        const snapshot = buildSeatHudSnapshot({
          seat,
          placedSpeakers,
          widthM,
          lengthM,
          heightM,
          screenFrontPlaneM,
          screen,
          mlp: mlp || { x: widthM / 2, y: lengthM * 0.58, z: 1.2 },
          allSeatSplMetrics,
          aimAtMLP,
          aimFrontWidesAtMLP,
          aimSideSurroundsAtMLP,
          aimRearSurroundsAtMLP,
          lcrAngleInfo: lcrAngleInfo || { L: 0, R: 0 },
          analysisResult: analysisResult || {},
          seatingPositions,
          splConfig: appState?.splConfig || {},
          sevenBedMode,
          dolbyLayout,
        });

        if (snapshot) {
          const cacheKey = `${seat.id}|${signature}`;
          nextByCacheKey[cacheKey] = { ...snapshot };
          nextBySeatId[String(seat.id)] = { ...snapshot };
        }
      } catch (err) {
        console.warn(`[SeatMetrics] failed seat ${seat.id}:`, err);
        const cacheKey = `${seat.id}|${signature}`;
        const prevCache = appState?.seatMetricsById?.[cacheKey];
        const prevPlain = appState?.seatSnapshotBySeatId?.[seat.id];
        if (prevCache) nextByCacheKey[cacheKey] = prevCache;
        if (prevPlain) nextBySeatId[seat.id] = prevPlain;
      }
    }

    if (appState?.setSeatMetricsById) {
      const prev = appState.seatMetricsById || {};
      const shouldWrite = JSON.stringify(prev) !== JSON.stringify(nextByCacheKey);
      if (shouldWrite) appState.setSeatMetricsById(nextByCacheKey);
    }

    if (appState?.setSeatSnapshotBySeatId) {
      const prev = appState.seatSnapshotBySeatId || {};
      const shouldWrite = JSON.stringify(prev) !== JSON.stringify(nextBySeatId);
      if (shouldWrite) appState.setSeatSnapshotBySeatId(nextBySeatId);
    }

    lastCacheSignatureRef.current = signature;

  }, [
    seatingPositions,
    placedSpeakers,
    widthM,
    lengthM,
    heightM,
    screenFrontPlaneM,
    screen?.visibleWidthInches,
    screen?.screenPlaneY_m,
    screen?.frontPlaneM,
    screen?.floatDepthM,
    analysisRev,
    splRev,
    mlpX,
    mlpY,
    mlpZ,
    lcrL,
    lcrR,
    aimAtMLP,
    aimFrontWidesAtMLP,
    aimSideSurroundsAtMLP,
    aimRearSurroundsAtMLP,
    dolbyLayout,
    appState?.setSeatMetricsById,
    appState?.setSeatSnapshotBySeatId,
    appState?.splConfig,
    exportMode,
    isPrinting,
  ]);
}