import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import Rp22RecommendationCard from "@/components/room/bass/best-layout/Rp22RecommendationCard";
import Rp22LayoutPlanDialog from "@/components/room/bass/best-layout/Rp22LayoutPlanDialog";
import { coordinatesMatch, validateRecommendationLayout, buildAppliedConfigs } from "@/components/room/bass/best-layout/applyRecommendationUtils";

const levelText = (level) => Number.isFinite(level) ? (level > 0 ? `L${level}` : "FAIL") : "—";
const cloneConfig = (config) => ({ ...config, positions: (config?.positions || []).map((position) => ({ ...position })) });

export default function Rp22PlacementRecommendation({ roomDims, currentLayout, currentQuantityBest, upgradeBest, frontSubsCfg, rearSubsCfg, setFrontSubsCfg, setRearSubsCfg, isRecalculating }) {
  const [selected, setSelected] = useState(null);
  const [previous, setPrevious] = useState(null);
  const [applyError, setApplyError] = useState(null);
  const [applying, setApplying] = useState(false);

  const currentSources = useMemo(() => {
    if (!currentLayout?.sources) return [];
    return currentLayout.sources.map((source) => ({ x: source.x, y: source.y, z: source.z, placement: source.placement }));
  }, [currentLayout?.sources]);

  const isLayoutApplied = (layout) => {
    if (!layout?.sources) return false;
    const recommendedSources = layout.sources.map((source) => ({ x: source.x, y: source.y, z: source.z, placement: source.placement }));
    return coordinatesMatch(currentSources, recommendedSources);
  };

  const apply = (layout) => {
    setApplyError(null);
    // Validate before changing any state.
    const validation = validateRecommendationLayout(layout, roomDims);
    if (!validation.valid) {
      setApplyError(validation.reason);
      return;
    }
    setApplying(true);
    // Save previous config for undo.
    setPrevious({ front: cloneConfig(frontSubsCfg), rear: cloneConfig(rearSubsCfg) });
    // Build complete next-state configs with merged positions.
    const nextConfigs = buildAppliedConfigs(layout, frontSubsCfg, rearSubsCfg);
    // Apply both configs within the same event.
    setFrontSubsCfg?.(nextConfigs.front);
    setRearSubsCfg?.(nextConfigs.rear);
    // Close dialog if open.
    setSelected(null);
    // Clear applying state after the state updates are committed.
    setTimeout(() => setApplying(false), 600);
  };

  const undo = () => {
    if (!previous) return;
    setFrontSubsCfg?.(previous.front);
    setRearSubsCfg?.(previous.rear);
    setPrevious(null);
    setApplyError(null);
  };

  const openDialog = (layout) => { setApplyError(null); setSelected(layout); };
  const currentQuantityApplied = isLayoutApplied(currentQuantityBest);
  const upgradeApplied = isLayoutApplied(upgradeBest);

  return (
    <div className="mt-4 space-y-3 rounded-lg border-2 border-[#213428] bg-[#F3F1EC] p-4">
      <div>
        <h5 className="text-[14px] font-semibold text-[#1B1A1A]">RP22 Subwoofer Placement Recommendations</h5>
        <p className="mt-1 text-[11px] text-[#625143]">Based on recognised RP22 placement patterns and predicted room response. Apply a layout to recalculate the bass response.</p>
      </div>
      <CurrentLayout layout={currentLayout} isRecalculating={isRecalculating} />
      {currentQuantityBest && (
        <Rp22RecommendationCard
          title="Improved placement with existing quantity"
          layout={currentQuantityBest}
          onClick={openDialog}
          onApply={apply}
          isApplied={currentQuantityApplied}
          isRecalculating={currentQuantityApplied && isRecalculating}
          applying={applying}
          applyError={currentQuantityApplied ? null : applyError}
        />
      )}
      {!currentQuantityBest && <Unavailable title="Improved placement with existing quantity" />}
      {upgradeBest && (
        <Rp22RecommendationCard
          title="Recommended RP22 upgrade layout"
          layout={upgradeBest}
          onClick={openDialog}
          onApply={apply}
          isApplied={upgradeApplied}
          isRecalculating={upgradeApplied && isRecalculating}
          applying={applying}
          applyError={upgradeApplied ? null : applyError}
        />
      )}
      {!upgradeBest && <Unavailable title="Recommended RP22 upgrade layout" message="No higher recognised subwoofer quantity is available." />}
      {previous && <Button type="button" size="sm" variant="outline" onClick={undo}>Undo recommended positions</Button>}
      <Rp22LayoutPlanDialog
        open={Boolean(selected)}
        onOpenChange={(open) => { if (!open) { setSelected(null); setApplyError(null); } }}
        layout={selected}
        roomDims={roomDims}
        onApply={apply}
        isApplied={selected ? isLayoutApplied(selected) : false}
        applyError={applyError}
        applying={applying}
      />
    </div>
  );
}

function CurrentLayout({ layout, isRecalculating }) {
  const metrics = layout.metrics;
  return (
    <div className="rounded-lg border border-[#D9D5CE] bg-white/70 p-4">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#625143]">Current subwoofer layout</div>
      <div className="mt-1 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-[#1B1A1A]">Current positions</div>
          <div className="text-[11px] text-[#625143]">{metrics.sourceCount} {metrics.sourceCount === 1 ? "subwoofer" : "subwoofers"}</div>
        </div>
        <span className="text-2xl font-semibold text-[#213428]">{metrics.placementGrade}</span>
      </div>
      <div className="mt-3 flex gap-5 text-xs">
        <span><b>Predicted P19</b> {isRecalculating ? "…" : levelText(metrics.p19Level)}</span>
        <span><b>Predicted P20</b> {isRecalculating ? "…" : levelText(metrics.p20Level)}</span>
      </div>
      {isRecalculating && <p className="mt-1 text-[10px] text-[#625143]">Recalculating bass response…</p>}
    </div>
  );
}

function Unavailable({ title, message = "No recognised layout matches the current quantity." }) {
  return <div className="rounded-lg border border-dashed border-[#C9C2B8] bg-white/50 p-4"><div className="text-[10px] font-semibold uppercase tracking-wide text-[#625143]">{title}</div><p className="mt-1 text-xs text-[#8A7B6A]">{message}</p></div>;
}