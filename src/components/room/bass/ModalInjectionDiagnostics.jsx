import React from 'react';

const TARGETS = [40, 68.6];
const MODE_TYPES = ['axial', 'tangential', 'oblique'];

function fmt(value, digits = 4, unit = '') {
  return Number.isFinite(value) ? `${value.toFixed(digits)}${unit}` : '—';
}

function formatMode(row) {
  return `[${row?.nx ?? '—'},${row?.ny ?? '—'},${row?.nz ?? '—'}]`;
}

function SafeTableWrap({ children, minWidth = 1120 }) {
  return (
    <div style={{ width: '100%', overflowX: 'auto', boxSizing: 'border-box' }}>
      <div style={{ minWidth }}>{children}</div>
    </div>
  );
}

function findNearestTargetRow(series, targetHz) {
  if (!Array.isArray(series) || series.length === 0) return null;
  return series.reduce((best, row) => {
    if (!best) return row;
    return Math.abs(Number(row.frequencyHz) - targetHz) < Math.abs(Number(best.frequencyHz) - targetHz) ? row : best;
  }, null);
}

function buildRows(contributors) {
  return (Array.isArray(contributors) ? contributors : [])
    .filter(row => row.mutedFromActiveModalSum !== true)
    .map((row) => {
      const rawModalMagnitude = Number(row.rawModalMagnitude);
      const finalActiveMagnitude = Number(row.activeMagnitude);
      return {
        ...row,
        rawModalMagnitude,
        modalTransferMagnitude: Number(row.modalTransferMagnitude),
        finalActiveMagnitude,
        contributionEfficiencyRatio: Number.isFinite(finalActiveMagnitude) && Number.isFinite(rawModalMagnitude) && rawModalMagnitude > 0
          ? finalActiveMagnitude / rawModalMagnitude
          : null,
      };
    })
    .sort((a, b) => (Number(b.finalActiveMagnitude) || 0) - (Number(a.finalActiveMagnitude) || 0));
}

function average(values) {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return null;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function GroupSummary({ rows }) {
  const summaries = MODE_TYPES.map((type) => {
    const groupRows = rows.filter(row => row.modeType === type);
    return {
      type,
      count: groupRows.length,
      averageEfficiency: average(groupRows.map(row => row.contributionEfficiencyRatio)),
    };
  });
  const strongest = rows
    .filter(row => Number.isFinite(row.contributionEfficiencyRatio))
    .sort((a, b) => b.contributionEfficiencyRatio - a.contributionEfficiencyRatio)[0] || null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, marginTop: 8 }}>
      {summaries.map((summary) => (
        <div key={summary.type} style={{ padding: '6px 8px', borderRadius: 4, background: '#e0f2fe', border: '1px solid #7dd3fc' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#0369a1' }}>{summary.type} average contribution efficiency</div>
          <div style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 700 }}>{fmt(summary.averageEfficiency, 5)}</div>
          <div style={{ fontSize: 9, color: '#6b7280' }}>{summary.count} contributors</div>
        </div>
      ))}
      <div style={{ padding: '6px 8px', borderRadius: 4, background: '#e0f2fe', border: '1px solid #7dd3fc' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#0369a1' }}>Strongest efficiency contributor</div>
        <div style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 700 }}>{strongest ? formatMode(strongest) : '—'}</div>
        <div style={{ fontSize: 9, color: '#6b7280' }}>ratio {fmt(strongest?.contributionEfficiencyRatio, 5)}</div>
      </div>
    </div>
  );
}

export default function ModalInjectionDiagnostics({ contributorSeries, tableHeaderStyle }) {
  const series = Array.isArray(contributorSeries) ? contributorSeries : [];
  
  // Compute summaries for closed state
  const summaries = TARGETS.map((targetHz) => {
    const targetRow = findNearestTargetRow(series, targetHz);
    const rows = buildRows(targetRow?.contributors);
    const strongest = rows[0] || null;
    return { targetHz, strongest, count: rows.length };
  });

  return (
    <details style={{ marginTop: 10, padding: '8px 10px', borderRadius: 6, background: '#f0f9ff', border: '1px solid #7dd3fc' }}>
      <summary style={{ fontSize: 10, fontWeight: 700, color: '#0369a1', cursor: 'pointer' }}>
        Modal Injection Diagnostics <span style={{ fontWeight: 400, fontStyle: 'italic', color: '#64748b' }}>({summaries.map(s => `${fmt(s.targetHz, 0)} Hz ${s.strongest ? formatMode(s.strongest) : '—'}`).join(' | ')})</span>
      </summary>

      <div style={{ marginTop: 8, fontSize: 10, color: '#075985', marginBottom: 6 }}>
        {summaries.map(s => `${fmt(s.targetHz, 0)} Hz: ${s.count} contributors`).join(' · ')}
      </div>

      {TARGETS.map((targetHz) => {
        const targetRow = findNearestTargetRow(series, targetHz);
        const rows = buildRows(targetRow?.contributors).slice(0, 10);

        return (
          <div key={targetHz} style={{ marginTop: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#0369a1', marginBottom: 4 }}>
              Target {fmt(targetHz, 1, ' Hz')} · evaluated row {fmt(targetRow?.frequencyHz, 2, ' Hz')}
            </div>

            <SafeTableWrap>
              <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed', marginBottom: 8 }}>
                <thead>
                  <tr>
                    <th style={{ ...tableHeaderStyle }}>Mode</th>
                    <th style={{ ...tableHeaderStyle }}>Type</th>
                    <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Source coupling</th>
                    <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Receiver coupling</th>
                    <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Combined coupling</th>
                    <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Raw modal magnitude</th>
                    <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Modal transfer magnitude</th>
                    <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Final active magnitude</th>
                    <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Contribution efficiency</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={`${targetHz}-${index}-${formatMode(row)}`} style={{ borderBottom: '1px solid #bae6fd' }}>
                      <td style={{ padding: '3px 6px', fontSize: 10, fontFamily: 'monospace', fontWeight: 700 }}>{formatMode(row)}</td>
                      <td style={{ padding: '3px 6px', fontSize: 10 }}>{row.modeType || '—'}</td>
                      <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10, fontFamily: 'monospace' }}>{fmt(row.sourceCoupling, 5)}</td>
                      <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10, fontFamily: 'monospace' }}>{fmt(row.receiverCoupling, 5)}</td>
                      <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10, fontFamily: 'monospace' }}>{fmt(row.combinedCoupling, 5)}</td>
                      <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10, fontFamily: 'monospace' }}>{fmt(row.rawModalMagnitude, 5)}</td>
                      <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10, fontFamily: 'monospace' }}>{fmt(row.modalTransferMagnitude, 5)}</td>
                      <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10, fontFamily: 'monospace', fontWeight: 700 }}>{fmt(row.finalActiveMagnitude, 5)}</td>
                      <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10, fontFamily: 'monospace', fontWeight: 700 }}>{fmt(row.contributionEfficiencyRatio, 5)}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={9} style={{ padding: '4px 6px', fontSize: 10, color: '#64748b' }}>No active modal contributor rows captured for this target.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </SafeTableWrap>

            <GroupSummary rows={rows} />
          </div>
        );
      })}
    </details>
  );
}