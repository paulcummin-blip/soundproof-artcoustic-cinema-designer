// ProjectSelectionTable.jsx
// -------------------------
// One row per Project. Projects are never duplicated by their versions.
//
// Inclusion and the counted version are admin choices held as local report
// selection; nothing here writes to the database.

import React from 'react';
import { BRAND, Pill, TABLE, TABLE_WRAP, Td, Th } from './IntelligenceUi';
import { formatMoney, formatNumber } from '@/lib/commercial/projectReporting/formatMoney';
import { BUCKET_LABEL } from '@/lib/commercial/projectReporting/statusBuckets';
import { formatProjectAge } from '@/lib/commercial/projectReporting/projectSelection';
import CountedVersionSelect from './CountedVersionSelect';

const CHECKBOX = { width: 16, height: 16, cursor: 'pointer' };

const statusTone = (bucket) => {
  if (bucket === 'live') return 'good';
  if (bucket === 'completed') return 'info';
  if (bucket === 'lost') return 'bad';
  if (bucket === 'unclassified') return 'warn';
  return 'neutral';
};

function flagsOf(family) {
  const flags = [];
  if (family.selection?.inclusionPill) flags.push(family.selection.inclusionPill);
  for (const warning of family.warnings || []) flags.push(warning);
  if (family.selection?.countBasisNote) flags.push(family.selection.countBasisNote);
  return flags;
}

export default function ProjectSelectionTable({
  families = [],
  currency,
  onToggleInclude,
  onCountedChange,
}) {
  return (
    <div style={TABLE_WRAP}>
      <table style={TABLE}>
        <thead>
          <tr>
            <Th width={64}>Include</Th>
            <Th>Project</Th>
            <Th>Client</Th>
            <Th>Dealer / account</Th>
            <Th>Status</Th>
            <Th>Age</Th>
            <Th align="right">Versions</Th>
            <Th>Counted version</Th>
            <Th>Count basis</Th>
            <Th align="right">Live value</Th>
            <Th align="right">Product lines</Th>
            <Th>Notes / flags</Th>
          </tr>
        </thead>
        <tbody>
          {families.map((family) => {
            const selection = family.selection || {};
            const flags = flagsOf(family);
            return (
              <tr key={family.id} style={family.included ? undefined : { background: '#FCFBF9' }}>
                <Td>
                  <input
                    type="checkbox"
                    style={CHECKBOX}
                    checked={family.included === true}
                    onChange={(event) => onToggleInclude?.(family.id, event.target.checked)}
                    aria-label={`Include ${family.name} in the business report`}
                  />
                </Td>
                <Td>
                  <div style={{ fontWeight: 600, color: BRAND.text }}>{family.name}</div>
                  {family.reference && (
                    <div style={{ fontSize: 11, color: BRAND.muted }}>{family.reference}</div>
                  )}
                </Td>
                <Td>{family.client || '—'}</Td>
                <Td>{family.dealerName || family.accountName || '—'}</Td>
                <Td>
                  <Pill tone={statusTone(family.bucket)}>{BUCKET_LABEL[family.bucket] || family.bucket || '—'}</Pill>
                </Td>
                <Td title={family.updatedDate || family.createdDate || ''}>
                  {formatProjectAge(family.updatedDate || family.createdDate)}
                </Td>
                <Td align="right" mono>{formatNumber(family.variationCount || 0)}</Td>
                <Td>
                  <CountedVersionSelect
                    family={family}
                    onChange={(value) => onCountedChange?.(family.id, value)}
                  />
                </Td>
                <Td>
                  <div style={{ fontSize: 12 }}>{selection.countBasisLabel || '—'}</div>
                  {selection.countedIsActive === false && family.variationCount > 1 && (
                    <div style={{ fontSize: 11, color: BRAND.muted }}>not the active version</div>
                  )}
                </Td>
                <Td align="right" mono>
                  {family.countedLiveValue === null || family.countedLiveValue === undefined
                    ? <Pill tone="warn">not calculable</Pill>
                    : formatMoney(family.countedLiveValue, family.countedCurrency || currency || 'GBP')}
                </Td>
                <Td align="right" mono>
                  {formatNumber(family.countedLineCount || 0)}
                  {family.selection?.countedUnpricedLineCount > 0 && (
                    <span style={{ color: BRAND.warn }}> ({family.selection.countedUnpricedLineCount} unpriced)</span>
                  )}
                </Td>
                <Td>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {flags.length === 0 && <span style={{ fontSize: 12, color: BRAND.muted }}>—</span>}
                    {flags.slice(0, 2).map((flag) => (
                      <Pill
                        key={flag}
                        tone={flag.startsWith('Excluded') ? 'warn' : (flag.startsWith('Included') ? 'good' : 'neutral')}
                        title={flags.join('; ')}
                      >
                        {flag}
                      </Pill>
                    ))}
                    {flags.length > 2 && (
                      <Pill tone="neutral" title={flags.join('; ')}>+{flags.length - 2}</Pill>
                    )}
                  </div>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}