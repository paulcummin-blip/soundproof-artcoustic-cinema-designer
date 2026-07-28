import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import Rp22RecommendationCard from "@/components/room/bass/best-layout/Rp22RecommendationCard";
import Rp22LayoutPlanDialog from "@/components/room/bass/best-layout/Rp22LayoutPlanDialog";
import { coordinatesMatch, validateRecommendationCoordinates, checkPositionConflicts } from "@/components/room/bass/best-layout/applyRecommendationUtils";

const levelText = (level) => Number.isFinite(level) ? (level > 0 ? `L${level}` : "FAIL") : "—";
const cloneConfig = (config) => ({ ...config, positions: (config?.positions || []).map((position) => ({ ...position })) });

export default function Rp22PlacementRecommendation({ roomDims, currentLayout, currentQuantityBest, upgradeBest, frontSubsCfg, rearSubsCfg, setFrontSubsCfg, setRearSubsCfg, roomElements, isRecalculating }) {
  const [selected, setSelected] = useState(null);
  const [previous, setPrevious] = useState(null);
  const [applyError, setApplyError] = useState(null);
  const [applying, setApplying] = useState(false);

  const currentSources = useMemo(() => {
    if (!currentLayout?.sources) return [];
    return currentLayout.sources.map((source) => ({ x: source.x, y: source.y }));
  }, [currentLayout?.sources]);

  const isLayoutApplied = (layout) => {
    if (!layout?.sources) return false;
    const recommendedSources = layout.sources.map((source) => ({ x: source.x, y: source.y }));
    return coordinatesMatch(currentSources, recommendedSources);
  };

  const verifiedP19 = currentLayout?.metrics?.responseAuthority === "final-post-eq" ? currentLayout.metrics.p19Level : null;
  const verifiedP20 = currentLayout?.metrics?.responseAuthority === "final-post-eq" ? currentLayout.metrics.p20Level : null;
  const currentIsVerified = currentLayout?.metrics?.responseAuthority === "final-post-eq";

  const apply = (layout) => {
    setApplyError(null);
    // Atomic validation: check all coordinates before changing anything.
    const validation = validateRecommendationCoordinates(layout, roomDims);
    if (!validation.valid) {
      setApplyError(validation.reason);
      return;
    }
    const conflictCheck = checkPositionConflicts(layout, roomElements, roomDims);
    if (conflictCheck.conflicts) {
      setApplyError(conflictCheck.reason);
      return;
    }
    setApplying(true);
    // Save previous config for undo.
    setPrevious({ front: cloneConfig(frontSubsCfg), rear: cloneConfig(rearSubsCfg) });
    const frontSources = layout.sources.filter((source) => source.placement !== "rear");
    const rearSources = layout.sources.filter((source) => source.placement === "rear");
    const activeModel = Number(frontSubsCfg?.count) > 0 ? frontSubsCfg?.model : rearSubsCfg?.model;
    setFrontSubsCfg?.((config) => ({
      ...config,
      model: frontSources.length && !Number(config?.count) ? activeModel : config?.model,
      count: frontSources.length,
      placementMode: "manual",
      isManual: true,
      positions: frontSources.map(({ x, y, z }) => ({ x, y, z })),
    }));
    setRearSubsCfg?.((config) => ({
      ...config,
      model: rearSources.length && !Number(config?.count) ? activeModel : config?.model,
      count: rearSources.length,
      placementMode: "manual",
      isManual: true,
      positions: rearSources.map(({ x, y, z }) => ({ x, y, z })),
    }));
    // Close dialog if open.
    setSelected(null);
    // Clear applying state after a tick (the recalculation is triggered by the config change).
    setTimeout(() => setApplying(false), 500);
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
        <p className="mt-1 text-[11px] text-[#625143]">Based on recognised RP22 placement patterns and predicted room response. Apply a layout to calculate verified RP22 results.</p>
      </div>
      <CurrentLayout layout={currentLayout} isRecalculating={isRecalculating} isVerified={currentIsVerified} />
      {currentQuantityBest && (
        <Rp22RecommendationCard
          title="Improved placement with existing quantity"
          layout={currentQuantityBest}
          onClick={openDialog}
          onApply={apply}
          isApplied={currentQuantityApplied}
          verifiedP19={currentQuantityApplied ? verifiedP19 : null}
          verifiedP20={currentQuantityApplied ? verifiedP20 : null}
          isRecalculating={currentQuantityApplied && (isRecalculating || !currentIsVerified)}
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
          verifiedP19={upgradeApplied ? verifiedP19 : null}
          verifiedP20={upgradeApplied ? verifiedP20 : null}
          isRecalculating={upgradeApplied && (isRecalculating || !currentIsVerified)}
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
      />
    </div>
  );
}

function CurrentLayout({ layout, isRecalculating, isVerified }) {
  const metrics = layout.metrics;
  const p19Text = isVerified ? levelText(metrics.p19Level) : isRecalculating ? "…" : levelText(metrics.p19Level);
  const p20Text = isVerified ? levelText(metrics.p20Level) : isRecalculating ? "…" : levelText(metrics.p20Level);
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
        <span><b>{isVerified ? "Verified P19" : "Predicted P19"}</b> {p19Text}</span>
        <span><b>{isVerified ? "Verified P20" : "Predicted P20"}</b> {p20Text}</span>
      </div>
      {isRecalculating && <p className="mt-1 text-[10px] text-[#625143]">Recalculating bass response…</p>}
      {isVerified && !isRecalculating && <p className="mt-1 text-[10px] text-[#8A7B6A]">Verified result from the canonical bass engine.</p>}
    </div>
  );
}

function Unavailable({ title, message = "No recognised layout matches the current quantity." }) {
  return <div className="rounded-lg border border-dashed border-[#C9C2B8] bg-white/50 p-4"><div className="text-[10px] font-semibold uppercase tracking-wide text-[#625143]">{title}</div><p className="mt-1 text-xs text-[#8A7B6A]">{message}</p></div>;
}