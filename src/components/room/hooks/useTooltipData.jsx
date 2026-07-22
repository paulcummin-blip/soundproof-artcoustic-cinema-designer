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
  officialP19Result,
  perSeatP19Results,
  perSeatP20Results,
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

    const seatId = effectiveHoveredSeat?.id;

    const layout = dolbyLayout || '5.1';
    const aimFlags = `${!!aimAtMLP}-${!!aimFrontWidesAtMLP}-${!!aimSideSurroundsAtMLP}-${!!aimRearSurroundsAtMLP}`;
    const mlpRp23 = mlp ? Math.round((mlp.y || 0) * 1000) : 0;
    const screenRounded = Math.round((screenFrontPlaneM || 0) * 1000);
    const sevenBedMode = String(
      appState?.sevenBedLayoutType
      || (appState?.speakerSystem?.useWidesInsteadOfRears ? 'wides' : '')
      || 'rears'
    ).toLowerCase();
    const seatRp22 = seatId ? analysisResult?.perSeatRp22?.[seatId]?.rp22 : null;
    const seatP19 = (Array.isArray(perSeatP19Results) ? perSeatP19Results : []).find((item) => String(item?.seatId) === String(seatId));
    const seatP20 = (Array.isArray(perSeatP20Results) ? perSeatP20Results : []).find((item) => String(item?.seatId) === String(seatId));
    const rp22Fingerprint = [
      seatRp22?.[9]?.formatted || '',
      seatRp22?.[9]?.details?.worst?.deg ?? '',
      seatRp22?.[10]?.formatted || '',
      officialP19Result?.value ?? '',
      seatP19?.variationDbRaw ?? '',
      seatP19?.level ?? '',
      seatP20?.variationDbRaw ?? '',
      seatP20?.level ?? '',
    ].join('|');

    const signature = `${seatIds}|${seatPosFingerprint}|${speakerRevision}|${layout}|${aimFlags}|${mlpRp23}|${screenRounded}|${sevenBedMode}|${rp22Fingerprint}`;

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
      officialP19Result,
      perSeatP19Results,
      perSeatP20Results,
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
    officialP19Result,
    perSeatP19Results,
    perSeatP20Results,
  ]);
}