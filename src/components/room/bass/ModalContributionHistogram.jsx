/**
 * ModalContributionHistogram — Diagnostic only. Does not affect the live graph.
 *
 * Fixed: distance blend=0.75, All RSS, Direct+Modes, Reflections OFF.
 *
 * At 70, 80, 85, 90 Hz reports:
 *  - Mode counts (total / active / >10% / >5% / >1%)
 *  - Cumulative contribution: top 3, 5, 10 modes + order≤3, order≥4
 *
 * Goal: determine whether REW mismatch is top-heavy, long-tail high-order, or mixed.
 */

import React, { useState, useCallback } from 'react';
import {
  computeRoomModesLocal,
  modeShapeValueLocal,
  resonantTransfer,
  estimateModeQLocal,
} from '@/components/room/bass/core/modalCalculations';

// ── Constants ────────────────────────────────────────────────────────────────
const SPEED_OF_SOUND = 343;
const DISTANCE_BLEND = 0.75;
const TARGET_HZ = [70, 80, 85, 90];

// ── Helpers ──────────────────────────────────────────────────────────────────
function db2mag(db)  { return Math.pow(10, db / 20); }

function buildModes(roomDims, surfaceAbsorption) {
  const raw = computeRoomModesLocal({
    widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM,
    fMax: 220, c: SPEED_OF_SOUND,
  });
  return raw.map(mode => {
    const activeAxes = (mode.nx > 0 ? 1 : 0) + (mode.ny > 0 ? 1 : 0) + (mode.nz > 0 ? 1 : 0);
    const baseQ = activeAxes === 1 ? 4.0 : activeAxes === 2 ? 3.9 : 2.5;
    const absorptionQ = estimateModeQLocal({
      roomDims, surfaceAbsorption: surfaceAbsorption ?? {}, f0: mode.freq,
    });
    const order = Math.abs(mode.nx) + Math.abs(mode.ny) + Math.abs(mode.nz);
    return { ...mode, order, qValue: Math.max(1, Math.min(baseQ, absorptionQ)) };
  });
}

/**
 * For a given frequency, compute per-mode modal magnitude contributions.
 * Returns array sorted by magnitude descending.
 */
function computeModalMagnitudes(hz, modes, subPos, seatPos, roomDims) {
  const distM = Math.max(0.01, Math.sqrt(
    Math.pow(subPos.x - seatPos.x, 2) +
    Math.pow(subPos.y - seatPos.y, 2) +
    Math.pow(subPos.z - seatPos.z, 2)
  ));
  const blendedLossDb = -20 * Math.log10(distM) * DISTANCE_BLEND;
  const modalGainScalar = db2mag(blendedLossDb);

  const contributions = [];
  for (const mode of modes) {
    const srcPsi = modeShapeValueLocal(mode, subPos.x, subPos.y, subPos.z, roomDims);
    const rcvPsi = modeShapeValueLocal(mode, seatPos.x, seatPos.y, seatPos.z, roomDims);
    const coupling = srcPsi * rcvPsi;
    if (Math.abs(coupling) < 1e-9) continue;           // nulled at source or receiver

    const orderWeight = mode.order >= 2 ? 0.50 : 1.0;
    const axialScale  = (mode.type === 'axial' && mode.order >= 2) ? 0.50 : 1.0;
    const gain = db2mag(94) * modalGainScalar * coupling * orderWeight * axialScale;

    const { re: tr, im: ti } = resonantTransfer(hz, mode.freq, mode.qValue);
    const mag = Math.abs(gain) * Math.sqrt(tr * tr + ti * ti);
    contributions.push({ mode, mag });
  }

  contributions.sort((a, b) => b.mag - a.mag);
  return contributions;
}

