import { useCallback } from "react";

/**
 * useRoomCanvasMouseMove
 *
 * Handles the SVG onMouseMove event during drag operations.
 * Extracted from RoomVisualisation.jsx – behaviour is identical.
 *
 * Returns: { handleMouseMove }
 */
export function useRoomCanvasMouseMove({
  dragging,
  draggedItemId,
  dragType,
  dragState,
  setDragState,
  setDragWarning,
  svgRef,
  canvasToRoom,
  roomToCanvas,
  dragOffsetRoomRef,
  roomRect,
  placedSpeakers,
  handleSpeakerDrag,
  handleSeatDrag,
  handleSubDrag,
  handleProjectorDrag,
  handleRoomElementDrag,
  // RSP marker drag
  handleMlpDrag,
}) {
  const handleMouseMove = useCallback((e) => {
    if (globalThis.__B44_LOGS) console.log("[DRAG] MOVE", { dragging: dragState.dragging, draggedItemId: dragState.draggedItemId, dragType: dragState.dragType });
    if (!dragging || !draggedItemId) return;
    setDragWarning({ show: false });

    if (!svgRef.current) return;
    const svgElement = svgRef.current;
    const point = svgElement.createSVGPoint();
    point.x = e.clientX;
    point.y = e.clientY;
    const ctm = svgElement.getScreenCTM();
    if (!ctm) return;
    const inverseCTM = ctm.inverse();
    const svgPoint = point.matrixTransform(inverseCTM);

    // Convert cursor to room coords and apply stored offset
    const cursorRoom = canvasToRoom({ x: svgPoint.x, y: svgPoint.y });
    const targetRoomPos = {
      x: cursorRoom.x + dragOffsetRoomRef.current.x,
      y: cursorRoom.y + dragOffsetRoomRef.current.y
    };

    // Convert back to canvas for existing logic
    const targetCanvasPos = roomToCanvas(targetRoomPos);

    if (globalThis.__B44_LOGS) console.log("[DRAG] MOVE_LOOKUP", { draggedItemId, found: !!placedSpeakers.find(s => s.id === draggedItemId) });

    const clampedCanvasX = Math.max(roomRect?.x ?? 0, Math.min((roomRect?.x ?? 0) + (roomRect?.width ?? 0), targetCanvasPos.x));
    const clampedCanvasY = Math.max(roomRect?.y ?? 0, Math.min((roomRect?.y ?? 0) + (roomRect?.height ?? 0), targetCanvasPos.y));

    if (dragType === 'speaker') {
      handleSpeakerDrag(draggedItemId, { x: clampedCanvasX, y: clampedCanvasY });
    } else if (dragType === 'seat') {
      handleSeatDrag(draggedItemId, { x: clampedCanvasX, y: clampedCanvasY });
    } else if (dragType === 'sub') {
      handleSubDrag(draggedItemId, { x: clampedCanvasX, y: clampedCanvasY });
      setDragState(s => (s && s.dragging ? { ...s } : s));
    } else if (dragType === 'projector') {
      handleProjectorDrag?.(draggedItemId, { x: clampedCanvasX, y: clampedCanvasY });
    } else if (dragType === 'roomElement') {
      handleRoomElementDrag?.(draggedItemId, { x: clampedCanvasX, y: clampedCanvasY });
    } else if (dragType === 'mlpMarker') {
      handleMlpDrag?.(draggedItemId, targetRoomPos);
    }
  }, [
    dragging, draggedItemId, dragType, dragState,
    setDragWarning, svgRef, canvasToRoom, roomToCanvas,
    dragOffsetRoomRef, roomRect, placedSpeakers,
    handleSpeakerDrag, handleSeatDrag, handleSubDrag, handleProjectorDrag,
    handleRoomElementDrag, handleMlpDrag, setDragState,
  ]);

  return { handleMouseMove };
}