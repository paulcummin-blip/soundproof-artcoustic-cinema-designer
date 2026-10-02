// WarningsPanel.jsx
// ----------------
// Everything that needs a human decision: unmapped dealer statuses, projects
// whose value cannot be calculated, unpriced lines, inactive products and
// possible duplicates. Nothing here is resolved silently.

import React from 'react';
import { BRAND, EmptyState, Pill, TABLE, TABLE_WRAP, Td, Th } from './IntelligenceUi';

const TYPE_LABELS = {
  unclassified_status: 'Unclassified status',
  unpriced_project: 'Unpriced project',
  inactive_product: 'Inactive product',
  possible_duplicate: 'Possible duplicate',
  no_quoted_value: 'No quoted snapshot',
};

const SEVERITY_TONES = { warning: 'warn', info: 'info' };

export default function WarningsPanel({ warnings }) {
  const rows = warnings || [];

  if (rows.length === 0) {
    return <EmptyState message="No warnings for the current selection." />;
  }

  const counts = rows.reduce((map, warning) => {
    const key = warning.type;
    map[key] = (map[key] || 0) + 1;
    return map;
  }, {});

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {Object.entries(counts).map(([type, count]) => (
          <Pill key={type} tone={type === 'no_quoted_value' ? 'info' : 'warn'}>
            {TYPE_LABELS[type] || type}: {count}
          </Pill>
        ))}
      </div>

      <div style={TABLE_WRAP}>
        <table style={TABLE}>
          <thead>
            <tr>
              <Th>Type</Th>
              <Th>Project / product</Th>
              <Th>Warning</Th>
              <Th>Detail</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((warning, index) => (
              <tr key={`${warning.type}-${warning.projectId || warning.projectName}-${index}`}>
                <Td>
                  <Pill tone={SEVERITY_TONES[warning.severity] || 'neutral'}>
                    {TYPE_LABELS[warning.type] || warning.type}
                  </Pill>
                </Td>
                <Td><span style={{ fontWeight: 600, color: BRAND.text }}>{warning.projectName || '—'}</span></Td>
                <Td>{warning.message}</Td>
                <Td style={{ color: BRAND.muted, fontSize: 12 }}>{warning.detail || '—'}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}