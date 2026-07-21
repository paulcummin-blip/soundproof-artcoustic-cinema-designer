import { useEffect } from "react";
import { publishBestSubLayoutLiveInputs } from "@/components/room/bass/best-layout/bestSubLayoutLiveInputs";

export function usePublishBestSubLayoutInputs({ roomDims, seatingPositions, rspPosition, physicsOptions, frontSourceHeightM, rearSourceHeightM }) {
  useEffect(() => {
    publishBestSubLayoutLiveInputs({
      roomDims,
      seatingPositions,
      rspPosition,
      physicsOptions,
      sourceHeights: {
        front: Number.isFinite(Number(frontSourceHeightM)) ? Number(frontSourceHeightM) : null,
        rear: Number.isFinite(Number(rearSourceHeightM)) ? Number(rearSourceHeightM) : null,
      },
    });
  }, [roomDims, seatingPositions, rspPosition, physicsOptions, frontSourceHeightM, rearSourceHeightM]);
}