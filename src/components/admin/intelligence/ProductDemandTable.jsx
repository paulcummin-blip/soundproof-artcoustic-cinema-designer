// ProductDemandTable.jsx
// ----------------------
// Artcoustic product demand from the counted version of every forecast project,
// and nothing else: no excluded project, no non-counted version and no
// non-catalogue line contributes. Quantity is catalogue units, value is retail
// ex VAT, and the trade value is derived from that retail.
//
// Each row can be expanded to show which forecast projects produced the
// quantity.
//
// Any heading can be clicked to sort. Sorting is display order only — it never
// changes a quantity, a value or a status — and the caller can pass the same
// sort state through to the export so the workbook follows the screen.

import React, { useMemo, useState } from 'react';
import { BRAND, EmptyState, Pill, TABLE, TABLE_WRAP, Td } from './IntelligenceUi';
import SortableTh from './SortableTh';
import { formatMoney, formatNumber } from '@/lib/commercial/projectReporting/formatMoney';
import { tradeValueOf } from '@/lib/commercial/projectReporting/artcousticForecast';
import {
  DEFAULT_PRODUCT_DEMAND_SORT,
  PRODUCT_DEMAND_SORT_COLUMNS,
  nextProductDemandSort,
  productDemandSortIndicator,
  resolveProductDemandSort,
  sortProductDemandRows,
} from '@/lib/commercial/projectReporting/productDemandSort';

