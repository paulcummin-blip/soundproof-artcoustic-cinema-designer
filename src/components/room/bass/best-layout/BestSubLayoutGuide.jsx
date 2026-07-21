import React from "react";
import BestSubLayoutCard from "@/components/room/bass/best-layout/BestSubLayoutCard";
import { useBestSubLayoutRecommendations } from "@/components/room/bass/best-layout/useBestSubLayoutRecommendations";

export default function BestSubLayoutGuide({ roomDims, seatingPositions, rspPosition }) {
  const recommendation = useBestSubLayoutRecommendations({ roomDims, seatingPositions, rspPosition });
  const items = recommendation.result?.recommendations || [];
  return (
    <div className="mt-4 rounded-lg border border-[#E7E4DF] bg-white/70 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div><h5 className="text-[14px] font-semibold text-[#1B1A1A]">Product-independent room-placement guide</h5><p className="mt-1 text-[11px] leading-relaxed text-[#625143]">Subwoofer model capability and RP22 levels are calculated separately.</p></div>
        {recommendation.isUpdating && <span className="text-[10px] font-medium text-[#625143]">Updating…</span>}
      </div>
      {recommendation.status === "idle" && <p className="mt-3 text-xs text-[#625143]">Add room dimensions and seating, or an RSP, to calculate recommendations.</p>}
      {recommendation.status === "error" && <p className="mt-3 text-xs text-red-700">Recommendation could not be calculated.</p>}
      {recommendation.result?.rspOnly && <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-[11px] text-amber-800">Provisional RSP-only result — add real seats for a definitive multi-seat recommendation.</p>}
      {items.length > 0 && <div className="mt-3 space-y-3">{items.slice(0, 3).map((item, index) => <BestSubLayoutCard key={item.id} recommendation={item} rank={index + 1} />)}</div>}
      {recommendation.status === "calculating" && items.length === 0 && <p className="mt-3 text-xs text-[#625143]">Calculating room-placement recommendations…</p>}
      <p className="mt-3 text-[11px] text-[#8A7B6A]">Advisory only — your current subwoofer quantity and positions are unchanged.</p>
    </div>
  );
}