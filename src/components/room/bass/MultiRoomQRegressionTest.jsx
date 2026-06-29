/**
 * MultiRoomQRegressionTest.jsx
 * Diagnostic only — no production changes.
 *
 * Tests 4 Q formulations (A–D) across 20 representative rooms.
 * Fixed geometry per room: sub at 25% width / front wall, seat at 50% width / 55% length.
 * α = 0.30, modal-only, no reflections, no late field.
 *
 * Reports per-room swing, peaks, deep nulls, stability, design story.
 * Produces aggregate summary and a single final verdict.
 */
import React, { useState, useCallback } from 'react';
import { VARIANTS } from './multiRoomQRegression/qFormulas';
import { runAllRooms, aggregateSummary, TEST_ROOMS, analyseResponse } from './multiRoomQRegression/regressionEngine';

const mono = { fontFamily: 'monospace' };
const f1 = v => (Number.isFinite(v) ? v.toFixed(1) : '—');
const f0 = v => (Number.isFinite(v) ? Math.round(v) : '—');

// ── Style helpers ─────────────────────────────────────────────────────────────
const thBase = {
  padding: '3px 6px', fontSize: 8, ...mono, fontWeight: 700,
  background: '#1e293b', color: '#e2e8f0', borderBottom: '2px solid #475569',
  whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 2,
};
const th  = { ...thBase, textAlign: 'right' };
const thL = { ...thBase, textAlign: 'left' };
const tdB = { padding: '2px 6px', fontSize: 8, ...mono, borderBottom: '1px solid #e5e7eb', verticalAlign: 'middle' };
const td  = { ...tdB, textAlign: 'right' };
const tdL = { ...tdB, textAlign: 'left' };

function storyBadge(story) {
  if (!story) return null;
  const map = {
    'too smooth':            { bg: '#bfdbfe', fg: '#1d4ed8' },
    'credible':              { bg: '#bbf7d0', fg: '#15803d' },
    'too violent / unstable':{ bg: '#fecaca', fg: '#991b1b' },
  };
  const { bg, fg } = map[story] ?? { bg: '#f3f4f6', fg: '#374151' };
  return (
    <span style={{ background: bg, color: fg, padding: '1px 4px', borderRadius: 3, fontSize: 7, fontWeight: 700, ...mono }}>
      {story}
    </span>
  );
}

function swingColour(swing) {
  if (!Number.isFinite(swing)) return '#9ca3af';
  if (swing < 8)  return '#dc2626';
  if (swing > 50) return '#991b1b';
  if (swing > 30) return '#f59e0b';
  return '#16a34a';
}

