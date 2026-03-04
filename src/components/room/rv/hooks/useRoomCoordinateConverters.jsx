/**
 * useRoomCoordinateConverters.js
 * Extracted from RoomVisualisation.jsx (Stage 1).
 *
 * Returns stable coordinate-conversion callbacks for transforming between
 * room-space metres and canvas-space pixels.
 */

import { useCallback } from 'react';

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * @param {{
 *   roomRect: { x: number, y: number }|null,
 *   scale: number,
 *   viewOffsetPx: { x: number, y: number },
 * }} opts
 * @returns {{
 *   toPx: (x_m:number, y_m:number) => [number, number],
 *   meterToCanvasX: (xM:number) => number,
 *   meterToCanvasY: (yM:number) => number,
 *   canvasToRoom: (posPx:{ x:number, y:number }) => { x:number, y:number },
 *   roomToCanvas: (posM:{ x:number, y:number }) => { x:number, y:number },
 * }}
 */
export function useRoomCoordinateConverters({ roomRect, scale, viewOffsetPx }) {

  /** Convert room metres (x, y) → canvas pixel coordinates [px, py]. */
  const toPx = useCallback((x_m, y_m) => {
    if (!roomRect || !Number.isFinite(scale)) return [0, 0];
    const x = (roomRect?.x ?? 0) + x_m * scale;
    const y = (roomRect?.y ?? 0) + y_m * scale;
    return [Math.round(x) + 0.5, Math.round(y) + 0.5];
  }, [roomRect, scale]);

  /** Convert a single room X (metres) → canvas pixel X. */
  const meterToCanvasX = useCallback((xM) => {
    if (!roomRect || !Number.isFinite(scale)) return 0;
    const x = (roomRect?.x ?? 0) + xM * scale;
    return Math.round(x) + 0.5;
  }, [roomRect, scale]);

  /** Convert a single room Y (metres) → canvas pixel Y. */
  const meterToCanvasY = useCallback((yM) => {
    if (!roomRect || !Number.isFinite(scale)) return 0;
    const y = (roomRect?.y ?? 0) + yM * scale;
    return Math.round(y) + 0.5;
  }, [roomRect, scale]);

  /** Convert a canvas pixel position → room metres, accounting for pan offset. */
  const canvasToRoom = useCallback((posPx) => {
    if (!posPx) return { x: 0, y: 0 };
    if (!roomRect || !Number.isFinite(scale)) return { x: 0, y: 0 };
    const xM = (posPx.x - (roomRect?.x ?? 0) - viewOffsetPx.x) / scale;
    const yM = (posPx.y - (roomRect?.y ?? 0) - viewOffsetPx.y) / scale;
    return { x: xM, y: yM };
  }, [roomRect, scale, viewOffsetPx]);

  /** Convert a room-metres position → canvas pixel position. */
  const roomToCanvas = useCallback((posM) => {
    if (!posM) return { x: 0, y: 0 };
    if (!roomRect || !Number.isFinite(scale)) return { x: 0, y: 0 };
    const xPx = (roomRect?.x ?? 0) + posM.x * scale;
    const yPx = (roomRect?.y ?? 0) + posM.y * scale;
    return { x: Math.round(xPx) + 0.5, y: Math.round(yPx) + 0.5 };
  }, [roomRect, scale]);

  return { toPx, meterToCanvasX, meterToCanvasY, canvasToRoom, roomToCanvas };
}