import React, { useState, useMemo, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import RP22GradingPill from "@/components/ui/RP22GradingPill";
import Rp22RecommendationCard from "@/components/room/bass/best-layout/Rp22RecommendationCard";
import Rp22LayoutPlanDialog from "@/components/room/bass/best-layout/Rp22LayoutPlanDialog";
import { coordinatesMatch, validateRecommendationLayout, buildAppliedInstances } from "@/components/room/bass/best-layout/applyRecommendationUtils";

function LevelPill({ level }) {
  const n = Number(level);
  const pillLevel = Number.isFinite(n) && n > 0 ? n : "FAIL";
  return <RP22GradingPill level={pillLevel} compact />;
}

function coverageData(results) {
  const seats = Array.isArray(results) ? results : [];
  const primary = seats.filter((seat) => seat.isPrimary !== false);
  const secondary = seats.filter((seat) => seat.isPrimary === false);
  const primaryFloor = primary.length ? Math.min(...primary.map((seat) => Number(seat.level) || 0)) : 0;
  const secondaryFloor = secondary.length ? Math.min(...secondary.map((seat) => Number(seat.level) || 0)) : 0;
  const secondaryHasFail = secondary.some((seat) => (Number(seat.level) || 0) <= 0);
  return {
    hasSeats: seats.length > 0,
    hasPrimary: primary.length > 0,
    hasSecondary: secondary.length > 0,
    primaryLevel: primaryFloor,
    secondaryLevel: secondaryFloor,
    secondaryHasFail,
  };
}

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

export default function Rp22PlacementRecommendation({ roomDims, currentLayout, best1, best2, best4, fourSubFamilyComparison, frontSubsCfg, rearSubsCfg, setFrontSubsCfg, setRearSubsCfg, isRecalculating, recommendationStatus = "updating", recommendationPhase = "Preparing placement analysis…", currentSubs, subwooferInstances, commitInstances, hasCanonicalInstances }) {
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
    if (!layout && recommendationStatus !== "ready") return <UpdatingOption title={title} phase={recommendationPhase} />;
    if (!layout) return <Unavailable title={title} message="No recognised canonical layout of this quantity is available for the current room." />;
    // Gate on confirmed canonical seat authority — a layout must not be
    // presented as "BEST" without completed P19/P20 seat-scoped authority.
    if (!layout.metrics?.hasConfirmedSeatAuthority) {
      if (recommendationStatus !== "ready") return <UpdatingOption title={title} phase="Calculating canonical seat authority…" />;
      return <Unavailable title={title} message="No confirmed result available — canonical seat authority has not completed." />;
    }
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
      />
    );
  };

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-[#D9D5CE] bg-[#F3F1EC] p-4">
      {currentLayout && <CurrentLayout layout={currentLayout} isRecalculating={isRecalculating} />}
      {renderOption("Best 1-sub layout", "Apply 1-sub layout", best1)}
      {renderOption("Best 2-sub layout", "Apply 2-sub layout", best2)}
      {renderOption("Best 4-sub layout", "Apply 4-sub layout", best4)}
      {fourSubFamilyComparison && <FourSubFamilyComparisonNote comparison={fourSubFamilyComparison} />}
      {previous && <Button type="button" size="sm" variant="outline" onClick={undo}>Undo recommended positions</Button>}
      <Rp22LayoutPlanDialog
        open={Boolean(selected)}
        onOpenChange={(open) => { if (!open) { setSelected(null); setApplyError(null); } }}
        layout={selected}
        roomDims={roomDims}
        subModel={frontSubsCfg?.model || rearSubsCfg?.model || null}
        onApply={apply}
        isApplied={selected ? isLayoutApplied(selected) : false}
        applyError={applyError}
        applying={applying}
      />
    </div>
  );
}

