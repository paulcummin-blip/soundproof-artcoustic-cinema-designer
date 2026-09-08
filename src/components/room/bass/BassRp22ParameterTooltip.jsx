// BassRp22ParameterTooltip — reusable hover/tap tooltip for RP22 bass
// parameter pills (P14/P18/P19/P20).
//
// CANONICAL DESCRIPTION AUTHORITY:
//   The parameter title and description shown in this tooltip are consumed
//   from the SAME canonical RP22 catalog used by the Compliance Report
//   (RP22_CATALOG → RP22_PRESENTATION_PARAMETERS). This file contains NO
//   independently authored P14/P18/P19/P20 parameter-description strings.
//
// The tooltip structure is:
//   1. CANONICAL PARAMETER TITLE  — from RP22_CATALOG.title
//   2. CANONICAL COMPLIANCE DESCRIPTION — from RP22_CATALOG.notes (== .short)
//   3. CURRENT RESULT / ACHIEVED DETAIL — dynamic, when calculated
//   4. NOT CALCULATED — additional status line when applicable
//
// For P19/P20 (seat-scoped), the permanently expanded seat results below
// remain the result authority; the tooltip only describes the parameter.
//
// This is presentation-only. It does NOT recreate grading or maths.

import React from "react";
import { RP22_PRESENTATION_PARAMETERS } from "@/components/utils/rp22ParameterPresentation";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useOptionalSharedBassResults } from "@/components/room/bass/bassResultsStore";
import { formatP14Capability } from "@/components/utils/p14CapabilityAuthority";
import { formatBassParameterValue } from "@/components/room/bass/bassParameterValueFormatter";
import { resolveP14TargetSelectionState } from "@/components/room/bass/p14TargetSelectionState";

const PARAMETER_NUMBERS = Object.freeze({ p14: 14, p18: 18, p19: 19, p20: 20 });

// Single canonical lookup: parameter key → presentation parameter object.
// Built once from RP22_PRESENTATION_PARAMETERS (the same authority consumed
// by the Compliance Report via useParameterGridAuthority).
const CANONICAL_BY_KEY = Object.freeze(
  RP22_PRESENTATION_PARAMETERS.reduce((map, param) => {
    map[`p${param.number}`] = param;
    return map;
  }, {})
);

const isFiniteNumber = (value) => value !== null
  && value !== undefined
  && value !== ""
  && typeof value !== "boolean"
  && Number.isFinite(Number(value));

// Build the dynamic result/achieved detail lines from the canonical bass
// result. Returns an array of strings (may be empty). This is SEPARATE from
// the canonical description — it never replaces it.
function buildDynamicDetailLines(parameterKey, shared) {
  const authorityStatus = shared?.completedBassAuthority?.authorityStatus || "UNCALCULATED";
  const hasResult = shared?.hasCurrentResult === true;
  const isCalculating = shared?.calculationInProgress === true;
  const isStale = authorityStatus === "STALE";
  const p14Selection = resolveP14TargetSelectionState(shared?.authoritative?.requested);
  const noP14TargetSelected = p14Selection.noP14TargetSelected;

  // Seat-scoped parameters (P19/P20): no dynamic room-level detail line.
  // The permanently expanded per-seat results below are the authority.
  if (parameterKey === "p19" || parameterKey === "p20") {
    return [];
  }

  // Room-scoped parameters (P14/P18): show achieved value if calculated.
  if (noP14TargetSelected || isCalculating || isStale || !hasResult) {
    return [];
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
    return lines;
  }

  if (parameterKey === "p18") {
    if (p14Failed) return [];
    const source = parameters.p18;
    const value = isFiniteNumber(source?.value) ? Number(source.value) : null;
    if (value !== null) {
      const bounded = source?.achievedExtensionBounded === true;
      return [`Achieved -3 dB point: ${bounded ? "≤" : ""}${formatBassParameterValue("p18", value)}`];
    }
  }

  return [];
}

// Determine whether the NOT CALCULATED status line should appear.
function shouldShowNotCalculated(parameterKey, shared) {
  const authorityStatus = shared?.completedBassAuthority?.authorityStatus || "UNCALCULATED";
  const hasResult = shared?.hasCurrentResult === true;
  const isCalculating = shared?.calculationInProgress === true;
  const isStale = authorityStatus === "STALE";
  const p14Selection = resolveP14TargetSelectionState(shared?.authoritative?.requested);
  const noP14TargetSelected = p14Selection.noP14TargetSelected;

  // Seat-scoped parameters: NOT CALCULATED only when the entire bass analysis
  // has not run. The per-seat results below are the visual authority.
  if (parameterKey === "p19" || parameterKey === "p20") {
    return noP14TargetSelected || isCalculating || isStale || !hasResult;
  }

  // Room-scoped parameters: NOT CALCULATED when no result or P14 target unset.
  if (noP14TargetSelected || isCalculating || isStale || !hasResult) {
    return true;
  }

  const contract = shared?.completedBassAuthority?.contract;
  const parameters = contract?.productAnalysis?.parameters || {};
  const p14Failed = parameters?.p14?.pass === false;

  if (parameterKey === "p18" && p14Failed) return true;

  // P14: NOT CALCULATED if no capability value available.
  if (parameterKey === "p14") {
    const source = parameters.p14;
    const capability = source?.achievedCapabilityDb ?? source?.availableCapabilityDb;
    return !isFiniteNumber(capability);
  }

  return false;
}

export default function BassRp22ParameterTooltip({ parameterKey, children }) {
  const canonical = CANONICAL_BY_KEY[parameterKey];
  const shared = useOptionalSharedBassResults();
  const dynamicLines = buildDynamicDetailLines(parameterKey, shared);
  const showNotCalculated = shouldShowNotCalculated(parameterKey, shared);

  if (!canonical) return children;

  // Tooltip title: "P{number} — {canonical title}"
  const paramNumber = PARAMETER_NUMBERS[parameterKey] ?? canonical.number;
  const tooltipTitle = `P${paramNumber} — ${canonical.title}`;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-[340px] rounded-lg border-2 border-[#E6E4DD] bg-white p-3 text-[11px] leading-[1.5] text-[#1B1A1A] shadow-[0_4px_12px_rgba(0,0,0,0.15)]"
        >
          {/* 1. CANONICAL PARAMETER TITLE */}
          <div className="mb-1.5 text-xs font-semibold text-[#213428]">{tooltipTitle}</div>

          {/* 2. CANONICAL COMPLIANCE DESCRIPTION (from RP22_CATALOG.notes) */}
          <div className="mb-2 text-[11px] leading-[1.5] text-[#3E4349]">{canonical.short}</div>

          {/* 3. DYNAMIC RESULT / ACHIEVED DETAIL (separate section) */}
          {dynamicLines.length > 0 && (
            <div className="mt-1.5 pt-1.5 border-t border-[#E6E4DD]">
              {dynamicLines.map((line, index) => (
                <div key={index} className="text-[11px] leading-[1.5] text-[#1B1A1A]">{line}</div>
              ))}
            </div>
          )}

          {/* 4. NOT CALCULATED — additional status line */}
          {showNotCalculated && (
            <div className="mt-1.5 pt-1.5 border-t border-[#E6E4DD]">
              <div className="text-[11px] font-semibold text-[#8A7B6A]">NOT CALCULATED</div>
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}