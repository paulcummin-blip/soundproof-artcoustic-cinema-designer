// BassResultDetailTooltip — ONE shared hover/focus/tap tooltip for RP22 bass
// parameter pills (P14/P18/P19/P20). Shows detailed canonical measurements from
// already-published authority. Presentation-only — does NOT recompute grading,
// thresholds, or values.
//
// Used for:
//   - P14 headline pill (room-scoped, detailed capability/target/margin)
//   - P18 headline pill (room-scoped, detailed extension/threshold)
//   - P19/P20 headline pill (seat-scoped, parameter description only)
//   - P19/P20 per-seat pills (seat-scoped, detailed seat result/margin)
//
// Canonical authority sources:
//   - P14/P18: contract.productAnalysis.parameters from completedBassAuthority
//   - P19/P20 thresholds: RP22_CATALOG (same authority used to grade seats)
//   - P19 assessment band: P18 value + optimisationTransitionHz
//
// Accessibility: hover (desktop), focus (keyboard), tap (touch) via Radix Tooltip.

import React from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useOptionalSharedBassResults } from "@/components/room/bass/bassResultsStore";
import { RP22_CATALOG } from "@/components/data/rp22Catalog";
import { formatP14BasisLabel, normalizeP14TargetBasis } from "@/components/utils/p14CapabilityAuthority";
import { normalizeP18TargetBasis, P18_THRESHOLDS_BY_BASIS } from "@/components/utils/p18ExtensionAuthority";
import { formatBassParameterValue } from "@/components/room/bass/bassParameterValueFormatter";
import { formatSplDisplay } from "@/components/utils/splDisplayFormatter";
import { resolveP14TargetSelectionState } from "@/components/room/bass/p14TargetSelectionState";
import { formatSeatLabel } from "@/components/utils/seatLabel";

const isFiniteNumber = (value) =>
  value !== null && value !== undefined && value !== "" && typeof value !== "boolean" && Number.isFinite(Number(value));

const PARAMETER_NUMBERS = { p14: 14, p18: 18, p19: 19, p20: 20 };
const PARAMETER_SUBTITLES = {
  p14: "LFE SPL capability",
  p18: "In-room bass extension",
  p19: "Response Fit",
  p20: "Seat Consistency",
};

function parseLevel(level) {
  if (level === "FAIL" || level === 0) return 0;
  const match = String(level ?? "").match(/^L?([1-4])$/);
  return match ? Number(match[1]) : null;
}

function buildSeatMarginInfo(paramKey, numericLevel, rawValue) {
  if (!isFiniteNumber(rawValue)) return null;
  const absRaw = Math.abs(Number(rawValue));
  const catalogKey = String(PARAMETER_NUMBERS[paramKey]);
  const levels = RP22_CATALOG[catalogKey]?.levels || {};

  if (numericLevel === 0) {
    const l1Threshold = levels.L1;
    if (!isFiniteNumber(l1Threshold)) {
      if (paramKey === "p20") return { threshold: null, margin: null, label: "Not computed" };
      return null;
    }
    const margin = absRaw - l1Threshold;
    return { threshold: l1Threshold, margin: margin, label: margin.toFixed(2) + " dB above L1 threshold" };
  }

  const threshold = levels["L" + numericLevel];
  if (!isFiniteNumber(threshold)) {
    if (numericLevel === 1 && paramKey === "p20") {
      const l2Threshold = levels.L2;
      if (isFiniteNumber(l2Threshold)) {
        const margin = absRaw - l2Threshold;
        return { threshold: l2Threshold, margin: margin, label: margin.toFixed(2) + " dB above L2 threshold" };
      }
    }
    return null;
  }
  const margin = threshold - absRaw;
  return { threshold: threshold, margin: margin, label: margin.toFixed(2) + " dB inside L" + numericLevel + " threshold" };
}

function formatRawP14(value) {
  if (!isFiniteNumber(value)) return "—";
  return Number(value).toFixed(1) + " dBC";
}

function formatRawP18(value) {
  if (!isFiniteNumber(value)) return "—";
  return Number(value).toFixed(1) + " Hz";
}

