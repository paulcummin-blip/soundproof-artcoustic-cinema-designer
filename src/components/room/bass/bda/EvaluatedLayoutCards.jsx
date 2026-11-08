// EvaluatedLayoutCards.jsx
// ---------------------------------------------------------------------------
// The evaluated-recommendation presentation for the Subwoofer Design Starting
// Layout cards. Rendered IN PLACE of the geometric card column when the
// cross-quantity Stage 1/2 evaluation has produced current, evaluated options.
//
// Each quantity surfaces ONE practical front/rear-wall arrangement (the normal
// recommendation) plus zero or more exceptional side/mixed-wall ALTERNATIVES
// that deliver an actual whole-Level improvement. The practical option is
// always visible; alternatives are labelled "Alternative placement" and carry
// a short evidence-based note describing the specific RP22 Level gain and the
// installation compromise. The designer decides whether the acoustic benefit
// justifies the less convenient installation.
//
// Each card shows the option's subwoofer quantity, its exact proposed layout
// (mini schematic), and the Stage 2 canonical evaluation's predicted P19,
// P20 Primary and P20 Secondary where that evidence is valid. It never shows
// invented or Stage 1 proxy-derived RP22 results — when the evaluation did not
// produce valid P19/P20 for an option the fields render "—".
//
// Selecting any option is a two-step approval: click to select, then click
// "Apply" to confirm. Apply uses the existing quantity-aware Apply authority
// (quantityPlacementApplyAuthority) so 1→2, 2→4 and 4→1 transitions preserve
// models, coordinates, orientations and heights, and are fingerprint-protected
// against stale candidates. The pre-apply checkpoint is captured by the
// caller's checkpointed commit wrapper, so the existing RestorePreviousDesignBar
// owns exact Undo for every quantity transition. This card holds no second,
// temporary Undo mechanism. The authoritative recalculation is triggered by the
// existing bass-analysis lifecycle after Apply.
//
// No grades, no lengthy explanations, no extra controls. Compact and visually
// consistent with Sound Proof.
// ---------------------------------------------------------------------------

import React, { useMemo, useState } from "react";
import {
  buildQuantityApplyInstances,
  resolveQuantityApplyState,
} from "@/components/room/bass/optimiserPlan/quantityPlacementApplyAuthority";
import { coordinatesMatch } from "@/components/room/bass/best-layout/applyRecommendationUtils";
import { normaliseModelKey } from "@/components/models/speakers/registry";
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

// Expected cabinet rotation for a wall placement. The recommendation surfaces
// only front/rear-wall arrangements, so orientation is a deterministic read of
// the wall the active cabinet sits at.
const EXPECTED_ROTATION_BY_PLACEMENT = { front: 0, rear: 180 };

function approxEqual(value, target, tolerance) {
  return Math.abs(Number(value) - Number(target)) <= tolerance;
}

/**
 * Full active-arrangement match between the live enabled subwoofer instances
 * and an evaluated option. A recommendation is "Applied" only when the current
 * canonical design matches the option on EVERY relevant attribute:
 *
 *   - enabled quantity (exact count of enabled cabinets)
 *   - exact active cabinet positions, grouped by wall
 *   - subwoofer model (all enabled cabinets share the option's model)
 *   - cabinet orientation per wall (front 0°, rear 180°)
 *   - cabinet bottom height (all enabled cabinets match the option height)
 *
 * Disabled or historical instances are excluded up front, so an arrangement
 * that merely coincides with a stale or disabled cabinet can never produce a
 * false match. This is stricter than coordinatesMatch alone and is the single
 * authority for the "Applied" badge and the Manual-arrangement state.
 */
