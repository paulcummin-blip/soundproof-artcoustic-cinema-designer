// AdiJourneyEngineerDetailsSections.jsx
// ---------------------------------------------------------------------------
// LEVEL 3 — THE DEVELOPER DIAGNOSTICS SECTIONS of the Bass Optimisation card.
//
// Fingerprints, candidate ids, per-candidate counts, grouped-delay arrays, the
// absolute saved processor delays, cache and canonical-job internals, the run's
// own workload and its recorded rejection reasons. Rendered ONLY when the
// internal debug gate is on (useOptimiserDeveloperDiagnostics) — a dealer never
// sees one. Nothing here is deleted or suppressed anywhere else: the evidence is
// still saved, and every report and proposal still consumes it.
//
// Extracted from AdiOptimisationJourney.jsx so the journey stays the
// orchestration layer: this renders the evidence groups in exactly the order they
// were stated in.
//
// It resolves NOTHING. Every value arrives already resolved by the authorities
// the journey read — the designer summary, the calibration decision, the saved
// run evidence, the published P20 headline, the placement recommendation and the
// plan status. The two elements the acceptance suites anchor their ordering
// assertions on (the disclosure itself, the previous candidate's block and the
// pre-run estimate) stay in the journey, so this component sits between them.
//
// PRESENTATION ONLY: no calculation, no store, no apply logic.
// ---------------------------------------------------------------------------

import React from "react";
import AdiCalibrationSection from "./AdiCalibrationSection.jsx";
import AdiTestedSection from "./AdiTestedSection.jsx";
import OptimiserRunEvidenceBlock from "./OptimiserRunEvidenceBlock.jsx";
import AdiEngineerEvidenceBlock from "./AdiEngineerEvidenceBlock.jsx";
import AdiCalibrationEvidenceBlock from "./AdiCalibrationEvidenceBlock.jsx";
import AdiBestCalibrationResult from "./AdiBestCalibrationResult.jsx";
import AdiAppliedBassCalibration from "./AdiAppliedBassCalibration.jsx";
import AdiTestedOptionsTable from "./AdiTestedOptionsTable.jsx";
import AdiAbsoluteGroupDelays from "./AdiAbsoluteGroupDelays.jsx";
import AcousticDelayAlignmentCard from "@/components/room/bass/improveBassV2/AcousticDelayAlignmentCard.jsx";
import OptimisationPlanStatus from "./OptimisationPlanStatus.jsx";
import PlacementRecommendationPanel from "./PlacementRecommendationPanel.jsx";
import AdiRecommendationEvidenceGroups from "./AdiRecommendationEvidenceGroups.jsx";
import AdiJourneyRunWorkloadBlock from "./AdiJourneyRunWorkloadBlock.jsx";
import AdiJourneyRuntimeCostBlock from "./AdiJourneyRuntimeCostBlock.jsx";
import { FUTURE_CAPABILITY_TITLE } from "./optimiserLiveFamilies.js";
import { PLACEMENT_PREVIEW_UNAVAILABLE } from "./placementMoveAuthority.js";

