// AdminProjectIntelligence.jsx
// ----------------------------
// Project Intelligence — commercial project, value and product reporting.
//
// Projects are counted once. Design versions are shown as variations.
// Read-only: this page performs no writes of any kind.

import React, { useMemo, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import useProjectIntelligence from '@/components/admin/intelligence/useProjectIntelligence';
import { BRAND, Button, Card, Pill } from '@/components/admin/intelligence/IntelligenceUi';
import ProjectIntelligenceFilters from '@/components/admin/intelligence/ProjectIntelligenceFilters';
import ProjectIntelligenceSummary from '@/components/admin/intelligence/ProjectIntelligenceSummary';
import StatusBreakdownTable from '@/components/admin/intelligence/StatusBreakdownTable';
import HighestValueProjectsTable from '@/components/admin/intelligence/HighestValueProjectsTable';
import ProjectFamilyTable from '@/components/admin/intelligence/ProjectFamilyTable';
import VariationDrawer from '@/components/admin/intelligence/VariationDrawer';
import ProductDemandTab from '@/components/admin/intelligence/ProductDemandTab';
import DuplicatesPanel from '@/components/admin/intelligence/DuplicatesPanel';
import WarningsPanel from '@/components/admin/intelligence/WarningsPanel';
import { downloadCsvSheets, downloadWorkbook, WORKBOOK_TABS } from '@/components/admin/intelligence/downloadReport';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'demand', label: 'Product Demand' },
  { key: 'warnings', label: 'Warnings & Duplicates' },
];

function TabButton({ active, children, onClick }) {
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
        border: `1px solid ${active ? BRAND.primary : BRAND.border}`,
        background: active ? BRAND.primary : BRAND.card,
        color: active ? '#FFFFFF' : BRAND.text,
      }}
    >
      {children}
    </button>
  );
}