function formatRawSeatDeviation(value) {
  if (!isFiniteNumber(value)) return "—";
  return "±" + Number(value).toFixed(2) + " dB";
}

function buildP14Lines(shared) {
  const contract = shared?.completedBassAuthority?.contract;
  const source = contract?.productAnalysis?.parameters?.p14;
  if (!source) return null;

  const p14Selection = resolveP14TargetSelectionState(shared?.authoritative?.requested);
  if (p14Selection.noP14TargetSelected) return null;

  const authorityStatus = shared?.completedBassAuthority?.authorityStatus;
  if (authorityStatus !== "AUTHORITATIVE" && authorityStatus !== "LIMITED") return null;

  const achievedCapability = source?.achievedCapabilityDb ?? source?.availableCapabilityDb;
  const selectedLevel = source?.selectedLevel ?? source?.level;
  const selectedTargetDb = source?.selectedTargetDb ?? source?.requestedTargetDb;
  const targetBasis = normalizeP14TargetBasis(source?.targetBasis);
  const targetAchievable = source?.pass === true;

  const lines = [];

  if (isFiniteNumber(achievedCapability)) {
    lines.push(["Measured capability", formatRawP14(achievedCapability)]);
    lines.push(["Displayed capability", formatSplDisplay(achievedCapability)]);
  }

  if (isFiniteNumber(selectedLevel) && selectedLevel > 0 && isFiniteNumber(selectedTargetDb)) {
    lines.push(["Selected target", formatP14BasisLabel(targetBasis) + " L" + selectedLevel + " · " + formatSplDisplay(selectedTargetDb)]);
  }

  if (isFiniteNumber(achievedCapability) && isFiniteNumber(selectedTargetDb)) {
    const margin = Number(achievedCapability) - Number(selectedTargetDb);
    const sign = margin >= 0 ? "+" : "";
    lines.push(["Margin", sign + margin.toFixed(1) + " dB"]);
  }

  if (targetAchievable === false) {
    lines.push(["Result", "FAIL"]);
  } else if (isFiniteNumber(selectedLevel) && selectedLevel > 0) {
    lines.push(["Result", "L" + selectedLevel]);
  }

  return lines.length > 0 ? lines : null;
}

function buildP18Lines(shared) {
  const contract = shared?.completedBassAuthority?.contract;
  const source = contract?.productAnalysis?.parameters?.p18;
  if (!source) return null;

  const p14Failed = contract?.productAnalysis?.parameters?.p14?.pass === false;
  if (p14Failed) return null;

  const authorityStatus = shared?.completedBassAuthority?.authorityStatus;
  if (authorityStatus !== "AUTHORITATIVE") return null;

  const achievedValue = isFiniteNumber(source?.value) ? Number(source.value) : null;
  if (achievedValue === null) return null;

  const bounded = source?.achievedExtensionBounded === true;
  const targetBasis = normalizeP18TargetBasis(source?.targetBasis);
  const thresholds = P18_THRESHOLDS_BY_BASIS[targetBasis];

  const designHz = Math.floor(achievedValue);
  let achievedLevel = 0;
  if (designHz <= thresholds.L4) achievedLevel = 4;
  else if (designHz <= thresholds.L3) achievedLevel = 3;
  else if (designHz <= thresholds.L2) achievedLevel = 2;
  else if (designHz <= thresholds.L1) achievedLevel = 1;

  const lines = [];
  lines.push(["Measured -3 dB point", formatRawP18(achievedValue)]);
  lines.push(["Displayed", (bounded ? "≤" : "") + formatBassParameterValue("p18", achievedValue)]);
  lines.push(["Grading basis", targetBasis === "recommended" ? "Recommended" : "Minimum"]);

  if (achievedLevel > 0) {
    const threshold = thresholds["L" + achievedLevel];
    lines.push(["L" + achievedLevel + " threshold", "≤" + threshold + " Hz"]);
    lines.push(["Result", "L" + achievedLevel]);
  } else {
    lines.push(["L1 threshold", "≤" + thresholds.L1 + " Hz"]);
    lines.push(["Result", "FAIL"]);
  }

  return lines;
}

