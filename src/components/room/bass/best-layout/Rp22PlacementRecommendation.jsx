import React, { useState, useMemo, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import Rp22RecommendationCard from "@/components/room/bass/best-layout/Rp22RecommendationCard";
import Rp22LayoutPlanDialog from "@/components/room/bass/best-layout/Rp22LayoutPlanDialog";
import { coordinatesMatch, validateRecommendationLayout, buildAppliedInstances, hasUnsupportedPlacement } from "@/components/room/bass/best-layout/applyRecommendationUtils";

const levelText = (level) => Number.isFinite(level) ? (level > 0 ? `L${level}` : "FAIL") : "—";

/**
 * Trace subwoofer objects before/after Apply to prove tuning preservation.
 * Logs every field the user asked us to verify.
 */
function traceSubs(label, subs) {
  const list = Array.isArray(subs) ? subs : [];
  console.group(`[Apply Trace] ${label} (${list.length} subs)`);
  list.forEach((sub, i) => {
    console.log(`Sub ${i + 1}:`, {
      id: sub?.id,
      model: sub?.model,
      group: sub?.group,
      x: sub?.position?.x,
      y: sub?.position?.y,
      z: sub?.position?.z,
      rotation_deg: sub?.rotation_deg,
      gainDb: sub?.gainDb,
      delay: sub?.delay,
      delayMs: sub?.delayMs,
      phaseAdjust: sub?.phaseAdjust,
      polarity: sub?.polarity,
      enabled: sub?.enabled,
      tuning: sub?.tuning,
    });
  });
  console.groupEnd();
}

export default function Rp22PlacementRecommendation({ roomDims, currentLayout, best1, best2, best4, frontSubsCfg, rearSubsCfg, setFrontSubsCfg, setRearSubsCfg, isRecalculating, currentSubs, subwooferInstances, commitInstances, hasCanonicalInstances }) {
  const [selected, setSelected] = useState(null);
  // previous stores the COMPLETE prior canonical instance array for undo,
  // not only CFG. Restore with one canonical-first commit. Preserve disabled
  // history, order, IDs, mixed models and calibration.
  const [previous, setPrevious] = useState(null);
  const [applyError, setApplyError] = useState(null);
  const [applying, setApplying] = useState(false);
  const applyCountRef = useRef(0);

  // Trace subwoofer objects after Apply (useSubwooferSync runs async in useEffect).
  useEffect(() => {
    if (applyCountRef.current > 0) {
      traceSubs(`AFTER Apply #${applyCountRef.current}`, currentSubs);
    }
  }, [currentSubs]);

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
    // Status must be VALID; otherwise application is blocked.
    if (!hasCanonicalInstances) {
      setApplyError("Subwoofer instances are not valid. Cannot apply recommendation.");
      return;
    }
    // Validate before changing any state.
    const validation = validateRecommendationLayout(layout, roomDims);
    if (!validation.valid) {
      setApplyError(validation.reason);
      return;
    }
    // Trace before Apply.
    traceSubs("BEFORE Apply", currentSubs);
    applyCountRef.current += 1;
    setApplying(true);
    // Save the COMPLETE prior canonical instance array for undo (not only CFG).
    setPrevious({ instances: Array.isArray(subwooferInstances) ? subwooferInstances.map((i) => ({ ...i })) : [] });
    // Build the next canonical instance array from the recommendation layout.
    const nextInstances = buildAppliedInstances(layout, subwooferInstances, frontSubsCfg, rearSubsCfg);
    // One canonical-first commit: instances once, then both CFG mirrors derive
    // afterward. No direct CFG-first setters.
    commitInstances(nextInstances, {
      front: { placementMode: "manual", isManual: true },
      rear: { placementMode: "manual", isManual: true },
    });
    // Close dialog if open.
    setSelected(null);
    // Clear applying state after the state updates are committed.
    setTimeout(() => setApplying(false), 600);
  };

  const undo = () => {
    if (!previous) return;
    traceSubs("BEFORE Undo", currentSubs);
    applyCountRef.current += 1;
    // Restore the complete prior canonical instance array with one canonical-first
    // commit. Preserve disabled history, order, IDs, mixed models and calibration.
    commitInstances(previous.instances);
    setPrevious(null);
    setApplyError(null);
  };

  const openDialog = (layout) => { setApplyError(null); setSelected(layout); };

  const renderOption = (title, applyLabel, layout) => {
    if (!layout) return <Unavailable title={title} message="No recognised layout of this quantity is available for the current room." />;
    return (
      <Rp22RecommendationCard
        title={title}
        applyLabel={applyLabel}
        layout={layout}
        onClick={openDialog}
        onApply={apply}
        isApplied={isLayoutApplied(layout)}
        isRecalculating={isLayoutApplied(layout) && isRecalculating}
        applying={applying}
        applyError={isLayoutApplied(layout) ? null : applyError}
        unsupported={hasUnsupportedPlacement(layout)}
        currentMetrics={currentLayout?.metrics}
      />
    );
  };

  return (
    <div className="mt-4 space-y-3 rounded-lg border-2 border-[#213428] bg-[#F3F1EC] p-4">
      <div>
        <h5 className="text-[14px] font-semibold text-[#1B1A1A]">Subwoofer Placement Guide</h5>
        <p className="mt-1 text-[11px] text-[#625143]">Based on RP22 positional-optimisation guidance and recognised multi-subwoofer placement research.</p>
      </div>
      {currentLayout && <CurrentLayout layout={currentLayout} isRecalculating={isRecalculating} />}
      {renderOption("Best 1-sub layout", "Apply 1-sub layout", best1)}
      {renderOption("Best 2-sub layout", "Apply 2-sub layout", best2)}
      {renderOption("Best 4-sub layout", "Apply 4-sub layout", best4)}
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
        unsupported={selected ? hasUnsupportedPlacement(selected) : false}
      />
    </div>
  );
}

function CurrentLayout({ layout, isRecalculating }) {
  const metrics = layout.metrics;
  const authority = metrics?.responseAuthority;
  const hasCanonical = authority === "final-post-eq";
  const p19Value = isRecalculating ? "…" : hasCanonical ? levelText(metrics.p19Level) : "—";
  const p20Value = isRecalculating ? "…" : hasCanonical ? levelText(metrics.p20Level) : "—";
  return (
    <div className="rounded-lg border border-[#D9D5CE] bg-white/70 p-4">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#625143]">Current subwoofer layout</div>
      <div className="mt-1">
        <div className="text-sm font-semibold text-[#1B1A1A]">Current positions</div>
        <div className="text-[11px] text-[#625143]">{metrics.sourceCount} {metrics.sourceCount === 1 ? "subwoofer" : "subwoofers"}</div>
      </div>
      <div className="mt-3 flex gap-5 text-xs">
        <span><b>P19</b> {p19Value}</span>
        <span><b>P20</b> {p20Value}</span>
      </div>
      {isRecalculating && <p className="mt-1 text-[10px] text-[#625143]">Recalculating bass response…</p>}
    </div>
  );
}

function Unavailable({ title, message = "No recognised layout matches the current quantity." }) {
  return <div className="rounded-lg border border-dashed border-[#C9C2B8] bg-white/50 p-4"><div className="text-[10px] font-semibold uppercase tracking-wide text-[#625143]">{title}</div><p className="mt-1 text-xs text-[#8A7B6A]">{message}</p></div>;
}