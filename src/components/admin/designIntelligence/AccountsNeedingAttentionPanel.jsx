/**
 * AccountsNeedingAttentionPanel.jsx
 * -----------------------------------
 * "Who needs attention?" — Premium Partners not activated, approved dealers
 * with no projects, and dealers with notable specification patterns.
 */

import React, { useMemo } from 'react';
import { BRAND } from '@/components/admin/intelligence/IntelligenceUi';
import { formatNumber } from '@/lib/commercial/projectReporting/formatMoney';
import IntelligenceCard, { StatCard } from './IntelligenceCard';
import OpportunityCard from './OpportunityCard';
import { buildAccountsNeedingAttention } from '@/lib/commercial/designIntelligence/accountsNeedingAttention';

export default function AccountsNeedingAttentionPanel({ families, accounts, accountsById, followUpsByKey, onLogFollowUp, sectorLabel }) {
  const opportunities = useMemo(
    () => buildAccountsNeedingAttention(families, accounts, accountsById),
    [families, accounts, accountsById],
  );

  const typeCounts = useMemo(() => {
    const counts = {};
    for (const opp of opportunities) {
      const subKey = opp.opportunityKey.split(':')[2] || 'other';
      counts[subKey] = (counts[subKey] || 0) + 1;
    }
    return counts;
  }, [opportunities]);

  return (
    <IntelligenceCard
      title="Accounts Needing Attention"
      subtitle="Premium Partners not activated, approved dealers with no projects, and dealers whose specification patterns warrant a conversation. Does not presume a lost sale."
    >
      {opportunities.length === 0 ? (
        <div style={{ fontSize: 13, color: BRAND.good }}>
          No accounts needing attention in this sector.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {typeCounts.no_activation > 0 && <StatCard label="Not activated" value={formatNumber(typeCounts.no_activation)} tone={BRAND.warn} />}
            {typeCounts.no_projects > 0 && <StatCard label="No projects" value={formatNumber(typeCounts.no_projects)} tone={BRAND.warn} />}
            {typeCounts.modest_specs > 0 && <StatCard label="Modest specs" value={formatNumber(typeCounts.modest_specs)} />}
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