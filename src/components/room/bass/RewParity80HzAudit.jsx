/**
 * RewParity80HzAudit — 80 Hz Complex Sum Audit
 *
 * Diagnostic-only. Computes the true modal complex vector cancellation audit
 * at 70, 80, 85, and 90 Hz using the same settings as the 80 Hz investigation:
 *   Q = 0.80, tangential = 0.80, axial = 1.0, oblique = 1.0
 *
 * Uses the actual activeModalContributorDebugSeries from the engine.
 * Does NOT affect the live graph, production defaults, or scoring logic.
 */
import React, { useState, useCallback } from 'react';
import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';

const Q_SCALE    = 0.80;
const TANG_SCALE = 0.80;
const TARGET_FREQUENCIES = [70, 80, 85, 90];

const REW_BENCHMARK = {
  70: 86.8,
  80: 79.7,
  85: 90.8,
  90: null,
};

const FLAT_SOURCE_CURVE = [
  { hz: 20, db: 94 }, { hz: 50, db: 94 }, { hz: 100, db: 94 }, { hz: 200, db: 94 },
];

// ─── formatting helpers ───────────────────────────────────────────────────────

function f4(v)  { return Number.isFinite(v) ? v.toFixed(4) : '—'; }
function f2(v)  { return Number.isFinite(v) ? v.toFixed(2) : '—'; }
function f1(v)  { return Number.isFinite(v) ? v.toFixed(1) : '—'; }
function fDeg(v){ return Number.isFinite(v) ? v.toFixed(1) + '°' : '—'; }
function sign(v){ return v > 0 ? '+' : ''; }

// ─── engine call ─────────────────────────────────────────────────────────────

function runSim(roomDims, seat, sub, surfaceAbsorption, activeSettings) {
  const seatZ    = Number.isFinite(Number(seat?.z)) ? Number(seat.z) : 1.2;
  const baseAxialQ = activeSettings?.axialQ ?? 8;
  return simulateBassResponseRewCore(
    { widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM },
    { x: seat.x, y: seat.y, z: seatZ },
    sub,
    FLAT_SOURCE_CURVE,
    {
      enableReflections:            false,
      enableModes:                  true,
      surfaceAbsorption,
      freqMinHz:                    20,
      freqMaxHz:                    200,
      smoothing:                    'none',
      modalSourceReferenceMode:     activeSettings?.modalSourceReferenceMode ?? 'existing',
      modalGainScalar:              activeSettings?.modalGainScalar          ?? 1.0,
      axialQ:                       baseAxialQ * Q_SCALE,
      modalStorageMode:             'none',
      propagationPhaseScale:        0,
      pureDeterministicModalSum:    true,
      disableModalPropagationPhase: true,
      modalCoherenceMode:           'coherent',
      highOrderAxialScale:          activeSettings?.highOrderAxialScale          ?? 1.0,
      rewParityModalMagnitudeScale: activeSettings?.rewParityModalMagnitudeScale ?? 1.0,
      debugReflectionOrder:         1,
      disableLateField:             true,
      tangentialFamilyScale:        TANG_SCALE,
      axialFamilyScale:             1.0,
      obliqueFamilyScale:           1.0,
    }
  );
}

// Find closest frequency bin within 3 Hz
function findBin(series, targetHz) {
  if (!Array.isArray(series) || series.length === 0) return null;
  let best = null, bestDist = Infinity;
  for (const bin of series) {
    const d = Math.abs(bin.frequencyHz - targetHz);
    if (d < bestDist) { bestDist = d; best = bin; }
  }
  return bestDist <= 3 ? best : null;
}

// Interpolate simulated SPL at targetHz
function interpolateSpl(freqsHz, splDbRaw, targetHz) {
  if (!freqsHz || !splDbRaw) return null;
  let best = null, bestDist = Infinity;
  for (let i = 0; i < freqsHz.length; i++) {
    const d = Math.abs(freqsHz[i] - targetHz);
    if (d < bestDist) { bestDist = d; best = splDbRaw[i]; }
  }
  return bestDist <= 3 ? best : null;
}

// ─── per-frequency analysis ───────────────────────────────────────────────────

