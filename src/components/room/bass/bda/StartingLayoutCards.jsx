// StartingLayoutCards.jsx
// ---------------------------------------------------------------------------
// Sprint 1 — Stage 1: Choose Layout
//
// Two-column decision area:
//   Left:  Room & Seating plan (updates to show selected layout's sub positions)
//   Right:  Decision header, instruction, recommendation, three selectable
//          cards, single action button.
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

function describeLayout(quantity, layout) {
  if (!layout || !layout.sources) return "No layout available";
  const sources = layout.sources;
  const hasFront = sources.some((s) => s.placement === "front");
  const hasRear = sources.some((s) => s.placement === "rear");

  if (quantity === 1) return "Front centre · simplest installation";
  if (quantity === 2) {
    if (hasFront && hasRear) return "Front and rear · balanced response";
    return "Front quarter lines · mirrors the seating geometry";
  }
  if (quantity === 4) {
    if (hasFront && hasRear) return "Front and rear quarter lines · highest installation commitment";
    return "Four-point placement · comprehensive coverage";
  }
  return "";
}

// ── Room plan preview ──
function RoomPlanPreview({ roomDims, seatingPositions, layoutSources, rspPosition }) {
  const width = Number(roomDims?.widthM) || 1;
  const length = Number(roomDims?.lengthM) || 1;
  const pad = Math.max(width, length) * 0.08;
  const seatRadius = Math.max(0.08, Math.min(width, length) * 0.035);
  const subRadius = Math.max(0.1, Math.min(width, length) * 0.05);

  return (
    <svg
      viewBox={`${-pad} ${-pad} ${width + pad * 2} ${length + pad * 2}`}
      className="w-full rounded-md border border-[#D9D5CE] bg-[#F8F7F4]"
      style={{ minHeight: 160 }}
      role="img"
      aria-label="Room plan showing seating and subwoofer positions"
    >
      <text x={width / 2} y={-pad * 0.25} textAnchor="middle" fontSize={Math.max(0.12, pad * 0.45)} fill="#8A7B6A">FRONT</text>
      {/* Room outline */}
      <rect x="0" y="0" width={width} height={length} fill="white" stroke="#BFB9AE" strokeWidth={Math.max(0.02, subRadius * 0.1)} />
      {/* Front wall — thicker */}
      <line x1={0} y1={0} x2={width} y2={0} stroke="#1B1A1A" strokeWidth={Math.max(0.04, subRadius * 0.22)} />
      {/* Centerline (RSP) */}
      {rspPosition && Number.isFinite(rspPosition.x) && (
        <line
          x1={rspPosition.x}
          y1={0}
          x2={rspPosition.x}
          y2={length}
          stroke="#BFB9AE"
          strokeWidth={Math.max(0.015, subRadius * 0.08)}
          strokeDasharray={`${subRadius * 0.5} ${subRadius * 0.4}`}
        />
      )}
      {/* Seats */}
      {(Array.isArray(seatingPositions) ? seatingPositions : []).map((seat) => {
        const x = Number(seat?.x);
        const y = Number(seat?.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        const isPrimary = seat?.isPrimary || seat?.priority === "primary";
        return (
          <circle
            key={seat?.id}
            cx={x}
            cy={y}
            r={seatRadius}
            fill={isPrimary ? "#D6D0C4" : "#E8E5DF"}
            stroke="#BFB9AE"
            strokeWidth={Math.max(0.012, seatRadius * 0.12)}
          />
        );
      })}
      {/* Sub positions for selected layout */}
      {(layoutSources || []).map((source, index) => {
        const x = Number(source?.x);
        const y = Number(source?.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        return (
          <g key={source?.id || index}>
            <circle cx={x} cy={y} r={subRadius} fill="#213428" />
            <text x={x} y={y + subRadius * 0.34} textAnchor="middle" fontSize={subRadius} fontWeight="700" fill="white">{index + 1}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Seating badges ──
function SeatingBadges({ seatingPositions, rspPosition, roomDims }) {
  const seats = Array.isArray(seatingPositions) ? seatingPositions : [];
  const rowNumbers = [...new Set(seats.map((s) => s?.rowNumber).filter(Number.isFinite))].sort((a, b) => a - b);
  const primaryRow = rowNumbers[0];
  const secondaryRow = rowNumbers[1];
  const primaryCount = seats.filter((s) => s?.rowNumber === primaryRow).length;
  const secondaryCount = secondaryRow != null ? seats.filter((s) => s?.rowNumber === secondaryRow).length : 0;

  const isCentred = rspPosition && roomDims
    && Number.isFinite(rspPosition.x)
    && Number.isFinite(roomDims.widthM)
    && Math.abs(rspPosition.x - roomDims.widthM / 2) < 0.15;

  const badges = [];
  if (isCentred) badges.push("Centred RSP");
  if (primaryCount > 0) badges.push(`Primary row: ${primaryCount}`);
  if (secondaryCount > 0) badges.push(`Secondary row: ${secondaryCount}`);

  if (badges.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {badges.map((badge) => (
        <span
          key={badge}
          className="rounded-full border border-[#D9D5CE] bg-white px-2.5 py-1 text-[10px] font-medium text-[#625143]"
        >
          {badge}
        </span>
      ))}
    </div>
  );
}

// ── Mini schematic for each card ──
function LayoutMiniSchematic({ layout, roomDims }) {
  const width = Number(roomDims?.widthM) || 1;
  const length = Number(roomDims?.lengthM) || 1;
  const radius = Math.max(0.04, Math.min(width, length) * 0.04);

  return (
    <svg
      viewBox={`0 0 ${width} ${length}`}
      className="h-10 w-full rounded border border-[#E7E4DF] bg-[#F8F7F4]"
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
      className={`text-left rounded-lg border p-2.5 transition-all ${
        isSelected || isApplied
          ? "border-2 border-[#213428] bg-[#F3F1EC]"
          : "border border-[#D9D5CE] bg-white hover:border-[#BFB9AE]"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-[12px] font-semibold text-[#1B1A1A]">{LAYOUT_TITLES[quantity]}</div>
        {isApplied && (
          <span className="rounded-full bg-[#213428] px-1.5 py-0.5 text-[9px] font-semibold uppercase text-white">Applied</span>
        )}
      </div>
      <div className="mt-0.5 text-[10px] leading-snug text-[#625143]">{describeLayout(quantity, layout)}</div>
      <div className="mt-1.5">
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
  const recommendations = advisor.result?.recommendations || {};

  // Default selection: 2 subs (the recommended starting point)
  const [selectedQuantity, setSelectedQuantity] = useState(2);

  // If the selected quantity has no layout, fall back to first available
  useEffect(() => {
    if (recommendations[selectedQuantity]) return;
    const firstAvailable = [2, 1, 4].find((q) => recommendations[q]);
    if (firstAvailable) setSelectedQuantity(firstAvailable);
  }, [recommendations, selectedQuantity]);

  const selectedLayout = recommendations[selectedQuantity];
  const isApplied = (layout) => coordinatesMatch(currentSources, layout?.sources || []);

  const apply = () => {
    const layout = recommendations[selectedQuantity];
    if (!layout) return;
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
    const next = buildAppliedInstances(layout, subwooferInstances, frontSubsCfg, rearSubsCfg, null);
    commitInstances(next, {
      front: { placementMode: "manual", isManual: true },
      rear: { placementMode: "manual", isManual: true },
    });
  };

  const roomLabel = roomDims?.widthM && roomDims?.lengthM
    ? `${Number(roomDims.widthM).toFixed(1)} × ${Number(roomDims.lengthM).toFixed(1)} m`
    : "";
  const seatCount = Array.isArray(seatingPositions) ? seatingPositions.length : 0;

  return (
    <div className="space-y-3" data-bda-stage="choose-layout" data-advisor-status={advisor.status}>
      {/* Decision header */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-[#625143]">Decision 1 of 6</div>
        <h4
          className="text-[15px] font-semibold text-[#1B1A1A]"
          style={{ fontFamily: "Didact Gothic, sans-serif" }}
        >
          Where should the subwoofers go?
        </h4>
        <p className="mt-1 text-[12px] text-[#625143]">
          Choose a geometrically sensible starting layout. Performance is deliberately not predicted yet.
        </p>
      </div>

      {/* Two-column: room plan + decision area */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Left: Room & Seating */}
        <div className="space-y-2">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[#625143]">Room and Seating</div>
            <div className="text-[11px] text-[#8A7B6A]">
              {roomLabel}
              {seatCount > 0 && ` · ${seatCount} seat${seatCount > 1 ? "s" : ""}`}
            </div>
          </div>
          <RoomPlanPreview
            roomDims={roomDims}
            seatingPositions={seatingPositions}
            layoutSources={selectedLayout?.sources}
            rspPosition={rspPosition}
          />
          <SeatingBadges
            seatingPositions={seatingPositions}
            rspPosition={rspPosition}
            roomDims={roomDims}
          />
        </div>

        {/* Right: Decision cards */}
        <div className="space-y-2">
          {/* Recommendation info box */}
          {recommendations[2] && (
            <div className="rounded-lg border border-[#D9E4D9] bg-[#E6EFE6] px-3 py-2">
              <p className="text-[11px] leading-snug text-[#3E5A42]">
                Recommended starting point: two subs on the front quarter lines.
              </p>
            </div>
          )}

          {/* Loading state */}
          {!advisor.result && advisor.status !== "error" && (
            <div className="space-y-2">
              {[1, 2, 4].map((q) => (
                <div key={q} className="h-20 animate-pulse rounded-lg border border-dashed border-[#C9C2B8] bg-[#F8F7F4]" />
              ))}
            </div>
          )}

          {/* Error state */}
          {advisor.status === "error" && (
            <p className="text-xs text-red-700">Layout guidance could not be prepared. Manual placement remains available.</p>
          )}

          {/* Cards */}
          {advisor.result && (
            <div className="space-y-2">
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

          {/* Action button */}
          {advisor.result && selectedLayout && (
            <button
              type="button"
              onClick={apply}
              disabled={!hasCanonicalInstances}
              className="w-full rounded-lg bg-[#213428] px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#3E4349] disabled:cursor-not-allowed disabled:opacity-45"
            >
              Use {selectedQuantity}-sub layout
            </button>
          )}

          {applyError && <p className="text-xs text-red-700">{applyError}</p>}
        </div>
      </div>

      {/* Footer link */}
      <div className="text-center">
        <button
          type="button"
          className="text-[11px] text-[#625143] underline underline-offset-2 hover:text-[#1B1A1A]"
        >
          Review room
        </button>
      </div>
    </div>
  );
}