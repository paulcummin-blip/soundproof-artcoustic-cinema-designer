// AdvancedDiagnosticsPanel.jsx
// ----------------------------
// The deeper reporting views, kept intact and moved out of the default workflow:
// filters, canonical status breakdown, highest-value projects, project families,
// possible duplicates, warning counts and the full product demand detail.
//
// Nothing here is new derivation — it presents the existing report model.

import React from 'react';
import { Button, Card } from './IntelligenceUi';
import ProjectIntelligenceFilters from './ProjectIntelligenceFilters';
import StatusBreakdownTable from './StatusBreakdownTable';
import HighestValueProjectsTable from './HighestValueProjectsTable';
import ProjectFamilyTable from './ProjectFamilyTable';
import DuplicatesPanel from './DuplicatesPanel';
import WarningsPanel from './WarningsPanel';
import ProductDemandTab from './ProductDemandTab';
import { downloadWorkbook } from './downloadReport';

export default function AdvancedDiagnosticsPanel({
  report,
  familiesById,
  onViewVariations,
  filters,
  accountOptions,
  onFilterChange,
  onResetFilters,
}) {
  if (!report) return null;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card
        title="Reporting filters"
        subtitle="These filters narrow the deeper views below. The project selection list and product demand always use the full reporting set."
        actions={(
          <Button
            variant="secondary"
            onClick={() => downloadWorkbook(report)}
            title="The detailed reporting workbook: Project Summary, Product Demand, Variations Detail and Warnings"
          >
            Export detail workbook
          </Button>
        )}
      >
        <ProjectIntelligenceFilters
          filters={filters}
          onChange={onFilterChange}
          onReset={onResetFilters}
          accounts={accountOptions}
        />
      </Card>

      <Card
        title="Canonical status breakdown"
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
          onViewVariations={onViewVariations}
        />
      </Card>

      <Card
        title="Project families"
        subtitle="Live Design Value and Quoted Snapshot Value are reported side by side and are never added together."
      >
        <ProjectFamilyTable
          families={report.families}
          valueBasis={report.filters.valueBasis}
          onViewVariations={onViewVariations}
        />
      </Card>

      <Card
        title="Possible duplicate projects"
        subtitle="Advisory only. Detection is conservative: same account plus at least two matching signals. Nothing is merged or changed."
      >
        <DuplicatesPanel
          duplicates={report.duplicates}
          onViewVariations={onViewVariations}
          familiesById={familiesById}
        />
      </Card>

      <Card
        title="Warnings"
        subtitle="Unclassified statuses, projects whose value cannot be calculated, unpriced lines, inactive products and possible duplicates. Nothing is mapped or zeroed silently."
      >
        <WarningsPanel warnings={report.warnings} />
      </Card>

      <Card
        title="Product demand detail"
        subtitle={`${report.productDemand.length} product line${report.productDemand.length === 1 ? '' : 's'}, with the quoted snapshot column and the status split.`}
      >
        <ProductDemandTab
          productDemand={report.productDemand}
          currency={report.summary.liveCurrency || report.priceContext.currency}
          quotedCurrency={report.summary.quotedCurrency || report.priceContext.currency}
        />
      </Card>
    </div>
  );
}