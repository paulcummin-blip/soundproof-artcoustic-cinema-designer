// PipelineAgeBars.jsx
// -------------------
// Pipeline ageing as bars rather than a table: one row per age bucket, with how
// many forecast projects sit in it and the trade value behind them.
//
// Project count and value are measured on their own scales, so each has its own
// bar: a long count bar next to a short value bar means many small projects.
//
// Presentation only. Clicking a bucket narrows the Projects table to it. No
// total row and no helper copy: the dashboard is read, not explained.

import React from 'react';
import { BRAND, Card } from '../IntelligenceUi';
import { formatMoney, formatNumber } from '@/lib/commercial/projectReporting/formatMoney';

const TRACK = { background: '#F1F0EC', borderRadius: 6, height: 12, overflow: 'hidden' };
const VALUE_COLUMN = { minWidth: 136, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const NAME_COLUMN = { minWidth: 96, fontSize: 12, fontWeight: 700, color: BRAND.subtext };

const money = (value, currency) => (
  value === null || value === undefined ? 'No Artcoustic value' : formatMoney(value, currency || 'GBP')
);

const percent = (share) => (
  share === null || share === undefined ? '—' : `${(Number(share) * 100).toFixed(1)}%`
);

function Bar({ value, max, colour, label, currency, format }) {
  const width = max > 0 && value !== null && value !== undefined
    ? Math.max(2, (Number(value) / max) * 100)
    : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={NAME_COLUMN}>{label}</div>
      <div style={{ ...TRACK, flex: 1 }}>
        <div style={{ width: `${width}%`, height: '100%', background: colour, borderRadius: 6 }} />
      </div>
      <div style={{ ...VALUE_COLUMN, fontSize: 12, color: BRAND.text }}>
        {format === 'money' ? money(value, currency) : formatNumber(value ?? 0)}
      </div>
    </div>
  );
}

export default function PipelineAgeBars({
  pipelineAge,
  currency = 'GBP',
  activeBucket = null,
  onBucketClick,
}) {
  if (!pipelineAge) return null;

  const buckets = pipelineAge.buckets || [];
  const maxCount = buckets.reduce((max, bucket) => Math.max(max, bucket.count || 0), 0);
  const maxTrade = buckets.reduce((max, bucket) => Math.max(max, bucket.trade || 0), 0);

  return (
    <Card
      title="Pipeline age distribution"
      actions={activeBucket ? (
        <button
          type="button"
          onClick={() => onBucketClick?.(activeBucket)}
          style={{
            font: 'inherit',
            fontSize: 12,
            fontWeight: 700,
            color: BRAND.primary,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Clear age filter
        </button>
      ) : null}
    >
      <div style={{ display: 'grid', gap: 14 }}>
        {buckets.map((bucket) => {
          const active = activeBucket === bucket.key;
          return (
            <button
              key={bucket.key}
              type="button"
              onClick={() => onBucketClick?.(bucket.key)}
              title={active
                ? 'Clear the filter and show every forecast project'
                : 'Show only the projects in this age bucket in the Projects table'}
              style={{
                display: 'grid',
                gap: 8,
                textAlign: 'left',
                font: 'inherit',
                cursor: 'pointer',
                padding: '10px 12px',
                borderRadius: 10,
                border: `1px solid ${active ? BRAND.primary : BRAND.border}`,
                background: active ? BRAND.goodBg : BRAND.card,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: BRAND.text }}>{bucket.label}</span>
                <span style={{ fontSize: 11, color: BRAND.muted }}>
                  {percent(bucket.shareOfCount)} of projects
                </span>
              </div>
              <Bar
                label="Projects"
                value={bucket.count}
                max={maxCount}
                colour={BRAND.primary}
                currency={currency}
                format="number"
              />
              <Bar
                label="Trade value"
                value={bucket.trade}
                max={maxTrade}
                colour={BRAND.accent}
                currency={currency}
                format="money"
              />
            </button>
          );
        })}
      </div>
    </Card>
  );
}