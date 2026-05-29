import { useCallback } from "react";
import { targetMlpY57_5 } from "@/components/room/rv/RenderPrimitives";

const SAFETY_MARGIN_M = 0.05;

export function useShiftSeatsToAngle({ lengthM, screen, seatingPositions, onSetSeatingPositions }) {
  const findFrontRowY = useCallback((seats = []) => {
    if (!seats.length) return null;
    return Math.min(...seats.map(s => Number(s.y) || 0));
  }, []);

  const findBackRowY = useCallback((seats = []) => {
    if (!seats.length) return null;
    return Math.max(...seats.map(s => Number(s.y) || 0));
  }, []);

  const shiftSeatsToMaintainAngle = useCallback((mlpRefKey) => {
    const roomLenM = lengthM || 6.0;
    const targetMLP_Y = targetMlpY57_5(screen, 0);

    if (!Array.isArray(seatingPositions) || seatingPositions.length === 0) return;

    const currentRowY = (mlpRefKey === "BACK_ROW_CENTER")
      ? findBackRowY(seatingPositions)
      : findFrontRowY(seatingPositions);

    if (currentRowY == null) return;

    let deltaY = targetMLP_Y - currentRowY;
    const minY = Math.min(...seatingPositions.map(s => Number(s.y) || 0));
    const maxY = Math.max(...seatingPositions.map(s => Number(s.y) || 0));
    const newMinY = minY + deltaY;
    const newMaxY = maxY + deltaY;
    const minAllowed = SAFETY_MARGIN_M;
    const maxAllowed = roomLenM - SAFETY_MARGIN_M;

    if (newMinY < minAllowed) deltaY += (minAllowed - newMinY);
    if (newMaxY > maxAllowed) deltaY -= (newMaxY - maxAllowed);

    onSetSeatingPositions?.((prev) =>
      (prev || []).map(s => ({ ...s, y: (Number(s.y) || 0) + deltaY }))
    );
  }, [lengthM, screen, seatingPositions, onSetSeatingPositions, findFrontRowY, findBackRowY]);

  return { shiftSeatsToMaintainAngle };
}