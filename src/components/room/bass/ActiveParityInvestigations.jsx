/**
 * ActiveParityInvestigations
 * Section 1 of the Deep Engine Diagnostics reorganisation.
 * Contains only diagnostics that are still helping identify remaining REW parity differences.
 * Visible by default (no collapse).
 */

import React from 'react';
import MultiSeatParityValidationAudit from './MultiSeatParityValidationAudit';
import ModalSourceNormalisationAudit from './ModalSourceNormalisationAudit';
import ModalQDampingParityAudit from './ModalQDampingParityAudit';
import ModalParticipationWeightingMatrixAudit from './ModalParticipationWeightingMatrixAudit';
import TransferFunctionShapeMatrixAudit from './TransferFunctionShapeMatrixAudit';
import ModalExcitationAmplitudeAudit from './ModalExcitationAmplitudeAudit';
import GreenFunctionEquationShootoutAudit from './GreenFunctionEquationShootoutAudit';
import DestructiveNullStoryAudit from './DestructiveNullStoryAudit';
import PhaseOriginPropagationAudit from './PhaseOriginPropagationAudit';
import ComplexVectorCoherenceAudit from './ComplexVectorCoherenceAudit';
import FiniteSourceRadiationAudit from './FiniteSourceRadiationAudit';
import RewParityBenchmark from './RewParityBenchmark';
import RewBenchmarkProvenancePanel from './RewBenchmarkProvenancePanel';
import RewBenchmarkComparisonTable from './RewBenchmarkComparisonTable';
import RewCandidateComparisonPanel from './RewCandidateComparisonPanel';
import RewParityAutoSweep from './RewParityAutoSweep';
import RewRefinedEngineShootout from './RewRefinedEngineShootout';

// Investigation tracker state definitions
const INVESTIGATIONS = [
  { id: 'multi_seat_parity',    label: 'Multi-Seat Parity Validation',      status: 'Running',  note: 'Active — verifying distance_normalized across all seats' },
  { id: 'modal_q_damping',      label: 'Modal Q / Damping Parity',           status: 'Pending',  note: 'New — compare Q implementation against REW' },
  { id: 'modal_participation',  label: 'Modal Participation Weighting Matrix', status: 'Running',  note: 'New — dominant-mode / family / redistribution vs MAE' },
  { id: 'tf_shape_matrix',       label: 'Transfer Function Shape Matrix',          status: 'Running',  note: 'New — TF formulation variants vs REW parity' },
  { id: 'modal_excitation_amp', label: 'Modal Excitation Amplitude Audit',         status: 'Running',  note: 'New — excitation generation before TF vs REW parity' },
  { id: 'modal_source_norm',    label: 'Modal Source Normalisation Matrix',   status: 'Running',  note: 'Active — distance_normalized vs existing at MLP' },
  { id: 'rew_benchmark',        label: 'REW Benchmark Comparison',            status: 'Running',  note: 'Always active — primary MAE readout' },
  { id: 'candidate_comparison', label: 'Candidate Comparison Panel',          status: 'Running',  note: 'Active — comparing engine variants' },
  { id: 'auto_sweep',           label: 'REW Parity Auto Sweep',               status: 'Pending',  note: 'Use to sweep parameter space around new candidates' },
  { id: 'refined_shootout',     label: 'Refined Engine Shootout',             status: 'Pending',  note: 'Final 3-way comparison when candidate is ready' },
];

