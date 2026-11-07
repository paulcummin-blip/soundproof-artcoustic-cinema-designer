// EvaluatedLayoutCards.jsx
// ---------------------------------------------------------------------------
// The evaluated-recommendation presentation for the Subwoofer Design Starting
// Layout cards. Rendered IN PLACE of the geometric card column when the
// cross-quantity Stage 1/2 evaluation has produced current, evaluated options
// for 1, 2 and 4 subwoofers.
//
// Each card shows the option's subwoofer quantity, its exact proposed layout
// (mini schematic + room plan), and the Stage 2 canonical evaluation's
// predicted P19, P20 Primary and P20 Secondary where that evidence is valid.
// It never shows invented or Stage 1 proxy-derived RP22 results — when the
// evaluation did not produce valid P19/P20 for an option the fields render "—".
//
// Selecting an option is a two-step approval: click to select, then click
// "Apply" to confirm. Apply uses the existing quantity-aware Apply authority
// (quantityPlacementApplyAuthority) so 1→2, 2→4 and 4→1 transitions preserve
// models, coordinates, orientations and heights, keep a snapshot for exact
// Undo, and are fingerprint-protected against stale candidates. The
// authoritative recalculation is triggered by the caller after Apply (the
// existing bass-analysis lifecycle).
//
// No grades, no lengthy explanations, no extra controls. Compact and visually
// consistent with Sound Proof.
// ---------------------------------------------------------------------------

import React, { useMemo, useState } from "react";
import {
  buildInstanceSnapshot,
  restoreInstanceSnapshot,
  buildQuantityApplyInstances,
  buildQuantityApplyProvenance,
  resolveQuantityApplyState,
} from "@/components/room/bass/optimiserPlan/quantityPlacementApplyAuthority";
import { coordinatesMatch } from "@/components/room/bass/best-layout/applyRecommendationUtils";
import { normalizeLevelForDisplay } from "@/components/utils/rp22LevelDisplay";
import { formatDb } from "@/components/utils/formatDb";

const LAYOUT_TITLES = { 1: "1 Subwoofer", 2: "2 Subwoofers", 4: "4 Subwoofers" };

function p20Phrase(summary) {
  if (!summary) return "—";
  const level = normalizeLevelForDisplay(summary.level);
  const variation = Number.isFinite(Number(summary.variationDb)) ? formatDb(summary.variationDb) : null;
  return variation ? `${level} · ${variation}` : level;
}

function p19Phrase(p19) {
  if (!p19) return "—";
  const level = normalizeLevelForDisplay(p19.level);
  const variation = Number.isFinite(Number(p19.variationDb)) ? formatDb(p19.variationDb) : null;
  return variation ? `${level} · ${variation}` : level;
}

function sourcesFromOption(option) {
  return (option?.coordinates || []).map((coord) => ({
    x: Number(coord.x),
    y: Number(coord.y),
    placement: coord.placement,
  }));
}

function currentSourcesFrom(subs) {
  return (Array.isArray(subs) ? subs : [])
    .filter((sub) => sub?.enabled !== false)
    .map((sub) => {
      const position = sub?.position || sub;
      const group = sub?.group || sub?.legacyGroup;
      const placement = group === "rear" ? "rear" : "front";
      return {
        id: sub?.id,
        x: Number(position?.x),
        y: Number(position?.y),
        placement,
      };
    })
    .filter((source) => Number.isFinite(source.x) && Number.isFinite(source.y));
}

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
      style={{ minHeight: 180 }}
      role="img"
      aria-label="Room plan showing seating and evaluated subwoofer positions"
    >
      <text x={width / 2} y={-pad * 0.25} textAnchor="middle" fontSize={Math.max(0.12, pad * 0.45)} fill="#8A7B6A">FRONT</text>
      <rect x="0" y="0" width={width} height={length} fill="white" stroke="#BFB9AE" strokeWidth={Math.max(0.02, subRadius * 0.1)} />
      <line x1={0} y1={0} x2={width} y2={0} stroke="#1B1A1A" strokeWidth={Math.max(0.04, subRadius * 0.22)} />
      {rspPosition && Number.isFinite(rspPosition.x) && (
        <line
          x1={rspPosition.x} y1={0} x2={rspPosition.x} y2={length}
          stroke="#BFB9AE" strokeWidth={Math.max(0.015, subRadius * 0.08)}
          strokeDasharray={`${subRadius * 0.5} ${subRadius * 0.4}`}
        />
      )}
      {(Array.isArray(seatingPositions) ? seatingPositions : []).map((seat) => {
        const x = Number(seat?.x);
        const y = Number(seat?.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        const isPrimary = seat?.isPrimary || seat?.priority === "primary";
        return (
          <circle key={seat?.id} cx={x} cy={y} r={seatRadius}
            fill={isPrimary ? "#D6D0C4" : "#E8E5DF"} stroke="#BFB9AE"
            strokeWidth={Math.max(0.012, seatRadius * 0.12)} />
        );
      })}
      {(layoutSources || []).map((source, index) => {
        const x = Number(source?.x);
        const y = Number(source?.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        return (
          <g key={index}>
            <circle cx={x} cy={y} r={subRadius} fill="#213428" />
            <text x={x} y={y + subRadius * 0.34} textAnchor="middle" fontSize={subRadius} fontWeight="700" fill="white">{index + 1}</text>
          </g>
        );
      })}
    </svg>
  );
}

