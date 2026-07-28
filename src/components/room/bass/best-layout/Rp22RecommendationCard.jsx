import React from "react";
import { Check, Loader2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const levelText = (level) => Number.isFinite(level) ? (level > 0 ? `L${level}` : "FAIL") : "—";

export default function Rp22RecommendationCard({ title, layout, onClick, onApply, isApplied, verifiedP19, verifiedP20, isRecalculating, applyError }) {
  if (!layout) return null;
  const m = layout.metrics;
  const hasVerifiedResult = isApplied && (Number.isFinite(verifiedP19) || Number.isFinite(verifiedP20));
  return (
    <div className={`w-full rounded-lg border p-4 text-left transition ${isApplied ? "border-2 border-[#213428] bg-[#F3F1EC]" : "border border-[#D9D5CE] bg-white"} hover:border-[#213428] hover:shadow-sm`}>
      <button type="button" onClick={() => onClick(layout)} className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#213428]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[#625143]">{title}</div>
            <div className="mt-1 text-sm font-semibold text-[#1B1A1A]">{layout.name}</div>
            <div className="mt-0.5 text-[11px] text-[#625143]">{m.sourceCount} subwoofers · {layout.placementMode}</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-semibold text-[#213428]">{m.placementGrade}</span>
            <ChevronRight className="h-4 w-4 text-[#625143]" />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs">
          <span><b>Predicted P19</b> {levelText(m.p19Level)}</span>
          <span><b>Predicted P20</b> {levelText(m.p20Level)}</span>
          <span>{m.worstSeatVariationDb.toFixed(1)} dB predicted variation</span>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-[#8A7B6A]">Predicted from the placement model. Apply this layout to calculate verified RP22 results.</p>
      </button>

      {isApplied && (
        <div className="mt-3 rounded-md border border-[#213428]/30 bg-white/70 p-3">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-[#213428]" />
            <span className="text-xs font-semibold text-[#213428]">Applied</span>
            {isRecalculating && <span className="flex items-center gap-1 text-[10px] text-[#625143]"><Loader2 className="h-3 w-3 animate-spin" />Recalculating bass response…</span>}
          </div>
          {hasVerifiedResult && !isRecalculating && (
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs">
              <span><b>Verified P19</b> {levelText(verifiedP19)}</span>
              <span><b>Verified P20</b> {levelText(verifiedP20)}</span>
            </div>
          )}
          {hasVerifiedResult && !isRecalculating && (
            <p className="mt-1 text-[10px] text-[#8A7B6A]">Verified result from the canonical bass engine. May differ from the prediction above.</p>
          )}
        </div>
      )}

      {applyError && <p className="mt-2 text-[11px] text-red-700">{applyError}</p>}

      {!isApplied && (
        <Button type="button" size="sm" className="mt-3 w-full bg-[#213428] text-white hover:bg-[#3E4349]" onClick={(e) => { e.stopPropagation(); onApply?.(layout); }}>
          Apply recommended positions
        </Button>
      )}
    </div>
  );
}