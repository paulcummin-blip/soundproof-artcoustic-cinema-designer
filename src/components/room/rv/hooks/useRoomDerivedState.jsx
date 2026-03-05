import { useMemo } from "react";

/**
 * useRoomDerivedState
 * Extracts pure derived calculations from RoomVisualisation:
 * - overheadCount / visibleOverheadPositions from dolbyLayout
 * - speakersToRender (LFE-filtered speaker list)
 * - rowFrontWallLabelSeatIds / rowDistanceLabelSeatIds (seat row clustering)
 *
 * No state writes, no side effects, no render refs.
 */
export function useRoomDerivedState({
  placedSpeakers,
  seatingPositions,
  dolbyLayout,
  speakerPositionsView,
  overlays,
  appState,
  getCanonicalRole,
}) {
  // Get overhead count from dolbyLayout
  const overheadCount = useMemo(() => {
    if (!dolbyLayout) return 0;
    const parts = String(dolbyLayout).split('.');
    if (parts.length < 3) return 0;
    return parseInt(parts[2]) || 0;
  }, [dolbyLayout]);

  // Determine which overhead positions are visible
  const visibleOverheadPositions = useMemo(() => {
    const positions = [];
    if (overheadCount === 2) {
      positions.push('mid');
    } else if (overheadCount === 4) {
      positions.push('front', 'rear');
    } else if (overheadCount === 6) {
      positions.push('front', 'mid', 'rear');
    }
    return positions;
  }, [overheadCount]);

  // Filter and position speakers for rendering (skip LFE)
  const speakersToRender = useMemo(() => {
    const base = Array.isArray(placedSpeakers) ? placedSpeakers : [];
    const withoutLfe = base.filter((spk) => {
      const canonicalRole = getCanonicalRole(spk.role);
      return canonicalRole !== "LFE";
    });
    if (globalThis.__B44_LOGS) {
      const roles = withoutLfe.map(s => getCanonicalRole(s.role));
      console.log("[RV] roles present:", roles);
    }
    return withoutLfe;
  }, [placedSpeakers, appState?.visibleRoles, getCanonicalRole]);

  // Row front-wall distance labels (only for Speaker Positions plan)
  const rowFrontWallLabelSeatIds = useMemo(() => {
    if (speakerPositionsView !== 'plan') return new Set();
    if (!Array.isArray(seatingPositions) || seatingPositions.length === 0) return new Set();

    const allSeatsWithY = seatingPositions
      .map(s => ({ seat: s, y: Number(s?.y ?? s?.position?.y ?? 0) }))
      .filter(item => Number.isFinite(item.y))
      .sort((a, b) => a.y - b.y);

    const rows = [];
    for (const item of allSeatsWithY) {
      const lastRow = rows[rows.length - 1];
      if (!lastRow || Math.abs(item.y - lastRow.y) > 0.20) {
        rows.push({ y: item.y, seats: [item.seat] });
      } else {
        lastRow.seats.push(item.seat);
      }
    }

    const labeledSeatIds = new Set();
    for (const row of rows) {
      const sortedByX = row.seats
        .map(s => ({ seat: s, x: Number(s?.x ?? s?.position?.x ?? 0) }))
        .filter(item => Number.isFinite(item.x))
        .sort((a, b) => a.x - b.x);

      if (sortedByX.length === 0) continue;

      const count = sortedByX.length;
      const chosenIndex = count % 2 === 1
        ? Math.floor(count / 2)
        : (count / 2 - 1);

      const chosenSeat = sortedByX[chosenIndex]?.seat;
      if (chosenSeat?.id) labeledSeatIds.add(chosenSeat.id);
    }

    return labeledSeatIds;
  }, [speakerPositionsView, seatingPositions]);

  // Row distance labels (ROOM_DIMS overlay) - furthest-right seat per row
  const rowDistanceLabelSeatIds = useMemo(() => {
    if (!overlays?.ROOM_DIMS) return new Set();
    if (!Array.isArray(seatingPositions) || seatingPositions.length === 0) return new Set();

    const allSeatsWithY = seatingPositions
      .map(s => ({ seat: s, y: Number(s?.y ?? s?.position?.y ?? 0) }))
      .filter(item => Number.isFinite(item.y))
      .sort((a, b) => a.y - b.y);

    const rows = [];
    for (const item of allSeatsWithY) {
      const lastRow = rows[rows.length - 1];
      if (!lastRow || Math.abs(item.y - lastRow.y) > 0.20) {
        rows.push({ y: item.y, seats: [item.seat] });
      } else {
        lastRow.seats.push(item.seat);
      }
    }

    const labeledSeatIds = new Set();
    for (const row of rows) {
      const sortedByX = row.seats
        .map(s => ({ seat: s, x: Number(s?.x ?? s?.position?.x ?? 0) }))
        .filter(item => Number.isFinite(item.x))
        .sort((a, b) => b.x - a.x); // Descending - furthest right first

      if (sortedByX.length === 0) continue;

      const furthestRight = sortedByX[0]?.seat;
      if (furthestRight?.id) labeledSeatIds.add(furthestRight.id);
    }

    return labeledSeatIds;
  }, [overlays?.ROOM_DIMS, seatingPositions]);

  return {
    overheadCount,
    visibleOverheadPositions,
    speakersToRender,
    rowFrontWallLabelSeatIds,
    rowDistanceLabelSeatIds,
  };
}