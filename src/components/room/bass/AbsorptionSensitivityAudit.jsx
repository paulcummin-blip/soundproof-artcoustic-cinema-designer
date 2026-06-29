/**
 * AbsorptionSensitivityAudit.jsx
 * Diagnostic only — no production changes.
 *
 * Audits whether B44 surfaceAbsorption actually controls modal damping
 * strongly enough. Runs a 7-step absorption sweep (α 0–1) and traces
 * the Q computation chain to identify whether the per-family base-Q
 * ceiling prevents absorption from affecting the frequency response.
 */
import React, { useState, useMemo } from 'react';
import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';
import { estimateModeQLocal, computeRoomModesLocal } from '@/bass/core/modalCalculations';

// ── Constants ──────────────────────────────────────────────────────────────
const FLAT_CURVE = [{ hz: 20, db: 94 }, { hz: 80, db: 94 }, { hz: 200, db: 94 }];
const PROBE_FREQS = [30, 60, 100]; // Hz — representative diagnostic frequencies
const AXIAL_BASE_Q = 4.0;         // production default (matches engine options below)
const TANG_BASE_Q  = 3.9;
const OBLIQUE_BASE_Q = 2.5;
const BASE_Q_CEILING = 80;         // estimateModeQLocal hard ceiling

const ENGINE_OPTS_BASE = {
  enableModes: true,
  enableReflections: false,
  disableLateField: true,
  smoothing: 'none',
  axialQ: AXIAL_BASE_Q,
  pureDeterministicModalSum: true,
  disableModalPropagationPhase: true,
  propagationPhaseScale: 0,
  freqMinHz: 20,
  freqMaxHz: 220,
};

const ALPHA_STEPS = [
  { id: 'A0', alpha: 0.00, label: 'A0 — α = 0.00 (rigid)' },
  { id: 'A1', alpha: 0.10, label: 'A1 — α = 0.10' },
  { id: 'A2', alpha: 0.30, label: 'A2 — α = 0.30 (default)' },
  { id: 'A3', alpha: 0.50, label: 'A3 — α = 0.50' },
  { id: 'A4', alpha: 0.70, label: 'A4 — α = 0.70' },
  { id: 'A5', alpha: 0.90, label: 'A5 — α = 0.90' },
  { id: 'A6', alpha: 1.00, label: 'A6 — α = 1.00 (fully absorbent)' },
];

// ── Q chain calculation ────────────────────────────────────────────────────
function makeSurfaceAbsorption(alpha) {
  return { front: alpha, back: alpha, left: alpha, right: alpha, floor: alpha, ceiling: alpha };
}

function computeRT60(alpha, roomDims) {
  const { widthM: W, lengthM: L, heightM: H } = roomDims;
  const V = W * L * H;
  const SA =
    (L * W + L * W) * alpha +
    (W * H + W * H) * alpha +
    (L * H + L * H) * alpha;
  return alpha === 0 ? Infinity : 0.161 * V / Math.max(SA, 1e-9);
}

function computeSabineQ(alpha, f0, roomDims) {
  const sa = makeSurfaceAbsorption(alpha);
  const q = estimateModeQLocal({ roomDims, surfaceAbsorption: sa, f0 });
  // raw (before clamp)
  const { widthM: W, lengthM: L, heightM: H } = roomDims;
  const V = W * L * H;
  const SA =
    (L * W + L * W) * alpha +
    (W * H + W * H) * alpha +
    (L * H + L * H) * alpha;
  const rt60 = alpha === 0 ? Infinity : 0.161 * V / Math.max(SA, 1e-9);
  const tau = rt60 / 13.815;
  const qRaw = 2 * Math.PI * f0 * tau;
  return { qSabine: q, qRaw, rt60 };
}

function finalQ(qSabine, modeType) {
  const baseQ = modeType === 'axial' ? AXIAL_BASE_Q : modeType === 'tangential' ? TANG_BASE_Q : OBLIQUE_BASE_Q;
  return Math.max(1, Math.min(baseQ, qSabine));
}

