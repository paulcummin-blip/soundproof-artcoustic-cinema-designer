// ProjectFamilyTable.jsx
// ---------------------
// One row per Project. The variation count and active version describe the
// project; variations themselves are only ever listed in the variation drawer
// and the Variations Detail export.

import React from 'react';
import { EmptyState, TABLE, TABLE_WRAP, Td, Th, Pill } from './IntelligenceUi';
import { formatDate } from '@/lib/commercial/projectReporting/formatMoney';
import { LiveValueCell, QuotedValueCell } from './ProjectValueCells';
import WarningFlags from './WarningFlags';
import bucketTone from './bucketTone';

export default function ProjectFamilyTable({ families, valueBasis, onViewVariations }) {
  const showLive = valueBasis !== 'quoted';
  const showQuoted = valueBasis !== 'live';

  if (!families || families.length === 0) {
    return <EmptyState message="No projects match the current filters." />;
  }

  return (
    <div style={TABLE_WRAP}>
      <table style={TABLE}>
        <thead>
          <tr>
            <Th>Project name</Th>
            <Th>Client</Th>
            <Th>Reference</Th>
            <Th>Dealer / account</Th>
            <Th>Bucket</Th>
            <Th>Raw status</Th>
            <Th>Lifecycle</Th>
            <Th align="right">Variations</Th>
            <Th>Active version</Th>
            {showLive && <Th align="right">Live design value</Th>}
            {showQuoted && <Th align="right">Latest quoted snapshot</Th>}
            <Th align="right">Product lines</Th>
            <Th align="right">Unpriced lines</Th>
            <Th>Created</Th>
            <Th>Last updated</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {families.map((family) => (
            <tr key={family.id}>
              <Td>
                <div style={{ fontWeight: 600, color: '#1B1A1A' }}>{family.name}</div>
                <div style={{ marginTop: 4 }}><WarningFlags warnings={family.warnings} limit={2} /></div>
              </Td>
              <Td>{family.client || '—'}</Td>
              <Td>{family.reference || '—'}</Td>
              <Td>{family.dealerName || '—'}</Td>
              <Td><Pill tone={bucketTone(family.bucket)}>{family.rawStatusLabel || family.bucket}</Pill></Td>
              <Td>{family.rawStatusId || '—'}</Td>
              <Td>{family.lifecycleStatus}</Td>
              <Td align="right" mono>{family.variationCount}</Td>
              <Td>
                {family.activeVersionName || '—'}
                {family.activeVersionNumber ? <span style={{ color: '#6B6B66' }}> · V{family.activeVersionNumber}</span> : null}
              </Td>
              {showLive && <Td align="right" mono><LiveValueCell family={family} /></Td>}
              {showQuoted && <Td align="right" mono><QuotedValueCell family={family} /></Td>}
              <Td align="right" mono>{family.productLineCount}</Td>
              <Td align="right" mono>{family.unpricedLineCount > 0
                ? <Pill tone="warn">{family.unpricedLineCount}</Pill>
                : family.unpricedLineCount}</Td>
              <Td>{formatDate(family.createdDate)}</Td>
              <Td>{formatDate(family.updatedDate)}</Td>
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