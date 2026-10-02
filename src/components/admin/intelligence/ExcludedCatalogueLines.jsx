// ExcludedCatalogueLines.jsx
// --------------------------
// The optional audit section for Product Demand: the lines that were kept OUT
// of the Artcoustic catalogue demand, with the reason for each one.
//
// These lines are transparency only. They never contribute to product
// quantities or to value totals, and they are not part of Product Demand.
//
// Collapsed by default, so it stays a secondary view.

import React, { useState } from 'react';
import { BRAND, TABLE, TABLE_WRAP, Td, Th } from './IntelligenceUi';
import { formatMoney, formatNumber } from '@/lib/commercial/projectReporting/formatMoney';

export default function ExcludedCatalogueLines({ excludedLines = [], currency = 'GBP' }) {
  const [open, setOpen] = useState(false);

  if (excludedLines.length === 0) return null;

  const totalQuantity = excludedLines.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);
  const totalValue = excludedLines.reduce((sum, row) => sum + (Number(row.value) || 0), 0);

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => setOpen((previous) => !previous)}
          style={{
            border: `1px solid ${BRAND.border}`,
            background: BRAND.card,
            borderRadius: 8,
            padding: '6px 12px',
            fontSize: 13,
            fontWeight: 700,
            color: BRAND.text,
            cursor: 'pointer',
          }}
        >
          {open ? '▾' : '▸'} Excluded non-catalogue lines ({formatNumber(excludedLines.length)})
        </button>
        <span style={{ fontSize: 12, color: BRAND.muted }}>
          Outside Product Demand. These lines never affect product quantities or value totals.
        </span>
      </div>

      {open && (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={TABLE_WRAP}>
            <table style={TABLE}>
              <thead>
                <tr>
                  <Th>Project</Th>
                  <Th>Counted version</Th>
                  <Th>Manual line description</Th>
                  <Th align="right">Quantity</Th>
                  <Th align="right">Value</Th>
                  <Th>Reason excluded</Th>
                </tr>
              </thead>
              <tbody>
                {excludedLines.map((row, index) => (
                  <tr key={`${row.projectId}|${row.countedVersion}|${row.description}|${row.reason}|${index}`}>
                    <Td>{row.project || '—'}</Td>
                    <Td>{row.countedVersion || '—'}</Td>
                    <Td>
                      <span style={{ fontWeight: 600 }}>{row.description || row.sku || 'Manual item'}</span>
                      {row.sku && row.sku !== row.description ? (
                        <span style={{ color: BRAND.muted }}> · {row.sku}</span>
                      ) : null}
                    </Td>
                    <Td align="right" mono>{formatNumber(row.quantity)}</Td>
                    <Td align="right" mono>{formatMoney(row.value, currency)}</Td>
                    <Td>{row.reason}</Td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <Td style={{ fontWeight: 700 }}>Total excluded</Td>
                  <Td>—</Td>
                  <Td>Not included in Product Demand</Td>
                  <Td align="right" mono style={{ fontWeight: 700 }}>{formatNumber(totalQuantity)}</Td>
                  <Td align="right" mono style={{ fontWeight: 700 }}>{formatMoney(totalValue, currency)}</Td>
                  <Td>—</Td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div style={{ fontSize: 12, color: BRAND.muted }}>
            {formatNumber(totalQuantity)} line{totalQuantity === 1 ? '' : 's'} worth {formatMoney(totalValue, currency)} are
            excluded from the catalogue totals above. Manual extras and third-party items are excluded because Product
            Demand is Artcoustic product forecasting only.
          </div>
        </div>
      )}
    </div>
  );
}