function LayoutMiniSchematic({ option, roomDims }) {
  const width = Number(roomDims?.widthM) || 1;
  const length = Number(roomDims?.lengthM) || 1;
  const radius = Math.max(0.04, Math.min(width, length) * 0.04);
  return (
    <svg viewBox={`0 0 ${width} ${length}`} className="h-20 w-full rounded border border-[#E7E4DF] bg-[#F8F7F4]" role="img"
      aria-label={`Schematic: ${option?.quantity || 0} subwoofers`}>
      <rect x="0" y="0" width={width} height={length} fill="none" stroke="#BFB9AE" strokeWidth={Math.max(0.015, radius * 0.15)} />
      <line x1={0} y1={0} x2={width} y2={0} stroke="#1B1A1A" strokeWidth={Math.max(0.03, radius * 0.3)} />
      {(option?.coordinates || []).map((coord, index) => {
        const x = Number(coord?.x);
        const y = Number(coord?.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        return <circle key={index} cx={x} cy={y} r={radius} fill="#213428" />;
      })}
    </svg>
  );
}

function MetricRow({ label, value, muted }) {
  return (
    <div className="flex items-center justify-between text-[10px] leading-tight">
      <span className="text-[#8A7B6A]">{label}</span>
      <span className={muted ? "text-[#8A7B6A]" : "font-semibold text-[#1B1A1A]"}>{value}</span>
    </div>
  );
}

function EvaluatedCard({ option, roomDims, isSelected, onSelect, isApplied, onConfirmApply, canApply, blockReason }) {
  if (!option) {
    return (
      <div className="rounded-lg border border-dashed border-[#C9C2B8] bg-white/60 p-2.5">
        <div className="text-[12px] font-semibold text-[#1B1A1A]">No layout</div>
        <div className="mt-0.5 text-[10px] text-[#8A7B6A]">No evaluated option for this room.</div>
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
        <div className="text-[13px] font-semibold text-[#1B1A1A]">{LAYOUT_TITLES[option.quantity]}</div>
        {isApplied && (
          <span className="rounded-full bg-[#213428] px-1.5 py-0.5 text-[9px] font-semibold uppercase text-white">Applied</span>
        )}
      </div>
      <div className="mt-1.5">
        <LayoutMiniSchematic option={option} roomDims={roomDims} />
      </div>
      <div className="mt-2 space-y-0.5">
        <MetricRow label="Predicted P19" value={option.valid ? p19Phrase(option.p19) : "—"} muted={!option.valid} />
        <MetricRow label="P20 Primary" value={option.valid ? p20Phrase(option.p20Primary) : "—"} muted={!option.valid} />
        <MetricRow label="P20 Secondary" value={option.valid ? p20Phrase(option.p20Secondary) : "—"} muted={!option.valid} />
      </div>
      {!option.valid && option.terminal && (
        <div className="mt-1.5 text-[9px] text-[#8A7B6A]">Placement could not be evaluated for this room.</div>
      )}
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
          <button type="button" onClick={() => onSelect(option.quantity)} disabled={isApplied}
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

export default function EvaluatedLayoutCards({
  options,
  status,
  roomDims,
  seatingPositions,
  rspPosition,
  subwooferInstances,
  frontSubsCfg,
  rearSubsCfg,
  commitInstances,
  currentDesignFingerprint,
  onApplied,
  onUndoAvailable,
  undoAvailable,
}) {
  const [selectedQuantity, setSelectedQuantity] = useState(null);
  const [applyError, setApplyError] = useState(null);
  const [snapshot, setSnapshot] = useState(null);

  const currentSources = useMemo(() => currentSourcesFrom(subwooferInstances), [subwooferInstances]);

  const optionsByQuantity = useMemo(() => {
    const map = {};
    for (const option of (Array.isArray(options) ? options : [])) {
      map[option.quantity] = option;
    }
    return map;
  }, [options]);

  const selectedOption = selectedQuantity ? optionsByQuantity[selectedQuantity] : null;
  const previewSources = useMemo(
    () => (selectedOption ? sourcesFromOption(selectedOption) : null),
    [selectedOption],
  );

  const isApplied = (option) => Boolean(option) && coordinatesMatch(currentSources, sourcesFromOption(option));

  const handleConfirmApply = (option) => {
    setApplyError(null);
    if (!option) return;
    if (typeof commitInstances !== "function") {
      setApplyError("Subwoofer instances are not ready.");
      return;
    }
    const coords = sourcesFromOption(option);
    const { front, rear } = splitCoordsByPlacement(coords);
    const applyState = resolveQuantityApplyState({
      candidateFingerprint: option.fingerprint || currentDesignFingerprint,
      currentFingerprint: currentDesignFingerprint,
      coordinates: coords,
      quantity: option.quantity,
    });
    if (!applyState.canApply) {
      setApplyError(STALE_OR_BLOCKED[applyState.blockReason] || "This layout can no longer be applied.");
      return;
    }
    const previous = buildInstanceSnapshot(subwooferInstances);
    const result = buildQuantityApplyInstances({
      coordinates: coords,
      quantity: option.quantity,
      instances: subwooferInstances,
      defaults: {
        model: option.model || frontSubsCfg?.model || rearSubsCfg?.model || null,
        bottomHeightM: option.bottomHeightM,
        orientation: rear.length > 0 && front.length === 0 ? 180 : 0,
      },
      frontCoords: front,
      rearCoords: rear,
    });
    setSnapshot(previous);
    commitInstances(result.instances, {
      front: { placementMode: "manual", isManual: true },
      rear: { placementMode: "manual", isManual: true },
    });
    const provenance = buildQuantityApplyProvenance({
      snapshot: previous,
      candidateId: option.finalistId,
      quantity: option.quantity,
      coordinates: coords,
      candidateFingerprint: option.fingerprint,
    });
    onApplied?.(provenance);
    setSelectedQuantity(null);
  };

  const handleUndo = () => {
    if (!snapshot || typeof commitInstances !== "function") return;
    commitInstances(restoreInstanceSnapshot(snapshot), {
      front: { placementMode: "manual", isManual: true },
      rear: { placementMode: "manual", isManual: true },
    });
    setSnapshot(null);
    setApplyError(null);
    onUndoAvailable?.(false);
  };

  React.useEffect(() => {
    onUndoAvailable?.(Boolean(snapshot));
  }, [snapshot, onUndoAvailable]);

  const evaluating = status === "evaluating";
  const waiting = status === "waiting";

  return (
    <div className="space-y-3" data-bda-stage="choose-layout" data-evaluated-status={status}>
      <div>
        <h4 className="text-[15px] font-semibold text-[#1B1A1A]" style={{ fontFamily: "Didact Gothic, sans-serif" }}>
          Choose Subwoofer Layout
        </h4>
        <p className="mt-1 text-[12px] text-[#625143]">
          {waiting
            ? "Select a subwoofer model and design target to evaluate layouts."
            : evaluating
              ? "Evaluating front and rear wall arrangements for this room…"
              : "Evaluated layouts for the current room, seating and reference position."}
        </p>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 basis-[320px] max-w-[420px] space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[#625143]">Room and Seating</div>
          <RoomPlanPreview
            roomDims={roomDims}
            seatingPositions={seatingPositions}
            layoutSources={previewSources}
            rspPosition={rspPosition}
          />
          {selectedOption && (
            <div className="text-[11px] text-[#625143]">
              <span className="font-semibold">Current Selection:</span> {LAYOUT_TITLES[selectedOption.quantity]}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 basis-[320px] max-w-[420px] space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[#625143]">Evaluated Layouts</div>
          {evaluating && (
            <div className="space-y-2">
              {[1, 2, 4].map((q) => (
                <div key={q} className="h-24 animate-pulse rounded-lg border border-dashed border-[#C9C2B8] bg-[#F8F7F4]" />
              ))}
            </div>
          )}
          {!evaluating && options.length > 0 && (
            <div className="space-y-2">
              {[1, 2, 4].map((quantity) => (
                <EvaluatedCard
                  key={quantity}
                  option={optionsByQuantity[quantity]}
                  roomDims={roomDims}
                  isSelected={selectedQuantity === quantity}
                  onSelect={setSelectedQuantity}
                  isApplied={optionsByQuantity[quantity] ? isApplied(optionsByQuantity[quantity]) : false}
                  onConfirmApply={() => handleConfirmApply(optionsByQuantity[quantity])}
                  canApply
                />
              ))}
            </div>
          )}
          {!evaluating && options.length === 0 && !waiting && (
            <p className="text-[11px] text-[#625143]">No evaluated layouts available. Manual placement remains available.</p>
          )}
          {undoAvailable && (
            <button type="button" onClick={handleUndo}
              className="w-full rounded-md border border-[#D9D5CE] px-3 py-2 text-[11px] font-medium text-[#1B1A1A] hover:bg-[#F3F1EC]">
              Undo applied layout
            </button>
          )}
          {applyError && <p className="text-[11px] text-red-700">{applyError}</p>}
        </div>
      </div>
    </div>
  );
}

const STALE_OR_BLOCKED = {
  "stale-candidate-room-or-seating-changed": "The room or seating has changed since this layout was evaluated. Re-evaluate before applying.",
  "no-coordinates": "This layout has no subwoofer positions.",
  "unsupported-quantity": "This layout uses an unsupported subwoofer quantity.",
};

function splitCoordsByPlacement(coords) {
  const front = [];
  const rear = [];
  for (const coord of (Array.isArray(coords) ? coords : [])) {
    if (coord.placement === "rear") rear.push(coord);
    else front.push(coord);
  }
  return { front, rear };
}