import React, { useEffect, useState } from "react";

export default function BassCalculationStatus({ lifecycle }) {
  const state = lifecycle || {};
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    if (state.status !== "calculating") return undefined;
    const timer = setInterval(() => setClock(Date.now()), 200);
    return () => clearInterval(timer);
  }, [state.status, state.startedAtMs]);

  const runningMs = state.status === "calculating" && Number.isFinite(state.startedAtMs)
    ? Math.max(0, clock - state.startedAtMs)
    : (state.elapsedMs || 0);
  let text = "Waiting for a complete room and subwoofer selection";
  if (state.status === "queued") text = "Detailed bass analysis queued";
  if (state.status === "stale") text = "Updating after design changes";
  if (state.status === "calculating") text = state.stalled
    ? `Bass analysis stalled at: ${state.progressStage || "unknown stage"}`
    : `Detailed bass analysis running — ${(runningMs / 1000).toFixed(1)} s`;
  if (state.status === "ready") text = state.cacheStatus === "hit" ? "Using cached detailed analysis" : "Detailed bass analysis ready";
  if (state.status === "error") text = state.errorMessage || "Detailed bass analysis failed — Retry";
  return <span style={{ fontSize: 10, color: state.status === "error" ? "#b91c1c" : "#625143", fontFamily: "monospace" }}>{text}</span>;
}