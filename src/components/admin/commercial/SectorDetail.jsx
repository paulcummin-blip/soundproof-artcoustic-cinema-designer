/**
 * SectorDetail.jsx
 * ---------------
 * The sector view for the Commercial Intelligence dashboard: sector-scoped
 * performance figures, two proposal-creation charts, and a searchable,
 * expandable account list with project rows and Won/Lost controls.
 */

import React, { useMemo, useState } from 'react';
import { ArrowLeft, Search } from 'lucide-react';
import { BRAND, Button, Pill } from '@/components/admin/intelligence/IntelligenceUi';
import { formatGBPValue } from '@/lib/commercial/commercialDashboard/verifiedValue';
import { buildProposalEventTimeline } from '@/lib/commercial/commercialDashboard/proposalEvents';
import { isUkTerritory } from '@/lib/commercial/commercialDashboard/sectorClassification';
import ProposalActivityCharts from './ProposalActivityCharts';
import AccountProjectList from './AccountProjectList';

export default function SectorDetail({
  sectorModel,
  proposalEvents,
  accountsById,
  onBack,
  onToggleOutcome,
  outcomeBusy,
}) {
  const [search, setSearch] = useState('');

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return sectorModel?.rows || [];
    return (sectorModel?.rows || []).filter((row) => {
      const haystack = [row.account.name, row.account.account_type, row.account.contact_email]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [sectorModel, search]);

  const timeline = useMemo(() => {
    if (!proposalEvents) return [];
    const isUkEvent = (event) => {
      const account = event.accountId ? accountsById?.get(event.accountId) : null;
      return isUkTerritory(account?.territory);
    };
    const sectorFilter = sectorModel?.key === 'international' ? 'international' : 'uk';
    // International shows non-UK events; UK sectors show UK events; unclassified
    // shows events whose account territory is unclassified (not UK, not non-UK).
    if (sectorModel?.key === 'unclassified') {
      const unclassifiedEvents = proposalEvents.filter((event) => {
        const account = event.accountId ? accountsById?.get(event.accountId) : null;
        const territory = account?.territory;
        return !territory || (!isUkTerritory(territory) && territory.toUpperCase() !== territory);
      });
      return buildProposalEventTimeline(unclassifiedEvents, { months: 12 });
    }
    return buildProposalEventTimeline(proposalEvents, {
      months: 12,
      sectorFilter,
      isUkEvent,
    });
  }, [proposalEvents, accountsById, sectorModel]);

  if (!sectorModel) return null;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Button variant="secondary" onClick={onBack}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <ArrowLeft size={14} /> Overview
          </span>
        </Button>
        <h2 style={{ margin: 0, fontSize: 22, color: BRAND.text }}>{sectorModel.label}</h2>
        <Pill tone="neutral">{sectorModel.accountCount} accounts</Pill>
        <Pill tone="neutral">{sectorModel.projectCount} projects</Pill>
        {sectorModel.key !== 'international' && sectorModel.key !== 'unclassified' && (
          <Pill tone="good">{sectorModel.liveCount} live</Pill>
        )}
      </div>

      <div style={{ fontSize: 13, color: BRAND.subtext }}>{sectorModel.description}</div>

      {sectorModel.key !== 'international' && sectorModel.key !== 'unclassified' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 12,
        }}>
          <SummaryStat label="Live pipeline" value={sectorModel.liveCount} />
          <SummaryStat label="Won" value={sectorModel.wonCount} />
          <SummaryStat label="Lost" value={sectorModel.lostCount} />
          <SummaryStat
            label="Verified pipeline value"
            value={formatGBPValue(sectorModel.monetaryPipelineValue)}
            accent
          />
          <SummaryStat label="Available credits" value={sectorModel.availableCredits} />
        </div>
      )}

      <ProposalActivityCharts timeline={timeline} sectorLabel={sectorModel.label} />

      <div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 12,
          flexWrap: 'wrap',
        }}>
          <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 400 }}>
            <Search
              size={14}
              style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: BRAND.muted }}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search accounts..."
              style={{
                width: '100%',
                padding: '8px 10px 8px 32px',
                borderRadius: 8,
                border: `1px solid ${BRAND.border}`,
                background: BRAND.card,
                fontSize: 13,
                color: BRAND.text,
                outline: 'none',
              }}
            />
          </div>
          <Pill tone="neutral">{filteredRows.length} of {sectorModel.rows.length}</Pill>
        </div>

        {filteredRows.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: BRAND.muted, fontSize: 13, border: `1px dashed ${BRAND.border}`, borderRadius: 10 }}>
            No accounts match the search.
          </div>
        ) : (
          filteredRows.map((row) => (
            <AccountProjectList
              key={row.account.id}
              row={row}
              onToggleOutcome={onToggleOutcome}
              outcomeBusy={outcomeBusy}
            />
          ))
        )}
      </div>
    </div>
  );
}

function SummaryStat({ label, value, accent }) {
  return (
    <div style={{
      background: BRAND.card,
      border: `1px solid ${BRAND.border}`,
      borderRadius: 10,
      padding: '12px 14px',
    }}>
      <div style={{ fontSize: 11, color: BRAND.accent, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: accent ? 18 : 16, fontWeight: 700, color: accent ? '#213428' : '#1B1A1A' }}>
        {value}
      </div>
    </div>
  );
}