import React from "react";
import { Check, Loader2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

function expectedBenefit(sourceCount) {
  if (sourceCount === 1) return "Best available single-sub layout, but limited seat-to-seat consistency is expected.";
  if (sourceCount === 2) return "Improves modal averaging and seat-to-seat bass consistency.";
  return "Typically gives the strongest seat-to-seat consistency and the most robust RP22 bass result.";
}

export default function Rp22RecommendationCard({ title, layout, onClick, onApply, isApplied, isRecalculating, applying, applyError, unsupported, applyLabel = "Apply layout" }) {
  if (!layout) return null;
  const m = layout.metrics;
  const p19Level = m?.p19Level;
  const p20Level = m?.p20Level;
  const p19Text = m?.rspOnly || p19Level == null
    ? "Prediction unavailable"
    : `${p19Level > 0 ? `L${p19Level}` : "FAIL"} · ±${Number(m.meanSeatVariationDb / 2).toFixed(1)} dB`;
  const p20Text = m?.rspOnly || p20Level == null
    ? "Prediction unavailable"
    : `${p20Level > 0 ? `L${p20Level}` : "FAIL"} · ±${Number(m.worstSeatVariationDb / 2).toFixed(1)} dB`;
  return (
    <div className={`w-full rounded-lg border p-4 text-left transition ${isApplied ? "border-2 border-[#213428] bg-[#F3F1EC]" : "border border-[#D9D5CE] bg-white"} hover:border-[#213428] hover:shadow-sm`}>
      <button type="button" onClick={() => onClick(layout)} className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#213428]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[#625143]">{title}</div>
            <div className="mt-1 text-sm font-semibold text-[#1B1A1A]">{layout.name}</div>
            <div className="mt-0.5 text-[11px] text-[#625143]">{m.sourceCount} subwoofers · {layout.placementMode}</div>
          </div>
          <ChevronRight className="h-4 w-4 text-[#625143]" />
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-[#625143]">{expectedBenefit(m.sourceCount)}</p>
      </button>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-md border border-[#E7E4DF] bg-white/60 px-2 py-1.5">
          <div className="text-[10px] font-medium text-[#625143]">P19 · Seat Consistency</div>
          <div className="font-semibold text-[#1B1A1A]">{p19Text}</div>
        </div>
        <div className="rounded-md border border-[#E7E4DF] bg-white/60 px-2 py-1.5">
          <div className="text-[10px] font-medium text-[#625143]">P20 · Worst Seat</div>
          <div className="font-semibold text-[#1B1A1A]">{p20Text}</div>
        </div>
      </div>

      {unsupported && (
        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3">
          <p className="text-[11px] font-medium text-amber-800">Exact application of this side-wall layout is not currently supported.</p>
          <p className="mt-1 text-[10px] text-amber-700">View the layout details for reference, or choose a front/rear layout to apply.</p>
        </div>
      )}

      {isApplied && !unsupported && (
        <div className="mt-3 rounded-md border border-[#213428]/30 bg-white/70 p-3">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-[#213428]" />
            <span className="text-xs font-semibold text-[#213428]">Applied</span>
            {applying && <span className="flex items-center gap-1 text-[10px] text-[#625143]"><Loader2 className="h-3 w-3 animate-spin" />Applying positions…</span>}
            {!applying && isRecalculating && <span className="flex items-center gap-1 text-[10px] text-[#625143]"><Loader2 className="h-3 w-3 animate-spin" />Recalculating bass response…</span>}
            {!applying && !isRecalculating && <span className="text-[10px] text-[#625143]">Positions applied</span>}
          </div>
        </div>
      )}

      {applyError && !unsupported && <p className="mt-2 text-[11px] text-red-700">{applyError}</p>}

      {!isApplied && !unsupported && (
        <Button type="button" size="sm" className="mt-3 w-full bg-[#213428] text-white hover:bg-[#3E4349]" onClick={(e) => { e.stopPropagation(); onApply?.(layout); }} disabled={applying}>
          {applying ? "Applying…" : applyLabel}
        </Button>
      )}
    </div>
  );
}