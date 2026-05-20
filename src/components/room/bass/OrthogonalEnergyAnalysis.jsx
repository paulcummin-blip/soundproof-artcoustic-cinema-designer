import React from 'react';

function fmt(value, digits = 4, unit = '') {
  return Number.isFinite(value) ? `${value.toFixed(digits)}${unit}` : '—';
}

function formatMode(row) {
  return `[${row?.nx ?? '—'},${row?.ny ?? '—'},${row?.nz ?? '—'}]`;
}

function phaseDeg(re, im) {
  return Number.isFinite(re) && Number.isFinite(im) ? (Math.atan2(im, re) * 180) / Math.PI : null;
}

function averagePhaseAngle(rows) {
  const phases = rows
    .map(row => Number(row.activePhaseAngleDeg))
    .filter(Number.isFinite);

  if (phases.length === 0) return null;

  const meanRe = phases.reduce((sum, deg) => sum + Math.cos((deg * Math.PI) / 180), 0) / phases.length;
  const meanIm = phases.reduce((sum, deg) => sum + Math.sin((deg * Math.PI) / 180), 0) / phases.length;
  return phaseDeg(meanRe, meanIm);
}

function SafeTableWrap({ children, minWidth = 760 }) {
  return (
    <div style={{ width: '100%', overflowX: 'auto', boxSizing: 'border-box' }}>
      <div style={{ minWidth }}>{children}</div>
    </div>
  );
}

