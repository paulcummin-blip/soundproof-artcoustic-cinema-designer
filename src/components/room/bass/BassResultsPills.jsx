import React, { useEffect, useState } from "react";
import RP22GradingPill from "@/components/ui/RP22GradingPill";
import { formatBassResults } from "@/components/room/bass/bassResultsPresentation";
import { useSharedBassResults } from "@/components/room/bass/bassResultsStore";

const TOOLTIPS = {
  p14: "P14 — system LFE SPL capability at the Reference Seat Position.",
  p18: "P18 — system in-room bass extension.",
  p19: "P19 — official response relative to target at the Reference Seat Position.",
  p20: "P20 — seat-to-seat bass response consistency across real seats.",
};

export default function BassResultsPills({ contract, compact = false, seatId = null, nowMs }) {
  const shared = useSharedBassResults();
  const result = contract || shared.contract;
  const [clock, setClock] = useState(Date.now());
  const active = nowMs == null && ["stale", "calculating", "running"].includes(result?.job?.status);
  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active, result?.job?.startedAtMs, result?.job?.queuedAtMs]);
  const formatted = formatBassResults(result, nowMs ?? clock, seatId);
  return <div className="grid grid-cols-2 gap-1 sm:grid-cols-4" aria-label="Bass RP22 results">
    {Object.entries(formatted.pills).map(([key, pill]) => (
      <span key={key} title={pill.diagnostic ? "Per-seat target-curve diagnostic; not official RP22 P19." : TOOLTIPS[key]} aria-label={pill.text}>
        <RP22GradingPill level={pill.level} compact={compact} style={{ width: "100%" }}>{pill.text}</RP22GradingPill>
      </span>
    ))}
  </div>;
}