export function arrangementMatchesOption(instances, option) {
  if (!option) return false;
  const enabled = (Array.isArray(instances) ? instances : []).filter((i) => i?.enabled !== false);
  if (enabled.length === 0) return false;
  if (enabled.length !== Number(option.quantity)) return false;

  const currentSources = enabled
    .map((sub) => {
      const position = sub?.position || {};
      const group = sub?.group || sub?.legacyGroup;
      const placement = group === "rear" ? "rear" : "front";
      return {
        x: Number(position?.x),
        y: Number(position?.y),
        placement,
        rotationDeg: Number.isFinite(Number(sub?.rotationDeg)) ? Number(sub.rotationDeg) : 0,
        bottomHeightM: Number.isFinite(Number(sub?.bottomHeightM)) ? Number(sub.bottomHeightM) : null,
        model: sub?.model || null,
      };
    })
    .filter((s) => Number.isFinite(s.x) && Number.isFinite(s.y));

  const recSources = (Array.isArray(option.coordinates) ? option.coordinates : []).map((c) => ({
    x: Number(c.x),
    y: Number(c.y),
    placement: c.placement,
  }));

  // Exact positions per wall (unordered within each wall group).
  if (!coordinatesMatch(currentSources, recSources)) return false;

  // Model: every enabled cabinet must share the option's model.
  const optModel = normaliseModelKey(option.model);
  if (!optModel) return false;
  const allSameModel = currentSources.every((s) => normaliseModelKey(s.model) === optModel);
  if (!allSameModel) return false;

  // Cabinet height: every enabled cabinet matches the option's bottom height.
  const optHeight = Number(option.bottomHeightM);
  if (Number.isFinite(optHeight)) {
    const heightOk = currentSources.every(
      (s) => Number.isFinite(s.bottomHeightM) && approxEqual(s.bottomHeightM, optHeight, 0.01),
    );
    if (!heightOk) return false;
  }

  // Orientation: each enabled cabinet's rotation matches its wall's expected
  // rotation. A front cabinet rotated to 180° (or a rear at 0°) is a different
  // arrangement even if its centre coordinate coincides.
  const orientOk = currentSources.every((s) =>
    approxEqual(s.rotationDeg, EXPECTED_ROTATION_BY_PLACEMENT[s.placement] ?? 0, 0.5),
  );
  if (!orientOk) return false;

  return true;
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

function improvementText(option) {
  if (!option?.improvement) return null;
  const parts = [];
  if (option.improvement.p19) parts.push("P19 level improved");
  if (option.improvement.primaryP20) parts.push("Primary P20 level improved");
  if (!parts.length) return null;
  return `${parts.join(" · ")} · side/mixed-wall placement`;
}

function EvaluatedCard({ option, roomDims, isSelected, onSelect, isApplied, onConfirmApply, canApply, blockReason, optionKey }) {
  if (!option) {
    return (
      <div className="rounded-lg border border-dashed border-[#C9C2B8] bg-white/60 p-2.5">
        <div className="text-[12px] font-semibold text-[#1B1A1A]">No layout</div>
        <div className="mt-0.5 text-[10px] text-[#8A7B6A]">No evaluated option for this room.</div>
      </div>
    );
  }
  const isAlternative = option.placementKind === "alternative";
  return (
    <div className={`rounded-lg border p-3 transition-all ${
      isSelected || isApplied
        ? "border-2 border-[#213428] bg-[#F3F1EC]"
        : isAlternative
          ? "border border-[#B9AEC1] bg-[#F6F2F8] hover:border-[#9A8AB0]"
          : "border border-[#D9D5CE] bg-white hover:border-[#BFB9AE]"
    }`}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[13px] font-semibold text-[#1B1A1A]">{LAYOUT_TITLES[option.quantity]}</div>
        <div className="flex items-center gap-1">
          {isAlternative && (
            <span className="rounded-full bg-[#625143] px-1.5 py-0.5 text-[9px] font-semibold uppercase text-white">Alternative placement</span>
          )}
          {isApplied && (
            <span className="rounded-full bg-[#213428] px-1.5 py-0.5 text-[9px] font-semibold uppercase text-white">Applied</span>
          )}
        </div>
      </div>
      <div className="mt-1.5">
        <LayoutMiniSchematic option={option} roomDims={roomDims} />
      </div>
      <div className="mt-2 space-y-0.5">
        <MetricRow label="Predicted P19" value={option.valid ? p19Phrase(option.p19) : "—"} muted={!option.valid} />
        <MetricRow label="P20 Primary" value={option.valid ? p20Phrase(option.p20Primary) : "—"} muted={!option.valid} />
        <MetricRow label="P20 Secondary" value={option.valid ? p20Phrase(option.p20Secondary) : "—"} muted={!option.valid} />
      </div>
      {isAlternative && option.valid && improvementText(option) && (
        <div className="mt-1.5 text-[9px] text-[#625143]">{improvementText(option)}</div>
      )}
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
  return `${option.quantity}::${option.finalistId || JSON.stringify(option.coordinates)}`;
}

export default function EvaluatedLayoutCards({
  options,
  status,
  roomDims,
  subwooferInstances,
  frontSubsCfg,
  rearSubsCfg,
  commitInstances,
  currentDesignFingerprint,
  onApplied,
}) {
  const [selectedKey, setSelectedKey] = useState(null);
  const [applyError, setApplyError] = useState(null);

  const isApplied = (option) => arrangementMatchesOption(subwooferInstances, option);

  // An option is actionable only when its own evaluated evidence is physically
  // and evidentially valid. A terminal or physically rejected option must never
  // offer Apply, regardless of how it reached the card. This is the card-level
  // mirror of the Stage 2 eligibility gate — defense in depth, not the sole
  // authority (the store already excludes rejected candidates from
  // bestFinalist, and the Apply authority re-verifies independently).
  const canApplyOption = (option) => Boolean(
    option && option.valid && !option.terminal && !option.physicalRejection,
  );

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
      option,
      roomDims,
      model: option.model || frontSubsCfg?.model || rearSubsCfg?.model || null,
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
        model: option.model || frontSubsCfg?.model || rearSubsCfg?.model || null,
        bottomHeightM: option.bottomHeightM,
        // Per-group cabinet axis orientation, resolved the SAME way Stage 2
        // resolves it (front group → frontSubsCfg.orientation, rear group →
        // rearSubsCfg.orientation). Never a facing rotation.
        frontOrientation: frontSubsCfg?.orientation ?? null,
        rearOrientation: rearSubsCfg?.orientation ?? null,
      },
      frontCoords: front,
      rearCoords: rear,
    });
    // Safety: if the built arrangement does not exactly match the evaluated
    // candidate, reject Apply. Commit nothing, calculate nothing and publish
    // nothing for a partial or mismatched recommendation.
    if (!result.valid) {
      setApplyError(STALE_OR_BLOCKED[result.error] || "This layout could not be applied exactly. No changes were made.");
      return;
    }
    // The pre-apply checkpoint is captured by the caller's
    // checkpointedCommitInstances (passed in as commitInstances), so the
    // existing RestorePreviousDesignBar owns exact Undo for the 1→2, 2→4 and
    // 4→1 quantity transitions. This card holds no second, temporary snapshot.
    // Transaction safety: if the checkpoint cannot be captured for a design
    // that has a physical subwoofer configuration, the wrapper throws and the
    // layout is not applied — the designer is not left without Restore.
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
    // Trigger the existing authoritative bass recalculation after the new
    // arrangement has committed. The caller arms a fingerprint-aware effect
    // that runs once the live bass fingerprint reflects the applied design,
    // so calculation never starts before the commit has propagated and stale
    // results from the previous arrangement are rejected by the manual
    // request's fingerprint identity check.
    if (typeof onApplied === "function") onApplied();
  };

  const evaluating = status === "evaluating";
  const waiting = status === "waiting";

  // Render the flat options array (practical first per quantity, then its
  // alternatives). This keeps the practical option and its exceptional
  // alternatives visually adjacent without a hard card-count cap.
  const orderedOptions = useMemo(
    () => (Array.isArray(options) ? options : []),
    [options],
  );

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
              : "Evaluated layouts for the current room, seating and reference position. Practical front/rear-wall placements are shown first; exceptional side/mixed-wall alternatives are labelled."}
        </p>
      </div>

      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
        {evaluating && [1, 2, 4].map((q) => (
          <div key={q} className="h-24 animate-pulse rounded-lg border border-dashed border-[#C9C2B8] bg-[#F8F7F4]" />
        ))}
        {!evaluating && orderedOptions.map((option) => {
          const key = optionKeyFor(option);
          return (
            <EvaluatedCard
              key={key}
              option={option}
              optionKey={key}
              roomDims={roomDims}
              isSelected={selectedKey === key}
              onSelect={setSelectedKey}
              isApplied={isApplied(option)}
              onConfirmApply={() => handleConfirmApply(option)}
              canApply={canApplyOption(option)}
            />
          );
        })}
      </div>
      {!evaluating && orderedOptions.length === 0 && !waiting && (
        <p className="text-[11px] text-[#625143]">No evaluated layouts available. Manual placement remains available.</p>
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
  "terminal-candidate": "This layout could not be physically evaluated for this room. No changes were made.",
  "physical-rejection": "This layout is physically invalid for this room. No changes were made.",
  "missing-p19-p20-evidence": "This layout has no valid evaluated performance evidence. No changes were made.",
  "cabinet-boundary-violation": "A cabinet in this layout sits outside the room. No changes were made.",
  "invalid-room": "The room dimensions are not valid. No changes were made.",
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