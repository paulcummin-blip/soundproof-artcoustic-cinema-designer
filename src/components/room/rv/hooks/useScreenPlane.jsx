import React, { useMemo, useEffect, useRef } from "react";
import { useExportMinScreenDepth } from "@/components/room/rv/hooks/useExportMinScreenDepth";
import { useActualScreenFrontY } from "@/components/room/rv/hooks/useActualScreenFrontY";
import { computeMinimumScreenDepthM } from "@/components/room/rv/utils/rvGeometry";
import { isSubRole } from "@/components/room/rv/RenderPrimitives";

export function useScreenPlane({
  placedSpeakers,
  frontSubs,
  aimAtMLP,
  lcrAngleInfo,
  screen,
  getModelDimsM,
  getCanonicalRole,
  mlpDotY_m,
  appState,
  onScreenPlaneChange,
  onScreenPlaneYChange
}) {
  const [calculatedMinScreenDepthM, setCalculatedMinScreenDepthM] = React.useState(
    0.02 + 0.30 // WALL_BUFFER_M + SCREEN_BUFFER_M default
  );
  const lastCalcMinScreenDepthRef = useRef(null);

  // LIVE EMIT: recompute minimum screen depth whenever anything relevant changes
  useEffect(() => {
    const frontObjectsToCalculate = [...(placedSpeakers || []), ...(frontSubs || [])]
      .filter(s => {
        const r = getCanonicalRole(s.role);
        return r === 'FL' || r === 'FC' || r === 'FR' || isSubRole(r);
      })
      .map(s => ({
        model: s.model,
        role: s.role,
        position: s.position
      }));

    const calculatedValue = computeMinimumScreenDepthM({
      frontObjects: frontObjectsToCalculate,
      getDims: getModelDimsM,
      lcrAngles: { L: lcrAngleInfo.L, R: lcrAngleInfo.R },
      aimAtMLP: aimAtMLP,
    });

    // Guard: only update if value actually changed (prevent loops)
    const prev = lastCalcMinScreenDepthRef.current;
    if (typeof calculatedValue === "number" && typeof prev === "number") {
      const nextR = Math.round(calculatedValue * 1000) / 1000;
      const prevR = Math.round(prev * 1000) / 1000;
      if (nextR === prevR) return;
    }

    lastCalcMinScreenDepthRef.current = calculatedValue;
    setCalculatedMinScreenDepthM(calculatedValue);
  }, [
    placedSpeakers,
    frontSubs,
    aimAtMLP,
    lcrAngleInfo.L,
    lcrAngleInfo.R,
    screen?.visibleWidthInches,
    screen?.floatDepthM,
    getModelDimsM,
    mlpDotY_m,
    getCanonicalRole
  ]);

  const exportMinScreenDepthM = useExportMinScreenDepth({
    exportMode: 'default', // Not passed in, assume default
    placedSpeakers,
    frontSubs,
    aimAtMLP,
    lcrAngleInfo,
    screenVisibleWidthInches: screen?.visibleWidthInches,
    getModelDimsM,
    getCanonicalRole
  });

  // Effective min depth: export uses sync value (if available), live uses state (effect-driven)
  const effectiveMinScreenDepthM =
    (false && Number.isFinite(exportMinScreenDepthM))
      ? exportMinScreenDepthM
      : calculatedMinScreenDepthM;

  const screenPlaneY = useActualScreenFrontY({
    effectiveMinScreenDepthM,
    screenFloatDepthM: screen?.floatDepthM,
    screenPlaneMode: 'autoTight' // Not passed in, assume default
  });

  // Define ZONE_DEPTH_M from live screen plane (component scope)
  const ZONE_DEPTH_M = useMemo(() => {
    const y = Number(screenPlaneY);
    const fallback = 0.30;
    const raw = Number.isFinite(y) ? y : fallback;
    // clamp between 0.10 m and 0.60 m to avoid absurd values but keep existing visuals
    return Math.max(0.10, Math.min(0.60, raw));
  }, [screenPlaneY]);

  // Publish screen front plane to AppState with guards (rounded to mm + change detection)
  const lastScreenFrontPlaneRef = useRef(null);

  useEffect(() => {
    if (!appState?.setScreenFrontPlaneM) return;
    if (!Number.isFinite(screenPlaneY)) return;

    // Round to mm to avoid jitter/loops
    const v = Math.round(screenPlaneY * 1000) / 1000;

    // Only update if value actually changed
    if (lastScreenFrontPlaneRef.current === v) return;
    lastScreenFrontPlaneRef.current = v;

    appState.setScreenFrontPlaneM(v);
  }, [screenPlaneY, appState?.setScreenFrontPlaneM]);

  // Push live plane up to RoomDesigner when it changes (debounced + change guard)
  const screenSendTimerRef = useRef(null);
  const lastSentRef = useRef(null);

  useEffect(() => {
    if (typeof onScreenPlaneChange !== 'function') return;
    if (!Number.isFinite(screenPlaneY)) return;

    // Round to 0.1mm to prevent float jitter
    const rounded = Math.round(screenPlaneY * 10000) / 10000;

    // If unchanged, skip update
    if (lastSentRef.current === rounded) return;

    // Debounce updates to prevent API overload (1 second)
    clearTimeout(screenSendTimerRef.current);
    screenSendTimerRef.current = setTimeout(() => {
      if (lastSentRef.current !== rounded) {
        lastSentRef.current = rounded;
        onScreenPlaneChange(rounded);
      }
    }, 1000);

    return () => clearTimeout(screenSendTimerRef.current);
  }, [screenPlaneY, onScreenPlaneChange]);

  // NEW: Publish live screen plane Y to screen object for Live Metrics (immediate, no debounce)
  const lastSentScreenPlaneYRef = useRef(null);

  useEffect(() => {
    if (typeof onScreenPlaneYChange !== 'function') return;
    if (!Number.isFinite(screenPlaneY)) return;

    // Round to mm to prevent jitter
    const rounded = Math.round(screenPlaneY * 1000) / 1000;

    // Only call if value actually changed
    if (lastSentScreenPlaneYRef.current === rounded) return;
    lastSentScreenPlaneYRef.current = rounded;

    onScreenPlaneYChange(rounded);
  }, [screenPlaneY, onScreenPlaneYChange]);

  return {
    screenPlaneY,
    minScreenDepth: effectiveMinScreenDepthM,
    ZONE_DEPTH_M,
  };
}