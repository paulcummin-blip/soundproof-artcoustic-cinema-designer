// BassDesignAssistant.jsx
//
// Stage 1 Bass Design Assistant shell — a recommendation-first Bass workspace
// that sits above the existing detailed Bass surfaces (Subwoofers panel,
// Bass Simulation panel).
//
// This is a PRESENTATION and INFORMATION-ARCHITECTURE change only.
// It does NOT change acoustics maths, P14/P18/P19/P20 grading, optimiser
// scoring, subwoofer prediction logic, or canonical result authority.
//
// It consumes existing shared authority only:
//   - useSharedBassResults()           → lifecycle, authority, seating
//   - formatOfficialBassResults()       → P14/P18/P19/P20 formatted pills + rows
//   - resolveBassLifecycleState()      → unified lifecycle state
//   - BassHeadlinePills                 → single shared P14/P18/P19/P20 summary
//   - OptimiseAndCalculate              → single primary calculation action
//   - SharedP19P20SeatResults           → per-seat P19/P20 (engineering evidence)
//   - BassDesignRecommendation          → limitation + improvement (if available)
//   - BassTargetLevelControl            → P14/P18 target settings (evidence)
//
// Old duplicated surfaces (SubwooferPanel pills, BassResponse result cards)
// will be removed in Stage 3. For Stage 1 they remain intact beneath this shell.

import React, { useState, useEffect } from "react";
import { Waves, ChevronDown, ChevronRight } from "lucide-react";
import { useSharedBassResults } from "@/components/room/bass/bassResultsStore";
import {
  resolveBassLifecycleState,
  BASS_LIFECYCLE_STATE,
} from "@/components/room/bass/bassCalculationLifecycle";
import { resolveP14TargetSelectionState } from "@/components/room/bass/p14TargetSelectionState";
import { formatOfficialBassResults } from "@/components/room/bass/bassResultsPresentation";
import BassHeadlinePills from "@/components/room/bass/BassHeadlinePills";
import BassDesignRecommendation from "@/components/room/bass/BassDesignRecommendation";
import SharedP19P20SeatResults from "@/components/room/bass/SharedP19P20SeatResults";
import BassTargetLevelControl from "@/components/room/bass/BassTargetLevelControl";
import OptimiseAndCalculate from "@/components/room/bass/optimiseWorkflow/OptimiseAndCalculate";
import BassRecommendationSection from "@/components/room/bass/recommendationAuthority/BassRecommendationSection";
import { useSubwooferCompatibilityActions } from "@/components/hooks/useSubwooferCompatibilityActions";

// ── Shell copy per unified lifecycle state ──
// Plain language. No implementation detail. No invented recommendations.
const SHELL_COPY = {
  [BASS_LIFECYCLE_STATE.IDLE]: {
    badge: "Ready",
    badgeColor: "#625143",
    summary: "No bass calculation yet.",
    nextAction: "Set your bass target, then press Optimise & Calculate.",
  },
  [BASS_LIFECYCLE_STATE.QUEUED]: {
    badge: "Queued",
    badgeColor: "#625143",
    summary: "Bass calculation is queued.",
    nextAction: "Waiting for the calculation to start.",
  },
  [BASS_LIFECYCLE_STATE.PREPARING]: {
    badge: "Calculating",
    badgeColor: "#2563EB",
    summary: "Bass calculation is running.",
    nextAction: "Wait for the calculation to complete.",
  },
  [BASS_LIFECYCLE_STATE.SEARCHING]: {
    badge: "Calculating",
    badgeColor: "#2563EB",
    summary: "Bass calculation is running.",
    nextAction: "Wait for the calculation to complete.",
  },
  [BASS_LIFECYCLE_STATE.VALIDATING]: {
    badge: "Calculating",
    badgeColor: "#2563EB",
    summary: "Bass calculation is running.",
    nextAction: "Wait for the calculation to complete.",
  },
  [BASS_LIFECYCLE_STATE.COMPLETE]: {
    badge: "Current",
    badgeColor: "#16A34A",
    summary: "Bass result is current.",
    nextAction: "Review the results below. Adjust your design and recalculate to explore improvements.",
  },
  [BASS_LIFECYCLE_STATE.CANCELLED]: {
    badge: "Cancelled",
    badgeColor: "#625143",
    summary: "Calculation cancelled. Your current design was not changed.",
    nextAction: "Press Optimise & Calculate to try again.",
  },
  [BASS_LIFECYCLE_STATE.TIMED_OUT]: {
    badge: "Timed out",
    badgeColor: "#B45309",
    summary: "Calculation timed out. Your current design was not changed.",
    nextAction: "Press Optimise & Calculate to try again.",
  },
  [BASS_LIFECYCLE_STATE.FAILED]: {
    badge: "Failed",
    badgeColor: "#DC2626",
    summary: "Bass calculation failed. Your current design was not changed.",
    nextAction: "Press Optimise & Calculate to try again.",
  },
  [BASS_LIFECYCLE_STATE.STALE_NEEDS_RECALCULATION]: {
    badge: "Stale",
    badgeColor: "#B45309",
    summary: "This result needs recalculation. The room, seating, target, or subwoofer layout has changed.",
    nextAction: "Press Optimise & Calculate to recalculate with your current design.",
  },
};

