// CategoryInclusionPanel.jsx
// --------------------------
// "Product categories included" — the Artcoustic catalogue categories present in
// the counted demand, each with its retail and trade value.
//
// All catalogue categories are included by default, so an admin can untick
// acoustic treatment, amplifiers or anything else and the forecast follows
// immediately.
//
// Presentation only: the rows come from the forecastDemand authority.

import React from 'react';
import { BRAND, Card, EmptyState, Pill, TABLE, TABLE_WRAP, Td, Th } from './IntelligenceUi';
import { formatMoney, formatNumber } from '@/lib/commercial/projectReporting/formatMoney';

const money = (value, currency) => (
  value === null || value === undefined ? '—' : formatMoney(value, currency || 'GBP')
);

export default function CategoryInclusionPanel({
  rows = [],
  currency,
  onToggleCategory,
  onResetCategories,
}) {
  if (rows.length === 0) {
    return (
      <Card title="Product categories included">
        <EmptyState message="No Artcoustic catalogue categories in the current selection." />
      </Card>
    );
  }

  const includedCount = rows.filter((row) => row.included).length;

  return (
    <Card
      title="Product categories included"
      subtitle={`${formatNumber(includedCount)} of ${formatNumber(rows.length)} Artcoustic catalogue categories counted. All categories are included by default; untick one and the forecast follows immediately.`}
      actions={(
        <button
          type="button"
          onClick={onResetCategories}
          style={{
            font: 'inherit',
            fontSize: 12,
            fontWeight: 700,
            color: BRAND.primary,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Reset categories to defaults
        </button>
      )}
    >
      <div style={TABLE_WRAP}>
        <table style={TABLE}>
          <thead>
            <tr>
              <Th>Include</Th>
              <Th>Category</Th>
              <Th align="right">Catalogue lines</Th>
              <Th align="right">Units</Th>
              <Th align="right">Retail ex VAT</Th>
              <Th align="right">Trade value</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} style={row.included ? undefined : { background: '#FCFBF9' }}>
                <Td>
                  <input
                    type="checkbox"
                    style={{ width: 16, height: 16, cursor: 'pointer' }}
                    checked={row.included === true}
                    onChange={(event) => onToggleCategory?.(row.key, event.target.checked)}
                    aria-label={`Count ${row.label} in the forecast`}
                  />
                </Td>
                <Td>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, color: BRAND.text }}>{row.label}</span>
                    {!row.included && <Pill tone="neutral">Not in forecast</Pill>}
                    {row.overridden && row.included && <Pill tone="info">Set by admin</Pill>}
                  </div>
                </Td>
                <Td align="right" mono>{formatNumber(row.lineCount)}</Td>
                <Td align="right" mono>{formatNumber(row.units)}</Td>
                <Td align="right" mono>{money(row.retail, currency)}</Td>
                <Td align="right" mono>{money(row.trade, currency)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}