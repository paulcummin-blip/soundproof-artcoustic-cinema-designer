// DuplicatesPanel.jsx
// ------------------
// Advisory list of possible duplicate commercial project families. Nothing is
// merged, grouped or written: this is a list for an admin to review.

import React from 'react';
import { EmptyState, Pill, TABLE, TABLE_WRAP, Td, Th } from './IntelligenceUi';

export default function DuplicatesPanel({ duplicates, onViewVariations, familiesById }) {
  const rows = duplicates || [];

  if (rows.length === 0) {
    return <EmptyState message="No possible duplicates detected in the current selection." hint="Detection uses conservative signals: same account, similar names, references, creation date and room dimensions." />;
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ fontSize: 12, color: '#6B6B66' }}>
        Advisory only. No projects are merged, grouped or changed by this report.
      </div>
      <div style={TABLE_WRAP}>
        <table style={TABLE}>
          <thead>
            <tr>
              <Th>Project A</Th>
              <Th>Project B</Th>
              <Th>Dealer / account</Th>
              <Th>Signals</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {rows.map((pair) => (
              <tr key={`${pair.aId}-${pair.bId}`}>
                <Td>
                  <div style={{ fontWeight: 600, color: '#1B1A1A' }}>{pair.aName}</div>
                  <div style={{ fontSize: 11, color: '#6B6B66' }}>{pair.aClient || '—'}</div>
                </Td>
                <Td>
                  <div style={{ fontWeight: 600, color: '#1B1A1A' }}>{pair.bName}</div>
                  <div style={{ fontSize: 11, color: '#6B6B66' }}>{pair.bClient || '—'}</div>
                </Td>
                <Td>{pair.accountName || '—'}</Td>
                <Td>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {pair.signals.map((signal) => <Pill key={signal} tone="info">{signal}</Pill>)}
                  </div>
                </Td>
                <Td>
                  <div style={{ display: 'flex', gap: 10 }}>
                    {[pair.aId, pair.bId].map((id) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => onViewVariations(familiesById?.get(id))}
                        disabled={!familiesById?.get(id)}
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
                        Variations
                      </button>
                    ))}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}