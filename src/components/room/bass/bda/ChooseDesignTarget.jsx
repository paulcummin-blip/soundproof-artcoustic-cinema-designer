// ChooseDesignTarget.jsx
// ---------------------------------------------------------------------------
// Sprint 1 — Stage 2: Choose Design Target
//
// Visible immediately below Current Layout. Never hidden. Never collapsed.
//
// The designer chooses two design objectives:
//   - P14 Capability  (the SPL level they are designing to)
//   - P18 Extension    (how deep the bass should reach)
//
// These are design objectives, not engineering detail.
// No gear icon. No custom panel. No engineering terminology.
// ---------------------------------------------------------------------------

import React, { useEffect } from "react";
import { useAppState } from "@/components/AppStateProvider";

const LEVEL_LABELS = {
  1: "Entry level — casual listening",
  2: "Standard — typical home cinema",
  3: "High performance — dedicated cinema room",
  4: "Reference — the highest RP22 level",
};

const P18_LABELS = {
  minimum: "Basic bass extension grading",
  recommended: "Fuller extension with stricter grading",
};

const DEFAULT_LEVEL = 2;
const DEFAULT_BASIS = "minimum";

export default function ChooseDesignTarget({ disabled }) {
  const appState = useAppState();
  const config = appState?.splConfig || {};

  const rawLevel = config.selectedP14Level;
  const selectedLevel = (Number.isFinite(Number(rawLevel)) && Number(rawLevel) > 0)
    ? Math.max(1, Math.min(4, Math.round(Number(rawLevel))))
    : null;

  const selectedBasis = config.selectedP14TargetBasis === "recommended" ? "recommended"
    : config.selectedP14TargetBasis === "minimum" ? "minimum"
    : null;

  const selectedP18Basis = config.selectedP18TargetBasis === "recommended" ? "recommended" : "minimum";

  // Auto-default to L2 minimum per frozen workflow.
  useEffect(() => {
    if (!selectedBasis || !selectedLevel) {
      appState?.updateGlobalSpl?.({
        p14Mode: DEFAULT_BASIS,
        selectedP14TargetBasis: DEFAULT_BASIS,
        selectedP14Level: DEFAULT_LEVEL,
      });
    }
  }, [selectedBasis, selectedLevel]);

  const handleLevelChange = (level) => {
    if (disabled) return;
    const basis = selectedBasis || DEFAULT_BASIS;
    appState?.updateGlobalSpl?.({
      p14Mode: basis,
      selectedP14TargetBasis: basis,
      selectedP14Level: level,
    });
  };

  const handleP18BasisChange = (basis) => {
    if (disabled) return;
    appState?.updateGlobalSpl?.({
      p18Mode: basis,
      selectedP18TargetBasis: basis,
    });
  };

  const displayLevel = selectedLevel || DEFAULT_LEVEL;

  return (
    <div className="flex items-center gap-4 flex-wrap" data-bda-stage="design-target">
      <span className="text-[13px] font-semibold text-[#1B1A1A]" style={{ fontFamily: "Didact Gothic, sans-serif" }}>
        Design Target
      </span>
      {/* P14 Capability */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[#625143]">P14</span>
        {[1, 2, 3, 4].map((level) => {
          const isActive = displayLevel === level;
          return (
            <button
              key={level}
              type="button"
              onClick={() => handleLevelChange(level)}
              disabled={disabled}
              className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all ${
                isActive
                  ? "bg-[#213428] text-white border border-[#213428]"
                  : "bg-white text-[#213428] border border-[#D9D5CE] hover:bg-[#F5F5F0]"
              } disabled:cursor-not-allowed disabled:opacity-45`}
              aria-pressed={isActive}
            >
              L{level}
            </button>
          );
        })}
      </div>
      {/* P18 Extension */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[#625143]">P18</span>
        {["minimum", "recommended"].map((basis) => {
          const isActive = selectedP18Basis === basis;
          return (
            <button
              key={basis}
              type="button"
              onClick={() => handleP18BasisChange(basis)}
              disabled={disabled}
              className={`rounded-md px-2.5 py-1 text-[11px] font-semibold capitalize transition-all ${
                isActive
                  ? "bg-[#213428] text-white border border-[#213428]"
                  : "bg-white text-[#213428] border border-[#D9D5CE] hover:bg-[#F5F5F0]"
              } disabled:cursor-not-allowed disabled:opacity-45`}
              aria-pressed={isActive}
            >
              {basis}
            </button>
          );
        })}
      </div>
    </div>
  );
}