/**
 * EngineeringPerformanceSection.jsx
 * -----------------------------------
 * Primary and Secondary ASDR results, RP22 parameter results where a
 * valid current engineering publication exists, publication coverage,
 * and unavailable results. Does not infer RP22 data from speaker count.
 */

import React from 'react';
import { BRAND, Pill } from '@/components/admin/intelligence/IntelligenceUi';
import { formatNumber, formatDate } from '@/lib/commercial/projectReporting/formatMoney';
import IntelligenceCard, { StatCard } from './IntelligenceCard';
import { buildEngineeringCoverage } from '@/lib/commercial/designIntelligence/engineeringCoverage';

export default function EngineeringPerformanceSection({ families }) {
  const coverage = buildEngineeringCoverage(families);

  return (
    <IntelligenceCard
      title="Engineering Performance"
      subtitle="Primary and Secondary ASDR results and RP22 parameter results from valid current engineering publications. Missing publications are reported as unavailable, never as failed."
    >
      <div style={{ display: 'grid', gap: 16 }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 10,
        }}>
          <StatCard label="Total projects" value={formatNumber(coverage.total)} />
          <StatCard label="Published" value={formatNumber(coverage.publishedCount)} tone={BRAND.good} />
          <StatCard label="Unpublished" value={formatNumber(coverage.unpublishedCount)} tone={coverage.unpublishedCount > 0 ? BRAND.warn : undefined} />
          <StatCard label="Coverage" value={`${coverage.coveragePercent}%`} />
        </div>

        {coverage.publishedFamilies.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: BRAND.accent, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
              Published engineering results
            </div>
            <div style={{ display: 'grid', gap: 3, maxHeight: 200, overflowY: 'auto' }}>
              {coverage.publishedFamilies.slice(0, 30).map((entry) => (
                <div key={entry.id} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '6px 10px',
                  fontSize: 13,
                  borderBottom: `1px solid #EFEEEA`,
                }}>
                  <span style={{ color: BRAND.text, fontWeight: 600 }}>
                    {entry.name}
                    <span style={{ fontSize: 11, color: BRAND.muted, marginLeft: 6 }}>· {entry.dealerName}</span>
                  </span>
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Pill tone="good">Published</Pill>
                    {entry.publishedAt && (
                      <span style={{ fontSize: 11, color: BRAND.muted }}>{formatDate(entry.publishedAt)}</span>
                    )}
                  </span>
                </div>
              ))}
              {coverage.publishedFamilies.length > 30 && (
                <div style={{ fontSize: 11, color: BRAND.muted, padding: '4px 10px' }}>
                  + {coverage.publishedFamilies.length - 30} more published project(s)
                </div>
              )}
            </div>
          </div>
        )}

        {coverage.unpublishedFamilies.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: BRAND.accent, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
              Projects without a current publication
            </div>
            <div style={{ fontSize: 12, color: BRAND.muted, marginBottom: 6 }}>
              These projects do not have a valid current engineering publication. This does not mean the design has failed — it means no RP22 results are available to report.
            </div>
            <div style={{ display: 'grid', gap: 3, maxHeight: 150, overflowY: 'auto' }}>
              {coverage.unpublishedFamilies.slice(0, 20).map((entry) => (
                <div key={entry.id} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '4px 10px',
                  fontSize: 13,
                }}>
                  <span style={{ color: BRAND.text }}>{entry.name}</span>
                  <Pill tone="neutral">No publication</Pill>
                </div>
              ))}
              {coverage.unpublishedFamilies.length > 20 && (
                <div style={{ fontSize: 11, color: BRAND.muted, padding: '4px 10px' }}>
                  + {coverage.unpublishedFamilies.length - 20} more
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </IntelligenceCard>
  );
}