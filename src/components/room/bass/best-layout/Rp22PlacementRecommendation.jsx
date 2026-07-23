import React, { useState } from "react";
import { Button } from "@/components/ui/button";

const levelText = (level) => Number.isFinite(level) ? (level > 0 ? `L${level}` : "FAIL") : "—";
const cloneConfig = (config) => ({ ...config, positions: (config?.positions || []).map((position) => ({ ...position })) });

export default function Rp22PlacementRecommendation({ recommendation, currentLayout, frontSubsCfg, rearSubsCfg, setFrontSubsCfg, setRearSubsCfg }) {
  const [previous, setPrevious] = useState(null);
  if (!recommendation) return null;
  const activeRecommendation = previous?.recommendation || recommendation;
  const metrics = activeRecommendation.metrics;
  const before = previous?.metrics || currentLayout?.metrics || null;

  const apply = () => {
    setPrevious({ front: cloneConfig(frontSubsCfg), rear: cloneConfig(rearSubsCfg), metrics: currentLayout?.metrics || null, recommendation });
    const frontSources = recommendation.sources.filter((source) => source.placement !== "rear");
    const rearSources = recommendation.sources.filter((source) => source.placement === "rear");
    const activeModel = Number(frontSubsCfg?.count) > 0 ? frontSubsCfg?.model : rearSubsCfg?.model;
    setFrontSubsCfg?.((config) => ({ ...config, model: frontSources.length && !Number(config?.count) ? activeModel : config?.model, count: frontSources.length, placementMode: "manual", isManual: true, positions: frontSources.map(({ x, y, z }) => ({ x, y, z })) }));
    setRearSubsCfg?.((config) => ({ ...config, model: rearSources.length && !Number(config?.count) ? activeModel : config?.model, count: rearSources.length, placementMode: "manual", isManual: true, positions: rearSources.map(({ x, y, z }) => ({ x, y, z })) }));
  };

  const undo = () => {
    if (!previous) return;
    setFrontSubsCfg?.(previous.front);
    setRearSubsCfg?.(previous.rear);
    setPrevious(null);
  };

  const improvement = before ? (metrics.p19Level + metrics.p20Level) - (before.p19Level + before.p20Level) : null;
  return <div className="mt-4 rounded-lg border-2 border-[#213428] bg-[#F3F1EC] p-4">
    <div className="flex items-start justify-between gap-3">
      <div><h5 className="text-[14px] font-semibold text-[#1B1A1A]">Recommended Subwoofer Placement</h5><p className="mt-1 text-[11px] text-[#625143]">Based on RP22 placement guidance and predicted room response.</p></div>
      <span className="text-2xl font-semibold text-[#213428]">{metrics.placementGrade}</span>
    </div>
    <div className="mt-3 flex items-center justify-between"><div><div className="text-sm font-semibold text-[#1B1A1A]">{activeRecommendation.name}</div><div className="text-[11px] text-[#625143]">Improves bass consistency across the listening area</div></div><span className="rounded-full bg-[#213428] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Recommended</span></div>
    <div className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-[#625143]">Expected improvement</div>
    <div className="mt-2 grid grid-cols-2 gap-3 text-xs">
      <Metric label="Layout" value={recommendation.placementMode} /><Metric label="Quantity" value={`${metrics.sourceCount} ${metrics.sourceCount === 1 ? "subwoofer" : "subwoofers"}`} />
      <Metric label="P19 Seat Consistency" value={`${levelText(before?.p19Level)} → ${levelText(metrics.p19Level)}`} /><Metric label="P20 Worst Seat Performance" value={`${levelText(before?.p20Level)} → ${levelText(metrics.p20Level)}`} />
      <Metric label="Seat variation" value={`${before ? `${before.worstSeatVariationDb.toFixed(1)} dB → ` : ""}${metrics.worstSeatVariationDb.toFixed(1)} dB`} /><Metric label="Improvement" value={improvement == null ? "Predicted" : `${improvement >= 0 ? "+" : ""}${improvement} RP22 levels`} />
    </div>
    <div className="mt-4 flex flex-wrap gap-2">{!previous ? <Button type="button" size="sm" onClick={apply} className="bg-[#213428] text-white hover:bg-[#3E4349]">Apply Recommended Placement</Button> : <Button type="button" size="sm" variant="outline" onClick={undo}>Undo placement change</Button>}</div>
  </div>;
}

function Metric({ label, value }) {
  return <div><div className="uppercase tracking-wide text-[#8A7B6A]">{label}</div><div className="mt-0.5 font-medium text-[#1B1A1A]">{value}</div></div>;
}