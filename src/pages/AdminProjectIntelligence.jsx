// AdminProjectIntelligence.jsx
// ----------------------------
// Project Intelligence — project inclusion, counted-version selection and
// product demand export.
//
// The default workflow is deliberately simple:
//   1. Include or exclude each project.
//   2. Choose which version counts where a project has variations.
//   3. Export the product demand from the counted versions only.
//
// Product demand counts exactly ONE version per included project, because a
// client cannot buy every design option. The deeper reporting views are
// unchanged and live in the Advanced diagnostics tab.
//
// Read-only: this page performs no writes of any kind. The admin's inclusion and
// counted-version choices are local report selection in this browser.

import React, { useMemo, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import useProjectIntelligence from '@/components/admin/intelligence/useProjectIntelligence';
import useProjectSelection from '@/components/admin/intelligence/useProjectSelection';
import { BRAND, Button, Card, Pill } from '@/components/admin/intelligence/IntelligenceUi';
import ProjectSelectionSummary from '@/components/admin/intelligence/ProjectSelectionSummary';
import ProjectSelectionTable from '@/components/admin/intelligence/ProjectSelectionTable';
import ProductDemandTable from '@/components/admin/intelligence/ProductDemandTable';
import ExcludedCatalogueLines from '@/components/admin/intelligence/ExcludedCatalogueLines';
import ExcludedHistoricAbfusers from '@/components/admin/intelligence/ExcludedHistoricAbfusers';
import VariationCountTable from '@/components/admin/intelligence/VariationCountTable';
import AdvancedDiagnosticsPanel from '@/components/admin/intelligence/AdvancedDiagnosticsPanel';
import VariationDrawer from '@/components/admin/intelligence/VariationDrawer';
import { SELECTION_STORAGE_LABEL } from '@/components/admin/intelligence/projectSelectionStore';
import { downloadSelectionCsv, downloadSelectionWorkbook } from '@/components/admin/intelligence/downloadReport';
import { formatNumber } from '@/lib/commercial/projectReporting/formatMoney';
import {
  DEFAULT_PRODUCT_DEMAND_SORT,
  sortProductDemandRows,
} from '@/lib/commercial/projectReporting/productDemandSort';

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
  // same order: it opens on total live value, highest first.
  const [demandSort, setDemandSort] = useState(DEFAULT_PRODUCT_DEMAND_SORT);

  const familiesById = useMemo(() => (
    new Map((report?.families || []).map((family) => [family.id, family]))
  ), [report]);

  const projectNamesById = useMemo(() => (
    new Map((report?.families || []).map((family) => [family.id, family.name]))
  ), [report]);

  const drawerFamily = activeFamily ? (familiesById.get(activeFamily.id) || activeFamily) : null;
  const hiddenProjectCount = report
    ? Math.max(0, (report.summary.totalProjectCount || 0) - report.families.length)
    : 0;

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
    excludedLines: selection.excludedLines,
    abfuserExclusions: selection.abfuserExclusions,
  });

  const handleExportWorkbook = () => {
    if (!report) return;
    const tabs = downloadSelectionWorkbook(exportPayload());
    setExportNotice(`Workbook downloaded with tabs: ${tabs.join(', ')}.`);
  };

  const handleExportCsv = () => {
    if (!report) return;
    downloadSelectionCsv(exportPayload());
    setExportNotice('CSV downloaded per tab: Included Projects, Excluded Projects, Product Demand, Version Detail, Excluded Manual Lines, Excluded Historic Abfusers.');
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
            Project selection and product demand export
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: BRAND.muted, maxWidth: 620, lineHeight: 1.6 }}>
            Select the projects to include, choose the counted version where there are variations, then export the
            product demand.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button
            onClick={handleExportWorkbook}
            disabled={!report || loading}
            title="Workbook: Included Projects, Excluded Projects, Product Demand and Version Detail"
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
        <div style={{ marginBottom: 14, fontSize: 12, color: BRAND.muted }}>
          {exportNotice} The export respects the current inclusion, counted-version selection and Product Demand
          sort order.
        </div>
      )}

      {data?.counts && (
        <div style={{ marginBottom: 14, fontSize: 12, color: BRAND.muted }}>
          Loaded {formatNumber(data.counts.projects)} projects, {formatNumber(data.counts.versions)} design versions,
          {' '}{formatNumber(data.counts.proposals)} proposals and {formatNumber(data.counts.products)} products.
          {' '}{SELECTION_STORAGE_LABEL}
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
            hiddenCount={hiddenProjectCount}
          />

          {!priceListAvailable && (
            <div style={{ fontSize: 12, color: BRAND.warn }}>
              No price list is available for this session, so live design value is reported as not calculable rather than
              as zero.
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {TABS.map((entry) => (
              <TabButton key={entry.key} active={tab === entry.key} onClick={() => setTab(entry.key)}>
                {entry.label}
                {entry.key === 'demand' && selection.productDemand.length > 0 ? ` (${selection.productDemand.length})` : ''}
                {entry.key === 'projects' && summary ? ` (${summary.includedCount}/${summary.listedProjectCount})` : ''}
              </TabButton>
            ))}
          </div>

          {tab === 'demand' && (
            <Card
              title="Product demand"
              subtitle={`${selection.productDemand.length} Artcoustic catalogue line${selection.productDemand.length === 1 ? '' : 's'} across ${summary.includedCount} included project${summary.includedCount === 1 ? '' : 's'}. Counted versions only.`}
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
              title="Project selection"
              subtitle="One row per project. Test, demo and audit projects are excluded by default and can be included manually."
              actions={(
                <Button
                  variant="secondary"
                  onClick={selection.resetSelection}
                  title="Clear the stored inclusion and counted-version choices and return to the defaults"
                >
                  Reset selection to defaults
                </Button>
              )}
            >
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ fontSize: 12, color: BRAND.muted }}>
                  Inclusion is report selection only. Nothing is deleted, archived or changed in the project database.
                </div>
                <ProjectSelectionTable
                  families={selection.selectedFamilies}
                  currency={report.summary.liveCurrency}
                  onToggleInclude={selection.setIncluded}
                  onCountedChange={selection.setCountedOption}
                />
              </div>
            </Card>
          )}

          {tab === 'variations' && (
            <Card
              title="Version detail"
              subtitle={`${selection.versionRows.length} design version${selection.versionRows.length === 1 ? '' : 's'} across ${summary.listedProjectCount} projects. Only counted versions feed product demand.`}
            >
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

          <div style={{ fontSize: 12, color: BRAND.muted, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <Pill tone="neutral">Read-only</Pill>
            <span>
              Live design value is calculated with the existing pricing engine against the current Product Master, for
              the counted version of each included project. Versions of a project are design options and are never summed.
            </span>
          </div>
        </div>
      )}

      <VariationDrawer family={drawerFamily} onClose={() => setActiveFamily(null)} />
    </div>
  );
}