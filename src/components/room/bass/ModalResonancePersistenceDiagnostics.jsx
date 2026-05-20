import React from 'react';

const MODE_TYPES = ['axial', 'tangential', 'oblique'];

function fmt(value, digits = 4, unit = '') {
  return Number.isFinite(value) ? `${value.toFixed(digits)}${unit}` : '—';
}

function formatMode(row) {
  return `[${row?.nx ?? '—'},${row?.ny ?? '—'},${row?.nz ?? '—'}]`;
}

function persistenceDb(ratio) {
  return Number.isFinite(ratio) && ratio > 0 ? 20 * Math.log10(ratio) : null;
}

function average(values) {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return null;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function SafeTableWrap({ children, minWidth = 980 }) {
  return (
    <div style={{ width: '100%', overflowX: 'auto', boxSizing: 'border-box' }}>
      <div style={{ minWidth }}>{children}</div>
    </div>
  );
}

function buildPersistenceRows(contributors) {
  return contributors
    .map((row) => {
      const activeMagnitudeAtNull = Number(row.activeMagnitude);
      const estimatedResonanceMagnitude = Number(row.estimatedResonanceMagnitude);
      const ratio = Number.isFinite(activeMagnitudeAtNull) && Number.isFinite(estimatedResonanceMagnitude) && estimatedResonanceMagnitude > 0
        ? activeMagnitudeAtNull / estimatedResonanceMagnitude
        : null;

      return {
        ...row,
        activeMagnitudeAtNull,
        estimatedResonanceMagnitude,
        persistenceRatio: ratio,
        persistenceDbAttenuation: persistenceDb(ratio),
      };
    })
    .sort((a, b) => (Number(b.persistenceRatio) || 0) - (Number(a.persistenceRatio) || 0));
}

export default function ModalResonancePersistenceDiagnostics({ contributors, tableHeaderStyle }) {
  const rows = buildPersistenceRows(Array.isArray(contributors) ? contributors : []);
  const strongestPersistence = rows.find(row => Number.isFinite(row.persistenceRatio)) || null;
  const groupSummaries = MODE_TYPES.map((type) => {
    const groupRows = rows.filter(row => row.modeType === type);
    return {
      type,
      count: groupRows.length,
      averagePersistenceDb: average(groupRows.map(row => row.persistenceDbAttenuation)),
    };
  });

  return (
    <details open style={{ marginTop: 10, padding: '8px 10px', borderRadius: 6, background: '#fff7ed', border: '1px solid #fdba74' }}>
      <summary style={{ fontSize: 10, fontWeight: 700, color: '#c2410c', cursor: 'pointer' }}>
        Modal Resonance Persistence Diagnostics <span style={{ fontWeight: 400, fontStyle: 'italic', color: '#64748b' }}>(temporary · diagnostics only)</span>
      </summary>

      <div style={{ marginTop: 8, fontSize: 10, color: '#9a3412', marginBottom: 6 }}>
        Estimates how much modal magnitude remains at the null centre versus the same mode’s estimated resonance magnitude. Sorted by persistence ratio descending.
      </div>

      <SafeTableWrap minWidth={1120}>
        <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed', marginBottom: 8 }}>
          <thead>
            <tr>
              <th style={{ ...tableHeaderStyle }}>Mode</th>
              <th style={{ ...tableHeaderStyle }}>Type</th>
              <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Resonance freq</th>
              <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Active mag at null</th>
              <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Estimated resonance mag</th>
              <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Persistence ratio</th>
              <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Persistence dB attenuation</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${index}-${formatMode(row)}`} style={{ borderBottom: '1px solid #fed7aa' }}>
                <td style={{ padding: '3px 6px', fontSize: 10, fontFamily: 'monospace', fontWeight: 700 }}>{formatMode(row)}</td>
                <td style={{ padding: '3px 6px', fontSize: 10 }}>{row.modeType || '—'}</td>
                <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10, fontFamily: 'monospace' }}>{fmt(row.modeFrequencyHz, 2, ' Hz')}</td>
                <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10, fontFamily: 'monospace' }}>{fmt(row.activeMagnitudeAtNull, 5)}</td>
                <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10, fontFamily: 'monospace' }}>{fmt(row.estimatedResonanceMagnitude, 5)}</td>
                <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10, fontFamily: 'monospace', fontWeight: 700 }}>{fmt(row.persistenceRatio, 5)}</td>
                <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10, fontFamily: 'monospace' }}>{fmt(row.persistenceDbAttenuation, 2, ' dB')}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: '4px 6px', fontSize: 10, color: '#64748b' }}>No active modal contributor rows captured for the current null centre.</td>
              </tr>
            )}
          </tbody>
        </table>
      </SafeTableWrap>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
        {groupSummaries.map((summary) => (
          <div key={summary.type} style={{ padding: '6px 8px', borderRadius: 4, background: '#ffedd5', border: '1px solid #fed7aa' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#c2410c' }}>{summary.type} average persistence dB</div>
            <div style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 700 }}>{fmt(summary.averagePersistenceDb, 2, ' dB')}</div>
            <div style={{ fontSize: 9, color: '#6b7280' }}>{summary.count} contributors</div>
          </div>
        ))}
        <div style={{ padding: '6px 8px', borderRadius: 4, background: '#ffedd5', border: '1px solid #fed7aa' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#c2410c' }}>Strongest persistence contributor</div>
          <div style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 700 }}>{strongestPersistence ? formatMode(strongestPersistence) : '—'}</div>
          <div style={{ fontSize: 9, color: '#6b7280' }}>ratio {fmt(strongestPersistence?.persistenceRatio, 5)} · {fmt(strongestPersistence?.persistenceDbAttenuation, 2, ' dB')}</div>
        </div>
      </div>
    </details>
  );
}