/**
 * AdminCommercialIntelligence.jsx
 * --------------------------------
 * The Sector-Based Commercial Dashboard — a single Commercial Intelligence
 * experience with an Overall Overview, four country-first sectors, and
 * expandable dealer/project detail.
 *
 * Reuses the existing cursor-paginated reporting loader, CapacityLedger
 * credit authority, and Account/Project/Proposal entities. The only write is
 * the admin-only UK commercial outcome checkbox (Live / Won / Lost), which
 * updates Project.commercial_outcome — a field entirely independent of the
 * dealer's own project_status.
 *
 * Read-only except for that one admin-only write. Does not modify proposals,
 * engineering, dealer workflow statuses, prices, or project history.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { RefreshCw } from 'lucide-react';
import { BRAND, Button, Pill } from '@/components/admin/intelligence/IntelligenceUi';
import { loadAllPages } from '@/lib/commercial/projectReporting/loadProjectIntelligenceData';
import { buildCommercialDashboard } from '@/lib/commercial/commercialDashboard/buildCommercialDashboard';
import { buildProposalEventTimeline } from '@/lib/commercial/commercialDashboard/proposalEvents';
import { formatGBPValue } from '@/lib/commercial/commercialDashboard/verifiedValue';
import { nextOutcome } from '@/lib/commercial/commercialDashboard/commercialOutcome';
import { isUkTerritory } from '@/lib/commercial/commercialDashboard/sectorClassification';
import SectorSummaryCard from '@/components/admin/commercial/SectorSummaryCard';
import ProposalActivityCharts from '@/components/admin/commercial/ProposalActivityCharts';
import SectorDetail from '@/components/admin/commercial/SectorDetail';

const SECTOR_KEYS = ['premium_partners', 'trade_accounts', 'richer_sounds', 'international', 'unclassified'];

export default function AdminCommercialIntelligence() {
  const { user, isLoadingAuth } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeSector, setActiveSector] = useState(null);
  const [outcomeBusy, setOutcomeBusy] = useState(null);

  useEffect(() => {
    if (!isAdmin) return undefined;
    let mounted = true;

    async function load() {
      try {
        setLoading(true);
        setLoadError(null);
        const [accountsRes, projectsRes, proposalsRes, ledgerRes] = await Promise.all([
          loadAllPages('Account'),
          loadAllPages('Project'),
          loadAllPages('Proposal'),
          loadAllPages('CapacityLedger'),
        ]);
        if (!mounted) return;
        const model = buildCommercialDashboard({
          accounts: accountsRes.items,
          projects: projectsRes.items,
          proposals: proposalsRes.items,
          ledgerEntries: ledgerRes.items,
        });
        setDashboard(model);
      } catch (err) {
        if (mounted) setLoadError(err?.message || 'Commercial data could not be loaded.');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => { mounted = false; };
  }, [isAdmin, refreshKey]);

  const overallTimeline = useMemo(() => {
    if (!dashboard) return [];
    return buildProposalEventTimeline(dashboard.proposalEvents, { months: 12 });
  }, [dashboard]);

  async function handleToggleOutcome(projectId, which, checked) {
    const newValue = nextOutcome(null, which, checked);
    setOutcomeBusy({ projectId, which });
    try {
      const response = await base44.functions.invoke('setProjectCommercialOutcome', {
        project_id: projectId,
        outcome: newValue,
      });
      if (response?.data?.success) {
        setRefreshKey((key) => key + 1);
      } else {
        console.error('[CommercialIntelligence] Outcome update failed:', response?.data?.error);
      }
    } catch (err) {
      console.error('[CommercialIntelligence] Outcome update failed:', err);
    } finally {
      setOutcomeBusy(null);
    }
  }

  if (isLoadingAuth) {
    return <div style={{ padding: 48, textAlign: 'center', color: BRAND.subtext }}>Checking access…</div>;
  }

  if (!isAdmin) {
    return (
      <div style={{
        padding: 48, textAlign: 'center', color: BRAND.subtext,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
      }}>
        <div style={{ fontSize: 32 }}>🔒</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: BRAND.text }}>Access Denied</div>
        <div style={{ fontSize: 14 }}>Commercial Intelligence is restricted to admin users.</div>
        <a href="/admin" style={{
          marginTop: 8, padding: '10px 20px', borderRadius: 10,
          background: BRAND.primary, color: '#FFFFFF',
          fontSize: 14, textDecoration: 'none',
        }}>Back to Admin</a>
      </div>
    );
  }

  if (loading && !dashboard) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: BRAND.subtext }}>
        <RefreshCw className="mx-auto mb-2 animate-spin" size={20} />
        <div style={{ fontSize: 13 }}>Loading commercial intelligence…</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{
          padding: 24, textAlign: 'center', color: BRAND.bad,
          border: `1px solid ${BRAND.border}`, borderRadius: 12, background: BRAND.card,
        }}>
          {loadError}
          <button
            onClick={() => setRefreshKey((key) => key + 1)}
            style={{ marginLeft: 12, fontWeight: 700, textDecoration: 'underline', cursor: 'pointer' }}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const ov = dashboard.overview;

  return (
    <div style={{ padding: 24, background: BRAND.bg, minHeight: '100vh', color: BRAND.text }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, color: BRAND.text }}>Commercial Intelligence</h1>
          <div style={{ fontSize: 13, color: BRAND.subtext, marginTop: 4 }}>
            Sector-based overview, proposal activity and UK commercial outcomes
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{
            padding: '6px 14px', borderRadius: 999,
            background: '#213428', color: '#fff',
            fontSize: 12, fontWeight: 700, letterSpacing: '0.04em',
          }}>ADMIN</span>
          <Button variant="secondary" onClick={() => setRefreshKey((key) => key + 1)} disabled={loading}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Reload
            </span>
          </Button>
        </div>
      </div>

      {activeSector ? (
        <SectorDetail
          sectorModel={dashboard.sectorModels[activeSector]}
          proposalEvents={dashboard.proposalEvents}
          accountsById={dashboard.accountsById}
          onBack={() => setActiveSector(null)}
          onToggleOutcome={handleToggleOutcome}
          outcomeBusy={outcomeBusy}
        />
      ) : (
        <div style={{ display: 'grid', gap: 20 }}>
          {/* Overall summary stats */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 12,
          }}>
            <OverallStat label="Accounts" value={ov.totalAccounts} />
            <OverallStat label="Projects" value={ov.totalProjects} />
            <OverallStat label="Proposals" value={ov.totalProposals} />
            <OverallStat label="Proposal events" value={ov.proposalEventCount} />
            <OverallStat label="Live (UK)" value={ov.totalLive} />
            <OverallStat label="Won (UK)" value={ov.totalWon} />
            <OverallStat label="Lost (UK)" value={ov.totalLost} />
            <OverallStat
              label="Verified pipeline"
              value={formatGBPValue(ov.totalMonetaryPipeline)}
              accent
            />
          </div>

          {/* Sector summary cards */}
          <div>
            <h2 style={{
              margin: '0 0 10px', fontSize: 11, fontWeight: 700,
              letterSpacing: '0.08em', textTransform: 'uppercase', color: BRAND.accent,
            }}>
              Sectors
            </h2>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 14,
            }}>
              {SECTOR_KEYS.map((sectorKey) => {
                const sectorModel = dashboard.sectorModels[sectorKey];
                if (!sectorModel || sectorModel.accountCount === 0) return null;
                return (
                  <SectorSummaryCard
                    key={sectorKey}
                    sectorModel={sectorModel}
                    active={activeSector === sectorKey}
                    onClick={() => setActiveSector(sectorKey)}
                  />
                );
              })}
            </div>
          </div>

          {/* Proposal activity charts (overall) */}
          <div>
            <h2 style={{
              margin: '0 0 10px', fontSize: 11, fontWeight: 700,
              letterSpacing: '0.08em', textTransform: 'uppercase', color: BRAND.accent,
            }}>
              Proposal activity — last 12 months
            </h2>
            <ProposalActivityCharts timeline={overallTimeline} />
          </div>

          {/* Credit parity notice */}
          <div style={{
            padding: '12px 16px',
            borderRadius: 10,
            background: '#FBF2E7',
            border: '1px solid #E8D9C4',
            fontSize: 12,
            color: '#8A4B12',
          }}>
            <strong>Credit parity:</strong> Sound Proof ledger data is verified. Cross-platform
            parity with the partner portal is <strong>unverified</strong> while the turnover-reward
            synchronisation issue is investigated. Balances are not changed.
          </div>

          {/* Value basis notice */}
          <div style={{
            padding: '12px 16px',
            borderRadius: 10,
            background: BRAND.infoBg,
            border: `1px solid ${BRAND.border}`,
            fontSize: 12,
            color: BRAND.info,
          }}>
            <strong>Value basis:</strong> Monetary pipeline shows verified frozen retail value
            including VAT from proposal price snapshots. Projects without a qualifying proposal or
            verified snapshot remain visible with no proposal value. Current Product Master prices
            are not used to backfill historical values.
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Pill tone="neutral">Read-only except admin commercial outcome</Pill>
          </div>
        </div>
      )}
    </div>
  );
}

function OverallStat({ label, value, accent }) {
  return (
    <div style={{
      background: BRAND.card,
      border: `1px solid ${BRAND.border}`,
      borderRadius: 10,
      padding: '10px 12px',
    }}>
      <div style={{ fontSize: 10, color: BRAND.accent, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: accent ? 18 : 16, fontWeight: 700, color: accent ? '#213428' : '#1B1A1A' }}>
        {value}
      </div>
    </div>
  );
}