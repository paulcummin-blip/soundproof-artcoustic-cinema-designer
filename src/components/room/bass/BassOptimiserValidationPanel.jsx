import React from "react";

const level = (value) => value > 0 ? `L${value}` : "FAIL";
const fmt = (value, unit = "") => Number.isFinite(value) ? `${value.toFixed(1)}${unit}` : "—";

export default function BassOptimiserValidationPanel({ result }) {
  if (!result) return null;
  return <details className="mt-3 rounded border border-emerald-300 bg-emerald-50 p-3 text-xs" open>
    <summary className="cursor-pointer font-semibold text-emerald-900">BASS OPTIMISER VALIDATION ACTIVE</summary>
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-emerald-950">
      <span>P14 {result.achievedP14Level}</span><span>P18 {result.achievedP18Level} ({fmt(result.achievedP18FrequencyHz, " Hz")})</span><span>P19 {result.achievedP19Level} (±{fmt(result.achievedP19VariationDb, " dB")})</span>
    </div>
    <div className="mt-2 overflow-x-auto">
      <table className="min-w-[760px] text-right font-mono text-[10px] text-slate-700">
        <thead className="border-b border-slate-300 text-slate-500"><tr>{["Candidate", "Target SPL", "Achieved P14", "Achieved P18", "Achieved P19", "All ≥ L1", "Selected"].map((label) => <th className="px-2 py-1" key={label}>{label}</th>)}</tr></thead>
        <tbody>{result.candidates.map((candidate) => {
          const selected = candidate.requestedTargetSpl === result.selectedP14TargetDb;
          return <React.Fragment key={candidate.requestedP14Level}>
            <tr className="border-b border-slate-200"><td className="px-2 py-1 font-semibold">{candidate.requestedP14Level}</td><td className="px-2 py-1">{candidate.requestedTargetSpl} dB</td><td className="px-2 py-1">{level(candidate.achievedP14Level)}</td><td className="px-2 py-1">{level(candidate.achievedP18Level)} · {fmt(candidate.achievedP18FrequencyHz, " Hz")}</td><td className="px-2 py-1">{level(candidate.achievedP19Level)} · ±{fmt(candidate.achievedP19VariationDb, " dB")}</td><td className="px-2 py-1">{candidate.allAtLeastL1 ? "Yes" : "No"}</td><td className="px-2 py-1">{selected ? "Yes" : "—"}</td></tr>
            {!candidate.allAtLeastL1 && <tr className="border-b border-slate-200 bg-amber-50 text-left text-amber-900"><td className="px-2 py-1" colSpan="7">Rejected: {candidate.rejectionReason} · Capability-limited: {candidate.capabilityLimitedFrequencies.length ? `${candidate.capabilityLimitedFrequencies.map((hz) => Math.round(hz)).join(", ")} Hz` : "none"}</td></tr>}
          </React.Fragment>;
        })}</tbody>
      </table>
    </div>
    {result.warningMessage && <div className="mt-2 font-medium text-amber-900">{result.warningMessage}</div>}
  </details>;
}