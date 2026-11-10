// AdiCoordinatedPhysicalAlternatives.jsx
// ---------------------------------------------------------------------------
// P0-2: render the reproducible physical-configuration view for each
// coordinated search alternative. Shows the complete proposed configuration —
// subwoofer quantity, model, arrangement, actual evaluated positions,
// seating movement, RSP, crossover, tuning, and P14/P19/P20 results — using
// candidate-owned data only.
//
// No automatic Apply. When essential candidate-owned physical data is missing,
// the alternative is shown as NOT reproducible with the missing fields listed.
//
// Pure presentation: reads pre-built presentation views from
// buildPhysicalAlternativePresentations. No data fetching, no side effects.
// ---------------------------------------------------------------------------

import React from "react";
import { AlertTriangle, CheckCircle2, MapPin, Users, Sliders, Activity } from "lucide-react";
import { buildPhysicalAlternativePresentations } from "./coordinatedPhysicalAlternativePresentation";

const LABEL = "text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]";
const LINE = "text-[11px] text-[#3E4349] leading-relaxed";
const MUTED = "text-[10px] text-[#8A7B6A] leading-relaxed";
const VALUE = "text-[11px] font-medium text-[#1B1A1A]";

function fmt(value, unit = "") {
  if (value === null || value === undefined || value === "") return "—";
  return `${value}${unit}`;
}

function fmtDelta(delta, unit = "", positiveIsGood = true) {
  if (delta === null || delta === undefined) return "—";
  const sign = delta > 0 ? "+" : "";
  const text = `${sign}${delta}${unit}`;
  const isImprovement = positiveIsGood ? delta > 0 : delta < 0;
  if (delta === 0) return <span className="text-[#8A7B6A]">{text}</span>;
  return isImprovement
    ? <span className="text-[#213428] font-medium">{text}</span>
    : <span className="text-[#A33]">{text}</span>;
}

function SectionHeader({ icon: Icon, label }) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="h-3 w-3 text-[#8A7B6A]" />
      <span className={LABEL}>{label}</span>
    </div>
  );
}

