import React from 'react';

const MODE_TYPES = ['axial', 'tangential', 'oblique'];

function fmt(value, digits = 4, unit = '') {
  return Number.isFinite(value) ? `${value.toFixed(digits)}${unit}` : '—';
}

function formatMode(row) {
  return `[${row?.nx ?? '—'},${row?.ny ?? '—'},${row?.nz ?? '—'}]`;
}

function vectorMagnitude(re, im) {
  return Number.isFinite(re) && Number.isFinite(im) ? Math.sqrt((re * re) + (im * im)) : null;
}

function phaseDeg(re, im) {
  return Number.isFinite(re) && Number.isFinite(im) ? (Math.atan2(im, re) * 180) / Math.PI : null;
}

function wrappedPhaseDiffDeg(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  let diff = a - b;
  while (diff > 180) diff -= 360;
  while (diff <= -180) diff += 360;
  return diff;
}

function absolutePhaseDistanceDeg(a, b) {
  const diff = wrappedPhaseDiffDeg(a, b);
  return Number.isFinite(diff) ? Math.abs(diff) : null;
}

function polarityFor(rowPhaseDeg, finalPhaseDeg) {
  const distance = absolutePhaseDistanceDeg(rowPhaseDeg, finalPhaseDeg);
  if (!Number.isFinite(distance)) return 'orthogonal';
  if (distance <= 60) return 'constructive';
  if (distance > 120) return 'destructive';
  return 'orthogonal';
}

function averageAbsolutePhaseSpread(rows) {
  const phases = rows
    .map(row => Number(row.activePhaseAngleDeg))
    .filter(Number.isFinite);

  if (phases.length === 0) return null;

  const meanRe = phases.reduce((sum, deg) => sum + Math.cos((deg * Math.PI) / 180), 0) / phases.length;
  const meanIm = phases.reduce((sum, deg) => sum + Math.sin((deg * Math.PI) / 180), 0) / phases.length;
  const meanPhase = phaseDeg(meanRe, meanIm);

  if (!Number.isFinite(meanPhase)) return null;

  const distances = phases
    .map(deg => absolutePhaseDistanceDeg(deg, meanPhase))
    .filter(Number.isFinite);

  if (distances.length === 0) return null;
  return distances.reduce((sum, value) => sum + value, 0) / distances.length;
}

function SafeTableWrap({ children, minWidth = 760 }) {
  return (
    <div style={{ width: '100%', overflowX: 'auto', boxSizing: 'border-box' }}>
      <div style={{ minWidth }}>{children}</div>
    </div>
  );
}

function buildGroupRows(contributors, totalVectorMagnitude) {
  return MODE_TYPES.map((type) => {
    const rows = contributors.filter(row => row.modeType === type);
    const sumRe = rows.reduce((sum, row) => sum + (Number(row.activeReal) || 0), 0);
    const sumIm = rows.reduce((sum, row) => sum + (Number(row.activeImag) || 0), 0);
    const summedMagnitude = vectorMagnitude(sumRe, sumIm);
    const magnitudeSum = rows.reduce((sum, row) => sum + (Number(row.activeMagnitude) || 0), 0);
    const strongest = rows.reduce((best, row) => {
      if (!best) return row;
      return (Number(row.activeMagnitude) || 0) > (Number(best.activeMagnitude) || 0) ? row : best;
    }, null);

    return {
      type,
      rows,
      sumRe,
      sumIm,
      summedMagnitude,
      magnitudeSum,
      percentageOfTotal: Number.isFinite(summedMagnitude) && Number.isFinite(totalVectorMagnitude) && totalVectorMagnitude > 0
        ? (summedMagnitude / totalVectorMagnitude) * 100
        : null,
      phaseSpread: averageAbsolutePhaseSpread(rows),
      strongest,
    };
  });
}

