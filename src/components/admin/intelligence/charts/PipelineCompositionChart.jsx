// PipelineCompositionChart.jsx
// ----------------------------
// The forecast split across the dealer groups: columns for the chosen measure,
// with every group's project count, trade value and units shown underneath so
// the count and the value can be read together.
//
// Presentation only. The groups come from the pipelineComposition authority.

import React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BRAND, Card, EmptyState } from '../IntelligenceUi';
import { formatMoney, formatNumber } from '@/lib/commercial/projectReporting/formatMoney';
import { compactMoney, formatMetricValue } from './PipelineTimelineChart';

const CHART_HEIGHT = 230;

/** One colour per group, held constant across the measures. */
export const GROUP_COLOURS = {
  premium_partners: BRAND.primary,
  richer_sounds: BRAND.accent,
  trade: BRAND.info,
};

export const COMPOSITION_METRICS = [
  { key: 'count', label: 'Projects', format: 'number' },
  { key: 'trade', label: 'Trade value', format: 'money' },
];

const money = (value, currency) => (
  value === null || value === undefined ? 'No Artcoustic value' : formatMoney(value, currency || 'GBP')
);

function MetricToggle({ metric, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {COMPOSITION_METRICS.map((option) => {
        const active = option.key === metric.key;
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange?.(option.key)}
            style={{
              padding: '4px 10px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              border: `1px solid ${active ? BRAND.primary : BRAND.border}`,
              background: active ? BRAND.primary : BRAND.card,
              color: active ? '#FFFFFF' : BRAND.subtext,
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export default function PipelineCompositionChart({ composition, currency = 'GBP', metric, onMetricChange }) {
  if (!composition || !metric) return null;

  const rows = composition.rows || [];
  const hasData = rows.some((row) => row[metric.key] !== null && row[metric.key] !== undefined);

  const renderTooltip = ({ active, payload }) => {
    if (!active || !payload || payload.length === 0) return null;
    const row = payload[0].payload;
    return (
      <div style={{
        background: BRAND.card,
        border: `1px solid ${BRAND.border}`,
        borderRadius: 8,
        padding: '8px 10px',
        fontSize: 12,
        color: BRAND.text,
        lineHeight: 1.5,
      }}>
        <div style={{ fontWeight: 700 }}>{row.label}</div>
        <div>{metric.label}: {formatMetricValue(row[metric.key], metric, currency)}</div>
        <div style={{ color: BRAND.muted }}>
          {formatNumber(row.count)} project{row.count === 1 ? '' : 's'} · {money(row.trade, currency)} trade
        </div>
      </div>
    );
  };

  return (
    <Card
      title="Pipeline composition"
      actions={<MetricToggle metric={metric} onChange={onMetricChange} />}
    >
      <div style={{ display: 'grid', gap: 14 }}>
        {hasData ? (
          <div style={{ width: '100%', height: CHART_HEIGHT }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="#EFEEEA" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: BRAND.muted }}
                  tickLine={false}
                  axisLine={{ stroke: BRAND.border }}
                />
                <YAxis
                  width={68}
                  tick={{ fontSize: 11, fill: BRAND.muted }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={metric.format !== 'money'}
                  tickFormatter={(value) => (
                    metric.format === 'money' ? compactMoney(value, currency) : formatNumber(value)
                  )}
                />
                <Tooltip content={renderTooltip} cursor={{ fill: '#F6F5F2' }} />
                <Bar dataKey={metric.key} radius={[6, 6, 0, 0]} isAnimationActive={false}>
                  {rows.map((row) => (
                    <Cell key={row.key} fill={GROUP_COLOURS[row.key] || BRAND.primary} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState message="No forecast projects in this scope." />
        )}

        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          {rows.map((row) => (
            <div
              key={row.key}
              style={{ border: `1px solid ${BRAND.border}`, borderRadius: 10, padding: '10px 12px' }}
            >
              <div style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: GROUP_COLOURS[row.key] || BRAND.accent,
              }}>
                {row.label}
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: BRAND.text, marginTop: 4 }}>
                {formatNumber(row.count)}
                <span style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, marginLeft: 6 }}>projects</span>
              </div>
              <div style={{ fontSize: 12, color: BRAND.subtext }}>{money(row.trade, currency)} trade</div>
              <div style={{ fontSize: 12, color: BRAND.muted }}>
                {formatNumber(row.units)} catalogue units · {row.shareOfCount === null
                  ? '—'
                  : `${(Number(row.shareOfCount) * 100).toFixed(1)}% of projects`}
              </div>
            </div>
          ))}
        </div>

      </div>
    </Card>
  );
}