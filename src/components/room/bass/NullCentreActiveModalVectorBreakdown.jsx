import React from 'react';

function fmt(value, digits = 4, unit = '') {
  return Number.isFinite(value) ? `${value.toFixed(digits)}${unit}` : '—';
}

function formatMode(row) {
  return `[${row?.nx ?? '—'},${row?.ny ?? '—'},${row?.nz ?? '—'}]`;
}

function phaseDeg(re, im) {
  return Number.isFinite(re) && Number.isFinite(im)
    ? (Math.atan2(im, re) * 180) / Math.PI
    : null;
}

function SafeTableWrap({ children }) {
  return (
    <div style={{ width: '100%', overflowX: 'auto', boxSizing: 'border-box' }}>
      <div style={{ minWidth: 1120 }}>{children}</div>
    </div>
  );
}

export default function NullCentreActiveModalVectorBreakdown({ contributorSeries, nullCentreHz, tableHeaderStyle }) {
  const rows = Array.isArray(contributorSeries) ? contributorSeries : [];
  const selected = Number.isFinite(nullCentreHz)
    ? rows.reduce((best, row) => {
        if (!best) return row;
        return Math.abs(row.frequencyHz - nullCentreHz) < Math.abs(best.frequencyHz - nullCentreHz) ? row : best;
      }, null)
    : null;

  const contributors = (selected?.contributors || [])
    .filter(row => row.mutedFromActiveModalSum !== true)
    .sort((a, b) => (b.activeMagnitude || 0) - (a.activeMagnitude || 0));

  const sumRe = selected?.modalSumRe;
  const sumIm = selected?.modalSumIm;
  const sumMag = Number.isFinite(sumRe) && Number.isFinite(sumIm) ? Math.sqrt(sumRe * sumRe + sumIm * sumIm) : null;
  const sumPhase = phaseDeg(sumRe, sumIm);

  return (
    <details open style={{ marginTop: 10, padding: '8px 10px', borderRadius: 6, background: '#f0f9ff', border: '1px solid #7dd3fc' }}>
      <summary style={{ fontSize: 10, fontWeight: 700, color: '#0369a1', cursor: 'pointer' }}>
        Null-centre active modal vector breakdown <span style={{ fontWeight: 400, fontStyle: 'italic', color: '#64748b' }}>(diagnostic only · active coherent sum only)</span>
      </summary>
      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 10, color: '#075985', marginBottom: 6 }}>
          Benchmark null centre: <strong>{fmt(nullCentreHz, 2, ' Hz')}</strong> · evaluated row: <strong>{fmt(selected?.frequencyHz, 2, ' Hz')}</strong> · contributors shown: <strong>{contributors.length}</strong>
        </div>
        <SafeTableWrap>
          <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th style={{ ...tableHeaderStyle }}>Mode</th>
                <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Mode frequency</th>
                <th style={{ ...tableHeaderStyle }}>Type</th>
                <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Active real</th>
                <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Active imag</th>
                <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Magnitude</th>
                <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Phase angle</th>
                <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Source coupling</th>
                <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Receiver coupling</th>
                <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Combined coupling</th>
              </tr>
            </thead>
            <tbody>
              {contributors.map((row, index) => (
                <tr key={`${selected?.frequencyHz}-${index}-${formatMode(row)}`} style={{ borderBottom: '1px solid #bae6fd' }}>
                  <td style={{ padding: '3px 6px', fontSize: 10, fontFamily: 'monospace', fontWeight: 700 }}>{formatMode(row)}</td>
                  <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10, fontFamily: 'monospace' }}>{fmt(row.modeFrequencyHz, 2, ' Hz')}</td>
                  <td style={{ padding: '3px 6px', fontSize: 10 }}>{row.modeType || '—'}</td>
                  <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10, fontFamily: 'monospace' }}>{fmt(row.activeReal, 5)}</td>
                  <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10, fontFamily: 'monospace' }}>{fmt(row.activeImag, 5)}</td>
                  <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10, fontFamily: 'monospace', fontWeight: 700 }}>{fmt(row.activeMagnitude, 5)}</td>
                  <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10, fontFamily: 'monospace' }}>{fmt(row.activePhaseAngleDeg, 1, '°')}</td>
                  <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10, fontFamily: 'monospace' }}>{fmt(row.sourceCoupling, 4)}</td>
                  <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10, fontFamily: 'monospace' }}>{fmt(row.receiverCoupling, 4)}</td>
                  <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10, fontFamily: 'monospace' }}>{fmt(row.combinedCoupling, 4)}</td>
                </tr>
              ))}
              {contributors.length === 0 && (
                <tr>
                  <td colSpan={10} style={{ padding: '4px 6px', fontSize: 10, color: '#64748b' }}>No active modal contributor rows captured for the current null centre.</td>
                </tr>
              )}
              <tr style={{ borderTop: '2px solid #0284c7', background: '#e0f2fe' }}>
                <td colSpan={3} style={{ padding: '4px 6px', fontSize: 10, fontWeight: 700, color: '#075985' }}>Summed active modal vector</td>
                <td style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10, fontFamily: 'monospace', fontWeight: 700 }}>{fmt(sumRe, 5)}</td>
                <td style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10, fontFamily: 'monospace', fontWeight: 700 }}>{fmt(sumIm, 5)}</td>
                <td style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10, fontFamily: 'monospace', fontWeight: 700 }}>{fmt(sumMag, 5)}</td>
                <td style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10, fontFamily: 'monospace', fontWeight: 700 }}>{fmt(sumPhase, 1, '°')}</td>
                <td colSpan={3} style={{ padding: '4px 6px', fontSize: 10, color: '#075985' }}>Exact modalSumRe/modalSumIm values after active accumulation.</td>
              </tr>
            </tbody>
          </table>
        </SafeTableWrap>
      </div>
    </details>
  );
}