export default function ModalEnergyDistributionDiagnostics({ contributorSeries, nullCentreHz, tableHeaderStyle }) {
  const series = Array.isArray(contributorSeries) ? contributorSeries : [];
  const selected = Number.isFinite(nullCentreHz)
    ? series.reduce((best, row) => {
        if (!best) return row;
        return Math.abs(row.frequencyHz - nullCentreHz) < Math.abs(best.frequencyHz - nullCentreHz) ? row : best;
      }, null)
    : null;

  const contributors = (selected?.contributors || [])
    .filter(row => row.mutedFromActiveModalSum !== true)
    .sort((a, b) => (Number(b.activeMagnitude) || 0) - (Number(a.activeMagnitude) || 0));

  const sumRe = Number(selected?.modalSumRe);
  const sumIm = Number(selected?.modalSumIm);
  const totalVectorMagnitude = vectorMagnitude(sumRe, sumIm);
  const totalPhaseAngle = phaseDeg(sumRe, sumIm);
  const groupRows = buildGroupRows(contributors, totalVectorMagnitude);
  const topRows = contributors.slice(0, 10).map(row => ({
    ...row,
    polarity: polarityFor(Number(row.activePhaseAngleDeg), totalPhaseAngle),
  }));

  const axialMagnitudeSum = groupRows.find(row => row.type === 'axial')?.magnitudeSum ?? 0;
  const tangentialObliqueMagnitudeSum = groupRows
    .filter(row => row.type !== 'axial')
    .reduce((sum, row) => sum + row.magnitudeSum, 0);
  const axialDominanceRatio = tangentialObliqueMagnitudeSum > 0
    ? axialMagnitudeSum / tangentialObliqueMagnitudeSum
    : null;

  const polaritySums = topRows.reduce((acc, row) => {
    const mag = Number(row.activeMagnitude) || 0;
    if (row.polarity === 'constructive') acc.constructive += mag;
    if (row.polarity === 'destructive') acc.destructive += mag;
    return acc;
  }, { constructive: 0, destructive: 0 });
  const cancellationSymmetryRatio = polaritySums.constructive > 0
    ? polaritySums.destructive / polaritySums.constructive
    : null;

  return (
    <details open style={{ marginTop: 10, padding: '8px 10px', borderRadius: 6, background: '#f5f3ff', border: '1px solid #c4b5fd' }}>
      <summary style={{ fontSize: 10, fontWeight: 700, color: '#6d28d9', cursor: 'pointer' }}>
        Modal Energy Distribution Diagnostics <span style={{ fontWeight: 400, fontStyle: 'italic', color: '#64748b' }}>(temporary · active coherent contributors only)</span>
      </summary>

      <div style={{ marginTop: 8, fontSize: 10, color: '#5b21b6', marginBottom: 6 }}>
        Detected null centre: <strong>{fmt(nullCentreHz, 2, ' Hz')}</strong> · evaluated row: <strong>{fmt(selected?.frequencyHz, 2, ' Hz')}</strong> · contributors: <strong>{contributors.length}</strong>
      </div>

      <SafeTableWrap minWidth={760}>
        <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed', marginBottom: 8 }}>
          <thead>
            <tr>
              <th style={{ ...tableHeaderStyle }}>Overall summed modal vector</th>
              <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Summed real</th>
              <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Summed imag</th>
              <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Magnitude</th>
              <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Phase angle</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid #ddd6fe' }}>
              <td style={{ padding: '3px 6px', fontSize: 10, fontWeight: 700 }}>modalSumRe / modalSumIm</td>
              <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10, fontFamily: 'monospace' }}>{fmt(sumRe, 5)}</td>
              <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10, fontFamily: 'monospace' }}>{fmt(sumIm, 5)}</td>
              <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10, fontFamily: 'monospace', fontWeight: 700 }}>{fmt(totalVectorMagnitude, 5)}</td>
              <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10, fontFamily: 'monospace' }}>{fmt(totalPhaseAngle, 1, '°')}</td>
            </tr>
          </tbody>
        </table>
      </SafeTableWrap>

      <SafeTableWrap minWidth={1120}>
        <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed', marginBottom: 8 }}>
          <thead>
            <tr>
              <th style={{ ...tableHeaderStyle }}>Type</th>
              <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Summed real</th>
              <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Summed imag</th>
              <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Vector mag</th>
              <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>% total vector</th>
              <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Avg phase spread</th>
              <th style={{ ...tableHeaderStyle }}>Strongest mode</th>
              <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Strongest mag</th>
              <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Strongest phase</th>
            </tr>
          </thead>
          <tbody>
            {groupRows.map(row => (
              <tr key={row.type} style={{ borderBottom: '1px solid #ddd6fe' }}>
                <td style={{ padding: '3px 6px', fontSize: 10, fontWeight: 700 }}>{row.type}</td>
                <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10, fontFamily: 'monospace' }}>{fmt(row.sumRe, 5)}</td>
                <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10, fontFamily: 'monospace' }}>{fmt(row.sumIm, 5)}</td>
                <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10, fontFamily: 'monospace', fontWeight: 700 }}>{fmt(row.summedMagnitude, 5)}</td>
                <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10, fontFamily: 'monospace' }}>{fmt(row.percentageOfTotal, 1, '%')}</td>
                <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10, fontFamily: 'monospace' }}>{fmt(row.phaseSpread, 1, '°')}</td>
                <td style={{ padding: '3px 6px', fontSize: 10, fontFamily: 'monospace', fontWeight: 700 }}>{row.strongest ? formatMode(row.strongest) : '—'}</td>
                <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10, fontFamily: 'monospace' }}>{fmt(row.strongest?.activeMagnitude, 5)}</td>
                <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10, fontFamily: 'monospace' }}>{fmt(row.strongest?.activePhaseAngleDeg, 1, '°')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SafeTableWrap>

      <SafeTableWrap minWidth={980}>
        <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed', marginBottom: 8 }}>
          <thead>
            <tr>
              <th style={{ ...tableHeaderStyle }}>Top 10 dominant contributors at null centre</th>
              <th style={{ ...tableHeaderStyle }}>Type</th>
              <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Mode freq</th>
              <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Magnitude</th>
              <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Phase angle</th>
              <th style={{ ...tableHeaderStyle }}>Polarity vs final vector</th>
            </tr>
          </thead>
          <tbody>
            {topRows.map((row, index) => (
              <tr key={`${index}-${formatMode(row)}`} style={{ borderBottom: '1px solid #ddd6fe' }}>
                <td style={{ padding: '3px 6px', fontSize: 10, fontFamily: 'monospace', fontWeight: 700 }}>{formatMode(row)}</td>
                <td style={{ padding: '3px 6px', fontSize: 10 }}>{row.modeType || '—'}</td>
                <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10, fontFamily: 'monospace' }}>{fmt(row.modeFrequencyHz, 2, ' Hz')}</td>
                <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10, fontFamily: 'monospace', fontWeight: 700 }}>{fmt(row.activeMagnitude, 5)}</td>
                <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10, fontFamily: 'monospace' }}>{fmt(row.activePhaseAngleDeg, 1, '°')}</td>
                <td style={{ padding: '3px 6px', fontSize: 10, fontWeight: 700 }}>{row.polarity}</td>
              </tr>
            ))}
            {topRows.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: '4px 6px', fontSize: 10, color: '#64748b' }}>No active modal contributor rows captured for the current null centre.</td>
              </tr>
            )}
          </tbody>
        </table>
      </SafeTableWrap>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
        <div style={{ padding: '6px 8px', borderRadius: 4, background: '#ede9fe', border: '1px solid #c4b5fd' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#5b21b6' }}>Axial dominance ratio</div>
          <div style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 700 }}>{fmt(axialDominanceRatio, 4)}</div>
          <div style={{ fontSize: 9, color: '#6b7280' }}>sum axial magnitudes / sum tangential + oblique magnitudes</div>
        </div>
        <div style={{ padding: '6px 8px', borderRadius: 4, background: '#ede9fe', border: '1px solid #c4b5fd' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#5b21b6' }}>Cancellation symmetry ratio</div>
          <div style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 700 }}>{fmt(cancellationSymmetryRatio, 4)}</div>
          <div style={{ fontSize: 9, color: '#6b7280' }}>sum destructive magnitudes / sum constructive magnitudes</div>
        </div>
      </div>
    </details>
  );
}