// TrendSummaryTable.jsx
// ---------------------
// The rolling 90-day period table for the Trends view: plain Artcoustic retail
// and trade numbers per period, newest first. Presentation only.

import React from 'react';
import { BRAND, EmptyState, TABLE, TABLE_WRAP, Td, Th } from './IntelligenceUi';
import { formatMoney, formatNumber } from '@/lib/commercial/projectReporting/formatMoney';

export default function TrendSummaryTable({ windows = [], currency }) {
  if (windows.length === 0) {
    return <EmptyState message="No rolling periods to report yet." />;
  }

  return (
    <div style={TABLE_WRAP}>
      <table style={TABLE}>
        <thead>
          <tr>
            <Th>Period</Th>
            <Th align="right">Forecast projects</Th>
            <Th align="right">Artcoustic retail</Th>
            <Th align="right">Artcoustic trade</Th>
            <Th align="right">Avg trade / project</Th>
            <Th align="right">Catalogue units</Th>
            <Th align="right">Active dealers / accounts</Th>
          </tr>
        </thead>
        <tbody>
          {windows.map((row, index) => (
            <tr key={row.key} style={index === 0 ? { background: BRAND.goodBg } : undefined}>
              <Td>
                <div style={{ fontWeight: 600, color: BRAND.text }}>{row.label}</div>
                {index === 0 && <div style={{ fontSize: 11, color: BRAND.good }}>Rolling 90 days to today</div>}
              </Td>
              <Td align="right" mono>{formatNumber(row.projects)}</Td>
              <Td align="right" mono>
                {row.retail === null ? 'Not calculable' : formatMoney(row.retail, row.currency || currency || 'GBP')}
              </Td>
              <Td align="right" mono>
                {row.trade === null ? '—' : formatMoney(row.trade, row.currency || currency || 'GBP')}
              </Td>
              <Td align="right" mono>
                {row.averageTrade === null ? '—' : formatMoney(row.averageTrade, row.currency || currency || 'GBP')}
              </Td>
              <Td align="right" mono>{formatNumber(row.units)}</Td>
              <Td align="right" mono>{formatNumber(row.activeAccounts)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}