export default function AdiJourneyEngineerDetailsSections({ view = {} }) {
  const {
    assessment = null,
    why = null,
    explanation = null,
    runError = null,
    notes = [],
    futureCapability = [],
    calibrationKind = null,
    appliedEvidence = null,
    appliedCalibration = null,
    recommendation = null,
    evidenceState = null,
    bestResult = null,
    instances = [],
    roomDims = null,
    testedRows = [],
    currentP20Text = null,
    recommendedP20Text = null,
    runBaselineDiffers = false,
    runBaselineDeviation = null,
    runEvidence = null,
    seatCount = null,
    limitingFrequencyHz = null,
    limitingSeatId = null,
    designFingerprint = null,
    resultFingerprint = null,
    parityStatus = null,
    calibrationEvidence = null,
    summary = null,
    delayLever = null,
    absoluteDelaySettings = [],
    showPlan = false,
    projectId = null,
    versionId = null,
    completedBassAuthority = null,
    seatingPositions = [],
    onApplyLever = null,
    onUndoLever = null,
    leverApplyBusy = null,
    leverOutcome = null,
    seatingRecommendation = null,
    placement = null,
    isRunning = false,
    absorption = null,
    attemptsWithoutGain = null,
    workload = null,
    runtimeCost = [],
  } = view;

  return (
    <>
      {(assessment || why) && (
        <div className="space-y-0.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">Diagnosis</div>
          {why && <div className="text-[11px] text-[#3E4349] leading-relaxed">{why}</div>}
          {assessment && <div className="text-[11px] text-[#3E4349] leading-relaxed">{assessment}</div>}
        </div>
      )}

      {explanation && (
        <div className="text-[11px] text-[#3E4349] leading-relaxed">{explanation}</div>
      )}

      {/* The fresh run's exact engine reason is diagnostic evidence. Keep it
          out of the default panel, but retain it here so a repeated failure
          can be diagnosed without reconstructing the run. */}
      {runError && (
        <div
          className="rounded-md border border-[#E7E5E0] bg-[#F8F7F4] px-3 py-2 text-[11px] text-[#3E4349] leading-relaxed"
          data-adi-run-error="true"
        >
          <span className="font-semibold">Run detail: </span>{runError}
        </div>
      )}

      {notes.length > 0 && (
        <div className="space-y-0.5 text-[11px] text-[#625143] leading-relaxed">
          {notes.map((note) => <div key={note}>{note}</div>)}
        </div>
      )}

      {/* Capabilities ADI does not evaluate yet. They are stated HERE, once,
          and never as a row of the tested list: a designer must never read a
          lever as something ADI tested for them when the model cannot. */}
      {futureCapability.length > 0 && (
        <div className="space-y-0.5 text-[11px] text-[#3E4349] leading-relaxed">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
            {FUTURE_CAPABILITY_TITLE}
          </div>
          {futureCapability.map((note) => (
            <div key={note.key} data-adi-future-capability={note.key}>
              {note.label}: {note.statement}
            </div>
          ))}
        </div>
      )}

      {/* The calibration decision's own record: what ADI applied, what it held
          and why, the settings each change touches and the canonical P19/P20
          pair it was decided on. The panel states the decision; every
          measurement behind it is read here. */}
      <AdiCalibrationSection
        kind={calibrationKind}
        appliedEvidence={appliedEvidence}
        appliedCalibration={appliedCalibration}
        recommendation={recommendation}
        evidenceState={evidenceState}
        bestResult={bestResult}
        instances={instances}
        roomDims={roomDims}
        detailed
      />

      {/* What ADI tested, per lever, split into the calibration levers it may
          apply and the design levers it may only recommend. Moved out of the
          default panel: the designer reads the decision first, and the
          coverage of the evaluation here. */}
      <AdiTestedSection rows={testedRows} />

      {/* The P20 values the headline draws on, each named for what it is, so
          two different states can never be read as one comparison. */}
      {(currentP20Text || recommendedP20Text || runBaselineDiffers) && (
        <div className="space-y-0.5 text-[11px] text-[#3E4349] leading-relaxed">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
            P20 results compared
          </div>
          {currentP20Text && (
            <div>Current design (published result): {currentP20Text}</div>
          )}
          {runBaselineDiffers && (
            <div>
              Evaluation baseline: P20 {runBaselineDeviation} — a different current
              state, so that evaluation&apos;s before → after values are its own.
            </div>
          )}
          {recommendedP20Text && (
            <div>Evaluated result with the recommended change: {recommendedP20Text}</div>
          )}
        </div>
      )}

      <OptimiserRunEvidenceBlock evidence={runEvidence} seatCount={seatCount} instances={instances} />

      {/* The limits every other number on this panel depends on, and the
          fingerprints that identify exactly which design, which published
          bass result and which applied calibration it is describing. */}
      <AdiEngineerEvidenceBlock
        limitingFrequencyHz={limitingFrequencyHz}
        limitingSeatId={limitingSeatId}
        designFingerprint={designFingerprint}
        resultFingerprint={resultFingerprint}
        parityStatus={parityStatus}
        appliedCalibration={appliedCalibration}
      />

      {/* The calibration evidence the saved run kept: per lever, the candidate
          count, the best confirmed candidate with its canonical P19/P20
          before → after, and the run's own reason for accepting nothing.
          Without it the panel never claims a lever was tested. */}
      <AdiCalibrationEvidenceBlock evidence={calibrationEvidence} />

      {/* A calibration result ADI HELD that makes P20 worse: its candidate,
          its canonical P19/P20 before → after and its settings are stated
          here, never on the main panel, which states the refusal and the
          change it was measured on. */}
      {bestResult?.mainPanelSuppressed === true && (
        <div className="space-y-1" data-adi-calibration-candidate-proof="true">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
            Calibration candidate evaluated — not a safe improvement
          </div>
          <AdiBestCalibrationResult result={bestResult} />
          <AdiAppliedBassCalibration
            evidence={appliedEvidence}
            appliedCalibration={null}
            designChanges={[]}
            instances={instances}
            roomDims={roomDims}
          />
        </div>
      )}

      {/* The per-lever detail, and the best acoustic delay the grouped
          front/rear sweep confirmed — a detail of the delay lever ADI
          already tested, never a second recommendation surface. */}
      <AdiTestedOptionsTable summary={summary} />
      {/* The absolute saved processor delays behind the relative group
          offset the panel states — traceability only, read never written. */}
      <AdiAbsoluteGroupDelays
        instances={instances}
        settings={absoluteDelaySettings}
        roomDims={roomDims}
      />
      <AcousticDelayAlignmentCard lever={delayLever} />

      {showPlan && (
        <OptimisationPlanStatus
          projectId={projectId}
          versionId={versionId}
          completedBassAuthority={completedBassAuthority}
          currentDesignFingerprint={designFingerprint}
          instances={instances}
          seatingPositions={seatingPositions}
          onApplyLever={onApplyLever}
          onUndoLever={onUndoLever}
          leverApplyBusy={leverApplyBusy}
          leverOutcome={leverOutcome}
        />
      )}

      {/* The placement evidence behind the move the panel states: what
          placement means here, the designer's own distances per wall group,
          the expected result in whole dB and the on-plan status. Its controls
          are on the main panel. */}
      <PlacementRecommendationPanel
        placement={placement}
        busy={isRunning}
        variant="evidence"
      />

      {/* The two evidence groups behind the recommendation — the absorption
          the measurement points at, and the seating recommendation's own
          evaluation. They render only when their evidence exists, and are
          kept out of the default panel. */}
      <AdiRecommendationEvidenceGroups
        absorption={absorption}
        attemptsWithoutGain={attemptsWithoutGain}
        seatingRecommendation={seatingRecommendation}
      />

      {/* The missing on-plan preview is a limitation of the evidence, not a
          warning about the recommendation, so it is stated here. */}
      {placement?.notice === PLACEMENT_PREVIEW_UNAVAILABLE && (
        <div className="text-[11px] text-[#625143] leading-relaxed">
          On-plan preview: not yet available for this change.
        </div>
      )}

      {/* THE RUN'S OWN WORKLOAD — DEVELOPER DIAGNOSTICS ONLY. It is measurement,
          not a result: after a run the designer no longer needs it, so it is
          never stated in the normal view (a run in progress states its useful
          live progress on the card itself). */}
      {workload && <AdiJourneyRunWorkloadBlock workload={workload} />}

      {/* THE RUN'S RUNTIME COST, SPLIT — DEVELOPER DIAGNOSTICS ONLY. What the
          electronic search and its canonical confirmations cost, beside the
          physical placement work that must never sit inside Calculate Bass. */}
      <AdiJourneyRuntimeCostBlock rows={runtimeCost} />
    </>
  );
}