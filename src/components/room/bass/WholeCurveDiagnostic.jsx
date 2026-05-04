// WholeCurveDiagnostic.jsx
// Temporary whole-curve contribution diagnostic.
// Reads stepDebug rows (captured 30–72 Hz by the engine) and b44Series for final SPL.
// Does NOT change any simulation maths, Q values, modalGainScalar, or benchmark scoring.

import React, { useState } from 'react';

const TARGET_HZ = [20, 30, 34.3, 40, 50, 60, 68.6, 70, 80, 90, 100];
const BENCHMARK_HZ = new Set([34.3, 40, 68.6]);
const MODAL_GAIN_SCALAR = 1.8; // read-only display — matches engine constant

// ── Interpolate SPL from b44Series ────────────────────────────────────────────
function interpSpl(series, hz) {
  if (!Array.isArray(series) || series.length === 0) return null;
  const sorted = [...series].sort((a, b) => a.frequency - b.frequency);
  if (hz <= sorted[0].frequency) return sorted[0].spl;
  if (hz >= sorted[sorted.length - 1].frequency) return sorted[sorted.length - 1].spl;
  for (let i = 0; i < sorted.length - 1; i++) {
    const p1 = sorted[i], p2 = sorted[i + 1];
    if (!Number.isFinite(p1.spl) || !Number.isFinite(p2.spl)) continue;
    if (hz >= p1.frequency && hz <= p2.frequency) {
      const t = (hz - p1.frequency) / (p2.frequency - p1.frequency);
      return p1.spl + (p2.spl - p1.spl) * t;
    }
  }
  return null;
}

// ── Build one diagnostic row ───────────────────────────────────────────────────
function buildRow(targetHz, stepDebug, b44Series) {
  const nearest = Array.isArray(stepDebug) && stepDebug.length > 0
    ? stepDebug.reduce((best, row) => {
        const d = Math.abs(row.frequencyHz - targetHz);
        return best === null || d < Math.abs(best.frequencyHz - targetHz) ? row : best;
      }, null)
    : null;

  // stepDebug is only captured 30–72 Hz; treat rows more than 15 Hz away as missing
  const hasRow = nearest && Math.abs(nearest.frequencyHz - targetHz) <= 15;

  const finalSplDb = interpSpl(b44Series, targetHz);

  if (!hasRow) {
    return { targetHz, evalHz: null, finalSplDb, directMag: null, reflMag: null, lfMag: null, preModalMag: null, modalSumMag: null, postModalMag: null, curveDb: null };
  }

  const r = nearest;
  const ac = r.applicationComparison ?? {};
  const pm = r.postModal ?? {};

  const directMag   = r.direct?.amplitude ?? null;
  const reflMag     = r.summedWeightedReflectionsMag ?? null;
  const lfMag       = r.lateFieldMag ?? null;
  const preModalMag = r.summedBeforeModes?.preModalMagnitude ?? null;

  const postModalMag = ac.livePostMag ?? pm.magnitude ?? null;

  const mRe = ac.modalSumRe ?? null;
  const mIm = ac.modalSumIm ?? null;
  const modalSumMag = Number.isFinite(mRe) && Number.isFinite(mIm)
    ? Math.sqrt(mRe * mRe + mIm * mIm)
    : (ac.modalSumMag ?? null);

  return {
    targetHz,
    evalHz: r.frequencyHz,
    finalSplDb,
    directMag,
    reflMag,
    lfMag,
    preModalMag,
    modalSumMag,
    postModalMag,
    curveDb: r.curveDb ?? null,
  };
}

// ── Formatters ────────────────────────────────────────────────────────────────
const fmtDb  = (v) => Number.isFinite(v) ? v.toFixed(2) : '—';
const fmtMag = (v) => Number.isFinite(v) ? v.toFixed(4) : '—';

