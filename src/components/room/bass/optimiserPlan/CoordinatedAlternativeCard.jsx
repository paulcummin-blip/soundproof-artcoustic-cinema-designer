// CoordinatedAlternativeCard.jsx
// ---------------------------------------------------------------------------
// One compact, Apple-style card for a coordinated physical alternative.
//
// Always visible (compact):
//   • Mini plan-view SVG showing subwoofer positions
//   • Subwoofer model and quantity
//   • Seating movement
//   • P19, P20 Primary, P20 Secondary, P14 as a compact stat row
//   • Material improvement (one line, when present)
//
// Expandable (progressive disclosure):
//   • Exact subwoofer XYZ coordinates, orientation, installation height
//   • Exact seating coordinates and priority
//   • Per-seat P20 before/after (only rows with comparable evidence)
//   • Tuning: delay, gain, polarity, phase, crossover
//   • RSP mode and position
//   • Remaining compromises (seats still below L3)
//
// Presentation only — every value is read from the persisted coordinated
// summary. No calculation, no fabrication, no engineering authority change.
// ---------------------------------------------------------------------------

import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import MiniPlanView from "./MiniPlanView.jsx";
import { formatCrossover } from "./formatCrossover.js";

const LEVEL_LABEL = { 1: "L1", 2: "L2", 3: "L3", 4: "L4" };

function levelLabel(level) {
  const n = Number(level);
  return Number.isInteger(n) && n >= 1 && n <= 4 ? LEVEL_LABEL[n] : "—";
}

