import React, { useMemo } from 'react';

// ─── Null depth detection ────────────────────────────────────────────────────
// Copied from AcousticSolverShootoutBatch1.jsx (identical logic).
// null depth = null dB minus local peak dB within ±1.5 octaves (always negative).
// Input: parallel arrays freqsHz[] and splDb[].
function detectNullDepth(freqsHz, splDb) {
  // Step 1: find absolute minimum in 20–80 Hz
  let minDb = Infinity;
  let minIdx = -1;
  for (let i = 0; i < freqsHz.length; i++) {
    const hz = freqsHz[i];
    if (hz < 20 || hz > 80) continue;
    if (splDb[i] < minDb) { minDb = splDb[i]; minIdx = i; }
  }
  if (minIdx === -1) return { nullHz: null, nullDepthDb: null };

  const nullHz = freqsHz[minIdx];

  // Step 2: find local peak within ±1.5 octaves of the null, bounded to [20, 200] Hz
  const loHz = Math.max(20, nullHz / Math.pow(2, 1.5));
  const hiHz = Math.min(200, nullHz * Math.pow(2, 1.5));
  let peakDb = -Infinity;
  for (let i = 0; i < freqsHz.length; i++) {
    const hz = freqsHz[i];
    if (hz < loHz || hz > hiHz) continue;
    if (splDb[i] > peakDb) peakDb = splDb[i];
  }

  const nullDepthDb = minDb - peakDb; // always negative
  return { nullHz, nullDepthDb };
}

// Convenience wrapper for { frequency, spl }[] series format
function detectNullDepthFromSeries(data) {
  if (!Array.isArray(data) || data.length === 0) return { nullHz: null, nullDepthDb: null };
  const freqsHz = data.map(p => p.frequency);
  const splDb   = data.map(p => p.spl);
  return detectNullDepth(freqsHz, splDb);
}

// ─── 1/6 octave fractional-octave smoothing ──────────────────────────────────
function smoothFractionalOctave(data, width = 6) {
  if (!Array.isArray(data) || data.length < 3) return data;
  const sorted = [...data].sort((a, b) => a.frequency - b.frequency);
  return sorted.map(({ frequency }) => {
    const fLow  = frequency * Math.pow(2, -0.5 / width);
    const fHigh = frequency * Math.pow(2,  0.5 / width);
    const pts = sorted.filter(p => p.frequency >= fLow && p.frequency <= fHigh && Number.isFinite(p.spl));
    if (pts.length === 0) return { frequency, spl: null };
    const avg = pts.reduce((s, p) => s + p.spl, 0) / pts.length;
    return { frequency, spl: avg };
  });
}

// ─── Component ───────────────────────────────────────────────────────────────
/**
 * NullDepthAuditBadge
 *
 * Compares true null depth (null dB minus local peak within ±1.5 octaves)
 * on the raw engine output vs the same data after 1/6 octave smoothing,
 * so destructive nulls hidden by display smoothing are surfaced.
 *
 * Props:
 *   rawData — array of { frequency, spl } — pre-display engine output (multiSeries[0].data)
 */
export default function NullDepthAuditBadge({ rawData }) {
  const audit = useMemo(() => {
    if (!Array.isArray(rawData) || rawData.length < 3) return null;

    // Raw null depth — engine output, no smoothing
    const { nullHz: rawHz, nullDepthDb: rawDepthDb } = detectNullDepthFromSeries(rawData);
    if (rawHz === null || rawDepthDb === null) return null;

    // Smoothed null depth — 1/6 octave applied first, then same depth detection
    const smoothedData = smoothFractionalOctave(rawData, 6)
      .filter(p => Number.isFinite(p.spl));
    const { nullHz: smoothedHz, nullDepthDb: smoothedDepthDb } = detectNullDepthFromSeries(smoothedData);

    // Smoothing fill: how many dB of null depth were hidden by smoothing (positive = smoothing filled the null)
    const fillDb = (smoothedDepthDb !== null && rawDepthDb !== null)
      ? smoothedDepthDb - rawDepthDb
      : null;

    return { rawHz, rawDepthDb, smoothedHz, smoothedDepthDb, fillDb };
  }, [rawData]);

  if (!audit) return null;

  const { rawHz, rawDepthDb, smoothedHz, smoothedDepthDb, fillDb } = audit;

  // ─── Severity — based on raw null depth ─────────────────────────────────
  let severity, borderColor, bgColor, labelColor, dotColor, statusLabel;
  if (rawDepthDb <= -18) {
    severity    = 'red';
    borderColor = '#dc2626';
    bgColor     = '#fef2f2';
    labelColor  = '#991b1b';
    dotColor    = '#dc2626';
    statusLabel = 'SEVERE NULL';
  } else if (rawDepthDb <= -9) {
    severity    = 'amber';
    borderColor = '#d97706';
    bgColor     = '#fffbeb';
    labelColor  = '#92400e';
    dotColor    = '#d97706';
    statusLabel = 'MODERATE NULL';
  } else {
    severity    = 'green';
    borderColor = '#16a34a';
    bgColor     = '#f0fdf4';
    labelColor  = '#14532d';
    dotColor    = '#16a34a';
    statusLabel = 'ACCEPTABLE';
  }

  const fmt1    = (v) => (Number.isFinite(v) ? v.toFixed(1) : '—');
  const fmtSign = (v) => (Number.isFinite(v) ? (v >= 0 ? `+${v.toFixed(1)}` : v.toFixed(1)) : '—');

  return (
    <div style={{
      border: `1px solid ${borderColor}`,
      borderRadius: 8,
      background: bgColor,
      padding: '8px 12px',
      fontSize: 11,
      fontFamily: 'monospace',
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: dotColor, display: 'inline-block', flexShrink: 0,
        }} />
        <span style={{ fontWeight: 700, color: labelColor, fontSize: 11 }}>
          Null Depth Audit
        </span>
        <span style={{
          marginLeft: 'auto',
          fontSize: 9,
          fontWeight: 700,
          color: labelColor,
          background: bgColor,
          border: `1px solid ${borderColor}`,
          borderRadius: 4,
          padding: '1px 5px',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          {statusLabel}
        </span>
      </div>

      {/* Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 16px', color: labelColor }}>
        <div>
          <span style={{ opacity: 0.7 }}>Raw null: </span>
          <span style={{ fontWeight: 700 }}>{fmt1(rawHz)} Hz / {fmt1(rawDepthDb)} dB depth</span>
        </div>
        <div>
          <span style={{ opacity: 0.7 }}>Displayed (1/6 oct): </span>
          <span style={{ fontWeight: 700 }}>{fmt1(smoothedHz ?? rawHz)} Hz / {fmt1(smoothedDepthDb)} dB depth</span>
        </div>
        <div>
          <span style={{ opacity: 0.7 }}>Smoothing fill: </span>
          <span style={{ fontWeight: 700 }}>{fmtSign(fillDb)} dB</span>
        </div>
        <div style={{ opacity: 0.55, fontSize: 9, alignSelf: 'center' }}>
          depth = null dB − local peak (±1.5 oct)
        </div>
      </div>

      {/* Warning — red only */}
      {severity === 'red' && (
        <div style={{
          marginTop: 4,
          borderTop: `1px solid ${borderColor}`,
          paddingTop: 4,
          color: '#991b1b',
          fontWeight: 600,
          fontSize: 10,
        }}>
          ⚠ Severe raw null hidden by display smoothing — EQ alone may not solve this.
        </div>
      )}
    </div>
  );
}