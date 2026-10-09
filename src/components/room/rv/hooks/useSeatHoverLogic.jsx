import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import { useTooltipData } from "@/components/room/hooks/useTooltipData";
import getSpeakerWallDepthCm from "@/components/room/rv/utils/getSpeakerWallDepthCm";
import { formatDb } from '@/components/utils/formatDb';
import { useSpeakerInfoTooltip } from "@/components/room/speakerInfo/useSpeakerInfoTooltip";
import { buildSpeakerInfo } from "@/components/room/speakerInfo/speakerInfoModel";

export function useSeatHoverLogic({
  seatingPositions,
  appState,
  hudPinnedSeatId,
  setHudPinnedSeatId,
  placedSpeakers,
  // While a speaker is being dragged the HUD reads live effective positions.
  // Cache writes are suspended for the duration of the drag and resume on
  // release, so a pointer move never triggers a metrics write.
  suspendCacheWrites = false,
  widthM,
  lengthM,
  heightM,
  screenFrontPlaneM,
  screen,
  mlp,
  allSeatSplMetricsProp,
  aimAtMLP,
  aimFrontWidesAtMLP,
  aimSideSurroundsAtMLP,
  aimRearSurroundsAtMLP,
  lcrAngleInfo,
  analysisResult,
  dolbyLayout,
  getCanonicalRole,
  registryNormaliseModelKey,
  getSpeakerModelMeta,
  rvWrapRef,
  computeAllSeatSplMetrics,
  officialP19Result,
  perSeatP19Results,
  perSeatP20Results,
}) {
  // Hover state
  const [hoveredSeat, setHoveredSeat] = useState(null);
  // Speaker information card — the same card the elevations show. Anchored to
  // the icon rather than the pointer, so it never drifts.
  const speakerInfo = useSpeakerInfoTooltip({ containerRef: rvWrapRef, boundsRef: rvWrapRef });

  // Seat hover handlers
  // The seat's one click action: open (or move) that seat's HUD. Clicking the
  // seat that is already showing does not close it — the plan background is
  // where the HUD is dismissed — so a double click is simply two openings and
  // never a different behaviour.
  const handleSeatClick = useCallback((seat) => {
    if (!seat?.id) return;
    if (typeof setHudPinnedSeatId === 'function') setHudPinnedSeatId(seat.id);
    setHoveredSeat(seat);
  }, [setHudPinnedSeatId]);

  // A click on the empty plan dismisses the seat HUD completely: the pin and the
  // clicked seat both go, so the plan returns to showing no seat at all.
  const dismissSeatHud = useCallback(() => {
    if (typeof setHudPinnedSeatId === 'function') setHudPinnedSeatId(null);
    setHoveredSeat(null);
  }, [setHudPinnedSeatId]);

  const handleSeatMouseEnter = useCallback((seat) => {
    if (!hudPinnedSeatId) setHoveredSeat(seat);
  }, [hudPinnedSeatId]);

  const handleSeatMouseLeave = useCallback(() => {
    if (!hudPinnedSeatId) setHoveredSeat(null);
  }, [hudPinnedSeatId]);

  // Helper to get friendly speaker model name
  const getSpeakerModelDisplayName = useCallback((modelKey) => {
    if (!modelKey || modelKey === 'off' || modelKey === 'none') return 'Unknown model';
    const normalized = registryNormaliseModelKey(modelKey);
    const meta = getSpeakerModelMeta(normalized);
    if (meta?.label) return meta.label;
    return 'Unknown model';
  }, [registryNormaliseModelKey, getSpeakerModelMeta]);

  // SPL metrics: Use prop from RoomDesigner if available (single source of truth)
  // Only compute locally if prop not provided (fallback for standalone use)
  const allSeatSplMetricsLocal = useMemo(() => {
    // If prop is provided, don't compute locally
    if (allSeatSplMetricsProp) return null;
    
    return computeAllSeatSplMetrics({
      seats: seatingPositions,
      placedSpeakers,
      getCanonicalRole,
      getEffectiveSplInputs: appState?.getEffectiveSplInputs || (() => ({ powerW: 100, sensitivity_dB_1w1m: 87 })),
      getModelDimsM: () => ({}),
      mlpPoint: mlp,
      heightM,
    });
  }, [allSeatSplMetricsProp, seatingPositions, placedSpeakers, getCanonicalRole, appState?.getEffectiveSplInputs, mlp, heightM, computeAllSeatSplMetrics]);

  // Use prop if available, otherwise use local computation
  const allSeatSplMetrics = allSeatSplMetricsProp || allSeatSplMetricsLocal;

  // Speaker icon tooltip content: the shared speaker information card plus the
  // two plan readings the icon hover has always carried.
  const buildIconInfo = useCallback((speaker) => {
    if (!speaker) return null;
    const role = getCanonicalRole(speaker.role);
    const mlpSpl = allSeatSplMetrics?.get?.("mlp")?.spl;
    const speakerMetrics = role
      ? mlpSpl?.screen?.[role] || mlpSpl?.surrounds?.[role] || mlpSpl?.uppers?.[role] || null
      : null;
    const splValue = speakerMetrics?.value;
    const splLabel = Number.isFinite(Number(splValue)) ? formatDb(Number(splValue)) : '—';
    const wallDepthCm = getSpeakerWallDepthCm({
      speaker,
      widthM,
      lengthM,
      mlp,
      appState,
      getCanonicalRole,
      getSpeakerModelMeta,
    });

    return {
      ...buildSpeakerInfo({
        role,
        model: speaker.model,
        acousticCentreZ_m: speaker.position?.z,
        extras: [
          `SPL @ RSP: ${splLabel}`,
          `Distance from wall: ${Number.isFinite(wallDepthCm) ? `${wallDepthCm} cm` : '—'}`,
        ],
      }),
      exclusions: [],
    };
  }, [getCanonicalRole, allSeatSplMetrics, widthM, lengthM, mlp, appState, getSpeakerModelMeta]);

  const handleIconEnter = useCallback((e, speaker) => {
    const info = buildIconInfo(speaker);
    if (info) speakerInfo.show(e, info);
  }, [buildIconInfo, speakerInfo.show]);

  // A tap or click pins the card, so it can be read on a touch screen too.
  const handleIconClick = useCallback((e, speaker) => {
    const info = buildIconInfo(speaker);
    if (info) speakerInfo.show(e, info);
  }, [buildIconInfo, speakerInfo.show]);

  // The card is anchored to the icon, so pointer tracking is no longer needed.
  const handleIconMove = useCallback(() => {}, []);

  const handleIconLeave = useCallback(() => {
    speakerInfo.hide();
  }, [speakerInfo.hide]);

  // Combine hoveredSeat and pinnedSeat for effective display
  const effectiveHoveredSeat = useMemo(() => {
    // Try to resolve pinned seat from seatingPositions (by id)
    const pinnedSeatId = appState?.hudPinnedSeatId || hudPinnedSeatId || null;
    const pinnedSeat = pinnedSeatId && Array.isArray(seatingPositions)
      ? seatingPositions.find(s => String(s?.id) === String(pinnedSeatId)) || null
      : null;
    
    // If not pinned, fall back to hovered seat
    return pinnedSeat || hoveredSeat || null;
  }, [appState?.hudPinnedSeatId, hudPinnedSeatId, hoveredSeat, seatingPositions]);

  // Build tooltip data: delegated to useTooltipData hook
  const tooltipData = useTooltipData({
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
  });

  // HUD cache writes — MUST be in an effect (never inside useMemo/render)
  const lastHudWriteRef = useRef({});

  useEffect(() => {
    // No cache writes during a speaker drag — the live preview is display-only
    // and the final committed snapshot is written once, on release.
    if (suspendCacheWrites) return;

    const seat = effectiveHoveredSeat;
    if (!seat?.id) return;

    // Only write if we actually have computed data
    if (!tooltipData) return;

    // Build same cacheKey used in tooltipData logic
    const seatId = String(seat.id);

    // Rebuild the same signature parts
    const seatIds = (seatingPositions || []).map(s => s.id).join(',');
    const seatPosFingerprint = (seatingPositions || [])
      .map(s => `${s.id}:${Math.round((s.x || 0) * 1000)}:${Math.round((s.y || 0) * 1000)}`)
      .join(',');

    const cacheKey = `${seatId}|${seatIds}|${seatPosFingerprint}`;

    // Hash the payload so we don't write the same thing repeatedly
    let nextHash = '';
    try {
      nextHash = JSON.stringify(tooltipData);
    } catch {
      nextHash = String(Date.now()); // fallback: allow write
    }

    if (lastHudWriteRef.current[cacheKey] === nextHash) return;
    lastHudWriteRef.current[cacheKey] = nextHash;

    // 1) Seat snapshot map (keyed by seatId)
    if (appState?.setSeatSnapshotBySeatId) {
      appState.setSeatSnapshotBySeatId(prev => {
        const cur = prev?.[seatId];
        // Avoid needless writes
        try {
          if (cur && JSON.stringify(cur) === nextHash) return prev;
        } catch { /* non-serializable cached data is replaced */ }
        return { ...(prev || {}), [seatId]: tooltipData };
      });
    }

    // 2) Shared cache (keyed by cacheKey)
    if (appState?.setSeatMetricsById) {
      appState.setSeatMetricsById(prevAll => {
        const prevObj = prevAll || {};
        const cur = prevObj[cacheKey];
        // Avoid needless writes
        try {
          if (cur && JSON.stringify(cur) === nextHash) return prevObj;
        } catch { /* non-serializable cached data is replaced */ }
        return { ...prevObj, [cacheKey]: tooltipData };
      });
    }
  }, [
    tooltipData,
    effectiveHoveredSeat,
    seatingPositions,
    suspendCacheWrites,
    appState?.setSeatSnapshotBySeatId,
    appState?.setSeatMetricsById,
  ]);

  return {
    hoveredSeat,
    effectiveHoveredSeat,
    tooltipData,
    speakerTooltip: {
      visible: speakerInfo.visible,
      title: speakerInfo.info?.title,
      lines: speakerInfo.info?.lines,
      anchor: speakerInfo.anchor,
      bounds: speakerInfo.bounds,
      exclusions: speakerInfo.info?.exclusions,
    },
    handleSeatClick,
    dismissSeatHud,
    handleSeatMouseEnter,
    handleSeatMouseLeave,
    handleIconEnter,
    handleIconMove,
    handleIconLeave,
    handleIconClick,
  };
}