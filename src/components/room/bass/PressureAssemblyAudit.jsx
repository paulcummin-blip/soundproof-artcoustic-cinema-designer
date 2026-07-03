// PressureAssemblyAudit.jsx
// Temporary read-only diagnostic panel — Bass Response page.
// Purpose: determine whether the production engine assembles the final pressure field using
// the same mathematical order as REW, by testing 11 independent assembly methods (A-K) built
// from the exact production debug output (activeReal/activeImag/activeMagnitude/phase).
// No production/graph/physics/Q/damping/coupling changes — measurements only.

import React, { useState, useCallback } from 'react';
import { runPressureAssemblyAudit, METHOD_LABELS, TARGET_SPL_FREQS, VECTOR_TRACE_FREQS } from '@/components/room/bass/pressureAssemblyAuditEngine';

function fmt(v, d = 2) { return Number.isFinite(v) ? Number(v).toFixed(d) : '—'; }
function fmtSigned(v, d = 2) { return Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${v.toFixed(d)}` : '—'; }

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

const METHOD_IDS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'];
const thS = { textAlign: 'right', padding: '3px 6px', fontSize: 9, fontWeight: 700, background: '#7c2d12', color: '#ffedd5', whiteSpace: 'nowrap' };
const tdS = { textAlign: 'right', padding: '2px 6px', fontSize: 9, fontFamily: 'monospace' };
const sectionTitle = { fontSize: 11, fontWeight: 700, color: '#7c2d12', margin: '14px 0 4px', paddingTop: 8, borderTop: '1px solid #fed7aa' };

function GenericTable({ columns, rows, rowKey, minWidth }) {
  return (
    <div style={{ overflowX: 'auto', marginBottom: 8 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: minWidth || 600 }}>
        <thead><tr>{columns.map((c) => <th key={c.key} style={{ ...thS, textAlign: c.align || 'right' }}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={rowKey ? rowKey(row) : i} style={{ borderBottom: '1px solid #fed7aa' }}>
              {columns.map((c) => <td key={c.key} style={{ ...tdS, textAlign: c.align || 'right' }}>{c.render ? c.render(row, i) : row[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PressureAssemblyAudit({ roomDims, seatingPositions, subsForSimulation, surfaceAbsorption }) {
  const seatLabels = buildSeatLabels(seatingPositions);
  const r1s2Id = seatLabels.find((s) => s.label === 'R1S2')?.id || seatLabels[0]?.id || null;
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [traceFreq, setTraceFreq] = useState(VECTOR_TRACE_FREQS[1]);

  const seat = seatLabels.find((s) => s.id === r1s2Id)?.seat || null;
  const canRun = !!(roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM && seat && Array.isArray(subsForSimulation) && subsForSimulation.length > 0);

  const runAudit = useCallback(() => {
    if (!canRun) return;
    setRunning(true);
    const seatZ = Number.isFinite(Number(seat?.z)) ? Number(seat.z) : 1.2;
    const seatPos = { x: Number(seat.x), y: Number(seat.y), z: seatZ };
    const rd = { widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM };
    const audit = runPressureAssemblyAudit(rd, seatPos, subsForSimulation, surfaceAbsorption);
    setResult(audit);
    setRunning(false);
  }, [canRun, roomDims, surfaceAbsorption, seat, subsForSimulation]);

  const traceRow = result?.vectorTrace.find((v) => v.frequencyHz === traceFreq) || null;

  return (
    <div style={{ border: '2px solid #7c2d12', borderRadius: 8, background: '#fff7ed', padding: '10px 12px', marginTop: 8, marginBottom: 8 }}>
      <div style={{ fontWeight: 700, color: '#7c2d12', fontSize: 12, fontFamily: 'monospace', marginBottom: 4 }}>
        Pressure Assembly Audit
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
          temporary diagnostic · seat R1S2 · 20–80Hz @ 0.25Hz · read-only from production debug output
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#7c2d12' }}>Seat: {seatLabels.find((s) => s.id === r1s2Id)?.label || '—'}</span>
        <button onClick={runAudit} disabled={running || !canRun} style={{ height: 26, padding: '0 12px', borderRadius: 6, border: '1px solid #7c2d12', background: running ? '#e5e7eb' : '#7c2d12', color: running ? '#6b7280' : '#fff', fontSize: 10, fontFamily: 'monospace', cursor: running || !canRun ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
          {running ? 'Running…' : 'Run Audit'}
        </button>
        {!canRun && <span style={{ fontSize: 9, color: '#b45309', fontFamily: 'monospace' }}>⚠ Need room dims, seat and ≥1 sub.</span>}
      </div>

      {result && (
        <>
          {/* ── Target SPL delta table ── */}
          <div style={sectionTitle}>SPL delta vs production (A) at target frequencies</div>
          <GenericTable
            minWidth={1300}
            rowKey={(r) => r.targetHz}
            columns={[
              { key: 'targetHz', label: 'Target Hz', align: 'left' },
              ...METHOD_IDS.filter((m) => m !== 'A').map((m) => ({ key: m, label: m, render: (r) => fmtSigned(r[m], 2) })),
            ]}
            rows={result.targetTable}
          />

          {/* ── Error metrics ── */}
          <div style={sectionTitle}>Error metrics per method (dB, vs production)</div>
          <GenericTable
            rowKey={(r) => r.method}
            columns={[
              { key: 'method', label: 'Method', align: 'left', render: (r) => METHOD_LABELS[r.method] },
              { key: 'rms', label: 'RMS', render: (r) => fmt(r.rms) },
              { key: 'band3545', label: '35–45Hz', render: (r) => fmt(r.band3545) },
              { key: 'band2930', label: '29–30Hz', render: (r) => fmt(r.band2930) },
              { key: 'band50', label: '50Hz', render: (r) => fmt(r.band50) },
              { key: 'band5758', label: '57–58Hz', render: (r) => fmt(r.band5758) },
              { key: 'maxDeviation', label: 'Max deviation', render: (r) => fmt(r.maxDeviation) },
            ]}
            rows={result.errorMetrics}
          />

          {/* ── First divergence ── */}
          <div style={sectionTitle}>First divergence frequency (|method − production| exceeds threshold)</div>
          <GenericTable
            rowKey={(r) => r.method}
            columns={[
              { key: 'method', label: 'Method', align: 'left', render: (r) => METHOD_LABELS[r.method] },
              { key: 'at0_1', label: '> 0.1 dB', render: (r) => r.at0_1 !== null ? `${fmt(r.at0_1, 2)} Hz` : '—' },
              { key: 'at0_5', label: '> 0.5 dB', render: (r) => r.at0_5 !== null ? `${fmt(r.at0_5, 2)} Hz` : '—' },
              { key: 'at1_0', label: '> 1.0 dB', render: (r) => r.at1_0 !== null ? `${fmt(r.at1_0, 2)} Hz` : '—' },
            ]}
            rows={result.firstDivergence}
          />

          {/* ── Vector trace ── */}
          <div style={sectionTitle}>Vector trace — running Re/Im/magnitude after every addition</div>
          <div style={{ marginBottom: 6 }}>
            {VECTOR_TRACE_FREQS.map((hz) => (
              <button key={hz} onClick={() => setTraceFreq(hz)}
                style={{ marginRight: 6, height: 22, padding: '0 10px', borderRadius: 4, border: '1px solid #7c2d12', background: traceFreq === hz ? '#7c2d12' : '#fff', color: traceFreq === hz ? '#fff' : '#7c2d12', fontSize: 10, fontFamily: 'monospace', cursor: 'pointer' }}>
                {hz} Hz
              </button>
            ))}
          </div>
          {traceRow && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#7c2d12', margin: '6px 0 2px' }}>Production (direct seeded, then modes in engine order)</div>
              <GenericTable rowKey={(r, i) => i} columns={[
                { key: 'label', label: 'Step', align: 'left' },
                { key: 're', label: 'Running Re', render: (r) => fmt(r.re, 5) },
                { key: 'im', label: 'Running Im', render: (r) => fmt(r.im, 5) },
                { key: 'mag', label: 'Running Mag', render: (r) => fmt(r.mag, 5) },
              ]} rows={traceRow.productionSteps} />

              <div style={{ fontSize: 10, fontWeight: 700, color: '#7c2d12', margin: '6px 0 2px' }}>Complex pressure (same components/order — should match production exactly)</div>
              <GenericTable rowKey={(r, i) => i} columns={[
                { key: 'label', label: 'Step', align: 'left' },
                { key: 're', label: 'Running Re', render: (r) => fmt(r.re, 5) },
                { key: 'im', label: 'Running Im', render: (r) => fmt(r.im, 5) },
                { key: 'mag', label: 'Running Mag', render: (r) => fmt(r.mag, 5) },
              ]} rows={traceRow.complexPressureSteps} />

              <div style={{ fontSize: 10, fontWeight: 700, color: '#7c2d12', margin: '6px 0 2px' }}>Incremental accumulation (starts at zero, modes only — excludes direct per spec)</div>
              <GenericTable rowKey={(r, i) => i} columns={[
                { key: 'label', label: 'Step', align: 'left' },
                { key: 're', label: 'Running Re', render: (r) => fmt(r.re, 5) },
                { key: 'im', label: 'Running Im', render: (r) => fmt(r.im, 5) },
                { key: 'mag', label: 'Running Mag', render: (r) => fmt(r.mag, 5) },
              ]} rows={traceRow.incrementalSteps} />
            </>
          )}

          {/* ── Automatic ranking ── */}
          <div style={sectionTitle}>Automatic ranking</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#7c2d12', margin: '6px 0 2px' }}>Best match to production (lowest RMS)</div>
          <GenericTable rowKey={(r) => r.method} columns={[
            { key: 'rank', label: '#', render: (_r, i) => i + 1 },
            { key: 'method', label: 'Method', align: 'left', render: (r) => METHOD_LABELS[r.method] },
            { key: 'rms', label: 'RMS (dB)', render: (r) => fmt(r.rms) },
          ]} rows={result.rankedByProduction} />

          <div style={{ fontSize: 10, fontWeight: 700, color: '#7c2d12', margin: '10px 0 2px' }}>Best match to expected REW behaviour (coherent vector summation preferred)</div>
          <GenericTable rowKey={(r) => r.method} columns={[
            { key: 'rank', label: '#', render: (_r, i) => i + 1 },
            { key: 'method', label: 'Method', align: 'left', render: (r) => METHOD_LABELS[r.method] },
            { key: 'rms', label: 'RMS (dB)', render: (r) => fmt(r.rms) },
          ]} rows={result.rankedByRewExpectation} />

          {/* ── Final result ── */}
          <div style={{ border: '2px solid #7c2d12', borderRadius: 6, background: '#fff', padding: '10px 12px', fontSize: 10, fontFamily: 'monospace', color: '#1c1917', marginTop: 8 }}>
            <div style={{ fontWeight: 700, color: '#7c2d12', marginBottom: 8, fontSize: 12 }}>PRESSURE ASSEMBLY RESULT:</div>
            {result.exactMatch ? (
              <>
                <div>Production matches: <strong style={{ color: '#166534' }}>{result.exactMatch.method}</strong> ({METHOD_LABELS[result.exactMatch.method]})</div>
                <div>Confidence: <strong>High — RMS {fmt(result.exactMatch.rms)} dB, max deviation {fmt(result.exactMatch.maxDeviation)} dB</strong></div>
                <div>Highest error region: <strong>{['band3545', 'band2930', 'band50', 'band5758'].reduce((worst, k) => (result.exactMatch[k] > (result.exactMatch[worst] ?? -1) ? k : worst), 'band3545')}</strong></div>
                <div>Earliest divergence: <strong>{result.firstDivergence.find((f) => f.method === result.exactMatch.method)?.at0_1 ?? '—'} Hz (&gt;0.1dB)</strong></div>
              </>
            ) : (
              <div style={{ color: '#b91c1c', fontWeight: 700 }}>
                The production engine is not behaving like any standard pressure assembly formulation. The remaining discrepancy must originate before pressure assembly (modal excitation, source term generation, or modal state construction), not during vector summation.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}