// StartingLayoutCards.jsx
// ---------------------------------------------------------------------------
// Sprint 1 — Stage 1: Choose Layout
//
// Compact decision area: header, three selectable layout cards (1, 2, 4
// subs) each carrying its own mini schematic, and a single action button.
// Full-width grid — same presentation principle as EvaluatedLayoutCards.
//
// No RP22. No performance. No engineering. No predictions.
// No advantages. No limitations. No "recommended for..."
//
// Physical starting layouts derived from:
//   - room geometry
//   - seating positions
//   - room modes
// ---------------------------------------------------------------------------

import React, { useMemo, useState, useEffect } from "react";
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
import { mergeWithFallbacks } from "@/components/room/bass/bda/startingLayoutFallbacks";

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

// ── Mini schematic for each card ──
function LayoutMiniSchematic({ layout, roomDims }) {
  const width = Number(roomDims?.widthM) || 1;
  const length = Number(roomDims?.lengthM) || 1;
  const radius = Math.max(0.04, Math.min(width, length) * 0.04);

  return (
    <svg
      viewBox={`0 0 ${width} ${length}`}
      className="h-20 w-full rounded border border-[#E7E4DF] bg-[#F8F7F4]"
      role="img"
      aria-label={`Schematic: ${layout?.sources?.length || 0} subwoofers`}
    >
      <rect x="0" y="0" width={width} height={length} fill="none" stroke="#BFB9AE" strokeWidth={Math.max(0.015, radius * 0.15)} />
      <line x1={0} y1={0} x2={width} y2={0} stroke="#1B1A1A" strokeWidth={Math.max(0.03, radius * 0.3)} />
      {(layout?.sources || []).map((source, index) => {
        const x = Number(source?.x);
        const y = Number(source?.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        return <circle key={index} cx={x} cy={y} r={radius} fill="#213428" />;
      })}
    </svg>
  );
}

// ── Selectable layout card ──
function LayoutCard({ quantity, layout, roomDims, isSelected, onSelect, isApplied }) {
  if (!layout) {
    return (
      <div className="rounded-lg border border-dashed border-[#C9C2B8] bg-white/60 p-2.5">
        <div className="text-[12px] font-semibold text-[#1B1A1A]">{LAYOUT_TITLES[quantity]}</div>
        <div className="mt-0.5 text-[10px] text-[#8A7B6A]">No layout available for this room.</div>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onSelect(quantity)}
      className={`w-full min-w-0 text-left rounded-lg border p-4 transition-all ${
        isSelected || isApplied
          ? "border-2 border-[#213428] bg-[#F3F1EC]"
          : "border border-[#D9D5CE] bg-white hover:border-[#BFB9AE]"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-[14px] font-semibold text-[#1B1A1A]">{LAYOUT_TITLES[quantity]}</div>
        {isApplied && (
          <span className="rounded-full bg-[#213428] px-1.5 py-0.5 text-[9px] font-semibold uppercase text-white">Applied</span>
        )}
      </div>
      <div className="mt-2">
        <LayoutMiniSchematic layout={layout} roomDims={roomDims} />
      </div>
    </button>
  );
}

// ── Main component ──
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

  // Merge advisor recommendations with geometric fallbacks so the selector
  // ALWAYS has three usable cards — even for brand-new projects where the
  // advisor is blocked (instanceStatus UNINITIALISED) or still debouncing.
  const recommendations = useMemo(
    () => mergeWithFallbacks(advisor.result?.recommendations, roomDims, sourceHeights),
    [advisor.result?.recommendations, roomDims, sourceHeights],
  );

  // Default selection: 2 subs (the recommended starting point)
  const [selectedQuantity, setSelectedQuantity] = useState(2);

  // If the selected quantity has no layout (not even a fallback), fall back
  // to first available. This only happens with invalid room dimensions.
  useEffect(() => {
    if (recommendations[selectedQuantity]) return;
    const firstAvailable = [2, 1, 4].find((q) => recommendations[q]);
    if (firstAvailable) setSelectedQuantity(firstAvailable);
  }, [recommendations, selectedQuantity]);

  const selectedLayout = recommendations[selectedQuantity];
  const isApplied = (layout) => coordinatesMatch(currentSources, layout?.sources || []);

  // Loading state: only show skeletons during the initial debounce period
  // (advisor computing) AND when no fallback is available yet. Fallbacks are
  // synchronous so this is typically a single frame.
  const advisorLoading = !advisor.result && advisor.status !== "error" && !recommendations[2];
  const advisorError = advisor.status === "error" && !recommendations[2];

  const apply = () => {
    const layout = recommendations[selectedQuantity];
    if (!layout) return;
    setApplyError(null);
    // commitInstances creates instances from scratch via buildAppliedInstances,
    // so it works for brand-new projects where instanceStatus is UNINITIALISED.
    // The only hard failure is a missing commitInstances function.
    if (typeof commitInstances !== "function") {
      setApplyError("Subwoofer instances are not ready.");
      return;
    }
    const validation = validateRecommendationLayout(layout, roomDims);
    if (!validation.valid) {
      setApplyError(validation.reason);
      return;
    }
    // A chosen starting layout must persist as valid canonical instances.
    // Fresh projects can hydrate with no explicit sub model, so use the
    // product default already presented by the subwoofer workflow.
    const appliedModel = frontSubsCfg?.model || rearSubsCfg?.model || "SUB2-12";
    const next = buildAppliedInstances(layout, subwooferInstances, frontSubsCfg, rearSubsCfg, appliedModel);
    try {
      commitInstances(next, {
        front: { placementMode: "manual", isManual: true },
        rear: { placementMode: "manual", isManual: true },
      });
    } catch (err) {
      setApplyError(err?.message || "Could not save a restore point. The layout was not applied.");
    }
  };

  return (
    <div className="space-y-3" data-bda-stage="choose-layout" data-advisor-status={advisor.status}>
      {/* Workspace header */}
      <div>
        <h4
          className="text-[15px] font-semibold text-[#1B1A1A]"
          style={{ fontFamily: "Didact Gothic, sans-serif" }}
        >
          Choose Starting Layout
        </h4>
        <p className="mt-1 text-[12px] text-[#625143]">
          Select the physical starting layout for this room.
        </p>
      </div>

      {/* Error state — advisor failed, but fallback cards still show */}
      {advisorError && (
        <p className="text-[11px] text-[#4A230F]">Optimised placement unavailable — showing standard layouts. Manual placement remains available.</p>
      )}

      {/* Loading state — only when no fallback available (invalid room) */}
      {advisorLoading && (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
          {[1, 2, 4].map((q) => (
            <div key={q} className="h-24 animate-pulse rounded-lg border border-dashed border-[#C9C2B8] bg-[#F8F7F4]" />
          ))}
        </div>
      )}

      {/* Cards — always render when recommendations exist (advisor or fallback).
          Full-width grid matches the evaluated-layout presentation so the
          cards are the primary content in every state. */}
      {recommendations[2] && (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
          {[1, 2, 4].map((quantity) => (
            <LayoutCard
              key={quantity}
              quantity={quantity}
              layout={recommendations[quantity]}
              roomDims={roomDims}
              isSelected={selectedQuantity === quantity}
              onSelect={setSelectedQuantity}
              isApplied={recommendations[quantity] ? isApplied(recommendations[quantity]) : false}
            />
          ))}
        </div>
      )}

      {/* Action button — enabled whenever a layout is selected and
          commitInstances is available. Not gated by hasCanonicalInstances
          because buildAppliedInstances creates instances from scratch. */}
      {selectedLayout && (
        <button
          type="button"
          onClick={apply}
          className="w-full rounded-lg bg-[#213428] px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#3E4349]"
        >
          Use {selectedQuantity}-sub layout
        </button>
      )}

      {applyError && <p className="text-xs text-red-700">{applyError}</p>}
    </div>
  );
}