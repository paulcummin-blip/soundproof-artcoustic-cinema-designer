// BassPerformanceStrip — THE authoritative P14/P18/P19/P20 result band.
//
// The primary output of the Bass Design Assistant. Strong horizontal
// hierarchy: dark rules above and below, warm-neutral background, generous
// vertical padding, level pill visually dominant, numeric result adjacent.
//
// Layout per result (desktop, single row):
//   P14   [L2]   112 dBC
//   P18   [L2]   26 Hz
//   P19   [L4]   ±1.8 dB
//   P20   [L1]   ±5 dB
//
// Narrower widths: 2 × 2 grid, same hierarchy preserved.
//
// PRESENTATION ONLY. Reads the same canonical authority (formatOfficialBassResults)
// as every other surface. Does NOT change values, grading, lifecycle, maths,
// optimiser, or publication. Clicking a result focuses the graph on that
// RP22 parameter (preserved from GraphHeaderPills).
//
// Stale state: the strip remains visible with previous values — prominence is
// NOT reduced. The assessment status is stated ONCE, by the authority band
// below the four results, and is never repeated on each result.
import React, { useEffect, useState } from "react";
import RP22GradingPill from "@/components/ui/RP22GradingPill";
import BassResultDetailTooltip from "@/components/room/bass/BassResultDetailTooltip";
import { formatOfficialBassResults } from "@/components/room/bass/bassResultsPresentation";
import useSharedBassAuthorityState from "@/components/room/bass/useSharedBassAuthorityState";
import { resolveP14TargetSelectionState } from "@/components/room/bass/p14TargetSelectionState";
import { useGraphInteraction, setGraphInteraction, clearGraphInteraction } from "@/components/room/bass/bda/graphInteractionStore";
import { useEffectiveBassLifecycleState } from "@/components/room/bass/bda/useEffectiveBassLifecycle";
import { BASS_AUTHORITY_STATE } from "@/components/room/bass/bassAuthorityState";
import BassAuthorityStateBar from "@/components/room/bass/bda/BassAuthorityStateBar";
import useBassAuthorityAutoPublication from "@/components/room/bass/bda/useBassAuthorityAutoPublication";
import BassRecalculationBar from "@/components/room/bass/bda/BassRecalculationBar";
import { bassRecalculationRequired } from "@/components/room/bass/bda/bassRecalculationWarning";

const PARAM_KEYS = ["p14", "p18", "p19", "p20"];
const PARAM_LABELS = { p14: "P14", p18: "P18", p19: "P19", p20: "P20" };

function splitPillContent(resultText) {
  const text = String(resultText || "");
  const sepIndex = text.indexOf(" · ");
  if (sepIndex === -1) return { pillLabel: text, supportingText: null };
  return {
    pillLabel: text.slice(0, sepIndex),
    supportingText: text.slice(sepIndex + 3),
  };
}

