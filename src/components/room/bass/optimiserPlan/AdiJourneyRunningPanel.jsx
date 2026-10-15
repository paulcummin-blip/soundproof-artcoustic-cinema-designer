// AdiJourneyRunningPanel.jsx
// ---------------------------------------------------------------------------
// WHAT THE CARD STATES WHILE A BASS OPTIMISATION RUN IS IN FLIGHT.
//
// Presentation only. Every value arrives already resolved by the progress
// authority, which reads the engine's own published progress — the stage it is
// working through and the job count it has published for that search. This
// component never derives a stage, a count, a percentage or a time of its own.
//
//   OPTIMISATION RUNNING
//   "ADI is evaluating the current design."
//   Testing phase alignment…
//   18 of 28 evaluation jobs complete
//   Elapsed: 42 seconds
//
// The job line appears only when the engine has published a count: an estimate
// is never shown as progress and no percentage is ever displayed.
//
// STALLED is a statement about the engine having stopped reporting, not about
// the run taking a while. When it happens the panel offers exactly two things:
// a fresh status check, and the ONE existing cancel path.
// ---------------------------------------------------------------------------

import React from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  OPTIMISER_RUNNING_SENTENCE,
  OPTIMISER_RUNNING_TITLE,
  OPTIMISER_STALL_CANCEL_LABEL,
  OPTIMISER_STALL_CHECK_LABEL,
  OPTIMISER_STALL_TITLE,
} from "./optimiserRunProgressAuthority.js";
import { formatOptimiserElapsed } from "./optimiserRunProgressAuthority.js";

export default function AdiJourneyRunningPanel({
  progress = null,
  stageElapsedSeconds = null,
  onCheckStatus = null,
  onCancel = null,
  canCancel = false,
  checkResult = null,
}) {
  if (!progress?.running) return null;

  const stageElapsedText = formatOptimiserElapsed(stageElapsedSeconds);

  return (
    <div
      className="rounded-md border border-[#E0DCD5] bg-[#F8F7F4] px-3 py-2.5 space-y-1.5"
      data-adi-run-progress={progress.stalled ? "stalled" : "running"}
      data-adi-run-stage={progress.stageKey}
    >
      <div className="flex items-center gap-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-[#213428]" data-adi-run-spinner="true" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[#213428]" data-adi-run-title="true">
          {OPTIMISER_RUNNING_TITLE}
        </span>
      </div>

      <div className="text-[11.5px] text-[#3E4349] leading-relaxed">
        {OPTIMISER_RUNNING_SENTENCE}
      </div>

      {/* The stage the engine is in right now, and the real job count it has
          published for that search. */}
      <div className="text-[11.5px] font-medium text-[#213428]" data-adi-run-stage-line="true">
        {progress.stageLine}
      </div>
      {progress.jobLine && (
        <div className="text-[11px] text-[#625143]" data-adi-run-jobs="true">
          {progress.jobLine}
        </div>
      )}

      <div className="text-[11px] text-[#625143]" data-adi-run-elapsed="true">
        {progress.elapsedText ? `Elapsed: ${progress.elapsedText}` : null}
        {progress.elapsedText && stageElapsedText ? ` · This stage: ${stageElapsedText}` : null}
      </div>

      {progress.stalled && (
        <div
          className="rounded-md border border-[#E8D5AE] bg-[#FDF6E9] px-3 py-2 space-y-1.5"
          data-adi-run-stalled="true"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-[#B45309]" />
            <span className="text-[11px] font-semibold text-[#8A5A2B]">{OPTIMISER_STALL_TITLE}</span>
          </div>
          <div className="text-[11px] text-[#8A5A2B] leading-relaxed" data-adi-run-stall-sentence="true">
            {progress.stallSentence}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            {typeof onCheckStatus === "function" && (
              <button
                type="button"
                onClick={onCheckStatus}
                data-adi-run-check="true"
                className="inline-flex items-center gap-1.5 rounded-md border border-[#D9D5CE] bg-white px-3.5 py-1.5 text-[11.5px] font-semibold text-[#213428] transition-colors hover:border-[#213428]"
              >
                {OPTIMISER_STALL_CHECK_LABEL}
              </button>
            )}
            {canCancel && typeof onCancel === "function" && (
              <button
                type="button"
                onClick={onCancel}
                data-adi-run-cancel="true"
                className="inline-flex items-center gap-1.5 rounded-md border border-[#E0DCD5] bg-white px-3.5 py-1.5 text-[11.5px] font-semibold text-[#8A5A2B] transition-colors hover:border-[#B45309]"
              >
                {OPTIMISER_STALL_CANCEL_LABEL}
              </button>
            )}
          </div>

          {checkResult?.sentence && (
            <div className="text-[11px] text-[#625143] leading-relaxed" data-adi-run-check-result="true">
              {checkResult.sentence}
            </div>
          )}
        </div>
      )}
    </div>
  );
}