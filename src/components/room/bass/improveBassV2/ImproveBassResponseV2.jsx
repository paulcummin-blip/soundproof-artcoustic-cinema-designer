// ImproveBassResponseV2.jsx
// Main V2 Improve Bass Response UI component.
// Replaces the V1 "Find Better Positions" flow with the full V2 workflow:
// placement + delay + polarity + trim search, canonical confirmation,
// primary-seat protection, and atomic apply.
//
// BLOCKER 3: Stale detection reads CURRENT project state via a ref, not a
// render closure. The latest design inputs are stored in a ref that's updated
// on every render, so the running engine always sees the latest state.
//
// BLOCKER 4: Null/empty worker results display a safe NO_WINNER message,
// never a blank complete state.
//
// BLOCKER 7: Cancelled jobs can never publish or apply — the store gates
// status transitions and the Apply button checks for a valid winner.

import React, { useCallback, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, AlertCircle, RotateCcw } from "lucide-react";
import { useSharedBassResults } from "@/components/room/bass/bassResultsStore";
import { useActiveProjectId } from "@/components/state/project-session";
import { getStage2State, subscribeStage2 } from "@/components/room/bass/stage2/stage2PlacementStore";
import { useSyncExternalStore } from "react";
import { buildAuthoritativeRspPosition } from "@/components/room/bass/authoritativeRspPosition";
import { runImproveBassV2 } from "./improveBassV2Engine";
import {
  startImproveBassV2,
  updateProgress,
  setBestSoFar,
  setWinner,
  setCancelled,
  setStale,
  setError,
  requestCancel,
  isCancelRequested,
  resetImproveBassV2,
  useImproveBassV2State,
} from "./improveBassV2Store";
import { buildOptimisedInstances } from "./improveBassV2Apply";
import { computeV2DesignFingerprint } from "./improveBassV2Fingerprint";
import ImproveBassV2Progress from "./ImproveBassV2Progress";
import ImproveBassV2Results from "./ImproveBassV2Results";
import { normaliseModelKey } from "@/components/models/speakers/registry";