export default function BassPerformanceStrip() {
  const { shared, authorityState } = useSharedBassAuthorityState();
  const interaction = useGraphInteraction();
  const [clock, setClock] = useState(Date.now());

  // The state of the band, from the shared authority: preview only, needs
  // calculation, saving, or current. A completed result needs no action at all —
  // it saves and publishes itself (useBassAuthorityAutoPublication) — so the
  // band only ever asks for a calculation, or, after a save that genuinely did
  // not land, for that save to be tried again or the result to be recalculated.
  const autoPublication = useBassAuthorityAutoPublication({
    projectId: shared?.scopeId,
    versionId: shared?.versionId,
    stateCode: authorityState.code,
    resultFingerprint: shared?.completedBassAuthority?.currentFingerprint || null,
  });
  const saveFailed = authorityState.code === BASS_AUTHORITY_STATE.SAVE_FAILED;
  const calculating = shared?.calculationInProgress === true;
  // The permanent manual control. It is available whenever the design is
  // calculable — including when the result is already current, and when nothing
  // has changed at all — and every click goes straight into the existing
  // authoritative calculation, saving and publication workflow.
  // The control is always present; it is only disabled while the design is not
  // calculable (no subs, no seats) or a calculation is already running.
  const canCalculate = shared?.canCalculate === true;
  const hasResult = !!shared?.completedBassAuthority?.contract?.job?.resultFingerprint;
  const calculate = typeof shared?.onCalculate === "function" ? shared.onCalculate : null;
  // The band keeps only the action that is NOT a calculation: retrying a save
  // that did not land. Calculate / Recalculate lives in the permanent button
  // below, so the two are never shown as duplicate controls.
  const stateAction = saveFailed ? autoPublication.retrySave : null;
  // The design moved on (or a recalculation failed and the previous published
  // result is retained): say so, beside the button that fixes it. The condition
  // is read from the same authority state that decides currency — there is no
  // second change detection here.
  const recalculationRequired = bassRecalculationRequired({
    hasResult,
    stateCode: authorityState.code,
  });

  const active = shared.calculationInProgress || shared.bassLifecycleState === "stale_needs_recalculation";
  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active, shared.lifecycle?.startedAtMs, shared.lifecycle?.queuedAtMs]);

  const p14Selection = resolveP14TargetSelectionState(shared.authoritative?.requested);
  // ── Global restore display override ──────────────────────────────────
  // Subscribe to restoreStateStore so the strip sees RESTORING on the same
  // synchronous tick as the restore click — before shared.bassLifecycleState
  // catches up. Suppresses "Performance is current" during the restore window.
  const effectiveLifecycle = useEffectiveBassLifecycleState(
    shared.scopeId, shared.versionId, shared.bassLifecycleState,
  );
  const formatted = formatOfficialBassResults(
    shared.completedBassAuthority,
    shared.lifecycle,
    shared.seatingPositions,
    clock,
    p14Selection.noP14TargetSelected,
    {
      p14TargetBasis: shared.authoritative?.requested?.p14TargetBasis,
      p18TargetBasis: shared.authoritative?.requested?.p18TargetBasis,
    },
    shared.p19SeatAuthority,
    effectiveLifecycle,
  );

  const handlePillClick = (key) => {
    if (interaction.selectedMetric === key) {
      clearGraphInteraction();
    } else {
      setGraphInteraction({ selectedMetric: key });
    }
  };

  return (
    <div
      className="grid grid-cols-2 sm:grid-cols-4 transition-opacity duration-300"
      style={{
        borderTop: "2px solid #213428",
        borderBottom: "2px solid #213428",
        background: "#FAF8F4",
        padding: "14px 20px",
        gap: "4px 8px",
      }}
    >
      {PARAM_KEYS.map((key) => {
        const pill = formatted.pills[key];
        if (!pill) return null;
        const { pillLabel, supportingText } = splitPillContent(pill.resultText);
        const isActive = interaction.selectedMetric === key;

        return (
          <BassResultDetailTooltip key={key} parameterKey={key}>
            <button
              type="button"
              onClick={() => handlePillClick(key)}
              className={`flex items-center gap-2.5 justify-center rounded-md transition-all duration-150 cursor-pointer select-none
                ${isActive
                  ? "bg-[#213428]/8 ring-1 ring-[#213428]/25"
                  : "hover:bg-[#213428]/4"
                }`}
              style={{ padding: "8px 10px", minHeight: "46px" }}
              aria-label={pill.text}
              title={`Click to focus the graph on ${PARAM_LABELS[key]}`}
            >
              {/* Parameter identifier — smaller bold */}
              <span
                className="font-bold shrink-0"
                style={{ fontSize: "12px", color: "#213428", letterSpacing: "0.02em" }}
              >
                {PARAM_LABELS[key]}
              </span>

              {/* Level badge — visually dominant */}
              <RP22GradingPill level={pill.level}>
                {pillLabel}
              </RP22GradingPill>

              {/* Numeric result — strong, readable */}
              {supportingText && (
                <span
                  className="font-semibold shrink-0"
                  style={{ fontSize: "14px", color: "#1B1A1A", letterSpacing: "0.01em" }}
                >
                  {supportingText}
                </span>
              )}

            </button>
          </BassResultDetailTooltip>
        );
      })}

      <BassAuthorityStateBar
        state={authorityState}
        onPrimaryAction={stateAction}
        primaryDisabled={calculating}
      />

      {/* The permanent manual calculate / recalculate control, beside the
          RP22 results. */}
      <BassRecalculationBar
        hasResult={hasResult}
        calculating={calculating}
        canCalculate={canCalculate}
        warning={recalculationRequired}
        onCalculate={calculate}
      />
    </div>
  );
}