function ReproducibilityBadge({ presentation }) {
  if (presentation.reproducible) {
    return (
      <div className="flex items-center gap-1.5">
        <CheckCircle2 className="h-3.5 w-3.5 text-[#213428]" />
        <span className="text-[10px] font-medium text-[#213428]">Reproducible configuration</span>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <AlertTriangle className="h-3.5 w-3.5 text-[#A33]" />
        <span className="text-[10px] font-medium text-[#A33]">
          Not reproducible — essential physical data missing
        </span>
      </div>
      <ul className="ml-5 list-disc text-[10px] text-[#A33]">
        {presentation.missingFields.map((field, i) => (
          <li key={i}>{field}</li>
        ))}
      </ul>
    </div>
  );
}

function ArrangementSection({ arrangement }) {
  if (!arrangement) return null;
  const coords = Array.isArray(arrangement.coordinates) ? arrangement.coordinates : [];
  return (
    <div className="space-y-1">
      <SectionHeader icon={MapPin} label="Subwoofer arrangement" />
      <div className={LINE}>
        <span className="font-medium">Quantity:</span> {fmt(arrangement.quantity)} ·{" "}
        <span className="font-medium">Model:</span> {arrangement.model || "—"}
      </div>
      {arrangement.placementId && (
        <div className={MUTED}>Placement ID: {arrangement.placementId}</div>
      )}
      {arrangement.bottomHeightM != null && (
        <div className={LINE}>
          <span className="font-medium">Bottom height:</span> {fmt(arrangement.bottomHeightM, " m")}
        </div>
      )}
      <div className="space-y-0.5">
        {coords.length === 0 ? (
          <div className={MUTED}>no coordinates available</div>
        ) : (
          coords.map((c) => (
            <div key={c.sourceIndex} className="flex justify-between text-[10px] text-[#3E4349]">
              <span>Sub {c.sourceIndex}</span>
              <span className={VALUE}>
                ({c.xLabel ?? "—"}, {c.yLabel ?? "—"}) m
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function SeatingSection({ seating }) {
  if (!seating) return null;
  const moved = seating.offsetMm != null && seating.offsetMm !== 0;
  return (
    <div className="space-y-1">
      <SectionHeader icon={Users} label="Seating & RSP" />
      <div className={LINE}>
        <span className="font-medium">Movement:</span>{" "}
        {moved
          ? `${Math.abs(seating.offsetMm)} mm ${seating.direction}`
          : "unchanged"}
      </div>
      <div className={LINE}>
        <span className="font-medium">Proposed seats:</span> {fmt(seating.proposedSeatCount)}
      </div>
      <div className={LINE}>
        <span className="font-medium">Designated RSP seat:</span> {seating.designatedSeatId || "—"}
      </div>
    </div>
  );
}

function TuningSection({ tuning, crossover }) {
  const rows = Array.isArray(tuning) ? tuning : [];
  return (
    <div className="space-y-1">
      <SectionHeader icon={Sliders} label="Crossover & tuning" />
      {crossover && (
        <div className={LINE}>
          <span className="font-medium">Crossover:</span> {fmt(crossover.frequencyHz, " Hz")}
          {crossover.type ? ` · ${crossover.type}` : ""}
        </div>
      )}
      {rows.length === 0 ? (
        <div className={MUTED}>no tuning applied</div>
      ) : (
        rows.map((t) => (
          <div key={t.sourceIndex} className="flex justify-between text-[10px] text-[#3E4349]">
            <span>Sub {t.sourceIndex}</span>
            <span>
              gain {fmt(t.gainDb, " dB")} · delay {fmt(t.delayMs, " ms")} · phase {fmt(t.phaseControlDeg, "°")} · pol {fmt(t.polarity)}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

function PerformanceSection({ presentation }) {
  const imp = presentation.improvements;
  return (
    <div className="space-y-1">
      <SectionHeader icon={Activity} label="Performance & improvements" />
      <div className={LINE}>
        <span className="font-medium">P14:</span> {fmt(presentation.p14?.achievedDb, " dB")} / {fmt(presentation.p14?.targetDb, " dB")}{" "}
        {presentation.p14?.pass != null && (
          <span className={presentation.p14.pass ? "text-[#213428]" : "text-[#A33]"}>
            {presentation.p14.pass ? " ✓" : " ✗"}
          </span>
        )}
        {imp && <span className="text-[#8A7B6A]"> (Δ {fmtDelta(imp.p14DeltaDb, " dB")})</span>}
      </div>
      <div className={LINE}>
        <span className="font-medium">P19 at RSP:</span> L{fmt(presentation.p19?.level)} · {fmt(presentation.p19?.variationDb, " dB")}
        {imp && <span className="text-[#8A7B6A]"> (Δ {fmtDelta(imp.p19LevelDelta, " L")})</span>}
      </div>
      <div className={LINE}>
        <span className="font-medium">Primary P20:</span> L{fmt(presentation.p20Primary?.level)} · {fmt(presentation.p20Primary?.variationDb, " dB")}{" "}
        <span className="text-[#8A7B6A]">· {presentation.p20Primary?.seatId || "—"}</span>
        {imp && <span className="text-[#8A7B6A]"> (Δ {fmtDelta(imp.p20PrimaryLevelDelta, " L")})</span>}
      </div>
      <div className={LINE}>
        <span className="font-medium">Secondary P20:</span> L{fmt(presentation.p20Secondary?.level)} · {fmt(presentation.p20Secondary?.variationDb, " dB")}{" "}
        <span className="text-[#8A7B6A]">· {presentation.p20Secondary?.seatId || "—"}</span>
        {imp && <span className="text-[#8A7B6A]"> (Δ {fmtDelta(imp.p20SecondaryLevelDelta, " L")})</span>}
      </div>
      {presentation.compromisingSeats.length > 0 && (
        <div className="pt-1 space-y-0.5">
          <div className={LABEL}>Remaining compromises</div>
          {presentation.compromisingSeats.map((seat) => (
            <div key={seat.seatId} className="flex justify-between text-[10px] text-[#A33]">
              <span>{seat.seatId} {seat.isPrimary ? "· primary" : "· secondary"}</span>
              <span>L{seat.level} · {fmt(seat.variationDb, " dB")}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AlternativeCard({ presentation }) {
  return (
    <div
      className="rounded-md border border-[#E7E5E0] bg-white px-3 py-2.5 space-y-2"
      data-physical-alternative={presentation.optionId}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-[#1B1A1A]">{presentation.label}</span>
        <span className="text-[9px] text-[#8A7B6A] uppercase tracking-wide">{presentation.responseBasis}</span>
      </div>
      <ReproducibilityBadge presentation={presentation} />
      <ArrangementSection arrangement={presentation.arrangement} />
      <SeatingSection seating={presentation.seatingMovement} />
      <TuningSection tuning={presentation.tuning} crossover={presentation.crossover} />
      <PerformanceSection presentation={presentation} />
      <div className={MUTED}>
        No automatic Apply — designer approval required for all physical changes.
      </div>
    </div>
  );
}

/**
 * Render the reproducible physical-configuration cards for a set of
 * coordinated search options.
 *
 * @param {{ options: Array }} props - coordinated search options (baseline + alternatives)
 */
export default function AdiCoordinatedPhysicalAlternatives({ options }) {
  if (!Array.isArray(options) || !options.length) {
    return (
      <div className="rounded-md border border-[#E7E5E0] bg-[#FAF9F6] px-3 py-3">
        <div className={MUTED}>No coordinated physical alternatives to display.</div>
      </div>
    );
  }
  const presentations = buildPhysicalAlternativePresentations(options);
  return (
    <div className="space-y-2" data-coordinated-physical-alternatives="true">
      {presentations.map((presentation) => (
        <AlternativeCard key={presentation.optionId} presentation={presentation} />
      ))}
    </div>
  );
}