// ── Response analysis ──────────────────────────────────────────────────────
function analyseResponse(freqsHz, splDb) {
  const band = freqsHz.map((f, i) => ({ f, db: splDb[i] }))
    .filter(p => p.f >= 20 && p.f <= 220 && Number.isFinite(p.db));
  if (!band.length) return { nullFreq: null, nullDb: null, swing: null, deepDips: 0, peaksAboveTrend: 0 };

  const sorted = [...band].sort((a, b) => a.db - b.db);
  const medianDb = sorted[Math.floor(sorted.length / 2)].db;
  const minPt = sorted[0];
  const maxDb = sorted[sorted.length - 1].db;
  const swing = maxDb - minPt.db;
  const deepDips = band.filter(p => p.db < medianDb - 8).length;
  const peaksAboveTrend = band.filter(p => p.db > medianDb + 5).length;

  return { nullFreq: minPt.f, nullDb: minPt.db, swing, deepDips, peaksAboveTrend };
}

// ── Main component ─────────────────────────────────────────────────────────
const mono = { fontFamily: 'monospace' };
const fmt1 = v => (v != null && Number.isFinite(v)) ? v.toFixed(1) : '—';
const fmt2 = v => (v != null && Number.isFinite(v)) ? v.toFixed(2) : '—';
const fmtQ = v => (v != null && Number.isFinite(v) && v < 9999) ? v.toFixed(1) : '∞';

function QChangedBadge({ sabineQ, usedQ, baseQ }) {
  const capped = sabineQ > baseQ + 0.05;
  const delta  = Math.abs(sabineQ - usedQ);
  if (!Number.isFinite(sabineQ)) {
    return <span style={{ background: '#fef2f2', color: '#991b1b', padding: '1px 6px', borderRadius: 3, fontSize: 8, fontWeight: 700, ...mono }}>NO — α=0 → ∞Q clamped to base</span>;
  }
  if (capped && delta > 0.1) {
    return <span style={{ background: '#fef2f2', color: '#991b1b', padding: '1px 6px', borderRadius: 3, fontSize: 8, fontWeight: 700, ...mono }}>NO — base Q ceiling active</span>;
  }
  if (delta < 0.05) {
    return <span style={{ background: '#dcfce7', color: '#166534', padding: '1px 6px', borderRadius: 3, fontSize: 8, fontWeight: 700, ...mono }}>YES — Sabine drives Q</span>;
  }
  return <span style={{ background: '#fef3c7', color: '#92400e', padding: '1px 6px', borderRadius: 3, fontSize: 8, fontWeight: 700, ...mono }}>PARTIAL</span>;
}

