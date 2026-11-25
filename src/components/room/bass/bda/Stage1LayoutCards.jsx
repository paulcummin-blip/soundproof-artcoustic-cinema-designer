// Stage1LayoutCards.jsx
// ---------------------------------------------------------------------------
// Model-independent Stage 1 placement recommendation cards.
//
// Displays one card per subwoofer quantity (1, 2, 4) with the best practical
// front/rear-wall arrangement, its actual evaluated wall positions (mini
// schematic), and comparative Stage 1 screening evidence (primary nulls,
// primary variation, primary smoothness, secondary variation). No RP22
// grades are shown — Stage 1 screening metrics are comparative acoustic
// evidence, not RP22 Performance Levels.
//
// These recommendations are model-independent: they appear as soon as Stage
// 1 discovery is complete, regardless of whether a subwoofer model, P14
// target or Stage 2 evaluation exists. A failed Stage 2 assessment never
// hides these cards — product capability (P14, P18, physical fit) is a
// separate evaluation shown in the performance section.
//
// Apply uses the existing quantity-aware Apply authority
// (quantityPlacementApplyAuthority) with the Stage 1 virtual-source wall
// positions. No model is assigned — the designer selects a product
// separately. Cabinet offsets belong to subsequent product evaluation.
//
// The best side-wall candidate is retained per quantity as
// `sideWallAlternative` on the option but is NOT shown as a card — the
// exceptional side-wall threshold is validated separately.
// ---------------------------------------------------------------------------

import React, { useMemo, useState } from "react";
import {
  buildQuantityApplyInstances,
  resolveQuantityApplyState,
} from "@/components/room/bass/optimiserPlan/quantityPlacementApplyAuthority";
import { coordinatesMatch } from "@/components/room/bass/best-layout/applyRecommendationUtils";
import { formatDb } from "@/components/utils/formatDb";
import Stage1ResponseGraph from "./Stage1ResponseGraph";

const LAYOUT_TITLES = { 1: "1 Subwoofer", 2: "2 Subwoofers", 4: "4 Subwoofers" };

function sourcesFromOption(option) {
  return (option?.coordinates || []).map((coord) => ({
    x: Number(coord.x),
    y: Number(coord.y),
    placement: coord.placement,
  }));
}

/**
 * Stage 1 arrangement match: checks enabled quantity and active cabinet
 * positions only. No model, orientation or height check — Stage 1 is
 * model-independent.
 */
function arrangementMatchesStage1Option(instances, option) {
  if (!option) return false;
  const enabled = (Array.isArray(instances) ? instances : []).filter((i) => i?.enabled !== false);
  if (enabled.length === 0) return false;
  if (enabled.length !== Number(option.quantity)) return false;

  const currentSources = enabled
    .map((sub) => {
      const position = sub?.position || {};
      const group = sub?.group || sub?.legacyGroup;
      const placement = group === "rear" ? "rear" : "front";
      return { x: Number(position?.x), y: Number(position?.y), placement };
    })
    .filter((s) => Number.isFinite(s.x) && Number.isFinite(s.y));

  const recSources = (Array.isArray(option.coordinates) ? option.coordinates : []).map((c) => ({
    x: Number(c.x),
    y: Number(c.y),
    placement: c.placement,
  }));

  return coordinatesMatch(currentSources, recSources);
}