function analyseFreq(bin, freqsHz, splDbRaw, targetHz) {
  if (!bin) return null;

  // Use engine-provided sums directly
  const totalRe  = bin.modalSumRe ?? 0;
  const totalIm  = bin.modalSumIm ?? 0;
  const magnitude = Math.sqrt(totalRe * totalRe + totalIm * totalIm);
  const phaseDeg  = (Math.atan2(totalIm, totalRe) * 180) / Math.PI;
  const simSpl    = interpolateSpl(freqsHz, splDbRaw, targetHz);
  const rewTarget = REW_BENCHMARK[targetHz] ?? null;
  const error     = (simSpl != null && rewTarget != null) ? simSpl - rewTarget : null;

  // Top 10 contributors sorted by activeMagnitude
  const sorted = [...(bin.contributors ?? [])]
    .sort((a, b) => (b.activeMagnitude ?? 0) - (a.activeMagnitude ?? 0))
    .slice(0, 10);

  // For each mode, classify reinforcing vs cancelling via dot-product with total sum vector
  let reinforcingMag = 0;
  let cancellingMag  = 0;

  const modes = sorted.map((c, i) => {
    const re   = c.activeReal    ?? 0;
    const im   = c.activeImag    ?? 0;
    const mag  = c.activeMagnitude ?? Math.sqrt(re * re + im * im);
    const phase = c.activePhaseAngleDeg ??
      ((Math.atan2(im, re) * 180) / Math.PI);

    // Dot product: mode vector · total sum vector
    const dot = re * totalRe + im * totalIm;
    const relation = dot >= 0 ? 'Reinforcing' : 'Cancelling';

    if (dot >= 0) reinforcingMag += mag;
    else          cancellingMag  += mag;

    return {
      rank:     i + 1,
      nx:       c.nx,
      ny:       c.ny,
      nz:       c.nz,
      family:   c.modeType,
      modeHz:   c.modeFrequencyHz,
      q:        c.qValue,
      re,
      im,
      mag,
      phaseDeg: phase,
      relation,
    };
  });

  const cancellationRatio = (reinforcingMag + cancellingMag) > 0
    ? cancellingMag / (reinforcingMag + cancellingMag)
    : 0;

  return {
    targetHz,
    totalRe,
    totalIm,
    magnitude,
    phaseDeg,
    simSpl,
    rewTarget,
    error,
    reinforcingMag,
    cancellingMag,
    cancellationRatio,
    modes,
  };
}

// ─── styles ───────────────────────────────────────────────────────────────────

const S = {
  wrap:   { marginTop: 12, border: '1px solid #fb923c', borderRadius: 8, background: '#fff7ed', padding: '10px 12px' },
  title:  { fontWeight: 700, color: '#9a3412', fontSize: 11, fontFamily: 'monospace', marginBottom: 4 },
  sub:    { fontWeight: 400, color: '#fb923c', marginLeft: 8, fontSize: 10 },
  btn:    { height: 28, padding: '0 14px', borderRadius: 6, border: '1px solid #ea580c', fontSize: 11, fontFamily: 'monospace', fontWeight: 600, cursor: 'pointer', marginBottom: 12 },
  card:   { border: '1px solid #fed7aa', borderRadius: 6, padding: '8px 10px', marginBottom: 10, background: '#fffbf5' },
  fHead:  { display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 6, flexWrap: 'wrap' },
  fHz:    { fontWeight: 700, fontSize: 13, color: '#9a3412', fontFamily: 'monospace' },
  metric: { fontSize: 10, fontFamily: 'monospace', color: '#374151' },
  bold:   { fontWeight: 700 },
  sumRow: { display: 'flex', flexWrap: 'wrap', gap: '8px 20px', padding: '5px 0', fontSize: 9, fontFamily: 'monospace', borderBottom: '1px solid #fed7aa', marginBottom: 6 },
  sumLbl: { color: '#9a3412', fontWeight: 700 },
  sumVal: { color: '#1e3a5f' },
  tbl:    { borderCollapse: 'collapse', width: '100%', minWidth: 760, fontSize: 9, fontFamily: 'monospace' },
  th:     { textAlign: 'right', padding: '2px 5px', fontWeight: 700, background: '#fff7ed', borderBottom: '2px solid #fb923c', color: '#9a3412', whiteSpace: 'nowrap' },
  td:     { textAlign: 'right', padding: '2px 5px' },
};

function SumVal({ label, value }) {
  return (
    <span>
      <span style={S.sumLbl}>{label}: </span>
      <span style={S.sumVal}>{value}</span>
    </span>
  );
}

function errorColor(e) {
  if (e == null) return '#9ca3af';
  return Math.abs(e) > 5 ? '#dc2626' : Math.abs(e) > 3 ? '#b45309' : '#166534';
}

