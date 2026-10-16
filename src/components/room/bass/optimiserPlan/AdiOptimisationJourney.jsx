// AdiOptimisationJourney.jsx
// ---------------------------------------------------------------------------
// The ADI Bass Optimisation panel.
//
// The panel states the DECISION, in this order, and nothing else in its default
// view:
//
//   1. ONE STATUS           — how the change stands: applied · improvement to
//                             consider · rejected for regression. While no
//                             decision exists the engine's own state is shown.
//   2. ONE ADJUSTMENT       — what to change, in installer words
//   3. ONE BENEFIT          — what it buys, in one sentence, figure-free
//   4. ONE COMPARISON       — where it lands: the P20 variation in whole dB with
//                             its level, from one comparable evaluation
//   5. THE ACTIONS          — one primary control per state, plus the physical
//                             controls of the change being offered
//   6. ENGINEER DETAILS     — collapsed; the settings each change touches, the
//                             candidate evidence, the acceptance reason and every
//                             id, count, fingerprint, frequency and seat value
//
// The headline is resolved by adiPanelHeadline.js (pure): this component decides
// no wording, no number and no order of its own, and the sections that state the
// evidence are rendered inside the disclosure rather than around it.
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

import React, { useSyncExternalStore } from "react";
import { AlertTriangle, ArrowRight, Loader2, Sparkles, X } from "lucide-react";
import { useOptimiserPlanView } from "./useOptimiserPlanView.js";
import { useImproveBassV2State } from "../improveBassV2/improveBassV2Store.js";
import {
  ADI_BASS_OPTIMISER_LABEL,
  ADI_OPTIMISER_ACTION,
  ADI_OPTIMISER_JOURNEY_STATE,
  ADI_PUBLICATION_FAILURE_KEEP_LABEL,
  resolveAdiOptimiserJourney,
} from "./resolveAdiOptimiserJourney.js";
import {
  keepCurrentBassResult,
  useCurrentBassResultKept,
} from "./optimiserPublicationFailureStore.js";
import {
  OPTIMISER_OUTCOME,
  OPTIMISER_PRESENTATION_ACTION,
  OPTIMISER_PRESENTATION_STATE,
  OPTIMISER_RETEST_HELPER_SENTENCE,
  OPTIMISER_RETEST_LABEL,
  OPTIMISER_RETEST_PREVIOUS_CANDIDATE,
} from "./resolveOptimiserPresentationState.js";
import AdiEngineerDetailsPanel from "./AdiEngineerDetailsPanel.jsx";
import {
  ignoreOptimiserRecommendation,
  optimiserIgnoreKey,
  readOptimiserIgnored,
  subscribeOptimiserIgnored,
} from "./optimiserIgnoreStore.js";
import OptimiserCalculationEstimateLine from "./OptimiserCalculationEstimateLine.jsx";
import OptimiserCalculationDetail from "./OptimiserCalculationDetail.jsx";
import savedCalibrationDecision from "./savedCalibrationDecision.js";
import { resolveBestCalibrationResult } from "./bestCalibrationResult.js";
import AdiPanelSummary from "./AdiPanelSummary.jsx";
import AdiImprovementResult from "./AdiImprovementResult.jsx";
import AdiImprovementActions from "./AdiImprovementActions.jsx";
import { IMPROVEMENT_CASE, resolveImprovementResult } from "./improvementResultAuthority.js";
import AdiTradeOffActions from "./AdiTradeOffActions.jsx";
import { TRADE_OFF_KEPT_LABEL, TRADE_OFF_KEPT_SENTENCE } from "./optimiserTradeOffState.js";
import AdiPreviousCandidateDetails from "./AdiPreviousCandidateDetails.jsx";
import { resolvePreviousCandidate, resolveRetestNeeded } from "./resolveRetestPresentation.js";
import AdiDesignerActionBar from "./AdiDesignerActionBar.jsx";
import PlacementRecommendationPanel from "./PlacementRecommendationPanel.jsx";
import AdiBeforeAfterResult from "./AdiBeforeAfterResult.jsx";
import ReoptimiseCalibrationAction from "./ReoptimiseCalibrationAction.jsx";
import { useAppliedCalibrationAuthority } from "../appliedCalibrationAuthority/appliedCalibrationAuthorityStore.js";
import { OPTIMISER_LEVER } from "./optimiserPlanConstants.js";
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
import { readAuthoritativeP20Headline } from "./optimiserPlanMetrics.js";
import { resolveAdiPanelHeadline } from "./adiPanelHeadline.js";
import { resolveOptimiserCurrentP20 } from "./optimiserCurrentP20.js";
import { buildRelativeGroupDelays } from "./relativeGroupDelayAuthority.js";
import {
  ADI_OPTIMISER_RUNNING_LABEL,
} from "./optimiserRunProgressAuthority.js";
import useOptimiserRunProgress from "./useOptimiserRunProgress.js";
import { buildOptimiserRunWorkload } from "./optimiserRunWorkload.js";
import AdiJourneyRunningPanel from "./AdiJourneyRunningPanel.jsx";
import AdiJourneyEngineerDetailsSections from "./AdiJourneyEngineerDetailsSections.jsx";
import { buildElectronicTimingRows } from "@/components/room/bass/electronicSafety/electronicTimingLedger.js";
import AdiOtherOptions from "./AdiOtherOptions.jsx";
import AdiSubwooferGroupingBlock from "./AdiSubwooferGroupingBlock.jsx";
import AdiDesignRecommendationSection from "./AdiDesignRecommendationSection.jsx";
import { buildOptimiserPanelHierarchy } from "./optimiserPanelHierarchy.js";
import { useOptimiserDeveloperDiagnostics } from "./useOptimiserDeveloperDiagnostics.js";
import { presentationThemeState, resolveAdiJourneyTheme } from "./adiJourneyTheme.js";

