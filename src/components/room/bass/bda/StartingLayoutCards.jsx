// StartingLayoutCards.jsx
// ---------------------------------------------------------------------------
// Stage 1 — Choose Starting Layout
//
// Three cards: 1 Subwoofer, 2 Subwoofers, 4 Subwoofers.
// Each card contains ONLY:
//   - Title
//   - Mini room plan with sub positions
//   - "Starting layout"
//   - Apply
//
// No RP22. No performance. No engineering. No predictions.
// No advantages. No limitations. No "recommended for..."
//
// These are physical starting layouts derived from:
//   - room geometry
//   - seating positions
//   - room modes
// Nothing more.
// ---------------------------------------------------------------------------

import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  buildAppliedInstances,
  coordinatesMatch,
  validateRecommendationLayout,
} from "@/components/room/bass/best-layout/applyRecommendationUtils";
import { useFastBassPlacementAdvisor } from "@/components/room/bass/best-layout/useFastBassPlacementAdvisor";
import { useBestSubLayoutLiveInputs } from "@/components/room/bass/best-layout/bestSubLayoutLiveInputs";
import { selectBestSubLayoutPhysics } from "@/components/room/bass/best-layout/bestSubLayoutPhysicsSnapshot";
import { useActiveProjectId } from "@/components/state/project-session";
import { resolveBestSubLayoutContextId } from "@/components/room/bass/best-layout/bestSubLayoutContext";

const LAYOUT_TITLES = {
  1: "1 Subwoofer",
  2: "2 Subwoofers",
  4: "4 Subwoofers",
};

function currentSourcesFrom(subs) {
  return (Array.isArray(subs) ? subs : [])
    .filter((sub) => sub?.enabled !== false)
    .map((sub) => {
      const position = sub?.position || sub;
      const group = sub?.group || sub?.legacyGroup;
      const placement = group === "rear"
        ? "rear"
        : group === "left"
          ? "left"
          : group === "right"
            ? "right"
            : "front";
      return {
        id: sub?.id,
        model: sub?.model,
        x: Number(position?.x),
        y: Number(position?.y),
        z: position?.z,
        placement,
        gainDb: Number(sub?.gainDb) || 0,
        delayMs: Number(sub?.delayMs) || 0,
        polarity: Number(sub?.polarity) || 0,
      };
    })
    .filter((source) => Number.isFinite(source.x) && Number.isFinite(source.y));
}

function LayoutThumbnail({ layout, roomDims }) {
  const width = Number(roomDims?.widthM) || 1;
  const length = Number(roomDims?.lengthM) || 1;
  const pad = Math.max(width, length) * 0.08;
  const radius = Math.max(0.1, Math.min(width, length) * 0.055);
  return (
    <svg
      viewBox={`${-pad} ${-pad} ${width + pad * 2} ${length + pad * 2}`}
      className="h-36 w-full rounded-md border border-[#D9D5CE] bg-[#F8F7F4]"
      role="img"
      aria-label={`Plan showing ${layout?.sources?.length || 0} subwoofer positions`}
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

function LayoutCard({ quantity, layout, roomDims, isApplied, onApply, disabled }) {
  if (!layout) {
    return (
      <div className="rounded-lg border border-dashed border-[#C9C2B8] bg-white/60 p-3">
        <div className="text-[13px] font-semibold text-[#1B1A1A]">{LAYOUT_TITLES[quantity]}</div>
        <div className="mt-1 text-[11px] text-[#8A7B6A]">No layout available for the current room.</div>
      </div>
    );
  }
  return (
    <div className={`rounded-lg border p-3 ${isApplied ? "border-2 border-[#213428] bg-[#F3F1EC]" : "border border-[#D9D5CE] bg-white"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-[14px] font-semibold text-[#1B1A1A]">{LAYOUT_TITLES[quantity]}</div>
        {isApplied && (
          <span className="rounded-full bg-[#213428] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Applied</span>
        )}
      </div>
      <div className="mt-2">
        <LayoutThumbnail layout={layout} roomDims={roomDims} />
      </div>
      <p className="mt-2 text-[12px] leading-snug text-[#625143]">Starting layout</p>
      <div className="mt-3">
        <Button
          type="button"
          size="sm"
          onClick={() => onApply(layout)}
          disabled={disabled || isApplied}
          className="w-full bg-[#213428] text-white hover:bg-[#3E4349]"
        >
          {isApplied ? "Applied" : "Apply"}
        </Button>
      </div>
    </div>
  );
}

export default function StartingLayoutCards({
  roomDims,
  seatingPositions,
  rspPosition,
  sourceHeights,
  roomElements,
  currentSubs,
  frontSubsCfg,
  rearSubsCfg,
  subwooferInstances,
  commitInstances,
  hasCanonicalInstances,
}) {
  const activeProjectId = useActiveProjectId();
  const contextId = resolveBestSubLayoutContextId({ projectId: activeProjectId, roomDims });
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
  const [applyError, setApplyError] = useState(null);
  const currentSources = useMemo(() => currentSourcesFrom(currentSubs), [currentSubs]);
  const recommendations = advisor.result?.recommendations || {};

  const isApplied = (layout) => coordinatesMatch(currentSources, layout?.sources || []);

  const apply = (layout, modelOverride = null) => {
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
    const next = buildAppliedInstances(
      layout,
      subwooferInstances,
      frontSubsCfg,
      rearSubsCfg,
      modelOverride,
    );
    commitInstances(next, {
      front: { placementMode: "manual", isManual: true },
      rear: { placementMode: "manual", isManual: true },
    });
  };

  return (
    <div className="space-y-3" data-bda-stage="starting-layout" data-advisor-status={advisor.status}>
      <div>
        <h4 className="text-[15px] font-semibold text-[#1B1A1A]" style={{ fontFamily: "Didact Gothic, sans-serif" }}>
          Choose Starting Layout
        </h4>
      </div>

      {!advisor.result && advisor.status !== "error" && (
        <div className="grid gap-3 md:grid-cols-3">
          {[1, 2, 4].map((quantity) => (
            <div key={quantity} className="h-48 animate-pulse rounded-lg border border-dashed border-[#C9C2B8] bg-[#F8F7F4]" />
          ))}
        </div>
      )}
      {advisor.status === "error" && (
        <p className="text-xs text-red-700">Layout guidance could not be prepared. Manual placement remains available.</p>
      )}
      {advisor.result && (
        <div className="grid gap-3 md:grid-cols-3">
          {[1, 2, 4].map((quantity) => (
            <LayoutCard
              key={quantity}
              quantity={quantity}
              layout={recommendations[quantity]}
              roomDims={roomDims}
              isApplied={recommendations[quantity] ? isApplied(recommendations[quantity]) : false}
              onApply={apply}
              disabled={!hasCanonicalInstances}
            />
          ))}
        </div>
      )}
      {applyError && (
        <p className="text-xs text-red-700">{applyError}</p>
      )}
    </div>
  );
}