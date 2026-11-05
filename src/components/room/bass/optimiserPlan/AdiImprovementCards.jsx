// AdiImprovementCards.jsx
// ---------------------------------------------------------------------------
// THE BEFORE/AFTER PERFORMANCE COMPARISON CARDS for the ADI Bass Optimisation
// panel.
//
// Replaces verbose recommendation text with a clean, card-based before/after
// comparison in three states:
//
//   Pending approval   — neutral colours, "Awaiting approval" pill, predicted
//                        values, footer identifying the outcome as predicted.
//   Applied by user    — Artcoustic green values, "Applied" pill, actual
//                        recalculated results.
//   Applied by ADI     — Artcoustic green values, "Applied by ADI" pill, actual
//                        recalculated results.
//
// Engineering integrity (enforced by improvementCardData.js, not here):
//   • Every value is read from an existing authority — nothing is fabricated.
//   • A metric appears only where both before and after are supported by the
//     same comparison evidence.
//   • Green is shown only for an applied state whose authoritative calculation
//     has completed.
//
// Presentation only: this component renders what the resolver returns and
// decides nothing about the engineering.
// ---------------------------------------------------------------------------

import React from "react";
import { CheckCircle2 } from "lucide-react";

const PILL_CLASS_PENDING =
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-[#F1F0EE] text-[#3E4349] border border-[#DCDBD6]";
const PILL_CLASS_APPLIED =
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-[#E8F0EC] text-[#213428] border border-[#213428]";

function MetricCard({ metric, applied }) {
  const valueColour = applied ? "text-[#213428]" : "text-[#1B1A1A]";
  return (
    <div
      className="rounded-lg border border-[#E5E5E5] bg-white px-3 py-2.5"
      data-adi-improvement-metric={metric.key}
    >
      <div className="text-[11px] font-medium text-[#757575] leading-tight">
        {metric.label}
      </div>
      <div className={`mt-1 text-[22px] font-bold leading-none ${valueColour}`}>
        {metric.after || "—"}
        {metric.afterLevel && (
          <span className="ml-1.5 text-[13px] font-semibold text-[#625143]">
            {metric.afterLevel}
          </span>
        )}
      </div>
      {metric.before && (
        <div className="mt-1 text-[11px] text-[#757575] leading-tight">
          Previously {metric.before}
          {metric.beforeLevel ? ` · ${metric.beforeLevel}` : ""}
        </div>
      )}
    </div>
  );
}

export default function AdiImprovementCards({ cards = null, className = "" }) {
  if (!cards || !Array.isArray(cards.metrics) || cards.metrics.length === 0) return null;

  const applied = cards.state === "applied";
  const pillClass = applied ? PILL_CLASS_APPLIED : PILL_CLASS_PENDING;

  return (
    <div
      className={`rounded-lg border border-[#E5E5E5] bg-white px-4 py-3 space-y-3 ${className}`}
      data-adi-improvement-cards={cards.state}
      data-adi-improvement-cards-applied-by-adi={cards.appliedByAdi ? "true" : undefined}
    >
      {/* Header: the physical change + status pill */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          {applied && (
            <CheckCircle2 className="h-4 w-4 text-[#213428] mt-0.5 shrink-0" />
          )}
          <div className="text-[15px] font-semibold text-[#1B1A1A] leading-snug">
            {cards.title}
          </div>
        </div>
        <span className={pillClass} data-adi-improvement-pill={cards.state}>
          {cards.pillLabel}
        </span>
      </div>

      {/* Performance comparison cards */}
      <div className="grid grid-cols-2 gap-2.5">
        {cards.metrics.map((metric) => (
          <MetricCard key={metric.key} metric={metric} applied={applied} />
        ))}
      </div>

      {/* Footer identifying predicted vs actual */}
      <div className="text-[11px] text-[#757575] leading-relaxed">
        {cards.footer}
      </div>
    </div>
  );
}