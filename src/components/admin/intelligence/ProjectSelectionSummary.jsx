// ProjectSelectionSummary.jsx
// ---------------------------
// The headline forecast numbers: how many projects are loaded, how many are in
// the forecast, and what Artcoustic business they represent. Nothing else.
//
// Every money figure is Artcoustic catalogue products only, retail ex VAT, and
// the trade value is derived from that retail — overall project value is not a
// headline here, because this page forecasts Artcoustic product business.
//
// The values come from the same catalogue pass and the same age authority the
// tables below read, so a card can never disagree with the detail.

import React from 'react';
import { BRAND, Pill } from './IntelligenceUi';
import { formatMoney, formatNumber } from '@/lib/commercial/projectReporting/formatMoney';
import {
  ARTCOUSTIC_RETAIL_HELPER,
  ARTCOUSTIC_TRADE_HELPER,
} from '@/lib/commercial/projectReporting/artcousticForecast';

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
  forecast = null,
  pipelineAge = null,
  hiddenCount = 0,
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
        <MetricCard
          label="Total projects loaded"
          value={formatNumber(summary.totalLoadedProjects)}
        />
        <MetricCard
          label="Included forecast projects"
          value={formatNumber(forecastProjectCount)}
          tone={BRAND.good}
          hint="Included in the table and counted by an included status"
        />
        <MetricCard
          label="Excluded projects"
          value={formatNumber(excludedCount)}
          hint="Not included, or counted by a status outside the forecast"
        />
        <MetricCard
          label="Artcoustic retail value"
          value={money(forecast?.retail)}
          hint={ARTCOUSTIC_RETAIL_HELPER}
        />
        <MetricCard
          label="Artcoustic trade value"
          value={money(forecast?.trade)}
          hint={ARTCOUSTIC_TRADE_HELPER}
          tone={BRAND.primary}
        />
        <MetricCard
          label="Counted catalogue units"
          value={formatNumber(forecast?.units ?? 0)}
          hint="Artcoustic catalogue units across counted versions"
        />
        <MetricCard
          label="Projects with multiple versions"
          value={formatNumber(summary.multiVersionCount)}
          hint="Design options — only the counted version is forecast"
        />
        <MetricCard
          label="Projects over 1 year"
          value={formatNumber(pipelineAge?.totals?.projectsOverOneYear ?? 0)}
          tone={(pipelineAge?.totals?.projectsOverOneYear ?? 0) > 0 ? BRAND.warn : BRAND.text}
          hint="Stale unless confirmed active"
        />
      </div>

      <div style={{ fontSize: 12, color: BRAND.muted, lineHeight: 1.6 }}>
        This is an Artcoustic product forecast, not project accounting: only Artcoustic catalogue products count, priced at
        retail ex VAT, and overall project value — manual extras, third-party items, labour and installation — is
        deliberately excluded from every total here.
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 12, color: BRAND.muted }}>
        <Pill tone="info">One version per project</Pill>
        <span>
          A client cannot buy every design option, so the forecast counts one selected version per forecast project.
          Versions are never summed.
        </span>
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
        <Pill tone="neutral" title="Excluded projects are left out of every total on this page">
          {formatNumber(excludedCount)} excluded
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