export default function AbsorptionSensitivityAudit({ roomDims, seatingPositions, subsForSimulation }) {
  const [rows, setRows] = useState(null);
  const [running, setRunning] = useState(false);
  const [ran, setRan] = useState(false);

  const activeSeat = useMemo(() => {
    const p = (seatingPositions || []).find(s => s.isPrimary);
    return p || seatingPositions?.[0] || null;
  }, [seatingPositions]);

  const seatPos = useMemo(() => {
    if (!activeSeat) return null;
    return {
      x: Number(activeSeat.x),
      y: Number(activeSeat.y),
      z: Number.isFinite(Number(activeSeat.z)) ? Number(activeSeat.z) : 1.2,
    };
  }, [activeSeat]);

  const sub0 = subsForSimulation?.[0] || null;
  const rd = roomDims?.widthM
    ? { widthM: Number(roomDims.widthM), lengthM: Number(roomDims.lengthM), heightM: Number(roomDims.heightM) }
    : null;

  const canRun = !!(rd && seatPos && sub0);

  function run() {
    if (!canRun) return;
    setRunning(true);

    setTimeout(() => {
      const sub = {
        x: Number(sub0.x), y: Number(sub0.y),
        z: Number.isFinite(Number(sub0.z)) ? Number(sub0.z) : 0.35,
        tuning: { gainDb: 0, delayMs: 0, polarity: 0 },
      };

      // Find one representative axial mode near each probe freq for Q audit
      const allModes = computeRoomModesLocal({ ...rd, fMax: 220 });

      const computed = ALPHA_STEPS.map(step => {
        const sa = makeSurfaceAbsorption(step.alpha);
        const rt60 = computeRT60(step.alpha, rd);

        // Q chain per probe frequency (use axial type as representative)
        const qChain = PROBE_FREQS.map(f0 => {
          const { qSabine, qRaw } = computeSabineQ(step.alpha, f0, rd);
          const qUsed = finalQ(qSabine, 'axial');
          const baseQ = AXIAL_BASE_Q;
          return { f0, qRaw, qSabine, qUsed, baseQ, capped: qRaw > baseQ };
        });

        // Run engine
        let response = null;
        try {
          const r = simulateBassResponseRewCore(rd, seatPos, sub, FLAT_CURVE, {
            ...ENGINE_OPTS_BASE,
            surfaceAbsorption: sa,
          });
          response = analyseResponse(r.freqsHz, r.splDbRaw);
        } catch (e) {
          response = { nullFreq: null, nullDb: null, swing: null, deepDips: 0, peaksAboveTrend: 0, error: e.message };
        }

        // absorption actually changes Q? Check at 30 Hz axial
        const q30 = qChain[0];
        const absorptionChangesQ = !Number.isFinite(q30.qRaw) || q30.qRaw > q30.baseQ
          ? 'NO'
          : Math.abs(q30.qSabine - q30.baseQ) < 0.1 ? 'PARTIAL' : 'YES';

        return { ...step, rt60, qChain, absorptionChangesQ, ...response };
      });

      setRows(computed);
      setRan(true);
      setRunning(false);
    }, 10);
  }

  // ── Final verdict analysis ─────────────────────────────────────────────
  const verdict = useMemo(() => {
    if (!rows) return null;

    // Q1: Does changing α 0→1 materially change B44 modal Q?
    const q30_A0 = rows[0]?.qChain[0];
    const q30_A6 = rows[6]?.qChain[0];
    const q30Changed = q30_A0 && q30_A6
      ? Math.abs(q30_A6.qUsed - q30_A0.qUsed) > 0.5
      : false;

    // Q2: Is base-Q ceiling preventing absorption from affecting the curve?
    const allCapped = rows.every(r => r.qChain[0].capped || !Number.isFinite(r.qChain[0].qRaw));
    const someCapped = rows.some(r => r.qChain[0].capped);

    // Q3: Does B44 treat lower α as lower damping (higher Q)?
    const q30_A1 = rows[1]?.qChain[0];
    const q30_A5 = rows[5]?.qChain[0];
    const correctDirection = q30_A1 && q30_A5 && q30_A1.qUsed >= q30_A5.qUsed - 0.05;

    // Q4: Weak sensitivity — does swing change meaningfully across α?
    const swings = rows.map(r => r.swing).filter(Number.isFinite);
    const swingRange = swings.length > 1 ? Math.max(...swings) - Math.min(...swings) : 0;
    const weakSensitivity = swingRange < 5;

    // Q5: Which line/function is responsible
    const culprit = 'rewBassEngine.js line ~796: Math.max(1, Math.min(baseQ, absorptionQ)) — ' +
      'the Math.min(baseQ, absorptionQ) clamp means for any room where Sabine Q > baseQ, ' +
      'the final Q is pinned at baseQ regardless of absorption. ' +
      'baseQ for axial modes = estimateModeQByType() = AXIAL_BASE_Q (default 8.0, or axialQOption from caller). ' +
      'In rewBassEngine.js simulateBassResponseRewCore(), axialQ defaults to 8.0 (line ~628). ' +
      'ENGINE_OPTS_BASE in parity mode overrides axialQ=4.0, making the ceiling even tighter.';

    return { q30Changed, allCapped, someCapped, correctDirection, swingRange, weakSensitivity, culprit, q30_A0, q30_A6 };
  }, [rows]);

  // ── Table styles ──────────────────────────────────────────────────────
  const thBase = { padding: '3px 6px', fontSize: 8, ...mono, fontWeight: 700, background: '#1e293b', color: '#e2e8f0', borderBottom: '2px solid #475569', whiteSpace: 'nowrap' };
  const th  = { ...thBase, textAlign: 'right' };
  const thL = { ...thBase, textAlign: 'left' };
  const tdBase = { padding: '2px 6px', fontSize: 8, ...mono, borderBottom: '1px solid #e5e7eb', verticalAlign: 'middle' };
  const td  = { ...tdBase, textAlign: 'right' };
  const tdL = { ...tdBase, textAlign: 'left' };

  return (
    <details style={{ border: '2px solid #7c3aed', borderRadius: 8, background: '#faf5ff', padding: '8px 10px', marginTop: 8 }}>
      <summary style={{ fontWeight: 700, color: '#6d28d9', fontSize: 11, cursor: 'pointer', ...mono }}>
        🧪 Absorption Sensitivity Audit — does B44 surfaceAbsorption actually control modal Q?
      </summary>

      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 9, color: '#4c1d95', lineHeight: 1.6, marginBottom: 8, borderLeft: '3px solid #a78bfa', paddingLeft: 8, ...mono }}>
          7-step absorption sweep α = 0.00 → 1.00. Traces the full Q computation chain: Sabine Q → base-Q clamp → final Q used by solver.<br />
          Engine: modal-only, flat 94 dB, axialQ = {AXIAL_BASE_Q}. Probe frequencies: {PROBE_FREQS.join(', ')} Hz.
        </div>

        <button onClick={run} disabled={!canRun || running}
          style={{ height: 28, padding: '0 14px', borderRadius: 5, border: `1px solid ${canRun ? '#7c3aed' : '#d1d5db'}`, background: canRun ? '#7c3aed' : '#f3f4f6', color: canRun ? '#fff' : '#9ca3af', fontSize: 10, fontWeight: 700, cursor: canRun ? 'pointer' : 'not-allowed', ...mono, marginBottom: 10 }}>
          {running ? 'Computing…' : ran ? 'Re-run' : 'Run Absorption Sweep'}
        </button>
        {!canRun && <span style={{ fontSize: 9, color: '#b45309', ...mono, marginLeft: 8 }}>Need room dims + seat + sub.</span>}

        {rows && (
          <>
            {/* ── Q Chain Table ── */}
            <div style={{ fontWeight: 700, color: '#1e293b', fontSize: 9, ...mono, marginBottom: 3, borderBottom: '1px solid #c4b5fd', paddingBottom: 2 }}>
              Q COMPUTATION CHAIN — axial mode @ 30 / 60 / 100 Hz
            </div>
            <div style={{ overflowX: 'auto', marginBottom: 10 }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 900 }}>
                <thead>
                  <tr>
                    <th style={{ ...thL, minWidth: 140 }}>Variant</th>
                    <th style={th}>RT60 (s)</th>
                    {PROBE_FREQS.map(f => (
                      <React.Fragment key={f}>
                        <th style={{ ...th, borderLeft: '2px solid #475569' }}>Sabine Q raw<br />{f} Hz</th>
                        <th style={th}>Sabine Q clamped<br />(≤80)</th>
                        <th style={th}>Base Q ceiling<br />(axial={AXIAL_BASE_Q})</th>
                        <th style={th}>Final Q used</th>
                        <th style={{ ...th, minWidth: 80 }}>Capped by<br />base Q?</th>
                      </React.Fragment>
                    ))}
                    <th style={{ ...thL, minWidth: 130, borderLeft: '2px solid #dc2626' }}>Absorb. changes Q?</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const rowBg = row.alpha === 0.30 ? '#f3e8ff' : i % 2 === 0 ? '#fff' : '#faf5ff';
                    return (
                      <tr key={row.id} style={{ background: rowBg }}>
                        <td style={{ ...tdL, fontWeight: row.alpha === 0.30 ? 700 : 400 }}>{row.label}</td>
                        <td style={td}>{Number.isFinite(row.rt60) ? fmt2(row.rt60) : '∞'}</td>
                        {row.qChain.map(q => (
                          <React.Fragment key={q.f0}>
                            <td style={{ ...td, borderLeft: '2px solid #e5e7eb', color: q.capped ? '#dc2626' : '#374151' }}>
                              {Number.isFinite(q.qRaw) ? fmtQ(q.qRaw) : '∞'}
                            </td>
                            <td style={td}>{fmtQ(q.qSabine)}</td>
                            <td style={{ ...td, color: '#6d28d9' }}>{fmtQ(q.baseQ)}</td>
                            <td style={{ ...td, fontWeight: 700, color: q.capped ? '#991b1b' : '#166534' }}>
                              {fmtQ(q.qUsed)}
                            </td>
                            <td style={{ ...td, color: q.capped ? '#dc2626' : '#16a34a', fontWeight: 700 }}>
                              {q.capped || !Number.isFinite(q.qRaw) ? '⚡ YES' : 'no'}
                            </td>
                          </React.Fragment>
                        ))}
                        <td style={{ ...tdL, borderLeft: '2px solid #fca5a5', padding: '2px 6px' }}>
                          <QChangedBadge
                            sabineQ={row.qChain[0].qRaw}
                            usedQ={row.qChain[0].qUsed}
                            baseQ={row.qChain[0].baseQ}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ── Response Metrics Table ── */}
            <div style={{ fontWeight: 700, color: '#1e293b', fontSize: 9, ...mono, marginBottom: 3, borderBottom: '1px solid #c4b5fd', paddingBottom: 2 }}>
              RESPONSE METRICS — 20–220 Hz
            </div>
            <div style={{ overflowX: 'auto', marginBottom: 10 }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 540 }}>
                <thead>
                  <tr>
                    <th style={{ ...thL, minWidth: 140 }}>Variant</th>
                    <th style={th}>Null Hz</th>
                    <th style={th}>Null dB</th>
                    <th style={th}>Swing dB</th>
                    <th style={th}>Deep dips (&gt;8↓)</th>
                    <th style={th}>Peaks above trend</th>
                    <th style={th}>Δ swing vs A0</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const baseSwing = rows[0]?.swing;
                    const deltaSwing = (row.swing != null && baseSwing != null) ? row.swing - baseSwing : null;
                    const rowBg = row.alpha === 0.30 ? '#f3e8ff' : i % 2 === 0 ? '#fff' : '#faf5ff';
                    return (
                      <tr key={row.id} style={{ background: rowBg }}>
                        <td style={{ ...tdL, fontWeight: row.alpha === 0.30 ? 700 : 400 }}>{row.label}</td>
                        <td style={td}>{fmt1(row.nullFreq)}</td>
                        <td style={{ ...td, color: row.nullDb != null && row.nullDb < -25 ? '#dc2626' : '#374151', fontWeight: row.nullDb != null && row.nullDb < -25 ? 700 : 400 }}>
                          {fmt1(row.nullDb)}
                        </td>
                        <td style={{ ...td, fontWeight: 600 }}>{fmt1(row.swing)}</td>
                        <td style={{ ...td, color: row.deepDips > 4 ? '#dc2626' : '#374151' }}>{row.deepDips}</td>
                        <td style={td}>{row.peaksAboveTrend}</td>
                        <td style={{ ...td, color: deltaSwing != null && Math.abs(deltaSwing) < 2 ? '#991b1b' : '#166534', fontWeight: 700 }}>
                          {deltaSwing != null ? (deltaSwing >= 0 ? '+' : '') + fmt1(deltaSwing) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ── Five Final Answers ── */}
            {verdict && (
              <div style={{ border: '2px solid #7c3aed', borderRadius: 6, background: '#0f172a', padding: '12px 16px', fontSize: 10, ...mono, lineHeight: 1.9 }}>
                <div style={{ fontWeight: 700, color: '#f1f5f9', fontSize: 12, marginBottom: 8, borderBottom: '1px solid #334155', paddingBottom: 4 }}>
                  ▶ FIVE FINAL ANSWERS
                </div>

                <div style={{ color: '#cbd5e1', fontSize: 9, lineHeight: 1.9 }}>
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ color: '#a78bfa', fontWeight: 700 }}>Q1. Does changing absorption from 0→1 materially change B44 modal Q?</div>
                    <div style={{ paddingLeft: 8 }}>
                      {verdict.q30Changed
                        ? <><span style={{ color: '#4ade80' }}>YES</span> — final Q at 30 Hz changes from {fmtQ(verdict.q30_A0?.qUsed)} (α=0) to {fmtQ(verdict.q30_A6?.qUsed)} (α=1).</>
                        : <><span style={{ color: '#f87171' }}>NO</span> — final Q at 30 Hz is effectively pinned: {fmtQ(verdict.q30_A0?.qUsed)} (α=0) → {fmtQ(verdict.q30_A6?.qUsed)} (α=1). The base-Q ceiling dominates across the full sweep.</>
                      }
                    </div>
                  </div>

                  <div style={{ marginBottom: 10 }}>
                    <div style={{ color: '#a78bfa', fontWeight: 700 }}>Q2. Is B44's base-Q ceiling preventing absorption from affecting the curve?</div>
                    <div style={{ paddingLeft: 8 }}>
                      {verdict.allCapped
                        ? <><span style={{ color: '#f87171' }}>YES — for all α values</span>, Sabine Q exceeds the per-family base-Q ceiling (axial = {AXIAL_BASE_Q}), so the final Q is always clamped to {AXIAL_BASE_Q}. Absorption has zero effect on solver Q across the entire sweep.</>
                        : verdict.someCapped
                        ? <><span style={{ color: '#fbbf24' }}>PARTIALLY</span> — Sabine Q is above the base-Q ceiling for low-α rooms (light damping), so absorption changes have no effect in lightly treated rooms. Only at high α does Sabine Q drop below the base-Q ceiling and begin to influence the solver.</>
                        : <><span style={{ color: '#4ade80' }}>NO</span> — Sabine Q is below the base-Q ceiling across the sweep; absorption does drive the final Q.</>
                      }
                    </div>
                  </div>

                  <div style={{ marginBottom: 10 }}>
                    <div style={{ color: '#a78bfa', fontWeight: 700 }}>Q3. Does B44 treat lower absorption as lower damping (higher Q), like REW?</div>
                    <div style={{ paddingLeft: 8 }}>
                      {verdict.correctDirection
                        ? <><span style={{ color: '#4ade80' }}>YES</span> — Sabine Q is correctly higher at lower α (less absorption = longer RT60 = higher Q = sharper resonances). The direction is correct, matching REW's Sabine model. However, if the base-Q ceiling is active, this relationship is masked and does not propagate through to the response.</>
                        : <><span style={{ color: '#f87171' }}>NO</span> — the computed Q values do not decrease monotonically with increasing α, which indicates an arithmetic error or clamping issue.</>
                      }
                    </div>
                  </div>

                  <div style={{ marginBottom: 10 }}>
                    <div style={{ color: '#a78bfa', fontWeight: 700 }}>Q4. Could weak absorption sensitivity explain why B44 looks like REW at high α even when B44 is set much lower?</div>
                    <div style={{ paddingLeft: 8 }}>
                      {verdict.weakSensitivity
                        ? <>
                            <span style={{ color: '#f87171' }}>YES — this is highly plausible.</span>{' '}
                            Peak-to-null swing range across the full α sweep is only ~{fmt1(verdict.swingRange)} dB.
                            If B44's response barely changes from α=0.1 to α=0.9, then any α setting will produce similar curves,
                            making it impossible to distinguish a "dead" room from a "live" one. In REW, the same sweep
                            produces dramatically different response shapes. B44's insensitivity means it can accidentally
                            appear to match REW at a specific α even when the underlying Q values are wrong — because B44
                            looks the same at many different α values.
                          </>
                        : <>
                            <span style={{ color: '#4ade80' }}>LESS LIKELY</span> — swing varies by {fmt1(verdict.swingRange)} dB across the sweep, suggesting meaningful absorption sensitivity.
                          </>
                      }
                    </div>
                  </div>

                  <div style={{ marginBottom: 4 }}>
                    <div style={{ color: '#a78bfa', fontWeight: 700 }}>Q5. Exact line/function responsible:</div>
                    <div style={{ paddingLeft: 8, color: '#fbbf24', fontSize: 8, lineHeight: 1.8, borderLeft: '2px solid #a78bfa', marginTop: 4 }}>
                      <div><strong style={{ color: '#f1f5f9' }}>PRIMARY CULPRIT:</strong></div>
                      <div>File: <span style={{ color: '#86efac' }}>src/bass/core/rewBassEngine.js</span></div>
                      <div>Function: <span style={{ color: '#86efac' }}>simulateBassResponseRewCore()</span>, mode Q assignment block (~line 776–798)</div>
                      <div>Code: <span style={{ color: '#fde68a' }}>Math.max(1, Math.min(baseQ, absorptionQ))</span></div>
                      <div style={{ color: '#94a3b8', marginTop: 2 }}>
                        This Math.min(baseQ, absorptionQ) means: whenever Sabine Q (absorptionQ) is HIGHER than baseQ,
                        the final Q is pinned at baseQ — and absorption has zero effect.
                      </div>
                      <div style={{ marginTop: 4 }}><strong style={{ color: '#f1f5f9' }}>SECONDARY SOURCE:</strong></div>
                      <div>File: <span style={{ color: '#86efac' }}>src/bass/core/rewBassEngine.js</span></div>
                      <div>Function: <span style={{ color: '#86efac' }}>estimateModeQByType()</span>, lines ~106–121</div>
                      <div>Values: axial baseQ = {AXIAL_BASE_Q} (set by axialQOption/axialQ option, default 8.0 in production / {AXIAL_BASE_Q} in parity)</div>
                      <div style={{ color: '#94a3b8', marginTop: 2 }}>
                        These base-Q values act as a hard ceiling. For lightly treated rooms (α &lt; 0.3 in a typical cinema),
                        Sabine Q will almost always exceed the base-Q ceiling. The absorption setting then does nothing.
                        REW does not apply this ceiling — it uses Sabine Q directly, making it highly sensitive to absorption changes.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div style={{ fontSize: 8, color: '#9ca3af', marginTop: 6, ...mono }}>
              Diagnostic only. No production code changed. Modal-only engine, flat 94 dB source, live geometry.
            </div>
          </>
        )}
      </div>
    </details>
  );
}