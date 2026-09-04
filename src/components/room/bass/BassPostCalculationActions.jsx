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
import RP22GradingPill from "@/components/ui/RP22GradingPill";
import BassRp22ParameterTooltip from "@/components/room/bass/BassRp22ParameterTooltip";
import {
  buildAppliedInstances,
  coordinatesMatch,
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

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function numericResultLevel(value) {
  const parsed = finiteNumber(value);
  if (parsed !== null) return Math.max(0, Math.min(4, parsed));
  const match = String(value || "").match(/^L([1-4])$/i);
  return match ? Number(match[1]) : null;
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

function comparisonValues(layout) {
  const metrics = layout?.metrics || {};
  return {
    p14Level: numericResultLevel(metrics.p14AchievedLevel),
    p14Db: finiteNumber(metrics.p14AchievedDb),
    p18Level: numericResultLevel(metrics.p18AchievedLevel),
    p18Hz: finiteNumber(metrics.achievedP18Hz),
    p19Level: floorLevel(metrics.perSeatP19),
    p20Level: floorLevel(metrics.perSeatP20),
    p20VariationDb: worstVariation(metrics.perSeatP20),
    quantity: finiteNumber(metrics.sourceCount) || layout?.sources?.length || 0,
  };
}

function resultCell(level, value, unit) {
  const valueText = Number.isFinite(value) ? `${value.toFixed(unit === "dBC" ? 1 : 0)} ${unit}` : null;
  return [levelText(level), valueText].filter(Boolean).join(" · ") || "—";
}

function comparisonNarrative(currentLayout, twoSubLayout, fourSubLayout) {
  const current = comparisonValues(currentLayout);
  const two = comparisonValues(twoSubLayout);
  const four = comparisonValues(fourSubLayout);
  const requestedLevel = numericResultLevel(currentLayout?.canonicalResult?.p14TargetLevel);
  const placementStrong = Math.min(current.p19Level ?? 0, current.p20Level ?? 0) >= 3;
  if (placementStrong && requestedLevel !== null && (current.p14Level ?? 0) < requestedLevel) {
    return "Placement performance is already strong; improve subwoofer capability or size before adding boxes solely for placement.";
  }
  if (Number.isFinite(two.p20VariationDb) && Number.isFinite(four.p20VariationDb)
    && Math.abs(two.p20VariationDb - four.p20VariationDb) < 0.5
    && two.p19Level === four.p19Level && two.p20Level === four.p20Level) {
    return "Four subs provide only marginal useful improvement over the recommended two-sub design in this room.";
  }
  if (Math.min(four.p19Level ?? 0, four.p20Level ?? 0) > Math.min(two.p19Level ?? 0, two.p20Level ?? 0)) {
    return "Four subs materially improve the weakest placement result and are justified for this seating area.";
  }
  if (current.quantity === 1
    && Math.min(two.p19Level ?? 0, two.p20Level ?? 0) > Math.min(current.p19Level ?? 0, current.p20Level ?? 0)) {
    return "A second sub improves the weakest seat-coverage result; quantity and placement are the useful upgrade.";
  }
  return "The table shows the real engineering trade-off; more subwoofers are not recommended unless the authoritative result improves materially.";
}

function ComparisonPill({ parameterKey, level, resultText }) {
  const pillLevel = level == null ? -1 : level;
  return (
    <span className="flex flex-col gap-1" aria-label={resultText}>
      <BassRp22ParameterTooltip parameterKey={parameterKey}>
        <span className="cursor-help text-center text-[11px] font-semibold text-[#213428] underline decoration-dotted underline-offset-2">
          {parameterKey.toUpperCase()}
        </span>
      </BassRp22ParameterTooltip>
      <RP22GradingPill level={pillLevel} compact style={{ width: "100%" }}>{resultText}</RP22GradingPill>
    </span>
  );
}

function buildComparisonPills(values) {
  const p14ResultText = values.p14Level != null
    ? [levelText(values.p14Level), values.p14Db != null ? `${values.p14Db.toFixed(1)} dBC` : null].filter(Boolean).join(" · ")
    : "—";
  const p18ResultText = values.p18Level != null
    ? [levelText(values.p18Level), values.p18Hz != null ? `${values.p18Hz.toFixed(0)} Hz` : null].filter(Boolean).join(" · ")
    : "—";
  const p19ResultText = values.p19Level != null ? levelText(values.p19Level) : "—";
  const p20ResultText = values.p20Level != null
    ? [levelText(values.p20Level), values.p20VariationDb != null ? `${values.p20VariationDb.toFixed(0)} dB` : null].filter(Boolean).join(" · ")
    : "—";
  return [
    { key: "p14", level: values.p14Level, resultText: p14ResultText },
    { key: "p18", level: values.p18Level, resultText: p18ResultText },
    { key: "p19", level: values.p19Level, resultText: p19ResultText },
    { key: "p20", level: values.p20Level, resultText: p20ResultText },
  ];
}

function ComparisonCards({ currentLayout, twoSubLayout, fourSubLayout, onInspect }) {
  const columns = [
    { key: "current", title: "Current", layout: currentLayout },
    { key: "two", title: "Recommended 2 Subs", layout: twoSubLayout },
    { key: "four", title: "Recommended 4 Subs", layout: fourSubLayout },
  ];
  return (
    <div className="mt-3 rounded-md border border-[#E7E4DF] bg-[#F8F7F4] p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#625143]">Authoritative bass option comparison</div>
      <div className="mt-2 grid gap-3 md:grid-cols-3">
        {columns.map((column) => {
          const values = column.layout ? comparisonValues(column.layout) : null;
          const pills = values ? buildComparisonPills(values) : [];
          return (
            <div key={column.key} className="rounded-lg border border-[#D9D5CE] bg-white p-3">
              <div className="text-[12px] font-semibold text-[#1B1A1A]">{column.title}</div>
              {pills.length > 0 ? (
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  {pills.map((pill) => (
                    <ComparisonPill key={pill.key} parameterKey={pill.key} level={pill.level} resultText={pill.resultText} />
                  ))}
                </div>
              ) : (
                <div className="mt-2 text-[11px] text-[#8A7B6A]">No layout available.</div>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] font-medium leading-relaxed text-[#213428]">
        {comparisonNarrative(currentLayout, twoSubLayout, fourSubLayout)}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {twoSubLayout && <Button type="button" size="sm" variant="outline" onClick={() => onInspect(twoSubLayout)}>View 2-sub positions</Button>}
        {fourSubLayout && <Button type="button" size="sm" variant="outline" onClick={() => onInspect(fourSubLayout)}>View 4-sub positions</Button>}
      </div>
      <p className="mt-2 text-[10px] text-[#8A7B6A]">Compared alternatives use the selected model, selected P14 target and the full canonical P14/P18/P19/P20 evaluation.</p>
    </div>
  );
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
  const recommended2 = useMemo(() => buildStage2RecommendationLayout({
    quantityResult: stage2.two_sub_result,
    roomDims: canonical.roomDims,
    seatingPositions: canonical.seatingPositions,
    sourceHeightM,
    currentLayout,
    currentContract: shared.contract,
  }), [
    stage2.two_sub_result,
    canonical.roomDims,
    canonical.seatingPositions,
    sourceHeightM,
    currentLayout,
    shared.contract,
  ]);
  const recommended4 = useMemo(() => buildStage2RecommendationLayout({
    quantityResult: stage2.four_sub_result,
    roomDims: canonical.roomDims,
    seatingPositions: canonical.seatingPositions,
    sourceHeightM,
    currentLayout,
    currentContract: shared.contract,
  }), [
    stage2.four_sub_result,
    canonical.roomDims,
    canonical.seatingPositions,
    sourceHeightM,
    currentLayout,
    shared.contract,
  ]);
  const currentSources = currentLayout?.sources || [];
  const requestRunning = ["requested", "running"].includes(action?.status);
  const optimiseRunning = action?.action === "optimise" && requestRunning;
  const compareRunning = action?.action === "compare" && requestRunning;
  const resultReady = action?.action === "optimise"
    && action.status === "complete"
    && stage2.status === "complete";
  const comparisonReady = action?.action === "compare"
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

  const startComparison = () => {
    if (!shared.hasCurrentResult || !shared.cacheKey) return;
    requestBassHeavyAction(projectId, "compare", shared.cacheKey);
  };

  const apply = (layout, modelOverride = null) => {
    setApplyError(null);
    const validation = validateRecommendationLayout(layout, canonical.roomDims);
    if (!validation.valid) {
      setApplyError("Could not apply this layout. Please check the room dimensions.");
      return;
    }
    if (!hasCanonicalInstances || typeof commitInstances !== "function") {
      setApplyError("Subwoofer instances are not ready.");
      return;
    }
    const next = buildAppliedInstances(layout, subwooferInstances, frontSubsCfg, rearSubsCfg, modelOverride);
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
      <div className="text-[13px] font-semibold text-[#1B1A1A]">Improve Bass Response</div>
      <p className="mt-1 text-[11px] leading-relaxed text-[#625143]">Find practical subwoofer positions that improve response smoothness and seat consistency.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Button
          type="button"
          className="bg-[#213428] text-white hover:bg-[#3E4349]"
          onClick={startOptimisation}
          disabled={requestRunning}
        >
          {optimiseRunning ? "Finding Better Positions…" : "Find Better Positions"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={startComparison}
          disabled={requestRunning}
        >
          {compareRunning ? "Comparing Bass Options…" : "Compare Bass Options"}
        </Button>
      </div>
      {action?.action === "optimise" && action.status === "error" && (
        <p className="mt-2 text-[11px] text-red-700">{action.error}</p>
      )}
      {action?.action === "optimise" && action.status === "cancelled" && (
        <p className="mt-2 text-[11px] text-amber-700">Optimisation cancelled because the design changed.</p>
      )}
      {action?.action === "compare" && action.status === "error" && (
        <p className="mt-2 text-[11px] text-red-700">{action.error}</p>
      )}
      {action?.action === "compare" && action.status === "cancelled" && (
        <p className="mt-2 text-[11px] text-amber-700">Comparison cancelled because the design changed.</p>
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
              disabled={!applicationValid.valid || applied}
            >
              {applied ? "Applied" : "Apply Layout"}
            </Button>
          </div>
        </div>
      )}
      {resultReady && !recommendation && (
        <p className="mt-2 text-[11px] text-[#625143]">No credible same-quantity improvement was found.</p>
      )}
      {comparisonReady && (
        <ComparisonCards
          currentLayout={currentLayout}
          twoSubLayout={recommended2}
          fourSubLayout={recommended4}
          onInspect={setSelected}
        />
      )}
      <Rp22LayoutPlanDialog
        open={Boolean(selected)}
        onOpenChange={(open) => { if (!open) { setSelected(null); setApplyError(null); } }}
        layout={selected}
        roomDims={canonical.roomDims}
        subModel={frontSubsCfg?.model || rearSubsCfg?.model || null}
        onApply={apply}
        isApplied={selected ? coordinatesMatch(currentSources, selected.sources) : false}
        applying={false}
      />
    </div>
  );
}