import { useEffect, useRef } from "react";
import { buildRowCenters, distanceFor57_5FromWidth } from "@/components/room/seatingUtils";

const TV_KEY_TO_INCHES = {
  tv65: 55.55,
  tv77: 67.36,
  tv83: 72.52,
  tv100: 87.80,
};
function resolveVisibleWidthInches(screen) {
  const tvKey = screen?.tvPresetKey;
  const tvMm = Number(screen?.tvWidthMm);
  if (tvKey && TV_KEY_TO_INCHES[tvKey]) return TV_KEY_TO_INCHES[tvKey];
  if (Number.isFinite(tvMm) && tvMm > 0) return tvMm / 25.4;
  const visible = Number(screen?.visibleWidthInches);
  return Number.isFinite(visible) && visible > 0 ? visible : 100;
}

const EQ_EPS = 0.001;
const arraysEqualWithin1mm = (a = [], b = []) => {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  return a.every((value, index) => Math.abs(Number(value) - Number(b[index])) <= EQ_EPS);
};

const seatsEqualWithin1mm = (prev = [], next = []) => {
  if (!Array.isArray(prev) || !Array.isArray(next)) return false;
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i++) {
    const a = prev[i];
    const b = next[i];
    if ((a?.id ?? null) !== (b?.id ?? null)) return false;
    if (Math.abs(Number(a?.x) - Number(b?.x)) > EQ_EPS) return false;
    if (Math.abs(Number(a?.y) - Number(b?.y)) > EQ_EPS) return false;
    if (Math.abs(Number(a?.z) - Number(b?.z)) > EQ_EPS) return false;
    if (Number(a?.rowNumber) !== Number(b?.rowNumber)) return false;
    if (Boolean(a?.isPrimary) !== Boolean(b?.isPrimary)) return false;
    if (Boolean(a?.isSecondary) !== Boolean(b?.isSecondary)) return false;
    if (Math.abs(Number(a?.platformHeightM ?? 0) - Number(b?.platformHeightM ?? 0)) > EQ_EPS) return false;
  }
  return true;
};

/**
 * Builds or rebuilds seating positions whenever seating config changes.
 * Extracted verbatim from RoomDesigner.jsx (lines 2279–2415).
 */
