import React from "react";
import { ChevronRight } from "lucide-react";

export default function Rp22RecommendationCard({ title, layout, onClick }) {
  if (!layout) return null;
  return <button type="button" onClick={() => onClick(layout)} className="w-full rounded-lg border border-[#D9D5CE] bg-white p-4 text-left transition hover:border-[#213428] hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#213428]">
    <div className="flex items-start justify-between gap-3">
      <div><div className="text-[10px] font-semibold uppercase tracking-wide text-[#625143]">{title}</div><div className="mt-1 text-sm font-semibold text-[#1B1A1A]">{layout.name}</div><div className="mt-0.5 text-[11px] text-[#625143]">{layout.metrics.sourceCount} subwoofers · {layout.placementMode}</div></div>
      <div className="flex items-center gap-2"><span className="text-2xl font-semibold text-[#213428]">{layout.metrics.placementGrade}</span><ChevronRight className="h-4 w-4 text-[#625143]" /></div>
    </div>
    <div className="mt-3 flex gap-5 text-xs"><span><b>P19</b> L{layout.metrics.p19Level}</span><span><b>P20</b> L{layout.metrics.p20Level}</span><span>{layout.metrics.worstSeatVariationDb.toFixed(1)} dB variation</span></div>
  </button>;
}