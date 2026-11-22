/**
 * DealerOpportunitiesSection.jsx
 * -------------------------------
 * Evidence-backed observations only: incomplete pricing, missing analysis,
 * missing room dimensions, unclassified status. No engagement inferences
 * and no design-adequacy claims from speaker count.
 */

import React from 'react';
import { BRAND, Pill } from '@/components/admin/intelligence/IntelligenceUi';
import IntelligenceCard, { StatCard } from './IntelligenceCard';
import { buildDealerOpportunities } from '@/lib/commercial/designIntelligence/dealerOpportunities';
import { formatNumber } from '@/lib/commercial/projectReporting/formatMoney';

const FLAG_TONES = {
  incomplete_pricing: 'warn',
  no_live_value: 'warn',
  no_quoted_snapshot: 'neutral',
  no_publication: 'neutral',
  missing_room_dims: 'warn',
  unclassified_status: 'bad',
};

export default function DealerOpportunitiesSection({ families }) {
  const opportunities = buildDealerOpportunities(families);
  const flagCounts = {};
  for (const entry of opportunities) {
    for (const flag of entry.flags) {
      flagCounts[flag.key] = (flagCounts[flag.key] || 0) + 1;
    }
  }

  return (
    <IntelligenceCard
      title="Dealer Opportunities"
      subtitle="Evidence-backed observations only. Each flag is derived from a concrete data gap. No engagement or design-adequacy inferences."
    >
      {opportunities.length === 0 ? (
        <div style={{ fontSize: 13, color: BRAND.good }}>
          No evidence-backed observations in this sector.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 10,
          }}>
            <StatCard label="Projects with flags" value={formatNumber(opportunities.length)} tone={BRAND.warn} />
            {Object.entries(flagCounts).slice(0, 5).map(([key, count]) => (
              <StatCard key={key} label={key.replace(/_/g, ' ')} value={formatNumber(count)} />
            ))}
          </div>

          <div style={{ display: 'grid', gap: 3, maxHeight: 300, overflowY: 'auto' }}>
            {opportunities.slice(0, 40).map((entry) => (
              <div key={entry.family.id} style={{
                padding: '8px 12px',
                border: `1px solid ${BRAND.border}`,
                borderRadius: 8,
                background: BRAND.card,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                  <span style={{ fontWeight: 600, color: BRAND.text, fontSize: 13 }}>
                    {entry.family.name}
                    <span style={{ fontSize: 11, color: BRAND.muted, marginLeft: 6 }}>· {entry.family.dealerName}</span>
                  </span>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {entry.flags.map((flag) => (
                      <Pill key={flag.key} tone={FLAG_TONES[flag.key] || 'neutral'} title={flag.detail}>
                        {flag.label}
                      </Pill>
                    ))}
                  </div>
                </div>
              </div>
            ))}
            {opportunities.length > 40 && (
              <div style={{ fontSize: 11, color: BRAND.muted, padding: '4px 12px' }}>
                + {opportunities.length - 40} more flagged project(s)
              </div>
            )}
          </div>
        </div>
      )}
    </IntelligenceCard>
  );
}