// CombinedDetail.jsx
// Detail component for the "Best Overall Improvement" stage row.
// Shows the single best confirmed result across ALL interventions:
//   - Failing seats: before → after
//   - Primary-seat floor: before → after
//   - P19: before → after (primary seat)
//   - P20: before → after (primary seat)
//   - Changes: full list of all actual changes
//
// The winner may legitimately be: Delay only, Phase + Delay, Seating +
// retuned calibration, Position + calibration, or a full combined solution.

import React from "react";
import RP22GradingPill from "@/components/ui/RP22GradingPill";
import { countFailingSeats } from "./zeroFailOptimiser";
import { buildWhatChanged } from "./improveBassV2WhatChanged";

function numericLevel(value) {
  if (Number.isFinite(Number(value))) return Math.max(0, Math.min(4, Number(value)));
  const match = String(value || "").match(/^L([1-4])$/i);
  return match ? Number(match[1]) : 0;
}

function fmtDb(raw) {
  if (!Number.isFinite(Number(raw))) return "—";
  return Math.abs(Number(raw)).toFixed(2);
}

function primarySeatMetric(perSeatArray) {
  if (!Array.isArray(perSeatArray) || !perSeatArray.length) return null;
  return perSeatArray.find((s) => s?.isPrimary === true) || perSeatArray[0];
}

/**
 * Compute the primary-seat floor: the worst (minimum) RP22 level across
 * all primary-seat P19 and P20 results. This is the "floor" — the worst-
 * case primary seat grade.
 */
function primarySeatFloor(result) {
  const p19 = (Array.isArray(result?.perSeatP19) ? result.perSeatP19 : []).filter((s) => s.isPrimary);
  const p20 = (Array.isArray(result?.perSeatP20) ? result.perSeatP20 : []).filter((s) => s.isPrimary);
  const allLevels = [...p19, ...p20].map((s) => numericLevel(s.level));
  return allLevels.length ? Math.min(...allLevels) : 0;
}

function floorText(level) {
  return level > 0 ? `L${level}` : "FAIL";
}

function MetricBeforeAfter({ label, before, after }) {
  const beforeLevel = numericLevel(before?.level);
  const afterLevel = numericLevel(after?.level);
  const beforeRaw = fmtDb(before?.variationDbRaw);
  const afterRaw = fmtDb(after?.variationDbRaw);

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-semibold text-[#625143] w-8">{label}</span>
      <RP22GradingPill level={beforeLevel} compact style={{ flex: 1, whiteSpace: "normal", minWidth: 0 }}>
        {beforeRaw}
      </RP22GradingPill>
      <span className="text-[10px] text-[#8A7B6A]">→</span>
      <RP22GradingPill level={afterLevel} compact style={{ flex: 1, whiteSpace: "normal", minWidth: 0 }}>
        {afterRaw}
      </RP22GradingPill>
    </div>
  );
}

export default function CombinedDetail({ result, currentResult, currentInstances, snapshot }) {
  if (!result) return null;

  const coords = result?.positionCoordinates || result?.coordinates || [];
  const hasPositions = coords.length > 0;
  const hasSeating = !!result?.seatingPositions && (result?.seatingOffsetMm || 0) !== 0;

  // ── Failing seats ──
  const beforeFails = countFailingSeats(currentResult);
  const afterFails = countFailingSeats(result);

  // ── Primary-seat floor ──
  const beforeFloor = primarySeatFloor(currentResult);
  const afterFloor = primarySeatFloor(result);

  // ── P19 / P20 (primary seat) ──
  const beforeP19 = primarySeatMetric(currentResult?.perSeatP19);
  const afterP19 = primarySeatMetric(result.perSeatP19);
  const beforeP20 = primarySeatMetric(currentResult?.perSeatP20);
  const afterP20 = primarySeatMetric(result.perSeatP20);

  // ── Changes list ──
  const winnerForChanges = {
    ...result,
    coordinates: result.positionCoordinates || result.coordinates,
    appliedTuning: result.appliedTuning || result.tuning,
  };
  const augmentedSnapshot = {
    ...snapshot,
    positions: (snapshot?.positions && snapshot.positions.length > 0)
      ? snapshot.positions
      : (Array.isArray(currentInstances)
        ? currentInstances.filter((s) => s.enabled !== false).map((inst) => ({
            x: Number(inst.position?.x) || 0,
            y: Number(inst.position?.y) || 0,
          }))
        : []),
    tuning: (snapshot?.tuning && snapshot.tuning.length > 0)
      ? snapshot.tuning
      : (Array.isArray(currentInstances)
        ? currentInstances.filter((s) => s.enabled !== false).map((inst) => ({
            delayMs: Number(inst.delayMs) || 0,
            gainDb: Number(inst.gainDb) || 0,
            polarity: Number(inst.polarity) || 0,
          }))
        : []),
  };
  const whatChanged = buildWhatChanged(augmentedSnapshot, winnerForChanges);
  const allChanges = [...whatChanged.designChanges, ...whatChanged.calibrationChanges];
  if (hasSeating) {
    const offset = result?.seatingOffsetMm || 0;
    const dir = offset < 0 ? "toward screen" : "away from screen";
    allChanges.unshift(`Seating — ${Math.abs(offset)} mm ${dir}`);
  }

  return (
    <div className="mt-1.5 space-y-1.5">
      {/* Failing seats */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-semibold text-[#625143] w-20">Failing seats</span>
        <span className="text-[10px] text-[#1B1A1A] font-semibold">{beforeFails}</span>
        <span className="text-[10px] text-[#8A7B6A]">→</span>
        <span className={`text-[10px] font-bold ${afterFails < beforeFails ? "text-[#213428]" : "text-[#1B1A1A]"}`}>
          {afterFails}
        </span>
      </div>

      {/* Primary-seat floor */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-semibold text-[#625143] w-20">Primary floor</span>
        <span className="text-[10px] text-[#1B1A1A] font-semibold">{floorText(beforeFloor)}</span>
        <span className="text-[10px] text-[#8A7B6A]">→</span>
        <span className={`text-[10px] font-bold ${afterFloor > beforeFloor ? "text-[#213428]" : "text-[#1B1A1A]"}`}>
          {floorText(afterFloor)}
        </span>
      </div>

      {/* P19 / P20 */}
      <div className="grid grid-cols-2 gap-1.5">
        <MetricBeforeAfter label="P19" before={beforeP19} after={afterP19} />
        <MetricBeforeAfter label="P20" before={beforeP20} after={afterP20} />
      </div>

      {/* Changes list */}
      {allChanges.length > 0 && (
        <div className="mt-1 rounded-md border border-[#E0DDD7] bg-white p-2">
          <div className="text-[10px] font-semibold text-[#213428] mb-1">Changes applied together</div>
          <ul className="space-y-0.5">
            {allChanges.map((change, i) => (
              <li key={i} className="text-[10px] leading-relaxed text-[#625143]">• {change}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}