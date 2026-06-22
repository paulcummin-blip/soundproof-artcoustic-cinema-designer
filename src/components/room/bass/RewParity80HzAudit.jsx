/**
 * RewParity80HzAudit
 *
 * Diagnostic-only. 70–90 Hz modal contribution breakdown.
 * Fixed settings: Q scale = 0.80, tangential scale = 0.80, axial = 1.0, oblique = 1.0.
 * For each target frequency (70, 75, 80, 85, 90 Hz) reports:
 *   - Top 15 contributing modes sorted by absolute contribution magnitude
 *   - Total modal sum magnitude + phase
 *   - REW target SPL, simulated SPL, error
 * Does NOT alter the production engine or live graph.
 */
import React, { useState, useCallback } from 'react';
import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';

const Q_SCALE   = 0.80;
const TANG_SCALE = 0.80;

const TARGET_FREQUENCIES = [70, 75, 80, 85, 90];

const REW_BENCHMARK = {
  70: 86.8,
  75: null,   // not in standard benchmark — will show "—"
  80: 79.7,
  85: 90.8,
  90: null,
};

const FLAT_SOURCE_CURVE = [
  { hz: 20, db: 94 }, { hz: 50, db: 94 }, { hz: 100, db: 94 }, { hz: 200, db: 94 },
];

function fmt(v, d = 2) {
  return Number.isFinite(v) ? v.toFixed(d) : '—';
}

function fmtDeg(v) {
  return Number.isFinite(v) ? v.toFixed(1) + '°' : '—';
}

function getModeFamily(modeType) {
  if (!modeType) return '—';
  return modeType.charAt(0).toUpperCase() + modeType.slice(1);
}

function getModeIndices(row) {
  return `(${row.nx},${row.ny},${row.nz})`;
}

// Find the closest frequency bin to the target in the activeModalContributorDebugSeries
function findClosestBin(series, targetHz, toleranceHz = 3) {
  if (!Array.isArray(series) || series.length === 0) return null;
  let best = null, bestDist = Infinity;
  for (const bin of series) {
    const hz = bin.frequencyHz ?? bin.targetHz;
    const d = Math.abs(hz - targetHz);
    if (d < bestDist) { bestDist = d; best = bin; }
  }
  return bestDist <= toleranceHz ? best : null;
}

// Interpolate simulated SPL at targetHz from the response series
function interpolateSpl(freqsHz, splDbRaw, targetHz) {
  if (!freqsHz || !splDbRaw) return null;
  let best = null, bestDist = Infinity;
  for (let i = 0; i < freqsHz.length; i++) {
    const d = Math.abs(freqsHz[i] - targetHz);
    if (d < bestDist) { bestDist = d; best = splDbRaw[i]; }
  }
  return bestDist <= 3 ? best : null;
}

function runSimWithDebug(roomDims, seat, sub, surfaceAbsorption, activeSettings) {
  const seatZ = Number.isFinite(Number(seat?.z)) ? Number(seat.z) : 1.2;
  const baseAxialQ = activeSettings?.axialQ ?? 8;
  try {
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
        modalSourceReferenceMode:     activeSettings?.modalSourceReferenceMode   ?? 'existing',
        modalGainScalar:              activeSettings?.modalGainScalar            ?? 1.0,
        axialQ:                       baseAxialQ * Q_SCALE,
        modalStorageMode:             'none',
        propagationPhaseScale:        0,
        pureDeterministicModalSum:    true,
        disableModalPropagationPhase: true,
        modalCoherenceMode:           'coherent',
        highOrderAxialScale:          activeSettings?.highOrderAxialScale        ?? 1.0,
        rewParityModalMagnitudeScale: activeSettings?.rewParityModalMagnitudeScale ?? 1.0,
        debugReflectionOrder:         1,
        disableLateField:             true,
        tangentialFamilyScale:        TANG_SCALE,
        axialFamilyScale:             1.0,
        obliqueFamilyScale:           1.0,
      }
    );
  } catch {
    return null;
  }
}

