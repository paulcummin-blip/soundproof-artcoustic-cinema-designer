// PipelineTimelineChart.jsx
// -------------------------
// One time series on the forecast dashboard: a line over periods, with a metric
// toggle where a chart carries more than one measure.
//
// Presentation only. The points come from the forecastTimelines authority and
// nothing here interprets them.

import React from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BRAND, Card, EmptyState } from '../IntelligenceUi';
import { formatMoney, formatNumber } from '@/lib/commercial/projectReporting/formatMoney';

export const CHART_HEIGHT = 230;

/** Axis-scale money: £4.8m, £480k, £900. Full precision stays in the tooltip. */
export function compactMoney(value, currency = 'GBP') {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '';
  const amount = Number(value);
  const abs = Math.abs(amount);
  const prefix = String(currency || 'GBP').toUpperCase() === 'GBP' ? '£' : `${currency} `;
  if (abs >= 1000000) return `${prefix}${(amount / 1000000).toFixed(abs >= 10000000 ? 0 : 1)}m`;
  if (abs >= 1000) return `${prefix}${Math.round(amount / 1000)}k`;
  return `${prefix}${Math.round(amount)}`;
}

export function formatMetricValue(value, metric, currency) {
  if (value === null || value === undefined) return 'Not calculable';
  return metric?.format === 'money' ? formatMoney(value, currency) : formatNumber(value);
}

function MetricToggle({ metric, options, onChange }) {
  if (!options || options.length < 2) return null;
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {options.map((option) => {
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

export default function PipelineTimelineChart({
  title,
  subtitle,
  points = [],
  metric,
  metricOptions = [],
  onMetricChange,
  currency = 'GBP',
  accent = BRAND.primary,
}) {
  if (!metric) return null;

  const plotted = points.filter((point) => point[metric.key] !== null && point[metric.key] !== undefined);
  const hasData = plotted.length > 0;

  const renderTooltip = ({ active, payload }) => {
    if (!active || !payload || payload.length === 0) return null;
    const point = payload[0].payload;
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
        <div style={{ fontWeight: 700 }}>{point.label}</div>
        <div>{metric.label}: {formatMetricValue(point[metric.key], metric, currency)}</div>
        <div style={{ color: BRAND.muted }}>
          {formatNumber(point.projects)} project{point.projects === 1 ? '' : 's'}
          {point.retail === null || point.retail === undefined
            ? ' · no Artcoustic value'
            : ` · ${formatMoney(point.retail, currency)} retail`}
        </div>
      </div>
    );
  };

  return (
    <Card
      title={title}
      subtitle={subtitle}
      actions={<MetricToggle metric={metric} options={metricOptions} onChange={onMetricChange} />}
    >
      {hasData ? (
        <div style={{ width: '100%', height: CHART_HEIGHT }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="#EFEEEA" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: BRAND.muted }}
                tickLine={false}
                axisLine={{ stroke: BRAND.border }}
                interval="preserveStartEnd"
                minTickGap={12}
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
              <Tooltip content={renderTooltip} />
              <Line
                type="monotone"
                dataKey={metric.key}
                name={metric.label}
                stroke={accent}
                strokeWidth={2}
                dot={{ r: 2.5, fill: accent, strokeWidth: 0 }}
                activeDot={{ r: 4 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyState
          message="No Artcoustic value in this range."
          hint="Widen the range, change the date basis, or include more projects or categories."
        />
      )}
    </Card>
  );
}