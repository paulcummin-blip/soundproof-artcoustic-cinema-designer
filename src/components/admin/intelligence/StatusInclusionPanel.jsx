// StatusInclusionPanel.jsx
// ------------------------
// "Statuses included in forecast" — every resolved status present in the loaded
// projects, including the statuses a dealer has created for themselves, with the
// money behind each one.
//
// Won, completed, lost and cancelled statuses are left out by default and an
// unclassified status is included with a review flag. The admin can override any
// line, and every total on the page follows immediately.
//
// Presentation only: the rows and their defaults come from the statusInclusion
// authority.

import React from 'react';
import { BRAND, Card, EmptyState, Pill, TABLE, TABLE_WRAP, Td, Th } from './IntelligenceUi';
import { formatMoney, formatNumber } from '@/lib/commercial/projectReporting/formatMoney';
import { STATUS_REVIEW_PILL } from '@/lib/commercial/projectReporting/statusInclusion';

const money = (value, currency) => (
  value === null || value === undefined ? '—' : formatMoney(value, currency || 'GBP')
);

export default function StatusInclusionPanel({
  rows = [],
  currency,
  onToggleStatus,
  onResetStatuses,
}) {
  if (rows.length === 0) {
    return (
      <Card title="Statuses included in forecast">
        <EmptyState message="No project statuses to report." />
      </Card>
    );
  }

  const includedCount = rows.filter((row) => row.included).length;

  return (
    <Card
      title="Statuses included in forecast"
      subtitle={`${formatNumber(includedCount)} of ${formatNumber(rows.length)} statuses counted. Won, completed, lost and cancelled statuses are excluded by default; tick or untick any status and every total on this page updates immediately.`}
      actions={(
        <button
          type="button"
          onClick={onResetStatuses}
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
          Reset statuses to defaults
        </button>
      )}
    >
      <div style={TABLE_WRAP}>
        <table style={TABLE}>
          <thead>
            <tr>
              <Th>Include</Th>
              <Th>Status</Th>
              <Th>Canonical bucket</Th>
              <Th align="right">Projects</Th>
              <Th align="right">Trade value</Th>
              <Th>Notes</Th>
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
                    onChange={(event) => onToggleStatus?.(row.key, event.target.checked)}
                    aria-label={`Count projects with status ${row.label} in the forecast`}
                  />
                </Td>
                <Td>
                  <div style={{ fontWeight: 600, color: BRAND.text }}>{row.label}</div>
                </Td>
                <Td>{row.bucketLabel}</Td>
                <Td align="right" mono>{formatNumber(row.count)}</Td>
                <Td align="right" mono>{money(row.trade, currency)}</Td>
                <Td>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {row.review && <Pill tone="warn" title="This status is not a recognised commercial stage, so it is included by default. Untick it to leave it out.">{STATUS_REVIEW_PILL}</Pill>}
                    {row.overridden && <Pill tone="info" title="Set by hand, so the default no longer applies">Set by admin</Pill>}
                    {!row.included && <Pill tone="neutral" title={`Excluded by default: ${row.defaultSource}`}>Not in forecast</Pill>}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}