function analyseHz(hz, allModes, subPos, seatPos, roomDims) {
  const contribs = computeModalMagnitudes(hz, allModes, subPos, seatPos, roomDims);
  const active   = contribs.length;
  const totalMag = contribs.reduce((s, c) => s + c.mag, 0);

  if (active === 0 || totalMag === 0) return null;

  const pct = contribs.map(c => c.mag / totalMag);

  const gt10 = pct.filter(p => p > 0.10).length;
  const gt5  = pct.filter(p => p > 0.05).length;
  const gt1  = pct.filter(p => p > 0.01).length;

  const cumTop = (n) => pct.slice(0, n).reduce((s, p) => s + p, 0);

  const cumOrder3 = contribs
    .filter(c => c.mode.order <= 3)
    .reduce((s, c) => s + c.mag, 0) / totalMag;

  const cumOrder4plus = contribs
    .filter(c => c.mode.order >= 4)
    .reduce((s, c) => s + c.mag, 0) / totalMag;

  // Dominant mode fingerprint
  let pattern = 'mixed';
  if (gt10 >= 1 && cumTop(3) > 0.7)  pattern = 'top-heavy';
  else if (cumOrder4plus > 0.45)      pattern = 'long-tail high-order';

  // Top 3 modes label
  const top3Labels = contribs.slice(0, 3).map(c => {
    const m = c.mode;
    return `(${m.nx},${m.ny},${m.nz}) ${m.freq.toFixed(1)}Hz ×${(c.mag / totalMag * 100).toFixed(1)}%`;
  });

  return {
    hz,
    totalModes: allModes.length,
    active,
    gt10, gt5, gt1,
    cumTop3:      cumTop(3),
    cumTop5:      cumTop(5),
    cumTop10:     cumTop(10),
    cumOrder3,
    cumOrder4plus,
    pattern,
    top3Labels,
  };
}

// ── Styling ──────────────────────────────────────────────────────────────────
const MONO = { fontFamily: 'monospace' };

const TH_BASE = {
  padding: '4px 10px', fontSize: 8, fontWeight: 700, ...MONO,
  background: '#1c1917', color: '#d6d3d1',
  borderBottom: '2px solid #292524', whiteSpace: 'nowrap',
};
const TH_L = { ...TH_BASE, textAlign: 'left' };
const TH_R = { ...TH_BASE, textAlign: 'right' };

const TD_BASE = { padding: '3px 10px', fontSize: 8, ...MONO, borderBottom: '1px solid #1c1917' };
const TD_L = { ...TD_BASE, textAlign: 'left' };
const TD_R = { ...TD_BASE, textAlign: 'right' };

const PATTERN_COLORS = {
  'top-heavy':           '#f87171',
  'long-tail high-order':'#fb923c',
  'mixed':               '#fbbf24',
};

function pctColor(v) {
  if (v >= 0.8)  return '#4ade80';
  if (v >= 0.6)  return '#86efac';
  if (v >= 0.4)  return '#fbbf24';
  return '#f87171';
}

function countColor(v, total) {
  const frac = total > 0 ? v / total : 0;
  if (frac <= 0.1) return '#4ade80';
  if (frac <= 0.25) return '#fbbf24';
  return '#f87171';
}

const pct1 = (v) => Number.isFinite(v) ? (v * 100).toFixed(1) + '%' : '—';

