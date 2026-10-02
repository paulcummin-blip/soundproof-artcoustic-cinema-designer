// TrendsPanel.jsx
// ---------------
// The Trends view: whether more or fewer projects are being specified, and
// whether they are higher or lower value, over rolling 90-day windows.
//
// Included projects only, counted versions only. The dealer/account filter
// recalculates every number for one account.
//
// Presentation only: the numbers come from the pipelineTrends authority, and the
// statements are read straight off those numbers.

import React from 'react';
import { BRAND, Card, Pill } from './IntelligenceUi';
import { formatMoney, formatNumber } from '@/lib/commercial/projectReporting/formatMoney';
import TrendSummaryTable from './TrendSummaryTable';

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

const signedNumber = (value) => `${Number(value) > 0 ? '+' : ''}${formatNumber(value)}`;
const signedMoney = (value, currency) => (
  value === null || value === undefined
    ? '—'
    : `${Number(value) > 0 ? '+' : ''}${formatMoney(value, currency || 'GBP')}`
);

function TrendCard({ label, value, hint, tone }) {
  return (
    <div style={CARD}>
      <div style={LABEL}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: tone || BRAND.text, lineHeight: 1.2 }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: BRAND.muted, lineHeight: 1.4 }}>{hint}</div>}
    </div>
  );
}

export default function TrendsPanel({
  trends,
  currency,
  accountId = '',
  accountOptions = [],
  onAccountChange,
}) {
  if (!trends) return null;

  const latest = trends.latest;
  const displayCurrency = latest?.currency || trends.currency || currency || 'GBP';
  const mixed = trends.mixedCurrency || latest?.mixedCurrency === true;
  const valueText = (value) => (
    value === null || value === undefined
      ? 'Not calculable'
      : (mixed ? 'Mixed currencies' : formatMoney(value, displayCurrency))
  );

  const changeValueHint = [
    latest?.changeValue === null || latest?.changeValue === undefined
      ? null
      : `Value ${signedMoney(latest.changeValue, displayCurrency)}`,
    latest?.changeAverageValue === null || latest?.changeAverageValue === undefined
      ? null
      : `Average ${signedMoney(latest.changeAverageValue, displayCurrency)}`,
  ].filter(Boolean).join(' · ');

  return (
    <Card
      title="Trends"
      subtitle="Rolling 90-day periods, newest first. A project sits in the period it was created in; its value and catalogue units come from its counted version. Periods do not overlap, so each can be compared with the one before it."
      actions={(
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: BRAND.subtext }}>
          <span style={{ fontWeight: 700, color: BRAND.accent, textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.04em' }}>
            Account
          </span>
          <select
            value={accountId}
            onChange={(event) => onAccountChange?.(event.target.value)}
            style={{
              padding: '6px 8px',
              borderRadius: 8,
              border: `1px solid ${BRAND.border}`,
              background: BRAND.card,
              color: BRAND.text,
              fontSize: 12,
              maxWidth: 260,
            }}
          >
            <option value="">All accounts</option>
            {accountOptions.map((option) => (
              <option key={option.id} value={option.id}>{option.name}</option>
            ))}
          </select>
        </label>
      )}
    >
      <div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
          <TrendCard
            label="Projects this rolling 90 days"
            value={formatNumber(latest?.projects ?? 0)}
            hint={latest ? latest.label : null}
          />
          <TrendCard
            label="Value this rolling 90 days"
            value={valueText(latest?.totalLiveValue)}
            hint="Counted versions of these projects"
          />
          <TrendCard
            label="Average value this rolling 90 days"
            value={latest?.averageValue === null || latest?.averageValue === undefined
              ? 'Not calculable'
              : (mixed ? 'Mixed currencies' : formatMoney(latest.averageValue, displayCurrency))}
            hint={`Across ${formatNumber(latest?.valuedProjects ?? 0)} project${(latest?.valuedProjects ?? 0) === 1 ? '' : 's'} with a calculable value`}
          />
          <TrendCard
            label="Catalogue units this rolling 90 days"
            value={formatNumber(latest?.units ?? 0)}
            hint="Counted catalogue lines only"
          />
          <TrendCard
            label="Change versus previous 90 days"
            value={latest?.changeProjects === null || latest?.changeProjects === undefined
              ? '—'
              : `${signedNumber(latest.changeProjects)} project${Math.abs(latest.changeProjects) === 1 ? '' : 's'}`}
            hint={latest?.previousProjects === null ? 'No previous period' : (changeValueHint || 'No value change to report')}
          />
        </div>

        <div style={{ display: 'grid', gap: 6 }}>
          {(trends.statements || []).map((statement) => (
            <div key={statement} style={{ fontSize: 13, color: BRAND.subtext }}>{statement}</div>
          ))}
          {trends.sparse && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
              <Pill tone="info">{trends.sparseMessage}</Pill>
            </div>
          )}
        </div>

        <TrendSummaryTable windows={trends.windows} currency={currency} />

        <div style={{ fontSize: 12, color: BRAND.muted }}>
          {formatNumber(trends.scopedProjectCount)} included project{trends.scopedProjectCount === 1 ? '' : 's'} in
          scope, across {formatNumber(trends.activeAccountCount)} dealer / account
          {trends.activeAccountCount === 1 ? '' : 's'}. Statements use the newest two periods only, and a change under
          10% is described as broadly unchanged. Trends become more useful as dealers create projects in their own
          accounts.
        </div>
      </div>
    </Card>
  );
}