function fmtDb(value) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  const n = Number(value);
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)} dB`;
}

function fmtMm(m) {
  if (m == null || !Number.isFinite(Number(m))) return "—";
  return `${Math.round(Number(m) * 1000)} mm`;
}

function fmtOrient(orientation) {
  if (orientation == null) return "—";
  const s = String(orientation);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function StatPill({ label, level, variation }) {
  const hasData = level != null || variation != null;
  return (
    <div className="flex flex-col items-start">
      <span className="text-[9.5px] font-medium uppercase tracking-wide text-[#8A7B6A] leading-none">
        {label}
      </span>
      <span className="mt-0.5 text-[13px] font-bold leading-none text-[#1B1A1A]">
        {hasData ? (
          <>
            {levelLabel(level)}
            {variation != null && (
              <span className="ml-1 text-[11px] font-semibold text-[#625143]">
                {fmtDb(variation)}
              </span>
            )}
          </>
        ) : "—"}
      </span>
    </div>
  );
}

function DataTable({ headers, rows }) {
  return (
    <div className="overflow-hidden rounded border border-[#E5E5E5]">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="text-[9.5px] font-semibold uppercase tracking-wide text-[#8A7B6A] bg-[#F7F6F3]">
            {headers.map((h, i) => (
              <th key={i} className="px-2 py-1">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-t border-[#EFEDE8] text-[10.5px] text-[#3E4349]">
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className={`px-2 py-1 ${cell.bold ? "font-medium text-[#1B1A1A]" : ""}`}
                >
                  {cell.value}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PerSeatP20Table({ seats }) {
  // Only render rows with comparable before AND after evidence.
  const comparable = (Array.isArray(seats) ? seats : []).filter(
    (r) => r?.beforeVariationDb != null && r?.afterVariationDb != null,
  );
  if (comparable.length === 0) return null;

  const rows = comparable.map((r) => {
    const afterBetter = Number(r.afterVariationDb) < Number(r.beforeVariationDb);
    return [
      { value: `${r.seatId}${r.isPrimary ? " · primary" : ""}`, bold: true },
      { value: `${fmtDb(r.beforeVariationDb) || "—"} ${levelLabel(r.beforeLevel)}` },
      { value: `${fmtDb(r.afterVariationDb) || "—"} ${levelLabel(r.afterLevel)}` },
      { value: afterBetter ? "improved" : "—" },
    ];
  });

  return (
    <div className="space-y-0.5">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
        Per-seat P20
      </div>
      <DataTable headers={["Seat", "Before", "After", "Change"]} rows={rows} />
    </div>
  );
}

export default function CoordinatedAlternativeCard({
  alt,
  index,
  roomDims = null,
}) {
  const [expanded, setExpanded] = useState(false);
  const qty = alt.installationComplexity;
  const subs = Array.isArray(alt.subwooferInstances) ? alt.subwooferInstances : [];
  const seats = Array.isArray(alt.seatingPositions) ? alt.seatingPositions : [];
  const tuning = Array.isArray(alt.tuning) ? alt.tuning : [];
  const perSeat = Array.isArray(alt.perSeatP20Comparisons) ? alt.perSeatP20Comparisons : [];
  const remaining = Array.isArray(alt.remainingCompromises) ? alt.remainingCompromises : [];
  const crossoverLabel = formatCrossover(alt.crossover);

  const quantityText = qty?.isCrossQuantity ? "Cross-quantity" : null;
  const subCount = subs.length || alt.quantity || null;
  const modelLabel = alt.selectedSubModel || null;
  const moveLabel = alt.offsetMm != null
    ? `move seating ${alt.offsetMm > 0 ? "+" : ""}${alt.offsetMm} mm`
    : null;

  return (
    <div
      className="rounded-lg border border-[#E5E5E5] bg-white overflow-hidden"
      data-adi-coordinated-alternative={alt.candidateId}
      data-adi-coordinated-alternative-index={index}
    >
      {/* Compact header — always visible */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-[#F8F8F7]"
      >
        <MiniPlanView
          subwooferInstances={subs}
          roomDims={roomDims}
          size={48}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-[#1B1A1A] leading-tight">
              {modelLabel
                ? `${subCount || ""}× ${modelLabel}`.trim()
                : `Alternative ${index + 1}`}
            </span>
            {quantityText && (
              <span className="text-[10px] font-medium text-[#625143]">
                {quantityText}
              </span>
            )}
          </div>
          <div className="mt-0.5 text-[11px] text-[#757575] leading-snug">
            {moveLabel || "No seating change"}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 justify-end">
          <StatPill label="P19" level={alt.p19?.level} variation={alt.p19?.variationDb} />
          <StatPill label="P20 Pri" level={alt.primaryP20Summary?.level} variation={alt.primaryP20Summary?.variationDb} />
          <StatPill label="P20 Sec" level={alt.secondaryP20Summary?.level} variation={alt.secondaryP20Summary?.variationDb} />
          {alt.p14?.achievedDb != null && (
            <StatPill label="P14" level={null} variation={null} />
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 text-[#8A7B6A] shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {/* P14 value — shown inline when present, replacing the "—" pill */}
      {alt.p14?.achievedDb != null && (
        <div className="px-3.5 pb-1 -mt-1">
          <div className="flex items-center gap-3">
            <span className="text-[9.5px] font-medium uppercase tracking-wide text-[#8A7B6A]">P14</span>
            <span className="text-[13px] font-bold text-[#1B1A1A]">
              {alt.p14.achievedDb.toFixed(0)} dB
            </span>
          </div>
        </div>
      )}

      {/* Material improvement — one line */}
      {alt.materialImprovement && (
        <div className="px-3.5 py-1 text-[11px] text-[#213428] leading-relaxed" data-adi-coordinated-materiality>
          {alt.materialImprovement}
        </div>
      )}

      {/* Remaining compromises — seats still below target */}
      {remaining.length > 0 && (
        <div className="px-3.5 py-1 text-[10.5px] text-[#8A7B6A] leading-relaxed">
          Seats still below L3: {remaining.map((s) => `${s.seatId} (${levelLabel(s.level)})`).join(", ")}
        </div>
      )}

      {/* Expandable technical details */}
      {expanded && (
        <div className="border-t border-[#E5E5E5] px-3.5 py-3 space-y-2.5 bg-[#FAFAF9]">
          {/* Subwoofer positions */}
          {subs.length > 0 && (
            <div className="space-y-0.5">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
                Subwoofers{modelLabel ? ` · ${modelLabel}` : ""}
                {alt.frontOrientation || alt.rearOrientation
                  ? ` · ${[alt.frontOrientation, alt.rearOrientation].filter(Boolean).map(fmtOrient).join(" / ")}`
                  : ""}
              </div>
              <DataTable
                headers={["#", "X", "Y", "Height", "Orient."]}
                rows={subs.map((inst, i) => [
                  { value: i + 1, bold: true },
                  { value: fmtMm(inst.position?.x) },
                  { value: fmtMm(inst.position?.y) },
                  { value: fmtMm(inst.bottomHeightM) },
                  { value: inst.orientation ? fmtOrient(inst.orientation) : "—" },
                ])}
              />
            </div>
          )}

          {/* Seating positions */}
          {seats.length > 0 && (
            <div className="space-y-0.5">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
                Seating{alt.offsetMm != null ? ` · ${alt.offsetMm > 0 ? "+" : ""}${alt.offsetMm} mm` : ""}
              </div>
              <DataTable
                headers={["Seat", "X", "Y", "Priority"]}
                rows={seats.slice(0, 8).map((seat) => [
                  { value: seat.id || "—", bold: true },
                  { value: fmtMm(seat.x) },
                  { value: fmtMm(seat.y) },
                  { value: seat.priority || "—" },
                ])}
              />
              {seats.length > 8 && (
                <div className="text-[10px] text-[#8A7B6A]">+{seats.length - 8} more seats</div>
              )}
            </div>
          )}

          {/* Tuning */}
          {tuning.length > 0 && (
            <div className="space-y-0.5">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
                Tuning{crossoverLabel ? ` · ${crossoverLabel}` : ""}
              </div>
              <DataTable
                headers={["Sub", "Delay", "Gain", "Polarity", "Phase"]}
                rows={tuning.map((t, i) => [
                  { value: i + 1, bold: true },
                  { value: t.delayMs != null ? `${t.delayMs.toFixed(1)} ms` : "—" },
                  { value: t.gainDb != null ? `${t.gainDb > 0 ? "+" : ""}${t.gainDb.toFixed(1)} dB` : "—" },
                  { value: t.polarity != null ? (Number(t.polarity) < 0 || Number(t.polarity) === 180 ? "Inverted" : "Normal") : "—" },
                  { value: t.phaseControlDeg != null ? `${Math.round(t.phaseControlDeg)}°` : "—" },
                ])}
              />
            </div>
          )}

          {/* Per-seat P20 — only comparable rows */}
          {perSeat.length > 0 && <PerSeatP20Table seats={perSeat} />}

          {/* RSP authority */}
          {alt.rspAuthority?.rspMode && (
            <div className="text-[10px] text-[#9A8E80] leading-relaxed">
              RSP: {alt.rspAuthority.rspMode}
              {alt.rspAuthority.designatedRspSeatId ? ` · seat ${alt.rspAuthority.designatedRspSeatId}` : ""}
              {alt.rspAuthority.evaluatedRspPosition
                ? ` · (${fmtMm(alt.rspAuthority.evaluatedRspPosition.x)}, ${fmtMm(alt.rspAuthority.evaluatedRspPosition.y)})`
                : ""}
            </div>
          )}
        </div>
      )}
    </div>
  );
}