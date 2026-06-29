/**
 * BehaviouralStoryTest.jsx
 * Diagnostic only — no production changes.
 *
 * Tests whether B44 responds to design changes in the same direction and
 * severity as REW would: 10 placement variants vs baseline.
 * Produces one compact table + a final verdict.
 */
import React, { useState, useMemo } from 'react';
import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';

const FLAT_CURVE = [{ hz: 20, db: 94 }, { hz: 80, db: 94 }, { hz: 200, db: 94 }];

const ENGINE_OPTS = {
  enableModes: true,
  enableReflections: false,
  disableLateField: true,
  smoothing: 'none',
  axialQ: 4.0,
  pureDeterministicModalSum: true,
  disableModalPropagationPhase: true,
  propagationPhaseScale: 0,
  freqMinHz: 20,
  freqMaxHz: 220,
};

// ── Metrics ─────────────────────────────────────────────────────────────────
function analyse(freqsHz, splDb) {
  const band = freqsHz.map((f, i) => ({ f, db: splDb[i] })).filter(p => p.f >= 20 && p.f <= 220 && Number.isFinite(p.db));
  if (!band.length) return { nullFreq: null, nullDb: null, swing: null, deepDips: 0 };

  // Reference: median level
  const sorted = [...band].sort((a, b) => a.db - b.db);
  const medianDb = sorted[Math.floor(sorted.length / 2)].db;

  // Dominant null (lowest point)
  const minPt = sorted[0];

  // Swing = max − min
  const maxDb = sorted[sorted.length - 1].db;
  const swing = maxDb - minPt.db;

  // Deep dips: more than 8 dB below median
  const deepDips = band.filter(p => p.db < medianDb - 8).length;

  return {
    nullFreq: minPt.f,
    nullDb: minPt.db,
    swing,
    deepDips,
    medianDb,
    maxDb,
  };
}

function runSim(roomDims, seatPos, subPos) {
  const sub = { x: subPos.x, y: subPos.y, z: subPos.z, tuning: { gainDb: 0, delayMs: 0, polarity: 0 } };
  const r = simulateBassResponseRewCore(roomDims, seatPos, sub, FLAT_CURVE, ENGINE_OPTS);
  return analyse(r.freqsHz, r.splDbRaw);
}

function verdict(v, base) {
  // Null depth: deeper = better (more modal contrast, more REW-like)
  const nullDeeper = v.nullDb !== null && base.nullDb !== null && v.nullDb < base.nullDb - 1.5;
  const nullShallower = v.nullDb !== null && base.nullDb !== null && v.nullDb > base.nullDb + 1.5;
  // Swing: more swing = more design contrast
  const moreSwing = v.swing !== null && base.swing !== null && v.swing > base.swing + 2;
  const lessSwing = v.swing !== null && base.swing !== null && v.swing < base.swing - 2;
  // Deep dips change
  const moreDips = v.deepDips > base.deepDips + 1;
  const lessDips = v.deepDips < base.deepDips - 1;

  const betterCount = (nullDeeper ? 1 : 0) + (moreSwing ? 1 : 0) + (lessDips ? 1 : 0);
  const worseCount  = (nullShallower ? 1 : 0) + (lessSwing ? 1 : 0) + (moreDips ? 1 : 0);

  if (betterCount >= 2) return 'better';
  if (worseCount >= 2)  return 'worse';
  // Any single strong signal
  if (nullDeeper && moreSwing) return 'better';
  if (nullShallower && lessSwing) return 'worse';
  return 'no meaningful change';
}

const mono = { fontFamily: 'monospace' };
const fmt1 = v => (v != null && Number.isFinite(v)) ? v.toFixed(1) : '—';