// Styles
const TH = {
  textAlign: 'right', padding: '3px 5px', fontSize: 9, fontWeight: 700,
  background: '#fff7ed', borderBottom: '2px solid #fb923c', color: '#9a3412',
  whiteSpace: 'nowrap',
};
const TD = { textAlign: 'right', padding: '2px 5px', fontSize: 9, fontFamily: 'monospace' };

function ModeTable({ modes, modalSumRe, modalSumIm }) {
  if (!modes || modes.length === 0) {
    return <div style={{ fontSize: 9, color: '#9ca3af', fontFamily: 'monospace' }}>No mode data at this frequency.</div>;
  }

  const modalSumMag = Math.sqrt((modalSumRe ?? 0) ** 2 + (modalSumIm ?? 0) ** 2);
  const modalSumPhaseDeg = ((Math.atan2(modalSumIm ?? 0, modalSumRe ?? 0)) * 180) / Math.PI;

  // Rank by absolute contribution magnitude, top 15
  const ranked = [...modes]
    .sort((a, b) => (b.activeMagnitude ?? 0) - (a.activeMagnitude ?? 0))
    .slice(0, 15);

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 700 }}>
        <thead>
          <tr>
            <th style={{ ...TH, textAlign: 'center' }}>Rank</th>
            <th style={{ ...TH, textAlign: 'center' }}>Indices</th>
            <th style={{ ...TH, textAlign: 'left' }}>Family</th>
            <th style={TH}>Mode Hz</th>
            <th style={TH}>Q</th>
            <th style={TH}>Amplitude</th>
            <th style={TH}>Phase °</th>
            <th style={TH}>Contribution</th>
            <th style={TH}>Cumul rank</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((m, i) => {
            const contribMag = m.activeMagnitude ?? 0;
            return (
              <tr key={i} style={{ borderBottom: '1px solid #fed7aa', background: i === 0 ? '#fff7ed' : undefined }}>
                <td style={{ ...TD, textAlign: 'center', fontWeight: i === 0 ? 700 : 400, color: i === 0 ? '#9a3412' : '#374151' }}>{i + 1}</td>
                <td style={{ ...TD, textAlign: 'center', fontFamily: 'monospace', color: '#1d4ed8' }}>{getModeIndices(m)}</td>
                <td style={{ ...TD, textAlign: 'left', color: m.modeType === 'axial' ? '#166534' : m.modeType === 'tangential' ? '#0369a1' : '#7e22ce' }}>
                  {getModeFamily(m.modeType)}
                </td>
                <td style={TD}>{fmt(m.modeFrequencyHz, 1)}</td>
                <td style={TD}>{fmt(m.qValue, 2)}</td>
                <td style={{ ...TD, color: '#374151' }}>{fmt(m.rawModalMagnitude ?? contribMag, 4)}</td>
                <td style={{ ...TD, color: '#374151' }}>{fmtDeg(m.activePhaseAngleDeg)}</td>
                <td style={{ ...TD, fontWeight: i < 3 ? 700 : 400, color: i < 3 ? '#9a3412' : '#374151' }}>{fmt(contribMag, 4)}</td>
                <td style={{ ...TD, color: '#6b7280' }}>{i + 1}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ marginTop: 4, display: 'flex', gap: 16, fontSize: 9, fontFamily: 'monospace', color: '#9a3412', flexWrap: 'wrap' }}>
        <span><strong>Modal sum magnitude:</strong> {fmt(modalSumMag, 4)}</span>
        <span><strong>Modal sum SPL:</strong> {fmt(20 * Math.log10(Math.max(modalSumMag, 1e-10)), 1)} dB</span>
        <span><strong>Modal sum phase:</strong> {fmtDeg(modalSumPhaseDeg)}</span>
      </div>
    </div>
  );
}

