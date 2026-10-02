// VariationCountTable.jsx
// -----------------------
// Every design version of every project, clearly marked counted or not, so the
// admin can see the options exist without them inflating product demand.

import React from 'react';
import { BRAND, Pill, TABLE, TABLE_WRAP, Td, Th } from './IntelligenceUi';
import { formatMoney, formatNumber } from '@/lib/commercial/projectReporting/formatMoney';

export default function VariationCountTable({ rows = [], currency }) {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ fontSize: 12, color: BRAND.muted, lineHeight: 1.6 }}>
        One row per design version. Only the counted version of an included project feeds product demand; every other
        version is listed as an option and never counted.
      </div>

      <div style={TABLE_WRAP}>
        <table style={TABLE}>
          <thead>
            <tr>
              <Th>Project</Th>
              <Th>Version</Th>
              <Th align="right">No.</Th>
              <Th>Active</Th>
              <Th>Counted</Th>
              <Th align="right">Live value</Th>
              <Th align="right">Product lines</Th>
              <Th>Counted status</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.projectId}:${row.versionId}`} style={row.counted ? undefined : { background: '#FCFBF9' }}>
                <Td>
                  <div style={{ fontWeight: 600, color: BRAND.text }}>{row.project}</div>
                  {!row.included && (
                    <div style={{ marginTop: 3 }}>
                      <Pill tone="warn">Excluded project</Pill>
                    </div>
                  )}
                </Td>
                <Td>{row.versionName || `Version ${row.versionNumber ?? '?'}`}</Td>
                <Td align="right" mono>{row.versionNumber ?? '—'}</Td>
                <Td>{row.isActive ? <Pill tone="info">Active</Pill> : '—'}</Td>
                <Td>{row.counted ? <Pill tone="good">Yes</Pill> : <Pill tone="neutral">No</Pill>}</Td>
                <Td align="right" mono>
                  {row.liveValue === null || row.liveValue === undefined
                    ? <Pill tone="warn">not calculable</Pill>
                    : formatMoney(row.liveValue, row.currency || currency || 'GBP')}
                </Td>
                <Td align="right" mono>{formatNumber(row.productLineCount || 0)}</Td>
                <Td>
                  <span style={{ fontSize: 12, color: row.counted ? BRAND.good : BRAND.muted }}>
                    {row.countedNote}
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}