function CurrentCoverageRow({ results }) {
  const data = coverageData(results);
  if (!data.hasSeats) return <span className="text-[11px] text-[#8A7B6A]">No seat authority</span>;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
      <div className="flex items-center gap-1.5">
        <span className="text-[#625143]">Primary Seats</span>
        {data.hasPrimary ? <LevelPill level={data.primaryLevel} /> : <span className="text-[#8A7B6A]">No Primary seats</span>}
      </div>
      <div className="flex items-center gap-1.5">
        {data.hasSecondary ? (
          data.secondaryHasFail ? (
            <>
              <span className="text-[#625143]">Secondary Seats</span>
              <LevelPill level={0} />
            </>
          ) : (
            <>
              <span className="text-[#625143]">Secondary Seats — no lower than</span>
              <LevelPill level={data.secondaryLevel} />
            </>
          )
        ) : (
          <span className="text-[#8A7B6A]">No Secondary seats</span>
        )}
      </div>
    </div>
  );
}

function CurrentLayout({ layout }) {
  const metrics = layout.metrics;
  return (
    <div className="rounded-lg border border-[#D9D5CE] bg-white/70 p-4">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#625143]">Current subwoofer layout</div>
      <div className="mt-1 text-sm font-semibold text-[#1B1A1A]">Current positions</div>
      <div className="text-[11px] text-[#625143]">{metrics.sourceCount} {metrics.sourceCount === 1 ? "subwoofer" : "subwoofers"} · canonical authority</div>
      <div className="mt-3 grid gap-2">
        <div>
          <div className="text-[10px] font-medium text-[#625143]">P19 · Canonical seat coverage</div>
          <div className="mt-0.5"><CurrentCoverageRow results={metrics.perSeatP19} /></div>
        </div>
        <div>
          <div className="text-[10px] font-medium text-[#625143]">P20 · Canonical seat coverage</div>
          <div className="mt-0.5"><CurrentCoverageRow results={metrics.perSeatP20} /></div>
        </div>
      </div>
    </div>
  );
}

function UpdatingOption({ title, phase }) {
  return (
    <div className="rounded-lg border border-dashed border-[#C9C2B8] bg-white/60 p-4">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#625143]">{title}</div>
      <div className="mt-2 flex items-center gap-2 text-xs font-medium text-[#625143]"><span className="h-3 w-3 animate-spin rounded-full border-2 border-[#C9C2B8] border-t-[#213428]" />Updating…</div>
      <p className="mt-1 text-[10px] text-[#8A7B6A]">{phase}</p>
    </div>
  );
}

function Unavailable({ title, message = "No recognised layout matches the current quantity." }) {
  return <div className="rounded-lg border border-dashed border-[#C9C2B8] bg-white/50 p-4"><div className="text-[10px] font-semibold uppercase tracking-wide text-[#625143]">{title}</div><p className="mt-1 text-xs text-[#8A7B6A]">{message}</p></div>;
}

function FourSubFamilyComparisonNote({ comparison }) {
  if (!comparison) return null;
  const { quarter, third, winnerLabel, nearEquivalent, explanation } = comparison;
  return (
    <div className="rounded-md border border-[#213428]/20 bg-white/70 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#625143]">25/75 vs 33/67 · four-sub comparison</div>
      <p className="mt-1 text-[11px] leading-relaxed text-[#1B1A1A]">{explanation}</p>
      <div className="mt-1.5 grid grid-cols-2 gap-2 text-[10px] text-[#625143]">
        <span>25/75 worst primary-seat P20: {Number(quarter.worstPrimaryP20Db).toFixed(0)} dB</span>
        <span>33/67 worst primary-seat P20: {Number(third.worstPrimaryP20Db).toFixed(0)} dB</span>
      </div>
      {winnerLabel && (
        <div className="mt-1 text-[10px] font-medium text-[#213428]">
          {nearEquivalent ? "Near-equivalent · " : ""}Canonical winner: {winnerLabel}
        </div>
      )}
    </div>
  );
}