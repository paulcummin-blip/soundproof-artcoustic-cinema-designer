// ModalPhysicsInputAudit.jsx
// Temporary diagnostic panel — Bass Response page.
// STRICT AUDIT: read-only. No production graph/Q/damping/weighting/summation/SPL/project changes.
// Tests upstream physics-input causes (source/receiver coupling sampling, excitation
// normalisation, mode-order/density filtering, and small position perturbations) for why the
// tracked (0,2,0) ~57.17 Hz axial mode dominates the 30–50 Hz recovery vs REW.

import React, { useState, useCallback } from 'react';
import { fmt, CHECK_FREQS, RANK_FREQS, runModalPhysicsInputAudit, buildOutputTable, rankCandidates } from '@/components/room/bass/modalPhysicsInputAuditEngine';

function buildSeatLabels(seatingPositions) {
  const ordered = [...(seatingPositions || [])].sort((a, b) => {
    const ra = Number(a?.row || a?.rowNumber) || 1, rb = Number(b?.row || b?.rowNumber) || 1;
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

const thS = { textAlign: 'right', padding: '3px 6px', fontSize: 9, fontWeight: 700, background: '#ecfeff', borderBottom: '2px solid #67e8f9', color: '#155e75', whiteSpace: 'nowrap' };
const tdS = { textAlign: 'right', padding: '2px 6px', fontSize: 9, fontFamily: 'monospace' };
const sectionBox = { border: '1px solid #67e8f9', borderRadius: 6, background: '#fff', padding: '8px 10px', marginBottom: 10 };
const sectionTitle = { fontWeight: 700, color: '#155e75', fontSize: 11, fontFamily: 'monospace', marginBottom: 6 };

export default function ModalPhysicsInputAudit({ roomDims, seatingPositions, subsForSimulation, surfaceAbsorption }) {
  const seatLabels = buildSeatLabels(seatingPositions);
  const defaultSeatId = seatLabels.find((s) => s.label === 'R1S2')?.id || seatLabels[0]?.id || null;

  const [selectedSeatId, setSelectedSeatId] = useState(defaultSeatId);
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState(null);

  const effectiveSeatId = selectedSeatId || defaultSeatId;
  const canRun = !!(roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM && effectiveSeatId && Array.isArray(subsForSimulation) && subsForSimulation.length > 0);

  const runAudit = useCallback(() => {
    if (!canRun) return;
    setRunning(true);
    const seatEntry = seatLabels.find((s) => s.id === effectiveSeatId);
    const seat = seatEntry?.seat;
    const seatZ = Number.isFinite(Number(seat?.z)) ? Number(seat.z) : 1.2;
    const seatPos = { x: Number(seat.x), y: Number(seat.y), z: seatZ };
    const rd = { widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM };

    const result = runModalPhysicsInputAudit(20, 60, 1, rd, seatPos, subsForSimulation, surfaceAbsorption);
    const table = buildOutputTable(result);
    const ranking = rankCandidates(table);
    setOutput({ table, ranking });
    setRunning(false);
  }, [canRun, effectiveSeatId, roomDims, seatLabels, subsForSimulation, surfaceAbsorption]);

  return (
    <div style={{ border: '2px solid #0891b2', borderRadius: 8, background: '#ecfeff', padding: '10px 12px', marginTop: 8, marginBottom: 8 }}>
      <div style={{ fontWeight: 700, color: '#155e75', fontSize: 12, fontFamily: 'monospace', marginBottom: 4 }}>
        Modal Physics Input Audit
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
          strict audit · temporary diagnostic · tracked mode (0,2,0) ~57.17 Hz axial · read-only · no Q/damping/weighting/SPL/project changes
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'monospace', color: '#155e75' }}>
          Seat:
          <select value={effectiveSeatId || ''} onChange={(e) => setSelectedSeatId(e.target.value)}
            style={{ height: 24, border: '1px solid #67e8f9', borderRadius: 4, padding: '0 6px', fontSize: 10, fontFamily: 'monospace' }}>
            {seatLabels.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <span style={{ fontSize: 9, color: '#6b7280', fontFamily: 'monospace' }}>20–60 Hz · 1 Hz step</span>
        <button onClick={runAudit} disabled={running || !canRun}
          style={{ height: 26, padding: '0 12px', borderRadius: 6, border: '1px solid #155e75', background: running ? '#e5e7eb' : '#155e75', color: running ? '#6b7280' : '#fff', fontSize: 10, fontFamily: 'monospace', cursor: running || !canRun ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
          {running ? 'Running… (may take a few seconds)' : 'Run Audit'}
        </button>
        {!canRun && <span style={{ fontSize: 9, color: '#b45309', fontFamily: 'monospace' }}>⚠ Need room dims, seat, and ≥1 sub.</span>}
      </div>

      {output && (
        <>
          <div style={sectionBox}>
            <div style={sectionTitle}>Output Table — SPL Delta vs Production Baseline (dB) + Shape Metrics</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 1500 }}>
                <thead>
                  <tr>
                    <th style={{ ...thS, textAlign: 'left' }}>Variant</th>
                    {CHECK_FREQS.map((hz) => <th key={hz} style={thS}>{hz} Hz Δ</th>)}
                    <th style={thS}>Null Ctr Hz</th><th style={thS}>Null Depth dB</th>
                    <th style={thS}>30→40 Slope</th><th style={thS}>30→50 Slope</th>
                    <th style={thS}>57Hz Pk</th><th style={thS}>58Hz Pk</th>
                    <th style={thS}>30–40 Avg</th><th style={thS}>35–45 Avg</th>
                  </tr>
                </thead>
                <tbody>
                  {output.table.map((row) => (
                    <tr key={row.id} style={{ borderBottom: '1px solid #cffafe', background: row.id === 'A_baseline' ? '#f0fdfa' : undefined }}>
                      <td style={{ ...tdS, textAlign: 'left', fontWeight: row.id === 'A_baseline' ? 700 : 400 }}>{row.label}</td>
                      {CHECK_FREQS.map((hz) => <td key={hz} style={tdS}>{fmt(row.deltas[hz], 2)}</td>)}
                      <td style={tdS}>{fmt(row.summary.nullCentreHz, 1)}</td>
                      <td style={tdS}>{fmt(row.summary.nullDepthDb, 2)}</td>
                      <td style={tdS}>{fmt(row.summary.slope3040, 2)}</td>
                      <td style={tdS}>{fmt(row.summary.slope3050, 2)}</td>
                      <td style={tdS}>{fmt(row.summary.peak57, 2)}</td>
                      <td style={tdS}>{fmt(row.summary.peak58, 2)}</td>
                      <td style={tdS}>{fmt(row.summary.avg3040, 2)}</td>
                      <td style={tdS}>{fmt(row.summary.avg3545, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={sectionBox}>
            <div style={sectionTitle}>Automatic Ranking</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 1000 }}>
                <thead>
                  <tr>
                    <th style={{ ...thS, textAlign: 'left' }}>Variant</th>
                    {RANK_FREQS.map((hz) => <th key={hz} style={thS}>{hz} Hz Δ</th>)}
                    <th style={thS}>Pass/Fail</th><th style={{ ...thS, textAlign: 'left' }}>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {output.ranking.candidates.map((c) => (
                    <tr key={c.id} style={{ background: output.ranking.best?.id === c.id ? '#a5f3fc' : undefined }}>
                      <td style={{ ...tdS, textAlign: 'left', fontWeight: 700 }}>{c.label}{output.ranking.best?.id === c.id ? ' ★ BEST' : ''}</td>
                      {RANK_FREQS.map((hz) => <td key={hz} style={tdS}>{fmt(c.deltas[hz], 2)}</td>)}
                      <td style={{ ...tdS, fontWeight: 700, color: c.pass ? '#166534' : '#b91c1c' }}>{c.pass ? 'PASS' : 'FAIL'}</td>
                      <td style={{ ...tdS, textAlign: 'left' }}>
                        {!c.reasons.constraint30 && '30Hz>1dB moved. '}
                        {!c.reasons.constraint3540 && '35–40Hz reduction <2dB. '}
                        {!c.reasons.constraint50 && '50Hz>2dB moved. '}
                        {(!c.reasons.constraint57 || !c.reasons.constraint58) && '57/58Hz>2dB moved. '}
                        {!c.reasons.noNewNotch && 'New artificial notch. '}
                        {c.pass && `Widens 35–40Hz by ${fmt(c.reduction3540, 2)}dB within all constraints.`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ border: '2px solid #155e75', borderRadius: 6, background: '#a5f3fc', padding: '10px 12px', fontSize: 11, fontFamily: 'monospace', color: '#083344' }}>
            {output.ranking.best ? (
              <>
                <div style={{ fontWeight: 700 }}>BEST PHYSICS-INPUT CANDIDATE:</div>
                <div>Name: {output.ranking.best.label}</div>
                <div>Pass/fail: PASS</div>
                <div>Why: Reduces 35–40 Hz recovery by {fmt(output.ranking.best.reduction3540, 2)} dB while keeping 30 Hz (Δ{fmt(output.ranking.best.deltas[30], 2)}dB), 50 Hz (Δ{fmt(output.ranking.best.deltas[50], 2)}dB), and 57/58 Hz (Δ{fmt(output.ranking.best.deltas[57], 2)}/{fmt(output.ranking.best.deltas[58], 2)}dB) within tolerance, with no new notch.</div>
                <div>Likely mechanism: {output.ranking.best.label.replace(/^[A-Z]\.\s*/, '')}</div>
                <div>Confidence: Moderate — single-pass diagnostic estimate, not cross-validated against measured REW data.</div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 700 }}>ALL PHYSICS-INPUT VARIANTS FAILED.</div>
                <div>Most likely remaining cause: the 30–50 Hz recovery is governed by the resonant transfer-function shape and/or modal phase relationships rather than coupling sampling, excitation normalisation, mode filtering, or small geometric placement.</div>
                <div>Next audit target: transfer-function shape / phase-domain investigation (see REW Transfer Function Parity Audit).</div>
              </>
            )}
            <div style={{ marginTop: 6, fontWeight: 700 }}>No fixes. Not applied to production. Measurements only.</div>
          </div>
        </>
      )}
    </div>
  );
}