function LayoutMiniSchematic({ option, roomDims }) {
  const width = Number(roomDims?.widthM) || 1;
  const length = Number(roomDims?.lengthM) || 1;
  const radius = Math.max(0.04, Math.min(width, length) * 0.04);
  return (
    <svg viewBox={`0 0 ${width} ${length}`} className="h-20 w-full rounded border border-[#E7E4DF] bg-[#F8F7F4]"
      role="img" aria-label={`Schematic: ${option?.quantity || 0} subwoofers`}>
      <rect x="0" y="0" width={width} height={length} fill="none"
        stroke="#BFB9AE" strokeWidth={Math.max(0.015, radius * 0.15)} />
      <line x1={0} y1={0} x2={width} y2={0} stroke="#1B1A1A"
        strokeWidth={Math.max(0.03, radius * 0.3)} />
      <line x1={0} y1={length} x2={width} y2={length} stroke="#1B1A1A"
        strokeWidth={Math.max(0.03, radius * 0.3)} />
      {(option?.coordinates || []).map((coord, index) => {
        const x = Number(coord?.x);
        const y = Number(coord?.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        return <circle key={index} cx={x} cy={y} r={radius} fill="#213428" />;
      })}
    </svg>
  );
}

function MetricRow({ label, value, hint }) {
  return (
    <div className="flex items-center justify-between text-[10px] leading-tight">
      <span className="text-[#8A7B6A]">{label}</span>
      <span className="font-semibold text-[#1B1A1A]" title={hint || undefined}>{value}</span>
    </div>
  );
}

function screeningRows(screening) {
  if (!screening) return [];
  const rows = [];

  const nulls = screening.primarySevereProblemCount;
  rows.push(
    <MetricRow
      key="nulls"
      label="Primary nulls"
      value={nulls === 0 ? "None detected" : `${nulls} severe`}
      hint="Stage 1 screening: count of primary seats with a significant broad null (≥10 dB depth)"
    />,
  );

  const varDb = screening.worstPrimarySpatialVariation;
  if (Number.isFinite(varDb)) {
    rows.push(
      <MetricRow
        key="pvar"
        label="Primary variation"
        value={formatDb(varDb)}
        hint="Stage 1 screening: worst seat-to-seat variation across primary seats (lower is better)"
      />,
    );
  }

  const smoothness = screening.primaryResponseSmoothness;
  if (Number.isFinite(smoothness)) {
    rows.push(
      <MetricRow
        key="smooth"
        label="Primary smoothness"
        value={formatDb(Math.abs(smoothness))}
        hint="Stage 1 screening: average primary-seat response variation from mean (lower is smoother)"
      />,
    );
  }

  const secVar = screening.secondarySpatialConsistency;
  if (Number.isFinite(secVar)) {
    rows.push(
      <MetricRow
        key="secvar"
        label="Secondary variation"
        value={formatDb(secVar)}
        hint="Stage 1 screening: worst seat-to-seat variation across secondary seats (lower is better)"
      />,
    );
  }

  return rows;
}

function Stage1Card({
  option,
  roomDims,
  responsePreview,
  responseYMin,
  responseYMax,
  isSelected,
  onSelect,
  isApplied,
  onConfirmApply,
  canApply,
  blockReason,
  optionKey,
}) {
  if (!option) {
    return (
      <div className="rounded-lg border border-dashed border-[#C9C2B8] bg-white/60 p-3">
        <div className="text-[13px] font-semibold text-[#1B1A1A]">{LAYOUT_TITLES[option?.quantity] || "—"}</div>
        <div className="mt-1 text-[10px] text-[#8A7B6A]">No valid wall arrangement discovered for this quantity.</div>
      </div>
    );
  }
  return (
    <div className={`rounded-lg border p-3 transition-all ${
      isSelected || isApplied
        ? "border-2 border-[#213428] bg-[#F3F1EC]"
        : "border border-[#D9D5CE] bg-white hover:border-[#BFB9AE]"
    }`}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-[#1B1A1A]">{LAYOUT_TITLES[option.quantity]}</div>
          {option.familyLabel && (
            <div className="text-[10px] text-[#8A7B6A] truncate">{option.familyLabel}</div>
          )}
        </div>
        {isApplied && (
          <span className="rounded-full bg-[#213428] px-1.5 py-0.5 text-[9px] font-semibold uppercase text-white">Applied</span>
        )}
      </div>
      <div className="mt-1.5">
        <LayoutMiniSchematic option={option} roomDims={roomDims} />
      </div>
      <div className="mt-1 text-[9px] text-[#8A7B6A]">
        Model-independent placement · virtual-source positions
      </div>
      <div className="mt-2">
        <Stage1ResponseGraph
          preview={responsePreview}
          yMin={responseYMin}
          yMax={responseYMax}
        />
      </div>
      <div className="mt-2 space-y-0.5">
        {screeningRows(option.screening)}
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        {isSelected && !isApplied ? (
          <>
            <button type="button" onClick={onConfirmApply} disabled={!canApply}
              className="flex-1 rounded-md bg-[#213428] px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-[#3E4349] disabled:cursor-not-allowed disabled:opacity-50">
              Apply {option.quantity}-sub layout
            </button>
            <button type="button" onClick={() => onSelect(null)}
              className="rounded-md border border-[#D9D5CE] px-2.5 py-1.5 text-[11px] text-[#625143] hover:bg-[#F3F1EC]">
              Cancel
            </button>
          </>
        ) : (
          <button type="button" onClick={() => onSelect(optionKey)} disabled={isApplied}
            className="w-full rounded-md border border-[#D9D5CE] px-3 py-1.5 text-[11px] font-medium text-[#1B1A1A] hover:bg-[#F3F1EC] disabled:opacity-50">
            {isApplied ? "Current layout" : "Select"}
          </button>
        )}
      </div>
      {isSelected && !canApply && blockReason && (
        <div className="mt-1.5 text-[9px] text-[#4A230F]">{blockReason}</div>
      )}
    </div>
  );
}

function optionKeyFor(option) {
  if (!option) return "none";
  return `s1::${option.quantity}::${option.finalistId || JSON.stringify(option.coordinates)}`;
}

function splitCoordsByPlacement(coords) {
  const front = [];
  const rear = [];
  for (const coord of (Array.isArray(coords) ? coords : [])) {
    if (coord.placement === "rear") rear.push(coord);
    else front.push(coord);
  }
  return { front, rear };
}

export default function Stage1LayoutCards({
  options,
  status,
  roomDims,
  subwooferInstances,
  frontSubsCfg,
  rearSubsCfg,
  commitInstances,
  stage1Fingerprint,
  onApplied,
  waitingReason,
  stage1CandidateCount,
  stage1Previews,
}) {
  const [selectedKey, setSelectedKey] = useState(null);
  const [applyError, setApplyError] = useState(null);

  // Map response previews to options by quantity. The previews array is
  // aligned with the valid (non-null) options in order.
  const previewMap = useMemo(() => {
    const map = new Map();
    if (!stage1Previews?.previews) return map;
    const validOptions = (Array.isArray(options) ? options : []).filter(Boolean);
    stage1Previews.previews.forEach((preview, i) => {
      if (validOptions[i] && preview) {
        map.set(validOptions[i].quantity, preview);
      }
    });
    return map;
  }, [stage1Previews, options]);

  const isApplied = (option) => arrangementMatchesStage1Option(subwooferInstances, option);

  const handleConfirmApply = (option) => {
    setApplyError(null);
    if (!option) return;
    if (typeof commitInstances !== "function") {
      setApplyError("Subwoofer instances are not ready.");
      return;
    }
    const coords = sourcesFromOption(option);
    const { front, rear } = splitCoordsByPlacement(coords);

    // Stage 1 Apply: use the Stage 1 geometry fingerprint (model-independent).
    // No evidence/physical checks (no Stage 2 evaluation). No boundary
    // re-check (no model → no cabinet dimensions).
    const applyState = resolveQuantityApplyState({
      candidateFingerprint: option.fingerprint,
      currentFingerprint: stage1Fingerprint,
      coordinates: coords,
      quantity: option.quantity,
      roomDims: null,
      model: null,
    });
    if (!applyState.canApply) {
      setApplyError(STALE_OR_BLOCKED[applyState.blockReason] || "This layout can no longer be applied.");
      return;
    }

    const result = buildQuantityApplyInstances({
      coordinates: coords,
      quantity: option.quantity,
      instances: subwooferInstances,
      defaults: {
        model: frontSubsCfg?.model || rearSubsCfg?.model || null,
        bottomHeightM: Number.isFinite(Number(frontSubsCfg?.bottomHeightM))
          ? Number(frontSubsCfg.bottomHeightM)
          : Number.isFinite(Number(rearSubsCfg?.bottomHeightM))
            ? Number(rearSubsCfg.bottomHeightM) : 0,
        frontOrientation: frontSubsCfg?.orientation ?? null,
        rearOrientation: rearSubsCfg?.orientation ?? null,
      },
      frontCoords: front,
      rearCoords: rear,
    });
    if (!result.valid) {
      setApplyError(STALE_OR_BLOCKED[result.error] || "This layout could not be applied exactly. No changes were made.");
      return;
    }
    try {
      commitInstances(result.instances, {
        front: { placementMode: "manual", isManual: true },
        rear: { placementMode: "manual", isManual: true },
      });
    } catch (err) {
      setApplyError(err?.message || "Could not save a restore point. The layout was not applied.");
      return;
    }
    setSelectedKey(null);
    if (typeof onApplied === "function") onApplied();
  };

  const discovering = status === "discovering";
  const waiting = status === "waiting";

  const orderedOptions = useMemo(
    () => (Array.isArray(options) ? options : []),
    [options],
  );

  return (
    <div className="space-y-3" data-bda-stage="choose-layout-stage1" data-stage1-status={status}>
      <div>
        <h4 className="text-[15px] font-semibold text-[#1B1A1A]" style={{ fontFamily: "Didact Gothic, sans-serif" }}>
          Choose Subwoofer Layout
        </h4>
        <p className="mt-1 text-[12px] text-[#625143]">
          {waiting
            ? "Enter room dimensions and seating to discover layouts."
            : discovering
              ? "Discovering model-independent layouts for this room…"
              : "Model-independent placement recommendations. Select a layout, then choose a subwoofer model for product evaluation."}
        </p>
        {Number.isFinite(stage1CandidateCount) && stage1CandidateCount > 0 && !discovering && (
          <p className="mt-1.5 text-[12px] text-[#625143]">
            {stage1CandidateCount >= 100
              ? <>ADI has evaluated <span className="font-bold text-[#1B1A1A]">{stage1CandidateCount}</span> potential subwoofer arrangements for your room.</>
              : <>ADI has evaluated {stage1CandidateCount} potential subwoofer arrangements for your room.</>}
          </p>
        )}
      </div>

      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
        {discovering && [0, 1, 2].map((q) => (
          <div key={q} className="h-24 animate-pulse rounded-lg border border-dashed border-[#C9C2B8] bg-[#F8F7F4]" />
        ))}
        {!discovering && orderedOptions.map((option) => {
          const key = optionKeyFor(option);
          return (
            <Stage1Card
              key={key}
              option={option}
              optionKey={key}
              roomDims={roomDims}
              responsePreview={option ? previewMap.get(option.quantity) || null : null}
              responseYMin={stage1Previews?.yMin}
              responseYMax={stage1Previews?.yMax}
              isSelected={selectedKey === key}
              onSelect={setSelectedKey}
              isApplied={isApplied(option)}
              onConfirmApply={() => handleConfirmApply(option)}
              canApply={true}
            />
          );
        })}
      </div>
      {!discovering && orderedOptions.every((o) => !o) && !waiting && (
        <p className="text-[11px] text-[#625143]">No wall arrangements discovered for this room. Manual placement remains available.</p>
      )}
      {applyError && <p className="text-[11px] text-red-700">{applyError}</p>}
    </div>
  );
}

const STALE_OR_BLOCKED = {
  "stale-candidate-room-or-seating-changed": "The room or seating has changed since this layout was evaluated. Re-evaluate before applying.",
  "no-coordinates": "This layout has no subwoofer positions.",
  "unsupported-quantity": "This layout uses an unsupported subwoofer quantity.",
  "arrangement-mismatch": "This layout could not be applied exactly. No changes were made.",
};