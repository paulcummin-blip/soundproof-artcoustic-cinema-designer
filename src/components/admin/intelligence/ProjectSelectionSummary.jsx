// ProjectSelectionSummary.jsx
// ---------------------------
// The headline forecast numbers, in the order they are read: what the forecast
// is worth in trade value, then how many projects sit behind it. Nothing else —
// no hints and no explanation of how the figures are built.
//
// Trade value is the headline commercial figure, and the only commercial value
// shown anywhere on this page: the cards read the same catalogue pass and the
// same age authority as the detail tables, so a card can never disagree with the
// detail.

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

function MetricCard({ label, value, tone, headline = false }) {
  if (headline) {
    return (
      <div style={{ ...CARD, background: BRAND.primary, border: `1px solid ${BRAND.primary}` }}>
        <div style={{ ...LABEL, color: 'rgba(255, 255, 255, 0.72)' }}>{label}</div>
        <div style={{ fontSize: 30, fontWeight: 700, color: '#FFFFFF', lineHeight: 1.1 }}>{value}</div>
      </div>
    );
  }

  return (
    <div style={CARD}>
      <div style={LABEL}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: tone || BRAND.text, lineHeight: 1.2 }}>{value}</div>
    </div>
  );
}

export default function ProjectSelectionSummary({
  summary,
  currency,
  forecast = null,
  pipelineAge = null,
}) {
  if (!summary) return null;

  const displayCurrency = summary.countedCurrency || currency || 'GBP';
  const money = (value) => (
    value === null || value === undefined
      ? 'Not calculable'
      : (summary.countedMixedCurrency ? 'Mixed currencies' : formatMoney(value, displayCurrency))
  );

  const forecastProjectCount = forecast?.projectCount ?? 0;
  const listedCount = summary.listedProjectCount || 0;
  const excludedCount = Math.max(0, listedCount - forecastProjectCount);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
        <MetricCard label="Trade Value" value={money(forecast?.trade)} headline />
        <MetricCard label="Forecast Projects" value={formatNumber(forecastProjectCount)} tone={BRAND.good} />
        <MetricCard label="Excluded" value={formatNumber(excludedCount)} />
        <MetricCard label="Projects" value={formatNumber(summary.totalLoadedProjects)} />
        <MetricCard label="Catalogue Units" value={formatNumber(forecast?.units ?? 0)} />
        <MetricCard label="Multiple Versions" value={formatNumber(summary.multiVersionCount)} />
        <MetricCard
          label="Over 1 Year"
          value={formatNumber(pipelineAge?.totals?.projectsOverOneYear ?? 0)}
          tone={(pipelineAge?.totals?.projectsOverOneYear ?? 0) > 0 ? BRAND.warn : BRAND.text}
        />
      </div>

      {((forecast?.unpricedLineCount ?? 0) > 0 || (pipelineAge?.totals?.noValueCount ?? 0) > 0 || (pipelineAge?.totals?.unknownAgeCount ?? 0) > 0) && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {(forecast?.unpricedLineCount ?? 0) > 0 && (
            <Pill tone="warn" title="These catalogue lines carry a quantity but no price, so they add no value">
              {formatNumber(forecast.unpricedLineCount)} unpriced catalogue line{forecast.unpricedLineCount === 1 ? '' : 's'}
            </Pill>
          )}
          {(pipelineAge?.totals?.noValueCount ?? 0) > 0 && (
            <Pill tone="neutral" title="No priced Artcoustic catalogue line in the counted version">
              {formatNumber(pipelineAge.totals.noValueCount)} with no Artcoustic value
            </Pill>
          )}
          {(pipelineAge?.totals?.unknownAgeCount ?? 0) > 0 && (
            <Pill tone="warn" title="These projects have no created date, so their age cannot be stated. They are never counted as 0–30 days.">
              {formatNumber(pipelineAge.totals.unknownAgeCount)} with unknown age
            </Pill>
          )}
        </div>
      )}
    </div>
  );
}