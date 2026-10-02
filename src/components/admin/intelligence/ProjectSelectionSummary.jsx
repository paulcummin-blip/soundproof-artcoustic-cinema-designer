// ProjectSelectionSummary.jsx
// ---------------------------
// The headline numbers for the inclusion and product demand workflow, and
// nothing else: the totals, then the age and value ageing cards fed by the
// pipelineAge authority. Counted totals come from the counted version of
// included projects only.

import React from 'react';
import { BRAND, Pill } from './IntelligenceUi';
import { formatMoney, formatNumber } from '@/lib/commercial/projectReporting/formatMoney';

const CARD = {
  background: BRAND.card,
  border: `1px solid ${BRAND.border}`,
  borderRadius: 12,
  padding: '14px 16px',
  display: 'grid',
  gap: 6,
};

const LABEL = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: BRAND.accent,
};

function MetricCard({ label, value, hint, tone }) {
  return (
    <div style={CARD}>
      <div style={LABEL}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: tone || BRAND.text, lineHeight: 1.2 }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: BRAND.muted, lineHeight: 1.4 }}>{hint}</div>}
    </div>
  );
}

export default function ProjectSelectionSummary({
  summary,
  currency,
  hiddenCount = 0,
  pipelineAge = null,
  productDemandValue = null,
  productDemandUnpricedLines = 0,
}) {
  if (!summary) return null;
  const valueText = summary.countedLiveValue === null
    ? 'Not calculable'
    : formatMoney(summary.countedLiveValue, summary.countedCurrency || currency || 'GBP');

  // The Product Demand figure comes from the demand rows themselves, so a card
  // and the Product Demand table can never disagree.
  const catalogueValueText = productDemandValue === null || productDemandValue === undefined
    ? 'Not calculable'
    : formatMoney(productDemandValue, summary.countedCurrency || currency || 'GBP');

  // Age-bucket values come from the age overview, so a card and the bucket table
  // below it can never disagree.
  const money = (value) => (
    value === null || value === undefined
      ? '—'
      : formatMoney(value, summary.countedCurrency || currency || 'GBP')
  );
  const bucketValue = (key) => money(pipelineAge?.totals?.[key]);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
        <MetricCard label="Total projects loaded" value={formatNumber(summary.totalLoadedProjects)} />
        <MetricCard label="Included projects" value={formatNumber(summary.includedCount)} tone={BRAND.good} />
        <MetricCard
          label="Included Project Live Value"
          value={valueText}
          hint={summary.countedMixedCurrency ? 'Mixed currencies — not summed' : 'Full live value of each included project\'s counted version'}
        />
        <MetricCard
          label="Product Demand Catalogue Value"
          value={catalogueValueText}
          hint={productDemandUnpricedLines > 0
            ? `Artcoustic catalogue products only · ${formatNumber(productDemandUnpricedLines)} line${productDemandUnpricedLines === 1 ? '' : 's'} unpriced`
            : 'Artcoustic catalogue products only'}
        />
        <MetricCard
          label="0–30 day value"
          value={bucketValue('valueDays0To30')}
          hint="Included projects updated or created in the last 30 days"
        />
        <MetricCard
          label="31–90 day value"
          value={bucketValue('valueDays31To90')}
          hint="Included projects 31–90 days old"
        />
        <MetricCard
          label="91+ day value"
          value={bucketValue('valueDays91Plus')}
          hint="Included projects 91 days and older"
          tone={BRAND.warn}
        />
        <MetricCard
          label="Projects over 1 year"
          value={formatNumber(pipelineAge?.totals?.projectsOverOneYear ?? 0)}
          tone={(pipelineAge?.totals?.projectsOverOneYear ?? 0) > 0 ? BRAND.warn : BRAND.text}
          hint="Stale unless confirmed active"
        />
        <MetricCard
          label="Counted catalogue units"
          value={formatNumber(pipelineAge?.totals?.units ?? 0)}
          hint="Catalogue units across counted versions"
        />
      </div>

      <div style={{ fontSize: 12, color: BRAND.muted, lineHeight: 1.6 }}>
        Project value can include priced design/proposal lines that are not part of catalogue product demand. Product
        Demand value includes Artcoustic catalogue products only.
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 12, color: BRAND.muted }}>
        <Pill tone="info">One version per project</Pill>
        <span>
          A client cannot buy every design option, so product demand counts one selected version per included project.
          Versions are never summed.
        </span>
        {summary.unpricedCountedCount > 0 && (
          <Pill tone="warn" title="These counted versions have no calculable live value">
            {summary.unpricedCountedCount} counted version{summary.unpricedCountedCount === 1 ? '' : 's'} not calculable
          </Pill>
        )}
        <Pill tone="neutral" title="Excluded projects are left out of every total on this page">
          {formatNumber(summary.excludedCount)} excluded
        </Pill>
        <Pill tone="neutral" title="A project's versions are design options and are never summed">
          {formatNumber(summary.multiVersionCount)} with multiple versions
        </Pill>
        {hiddenCount > 0 && (
          <span>
            {formatNumber(hiddenCount)} project{hiddenCount === 1 ? '' : 's'} are hidden from the selection list by the
            reporting filters — see Advanced diagnostics.
          </span>
        )}
      </div>
    </div>
  );
}