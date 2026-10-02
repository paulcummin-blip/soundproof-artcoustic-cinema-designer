// PipelineAgeOverview.jsx
// -----------------------
// "Pipeline age and value" — the age and value ageing overview for the included
// projects, shown above the tabs so it is the first thing an admin reads.
//
// Included projects only, counted versions only. Clicking a bucket filters the
// Projects table to that bucket; clicking it again clears the filter.
//
// Presentation only: every number comes from the pipelineAge authority.

import React from 'react';
import { BRAND, Card, Pill, TABLE, TABLE_WRAP, Td, Th } from './IntelligenceUi';
import { formatMoney, formatNumber } from '@/lib/commercial/projectReporting/formatMoney';
import { AGE_BUCKETS } from '@/lib/commercial/projectReporting/pipelineAge';

const percent = (share) => (
  share === null || share === undefined ? '—' : `${(Number(share) * 100).toFixed(1)}%`
);

const money = (value, currency) => (
  value === null || value === undefined ? 'Not calculable' : formatMoney(value, currency || 'GBP')
);

function BucketButton({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${active ? 'Clear the filter and show every included project' : 'Show only the projects in this age bucket in the Projects table'}`}
      style={{
        font: 'inherit',
        fontWeight: 700,
        color: active ? '#FFFFFF' : BRAND.primary,
        background: active ? BRAND.primary : 'transparent',
        border: 'none',
        borderRadius: 6,
        padding: active ? '3px 8px' : 0,
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      {label}
    </button>
  );
}

export default function PipelineAgeOverview({ pipelineAge, currency, activeBucket = null, onBucketClick }) {
  if (!pipelineAge) return null;

  const buckets = pipelineAge.buckets || [];
  const totals = pipelineAge.totals || {};

  return (
    <Card
      title="Pipeline age and value"
      subtitle={`${formatNumber(totals.count || 0)} included projects. ${pipelineAge.basisNote}`}
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
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={TABLE_WRAP}>
          <table style={TABLE}>
            <thead>
              <tr>
                <Th>Age bucket</Th>
                <Th align="right">Projects</Th>
                <Th align="right">Live design value</Th>
                <Th align="right">Average project value</Th>
                <Th align="right">Catalogue units</Th>
                <Th>Notes</Th>
              </tr>
            </thead>
            <tbody>
              {buckets.map((bucket) => {
                const active = activeBucket === bucket.key;
                return (
                  <tr key={bucket.key} style={active ? { background: BRAND.goodBg } : undefined}>
                    <Td style={{ whiteSpace: 'nowrap' }}>
                      <BucketButton
                        label={bucket.label}
                        active={active}
                        onClick={() => onBucketClick?.(bucket.key)}
                      />
                      {active && <div style={{ fontSize: 11, color: BRAND.good, marginTop: 3 }}>Filtering the Projects table</div>}
                    </Td>
                    <Td align="right" mono>{formatNumber(bucket.count)}</Td>
                    <Td align="right" mono>{money(bucket.liveValue, currency)}</Td>
                    <Td align="right" mono>{money(bucket.averageValue, currency)}</Td>
                    <Td align="right" mono>{formatNumber(bucket.units)}</Td>
                    <Td>
                      <div>{bucket.note}</div>
                      {bucket.unpricedCount > 0 && (
                        <div style={{ fontSize: 11, color: BRAND.muted }}>
                          {formatNumber(bucket.unpricedCount)} not calculable
                        </div>
                      )}
                    </Td>
                  </tr>
                );
              })}
              <tr>
                <Td>
                  <div style={{ fontWeight: 700, color: BRAND.text }}>All included projects</div>
                </Td>
                <Td align="right" mono>{formatNumber(totals.count || 0)}</Td>
                <Td align="right" mono>{money(totals.liveValue, currency)}</Td>
                <Td align="right" mono>{money(totals.averageValue, currency)}</Td>
                <Td align="right" mono>{formatNumber(totals.units || 0)}</Td>
                <Td>
                  {totals.projectsOverOneYear > 0
                    ? `${formatNumber(totals.projectsOverOneYear)} over 1 year`
                    : 'No project is over 1 year old'}
                </Td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 12, color: BRAND.muted }}>
            Share of included projects — {buckets.map((bucket) => `${bucket.label}: ${percent(bucket.shareOfCount)}`).join(' · ')}
          </div>
          <div style={{ fontSize: 12, color: BRAND.muted }}>
            Share of included live design value — {buckets.map((bucket) => `${bucket.label}: ${percent(bucket.shareOfValue)}`).join(' · ')}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Pill tone="warn">{pipelineAge.helperNote}</Pill>
          {totals.missingAgeCount > 0 && (
            <span style={{ fontSize: 12, color: BRAND.muted }}>
              {formatNumber(totals.missingAgeCount)} included project{totals.missingAgeCount === 1 ? '' : 's'} carry no
              created or updated date, so they are not placed in a bucket.
            </span>
          )}
        </div>

        <div style={{ fontSize: 12, color: BRAND.muted }}>
          Live design value and catalogue units come from each project's counted version. Buckets:{' '}
          {AGE_BUCKETS.map((bucket) => bucket.label).join(', ')}. Click a bucket to show only those projects in the
          Projects table.
        </div>
      </div>
    </Card>
  );
}