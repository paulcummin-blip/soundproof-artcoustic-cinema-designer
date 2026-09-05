// AppliedLayoutPills — P14/P18/P19/P20 result strip + per-seat P19/P20 map
// shown ONLY on the applied recommendation card when a valid, non-stale,
// publication-verified authoritative result exists in the canonical cache.
//
// Rules (per simplification task):
//   - P19 and P20 headline pills always say "SEAT" (seat-scoped parameters).
//   - Per-seat P19/P20 results are permanently visible below the pills.
//   - Seat tiles reproduce the actual project seating row layout.
//   - Primary seats use a dark border; Secondary seats use a light border.
//   - Never show fake/preview/stale grades.
//   - If no matching authoritative result exists, render nothing.
//
// This is presentation-only. It does NOT trigger any calculation.

import React from "react";
import RP22GradingPill from "@/components/ui/RP22GradingPill";
import { useSharedBassResults } from "@/components/room/bass/bassResultsStore";
import { formatOfficialBassResults } from "@/components/room/bass/bassResultsPresentation";
import { resolveP14TargetSelectionState } from "@/components/room/bass/p14TargetSelectionState";
import { PRIMARY } from "@/components/utils/seatPriorityAuthority";

const PARAM_KEYS = ["p14", "p18", "p19", "p20"];
const PARAM_LABELS = { p14: "P14", p18: "P18", p19: "P19", p20: "P20" };

export default function AppliedLayoutPills({ seatingPositions = [] }) {
  const shared = useSharedBassResults();
  const authorityStatus = shared?.completedBassAuthority?.authorityStatus || "UNCALCULATED";
  const isCalculating = shared?.calculationInProgress === true;
  const hasResult = shared?.hasCurrentResult === true;
  const isStale = authorityStatus === "STALE";
  const p14Selection = resolveP14TargetSelectionState(shared?.authoritative?.requested);
  const noP14TargetSelected = p14Selection.noP14TargetSelected;

  // Only render when a real, current, non-stale authoritative result exists.
  if (!hasResult || isStale || isCalculating || noP14TargetSelected) return null;

  const formatted = formatOfficialBassResults(
    shared.completedBassAuthority,
    shared.lifecycle,
    seatingPositions,
    Date.now(),
    noP14TargetSelected,
    {
      p14TargetBasis: shared.authoritative?.requested?.p14TargetBasis,
      p18TargetBasis: shared.authoritative?.requested?.p18TargetBasis,
    },
  );

  // Publication-verified authoritative result required.
  if (!formatted.isReady) return null;

  const pills = formatted.pills || {};
  const p19Rows = formatted.p19Rows || [];
  const p20Rows = formatted.p20Rows || [];

  // Build combined per-seat map from P19 and P20 rows.
  const seatMap = new Map();
  const mergeSeat = (seat, paramKey) => {
    const id = seat.seatId;
    if (!seatMap.has(id)) {
      seatMap.set(id, {
        seatId: id,
        row: seat.row,
        column: seat.column,
        priority: seat.priority,
        p19: null,
        p20: null,
      });
    }
    seatMap.get(id)[paramKey] = seat;
  };
  p19Rows.forEach((r) => r.seats.forEach((s) => mergeSeat(s, "p19")));
  p20Rows.forEach((r) => r.seats.forEach((s) => mergeSeat(s, "p20")));

  // Group by row, sorted by row then column.
  const rowsMap = new Map();
  [...seatMap.values()].forEach((seat) => {
    if (!rowsMap.has(seat.row)) rowsMap.set(seat.row, []);
    rowsMap.get(seat.row).push(seat);
  });
  const rows = [...rowsMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([row, seats]) => ({
      row,
      seats: seats.sort((a, b) => a.column - b.column),
    }));

  // Assign sequential seat labels S1, S2, ... across all rows.
  let seatCounter = 0;
  rows.forEach((r) => r.seats.forEach((s) => {
    seatCounter += 1;
    s.label = `S${seatCounter}`;
  }));

  const hasPerSeatResults = rows.some((r) => r.seats.some((s) => s.p19 || s.p20));

  return (
    <div className="space-y-3" aria-label="Applied layout authoritative results">
      {/* Parameter pills — clean 4-column row (wraps to 2 on narrow widths) */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PARAM_KEYS.map((key) => {
          const pill = pills[key] || { resultText: "—", level: "—" };
          return (
            <div key={key} className="flex flex-col items-center gap-1">
              <span className="text-[10px] font-semibold text-[#213428]">{PARAM_LABELS[key]}</span>
              <RP22GradingPill level={pill.level} compact style={{ width: "100%", whiteSpace: "normal", minWidth: "0" }}>
                {pill.resultText}
              </RP22GradingPill>
            </div>
          );
        })}
      </div>

      {/* Per-seat P19/P20 results — permanently visible when authoritative */}
      {hasPerSeatResults && (
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.row}>
              <div className="mb-1 text-[10px] font-medium text-[#8A7B6A]">Row {row.row}</div>
              <div
                className="grid gap-2"
                style={{ gridTemplateColumns: `repeat(${row.seats.length}, minmax(0, 1fr))` }}
              >
                {row.seats.map((seat) => (
                  <SeatTile key={seat.seatId} seat={seat} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SeatTile({ seat }) {
  const isPrimary = seat.priority === PRIMARY;
  const borderClass = isPrimary ? "border-[#213428]" : "border-[#D9D5CE]";
  const p19Level = seat.p19?.level || "—";
  const p19Var = seat.p19?.displayVariationDb || "—";
  const p20Level = seat.p20?.level || "—";
  const p20Var = seat.p20?.displayVariationDb || "—";

  return (
    <div className={`rounded-md border ${borderClass} bg-white px-2 py-1.5`}>
      <div className="text-[11px] font-semibold text-[#1B1A1A]">{seat.label}</div>
      <div className="mt-1 space-y-0.5">
        <SeatParamLine label="P19" level={p19Level} variation={p19Var} />
        <SeatParamLine label="P20" level={p20Level} variation={p20Var} />
      </div>
    </div>
  );
}

function SeatParamLine({ label, level, variation }) {
  return (
    <div className="flex items-center justify-between gap-1 text-[9px]">
      <span className="text-[#625143]">{label}</span>
      <span className="font-semibold text-[#1B1A1A]">{level}</span>
      <span className="text-[#625143]">{variation}</span>
    </div>
  );
}