const UNSELECTED_COPY = {
  badge: "Select Target",
  badgeColor: "#625143",
  summary: "Select a bass target to begin.",
  nextAction: "Choose a P14 bass SPL target below, then press Optimise & Calculate.",
};

export default function BassDesignAssistant({
  appState,
  frontSubsCfg,
  rearSubsCfg,
  disabled,
  roomDims,
  seatingPositions,
}) {
  const shared = useSharedBassResults();
  const compat = useSubwooferCompatibilityActions(appState, frontSubsCfg, rearSubsCfg);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());

  // Tick clock while calculating so elapsed-time text stays live.
  const isCalculating = shared.calculationInProgress
    || ["queued", "stale", "calculating", "running"].includes(shared.lifecycle?.status);
  useEffect(() => {
    if (!isCalculating) return undefined;
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isCalculating, shared.lifecycle?.startedAtMs, shared.lifecycle?.queuedAtMs]);

  // ── Unified lifecycle state from existing authority ──
  const lifecycleState = resolveBassLifecycleState({
    calculationInProgress: shared.calculationInProgress,
    calculationPhase: shared.calculationPhaseLabel,
    calculationOutcome: shared.calculationOutcome,
    authorityStatus: shared.completedBassAuthority?.authorityStatus,
  });

  const p14Selection = resolveP14TargetSelectionState(shared.authoritative?.requested);
  const copy = p14Selection.noP14TargetSelected
    ? UNSELECTED_COPY
    : (SHELL_COPY[lifecycleState] || SHELL_COPY[BASS_LIFECYCLE_STATE.IDLE]);

  // ── Formatted official results for the engineering evidence section ──
  // BassHeadlinePills calls formatOfficialBassResults internally too; this
  // second call is for the per-seat rows and publication status used below.
  const formatted = formatOfficialBassResults(
    shared.completedBassAuthority,
    shared.lifecycle,
    shared.seatingPositions,
    nowMs,
    p14Selection.noP14TargetSelected,
    {
      p14TargetBasis: shared.authoritative?.requested?.p14TargetBasis,
      p18TargetBasis: shared.authoritative?.requested?.p18TargetBasis,
    },
    shared.p19SeatAuthority,
  );

  const recommendation = shared.contract?.designRecommendation || null;
  const seats = seatingPositions || appState?.seatingPositions || [];

  return (
    <div className="rounded-xl border border-[#DCDBD6] bg-white p-4 space-y-4">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Waves className="w-5 h-5 text-[#213428]" />
          <h3
            className="text-[15px] font-bold text-[#1B1A1A]"
            style={{ fontFamily: "Didact Gothic, sans-serif" }}
          >
            Bass Design Assistant
          </h3>
        </div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            padding: "3px 10px",
            borderRadius: 999,
            background: `${copy.badgeColor}15`,
            color: copy.badgeColor,
            border: `1px solid ${copy.badgeColor}40`,
            whiteSpace: "nowrap",
          }}
        >
          {copy.badge}
        </span>
      </div>

      {/* ── Plain-language summary ── */}
      <p className="text-[13px] text-[#1B1A1A] leading-relaxed">{copy.summary}</p>

      {/* ── Recommended next action ── */}
      <p className="text-[12px] text-[#625143] leading-relaxed">{copy.nextAction}</p>

      {/* ── Stage 2: Recommendation vs Applied Calibration (presentation only) ── */}
      {/* Displays the Recommendation Authority and Applied Calibration Authority
          side by side, plus a difference summary. No actions — read-only. */}
      <BassRecommendationSection appState={appState} />

      {/* ── Single shared P14/P18/P19/P20 summary ── */}
      {/* BassHeadlinePills consumes the same shared authority and is
          publication-gated: stale/failed/calculating states show the correct
          non-current text, never old grades as current. */}
      <BassHeadlinePills nowMs={nowMs} />

      {/* ── Primary action: single Optimise & Calculate ── */}
      {/* Reusing the existing component so lifecycle, cancel, retry, timeout
          and stale behaviour remain intact. No second calculate button. */}
      <OptimiseAndCalculate
        roomDims={roomDims || appState?.roomDims}
        seatingPositions={seats}
        subwooferInstances={appState?.subwooferInstances}
        frontSubsCfg={frontSubsCfg}
        rearSubsCfg={rearSubsCfg}
        commitInstances={compat.commitInstances}
        commitSeating={appState?.setSeatingPositions}
        commitSeatingProvenance={appState?.setAppliedSeatingProvenance}
        appliedSeatingProvenance={appState?.appliedSeatingProvenance}
        hasCanonicalInstances={compat.hasCanonicalInstances}
        appState={appState}
        disabled={disabled}
      />

      {/* ── Engineering evidence — collapsed by default ── */}
      {/* Stage 1 links users to existing evidence without moving all
          engineering components. Old duplicated surfaces (SubwooferPanel,
          BassResponse) remain available in their existing panels and will
          be removed in Stage 3. */}
      <div className="border-t border-[#DCDBD6] pt-3">
        <button
          type="button"
          onClick={() => setEvidenceOpen((open) => !open)}
          className="flex items-center gap-2 text-[12px] font-semibold text-[#625143] hover:text-[#213428] transition-colors"
        >
          {evidenceOpen ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
          Engineering evidence
        </button>
        {evidenceOpen && (
          <div className="mt-3 space-y-3">
            {/* P14/P18 target settings */}
            <div className="rounded-lg border border-[#E7E4DF] bg-white/70 px-4 py-3">
              <div className="text-[11px] font-semibold text-[#625143] mb-2 uppercase tracking-wide">
                Target Settings
              </div>
              <BassTargetLevelControl disabled={disabled} />
            </div>

            {/* P19/P20 per-seat results */}
            <SharedP19P20SeatResults
              p19Rows={formatted.p19Rows}
              p20Rows={formatted.p20Rows}
              p19Summary={
                formatted.p19SeatAuthority?.project?.coverageSummary || null
              }
              publicationVerified={formatted.publicationVerified}
              authorityStatus={shared.completedBassAuthority?.authorityStatus}
              p14TargetUnselected={p14Selection.noP14TargetSelected}
            />

            {/* Design recommendation (limitation + improvement) */}
            {recommendation && !p14Selection.noP14TargetSelected && (
              <BassDesignRecommendation recommendation={recommendation} />
            )}

            {/* Authority / lifecycle status text */}
            <div className="text-[10px] text-[#8B7F76] font-mono">
              Authority:{" "}
              {shared.completedBassAuthority?.authorityStatus ||
                "UNCALCULATED"}{" "}
              · Lifecycle: {lifecycleState}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}