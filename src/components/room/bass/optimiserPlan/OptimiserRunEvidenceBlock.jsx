// OptimiserRunEvidenceBlock.jsx
// ---------------------------------------------------------------------------
// The evidence a completed optimiser run left behind when it produced no
// actionable plan: how many candidates were evaluated, which controls were
// tested, the best attempted result compared with the current result, why no
// candidate was accepted, and the fact that the design was not changed.
//
// Read-only. It offers no Apply control, and it never presents a rejected
// candidate as an available change.
// ---------------------------------------------------------------------------

import React from "react";

const fmt = (value, digits = 2, unit = "") => (Number.isFinite(Number(value))
  ? `${Number(value).toFixed(digits)}${unit}`
  : null);

export default function OptimiserRunEvidenceBlock({ evidence = null, className = "" }) {
  if (!evidence) return null;
  const best = evidence.bestAttempted || null;
  const current = evidence.current || null;

  const rows = [];
  if (evidence.canonicalJobsRun != null) rows.push(["Optimiser jobs run", `${evidence.canonicalJobsRun}`]);
  if (evidence.candidatesEvaluated != null) rows.push(["Candidates evaluated", `${evidence.candidatesEvaluated}`]);
  if (evidence.resultsRetained != null) rows.push(["Result records retained", `${evidence.resultsRetained}`]);
  rows.push([
    "Controls tested",
    evidence.leversTested?.length
      ? evidence.leversTested
        .map((lever) => `${lever.label}${lever.candidatesEvaluated ? ` (${lever.candidatesEvaluated})` : ""}`)
        .join(" · ")
      : "None evidenced",
  ]);

  const currentP20 = fmt(current?.p20VariationDb, 2, " dB");
  const bestP20 = fmt(best?.p20VariationDb, 2, " dB");
  const delta = best?.p20DeltaDb != null
    ? `${best.p20DeltaDb < 0 ? "−" : "+"}${Math.abs(best.p20DeltaDb).toFixed(2)} dB`
    : null;

  return (
    <div className={`rounded-md border border-[#E7E5E0] bg-[#FAFAF9] p-2.5 ${className}`}>
      <div className="text-[10px] font-semibold tracking-wide text-[#3E4349]">RUN EVIDENCE</div>

      <div className="mt-1 space-y-0.5 text-[11px] text-[#625143]">
        {rows.map(([label, value]) => (
          <div key={label}>
            <span className="text-[#8B7F76]">{label}: </span>
            <span className="text-[#1B1A1A]">{value}</span>
          </div>
        ))}
      </div>

      {(best || current) && (
        <div className="mt-1.5 space-y-0.5 text-[11px]">
          {best && (
            <div className="text-[#1B1A1A]">
              <span className="text-[#8B7F76]">Best attempted (rejected): </span>
              {best.candidateId ? `${best.candidateId} · ` : ""}P20 {bestP20}
              {best.p20Level ? ` · L${best.p20Level}` : ""}
              {delta ? <span className="text-[#8B7F76]"> ({delta} vs current)</span> : null}
            </div>
          )}
          {current && (
            <div className="text-[#1B1A1A]">
              <span className="text-[#8B7F76]">Current P20: </span>
              {currentP20}
              {current.worstSeatId ? ` · worst seat ${current.worstSeatId}` : ""}
              {current.worstFrequencyHz != null ? ` at ${Math.round(Number(current.worstFrequencyHz))} Hz` : ""}
            </div>
          )}
        </div>
      )}

      {evidence.rejectionReasons?.length > 0 && (
        <div className="mt-1.5 text-[11px] text-[#8A5A2B] leading-relaxed">
          {evidence.rejectionReasons.map((reason) => <div key={reason}>{reason}</div>)}
        </div>
      )}

      <div className="mt-1.5 text-[10px] text-[#8B7F76] leading-relaxed">
        {evidence.designUnchanged
          ? "The current design was not changed — nothing was applied."
          : "The design was changed during the run."}
        {best && !best.validationPassed ? " The rejected candidate is shown as evidence only and cannot be applied." : ""}
      </div>
    </div>
  );
}