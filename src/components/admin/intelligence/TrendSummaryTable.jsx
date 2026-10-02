// TrendSummaryTable.jsx
// ---------------------
// The rolling 90-day period table for the Trends view: plain numbers per period,
// newest first. Presentation only.

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
            <Th align="right">Projects</Th>
            <Th align="right">Total live value</Th>
            <Th align="right">Average value</Th>
            <Th align="right">Catalogue units</Th>
            <Th align="right">Average units / project</Th>
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
                {row.totalLiveValue === null ? 'Not calculable' : formatMoney(row.totalLiveValue, row.currency || currency || 'GBP')}
              </Td>
              <Td align="right" mono>
                {row.averageValue === null ? '—' : formatMoney(row.averageValue, row.currency || currency || 'GBP')}
              </Td>
              <Td align="right" mono>{formatNumber(row.units)}</Td>
              <Td align="right" mono>
                {row.averageUnitsPerProject === null ? '—' : row.averageUnitsPerProject.toFixed(1)}
              </Td>
              <Td align="right" mono>{formatNumber(row.activeAccounts)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}