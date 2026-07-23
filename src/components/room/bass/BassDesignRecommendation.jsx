import React from "react";

export default function BassDesignRecommendation({ recommendation }) {
  if (!recommendation) return null;
  return (
    <div className="mt-2 grid gap-2 rounded-md border border-[#DCDBD6] bg-white p-3 text-xs sm:grid-cols-2">
      <div>
        <div className="font-semibold text-[#213428]">Primary limitation</div>
        <div className="mt-1 text-[#1B1A1A]">
          {recommendation.parameterKey === "none" ? recommendation.parameterName : recommendation.parameterKey?.toUpperCase()} · {recommendation.achievedLevel}
        </div>
        <div className="mt-1 text-[#625143]">{recommendation.reason}</div>
      </div>
      <div>
        <div className="font-semibold text-[#213428]">Recommended improvement</div>
        <div className="mt-1 text-[#625143]">{recommendation.recommendedImprovement}</div>
      </div>
    </div>
  );
}