// ── Component ─────────────────────────────────────────────────────────────────
export default function ModalContributionHistogram({ roomDims, subs, seat, surfaceAbsorption }) {
  const [running, setRunning] = useState(false);
  const [results, setResults]  = useState(null);

  const currentSub = subs?.[0] ?? null;
  const hasRoom    = !!(roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM);
  const canRun     = hasRoom && seat?.x != null && currentSub?.x != null;

  const runAudit = useCallback(() => {
    if (!canRun) return;
    setRunning(true);
    setResults(null);
    setTimeout(() => {
      try {
        const subPos  = { x: currentSub.x, y: currentSub.y, z: currentSub.z  ?? 0.35 };
        const seatPos = { x: seat.x,        y: seat.y,        z: seat.z         ?? 1.2  };
        const allModes = buildModes(roomDims, surfaceAbsorption);
        const rows = TARGET_HZ.map(hz => analyseHz(hz, allModes, subPos, seatPos, roomDims));
        setResults(rows);
      } catch (e) {
        console.error('[ModalContributionHistogram]', e);
      } finally {
        setRunning(false);
      }
    }, 0);
  }, [roomDims, seat, currentSub, surfaceAbsorption, canRun]);

  return (
    <div style={{ marginTop: 12, border: '1px solid #292524', borderRadius: 8, background: '#0c0a09', padding: '10px 12px' }}>
      <div style={{ fontWeight: 700, color: '#d6d3d1', fontSize: 11, ...MONO, marginBottom: 3 }}>
        Modal Contribution Histogram
        <span style={{ fontWeight: 400, color: '#44403c', marginLeft: 10, fontSize: 10 }}>
          diagnostic only · does not affect live graph
        </span>
      </div>
      <div style={{ fontSize: 9, color: '#57534e', ...MONO, marginBottom: 8, lineHeight: 1.7 }}>
        Fixed: blend=0.75 · RSS · Direct+Modes · Reflections OFF.<br />
        Reports per-mode magnitude share at 70, 80, 85, 90 Hz.<br />
        Goal: distinguish top-heavy vs long-tail high-order vs mixed parity drivers.
      </div>

      {!hasRoom    && <div style={{ fontSize: 10, color: '#fbbf24', ...MONO, marginBottom: 6 }}>⚠ Requires room dimensions.</div>}
      {hasRoom && !seat       && <div style={{ fontSize: 10, color: '#fbbf24', ...MONO, marginBottom: 6 }}>⚠ Requires a seat/MLP.</div>}
      {hasRoom && !currentSub && <div style={{ fontSize: 10, color: '#fbbf24', ...MONO, marginBottom: 6 }}>⚠ Requires a subwoofer.</div>}

      {canRun && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 9, ...MONO, color: '#78716c', background: '#1c1917', borderRadius: 4, padding: '5px 10px', marginBottom: 8 }}>
          <span>Room: <strong style={{ color: '#d6d3d1' }}>{roomDims.widthM.toFixed(2)}W × {roomDims.lengthM.toFixed(2)}L × {roomDims.heightM.toFixed(2)}H m</strong></span>
          <span>MLP: <strong style={{ color: '#86efac' }}>({seat.x?.toFixed(3)}, {seat.y?.toFixed(3)}, {(seat.z ?? 1.2).toFixed(3)}) m</strong></span>
          <span>Sub: <strong style={{ color: '#93c5fd' }}>({currentSub.x?.toFixed(3)}, {currentSub.y?.toFixed(3)}, {(currentSub.z ?? 0.35).toFixed(3)}) m</strong></span>
        </div>
      )}

      <button
        onClick={runAudit}
        disabled={running || !canRun}
        style={{
          padding: '5px 14px', borderRadius: 5, border: '1px solid #57534e',
          background: running ? '#1c1917' : '#292524',
          color: running || !canRun ? '#57534e' : '#d6d3d1',
          fontSize: 10, ...MONO, cursor: running || !canRun ? 'default' : 'pointer',
          marginBottom: 10, fontWeight: 700,
        }}
      >
        {running ? 'Analysing modes…' : results ? 'Re-run' : 'Run Modal Contribution Histogram'}
      </button>

      {results && (
        <>
          {/* Main metrics table */}
          <div style={{ overflowX: 'auto', marginBottom: 6 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 700 }}>
              <thead>
                <tr>
                  <th style={TH_L}>Frequency</th>
                  <th style={TH_R}>Total modes</th>
                  <th style={TH_R}>Active</th>
                  <th style={{ ...TH_R, color: '#f87171'  }}>&gt;10% each</th>
                  <th style={{ ...TH_R, color: '#fb923c'  }}>&gt;5% each</th>
                  <th style={{ ...TH_R, color: '#fbbf24'  }}>&gt;1% each</th>
                  <th style={{ ...TH_R, color: '#60a5fa'  }}>Top-3 cum%</th>
                  <th style={{ ...TH_R, color: '#818cf8'  }}>Top-5 cum%</th>
                  <th style={{ ...TH_R, color: '#a78bfa'  }}>Top-10 cum%</th>
                  <th style={{ ...TH_R, color: '#4ade80'  }}>Order ≤3 %</th>
                  <th style={{ ...TH_R, color: '#fb923c'  }}>Order ≥4 %</th>
                  <th style={{ ...TH_R, color: '#d6d3d1'  }}>Pattern</th>
                </tr>
              </thead>
              <tbody>
                {results.map((row) => {
                  if (!row) return null;
                  return (
                    <tr key={row.hz}>
                      <td style={{ ...TD_L, fontWeight: 700, color: '#e7e5e4' }}>{row.hz} Hz</td>
                      <td style={{ ...TD_R, color: '#57534e' }}>{row.totalModes}</td>
                      <td style={{ ...TD_R, color: '#a8a29e' }}>{row.active}</td>
                      <td style={{ ...TD_R, color: countColor(row.gt10, row.active) }}>{row.gt10}</td>
                      <td style={{ ...TD_R, color: countColor(row.gt5,  row.active) }}>{row.gt5}</td>
                      <td style={{ ...TD_R, color: '#78716c' }}>{row.gt1}</td>
                      <td style={{ ...TD_R, color: pctColor(row.cumTop3)      }}>{pct1(row.cumTop3)}</td>
                      <td style={{ ...TD_R, color: pctColor(row.cumTop5)      }}>{pct1(row.cumTop5)}</td>
                      <td style={{ ...TD_R, color: pctColor(row.cumTop10)     }}>{pct1(row.cumTop10)}</td>
                      <td style={{ ...TD_R, color: pctColor(row.cumOrder3)    }}>{pct1(row.cumOrder3)}</td>
                      <td style={{ ...TD_R, color: row.cumOrder4plus > 0.45 ? '#f87171' : '#78716c' }}>{pct1(row.cumOrder4plus)}</td>
                      <td style={{ ...TD_R, fontWeight: 700, color: PATTERN_COLORS[row.pattern] ?? '#a8a29e' }}>
                        {row.pattern}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Top-3 mode detail per frequency */}
          <div style={{ fontSize: 8, ...MONO, color: '#44403c', lineHeight: 2, borderTop: '1px solid #1c1917', paddingTop: 6 }}>
            <span style={{ color: '#57534e', fontWeight: 700 }}>Top-3 contributors:</span>
            {results.map(row => row && (
              <div key={row.hz} style={{ marginTop: 2 }}>
                <span style={{ color: '#6b7280', minWidth: 40, display: 'inline-block' }}>{row.hz} Hz</span>
                {row.top3Labels.map((lbl, i) => (
                  <span key={i} style={{ marginRight: 14, color: i === 0 ? '#fbbf24' : '#57534e' }}>{lbl}</span>
                ))}
              </div>
            ))}
          </div>

          {/* Overall interpretation */}
          {(() => {
            const patterns = results.filter(Boolean).map(r => r.pattern);
            const topHeavy  = patterns.filter(p => p === 'top-heavy').length;
            const longTail  = patterns.filter(p => p === 'long-tail high-order').length;
            const mixed     = patterns.filter(p => p === 'mixed').length;
            let summary, color;
            if (topHeavy >= 3) {
              summary = 'All frequencies are top-heavy — a few dominant modes drive most of the energy. Target those modes for Q/gain correction.';
              color = '#f87171';
            } else if (longTail >= 3) {
              summary = 'Long-tail high-order pattern dominates — energy is spread across many higher-order modes (order ≥4). Reducing orderWeight or adding an order cap may improve REW parity.';
              color = '#fb923c';
            } else {
              summary = `Mixed pattern across frequencies (top-heavy×${topHeavy}, long-tail×${longTail}, mixed×${mixed}). No single mechanism dominates — check individual frequency rows.`;
              color = '#fbbf24';
            }
            return (
              <div style={{ marginTop: 8, fontSize: 9, ...MONO, padding: '6px 10px', background: '#1c1917', borderRadius: 4, borderLeft: `3px solid ${color}`, color, lineHeight: 1.8 }}>
                ▶ {summary}
              </div>
            );
          })()}

          <div style={{ marginTop: 5, fontSize: 8, color: '#44403c', ...MONO }}>
            Colours: <span style={{ color: '#4ade80' }}>good (concentrated/low-order)</span> · <span style={{ color: '#fbbf24' }}>moderate</span> · <span style={{ color: '#f87171' }}>excess (many modes / high-order dominant)</span>
          </div>
        </>
      )}
    </div>
  );
}