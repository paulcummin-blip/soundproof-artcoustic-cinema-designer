// MultiModeInteractionAudit.jsx
// Temporary diagnostic panel — Bass Response page.
// STRICT AUDIT: read-only. No production graph/Q/damping/coupling/weighting/SPL/project changes.
// Tests whether the fast 30–50 Hz recovery is caused by coherent interaction between multiple
// modes, rather than any single mode/transfer-function/Q/damping/coupling/projection term.

import React, { useState, useCallback, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';
import {
  fmt, runContributionSweep, buildCumulativeSeries, buildPairwiseMatrix, buildRemovalSensitivity,
  buildAdditionOrderAudit, buildOwnershipTimeline, findOwnershipChanges, buildRecoveryAccelerationAudit, buildRanking,
} from '@/components/room/bass/multiModeInteractionAuditEngine';

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

const CHECK_FREQS = [29.5, 30, 32, 35, 40, 40.6, 45, 50, 57, 58];
const thS = { textAlign: 'right', padding: '3px 5px', fontSize: 9, fontWeight: 700, background: '#eff6ff', borderBottom: '2px solid #93c5fd', color: '#1e3a8a', whiteSpace: 'nowrap' };
const tdS = { textAlign: 'right', padding: '2px 5px', fontSize: 9, fontFamily: 'monospace' };
const sectionBox = { border: '1px solid #93c5fd', borderRadius: 6, background: '#fff', padding: '8px 10px', marginBottom: 10 };
const sectionTitle = { fontWeight: 700, color: '#1e3a8a', fontSize: 11, fontFamily: 'monospace', marginBottom: 6 };

export default function MultiModeInteractionAudit({ roomDims, seatingPositions, subsForSimulation, surfaceAbsorption }) {
  const seatLabels = buildSeatLabels(seatingPositions);
  const defaultSeatId = seatLabels.find((s) => s.label === 'R1S2')?.id || seatLabels[0]?.id || null;
  const [selectedSeatId, setSelectedSeatId] = useState(defaultSeatId);
  const [inspectFreq, setInspectFreq] = useState(30);
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);

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

    const rows = runContributionSweep(20, 60, 1, rd, seatPos, subsForSimulation, surfaceAbsorption);
    const removalSensitivity = buildRemovalSensitivity(rows);
    const ownershipTimeline = buildOwnershipTimeline(rows);
    const ownershipChanges = findOwnershipChanges(ownershipTimeline);
    const recoveryAudit = buildRecoveryAccelerationAudit(rows, ownershipTimeline);
    const ranking = buildRanking(rows, removalSensitivity, ownershipTimeline);
    setResult({ rows, removalSensitivity, ownershipTimeline, ownershipChanges, recoveryAudit, ranking });
    setRunning(false);
  }, [canRun, effectiveSeatId, roomDims, seatLabels, subsForSimulation, surfaceAbsorption]);

  const inspectRow = useMemo(() => (result ? result.rows.reduce((best, r) => (Math.abs(r.frequencyHz - inspectFreq) < Math.abs(best.frequencyHz - inspectFreq) ? r : best), result.rows[0]) : null), [result, inspectFreq]);
  const cumulativeSteps = useMemo(() => (inspectRow ? buildCumulativeSeries(inspectRow) : []), [inspectRow]);
  const pairwise = useMemo(() => (inspectRow ? buildPairwiseMatrix(inspectRow) : null), [inspectRow]);
  const additionOrder = useMemo(() => (inspectRow ? buildAdditionOrderAudit(inspectRow) : null), [inspectRow]);

  const finalSplChart = useMemo(() => (result ? result.rows.map((r) => ({ hz: r.frequencyHz, db: r.finalDb, domMag: r.contributors[0]?.magnitude || 0, secMag: r.contributors[1]?.magnitude || 0, phaseSpread: r.contributors.length ? Math.max(...r.contributors.map((c) => c.phase)) - Math.min(...r.contributors.map((c) => c.phase)) : 0 })) : []), [result]);
  const cancellationChart = useMemo(() => (result ? result.rows.map((r) => { const pw = buildPairwiseMatrix(r); return { hz: r.frequencyHz, strongestDestructive: pw.strongestDestructive?.pairCancellationEnergy || 0, strongestConstructive: pw.strongestConstructive ? -pw.strongestConstructive.pairCancellationEnergy : 0 }; }) : []), [result]);
  const waterfallChart = useMemo(() => cumulativeSteps.map((s, i) => ({ step: `${i + 1}:${s.modeKey}`, db: s.splDb })), [cumulativeSteps]);

  return (
    <div style={{ border: '2px solid #1d4ed8', borderRadius: 8, background: '#eff6ff', padding: '10px 12px', marginTop: 8, marginBottom: 8 }}>
      <div style={{ fontWeight: 700, color: '#1e3a8a', fontSize: 12, fontFamily: 'monospace', marginBottom: 4 }}>
        Multi-Mode Interaction Audit
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
          strict audit · temporary diagnostic · read-only · no production changes
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'monospace', color: '#1e3a8a' }}>
          Seat:
          <select value={effectiveSeatId || ''} onChange={(e) => setSelectedSeatId(e.target.value)}
            style={{ height: 24, border: '1px solid #93c5fd', borderRadius: 4, padding: '0 6px', fontSize: 10, fontFamily: 'monospace' }}>
            {seatLabels.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <span style={{ fontSize: 9, color: '#6b7280', fontFamily: 'monospace' }}>20–60 Hz · 1 Hz step</span>
        <button onClick={runAudit} disabled={running || !canRun}
          style={{ height: 26, padding: '0 12px', borderRadius: 6, border: '1px solid #1d4ed8', background: running ? '#e5e7eb' : '#1d4ed8', color: running ? '#6b7280' : '#fff', fontSize: 10, fontFamily: 'monospace', cursor: running || !canRun ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
          {running ? 'Running…' : 'Run Audit'}
        </button>
        {result && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'monospace', color: '#1e3a8a' }}>
            Inspect Hz:
            <input type="number" value={inspectFreq} onChange={(e) => setInspectFreq(Number(e.target.value))}
              style={{ width: 60, height: 24, border: '1px solid #93c5fd', borderRadius: 4, padding: '0 6px', fontSize: 10, fontFamily: 'monospace' }} />
          </label>
        )}
        {!canRun && <span style={{ fontSize: 9, color: '#b45309', fontFamily: 'monospace' }}>⚠ Need room dims, seat, and ≥1 sub.</span>}
      </div>

      {result && inspectRow && (
        <>
          <div style={sectionBox}>
            <div style={sectionTitle}>1. Full Modal Contribution Table @ {fmt(inspectRow.frequencyHz, 1)} Hz</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 900 }}>
                <thead><tr>
                  <th style={{ ...thS, textAlign: 'left' }}>Mode</th><th style={thS}>Family</th><th style={thS}>Native Hz</th><th style={thS}>Q</th>
                  <th style={thS}>Re</th><th style={thS}>Im</th><th style={thS}>Mag</th><th style={thS}>Phase°</th>
                  <th style={thS}>Projection</th><th style={thS}>% Contrib</th><th style={thS}>Flag</th>
                </tr></thead>
                <tbody>
                  {inspectRow.contributors.map((c) => (
                    <tr key={c.key}>
                      <td style={{ ...tdS, textAlign: 'left', fontWeight: 700 }}>({c.nx},{c.ny},{c.nz})</td>
                      <td style={tdS}>{c.family}</td>
                      <td style={tdS}>{fmt(c.modeFrequencyHz, 2)}</td>
                      <td style={tdS}>{fmt(c.qValue, 2)}</td>
                      <td style={tdS}>{fmt(c.re, 4)}</td>
                      <td style={tdS}>{fmt(c.im, 4)}</td>
                      <td style={tdS}>{fmt(c.magnitude, 4)}</td>
                      <td style={tdS}>{fmt(c.phase, 1)}</td>
                      <td style={tdS}>{fmt(c.projection, 4)}</td>
                      <td style={tdS}>{fmt(c.pctContribution, 1)}%</td>
                      <td style={{ ...tdS, color: c.flag === 'constructive' ? '#166534' : '#b91c1c', fontWeight: 700 }}>{c.flag}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={sectionBox}>
            <div style={sectionTitle}>2. Cumulative Vector Build @ {fmt(inspectRow.frequencyHz, 1)} Hz (production order)</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 700 }}>
                <thead><tr>
                  <th style={{ ...thS, textAlign: 'left' }}>Mode Added</th><th style={thS}>Run Re</th><th style={thS}>Run Im</th>
                  <th style={thS}>Run Mag</th><th style={thS}>Run Phase°</th><th style={thS}>SPL dB</th><th style={thS}>Δ From Prev</th>
                </tr></thead>
                <tbody>
                  {cumulativeSteps.map((s, i) => (
                    <tr key={i}>
                      <td style={{ ...tdS, textAlign: 'left', fontWeight: 700 }}>({s.modeKey}) {s.family}</td>
                      <td style={tdS}>{fmt(s.runningRe, 4)}</td><td style={tdS}>{fmt(s.runningIm, 4)}</td>
                      <td style={tdS}>{fmt(s.runningMagnitude, 4)}</td><td style={tdS}>{fmt(s.runningPhase, 1)}</td>
                      <td style={tdS}>{fmt(s.splDb, 2)}</td><td style={tdS}>{fmt(s.splDeltaFromPrev, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={sectionBox}>
            <div style={sectionTitle}>3. Pairwise Cancellation Matrix @ {fmt(inspectRow.frequencyHz, 1)} Hz</div>
            <div style={{ fontSize: 10, fontFamily: 'monospace', marginBottom: 4 }}>
              Strongest destructive pair: <b style={{ color: '#b91c1c' }}>{pairwise?.strongestDestructive ? `(${pairwise.strongestDestructive.keyA}) ↔ (${pairwise.strongestDestructive.keyB})` : '—'}</b>
              {'  '}| Strongest constructive pair: <b style={{ color: '#166534' }}>{pairwise?.strongestConstructive ? `(${pairwise.strongestConstructive.keyA}) ↔ (${pairwise.strongestConstructive.keyB})` : '—'}</b>
            </div>
            <div style={{ overflowX: 'auto', maxHeight: 220, overflowY: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 700 }}>
                <thead><tr>
                  <th style={{ ...thS, textAlign: 'left' }}>Pair</th><th style={thS}>Phase Δ°</th><th style={thS}>Cosine Sim</th>
                  <th style={thS}>Destructive %</th><th style={thS}>Constructive %</th><th style={thS}>Cancellation Energy</th>
                </tr></thead>
                <tbody>
                  {(pairwise?.pairs || []).map((p, i) => (
                    <tr key={i}>
                      <td style={{ ...tdS, textAlign: 'left' }}>({p.keyA}) ↔ ({p.keyB})</td>
                      <td style={tdS}>{fmt(p.phaseDiffDeg, 1)}</td><td style={tdS}>{fmt(p.cosineSimilarity, 3)}</td>
                      <td style={tdS}>{fmt(p.destructivePct, 1)}</td><td style={tdS}>{fmt(p.constructivePct, 1)}</td>
                      <td style={tdS}>{fmt(p.pairCancellationEnergy, 5)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={sectionBox}>
            <div style={sectionTitle}>4. Removal Sensitivity — Δ dB at Check Frequencies (removing each significant mode)</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 900 }}>
                <thead><tr>
                  <th style={{ ...thS, textAlign: 'left' }}>Mode</th>
                  {CHECK_FREQS.map((hz) => <th key={hz} style={thS}>{hz} Hz</th>)}
                </tr></thead>
                <tbody>
                  {result.removalSensitivity.map((r) => (
                    <tr key={r.key}>
                      <td style={{ ...tdS, textAlign: 'left', fontWeight: 700 }}>({r.key})</td>
                      {CHECK_FREQS.map((hz) => <td key={hz} style={tdS}>{fmt(r.deltas[hz], 2)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={sectionBox}>
            <div style={sectionTitle}>5. Addition Order Audit @ {fmt(inspectRow.frequencyHz, 1)} Hz</div>
            <div style={{ fontWeight: 700, fontSize: 10, fontFamily: 'monospace', color: additionOrder?.allMatch ? '#166534' : '#b91c1c', marginBottom: 4 }}>
              {additionOrder?.allMatch ? 'PASS — final magnitude numerically identical regardless of addition order.' : '⚠ FAIL — order-dependent result detected (possible algorithmic bug).'}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 500 }}>
                <thead><tr><th style={{ ...thS, textAlign: 'left' }}>Order</th><th style={thS}>Re</th><th style={thS}>Im</th><th style={thS}>Magnitude</th></tr></thead>
                <tbody>
                  {(additionOrder?.results || []).map((r) => (
                    <tr key={r.label}>
                      <td style={{ ...tdS, textAlign: 'left' }}>{r.label}</td>
                      <td style={tdS}>{fmt(r.re, 5)}</td><td style={tdS}>{fmt(r.im, 5)}</td><td style={tdS}>{fmt(r.magnitude, 5)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={sectionBox}>
            <div style={sectionTitle}>6. Modal Ownership Timeline (20–60 Hz)</div>
            <div style={{ fontSize: 10, fontFamily: 'monospace', marginBottom: 4 }}>
              Ownership changes: {result.ownershipChanges.length === 0 ? 'none' : result.ownershipChanges.map((c, i) => <span key={i}>{fmt(c.frequencyHz, 1)}Hz: ({c.from})→({c.to}){i < result.ownershipChanges.length - 1 ? ', ' : ''}</span>)}
            </div>
            <div style={{ overflowX: 'auto', maxHeight: 220, overflowY: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 900 }}>
                <thead><tr>
                  <th style={thS}>Hz</th><th style={{ ...thS, textAlign: 'left' }}>Dominant</th><th style={{ ...thS, textAlign: 'left' }}>2nd</th>
                  <th style={{ ...thS, textAlign: 'left' }}>Most Destructive</th><th style={{ ...thS, textAlign: 'left' }}>Most Constructive</th>
                  <th style={{ ...thS, textAlign: 'left' }}>Destructive Pair</th><th style={{ ...thS, textAlign: 'left' }}>Constructive Pair</th>
                </tr></thead>
                <tbody>
                  {result.ownershipTimeline.map((t) => (
                    <tr key={t.frequencyHz}>
                      <td style={{ ...tdS, fontWeight: 700 }}>{fmt(t.frequencyHz, 1)}</td>
                      <td style={{ ...tdS, textAlign: 'left' }}>({t.dominant})</td>
                      <td style={{ ...tdS, textAlign: 'left' }}>({t.second})</td>
                      <td style={{ ...tdS, textAlign: 'left' }}>({t.mostDestructive})</td>
                      <td style={{ ...tdS, textAlign: 'left' }}>({t.mostConstructive})</td>
                      <td style={{ ...tdS, textAlign: 'left', fontSize: 8 }}>{t.strongestDestructivePair}</td>
                      <td style={{ ...tdS, textAlign: 'left', fontSize: 8 }}>{t.strongestConstructivePair}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={sectionBox}>
            <div style={sectionTitle}>7. Recovery Acceleration Audit (null @ {fmt(result.recoveryAudit.nullFreq, 1)} Hz)</div>
            {result.recoveryAudit.events.length === 0 ? (
              <div style={{ fontSize: 10, fontFamily: 'monospace' }}>No qualifying acceleration events detected in the 12 Hz window after the null.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 400 }}>
                  <thead><tr><th style={thS}>Hz</th><th style={{ ...thS, textAlign: 'left' }}>Event</th></tr></thead>
                  <tbody>
                    {result.recoveryAudit.events.map((e, i) => (
                      <tr key={i}><td style={tdS}>{fmt(e.frequencyHz, 1)}</td><td style={{ ...tdS, textAlign: 'left' }}>{e.event}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div style={sectionBox}>
            <div style={sectionTitle}>8. Charts</div>
            <div style={{ fontSize: 9, fontFamily: 'monospace', marginBottom: 2 }}>Final SPL vs Frequency</div>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={finalSplChart}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="hz" tick={{ fontSize: 9 }} /><YAxis tick={{ fontSize: 9 }} /><Tooltip wrapperStyle={{ fontSize: 10 }} /><Line type="monotone" dataKey="db" stroke="#1d4ed8" dot={false} strokeWidth={2} /></LineChart>
            </ResponsiveContainer>
            <div style={{ fontSize: 9, fontFamily: 'monospace', margin: '6px 0 2px' }}>Cumulative SPL Waterfall @ {fmt(inspectRow.frequencyHz, 1)} Hz</div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={waterfallChart}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="step" tick={{ fontSize: 7 }} interval={0} angle={-45} textAnchor="end" height={60} /><YAxis tick={{ fontSize: 9 }} /><Tooltip wrapperStyle={{ fontSize: 10 }} /><Bar dataKey="db" fill="#2563eb" /></BarChart>
            </ResponsiveContainer>
            <div style={{ fontSize: 9, fontFamily: 'monospace', margin: '6px 0 2px' }}>Strongest Pair Cancellation / Constructive Energy vs Frequency</div>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={cancellationChart}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="hz" tick={{ fontSize: 9 }} /><YAxis tick={{ fontSize: 9 }} /><Tooltip wrapperStyle={{ fontSize: 10 }} /><Legend wrapperStyle={{ fontSize: 9 }} /><Line type="monotone" dataKey="strongestDestructive" name="Destructive energy" stroke="#b91c1c" dot={false} /><Line type="monotone" dataKey="strongestConstructive" name="Constructive energy" stroke="#166534" dot={false} /></LineChart>
            </ResponsiveContainer>
            <div style={{ fontSize: 9, fontFamily: 'monospace', margin: '6px 0 2px' }}>Dominant / Second Mode Magnitude &amp; Phase Spread vs Frequency</div>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={finalSplChart}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="hz" tick={{ fontSize: 9 }} /><YAxis tick={{ fontSize: 9 }} /><Tooltip wrapperStyle={{ fontSize: 10 }} /><Legend wrapperStyle={{ fontSize: 9 }} /><Line type="monotone" dataKey="domMag" name="Dominant mag" stroke="#111827" dot={false} /><Line type="monotone" dataKey="secMag" name="2nd mag" stroke="#ea580c" dot={false} /><Line type="monotone" dataKey="phaseSpread" name="Phase spread°" stroke="#9333ea" dot={false} /></LineChart>
            </ResponsiveContainer>
          </div>

          <div style={{ border: '2px solid #1d4ed8', borderRadius: 6, background: '#dbeafe', padding: '10px 12px', fontSize: 11, fontFamily: 'monospace', color: '#1e3a8a' }}>
            {result.ranking.explains ? (
              <>
                <div style={{ fontWeight: 700 }}>MULTI-MODE INTERACTION RESULT:</div>
                <div>Primary null driver: ({result.ranking.nullDriverMode})</div>
                <div>Primary recovery driver: ({result.ranking.recoveryDriverMode})</div>
                <div>Strongest destructive pair: {result.ranking.strongestCancellationPair}</div>
                <div>Strongest constructive pair: {result.ranking.strongestRecoveryPair}</div>
                <div>First interaction to change: {result.ranking.firstInteractionChange ? result.ranking.firstInteractionChange.event : 'none detected'}</div>
                <div>Frequency: {result.ranking.firstInteractionChange ? fmt(result.ranking.firstInteractionChange.frequencyHz, 1) : '—'} Hz</div>
                <div>Confidence: Moderate — based on single-seat, single-pass diagnostic sweep.</div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 700 }}>MULTI-MODE INTERACTION DID NOT EXPLAIN THE GAP.</div>
                <div>Remaining likely cause: no single mode or mode-pair removal produced a materially large (&gt;0.5 dB) shift at the null/recovery frequencies — the fast recovery may stem from the transfer-function shape itself or from broadband summation effects outside pairwise interaction.</div>
                <div>Next audit target: Modal Equation Forensics Audit / broadband summation review.</div>
              </>
            )}
            <div style={{ marginTop: 6, fontWeight: 700 }}>No fixes. No production changes. Measurements only.</div>
          </div>
        </>
      )}
    </div>
  );
}