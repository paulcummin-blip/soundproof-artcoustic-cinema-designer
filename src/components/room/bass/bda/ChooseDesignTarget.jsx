// ChooseDesignTarget.jsx
// ---------------------------------------------------------------------------
// Stage 2 — Choose Design Target
//
// Shows the full RP22 target matrices so the designer sees the actual values
// they are choosing from.
//
// P14 — LFE Output: 8 selectable cells (Minimum/Recommended × L1–L4).
//   Each cell shows the real dBC target from the P14 capability authority and
//   carries a subtle cache-readiness indicator (READY / PREPARING). Selecting
//   a READY cell loads its persisted result immediately — no calculation.
//
// P18 — Bass Extension: all 8 thresholds visible (Minimum/Recommended × L1–L4).
//   Only the row (Minimum/Recommended) is selectable — it is a display-time
//   regrade of the achieved extension, not a separate calculation target.
//
// PRESENTATION ONLY. Consumes existing authorities (p14TargetDefinitions,
// p18ExtensionAuthority, target cache progress). Does NOT change bass maths,
// RP22 thresholds, cache identity, background scheduler, optimiser, or result
// authority.
// ---------------------------------------------------------------------------

import React, { useEffect, useMemo } from "react";
import { Check, Loader2 } from "lucide-react";
import { useAppState } from "@/components/AppStateProvider";
import { useOptionalSharedBassResults } from "@/components/room/bass/bassResultsStore";
import { useActiveProjectId } from "@/components/state/project-session";
import { buildP14TargetCombinations, buildP14TargetKey } from "@/components/room/bass/p14TargetDefinitions";
import { P18_THRESHOLDS_BY_BASIS, normalizeP18TargetBasis } from "@/components/utils/p18ExtensionAuthority";
import { useP14AnalysisProgress } from "@/components/room/bass/p14AnalysisProgressStore";

const DEFAULT_LEVEL = 2;
const DEFAULT_BASIS = "minimum";
const LEVELS = [1, 2, 3, 4];
const BASES = ["minimum", "recommended"];
const BASIS_SHORT = { minimum: "Min", recommended: "Rec" };

