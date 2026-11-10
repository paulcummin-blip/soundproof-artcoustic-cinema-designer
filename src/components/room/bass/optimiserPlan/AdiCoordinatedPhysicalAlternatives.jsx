// AdiCoordinatedPhysicalAlternatives.jsx
// ---------------------------------------------------------------------------
// Coordinated physical alternatives — Phase 9B candidates that move BOTH
// seating and subwoofer positions. Presented SEPARATELY from the overall
// calibration winner. Nothing here is auto-applied: the section is
// informational only. The designer reviews each alternative and, if they
// choose to act, moves the seating and subwoofers manually in the Room
// Designer and re-runs the optimisation.
//
// This component renders ONLY eligible alternatives (validation, safety,
// protected-primary-seat and materiality all passed). It is independent of
// the calibration winner: it appears whether or not a calibration
// improvement was found, and never competes with the primary decision.
//
// Every value is read from the persisted coordinated summary — no
// recalculation, no fabrication.
// ---------------------------------------------------------------------------

import React from "react";
import { Move, AlertCircle } from "lucide-react";
import { selectEligiblePhysicalAlternativesFromSummary } from "./coordinatedPhysicalAlternativePresentation.js";

const LEVEL_LABEL = { 1: "L1", 2: "L2", 3: "L3", 4: "L4" };

function levelLabel(level) {
  const n = Number(level);
  return Number.isInteger(n) && n >= 1 && n <= 4 ? LEVEL_LABEL[n] : "—";
}

