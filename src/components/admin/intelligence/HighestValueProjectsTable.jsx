// HighestValueProjectsTable.jsx
// -----------------------------
// The highest-value Project families. One row is one project: the variation
// count and active version are shown as facts about that project, never as
// additional commercial projects.

import React from 'react';
import { EmptyState, TABLE, TABLE_WRAP, Td, Th, Pill } from './IntelligenceUi';
import { formatDate } from '@/lib/commercial/projectReporting/formatMoney';
import { LiveValueCell, QuotedValueCell } from './ProjectValueCells';
import WarningFlags from './WarningFlags';
import bucketTone from './bucketTone';

export default function HighestValueProjectsTable({ families, valueBasis, onViewVariations, limit = 15 }) {
  const showLive = valueBasis !== 'quoted';
  const showQuoted = valueBasis !== 'live';
  const rows = (families || []).slice(0, limit);

  if (rows.length === 0) {
    return <EmptyState message="No projects match the current filters." />;
  }

  return (
    <div style={TABLE_WRAP}>
      <table style={TABLE}>
        <thead>
          <tr>
            <Th>Project / client</Th>
            <Th>Dealer</Th>
            <Th>Bucket</Th>
            <Th>Raw status</Th>
            <Th align="right">Variations</Th>
            <Th>Active version</Th>
            {showLive && <Th align="right">Live design value</Th>}
            {showQuoted && <Th align="right">Latest quoted snapshot</Th>}
            <Th>Created</Th>
            <Th>Last updated</Th>
            <Th>Warning flags</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {rows.map((family) => (
            <tr key={family.id}>
              <Td>
                <div style={{ fontWeight: 600, color: '#1B1A1A' }}>{family.name}</div>
                <div style={{ fontSize: 11, color: '#6B6B66' }}>{family.client || '—'}{family.reference ? ` · ${family.reference}` : ''}</div>
              </Td>
              <Td>{family.dealerName || '—'}</Td>
              <Td><Pill tone={bucketTone(family.bucket)}>{family.rawStatusLabel || family.bucket}</Pill></Td>
              <Td>{family.rawStatusId || '—'}</Td>
              <Td align="right" mono>{family.variationCount}</Td>
              <Td>{family.activeVersionName || '—'}</Td>
              {showLive && <Td align="right" mono><LiveValueCell family={family} /></Td>}
              {showQuoted && <Td align="right" mono><QuotedValueCell family={family} /></Td>}
              <Td>{formatDate(family.createdDate)}</Td>
              <Td>{formatDate(family.updatedDate)}</Td>
              <Td><WarningFlags warnings={family.warnings} /></Td>
              <Td>
                <button
                  type="button"
                  onClick={() => onViewVariations(family)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: '#213428',
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    padding: 0,
                  }}
                >
                  View variations
                </button>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}