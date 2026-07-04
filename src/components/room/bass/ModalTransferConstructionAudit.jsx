// ModalTransferConstructionAudit.jsx
// Temporary diagnostic panel — Bass Response page.
// STRICT AUDIT: read-only. No physics/graph/production behaviour changes.
// Traces the complete construction of legacyModalTransferLocal's dominant modal vector
// at 30 Hz, verifies single application of every named term, and answers the 5
// critical questions about whether the modal vector is complete/correct before injection.

import React, { useState, useCallback } from 'react';
import { runModalTransferConstructionAudit, fmt } from '@/components/room/bass/modalTransferConstructionAuditEngine';

function buildSeatLabels(seatingPositions) {
  const ordered = [...(seatingPositions || [])].sort((a, b) => {
    const ra = Number(a?.row || a?.rowNumber) || 1;
    const rb = Number(b?.row || b?.rowNumber) || 1;
    if (ra !== rb) return ra - rb;
    return (Number(a?.x) || 0) - (Number(b?.x) || 0);
  });
  return ordered.map((seat) => {
    const sid = seat.id || `${seat.x}-${seat.y}`;
    const rowNum = Number(seat?.row || seat?.rowNumber) || 1;
    const rowSeats = ordered.filter((s) => (Number(s?.row || s?.rowNumber) || 1) === rowNum);
    const posInRow = rowSeats.findIndex((s) => (s.id || `${s.x}-${s.y}`) === sid) + 1;
    return { id: sid, label: `R${rowNum}S${posInRow}`, seat };
  });
}

const thS = { textAlign: 'left', padding: '4px 6px', fontSize: 10, fontWeight: 700, background: '#f5f3ff', borderBottom: '2px solid #c4b5fd', color: '#5b21b6', whiteSpace: 'nowrap' };
const tdS = { textAlign: 'left', padding: '3px 6px', fontSize: 10, fontFamily: 'monospace', verticalAlign: 'top' };
const sectionBox = { border: '1px solid #c4b5fd', borderRadius: 6, background: '#fff', padding: '8px 10px', marginBottom: 10 };
const sectionTitle = { fontWeight: 700, color: '#5b21b6', fontSize: 11, fontFamily: 'monospace', marginBottom: 6 };

function YesNo({ value }) {
  return <span style={{ fontWeight: 700, color: value ? '#166534' : '#b91c1c' }}>{value ? 'YES' : 'NO'}</span>;
}