export default function ChooseDesignTarget({ disabled }) {
  const appState = useAppState();
  const shared = useOptionalSharedBassResults();
  const activeProjectId = useActiveProjectId();
  const projectId = activeProjectId || appState?.projectId || null;
  const versionId = appState?.activeVersionId || null;
  const progress = useP14AnalysisProgress(projectId, versionId);

  const config = appState?.splConfig || {};

  const rawLevel = config.selectedP14Level;
  const selectedLevel = (Number.isFinite(Number(rawLevel)) && Number(rawLevel) > 0)
    ? Math.max(1, Math.min(4, Math.round(Number(rawLevel))))
    : null;
  const selectedBasis = config.selectedP14TargetBasis === "recommended" ? "recommended"
    : config.selectedP14TargetBasis === "minimum" ? "minimum"
    : null;
  const selectedP18Basis = normalizeP18TargetBasis(config.selectedP18TargetBasis);

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

  // All 8 P14 combinations with their dB values from the authority.
  const combinations = useMemo(() => buildP14TargetCombinations(), []);
  const dbByCell = useMemo(() => {
    const map = {};
    for (const c of combinations) map[`${c.basis}-L${c.level}`] = c.db;
    return map;
  }, [combinations]);

  const selectedKey = selectedBasis && selectedLevel ? buildP14TargetKey(selectedBasis, selectedLevel) : null;
  const readyTargetKeys = shared?.p14FamilyProgress?.readyTargetKeys || [];
  const activeTargetKey = progress?.activeTargetKey || null;

  const handleP14Select = (basis, level) => {
    if (disabled) return;
    appState?.updateGlobalSpl?.({
      p14Mode: basis,
      selectedP14TargetBasis: basis,
      selectedP14Level: level,
    });
  };

  const handleP18Select = (basis) => {
    if (disabled) return;
    appState?.updateGlobalSpl?.({
      p18Mode: basis,
      selectedP18TargetBasis: basis,
    });
  };

  const displayBasis = selectedBasis || DEFAULT_BASIS;
  const displayLevel = selectedLevel || DEFAULT_LEVEL;
  const displayKey = buildP14TargetKey(displayBasis, displayLevel);

  return (
    <div className="rounded-lg border border-[#D9D5CE] bg-white px-4 py-3" data-bda-stage="design-target">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#625143]">Design Target</div>

      {/* ── P14 — LFE Output (8 selectable cells) ────────────────────── */}
      <div className="mt-2.5">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">P14 — LFE Output</span>
          <span className="text-[9px] font-medium uppercase tracking-wide text-[#A89B8C]">dBC</span>
        </div>
        <div className="grid items-center" style={{ gridTemplateColumns: "auto repeat(4, 1fr)", columnGap: "4px", rowGap: "2px" }}>
          <div />
          {LEVELS.map((level) => (
            <div key={`p14-h-${level}`} className="text-center text-[10px] font-semibold text-[#8A7B6A] pb-0.5">L{level}</div>
          ))}
          {BASES.map((basis) => (
            <React.Fragment key={`p14-row-${basis}`}>
              <div className="text-[10px] font-semibold text-[#625143] pr-1.5">{BASIS_SHORT[basis]}</div>
              {LEVELS.map((level) => {
                const key = buildP14TargetKey(basis, level);
                const db = dbByCell[key];
                const isCurrent = key === displayKey;
                const isReady = readyTargetKeys.includes(key);
                const isPreparing = key === activeTargetKey && !isReady;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleP14Select(basis, level)}
                    disabled={disabled}
                    className={`relative rounded-md px-1 py-1 text-[11px] font-semibold transition-all flex items-center justify-center gap-0.5
                      ${isCurrent
                        ? "bg-[#213428] text-white border border-[#213428]"
                        : isReady
                          ? "bg-[#F5F5F0] text-[#213428] border border-[#C9C3B5] hover:bg-[#EFEBE2]"
                          : "bg-white text-[#625143] border border-[#E5E1D8] hover:bg-[#F5F5F0]"}
                      disabled:cursor-not-allowed disabled:opacity-45`}
                    aria-pressed={isCurrent}
                    aria-label={`P14 ${basis} L${level} — ${db} dBC`}
                    title={`${basis === "minimum" ? "Minimum" : "Recommended"} / L${level} — ${db} dBC`}
                  >
                    {db}
                    {isReady && !isCurrent && (
                      <Check className="w-2 h-2 text-[#5B7A62] shrink-0" strokeWidth={3} />
                    )}
                    {isPreparing && (
                      <Loader2 className="w-2 h-2 text-[#A89B8C] animate-spin shrink-0" />
                    )}
                  </button>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* ── P18 — Bass Extension (row selection, all thresholds visible) ── */}
      <div className="mt-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">P18 — Bass Extension</span>
          <span className="text-[9px] font-medium uppercase tracking-wide text-[#A89B8C]">Hz</span>
        </div>
        <div className="grid items-center" style={{ gridTemplateColumns: "auto repeat(4, 1fr)", columnGap: "4px", rowGap: "2px" }}>
          <div />
          {LEVELS.map((level) => (
            <div key={`p18-h-${level}`} className="text-center text-[10px] font-semibold text-[#8A7B6A] pb-0.5">L{level}</div>
          ))}
          {BASES.map((basis) => {
            const isSelected = selectedP18Basis === basis;
            const thresholds = P18_THRESHOLDS_BY_BASIS[basis];
            return (
              <React.Fragment key={`p18-row-${basis}`}>
                <button
                  type="button"
                  onClick={() => handleP18Select(basis)}
                  disabled={disabled}
                  className={`text-[10px] font-semibold pr-1.5 text-left rounded transition-all disabled:cursor-not-allowed
                    ${isSelected ? "text-[#213428] font-bold" : "text-[#A89B8C] hover:text-[#625143]"}`}
                  aria-pressed={isSelected}
                  aria-label={`P18 ${basis} basis`}
                >
                  {BASIS_SHORT[basis]}
                </button>
                {LEVELS.map((level) => (
                  <div
                    key={`p18-${basis}-${level}`}
                    className={`text-center text-[11px] font-semibold rounded-md px-1 py-1 border transition-all
                      ${isSelected
                        ? "bg-[#213428]/8 text-[#213428] border-[#213428]/20"
                        : "text-[#A89B8C] border-transparent opacity-60"}`}
                  >
                    {thresholds[`L${level}`]}
                  </div>
                ))}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}