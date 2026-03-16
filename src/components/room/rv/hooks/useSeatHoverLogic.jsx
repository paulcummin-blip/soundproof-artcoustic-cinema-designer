import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import { useTooltipData } from "@/components/room/hooks/useTooltipData";

export function useSeatHoverLogic({
  seatingPositions,
  appState,
  hudPinnedSeatId,
  setHudPinnedSeatId,
  placedSpeakers,
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
}) {
  // Hover state
  const [hoveredSeat, setHoveredSeat] = useState(null);
  const [speakerTooltip, setSpeakerTooltip] = useState({ visible: false, text: '', x: 0, y: 0 });

  // Seat hover handlers
  const handleSeatClick = useCallback((seat) => {
    setHoveredSeat(prev => (prev === seat.id ? null : seat));
  }, []);

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

  // Speaker icon tooltip handlers
  const handleIconEnter = useCallback((e, speaker) => {
    if (!speaker) return;
    const role = getCanonicalRole(speaker.role);
    const displayName = getSpeakerModelDisplayName(speaker.model);
    const text = `${role} — ${displayName}`;
    
    setSpeakerTooltip({ visible: true, text, x: 0, y: 0 });
    // Position immediately via move handler
    handleIconMove(e, speaker);
  }, [getSpeakerModelDisplayName, getCanonicalRole]);

  const handleIconMove = useCallback((e, speaker) => {
    const rect = rvWrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    setSpeakerTooltip(prev => ({
      ...prev,
      x: e.clientX - rect.left + 12,
      y: e.clientY - rect.top + 12
    }));
  }, [rvWrapRef]);

  const handleIconLeave = useCallback(() => {
    setSpeakerTooltip({ visible: false, text: '', x: 0, y: 0 });
  }, []);

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
  });

  // HUD cache writes — MUST be in an effect (never inside useMemo/render)
  const lastHudWriteRef = useRef({});

  useEffect(() => {
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
        } catch {}
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
        } catch {}
        return { ...prevObj, [cacheKey]: tooltipData };
      });
    }
  }, [
    tooltipData,
    effectiveHoveredSeat,
    seatingPositions,
    appState?.setSeatSnapshotBySeatId,
    appState?.setSeatMetricsById,
  ]);

  return {
    hoveredSeat,
    effectiveHoveredSeat,
    tooltipData,
    speakerTooltip,
    handleSeatClick,
    handleSeatMouseEnter,
    handleSeatMouseLeave,
    handleIconEnter,
    handleIconMove,
    handleIconLeave,
  };
}