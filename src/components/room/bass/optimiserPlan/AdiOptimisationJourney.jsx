// AdiOptimisationJourney.jsx
// ---------------------------------------------------------------------------
// The ADI Bass Optimisation panel.
//
// The panel states FOUR layers, in this order, and nothing else in its default
// view:
//
//   1. RESULT SUMMARY        — what ADI has already done: the finding, the
//                              current result and the best result found
//   2. SAFE CALIBRATION      — the processor settings ADI may apply on its own
//      (Section 1)             (delay, gain, polarity, phase) and what it did
//   3. DESIGN RECOMMENDATION — the physical change ADI recommends but has NOT
//      (Section 2)             applied; only the designer may approve it
//   3b. WHAT ADI TESTED      — one compact list, split into calibration as
//      (Section 3)             against design, so the two are never mixed
//   4. ENGINEER DETAILS      — collapsed; every id, count, fingerprint,
//                              frequency, seat and before/after value
//
// ONE primary action per state, decided by the layout model in
// adiPanelSections.js: the design recommendation when a physical change can be
// applied, otherwise the calibration action, otherwise the run control (or the
// bass calculation, when that calculation IS the required action). Every other
// available action stays visible as a secondary control, so two green buttons
// can never compete for attention.
//
// The run button is evidence-only: it runs the existing optimiser against the
// current design and saves the evaluated result. It never applies a lever, and
// never alters placement, delay, gain or polarity.
//
// This component performs no calculation of any kind — the journey state comes
// from the pure resolver, the plan from the plan status authority, and the two
// kinds of change from the calibration decision authority.
// ---------------------------------------------------------------------------