export default function ProductDemandTable({
  productDemand = [],
  currency,
  projectNamesById,
  abfuserWarnings = [],
  sort,
  onSortChange,
}) {
  const [openKey, setOpenKey] = useState(null);
  const [localSort, setLocalSort] = useState(DEFAULT_PRODUCT_DEMAND_SORT);

  // Controlled by the page when a sort is supplied (so the export can follow it),
  // and self-contained otherwise.
  const activeSort = resolveProductDemandSort(sort || localSort);

  const handleSort = (columnKey) => {
    const next = nextProductDemandSort(activeSort, columnKey);
    if (onSortChange) onSortChange(next);
    else setLocalSort(next);
  };

  const rows = useMemo(
    () => sortProductDemandRows(productDemand, activeSort),
    [productDemand, activeSort.key, activeSort.direction],
  );

  if (productDemand.length === 0) {
    return (
      <EmptyState
        message="No Artcoustic product demand for the current forecast."
        hint="Include at least one project with an included status, then demand is read from the priced Artcoustic catalogue lines of its counted version."
      />
    );
  }

  const totalQuantity = productDemand.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);
  const valuedRows = productDemand.filter((row) => row.retailValue !== null && row.retailValue !== undefined);
  const totalRetail = valuedRows.length > 0
    ? valuedRows.reduce((sum, row) => sum + (Number(row.retailValue) || 0), 0)
    : null;
  const totalTrade = totalRetail === null ? null : tradeValueOf(totalRetail);
  const forecastProjectCount = new Set(productDemand.flatMap((row) => row.projectIds || [])).size;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ fontSize: 12, color: BRAND.muted, lineHeight: 1.6 }}>
        Only Artcoustic catalogue products are included, priced at retail ex VAT. Manual extras, projectors, third-party
        and non-Artcoustic amplifiers, labour, cabling, racks and custom lines are excluded. Demand is read from the
        counted version of each forecast project only, with no quoted snapshot quantity or non-counted version quantity
        added, and a line with no price is shown as <strong>Unpriced</strong> rather than zero.
      </div>

      <div style={{ fontSize: 12, color: BRAND.subtext, lineHeight: 1.6 }}>
        Historic Abfuser quantities before 1 Oct 2026 are excluded from demand totals due to a previous quantity issue.
        Everything else from those projects still counts, and this affects Product Demand reporting only.
      </div>

      {abfuserWarnings.map((warning) => (
        <div
          key={warning}
          style={{
            fontSize: 12,
            color: BRAND.warn,
            background: BRAND.warnBg,
            borderRadius: 8,
            padding: '8px 10px',
            lineHeight: 1.6,
          }}
        >
          {warning}
        </div>
      ))}

      <div style={{ fontSize: 13, color: BRAND.muted }}>
        <strong style={{ color: BRAND.text }}>
          {formatNumber(totalQuantity)} catalogue units,
        </strong>{' '}
        {totalRetail === null ? 'no priced catalogue value' : formatMoney(totalRetail, currency || 'GBP')} Artcoustic
        retail ex VAT,{' '}
        <strong style={{ color: BRAND.text }}>
          {totalTrade === null ? 'no trade value' : formatMoney(totalTrade, currency || 'GBP')} Artcoustic trade value
        </strong>{' '}
        across {formatNumber(forecastProjectCount)} included forecast project{forecastProjectCount === 1 ? '' : 's'}.
        Counted versions only.
      </div>

      <div style={{ fontSize: 12, color: BRAND.muted }}>
        Sorted by {PRODUCT_DEMAND_SORT_COLUMNS.find((column) => column.key === activeSort.key)?.label}
        {activeSort.direction === 'asc' ? ' (ascending)' : ' (descending)'}. Click a heading to sort; click it again to
        reverse. The export follows this order.
      </div>

      <div style={TABLE_WRAP}>
        <table style={TABLE}>
          <thead>
            <tr>
              {PRODUCT_DEMAND_SORT_COLUMNS.map((column) => (
                <SortableTh
                  key={column.key}
                  label={column.label}
                  columnKey={column.key}
                  align={column.align}
                  hint={column.hint}
                  activeKey={activeSort.key}
                  direction={activeSort.direction}
                  indicator={productDemandSortIndicator(activeSort, column.key)}
                  onSort={handleSort}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const key = row.sku || row.product;
              const isOpen = openKey === key;
              const contributors = (row.projectIds || [])
                .map((projectId) => projectNamesById?.get(projectId) || projectId)
                .sort((a, b) => String(a).localeCompare(String(b)));
              return (
                <React.Fragment key={key}>
                  <tr>
                    <Td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button
                          type="button"
                          onClick={() => setOpenKey(isOpen ? null : key)}
                          title="Show the included projects that contributed this quantity"
                          style={{
                            border: `1px solid ${BRAND.border}`,
                            background: BRAND.card,
                            borderRadius: 6,
                            width: 22,
                            height: 22,
                            cursor: 'pointer',
                            fontSize: 11,
                            color: BRAND.text,
                          }}
                        >
                          {isOpen ? '▾' : '▸'}
                        </button>
                        <span style={{ fontWeight: 600, color: BRAND.text }}>{row.product}</span>
                      </div>
                    </Td>
                    <Td mono>{row.sku || '—'}</Td>
                    <Td>{row.category || '—'}</Td>
                    <Td align="right" mono>{formatNumber(row.quantity)}</Td>
                    <Td align="right" mono>{formatNumber(row.projectFamilies)}</Td>
                    <Td align="right" mono>
                      {row.retailValue === null || row.retailValue === undefined ? <Pill tone="warn">unpriced</Pill> : formatMoney(row.retailValue, currency || 'GBP')}
                    </Td>
                    <Td align="right" mono>
                      {row.tradeValue === null || row.tradeValue === undefined ? '—' : formatMoney(row.tradeValue, currency || 'GBP')}
                    </Td>
                    <Td>{row.derived ? <Pill tone="info">Yes</Pill> : 'No'}</Td>
                    <Td>
                      <Pill tone={row.status === 'Priced' ? 'good' : (row.status === 'Inactive' ? 'bad' : 'warn')}>
                        {row.status}
                      </Pill>
                    </Td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <Td colSpan={9} style={{ background: '#FAFAF8' }}>
                        <div style={{ fontSize: 12, color: BRAND.subtext }}>
                          <strong>Included forecast projects contributing:</strong>{' '}
                          {contributors.length === 0 ? '—' : contributors.join(' · ')}
                        </div>
                      </Td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}