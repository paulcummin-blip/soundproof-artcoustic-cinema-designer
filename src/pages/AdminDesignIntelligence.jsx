/**
 * AdminDesignIntelligence.jsx
 * -----------------------------
 * The consolidated Commercial & Design Intelligence page.
 *
 * PRIMARY VIEW: Account Management — four summary counts + one compact,
 * sortable, deduplicated dealer table with expandable detail rows.
 * Scales to 300+ dealers.
 *
 * SECONDARY VIEW: Commercial & Design Intelligence — the existing seven
 * reporting sections preserved as supporting evidence and drill-downs.
 *
 * Read-only except for DealerFollowUp records (admin-only entity).
 * No dealer, project, or account records are altered.
 */

import React from 'react';
import { useAuth } from '@/lib/AuthContext';
import { RefreshCw, Phone, BarChart3 } from 'lucide-react';
import { BRAND, Button, Pill } from '@/components/admin/intelligence/IntelligenceUi';
import useDesignIntelligence from '@/components/admin/designIntelligence/useDesignIntelligence';
import SectorSelector from '@/components/admin/designIntelligence/SectorSelector';
import DealerDrillDown from '@/components/admin/designIntelligence/DealerDrillDown';
import DealerSummaryCounts from '@/components/admin/designIntelligence/DealerSummaryCounts';
import DealerTable from '@/components/admin/designIntelligence/DealerTable';
import FollowUpDialog from '@/components/admin/designIntelligence/FollowUpDialog';
import ChangeCategoryDialog from '@/components/admin/designIntelligence/ChangeCategoryDialog';
import ProjectActivitySection from '@/components/admin/designIntelligence/ProjectActivitySection';
import ProjectValuesSection from '@/components/admin/designIntelligence/ProjectValuesSection';
import RoomSizesSection from '@/components/admin/designIntelligence/RoomSizesSection';
import SystemConfigsSection from '@/components/admin/designIntelligence/SystemConfigsSection';
import ProductDemandSection from '@/components/admin/designIntelligence/ProductDemandSection';
import EngineeringPerformanceSection from '@/components/admin/designIntelligence/EngineeringPerformanceSection';
import DealerOpportunitiesSection from '@/components/admin/designIntelligence/DealerOpportunitiesSection';
import { SECTOR_TABS } from '@/lib/commercial/designIntelligence/sectorScope';
import { ACCOUNT_MANAGEMENT_THRESHOLDS } from '@/lib/commercial/designIntelligence/accountManagementConfig';

