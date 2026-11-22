/**
 * EmergingOpportunitiesPanel.jsx
 * -------------------------------
 * "Where is future business developing?" — Changes over time from dated
 * records only. Does not manufacture history from current design states.
 */

import React, { useMemo } from 'react';
import { BRAND, Pill } from '@/components/admin/intelligence/IntelligenceUi';
import { formatNumber } from '@/lib/commercial/projectReporting/formatMoney';
import IntelligenceCard, { StatCard } from './IntelligenceCard';
import OpportunityCard from './OpportunityCard';
import { buildEmergingOpportunities } from '@/lib/commercial/designIntelligence/emergingOpportunities';

export default function EmergingOpportunitiesPanel({ families, proposals, accountsById, followUpsByKey, onLogFollowUp, sectorLabel }) {
  const opportunities = useMemo(
    () => buildEmergingOpportunities(families, proposals, accountsById),
    [families, proposals, accountsById],
  );

  const trendCounts = useMemo(() => {
    const counts = {};
    for (const opp of opportunities) {
      const subKey = opp.opportunityKey.split(':')[2] || 'other';
      counts[subKey] = (counts[subKey] || 0) + 1;
    }
    return counts;
  }, [opportunities]);

  return (
    <IntelligenceCard
      title="Emerging Opportunities"
      subtitle="Changes over time from dated records only (project creation, proposal activity). Does not manufacture history from current design states. Where history is missing, shows insufficient evidence."
    >
      {opportunities.length === 0 ? (
        <div style={{ fontSize: 13, color: BRAND.muted }}>
          No emerging opportunities with sufficient dated history in this sector.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {trendCounts.increasing_creation > 0 && <StatCard label="Increasing creation" value={formatNumber(trendCounts.increasing_creation)} tone={BRAND.good} />}
            {trendCounts.first_proposals > 0 && <StatCard label="New proposal activity" value={formatNumber(trendCounts.first_proposals)} tone={BRAND.good} />}
            {trendCounts.insufficient_evidence > 0 && <StatCard label="Insufficient evidence" value={formatNumber(trendCounts.insufficient_evidence)} />}
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {opportunities.map((opp) => (
              <OpportunityCard
                key={opp.opportunityKey}
                opportunity={opp}
                followUp={followUpsByKey.get(opp.opportunityKey)}
                onLogFollowUp={onLogFollowUp}
                sectorLabel={sectorLabel}
              />
            ))}
          </div>
        </div>
      )}
    </IntelligenceCard>
  );
}