export default function ImproveBassResponseV2({
  roomDims,
  seatingPositions,
  subwooferInstances,
  frontSubsCfg,
  rearSubsCfg,
  commitInstances,
  hasCanonicalInstances,
  appState,
  amplifierPowerPerSubW,
}) {
  const projectId = useActiveProjectId();
  const shared = useSharedBassResults();
  const state = useImproveBassV2State(projectId);
  const stage2 = useSyncExternalStore(
    subscribeStage2,
    () => getStage2State(projectId),
    () => getStage2State(projectId),
  );
  const runningRef = useRef(false);

  // Derive P14 target parameters from the shared bass results
  const p14Params = useMemo(() => {
    const requested = shared?.authoritative?.requested || {};
    const authority = shared?.completedBassAuthority || {};
    return {
      p14TargetBasis: requested.p14TargetBasis || authority.p14TargetBasis || "minimum",
      p14TargetLevel: requested.p14TargetLevel || requested.selectedP14TargetLevel || authority.p14TargetLevel || 2,
      p14TargetDb: requested.selectedP14TargetDb || authority.p14TargetDb || 117,
      p18TargetBasis: requested.p18TargetBasis || requested.selectedP18TargetBasis || authority.p18TargetBasis || "minimum",
    };
  }, [shared?.authoritative?.requested, shared?.completedBassAuthority]);

  // Compute RSP position
  const rspPosition = useMemo(() => {
    if (!roomDims) return null;
    return buildAuthoritativeRspPosition(
      roomDims,
      appState?.mlpY_m,
      appState?.mlpX_m,
      appState?.designatedRspSeatId,
    );
  }, [roomDims, appState?.mlpY_m, appState?.mlpX_m, appState?.designatedRspSeatId]);

  const selectedSubModel = frontSubsCfg?.model || rearSubsCfg?.model || null;
  const subwooferBottomHeightM = frontSubsCfg?.bottomHeightM ?? rearSubsCfg?.bottomHeightM ?? 0;

  // BLOCKER 3: Live stale detection — use a ref to always read the LATEST design
  // inputs at stale-check time. The ref is updated on every render, so the
  // running engine (which captured the callback at V2 start) always sees the
  // current project state, not the state from the render that started V2.
  const latestDesignRef = useRef({});
  latestDesignRef.current = {
    subwooferInstances,
    roomDims,
    seatingPositions,
    rspPosition,
    selectedSubModel,
    p14Params,
  };

  const canStart = shared?.hasCurrentResult === true && !state?.status === "running";

  const handleStart = useCallback(async () => {
    if (runningRef.current) return;
    if (!shared?.hasCurrentResult || !rspPosition || !selectedSubModel) return;

    runningRef.current = true;

    const snapshot = {
      subwooferInstances,
      roomDims,
      selectedSubModel,
      currentAuthority: shared?.completedBassAuthority,
      p14TargetBasis: p14Params.p14TargetBasis,
      p14TargetLevel: p14Params.p14TargetLevel,
      p18TargetBasis: p14Params.p18TargetBasis,
    };

    startImproveBassV2(projectId, snapshot);

    const params = {
      subwooferInstances,
      roomDims,
      seatingPositions,
      rspPosition,
      selectedSubModel,
      amplifierPowerPerSubW: amplifierPowerPerSubW || frontSubsCfg?.amplifierPowerW || 0,
      subwooferBottomHeightM,
      p14TargetBasis: p14Params.p14TargetBasis,
      p14TargetLevel: p14Params.p14TargetLevel,
      p14TargetDb: p14Params.p14TargetDb,
      p18TargetBasis: p14Params.p18TargetBasis,
      currentAuthority: shared?.completedBassAuthority,
      stage2Result: stage2,
      stage2Fingerprint: stage2?.fingerprint,
    };

    const callbacks = {
      onProgress: (phase, label, current, total) => {
        updateProgress(projectId, phase, label, current, total);
      },
      isCancelled: () => isCancelRequested(projectId),
      onBestSoFar: (bestSoFar) => {
        setBestSoFar(projectId, bestSoFar);
      },
      // BLOCKER 3: Stale-job rejection — recompute the fingerprint from the
      // CURRENT design state on each check, reading from the ref (not the
      // render closure). If the design changed during V2 execution, the
      // fingerprint will differ from the start fingerprint.
      getCurrentFingerprint: () => {
        try {
          const d = latestDesignRef.current;
          return computeV2DesignFingerprint({
            subwooferInstances: d.subwooferInstances,
            roomDims: d.roomDims,
            seatingPositions: d.seatingPositions,
            rspPosition: d.rspPosition,
            selectedSubModel: d.selectedSubModel,
            p14TargetBasis: d.p14Params?.p14TargetBasis,
            p14TargetLevel: d.p14Params?.p14TargetLevel,
            p14TargetDb: d.p14Params?.p14TargetDb,
          });
        } catch {
          return null;
        }
      },
    };

    try {
      const result = await runImproveBassV2(projectId, params, callbacks);

      // BLOCKER 7: Cancelled jobs never publish a winner
      if (result.status === "cancelled") {
        setCancelled(projectId);
      } else if (result.status === "stale") {
        setStale(projectId, result.message);
      } else if (result.status === "error") {
        setError(projectId, result.error);
      } else if (result.status === "complete") {
        // BLOCKER 4: If selection is null/undefined, treat as NO_WINNER
        // (Current retained), never blank complete
        const selection = result.selection;
        if (!selection) {
          setWinner(projectId, {
            isCurrent: true,
            winner: null,
            message: "No safer automatic improvement found — current design retained",
            confirmedResults: result.confirmedResults || [],
            currentResult: null,
          });
        } else {
          setWinner(projectId, selection);
        }
      }
    } catch (err) {
      setError(projectId, err.message);
    } finally {
      runningRef.current = false;
    }
  }, [projectId, shared, rspPosition, selectedSubModel, subwooferInstances, roomDims,
    seatingPositions, frontSubsCfg, rearSubsCfg, amplifierPowerPerSubW,
    subwooferBottomHeightM, p14Params, stage2]);

  const handleCancel = useCallback(() => {
    requestCancel(projectId);
  }, [projectId]);

  const handleRetry = useCallback(() => {
    resetImproveBassV2(projectId);
  }, [projectId]);

  const handleApply = useCallback(() => {
    // BLOCKER 7: Cancelled/stale jobs can never apply
    if (!state?.winner?.winner || !commitInstances || !hasCanonicalInstances) return;
    const modelKey = normaliseModelKey(selectedSubModel);
    const nextInstances = buildOptimisedInstances(
      state.winner.winner,
      subwooferInstances,
      roomDims,
      modelKey,
    );
    commitInstances(nextInstances, {
      front: { placementMode: "manual", isManual: true },
      rear: { placementMode: "manual", isManual: true },
    });
  }, [state?.winner, commitInstances, hasCanonicalInstances, selectedSubModel,
    subwooferInstances, roomDims]);

  if (!shared?.hasCurrentResult) return null;

  const isRunning = state?.status === "running";
  const isComplete = state?.status === "complete";
  const isError = state?.status === "error";
  const isCancelled = state?.status === "cancelled";
  const isStale = state?.status === "stale";

  return (
    <div className="mt-3 rounded-lg border border-[#D9D5CE] bg-white px-4 py-4">
      <div className="text-[13px] font-semibold text-[#1B1A1A]">Improve Bass Response</div>
      <p className="mt-1 text-[11px] leading-relaxed text-[#625143]">
        Test practical placement, timing, polarity and level improvements before recommending more hardware.
      </p>

      <div className="mt-3">
        <Button
          type="button"
          className="w-full bg-[#213428] text-white hover:bg-[#3E4349]"
          onClick={handleStart}
          disabled={isRunning || !rspPosition || !selectedSubModel}
        >
          <Sparkles className="h-4 w-4 mr-1.5" />
          {isRunning ? "Optimising…" : "Improve Bass Response"}
        </Button>
      </div>

      {isRunning && (
        <ImproveBassV2Progress state={state} onCancel={handleCancel} />
      )}

      {isComplete && state?.winner && (
        <ImproveBassV2Results
          snapshot={state.snapshot}
          selection={state.winner}
          currentInstances={subwooferInstances}
          roomDims={roomDims}
          onApply={handleApply}
        />
      )}

      {isCancelled && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-700" />
            <span className="text-[12px] font-semibold text-amber-800">Optimisation cancelled</span>
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-amber-700">
            Current design remains unchanged. Best-so-far results retained for diagnostics.
          </p>
          <Button type="button" size="sm" variant="outline" onClick={handleRetry} className="mt-2 text-[11px]">
            <RotateCcw className="h-3 w-3 mr-1" />
            Retry
          </Button>
        </div>
      )}

      {isStale && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-700" />
            <span className="text-[12px] font-semibold text-amber-800">Design changed — optimisation result discarded</span>
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-amber-700">
            The room, seating, subwoofers, or target changed during optimisation. The result was rejected to prevent applying a stale recommendation. Current design remains untouched.
          </p>
          <Button type="button" size="sm" variant="outline" onClick={handleRetry} className="mt-2 text-[11px]">
            <RotateCcw className="h-3 w-3 mr-1" />
            Retry
          </Button>
        </div>
      )}

      {isError && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-700" />
            <span className="text-[12px] font-semibold text-red-800">Optimisation incomplete — retry</span>
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-red-700">{state?.error}</p>
          <Button type="button" size="sm" variant="outline" onClick={handleRetry} className="mt-2 text-[11px]">
            <RotateCcw className="h-3 w-3 mr-1" />
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}