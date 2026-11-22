/**
 * AdminDesignIntelligence.jsx
 * -----------------------------
 * The consolidated Commercial & Design Intelligence page.
 *
 * Reuses the existing Commercial Intelligence and Project Intelligence
 * authorities — no third reporting system. Loads data once, builds the
 * joined report, and presents seven reporting sections filtered by the
 * selected sector. Admin can drill down to a dealer and open a project.
 *
 * Read-only: this page performs no writes.
 */

import React from 'react';
import { useAuth } from '@/lib/AuthContext';
import { RefreshCw } from 'lucide-react';
import { BRAND, Button, Pill } from '@/components/admin/intelligence/IntelligenceUi';
import useDesignIntelligence from '@/components/admin/designIntelligence/useDesignIntelligence';
import SectorSelector from '@/components/admin/designIntelligence/SectorSelector';
import ProjectActivitySection from '@/components/admin/designIntelligence/ProjectActivitySection';
import ProjectValuesSection from '@/components/admin/designIntelligence/ProjectValuesSection';
import RoomSizesSection from '@/components/admin/designIntelligence/RoomSizesSection';
import SystemConfigsSection from '@/components/admin/designIntelligence/SystemConfigsSection';
import ProductDemandSection from '@/components/admin/designIntelligence/ProductDemandSection';
import EngineeringPerformanceSection from '@/components/admin/designIntelligence/EngineeringPerformanceSection';
import DealerOpportunitiesSection from '@/components/admin/designIntelligence/DealerOpportunitiesSection';
import DealerDrillDown from '@/components/admin/designIntelligence/DealerDrillDown';

export default function AdminDesignIntelligence() {
  const { user, isLoadingAuth } = useAuth();
  const isAdmin = user?.role === 'admin';
  const {
    loading,
    error,
    reload,
    sectorTab,
    setSectorTab,
    selectedDealerId,
    setSelectedDealerId,
    counts,
    scopedFamilies,
    selectedDealer,
    report,
    priceContext,
  } = useDesignIntelligence();

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
        <div style={{ fontSize: 14 }}>Commercial & Design Intelligence is restricted to admin users.</div>
        <a href="/admin" style={{
          marginTop: 8, padding: '10px 20px', borderRadius: 10,
          background: BRAND.primary, color: '#FFFFFF',
          fontSize: 14, textDecoration: 'none',
        }}>Back to Admin</a>
      </div>
    );
  }

  if (loading && !report) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: BRAND.subtext }}>
        <RefreshCw className="mx-auto mb-2 animate-spin" size={20} />
        <div style={{ fontSize: 13 }}>Loading commercial & design intelligence…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{
          padding: 24, textAlign: 'center', color: BRAND.bad,
          border: `1px solid ${BRAND.border}`, borderRadius: 12, background: BRAND.card,
        }}>
          {error}
          <button
            onClick={reload}
            style={{ marginLeft: 12, fontWeight: 700, textDecoration: 'underline', cursor: 'pointer' }}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, background: BRAND.bg, minHeight: '100vh', color: BRAND.text }}>
      <header style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 16,
        marginBottom: 18,
        flexWrap: 'wrap',
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, color: BRAND.text }}>Commercial & Design Intelligence</h1>
          <div style={{ fontSize: 13, color: BRAND.subtext, marginTop: 4 }}>
            Consolidated sector overview, project activity, values, room sizes, configurations, product demand, engineering performance and dealer opportunities
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{
            padding: '6px 14px', borderRadius: 999,
            background: '#213428', color: '#fff',
            fontSize: 12, fontWeight: 700, letterSpacing: '0.04em',
          }}>ADMIN</span>
          <Button variant="secondary" onClick={reload} disabled={loading}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Reload
            </span>
          </Button>
        </div>
      </header>

      <div style={{ marginBottom: 18 }}>
        <SectorSelector
          activeKey={sectorTab}
          counts={counts}
          onSelect={(key) => {
            setSectorTab(key);
            setSelectedDealerId(null);
          }}
        />
      </div>

      {selectedDealer ? (
        <DealerDrillDown
          dealer={selectedDealer}
          onBack={() => setSelectedDealerId(null)}
        />
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {scopedFamilies.length === 0 ? (
            <div style={{
              padding: 32, textAlign: 'center', color: BRAND.muted,
              border: `1px dashed ${BRAND.border}`, borderRadius: 12,
            }}>
              No projects in this sector.
            </div>
          ) : (
            <>
              <ProjectActivitySection
                families={scopedFamilies}
                report={report}
                onSelectDealer={setSelectedDealerId}
                selectedDealerId={selectedDealerId}
              />
              <ProjectValuesSection families={scopedFamilies} />
              <RoomSizesSection families={scopedFamilies} />
              <SystemConfigsSection families={scopedFamilies} />
              <ProductDemandSection families={scopedFamilies} priceContext={priceContext} />
              <EngineeringPerformanceSection families={scopedFamilies} />
              <DealerOpportunitiesSection families={scopedFamilies} />
            </>
          )}
        </div>
      )}

      <div style={{ marginTop: 18, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Pill tone="neutral">Read-only</Pill>
        <Pill tone="neutral">One project = one commercial family</Pill>
        <Pill tone="neutral">Live value and quoted value are never combined</Pill>
        <Pill tone="neutral">Variations are separate from project counts</Pill>
      </div>
    </div>
  );
}