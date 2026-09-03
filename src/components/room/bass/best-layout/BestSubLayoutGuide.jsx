import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import Rp22LayoutPlanDialog from "@/components/room/bass/best-layout/Rp22LayoutPlanDialog";
import {
  buildAppliedInstances,
  coordinatesMatch,
  hasUnsupportedPlacement,
  validateRecommendationLayout,
} from "@/components/room/bass/best-layout/applyRecommendationUtils";
import { useFastBassPlacementAdvisor } from "@/components/room/bass/best-layout/useFastBassPlacementAdvisor";
import { useBestSubLayoutLiveInputs } from "@/components/room/bass/best-layout/bestSubLayoutLiveInputs";
import { selectBestSubLayoutPhysics } from "@/components/room/bass/best-layout/bestSubLayoutPhysicsSnapshot";

const OPTION_COPY = {
  1: { title: "1 Sub", strapline: "Recommended starting layout" },
  2: { title: "2 Subs", strapline: "Better expected consistency" },
  4: { title: "4 Subs", strapline: "Best expected consistency" },
};

function currentSourcesFrom(subs) {
  return (Array.isArray(subs) ? subs : []).map((sub) => {
    const position = sub?.position || sub;
    const placement = sub?.group === "rear"
      ? "rear"
      : sub?.group === "left"
        ? "left"
        : sub?.group === "right"
          ? "right"
          : "front";
    return {
      x: Number(position?.x),
      y: Number(position?.y),
      z: Number(position?.z),
      placement,
    };
  }).filter((source) => Number.isFinite(source.x) && Number.isFinite(source.y));
}

function LayoutThumbnail({ layout, roomDims }) {
  const width = Number(roomDims?.widthM) || 1;
  const length = Number(roomDims?.lengthM) || 1;
  const pad = Math.max(width, length) * 0.08;
  const radius = Math.max(0.1, Math.min(width, length) * 0.055);
  return (
    <svg
      viewBox={`${-pad} ${-pad} ${width + pad * 2} ${length + pad * 2}`}
      className="h-28 w-full rounded-md border border-[#D9D5CE] bg-[#F8F7F4]"
      role="img"
      aria-label={`Plan showing ${layout?.sources?.length || 0} suggested subwoofer positions`}
    >
      <text x={width / 2} y={-pad * 0.25} textAnchor="middle" fontSize={Math.max(0.12, pad * 0.45)} fill="#8A7B6A">FRONT</text>
      <rect x="0" y="0" width={width} height={length} fill="white" stroke="#8A7B6A" strokeWidth={Math.max(0.02, radius * 0.12)} />
      {(layout?.sources || []).map((source, index) => (
        <g key={source.id || index}>
          <circle cx={source.x} cy={source.y} r={radius} fill="#213428" />
          <text x={source.x} y={source.y + radius * 0.34} textAnchor="middle" fontSize={radius} fontWeight="700" fill="white">{index + 1}</text>
        </g>
      ))}
    </svg>
  );
}

function AdvisorCard({ quantity, layout, roomDims, isApplied, onApply, onInspect, disabled }) {
  const copy = OPTION_COPY[quantity];
  if (!layout) {
    return (
      <div className="rounded-lg border border-dashed border-[#C9C2B8] bg-white/60 p-3">
        <div className="text-[13px] font-semibold text-[#1B1A1A]">{copy.title}</div>
        <div className="mt-1 text-[11px] text-[#8A7B6A]">No practical canonical layout is available for the current room.</div>
      </div>
    );
  }
  const metrics = layout.metrics || {};
  const sideWall = layout.recommendationKind === "side-wall-alternative";
  const unsupported = hasUnsupportedPlacement(layout);
  return (
    <div className="rounded-lg border border-[#D9D5CE] bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[14px] font-semibold text-[#1B1A1A]">{copy.title}</div>
          <div className="text-[10px] font-medium uppercase tracking-wide text-[#625143]">{copy.strapline}</div>
        </div>
        {sideWall && (
          <span className="max-w-[130px] rounded-full bg-amber-50 px-2 py-1 text-center text-[9px] font-semibold leading-tight text-amber-800">
            Acoustic alternative · less practical
          </span>
        )}
      </div>
      <button type="button" onClick={() => onInspect(layout)} className="mt-3 block w-full text-left">
        <LayoutThumbnail layout={layout} roomDims={roomDims} />
        <div className="mt-2 text-[12px] font-semibold text-[#213428]">{layout.name}</div>
      </button>
      <div className="mt-2 space-y-1 text-[10px] text-[#625143]">
        <div>{metrics.nullRiskLabel}</div>
        <div>{metrics.expectedConsistencyLabel}</div>
        <div>{metrics.smoothnessLabel}</div>
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-[#8A7B6A]">{layout.practicalReason}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => onInspect(layout)}>
          View positions
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => onApply(layout)}
          disabled={disabled || isApplied || unsupported}
          className="bg-[#213428] text-white hover:bg-[#3E4349]"
        >
          {isApplied ? "Applied" : unsupported ? "Guidance only" : "Apply Layout"}
        </Button>
      </div>
    </div>
  );
}

