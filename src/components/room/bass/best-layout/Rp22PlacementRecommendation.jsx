import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import Rp22RecommendationCard from "@/components/room/bass/best-layout/Rp22RecommendationCard";
import Rp22LayoutPlanDialog from "@/components/room/bass/best-layout/Rp22LayoutPlanDialog";

const levelText = (level) => Number.isFinite(level) ? (level > 0 ? `L${level}` : "FAIL") : "—";
const cloneConfig = (config) => ({ ...config, positions: (config?.positions || []).map((position) => ({ ...position })) });

export default function Rp22PlacementRecommendation({ roomDims, currentLayout, currentQuantityBest, upgradeBest, frontSubsCfg, rearSubsCfg, setFrontSubsCfg, setRearSubsCfg }) {
  const [selected, setSelected] = useState(null);
  const [previous, setPrevious] = useState(null);

  const apply = (layout) => {
    setPrevious({ front: cloneConfig(frontSubsCfg), rear: cloneConfig(rearSubsCfg) });
    const frontSources = layout.sources.filter((source) => source.placement !== "rear");
    const rearSources = layout.sources.filter((source) => source.placement === "rear");
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

  return <div className="mt-4 space-y-3 rounded-lg border-2 border-[#213428] bg-[#F3F1EC] p-4">
    <div><h5 className="text-[14px] font-semibold text-[#1B1A1A]">RP22 Subwoofer Placement Recommendations</h5><p className="mt-1 text-[11px] text-[#625143]">Based on recognised RP22 placement patterns and predicted room response.</p></div>
    <CurrentLayout layout={currentLayout} />
    {currentQuantityBest ? <Rp22RecommendationCard title="Improved placement with existing quantity" layout={currentQuantityBest} onClick={setSelected} /> : <Unavailable title="Improved placement with existing quantity" />}
    {upgradeBest ? <Rp22RecommendationCard title="Recommended RP22 upgrade layout" layout={upgradeBest} onClick={setSelected} /> : <Unavailable title="Recommended RP22 upgrade layout" message="No higher recognised subwoofer quantity is available." />}
    {previous && <Button type="button" size="sm" variant="outline" onClick={undo}>Undo placement change</Button>}
    <Rp22LayoutPlanDialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)} layout={selected} roomDims={roomDims} onApply={apply} />
  </div>;
}

function CurrentLayout({ layout }) {
  const metrics = layout.metrics;
  return <div className="rounded-lg border border-[#D9D5CE] bg-white/70 p-4"><div className="text-[10px] font-semibold uppercase tracking-wide text-[#625143]">Current subwoofer layout</div><div className="mt-1 flex items-center justify-between"><div><div className="text-sm font-semibold text-[#1B1A1A]">Current positions</div><div className="text-[11px] text-[#625143]">{metrics.sourceCount} {metrics.sourceCount === 1 ? "subwoofer" : "subwoofers"}</div></div><span className="text-2xl font-semibold text-[#213428]">{metrics.placementGrade}</span></div><div className="mt-3 flex gap-5 text-xs"><span><b>P19</b> {levelText(metrics.p19Level)}</span><span><b>P20</b> {levelText(metrics.p20Level)}</span></div></div>;
}

function Unavailable({ title, message = "No recognised layout matches the current quantity." }) {
  return <div className="rounded-lg border border-dashed border-[#C9C2B8] bg-white/50 p-4"><div className="text-[10px] font-semibold uppercase tracking-wide text-[#625143]">{title}</div><p className="mt-1 text-xs text-[#8A7B6A]">{message}</p></div>;
}