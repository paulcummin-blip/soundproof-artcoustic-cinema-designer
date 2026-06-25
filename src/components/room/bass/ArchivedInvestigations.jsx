/**
 * ArchivedInvestigations
 * Section 2 of the Deep Engine Diagnostics reorganisation.
 * All investigations that have reached a conclusion — collapsed by default.
 * Nothing is removed; all functionality is preserved.
 */

import React from 'react';
import RewParityInvestigationRunner from './RewParityInvestigationRunner';
import RewParityModalParticipationAudit from './RewParityModalParticipationAudit';
import RewParityCombinedRootCauseAudit from './RewParityCombinedRootCauseAudit';
import RewParityParticipationDecayAudit from './RewParityParticipationDecayAudit';
import RewProductionCandidateGenerator from './RewProductionCandidateGenerator';
import RewEngineShootout from './RewEngineShootout';
import RewParityErrorBreakdown from './RewParityErrorBreakdown';
import RewBestCandidateRefiner from './RewBestCandidateRefiner';
import DeepDiagnosticsSweepPanel from './DeepDiagnosticsSweepPanel';
import SubwooferDelayOptimiser from './SubwooferDelayOptimiser';
import RewDebugPanel from './RewDebugPanel';

// Archive entries — each gets a status tag explaining why it was archived
const ARCHIVE_STATUS = {
  investigation_runner:     { tag: '✓ Production matches theory',     note: 'Investigation steps superseded by dedicated audits' },
  modal_participation:      { tag: '✓ Not primary driver',            note: 'Modal count / bandwidth not primary MAE suspect' },
  combined_root_cause:      { tag: '✓ Passed',                        note: '900-combo sweep concluded — distance_normalized selected' },
  participation_decay:      { tag: '✓ Passed',                        note: 'Hard/soft suppression sweep completed' },
  candidate_generator:      { tag: '✓ Superseded',                    note: 'Production candidate selected — distance_normalized ×1.0' },
  engine_shootout:          { tag: '✓ Passed',                        note: 'REW Core engine confirmed as production default' },
  parity_error_breakdown:   { tag: '✓ Passed',                        note: '10-variant diagnostic complete' },
  best_candidate_refiner:   { tag: '✓ Superseded',                    note: 'Fine-sweep concluded — no further refinement needed' },
  delay_optimiser:          { tag: '✓ Passed',                        note: 'Auto-align delay confirmed as runtime-only' },
  rew_debug_panel:          { tag: '✓ Production matches theory',     note: 'Step debug confirmed modal path is correct' },
  deep_sweep_panel:         { tag: '✓ Archived',                      note: 'Full sweep suite — run only if new hypothesis requires it' },
};

function ArchivedTag({ tag }) {
  return (
    <span style={{ display: 'inline-block', padding: '1px 7px', borderRadius: 4, background: '#f0fdf4', color: '#166534', border: '1px solid #86efac', fontSize: 9, fontWeight: 700, fontFamily: 'monospace', marginLeft: 6 }}>
      {tag}
    </span>
  );
}

