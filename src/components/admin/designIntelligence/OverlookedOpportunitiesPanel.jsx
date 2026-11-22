/**
 * OverlookedOpportunitiesPanel.jsx
 * ---------------------------------
 * "Who am I overlooking?" — Non-Premium Partner dealers with meaningful
 * recorded design engagement.
 */

import React, { useMemo } from 'react';
import { BRAND, Pill } from '@/components/admin/intelligence/IntelligenceUi';
import { formatNumber } from '@/lib/commercial/projectReporting/formatMoney';
import IntelligenceCard, { StatCard } from './IntelligenceCard';
import OpportunityCard from './OpportunityCard';
import { buildOverlookedOpportunities } from '@/lib/commercial/designIntelligence/overlookedOpportunities';

export default function OverlookedOpportunitiesPanel({ families, accountsById, followUpsByKey, onLogFollowUp, sectorLabel }) {
  const opportunities = useMemo(
    () => buildOverlookedOpportunities(families, accountsById),
    [families, accountsById],
  );

  return (
    <IntelligenceCard
      title="Overlooked Opportunities"
      subtitle="Non-Premium Partner dealers showing meaningful recorded design engagement. Flagged as relationship-development opportunities, not automatic recommendations."
    >
      {opportunities.length === 0 ? (
        <div style={{ fontSize: 13, color: BRAND.muted }}>
          No overlooked opportunities in this sector. A dealer needs at least 2 recorded projects to appear here.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          <StatCard label="Dealers with engagement" value={formatNumber(opportunities.length)} tone={BRAND.primary} />
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