import React from "react";

const level = (value) => value > 0 ? `L${value}` : "FAIL";
const fmt = (value, unit = "") => Number.isFinite(value) ? `${value.toFixed(1)}${unit}` : "—";

export default function BassOptimiserValidationPanel({ result, priorityMode, onPriorityModeChange }) {
  if (!result) return null;
  return <details className="mt-3 rounded border border-emerald-300 bg-emerald-50 p-3 text-xs" open>
    <summary className="cursor-pointer font-semibold text-emerald-900">{result.isBestCalibratedAttempt ? "BEST CALIBRATED ATTEMPT — LEVEL 1 NOT ACHIEVED" : "BASS OPTIMISER VALIDATION ACTIVE"}</summary>
    <label className="mt-2 flex w-fit items-center gap-2 font-mono text-[10px] text-emerald-950">Priority mode
      <select value={priorityMode} onChange={(event) => onPriorityModeChange(event.target.value)} className="rounded border border-emerald-300 bg-white px-2 py-1">
        <option value="balanced">Balanced</option><option value="spl">Prioritise SPL</option><option value="extension">Prioritise extension</option><option value="accuracy">Prioritise house-curve accuracy</option>
      </select>
    </label>
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-emerald-950">
      <span>P14 {result.achievedP14Level} ({fmt(result.achievedP14Db, " dB")})</span><span>P18 {result.achievedP18Level} ({fmt(result.achievedP18FrequencyHz, " Hz")})</span><span>P19 {result.achievedP19Level} (±{fmt(result.achievedP19VariationDb, " dB")})</span>
    </div>
    <div className="mt-2 overflow-x-auto">
      <table className="min-w-[900px] text-right font-mono text-[10px] text-slate-700">
        <thead className="border-b border-slate-300 text-slate-500"><tr>{["Requested P14", "Requested P18", "Requested P19", "Achieved P14", "Achieved P18", "Achieved P19", "Valid band", "Valid", "Selected"].map((label) => <th className="px-2 py-1" key={label}>{label}</th>)}</tr></thead>
        <tbody>{result.displayCandidates.map((candidate) => {
          const selected = candidate === result.selectedCandidate;
          return <tr className="border-b border-slate-200" key={`${candidate.requestedP14Level}-${candidate.requestedP18Level}-${candidate.requestedP19Level}`}><td className="px-2 py-1 font-semibold">{candidate.requestedP14Level}</td><td className="px-2 py-1">{candidate.requestedP18Level}</td><td className="px-2 py-1">{candidate.requestedP19Level}</td><td className="px-2 py-1">{level(candidate.achievedP14Level)} · {fmt(candidate.achievedP14Db, " dB")}</td><td className="px-2 py-1">{level(candidate.achievedP18Level)} · {fmt(candidate.achievedP18FrequencyHz, " Hz")}</td><td className="px-2 py-1">{level(candidate.achievedP19Level)} · ±{fmt(candidate.achievedP19VariationDb, " dB")}</td><td className="px-2 py-1">{fmt(candidate.assessmentStartHz, " Hz")}–{fmt(candidate.assessmentEndHz, " Hz")}</td><td className="px-2 py-1">{candidate.meetsRequestedEnvelope ? "Yes" : "No"}</td><td className="px-2 py-1">{selected ? "Yes" : "—"}</td></tr>;
        })}</tbody>
      </table>
    </div>
    {result.selectedCandidate?.rejectionReason && <div className="mt-2 font-mono text-[10px] text-amber-900">Rejected: {result.selectedCandidate.rejectionReason}</div>}
    {result.warningMessage && <div className="mt-2 font-medium text-amber-900">Warning: {result.warningMessage}</div>}
  </details>;
}