function ArchivedSection({ id, label, note, children }) {
  return (
    <details style={{ border: '1px solid #c4b5fd', borderRadius: 6, background: '#faf5ff', padding: '5px 10px', marginBottom: 4 }}>
      <summary style={{ cursor: 'pointer', fontSize: 10, fontFamily: 'monospace', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
        <span style={{ fontWeight: 600, color: '#4c1d95' }}>{label}</span>
        <ArchivedTag tag={ARCHIVE_STATUS[id]?.tag ?? '✓ Archived'} />
        <span style={{ color: '#7c3aed', fontSize: 9 }}>{note || ARCHIVE_STATUS[id]?.note}</span>
      </summary>
      <div style={{ marginTop: 8 }}>
        {children}
      </div>
    </details>
  );
}

export default function ArchivedInvestigations({
  roomDims,
  seat,
  sub,
  subs,
  seatingPositions,
  surfaceAbsorption,
  axialQ,
  multiSeries,
  simulationResults,
  sweepSettings,
  modalDistanceBlend,
  modalSourceReferenceMode,
  modalGainScalar,
  disableModalPropagationPhase,
  propagationPhaseScale,
  rewSourceCurveMode,
  selectedSeatIds,
  subsForSimulation,
  frontSubsCfg,
  enableRewCoreReflections,
  disableLateField,
  modalStorageMode,
  disableReflectionPhaseJitter,
  disableReflectionCoherenceWeight,
  mute68HzAxialMode,
  debugDisableModalContribution,
}) {
  const firstFrontSubId = subsForSimulation?.find(s => s.id?.startsWith('front-'))?.id;
  const frontSettingsById = frontSubsCfg?.settingsById || {};
  const currentManualDelay = firstFrontSubId && Number.isFinite(frontSettingsById[firstFrontSubId]?.delayMs)
    ? frontSettingsById[firstFrontSubId].delayMs : 0;

  const activeSettings = {
    axialQ,
    modalSourceReferenceMode,
    modalGainScalar,
  };

  return (
    <details style={{ border: '2px solid #7c3aed', borderRadius: 8, background: '#faf5ff', padding: '8px 12px' }}>
      <summary style={{ fontWeight: 700, color: '#4c1d95', fontSize: 11, fontFamily: 'monospace', cursor: 'pointer' }}>
        Archived Investigations (Passed / No Longer Primary Suspects)
        <span style={{ fontWeight: 400, color: '#7c3aed', marginLeft: 8, fontSize: 9 }}>
          All functionality preserved — click to expand
        </span>
      </summary>
      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 0 }}>

        {/* Investigation Runner */}
        <ArchivedSection id="investigation_runner" label="REW Parity Investigation Runner">
          <RewParityInvestigationRunner liveB44Series={multiSeries[0]?.data ?? []} />
        </ArchivedSection>

        {/* Modal Participation Audit */}
        <ArchivedSection id="modal_participation" label="REW Parity Modal Participation Audit">
          <RewParityModalParticipationAudit
            roomDims={roomDims} seat={seat} sub={sub}
            surfaceAbsorption={surfaceAbsorption}
            activeSettings={{ axialQ, modalDistanceBlend, modalSourceReferenceMode, modalGainScalar }}
          />
        </ArchivedSection>

        {/* Combined Root Cause Audit */}
        <ArchivedSection id="combined_root_cause" label="REW Parity Combined Root Cause Audit (900 combos)">
          <RewParityCombinedRootCauseAudit
            roomDims={roomDims} seat={seat} sub={sub}
            surfaceAbsorption={surfaceAbsorption} activeSettings={{ axialQ }}
          />
        </ArchivedSection>

        {/* Participation Decay Audit */}
        <ArchivedSection id="participation_decay" label="REW Parity Participation Decay Audit">
          <RewParityParticipationDecayAudit
            roomDims={roomDims} seat={seat} sub={sub}
            surfaceAbsorption={surfaceAbsorption} activeSettings={{ axialQ }}
          />
        </ArchivedSection>

        {/* Production Candidate Generator */}
        <ArchivedSection id="candidate_generator" label="REW Production Candidate Generator (1600-combo sweep)">
          <RewProductionCandidateGenerator
            roomDims={roomDims} seat={seat} sub={sub}
            surfaceAbsorption={surfaceAbsorption} activeSettings={{ axialQ }}
          />
        </ArchivedSection>

        {/* Engine Shootout */}
        <ArchivedSection id="engine_shootout" label="REW Engine Shootout">
          <RewEngineShootout
            roomDims={roomDims} seat={seat} sub={sub}
            surfaceAbsorption={surfaceAbsorption} activeSettings={{ axialQ }}
          />
        </ArchivedSection>

        {/* Parity Error Breakdown */}
        <ArchivedSection id="parity_error_breakdown" label="REW Parity Error Breakdown (10 variants)">
          <RewParityErrorBreakdown
            roomDims={roomDims} seat={seat} sub={sub}
            surfaceAbsorption={surfaceAbsorption} activeSettings={{ axialQ }}
          />
        </ArchivedSection>

        {/* Best Candidate Refiner */}
        <ArchivedSection id="best_candidate_refiner" label="REW Best Candidate Refiner (fine sweep)">
          <RewBestCandidateRefiner
            roomDims={roomDims} seat={seat} sub={sub}
            surfaceAbsorption={surfaceAbsorption} activeSettings={{ axialQ }}
          />
        </ArchivedSection>

        {/* Subwoofer Delay Optimiser */}
        <ArchivedSection id="delay_optimiser" label="Subwoofer Delay Optimiser">
          {subsForSimulation && (
            <SubwooferDelayOptimiser
              mlpSeat={seat}
              roomDims={roomDims}
              subsForSimulation={subsForSimulation}
              rewSourceCurveMode={rewSourceCurveMode}
              REW_SOURCE_CURVES={{ flat_rew_reference: [{ hz: 20, db: 94 }, { hz: 50, db: 94 }, { hz: 100, db: 94 }, { hz: 200, db: 94 }] }}
              enableRewCoreReflections={enableRewCoreReflections}
              surfaceAbsorption={surfaceAbsorption}
              modalSourceReferenceMode={modalSourceReferenceMode}
              modalGainScalar={modalGainScalar}
              axialQ={axialQ}
              modalStorageMode={modalStorageMode}
              propagationPhaseScale={propagationPhaseScale}
              disableReflectionPhaseJitter={disableReflectionPhaseJitter}
              disableReflectionCoherenceWeight={disableReflectionCoherenceWeight}
              disableLateField={disableLateField}
              disableModalPropagationPhase={disableModalPropagationPhase}
              mute68HzAxialMode={mute68HzAxialMode}
              debugDisableModalContribution={debugDisableModalContribution}
              currentManualDelay={currentManualDelay}
            />
          )}
        </ArchivedSection>

        {/* REW Debug Panel */}
        <ArchivedSection id="rew_debug_panel" label="REW Step Debug Panel">
          <RewDebugPanel
            stepDebug={simulationResults?.stepDebug}
            selectedSeatIds={selectedSeatIds}
            disableModalPropagationPhase={disableModalPropagationPhase}
            propagationPhaseScale={propagationPhaseScale}
            roomDims={roomDims}
            seat={seat}
            sub={sub}
            surfaceAbsorption={surfaceAbsorption}
            activeSettings={{ axialQ, modalSourceReferenceMode, modalDistanceBlend, modalGainScalar }}
          />
        </ArchivedSection>

        {/* Deep Diagnostics Sweep Panel — all sweep audits */}
        <ArchivedSection id="deep_sweep_panel" label="Deep Diagnostics Sweep Panel (full sweep suite)">
          {seat && sub && sweepSettings && (
            <DeepDiagnosticsSweepPanel
              roomDims={roomDims}
              sweepSeat={seat}
              sweepSub={sub}
              subs={subs}
              surfaceAbsorption={surfaceAbsorption}
              sweepSettings={sweepSettings}
              simulationResults={simulationResults}
              multiSeries={multiSeries}
              axialQ={axialQ}
              modalDistanceBlend={modalDistanceBlend}
            />
          )}
        </ArchivedSection>

      </div>
    </details>
  );
}