// CapabilitySelector.jsx
// ---------------------------------------------------------------------------
// Stage 3 — Performance: Capability selector (P14 renamed)
//
// Presents instant capability level switching. No mention of cache,
// calculations, or implementation. Switching simply feels immediate.
//
// Defaults to L2 (minimum) per the frozen workflow:
//   "Default capability target: L2. Do not ask the designer to choose
//    a target before calculation."
//
// L1–L4 are instant toggles. "Custom" reveals the full BassTargetLevelControl
// for minimum/recommended basis selection.
// ---------------------------------------------------------------------------

import React, { useState, useEffect } from "react";
import { Settings2 } from "lucide-react";
import { useAppState } from "@/components/AppStateProvider";
import BassTargetLevelControl from "@/components/room/bass/BassTargetLevelControl";

const LEVELS = [
  { key: "L1", label: "L1", value: 1 },
  { key: "L2", label: "L2", value: 2 },
  { key: "L3", label: "L3", value: 3 },
  { key: "L4", label: "L4", value: 4 },
];

const DEFAULT_LEVEL = 2;
const DEFAULT_BASIS = "minimum";

export default function CapabilitySelector({ disabled }) {
  const appState = useAppState();
  const [showCustom, setShowCustom] = useState(false);
  const config = appState?.splConfig || {};

  const rawLevel = config.selectedP14Level;
  const selectedLevel = (Number.isFinite(Number(rawLevel)) && Number(rawLevel) > 0)
    ? Math.max(1, Math.min(4, Math.round(Number(rawLevel))))
    : null;

  const selectedBasis = config.selectedP14TargetBasis === "recommended" ? "recommended"
    : config.selectedP14TargetBasis === "minimum" ? "minimum"
    : null;

  // Auto-default to L2 minimum per frozen workflow.
  // Do not ask the designer to choose a target before calculation.
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

  // Display L2 as active when no selection exists yet (before the auto-default effect runs)
  const displayLevel = selectedLevel || DEFAULT_LEVEL;

  return (
    <div className="rounded-lg border border-[#E7E4DF] bg-white px-4 py-3" data-bda-stage="capability">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[#625143]">Capability</span>
          {selectedBasis && (
            <span className="text-[10px] text-[#8A7B6A] capitalize">{selectedBasis}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {LEVELS.map((level) => {
            const isActive = displayLevel === level.value;
            return (
              <button
                key={level.key}
                type="button"
                onClick={() => handleLevelChange(level.value)}
                disabled={disabled}
                className={`rounded-md px-3 py-1.5 text-[12px] font-semibold transition-all ${
                  isActive
                    ? "bg-[#213428] text-white border border-[#213428]"
                    : "bg-white text-[#213428] border border-[#D9D5CE] hover:bg-[#F5F5F0]"
                } disabled:cursor-not-allowed disabled:opacity-45`}
                aria-pressed={isActive}
              >
                {level.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setShowCustom((s) => !s)}
            className={`rounded-md px-2.5 py-1.5 text-[12px] font-semibold transition-all ${
              showCustom
                ? "bg-[#3E4349] text-white border border-[#3E4349]"
                : "bg-white text-[#625143] border border-[#D9D5CE] hover:bg-[#F5F5F0]"
            }`}
            aria-pressed={showCustom}
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {showCustom && (
        <div className="mt-3 border-t border-[#E7E4DF] pt-3">
          <BassTargetLevelControl disabled={disabled} />
        </div>
      )}
    </div>
  );
}