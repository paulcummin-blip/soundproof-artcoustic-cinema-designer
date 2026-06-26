import React, { useMemo } from 'react';

// Apply 1/6 octave fractional-octave smoothing to a {frequency, spl} array.
// width = fractional octave (e.g. 6 = 1/6 octave).
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

// Find the deepest null (minimum SPL) within 20–120 Hz.
function detectNull(data) {
  if (!Array.isArray(data) || data.length === 0) return null;
  let min = Infinity;
  let minFreq = null;
  for (const { frequency, spl } of data) {
    if (!Number.isFinite(frequency) || !Number.isFinite(spl)) continue;
    if (frequency < 20 || frequency > 120) continue;
    if (spl < min) { min = spl; minFreq = frequency; }
  }
  return minFreq !== null ? { frequency: minFreq, spl: min } : null;
}

// Find the SPL at the closest frequency point in a series.
function splAtFreq(data, targetHz) {
  if (!Array.isArray(data) || data.length === 0) return null;
  let best = null, bestDist = Infinity;
  for (const { frequency, spl } of data) {
    if (!Number.isFinite(frequency) || !Number.isFinite(spl)) continue;
    const d = Math.abs(frequency - targetHz);
    if (d < bestDist) { bestDist = d; best = spl; }
  }
  return bestDist <= 5 ? best : null;
}

/**
 * NullDepthAuditBadge
 *
 * Shows a compact audit card comparing the raw engine response (no smoothing)
 * against a 1/6 octave smoothed version of the same data, so destructive nulls
 * hidden by display smoothing are surfaced.
 *
 * Props:
 *   rawData  — array of { frequency, spl } — the pre-display engine output (multiSeries[0].data)
 */
export default function NullDepthAuditBadge({ rawData }) {
  const audit = useMemo(() => {
    if (!Array.isArray(rawData) || rawData.length < 3) return null;

    // Raw null: engine output, no smoothing applied
    const rawNull = detectNull(rawData);
    if (!rawNull) return null;

    // Displayed null: 1/6 octave smoothed — matches typical acoustic analysis display
    const smoothed = smoothFractionalOctave(rawData, 6);
    const smoothedNullAtSameFreq = splAtFreq(smoothed, rawNull.frequency);
    const smoothedNull = detectNull(smoothed);

    const fill = (smoothedNullAtSameFreq !== null)
      ? smoothedNullAtSameFreq - rawNull.spl  // positive = smoothing filled the null
      : null;

    return {
      rawHz: rawNull.frequency,
      rawDb: rawNull.spl,
      smoothedHz: smoothedNull?.frequency ?? null,
      smoothedDb: smoothedNullAtSameFreq ?? smoothedNull?.spl ?? null,
      fillDb: fill,
    };
  }, [rawData]);

  if (!audit) return null;

  // Severity thresholds based on raw null depth
  const { rawDb, rawHz, smoothedDb, smoothedHz, fillDb } = audit;

  let severity, borderColor, bgColor, labelColor, dotColor;
  if (rawDb <= -20) {
    severity = 'red';
    borderColor = '#dc2626';
    bgColor = '#fef2f2';
    labelColor = '#991b1b';
    dotColor = '#dc2626';
  } else if (rawDb <= -12) {
    severity = 'amber';
    borderColor = '#d97706';
    bgColor = '#fffbeb';
    labelColor = '#92400e';
    dotColor = '#d97706';
  } else {
    severity = 'green';
    borderColor = '#16a34a';
    bgColor = '#f0fdf4';
    labelColor = '#14532d';
    dotColor = '#16a34a';
  }

  const fmt1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '—');
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
      {/* Header row */}
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
          fontWeight: 600,
          color: labelColor,
          background: bgColor,
          border: `1px solid ${borderColor}`,
          borderRadius: 4,
          padding: '1px 5px',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}>
          {severity === 'red' ? 'Severe' : severity === 'amber' ? 'Moderate' : 'Acceptable'}
        </span>
      </div>

      {/* Data rows */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 16px', color: labelColor }}>
        <div>
          <span style={{ opacity: 0.7 }}>Raw null: </span>
          <span style={{ fontWeight: 700 }}>{fmt1(rawHz)} Hz / {fmt1(rawDb)} dB</span>
        </div>
        <div>
          <span style={{ opacity: 0.7 }}>Displayed (1/6 oct): </span>
          <span style={{ fontWeight: 700 }}>{fmt1(rawHz)} Hz / {fmt1(smoothedDb)} dB</span>
        </div>
        <div>
          <span style={{ opacity: 0.7 }}>Smoothing fill: </span>
          <span style={{ fontWeight: 700 }}>{fmtSign(fillDb)} dB</span>
        </div>
        <div style={{ opacity: 0.6, fontSize: 9 }}>
          Source: engine output · no display smoothing
        </div>
      </div>

      {/* Warning — only shown when severe */}
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