// ONE primary control per state. Which layer owns it is decided by the layout
// model (adiPanelSections.js); every other available action is drawn as a
// secondary control, so two green buttons can never compete.
const ADI_RUN_PRIMARY_CLASS = "inline-flex items-center gap-1.5 rounded-md bg-[#213428] px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#3E4349]";
const ADI_RUN_SECONDARY_CLASS = "inline-flex items-center gap-1.5 rounded-md border border-[#D9D5CE] bg-white px-5 py-2.5 text-[13px] font-semibold text-[#213428] transition-colors hover:border-[#213428]";

// The card's theme — the tone, icon, border and fill of each state — lives in
// adiJourneyTheme.js. This component states the decision; the theme states how
// the tone reads.

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
  // THE TRADE-OFF the run itself recorded. The decision, its candidate identity
  // and the seat it would cost arrive already resolved in `presentation`; this
  // flag states the designer's own "keep current design".
  tradeOffKept = false,
  onKeepTradeOff = null,
  tradeOffApplyBusy = false,
  // What ADI applied on its own this run, and the physical changes it confirmed
  // but must not apply. Both are stated on the panel, in two separate layers.
  appliedCalibrationEvidence = null,
  designChanges = [],
  // THE RUN'S OWN CANCEL — the one canonical cancel path and the authority that
  // decides whether it is available (bassCalculationLifecycle, through the
  // workflow panel that owns it). The running card states it in the stall
  // notice and nothing else here cancels, applies or restarts a run.
  canCancelRun = false,
  onCancelRun = null,
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

  // ── A RUN WHOSE RESULT COULD NOT BE SAVED ──
  // The failure the run recorded, and the designer's own acknowledgement of it.
  // Both are read from the record and from the run that record belongs to, so the
  // panel states the failure of the run that actually failed — never a newer
  // run's state, and never a failure it cannot attribute.
  const publicationFailure = planView?.failure || null;
  const failedRunId = planView?.failure?.runId || planView?.run?.runId || null;
  const publicationFailureKept = useCurrentBassResultKept({ projectId, versionId, runId: failedRunId });
  const publicationFailureActive = Boolean(publicationFailure) && !publicationFailureKept;

  const resolved = resolveAdiOptimiserJourney({
    planView,
    limitingFactorSentence,
    blockReason: runBlockReason,
    publicationFailure,
    publicationFailureKept,
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

  // A publication failure the designer has not yet acknowledged IS the panel's
  // state: it is resolved before the presentation state, so a copy that describes
  // the run as evaluated can never override the failure that stopped it.
  const journey = publicationFailureActive
    ? resolved
    : presentation && !parityBlocked
    ? {
      ...resolved,
      state: presentationThemeState(presentation.state) || resolved.state,
      statusLabel: presentation.statusLabel,
      message: presentation.message,
      explanation: presentation.explanation || resolved.explanation,
      notes: presentation.notes.length ? presentation.notes : resolved.notes,
      action: presentation.action || resolved.action,
      actionLabel: presentation.actionLabel || resolved.actionLabel,
      // The presentation authority owns whether its ONE action can be offered: a
      // failure the bass calculation fixes offers that calculation even while the
      // optimiser run itself is still blocked.
      canRun: presentation.canRun === true ? true : (presentation.runBlocked ? false : resolved.canRun),
      // The mapped reason's own next step, stated with it in the main panel.
      nextAction: presentation.nextAction || null,
      showPlan: presentation.showPlan,
      // THE OUTCOME travels with the state: the badge, the finding and the
      // conditions that offer the designer's own "ignore" all read this one
      // value, so the panel can never state two different results at once.
      outcome: presentation.outcome || null,
      outcomeLabel: presentation.outcomeLabel || null,
    }
    : resolved;

  const theme = resolveAdiJourneyTheme({
    journeyState: journey.state,
    fallbackState: resolved.state,
  });
  const Icon = theme.icon;
  const runEvidence = presentation?.evidence || null;
  const journeyStateKey = presentation?.state || resolved.state;

  // ── RE-TEST NEEDED → ONE NEXT ACTION ──
  // The re-test states say one thing: the saved result cannot be trusted and has
  // to be checked again against the current design. So they draw ONE control for
  // it — the panel's own run control, worded as the re-test itself — and every
  // other control that starts the same or an overlapping flow stands down: the
  // calibration re-test, the placement re-run, and the Apply/Undo of the old
  // candidate. The old candidate's own detail is never stated on the main panel:
  // it is read in Engineer details, where the designer goes after re-testing.
  // Presentation only: which handler that one control calls is unchanged.
  // Resolved by the re-test authority (resolveRetestPresentation.js).
  const retestNeeded = resolveRetestNeeded({
    outcome: journey.outcome,
    journeyStateKey,
  });

  // ── THE ONE OUTCOME ──
  // When the presentation authority resolved an outcome, the panel states THAT
  // — No Improvement Found · Improvement Found · Physical Change Recommended ·
  // Re-test Needed · Bass Performance Needs Updating · Unable To Evaluate —
  // rather than the engine state behind it.
  const outcome = journey.outcome || null;
  const outcomeLabel = journey.outcomeLabel || null;
  // Re-test Needed and Unable To Evaluate are both retry states for the evidence-
  // only optimiser run. The calibration auto-apply workflow must never own this
  // button: it does not mint/persist the run identity used by terminal authority.
  const optimiserRunOwnsRetry = retestNeeded
    || outcome === OPTIMISER_OUTCOME.UNABLE_TO_EVALUATE;
  // A physical change is an improvement too: the panel offers Apply for both,
  // and only the badge distinguishes them.
  const improvementsFound = outcome === OPTIMISER_OUTCOME.IMPROVEMENTS_FOUND
    || outcome === OPTIMISER_OUTCOME.PHYSICAL_CHANGE;
  // "No useful improvement was found" may be stated ONLY for a completed search
  // that confirmed nothing — the outcome that proves it, or the journey's own
  // completed no-winner state when no presentation authority was supplied.
  const noImprovementConfirmed = presentation
    ? outcome === OPTIMISER_OUTCOME.NO_IMPROVEMENTS
    : resolved.state === ADI_OPTIMISER_JOURNEY_STATE.NO_USEFUL_IMPROVEMENT;

  // The designer's Ignore is session-scoped and belongs to this run: the key
  // carries the design's own fingerprint, so a re-test offers the recommendation
  // again. Nothing about the result or the evidence is written.
  const ignoreKey = optimiserIgnoreKey({
    projectId,
    versionId,
    fingerprint: currentDesignFingerprint,
  });
  const recommendationIgnored = useSyncExternalStore(
    subscribeOptimiserIgnored,
    () => readOptimiserIgnored(ignoreKey),
  );

  // ONE short reason for an outcome that found nothing, or could not finish: the
  // run's own recorded reason when it kept one. The full diagnostics stay below.
  const recordedReasons = Array.isArray(runEvidence?.rejectionReasons)
    ? runEvidence.rejectionReasons
    : [];
  const whyNoImprovement = improvementsFound
    ? null
    : (recordedReasons.find((reason) => typeof reason === "string" && reason)
      || journey.explanation
      || null);

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
  // THE RUN'S LIVE PROGRESS — read from the engine's own published progress
  // store and the run's identity. The hook adds no count, no stage and no
  // percentage of its own: it ticks a clock while the run is in flight and
  // re-reads the authorities for a status check.
  const {
    progress: runProgress,
    stageElapsedSeconds: runStageElapsedSeconds,
    checkStatus: checkRunStatus,
    checkResult: runCheckResult,
  } = useOptimiserRunProgress({ projectId, versionId, runStatus });
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
    // The one result view model is built inside the card summary from the SAME
    // evidence this panel already reads: the canonical published bass result (so
    // CURRENT is a real measured value, not the run's own baseline), the run's
    // identity, and the resolved trade-off state (so a held trade-off is HELD,
    // never Applied). Nothing new is calculated here.
    completedBassAuthority,
    identity: {
      projectId,
      versionId,
      runId: planView?.run?.runId || planView?.failure?.runId || null,
    },
    // The resolved trade-off state, with the designer's own "keep the current
    // design" carried on it, so the model states KEPT CURRENT rather than
    // reporting a live trade-off the designer has already settled.
    tradeOffState: presentation?.tradeOff?.isTradeOff
      ? { ...presentation.tradeOff, kept: tradeOffKept === true }
      : null,
  });
  // THE ONE RESULT VIEW MODEL, as resolved by the card summary. Every surface on
  // this panel — the Engineer details evidence, the placement evidence, Other
  // options and the review dialogs — reads this object rather than deciding the
  // result for itself.
  const resultModel = summary.resultViewModel || null;
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
  // A previous placement result normally carries the panel's single re-run
  // control. In the re-test state that job belongs to the panel's own re-test
  // control, so the placement panel draws no second copy of it.
  const panelShowsRerun = placement?.kind === "previous" && !optimiserRunOwnsRetry;
  const handleApplyPlacement = panelShowsApply && placementLever && typeof onApplyLever === "function"
    ? () => onApplyLever(placementLever)
    : null;
  const handleUndoPlacement = panelShowsUndo && placementLever && typeof onUndoLever === "function"
    ? () => onUndoLever(placementLever)
    : null;

  // ── THE TRADE-OFF STATE ──
  // A completed run whose best change improves the overall result but worsens a
  // protected primary seat. Nothing on this card may offer that change as an
  // improvement, and no run or re-test control is drawn: the run has finished and
  // its result is trustworthy, so there is nothing to re-run. The designer reviews
  // the trade-off or keeps the current design.
  const tradeOff = presentation?.tradeOff || null;
  const tradeOffSettled = !!tradeOff?.isTradeOff && tradeOffKept;
  const tradeOffActive = !!tradeOff?.isTradeOff && !isRunning && !tradeOffKept;
  // The change the designer may deliberately approve: the plan's own evaluated
  // lever, applied through the SAME lever apply path every other Apply uses. No
  // new apply logic, no re-ranking and no threshold is introduced here.
  const tradeOffLever = (() => {
    const levers = Array.isArray(planView?.levers) ? planView.levers : [];
    const applicable = levers.filter((lever) => lever?.canApply !== false
      && Array.isArray(lever?.changes) && lever.changes.length > 0);
    const wanted = summary.recommendedLever || null;
    return (wanted && applicable.find((lever) => (lever?.key ?? lever?.lever) === wanted))
      || applicable[0]
      || null;
  })();
  const handleApplyTradeOff = tradeOffLever && typeof onApplyLever === "function"
    ? () => onApplyLever(tradeOffLever)
    : null;

  // A COMPLETED, SUCCESSFUL RUN IS NOT A STARTING POINT. While the panel states a
  // confirmed improvement — one ADI applied, or one the designer approves — no
  // run and no re-test control belongs on the card: those are the actions for "no
  // result yet", "the design has changed" and "a re-test is genuinely required",
  // and this state is none of them. Read from the outcome authority, so the
  // trade-off, the physical move and every retry state keep their own controls.
  const improvementOwnsPanel = !publicationFailureActive
    && presentation?.outcome === OPTIMISER_OUTCOME.IMPROVEMENTS_FOUND;

  const showAction = !!journey.action && journey.canRun && !isRunning
    && !tradeOffActive && !tradeOffSettled
    && !improvementOwnsPanel;
  // ── ONE RE-TEST ──
  // In the re-test states the panel's own run control is worded as the re-test
  // itself. While that control is drawn it IS the re-test: it owns the primary
  // action, and the calibration control beside it draws no second copy of the
  // same button or its helper line.
  // The run control IS the re-test whenever the panel is in a re-test state or
  // the control carries the re-test action or wording: the calibration control
  // below then draws no second copy of it, so two "Re-test Bass Optimisation"
  // buttons can never appear together — and "OPTIMISE BASS" is never offered
  // beside a re-test.
  const runControlIsRetest = journey.action === OPTIMISER_PRESENTATION_ACTION.RETEST
    || journey.actionLabel === OPTIMISER_RETEST_LABEL
    || optimiserRunOwnsRetry;
  const retestOwnsPrimary = runControlIsRetest
    && showAction
    && !panelShowsRerun
    // In the re-test state the calibration control is not drawn at all, so a
    // calibration run in flight cannot take the primary from this one control.
    && (optimiserRunOwnsRetry || !reoptimiseBusy);
  const showBlocked = !!journey.blockReason && !isRunning;

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
  // What the saved calibration evidence proves. Both the section and the panel's
  // finding read this one authority, so neither can claim a test that the saved
  // record does not evidence.
  const calibrationEvidenceState = summary.calibrationEvidenceState || null;
  const calibrationEvidenceRetained = calibrationEvidenceState?.evidenceRetained !== false;
  // The decision ADI recorded for THIS run, or — when this session's own record
  // is gone after a refresh — the decision saved with the run, so the section
  // states the same thing and never falls back to a bare "not applied".
  const calibrationApplyEvidence = appliedCalibrationEvidence || savedCalibrationDecision(planView);
  // Which calibration result the run's own decision names — an isolated lever or
  // the combined retune — and whether it was applied, held or is under review.
  // Read from the saved decision and evidence; never re-derived from the levers.
  const bestCalibrationResult = resolveBestCalibrationResult({
    decision: calibrationApplyEvidence,
    evidence: planView?.calibrationEvidence || null,
  });
  const calibrationKind = resolveCalibrationSectionKind({
    decision: calibrationApplyEvidence?.decision || null,
    hasPersistedValues: Array.isArray(persistedAppliedCalibration?.values)
      && persistedAppliedCalibration.values.length > 0,
    evaluated,
    evidenceRetained: calibrationEvidenceRetained,
    tradeOffHeld: calibrationEvidenceState?.tradeOffHeld === true,
  });
  const panelFinding = resolveAdiPanelFinding({
    isRunning,
    calibrationApplied: calibrationKind === ADI_CALIBRATION_KIND.APPLIED,
    designRecommended: designChangeList.length > 0
      || Boolean(summary.seatingRecommendation)
      || placement?.kind === PLACEMENT_KIND.RECOMMENDED,
    // A calibration improvement the evidence holds that is worth considering:
    // the finding states the suggestion rather than "no useful improvement".
    calibrationSuggested: (calibrationEvidenceState?.suggestionLines || []).length > 0,
    evaluated,
    calibrationEvidenceRetained,
  });
  const primaryAction = resolveAdiPrimaryAction({
    isRunning,
    stale: summary.stale === true,
    // The re-test state offers its ONE control and nothing to apply: an old
    // candidate is never applied before it has been re-tested.
    designApplicable: !optimiserRunOwnsRetry
      && (summary.actions?.canApply === true || panelShowsApply === true),
    nothingTested: summary.noRun === true,
    calibrationOffered: typeof onReoptimiseCalibration === "function"
      && !optimiserRunOwnsRetry
      && !reoptimiseBusy
      && !retestOwnsPrimary,
    runOffered: showAction && !panelShowsRerun,
  });
  // The run control stays prominent whenever neither the design recommendation
  // nor the calibration action has claimed the primary — and always when it is
  // the one control stating the re-test.
  const runIsPrimary = retestOwnsPrimary
    || (primaryAction !== ADI_PRIMARY_ACTION.DESIGN
      && primaryAction !== ADI_PRIMARY_ACTION.CALIBRATION);

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

  // ── THE PANEL'S ONE HEADLINE ──
  // The decision the designer has to act on, stated as one adjustment, one
  // benefit and one comparable P20 pair. Every value is read from an authority
  // already resolved above: nothing is recalculated, no threshold is re-applied
  // and no saved setting is touched. The published current result is read through
  // the same ONE authority the tooltip and result strip use, so the pair the
  // panel compares is the designer's own result and never two different states.
  const currentP20 = resolveOptimiserCurrentP20({
    authorityP20: {
      variationDb: p20Headline?.variationDb ?? null,
      level: p20Headline?.level ?? null,
      worstFrequencyHz: p20Headline?.worstFrequencyHz ?? null,
    },
    planView,
  });
  const recommendedRow = summary.recommendedLever && Array.isArray(planView?.levers)
    ? planView.levers.find((row) => (row?.key ?? row?.lever) === summary.recommendedLever) || null
    : null;
  // The relative group offset of the change being decided — the installable fact
  // a delay change leads with. Read here so the headline and the evidence state
  // the same offset from the same values.
  const relativeDelay = buildRelativeGroupDelays({
    instances,
    settings: Array.isArray(calibrationApplyEvidence?.settings) ? calibrationApplyEvidence.settings : [],
    roomDims,
  });
  const headline = resolveAdiPanelHeadline({
    calibrationKind,
    calibrationDecision: calibrationApplyEvidence,
    calibrationSuggested: (calibrationEvidenceState?.suggestionLines || []).length > 0,
    appliedCalibration: persistedAppliedCalibration,
    relativeDelay,
    // A physical change ADI may never apply leads the panel as the move itself:
    // that IS the decision in front of the designer. Its controls stay below.
    recommendation: (summary.actions?.canApply === true || panelShowsApply === true)
      ? (summary.seatingRecommendation?.movementLabel
        || placement?.move?.movementLabel
        || summary.recommendation
        || null)
      : null,
    recommendedRow,
    baseline: planView?.baseline || null,
    currentP20,
    currentP20DeviationDb: p20Headline?.variationDb ?? null,
    stale: summary.stale === true,
    isRunning,
    // A run that has to be checked again, a bass update and a technical failure
    // state no "no improvement" finding: each has its own sentence, and the
    // recorded reason is read in Engineer details.
    finding: noImprovementConfirmed ? panelFinding : null,
  });

  // ── WHAT THE COMPLETED RUN FOUND, AND WHAT TO DO ABOUT IT ──
  // The badge, the sentence, the result block and the ONE deliberate Apply for a
  // confirmed improvement all come from this one resolver. It reads authorities
  // already resolved above — the headline, the run's own saved calibration
  // decision, the trade-off and the physical-change test — and decides nothing
  // about the engineering: no lever is ranked, no threshold is re-applied and no
  // value is recalculated. A trade-off and a physical move are claimed by their
  // own workflows and are never restated here as a clean improvement.
  const improvementResult = resolveImprovementResult({
    planView,
    headline,
    summary,
    calibrationDecision: calibrationApplyEvidence,
    calibrationKind,
    tradeOffActive: tradeOffActive || tradeOffSettled,
    physicalOnly: presentation?.outcome === OPTIMISER_OUTCOME.PHYSICAL_CHANGE,
    applied: calibrationKind === ADI_CALIBRATION_KIND.APPLIED,
  });
  // The improvement the DESIGNER approves: the review owns the only Apply for it,
  // and its own "keep current design" applies nothing at all.
  const improvementReviewActive = improvementResult.caseKey === IMPROVEMENT_CASE.REVIEW;

  // ── THE OLD CANDIDATE MOVES TO ENGINEER DETAILS ──
  // The candidate a previous run evaluated is not a recommendation in this state:
  // its adjustment, what it was measured on, the reason it was not applied and
  // its own P20 pair are read in Engineer details, and the main panel states only
  // that it has to be re-tested. The design's own APPLIED calibration is not an
  // old candidate — it is what is in the processor now — so it keeps the main
  // panel. Resolved by the re-test authority.
  const previousCandidate = resolvePreviousCandidate({
    retestNeeded,
    headline,
    summary,
  });

  // ── THE RUN'S OWN WORKLOAD ──
  // Measurement only, and stated in Engineer details: what the optimiser's
  // declared search space defines per stage for THIS design, the job count the
  // engine has published live, the time each has taken and the candidates it
  // confirmed canonically. It changes no search, no range and no ranking.
  const runWorkload = isRunning || runProgress.runId
    ? buildOptimiserRunWorkload({
      instances,
      roomDims,
      progress: runProgress,
      stageElapsedSeconds: runStageElapsedSeconds,
    })
    : null;

  // ── LEVEL 1 — OTHER OPTIONS, AND LEVEL 2 — THE LOW-FREQUENCY RESULT ──
  // Both are pure reads of authorities already resolved above: the few options
  // genuinely worth reviewing (the option that IS the current decision is never
  // repeated, and no candidate list is shown), and the three facts the decision
  // rests on, in the display authority's whole numbers only. No raw value, id or
  // fingerprint is stated in the normal experience.
  const { otherOptions, lowFrequency: lowFrequencyResult } = buildOptimiserPanelHierarchy({
    planView,
    summary,
    calibrationDecision: calibrationApplyEvidence,
    p20Headline,
    recommendedRow,
    running: isRunning,
    // THE ONE RESULT MODEL AND THE ONE LIMITING FREQUENCY. Technical details
    // therefore states the same result and the same frequency as the card: the
    // direct frequencyText(p20Headline.worstFrequencyHz) path is gone, a
    // non-winning or historical record is scoped out instead of presented as
    // current, and 0 Hz can never reach a surface.
    resultModel,
    limitingFrequency: resultModel?.limitingFrequency ?? null,
  });

  // ── LEVEL 3 — THE DEVELOPER GATE ──
  // Every internal diagnostic on this card is rendered only for a Sound Proof
  // admin with the internal debug mode switched on. A dealer never sees one, and
  // nothing is deleted: the evidence is still saved and still readable here.
  const showDeveloperDiagnostics = useOptimiserDeveloperDiagnostics();

  // THE DESIGN OPPORTUNITY — stated only when ADI really has an actionable
  // physical option to consider. No "no design change was applied" box is ever
  // drawn.
  const designOpportunity = (designChangeList.length > 0
    || Boolean(summary.seatingRecommendation)
    || placement?.kind === PLACEMENT_KIND.RECOMMENDED)
    ? (
      <AdiDesignRecommendationSection
        designChanges={designChangeList}
        seatingRecommendation={summary.seatingRecommendation}
        recommendation={designRecommendation}
        placementStated={Boolean(placement?.kind)}
      />
    )
    : null;

  // Everything the disclosure renders, resolved ONCE here and handed over as one
  // object: the extracted sections resolve nothing of their own, so the evidence
  // they state can only be what the authorities above resolved.
  const engineerDetailsView = {
    assessment,
    why,
    explanation: journey.explanation,
    runError,
    notes: journey.notes,
    futureCapability: summary.futureCapability,
    calibrationKind,
    appliedEvidence: calibrationApplyEvidence,
    appliedCalibration: persistedAppliedCalibration,
    recommendation: calibrationRecommendation,
    evidenceState: calibrationEvidenceState,
    bestResult: bestCalibrationResult,
    instances,
    roomDims,
    testedRows: summary.rows,
    currentP20Text: summary.currentP20,
    recommendedP20Text: summary.recommendedP20,
    runBaselineDiffers: currentP20.runBaselineDiffers,
    runBaselineDeviation: currentP20.runBaselineDeviation,
    runEvidence,
    seatCount,
    // THE ONE LIMITING FREQUENCY, from the result view model: null when the run
    // identified no credible frequency, so a surface states "Not identified" and
    // never "0 Hz".
    // THE ONE LIMITING FREQUENCY, from the result view model. When the model
    // identified a credible frequency that value is stated; when it did not, the
    // run's own recorded value is passed through so the evidence block's own
    // authority states "Not identified" — a result that recorded no value at all
    // still contributes nothing.
    limitingFrequencyHz: resultModel?.limitingFrequency?.identified
      ? resultModel.limitingFrequency.hz
      : (p20Headline?.worstFrequencyHz ?? null),
    limitingSeatId: resultModel?.currentP20?.seatId ?? p20Headline?.worstSeatId ?? null,
    resultModel,
    designFingerprint: currentDesignFingerprint,
    resultFingerprint: p20Headline?.fingerprint ?? null,
    parityStatus: planView?.baselineParity?.status ?? null,
    calibrationEvidence: summary.calibrationEvidence,
    summary,
    delayLever,
    absoluteDelaySettings: Array.isArray(calibrationApplyEvidence?.settings)
      ? calibrationApplyEvidence.settings
      : [],
    showPlan: journey.showPlan,
    projectId,
    versionId,
    completedBassAuthority,
    seatingPositions,
    onApplyLever,
    onUndoLever,
    leverApplyBusy,
    leverOutcome,
    designChanges: designChangeList,
    seatingRecommendation: summary.seatingRecommendation,
    designRecommendation,
    placement,
    isRunning,
    absorption: summary.absorption,
    attemptsWithoutGain: summary.attemptsWithoutGain,
    workload: runWorkload,
    // The saved run's own measured runtime cost, as developer rows. Built from the
    // breakdown SAVED WITH THE RUN; empty when no breakdown was recorded, so the
    // block is simply not drawn and no missing stage is ever shown as zero.
    runtimeCost: buildElectronicTimingRows(planView?.runtimeBreakdown || null),
  };

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
          {outcomeLabel || headline.statusLabel || journey.statusLabel}
        </span>
      </div>

      {/* ── THE DECISION ── one adjustment, one benefit and one comparable P20
          pair, under the one status in the header. Everything the decision was
          measured from is in Engineer details below. A failure states its own
          next step here, so Engineer details are never required to understand it.
          In the re-test state the old candidate's detail is NOT stated here: the
          panel states why it has to be checked again, and the candidate itself is
          read in Engineer details after the re-test. */}
      <AdiPanelSummary
        // A confirmed improvement states its own sentence — found, or already
        // applied — in place of the generic evaluation line.
        message={improvementResult.headlineSentence || journey.message}
        nextAction={presentation?.nextAction || null}
        // In the trade-off state the decision IS the trade-off: the change, the
        // seat it would cost and the measurable trade replace the ordinary
        // adjustment/benefit/comparison lines, which would state it as an offer.
        tradeOff={tradeOff?.isTradeOff ? tradeOff : null}
        adjustment={previousCandidate || tradeOff ? null : headline.adjustment}
        benefit={previousCandidate || tradeOff ? null : headline.benefit}
        comparison={previousCandidate || tradeOff ? null : headline.comparison}
        designLimitation={designLimitation}
        previousCandidateNotice={previousCandidate && !tradeOff ? OPTIMISER_RETEST_PREVIOUS_CANDIDATE : null}
        staleCopy={previousCandidate || tradeOff ? null : summary.staleCopy}
        previousBest={previousCandidate || tradeOff ? null : summary.previousBest}
      />

      {/* THE ACTUAL RESULT — the exact adjustment, what it improves, its own P19
          line and whether any protected seat gets worse — stated here, on the
          main panel. The designer never opens Engineer details to discover the
          basic answer. Rendered only for a confirmed improvement: a trade-off and
          a physical move keep their own presentation. */}
      {improvementResult.found && <AdiImprovementResult result={improvementResult} />}

      {/* ── THE ACTIONS ── one primary control for the state, decided by the
          layout model, beside the controls of the change being offered. The
          calibration action, the design Apply/Undo and the placement controls
          are the ONLY controls on the card: every statement of what was applied,
          held or evaluated is read in Engineer details below, so nothing here
          explains a calculation and no control is drawn twice. */}
      <div className="flex flex-wrap items-center gap-2">
        {/* THE TRADE-OFF'S OWN TWO CONTROLS — the review, which owns the ONE
            deliberate Apply, and the designer's own "no". While the trade-off is
            live no other control is drawn: the run has completed, so there is
            nothing to re-run, and the change is never applied from this card. */}
        {tradeOffActive && (
          <AdiTradeOffActions
            tradeOff={tradeOff}
            resultModel={resultModel}
            onApply={handleApplyTradeOff}
            applyBusy={tradeOffApplyBusy}
            onKeep={onKeepTradeOff}
          />
        )}

        {!tradeOffActive && !tradeOffSettled && (<>
        <PlacementRecommendationPanel
          placement={placement}
          busy={isRunning}
          primary={primaryAction === ADI_PRIMARY_ACTION.DESIGN}
          onApply={optimiserRunOwnsRetry ? null : handleApplyPlacement}
          onUndo={optimiserRunOwnsRetry ? null : handleUndoPlacement}
          // While a run is in flight this panel offers no run control of its own:
          // the run in progress is the panel's single control, so a second
          // overlapping run cannot be launched from here either.
          onRerun={isRunning || optimiserRunOwnsRetry ? null : onRunOptimisationPlan}
          variant="actions"
        />

        {/* THE IMPROVEMENT'S OWN TWO CONTROLS — the review, which owns the ONE
            deliberate Apply for this change, and the designer's own "keep current
            design". While the review is live the plain Apply below stands down, so
            the same change is never offered twice. */}
        {improvementReviewActive && (
          <AdiImprovementActions
            result={improvementResult}
            resultModel={resultModel}
            onApply={handleApplyRecommended}
            onKeep={() => ignoreOptimiserRecommendation(ignoreKey)}
            applyBusy={isRunning}
          />
        )}

        <AdiDesignerActionBar
          summary={summary}
          busy={isRunning}
          primary={primaryAction === ADI_PRIMARY_ACTION.DESIGN}
          // An ignored recommendation stops being offered for this session, so
          // its Apply stands down; re-testing offers it again. In the re-test
          // state the old candidate is not applied at all. The review owns the
          // Apply for a confirmed improvement, so the bar stands down there too.
          onApply={optimiserRunOwnsRetry || recommendationIgnored || improvementReviewActive
            ? null
            : (panelShowsApply ? null : handleApplyRecommended)}
          onUndo={optimiserRunOwnsRetry || panelShowsUndo ? null : handleUndoRecommended}
        />

        {/* The designer's own "no" — offered only while a genuine improvement is
            on the table, session-scoped, and never a change to the design. The
            improvement's own KEEP CURRENT DESIGN speaks for it in the review
            state, so it is not drawn twice. */}
        {improvementsFound && !recommendationIgnored && !isRunning && !improvementReviewActive
          && (summary.actions?.canApply === true || panelShowsApply === true) && (
            <button
              type="button"
              onClick={() => ignoreOptimiserRecommendation(ignoreKey)}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[12px] font-medium text-[#625143] transition-colors hover:text-[#213428]"
            >
              <X className="h-3.5 w-3.5" />
              Ignore
            </button>
          )}

        {/* No second copy of the re-test in the re-test state, and no handler
            while the run control is already stating this same re-test: one
            action, one button, one helper line. A completed improvement is not a
            re-test state either. */}
        <ReoptimiseCalibrationAction
          onReoptimise={optimiserRunOwnsRetry || isRunning || retestOwnsPrimary || improvementOwnsPanel
            ? null
            : onReoptimiseCalibration}
          busy={reoptimiseBusy}
          disabledReason={reoptimiseDisabledReason}
          primary={primaryAction === ADI_PRIMARY_ACTION.CALIBRATION}
        />
        </>)}
      </div>

      {/* THE DESIGNER KEPT THE CURRENT DESIGN — the terminal state of this run.
          Stated once, calmly, with no action beside it: the candidate is dismissed
          for this run, nothing was applied, and a re-test is not offered again
          until the design itself changes. */}
      {tradeOffSettled && (
        <div className="space-y-0.5" data-adi-trade-off-kept="true">
          <div className="text-[12.5px] font-semibold text-[#213428]">
            {tradeOff?.label || TRADE_OFF_KEPT_LABEL}
          </div>
          <div className="text-[11px] text-[#625143] leading-relaxed">
            {TRADE_OFF_KEPT_SENTENCE}
          </div>
        </div>
      )}

      {/* An ignored recommendation is stated once, calmly, and is not asked again
          for this run: re-testing is always available. */}
      {recommendationIgnored && improvementsFound && (
        <div className="text-[11px] text-[#625143] leading-relaxed" data-adi-recommendation-ignored="true">
          Recommendation ignored for this session. Re-test bass optimisation at any time to review it again.
        </div>
      )}

      {/* Primary action. Running: the same button, disabled, with the spinner
          stating the state. The wording never changes — only the pill and the
          spinner change. */}
      {isRunning && (
        <div className="space-y-2">
          <div
            className="inline-flex items-center gap-2 rounded-md bg-[#213428] px-5 py-2.5 text-[13px] font-semibold text-white opacity-70"
            data-adi-optimiser-button="running"
            aria-busy="true"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {ADI_OPTIMISER_RUNNING_LABEL}
          </div>

          {/* WHAT THE RUN IS ACTUALLY DOING — the engine's own published stage,
              the job count it has published for that search, the elapsed time
              and, when the engine stops reporting, the stall notice with its
              status check and the one cancel path. Presentation only: every
              value is resolved by useOptimiserRunProgress, and a terminal run
              renders its final state with no timer and no spinner left. */}
          <AdiJourneyRunningPanel
            progress={runProgress}
            stageElapsedSeconds={runStageElapsedSeconds}
            onCheckStatus={checkRunStatus}
            onCancel={onCancelRun}
            canCancel={canCancelRun}
            checkResult={runCheckResult}
          />
        </div>
      )}

      {/* The panel's run control — "Bass Optimiser" in every state that offers
          it, the re-test itself in the re-test state, or the bass calculation
          when that calculation is the required action. It stands down while the
          placement panel is already stating that same single action, so two run
          buttons can never appear. It is drawn as the primary only when no other
          layer has claimed the primary — and always in the re-test state, where
          it is the panel's one action. */}
      {showAction && !panelShowsRerun && (
        <div className="space-y-1">
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
          {journey.primaryLabel || (optimiserRunOwnsRetry && journey.action !== ADI_OPTIMISER_ACTION.CALCULATE
            ? OPTIMISER_RETEST_LABEL
            : journey.actionLabel)}
          <ArrowRight className="h-3.5 w-3.5" />
        </button>

        {/* The helper line sits directly under the control the designer presses,
            so the action and what it may do are read together. */}
        {retestOwnsPrimary && (
          <div className="text-[11px] text-[#625143] leading-relaxed">
            {OPTIMISER_RETEST_HELPER_SENTENCE}
          </div>
        )}

        {retestOwnsPrimary && reoptimiseDisabledReason && (
          <div className="text-[11px] text-[#8A5A2B] leading-relaxed">{reoptimiseDisabledReason}</div>
        )}
        </div>
      )}

      {/* THE FAILED PUBLICATION'S OWN SECOND ACTION — the designer's decision,
          beside the retry. Keeping the current bass result changes nothing (a
          refused publication changed nothing): it simply stops the failure being
          held in front of the designer for THIS run. It writes no design value,
          no bass result and no publication. */}
      {publicationFailureActive && (
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => keepCurrentBassResult(projectId, versionId, failedRunId)}
            data-adi-keep-current-bass="true"
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[12px] font-medium text-[#625143] transition-colors hover:text-[#213428]"
          >
            {ADI_PUBLICATION_FAILURE_KEEP_LABEL}
          </button>
          <div className="text-[11px] text-[#625143] leading-relaxed">
            The current bass result stands either way. Keeping it stops this notice being
            shown again for this run.
          </div>
        </div>
      )}

      {/* THE DESIGNER KEPT THE CURRENT BASS RESULT after a failed publication.
          Stated once, calmly: the failure is acknowledged, the current bass result
          is the authority, and the failure itself stays in the saved record and in
          Engineer details. */}
      {publicationFailure && publicationFailureKept && (
        <div className="text-[11px] text-[#625143] leading-relaxed" data-adi-publication-kept="true">
          ADI could not save its analysis for this run. The current bass result is unchanged and
          remains the authority.
        </div>
      )}

      {/* ── LEVEL 1 (continued) — OTHER OPTIONS ── the few genuinely useful
          alternatives beside the ONE decision. Each is reviewed on its own, no
          Apply is offered per candidate, and the option that is already the
          decision is never repeated here. */}
      {!isRunning && <AdiOtherOptions options={otherOptions} />}

      {/* ── LEVEL 2 — TECHNICAL DETAILS ── collapsed, and below the primary
          action. The concise professional summary: what ADI checked, the
          low-frequency result, the grouping it searched on and any actionable
          design option. Every raw diagnostic — fingerprints, ids, per-candidate
          detail, cache and job internals, search-space totals, run workload —
          is one level further down, behind the developer gate. */}
      <details className="rounded-md border border-[#E7E5E0] bg-white px-3 py-2" data-adi-engineer-details="true">
        <summary className="cursor-pointer text-[11px] font-semibold text-[#625143]">
          {ADI_ENGINEER_DETAILS_TITLE}
        </summary>
        <div className="mt-2 space-y-3">
          {/* LEVEL 2'S CONCISE GROUPS — what ADI checked, the low-frequency
              result, the grouping it searched on and any actionable design option
              — with LEVEL 3 (developer diagnostics) nested in the panel's own
              second disclosure, drawn ONLY under the internal debug gate. */}
          <AdiEngineerDetailsPanel
            rows={summary.rows}
            lowFrequency={lowFrequencyResult}
            groups={<AdiSubwooferGroupingBlock instances={instances} roomDims={roomDims} />}
            treatment={summary.absorption}
            design={designOpportunity}
            whyNoImprovement={whyNoImprovement}
            whyTitle={outcome === OPTIMISER_OUTCOME.NO_IMPROVEMENTS
              ? "Why no improvement"
              : "Why the evaluation stopped"}
            // LEVEL 3 is drawn only under the internal debug gate.
            showDiagnostics={showDeveloperDiagnostics}
          >
          {/* The old candidate the re-test state keeps off the main panel: what it
              changes, what it was measured on, the reason it was not applied and
              its own P20 pair. Read here, after the re-test. */}
          {previousCandidate && (
            <AdiPreviousCandidateDetails
              adjustment={previousCandidate.adjustment}
              benefit={previousCandidate.benefit}
              comparison={previousCandidate.comparison}
              staleCopy={previousCandidate.staleCopy}
              previousBest={previousCandidate.previousBest}
            />
          )}

          {/* LEVEL 3 — every raw evidence group behind the decision, extracted to
              AdiJourneyEngineerDetailsSections so this component stays the
              orchestration layer. Developer diagnostics only: fingerprints, ids,
              per-candidate detail, cache and job internals. */}
          <AdiJourneyEngineerDetailsSections view={engineerDetailsView} />

          {/* LEVEL 3 — the pre-run search-space totals (how many design options
              ADI will evaluate and the acoustic calculations behind them). Search
              totals are engineering detail, never part of the normal result: the
              main panel offers the action and the run states its live progress. */}
          {showEstimate && (
            <div className="space-y-1">
              <OptimiserCalculationEstimateLine
                instances={instances}
                seatCount={seatCount}
                roomDims={roomDims}
                className="rounded-md border border-[#E7E5E0] bg-white px-3 py-2"
              />
              <OptimiserCalculationDetail instances={instances} seatCount={seatCount} roomDims={roomDims} />
            </div>
          )}
          </AdiEngineerDetailsPanel>
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

      {journey.action === ADI_OPTIMISER_ACTION.RUN && !journey.canRun && !showBlocked && !runError && (
        <div className="text-[11px] text-[#8A5A2B] leading-relaxed">
          The Optimisation Plan could not be started. Reopen the project and try again.
        </div>
      )}
    </div>
  );
}