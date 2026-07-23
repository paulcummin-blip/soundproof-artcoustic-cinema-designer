import React, { useEffect, useState } from "react";
import RP22GradingPill from "@/components/ui/RP22GradingPill";
import { formatBassResults } from "@/components/room/bass/bassResultsPresentation";
import { useSharedBassResults } from "@/components/room/bass/bassResultsStore";

const TOOLTIPS = {
  p14: "This estimate uses simulated subwoofer output capability, approved continuous SPL data, and applied EQ headroom. It is intentionally conservative and does not include room gain.",
  p18: "Bass Extension — system in-room low-frequency extension.",
  p19: "Seat Consistency — official bass response consistency relative to target.",
  p20: "Worst Seat Performance — largest response variation between the RSP and a real seat.",
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
      <span key={key} className="flex flex-col gap-1" title={pill.diagnostic ? "Per-seat target-curve diagnostic; not official RP22 P19." : TOOLTIPS[key]} aria-label={pill.text}>
        <RP22GradingPill level={pill.level} compact={compact} style={{ width: "100%" }}>{pill.text}</RP22GradingPill>
        {pill.detail && <small className="text-center text-[10px] text-muted-foreground">{pill.detail}</small>}
      </span>
    ))}
  </div>;
}