const STATUS_COLORS = {
  Pending: { bg: '#fafafa', text: '#6b7280', border: '#e5e7eb' },
  Running: { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
  Passed:  { bg: '#f0fdf4', text: '#166534', border: '#86efac' },
  Failed:  { bg: '#fef2f2', text: '#991b1b', border: '#fca5a5' },
  Archived:{ bg: '#faf5ff', text: '#6d28d9', border: '#c4b5fd' },
};

function StatusBadge({ status }) {
  const col = STATUS_COLORS[status] || STATUS_COLORS.Pending;
  return (
    <span style={{ display: 'inline-block', padding: '1px 7px', borderRadius: 4, background: col.bg, color: col.text, border: `1px solid ${col.border}`, fontSize: 9, fontWeight: 700, fontFamily: 'monospace' }}>
      {status}
    </span>
  );
}

function ParityStatusPanel({ currentMae, bestCandidateMae, productionConfig, remainingInvestigations }) {
  return (
    <div style={{ border: '2px solid #213428', borderRadius: 8, background: '#f0fdf4', padding: '10px 14px', marginBottom: 12 }}>
      <div style={{ fontWeight: 700, color: '#213428', fontSize: 12, marginBottom: 8 }}>Current REW Parity Status</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: 10, color: '#374151', fontFamily: 'monospace', marginBottom: 8 }}>
        <div>
          <div style={{ color: '#6b7280', fontWeight: 600 }}>Current MAE</div>
          <div style={{ fontWeight: 700, fontSize: 13, color: currentMae !== null ? (currentMae < 3 ? '#166534' : currentMae < 6 ? '#92400e' : '#991b1b') : '#6b7280' }}>
            {currentMae !== null ? `${currentMae.toFixed(2)} dB` : '— run benchmark'}
          </div>
        </div>
        <div>
          <div style={{ color: '#6b7280', fontWeight: 600 }}>Best Candidate MAE</div>
          <div style={{ fontWeight: 700, fontSize: 13, color: bestCandidateMae !== null ? (bestCandidateMae < 3 ? '#166534' : '#92400e') : '#6b7280' }}>
            {bestCandidateMae !== null ? `${bestCandidateMae.toFixed(2)} dB` : '— run sweep'}
          </div>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <div style={{ color: '#6b7280', fontWeight: 600 }}>Production Configuration</div>
          <div style={{ color: '#374151' }}>{productionConfig || 'distance_normalized · axialQ=4.0 · flat REW reference · no reflections · propPhaseScale=0'}</div>
        </div>
      </div>
      <div style={{ borderTop: '1px solid #d1fae5', paddingTop: 6 }}>
        <div style={{ color: '#166534', fontWeight: 600, fontSize: 9, marginBottom: 4 }}>HIGHEST PRIORITY REMAINING INVESTIGATIONS</div>
        {remainingInvestigations.map((item, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2, fontSize: 9 }}>
            <StatusBadge status={item.status} />
            <span style={{ color: '#374151' }}>{item.label}</span>
            <span style={{ color: '#6b7280' }}>— {item.note}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function InvestigationTracker({ investigations }) {
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, background: '#fafafa', padding: '8px 10px', marginBottom: 10 }}>
      <div style={{ fontWeight: 700, color: '#374151', fontSize: 10, marginBottom: 6 }}>Investigation Tracker</div>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 9, fontFamily: 'monospace' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #e5e7eb', color: '#6b7280', textTransform: 'uppercase' }}>
            <th style={{ textAlign: 'left', padding: '2px 6px' }}>Investigation</th>
            <th style={{ textAlign: 'center', padding: '2px 6px' }}>Status</th>
            <th style={{ textAlign: 'left', padding: '2px 6px' }}>Note</th>
          </tr>
        </thead>
        <tbody>
          {investigations.map(inv => (
            <tr key={inv.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
              <td style={{ padding: '2px 6px', color: '#1c1917', fontWeight: 600 }}>{inv.label}</td>
              <td style={{ padding: '2px 6px', textAlign: 'center' }}><StatusBadge status={inv.status} /></td>
              <td style={{ padding: '2px 6px', color: '#6b7280' }}>{inv.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ActiveParityInvestigations({
  roomDims,
  seat,
  sub,
  seatingPositions,
  subsForSimulation,
  surfaceAbsorption,
  axialQ,
  multiSeries,
  modalSourceReferenceMode,
  modalGainScalar,
  modalDistanceBlend,
  propagationPhaseScale,
  enableRewCoreReflections,
  rewParityModalMagnitudeScale,
  debugModalPhaseConvention,
  debugModalHSign,
  modalCoherenceMode,
  modalStorageMode,
  disableLateField,
  onPromoteRefined,
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* ── Parity Status Dashboard ── */}
      <ParityStatusPanel
        currentMae={null}
        bestCandidateMae={null}
        productionConfig={`distance_normalized · axialQ=${axialQ?.toFixed(1)} · flat REW ref · propPhaseScale=0`}
        remainingInvestigations={INVESTIGATIONS.filter(i => i.status === 'Running' || i.status === 'Pending')}
      />

      {/* ── Investigation Tracker ── */}
      <InvestigationTracker investigations={INVESTIGATIONS} />

      {/* ── 0. REW Benchmark Provenance Panel ── */}
      <details style={{ border: '1px solid #fca5a5', borderRadius: 8, background: '#fef2f2', padding: '6px 10px', marginBottom: 8 }}>
        <summary style={{ fontWeight: 700, color: '#991b1b', fontSize: 10, cursor: 'pointer' }}>
          REW Benchmark Provenance — enter REW setup for like-for-like validation
        </summary>
        <div style={{ marginTop: 8 }}>
          <RewBenchmarkProvenancePanel
            roomDims={roomDims}
            subsForSimulation={subsForSimulation}
            seatingPositions={seatingPositions}
            multiSeries={multiSeries}
          />
        </div>
      </details>

      {/* ── REW Benchmark Comparison (always visible — primary MAE readout) ── */}
      <div style={{ border: '1px solid #213428', borderRadius: 8, background: '#f0fdf4', padding: 12, marginBottom: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 11, color: '#213428', marginBottom: 6 }}>REW Benchmark Comparison</div>
        {multiSeries?.length > 0 ? (
          <RewBenchmarkComparisonTable
            b44Data={multiSeries[0]?.data ?? []}
            label={`B44 dB (${modalSourceReferenceMode})`}
          />
        ) : (
          <div style={{ color: '#6b7280', fontSize: 10 }}>No simulation data — add a sub and seat.</div>
        )}
        <div style={{ marginTop: 10 }}>
          <RewParityBenchmark b44Series={multiSeries[0]?.data ?? []} />
        </div>
      </div>

      {/* ── 1. Multi-Seat REW Parity Validation (primary) ── */}
      <MultiSeatParityValidationAudit
        roomDims={roomDims}
        seatingPositions={seatingPositions}
        subsForSimulation={subsForSimulation}
        surfaceAbsorption={surfaceAbsorption}
        axialQ={axialQ}
      />

      {/* ── 2. Modal Q / Damping Parity Audit (new) ── */}
      <ModalQDampingParityAudit
        roomDims={roomDims}
        seat={seat}
        sub={sub}
        surfaceAbsorption={surfaceAbsorption}
        axialQ={axialQ}
      />

      {/* ── 3. Modal Participation Weighting Matrix ── */}
      <ModalParticipationWeightingMatrixAudit
        roomDims={roomDims}
        seat={seat}
        sub={sub}
        seatingPositions={seatingPositions}
        surfaceAbsorption={surfaceAbsorption}
        axialQ={axialQ}
      />

      {/* ── 4. Transfer Function Shape Matrix ── */}
      <TransferFunctionShapeMatrixAudit
        roomDims={roomDims}
        seat={seat}
        sub={sub}
        seatingPositions={seatingPositions}
        surfaceAbsorption={surfaceAbsorption}
        axialQ={axialQ}
      />

      {/* ── 5. Modal Excitation Amplitude Audit ── */}
      <ModalExcitationAmplitudeAudit
        roomDims={roomDims}
        seat={seat}
        sub={sub}
        seatingPositions={seatingPositions}
        surfaceAbsorption={surfaceAbsorption}
        axialQ={axialQ}
      />

      {/* ── 6. Destructive Null Story Audit ── */}
      <DestructiveNullStoryAudit
        roomDims={roomDims}
        seat={seat}
        sub={sub}
        seatingPositions={seatingPositions}
        surfaceAbsorption={surfaceAbsorption}
        axialQ={axialQ}
      />

      {/* ── 7. Phase Origin & Propagation Audit ── */}
      <PhaseOriginPropagationAudit
        roomDims={roomDims}
        seat={seat}
        sub={sub}
        surfaceAbsorption={surfaceAbsorption}
        axialQ={axialQ}
      />

      {/* ── 8. Complex Vector Coherence Audit ── */}
      <ComplexVectorCoherenceAudit
        roomDims={roomDims}
        seat={seat}
        sub={sub}
        surfaceAbsorption={surfaceAbsorption}
        axialQ={axialQ}
      />

      {/* ── 9. Finite Source Radiation Audit ── */}
      <FiniteSourceRadiationAudit
        roomDims={roomDims}
        seat={seat}
        sub={sub}
        surfaceAbsorption={surfaceAbsorption}
        axialQ={axialQ}
      />

      {/* ── 10. Green's Function Equation Shootout ── */}
      <GreenFunctionEquationShootoutAudit
        roomDims={roomDims}
        sub={sub}
        seatingPositions={seatingPositions}
        surfaceAbsorption={surfaceAbsorption}
        axialQ={axialQ}
      />

      {/* ── 7. Modal Source Normalisation Matrix ── */}
      <ModalSourceNormalisationAudit
        roomDims={roomDims}
        seat={seat}
        sub={sub}
        surfaceAbsorption={surfaceAbsorption}
        axialQ={axialQ}
      />

      {/* ── 4. Candidate Comparison Panel ── */}
      {seat && sub && (
        <div style={{ border: '1px solid #CBD5E1', borderRadius: 6, background: '#f8fafc', padding: '8px 10px', marginBottom: 8 }}>
          <div style={{ fontWeight: 700, color: '#334155', fontSize: 10, marginBottom: 6 }}>Candidate Comparison Panel</div>
          <RewCandidateComparisonPanel
            roomDims={roomDims}
            seat={seat}
            sub={sub}
            sourceCurve={[{ hz: 20, db: 94 }, { hz: 50, db: 94 }, { hz: 100, db: 94 }, { hz: 200, db: 94 }]}
            modalSourceReferenceMode={modalSourceReferenceMode}
            modalGainScalar={modalGainScalar}
            propagationPhaseScale={propagationPhaseScale}
            surfaceAbsorption={surfaceAbsorption}
            enableRewCoreReflections={enableRewCoreReflections}
            rewParityModalMagnitudeScale={rewParityModalMagnitudeScale}
            debugModalPhaseConvention={debugModalPhaseConvention}
            debugModalHSign={debugModalHSign}
          />
        </div>
      )}

      {/* ── 5. REW Parity Auto Sweep (collapsed, on demand) ── */}
      {seat && sub && (
        <details style={{ border: '1px solid #CBD5E1', borderRadius: 6, background: '#f8fafc', padding: '6px 10px', marginBottom: 6 }}>
          <summary style={{ fontWeight: 700, color: '#334155', fontSize: 10, cursor: 'pointer' }}>
            REW Parity Auto Sweep (parameter space)
          </summary>
          <div style={{ marginTop: 8 }}>
            <RewParityAutoSweep
              roomDims={roomDims}
              seat={seat}
              sub={sub}
              surfaceAbsorption={surfaceAbsorption}
              liveB44Series={multiSeries[0]?.data ?? []}
              activeSettings={{
                modalSourceReferenceMode,
                modalDistanceBlend,
                modalCoherenceMode,
                axialQ,
                rewParityModalMagnitudeScale,
                modalGainScalar,
                enableReflections: false,
                disableLateField: true,
                propagationPhaseScale: 0,
                pureDeterministicModalSum: true,
                disableModalPropagationPhase: true,
                modalStorageMode,
              }}
            />
          </div>
        </details>
      )}

      {/* ── 6. Refined Engine Shootout (collapsed, on demand) ── */}
      {seat && sub && (
        <details style={{ border: '1px solid #CBD5E1', borderRadius: 6, background: '#f8fafc', padding: '6px 10px', marginBottom: 6 }}>
          <summary style={{ fontWeight: 700, color: '#334155', fontSize: 10, cursor: 'pointer' }}>
            Refined Engine Shootout (final 3-way comparison)
          </summary>
          <div style={{ marginTop: 8 }}>
            <RewRefinedEngineShootout
              roomDims={roomDims}
              seat={seat}
              sub={sub}
              surfaceAbsorption={surfaceAbsorption}
              activeSettings={{ axialQ }}
              onPromoteRefined={onPromoteRefined}
            />
          </div>
        </details>
      )}
    </div>
  );
}