export default function BestSubLayoutGuide({
  roomDims,
  seatingPositions,
  rspPosition,
  sourceHeights,
  contextId,
  roomElements,
  currentSubs,
  frontSubsCfg,
  rearSubsCfg,
  subwooferInstances,
  commitInstances,
  hasCanonicalInstances,
}) {
  const liveInputs = useBestSubLayoutLiveInputs();
  const physicsOptions = selectBestSubLayoutPhysics(liveInputs, contextId);
  const advisor = useFastBassPlacementAdvisor({
    roomDims,
    seatingPositions,
    rspPosition,
    physicsOptions,
    sourceHeights,
    roomElements,
  });
  const [selected, setSelected] = useState(null);
  const [previousInstances, setPreviousInstances] = useState(null);
  const [applyError, setApplyError] = useState(null);
  const currentSources = useMemo(() => currentSourcesFrom(currentSubs), [currentSubs]);
  const recommendations = advisor.result?.recommendations || {};

  const isApplied = (layout) => coordinatesMatch(currentSources, layout?.sources || []);

  const apply = (layout) => {
    setApplyError(null);
    if (!hasCanonicalInstances || typeof commitInstances !== "function") {
      setApplyError("Subwoofer instances are not ready.");
      return;
    }
    const validation = validateRecommendationLayout(layout, roomDims);
    if (!validation.valid) {
      setApplyError(validation.reason);
      return;
    }
    setPreviousInstances(
      (Array.isArray(subwooferInstances) ? subwooferInstances : []).map((instance) => ({ ...instance })),
    );
    const next = buildAppliedInstances(
      layout,
      subwooferInstances,
      frontSubsCfg,
      rearSubsCfg,
    );
    commitInstances(next, {
      front: { placementMode: "manual", isManual: true },
      rear: { placementMode: "manual", isManual: true },
    });
    setSelected(null);
  };

  const undo = () => {
    if (!previousInstances || typeof commitInstances !== "function") return;
    commitInstances(previousInstances);
    setPreviousInstances(null);
    setApplyError(null);
  };

  return (
    <div className="mt-4 rounded-lg border border-[#E7E4DF] bg-white/70 px-4 py-4" data-advisor-status={advisor.status}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h5 className="text-[14px] font-semibold text-[#1B1A1A]">Starting Layout Advisor</h5>
          <p className="mt-1 text-[11px] leading-relaxed text-[#625143]">
            Fast room-and-seat guidance only. These are scored starting positions, not P14/P18/P19/P20 results.
          </p>
        </div>
        {advisor.status === "refreshing" && (
          <span className="text-[10px] font-medium text-[#625143]">Refreshing guidance…</span>
        )}
      </div>

      {!advisor.result && advisor.status !== "error" && (
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {[1, 2, 4].map((quantity) => (
            <div key={quantity} className="h-48 animate-pulse rounded-lg border border-dashed border-[#C9C2B8] bg-[#F8F7F4]" />
          ))}
        </div>
      )}
      {advisor.status === "error" && (
        <p className="mt-3 text-xs text-red-700">Placement guidance could not be prepared. Manual placement remains available.</p>
      )}
      {advisor.result && (
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {[1, 2, 4].map((quantity) => (
            <AdvisorCard
              key={quantity}
              quantity={quantity}
              layout={recommendations[quantity]}
              roomDims={roomDims}
              isApplied={recommendations[quantity] ? isApplied(recommendations[quantity]) : false}
              onApply={apply}
              onInspect={setSelected}
              disabled={!hasCanonicalInstances}
            />
          ))}
        </div>
      )}

      {previousInstances && (
        <Button type="button" size="sm" variant="outline" className="mt-3" onClick={undo}>
          Undo applied layout
        </Button>
      )}
      <p className="mt-3 text-[10px] leading-relaxed text-[#8A7B6A]">
        Applying a layout only moves the subwoofers. Bass analysis will not start until you choose Calculate Bass Performance.
      </p>

      <Rp22LayoutPlanDialog
        open={Boolean(selected)}
        onOpenChange={(open) => { if (!open) { setSelected(null); setApplyError(null); } }}
        layout={selected}
        roomDims={roomDims}
        subModel={frontSubsCfg?.model || rearSubsCfg?.model || null}
        onApply={apply}
        isApplied={selected ? isApplied(selected) : false}
        applyError={applyError}
        applying={false}
        unsupported={selected ? hasUnsupportedPlacement(selected) : false}
      />
    </div>
  );
}
