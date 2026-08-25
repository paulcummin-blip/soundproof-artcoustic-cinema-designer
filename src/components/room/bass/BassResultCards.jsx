// Larger P14/P18/P19/P20 result cards for the Bass Simulation top section.
// Official results are publication-gated: only a canonically published
// completed result (canonicalMetricPublicationValid === true) may be
// presented as an official RP22 result. While calculating/updating, pills
// show "Calculating…" — never preliminary live values.
// P19 and P20 are SEAT-scoped parameters: main pill always shows "SEAT" —
// no RSP/aggregate headline. Expanded seat grids below show all seats with
// Primary/Secondary distinction.
import React, { useEffect, useState } from "react";
import RP22GradingPill from "@/components/ui/RP22GradingPill";
import BassRp22ParameterTooltip from "@/components/room/bass/BassRp22ParameterTooltip";
import { formatOfficialBassResults } from "@/components/room/bass/bassResultsPresentation";
import { useSharedBassResults } from "@/components/room/bass/bassResultsStore";
import { resolveP14TargetSelectionState } from "@/components/room/bass/p14TargetSelectionState";
import { formatCoverageSummaryFromRows } from "@/components/utils/seatCoverageSummary";
import P19SeatBlock from "@/components/room/bass/P19SeatBlock";
import P20SeatBlock from "@/components/room/bass/P20SeatBlock";

const CARD_TITLES = {
  p14: "P14 Bass SPL",
  p18: "P18 Extension",
  p19: "P19 Response Fit",
  p20: "P20 Seat Consistency",
};

export default function BassResultCards() {
  const shared = useSharedBassResults();
  const [nowMs, setNowMs] = useState(Date.now());
  const active = shared.isUpdating || ["stale", "calculating", "running", "queued"].includes(shared.lifecycle?.status);
  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active, shared.lifecycle?.startedAtMs, shared.lifecycle?.queuedAtMs]);

  const p14Selection = resolveP14TargetSelectionState(shared.authoritative?.requested);
  const formatted = formatOfficialBassResults(
    shared.completedBassAuthority,
    shared.lifecycle,
    shared.seatingPositions,
    nowMs,
    p14Selection.noP14TargetSelected,
    {
      p14TargetBasis: shared.authoritative?.requested?.p14TargetBasis,
      p18TargetBasis: shared.authoritative?.requested?.p18TargetBasis,
    },
  );

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Object.entries(formatted.pills).map(([key, pill]) => (
          <div
            key={key}
            className="flex flex-col gap-1 rounded-lg border border-[#DCDBD6] bg-white p-3"
            aria-label={pill.text}
          >
            <BassRp22ParameterTooltip parameterKey={key}>
              <span className="cursor-help text-[11px] font-semibold text-[#213428] underline decoration-dotted underline-offset-2">
                {CARD_TITLES[key] || pill.label}
              </span>
            </BassRp22ParameterTooltip>
            <RP22GradingPill level={pill.level} style={{ width: "100%" }}>{pill.resultText}</RP22GradingPill>
            {pill.detail && <div className="text-[10px] text-[#625143]">{pill.detail}</div>}
          </div>
        ))}
      </div>

      {/* Expanded P19/P20 per-seat views — only when authoritative */}
      {formatted.isReady && (formatted.p19Rows.length > 0 || formatted.p20Rows.length > 0) && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {formatted.p19Rows.length > 0 && (
            <div className="rounded-lg border border-[#DCDBD6] bg-white p-3">
              <div className="mb-1 text-[11px] font-semibold text-[#213428]">P19 — All Seats</div>
              <div className="mb-1.5 text-[10px] font-medium text-[#625143]">{formatCoverageSummaryFromRows(formatted.p19Rows)}</div>
              <P19SeatBlock
                rows={formatted.p19Rows}
                publicationVerified={formatted.publicationVerified}
                authorityStatus={shared.completedBassAuthority?.authorityStatus}
                p14TargetUnselected={p14Selection.noP14TargetSelected}
              />
            </div>
          )}
          {formatted.p20Rows.length > 0 && (
            <div className="rounded-lg border border-[#DCDBD6] bg-white p-3">
              <div className="mb-1 text-[11px] font-semibold text-[#213428]">P20 — All Seats</div>
              <div className="mb-1.5 text-[10px] font-medium text-[#625143]">{formatCoverageSummaryFromRows(formatted.p20Rows)}</div>
              <P20SeatBlock
                rows={formatted.p20Rows}
                publicationVerified={formatted.publicationVerified}
                authorityStatus={shared.completedBassAuthority?.authorityStatus}
                p14TargetUnselected={p14Selection.noP14TargetSelected}
              />
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 text-[10px] font-medium text-[#625143]" aria-live="polite">
        {shared.lifecycle?.status === "error" && shared.onRetry
          ? <button type="button" onClick={shared.onRetry} className="font-semibold text-red-700 underline">{formatted.statusText}</button>
          : <span>{formatted.statusText}</span>}
      </div>
    </div>
  );
}