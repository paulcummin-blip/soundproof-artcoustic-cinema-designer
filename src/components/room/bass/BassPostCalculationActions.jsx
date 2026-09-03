import React, { useMemo, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { useActiveProjectId } from "@/components/state/project-session";
import { useSharedBassResults } from "@/components/room/bass/bassResultsStore";
import {
  requestBassHeavyAction,
  useBassHeavyAction,
} from "@/components/room/bass/bassHeavyActionStore";
import {
  getStage2State,
  subscribeStage2,
} from "@/components/room/bass/stage2/stage2PlacementStore";
import {
  buildCurrentCanonicalLayout,
  buildStage2RecommendationLayout,
} from "@/components/room/bass/best-layout/stage2RecommendationAdapter";
import { canonicalizeNormalizedRoomInputs } from "@/components/room/bass/normalizedRoomInputAdapters";
import Rp22LayoutPlanDialog from "@/components/room/bass/best-layout/Rp22LayoutPlanDialog";
import {
  buildAppliedInstances,
  coordinatesMatch,
  hasUnsupportedPlacement,
  validateRecommendationLayout,
} from "@/components/room/bass/best-layout/applyRecommendationUtils";

function floorLevel(rows) {
  const levels = (Array.isArray(rows) ? rows : [])
    .map((row) => Number(row?.level))
    .filter(Number.isFinite);
  return levels.length ? Math.min(...levels) : null;
}

function worstVariation(rows) {
  const values = (Array.isArray(rows) ? rows : [])
    .map((row) => Math.abs(Number(row?.variationDbRaw)))
    .filter(Number.isFinite);
  return values.length ? Math.max(...values) : null;
}

function levelText(value) {
  if (!Number.isFinite(value)) return "—";
  return value > 0 ? `L${value}` : "FAIL";
}

function focusText(contract) {
  const key = String(contract?.designRecommendation?.parameterKey || "").toLowerCase();
  if (key === "p19" || key === "p20") {
    return "Placement and/or subwoofer quantity is the present constraint, so the search prioritises seat consistency and null reduction.";
  }
  if (key === "p14" || key === "p18") {
    return "Capability or extension is the present constraint. The search will verify placement, but a larger subwoofer may be the more useful improvement.";
  }
  return "The search checks practical placement improvements while retaining the current product and selected bass target.";
}

function improvementText(currentLayout, recommendation) {
  if (!currentLayout?.metrics || !recommendation?.metrics) return null;
  const currentP19 = floorLevel(currentLayout.metrics.perSeatP19);
  const currentP20 = floorLevel(currentLayout.metrics.perSeatP20);
  const nextP19 = floorLevel(recommendation.metrics.perSeatP19);
  const nextP20 = floorLevel(recommendation.metrics.perSeatP20);
  const currentWorst = worstVariation(currentLayout.metrics.perSeatP20);
  const nextWorst = worstVariation(recommendation.metrics.perSeatP20);
  const levelGain = Math.min(nextP19 ?? 0, nextP20 ?? 0) - Math.min(currentP19 ?? 0, currentP20 ?? 0);
  const variationGain = Number.isFinite(currentWorst) && Number.isFinite(nextWorst)
    ? currentWorst - nextWorst
    : 0;
  if (levelGain <= 0 && variationGain < 0.5) {
    return "The current placement is already effectively as useful as the best searched layout for this quantity.";
  }
  const parts = [];
  if (levelGain > 0) parts.push(`raises the weakest placement grade by ${levelGain} level${levelGain === 1 ? "" : "s"}`);
  if (variationGain >= 0.5) parts.push(`reduces worst-seat variation by about ${variationGain.toFixed(1)} dB`);
  return `The searched layout ${parts.join(" and ")}.`;
}

export default function BassPostCalculationActions({
  roomDims,
  seatingPositions,
  currentSubs,
  sourceHeightM,
  frontSubsCfg,
  rearSubsCfg,
  subwooferInstances,
  commitInstances,
  hasCanonicalInstances,
}) {
  const projectId = useActiveProjectId();
  const shared = useSharedBassResults();
  const action = useBassHeavyAction(projectId);
  const stage2 = useSyncExternalStore(
    subscribeStage2,
    () => getStage2State(projectId),
    () => getStage2State(projectId),
  );
  const [selected, setSelected] = useState(null);
  const [applyError, setApplyError] = useState(null);
  const canonical = useMemo(
    () => canonicalizeNormalizedRoomInputs({ roomDims, seatingPositions }),
    [roomDims, seatingPositions],
  );
  const currentLayout = useMemo(() => buildCurrentCanonicalLayout({
    currentSubs,
    roomDims: canonical.roomDims,
    seatingPositions: canonical.seatingPositions,
    contract: shared.contract,
    authoritative: shared.hasCurrentResult === true,
  }), [
    currentSubs,
    canonical.roomDims,
    canonical.seatingPositions,
    shared.contract,
    shared.hasCurrentResult,
  ]);
  const currentQuantity = currentLayout?.sources?.length;
  const quantityResult = currentQuantity === 1
    ? stage2.one_sub_result
    : currentQuantity === 2
      ? stage2.two_sub_result
      : currentQuantity === 4
        ? stage2.four_sub_result
        : null;
  const recommendation = useMemo(() => buildStage2RecommendationLayout({
    quantityResult,
    roomDims: canonical.roomDims,
    seatingPositions: canonical.seatingPositions,
    sourceHeightM,
    currentLayout,
    currentContract: shared.contract,
  }), [
    quantityResult,
    canonical.roomDims,
    canonical.seatingPositions,
    sourceHeightM,
    currentLayout,
    shared.contract,
  ]);
  const currentSources = currentLayout?.sources || [];
  const requestRunning = action?.action === "optimise"
    && ["requested", "running"].includes(action.status);
  const resultReady = action?.action === "optimise"
    && action.status === "complete"
    && stage2.status === "complete";
  const applicationValid = recommendation
    ? validateRecommendationLayout(recommendation, canonical.roomDims)
    : { valid: false };
  const applied = recommendation
    ? coordinatesMatch(currentSources, recommendation.sources)
    : false;

  const startOptimisation = () => {
    if (!shared.hasCurrentResult || !shared.cacheKey) return;
    requestBassHeavyAction(projectId, "optimise", shared.cacheKey);
  };

  const apply = (layout) => {
    setApplyError(null);
    const validation = validateRecommendationLayout(layout, canonical.roomDims);
    if (!validation.valid) {
      setApplyError("Use these wall-relative coordinates as guidance, then recalculate the placed design.");
      return;
    }
    if (!hasCanonicalInstances || typeof commitInstances !== "function") {
      setApplyError("Subwoofer instances are not ready.");
      return;
    }
    const next = buildAppliedInstances(layout, subwooferInstances, frontSubsCfg, rearSubsCfg);
    commitInstances(next, {
      front: { placementMode: "manual", isManual: true },
      rear: { placementMode: "manual", isManual: true },
    });
    setSelected(null);
  };

  if (!shared.hasCurrentResult) return null;

  const p19 = floorLevel(recommendation?.metrics?.perSeatP19);
  const p20 = floorLevel(recommendation?.metrics?.perSeatP20);

  return (
    <div className="mt-3 rounded-lg border border-[#D9D5CE] bg-white px-4 py-4">
      <div className="text-[13px] font-semibold text-[#1B1A1A]">Improve this design</div>
      <p className="mt-1 text-[11px] leading-relaxed text-[#625143]">{focusText(shared.contract)}</p>
      <Button
        type="button"
        className="mt-3 w-full bg-[#213428] text-white hover:bg-[#3E4349]"
        onClick={startOptimisation}
        disabled={requestRunning}
      >
        {requestRunning ? "Optimising Bass Layout…" : "Optimise Bass Layout"}
      </Button>
      {action?.action === "optimise" && action.status === "error" && (
        <p className="mt-2 text-[11px] text-red-700">{action.error}</p>
      )}
      {action?.action === "optimise" && action.status === "cancelled" && (
        <p className="mt-2 text-[11px] text-amber-700">Optimisation cancelled because the design changed.</p>
      )}
      {resultReady && recommendation && (
        <div className="mt-3 rounded-md border border-[#E7E4DF] bg-[#F8F7F4] p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[#625143]">Recommended placement</div>
              <div className="mt-1 text-[12px] font-semibold text-[#213428]">{recommendation.name}</div>
            </div>
            {recommendation.recommendationKind === "side-wall-alternative" && (
              <span className="rounded-full bg-amber-50 px-2 py-1 text-[9px] font-semibold text-amber-800">Less practical alternative</span>
            )}
          </div>
          <div className="mt-2 flex gap-4 text-[11px] text-[#625143]">
            <span>P19 floor <strong className="text-[#1B1A1A]">{levelText(p19)}</strong></span>
            <span>P20 floor <strong className="text-[#1B1A1A]">{levelText(p20)}</strong></span>
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-[#625143]">{improvementText(currentLayout, recommendation)}</p>
          <p className="mt-1 text-[10px] leading-relaxed text-[#8A7B6A]">{recommendation.practicalReason}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setSelected(recommendation)}>View positions</Button>
            <Button
              type="button"
              size="sm"
              className="bg-[#213428] text-white hover:bg-[#3E4349]"
              onClick={() => apply(recommendation)}
              disabled={!applicationValid.valid || hasUnsupportedPlacement(recommendation) || applied}
            >
              {applied ? "Applied" : applicationValid.valid ? "Apply Layout" : "Positioning guide"}
            </Button>
          </div>
          {!applicationValid.valid && (
            <p className="mt-2 text-[10px] text-[#8A7B6A]">The optimiser reports acoustic wall coordinates. Use View positions as placement guidance, then calculate the exact installed design.</p>
          )}
        </div>
      )}
      {resultReady && !recommendation && (
        <p className="mt-2 text-[11px] text-[#625143]">No credible same-quantity improvement was found.</p>
      )}
      <Rp22LayoutPlanDialog
        open={Boolean(selected)}
        onOpenChange={(open) => { if (!open) { setSelected(null); setApplyError(null); } }}
        layout={selected}
        roomDims={canonical.roomDims}
        subModel={frontSubsCfg?.model || rearSubsCfg?.model || null}
        onApply={apply}
        isApplied={selected ? coordinatesMatch(currentSources, selected.sources) : false}
        applyError={applyError}
        applying={false}
        unsupported={selected ? hasUnsupportedPlacement(selected) || !validateRecommendationLayout(selected, canonical.roomDims).valid : false}
      />
    </div>
  );
}
