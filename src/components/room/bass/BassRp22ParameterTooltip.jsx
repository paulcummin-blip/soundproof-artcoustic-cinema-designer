// BassRp22ParameterTooltip — reusable hover/tap tooltip for RP22 bass
// parameter pills (P14/P18/P19/P20).
//
// The headline pill stays clean and concise (level only). On hover (desktop)
// or tap (mobile), the tooltip reveals the actual underlying achieved value
// and useful parameter context, consumed directly from the canonical bass
// result via useOptionalSharedBassResults.
//
// This is presentation-only. It does NOT recreate grading or maths. If a
// parameter has not been calculated, the tooltip says "NOT CALCULATED".
//
// For P19/P20 (seat-scoped), the tooltip describes the assessment approach
// and does NOT replace the permanently expanded seat results below.

import React from "react";
import { rp22ByNumber } from "@/components/data/rp22Parameters";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useOptionalSharedBassResults } from "@/components/room/bass/bassResultsStore";
import { formatP14Capability } from "@/components/utils/p14CapabilityAuthority";
import { formatBassParameterValue } from "@/components/room/bass/bassParameterValueFormatter";
import { resolveP14TargetSelectionState } from "@/components/room/bass/p14TargetSelectionState";

const PARAMETER_NUMBERS = Object.freeze({ p14: 14, p18: 18, p19: 19, p20: 20 });

const isFiniteNumber = (value) => value !== null
  && value !== undefined
  && value !== ""
  && typeof value !== "boolean"
  && Number.isFinite(Number(value));

// Build the tooltip detail text from the canonical bass result.
// Returns { title, lines } where lines is an array of strings.
function buildTooltipDetail(parameterKey, shared) {
  const authorityStatus = shared?.completedBassAuthority?.authorityStatus || "UNCALCULATED";
  const hasResult = shared?.hasCurrentResult === true;
  const isCalculating = shared?.calculationInProgress === true;
  const isStale = authorityStatus === "STALE";
  const p14Selection = resolveP14TargetSelectionState(shared?.authoritative?.requested);
  const noP14TargetSelected = p14Selection.noP14TargetSelected;

  // Seat-scoped parameters: always describe the assessment approach.
  // The permanently expanded seat results below show the actual state.
  if (parameterKey === "p19") {
    return {
      title: "P19 Response Fit",
      lines: ["Frequency response fit is assessed per seat."],
    };
  }
  if (parameterKey === "p20") {
    return {
      title: "P20 Seat Consistency",
      lines: ["Seat consistency is assessed individually relative to the RSP."],
    };
  }

  // Room-scoped parameters (P14/P18): show the achieved value if calculated.
  if (noP14TargetSelected || isCalculating || isStale || !hasResult) {
    return { title: parameterKey.toUpperCase(), lines: ["NOT CALCULATED"] };
  }

  const contract = shared?.completedBassAuthority?.contract;
  const parameters = contract?.productAnalysis?.parameters || {};
  const p14Failed = parameters?.p14?.pass === false;

  if (parameterKey === "p14") {
    const source = parameters.p14;
    const capability = source?.achievedCapabilityDb ?? source?.availableCapabilityDb;
    const lines = [];
    if (isFiniteNumber(capability)) {
      lines.push(`Available bass capability: ${formatP14Capability(capability)}`);
    }
    if (p14Failed) {
      lines.push("Target not achievable at current configuration.");
    }
    if (lines.length === 0) lines.push("NOT CALCULATED");
    return { title: "P14 Bass SPL", lines };
  }

  if (parameterKey === "p18") {
    if (p14Failed) {
      return { title: "P18 Extension", lines: ["NOT CALCULATED"] };
    }
    const source = parameters.p18;
    const value = isFiniteNumber(source?.value) ? Number(source.value) : null;
    if (value !== null) {
      const bounded = source?.achievedExtensionBounded === true;
      return {
        title: "P18 Extension",
        lines: [`Achieved -3 dB point: ${bounded ? "≤" : ""}${formatBassParameterValue("p18", value)}`],
      };
    }
    return { title: "P18 Extension", lines: ["NOT CALCULATED"] };
  }

  return { title: parameterKey.toUpperCase(), lines: ["NOT CALCULATED"] };
}

export default function BassRp22ParameterTooltip({ parameterKey, children }) {
  const definition = rp22ByNumber[PARAMETER_NUMBERS[parameterKey]];
  const shared = useOptionalSharedBassResults();
  const detail = buildTooltipDetail(parameterKey, shared);

  if (!definition && !detail) return children;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-[320px] rounded-lg border-2 border-[#E6E4DD] bg-white p-3 text-[11px] leading-[1.5] text-[#1B1A1A] shadow-[0_4px_12px_rgba(0,0,0,0.15)]"
        >
          <div className="mb-1.5 text-xs font-semibold">{detail.title}</div>
          {detail.lines.map((line, index) => (
            <div key={index}>{line}</div>
          ))}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}