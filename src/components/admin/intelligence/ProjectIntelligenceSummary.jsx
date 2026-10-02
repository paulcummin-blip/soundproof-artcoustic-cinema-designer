// ProjectIntelligenceSummary.jsx
// ------------------------------
// The headline cards. Counts are always PROJECT counts: variations are shown
// separately and are never counted as commercial projects. Live Design Value
// and Quoted Snapshot Value are always presented apart and never added.

import React from 'react';
import { BRAND } from './IntelligenceUi';
import { formatMoney, formatNumber } from '@/lib/commercial/projectReporting/formatMoney';

function Card2({ label, value, hint, tone }) {
  return (
    <div style={{
      background: BRAND.card,
      border: `1px solid ${BRAND.border}`,
      borderRadius: 12,
      padding: '14px 16px',
      minWidth: 0,
    }}>
      <div style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: BRAND.accent,
      }}>
        {label}
      </div>
      <div style={{
        marginTop: 6,
        fontSize: 22,
        fontWeight: 700,
        color: tone || BRAND.text,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {value}
      </div>
      {hint && <div style={{ marginTop: 4, fontSize: 11, color: BRAND.muted, lineHeight: 1.4 }}>{hint}</div>}
    </div>
  );
}

export default function ProjectIntelligenceSummary({ report }) {
  const summary = report?.summary;
  if (!summary) return null;

  const live = summary.totalLiveValue;
  const quoted = summary.totalQuotedValue;
  const liveCurrency = summary.liveCurrency || report?.priceContext?.currency || 'GBP';
  const quotedCurrency = summary.quotedCurrency || 'GBP';

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 12,
      }}>
        <Card2 label="Total project families" value={formatNumber(summary.projectCount)} hint={`${formatNumber(summary.variationCount)} design variation${summary.variationCount === 1 ? '' : 's'} in these projects`} />
        <Card2 label="Prospective / Pending" value={formatNumber(summary.bucketCounts.prospective)} />
        <Card2 label="Live / Open" value={formatNumber(summary.bucketCounts.live)} />
        <Card2 label="Completed / Won" value={formatNumber(summary.bucketCounts.completed)} />
        <Card2 label="Lost" value={formatNumber(summary.bucketCounts.lost)} />
        <Card2 label="Archived" value={formatNumber(summary.bucketCounts.archived)} hint={summary.archivedExcludedCount > 0 ? `${summary.archivedExcludedCount} archived project${summary.archivedExcludedCount === 1 ? '' : 's'} hidden by the filter` : null} />
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: 12,
      }}>
        <Card2
          label="Total live design value"
          value={live === null ? '—' : formatMoney(live, liveCurrency)}
          hint={summary.liveMixedCurrency
            ? 'Multiple currencies — shown per project, not converted'
            : "Calculated from each project's active version with the existing pricing engine, using the price list available to this session"}
          tone={BRAND.primary}
        />
        <Card2
          label="Total quoted snapshot value"
          value={quoted === null ? '—' : formatMoney(quoted, quotedCurrency)}
          hint={summary.quotedMixedCurrency ? 'Multiple currencies — shown per project, not converted' : 'Frozen at proposal generation. Never added to the live value.'}
          tone={BRAND.primary}
        />
        <Card2
          label="Unpriced projects"
          value={formatNumber(summary.unpricedProjectCount)}
          hint={summary.partialPricingProjectCount > 0 ? `${summary.partialPricingProjectCount} further project${summary.partialPricingProjectCount === 1 ? '' : 's'} have unpriced lines` : 'No value is ever assumed'}
          tone={summary.unpricedProjectCount > 0 ? BRAND.warn : undefined}
        />
        <Card2
          label="Possible duplicate projects"
          value={formatNumber(summary.duplicatePairCount)}
          hint="Advisory only — nothing is merged"
          tone={summary.duplicatePairCount > 0 ? BRAND.warn : undefined}
        />
        <Card2
          label="Unclassified statuses"
          value={formatNumber(summary.bucketCounts.unclassified)}
          hint="Dealer-specific statuses that could not be mapped"
          tone={summary.bucketCounts.unclassified > 0 ? BRAND.warn : undefined}
        />
        <Card2
          label="Product SKUs in demand"
          value={formatNumber(summary.productSkuCount)}
          hint={summary.noQuotedValueCount > 0 ? `${summary.noQuotedValueCount} project${summary.noQuotedValueCount === 1 ? '' : 's'} have no quoted snapshot` : null}
        />
      </div>
    </div>
  );
}