function FreqBlock({ targetHz, bin, simSpl }) {
  const rewTarget = REW_BENCHMARK[targetHz];
  const error = (simSpl != null && rewTarget != null) ? simSpl - rewTarget : null;

  return (
    <div style={{ border: '1px solid #fed7aa', borderRadius: 6, padding: '8px 10px', marginBottom: 8, background: '#fffbf5' }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, fontSize: 12, color: '#9a3412', fontFamily: 'monospace' }}>{targetHz} Hz</span>
        <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#374151' }}>
          REW target: <strong>{rewTarget != null ? rewTarget.toFixed(1) : '—'} dB</strong>
        </span>
        <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#374151' }}>
          Simulated: <strong>{simSpl != null ? simSpl.toFixed(1) : '—'} dB</strong>
        </span>
        <span style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 700,
          color: error == null ? '#9ca3af' : Math.abs(error) > 5 ? '#dc2626' : Math.abs(error) > 3 ? '#b45309' : '#166534' }}>
          Error: {error != null ? (error > 0 ? '+' : '') + error.toFixed(1) + ' dB' : '—'}
        </span>
      </div>

      {bin
        ? <ModeTable modes={bin.contributors} modalSumRe={bin.modalSumRe} modalSumIm={bin.modalSumIm} />
        : <div style={{ fontSize: 9, color: '#9ca3af', fontFamily: 'monospace' }}>No engine debug data for this frequency.</div>
      }
    </div>
  );
}

export default function RewParity80HzAudit({ roomDims, seat, sub, surfaceAbsorption, activeSettings }) {
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);

  const canRun = !!(
    roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM &&
    seat?.x != null && seat?.y != null &&
    sub?.x != null && sub?.y != null
  );

  const run = useCallback(async () => {
    if (!canRun) return;
    setRunning(true);
    setResults(null);
    await new Promise(r => setTimeout(r, 0));

    const result = runSimWithDebug(roomDims, seat, sub, surfaceAbsorption, activeSettings);
    if (!result) { setRunning(false); return; }

    const { activeModalContributorDebugSeries, freqsHz, splDbRaw } = result;

    const perFreq = TARGET_FREQUENCIES.map(targetHz => {
      const bin = findClosestBin(activeModalContributorDebugSeries, targetHz);
      const simSpl = interpolateSpl(freqsHz, splDbRaw, targetHz);

      // Compute modal sum Re/Im from the contributors in the bin
      let modalSumRe = 0, modalSumIm = 0;
      if (bin?.contributors) {
        bin.contributors.forEach(c => {
          modalSumRe += c.activeReal ?? 0;
          modalSumIm += c.activeImag ?? 0;
        });
      }

      return {
        targetHz,
        bin: bin ? { ...bin, modalSumRe, modalSumIm } : null,
        simSpl,
      };
    });

    setResults(perFreq);
    setRunning(false);
  }, [roomDims, seat, sub, surfaceAbsorption, activeSettings, canRun]);

  return (
    <div style={{ marginTop: 12, border: '1px solid #fb923c', borderRadius: 8, background: '#fff7ed', padding: '10px 12px' }}>
      <div style={{ fontWeight: 700, color: '#9a3412', fontSize: 11, fontFamily: 'monospace', marginBottom: 4 }}>
        80 Hz Parity Investigation — Top 15 Modal Contributors (70–90 Hz)
        <span style={{ fontWeight: 400, color: '#fb923c', marginLeft: 8, fontSize: 10 }}>
          diagnostic only · Q×{Q_SCALE}, Tang×{TANG_SCALE}, axial=1.0, oblique=1.0 · does not affect live graph
        </span>
      </div>

      {!canRun && (
        <div style={{ fontSize: 10, color: '#b45309', fontFamily: 'monospace', marginBottom: 6 }}>
          ⚠ Need room dimensions, a valid seat, and a valid sub to run.
        </div>
      )}

      <button
        onClick={run}
        disabled={running || !canRun}
        style={{
          height: 28, padding: '0 14px', borderRadius: 6,
          border: '1px solid #ea580c', background: running ? '#e5e7eb' : '#ea580c',
          color: running ? '#6b7280' : '#fff', fontSize: 11, fontFamily: 'monospace',
          cursor: running || !canRun ? 'not-allowed' : 'pointer', fontWeight: 600,
          marginBottom: 10,
        }}
      >
        {running ? 'Running…' : results ? 'Re-run' : 'Run 80 Hz audit'}
      </button>

      {results && results.map(({ targetHz, bin, simSpl }) => (
        <FreqBlock key={targetHz} targetHz={targetHz} bin={bin} simSpl={simSpl} />
      ))}
    </div>
  );
}