// ExcludedHistoricAbfusers.jsx
// ----------------------------
// The optional audit section for Product Demand: the Abfuser quantity and value
// that the reporting cutoff left out because the counted version is dated before
// 1 Oct 2026.
//
// Transparency only. These quantities never contribute to the Abfuser demand row
// or to any demand or value total, and this rule touches Product Demand alone —
// project pricing, proposal pricing and the design data itself are unchanged.
//
// Collapsed by default, so it stays a secondary view.

import React, { useState } from 'react';
import { BRAND, TABLE, TABLE_WRAP, Td, Th } from './IntelligenceUi';
import { formatMoney, formatNumber } from '@/lib/commercial/projectReporting/formatMoney';

export default function ExcludedHistoricAbfusers({ abfuserExclusions = [], currency = 'GBP' }) {
  const [open, setOpen] = useState(false);

  if (abfuserExclusions.length === 0) return null;

  const totalQuantity = abfuserExclusions.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);
  const totalValue = abfuserExclusions.reduce((sum, row) => sum + (Number(row.value) || 0), 0);

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
          {open ? '▾' : '▸'} Excluded historic Abfuser lines ({formatNumber(abfuserExclusions.length)})
        </button>
        <span style={{ fontSize: 12, color: BRAND.muted }}>
          Outside Product Demand. Excluded because the counted version predates 1 Oct 2026.
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
                  <Th>Version/project date used</Th>
                  <Th align="right">Excluded quantity</Th>
                  <Th align="right">Excluded value</Th>
                  <Th>Reason</Th>
                </tr>
              </thead>
              <tbody>
                {abfuserExclusions.map((row, index) => (
                  <tr key={`${row.projectId}|${row.countedVersion}|${row.dateLabel}|${index}`}>
                    <Td>{row.project || '—'}</Td>
                    <Td>{row.countedVersion || '—'}</Td>
                    <Td>{row.dateLabel || '—'}</Td>
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
                  <Td>Before 1 Oct 2026</Td>
                  <Td align="right" mono style={{ fontWeight: 700 }}>{formatNumber(totalQuantity)}</Td>
                  <Td align="right" mono style={{ fontWeight: 700 }}>{formatMoney(totalValue, currency)}</Td>
                  <Td>—</Td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div style={{ fontSize: 12, color: BRAND.muted }}>
            {formatNumber(totalQuantity)} historic Abfuser unit{totalQuantity === 1 ? '' : 's'} worth{' '}
            {formatMoney(totalValue, currency)} are left out of the catalogue totals above. The rule affects Product
            Demand only: the projects, their design versions and their pricing are untouched.
          </div>
        </div>
      )}
    </div>
  );
}