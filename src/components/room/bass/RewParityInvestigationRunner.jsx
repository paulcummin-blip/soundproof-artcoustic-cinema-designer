// RewParityInvestigationRunner.jsx
// Lightweight guided workflow panel — reads live MAE from the benchmark table
// and tracks which diagnostics have been run externally.
// Does NOT run sweeps itself. Does NOT change production maths.
// Place above RewParityAutoSweep in BassResponse.jsx.

import React, { useState, useMemo } from 'react';

const REW_BENCHMARK = [
  { hz: 20,  db: 92.4 },
  { hz: 25,  db: 93.6 },
  { hz: 30,  db: 89.2 },
  { hz: 40,  db: 86.0 },
  { hz: 50,  db: 91.8 },
  { hz: 57,  db: 104.1 },
  { hz: 60,  db: 98.1 },
  { hz: 70,  db: 86.8 },
  { hz: 80,  db: 79.7 },
  { hz: 85,  db: 90.8 },
  { hz: 100, db: 98.3 },
  { hz: 120, db: 92.1 },
  { hz: 150, db: 94.3 },
  { hz: 180, db: 99.3 },
  { hz: 200, db: 99.5 },
];

// All known diagnostics in recommended investigation order
const DIAGNOSTICS = [
  {
    id: 'auto_sweep',
    name: 'REW Parity Auto Sweep',
    button: 'Run sweep',
    panel: 'REW Parity Auto Sweep',
    hypothesis: 'Parameter space (distance blend, Q, coherence, modal mag scale)',
  },
  {
    id: 'resonator_sweep',
    name: 'REW Parity Resonator Shape Sweep',
    button: 'Run Resonator Shape sweep',
    panel: 'REW Parity Resonator Shape Sweep',
    hypothesis: 'Transfer function formulation (production vs REW-damped, normalised, symmetric)',
  },
  {
    id: 'tangential_audit',
    name: 'REW Parity Tangential Dominance Audit',
    button: 'Run tangential dominance audit',
    panel: 'REW Parity Tangential Dominance Audit',
    hypothesis: 'Tangential mode energy level and attenuation',
  },
  {
    id: 'modal_source_audit',
    name: 'REW Parity Modal Source Audit',
    button: 'Run Modal Source Audit',
    panel: 'REW Parity Modal Source Audit',
    hypothesis: 'Source excitation coupling (cos product vs distance-normalised vs sub/seat-only)',
  },
  {
    id: 'family_sweep',
    name: 'REW Parity Modal Family Sweep',
    button: 'Run modal family sweep',
    panel: 'REW Parity Modal Family Sweep',
    hypothesis: 'Per-family amplitude scaling (axial × tangential × oblique gain multipliers)',
  },
  {
    id: 'family_q_sweep',
    name: 'REW Parity Family-Q Sweep',
    button: 'Run Family-Q sweep',
    panel: 'REW Parity Family-Q Sweep',
    hypothesis: 'Per-family Q multipliers independent of absorption model',
  },
  {
    id: 'architecture_sweep',
    name: 'REW Parity Modal Architecture Sweep',
    button: 'Run architecture sweep',
    panel: 'REW Parity Modal Architecture Sweep',
    hypothesis: 'High-level modal summation architecture alternatives',
  },
  {
    id: 'tilt_sweep',
    name: 'REW Parity Frequency Tilt Sweep',
    button: 'Run tilt sweep',
    panel: 'REW Parity Frequency Tilt Sweep',
    hypothesis: 'Spectral tilt of source reference (level offset across frequency)',
  },
  {
    id: 'q_source_audit',
    name: 'REW Parity Q Source Audit',
    button: 'Run Q source audit',
    panel: 'REW Parity Q Source Audit',
    hypothesis: 'Q source model (Sabine vs fixed vs absorption-derived)',
  },
  {
    id: 'mode_contribution',
    name: 'REW Parity Mode Contribution Audit',
    button: 'Run mode contribution audit',
    panel: 'REW Parity Mode Contribution Audit',
    hypothesis: 'Individual mode contribution breakdown at each benchmark frequency',
  },
];

function interpolateSpl(series, targetHz) {
  if (!Array.isArray(series) || series.length === 0) return null;
  const sorted = [...series].sort((a, b) => a.frequency - b.frequency);
  if (targetHz <= sorted[0].frequency) return sorted[0].spl;
  if (targetHz >= sorted[sorted.length - 1].frequency) return sorted[sorted.length - 1].spl;
  for (let i = 0; i < sorted.length - 1; i++) {
    const p1 = sorted[i], p2 = sorted[i + 1];
    if (targetHz >= p1.frequency && targetHz <= p2.frequency) {
      const t = (targetHz - p1.frequency) / (p2.frequency - p1.frequency);
      return p1.spl + (p2.spl - p1.spl) * t;
    }
  }
  return null;
}