function VerdictBadge({ v }) {
  const cfg = v === 'better'
    ? { bg: '#dcfce7', color: '#166534', label: '✅ better' }
    : v === 'worse'
    ? { bg: '#fee2e2', color: '#991b1b', label: '❌ worse' }
    : v === 'baseline'
    ? { bg: '#dbeafe', color: '#1e40af', label: '◆ baseline' }
    : { bg: '#f3f4f6', color: '#6b7280', label: '— no change' };
  return (
    <span style={{ display: 'inline-block', padding: '1px 7px', borderRadius: 4, fontSize: 9, fontWeight: 700, ...mono, background: cfg.bg, color: cfg.color, whiteSpace: 'nowrap' }}>
      {cfg.label}
    </span>
  );
}

export default function BehaviouralStoryTest({ roomDims, seatingPositions, subsForSimulation }) {
  const [rows, setRows] = useState(null);
  const [running, setRunning] = useState(false);
  const [ran, setRan] = useState(false);

  const activeSeat = useMemo(() => {
    const p = (seatingPositions || []).find(s => s.isPrimary);
    return p || seatingPositions?.[0] || null;
  }, [seatingPositions]);

  const seatPos = useMemo(() => {
    if (!activeSeat) return null;
    return { x: Number(activeSeat.x), y: Number(activeSeat.y), z: Number.isFinite(Number(activeSeat.z)) ? Number(activeSeat.z) : 1.2 };
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
      const W = rd.widthM;
      const sx = Number(sub0.x), sy = Number(sub0.y), sz = Number.isFinite(Number(sub0.z)) ? Number(sub0.z) : 0.35;
      const spx = seatPos.x, spy = seatPos.y, spz = seatPos.z;

      const VARIANTS = [
        { id: 'baseline',       label: 'Baseline (current)',          sub: { x: sx, y: sy, z: sz },                seat: { x: spx, y: spy, z: spz } },
        { id: 'sub_left_025',   label: 'Sub −0.25W left',             sub: { x: sx - W * 0.25, y: sy, z: sz },     seat: { x: spx, y: spy, z: spz } },
        { id: 'sub_right_025',  label: 'Sub +0.25W right',            sub: { x: sx + W * 0.25, y: sy, z: sz },     seat: { x: spx, y: spy, z: spz } },
        { id: 'sub_centre_w',   label: 'Sub at centre width',         sub: { x: W / 2, y: sy, z: sz },             seat: { x: spx, y: spy, z: spz } },
        { id: 'sub_lfc',        label: 'Sub left front corner',       sub: { x: 0.3, y: 0.3, z: sz },              seat: { x: spx, y: spy, z: spz } },
        { id: 'sub_rfc',        label: 'Sub right front corner',      sub: { x: W - 0.3, y: 0.3, z: sz },          seat: { x: spx, y: spy, z: spz } },
        { id: 'seat_fwd',       label: 'Seat 0.25 m forward',         sub: { x: sx, y: sy, z: sz },                seat: { x: spx, y: spy - 0.25, z: spz } },
        { id: 'seat_back',      label: 'Seat 0.25 m back',            sub: { x: sx, y: sy, z: sz },                seat: { x: spx, y: spy + 0.25, z: spz } },
        { id: 'seat_left',      label: 'Seat 0.25 m left',            sub: { x: sx, y: sy, z: sz },                seat: { x: spx - 0.25, y: spy, z: spz } },
        { id: 'seat_right',     label: 'Seat 0.25 m right',           sub: { x: sx, y: sy, z: sz },                seat: { x: spx + 0.25, y: spy, z: spz } },
      ];

      const computed = VARIANTS.map(v => {
        try {
          // Clamp sub/seat inside room
          const cSub = {
            x: Math.max(0.1, Math.min(W - 0.1, v.sub.x)),
            y: Math.max(0.1, Math.min(rd.lengthM - 0.1, v.sub.y)),
            z: v.sub.z,
          };
          const cSeat = {
            x: Math.max(0.1, Math.min(W - 0.1, v.seat.x)),
            y: Math.max(0.1, Math.min(rd.lengthM - 0.1, v.seat.y)),
            z: v.seat.z,
          };
          const m = runSim(rd, cSeat, cSub);
          return { ...v, ...m, error: null };
        } catch (e) {
          return { ...v, nullFreq: null, nullDb: null, swing: null, deepDips: 0, error: e.message };
        }
      });

      const base = computed[0];
      const result = computed.map((r, i) => ({
        ...r,
        verdict: i === 0 ? 'baseline' : verdict(r, base),
      }));

      setRows(result);
      setRan(true);
      setRunning(false);
    }, 10);
  }

  // ── Final verdict logic ──────────────────────────────────────────────────
  const finalVerdict = useMemo(() => {
    if (!rows) return null;
    const nonBase = rows.slice(1);
    const noBetter = nonBase.filter(r => r.verdict === 'better').length;
    const noWorse  = nonBase.filter(r => r.verdict === 'worse').length;
    const noChange = nonBase.filter(r => r.verdict === 'no meaningful change').length;
    const total    = nonBase.length;

    const storyOk = noChange < total * 0.7; // fewer than 70% "no change"
    const credibility = storyOk ? 'CREDIBLE' : 'WEAK';
    const severity = noChange >= total * 0.7 ? 'CRITICAL' : noChange >= total * 0.5 ? 'WARNING' : 'OK';

    return { noBetter, noWorse, noChange, total, credibility, severity };
  }, [rows]);

  // ── Styles ──────────────────────────────────────────────────────────────
  const thBase = { padding: '3px 7px', fontSize: 9, ...mono, fontWeight: 700, background: '#1e293b', color: '#e2e8f0', borderBottom: '2px solid #475569', whiteSpace: 'nowrap' };
  const th  = { ...thBase, textAlign: 'right' };
  const thL = { ...thBase, textAlign: 'left' };
  const tdBase = { padding: '3px 7px', fontSize: 9, ...mono, borderBottom: '1px solid #e5e7eb' };
  const td  = { ...tdBase, textAlign: 'right' };
  const tdL = { ...tdBase, textAlign: 'left' };

  const severityColor = finalVerdict?.severity === 'CRITICAL' ? '#dc2626'
    : finalVerdict?.severity === 'WARNING' ? '#d97706' : '#16a34a';

  return (
    <details style={{ border: '2px solid #334155', borderRadius: 8, background: '#f8fafc', padding: '8px 10px', marginTop: 8 }}>
      <summary style={{ fontWeight: 700, color: '#1e293b', fontSize: 11, cursor: 'pointer', ...mono }}>
        🎯 Behavioural Story Test — does B44 respond to placement changes like REW?
      </summary>

      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 9, color: '#475569', lineHeight: 1.6, marginBottom: 8, borderLeft: '3px solid #94a3b8', paddingLeft: 8, ...mono }}>
          10 placement variants vs baseline. Metrics: dominant null Hz, null depth dB, peak-to-null swing 20–220 Hz, count of dips &gt;8 dB below median.<br />
          Verdict: <strong>better</strong> = deeper null + more swing (more modal contrast, REW-like). Engine: modal-only, flat 94 dB, no smoothing.
        </div>

        <button onClick={run} disabled={!canRun || running}
          style={{ height: 28, padding: '0 14px', borderRadius: 5, border: `1px solid ${canRun ? '#334155' : '#d1d5db'}`, background: canRun ? '#1e293b' : '#f3f4f6', color: canRun ? '#fff' : '#9ca3af', fontSize: 10, fontWeight: 700, cursor: canRun ? 'pointer' : 'not-allowed', ...mono, marginBottom: 10 }}>
          {running ? 'Running…' : ran ? 'Re-run' : 'Run Behavioural Test'}
        </button>
        {!canRun && <span style={{ fontSize: 9, color: '#b45309', ...mono, marginLeft: 8 }}>Need room dims + seat + sub.</span>}

        {rows && (
          <>
            <div style={{ overflowX: 'auto', marginBottom: 10 }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 640 }}>
                <thead>
                  <tr>
                    <th style={{ ...thL, minWidth: 180 }}>Variant</th>
                    <th style={th}>Null Hz</th>
                    <th style={th}>Null dB</th>
                    <th style={th}>Swing dB</th>
                    <th style={th}>Deep dips</th>
                    <th style={{ ...thL, minWidth: 110 }}>Design verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const isBase = i === 0;
                    const rowBg = isBase ? '#e0f2fe' : i % 2 === 0 ? '#fff' : '#f8fafc';
                    return (
                      <tr key={row.id} style={{ background: rowBg }}>
                        <td style={{ ...tdL, fontWeight: isBase ? 700 : 400 }}>{row.label}</td>
                        <td style={td}>{fmt1(row.nullFreq)}</td>
                        <td style={{ ...td, color: row.nullDb != null && row.nullDb < -20 ? '#dc2626' : '#374151', fontWeight: row.nullDb != null && row.nullDb < -20 ? 700 : 400 }}>
                          {fmt1(row.nullDb)}
                        </td>
                        <td style={{ ...td, fontWeight: 600 }}>{fmt1(row.swing)}</td>
                        <td style={{ ...td, color: row.deepDips > 3 ? '#dc2626' : '#374151' }}>{row.deepDips}</td>
                        <td style={tdL}>
                          {row.error
                            ? <span style={{ color: '#dc2626', fontSize: 9 }}>⚠ {row.error}</span>
                            : <VerdictBadge v={row.verdict} />}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {finalVerdict && (
              <div style={{ border: `2px solid ${severityColor}`, borderRadius: 6, background: finalVerdict.severity === 'CRITICAL' ? '#fef2f2' : finalVerdict.severity === 'WARNING' ? '#fffbeb' : '#f0fdf4', padding: '10px 14px', fontSize: 10, ...mono, lineHeight: 1.9 }}>
                <div style={{ fontWeight: 700, color: severityColor, fontSize: 12, marginBottom: 4 }}>
                  ▶ FINAL ANSWER — B44 Design Story: {finalVerdict.credibility}
                  {finalVerdict.severity !== 'OK' && ` [${finalVerdict.severity}]`}
                </div>
                <div style={{ color: '#374151' }}>
                  Of {finalVerdict.total} placement variants:{' '}
                  <strong style={{ color: '#166534' }}>{finalVerdict.noBetter} better</strong>,{' '}
                  <strong style={{ color: '#991b1b' }}>{finalVerdict.noWorse} worse</strong>,{' '}
                  <strong style={{ color: '#6b7280' }}>{finalVerdict.noChange} no meaningful change</strong>.
                </div>
                {finalVerdict.severity === 'CRITICAL' && (
                  <div style={{ color: '#991b1b', marginTop: 4, fontSize: 9 }}>
                    ⚡ CRITICAL: ≥70% of variants show no meaningful change. B44 is NOT telling a credible design story.
                    The modal field is insufficiently sensitive to sub/seat repositioning at the current Q and absorption settings.
                    Root cause candidates: Q too low (over-damped, broad resonances smooth out placement sensitivity),
                    or the phase perturbation decorrelates position-dependent interference patterns.
                  </div>
                )}
                {finalVerdict.severity === 'WARNING' && (
                  <div style={{ color: '#92400e', marginTop: 4, fontSize: 9 }}>
                    ⚠ WARNING: 50–70% of variants show no meaningful change. Design sensitivity is marginal.
                  </div>
                )}
                {finalVerdict.severity === 'OK' && (
                  <div style={{ color: '#166534', marginTop: 4, fontSize: 9 }}>
                    ✅ B44 responds directionally to placement changes — credible design story.
                  </div>
                )}
              </div>
            )}

            <div style={{ fontSize: 8, color: '#9ca3af', marginTop: 6, ...mono }}>
              Diagnostic only. No production code changed. Modal-only engine, flat 94 dB source.
            </div>
          </>
        )}
      </div>
    </details>
  );
}