// useOptimiserRunProgress.js
// ---------------------------------------------------------------------------
// The live progress of the Bass Optimiser run, for the journey card.
//
// It reads the two authorities that already own this and adds nothing of its
// own: the engine's published progress store (improveBassV2Store) and the run
// lifecycle authority (optimiserRunAuthority). It ticks a clock once a second
// while a run is in flight, so elapsed time and the stall check keep moving —
// and it stops ticking the moment the run ends.
//
// It also observes, while the run is on screen, when each stage began: that is
// the only per-stage elapsed time that can be stated honestly, because the
// engine publishes one progress figure for the search in flight and no
// per-stage wall clock. The observation resets with the run.
//
// PURE PLUMBING: it writes nothing, launches nothing and cancels nothing.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getImproveBassV2State,
  useImproveBassV2State,
} from "../improveBassV2/improveBassV2Store.js";
import {
  getLatestOptimiserRun,
  useLatestOptimiserRun,
} from "./optimiserRunAuthority.js";
import {
  buildOptimiserRunProgress,
  describeOptimiserStatusCheck,
} from "./optimiserRunProgressAuthority.js";

export default function useOptimiserRunProgress({ projectId = null, versionId = null, runStatus = "idle" } = {}) {
  const live = useImproveBassV2State(projectId, versionId);
  const run = useLatestOptimiserRun(projectId, versionId);
  const running = runStatus === "running";

  const [nowMs, setNowMs] = useState(() => Date.now());
  const [checkResult, setCheckResult] = useState(null);

  // The clock runs only while the run is in flight. A terminal run stops it, so
  // no timer and no spinner survives the result.
  useEffect(() => {
    if (!running) {
      setCheckResult(null);
      return undefined;
    }
    setNowMs(Date.now());
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [running]);

  const progress = useMemo(
    () => buildOptimiserRunProgress({ live, run, runStatus, nowMs }),
    [live, run, runStatus, nowMs],
  );

  // ── Observed stage timing ──
  // When this card first saw the run enter its current stage. Reset for a new
  // run and when the run ends, so nothing is carried across runs.
  const [stageEntry, setStageEntry] = useState({ runId: null, key: null, enteredAtMs: null });
  useEffect(() => {
    if (!running) {
      setStageEntry({ runId: null, key: null, enteredAtMs: null });
      return;
    }
    const key = progress.stageKey || null;
    const runId = progress.runId || null;
    setStageEntry((previous) => (
      previous.runId === runId && previous.key === key
        ? previous
        : { runId, key, enteredAtMs: Date.now() }
    ));
  }, [running, progress.runId, progress.stageKey]);

  const stageElapsedSeconds = running && stageEntry.key === progress.stageKey && stageEntry.enteredAtMs
    ? Math.max(0, Math.floor((nowMs - stageEntry.enteredAtMs) / 1000))
    : null;

  /**
   * CHECK STATUS — a fresh read of the two live authorities. It reports what it
   * found, and if the run has since become terminal the card states that result
   * by itself, because the authorities it reads are the ones being rendered.
   * It never starts, restarts or re-runs anything.
   */
  const checkStatus = useCallback(() => {
    const freshLive = getImproveBassV2State(projectId, versionId);
    const freshRun = getLatestOptimiserRun(projectId, versionId);
    const result = describeOptimiserStatusCheck({
      live: freshLive,
      run: freshRun,
      previousLastProgressAt: progress.lastProgressAtMs,
      nowMs: Date.now(),
    });
    setNowMs(Date.now());
    setCheckResult(result);
    return result;
  }, [projectId, versionId, progress.lastProgressAtMs]);

  return { progress, stageElapsedSeconds, checkStatus, checkResult, isRunning: running };
}