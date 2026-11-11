// BassDesignAssistant.jsx
//
// Bass Design Assistant — Frozen UX Workflow
//
// The workflow is:
//   1. Choose Layout
//   2. Choose Design Target
//   3. Calculate Performance
//   4. Understand Performance   (Sprint 2)
//   5. Optimise Bass             (Sprint 2)
//   6. Presentation              (Sprint 2)
//
// Sprint 1 implements stages 1–3 only.
//
// This is a PRESENTATION and INFORMATION-ARCHITECTURE change only.
// It does NOT change acoustics maths, P14/P18/P19/P20 grading, optimiser
// scoring, subwoofer prediction logic, or canonical result authority.
//
// It consumes existing shared authority only:
//   - useSharedBassResults()           → lifecycle, authority, seating
//   - OptimiseAndCalculate              → single calculation action
//   - StartingLayoutCards              → Stage 1 (Choose Layout)
//   - CurrentLayoutBanner              → compact layout summary
//   - ChooseDesignTarget               → Stage 2 (P14 + P18 design objectives)
//
// When implementation decisions conflict with the existing UI, prefer the
// frozen workflow over the existing interface. The Subwoofer Design
// Experience is now the product authority.

import React, { useState, useEffect, useMemo, useRef, useCallback, Suspense } from "react";
import { useSharedBassResults } from "@/components/room/bass/bassResultsStore";
import { useSubwooferCompatibilityActions } from "@/components/hooks/useSubwooferCompatibilityActions";
import { INSTANCE_STATUS } from "@/components/utils/subwooferInstanceCompatibility";
import OptimiseAndCalculate from "@/components/room/bass/optimiseWorkflow/OptimiseAndCalculate";
import EvaluatedLayoutCards from "@/components/room/bass/bda/EvaluatedLayoutCards";
import SubwooferModelPicker from "@/components/room/bass/bda/SubwooferModelPicker";
import { useEvaluatedRecommendations } from "@/components/room/bass/bda/evaluatedRecommendationsStore";
import { useActiveProjectId } from "@/components/state/project-session";
import { deriveRspPosition, deriveAmplifierPowerPerSubW } from "@/components/room/bass/bda/recommendationInputs";
import ChooseDesignTarget from "@/components/room/bass/bda/ChooseDesignTarget";
import CurrentDesignBar from "@/components/room/bass/bda/CurrentDesignBar";
import BassPerformanceStrip from "@/components/room/bass/bda/BassPerformanceStrip";
import P20SeatStrip from "@/components/room/bass/bda/P20SeatStrip";
import RestorePreviousDesignBar from "@/components/room/bass/bda/RestorePreviousDesignBar";
import BassGraphShellSkeleton from "@/components/room/bass/bda/BassGraphShellSkeleton";
import { useCheckpointedCommits } from "@/components/room/bass/bda/bdaCheckpointAuthority";
import { useEffectiveBassLifecycleState } from "@/components/room/bass/bda/useEffectiveBassLifecycle";
import { createApplyRecalcSettleState, resolveApplyRecalcSettle } from "@/components/room/bass/bda/applyRecalcSettleAuthority";

const BassResponse = React.lazy(() =>
  import("@/components/room/BassResponse").then((m) => ({ default: m.default ?? m.BassResponse }))
);