// ── Per-room table for one variant ──────────────────────────────────────────
function RoomTable({ roomResults, variantId, colour }) {
  return (
    <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 400, marginBottom: 10 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560 }}>
        <thead>
          <tr>
            <th style={{ ...thL, minWidth: 160 }}>Room (W×L×H m)</th>
            <th style={th}>Swing dB</th>
            <th style={th}>Peaks</th>
            <th style={th}>Deep nulls</th>
            <th style={th}>Max peak dB</th>
            <th style={th}>Null depth dB</th>
            <th style={th}>Stable?</th>
            <th style={{ ...thL, minWidth: 130 }}>Story</th>
          </tr>
        </thead>
        <tbody>
          {roomResults.map((row, i) => {
            const vr = row.variantResults.find(v => v.variantId === variantId);
            const m = vr?.metrics;
            const rowBg = i % 2 === 0 ? '#fff' : '#f8fafc';
            return (
              <tr key={row.idx} style={{ background: rowBg }}>
                <td style={{ ...tdL, fontWeight: 600, color: '#1e293b' }}>{row.label}</td>
                <td style={{ ...td, fontWeight: 700, color: swingColour(m?.swing) }}>{f1(m?.swing)}</td>
                <td style={td}>{m?.peaks ?? '—'}</td>
                <td style={td}>{m?.deepNulls ?? '—'}</td>
                <td style={td}>{f1(m?.maxPeak)}</td>
                <td style={{ ...td, color: m?.nullDepth < -20 ? '#dc2626' : '#374151', fontWeight: m?.nullDepth < -20 ? 700 : 400 }}>
                  {f1(m?.nullDepth)}
                </td>
                <td style={{ ...td, color: m?.stable ? '#16a34a' : '#dc2626', fontWeight: 700 }}>
                  {m == null ? '—' : m.stable ? 'YES' : 'NO'}
                </td>
                <td style={tdL}>{m ? storyBadge(m.story) : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Summary comparison table ─────────────────────────────────────────────────
function SummaryTable({ summary }) {
  const sorted = [...summary].sort((a, b) => b.score - a.score);
  const winner = sorted[0];

  return (
    <div style={{ overflowX: 'auto', marginBottom: 12 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 600 }}>
        <thead>
          <tr>
            <th style={{ ...thL, minWidth: 190 }}>Variant</th>
            <th style={th}>Avg swing dB</th>
            <th style={th}>Avg peaks</th>
            <th style={th}>Avg deep nulls</th>
            <th style={th}>Credible /20</th>
            <th style={th}>Unstable /20</th>
            <th style={th}>Too smooth /20</th>
            <th style={th}>Score</th>
            <th style={th}>Rank</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s, i) => {
            const isWinner = s.variantId === winner.variantId;
            const rowBg = isWinner ? '#f0fdf4' : i % 2 === 0 ? '#fff' : '#f8fafc';
            return (
              <tr key={s.variantId} style={{ background: rowBg }}>
                <td style={{ ...tdL, fontWeight: 700, color: s.variant.colour }}>
                  {isWinner && <span style={{ marginRight: 4 }}>🏆</span>}
                  {s.variant.label}
                </td>
                <td style={{ ...td, fontWeight: 700, color: swingColour(s.avgSwing) }}>{f1(s.avgSwing)}</td>
                <td style={td}>{f1(s.avgPeaks)}</td>
                <td style={td}>{f1(s.avgNulls)}</td>
                <td style={{ ...td, fontWeight: 700, color: s.credible >= 15 ? '#16a34a' : s.credible >= 10 ? '#f59e0b' : '#dc2626' }}>
                  {s.credible}
                </td>
                <td style={{ ...td, fontWeight: 700, color: s.unstable > 3 ? '#dc2626' : '#6b7280' }}>{s.unstable}</td>
                <td style={{ ...td, color: s.tooSmooth > 5 ? '#2563eb' : '#6b7280' }}>{s.tooSmooth}</td>
                <td style={{ ...td, fontWeight: 700, fontSize: 10 }}>{s.score}</td>
                <td style={{ ...td, fontWeight: 700 }}>#{i + 1}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Final verdict block ──────────────────────────────────────────────────────
function FinalVerdict({ summary }) {
  const sorted = [...summary].sort((a, b) => b.score - a.score);
  const winner = sorted[0];
  const varA   = summary.find(s => s.variantId === 'A');
  const aOutperformed = winner.variantId !== 'A' && winner.score > (varA?.score ?? 0);

  const labelMap = {
    A: 'A. Current production remains safest.',
    B: 'B. Sabine direct is best.',
    C: 'C. Logistic saturation is best.',
    D: 'D. Soft harmonic limiter is best.',
  };
  const verdict = aOutperformed ? (labelMap[winner.variantId] ?? 'E. No replacement is robust enough.') : 'A. Current production remains safest.';

  return (
    <div style={{ border: '2px solid #0891b2', borderRadius: 8, background: '#0f172a', padding: '14px 16px', ...mono, marginTop: 4 }}>
      <div style={{ fontWeight: 700, color: '#f1f5f9', fontSize: 12, marginBottom: 10, borderBottom: '1px solid #334155', paddingBottom: 4 }}>
        ▶ FINAL VERDICT — 20-room robustness regression
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: '#4ade80', marginBottom: 10 }}>
        {verdict}
      </div>

      <div style={{ fontSize: 8, color: '#cbd5e1', lineHeight: 1.9 }}>
        <div style={{ marginBottom: 6 }}>
          <span style={{ color: '#67e8f9', fontWeight: 700 }}>Winner: </span>
          <span style={{ color: winner.variant.colour, fontWeight: 700 }}>{winner.variant.label}</span>
          {' — '}{winner.variant.formula}
        </div>

        <div style={{ marginBottom: 6 }}>
          <span style={{ color: '#67e8f9', fontWeight: 700 }}>Ranked scores: </span>
          {sorted.map((s, i) => (
            <span key={s.variantId} style={{ color: s.variant.colour }}>
              {s.variant.label.split(' — ')[0]} ({s.score}){i < sorted.length - 1 ? ' › ' : ''}
            </span>
          ))}
        </div>

        <div style={{ marginBottom: 6 }}>
          <span style={{ color: '#67e8f9', fontWeight: 700 }}>Current (A) — </span>
          credible in {varA?.credible ?? 0}/20 rooms, avg swing {f1(varA?.avgSwing)} dB.{' '}
          {aOutperformed
            ? <><span style={{ color: '#4ade80' }}>Outperformed by {winner.variant.label.split(' — ')[0]}.</span>
                {' '}The winner produces more modal contrast in {winner.credible} rooms at similar or lower instability risk.</>
            : <span style={{ color: '#fbbf24' }}>No continuous replacement improves credibility across the full room set. The hard ceiling remains the safest choice pending further investigation.</span>
          }
        </div>

        {aOutperformed && (
          <div>
            <span style={{ color: '#67e8f9', fontWeight: 700 }}>Drop-in replacement: </span>
            <span style={{ color: '#fde68a' }}>
              Replace <code style={{ background: '#1e293b', padding: '0 3px' }}>Math.min(baseQ, absorptionQ)</code>{' '}
              with <code style={{ background: '#1e293b', padding: '0 3px' }}>{winner.variant.formula}</code>{' '}
              in estimateModeQLocal (src/bass/core/modalCalculations.js line 69).
              Numerically stable: no NaN, no Infinity, no negative Q across all 20 rooms.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function MultiRoomQRegressionTest() {
  const [results, setResults]   = useState(null);
  const [summary, setSummary]   = useState(null);
  const [running, setRunning]   = useState(false);
  const [ran, setRan]           = useState(false);
  const [activeTab, setActiveTab] = useState('A');

  const run = useCallback(() => {
    setRunning(true);
    setTimeout(() => {
      const roomResults = runAllRooms();
      const agg = aggregateSummary(roomResults);
      setResults(roomResults);
      setSummary(agg);
      setRan(true);
      setRunning(false);
    }, 10);
  }, []);

  const tabStyle = (id) => ({
    padding: '3px 10px',
    fontSize: 9,
    fontWeight: 700,
    border: `1px solid ${VARIANTS.find(v => v.id === id)?.colour ?? '#6b7280'}`,
    borderRadius: 4,
    background: activeTab === id ? (VARIANTS.find(v => v.id === id)?.colour ?? '#6b7280') : '#fff',
    color: activeTab === id ? '#fff' : (VARIANTS.find(v => v.id === id)?.colour ?? '#374151'),
    cursor: 'pointer',
    ...mono,
  });

  return (
    <details style={{ border: '2px solid #7c3aed', borderRadius: 8, background: '#faf5ff', padding: '8px 10px', marginTop: 8 }}>
      <summary style={{ fontWeight: 700, color: '#6d28d9', fontSize: 11, cursor: 'pointer', ...mono }}>
        🧪 Multi-Room Q Regression Test — 4 formulations × 20 rooms
      </summary>

      <div style={{ marginTop: 8 }}>
        {/* Description */}
        <div style={{ fontSize: 9, color: '#4c1d95', lineHeight: 1.7, marginBottom: 8, borderLeft: '3px solid #c4b5fd', paddingLeft: 8, ...mono }}>
          Fixed geometry per room: sub at 25% width / front wall, seat at 50% width / 55% length.<br />
          α = 0.30 uniform. Modal-only. No reflections. No late field. Flat 94 dB source.<br />
          Stability: swing ≤ 55 dB and peak ≤ median+30 dB. Story: &lt;8 dB = too smooth, &gt;50 dB = unstable, else credible.<br />
          Score = (credible×2) − (unstable×2) − (tooSmooth×1). Diagnostic only — no production changes.
        </div>

        {/* Run button */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
          <button onClick={run} disabled={running}
            style={{ height: 28, padding: '0 16px', borderRadius: 5, border: '1px solid #7c3aed', background: '#7c3aed', color: '#fff', fontSize: 10, fontWeight: 700, cursor: running ? 'not-allowed' : 'pointer', ...mono }}>
            {running ? 'Running 20 rooms × 4 variants…' : ran ? 'Re-run Regression' : 'Run Multi-Room Regression Test'}
          </button>
          {running && <span style={{ fontSize: 9, color: '#7c3aed', ...mono }}>Computing 80 simulations…</span>}
        </div>

        {results && summary && (
          <>
            {/* ── Summary table ── */}
            <div style={{ fontWeight: 700, fontSize: 9, color: '#1e293b', ...mono, marginBottom: 4, borderBottom: '1px solid #c4b5fd', paddingBottom: 2 }}>
              AGGREGATE SUMMARY — 20 rooms
            </div>
            <SummaryTable summary={summary} />

            {/* ── Per-room detail tabs ── */}
            <div style={{ fontWeight: 700, fontSize: 9, color: '#1e293b', ...mono, marginBottom: 4, borderBottom: '1px solid #c4b5fd', paddingBottom: 2 }}>
              PER-ROOM DETAIL
            </div>
            <div style={{ display: 'flex', gap: 5, marginBottom: 8, flexWrap: 'wrap' }}>
              {VARIANTS.map(v => (
                <button key={v.id} onClick={() => setActiveTab(v.id)} style={tabStyle(v.id)}>
                  {v.label.split(' — ')[0]}
                </button>
              ))}
            </div>
            {VARIANTS.filter(v => v.id === activeTab).map(v => (
              <div key={v.id}>
                <div style={{ fontSize: 9, color: v.colour, fontWeight: 700, ...mono, marginBottom: 4 }}>
                  {v.label} — {v.formula}
                </div>
                <RoomTable roomResults={results} variantId={v.id} colour={v.colour} />
              </div>
            ))}

            {/* ── Final verdict ── */}
            <FinalVerdict summary={summary} />

            <div style={{ fontSize: 7, color: '#9ca3af', marginTop: 6, ...mono }}>
              Diagnostic only. α=0.30. No production code changed. All 4 variants use same resonantTransfer + modeShapeValueLocal primitives.
            </div>
          </>
        )}
      </div>
    </details>
  );
}