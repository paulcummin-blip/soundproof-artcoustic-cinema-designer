// PipelineAgeBars.jsx
// -------------------
// Pipeline ageing as bars rather than a table: one row per age bucket, with how
// many forecast projects sit in it and the Artcoustic retail behind them.
//
// Project count and value are measured on their own scales, so each has its own
// bar: a long count bar next to a short value bar means many small projects.
//
// Presentation only. Clicking a bucket narrows the Projects table to it.
//
// The helper note from the age authority is deliberately not shown: this is a
// dashboard to read, not a set of instructions.

import React from 'react';
import { BRAND, Card, Pill } from '../IntelligenceUi';
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
  const totals = pipelineAge.totals || {};
  const maxCount = buckets.reduce((max, bucket) => Math.max(max, bucket.count || 0), 0);
  const maxRetail = buckets.reduce((max, bucket) => Math.max(max, bucket.retail || 0), 0);

  return (
    <Card
      title="Pipeline age distribution"
      subtitle={`${formatNumber(totals.count || 0)} forecast projects. ${pipelineAge.basisNote}`}
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
                  {percent(bucket.shareOfCount)} of projects · {percent(bucket.shareOfRetail)} of retail value
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
                label="Retail"
                value={bucket.retail}
                max={maxRetail}
                colour={BRAND.accent}
                currency={currency}
                format="money"
              />
              {active && <Pill tone="good">Filtering the Projects table</Pill>}
            </button>
          );
        })}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', fontSize: 12, color: BRAND.muted }}>
          <span style={{ fontWeight: 700, color: BRAND.text }}>All forecast projects</span>
          <span>{formatNumber(totals.count || 0)} projects</span>
          <span>{money(totals.retail, currency)} retail ex VAT</span>
          <span>{money(totals.trade, currency)} trade</span>
          <span>{formatNumber(totals.units || 0)} catalogue units</span>
          {totals.noValueCount > 0 && (
            <span>{formatNumber(totals.noValueCount)} with no Artcoustic value</span>
          )}
          {totals.missingAgeCount > 0 && (
            <span>{formatNumber(totals.missingAgeCount)} with no created or updated date</span>
          )}
        </div>

        <div style={{ fontSize: 12, color: BRAND.muted }}>
          Artcoustic retail ex VAT, trade value and catalogue units come from each project's counted version,
          catalogue products only. Click a bucket to show only those projects in the Projects table.
        </div>
      </div>
    </Card>
  );
}