export default function AdminDesignIntelligence() {
  const { user, isLoadingAuth } = useAuth();
  const isAdmin = user?.role === 'admin';
  const {
    loading, error, reload,
    sectorTab, setSectorTab,
    selectedDealerId, setSelectedDealerId,
    viewMode, setViewMode,
    counts, scopedFamilies, selectedDealer,
    accounts, accountsById,
    followUps, followUpDialog, setFollowUpDialog,
    handleLogFollowUp, handleSaveFollowUp,
    dealerSummary,
    categoryFilter, setCategoryFilter,
    changeCategoryDialog, setChangeCategoryDialog,
    handleChangeCategory, handleSaveCategoryOverride, handleRemoveCategoryOverride,
    report, priceContext,
  } = useDesignIntelligence();

  if (isLoadingAuth) {
    return <div style={{ padding: 48, textAlign: 'center', color: BRAND.subtext }}>Checking access…</div>;
  }

  if (!isAdmin) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: BRAND.subtext, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <div style={{ fontSize: 32 }}>🔒</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: BRAND.text }}>Access Denied</div>
        <div style={{ fontSize: 14 }}>Commercial & Design Intelligence is restricted to admin users.</div>
        <a href="/admin" style={{ marginTop: 8, padding: '10px 20px', borderRadius: 10, background: BRAND.primary, color: '#FFFFFF', fontSize: 14, textDecoration: 'none' }}>Back to Admin</a>
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
        <div style={{ padding: 24, textAlign: 'center', color: BRAND.bad, border: `1px solid ${BRAND.border}`, borderRadius: 12, background: BRAND.card }}>
          {error}
          <button onClick={reload} style={{ marginLeft: 12, fontWeight: 700, textDecoration: 'underline', cursor: 'pointer' }}>Try again</button>
        </div>
      </div>
    );
  }

  const sectorLabel = SECTOR_TABS.find((t) => t.key === sectorTab)?.label || 'All Dealers';

  return (
    <div style={{ padding: 24, background: BRAND.bg, minHeight: '100vh', color: BRAND.text }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, color: BRAND.text }}>Commercial & Design Intelligence</h1>
          <div style={{ fontSize: 13, color: BRAND.subtext, marginTop: 4 }}>
            {viewMode === 'account_management'
              ? 'Account management: which dealer deserves a call, why, and what to ask them'
              : 'Supporting evidence: sector overview, values, room sizes, configurations, product demand and engineering performance'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ padding: '6px 14px', borderRadius: 999, background: '#213428', color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: '0.04em' }}>ADMIN</span>
          <Button variant="secondary" onClick={reload} disabled={loading}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Reload
            </span>
          </Button>
        </div>
      </header>

      {/* View mode toggle */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        <ViewModeButton active={viewMode === 'account_management'} onClick={() => setViewMode('account_management')}>
          <Phone size={14} /> Account Management
        </ViewModeButton>
        <ViewModeButton active={viewMode === 'intelligence'} onClick={() => setViewMode('intelligence')}>
          <BarChart3 size={14} /> Commercial & Design Intelligence
        </ViewModeButton>
      </div>

      {/* Sector filter — visible in both views */}
      <div style={{ marginBottom: 18 }}>
        <SectorSelector
          activeKey={sectorTab}
          counts={counts}
          onSelect={(key) => { setSectorTab(key); setSelectedDealerId(null); }}
        />
      </div>

      {followUpDialog && (
        <FollowUpDialog
          opportunity={followUpDialog.opportunity}
          existing={followUpDialog.existing}
          onClose={() => setFollowUpDialog(null)}
          onSave={handleSaveFollowUp}
        />
      )}

      {changeCategoryDialog && (
        <ChangeCategoryDialog
          dealer={changeCategoryDialog.dealer}
          currentOverride={changeCategoryDialog.dealer?.manualOverride}
          onClose={() => setChangeCategoryDialog(null)}
          onSave={handleSaveCategoryOverride}
          onRemoveAuto={handleRemoveCategoryOverride}
        />
      )}

      {selectedDealer ? (
        <DealerDrillDown dealer={selectedDealer} onBack={() => setSelectedDealerId(null)} />
      ) : viewMode === 'account_management' ? (
        <div style={{ display: 'grid', gap: 16 }}>
          {/* Summary counts — clickable to filter the table */}
          <DealerSummaryCounts
            counts={dealerSummary.summaryCounts}
            activeFilter={categoryFilter}
            onFilterChange={setCategoryFilter}
          />

          {/* Active filter indicator */}
          {categoryFilter && categoryFilter !== 'all' && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              color: BRAND.subtext,
            }}>
              <span>Filtered by:</span>
              <Pill tone="neutral">
                {categoryFilter === 'follow_ups_due' ? 'Follow-ups Due'
                  : categoryFilter === 'overlooked' ? 'Overlooked'
                  : categoryFilter === 'needs_attention' ? 'Need Attention'
                  : categoryFilter === 'emerging' ? 'Emerging'
                  : categoryFilter}
              </Pill>
              <span>({dealerSummary.dealers.filter((d) => {
                if (categoryFilter === 'follow_ups_due') return d.followUpDue;
                const map = { overlooked: 'Overlooked', needs_attention: 'Need Attention', emerging: 'Emerging' };
                return d.opportunityCategory === map[categoryFilter];
              }).length} dealers)</span>
              <button
                type="button"
                onClick={() => setCategoryFilter('all')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: BRAND.primary,
                  cursor: 'pointer',
                  fontSize: 12,
                  textDecoration: 'underline',
                }}
              >
                Show all
              </button>
            </div>
          )}

          {/* Threshold reference */}
          <div style={{
            fontSize: 11,
            color: BRAND.muted,
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap',
            padding: '0 2px',
          }}>
            <span>Thresholds:</span>
            <span>Not activated: {ACCOUNT_MANAGEMENT_THRESHOLDS.approvedNotActivatedDays}d after approval</span>
            <span>· No projects: {ACCOUNT_MANAGEMENT_THRESHOLDS.activatedNoProjectsDays}d after activation</span>
            <span>· No activity: {ACCOUNT_MANAGEMENT_THRESHOLDS.noActivityMinDays}–{ACCOUNT_MANAGEMENT_THRESHOLDS.noActivityMaxDays}d</span>
            <span>· Emerging: {ACCOUNT_MANAGEMENT_THRESHOLDS.emergingMinRecentProjects}+ recent projects</span>
          </div>

          {/* Compact dealer table */}
          <DealerTable
            dealers={dealerSummary.dealers}
            categoryFilter={categoryFilter}
            onLogFollowUp={handleLogFollowUp}
            onSelectDealer={setSelectedDealerId}
            onChangeCategory={handleChangeCategory}
          />

          {dealerSummary.dealers.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: BRAND.muted, border: `1px dashed ${BRAND.border}`, borderRadius: 12 }}>
              No dealers with actionable signals in {sectorLabel}. Internal and unclassified accounts are excluded.
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {scopedFamilies.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: BRAND.muted, border: `1px dashed ${BRAND.border}`, borderRadius: 12 }}>
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
        <Pill tone="neutral">Read-only except follow-up records</Pill>
        <Pill tone="neutral">Evidence-backed observations only</Pill>
        <Pill tone="neutral">No black-box scores</Pill>
        <Pill tone="neutral">Internal accounts excluded</Pill>
        {viewMode === 'account_management' && <Pill tone="neutral">No dealer or project records altered</Pill>}
      </div>
    </div>
  );
}

function ViewModeButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '8px 14px',
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 700,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        border: `1px solid ${active ? BRAND.primary : BRAND.border}`,
        background: active ? BRAND.primary : BRAND.card,
        color: active ? '#FFFFFF' : BRAND.text,
      }}
    >
      {children}
    </button>
  );
}