function buildSeatLines(paramKey, seatData, shared) {
  if (!seatData) return null;

  const rawValue = seatData.variationDbRaw;
  if (!isFiniteNumber(rawValue)) return null;

  const numericLevel = parseLevel(seatData.level);
  if (numericLevel === null) return null;

  const lines = [];
  lines.push(["Seat", formatSeatLabel(seatData.seatId)]);
  lines.push(["Measured value", formatRawSeatDeviation(rawValue)]);
  lines.push(["Result", seatData.level]);

  if (isFiniteNumber(seatData.worstFrequencyHz)) {
    lines.push(["Limiting frequency", Number(seatData.worstFrequencyHz).toFixed(1) + " Hz"]);
  }

  if (paramKey === "p19") {
    const contract = shared?.completedBassAuthority?.contract;
    const p18Value = contract?.productAnalysis?.parameters?.p18?.value;
    const transitionHz = shared?.authoritative?.optimisationTransitionHz;
    const p18Hz = isFiniteNumber(p18Value) ? Math.floor(Number(p18Value)) : null;
    const transition = isFiniteNumber(transitionHz) ? Math.round(Number(transitionHz)) : null;
    if (p18Hz !== null && transition !== null) {
      lines.push(["Assessment band", p18Hz + " Hz – " + transition + " Hz"]);
    }
  }

  const marginInfo = buildSeatMarginInfo(paramKey, numericLevel, rawValue);
  if (marginInfo) {
    if (isFiniteNumber(marginInfo.threshold)) {
      lines.push(["Threshold", marginInfo.threshold + " dB"]);
    }
  }

  return lines;
}

function buildSeatHeadlineLines() {
  return [
    ["Scope", "Seat-scoped parameter"],
    ["Description", "Individual seat results are shown in the per-seat grid below."],
  ];
}

function renderLines(lines) {
  if (!lines || lines.length === 0) return null;
  return lines.map((entry, index) => {
    const label = entry[0];
    const value = entry[1];
    return (
      <div key={index} className="flex justify-between gap-3 text-[11px] leading-[1.5]">
        <span className="text-[#625143]">{label}</span>
        <span className="text-right font-semibold text-[#1B1A1A]">{value}</span>
      </div>
    );
  });
}

export default function BassResultDetailTooltip({ parameterKey, seatData, children }) {
  const shared = useOptionalSharedBassResults();
  const paramNumber = PARAMETER_NUMBERS[parameterKey] || 0;
  const catalog = RP22_CATALOG[String(paramNumber)];

  if (!catalog) return children;

  let lines = null;
  if (parameterKey === "p14") {
    lines = buildP14Lines(shared);
  } else if (parameterKey === "p18") {
    lines = buildP18Lines(shared);
  } else if ((parameterKey === "p19" || parameterKey === "p20") && seatData) {
    lines = buildSeatLines(parameterKey, seatData, shared);
  } else if (parameterKey === "p19" || parameterKey === "p20") {
    lines = buildSeatHeadlineLines();
  }

  const hasDetail = lines && lines.length > 0;
  const subtitle = PARAMETER_SUBTITLES[parameterKey] || catalog.title;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} style={{ display: "inline-flex", cursor: "help", outline: "none" }}>
            {children}
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-[360px] rounded-lg border-2 border-[#E6E4DD] bg-white p-3 text-[11px] leading-[1.5] text-[#1B1A1A] shadow-[0_4px_12px_rgba(0,0,0,0.15)]"
        >
          <div className="mb-1.5 text-xs font-semibold text-[#213428]">
            {"P" + paramNumber + " — " + subtitle}
          </div>
          <div className="mb-2 text-[11px] leading-[1.5] text-[#3E4349]">{catalog.notes}</div>
          {hasDetail && (
            <div className="mt-1.5 space-y-0.5 border-t border-[#E6E4DD] pt-1.5">
              {renderLines(lines)}
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}