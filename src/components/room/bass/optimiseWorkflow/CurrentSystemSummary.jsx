// CurrentSystemSummary.jsx
// Compact "where am I now?" display for the Bass Optimisation summary.
// Shows the current RP22 bass floor, fail count, P19 and P20 as simple text —
// not duplicate pill cards (those live in BassHeadlinePills elsewhere).

import React from "react";
import { buildComplianceBassPresentation } from "../bassCompliancePresentation";
import { resolveP14TargetSelectionState } from "../p14TargetSelectionState";

function parseNumericLevel(level) {
  if (!level) return null;
  const match = String(level).match(/^L(\d)$/);
  return match ? Number(match[1]) : null;
}

function MetricRow({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-[#625143]">{label}</span>
      <span className="text-[12px] font-semibold text-[#1B1A1A]">{value}</span>
    </div>
  );
}

export default function CurrentSystemSummary({ shared, seatingPositions }) {
  const p14Selection = resolveP14TargetSelectionState(shared?.authoritative?.requested);
  const presentation = buildComplianceBassPresentation(
    { completedBassAuthority: shared?.completedBassAuthority },
    null,
    p14Selection.noP14TargetSelected,
  );

  const params = presentation.parameters;
  const levelKeys = ["p14", "p18", "p19", "p20"];
  const numericLevels = levelKeys.map((k) => parseNumericLevel(params[k]?.level));
  const validLevels = numericLevels.filter((l) => l != null);
  const floor = validLevels.length > 0 ? Math.min(...validLevels) : null;
  const failCount = numericLevels.filter((l) => l === 0).length;

  const p19 = params.p19;
  const p20 = params.p20;

  const p19Text = p19?.level && p19.level !== "—" && p19.level !== "N/A" && p19.level !== "NOT VERIFIED"
    ? `${p19.level}${p19?.valueText ? ` · ${p19.valueText}` : ""}`
    : (p19?.level || "—");
  const p20Text = p20?.level && p20.level !== "—" && p20.level !== "N/A" && p20.level !== "NOT VERIFIED"
    ? `${p20.level}${p20?.valueText ? ` · ${p20.valueText}` : ""}`
    : (p20?.level || "—");

  return (
    <div className="rounded-md border border-[#E7E4DF] bg-white px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A] mb-2">
        Current System
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        <MetricRow label="Floor" value={floor != null ? `L${floor}` : "—"} />
        <MetricRow label="Fails" value={String(failCount)} />
        <MetricRow label="P19" value={p19Text} />
        <MetricRow label="P20" value={p20Text} />
      </div>
    </div>
  );
}