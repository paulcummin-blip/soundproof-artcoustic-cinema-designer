import { useEffect } from "react";
import { publishBestSubLayoutLiveInputs } from "@/components/room/bass/best-layout/bestSubLayoutLiveInputs";

export function usePublishBestSubLayoutInputs({ contextId, physicsOptions }) {
  useEffect(() => {
    publishBestSubLayoutLiveInputs({ contextId, physicsOptions });
  }, [contextId, physicsOptions]);
}