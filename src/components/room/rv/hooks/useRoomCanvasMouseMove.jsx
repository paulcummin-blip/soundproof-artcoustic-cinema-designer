import { useCallback } from "react";
import { clientToRoom, computeDragTargetRoom } from "@/components/room/rv/utils/rvPointerToRoom";
import { isDragPointer, primaryButtonHeld } from "@/components/room/rv/utils/rvDragGesture";

/** One screen → room conversion. All constraint handlers receive room metres. */
export function useRoomCanvasMouseMove({
  activeDragRef,
  setDragState,
  setDragWarning,
  svgRef,
  scale,
  viewOffsetPx,
  dragOffsetRoomRef,
  roomRect,
  handleSpeakerDrag,
  handleSeatDrag,
  handleSubDrag,
  handleProjectorDrag,
  handleRoomElementDrag,
  handleMlpDrag,
  mlpDragActiveRef,
}) {
  const handleMouseMove = useCallback((e) => {
    const gesture = activeDragRef.current;
    const isMlpDragging = mlpDragActiveRef?.current === true;
    if (!gesture && !isMlpDragging) return;
    // A stale release can never produce a movement frame. RSP placement is a
    // separate explicit mode, not an object or seating drag.
    if (gesture && (!isDragPointer(gesture, e) || !primaryButtonHeld(e))) return;
    const dragType = gesture?.type;
    const draggedItemId = gesture?.id;
    setDragWarning({ show: false });

    const pointerRoom = clientToRoom({
      svgElement: svgRef.current, clientX: e.clientX, clientY: e.clientY,
      roomRect, scale, viewOffsetPx,
    });
    if (!pointerRoom) return;
    const targetRoomPos = computeDragTargetRoom({
      pointerRoom, dragOffsetRoom: dragOffsetRoomRef.current,
    });
    const boundedRoomPos = {
      x: Math.max(0, Math.min(roomRect.width / scale, targetRoomPos.x)),
      y: Math.max(0, Math.min(roomRect.height / scale, targetRoomPos.y)),
    };

    if (dragType === 'mlpMarker' || isMlpDragging) {
      handleMlpDrag?.(draggedItemId || 'mlp-marker-dot', targetRoomPos);
    } else if (dragType === 'speaker') {
      handleSpeakerDrag(draggedItemId, boundedRoomPos);
    } else if (dragType === 'seat') {
      handleSeatDrag(draggedItemId, targetRoomPos);
    } else if (dragType === 'sub') {
      handleSubDrag(draggedItemId, targetRoomPos);
      setDragState(s => (s && s.dragging ? { ...s } : s));
    } else if (dragType === 'projector') {
      handleProjectorDrag?.(draggedItemId, targetRoomPos);
    } else if (dragType === 'roomElement') {
      handleRoomElementDrag?.(draggedItemId, targetRoomPos);
    }
  }, [
    activeDragRef, setDragWarning, svgRef, scale, viewOffsetPx, dragOffsetRoomRef,
    roomRect, handleSpeakerDrag, handleSeatDrag, handleSubDrag, handleProjectorDrag,
    handleRoomElementDrag, handleMlpDrag, setDragState, mlpDragActiveRef,
  ]);
  return { handleMouseMove };
}
