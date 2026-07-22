import React, { useMemo } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { assessShadowPairedP14P18 } from "@/components/utils/shadowPairedP14P18Authority";

const fmt = (value, suffix = "") => Number.isFinite(value) ? `${value.toFixed(1)}${suffix}` : "—";

export default function ShadowPairedCapabilityDiagnostic({ result, activeSubs, normalizedTransferResult }) {
  const shadow = useMemo(() => assessShadowPairedP14P18({
    activeSubs,
    perSourceComplexTransfers: normalizedTransferResult?.perSourceRspComplexTransfers,
    combinedEqCurve: result?.selectedCandidate?.combinedEqCurve || [],
    targetBasis: result?.p14TargetBasis,
  }), [activeSubs, normalizedTransferResult, result]);

  const chartData = useMemo(() => {
    const byFrequency = new Map();
    const add = (curve, key) => (curve || []).forEach((point) => byFrequency.set(point.frequency, { ...(byFrequency.get(point.frequency) || { frequency: point.frequency }), [key]: point.spl }));
    add(shadow.rawDeliveredCurve, "raw");
    add(shadow.postEqDeliveredCurve, "postEq");
    add(shadow.selectedTargetEnvelope, "target");
    return [...byFrequency.values()].sort((a, b) => a.frequency - b.frequency);
  }, [shadow]);

  const region = shadow.longestContiguousUnderTarget;
  const statusClass = shadow.status === "PASS" ? "text-emerald-700" : shadow.status === "FAIL" ? "text-rose-700" : "text-amber-700";
  return <details className="mt-2 rounded border border-violet-300 bg-violet-50 p-2" open>
    <summary className="cursor-pointer font-mono font-semibold text-violet-950">Shadow position-aware paired P14/P18 authority</summary>
    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[10px] text-slate-700">
      <span>Existing scalar P14: <strong>{result?.achievedP14Level || "—"} · {fmt(result?.achievedP14Db, " dBC")}</strong></span>
      <span>Status: <strong className={statusClass}>{shadow.status}</strong></span>
      <span>Shadow paired P14: <strong>{shadow.pairedP14Grade || "—"}</strong></span>
      <span>Shadow paired P18: <strong>{shadow.pairedP18Grade || "—"}</strong></span>
      <span>Target basis: <strong>{shadow.targetBasis === "recommended" ? "Recommended" : "Minimum"}</strong></span>
      <span>EQ headroom cost: <strong>{fmt(shadow.eqHeadroomCostDb, " dB")}</strong></span>
      {[15, 18, 25, 30].map((frequency) => <span key={frequency}>Delivered @ {frequency} Hz: <strong>{fmt(shadow.deliveredAtFrequencies?.[frequency], " dBC")}</strong></span>)}
      <span>Worst capability: <strong>{fmt(shadow.worstCapabilityDb, " dBC")}</strong></span>
      <span>Worst frequency: <strong>{fmt(shadow.worstFrequencyHz, " Hz")}</strong></span>
      <span>Contiguous under-target bandwidth: <strong>{region ? `${fmt(region.bandwidthHz, " Hz")} (${fmt(region.bandwidthOctaves, " oct")})` : "None"}</strong></span>
      <span>Under-target depth: <strong>{region ? fmt(region.depthDb, " dB") : "—"}</strong></span>
      <span>Limiting cause: <strong>{shadow.limitingCause || "—"}</strong></span>
      <span>Amplifier limits: <strong>{shadow.sourceDiagnostics?.every((source) => Number.isFinite(source.amplifierLimitDb)) ? "Available" : "Not configured; product clean limits used"}</strong></span>
    </div>
    {shadow.reason && <div className="mt-2 font-mono text-[10px] text-amber-800">{shadow.reason}</div>}
    {chartData.length > 0 && <div className="mt-2 h-52 rounded border border-violet-200 bg-white p-2">
      <div className="mb-1 flex gap-4 font-mono text-[9px] text-slate-600"><span className="text-slate-700">Raw capability</span><span className="text-violet-700">Post-EQ capability</span><span className="text-rose-700">Paired envelope</span></div>
      <ResponsiveContainer width="100%" height="90%">
        <LineChart data={chartData}><XAxis dataKey="frequency" type="number" domain={[15, 120]} tickCount={8} tick={{ fontSize: 9 }} /><YAxis domain={["auto", "auto"]} tick={{ fontSize: 9 }} width={38} /><Tooltip formatter={(value) => fmt(value, " dB")} labelFormatter={(value) => `${fmt(Number(value), " Hz")}`} /><Line dataKey="raw" stroke="#334155" dot={false} strokeWidth={1.5} /><Line dataKey="postEq" stroke="#7c3aed" dot={false} strokeWidth={1.5} /><Line dataKey="target" stroke="#be123c" dot={false} strokeDasharray="4 3" strokeWidth={1.5} /></LineChart>
      </ResponsiveContainer>
    </div>}
  </details>;
}