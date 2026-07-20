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
    {(() => {
      const candidate = result.selectedCandidate;
      const checkpoint = candidate?.designEqSelectedCheckpoint;
      const trace = Array.isArray(candidate?.designEqIterationTrace) ? candidate.designEqIterationTrace : [];
      if (!checkpoint) return null;
      return (
        <details className="mt-2 rounded border border-slate-300 bg-slate-50 p-2 text-[10px]">
          <summary className="cursor-pointer font-mono font-semibold text-slate-700">Design EQ fitter diagnostics (selected candidate)</summary>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[10px] text-slate-700">
            <span>Stop reason: <strong className="text-slate-900">{candidate.designEqStopReason || "—"}</strong></span>
            <span>Generated iterations: <strong className="text-slate-900">{trace.length}</strong></span>
            <span>Returned filters: <strong className="text-slate-900">{checkpoint.enabledFilterCount}</strong></span>
            <span>Max abs deviation: <strong className="text-slate-900">{fmt(checkpoint.maximumAbsoluteDeviationDb, " dB")}</strong></span>
            <span>RMS deviation: <strong className="text-slate-900">{fmt(checkpoint.rmsDeviationDb, " dB")}</strong></span>
            <span>Worst residual: <strong className="text-slate-900">{fmt(checkpoint.worstResidualFrequencyHz, " Hz")}</strong></span>
            <span>Minimum SPL: <strong className="text-slate-900">{fmt(checkpoint.minimumSpl, " dB")}</strong></span>
            <span>P14-safe: <strong className={checkpoint.p14Safe ? "text-emerald-700" : "text-rose-700"}>{checkpoint.p14Safe ? "Yes" : "No"}</strong></span>
            <span>Broad below-target worsening: <strong className={checkpoint.broadBelowTargetWorsening ? "text-rose-700" : "text-emerald-700"}>{checkpoint.broadBelowTargetWorsening ? "Yes" : "No"}</strong></span>
          </div>
          {trace.length > 0 && (
            <div className="mt-2 overflow-x-auto">
              <table className="min-w-[1100px] text-right font-mono text-[10px] text-slate-700">
                <thead className="border-b border-slate-300 text-slate-500">
                  <tr>{["Iter", "Freq", "Gain", "Q", "Max before", "Max after", "RMS before", "RMS after", "Min SPL before", "Min SPL after", "P14-safe", "Broad worse"].map((label) => <th className="px-2 py-1" key={label}>{label}</th>)}</tr>
                </thead>
                <tbody>
                  {trace.map((row) => (
                    <tr className="border-b border-slate-200" key={row.iteration}>
                      <td className="px-2 py-1 font-semibold">{row.iteration}</td>
                      <td className="px-2 py-1">{fmt(row.selectedFrequencyHz, " Hz")}</td>
                      <td className="px-2 py-1">{fmt(row.gainDb, " dB")}</td>
                      <td className="px-2 py-1">{fmt(row.Q)}</td>
                      <td className="px-2 py-1">{fmt(row.maximumDeviationBeforeDb, " dB")}</td>
                      <td className="px-2 py-1">{fmt(row.maximumDeviationAfterDb, " dB")}</td>
                      <td className="px-2 py-1">{fmt(row.rmsBeforeDb, " dB")}</td>
                      <td className="px-2 py-1">{fmt(row.rmsAfterDb, " dB")}</td>
                      <td className="px-2 py-1">{fmt(row.minimumSplBeforeDb, " dB")}</td>
                      <td className="px-2 py-1">{fmt(row.minimumSplAfterDb, " dB")}</td>
                      <td className="px-2 py-1"><strong className={row.p14Safe ? "text-emerald-700" : "text-rose-700"}>{row.p14Safe ? "Yes" : "No"}</strong></td>
                      <td className="px-2 py-1"><strong className={row.broadBelowTargetWorsening ? "text-rose-700" : "text-emerald-700"}>{row.broadBelowTargetWorsening ? "Yes" : "No"}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </details>
      );
    })()}
  </details>;
}