export default function BassDesignAssistant({
  appState,
  frontSubsCfg,
  rearSubsCfg,
  disabled,
  roomDims,
  seatingPositions,
  subWarnings,
  onChangeSpeakerConfig,
}) {
  const compat = useSubwooferCompatibilityActions(appState, frontSubsCfg, rearSubsCfg);
  const shared = useSharedBassResults();

  const subwooferInstances = appState?.subwooferInstances || [];
  const hasSubwoofers = subwooferInstances.some((s) => s?.enabled !== false);
  const hasResults = shared?.hasCurrentResult === true;
  const isCalculating = shared?.calculationInProgress === true;
  const isPlacementPreview = shared?.placementPreviewActive === true;
  // Preview worker live status — used to distinguish active preview work from
  // idle/errored/stale preview states so "Preparing…" only shows while a
  // worker is genuinely calculating.
  const previewLive = shared?.authoritative?.normalizedLive || null;
  const previewWorkerStatus = previewLive?.status || null;
  const previewErrorMessage = previewLive?.errorMessage || null;
  // True only when a preview worker is actively calculating. When the worker is
  // idle, errored, or the result is ready, this is false — the UI shows a
  // terminal/actionable message instead of an indefinite "Preparing…".
  const isPreparingPreview = isPlacementPreview
    && !shared?.placementPreviewResult
    && previewWorkerStatus === "calculating";
  // Terminal preview state — preview is active but the worker is not going to
  // produce a result (error, or idle after fingerprint settled with no result).
  const previewTerminalMessage = isPlacementPreview
    && !shared?.placementPreviewResult
    && previewWorkerStatus !== "calculating"
    ? (previewErrorMessage
      ? `Preview could not be generated — ${previewErrorMessage}`
      : "Preview could not be generated. Recalculate Bass Results to calculate this layout.")
    : null;
  // Lifecycle state consumed from the sole authority — no independent derivation.
  const bassLifecycleState = shared?.bassLifecycleState || null;

  // Use the SAME scopeId/versionId the BassBackgroundAnalysisOwner uses for
  // restoreStateStore keying — any fallback (activeProjectId || appState?.projectId)
  // can diverge from the owner's resolvedProjectId, causing the shared restore
  // override to never see restoringActive=true.
  const bdaProjectId = shared?.scopeId || null;
  const bdaVersionId = shared?.versionId || null;

  // ── Global restore display override ──────────────────────────────────
  // Subscribe to restoreStateStore so CurrentDesignBar sees RESTORING on the
  // same synchronous tick that RestorePreviousDesignBar calls setRestoring(true)
  // — before BassBackgroundAnalysisOwner republishes shared.bassLifecycleState.
  const effectiveBassLifecycleState = useEffectiveBassLifecycleState(
    bdaProjectId, bdaVersionId, bassLifecycleState,
  );

  // ── Safe bass design experimentation ────────────────────────────────────
  // Wrap ALL physical Apply paths with checkpoint capture. One shared helper
  // owns this — individual recommendation components do not duplicate it.
  const { checkpointedCommitInstances, checkpointedCommitSeating, captureBeforeSubDrag } = useCheckpointedCommits({
    projectId: bdaProjectId,
    versionId: bdaVersionId,
    appState,
    completedBassAuthority: shared?.completedBassAuthority,
    commitInstances: compat.commitInstances,
    commitSeating: appState?.setSeatingPositions,
  });

  // Wire captureBeforeSubDrag into the b44-bass-drag-start window event so
  // manual sub drag captures the pre-drag design checkpoint under the same
  // scopeId/versionId key used by RestorePreviousDesignBar. This is the
  // single capture point for manual drag — apply actions use the checkpointed
  // commit wrappers above.
  const captureBeforeSubDragRef = useRef(captureBeforeSubDrag);
  captureBeforeSubDragRef.current = captureBeforeSubDrag;
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => {
      captureBeforeSubDragRef.current?.();
    };
    window.addEventListener("b44-bass-drag-start", handler);
    return () => window.removeEventListener("b44-bass-drag-start", handler);
  }, []);

  // RSP position for the layout advisor — shared derivation so this surface
  // and the always-mounted background runner never diverge.
  const rspPosition = useMemo(() => deriveRspPosition(appState, roomDims), [appState, roomDims]);

  const sourceHeights = useMemo(() => ({
    front: frontSubsCfg?.bottomHeightM,
    rear: rearSubsCfg?.bottomHeightM,
  }), [frontSubsCfg?.bottomHeightM, rearSubsCfg?.bottomHeightM]);

  // Wrap checkpointed commitInstances so applying a validated layout also
  // marks the instance status valid. The pre-apply checkpoint is captured by
  // checkpointedCommitInstances BEFORE the original commit runs, so the
  // existing RestorePreviousDesignBar owns exact Undo. Recommendation cards
  // persist after apply — they are not collapsed here.
  const wrappedCommitInstances = (instances, ...rest) => {
    checkpointedCommitInstances(instances, ...rest);
    // Applying a validated starting layout is also the recovery path for a
    // previously malformed empty-model layout restored from persistence.
    appState?.setSubwooferInstancesStatus?.(INSTANCE_STATUS.VALID);
  };

  // ── Evaluated 1/2/4-subwoofer recommendations ──
  // The Stage 1 + Stage 2 cross-quantity evaluation is owned by an
  // always-mounted background runner (independent of this accordion), so the
  // search runs in the background and is already available when the designer
  // opens the section. This surface only reads the published results.
  const recProjectId = useActiveProjectId();
  const recVersionId = appState?.activeVersionId || null;
  const recKey = `${recProjectId || "free"}::${recVersionId || "free"}`;
  const evaluatedRecommendations = useEvaluatedRecommendations(recKey);

  // ── Authoritative recalculation after an evaluated-card Apply ──
  // The card commits the new arrangement synchronously then calls onApplied.
  // The committed subwoofer instances propagate through the calibration chain
  // (instances → sources → RSP → calibration fingerprint) over several
  // renders, so the live calculation fingerprint is briefly TRANSIENT before it
  // settles on the new arrangement's identity. Firing onCalculate against the
  // transient fingerprint would dispatch a manual request that no longer
  // matches the settled design, so manualRequestMatchesCurrent would flip
  // false and the request would be cancelled, leaving the previous
  // arrangement's result displayed as current.
  //
  // This effect therefore WAITs: it records the pre-apply calculation
  // fingerprint, waits for the live fingerprint to transition away from it
  // (proving the committed arrangement has entered the chain) and then to
  // stabilise across the threshold of consecutive renders, and only then fires
  // exactly one onCalculate against the settled, committed identity. The
  // pending request is retained until the fingerprint settles (or a bounded
  // safety valve releases it cleanly so the UI never hangs on "Calculating…").
  // Existing fingerprint, generation and stale-result cancellation protections
  // are preserved: onCalculate keys its manual request off the current
  // cacheKey, which now genuinely reflects the applied arrangement, so
  // manualRequestMatchesCurrent stays true and the authoritative assessment
  // completes and publishes the achieved P19/P20 for the new design.
  const applySettleRef = useRef(null);
  const [applyRecalcPulse, setApplyRecalcPulse] = useState(0);
  const [applySettleTick, setApplySettleTick] = useState(0);
  const handleEvaluatedApplied = useCallback(() => {
    applySettleRef.current = createApplyRecalcSettleState(shared?.fingerprint || null);
    setApplyRecalcPulse((p) => p + 1);
  }, [shared?.fingerprint]);
  useEffect(() => {
    const settleState = applySettleRef.current;
    if (!settleState?.pending) return;
    if (typeof shared?.onCalculate !== "function") return;
    const liveFp = shared?.fingerprint || null;
    const gateReady = !!liveFp
      && !!shared?.canCalculate
      && !shared?.calculationInProgress;
    const { state: next, action } = resolveApplyRecalcSettle(settleState, liveFp, gateReady);
    applySettleRef.current = next;
    if (action === "fire") {
      shared.onCalculate();
    } else if (action === "observe") {
      // Force one confirmation render so stability can be observed even when
      // the fingerprint stops changing (no shared-context dep would re-trigger).
      setApplySettleTick((t) => t + 1);
    }
    // "wait" relies on shared-context dep changes to re-run; "release" is
    // terminal and never ticks, so the UI never hangs on "Calculating…".
  }, [
    applyRecalcPulse,
    applySettleTick,
    shared?.onCalculate,
    shared?.canCalculate,
    shared?.calculationInProgress,
    shared?.fingerprint,
  ]);

  // Stages 2–4 are visible once a subwoofer arrangement exists. The
  // recommendation cards remain visible alongside them at all times.
  const layoutChosen = hasSubwoofers;

  return (
    <div className="rounded-xl border border-[#DCDBD6] bg-white p-4 space-y-4" data-bda-workflow="true">
      {/* ── Header ── */}
      <div>
        <h3
          className="text-[17px] font-bold text-[#1B1A1A] tracking-tight"
          style={{ fontFamily: "Didact Gothic, sans-serif" }}
        >
          Subwoofer Design
        </h3>
        <div className="text-[10px] font-medium uppercase text-[#625143]" style={{ letterSpacing: '0.08em' }}>
          Artcoustic Design Intelligence
        </div>
      </div>

      {/* ── Zone 1: Current Design ── */}
      {layoutChosen && (
        <CurrentDesignBar
          frontModel={compat.frontModelDisplay}
          frontCount={compat.frontCount}
          rearModel={compat.rearModelDisplay}
          rearCount={compat.rearCount}
          subwooferInstances={subwooferInstances}
          roomDims={roomDims}
          bassLifecycleState={effectiveBassLifecycleState}
          statusText={isPlacementPreview ? "Subwoofer positions changed. Previewing room response only." : null}
          onChangeSpeakers={onChangeSpeakerConfig}
        />
      )}

      {/* ── Safe bass design experimentation: Restore / Keep ── */}
      {layoutChosen && (
        <RestorePreviousDesignBar
          projectId={bdaProjectId}
          versionId={bdaVersionId}
          appState={appState}
          shared={shared}
          commitInstances={checkpointedCommitInstances}
          commitSeating={checkpointedCommitSeating}
          isCalculating={isCalculating}
          isStale={bassLifecycleState === "stale_needs_recalculation"}
          hasFailed={bassLifecycleState === "failed" || bassLifecycleState === "timed_out"}
          hasCurrentResult={hasResults && !isCalculating && !isPlacementPreview
            && shared?.completedBassAuthority?.authoritative === true}
          onUpdateBass={typeof shared?.onCalculate === "function" ? shared.onCalculate : null}
          onRetry={typeof shared?.onRetry === "function" ? shared.onRetry : null}
        />
      )}

      {/* ── Prerequisites: model + design target ── */}
      {/* Shown before the evaluated shortlist so the designer can satisfy the
          Stage 2 prerequisites (subwoofer model + P14 target) without first
          placing 1, 2 or 4 subwoofers. The model picker reuses the existing
          compatibility action and product master options; the Design Target
          control reuses the existing P14/P18 selectors with their established
          Minimum L2 default. Once a layout exists, the CurrentDesignBar owns
          model display and the picker is hidden. */}
      {!layoutChosen && (
        <SubwooferModelPicker
          model={compat.frontModelDisplay}
          onChange={compat.setFrontSubModel}
          disabled={disabled}
        />
      )}
      <ChooseDesignTarget disabled={disabled} />

      {/* ── Choose Layout (ADI Starting Layout shortlist) ── */}
      {/* The always-mounted background runner evaluates Stage 1/2 for the
          current room, seating, RSP and selected subwoofer. This surface shows
          the global shortlist: up to three credible, materially distinct,
          canonically evaluated layouts — practical front/rear placements first,
          exceptional side-wall layouts only when they deliver a whole-Level
          improvement over the best practical candidate. No geometric
          fallbacks: when no current evaluation exists, a compact waiting
          state is shown. Every P19/P20 value comes from the candidate's own
          canonical evaluation. Apply uses the existing quantity-aware,
          fingerprint-protected authority. */}
      <EvaluatedLayoutCards
        options={evaluatedRecommendations.options}
        status={evaluatedRecommendations.status}
        waitingReason={evaluatedRecommendations.waitingReason}
        roomDims={roomDims}
        subwooferInstances={subwooferInstances}
        frontSubsCfg={frontSubsCfg}
        rearSubsCfg={rearSubsCfg}
        commitInstances={wrappedCommitInstances}
        currentDesignFingerprint={evaluatedRecommendations.stage2Fingerprint}
        hasSubwoofers={hasSubwoofers}
        onApplied={handleEvaluatedApplied}
      />

      {/* ── Zone 3: Performance ── */}
      {/* The graph is the primary workspace. P14/P18/P19/P20 are the graph
          header summary — not a separate panel. Click-to-highlight links the
          pills to the graph's limiting frequency. */}
      {layoutChosen && (
        <div className="space-y-3">
          <Suspense fallback={<BassGraphShellSkeleton />}>
            <div className="rounded-lg border border-[#DCDBD6] bg-white p-3 space-y-2 relative">
              {(isCalculating && hasResults) || isPreparingPreview ? (
                <div className="absolute top-2 right-2 flex items-center gap-1.5 text-[10px] font-medium text-[#625143] bg-[#F4F1EC] px-2 py-1 rounded-md border border-[#E0DCD5]" style={{ zIndex: 10 }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#213428] animate-pulse" />
                  {isPreparingPreview ? "Preparing room-response preview…" : "Analysing updated design…"}
                </div>
              ) : null}
              {previewTerminalMessage && (
                <div className="absolute top-2 right-2 flex items-center gap-1.5 text-[10px] font-medium text-[#4A230F] bg-[#F1F0EE] px-2 py-1 rounded-md border border-[#C1B6AD]" style={{ zIndex: 10, maxWidth: 320 }}>
                  {previewTerminalMessage}
                </div>
              )}
              {/* Authoritative P14/P18/P19/P20 performance result strip */}
              <div className={isPlacementPreview ? "opacity-45" : ""}>
                <BassPerformanceStrip />
              </div>
              {/* P20 individual seat-consistency results — directly below the
                  strip. P20 is a seat-consistency parameter, so the headline
                  and its constituent seat grades are one presentation. */}
              <P20SeatStrip />
              {/* The graph — visual authority for every RP22 result.
                  Contains the RSP / All Seats / individual response selector. */}
              {shared?.authoritative ? (
                <BassResponse
                  frontSubsCfg={frontSubsCfg}
                  rearSubsCfg={rearSubsCfg}
                  subWarnings={subWarnings}
                  hideHeader={true}
                  engineeringDetailCollapsed={true}
                  isCalculating={isCalculating}
                  isPreparingPreview={isPreparingPreview}
                  previewTerminalMessage={previewTerminalMessage}
                />
              ) : (
                <BassGraphShellSkeleton />
              )}
            </div>
          </Suspense>
        </div>
      )}

      {/* ── Zone 4: Recommended Improvement ── */}
      {layoutChosen && (
        <OptimiseAndCalculate
          roomDims={roomDims || appState?.roomDims}
          seatingPositions={seatingPositions}
          subwooferInstances={subwooferInstances}
          frontSubsCfg={frontSubsCfg}
          rearSubsCfg={rearSubsCfg}
          commitInstances={checkpointedCommitInstances}
          commitSeating={checkpointedCommitSeating}
          commitSeatingProvenance={appState?.setAppliedSeatingProvenance}
          appliedSeatingProvenance={appState?.appliedSeatingProvenance}
          hasCanonicalInstances={compat.hasCanonicalInstances}
          appState={appState}
          disabled={disabled}
          hasResults={hasResults}
        />
      )}
    </div>
  );
}