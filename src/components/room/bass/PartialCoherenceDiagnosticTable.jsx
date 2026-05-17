import React from 'react';

const TARGET_ROWS = [
  { key: 'hz34', label: '34.3 Hz', targetHz: 34.3 },
  { key: 'hz40', label: '40.4 Hz', targetHz: 40.4 },
  { key: 'hz68', label: '68.6 Hz', targetHz: 68.6 },
];

function fmt(value, digits = 2, unit = '') {
  return Number.isFinite(value) ? `${value.toFixed(digits)}${unit}` : '—';
}

function findNearestByTarget(series, targetHz) {
  return (Array.isArray(series) ? series : []).reduce((best, point) => {
    const frequencyHz = Number(point?.frequencyHz ?? point?.frequency);
    if (!Number.isFinite(frequencyHz) || Math.abs(frequencyHz - targetHz) > 2) return best;

    if (!best || Math.abs(frequencyHz - targetHz) < Math.abs(best.frequencyHz - targetHz)) {
      return { frequencyHz, point };
    }

    return best;
  }, null);
}

function findNearestDiagnostic(wholeCurveDebugRows, targetHz) {
  const rowSources = [
    ...(Array.isArray(wholeCurveDebugRows) ? wholeCurveDebugRows : []),
    ...(Array.isArray(wholeCurveDebugRows?.partialCoherenceDiagnosticSeries)
      ? wholeCurveDebugRows.partialCoherenceDiagnosticSeries
      : []),
  ];

  return rowSources.reduce((best, row) => {
    const diagnostic = row?.partialCoherenceDiagnostic ?? row;
    const frequencyHz = Number(diagnostic?.frequencyHz ?? row?.frequencyHz);
    if (!Number.isFinite(frequencyHz) || Math.abs(frequencyHz - targetHz) > 2) return best;

    if (!best || Math.abs(frequencyHz - targetHz) < Math.abs(best.frequencyHz - targetHz)) {
      return { frequencyHz, diagnostic };
    }

    return best;
  }, null);
}

function getBenchmarkValue(rewTargets, key) {
  if (key === 'hz34') return `${fmt(rewTargets?.hz34?.featureMagnitudeDb, 2, ' dB')} local feature magnitude`;
  if (key === 'hz40') return `${fmt(rewTargets?.hz40?.nullDepthDb, 2, ' dB')} null depth`;
  if (key === 'hz68') return `${fmt(rewTargets?.hz68?.peakProminenceDb, 2, ' dB')} local peak prominence`;
  return 'not available here';
}

export default function PartialCoherenceDiagnosticTable({ wholeCurveDebugRows, rewTargets }) {
  const rows = TARGET_ROWS.map((target) => {
    const nearest = findNearestDiagnostic(wholeCurveDebugRows, target.targetHz);
    const distributedNearest = findNearestByTarget(wholeCurveDebugRows?.distributedCoherenceDiagnosticSeries, target.targetHz);
    const splitNearest = findNearestByTarget(wholeCurveDebugRows?.splitCoherenceDiagnosticSeries, target.targetHz);
    const diagnostic = nearest?.diagnostic ?? null;
    const distributedDiagnostic = distributedNearest?.point ?? null;
    const splitDiagnostic = splitNearest?.point ?? null;

    return {
      ...target,
      evalHz: nearest?.frequencyHz ?? distributedNearest?.frequencyHz ?? splitNearest?.frequencyHz ?? null,
      coherentFinalDb: diagnostic?.coherentFinalDb ?? distributedDiagnostic?.coherentFinalDb ?? splitDiagnostic?.coherentFinalDb ?? null,
      partialCoherenceDiagnosticDb: diagnostic?.partialCoherenceDiagnosticDb ?? null,
      distributedCoherenceDiagnosticDb: distributedDiagnostic?.distributedCoherenceFinalDb ?? null,
      splitCoherenceDiagnosticDb: splitDiagnostic?.splitCoherenceFinalDb ?? null,
      differenceDb: diagnostic?.differenceDb ?? null,
      distributedDifferenceDb: distributedDiagnostic?.differenceVsActiveDb ?? null,
      splitDifferenceDb: splitDiagnostic?.differenceVsActiveDb ?? null,
      rewBenchmark: getBenchmarkValue(rewTargets, target.key),
      closerToRew: 'not available here',
    };
  });

  const tableHeaderStyle = {
    textAlign: 'left',
    padding: '3px 6px',
    fontSize: 10,
    fontWeight: 700,
    color: '#374151',
    background: '#f9fafb',
    borderBottom: '2px solid #e5e7eb',
    whiteSpace: 'nowrap',
  };

  const cellStyle = {
    padding: '3px 6px',
    fontSize: 10,
    color: '#374151',
    borderBottom: '1px solid #e5e7eb',
  };

  const numberCellStyle = {
    ...cellStyle,
    textAlign: 'right',
    fontFamily: 'monospace',
    whiteSpace: 'nowrap',
  };

  return (
    <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 6, background: '#f0f9ff', border: '1px solid #7dd3fc' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#0369a1', marginBottom: 3 }}>
        Modal coherence diagnostics — active simulation unchanged
      </div>
      <div style={{ fontSize: 10, color: '#64748b', marginBottom: 6 }}>
        Diagnostic visibility only · no scoring impact · active coherent curve, REW benchmark scoring, and RP22/live output unchanged.
      </div>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={tableHeaderStyle}>Target Hz</th>
            <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Eval Hz</th>
            <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Active coherent final dB</th>
            <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Downstream partial dB</th>
            <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Distributed phase coherence dB</th>
            <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Per-mode split coherence dB</th>
            <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Downstream Δ vs active</th>
            <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Distributed phase Δ vs active</th>
            <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Per-mode split Δ vs active</th>
            <th style={tableHeaderStyle}>REW benchmark value</th>
            <th style={tableHeaderStyle}>Partial closer to REW?</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td style={{ ...cellStyle, fontWeight: 700 }}>{row.label}</td>
              <td style={numberCellStyle}>{fmt(row.evalHz, 2, ' Hz')}</td>
              <td style={numberCellStyle}>{fmt(row.coherentFinalDb, 2, ' dB')}</td>
              <td style={{ ...numberCellStyle, fontWeight: 700, color: '#0369a1' }}>{fmt(row.partialCoherenceDiagnosticDb, 2, ' dB')}</td>
              <td style={{ ...numberCellStyle, fontWeight: 700, color: '#c2410c' }}>{fmt(row.distributedCoherenceDiagnosticDb, 2, ' dB')}</td>
              <td style={{ ...numberCellStyle, fontWeight: 700, color: '#6d28d9' }}>{fmt(row.splitCoherenceDiagnosticDb, 2, ' dB')}</td>
              <td style={numberCellStyle}>{fmt(row.differenceDb, 2, ' dB')}</td>
              <td style={numberCellStyle}>{fmt(row.distributedDifferenceDb, 2, ' dB')}</td>
              <td style={numberCellStyle}>{fmt(row.splitDifferenceDb, 2, ' dB')}</td>
              <td style={cellStyle}>{row.rewBenchmark}</td>
              <td style={{ ...cellStyle, color: '#64748b', fontStyle: 'italic' }}>{row.closerToRew}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 6, fontSize: 10, color: '#64748b' }}>
        Distributed phase and per-mode split modal coherence curves are diagnostic-only and are not used for benchmark scoring; REW absolute SPL closeness is not scored in this table.
      </div>
    </div>
  );
}