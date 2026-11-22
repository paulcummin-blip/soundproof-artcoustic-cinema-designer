/**
 * ProjectValuesSection.jsx
 * -------------------------
 * Current retail ex VAT design value, highest/lowest/average/combined,
 * fully vs partially priced, and distinct verified quoted values.
 */

import React from 'react';
import { BRAND, Pill } from '@/components/admin/intelligence/IntelligenceUi';
import { formatMoney, formatNumber } from '@/lib/commercial/projectReporting/formatMoney';
import IntelligenceCard, { StatCard } from './IntelligenceCard';
import { buildProjectValueSummary } from '@/lib/commercial/designIntelligence/projectValueAnalysis';

export default function ProjectValuesSection({ families }) {
  const summary = buildProjectValueSummary(families);
  const currency = 'GBP';
  const live = summary.live;
  const quoted = summary.quoted;

  return (
    <IntelligenceCard
      title="Project Values"
      subtitle="Current retail ex VAT design value (from the active version) and verified quoted snapshot value (frozen at proposal generation). Never combined."
    >
      <div style={{ display: 'grid', gap: 16 }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 10,
        }}>
          <StatCard label="Total projects" value={formatNumber(summary.total)} />
          <StatCard label="Fully priced" value={formatNumber(summary.fullyPricedCount)} tone={BRAND.good} />
          <StatCard label="Partially priced" value={formatNumber(summary.partiallyPricedCount)} tone={BRAND.warn} />
          <StatCard label="Unpriced" value={formatNumber(summary.unpricedCount)} tone={summary.unpricedCount > 0 ? BRAND.warn : undefined} />
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 12,
        }}>
          <div style={{
            background: '#F8F8F7',
            border: `1px solid ${BRAND.border}`,
            borderRadius: 10,
            padding: 14,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: BRAND.accent, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
              Live design value (retail ex VAT)
            </div>
            {live.count === 0 ? (
              <div style={{ fontSize: 12, color: BRAND.muted }}>No priced projects in this sector.</div>
            ) : (
              <div style={{ display: 'grid', gap: 4, fontSize: 13 }}>
                <ValueRow label="Combined" value={formatMoney(live.total, currency)} accent />
                <ValueRow label="Highest" value={formatMoney(live.max, currency)} />
                <ValueRow label="Lowest" value={formatMoney(live.min, currency)} />
                <ValueRow label="Average" value={formatMoney(live.average, currency)} />
                <ValueRow label="Priced projects" value={formatNumber(live.count)} />
              </div>
            )}
            <div style={{ marginTop: 8, fontSize: 11, color: BRAND.muted }}>
              Calculated from each project's active version with the current Product Master.
            </div>
          </div>

          <div style={{
            background: '#F8F8F7',
            border: `1px solid ${BRAND.border}`,
            borderRadius: 10,
            padding: 14,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: BRAND.accent, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
              Verified quoted snapshot value (inc VAT)
            </div>
            {quoted.count === 0 ? (
              <div style={{ fontSize: 12, color: BRAND.muted }}>No verified frozen proposal snapshots.</div>
            ) : (
              <div style={{ display: 'grid', gap: 4, fontSize: 13 }}>
                <ValueRow label="Combined" value={formatMoney(quoted.total, currency)} accent />
                <ValueRow label="Highest" value={formatMoney(quoted.max, currency)} />
                <ValueRow label="Lowest" value={formatMoney(quoted.min, currency)} />
                <ValueRow label="Average" value={formatMoney(quoted.average, currency)} />
                <ValueRow label="Snapshots" value={formatNumber(quoted.count)} />
              </div>
            )}
            <div style={{ marginTop: 8, fontSize: 11, color: BRAND.muted }}>
              Frozen at proposal generation. Never added to the live value.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Pill tone="neutral">Live value and quoted value are independent measures</Pill>
          {summary.partiallyPricedCount > 0 && <Pill tone="warn">{summary.partiallyPricedCount} project(s) have unpriced lines</Pill>}
        </div>
      </div>
    </IntelligenceCard>
  );
}

function ValueRow({ label, value, accent }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ color: BRAND.muted }}>{label}</span>
      <span style={{ fontWeight: 700, color: accent ? BRAND.primary : BRAND.text, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </span>
    </div>
  );
}