export default function ModalTransferConstructionAudit({ roomDims, seatingPositions, subsForSimulation, surfaceAbsorption }) {
  const seatLabels = buildSeatLabels(seatingPositions);
  const [selectedSeatId, setSelectedSeatId] = useState(seatLabels.find((s) => s.label === 'R1S2')?.id || seatLabels[0]?.id || null);
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);

  const effectiveSeatId = selectedSeatId || seatLabels[0]?.id || null;
  const canRun = !!(
    roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM &&
    effectiveSeatId && Array.isArray(subsForSimulation) && subsForSimulation.length > 0
  );

  const runAudit = useCallback(() => {
    if (!canRun) return;
    setRunning(true);
    const seatEntry = seatLabels.find((s) => s.id === effectiveSeatId);
    const seat = seatEntry?.seat;
    const seatZ = Number.isFinite(Number(seat?.z)) ? Number(seat.z) : 1.2;
    const seatPos = { x: Number(seat.x), y: Number(seat.y), z: seatZ };
    const rd = { widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM };

    const audit = runModalTransferConstructionAudit(rd, seatPos, subsForSimulation, surfaceAbsorption);
    setResult(audit);
    setRunning(false);
  }, [canRun, effectiveSeatId, roomDims, seatLabels, subsForSimulation, surfaceAbsorption]);

  return (
    <div style={{ border: '2px solid #7c3aed', borderRadius: 8, background: '#f5f3ff', padding: '10px 12px', marginTop: 8, marginBottom: 8 }}>
      <div style={{ fontWeight: 700, color: '#5b21b6', fontSize: 12, fontFamily: 'monospace', marginBottom: 4 }}>
        Modal Transfer Construction Audit
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
          strict audit · temporary diagnostic · read-only · fixed at 30 Hz · no physics/graph changes
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'monospace', color: '#5b21b6' }}>
          Seat:
          <select value={effectiveSeatId || ''} onChange={(e) => setSelectedSeatId(e.target.value)}
            style={{ height: 24, border: '1px solid #c4b5fd', borderRadius: 4, padding: '0 6px', fontSize: 10, fontFamily: 'monospace' }}>
            {seatLabels.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <button onClick={runAudit} disabled={running || !canRun}
          style={{ height: 26, padding: '0 12px', borderRadius: 6, border: '1px solid #5b21b6', background: running ? '#e5e7eb' : '#5b21b6', color: running ? '#6b7280' : '#fff', fontSize: 10, fontFamily: 'monospace', cursor: running || !canRun ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
          {running ? 'Running…' : 'Run Audit'}
        </button>
        {!canRun && <span style={{ fontSize: 9, color: '#b45309', fontFamily: 'monospace' }}>⚠ Need room dims, seat, and ≥1 sub.</span>}
      </div>

      {result && !result.canRun && (
        <div style={{ fontSize: 11, color: '#b91c1c', fontFamily: 'monospace' }}>{result.reason}</div>
      )}

      {result && result.canRun && (
        <>
          <div style={sectionBox}>
            <div style={sectionTitle}>Dominant Mode at 30 Hz</div>
            <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#5b21b6' }}>
              Mode ({result.dominant.nx},{result.dominant.ny},{result.dominant.nz}) — {result.dominant.modeType}, order {result.dominant.modeOrder}, native f0 = {fmt(result.dominant.modeFrequencyHz, 2)} Hz
            </div>
            <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#6b7280', marginTop: 4 }}>
              Live engine options used (identical to BassResponse.jsx production graph): pureDeterministicModalSum={String(result.options.pureDeterministicModalSum)}, disableModalPropagationPhase={String(result.options.disableModalPropagationPhase)}, propagationPhaseScale={result.options.propagationPhaseScale}, modalSourceReferenceMode="{result.options.modalSourceReferenceMode}", modalStorageMode="{result.options.modalStorageMode}", debugModalPhaseConvention="{result.options.debugModalPhaseConvention}", rewParityModalMagnitudeScale={result.options.rewParityModalMagnitudeScale}
            </div>
          </div>

          <div style={sectionBox}>
            <div style={sectionTitle}>Construction Trace — Stage by Stage (Input → Output → Delta)</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 900 }}>
                <thead>
                  <tr>
                    <th style={thS}>Stage</th><th style={thS}>Input</th><th style={thS}>Output</th><th style={thS}>Δ from previous</th>
                  </tr>
                </thead>
                <tbody>
                  {result.stages.map((s, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #ede9fe' }}>
                      <td style={{ ...tdS, fontWeight: 700 }}>{s.name}</td>
                      <td style={tdS}>{s.input}</td>
                      <td style={tdS}>{typeof s.output === 'number' ? fmt(s.output) : s.output}</td>
                      <td style={tdS}>{s.delta === null ? '—' : (typeof s.delta === 'number' ? fmt(s.delta) : s.delta)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={sectionBox}>
            <div style={sectionTitle}>Single-Application Verification</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 700 }}>
                <thead>
                  <tr><th style={thS}>Term</th><th style={thS}>Applications Found</th><th style={thS}>Note</th></tr>
                </thead>
                <tbody>
                  {result.singleApplicationChecklist.map((c, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #ede9fe' }}>
                      <td style={{ ...tdS, fontWeight: 700 }}>{c.term}</td>
                      <td style={{ ...tdS, fontWeight: 700, color: c.applications === 1 ? '#166534' : '#b91c1c' }}>{c.applications}</td>
                      <td style={tdS}>{c.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={sectionBox}>
            <div style={sectionTitle}>Engine vs Reconstructed Final Modal Vector (this mode only)</div>
            <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#5b21b6', lineHeight: 1.7 }}>
              <div>Engine-reported: re={fmt(result.engineRe)} im={fmt(result.engineIm)} mag={fmt(result.engineMag)} phase={fmt(result.enginePhaseDeg, 2)}°</div>
              <div>Reconstructed: re={fmt(result.finalModalRe)} im={fmt(result.finalModalIm)} mag={fmt(result.reconMag)} phase={fmt(result.finalPhaseDeg, 2)}°</div>
              <div>Governing-equation expected: re={fmt(result.expectedRe)} im={fmt(result.expectedIm)}</div>
              <div>Divergence vs governing equation: Δre={fmt(result.divergenceRe)} Δim={fmt(result.divergenceIm)}</div>
            </div>
          </div>

          <div style={{ border: '2px solid #5b21b6', borderRadius: 6, background: '#ede9fe', padding: '10px 12px', fontSize: 11, fontFamily: 'monospace', color: '#4c1d95' }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Critical Questions</div>
            <div>1. Is the modal vector already complete before it returns from legacyModalTransferLocal(...)? <YesNo value={result.answers.completeBeforeReturn} /></div>
            <div>2. Is any phase term applied again after the function returns? <YesNo value={result.answers.phaseAppliedAfterReturn} /></div>
            <div>3. Is any gain term applied again after the function returns? <YesNo value={result.answers.gainAppliedAfterReturn} /></div>
            <div>4. Is the returned modal vector mathematically identical to the vector expected from the governing equations? <YesNo value={result.answers.identicalToGoverningEquation} /></div>
            {!result.answers.identicalToGoverningEquation && (
              <div style={{ marginTop: 6 }}>
                First stage of divergence: <strong>{result.answers.firstDivergenceStage || 'unresolved'}</strong>
              </div>
            )}
            <div style={{ marginTop: 10, fontWeight: 700 }}>
              {result.answers.identicalToGoverningEquation
                ? 'PASS — the modal vector is mathematically complete and correct before injection. The narrow branch of legacyModalTransferLocal is not the root cause; the remaining unknown is the architecture of summing a complete modal field with a complete reflection field below Schroeder.'
                : 'FAIL — construction stage identified above diverges from the governing equations before injection.'}
            </div>
          </div>
        </>
      )}
    </div>
  );
}