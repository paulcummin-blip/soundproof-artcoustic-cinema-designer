/**
 * useTooltipData
 * Extracted from RoomVisualisation – computes HUD tooltip data for the hovered/pinned seat.
 * Single source of truth for per-seat metrics displayed in the Seat HUD.
 */
import { useMemo } from "react";
import { buildSeatHudSnapshot } from "@/components/utils/buildSeatHudSnapshot";

export function useTooltipData({
  effectiveHoveredSeat,
  hudPinnedSeatId,
  appState,
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
  seatingPositions,
  dolbyLayout,
  getCanonicalRole,
}) {
  return useMemo(() => {
    if (!effectiveHoveredSeat) return null;

    const pinnedSeatId = appState?.hudPinnedSeatId || hudPinnedSeatId || null;

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
      .map(s => {
        const p = s.position || {};
        return `${s.id}:${getCanonicalRole(s.role)}:${(p.x || 0).toFixed(4)}:${(p.y || 0).toFixed(4)}:${(p.z || 0).toFixed(4)}:${String(s.model || '')}`;
      })
      .join('|');

    const layout = dolbyLayout || '5.1';
    const aimFlags = `${!!aimAtMLP}-${!!aimFrontWidesAtMLP}-${!!aimSideSurroundsAtMLP}-${!!aimRearSurroundsAtMLP}`;
    const mlpRp23 = mlp ? Math.round((mlp.y || 0) * 1000) : 0;
    const screenRounded = Math.round((screenFrontPlaneM || 0) * 1000);
    const sevenBedMode = String(
      appState?.sevenBedLayoutType
      || (appState?.speakerSystem?.useWidesInsteadOfRears ? 'wides' : '')
      || 'rears'
    ).toLowerCase();
    const signature = `${seatIds}|${seatPosFingerprint}|${speakerRevision}|${layout}|${aimFlags}|${mlpRp23}|${screenRounded}|${sevenBedMode}`;

    const seatId = effectiveHoveredSeat?.id;
    const isPinnedSeat = !!seatId && !!pinnedSeatId && String(seatId) === String(pinnedSeatId);

    const snapshotArgs = {
      seat: effectiveHoveredSeat,
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
    };

    if (isPinnedSeat) {
      try {
        const snapshot = buildSeatHudSnapshot(snapshotArgs);
        if (snapshot) return snapshot;
      } catch (err) {
        console.warn('[HUD] Failed to compute pinned seat snapshot:', err);
      }
    }

    const cacheKey = `${seatId}|${signature}`;
    const cached = seatId ? appState?.seatMetricsById?.[cacheKey] : null;
    if (cached && !!cached?.dolbyLayout) return cached;

    const data = buildSeatHudSnapshot(snapshotArgs);
    return data || null;
  }, [
    effectiveHoveredSeat,
    appState?.hudPinnedSeatId,
    hudPinnedSeatId,
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
    seatingPositions,
    appState?.splConfig,
    appState?.sevenBedLayoutType,
    appState?.speakerSystem?.sevenBedLayoutType,
    appState?.speakerSystem?.useWidesInsteadOfRears,
  ]);
}