// ── Main component ─────────────────────────────────────────────────────────────
export default function WholeCurveDiagnostic({ b44Series, stepDebug }) {
  const [open, setOpen] = useState(false);

  if (!Array.isArray(b44Series) || b44Series.length === 0) return null;

  const rows = TARGET_HZ.map(hz => buildRow(hz, stepDebug, b44Series));

  const thBase = {
    padding: '3px 7px',
    fontSize: 10,
    fontWeight: 700,
    background: '#1e3a5f',
    color: '#bfdbfe',
    whiteSpace: 'nowrap',
    borderBottom: '2px solid #3b82f6',
  };
  const tdBase = (bold, color) => ({
    padding: '2px 7px',
    fontSize: 10,
    fontFamily: 'monospace',
    textAlign: 'right',
    fontWeight: bold ? 700 : 400,
    color: color ?? '#1e293b',
  });
  const tdLeft = { ...tdBase(false), textAlign: 'left' };

  return (
    <div style={{ marginTop: 12, border: '1px solid #3b82f6', borderRadius: 6, overflow: 'hidden', fontFamily: 'monospace' }}>
      {/* Header / toggle */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          textAlign: 'left',
          background: '#1e3a5f',
          border: 'none',
          padding: '6px 12px',
          fontSize: 11,
          fontWeight: 700,
          color: '#bfdbfe',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>⚠ Temporary whole-curve contribution diagnostic</span>
        <span style={{ fontSize: 10, opacity: 0.7 }}>{open ? '▲ collapse' : '▼ expand'}</span>
      </button>

      {open && (
        <div style={{ padding: '10px 12px', background: '#f0f9ff', overflowX: 'auto' }}>

          {/* Meta info */}
          <div style={{ fontSize: 10, color: '#1e40af', marginBottom: 8 }}>
            <strong>modalGainScalar</strong> = {MODAL_GAIN_SCALAR} (read-only · engine constant) ·{' '}
            <strong>stepDebug coverage</strong>: 30–72 Hz (outside this range modal columns show '—') ·{' '}
            <strong>finalSPL</strong>: interpolated from b44Series · magnitudes are linear pressure units
          </div>

          <table style={{ borderCollapse: 'collapse', whiteSpace: 'nowrap', fontSize: 10 }}>
            <thead>
              <tr>
                <th style={{ ...thBase, textAlign: 'left' }}>Target Hz</th>
                <th style={{ ...thBase }}>eval Hz</th>
                <th style={{ ...thBase, borderLeft: '2px solid #60a5fa' }}>Final SPL (dB)</th>
                <th style={{ ...thBase }}>product curve (dB)</th>
                <th style={{ ...thBase, borderLeft: '2px solid #60a5fa' }}>direct mag</th>
                <th style={{ ...thBase }}>refl mag</th>
                <th style={{ ...thBase }}>lateField mag</th>
                <th style={{ ...thBase, borderLeft: '2px solid #60a5fa' }}>preModal mag</th>
                <th style={{ ...thBase }}>modalSum mag</th>
                <th style={{ ...thBase, color: '#86efac' }}>postModal mag</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const isBench = BENCHMARK_HZ.has(row.targetHz);
                const bg = isBench ? '#dbeafe' : (i % 2 === 0 ? '#f8fafc' : '#ffffff');
                return (
                  <tr key={row.targetHz} style={{ background: bg, borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ ...tdLeft, fontWeight: isBench ? 700 : 600, color: isBench ? '#1d4ed8' : '#374151' }}>
                      {row.targetHz} Hz{isBench ? ' ★' : ''}
                    </td>
                    <td style={tdBase(false)}>{row.evalHz != null ? row.evalHz.toFixed(2) : '—'}</td>
                    <td style={{ ...tdBase(true, '#15803d'), borderLeft: '2px solid #93c5fd' }}>{fmtDb(row.finalSplDb)}</td>
                    <td style={tdBase(false)}>{fmtDb(row.curveDb)}</td>
                    <td style={{ ...tdBase(false), borderLeft: '2px solid #93c5fd' }}>{fmtMag(row.directMag)}</td>
                    <td style={tdBase(false)}>{fmtMag(row.reflMag)}</td>
                    <td style={tdBase(false)}>{fmtMag(row.lfMag)}</td>
                    <td style={{ ...tdBase(false), borderLeft: '2px solid #93c5fd' }}>{fmtMag(row.preModalMag)}</td>
                    <td style={tdBase(false)}>{fmtMag(row.modalSumMag)}</td>
                    <td style={tdBase(true, '#15803d')}>{fmtMag(row.postModalMag)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div style={{ marginTop: 8, fontSize: 10, color: '#64748b' }}>
            ★ = REW benchmark checkpoint. Blue rows. All other columns '—' outside 30–72 Hz stepDebug capture range.
          </div>
        </div>
      )}
    </div>
  );
}