// RewStyleAbsorptionAuthorityCheck.jsx
// CASE 034 — REW-style Absorption Authority Check.
// Compact, read-only comparison panel for the new "rew_absorption_authority" qStrategy
// added to rewBassEngine.js. Confirms absorption 0.00 / 0.30 / 1.00 now produces a clearly
// visible movement in the 20-120 Hz response (not the ~1 dB seen with production Q).
// Production default qStrategy ('smooth_soft_cap' path) is completely unchanged — this
// panel only ever passes qStrategy: 'rew_absorption_authority' explicitly.

import React, { useState, useCallback } from 'react';
import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';
import { LIVE_SOURCE_CURVE, buildLiveEngineOptions } from './liveBassAuditOptions';

const ROOM = { widthM: 5.0, lengthM: 4.5, heightM: 3.0 };
const SUB = { id: 'centreFront', modelKey: 'reference', x: ROOM.widthM / 2, y: 0.3, z: 0.3, tuning: { gainDb: 0, delayMs: 0, polarity: 0 } };
const SEAT = { x: ROOM.widthM / 2, y: 4.0, z: 1.2 };

function absAbsorption(value) { return { front: value, back: value, left: value, right: value, floor: value, ceiling: value }; }
function fmt(v, d = 2) { return Number.isFinite(v) ? v.toFixed(d) : '—'; }
function nearestIndex(freqsHz, target) {
  let bestI = 0, bestD = Infinity;
  freqsHz.forEach((f, i) => { const d = Math.abs(f - target); if (d < bestD) { bestD = d; bestI = i; } });
  return bestI;
}

const VARIANTS = [
  { key: 'A', label: '0.00', value: 0.0 },
  { key: 'B', label: '0.30', value: 0.3 },
  { key: 'C', label: '1.00', value: 1.0 },
];

const th = { textAlign: 'right', padding: '3px 5px', fontSize: 9, fontWeight: 700, background: '#ecfdf5', borderBottom: '2px solid #6ee7b7', color: '#065f46', whiteSpace: 'nowrap' };
const td = { textAlign: 'right', padding: '2px 5px', fontSize: 9, fontFamily: 'monospace' };

export default function RewStyleAbsorptionAuthorityCheck() {
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);

  const runCheck = useCallback(() => {
    setRunning(true);

    const perVariant = VARIANTS.map((variant) => {
      const surfaceAbsorption = absAbsorption(variant.value);
      const engineOptions = { ...buildLiveEngineOptions(30, surfaceAbsorption), freqMinHz: 20, freqMaxHz: 200, qStrategy: 'rew_absorption_authority' };
      const out = simulateBassResponseRewCore(ROOM, SEAT, SUB, LIVE_SOURCE_CURVE, engineOptions);
      const { freqsHz, splDbRaw } = out;

      const idx30 = nearestIndex(freqsHz, 30);
      const thirtyHzSplDb = splDbRaw[idx30];
      const nullDepthDb = Math.min(...splDbRaw);
      const peakHeightDb = Math.max(...splDbRaw);
      const rippleIndices = freqsHz.map((f, i) => ({ f, i })).filter((p) => p.f >= 60 && p.f <= 120).map((p) => p.i);
      const rippleBandDb = rippleIndices.map((i) => splDbRaw[i]);
      const rippleAvgDb = rippleBandDb.length > 0 ? (Math.max(...rippleBandDb) - Math.min(...rippleBandDb)) : null;

      return { key: variant.key, label: variant.label, thirtyHzSplDb, nullDepthDb, peakHeightDb, rippleAvgDb };
    });

    const A = perVariant[0], B = perVariant[1], C = perVariant[2];
    const nullMoveDb = Math.abs(C.nullDepthDb - B.nullDepthDb);
    const peakMoveDb = Math.abs(C.peakHeightDb - B.peakHeightDb);
    const rippleMoveDb = Math.abs((C.rippleAvgDb ?? 0) - (B.rippleAvgDb ?? 0));
    const passes = nullMoveDb >= 1.0 || peakMoveDb >= 1.0 || rippleMoveDb >= 1.0;

    setResult({ perVariant, nullMoveDb, peakMoveDb, rippleMoveDb, passes });
    setRunning(false);
  }, []);

  return (
    <div style={{ border: '2px solid #059669', borderRadius: 8, background: '#ecfdf5', padding: '10px 12px', marginTop: 8, marginBottom: 8 }}>
      <div style={{ fontWeight: 700, color: '#065f46', fontSize: 12, fontFamily: 'monospace', marginBottom: 4 }}>
        CASE 034 — REW-style Absorption Authority Check
        <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9 }}>
          production candidate fix · new "rew_absorption_authority" qStrategy (opt-in only) · production default unchanged
        </span>
      </div>
      <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#065f46', marginBottom: 8 }}>
        Reference case: Room {fmt(ROOM.widthM, 1)}×{fmt(ROOM.lengthM, 1)}×{fmt(ROOM.heightM, 1)} m · Sub centre-front · Seat y {fmt(SEAT.y, 2)} m · Sweep 20–200 Hz.
      </div>

      <button onClick={runCheck} disabled={running}
        style={{ height: 26, padding: '0 12px', borderRadius: 6, border: '1px solid #059669', background: running ? '#e5e7eb' : '#059669', color: running ? '#6b7280' : '#fff', fontSize: 10, fontFamily: 'monospace', cursor: running ? 'not-allowed' : 'pointer', fontWeight: 600, marginBottom: 8 }}>
        {running ? 'Running…' : 'Run Absorption Authority Check'}
      </button>

      {result && (
        <>
          <div style={{ overflowX: 'auto', marginBottom: 8 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560 }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: 'left' }}>Surface Absorption</th>
                  <th style={th}>30 Hz SPL</th>
                  <th style={th}>Null Depth</th>
                  <th style={th}>Peak Height</th>
                  <th style={th}>60–120 Hz Ripple</th>
                </tr>
              </thead>
              <tbody>
                {result.perVariant.map((v) => (
                  <tr key={v.key} style={{ borderBottom: '1px solid #a7f3d0' }}>
                    <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>{v.label}</td>
                    <td style={td}>{fmt(v.thirtyHzSplDb)}</td>
                    <td style={td}>{fmt(v.nullDepthDb)}</td>
                    <td style={td}>{fmt(v.peakHeightDb)}</td>
                    <td style={td}>{fmt(v.rippleAvgDb)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ border: '1px solid #6ee7b7', borderRadius: 6, background: '#fff', padding: '8px 10px', fontSize: 10, fontFamily: 'monospace', color: '#1c1917' }}>
            <div><strong>0.30 → 1.00 move:</strong> Null depth {fmt(result.nullMoveDb)} dB · Peak height {fmt(result.peakMoveDb)} dB · Ripple {fmt(result.rippleMoveDb)} dB.</div>
            <div style={{ marginTop: 4, fontWeight: 700, color: result.passes ? '#065f46' : '#b91c1c' }}>
              {result.passes ? 'PASS — absorption 0.30 → 1.00 produces a clearly visible movement (≥1 dB) in the 20–120 Hz response.' : 'FAIL — movement is still ~1 dB or less; authority curve needs further tuning.'}
            </div>
          </div>
        </>
      )}
    </div>
  );
}