export function useSeatingRebuild({
  appState,
  resolvedProjectId,
  projectIdState,
  loadState,
  seatingConfigEpoch,
  seatingLoadedEpochRef,
  didUserRequestResetRef,
  _seatsPerRowByRow,
  _seatingRows,
  _seatsPerRow,
  _seatSpacing,
  _rowSpacingM,
  _mlpBasis,
  seatingArrangementBasis,
  stableDimensions,
  _rowEarHeights,
}) {
  // Tracks the last MLP Y seen by this hook so we can detect screen-plane shifts
  const prevMlpYRef = useRef(null);
  // Tracks the last resolved visible screen width (metres) to detect screen-size-driven MLP changes
  const prevVisibleWidthMRef = useRef(null);
  // Tracks the last seatingBlockOffset to detect Front Row Distance changes independently
  const prevSeatingBlockOffsetRef = useRef(null);
  // Helper: get ear height for a 1-based row index, falling back to step pattern
  const getRowZ = (rowIndex) => {
    const h = _rowEarHeights?.[rowIndex];
    if (Number.isFinite(h) && h > 0) return h;
    // default pattern: row1=1.2, row2=1.5, row3=1.8, ...
    return 1.2 + rowIndex * 0.3;
  };

  useEffect(() => {
    // CRITICAL: Wait for autosave hydration AND project hydration to be fully ready
    if (!appState?.isHydrated) return;
    if (!appState?.isProjectHydrationReady) return;

    const currentSeats = Array.isArray(appState?.seatingPositions) ? appState.seatingPositions : [];
    const hasProjectId = resolvedProjectId || projectIdState;

    const userHasChangedSeatingSinceLoad =
      seatingConfigEpoch !== (seatingLoadedEpochRef?.current ?? 0);

    const isScratch = loadState?.phase === "scratch" && !hasProjectId;

    // Pre-compute rowsAlreadyMatchCurrentCenters (needed by both the initial boot guard and the early-return guard)
    const rowsAlreadyMatchCurrentCenters = (() => {
      if (!Array.isArray(appState?.rowCentersM) || appState.rowCentersM.length === 0) return false;
      if (!currentSeats.length) return false;
      const byRow = {};
      currentSeats.forEach(s => {
        const r = (s.rowNumber ?? 1) - 1;
        if (byRow[r] === undefined) byRow[r] = s.y;
      });
      return appState.rowCentersM.every((centerY, i) => {
        if (byRow[i] === undefined) return false;
        return Math.abs(byRow[i] - centerY) <= 0.001;
      });
    })();

    // Allow one scratch rebuild on first Free Use boot when seats don't yet match the live centres
    const shouldRunInitialScratchRebuild =
      isScratch &&
      !didUserRequestResetRef.current &&
      !userHasChangedSeatingSinceLoad &&
      currentSeats.length > 0 &&
      Array.isArray(appState?.rowCentersM) &&
      appState.rowCentersM.length > 0 &&
      Number.isFinite(appState?.mlpY_m) &&
      !rowsAlreadyMatchCurrentCenters;

    // ── SCRATCH MODE: stable offset-aware rebuild ──────────────────────────────
    if ((isScratch && userHasChangedSeatingSinceLoad && !didUserRequestResetRef.current) || shouldRunInitialScratchRebuild) {
      const setSeats = appState?.setSeatingPositions;
      if (typeof setSeats !== 'function') return;

      const screenFrontPlaneM = Number.isFinite(Number(appState?.screenFrontPlaneM))
        ? Number(appState.screenFrontPlaneM)
        : (Number.isFinite(Number(appState?.screen?.screenPlaneY_m)) && Number(appState.screen.screenPlaneY_m) > 0
            ? Number(appState.screen.screenPlaneY_m)
            : Number(appState?.screen?.floatDepthM) || 0.20);

      const visibleWidthInches = resolveVisibleWidthInches(appState?.screen);
      const idealDistM = distanceFor57_5FromWidth(visibleWidthInches * 0.0254);
      const _screenDerivedBaseY = screenFrontPlaneM + idealDistM;
      const rspAnchorY =
        appState?.rspMode === "auto_from_screen" && Number.isFinite(appState?.mlpY_m)
          ? appState.mlpY_m
          : _screenDerivedBaseY;
      const _row1Abs = Number(appState?.seatingBlockOffset);
      const stableBaseY = (Number.isFinite(_row1Abs) && _row1Abs > 0) ? _row1Abs : rspAnchorY;

      const list = Array.isArray(_seatsPerRowByRow) && _seatsPerRowByRow.length
        ? _seatsPerRowByRow
        : Array.from(
            { length: Math.max(1, Number(_seatingRows) || 1) },
            () => Math.max(1, Number(_seatsPerRow) || 1)
          );

      const len = Number(stableDimensions?.length) || Number(appState?.roomDims?.lengthM) || 6.0;
      const MIN_Y = 0;
      const MAX_Y = len;
      const clampY = (y) => Math.max(MIN_Y, Math.min(MAX_Y, y));

      const rawCenters = buildRowCenters(stableBaseY, list.length, Number(_rowSpacingM) || 1.8, seatingArrangementBasis || _mlpBasis) || [];
      const centers = rawCenters.map((y) => clampY(Number(y)));

      if (typeof appState?.setRowCentersM === 'function' && !arraysEqualWithin1mm(appState?.rowCentersM || [], centers)) {
        appState.setRowCentersM(centers);
      }

      const roomWidth = Number(stableDimensions?.width) || 4.5;
      const centerX = roomWidth / 2;
      const spacingX = Number(_seatSpacing) || 0.8;
      const scratchPrevById = new Map(currentSeats.map(s => [s.id, s]));

      const seats = [];
      list.forEach((rawCount, rowIndex) => {
        const count = Math.max(1, Number(rawCount) || 1);
        const y = centers[rowIndex] ?? clampY(stableBaseY);
        const totalWidth = (count - 1) * spacingX;
        const startX = centerX - totalWidth / 2;
        const defaultPlatformH = rowIndex === 0 ? 0 : Math.max(0, getRowZ(rowIndex) - getRowZ(0));
        for (let i = 0; i < count; i++) {
          const seatId = `seat-r${rowIndex + 1}-c${i + 1}`;
          const scratchPrev = scratchPrevById.get(seatId);
          seats.push({
            id: seatId,
            x: startX + i * spacingX,
            y,
            z: getRowZ(rowIndex),
            rowNumber: rowIndex + 1,
            platformHeightM: Number.isFinite(scratchPrev?.platformHeightM) ? scratchPrev.platformHeightM : defaultPlatformH,
          });
        }
      });

      setSeats((prev) => (seatsEqualWithin1mm(prev, seats) ? prev : seats));
      return;
    }

    // Guard: preserve Free Use starter seating written by useProjectLoader on first scratch load
    if (
      loadState?.phase === "scratch" &&
      !hasProjectId &&
      !didUserRequestResetRef.current &&
      !userHasChangedSeatingSinceLoad &&
      currentSeats.length > 0 &&
      Array.isArray(appState?.rowCentersM) && appState.rowCentersM.length > 0 &&
      Number.isFinite(appState?.mlpY_m) &&
      rowsAlreadyMatchCurrentCenters
    ) {
      return;
    }

    const isLoadedProject = loadState?.phase === "loaded" && !!hasProjectId;

    // ── LOADED-PROJECT PRESERVATION GUARD ────────────────────────────────────
    // For any loaded project where the user has NOT yet changed seating controls
    // or requested a reset, preserve the restored seating unconditionally.
    // This is NOT one-shot — it continues protecting on every pass until
    // userHasChangedSeatingSinceLoad becomes true or a reset is requested.
    // This prevents screen geometry finalising during project load from being
    // misinterpreted as a live seating-reference change.
    if (
      isLoadedProject &&
      currentSeats.length > 0 &&
      !userHasChangedSeatingSinceLoad &&
      !didUserRequestResetRef.current &&
      !(appState?.roomResetEpoch > 0)
    ) {
      // Seed tracking refs so that when the user does make a genuine change,
      // deltas are measured correctly from the stable loaded state.
      const _seedVisibleWidthM = resolveVisibleWidthInches(appState?.screen) * 0.0254;
      if (prevVisibleWidthMRef.current === null) prevVisibleWidthMRef.current = _seedVisibleWidthM;
      const _seedMlpY = Number.isFinite(appState?.mlpY_m) ? appState.mlpY_m : null;
      if (prevMlpYRef.current === null && _seedMlpY !== null) prevMlpYRef.current = _seedMlpY;
      const _seedOffset = Number(appState?.seatingBlockOffset);
      if (prevSeatingBlockOffsetRef.current === null) prevSeatingBlockOffsetRef.current = _seedOffset;
      return;
    }
    // ── END LOADED-PROJECT PRESERVATION GUARD ────────────────────────────────

    // ── 57.5° LOCK: calculate live RSP regardless of project mode ─────────────
    const liveScreenFrontPlaneM = Number.isFinite(Number(appState?.screenFrontPlaneM)) && Number(appState.screenFrontPlaneM) > 0
      ? Number(appState.screenFrontPlaneM)
      : (Number.isFinite(Number(appState?.screen?.screenPlaneY_m)) && Number(appState.screen.screenPlaneY_m) > 0
          ? Number(appState.screen.screenPlaneY_m)
          : Number(appState?.screen?.floatDepthM) || 0.20);
    const liveVisibleWidthInches = resolveVisibleWidthInches(appState?.screen);
    const liveFix57MlpY = liveScreenFrontPlaneM + distanceFor57_5FromWidth(liveVisibleWidthInches * 0.0254);
    const liveRow1AbsoluteY = Number(appState?.seatingBlockOffset);
    const liveRow1IsSet = Number.isFinite(liveRow1AbsoluteY) && liveRow1AbsoluteY > 0;

    const currentVisibleWidthM57 = liveVisibleWidthInches * 0.0254;
    const seatingReferenceChanged =
      (prevVisibleWidthMRef.current !== null && Math.abs(currentVisibleWidthM57 - prevVisibleWidthMRef.current) > 0.001) ||
      (prevMlpYRef.current !== null && Math.abs(liveFix57MlpY - prevMlpYRef.current) > 0.005) ||
      (prevSeatingBlockOffsetRef.current !== null && Math.abs(liveRow1AbsoluteY - prevSeatingBlockOffsetRef.current) > 0.005);

    // ── SCREEN-PLANE DELTA SHIFT ───────────────────────────────────────────────
    const currentMlpY = Number.isFinite(appState?.mlpY_m) ? appState.mlpY_m : null;
    if (
      currentMlpY !== null &&
      prevMlpYRef.current !== null &&
      currentSeats.length > 0 &&
      !userHasChangedSeatingSinceLoad &&
      !didUserRequestResetRef.current &&
      !(appState?.roomResetEpoch > 0)
    ) {
      const deltaY = currentMlpY - prevMlpYRef.current;
      if (Math.abs(deltaY) > EQ_EPS) {
        const len = Number(stableDimensions?.length) || Number(appState?.roomDims?.lengthM) || 6.0;
        const MIN_Y = 0;
        const MAX_Y = len;
        const clampY = (y) => Math.max(MIN_Y, Math.min(MAX_Y, y));

        const shiftedSeats = currentSeats.map(s => ({
          ...s,
          y: clampY(Number(s.y) + deltaY),
        }));

        if (typeof appState?.setSeatingPositions === 'function') {
          appState.setSeatingPositions(prev => seatsEqualWithin1mm(prev, shiftedSeats) ? prev : shiftedSeats);
        }

        if (typeof appState?.setRowCentersM === 'function' && Array.isArray(appState?.rowCentersM)) {
          const shiftedCenters = appState.rowCentersM.map(c => clampY(Number(c) + deltaY));
          if (!arraysEqualWithin1mm(appState.rowCentersM, shiftedCenters)) {
            appState.setRowCentersM(shiftedCenters);
          }
        }

        prevMlpYRef.current = currentMlpY;
        return;
      }
    }
    // Always keep prevMlpYRef in sync after any hydrated render
    if (currentMlpY !== null) {
      prevMlpYRef.current = currentMlpY;
    }

    // ── SCREEN-WIDTH ABSOLUTE Y CORRECTION ───────────────────────────────────
    const currentVisibleWidthM = resolveVisibleWidthInches(appState?.screen) * 0.0254;
    const prevWidthM = prevVisibleWidthMRef.current;
    const widthChangedAfterHydration =
      prevWidthM !== null &&
      Math.abs(currentVisibleWidthM - prevWidthM) > 0.001 &&
      currentSeats.length > 0 &&
      !didUserRequestResetRef.current &&
      !(appState?.roomResetEpoch > 0) &&
      Number.isFinite(appState?.mlpY_m);

    if (widthChangedAfterHydration) {
      const list = Array.isArray(_seatsPerRowByRow) && _seatsPerRowByRow.length
        ? _seatsPerRowByRow
        : Array.from(
            { length: Math.max(1, Number(_seatingRows) || 1) },
            () => Math.max(1, Number(_seatsPerRow) || 1)
          );

      const len = Number(stableDimensions?.length) || Number(appState?.roomDims?.lengthM) || 6.0;
      const MIN_Y = 0;
      const MAX_Y = len;
      const clampY = (y) => Math.max(MIN_Y, Math.min(MAX_Y, y));

      let newCenters = [];
      try {
        newCenters = buildRowCenters(
          appState.mlpY_m,
          list.length,
          Number(_rowSpacingM) || 1.8,
          seatingArrangementBasis || _mlpBasis
        ) || [];
      } catch (e) {
        newCenters = [];
      }

      if (newCenters.length === list.length) {
        const clampedCenters = newCenters.map(y => clampY(Number(y)));

        if (typeof appState?.setRowCentersM === 'function' && !arraysEqualWithin1mm(appState?.rowCentersM || [], clampedCenters)) {
          appState.setRowCentersM(clampedCenters);
        }

        const updatedSeats = currentSeats.map(s => {
          const rowIdx = (s.rowNumber ?? 1) - 1;
          const newY = clampedCenters[rowIdx] !== undefined ? clampedCenters[rowIdx] : Number(s.y);
          return { ...s, y: newY };
        });

        if (typeof appState?.setSeatingPositions === 'function') {
          appState.setSeatingPositions(prev => seatsEqualWithin1mm(prev, updatedSeats) ? prev : updatedSeats);
        }

        prevVisibleWidthMRef.current = currentVisibleWidthM;
        prevMlpYRef.current = appState.mlpY_m;
        return;
      }
    }

    // Always keep prevVisibleWidthMRef in sync after hydration
    if (prevWidthM === null) {
      prevVisibleWidthMRef.current = currentVisibleWidthM;
    }
    if (prevMlpYRef.current === null && Number.isFinite(liveFix57MlpY)) {
      prevMlpYRef.current = liveFix57MlpY;
    }
    if (prevSeatingBlockOffsetRef.current === null) {
      prevSeatingBlockOffsetRef.current = liveRow1AbsoluteY;
    }

    if (
      isLoadedProject &&
      currentSeats.length > 0 &&
      !userHasChangedSeatingSinceLoad &&
      !didUserRequestResetRef.current &&
      !(appState?.roomResetEpoch > 0) &&
      !seatingReferenceChanged
    ) {
      return;
    }

    const setSeats = appState?.setSeatingPositions;
    if (typeof setSeats !== 'function') return;

    // 1) Decide how many seats in each row
    const list = Array.isArray(_seatsPerRowByRow) && _seatsPerRowByRow.length ?
    _seatsPerRowByRow :
    Array.from(
      { length: Math.max(1, Number(_seatingRows) || 1) },
      () => Math.max(1, Number(_seatsPerRow) || 1)
    );

    // 2) Row centre Y positions
    let centers = [];

    if (centers.length < list.length) {
      const rowsNeeded = list.length;

      const screenFrontPlaneM = Number.isFinite(Number(appState?.screenFrontPlaneM))
        ? Number(appState.screenFrontPlaneM)
        : (Number.isFinite(Number(appState?.screen?.screenPlaneY_m)) && Number(appState.screen.screenPlaneY_m) > 0
            ? Number(appState.screen.screenPlaneY_m)
            : Number(appState?.screen?.floatDepthM) || 0.20);
      const visibleWidthInches = resolveVisibleWidthInches(appState?.screen);
      const liveMlpY = screenFrontPlaneM + distanceFor57_5FromWidth(visibleWidthInches * 0.0254);
      const mlpY =
        appState?.rspMode === "auto_from_screen" && Number.isFinite(appState?.mlpY_m)
          ? appState.mlpY_m
          : (Number.isFinite(liveMlpY) ? liveMlpY : appState?.mlpY_m);
      const rowSpacing = Number(_rowSpacingM) || 1.8;
      const mlpReference = seatingArrangementBasis || _mlpBasis;

      if (Number.isFinite(mlpY) && typeof buildRowCenters === 'function' && typeof appState?.setRowCentersM === 'function') {
        let generated = [];

        try {
          generated = buildRowCenters(mlpY, rowsNeeded, rowSpacing, mlpReference) || [];
        } catch (e) {
          generated = [];
        }

        const len = Number(stableDimensions?.length) || Number(appState?.roomDims?.lengthM) || 6.0;
        const MIN_Y = 0;
        const MAX_Y = len;
        const clampY = (y) => Math.max(MIN_Y, Math.min(MAX_Y, y));

        if (Array.isArray(generated) && generated.length === rowsNeeded) {
          const row1Abs = Number(appState?.seatingBlockOffset);
          let finalGenerated = generated;
          if (Number.isFinite(row1Abs) && row1Abs > 0) {
            const shiftFromRsp = row1Abs - generated[0];
            finalGenerated = generated.map(y => y + shiftFromRsp);
          }
          const clamped = finalGenerated.map((y) => clampY(Number(y)));
          if (!arraysEqualWithin1mm(appState?.rowCentersM || [], clamped)) {
            appState.setRowCentersM(clamped);
          }
          centers = clamped;
        } else {
          return;
        }
      } else {
        return;
      }
    }

    // 3) Basic geometry
    const roomWidth = Number(stableDimensions?.width) || 4.5;
    const centerX = roomWidth / 2;
    const spacingX = Number(_seatSpacing) || 0.8;

    // 4) Build all seats
    const prevSeatById = new Map(currentSeats.map(s => [s.id, s]));
    const seats = [];

    list.forEach((rawCount, rowIndex) => {
      const count = Math.max(1, Number(rawCount) || 1);
      const y = Number(centers[rowIndex]);

      const totalWidth = (count - 1) * spacingX;
      const startX = centerX - totalWidth / 2;

      for (let i = 0; i < count; i++) {
        const seatId = `seat-r${rowIndex + 1}-c${i + 1}`;
        const prev = prevSeatById.get(seatId);

        const defaultPlatformH = rowIndex === 0 ? 0 : Math.max(0, getRowZ(rowIndex) - getRowZ(0));
        seats.push({
          id: seatId,
          x: startX + i * spacingX,
          y,
          z: getRowZ(rowIndex),
          rowNumber: rowIndex + 1,
          isPrimary: prev?.isPrimary || false,
          isSecondary: prev?.isSecondary || false,
          platformHeightM: Number.isFinite(prev?.platformHeightM) ? prev.platformHeightM : defaultPlatformH,
        });
      }
    });

    // 5) Commit to app state
    setSeats((prev) => (seatsEqualWithin1mm(prev, seats) ? prev : seats));

    // Update seatingBlockOffset ref so next render can detect further changes
    prevSeatingBlockOffsetRef.current = liveRow1AbsoluteY;

    if (globalThis.__B44_LOGS) console.log(
      '[RD] seating rebuilt: rows=',
      list.length,
      'seats=',
      seats.length,
      'list=',
      list
    );
  }, [
    appState?.isHydrated,
    appState?.setSeatingPositions,
    _seatsPerRowByRow,
    _seatingRows,
    _seatsPerRow,
    _seatSpacing,
    appState?.rowCentersM,
    appState?.mlpY_m,
    appState?.setRowCentersM,
    stableDimensions?.width,
    stableDimensions?.length,
    appState?.roomResetEpoch,
    loadState?.phase,
    seatingConfigEpoch,
    _rowSpacingM,
    _mlpBasis,
    seatingArrangementBasis,
    appState?.seatingBlockOffset,
    appState?.screenFrontPlaneM,
    appState?.screen?.screenPlaneY_m,
    appState?.screen?.floatDepthM,
    appState?.screen?.visibleWidthInches,
    appState?.screen?.tvPresetKey,
    appState?.screen?.tvWidthMm,
    _rowEarHeights,
    appState?.rspMode,
  ]);
}