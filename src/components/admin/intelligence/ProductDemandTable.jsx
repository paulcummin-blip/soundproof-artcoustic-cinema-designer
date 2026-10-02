// ProductDemandTable.jsx
// ----------------------
// Product demand from the counted version of every included project, and
// nothing else: no excluded project and no non-counted version contributes.
//
// Each row can be expanded to show which included projects produced the
// quantity.

import React, { useState } from 'react';
import { BRAND, EmptyState, Pill, TABLE, TABLE_WRAP, Td, Th } from './IntelligenceUi';
import { formatMoney, formatNumber } from '@/lib/commercial/projectReporting/formatMoney';

export default function ProductDemandTable({ productDemand = [], currency, projectNamesById }) {
  const [openKey, setOpenKey] = useState(null);

  if (productDemand.length === 0) {
    return (
      <EmptyState
        message="No product demand for the current selection."
        hint="Include at least one project, then demand is read from the priced lines of its counted version."
      />
    );
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ fontSize: 12, color: BRAND.muted, lineHeight: 1.6 }}>
        Aggregated from the counted version of each included project only. One project contributes one version, however
        many design options exist. Derived lines (subwoofer amplifier, Abfuser treatment, manual items) are marked, and a
        line with no price is shown as <strong>Unpriced</strong> rather than zero.
      </div>

      <div style={TABLE_WRAP}>
        <table style={TABLE}>
          <thead>
            <tr>
              <Th>Product / model</Th>
              <Th>SKU</Th>
              <Th>Category</Th>
              <Th align="right">Quantity</Th>
              <Th align="right">Included projects using it</Th>
              <Th align="right">Total live value</Th>
              <Th>Derived line</Th>
              <Th>Priced</Th>
            </tr>
          </thead>
          <tbody>
            {productDemand.map((row) => {
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
                    <Td align="right" mono>
                      {formatNumber(row.quantity)}
                      {row.quotedQuantity > 0 && <span style={{ color: BRAND.muted }}> (+{formatNumber(row.quotedQuantity)} quoted)</span>}
                    </Td>
                    <Td align="right" mono>{formatNumber(row.projectFamilies)}</Td>
                    <Td align="right" mono>
                      {row.liveValue === null ? <Pill tone="warn">unpriced</Pill> : formatMoney(row.liveValue, currency || 'GBP')}
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
                      <Td colSpan={8} style={{ background: '#FAFAF8' }}>
                        <div style={{ fontSize: 12, color: BRAND.subtext }}>
                          <strong>Included projects contributing:</strong>{' '}
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