/**
 * useCustomWallDrag.js
 *
 * Encapsulates Custom Wall drag handling for RoomVisualisation so the
 * parent component does not grow. Handles three drag types:
 *   - customWall            whole-wall translate
 *   - customWallEndpoint1    drag endpoint p1 with magnetic snapping
 *   - customWallEndpoint2    drag endpoint p2 with magnetic snapping
 *
 * Returns:
 *   { handleCustomWallDrag, selectedWallId, setSelectedWallId, snapIndicators, customWallDragInfo }
 *
 * The snapIndicators array drives the green snap rings in RvCustomWallLayer.
 * All acoustic/bass/RP22 paths exclude custom_wall types, so this drag has no
 * effect on engineering calculations.
 */

import { useCallback, useState } from "react";
import {
  isCustomWall,
  snapEndpoint,
  collectOtherEndpoints,
  clampEndpointToRoom,
  translateWall,
  translateEndpoint,
} from "@/components/room/customWall/customWallGeometry";

export function useCustomWallDrag({ roomElements, onSetRoomElements, widthM, lengthM }) {
  const [selectedWallId, setSelectedWallId] = useState(null);
  const [snapIndicators, setSnapIndicators] = useState([]);

  const handleCustomWallDrag = useCallback((id, roomPos, dragType) => {
    if (!onSetRoomElements) return;
    const walls = Array.isArray(roomElements) ? roomElements : [];
    const wall = walls.find((w) => String(w?.id) === String(id));
    if (!wall || !isCustomWall(wall)) return;

    if (dragType === 'customWall') {
      // Whole-wall translate: compute delta from midpoint.
      const midX = (Number(wall.p1?.x) + Number(wall.p2?.x)) / 2;
      const midY = (Number(wall.p1?.y) + Number(wall.p2?.y)) / 2;
      const dx = roomPos.x - midX;
      const dy = roomPos.y - midY;
      const next = translateWall(wall, dx, dy);
      onSetRoomElements((prev) =>
        (Array.isArray(prev) ? prev : []).map((w) =>
          String(w?.id) === String(id) ? { ...w, p1: next.p1, p2: next.p2 } : w
        )
      );
      return;
    }

    // Endpoint drag with snapping
    const which = dragType === 'customWallEndpoint1' ? 'p1' : 'p2';
    const otherEndpoints = collectOtherEndpoints(walls, id);
    const clamped = clampEndpointToRoom(roomPos.x, roomPos.y, widthM, lengthM);
    const { x: sx, y: sy, snaps } = snapEndpoint(clamped.x, clamped.y, {
      widthM,
      lengthM,
      otherEndpoints,
    });
    const next = translateEndpoint(wall, which, sx - Number(wall[which]?.x), sy - Number(wall[which]?.y));

    onSetRoomElements((prev) =>
      (Array.isArray(prev) ? prev : []).map((w) =>
        String(w?.id) === String(id) ? { ...w, [which]: next[which] } : w
      )
    );

    // Update snap indicators
    if (snaps.length > 0) {
      setSnapIndicators([{ wallId: id, endpoint: which, snaps }]);
    } else {
      setSnapIndicators([]);
    }
  }, [onSetRoomElements, roomElements, widthM, lengthM]);

  const clearSnapIndicators = useCallback(() => setSnapIndicators([]), []);

  return {
    handleCustomWallDrag,
    selectedWallId,
    setSelectedWallId,
    snapIndicators,
    clearSnapIndicators,
  };
}