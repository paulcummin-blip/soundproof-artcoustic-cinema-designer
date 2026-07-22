import { useCallback, useEffect } from "react";

export function useResetSideSurrounds({ onSetSpeakers, widthM, lengthM, sideSurroundVisualSpanM, getCanonicalRole, getSpeakerDims, fixedSideX, tvPresetKey }) {
  const resetSideSurroundsToDefault = useCallback(() => {
    onSetSpeakers((previous) => {
      const left = previous.find((speaker) => getCanonicalRole(speaker.role) === "SL");
      const right = previous.find((speaker) => getCanonicalRole(speaker.role) === "SR");
      if (!left && !right) return previous;

      const roomWidth = widthM || 4.5;
      const roomLength = lengthM || 6;
      const leftDimensions = left ? getSpeakerDims(left.model, tvPresetKey) : { depthM: 0.082 };
      const rightDimensions = right ? getSpeakerDims(right.model, tvPresetKey) : { depthM: 0.082 };
      const leftX = fixedSideX(roomWidth, leftDimensions, "L");
      const rightX = fixedSideX(roomWidth, rightDimensions, "R");
      const minimumY = Number(sideSurroundVisualSpanM?.minY);
      const maximumY = Number(sideSurroundVisualSpanM?.maxY);
      const validSpan = Number.isFinite(minimumY) && Number.isFinite(maximumY) && maximumY > minimumY;
      const targetY = validSpan ? (minimumY + maximumY) / 2 : roomLength / 2;

      return previous.map((speaker) => {
        const role = getCanonicalRole(speaker.role);
        if (role !== "SL" && role !== "SR") return speaker;
        const position = { x: role === "SL" ? leftX : rightX, y: targetY };
        return { ...speaker, defaultPosition: position, position: { ...speaker.position, ...position } };
      });
    });
  }, [onSetSpeakers, widthM, lengthM, sideSurroundVisualSpanM, getCanonicalRole, getSpeakerDims, fixedSideX, tvPresetKey]);

  useEffect(() => {
    window.addEventListener("b44:resetSideSurrounds", resetSideSurroundsToDefault);
    return () => window.removeEventListener("b44:resetSideSurrounds", resetSideSurroundsToDefault);
  }, [resetSideSurroundsToDefault]);

  return resetSideSurroundsToDefault;
}