export default function AdminProjectIntelligence() {
  const { user, isLoadingAuth } = useAuth();
  const isAdmin = user?.role === 'admin';
  const {
    data,
    report,
    loading,
    error,
    filters,
    accountOptions,
    updateFilter,
    resetFilters,
    reload,
  } = useProjectIntelligence();
  const [tab, setTab] = useState('overview');
  const [activeFamily, setActiveFamily] = useState(null);
  const [exportNotice, setExportNotice] = useState(null);

  const familiesById = useMemo(() => (
    new Map((report?.families || []).map((family) => [family.id, family]))
  ), [report]);

  // The drawer reads the family from the report so it always reflects the
  // current filters, and falls back to the record it was opened with.
  const drawerFamily = activeFamily ? (familiesById.get(activeFamily.id) || activeFamily) : null;

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
        <div style={{ fontSize: 14 }}>Project Intelligence is restricted to admin users.</div>
        <a href="/admin" style={{
          marginTop: 8, padding: '10px 20px', borderRadius: 10,
          background: BRAND.primary, color: '#FFFFFF',
          fontSize: 14, textDecoration: 'none',
        }}>Back to Admin</a>
      </div>
    );
  }

  const handleExportWorkbook = () => {
    if (!report) return;
    const tabs = downloadWorkbook(report);
    setExportNotice(`Workbook downloaded with tabs: ${tabs.join(', ')}.`);
  };

  const handleExportCsv = () => {
    if (!report) return;
    downloadCsvSheets(report);
    setExportNotice(`CSV downloaded per tab: ${WORKBOOK_TABS.join(', ')}.`);
  };

  const truncation = data?.truncation;

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
          <h1 style={{ margin: 0, fontSize: 26, color: BRAND.text }}>Project Intelligence</h1>
          <div style={{ fontSize: 13, color: BRAND.subtext, marginTop: 4 }}>
            Commercial project, value and product reporting
          </div>
          <div style={{
            marginTop: 10,
            padding: '8px 12px',
            border: `1px solid ${BRAND.border}`,
            borderRadius: 8,
            background: BRAND.card,
            fontSize: 12,
            color: BRAND.muted,
          }}>
            Projects are counted once. Design versions are shown as variations.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button onClick={handleExportWorkbook} disabled={!report || loading} title="Excel workbook with Project Summary, Product Demand, Variations Detail and Warnings">
            Export workbook
          </Button>
          <Button variant="secondary" onClick={handleExportCsv} disabled={!report || loading}>
            Export CSV per tab
          </Button>
          <Button variant="secondary" onClick={reload} disabled={loading}>
            {loading ? 'Loading…' : 'Reload data'}
          </Button>
        </div>
      </header>

      {exportNotice && (
        <div style={{ marginBottom: 14, fontSize: 12, color: BRAND.muted }}>
          {exportNotice} Export respects the active filters.
        </div>
      )}

      {data?.counts && (
        <div style={{ marginBottom: 14, fontSize: 12, color: BRAND.muted }}>
          Loaded {data.counts.projects.toLocaleString('en-GB')} projects, {data.counts.versions.toLocaleString('en-GB')} design versions,
          {' '}{data.counts.proposals.toLocaleString('en-GB')} proposals and {data.counts.products.toLocaleString('en-GB')} products.
          {' '}Read-only: this report never writes to the database.
        </div>
      )}

      {truncation?.any && (
        <div style={{
          marginBottom: 14,
          padding: '10px 12px',
          borderRadius: 8,
          background: BRAND.warnBg,
          color: BRAND.warn,
          fontSize: 12,
          fontWeight: 600,
        }}>
          The data set hit the reporting row ceiling and may be incomplete. Narrow the date range to load everything.
        </div>
      )}

      <div style={{ display: 'grid', gap: 16 }}>
        <ProjectIntelligenceFilters
          filters={filters}
          onChange={updateFilter}
          onReset={resetFilters}
          accounts={accountOptions}
        />

        {error && (
          <Card title="Reporting data could not be loaded" subtitle={error}>
            <Button onClick={reload}>Try again</Button>
          </Card>
        )}

        {loading && !report && (
          <Card>
            <div style={{ fontSize: 13, color: BRAND.muted }}>Loading projects, design versions and the Product Master…</div>
          </Card>
        )}

        {report && (
          <>
            <ProjectIntelligenceSummary report={report} />

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {TABS.map((entry) => (
                <TabButton key={entry.key} active={tab === entry.key} onClick={() => setTab(entry.key)}>
                  {entry.label}
                  {entry.key === 'warnings' && report.warnings.length > 0 ? ` (${report.warnings.length})` : ''}
                  {entry.key === 'demand' && report.productDemand.length > 0 ? ` (${report.productDemand.length})` : ''}
                </TabButton>
              ))}
            </div>

            {tab === 'overview' && (
              <>
                <Card
                  title="Status breakdown"
                  subtitle="Count and value by canonical status bucket. Projects are counted once; the design variation count is shown separately."
                >
                  <StatusBreakdownTable
                    buckets={report.bucketBreakdown}
                    valueBasis={report.filters.valueBasis}
                    quoteCurrency={report.priceContext.currency}
                  />
                </Card>

                <Card
                  title="Highest-value projects"
                  subtitle="Project families ranked by the selected value basis. A project appears once however many design versions it has."
                >
                  <HighestValueProjectsTable
                    families={report.families}
                    valueBasis={report.filters.valueBasis}
                    onViewVariations={setActiveFamily}
                  />
                </Card>

                <Card
                  title="Project families"
                  subtitle="One row per project. Live Design Value and Quoted Snapshot Value are reported side by side and are never added together."
                >
                  <ProjectFamilyTable
                    families={report.families}
                    valueBasis={report.filters.valueBasis}
                    onViewVariations={setActiveFamily}
                  />
                </Card>

                <Card
                  title="Possible duplicate projects"
                  subtitle="Advisory only. Detection is conservative: same account plus at least two matching signals. Nothing is merged or changed."
                >
                  <DuplicatesPanel
                    duplicates={report.duplicates}
                    onViewVariations={setActiveFamily}
                    familiesById={familiesById}
                  />
                </Card>
              </>
            )}

            {tab === 'demand' && (
              <Card
                title="Product demand"
                subtitle={`${report.productDemand.length} product line${report.productDemand.length === 1 ? '' : 's'} across ${report.summary.projectCount} project famil${report.summary.projectCount === 1 ? 'y' : 'ies'}.`}
              >
                <ProductDemandTab
                  productDemand={report.productDemand}
                  currency={report.summary.liveCurrency || report.priceContext.currency}
                  quotedCurrency={report.summary.quotedCurrency || report.priceContext.currency}
                />
              </Card>
            )}

            {tab === 'warnings' && (
              <>
                <Card
                  title="Warnings"
                  subtitle="Unclassified statuses, projects whose value cannot be calculated, unpriced lines, inactive products and possible duplicates. Nothing is mapped or zeroed silently."
                >
                  <WarningsPanel warnings={report.warnings} />
                </Card>

                <Card
                  title="Possible duplicate projects"
                  subtitle="Advisory only. No automatic grouping and no writes."
                >
                  <DuplicatesPanel
                    duplicates={report.duplicates}
                    onViewVariations={setActiveFamily}
                    familiesById={familiesById}
                  />
                </Card>
              </>
            )}

            {!report.priceContext.priceListAvailable && (
              <Card>
                <div style={{ fontSize: 12, color: BRAND.warn }}>
                  No price list is available for this session, so Live Design Value is reported as not calculable rather than as zero.
                </div>
              </Card>
            )}

            <div style={{ fontSize: 12, color: BRAND.muted, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <Pill tone="neutral">Read-only</Pill>
              <span>
                Live Design Value is calculated from each project's active design version with the existing pricing engine and the current
                Product Master. Quoted Snapshot Value is read from the frozen proposal snapshot. They are never summed.
              </span>
            </div>
          </>
        )}
      </div>

      <VariationDrawer family={drawerFamily} onClose={() => setActiveFamily(null)} />
    </div>
  );
}