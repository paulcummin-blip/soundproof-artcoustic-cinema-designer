/**
 * SystemConfigsSection.jsx
 * -------------------------
 * Dolby channel layouts, bed/overhead/subwoofer counts, and the
 * frequency of system configurations. Counts one active version per project.
 */

import React from 'react';
import { BRAND, Pill } from '@/components/admin/intelligence/IntelligenceUi';
import { formatNumber } from '@/lib/commercial/projectReporting/formatMoney';
import IntelligenceCard, { StatCard } from './IntelligenceCard';
import { buildSystemConfigSummary } from '@/lib/commercial/designIntelligence/systemConfigAnalysis';

export default function SystemConfigsSection({ families }) {
  const summary = buildSystemConfigSummary(families);

  return (
    <IntelligenceCard
      title="System Configurations"
      subtitle="Dolby channel layouts and bed/overhead/subwoofer counts from each project's active version. One version per project."
    >
      <div style={{ display: 'grid', gap: 16 }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 10,
        }}>
          <StatCard label="Projects" value={formatNumber(summary.totalProjects)} />
          <StatCard label="With config" value={formatNumber(summary.totalWithConfig)} />
          <StatCard label="Unique layouts" value={formatNumber(summary.dolbyConfigs.length)} />
        </div>

        <ConfigTable title="Dolby channel layouts" rows={summary.dolbyConfigs} valueLabel="Layout" />
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          <ConfigTable title="Bed channels" rows={summary.bedCounts} valueLabel="Channels" compact />
          <ConfigTable title="Overhead channels" rows={summary.overheadCounts} valueLabel="Channels" compact />
          <ConfigTable title="Subwoofers (from config)" rows={summary.subwooferCounts} valueLabel="Subs" compact />
        </div>
      </div>
    </IntelligenceCard>
  );
}

function ConfigTable({ title, rows, valueLabel, compact }) {
  if (rows.length === 0) {
    return (
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: BRAND.accent, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 12, color: BRAND.muted }}>None recorded.</div>
      </div>
    );
  }
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: BRAND.accent, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>{title}</div>
      <div style={{ display: 'grid', gap: 3 }}>
        {rows.map((row) => (
          <div key={row.value} style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: compact ? '4px 8px' : '6px 10px',
            fontSize: 13,
            borderBottom: `1px solid #EFEEEA`,
          }}>
            <span style={{ color: BRAND.text, fontWeight: 600 }}>{row.value}</span>
            <Pill tone="neutral">{row.count} project(s)</Pill>
          </div>
        ))}
      </div>
    </div>
  );
}