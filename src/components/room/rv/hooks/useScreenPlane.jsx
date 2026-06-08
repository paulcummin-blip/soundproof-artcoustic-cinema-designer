import React, { useMemo, useEffect, useRef, useState } from "react";
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
  onScreenPlaneYChange,
  isDraggingRef,
}) {
  // LOCK: if screen plane is locked, return the locked value immediately
  const isLocked = appState?.screenPlaneLocked === true;
  const lockedY = appState?.lockedScreenFrontPlaneM;

  const [calculatedMinScreenDepthM, setCalculatedMinScreenDepthM] = React.useState(
    0.02 + 0.30 // WALL_BUFFER_M + SCREEN_BUFFER_M default
  );
  const lastCalcMinScreenDepthRef = useRef(null);

  // LIVE EMIT: recompute minimum screen depth whenever anything relevant changes
  useEffect(() => {
    const roomWidthM = Number(appState?.roomDims?.widthM) || 4.5;
    const screenCentreX = roomWidthM / 2;
    const screenVisibleWidthM = Math.max(0.1, Number(screen?.visibleWidthInches || 100) * 0.0254);

    // Physical thickness of the screen body in plan view (front-to-back).
    // Must match RvBaffleAndScreen — do not change without updating that component too.
    const SCREEN_THICKNESS_M = 0.02;

    // ── Stable intended screen plane ──────────────────────────────────────────
    // Use the locked value if the screen is locked, otherwise the user's float
    // depth, otherwise treat the screen as flush with the front wall (0 m).
    // This value is computed ONCE before any object filtering so the filter
    // cannot become circular (no dependency on previous calculated depth).
    const intendedScreenY =
      (isLocked && Number.isFinite(lockedY))
        ? lockedY
        : (Number.isFinite(Number(screen?.floatDepthM)) ? Number(screen.floatDepthM) : 0);

    // ── Intended screen rectangle in plan view ────────────────────────────────
    const screenXMin = screenCentreX - screenVisibleWidthM / 2;
    const screenXMax = screenCentreX + screenVisibleWidthM / 2;
    const screenYMin = intendedScreenY;
    const screenYMax = intendedScreenY + SCREEN_THICKNESS_M;

    // ── Rectangle-overlap filter ──────────────────────────────────────────────
    // An object is passed into computeMinimumScreenDepthM only if its
    // axis-aligned plan rectangle physically overlaps the intended screen
    // rectangle.  No role is included automatically; no previous depth
    // estimate is used.
    const combinedObjects = [...(placedSpeakers || []), ...(frontSubs || [])];
    const frontObjectsToCalculate = [];

    for (const s of combinedObjects) {
      const r = getCanonicalRole(s.role);

      // Only consider front-stage roles and recognised sub roles
      const isFrontLCR = (r === 'FL' || r === 'FC' || r === 'FR');
      const isSub      = isSubRole(r);
      if (!isFrontLCR && !isSub) continue;

      const posX = Number(s?.position?.x);
      const posY = Number(s?.position?.y);
      const dims = getModelDimsM(s?.model);
      const widthM = Number(dims?.widthM);
      const depthM = Number(dims?.depthM);

      // If any key value is missing, fall back to including the object (safe)
      if (
        !Number.isFinite(posX) ||
        !Number.isFinite(posY) ||
        !Number.isFinite(widthM) ||
        !Number.isFinite(depthM)
      ) {
        frontObjectsToCalculate.push({ model: s.model, role: s.role, position: s.position });
        continue;
      }

      // Simple axis-aligned rectangle — no new yaw logic added
      const objectXMin = posX - widthM / 2;
      const objectXMax = posX + widthM / 2;
      const objectYMin = posY;
      const objectYMax = posY + depthM;

      const xOverlap = objectXMax > screenXMin && objectXMin < screenXMax;
      const yOverlap = objectYMax > screenYMin && objectYMin < screenYMax;

      if (xOverlap && yOverlap) {
        frontObjectsToCalculate.push({ model: s.model, role: s.role, position: s.position });
      }
    }

    const calculatedValue = computeMinimumScreenDepthM({
      frontObjects: frontObjectsToCalculate,
      getDims: getModelDimsM,
      lcrAngles: { L: lcrAngleInfo.L, R: lcrAngleInfo.R },
      aimAtMLP: appState?.lcrAimMode === 'angled',
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

  // Resolve final screen plane: locked value wins over live calculation.
  // This must be computed BEFORE all publish effects so that upstream consumers
  // (appState.screenFrontPlaneM, onScreenPlaneChange, onScreenPlaneYChange) always
  // receive the locked value when the screen is locked, regardless of what the
  // live geometry recalculates (e.g. due to lcrAngleInfo / speaker aiming changes).
  const resolvedScreenPlaneY = (isLocked && Number.isFinite(lockedY)) ? lockedY : screenPlaneY;

  // Publish screen front plane to AppState with guards (rounded to mm + change detection)
  const lastScreenFrontPlaneRef = useRef(null);

  useEffect(() => {
    if (!appState?.setScreenFrontPlaneM) return;
    if (!Number.isFinite(resolvedScreenPlaneY)) return;

    // Round to mm to avoid jitter/loops
    const v = Math.round(resolvedScreenPlaneY * 1000) / 1000;

    // Only update if value actually changed
    if (lastScreenFrontPlaneRef.current === v) return;
    lastScreenFrontPlaneRef.current = v;

    appState.setScreenFrontPlaneM(v);
  }, [resolvedScreenPlaneY, appState?.setScreenFrontPlaneM]);

  // Push live plane up to RoomDesigner when it changes (debounced + change guard)
  const screenSendTimerRef = useRef(null);
  const lastSentRef = useRef(null);

  useEffect(() => {
    if (typeof onScreenPlaneChange !== 'function') return;
    if (!Number.isFinite(resolvedScreenPlaneY)) return;

    // Round to 0.1mm to prevent float jitter
    const rounded = Math.round(resolvedScreenPlaneY * 10000) / 10000;

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
  }, [resolvedScreenPlaneY, onScreenPlaneChange]);

  // NEW: Publish live screen plane Y to screen object for Live Metrics (immediate, no debounce)
  // Guard: suppress write-back while any speaker drag is active to prevent
  // oscillation between speakerClearanceM/floatDepthM and screenPlaneY_m.
  const lastSentScreenPlaneYRef = useRef(null);

  useEffect(() => {
    if (typeof onScreenPlaneYChange !== 'function') return;
    if (!Number.isFinite(resolvedScreenPlaneY)) return;

    // Do not write screenPlaneY_m back to _screen while a speaker drag is active.
    // RoomDesigner's LCR clearance effect handles screen updates during drag.
    if (isDraggingRef?.current) return;

    // Round to mm to prevent jitter
    const rounded = Math.round(resolvedScreenPlaneY * 1000) / 1000;

    // Only call if value actually changed
    if (lastSentScreenPlaneYRef.current === rounded) return;
    lastSentScreenPlaneYRef.current = rounded;

    onScreenPlaneYChange(rounded);
  }, [resolvedScreenPlaneY, onScreenPlaneYChange, isDraggingRef]);

  // resolvedScreenPlaneY is computed early (before publish effects) — reuse it here.
  const resolvedZoneDepthM = (isLocked && Number.isFinite(lockedY))
    ? Math.max(0.10, Math.min(0.60, lockedY))
    : ZONE_DEPTH_M;

  return {
    screenPlaneY: resolvedScreenPlaneY,
    minScreenDepth: effectiveMinScreenDepthM,
    ZONE_DEPTH_M: resolvedZoneDepthM,
  };
}