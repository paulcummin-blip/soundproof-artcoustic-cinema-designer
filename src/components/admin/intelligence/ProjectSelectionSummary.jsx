// ProjectSelectionSummary.jsx
// ---------------------------
// The six headline numbers for the inclusion and product demand workflow, and
// nothing else. Counted totals come from the counted version of included
// projects only.

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

export default function ProjectSelectionSummary({ summary, currency, hiddenCount = 0 }) {
  if (!summary) return null;
  const valueText = summary.countedLiveValue === null
    ? 'Not calculable'
    : formatMoney(summary.countedLiveValue, summary.countedCurrency || currency || 'GBP');

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
        <MetricCard label="Total projects loaded" value={formatNumber(summary.totalLoadedProjects)} />
        <MetricCard label="Included projects" value={formatNumber(summary.includedCount)} tone={BRAND.good} />
        <MetricCard
          label="Excluded projects"
          value={formatNumber(summary.excludedCount)}
          tone={summary.excludedCount > 0 ? BRAND.warn : BRAND.text}
        />
        <MetricCard label="Projects with multiple versions" value={formatNumber(summary.multiVersionCount)} />
        <MetricCard
          label="Counted product lines"
          value={formatNumber(summary.countedProductLines)}
          hint="Product lines across counted versions only"
        />
        <MetricCard
          label="Total live design value (counted versions)"
          value={valueText}
          hint={summary.countedMixedCurrency ? 'Mixed currencies — not summed' : 'Included projects, counted version only'}
        />
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