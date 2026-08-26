import React from "react";

export default function BestSubLayoutCard({ recommendation, rank, familyComparison }) {
  const m = recommendation.metrics;
  const showComparison = rank === 1 && familyComparison && familyComparison.winnerId === recommendation.id;
  return (
    <div className={`rounded-lg px-4 py-3 ${rank === 1 ? "border-2 border-[#213428] bg-[#F3F1EC]" : "border border-[#E7E4DF] bg-white"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><div className="text-2xl font-semibold text-[#213428]">{m.overallGrade}</div><div className="text-sm font-semibold text-[#1B1A1A] mt-1">{recommendation.name}</div></div>
        {rank === 1 && <span className="rounded-full bg-[#213428] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Recommended</span>}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs md:grid-cols-4">
        <Metric label="Layout" value={m.placementFamily} /><Metric label="Placement mode" value={recommendation.placementMode} />
        <Metric label="Quantity" value={`${m.sourceCount} ${m.sourceCount === 1 ? "sub" : "subs"}`} /><Metric label="Seat variation" value={`${m.worstSeatVariationDb.toFixed(1)} dB`} />
        <Metric label="Major nulls" value={m.destructiveBroadNullCount} /><Metric label="Normalized depth" value={`${m.lowestReliableNormalizedFrequencyHz.toFixed(1)} Hz`} />
        <Metric label="Transfer efficiency" value={m.transferEfficiencyClass} /><Metric label="Seats assessed" value={m.rspOnly ? "RSP-only" : m.realSeatsAssessed} />
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-[#625143]">{m.rankingReason}</p>
      {showComparison && (
        <div className="mt-2 rounded-md border border-[#213428]/20 bg-white/70 px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[#625143]">Four-sub family comparison</div>
          <p className="mt-1 text-[11px] leading-relaxed text-[#1B1A1A]">{familyComparison.explanation}</p>
          <div className="mt-1.5 grid grid-cols-2 gap-2 text-[10px] text-[#625143]">
            <span>25/75 worst seat: {familyComparison.quarter.worstSeatVariationDb.toFixed(2)} dB</span>
            <span>33/67 worst seat: {familyComparison.third.worstSeatVariationDb.toFixed(2)} dB</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }) {
  return <div><div className="uppercase tracking-wide text-[#8A7B6A]">{label}</div><div className="mt-0.5 font-medium text-[#1B1A1A]">{value}</div></div>;
}