function FreqPanel({ data }) {
  if (!data) return (
    <div style={{ ...S.card, fontSize: 9, color: '#9ca3af', fontFamily: 'monospace' }}>
      No engine data at this frequency.
    </div>
  );

  const { targetHz, totalRe, totalIm, magnitude, phaseDeg, simSpl, rewTarget, error,
          reinforcingMag, cancellingMag, cancellationRatio, modes } = data;

  const totalSplDb = 20 * Math.log10(Math.max(magnitude, 1e-10));

  return (
    <div style={S.card}>
      {/* Frequency header */}
      <div style={S.fHead}>
        <span style={S.fHz}>{targetHz} Hz</span>
        <span style={S.metric}>REW target: <span style={S.bold}>{rewTarget != null ? rewTarget.toFixed(1) : '—'} dB</span></span>
        <span style={S.metric}>Simulated: <span style={S.bold}>{simSpl != null ? f1(simSpl) : '—'} dB</span></span>
        <span style={{ ...S.metric, fontWeight: 700, color: errorColor(error) }}>
          Error: {error != null ? sign(error) + error.toFixed(1) + ' dB' : '—'}
        </span>
      </div>

      {/* Complex sum summary */}
      <div style={S.sumRow}>
        <SumVal label="Total Re"         value={f4(totalRe)} />
        <SumVal label="Total Im"         value={f4(totalIm)} />
        <SumVal label="Vector mag"       value={f4(magnitude)} />
        <SumVal label="Modal SPL"        value={f1(totalSplDb) + ' dB'} />
        <SumVal label="Vector phase"     value={fDeg(phaseDeg)} />
        <SumVal label="Reinforcing mag"  value={f4(reinforcingMag)} />
        <SumVal label="Cancelling mag"   value={f4(cancellingMag)} />
        <SumVal label="Cancellation ratio" value={(cancellationRatio * 100).toFixed(1) + '%'} />
      </div>

      {/* Mode table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={S.tbl}>
          <thead>
            <tr>
              {['#','Indices','Family','Mode Hz','Q','Real','Imag','Mag','Phase','Relation'].map(h => (
                <th key={h} style={{ ...S.th, textAlign: h === 'Family' || h === 'Relation' ? 'left' : 'right' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {modes.map((m) => {
              const isR = m.relation === 'Reinforcing';
              return (
                <tr key={m.rank} style={{ borderBottom: '1px solid #fed7aa', background: m.rank === 1 ? '#fff7ed' : undefined }}>
                  <td style={{ ...S.td, color: '#9a3412', fontWeight: m.rank <= 3 ? 700 : 400 }}>{m.rank}</td>
                  <td style={{ ...S.td, color: '#1d4ed8', textAlign: 'center' }}>({m.nx},{m.ny},{m.nz})</td>
                  <td style={{ ...S.td, textAlign: 'left', color: m.family === 'axial' ? '#166534' : m.family === 'tangential' ? '#0369a1' : '#7e22ce' }}>
                    {m.family ? m.family.charAt(0).toUpperCase() + m.family.slice(1) : '—'}
                  </td>
                  <td style={S.td}>{f1(m.modeHz)}</td>
                  <td style={S.td}>{f2(m.q)}</td>
                  <td style={{ ...S.td, color: m.re < 0 ? '#dc2626' : '#166534' }}>{f4(m.re)}</td>
                  <td style={{ ...S.td, color: m.im < 0 ? '#dc2626' : '#166534' }}>{f4(m.im)}</td>
                  <td style={{ ...S.td, fontWeight: m.rank <= 3 ? 700 : 400 }}>{f4(m.mag)}</td>
                  <td style={S.td}>{fDeg(m.phaseDeg)}</td>
                  <td style={{ ...S.td, textAlign: 'left', fontWeight: 700,
                    color: isR ? '#166534' : '#dc2626' }}>
                    {isR ? '✓ Reinf' : '✗ Cancel'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function RewParity80HzAudit({ roomDims, seat, sub, surfaceAbsorption, activeSettings }) {
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);
  const [error,   setError]   = useState(null);

  const canRun = !!(
    roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM &&
    seat?.x != null && seat?.y != null &&
    sub?.x  != null && sub?.y  != null
  );

  const run = useCallback(async () => {
    if (!canRun) return;
    setRunning(true);
    setResults(null);
    setError(null);
    await new Promise(r => setTimeout(r, 0));

    try {
      const result = runSim(roomDims, seat, sub, surfaceAbsorption, activeSettings);
      const { activeModalContributorDebugSeries, freqsHz, splDbRaw } = result;

      const perFreq = TARGET_FREQUENCIES.map(targetHz => {
        const bin  = findBin(activeModalContributorDebugSeries, targetHz);
        return analyseFreq(bin, freqsHz, splDbRaw, targetHz);
      });

      setResults(perFreq);
    } catch (e) {
      setError(e.message ?? String(e));
    } finally {
      setRunning(false);
    }
  }, [roomDims, seat, sub, surfaceAbsorption, activeSettings, canRun]);

  return (
    <div style={S.wrap}>
      <div style={S.title}>
        80 Hz Complex Sum Audit — Modal Cancellation Analysis
        <span style={S.sub}>
          diagnostic only · Q×{Q_SCALE} · Tang×{TANG_SCALE} · Axial=1.0 · Oblique=1.0 · does not affect live graph
        </span>
      </div>

      {!canRun && (
        <div style={{ fontSize: 10, color: '#b45309', fontFamily: 'monospace', marginBottom: 6 }}>
          ⚠ Requires room dimensions, a valid seat position, and a valid sub position.
        </div>
      )}

      <button
        onClick={run}
        disabled={running || !canRun}
        style={{ ...S.btn, background: (running || !canRun) ? '#e5e7eb' : '#ea580c', color: (running || !canRun) ? '#6b7280' : '#fff', cursor: (running || !canRun) ? 'not-allowed' : 'pointer' }}
      >
        {running ? 'Running…' : results ? 'Re-run audit' : 'Run 80 Hz complex sum audit'}
      </button>

      {error && (
        <div style={{ fontSize: 10, color: '#dc2626', fontFamily: 'monospace', marginBottom: 8 }}>
          Error: {error}
        </div>
      )}

      {results && results.map((data, i) => (
        <FreqPanel key={TARGET_FREQUENCIES[i]} data={data} />
      ))}
    </div>
  );
}