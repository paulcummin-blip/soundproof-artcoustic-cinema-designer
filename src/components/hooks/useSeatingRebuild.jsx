import { useEffect } from "react";
import { buildRowCenters, distanceFor57_5FromWidth } from "@/components/room/seatingUtils";

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
  stableDimensions,
}) {
  useEffect(() => {
    // CRITICAL: Wait for autosave hydration
    if (!appState?.isHydrated) return;

    const currentSeats = Array.isArray(appState?.seatingPositions) ? appState.seatingPositions : [];
    const hasProjectId = resolvedProjectId || projectIdState;

    const userHasChangedSeatingSinceLoad =
      seatingConfigEpoch !== (seatingLoadedEpochRef?.current ?? 0);

    const isScratch = loadState?.phase === "scratch" && !hasProjectId;

    // ── SCRATCH MODE: stable offset-aware rebuild ──────────────────────────────
    // Use floatDepthM as the invariant screen-plane anchor so offset=0 always
    // restores seats to the exact 57.5° boot baseline, regardless of what
    // appState.screenFrontPlaneM has drifted to after speaker placement.
    // This is the single source of truth for Viewing Offset in Free Use mode.
    if (isScratch && userHasChangedSeatingSinceLoad && !didUserRequestResetRef.current) {
      const setSeats = appState?.setSeatingPositions;
      if (typeof setSeats !== 'function') return;

      const floatDepthM = Number(appState?.screen?.floatDepthM) || 0.20;
      const visibleWidthInches = Number(appState?.screen?.visibleWidthInches) || 120;
      const viewingOffsetM = Number(appState?.seatingBlockOffset) || 0;
      const idealDistM = distanceFor57_5FromWidth(visibleWidthInches * 0.0254);
      const stableBaseY = floatDepthM + idealDistM + viewingOffsetM;

      const list = Array.isArray(_seatsPerRowByRow) && _seatsPerRowByRow.length
        ? _seatsPerRowByRow
        : Array.from(
            { length: Math.max(1, Number(_seatingRows) || 1) },
            () => Math.max(1, Number(_seatsPerRow) || 1)
          );

      const len = Number(stableDimensions?.length) || Number(appState?.roomDims?.lengthM) || 6.0;
      const MIN_Y = 0.40;
      const MAX_Y = len - 0.40;
      const clampY = (y) => Math.max(MIN_Y, Math.min(MAX_Y, y));

      const rawCenters = buildRowCenters(stableBaseY, list.length, Number(_rowSpacingM) || 1.8, _mlpBasis) || [];
      const centers = rawCenters.map((y) => clampY(Number(y)));

      const roomWidth = Number(stableDimensions?.width) || 4.5;
      const centerX = roomWidth / 2;
      const spacingX = Number(_seatSpacing) || 0.8;

      const seats = [];
      list.forEach((rawCount, rowIndex) => {
        const count = Math.max(1, Number(rawCount) || 1);
        const y = centers[rowIndex] ?? clampY(stableBaseY);
        const totalWidth = (count - 1) * spacingX;
        const startX = centerX - totalWidth / 2;
        for (let i = 0; i < count; i++) {
          seats.push({
            id: `seat-r${rowIndex + 1}-c${i + 1}`,
            x: startX + i * spacingX,
            y,
            z: 1.2,
            rowNumber: rowIndex + 1,
          });
        }
      });

      setSeats(seats);
      return;
    }

    // Guard: preserve Free Use starter seating written by useProjectLoader on first scratch load
    // Only skips if the user has not yet changed seating controls
    if (
      loadState?.phase === "scratch" &&
      !hasProjectId &&
      !didUserRequestResetRef.current &&
      !userHasChangedSeatingSinceLoad &&
      currentSeats.length > 0 &&
      Array.isArray(appState?.rowCentersM) && appState.rowCentersM.length > 0 &&
      Number.isFinite(appState?.mlpY_m)
    ) {
      return;
    }

    const isLoadedProject = loadState?.phase === "loaded" && !!hasProjectId;

    if (
      isLoadedProject &&
      currentSeats.length > 0 &&
      !userHasChangedSeatingSinceLoad &&
      !didUserRequestResetRef.current &&
      !(appState?.roomResetEpoch > 0)
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
    let centers = Array.isArray(appState?.rowCentersM) ? appState.rowCentersM.slice(0, list.length) : [];

    // If rowCentersM is missing/too short, attempt to generate it from current mlpY_m
    if (centers.length < list.length) {
      const rowsNeeded = list.length;

      const mlpY = appState?.mlpY_m;
      const rowSpacing = Number(_rowSpacingM) || 1.8;
      const mlpReference = _mlpBasis;

      if (Number.isFinite(mlpY) && typeof buildRowCenters === 'function' && typeof appState?.setRowCentersM === 'function') {
        let generated = [];

        try {
          generated = buildRowCenters(mlpY, rowsNeeded, rowSpacing, mlpReference) || [];
        } catch (e) {
          generated = [];
        }

        const len = Number(stableDimensions?.length) || Number(appState?.roomDims?.lengthM) || 6.0;
        const MIN_Y = 0.40;
        const MAX_Y = len - 0.40;
        const clampY = (y) => Math.max(MIN_Y, Math.min(MAX_Y, y));

        if (Array.isArray(generated) && generated.length === rowsNeeded) {
          const clamped = generated.map((y) => clampY(Number(y)));
          appState.setRowCentersM(clamped);
        }

        return;
      }

      return;
    }

    // 3) Basic geometry
    const roomWidth = Number(stableDimensions?.width) || 4.5;
    const centerX = roomWidth / 2;
    const spacingX = Number(_seatSpacing) || 0.8;

    // 4) Build all seats
    const seats = [];

    list.forEach((rawCount, rowIndex) => {
      const count = Math.max(1, Number(rawCount) || 1);
      const y = Number(centers[rowIndex]);

      const totalWidth = (count - 1) * spacingX;
      const startX = centerX - totalWidth / 2;

      for (let i = 0; i < count; i++) {
        seats.push({
          id: `seat-r${rowIndex + 1}-c${i + 1}`,
          x: startX + i * spacingX,
          y,
          z: 1.2,
          rowNumber: rowIndex + 1
        });
      }
    });

    // 5) Commit to app state
    setSeats(seats);

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
    stableDimensions?.width,
    stableDimensions?.length,
    appState?.roomResetEpoch,
    loadState?.phase,
    seatingConfigEpoch,
    // Scratch-mode stable baseline deps:
    appState?.seatingBlockOffset,
    appState?.screen?.floatDepthM,
    appState?.screen?.visibleWidthInches,
  ]);
}