function computeLiveMae(series) {
  if (!Array.isArray(series) || series.length === 0) return null;
  let sum = 0, worstErr = 0, worstHz = null, count = 0;
  for (const { hz, db } of REW_BENCHMARK) {
    const v = interpolateSpl(series, hz);
    if (!Number.isFinite(v)) continue;
    const err = Math.abs(v - db);
    sum += err;
    if (err > worstErr) { worstErr = err; worstHz = hz; }
    count++;
  }
  if (count === 0) return null;
  return { mae: sum / count, worstErr, worstHz };
}

function fmt(v, d = 2) { return Number.isFinite(v) ? Number(v).toFixed(d) : '—'; }

// ── Stateful row for manually logging a diagnostic result ──────────────────────
function DiagnosticRow({ diag, result, onLog, onClear, isNext }) {
  const [inputMae, setInputMae] = useState('');
  const [inputConclusion, setInputConclusion] = useState('');
  const [logging, setLogging] = useState(false);

  const hasResult = !!result;

  return (
    <tr style={{
      borderBottom: '1px solid #dbeafe',
      background: isNext ? '#fffbeb' : hasResult ? '#f0fdf4' : undefined,
    }}>
      <td style={{ padding: '4px 6px', fontSize: 9, fontFamily: 'monospace', color: '#374151', whiteSpace: 'nowrap' }}>
        {hasResult
          ? <span style={{ color: '#15803d', fontWeight: 700 }}>✓ done</span>
          : isNext
            ? <span style={{ color: '#b45309', fontWeight: 700 }}>→ next</span>
            : <span style={{ color: '#9ca3af' }}>pending</span>
        }
      </td>
      <td style={{ padding: '4px 6px', fontSize: 9, fontFamily: 'monospace', color: '#1e40af', fontWeight: isNext ? 700 : 400 }}>
        {diag.name}
      </td>
      <td style={{ padding: '4px 6px', fontSize: 9, fontFamily: 'monospace', color: '#374151', maxWidth: 220, whiteSpace: 'normal' }}>
        {diag.hypothesis}
      </td>
      <td style={{ padding: '4px 6px', fontSize: 9, fontFamily: 'monospace', color: '#166534', fontWeight: 700, textAlign: 'right' }}>
        {hasResult ? fmt(result.bestMae, 3) : '—'}
      </td>
      <td style={{ padding: '4px 6px', fontSize: 9, fontFamily: 'monospace', textAlign: 'right', color: hasResult && result.improvement > 0.5 ? '#15803d' : '#6b7280', fontWeight: hasResult && result.improvement > 0.5 ? 700 : 400 }}>
        {hasResult ? (result.improvement > 0 ? `▼${fmt(result.improvement, 2)}` : `▲${fmt(Math.abs(result.improvement), 2)}`) : '—'}
      </td>
      <td style={{ padding: '4px 6px', fontSize: 9, fontFamily: 'monospace', color: '#374151', maxWidth: 180, whiteSpace: 'normal' }}>
        {hasResult ? result.conclusion : (
          isNext ? (
            <span style={{ color: '#b45309' }}>
              ↓ Open panel below and click: <strong>"{diag.button}"</strong>
            </span>
          ) : '—'
        )}
      </td>
      <td style={{ padding: '4px 6px' }}>
        {!hasResult ? (
          logging ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 200 }}>
              <input
                type="number"
                step="0.01"
                placeholder="Best MAE (dB)"
                value={inputMae}
                onChange={e => setInputMae(e.target.value)}
                style={{ fontSize: 9, padding: '2px 4px', borderRadius: 3, border: '1px solid #93c5fd', fontFamily: 'monospace', width: 100 }}
              />
              <input
                type="text"
                placeholder="Short conclusion…"
                value={inputConclusion}
                onChange={e => setInputConclusion(e.target.value)}
                style={{ fontSize: 9, padding: '2px 4px', borderRadius: 3, border: '1px solid #93c5fd', fontFamily: 'monospace', width: 180 }}
              />
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={() => {
                    const mae = parseFloat(inputMae);
                    if (!Number.isFinite(mae)) return;
                    onLog({ bestMae: mae, conclusion: inputConclusion || '—', improvement: 0 });
                    setLogging(false);
                  }}
                  style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, border: '1px solid #16a34a', background: '#16a34a', color: '#fff', cursor: 'pointer', fontFamily: 'monospace' }}
                >Save</button>
                <button
                  onClick={() => setLogging(false)}
                  style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, border: '1px solid #9ca3af', background: '#f3f4f6', color: '#374151', cursor: 'pointer', fontFamily: 'monospace' }}
                >Cancel</button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setLogging(true)}
              style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, border: '1px solid #93c5fd', background: '#eff6ff', color: '#1e40af', cursor: 'pointer', fontFamily: 'monospace' }}
            >Log result</button>
          )
        ) : (
          <button
            onClick={onClear}
            style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, border: '1px solid #fca5a5', background: '#fff1f2', color: '#be123c', cursor: 'pointer', fontFamily: 'monospace' }}
          >Clear</button>
        )}
      </td>
    </tr>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function RewParityInvestigationRunner({ liveB44Series }) {
  const [results, setResults] = useState({}); // keyed by diag.id → { bestMae, improvement, conclusion }
  const [collapsed, setCollapsed] = useState(false);

  const liveMaeData = useMemo(() => computeLiveMae(liveB44Series), [liveB44Series]);
  const liveMae = liveMaeData?.mae ?? null;
  const worstHz = liveMaeData?.worstHz ?? null;
  const worstErr = liveMaeData?.worstErr ?? null;

  const nextDiagId = DIAGNOSTICS.find(d => !results[d.id])?.id ?? null;

  // Compute best MAE found across all logged results
  const loggedResults = Object.values(results).filter(r => Number.isFinite(r?.bestMae));
  const bestMaeFound = loggedResults.length > 0 ? Math.min(...loggedResults.map(r => r.bestMae)) : null;
  const bestImprovement = (liveMae !== null && bestMaeFound !== null) ? liveMae - bestMaeFound : null;

  // Strongest lead = logged result with largest improvement
  const strongestLead = DIAGNOSTICS
    .filter(d => results[d.id] && results[d.id].improvement > 0.3)
    .sort((a, b) => (results[b.id]?.improvement ?? 0) - (results[a.id]?.improvement ?? 0))[0] ?? null;

  const handleLog = (diagId, result) => {
    const improvement = (liveMae !== null && Number.isFinite(result.bestMae)) ? liveMae - result.bestMae : 0;
    setResults(prev => ({ ...prev, [diagId]: { ...result, improvement } }));
  };

  const handleClear = (diagId) => {
    setResults(prev => {
      const next = { ...prev };
      delete next[diagId];
      return next;
    });
  };

  const handleReset = () => setResults({});

  const doneCount = Object.keys(results).length;
  const conclusion = (() => {
    if (!liveMae) return 'Add a sub and seat to begin parity analysis.';
    if (doneCount === 0) return 'Run the first diagnostic below to start the investigation.';
    if (!strongestLead && doneCount > 0) return 'No diagnostic has found a significant improvement yet. Continue to the next panel.';
    if (strongestLead) {
      const r = results[strongestLead.id];
      return `Strongest lead: ${strongestLead.name} — tests ${strongestLead.hypothesis}. MAE improvement = ▼${fmt(r.improvement, 2)} dB. ${r.conclusion}`;
    }
    return 'Investigation in progress.';
  })();

  return (
    <div style={{
      border: '2px solid #1d4ed8',
      borderRadius: 10,
      background: '#eff6ff',
      padding: '10px 14px',
      marginBottom: 12,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: collapsed ? 0 : 8 }}>
        <div style={{ fontWeight: 700, color: '#1e3a8a', fontSize: 12, fontFamily: 'monospace' }}>
          REW Parity Investigation Runner
          <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
            guided workflow · {doneCount}/{DIAGNOSTICS.length} diagnostics logged
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {doneCount > 0 && (
            <button
              onClick={handleReset}
              style={{ fontSize: 9, padding: '2px 7px', borderRadius: 4, border: '1px solid #fca5a5', background: '#fff1f2', color: '#be123c', cursor: 'pointer', fontFamily: 'monospace' }}
            >Reset all</button>
          )}
          <button
            onClick={() => setCollapsed(c => !c)}
            style={{ fontSize: 9, padding: '2px 7px', borderRadius: 4, border: '1px solid #93c5fd', background: '#dbeafe', color: '#1e3a8a', cursor: 'pointer', fontFamily: 'monospace', fontWeight: 600 }}
          >
            {collapsed ? '▼ expand' : '▲ collapse'}
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {/* ── Live MAE summary strip ── */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 8,
            marginBottom: 10,
          }}>
            {[
              {
                label: 'Current live MAE',
                value: liveMae !== null ? `${fmt(liveMae, 3)} dB` : '—',
                note: 'vs REW benchmark',
                color: liveMae !== null && liveMae < 3 ? '#15803d' : liveMae !== null && liveMae < 6 ? '#b45309' : '#dc2626',
              },
              {
                label: 'Worst error freq',
                value: worstHz !== null ? `${worstHz} Hz` : '—',
                note: worstErr !== null ? `${fmt(worstErr, 2)} dB error` : '',
                color: '#1e3a8a',
              },
              {
                label: 'Best MAE found',
                value: bestMaeFound !== null ? `${fmt(bestMaeFound, 3)} dB` : 'not yet run',
                note: bestImprovement !== null && bestImprovement > 0 ? `▼${fmt(bestImprovement, 2)} dB vs live` : '',
                color: bestMaeFound !== null && bestImprovement > 0 ? '#15803d' : '#6b7280',
              },
              {
                label: 'Diagnostics run',
                value: `${doneCount} / ${DIAGNOSTICS.length}`,
                note: nextDiagId ? `Next: ${DIAGNOSTICS.find(d => d.id === nextDiagId)?.name}` : '✓ All done',
                color: doneCount === DIAGNOSTICS.length ? '#15803d' : '#1e3a8a',
              },
            ].map(({ label, value, note, color }) => (
              <div key={label} style={{ background: '#fff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '6px 10px' }}>
                <div style={{ fontSize: 9, color: '#6b7280', fontFamily: 'monospace' }}>{label}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color, fontFamily: 'monospace' }}>{value}</div>
                {note && <div style={{ fontSize: 9, color: '#6b7280', fontFamily: 'monospace', marginTop: 1 }}>{note}</div>}
              </div>
            ))}
          </div>

          {/* ── Conclusion ── */}
          <div style={{
            padding: '7px 10px',
            borderRadius: 6,
            background: strongestLead ? '#fef9c3' : '#dbeafe',
            border: `1px solid ${strongestLead ? '#fbbf24' : '#93c5fd'}`,
            fontSize: 10,
            fontFamily: 'monospace',
            color: strongestLead ? '#92400e' : '#1e3a8a',
            marginBottom: 10,
            fontWeight: 500,
          }}>
            {conclusion}
          </div>

          {/* ── Next step call-out ── */}
          {nextDiagId && (() => {
            const next = DIAGNOSTICS.find(d => d.id === nextDiagId);
            return (
              <div style={{
                padding: '7px 10px',
                borderRadius: 6,
                background: '#fff7ed',
                border: '2px solid #f97316',
                fontSize: 10,
                fontFamily: 'monospace',
                color: '#9a3412',
                marginBottom: 10,
                fontWeight: 600,
              }}>
                ▶ Next: Open <strong>{next.panel}</strong> panel below and click <strong>"{next.button}"</strong>.<br />
                <span style={{ fontWeight: 400, color: '#78350f' }}>Hypothesis: {next.hypothesis}</span>
              </div>
            );
          })()}

          {/* ── Diagnostics table ── */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 900 }}>
              <thead>
                <tr>
                  {['Status', 'Diagnostic', 'Hypothesis', 'Best MAE', 'Δ vs live', 'Finding', 'Action'].map((h, i) => (
                    <th key={h} style={{
                      textAlign: i >= 3 && i <= 4 ? 'right' : 'left',
                      padding: '3px 6px',
                      fontSize: 9,
                      fontWeight: 700,
                      background: '#dbeafe',
                      borderBottom: '2px solid #93c5fd',
                      color: '#1e3a8a',
                      whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DIAGNOSTICS.map(diag => (
                  <DiagnosticRow
                    key={diag.id}
                    diag={diag}
                    result={results[diag.id] ?? null}
                    isNext={diag.id === nextDiagId}
                    onLog={(r) => handleLog(diag.id, r)}
                    onClear={() => handleClear(diag.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 6, fontSize: 9, fontFamily: 'monospace', color: '#6b7280' }}>
            After each diagnostic sweep, click "Log result" and enter the best MAE shown and a short finding. The runner builds the ranked investigation summary automatically.
          </div>
        </>
      )}
    </div>
  );
}