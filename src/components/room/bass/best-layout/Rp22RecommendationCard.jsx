import React from "react";
import { Check, Loader2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

function expectedBenefit(sourceCount) {
  if (sourceCount === 1) return "More even bass distribution across the listening area.";
  if (sourceCount === 2) return "Improved modal smoothing and more consistent bass across seats.";
  return "Greater modal averaging and improved seat-to-seat bass consistency.";
}

export default function Rp22RecommendationCard({ title, layout, onClick, onApply, isApplied, isRecalculating, applying, applyError, unsupported }) {
  if (!layout) return null;
  const m = layout.metrics;
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
          {applying ? "Applying…" : "Apply layout"}
        </Button>
      )}
    </div>
  );
}