export default function OrthogonalEnergyAnalysis({
  orthogonalContributors,
  totalOrthogonalMagnitude,
  totalContributorMagnitude,
  sumConstructiveMagnitudes,
  sumDestructiveMagnitudes,
  tableHeaderStyle,
}) {
  const strongestOrthogonal = orthogonalContributors.reduce((best, row) => {
    if (!best) return row;
    return (Number(row.activeMagnitude) || 0) > (Number(best.activeMagnitude) || 0) ? row : best;
  }, null);

  const orthogonalPercentageOfTotal = totalContributorMagnitude > 0
    ? (totalOrthogonalMagnitude / totalContributorMagnitude) * 100
    : null;
  const orthogonalRetentionRatio = totalContributorMagnitude > 0
    ? totalOrthogonalMagnitude / totalContributorMagnitude
    : null;
  const cancellationEfficiencyRatio = totalContributorMagnitude > 0
    ? (sumConstructiveMagnitudes + sumDestructiveMagnitudes) / totalContributorMagnitude
    : null;
  const nullParticipationRatio = (sumDestructiveMagnitudes + totalOrthogonalMagnitude) > 0
    ? sumDestructiveMagnitudes / (sumDestructiveMagnitudes + totalOrthogonalMagnitude)
    : null;

  return (
    <details id="diagnostic-orthogonal" open style={{ scrollMarginTop: 54, marginTop: 10, padding: '8px 10px', borderRadius: 6, background: '#f0fdf4', border: '1px solid #86efac' }}>
      <summary style={{ fontSize: 10, fontWeight: 700, color: '#16a34a', cursor: 'pointer' }}>
        Orthogonal Energy Analysis <span style={{ fontWeight: 400, fontStyle: 'italic', color: '#64748b' }}>(temporary · active coherent contributors only)</span>
      </summary>

      <div style={{ marginTop: 8, fontSize: 10, color: '#15803d', marginBottom: 6 }}>
        Uses totalContributorMagnitude as the denominator for energy percentages and ratios, preserving the final coherent vector magnitude as display-only.
      </div>

      <SafeTableWrap minWidth={840}>
        <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed', marginBottom: 8 }}>
          <thead>
            <tr>
              <th style={{ ...tableHeaderStyle }}>Orthogonal metric</th>
              <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Value</th>
              <th style={{ ...tableHeaderStyle }}>Formula / source</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid #bbf7d0' }}>
              <td style={{ padding: '3px 6px', fontSize: 10 }}>Orthogonal contributor count</td>
              <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10, fontFamily: 'monospace' }}>{orthogonalContributors.length}</td>
              <td style={{ padding: '3px 6px', fontSize: 10, color: '#6b7280' }}>contributors between constructive and destructive phase regions</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #bbf7d0' }}>
              <td style={{ padding: '3px 6px', fontSize: 10 }}>Total orthogonal magnitude</td>
              <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10, fontFamily: 'monospace', fontWeight: 700 }}>{fmt(totalOrthogonalMagnitude, 5)}</td>
              <td style={{ padding: '3px 6px', fontSize: 10, color: '#6b7280' }}>sum orthogonal activeMagnitude</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #bbf7d0' }}>
              <td style={{ padding: '3px 6px', fontSize: 10 }}>Orthogonal magnitude % of total contributor magnitude</td>
              <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10, fontFamily: 'monospace', fontWeight: 700 }}>{fmt(orthogonalPercentageOfTotal, 2, '%')}</td>
              <td style={{ padding: '3px 6px', fontSize: 10, color: '#6b7280' }}>sum orthogonal / totalContributorMagnitude</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #bbf7d0' }}>
              <td style={{ padding: '3px 6px', fontSize: 10 }}>Strongest orthogonal contributor</td>
              <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10, fontFamily: 'monospace', fontWeight: 700 }}>{strongestOrthogonal ? formatMode(strongestOrthogonal) : '—'}</td>
              <td style={{ padding: '3px 6px', fontSize: 10, color: '#6b7280' }}>largest orthogonal activeMagnitude</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #bbf7d0' }}>
              <td style={{ padding: '3px 6px', fontSize: 10 }}>Strongest orthogonal contributor magnitude</td>
              <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10, fontFamily: 'monospace' }}>{fmt(strongestOrthogonal?.activeMagnitude, 5)}</td>
              <td style={{ padding: '3px 6px', fontSize: 10, color: '#6b7280' }}>activeMagnitude</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #bbf7d0' }}>
              <td style={{ padding: '3px 6px', fontSize: 10 }}>Strongest orthogonal contributor phase</td>
              <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10, fontFamily: 'monospace' }}>{fmt(strongestOrthogonal?.activePhaseAngleDeg, 1, '°')}</td>
              <td style={{ padding: '3px 6px', fontSize: 10, color: '#6b7280' }}>activePhaseAngleDeg</td>
            </tr>
            <tr>
              <td style={{ padding: '3px 6px', fontSize: 10 }}>Average orthogonal phase angle</td>
              <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10, fontFamily: 'monospace' }}>{fmt(averagePhaseAngle(orthogonalContributors), 1, '°')}</td>
              <td style={{ padding: '3px 6px', fontSize: 10, color: '#6b7280' }}>circular average of orthogonal phases</td>
            </tr>
          </tbody>
        </table>
      </SafeTableWrap>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
        <div style={{ padding: '6px 8px', borderRadius: 4, background: '#dcfce7', border: '1px solid #bbf7d0' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#16a34a' }}>Orthogonal retention ratio</div>
          <div style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 700 }}>{fmt(orthogonalRetentionRatio, 4)}</div>
          <div style={{ fontSize: 9, color: '#6b7280' }}>sum orthogonal magnitudes / totalContributorMagnitude</div>
        </div>
        <div style={{ padding: '6px 8px', borderRadius: 4, background: '#dcfce7', border: '1px solid #bbf7d0' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#16a34a' }}>Cancellation efficiency ratio</div>
          <div style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 700 }}>{fmt(cancellationEfficiencyRatio, 4)}</div>
          <div style={{ fontSize: 9, color: '#6b7280' }}>(sum constructive + sum destructive) / totalContributorMagnitude</div>
        </div>
        <div style={{ padding: '6px 8px', borderRadius: 4, background: '#dcfce7', border: '1px solid #bbf7d0' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#16a34a' }}>Null participation ratio</div>
          <div style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 700 }}>{fmt(nullParticipationRatio, 4)}</div>
          <div style={{ fontSize: 9, color: '#6b7280' }}>sum destructive / (sum destructive + sum orthogonal)</div>
        </div>
      </div>
    </details>
  );
}