import React from "react";
import { Activity, AlertTriangle, ArrowRight, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { useOptimiserPlanView } from "./useOptimiserPlanView.js";
import { useImproveBassV2State } from "../improveBassV2/improveBassV2Store.js";
import {
  ADI_BASS_OPTIMISER_LABEL,
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
import AdiTestedSection from "./AdiTestedSection.jsx";
import AdiCalibrationSection from "./AdiCalibrationSection.jsx";
import AdiDesignRecommendationSection from "./AdiDesignRecommendationSection.jsx";
import AdiPanelSummary from "./AdiPanelSummary.jsx";
import AdiEngineerEvidenceBlock from "./AdiEngineerEvidenceBlock.jsx";
import AdiDesignerActionBar from "./AdiDesignerActionBar.jsx";
import PlacementRecommendationPanel from "./PlacementRecommendationPanel.jsx";
import AdiBeforeAfterResult from "./AdiBeforeAfterResult.jsx";
import AdiAppliedBassCalibration from "./AdiAppliedBassCalibration.jsx";
import ReoptimiseCalibrationAction from "./ReoptimiseCalibrationAction.jsx";
import { useAppliedCalibrationAuthority } from "../appliedCalibrationAuthority/appliedCalibrationAuthorityStore.js";
import { OPTIMISER_LEVER } from "./optimiserPlanConstants.js";
import AcousticDelayAlignmentCard from "@/components/room/bass/improveBassV2/AcousticDelayAlignmentCard.jsx";
import { PLACEMENT_PREVIEW_UNAVAILABLE } from "./placementMoveAuthority.js";
import { PLACEMENT_KIND } from "./placementRecommendationAuthority.js";
import { ADI_ENGINEER_DETAILS_TITLE, buildAdiDesignerSummary } from "./adiDesignerSummary.js";
import {
  ADI_CALIBRATION_KIND,
  ADI_PRIMARY_ACTION,
  CALIBRATION_LEVER_KEYS,
  resolveAdiPanelFinding,
  resolveAdiPrimaryAction,
  resolveCalibrationSectionKind,
} from "./adiPanelSections.js";
import { FUTURE_CAPABILITY_TITLE } from "./optimiserLiveFamilies.js";
import { readAuthoritativeP20Headline } from "./optimiserPlanMetrics.js";

// ONE primary control per state. Which layer owns it is decided by the layout
// model (adiPanelSections.js); every other available action is drawn as a
// secondary control, so two green buttons can never compete.
const ADI_RUN_PRIMARY_CLASS = "inline-flex items-center gap-1.5 rounded-md bg-[#213428] px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#3E4349]";
const ADI_RUN_SECONDARY_CLASS = "inline-flex items-center gap-1.5 rounded-md border border-[#D9D5CE] bg-white px-5 py-2.5 text-[13px] font-semibold text-[#213428] transition-colors hover:border-[#213428]";

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
  roomDims = null,
  limitingFactorSentence = null,
  runBlockReason = null,
  runStatus = "idle",
  runError = null,
  onRunOptimisationPlan = null,
  onCalculateBassPerformance = null,
  // The CALIBRATION APPLY workflow — the only action that can write processor
  // calibration (delay, gain, polarity, phase), recalculate and republish. It is
  // null when it is not offered: no saved authority, a stale design whose own
  // "Update Bass Performance" action already runs it, or a design that is not
  // calculate-ready. Distinct from onRunOptimisationPlan, which never applies.
  onReoptimiseCalibration = null,
  reoptimiseBusy = false,
  reoptimiseDisabledReason = null,
  onApplyLever = null,
  onUndoLever = null,
  leverApplyBusy = null,
  leverOutcome = null,
  assessment = null,
  why = null,
  presentation = null,
  // What ADI applied on its own this run, and the physical changes it confirmed
  // but must not apply. Both are stated on the panel, in two separate layers.
  appliedCalibrationEvidence = null,
  designChanges = [],
  // One short line for a design that cannot meet its selected target.
  designLimitation = null,
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

  // The calibration already applied to this design — from the persisted
  // authority, so the settings survive a refresh even when this session's own
  // record of the run is gone.
  const persistedAppliedCalibration = useAppliedCalibrationAuthority(projectId, versionId);

  const resolved = resolveAdiOptimiserJourney({
    planView,
    limitingFactorSentence,
    blockReason: runBlockReason,
  });

  // The canonical presentation state owns the pill, the headline, the
  // explanation, the evidence, the Apply visibility and the action. When it is
  // supplied, this panel states exactly what it resolved, so the status and the
  // body can never disagree. Without it, the journey copy is used unchanged.
  // Baseline parity governs the panel. When the optimiser has no matching
  // published baseline — missing, mismatched, or never recorded — the panel
  // states that status and its single calculation action, overriding the
  // presentation state so the status, the copy, the evidence and the action can
  // never disagree. (Literal status values: the same frozen strings the parity
  // authority publishes.)
  const parityStatus = planView?.baselineParity?.status || null;
  const parityBlocked = parityStatus === "MISSING" || parityStatus === "MISMATCH" || parityStatus === "UNKNOWN";

  const journey = presentation && !parityBlocked
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

  const theme = STATE_THEME[journey.state]
    || STATE_THEME[resolved.state]
    || STATE_THEME[ADI_OPTIMISER_JOURNEY_STATE.OPTIMISATION_REQUIRED];
  const Icon = theme.icon;
  const runEvidence = presentation?.evidence || null;
  const journeyStateKey = presentation?.state || resolved.state;

  // ── The designer view ──
  // The default panel is the design decision: what was tested, what it found,
  // what is recommended and whether it can be applied. Every technical detail —
  // ids, coordinates, stage counts, proxy searches, rejection reasons — lives
  // inside the collapsed Engineer details disclosure.
  // The measured P20 headline and the limiting frequency come from the same
  // published authority the reports read — never recalculated here.
  // While ADI is working, the rows are its live progress through the fixed
  // sequence. The store is the engine's own published progress — phase,
  // phase label and stage verdicts — so nothing here is inferred.
  const isRunning = runStatus === "running";
  const liveState = useImproveBassV2State(projectId, versionId);
  const p20Headline = readAuthoritativeP20Headline(completedBassAuthority);
  const summary = buildAdiDesignerSummary({
    planView,
    presentation,
    liveProgress: isRunning ? { ...liveState, running: true } : null,
    instances,
    seatCount,
    roomDims,
    currentP20Deviation: p20Headline?.variationDb ?? null,
    currentP20Level: p20Headline?.level ?? null,
    limitingFrequencyHz: p20Headline?.worstFrequencyHz ?? null,
    appliedLever: leverOutcome?.appliedLever ?? null,
    appliedDirection: leverOutcome?.direction ?? null,
  });
  const handleApplyRecommended = summary.actions.canApply && typeof onApplyLever === "function"
    ? () => onApplyLever(summary.recommendedLever)
    : null;
  const handleUndoRecommended = summary.actions.canUndo && typeof onUndoLever === "function"
    ? () => onUndoLever(summary.actions.undoLever || summary.recommendedLever)
    : null;

  // ── The placement recommendation owns its own actions ──
  // Placement is the one lever with a physical, wall-based move to describe, so
  // its panel carries Apply placement / Undo placement / Re-run. While it states
  // a previous result it also carries the panel's single "Re-run Optimisation
  // Plan" action, and the panel's own primary button stands down — the designer
  // never sees two re-run buttons.
  const placement = summary.placementRecommendation || null;
  const placementLever = (planView?.levers || [])
    .find((lever) => (lever?.key ?? lever?.lever) === OPTIMISER_LEVER.PLACEMENT) || null;
  // The delay lever carries the best acoustic delay the grouped front/rear sweep
  // found: signed offset, objective served, canonical P19/P20 before and after,
  // limiting seat and frequency. Absent = no delay change was proposed.
  const delayLever = Array.isArray(planView?.levers)
    ? planView.levers.find((lever) => (lever?.key ?? lever?.lever) === OPTIMISER_LEVER.DELAY) || null
    : planView?.levers?.[OPTIMISER_LEVER.DELAY] || null;
  const panelShowsApply = placement?.kind === "recommended" && placement.canApply === true;
  const panelShowsUndo = placement?.kind === "applied" && placement.canUndo === true;
  const panelShowsRerun = placement?.kind === "previous";
  const handleApplyPlacement = panelShowsApply && placementLever && typeof onApplyLever === "function"
    ? () => onApplyLever(placementLever)
    : null;
  const handleUndoPlacement = panelShowsUndo && placementLever && typeof onUndoLever === "function"
    ? () => onUndoLever(placementLever)
    : null;

  const showAction = !!journey.action && journey.canRun && !isRunning;
  const showBlocked = !!journey.blockReason && !isRunning;
  const statusMessage = runStatus === "failed" && runError ? runError : journey.blockReason?.message;

  // Before the run, the panel states how many design options ADI will test and
  // the acoustic work behind them. After the run, the confirmed count is stated
  // instead (run evidence), so an estimate is never shown beside real evidence.
  const isPreRun = journey.state === ADI_OPTIMISER_JOURNEY_STATE.OPTIMISATION_REQUIRED
    || journey.state === ADI_OPTIMISER_JOURNEY_STATE.REEVALUATION_REQUIRED;
  const showEstimate = isPreRun && !runEvidence;

  // ── The four layers, resolved once ──
  // Presentation only: the layout model groups what the authorities already
  // resolved. It decides WHICH layer carries the primary button and nothing else
  // — no eligibility, no threshold and no engineering value is touched.
  const designChangeList = Array.isArray(designChanges) ? designChanges : [];
  const evaluated = summary.noRun !== true && !isRunning;
  const calibrationKind = resolveCalibrationSectionKind({
    decision: appliedCalibrationEvidence?.decision || null,
    hasPersistedValues: Array.isArray(persistedAppliedCalibration?.values)
      && persistedAppliedCalibration.values.length > 0,
    evaluated,
  });
  const panelFinding = resolveAdiPanelFinding({
    isRunning,
    calibrationApplied: calibrationKind === ADI_CALIBRATION_KIND.APPLIED,
    designRecommended: designChangeList.length > 0
      || Boolean(summary.seatingRecommendation)
      || placement?.kind === PLACEMENT_KIND.RECOMMENDED,
    evaluated,
  });
  const primaryAction = resolveAdiPrimaryAction({
    isRunning,
    stale: summary.stale === true,
    designApplicable: summary.actions?.canApply === true || panelShowsApply === true,
    nothingTested: summary.noRun === true,
    calibrationOffered: typeof onReoptimiseCalibration === "function" && !reoptimiseBusy,
    runOffered: showAction && !panelShowsRerun,
  });
  // The run control stays prominent whenever neither the design recommendation
  // nor the calibration action has claimed the primary.
  const runIsPrimary = primaryAction !== ADI_PRIMARY_ACTION.DESIGN
    && primaryAction !== ADI_PRIMARY_ACTION.CALIBRATION;

  // A recommendation sentence belongs to the layer whose change it describes: an
  // electronic change to calibration, a physical change to the design
  // recommendation. It is never stated twice.
  const calibrationRecommendation = summary.recommendation
    && CALIBRATION_LEVER_KEYS.includes(summary.recommendedLever)
    ? summary.recommendation
    : null;
  const designRecommendation = summary.recommendation
    && !calibrationRecommendation
    && !summary.seatingRecommendation
    ? summary.recommendation
    : null;

  return (
    <div
      className={`rounded-lg border px-4 py-3 space-y-3 ${className}`}
      style={{ borderColor: theme.border, background: theme.background }}
      data-adi-optimiser-journey={journeyStateKey}
    >
      {/* Header — the title carries the weight of a major ADI feature and the
          pill states the state. The row wraps instead of overflowing. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
            style={{ background: theme.pill.background }}
          >
            <Icon className="h-4 w-4 text-white" />
          </span>
          <span className="min-w-0 text-[18px] font-bold leading-tight tracking-[-0.01em] text-[#1B1A1A]">
            Bass Optimisation — Powered by ADI
          </span>
        </div>
        <span
          className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase"
          style={theme.pill}
        >
          {journey.statusLabel}
        </span>
      </div>

      {/* ── LAYER 1 — RESULT SUMMARY ── what ADI has already done: the finding,
          the current result and the best result found. */}
      <AdiPanelSummary
        message={isRunning ? journey.message : null}
        finding={panelFinding}
        testedSentence={summary.testedSentence}
        designLimitation={designLimitation}
        staleCopy={summary.staleCopy}
        previousBest={summary.previousBest}
        currentP20={summary.currentP20}
        recommendedP20={summary.recommendedP20}
      />

      {/* ── LAYER 2 — SAFE CALIBRATION ADJUSTMENTS (Section 1) ── processor
          settings ADI may apply on its own when the calibration decision
          authority confirms a safe improvement. No physical design change is
          ever stated here. */}
      <AdiCalibrationSection
        kind={calibrationKind}
        appliedEvidence={appliedCalibrationEvidence}
        appliedCalibration={persistedAppliedCalibration}
        recommendation={calibrationRecommendation}
      >
        <ReoptimiseCalibrationAction
          onReoptimise={isRunning ? null : onReoptimiseCalibration}
          busy={reoptimiseBusy}
          disabledReason={reoptimiseDisabledReason}
          primary={primaryAction === ADI_PRIMARY_ACTION.CALIBRATION}
        />
      </AdiCalibrationSection>

      {/* ── LAYER 3 — DESIGN RECOMMENDATION (Section 2) ── the physical change
          ADI found but must not apply. Its own Apply/Undo/Re-run controls live
          inside this section, never beside the calibration action. */}
      <AdiDesignRecommendationSection
        designChanges={designChangeList}
        seatingRecommendation={summary.seatingRecommendation}
        recommendation={designRecommendation}
        placementStated={Boolean(placement?.kind)}
      >
        {/* Placement — the physical move, its expected result in whole dB, and
            its own Apply/Undo actions. Nothing else on this panel moves a
            subwoofer. */}
        <PlacementRecommendationPanel
          placement={placement}
          busy={isRunning}
          primary={primaryAction === ADI_PRIMARY_ACTION.DESIGN}
          onApply={handleApplyPlacement}
          onUndo={handleUndoPlacement}
          onRerun={onRunOptimisationPlan}
        />

        <AdiDesignerActionBar
          summary={summary}
          busy={isRunning}
          primary={primaryAction === ADI_PRIMARY_ACTION.DESIGN}
          onApply={panelShowsApply ? null : handleApplyRecommended}
          onUndo={panelShowsUndo ? null : handleUndoRecommended}
        />
      </AdiDesignRecommendationSection>

      {/* ── LAYER 3b — WHAT ADI TESTED (Section 3) ── ONE compact list, split
          into the calibration levers ADI may apply and the design levers it may
          only recommend, so the two kinds of change are never mixed in one
          table. The per-lever detail and the delay sweep's own evidence are
          evidence, so both live inside Engineer details. */}
      <AdiTestedSection rows={summary.rows} />

      {/* The pre-run summary. The calculation count is stated ONCE, near the
          action, so this line never repeats it. */}
      {showEstimate && (
        <OptimiserCalculationEstimateLine
          instances={instances}
          seatCount={seatCount}
          showSentence={!summary.testedSentence}
          className="rounded-md border border-[#E7E5E0] bg-white px-3 py-2"
        />
      )}

      {/* Primary action. Running: the same button, disabled, with the spinner
          stating the state. The wording never changes — only the pill and the
          spinner change. */}
      {isRunning && (
        <div
          className="inline-flex items-center gap-2 rounded-md bg-[#213428] px-5 py-2.5 text-[13px] font-semibold text-white opacity-70"
          data-adi-optimiser-button="running"
          aria-busy="true"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {ADI_BASS_OPTIMISER_LABEL}
        </div>
      )}

      {/* The panel's run control — "Bass Optimiser" in every state that offers
          it, or the bass calculation when that calculation is the required
          action. It stands down while the placement panel is already stating
          that same single action, so two run buttons can never appear. It is
          drawn as the primary only when no other layer has claimed the primary. */}
      {showAction && !panelShowsRerun && (
        <button
          type="button"
          onClick={journey.action === ADI_OPTIMISER_ACTION.CALCULATE
            ? onCalculateBassPerformance
            : onRunOptimisationPlan}
          data-adi-rerun-plan={journey.action === ADI_OPTIMISER_ACTION.CALCULATE ? undefined : "true"}
          data-adi-calculate-bass={journey.action === ADI_OPTIMISER_ACTION.CALCULATE ? "true" : undefined}
          data-adi-optimiser-button="idle"
          className={runIsPrimary ? ADI_RUN_PRIMARY_CLASS : ADI_RUN_SECONDARY_CLASS}
        >
          <Sparkles className="h-3.5 w-3.5" />
          {journey.actionLabel}
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      )}

      {/* ── LAYER 4 — ENGINEER DETAILS ── collapsed by default, and below the
          primary action. Every technical detail — lever order, per-family
          counts, candidate ledger, fingerprints, limits, comparison and method —
          lives here, never in the default panel. */}
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

          {/* Capabilities ADI does not evaluate yet. They are stated HERE, once,
              and never as a row of the tested list: a designer must never read a
              lever as something ADI tested for them when the model cannot. */}
          {summary.futureCapability?.length > 0 && (
            <div className="space-y-0.5 text-[11px] text-[#3E4349] leading-relaxed">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
                {FUTURE_CAPABILITY_TITLE}
              </div>
              {summary.futureCapability.map((note) => (
                <div key={note.key} data-adi-future-capability={note.key}>
                  {note.label}: {note.statement}
                </div>
              ))}
            </div>
          )}

          <OptimiserRunEvidenceBlock evidence={runEvidence} seatCount={seatCount} instances={instances} />

          {/* The limits every other number on this panel depends on, and the
              fingerprints that identify exactly which design, which published
              bass result and which applied calibration it is describing. */}
          <AdiEngineerEvidenceBlock
            limitingFrequencyHz={p20Headline?.worstFrequencyHz ?? null}
            limitingSeatId={p20Headline?.worstSeatId ?? null}
            designFingerprint={currentDesignFingerprint}
            resultFingerprint={p20Headline?.fingerprint ?? null}
            parityStatus={planView?.baselineParity?.status ?? null}
            appliedCalibration={persistedAppliedCalibration}
          />

          {/* The per-lever detail, and the best acoustic delay the grouped
              front/rear sweep confirmed — a detail of the delay lever ADI
              already tested, never a second recommendation surface. */}
          <AdiTestedOptionsTable summary={summary} />
          <AcousticDelayAlignmentCard lever={delayLever} />

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
              {summary.absorption.headline && (
                <div>{summary.absorption.headline}</div>
              )}
              {summary.absorption.location && (
                <div>{summary.absorption.location}</div>
              )}
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

          {/* The seating recommendation's own evaluation evidence — the worst
              seat, the other RP22 movements and whether every destination seat
              position is legal. Kept out of the default panel. */}
          {summary.seatingRecommendation && (
            <div className="space-y-0.5 text-[11px] text-[#3E4349] leading-relaxed">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
                Seating recommendation evidence
              </div>
              {summary.seatingRecommendation.worstSeat && (
                <div>Worst seat after the move: {summary.seatingRecommendation.worstSeat}</div>
              )}
              {summary.seatingRecommendation.p19Delta && (
                <div>P19 {summary.seatingRecommendation.p19Delta}</div>
              )}
              {summary.seatingRecommendation.p14Delta && (
                <div>P14 {summary.seatingRecommendation.p14Delta}</div>
              )}
              {summary.seatingRecommendation.p18DeltaHz != null
                && Math.abs(Math.round(summary.seatingRecommendation.p18DeltaHz)) > 0 && (
                  <div>
                    P18 extension {summary.seatingRecommendation.p18DeltaHz >= 0 ? "+" : "−"}
                    {Math.abs(Math.round(summary.seatingRecommendation.p18DeltaHz))} Hz
                  </div>
              )}
              <div>
                {summary.seatingRecommendation.destinationsValid === true
                  ? `Every destination seat position checked: valid (${summary.seatingRecommendation.validationBasis}).`
                  : summary.seatingRecommendation.destinationsValid === false
                    ? `Destination positions not applied: ${summary.seatingRecommendation.validationReason || "a destination seat position is not legal in this room."}`
                    : "Destination seat positions were validated by the optimiser before evaluation."}
              </div>
              {summary.seatingRecommendation.tradeOff && (
                <div>Trade-off: {summary.seatingRecommendation.tradeOff}</div>
              )}
            </div>
          )}

          {/* The missing on-plan preview is a limitation of the evidence, not a
              warning about the recommendation, so it is stated here. */}
          {placement?.notice === PLACEMENT_PREVIEW_UNAVAILABLE && (
            <div className="text-[11px] text-[#625143] leading-relaxed">
              On-plan preview: not yet available for this change.
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