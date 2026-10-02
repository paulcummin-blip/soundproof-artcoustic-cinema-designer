// AdminProjectIntelligence.jsx
// ----------------------------
// Project Intelligence — the Artcoustic product forecast and demand export.
//
// The question this page answers is "what Artcoustic business is likely coming
// our way?", so every figure is Artcoustic catalogue products only, priced at
// retail ex VAT with the trade value derived from it.
//
// The default workflow is deliberately simple:
//   1. Choose which statuses count and which Artcoustic product categories count.
//   2. Include or exclude each project.
//   3. Choose which version counts where a project has variations.
//   4. Export the forecast.
//
// Product demand counts exactly ONE version per forecast project, because a
// client cannot buy every design option. Overall project value and quoted
// snapshot detail live in the Advanced diagnostics tab.
//
// Read-only: this page performs no writes of any kind. The admin's inclusion,
// status and category choices are local report selection in this browser.

import React, { useMemo, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import useProjectIntelligence from '@/components/admin/intelligence/useProjectIntelligence';
import useProjectSelection from '@/components/admin/intelligence/useProjectSelection';
import { BRAND, Button, Card, Pill } from '@/components/admin/intelligence/IntelligenceUi';
import ProjectSelectionSummary from '@/components/admin/intelligence/ProjectSelectionSummary';
import ProjectSelectionTable from '@/components/admin/intelligence/ProjectSelectionTable';
import StatusInclusionPanel from '@/components/admin/intelligence/StatusInclusionPanel';
import CategoryInclusionPanel from '@/components/admin/intelligence/CategoryInclusionPanel';
import ForecastDashboard from '@/components/admin/intelligence/ForecastDashboard';
import ProductDemandTable from '@/components/admin/intelligence/ProductDemandTable';
import ExcludedCatalogueLines from '@/components/admin/intelligence/ExcludedCatalogueLines';
import ExcludedHistoricAbfusers from '@/components/admin/intelligence/ExcludedHistoricAbfusers';
import VariationCountTable from '@/components/admin/intelligence/VariationCountTable';
import AdvancedDiagnosticsPanel from '@/components/admin/intelligence/AdvancedDiagnosticsPanel';
import VariationDrawer from '@/components/admin/intelligence/VariationDrawer';
import { downloadSelectionCsv, downloadSelectionWorkbook } from '@/components/admin/intelligence/downloadReport';
import { formatNumber } from '@/lib/commercial/projectReporting/formatMoney';
import {
  DEFAULT_PRODUCT_DEMAND_SORT,
  sortProductDemandRows,
} from '@/lib/commercial/projectReporting/productDemandSort';
import {
  DEFAULT_PROJECT_SORT,
  PROJECT_SORT_COLUMNS,
} from '@/lib/commercial/projectReporting/projectSort';
import { buildTrendSummary } from '@/lib/commercial/projectReporting/pipelineTrends';
import { ageBucketByKey, ageBucketKeyOf, UNKNOWN_AGE_BUCKET_KEY } from '@/lib/commercial/projectReporting/pipelineAge';

const TABS = [
  { key: 'demand', label: 'Product Demand' },
  { key: 'projects', label: 'Projects' },
  { key: 'variations', label: 'Variations' },
  { key: 'advanced', label: 'Advanced diagnostics' },
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

  const selection = useProjectSelection({
    families: useMemo(() => report?.families || [], [report]),
    priceMap: data?.priceContext?.priceMap || null,
    totalLoaded: report?.summary?.totalProjectCount,
  });

  const [tab, setTab] = useState('demand');
  const [activeFamily, setActiveFamily] = useState(null);
  const [exportNotice, setExportNotice] = useState(null);

  // Product demand sort order. Held here so the table and the export read the
  // same order: it opens on Product Demand catalogue value, highest first.
  const [demandSort, setDemandSort] = useState(DEFAULT_PRODUCT_DEMAND_SORT);

  // Projects table sort order and the age bucket the dashboard is filtering to.
  // View state only.
  const [projectSort, setProjectSort] = useState(DEFAULT_PROJECT_SORT);
  const [ageFilter, setAgeFilter] = useState(null);

  // Clicking an age bucket narrows the Projects table to that bucket; clicking
  // the active bucket again clears it. No record and no selection is changed.
  const handleBucketClick = (bucketKey) => {
    setAgeFilter((current) => (current === bucketKey ? null : bucketKey));
    setTab('projects');
  };

  // The Projects table shows the bucket the overview is filtering to.
  const projectRows = useMemo(() => (
    ageFilter
      ? selection.selectedFamilies.filter((family) => (ageBucketKeyOf(family) || UNKNOWN_AGE_BUCKET_KEY) === ageFilter)
      : selection.selectedFamilies
  ), [selection.selectedFamilies, ageFilter]);

  const ageFilterLabel = ageBucketByKey(ageFilter)?.label || null;
  const projectSortLabel = PROJECT_SORT_COLUMNS.find((column) => column.key === projectSort.key)?.label || null;

  // Dealer/account options come from the selection, so the dashboard's account
  // scope always has data behind it.
  const dealerAccountOptions = useMemo(() => {
    const byId = new Map();
    for (const family of selection.selectedFamilies) {
      if (!family.accountId || byId.has(family.accountId)) continue;
      byId.set(family.accountId, family.dealerName || family.accountName || 'Unnamed account');
    }
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [selection.selectedFamilies]);

  // The workbook's Trend Summary tab is built from the rolling 90-day window
  // authority, measured across every account. The dashboard draws its own time
  // series from forecastTimelines. The reference instant is the reporting run,
  // so the windows match the data that was loaded.
  const trends = useMemo(() => buildTrendSummary(selection.selectedFamilies, {
    unitsByProjectId: selection.unitsByProjectId,
    retailByProjectId: selection.retailByProjectId,
    now: report?.generatedAt,
  }), [selection.selectedFamilies, selection.unitsByProjectId, selection.retailByProjectId, report]);

  const familiesById = useMemo(() => (
    new Map((report?.families || []).map((family) => [family.id, family]))
  ), [report]);

  const projectNamesById = useMemo(() => (
    new Map((report?.families || []).map((family) => [family.id, family.name]))
  ), [report]);

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

  const exportPayload = () => ({
    families: selection.selectedFamilies,
    // The export carries the demand rows in the order shown on screen. Sorting
    // is ordering only — the rows and their values are untouched.
    productDemand: sortProductDemandRows(selection.productDemand, demandSort),
    // The status, category and version surfaces are the same rows the page shows,
    // so the workbook cannot disagree with the screen.
    statusRows: selection.statusRows,
    categoryRows: selection.categoryRows,
    versionRows: selection.versionRows,
    excludedLines: selection.excludedLines,
    abfuserExclusions: selection.abfuserExclusions,
    // The age and trend summaries are the same objects the page displays, so the
    // workbook cannot disagree with the screen.
    pipelineAge: selection.pipelineAge,
    trends,
    currency: report?.summary?.liveCurrency || 'GBP',
  });

  const handleExportWorkbook = () => {
    if (!report) return;
    const tabs = downloadSelectionWorkbook(exportPayload());
    setExportNotice(`Workbook downloaded with tabs: ${tabs.join(', ')}.`);
  };

  const handleExportCsv = () => {
    if (!report) return;
    const tabs = downloadSelectionCsv(exportPayload());
    setExportNotice(`CSV downloaded per tab: ${tabs.join(', ')}.`);
  };

  const truncation = data?.truncation;
  const summary = selection.summary;
  const priceListAvailable = report?.priceContext?.priceListAvailable !== false;

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
            Artcoustic product forecast and demand export
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button
            onClick={handleExportWorkbook}
            disabled={!report || loading}
            title="Workbook: Included Forecast Projects, Excluded Projects, Product Demand, Status Inclusion, Category Inclusion, Version Detail and the exclusion audits"
          >
            Export product demand (workbook)
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
        <div style={{ marginBottom: 14, fontSize: 12, color: BRAND.muted }}>{exportNotice}</div>
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
          The data set hit the reporting row ceiling and may be incomplete. Narrow the date range in Advanced
          diagnostics to load everything.
        </div>
      )}

      {error && (
        <div style={{ marginBottom: 14 }}>
          <Card title="Reporting data could not be loaded" subtitle={error}>
            <Button onClick={reload}>Try again</Button>
          </Card>
        </div>
      )}

      {loading && !report && (
        <Card>
          <div style={{ fontSize: 13, color: BRAND.muted }}>Loading projects, design versions and the Product Master…</div>
        </Card>
      )}

      {report && (
        <div style={{ display: 'grid', gap: 16 }}>
          <ProjectSelectionSummary
            summary={summary}
            currency={report.summary.liveCurrency}
            forecast={selection.forecastSummary}
            pipelineAge={selection.pipelineAge}
          />

          <ForecastDashboard
            forecastProjects={selection.forecastProjects}
            pipelineAge={selection.pipelineAge}
            unitsByProjectId={selection.unitsByProjectId}
            retailByProjectId={selection.retailByProjectId}
            currency={report.summary.liveCurrency}
            accountOptions={dealerAccountOptions}
            now={report?.generatedAt}
            activeBucket={ageFilter}
            onBucketClick={handleBucketClick}
          />

          <div style={{
            display: 'grid',
            gap: 16,
            gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))',
          }}>
            <StatusInclusionPanel
              rows={selection.statusRows}
              currency={report.summary.liveCurrency}
              onToggleStatus={selection.setStatusIncluded}
              onResetStatuses={selection.resetStatuses}
            />
            <CategoryInclusionPanel
              rows={selection.categoryRows}
              currency={report.summary.liveCurrency}
              onToggleCategory={selection.setCategoryIncluded}
              onResetCategories={selection.resetCategories}
            />
          </div>

          {!priceListAvailable && (
            <div style={{ fontSize: 12, color: BRAND.warn }}>
              No price list available — catalogue value is not calculable.
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {TABS.map((entry) => (
              <TabButton key={entry.key} active={tab === entry.key} onClick={() => setTab(entry.key)}>
                {entry.label}
                {entry.key === 'demand' && selection.productDemand.length > 0 ? ` (${selection.productDemand.length})` : ''}
                {entry.key === 'projects' && summary ? ` (${selection.forecastSummary.projectCount}/${summary.listedProjectCount})` : ''}
              </TabButton>
            ))}
          </div>

          {tab === 'demand' && (
            <Card
              title="Product Demand"
              subtitle={`${selection.productDemand.length} catalogue line${selection.productDemand.length === 1 ? '' : 's'} · ${selection.forecastSummary.projectCount} forecast project${selection.forecastSummary.projectCount === 1 ? '' : 's'}`}
            >
              <div style={{ display: 'grid', gap: 16 }}>
                <ProductDemandTable
                  productDemand={selection.productDemand}
                  currency={report.summary.liveCurrency || report.priceContext.currency}
                  projectNamesById={projectNamesById}
                  abfuserWarnings={selection.abfuserWarnings}
                  sort={demandSort}
                  onSortChange={setDemandSort}
                />
                <ExcludedHistoricAbfusers
                  abfuserExclusions={selection.abfuserExclusions}
                  currency={report.summary.liveCurrency || report.priceContext.currency}
                />
                <ExcludedCatalogueLines
                  excludedLines={selection.excludedLines}
                  currency={report.summary.liveCurrency || report.priceContext.currency}
                />
              </div>
            </Card>
          )}

          {tab === 'projects' && (
            <Card
              actions={(
                <Button variant="secondary" onClick={selection.resetSelection}>
                  Reset selection to defaults
                </Button>
              )}
            >
              <div style={{ display: 'grid', gap: 12 }}>
                {(ageFilterLabel || projectSortLabel) && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {projectSortLabel && <Pill tone="neutral">Sorted by {projectSortLabel}</Pill>}
                    {ageFilterLabel && <Pill tone="good">{ageFilterLabel} only</Pill>}
                    {ageFilterLabel && (
                      <Button variant="secondary" onClick={() => setAgeFilter(null)}>
                        Clear age filter
                      </Button>
                    )}
                  </div>
                )}
                <ProjectSelectionTable
                  families={projectRows}
                  currency={report.summary.liveCurrency}
                  onToggleInclude={selection.setIncluded}
                  onCountedChange={selection.setCountedOption}
                  sort={projectSort}
                  onSortChange={setProjectSort}
                />
              </div>
            </Card>
          )}

          {tab === 'variations' && (
            <Card>
              <VariationCountTable
                rows={selection.versionRows}
                currency={report.summary.liveCurrency}
              />
            </Card>
          )}

          {tab === 'advanced' && (
            <AdvancedDiagnosticsPanel
              report={report}
              familiesById={familiesById}
              onViewVariations={setActiveFamily}
              filters={filters}
              accountOptions={accountOptions}
              onFilterChange={updateFilter}
              onResetFilters={resetFilters}
            />
          )}

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Pill tone="neutral">Read-only</Pill>
          </div>
        </div>
      )}

      <VariationDrawer family={drawerFamily} onClose={() => setActiveFamily(null)} />
    </div>
  );
}