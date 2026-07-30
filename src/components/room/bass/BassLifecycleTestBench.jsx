// BassLifecycleTestBench.jsx — Development-only headless lifecycle observer.
//
// Renders the REAL BassBackgroundAnalysisOwner with a deterministic fixture
// AppState, observes bassDiagTokenTrace via the public subscribe API, and
// triggers the existing onRetry pathway exposed through BassResultsProvider.
//
// RULES:
//   - Does NOT call recordDiagStage.
//   - Does NOT instantiate BassBackgroundAnalysisController.
//   - Does NOT replace the worker.
//   - Does NOT call selectCandidateFromPool.
//   - Does NOT call publishCompletedBassContract.
//   - Does NOT create a route or add production navigation.
//
// All lifecycle events originate from the real Owner. This component is a
// pure observer + trigger consumer.

import React, { useCallback, useState, useSyncExternalStore } from "react";
import { AppStateContext } from "@/components/AppStateProvider";
import BassBackgroundAnalysisOwner from "./BassBackgroundAnalysisOwner";
import { useOptionalSharedBassResults } from "./bassResultsStore";
import { subscribeDiagRuns, getDiagRunsSnapshot } from "./bassDiagTokenTrace";
import { buildBassLifecycleFixture } from "./bassLifecycleFixture";

const SCOPE_ID = "lifecycle-test-bench";

export default function BassLifecycleTestBench() {
  const [fixture] = useState(() => buildBassLifecycleFixture());

  return (
    <AppStateContext.Provider value={fixture.appState}>
      <BassBackgroundAnalysisOwner scopeId={SCOPE_ID}>
        <BenchObserver />
      </BassBackgroundAnalysisOwner>
    </AppStateContext.Provider>
  );
}

function BenchObserver() {
  const results = useOptionalSharedBassResults();
  const runs = useSyncExternalStore(subscribeDiagRuns, getDiagRunsSnapshot, getDiagRunsSnapshot);
  const [triggerError, setTriggerError] = useState(null);
  const [triggerCount, setTriggerCount] = useState(0);

  const handleTrigger = useCallback(() => {
    setTriggerError(null);
    const onRetry = results?.onRetry;
    if (typeof onRetry !== "function") {
      setTriggerError("onRetry not yet exposed by Owner (lifecycle not ready)");
      return;
    }
    try {
      onRetry({ collectDiagnostics: true, force: true });
      setTriggerCount((c) => c + 1);
    } catch (err) {
      setTriggerError(err?.message || String(err));
    }
  }, [results]);

  const detailedStatus = results?.detailedStatus || "IDLE";
  const inputsValid = results?.inputsValid;
  const onRetryReady = typeof results?.onRetry === "function";

  return (
    <div className="p-4 space-y-4 text-sm font-mono max-w-3xl">
      <div className="border border-slate-300 rounded p-3 bg-slate-50">
        <h2 className="font-bold text-sm mb-2 text-slate-800">
          Bass Lifecycle Test Bench
          <span className="ml-2 text-xs font-normal text-slate-500">(Dev Only — No Route)</span>
        </h2>
        <div className="grid grid-cols-2 gap-1 text-xs">
          <div>Scope:</div>
          <div className="font-bold">{SCOPE_ID}</div>
          <div>Status:</div>
          <div className="font-bold">{detailedStatus}</div>
          <div>Inputs Valid:</div>
          <div className="font-bold">{String(inputsValid)}</div>
          <div>onRetry Ready:</div>
          <div className="font-bold">{String(onRetryReady)}</div>
          <div>Runs Observed:</div>
          <div className="font-bold">{runs.length}</div>
          <div>Triggers Sent:</div>
          <div className="font-bold">{triggerCount}</div>
        </div>
      </div>

      <div className="border border-slate-300 rounded p-3 bg-white">
        <button
          onClick={handleTrigger}
          disabled={!onRetryReady}
          className="px-3 py-1.5 bg-slate-800 text-white rounded text-xs disabled:opacity-40 hover:bg-slate-700 transition-colors"
        >
          Trigger Manual Diagnostic (onRetry + collectDiagnostics)
        </button>
        {triggerError && (
          <div className="mt-2 text-red-600 text-xs">{triggerError}</div>
        )}
      </div>

      <div className="border border-slate-300 rounded p-3 bg-white">
        <h3 className="font-bold text-xs mb-2 text-slate-700">
          Diagnostic Trace (bassDiagTokenTrace — read-only observation)
        </h3>
        {runs.length === 0 ? (
          <div className="text-slate-400 text-xs italic">
            No runs observed yet. Trigger a manual diagnostic to begin.
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-auto">
            {runs.map((run) => (
              <RunRow key={run.token} run={run} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RunRow({ run }) {
  const [expanded, setExpanded] = useState(false);
  const stages = run.events.map((e) => e.stage);

  return (
    <div className="border border-slate-200 rounded p-2 text-xs bg-slate-50">
      <div
        className="flex items-center gap-2 cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="font-bold text-slate-800">{run.token}</span>
        <span className="text-slate-500">origin: {run.origin}</span>
        <span className="text-slate-500">{run.events.length} events</span>
        <span className="text-slate-400 ml-auto">{expanded ? "▼" : "▶"}</span>
      </div>
      <div className="mt-1 text-slate-600">
        {stages.length > 0 ? (
          <span className="break-all">{stages.join(" → ")}</span>
        ) : (
          <span className="italic text-slate-400">(no stages recorded)</span>
        )}
      </div>
      {expanded && (
        <div className="mt-2 space-y-1">
          {run.events.map((event, i) => (
            <div key={i} className="pl-3 border-l-2 border-slate-300">
              <span className="font-mono text-[10px] text-slate-400">
                {new Date(event.ts).toISOString()}
              </span>
              <span className="ml-2 font-bold text-slate-700">{event.stage}</span>
              {event.workerRequestId && (
                <span className="ml-2 text-slate-500 text-[10px]">
                  worker: {event.workerRequestId}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}