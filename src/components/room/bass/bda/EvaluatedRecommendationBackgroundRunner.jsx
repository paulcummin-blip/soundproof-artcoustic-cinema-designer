// EvaluatedRecommendationBackgroundRunner.jsx
// ---------------------------------------------------------------------------
// Always-mounted owner of the evaluated 1/2/4-subwoofer recommendation search.
//
// It calls the existing useEvaluatedPlacementRecommendations hook (which opens
// the recommendation gate and drives Stage 1 + Stage 2 for quantities 1, 2 and
// 4 using the current room, fixed RSP and listening-position priorities) and
// publishes the results to a shared store that BassDesignAssistant consumes.
//
// Mounting this runner outside the Subwoofer Design accordion is what makes the
// search run in the background: the accordion can open and close without
// unmounting the runner, so no search starts, cancels or restarts on toggle.
// The runner stays mounted for the lifetime of the Room Designer controls
// panel, and the gate stays open so speculative Stage 1/2 work is permitted
// whenever valid room, seating, RSP and cabinet information exists.
//
// This component renders nothing. It owns no acoustic logic of its own.

import { useEffect, useMemo } from "react";
import { useEvaluatedPlacementRecommendations } from "./useEvaluatedPlacementRecommendations";
import { useActiveProjectId } from "@/components/state/project-session";
import { deriveRspPosition, deriveAmplifierPowerPerSubW } from "./recommendationInputs";
import { publishEvaluatedRecommendations, clearEvaluatedRecommendations } from "./evaluatedRecommendationsStore";

export default function EvaluatedRecommendationBackgroundRunner({
  appState,
  roomDims,
  seatingPositions,
  frontSubsCfg,
  rearSubsCfg,
}) {
  const projectId = useActiveProjectId();
  const versionId = appState?.activeVersionId || null;
  const key = `${projectId || "free"}::${versionId || "free"}`;

  const rspPosition = useMemo(() => deriveRspPosition(appState, roomDims), [appState, roomDims]);
  const amplifierPowerPerSubW = useMemo(() => deriveAmplifierPowerPerSubW(appState), [appState]);
  const subwooferInstances = appState?.subwooferInstances || [];

  const rec = useEvaluatedPlacementRecommendations({
    roomDims,
    rspPosition,
    seatingPositions,
    frontSubsCfg,
    rearSubsCfg,
    subwooferInstances,
    appState,
    amplifierPowerPerSubW,
  });

  // Publish the latest evaluated options to the shared store. The store no-ops
  // when status, fingerprint and options are unchanged, so consumers do not
  // re-render on every runner tick.
  useEffect(() => {
    publishEvaluatedRecommendations(key, {
      status: rec.status,
      options: rec.options,
      stage2Fingerprint: rec.stage2Fingerprint,
      waitingReason: rec.waitingReason,
    });
  }, [key, rec.status, rec.options, rec.stage2Fingerprint, rec.waitingReason]);

  // Clear the entry when the project/version changes or the runner unmounts,
  // so a stale set of options is never presented against a new design.
  useEffect(() => () => clearEvaluatedRecommendations(key), [key]);

  return null;
}