import { useCallback } from "react";
import { clientToRoom, computeDragTargetRoom } from "@/components/room/rv/utils/rvPointerToRoom";

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
  // Canonical pointer conversion inputs — the same pan/view-offset/zoom the
  // draggable zoom group renders with.
  scale,
  viewOffsetPx,
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
  // Ref-based RSP drag guard — set synchronously in mousedown, never stale
  mlpDragActiveRef,
}) {
  const handleMouseMove = useCallback((e) => {
    if (globalThis.__B44_LOGS) console.log("[DRAG] MOVE", { dragging: dragState.dragging, draggedItemId: dragState.draggedItemId, dragType: dragState.dragType });
    const isMlpDragging = mlpDragActiveRef?.current === true;
    if ((!dragging || !draggedItemId) && !isMlpDragging) return;
    setDragWarning({ show: false });

    if (!svgRef.current) return;
    const svgElement = svgRef.current;

    // ONE canonical conversion: screen pixels -> zoom-group-local -> room metres.
    const pointerRoom = clientToRoom({
      svgElement,
      clientX: e.clientX,
      clientY: e.clientY,
      roomRect,
      scale,
      viewOffsetPx,
    });
    if (!pointerRoom) return;

    // The pointer-to-object offset is applied exactly ONCE, here, so a 1 px
    // pointer move produces a 1 px object move at any zoom.
    const targetRoomPos = computeDragTargetRoom({
      pointerRoom,
      dragOffsetRoom: dragOffsetRoomRef.current,
    });

    // Canvas round-trip for the handlers that still work in canvas space.
    const targetCanvasPos = roomToCanvas(targetRoomPos);

    if (globalThis.__B44_LOGS) console.log("[DRAG] MOVE_LOOKUP", { draggedItemId, found: !!placedSpeakers.find(s => s.id === draggedItemId) });

    const clampedCanvasX = Math.max(roomRect?.x ?? 0, Math.min((roomRect?.x ?? 0) + (roomRect?.width ?? 0), targetCanvasPos.x));
    const clampedCanvasY = Math.max(roomRect?.y ?? 0, Math.min((roomRect?.y ?? 0) + (roomRect?.height ?? 0), targetCanvasPos.y));

    // mlpMarker: also check ref so the branch fires on the very first mousemove
    // frame before React state has flushed from the synchronous mousedown.
    if (dragType === 'mlpMarker' || isMlpDragging) {
      handleMlpDrag?.(draggedItemId || 'mlp-marker-dot', targetRoomPos);
    } else if (dragType === 'speaker') {
      handleSpeakerDrag(draggedItemId, { x: clampedCanvasX, y: clampedCanvasY });
    } else if (dragType === 'seat') {
      handleSeatDrag(draggedItemId, { x: clampedCanvasX, y: clampedCanvasY });
    } else if (dragType === 'sub') {
      // Room metres, offset already applied. Never converted back and never
      // offset again inside the handler.
      handleSubDrag(draggedItemId, targetRoomPos);
      setDragState(s => (s && s.dragging ? { ...s } : s));
    } else if (dragType === 'projector') {
      handleProjectorDrag?.(draggedItemId, targetRoomPos);
    } else if (dragType === 'roomElement') {
      handleRoomElementDrag?.(draggedItemId, targetRoomPos);
    }
  }, [
    dragging, draggedItemId, dragType, dragState,
    setDragWarning, svgRef, canvasToRoom, roomToCanvas,
    scale, viewOffsetPx,
    dragOffsetRoomRef, roomRect, placedSpeakers,
    handleSpeakerDrag, handleSeatDrag, handleSubDrag, handleProjectorDrag,
    handleRoomElementDrag, handleMlpDrag, setDragState, mlpDragActiveRef,
  ]);

  return { handleMouseMove };
}