function fmtDb(value) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)} dB`;
}

function QuantityChange({ change }) {
  if (change == null) return null;
  if (change > 0) return <span className="font-semibold text-[#1B1A1A]">+{change} subwoofer{change > 1 ? "s" : ""}</span>;
  if (change < 0) return <span className="font-semibold text-[#1B1A1A]">{change} subwoofer{change < -1 ? "s" : ""}</span>;
  return <span className="text-[#757575]">same count</span>;
}

function SeatRow({ row }) {
  const afterBetter = row.beforeVariationDb != null && row.afterVariationDb != null
    && Number(row.afterVariationDb) < Number(row.beforeVariationDb);
  return (
    <tr className="border-t border-[#EFEDE8] text-[11px] text-[#3E4349]">
      <td className="px-2.5 py-1.5 font-medium text-[#1B1A1A]">
        {row.seatId}{row.isPrimary ? " · primary" : ""}
      </td>
      <td className="px-2.5 py-1.5">{fmtDb(row.beforeVariationDb)} {levelLabel(row.beforeLevel)}</td>
      <td className="px-2.5 py-1.5 font-semibold text-[#1B1A1A]">{fmtDb(row.afterVariationDb)} {levelLabel(row.afterLevel)}</td>
      <td className={`px-2.5 py-1.5 ${afterBetter ? "text-[#213428] font-semibold" : "text-[#757575]"}`}>
        {afterBetter ? "improved" : "—"}
      </td>
    </tr>
  );
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

function SubPositionsBlock({ alt }) {
  const subs = Array.isArray(alt.subwooferInstances) ? alt.subwooferInstances : [];
  if (subs.length === 0) return null;
  return (
    <div className="space-y-1">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
        Subwoofers{alt.selectedSubModel ? ` · ${alt.selectedSubModel}` : ""}
        {alt.frontOrientation || alt.rearOrientation
          ? ` · ${[alt.frontOrientation, alt.rearOrientation].filter(Boolean).map(fmtOrient).join(" / ")}`
          : ""}
      </div>
      <div className="overflow-hidden rounded border border-[#E5E5E5]">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="text-[9.5px] font-semibold uppercase tracking-wide text-[#8A7B6A] bg-[#F7F6F3]">
              <th className="px-2 py-1">#</th>
              <th className="px-2 py-1">X</th>
              <th className="px-2 py-1">Y</th>
              <th className="px-2 py-1">Height</th>
              <th className="px-2 py-1">Orient.</th>
            </tr>
          </thead>
          <tbody>
            {subs.map((inst, i) => (
              <tr key={inst.id || i} className="border-t border-[#EFEDE8] text-[10.5px] text-[#3E4349]">
                <td className="px-2 py-1 font-medium text-[#1B1A1A]">{i + 1}</td>
                <td className="px-2 py-1">{fmtMm(inst.position?.x)}</td>
                <td className="px-2 py-1">{fmtMm(inst.position?.y)}</td>
                <td className="px-2 py-1">{fmtMm(inst.bottomHeightM)}</td>
                <td className="px-2 py-1">{inst.orientation ? fmtOrient(inst.orientation) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SeatingBlock({ alt }) {
  const seats = Array.isArray(alt.seatingPositions) ? alt.seatingPositions : [];
  if (seats.length === 0) return null;
  return (
    <div className="space-y-1">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
        Seating{alt.offsetMm != null ? ` · ${alt.offsetMm > 0 ? "+" : ""}${alt.offsetMm} mm` : ""}
      </div>
      <div className="overflow-hidden rounded border border-[#E5E5E5]">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="text-[9.5px] font-semibold uppercase tracking-wide text-[#8A7B6A] bg-[#F7F6F3]">
              <th className="px-2 py-1">Seat</th>
              <th className="px-2 py-1">X</th>
              <th className="px-2 py-1">Y</th>
              <th className="px-2 py-1">Priority</th>
            </tr>
          </thead>
          <tbody>
            {seats.slice(0, 6).map((seat) => (
              <tr key={seat.id || seat.seatId} className="border-t border-[#EFEDE8] text-[10.5px] text-[#3E4349]">
                <td className="px-2 py-1 font-medium text-[#1B1A1A]">{seat.id || "—"}</td>
                <td className="px-2 py-1">{fmtMm(seat.x)}</td>
                <td className="px-2 py-1">{fmtMm(seat.y)}</td>
                <td className="px-2 py-1">{seat.priority || "—"}</td>
              </tr>
            ))}
            {seats.length > 6 && (
              <tr className="border-t border-[#EFEDE8] text-[10px] text-[#8A7B6A]">
                <td className="px-2 py-1" colSpan={4}>+{seats.length - 6} more seats</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TuningBlock({ alt }) {
  const tuning = Array.isArray(alt.tuning) ? alt.tuning : [];
  if (tuning.length === 0) return null;
  return (
    <div className="space-y-1">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
        Tuning{alt.crossover ? ` · crossover ${alt.crossover}` : ""}
      </div>
      <div className="overflow-hidden rounded border border-[#E5E5E5]">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="text-[9.5px] font-semibold uppercase tracking-wide text-[#8A7B6A] bg-[#F7F6F3]">
              <th className="px-2 py-1">Sub</th>
              <th className="px-2 py-1">Delay</th>
              <th className="px-2 py-1">Gain</th>
              <th className="px-2 py-1">Polarity</th>
              <th className="px-2 py-1">Phase</th>
            </tr>
          </thead>
          <tbody>
            {tuning.map((t, i) => (
              <tr key={t.sourceId || i} className="border-t border-[#EFEDE8] text-[10.5px] text-[#3E4349]">
                <td className="px-2 py-1 font-medium text-[#1B1A1A]">{i + 1}</td>
                <td className="px-2 py-1">{t.delayMs != null ? `${t.delayMs.toFixed(1)} ms` : "—"}</td>
                <td className="px-2 py-1">{t.gainDb != null ? `${t.gainDb > 0 ? "+" : ""}${t.gainDb.toFixed(1)} dB` : "—"}</td>
                <td className="px-2 py-1">{t.polarity != null ? (Number(t.polarity) < 0 || Number(t.polarity) === 180 ? "Inverted" : "Normal") : "—"}</td>
                <td className="px-2 py-1">{t.phaseControlDeg != null ? `${Math.round(t.phaseControlDeg)}°` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AlternativeCard({ alt, index }) {
  const seats = Array.isArray(alt.perSeatP20Comparisons) ? alt.perSeatP20Comparisons : [];
  const qty = alt.installationComplexity;
  const remaining = Array.isArray(alt.remainingCompromises) ? alt.remainingCompromises : [];

  return (
    <div
      className="rounded-md border border-[#E5E5E5] bg-white px-3 py-2.5 space-y-2"
      data-adi-coordinated-alternative={alt.candidateId}
      data-adi-coordinated-alternative-index={index}
    >
      {/* Header: identity + installation complexity */}
      <div className="flex items-start justify-between gap-3">
        <div className="text-[12.5px] font-semibold text-[#1B1A1A] leading-snug">
          Coordinated alternative {index + 1}
        </div>
        <div className="text-[10.5px] text-[#625143] text-right leading-snug">
          {qty?.isCrossQuantity ? "Cross-quantity · " : ""}
          <QuantityChange change={qty?.quantityChange} />
          {alt.offsetMm != null ? ` · move seating ${alt.offsetMm > 0 ? "+" : ""}${alt.offsetMm} mm` : ""}
        </div>
      </div>

      {/* P19 / P14 summary line */}
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-[#3E4349]">
        {alt.p19?.level && (
          <span>P19: <span className="font-semibold text-[#1B1A1A]">{alt.p19.level}</span> ({fmtDb(alt.p19.variationDb)})</span>
        )}
        {alt.primaryP20Summary && (
          <span>Primary P20: <span className="font-semibold text-[#1B1A1A]">{levelLabel(alt.primaryP20Summary.level)}</span> ({fmtDb(alt.primaryP20Summary.variationDb)})</span>
        )}
        {alt.p14?.achievedDb != null && (
          <span>P14: <span className="font-semibold text-[#1B1A1A]">{alt.p14.achievedDb.toFixed(0)} dB</span></span>
        )}
      </div>

      {/* Material improvement */}
      {alt.materialImprovement && (
        <div className="text-[11px] text-[#213428] leading-relaxed" data-adi-coordinated-materiality>
          {alt.materialImprovement}
        </div>
      )}

      {/* Per-seat P20 before/after */}
      {seats.length > 0 && (
        <div className="overflow-hidden rounded border border-[#E5E5E5]">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A] bg-[#F7F6F3]">
                <th className="px-2.5 py-1.5">Seat</th>
                <th className="px-2.5 py-1.5">Before</th>
                <th className="px-2.5 py-1.5">After</th>
                <th className="px-2.5 py-1.5">Change</th>
              </tr>
            </thead>
            <tbody>
              {seats.map((row) => (
                <SeatRow key={row.seatId} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Reproducible configuration: sub positions, seating, tuning */}
      <SubPositionsBlock alt={alt} />
      <SeatingBlock alt={alt} />
      <TuningBlock alt={alt} />

      {/* Remaining compromises */}
      {remaining.length > 0 && (
        <div className="text-[10.5px] text-[#8A7B6A] leading-relaxed">
          Seats still below L3: {remaining.map((s) => `${s.seatId} (${levelLabel(s.level)})`).join(", ")}
        </div>
      )}

      {/* RSP authority — diagnostic only */}
      {alt.rspAuthority?.rspMode && (
        <div className="text-[10px] text-[#9A8E80] leading-relaxed">
          RSP: {alt.rspAuthority.rspMode}
          {alt.rspAuthority.designatedRspSeatId ? ` · seat ${alt.rspAuthority.designatedRspSeatId}` : ""}
          {alt.rspAuthority.evaluatedRspPosition ? ` · (${fmtMm(alt.rspAuthority.evaluatedRspPosition.x)}, ${fmtMm(alt.rspAuthority.evaluatedRspPosition.y)})` : ""}
        </div>
      )}
    </div>
  );
}

export default function AdiCoordinatedPhysicalAlternatives({
  coordinatedSummary = null,
  currentPerSeatP20 = [],
  className = "",
}) {
  const alternatives = selectEligiblePhysicalAlternativesFromSummary(coordinatedSummary, currentPerSeatP20);
  if (alternatives.length === 0) return null;

  return (
    <div className={`space-y-2 ${className}`} data-adi-coordinated-alternatives="true">
      <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#1B1A1A]">
        <Move className="h-3.5 w-3.5 text-[#213428]" />
        Coordinated alternatives — move seating & subwoofers
      </div>
      <div className="text-[11px] text-[#625143] leading-relaxed">
        These combine a seating shift with new subwoofer positions. Review each option and, if you want to
        proceed, move the seating and subwoofers in the Room Designer and re-run the optimisation. Nothing
        here is applied automatically.
      </div>
      {alternatives.map((alt, index) => (
        <AlternativeCard key={alt.candidateId || index} alt={alt} index={index} />
      ))}
    </div>
  );
}