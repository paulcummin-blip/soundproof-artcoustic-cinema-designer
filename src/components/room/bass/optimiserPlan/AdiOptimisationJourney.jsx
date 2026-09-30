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
import { Activity, AlertTriangle, ArrowRight, Loader2, Sparkles } from "lucide-react";
import { useOptimiserPlanView } from "./useOptimiserPlanView.js";
import {
  ADI_OPTIMISER_ACTION,
  ADI_OPTIMISER_JOURNEY_STATE,
  resolveAdiOptimiserJourney,
} from "./resolveAdiOptimiserJourney.js";
import OptimisationPlanStatus from "./OptimisationPlanStatus.jsx";

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
};

export default function AdiOptimisationJourney({
  projectId = null,
  versionId = null,
  completedBassAuthority = null,
  currentDesignFingerprint = null,
  instances = [],
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
  className = "",
}) {
  const planView = useOptimiserPlanView({
    projectId,
    versionId,
    completedBassAuthority,
    currentDesignFingerprint,
    instances,
  });

  const journey = resolveAdiOptimiserJourney({
    planView,
    limitingFactorSentence,
    blockReason: runBlockReason,
  });
  const theme = STATE_THEME[journey.state];
  const Icon = theme.icon;

  const isRunning = runStatus === "running";
  const showAction = !!journey.action && journey.canRun && !isRunning;
  const showBlocked = !!journey.blockReason && !isRunning;
  const statusMessage = runStatus === "failed" && runError ? runError : journey.blockReason?.message;

  return (
    <div
      className={`rounded-lg border px-4 py-3 space-y-3 ${className}`}
      style={{ borderColor: theme.border, background: theme.background }}
      data-adi-optimiser-journey={journey.state}
    >
      {/* Header — status */}
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4" style={{ color: theme.iconColor }} />
        <span className="text-[13px] font-semibold text-[#1B1A1A]">Bass Optimisation</span>
        <span
          className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase"
          style={theme.pill}
        >
          {journey.statusLabel}
        </span>
      </div>

      {/* What is limiting the result, and what is incomplete */}
      <div className="text-[13px] font-semibold text-[#1B1A1A] leading-relaxed">
        {journey.message}
      </div>

      {/* Why it matters — the ADI diagnosis behind the limitation */}
      {(assessment || why) && (
        <div className="space-y-0.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">Why</div>
          {why && <div className="text-[11px] text-[#3E4349] leading-relaxed">{why}</div>}
          {assessment && <div className="text-[11px] text-[#3E4349] leading-relaxed">{assessment}</div>}
        </div>
      )}

      {/* What the next step does */}
      {journey.explanation && (
        <div className="text-[11px] text-[#3E4349] leading-relaxed">{journey.explanation}</div>
      )}

      {journey.notes.length > 0 && (
        <div className="space-y-0.5 text-[11px] text-[#625143] leading-relaxed">
          {journey.notes.map((note) => <div key={note}>{note}</div>)}
        </div>
      )}

      {/* The read-only evaluated plan, when a current plan exists */}
      {journey.showPlan && (
        <OptimisationPlanStatus
          projectId={projectId}
          versionId={versionId}
          completedBassAuthority={completedBassAuthority}
          currentDesignFingerprint={currentDesignFingerprint}
          instances={instances}
          onApplyLever={onApplyLever}
          onUndoLever={onUndoLever}
          leverApplyBusy={leverApplyBusy}
          leverOutcome={leverOutcome}
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
          className="inline-flex items-center gap-1.5 rounded-md bg-[#213428] px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#3E4349]"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {journey.actionLabel}
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      )}

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