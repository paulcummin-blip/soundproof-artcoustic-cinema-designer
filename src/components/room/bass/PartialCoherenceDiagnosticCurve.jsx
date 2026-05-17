import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

function normaliseCoherentSeries(series) {
  return (Array.isArray(series) ? series : [])
    .map((point) => ({
      frequency: Number(point?.frequency ?? point?.frequencyHz),
      coherentFinalDb: Number(point?.spl ?? point?.splDb),
    }))
    .filter((point) => Number.isFinite(point.frequency) && Number.isFinite(point.coherentFinalDb));
}

function normalisePartialSeries(series) {
  return (Array.isArray(series) ? series : [])
    .map((point) => ({
      frequency: Number(point?.frequencyHz),
      partialCoherenceDb: Number(point?.partialCoherenceDiagnosticDb),
      coherentFinalDb: Number(point?.coherentFinalDb),
      differenceDb: Number(point?.differenceDb),
    }))
    .filter((point) => Number.isFinite(point.frequency) && Number.isFinite(point.partialCoherenceDb));
}

function normaliseDistributedSeries(series) {
  return (Array.isArray(series) ? series : [])
    .map((point) => ({
      frequency: Number(point?.frequencyHz),
      distributedCoherenceDb: Number(point?.distributedCoherenceFinalDb),
      coherentFinalDb: Number(point?.coherentFinalDb),
      distributedDifferenceDb: Number(point?.differenceVsActiveDb),
    }))
    .filter((point) => Number.isFinite(point.frequency) && Number.isFinite(point.distributedCoherenceDb));
}

function normaliseSplitSeries(series) {
  return (Array.isArray(series) ? series : [])
    .map((point) => ({
      frequency: Number(point?.frequencyHz),
      splitCoherenceDb: Number(point?.splitCoherenceFinalDb),
      coherentFinalDb: Number(point?.coherentFinalDb),
      splitDifferenceDb: Number(point?.differenceVsActiveDb),
    }))
    .filter((point) => Number.isFinite(point.frequency) && Number.isFinite(point.splitCoherenceDb));
}

function buildChartData(coherentSeries, partialSeries, distributedSeries, splitSeries) {
  const rowsByFrequency = new Map();

  coherentSeries.forEach((point) => {
    rowsByFrequency.set(point.frequency, {
      frequency: point.frequency,
      coherentFinalDb: point.coherentFinalDb,
    });
  });

  partialSeries.forEach((point) => {
    const existing = rowsByFrequency.get(point.frequency) || { frequency: point.frequency };
    rowsByFrequency.set(point.frequency, {
      ...existing,
      coherentFinalDb: Number.isFinite(existing.coherentFinalDb) ? existing.coherentFinalDb : point.coherentFinalDb,
      partialCoherenceDb: point.partialCoherenceDb,
      differenceDb: point.differenceDb,
    });
  });

  distributedSeries.forEach((point) => {
    const existing = rowsByFrequency.get(point.frequency) || { frequency: point.frequency };
    rowsByFrequency.set(point.frequency, {
      ...existing,
      coherentFinalDb: Number.isFinite(existing.coherentFinalDb) ? existing.coherentFinalDb : point.coherentFinalDb,
      distributedCoherenceDb: point.distributedCoherenceDb,
      distributedDifferenceDb: point.distributedDifferenceDb,
    });
  });

  splitSeries.forEach((point) => {
    const existing = rowsByFrequency.get(point.frequency) || { frequency: point.frequency };
    rowsByFrequency.set(point.frequency, {
      ...existing,
      coherentFinalDb: Number.isFinite(existing.coherentFinalDb) ? existing.coherentFinalDb : point.coherentFinalDb,
      splitCoherenceDb: point.splitCoherenceDb,
      splitDifferenceDb: point.splitDifferenceDb,
    });
  });

  return Array.from(rowsByFrequency.values()).sort((a, b) => a.frequency - b.frequency);
}

function DiagnosticTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  const row = payload[0]?.payload || {};
  const frequency = Number(row.frequency ?? label);
  const coherent = Number(row.coherentFinalDb);
  const partial = Number(row.partialCoherenceDb);
  const distributed = Number(row.distributedCoherenceDb);
  const split = Number(row.splitCoherenceDb);
  const diff = Number.isFinite(Number(row.differenceDb))
    ? Number(row.differenceDb)
    : Number.isFinite(partial) && Number.isFinite(coherent)
      ? partial - coherent
      : null;
  const distributedDiff = Number.isFinite(Number(row.distributedDifferenceDb))
    ? Number(row.distributedDifferenceDb)
    : Number.isFinite(distributed) && Number.isFinite(coherent)
      ? distributed - coherent
      : null;
  const splitDiff = Number.isFinite(Number(row.splitDifferenceDb))
    ? Number(row.splitDifferenceDb)
    : Number.isFinite(split) && Number.isFinite(coherent)
      ? split - coherent
      : null;

  return (
    <div style={{ background: '#ffffff', border: '1px solid #bae6fd', borderRadius: 6, padding: '8px 10px', fontSize: 10, fontFamily: 'monospace', color: '#0f172a', boxShadow: '0 6px 18px rgba(15, 23, 42, 0.12)' }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{Number.isFinite(frequency) ? frequency.toFixed(2) : '—'} Hz</div>
      <div>Coherent final: {Number.isFinite(coherent) ? `${coherent.toFixed(2)} dB` : '—'}</div>
      <div>Downstream partial: {Number.isFinite(partial) ? `${partial.toFixed(2)} dB` : '—'}</div>
      <div>Distributed phase modal coherence: {Number.isFinite(distributed) ? `${distributed.toFixed(2)} dB` : '—'}</div>
      <div>Per-mode split modal coherence: {Number.isFinite(split) ? `${split.toFixed(2)} dB` : '—'}</div>
      <div>Downstream Δ: {Number.isFinite(diff) ? `${diff >= 0 ? '+' : ''}${diff.toFixed(2)} dB` : '—'}</div>
      <div>Distributed phase Δ: {Number.isFinite(distributedDiff) ? `${distributedDiff >= 0 ? '+' : ''}${distributedDiff.toFixed(2)} dB` : '—'}</div>
      <div>Per-mode split Δ: {Number.isFinite(splitDiff) ? `${splitDiff >= 0 ? '+' : ''}${splitDiff.toFixed(2)} dB` : '—'}</div>
      <div style={{ marginTop: 4, color: '#0369a1', fontStyle: 'italic' }}>Diagnostic only — active curve, REW benchmark, and RP22/live output unchanged</div>
    </div>
  );
}

export default function PartialCoherenceDiagnosticCurve({ b44Series, partialCoherenceDiagnosticSeries, distributedCoherenceDiagnosticSeries, splitCoherenceDiagnosticSeries }) {
  const chartData = React.useMemo(() => {
    return buildChartData(
      normaliseCoherentSeries(b44Series),
      normalisePartialSeries(partialCoherenceDiagnosticSeries),
      normaliseDistributedSeries(distributedCoherenceDiagnosticSeries),
      normaliseSplitSeries(splitCoherenceDiagnosticSeries)
    );
  }, [b44Series, partialCoherenceDiagnosticSeries, distributedCoherenceDiagnosticSeries, splitCoherenceDiagnosticSeries]);

  const hasDiagnosticCurve = chartData.some((point) =>
    Number.isFinite(point.partialCoherenceDb) ||
    Number.isFinite(point.distributedCoherenceDb) ||
    Number.isFinite(point.splitCoherenceDb)
  );

  if (!hasDiagnosticCurve) {
    return null;
  }

  return (
    <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 6, background: '#ecfeff', border: '1px solid #67e8f9', maxWidth: '100%', overflow: 'hidden', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 4 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#0e7490' }}>
          Modal coherence diagnostics — not used for scoring
        </div>
        <div style={{ fontSize: 9, color: '#64748b', fontFamily: 'monospace' }}>
          Overlay only · active benchmark curve unchanged
        </div>
      </div>
      <div style={{ fontSize: 10, color: '#64748b', marginBottom: 8 }}>
        Shows the active coherent final curve against downstream partial coherence, distributed phase modal coherence, and per-mode split modal coherence diagnostics. Active scoring, REW benchmark, and RP22/live output remain unchanged.
      </div>
      <div style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#cffafe" />
            <XAxis
              dataKey="frequency"
              type="number"
              domain={[20, 200]}
              scale="log"
              ticks={[20, 30, 40, 50, 60, 70, 80, 100, 120, 150, 200]}
              tickFormatter={(tick) => Number.isFinite(Number(tick)) ? Number(tick).toFixed(0) : ''}
              tick={{ fill: '#334155', fontSize: 10 }}
            />
            <YAxis
              tickFormatter={(tick) => Number.isFinite(Number(tick)) ? Number(tick).toFixed(0) : ''}
              tick={{ fill: '#334155', fontSize: 10 }}
              width={36}
            />
            <Tooltip content={<DiagnosticTooltip />} />
            <Legend wrapperStyle={{ fontSize: 10, fontFamily: 'monospace', maxWidth: '100%', whiteSpace: 'normal' }} />
            <Line
              name="Active coherent"
              type="monotone"
              dataKey="coherentFinalDb"
              stroke="#213428"
              strokeWidth={2}
              dot={false}
              activeDot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
            <Line
              name="Downstream partial"
              type="monotone"
              dataKey="partialCoherenceDb"
              stroke="#0891b2"
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={false}
              activeDot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
            <Line
              name="Distributed phase"
              type="monotone"
              dataKey="distributedCoherenceDb"
              stroke="#f97316"
              strokeWidth={2}
              strokeDasharray="3 3"
              dot={false}
              activeDot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
            <Line
              name="Per-mode split"
              type="monotone"
              dataKey="splitCoherenceDb"
              stroke="#7c3aed"
              strokeWidth={2}
              strokeDasharray="8 3 2 3"
              dot={false}
              activeDot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}