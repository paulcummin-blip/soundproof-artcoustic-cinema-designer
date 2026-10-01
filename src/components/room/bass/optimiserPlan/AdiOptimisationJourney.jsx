// AdiOptimisationJourney.jsx
// ---------------------------------------------------------------------------
// The ADI optimiser journey card.
//
// Replaces the dead-end "Evaluation incomplete" surface. It always states:
//
//   • the limiting factor and what is incomplete
//   • why it matters
//   • the next action (Run / Re-run / Complete Optimisation Plan)
//   • what that next step will evaluate and compare
//   • the reason, when the optimiser cannot run yet
//
// The run button is evidence-only: it runs the existing optimiser against the
// current design and saves the evaluated result. It never applies a lever, and
// never alters placement, delay, gain or polarity.
//
// This component performs no calculation of any kind — the journey state comes
// from the pure resolver, the plan from the plan status authority.
// ---------------------------------------------------------------------------

import React from "react";
import { Activity, AlertTriangle, ArrowRight, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { useOptimiserPlanView } from "./useOptimiserPlanView.js";
import {
  ADI_OPTIMISER_ACTION,
  ADI_OPTIMISER_JOURNEY_STATE,
  resolveAdiOptimiserJourney,
} from "./resolveAdiOptimiserJourney.js";
import { OPTIMISER_PRESENTATION_STATE } from "./resolveOptimiserPresentationState.js";
import OptimisationPlanStatus from "./OptimisationPlanStatus.jsx";
import OptimiserRunEvidenceBlock from "./OptimiserRunEvidenceBlock.jsx";
import OptimiserCalculationEstimateLine from "./OptimiserCalculationEstimateLine.jsx";
import OptimiserCalculationDetail from "./OptimiserCalculationDetail.jsx";
import AdiTestedOptionsTable from "./AdiTestedOptionsTable.jsx";
import AdiDesignerActionBar from "./AdiDesignerActionBar.jsx";
import { ADI_ENGINEER_DETAILS_TITLE, buildAdiDesignerSummary } from "./adiDesignerSummary.js";
import { readAuthoritativeP20Headline } from "./optimiserPlanMetrics.js";

const STATE_THEME = {
  [ADI_OPTIMISER_JOURNEY_STATE.OPTIMISATION_REQUIRED]: {
    pill: { background: "#625143", color: "#FFFFFF" },
    border: "#E0DCD5",
    background: "#F4F1EC",
    icon: Activity,
    iconColor: "#625143",
  },
  [ADI_OPTIMISER_JOURNEY_STATE.REEVALUATION_REQUIRED]: {
    pill: { background: "#B45309", color: "#FFFFFF" },
    border: "#E8D5AE",
    background: "#FDF6E9",
    icon: AlertTriangle,
    iconColor: "#B45309",
  },
  [ADI_OPTIMISER_JOURNEY_STATE.EVALUATION_INCOMPLETE]: {
    pill: { background: "#625143", color: "#FFFFFF" },
    border: "#E0DCD5",
    background: "#F4F1EC",
    icon: Activity,
    iconColor: "#625143",
  },
  [ADI_OPTIMISER_JOURNEY_STATE.PLAN_AVAILABLE]: {
    pill: { background: "#213428", color: "#FFFFFF" },
    border: "#CFDCCF",
    background: "#F4F7F4",
    icon: Activity,
    iconColor: "#213428",
  },
  [ADI_OPTIMISER_JOURNEY_STATE.NO_USEFUL_IMPROVEMENT]: {
    pill: { background: "#625143", color: "#FFFFFF" },
    border: "#E0DCD5",
    background: "#F4F1EC",
    icon: CheckCircle2,
    iconColor: "#625143",
  },
  [ADI_OPTIMISER_JOURNEY_STATE.FAILED]: {
    pill: { background: "#B91C1C", color: "#FFFFFF" },
    border: "#F0C9C9",
    background: "#FDF2F2",
    icon: AlertTriangle,
    iconColor: "#B91C1C",
  },
};

/**
 * The canonical presentation state and the journey state share one theme: the
 * theme is a presentation concern, the copy comes from the resolver.
 */
const PRESENTATION_THEME_KEY = Object.freeze({
  [OPTIMISER_PRESENTATION_STATE.NO_RUN]: ADI_OPTIMISER_JOURNEY_STATE.OPTIMISATION_REQUIRED,
  [OPTIMISER_PRESENTATION_STATE.RUNNING]: ADI_OPTIMISER_JOURNEY_STATE.OPTIMISATION_REQUIRED,
  [OPTIMISER_PRESENTATION_STATE.STALE]: ADI_OPTIMISER_JOURNEY_STATE.REEVALUATION_REQUIRED,
  [OPTIMISER_PRESENTATION_STATE.PLAN_AVAILABLE]: ADI_OPTIMISER_JOURNEY_STATE.PLAN_AVAILABLE,
  [OPTIMISER_PRESENTATION_STATE.EVALUATION_INCOMPLETE]: ADI_OPTIMISER_JOURNEY_STATE.EVALUATION_INCOMPLETE,
  [OPTIMISER_PRESENTATION_STATE.NO_USEFUL_IMPROVEMENT]: ADI_OPTIMISER_JOURNEY_STATE.NO_USEFUL_IMPROVEMENT,
  [OPTIMISER_PRESENTATION_STATE.FAILED]: ADI_OPTIMISER_JOURNEY_STATE.FAILED,
});

export default function AdiOptimisationJourney({
  projectId = null,
  versionId = null,
  completedBassAuthority = null,
  currentDesignFingerprint = null,
  instances = [],
  seatingPositions = [],
  seatCount = null,
  limitingFactorSentence = null,
  runBlockReason = null,
  runStatus = "idle",
  runError = null,
  onRunOptimisationPlan = null,
  onApplyLever = null,
  onUndoLever = null,
  leverApplyBusy = null,
  leverOutcome = null,
  assessment = null,
  why = null,
  presentation = null,
  className = "",
}) {
  const planView = useOptimiserPlanView({
    projectId,
    versionId,
    completedBassAuthority,
    currentDesignFingerprint,
    instances,
    seatingPositions,
  });

  const resolved = resolveAdiOptimiserJourney({
    planView,
    limitingFactorSentence,
    blockReason: runBlockReason,
  });

  // The canonical presentation state owns the pill, the headline, the
  // explanation, the evidence, the Apply visibility and the action. When it is
  // supplied, this card states exactly what it resolved, so the status and the
  // body can never disagree. Without it, the journey copy is used unchanged.
  const journey = presentation
    ? {
      ...resolved,
      state: PRESENTATION_THEME_KEY[presentation.state] || resolved.state,
      statusLabel: presentation.statusLabel,
      message: presentation.message,
      explanation: presentation.explanation || resolved.explanation,
      notes: presentation.notes.length ? presentation.notes : resolved.notes,
      action: presentation.action || resolved.action,
      actionLabel: presentation.actionLabel || resolved.actionLabel,
      canRun: presentation.runBlocked ? false : resolved.canRun,
      showPlan: presentation.showPlan,
    }
    : resolved;

  const theme = STATE_THEME[journey.state] || STATE_THEME[resolved.state];
  const Icon = theme.icon;
  const runEvidence = presentation?.evidence || null;
  const journeyStateKey = presentation?.state || resolved.state;

  // ── The designer view ──
  // The default card is the design decision: what was tested, what it found,
  // what is recommended and whether it can be applied. Every technical detail —
  // ids, coordinates, stage counts, proxy searches, rejection reasons — lives
  // inside the collapsed Engineer details disclosure.
  // The measured P20 headline and the limiting frequency come from the same
  // published authority the reports read — never recalculated here.
  const p20Headline = readAuthoritativeP20Headline(completedBassAuthority);
  const summary = buildAdiDesignerSummary({
    planView,
    presentation,
    instances,
    seatCount,
    currentP20Deviation: p20Headline?.variationDb ?? null,
    currentP20Level: p20Headline?.level ?? null,
    limitingFrequencyHz: p20Headline?.worstFrequencyHz ?? null,
    appliedLever: leverOutcome?.appliedLever ?? null,
  });
  const handleApplyRecommended = summary.actions.canApply && typeof onApplyLever === "function"
    ? () => onApplyLever(summary.recommendedLever)
    : null;
  const handleUndoRecommended = summary.actions.canUndo && typeof onUndoLever === "function"
    ? () => onUndoLever(summary.actions.undoLever || summary.recommendedLever)
    : null;

  const isRunning = runStatus === "running";
  const showAction = !!journey.action && journey.canRun && !isRunning;
  const showBlocked = !!journey.blockReason && !isRunning;
  const statusMessage = runStatus === "failed" && runError ? runError : journey.blockReason?.message;

  // Before the run, the card states how many design options ADI will test and
  // the acoustic work behind them. After the run, the confirmed count is stated
  // instead (run evidence), so an estimate is never shown beside real evidence.
  const isPreRun = journey.state === ADI_OPTIMISER_JOURNEY_STATE.OPTIMISATION_REQUIRED
    || journey.state === ADI_OPTIMISER_JOURNEY_STATE.REEVALUATION_REQUIRED;
  const showEstimate = isPreRun && !runEvidence;

  return (
    <div
      className={`rounded-lg border px-4 py-3 space-y-3 ${className}`}
      style={{ borderColor: theme.border, background: theme.background }}
      data-adi-optimiser-journey={journeyStateKey}
    >
      {/* Header — status */}
      <div className="flex flex-wrap items-center gap-2">
        <Icon className="h-4 w-4 shrink-0" style={{ color: theme.iconColor }} />
        <span className="min-w-0 text-[13px] font-semibold text-[#1B1A1A]">
          Bass Optimisation — Powered by ADI
        </span>
        <span
          className="ml-auto inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase"
          style={theme.pill}
        >
          {journey.statusLabel}
        </span>
      </div>

      {/* What is limiting the result, and what is incomplete */}
      <div className="text-[13px] font-semibold text-[#1B1A1A] leading-relaxed">
        {journey.message}
      </div>

      {/* What was tested, what was found, what is recommended */}
      {summary.testedSentence && (
        <div className="text-[11px] text-[#3E4349] leading-relaxed">{summary.testedSentence}</div>
      )}

      {summary.staleCopy ? (
        <div className="space-y-1">
          <div className="text-[11px] text-[#3E4349] leading-relaxed">{summary.staleCopy.MESSAGE}</div>
          {summary.previousBest && (
            <div className="text-[12px] font-semibold text-[#1B1A1A]">{summary.previousBest}</div>
          )}
          <div className="text-[11px] text-[#8A5A2B] leading-relaxed">{summary.staleCopy.INSTRUCTION}</div>
        </div>
      ) : (
        <div className="space-y-1">
          {summary.currentP20 && (
            <div className="text-[12px] text-[#3E4349]">
              Current result: <span className="font-semibold text-[#1B1A1A]">{summary.currentP20}</span>
            </div>
          )}
          {summary.recommendedP20 && (
            <div className="text-[12px] text-[#3E4349]">
              Best result found: <span className="font-semibold text-[#1B1A1A]">{summary.recommendedP20}</span>
            </div>
          )}
          {summary.recommendation && (
            <div className="text-[13px] font-semibold text-[#1B1A1A] leading-relaxed">
              {summary.recommendation}
            </div>
          )}
        </div>
      )}

      {/* The seating recommendation's own evaluated detail — the movement, the
          before/after, the trade-offs and whether every destination seat position
          is legal. Read from the saved plan; nothing is recalculated. */}
      {summary.seatingRecommendation && (
        <div className="rounded-md border border-[#E7E5E0] bg-white px-3 py-2 space-y-1">
          <div className="text-[12px] font-semibold text-[#1B1A1A]">
            {summary.seatingRecommendation.movementLabel}
            {summary.seatingRecommendation.wholeBlockMoved ? " (whole seating block)" : ""}
          </div>
          <div className="text-[11px] text-[#3E4349] leading-relaxed">
            {summary.seatingRecommendation.p20Before && summary.seatingRecommendation.p20After
              ? `P20 ${summary.seatingRecommendation.p20Before} → ${summary.seatingRecommendation.p20After}`
              : summary.seatingRecommendation.p20After
                ? `P20 ${summary.seatingRecommendation.p20After}`
                : null}
            {summary.seatingRecommendation.p20LevelBefore || summary.seatingRecommendation.p20LevelAfter
              ? ` · ${summary.seatingRecommendation.p20LevelBefore || "—"} → ${summary.seatingRecommendation.p20LevelAfter || "—"}`
              : ""}
          </div>
          {summary.seatingRecommendation.reason && (
            <div className="text-[11px] text-[#625143] leading-relaxed">
              Reason: {summary.seatingRecommendation.reason}
            </div>
          )}
          <div className="text-[10px] text-[#8B7F76] leading-relaxed">
            {summary.seatingRecommendation.worstSeat
              ? `Worst seat after the move: ${summary.seatingRecommendation.worstSeat}. `
              : ""}
            {summary.seatingRecommendation.p19Delta ? `P19 ${summary.seatingRecommendation.p19Delta}. ` : ""}
            {summary.seatingRecommendation.p14Delta ? `P14 ${summary.seatingRecommendation.p14Delta}. ` : ""}
            {summary.seatingRecommendation.p18DeltaHz != null
              && Math.abs(Math.round(summary.seatingRecommendation.p18DeltaHz)) > 0
              ? `P18 extension ${summary.seatingRecommendation.p18DeltaHz >= 0 ? "+" : "−"}${Math.abs(Math.round(summary.seatingRecommendation.p18DeltaHz))} Hz. `
              : ""}
            {summary.seatingRecommendation.destinationsValid === true
              ? `Every destination seat position checked: valid (${summary.seatingRecommendation.validationBasis}).`
              : summary.seatingRecommendation.destinationsValid === false
                ? `Not applied: ${summary.seatingRecommendation.validationReason || "a destination seat position is not legal in this room."}`
                : "Destination seat positions were validated by the optimiser before evaluation."}
          </div>
          {summary.seatingRecommendation.tradeOff && (
            <div className="text-[11px] text-[#8A5A2B]">
              Trade-off: {summary.seatingRecommendation.tradeOff}
            </div>
          )}
        </div>
      )}

      <AdiTestedOptionsTable summary={summary} />

      {/* Low-frequency absorption — ninth in the fixed order, after every
          practical lever. It is design advice: there is no Apply action, and it
          is never stated as a requirement or as a calculated result. */}
      {summary.absorption && (
        <div className="rounded-md border border-[#E7E5E0] bg-white px-3 py-2 space-y-1">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
            {summary.absorption.label}
          </div>
          <div className="text-[11px] text-[#3E4349] leading-relaxed">{summary.absorption.headline}</div>
          <div className="text-[11px] text-[#625143] leading-relaxed">{summary.absorption.location}</div>
        </div>
      )}

      <AdiDesignerActionBar
        summary={summary}
        busy={isRunning}
        onApply={handleApplyRecommended}
        onUndo={handleUndoRecommended}
        onRerun={onRunOptimisationPlan}
      />

      {/* How many design options ADI will test, and the acoustic work behind them. */}
      {showEstimate && (
        <OptimiserCalculationEstimateLine
          instances={instances}
          seatCount={seatCount}
          className="rounded-md border border-[#E7E5E0] bg-white px-3 py-2"
        />
      )}

      {/* Primary action */}
      {isRunning && (
        <div className="inline-flex items-center gap-2 rounded-md bg-[#213428] px-4 py-2 text-[12px] font-semibold text-white opacity-70">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Running Optimisation Plan…
        </div>
      )}

      {showAction && (
        <button
          type="button"
          onClick={onRunOptimisationPlan}
          className="inline-flex items-center gap-1.5 rounded-md bg-[#213428] px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#3E4349]"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {journey.actionLabel}
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Collapsed by default, and below the primary action. Every technical
          detail — lever order, per-family counts, comparison and method — lives
          here, never in the default card. */}
      {/* Engineer details — collapsed by default. The exact run timestamp,
          candidate ids, raw coordinates, stage counts, proxy searches, rejection
          reasons, combined-candidate detail, fingerprints and stale/current
          diagnostics live here and never in the default view. */}
      <details className="rounded-md border border-[#E7E5E0] bg-white px-3 py-2" data-adi-engineer-details="true">
        <summary className="cursor-pointer text-[11px] font-semibold text-[#625143]">
          {ADI_ENGINEER_DETAILS_TITLE}
        </summary>
        <div className="mt-2 space-y-3">
          {(assessment || why) && (
            <div className="space-y-0.5">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">Diagnosis</div>
              {why && <div className="text-[11px] text-[#3E4349] leading-relaxed">{why}</div>}
              {assessment && <div className="text-[11px] text-[#3E4349] leading-relaxed">{assessment}</div>}
            </div>
          )}

          {journey.explanation && (
            <div className="text-[11px] text-[#3E4349] leading-relaxed">{journey.explanation}</div>
          )}

          {journey.notes.length > 0 && (
            <div className="space-y-0.5 text-[11px] text-[#625143] leading-relaxed">
              {journey.notes.map((note) => <div key={note}>{note}</div>)}
            </div>
          )}

          <OptimiserRunEvidenceBlock evidence={runEvidence} seatCount={seatCount} instances={instances} />

          {journey.showPlan && (
            <OptimisationPlanStatus
              projectId={projectId}
              versionId={versionId}
              completedBassAuthority={completedBassAuthority}
              currentDesignFingerprint={currentDesignFingerprint}
              instances={instances}
              seatingPositions={seatingPositions}
              onApplyLever={onApplyLever}
              onUndoLever={onUndoLever}
              leverApplyBusy={leverApplyBusy}
              leverOutcome={leverOutcome}
            />
          )}

          {/* Absorption evidence — the frequency, how many seats share it, and
              which levers were evaluated without becoming the recommendation. */}
          {summary.absorption && (
            <div className="space-y-0.5 text-[11px] text-[#3E4349] leading-relaxed">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
                Low-frequency absorption evidence
              </div>
              {summary.absorption.frequencyText && (
                <div>Limiting frequency: {summary.absorption.frequencyText}</div>
              )}
              {summary.absorption.affectedSeatCount > 0 && (
                <div>Seats sharing this frequency: {summary.absorption.affectedSeatCount}</div>
              )}
              <div>Advice status: {summary.absorption.status}</div>
              <div>
                Placement already evaluated: {summary.absorption.placementEvaluated ? "yes" : "no"}
                {" · "}
                Seat-to-seat trade-off found: {summary.absorption.tradedOff ? "yes" : "no"}
              </div>
              {summary.attemptsWithoutGain.length > 0 && (
                <div>Evaluated without becoming the recommendation: {summary.attemptsWithoutGain.join(", ")}</div>
              )}
            </div>
          )}

          {showEstimate && <OptimiserCalculationDetail instances={instances} seatCount={seatCount} />}
        </div>
      </details>

      {/* Why the optimiser cannot run yet — always paired with the next step */}
      {showBlocked && (
        <div className="rounded-md border border-[#E8D5AE] bg-[#FDF6E9] px-3 py-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-[#B45309]" />
            <span className="text-[11px] font-semibold text-[#8A5A2B]">
              Optimisation Plan cannot run yet
            </span>
          </div>
          <div className="mt-1 text-[11px] text-[#8A5A2B] leading-relaxed">
            {journey.blockReason.message}
          </div>
        </div>
      )}

      {runStatus === "failed" && runError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700 leading-relaxed">
          {statusMessage}
        </div>
      )}

      {journey.action === ADI_OPTIMISER_ACTION.RUN && !journey.canRun && !showBlocked && !runError && (
        <div className="text-[11px] text-[#8A5A2B] leading-relaxed">
          The Optimisation Plan could not be started. Reopen the project and try again.
        </div>
      )}
    </div>
  );
}