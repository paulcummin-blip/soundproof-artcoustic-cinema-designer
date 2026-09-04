import React from "react";
import { Check, Loader2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import RP22GradingPill from "@/components/ui/RP22GradingPill";

function expectedBenefit(sourceCount) {
  if (sourceCount === 1) return "Best available single-sub layout, with canonical seat coverage shown below.";
  if (sourceCount === 2) return "Improves modal averaging and seat-to-seat bass consistency.";
  return "Typically gives the strongest seat-to-seat consistency and the most robust RP22 bass result.";
}

function LevelPill({ level }) {
  const n = Number(level);
  const pillLevel = Number.isFinite(n) && n > 0 ? n : "FAIL";
  return <RP22GradingPill level={pillLevel} compact />;
}

function coverageData(results) {
  const seats = Array.isArray(results) ? results : [];
  const primary = seats.filter((seat) => seat.isPrimary !== false);
  const secondary = seats.filter((seat) => seat.isPrimary === false);
  const primaryFloor = primary.length ? Math.min(...primary.map((seat) => Number(seat.level) || 0)) : 0;
  const secondaryFloor = secondary.length ? Math.min(...secondary.map((seat) => Number(seat.level) || 0)) : 0;
  const secondaryHasFail = secondary.some((seat) => (Number(seat.level) || 0) <= 0);
  return {
    hasSeats: seats.length > 0,
    hasPrimary: primary.length > 0,
    hasSecondary: secondary.length > 0,
    primaryLevel: primaryFloor,
    secondaryLevel: secondaryFloor,
    secondaryHasFail,
  };
}

function CoverageRow({ label, results }) {
  const data = coverageData(results);
  if (!data.hasSeats) return <span className="text-[11px] text-[#8A7B6A]">No seat authority</span>;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
      <span className="font-medium text-[#1B1A1A]">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className="text-[#625143]">Primary Seats</span>
        {data.hasPrimary ? <LevelPill level={data.primaryLevel} /> : <span className="text-[#8A7B6A]">No Primary seats</span>}
      </div>
      <div className="flex items-center gap-1.5">
        {data.hasSecondary ? (
          data.secondaryHasFail ? (
            <>
              <span className="text-[#625143]">Secondary Seats</span>
              <LevelPill level={0} />
            </>
          ) : (
            <>
              <span className="text-[#625143]">Secondary Seats — no lower than</span>
              <LevelPill level={data.secondaryLevel} />
            </>
          )
        ) : (
          <span className="text-[#8A7B6A]">No Secondary seats</span>
        )}
      </div>
    </div>
  );
}

function SeatCoverage({ metrics }) {
  const p19 = Array.isArray(metrics?.perSeatP19) ? metrics.perSeatP19 : [];
  const p20 = Array.isArray(metrics?.perSeatP20) ? metrics.perSeatP20 : [];
  const p20ById = new Map(p20.map((seat) => [String(seat.seatId), seat]));
  const rows = p19.map((seat) => ({ seat, p20: p20ById.get(String(seat.seatId)) }));
  return (
    <>
      <div className="mt-3 grid gap-2">
        <div className="rounded-md border border-[#E7E4DF] bg-white/60 px-2.5 py-2">
          <div className="text-[10px] font-medium text-[#625143]">P19 · Canonical seat coverage</div>
          <div className="mt-1"><CoverageRow label="" results={p19} /></div>
        </div>
        <div className="rounded-md border border-[#E7E4DF] bg-white/60 px-2.5 py-2">
          <div className="text-[10px] font-medium text-[#625143]">P20 · Canonical seat coverage</div>
          <div className="mt-1"><CoverageRow label="" results={p20} /></div>
        </div>
      </div>
      {rows.length > 0 && (
        <details className="mt-2 rounded-md border border-[#E7E4DF] bg-white/50 px-2.5 py-2">
          <summary className="cursor-pointer text-[10px] font-medium text-[#625143]">View individual seat authority</summary>
          <div className="mt-2 space-y-1.5">
            {rows.map(({ seat, p20: seatP20 }) => (
              <div key={seat.seatId} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[#625143]">
                <span className="min-w-[5rem] truncate font-medium text-[#1B1A1A]">{seat.seatLabel}</span>
                <span className="flex items-center gap-1">
                  P19 <LevelPill level={seat.level} /> {seat.wholeDbDeviation ?? "—"} dB
                </span>
                <span className="flex items-center gap-1">
                  P20 <LevelPill level={seatP20?.level} /> {seatP20?.wholeDbDeviation ?? "—"} dB
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </>
  );
}

export default function Rp22RecommendationCard({ title, layout, onClick, onApply, isApplied, isRecalculating, applying, applyError, applyLabel = "Apply layout" }) {
  if (!layout?.metrics || layout.metrics.responseAuthority !== "final-post-eq" || !layout.metrics.hasConfirmedSeatAuthority) return null;
  const m = layout.metrics;
  return (
    <div className={`w-full rounded-lg border p-4 text-left transition ${isApplied ? "border-2 border-[#213428] bg-[#F3F1EC]" : "border border-[#D9D5CE] bg-white"} hover:border-[#213428] hover:shadow-sm`}>
      <button type="button" onClick={() => onClick(layout)} className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#213428]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[#625143]">{title}</div>
            <div className="mt-1 text-sm font-semibold text-[#1B1A1A]">{layout.name}</div>
            <div className="mt-0.5 text-[11px] text-[#625143]">{m.sourceCount} {m.sourceCount === 1 ? "subwoofer" : "subwoofers"} · {layout.placementMode}</div>
          </div>
          <ChevronRight className="h-4 w-4 text-[#625143]" />
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-[#625143]">{expectedBenefit(m.sourceCount)}</p>
      </button>

      {isApplied && (
        <div className="mt-3 rounded-md border border-[#213428]/30 bg-white/70 p-3">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-[#213428]" />
            <span className="text-xs font-semibold text-[#213428]">Already applied · current layout</span>
            {applying && <span className="flex items-center gap-1 text-[10px] text-[#625143]"><Loader2 className="h-3 w-3 animate-spin" />Applying positions…</span>}
            {!applying && isRecalculating && <span className="flex items-center gap-1 text-[10px] text-[#625143]"><Loader2 className="h-3 w-3 animate-spin" />Updating authority…</span>}
          </div>
          <p className="mt-1.5 text-[11px] text-[#213428]">This tested position reuses the current canonical result.</p>
        </div>
      )}

      {m.limited && <p className="mt-2 rounded-md bg-amber-50 px-2.5 py-2 text-[10px] font-medium text-amber-800">Limited at the selected P14/P18 target; the seat authority below remains canonical.</p>}
      <SeatCoverage metrics={m} />

      {applyError && <p className="mt-2 text-[11px] text-red-700">{applyError}</p>}

      {!isApplied && (
        <Button type="button" size="sm" className="mt-3 w-full bg-[#213428] text-white hover:bg-[#3E4349]" onClick={(event) => { event.stopPropagation(); onApply?.(layout); }} disabled={applying}>
          {applying ? "Applying…" : applyLabel}
        </Button>
      )}
    </div>
  );
}