// StatusBreakdownTable.jsx
// -----------------------
// Count and value by canonical bucket. Values respect the selected value basis,
// and in Show Both the live and quoted columns are separate — never summed.

import React from 'react';
import { BRAND, EmptyState, TABLE, TABLE_WRAP, Td, Th } from './IntelligenceUi';
import { formatMoney, formatNumber } from '@/lib/commercial/projectReporting/formatMoney';

export default function StatusBreakdownTable({ buckets, valueBasis, quoteCurrency }) {
  const showLive = valueBasis !== 'quoted';
  const showQuoted = valueBasis !== 'live';
  const rows = (buckets || []).filter((row) => row.count > 0 || showLive || showQuoted);

  if (rows.length === 0) {
    return <EmptyState message="No projects match the current filters." />;
  }

  return (
    <div style={TABLE_WRAP}>
      <table style={TABLE}>
        <thead>
          <tr>
            <Th>Canonical status bucket</Th>
            <Th align="right">Projects</Th>
            <Th align="right">Design variations</Th>
            {showLive && <Th align="right">Live design value</Th>}
            {showQuoted && <Th align="right">Quoted snapshot value</Th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.bucket}>
              <Td>
                <span style={{ fontWeight: 600, color: BRAND.text }}>{row.label}</span>
              </Td>
              <Td align="right" mono>{formatNumber(row.count)}</Td>
              <Td align="right" mono>{formatNumber(row.variations)}</Td>
              {showLive && (
                <Td align="right" mono>
                  {row.liveValue === null ? '—' : formatMoney(row.liveValue, row.liveCurrency || quoteCurrency || 'GBP')}
                </Td>
              )}
              {showQuoted && (
                <Td align="right" mono>
                  {row.quotedValue === null ? '—' : formatMoney(row.quotedValue, row.quotedCurrency || quoteCurrency || 'GBP')}
                </Td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}