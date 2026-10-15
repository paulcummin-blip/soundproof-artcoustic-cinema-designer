// AdiJourneyRunWorkloadBlock.jsx
// ---------------------------------------------------------------------------
// THE WORKLOAD BEHIND THE RUN — ENGINEER DETAILS ONLY.
//
// Measurement, not a claim about quality: what the optimiser's declared search
// space defines per stage for this design, what the engine has published live
// for the search in flight, how much time it has taken, and how many candidates
// it has confirmed canonically. It never appears on the main panel, which
// states the decision.
//
// Every figure arrives resolved by optimiserRunWorkload. Nothing here counts,
// estimates or rounds anything.
// ---------------------------------------------------------------------------

import React from "react";

export const ADI_RUN_WORKLOAD_TITLE = "Run workload";

export default function AdiJourneyRunWorkloadBlock({ workload = null }) {
  if (!workload) return null;

  const { available, rows = [], totalSteps, sourceCount, groups } = workload;

  return (
    <div className="space-y-1" data-adi-run-workload="true">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
        {ADI_RUN_WORKLOAD_TITLE}
      </div>

      <div className="text-[11px] text-[#3E4349] leading-relaxed">
        {sourceCount} active subwoofer source{sourceCount === 1 ? "" : "s"}
        {groups ? ` · ${groups} search group${groups === 1 ? "" : "s"}` : ""}
      </div>

      {available ? (
        <table className="w-full text-[11px] text-[#3E4349]">
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} data-adi-run-workload-row={row.key}>
                <td className="py-0.5 pr-3">{row.label}</td>
                <td className="py-0.5 text-right tabular-nums" data-adi-run-workload-steps={row.steps ?? "none"}>
                  {row.steps == null ? "not searched for this layout" : `${row.steps.toLocaleString("en-GB")} steps`}
                </td>
              </tr>
            ))}
            {totalSteps != null && (
              <tr data-adi-run-workload-total="true">
                <td className="py-0.5 pr-3 font-semibold text-[#213428]">Total declared search steps</td>
                <td className="py-0.5 text-right font-semibold tabular-nums text-[#213428]">
                  {totalSteps.toLocaleString("en-GB")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      ) : (
        <div className="text-[11px] text-[#625143] leading-relaxed">{workload.reason}</div>
      )}

      <div className="text-[11px] text-[#3E4349] leading-relaxed" data-adi-run-workload-live="true">
        {workload.liveJobsTotal != null
          ? `Engine progress: ${workload.liveStageLabel} — ${workload.liveJobsCompleted} of ${workload.liveJobsTotal} evaluation jobs complete.`
          : `Engine progress: ${workload.liveStageLabel} — the engine has not published a job count for this search.`}
      </div>

      {workload.elapsedText && (
        <div className="text-[11px] text-[#3E4349] leading-relaxed">
          {`Elapsed: ${workload.elapsedText}`}
          {workload.stageElapsedSeconds != null
            ? ` · ${workload.liveStageLabel}: ${workload.stageElapsedSeconds} seconds observed`
            : ""}
        </div>
      )}

      <div className="text-[11px] text-[#3E4349] leading-relaxed">
        {`Candidates confirmed canonically: ${workload.confirmedCandidates}`}
      </div>

      <div className="text-[10px] text-[#8A7B6A] leading-relaxed">
        {workload.basisNote} {workload.scopeNote}
      </div>
    </div>
  );
}