// ProductDemandTab.jsx
// -------------------
// Aggregated product demand, built from the same priced line output the pricing
// engine produces (plus the frozen proposal snapshot lines for the quoted
// column). Unpriced and inactive products stay visible and are never zeroed.

import React from 'react';
import { BRAND, EmptyState, Pill, TABLE, TABLE_WRAP, Td, Th } from './IntelligenceUi';
import { formatMoney, formatNumber } from '@/lib/commercial/projectReporting/formatMoney';

export default function ProductDemandTab({ productDemand, currency, quotedCurrency }) {
  const rows = productDemand || [];

  if (rows.length === 0) {
    return <EmptyState message="No product demand for the current filters." hint="Demand is read from the priced lines of each project's active version." />;
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ fontSize: 12, color: BRAND.muted, lineHeight: 1.6 }}>
        Aggregated from the same priced schedule the pricing engine produces for each project's active version, plus the frozen
        proposal snapshot lines for the quoted column. Derived lines (subwoofer amplifier, Abfuser treatment, manual items) are
        marked. A line with no price is shown as <strong>Unpriced</strong> and is never treated as zero.
      </div>

      <div style={TABLE_WRAP}>
        <table style={TABLE}>
          <thead>
            <tr>
              <Th>SKU</Th>
              <Th>Product / model</Th>
              <Th>Category</Th>
              <Th align="right">Qty</Th>
              <Th align="right">Project families</Th>
              <Th align="right">Prospective / Pending</Th>
              <Th align="right">Live / Open</Th>
              <Th align="right">Completed / Won</Th>
              <Th align="right">Lost</Th>
              <Th align="right">Live design value</Th>
              <Th align="right">Quoted snapshot value</Th>
              <Th>Derived</Th>
              <Th>Priced</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.sku || row.product}>
                <Td mono>{row.sku || '—'}</Td>
                <Td>{row.product}</Td>
                <Td>{row.category || '—'}</Td>
                <Td align="right" mono>{formatNumber(row.quantity)}{row.quotedQuantity > 0 ? <span style={{ color: BRAND.muted }}> +{row.quotedQuantity} quoted</span> : null}</Td>
                <Td align="right" mono>{formatNumber(row.projectFamilies)}</Td>
                <Td align="right" mono>{formatNumber(row.qtyByBucket.prospective)}</Td>
                <Td align="right" mono>{formatNumber(row.qtyByBucket.live)}</Td>
                <Td align="right" mono>{formatNumber(row.qtyByBucket.completed)}</Td>
                <Td align="right" mono>{formatNumber(row.qtyByBucket.lost)}</Td>
                <Td align="right" mono>
                  {row.liveValue === null ? <Pill tone="warn">unpriced</Pill> : formatMoney(row.liveValue, currency || 'GBP')}
                </Td>
                <Td align="right" mono>
                  {row.quotedValue === null ? '—' : formatMoney(row.quotedValue, quotedCurrency || currency || 'GBP')}
                </Td>
                <Td>{row.derived ? <Pill tone="info">Yes</Pill> : 'No'}</Td>
                <Td>
                  <Pill tone={row.status === 'Priced' ? 'good' : (row.status === 'Inactive' ? 'bad' : 'warn')}>{row.status}</Pill>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}