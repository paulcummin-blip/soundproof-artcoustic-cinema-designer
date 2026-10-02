// ProjectSelectionTable.jsx
// -------------------------
// One row per Project. Projects are never duplicated by their versions.
//
// Inclusion and the counted version are admin choices held as local report
// selection; nothing here writes to the database.
//
// Included, Age, Last updated, Counted version and Artcoustic retail sort on
// click. The retail column is the Artcoustic catalogue value of the counted
// version — overall project value is not shown, because this page forecasts
// Artcoustic product business.
// Sorting is display order only: it never changes a value or an inclusion choice,
// and with no heading chosen the reporting order is shown untouched.

import React, { useMemo, useState } from 'react';
import { BRAND, Pill, TABLE, TABLE_WRAP, Td, Th } from './IntelligenceUi';
import SortableTh from './SortableTh';
import { formatDate, formatMoney, formatNumber } from '@/lib/commercial/projectReporting/formatMoney';
import { BUCKET_LABEL } from '@/lib/commercial/projectReporting/statusBuckets';
import { formatProjectAge } from '@/lib/commercial/projectReporting/projectSelection';
import { ageBasisSentence } from '@/lib/commercial/projectReporting/pipelineAge';
import {
  DEFAULT_PROJECT_SORT,
  PROJECT_SORT_COLUMNS,
  nextProjectSort,
  projectSortIndicator,
  resolveProjectSort,
  sortProjectFamilies,
} from '@/lib/commercial/projectReporting/projectSort';
import CountedVersionSelect from './CountedVersionSelect';

const CHECKBOX = { width: 16, height: 16, cursor: 'pointer' };

const sortColumn = (key) => PROJECT_SORT_COLUMNS.find((column) => column.key === key);

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
  if (family.forecastExclusionPill) flags.push(family.forecastExclusionPill);
  for (const warning of family.warnings || []) flags.push(warning);
  if (family.selection?.countBasisNote) flags.push(family.selection.countBasisNote);
  return flags;
}

export default function ProjectSelectionTable({
  families = [],
  currency,
  onToggleInclude,
  onCountedChange,
  sort,
  onSortChange,
}) {
  const [localSort, setLocalSort] = useState(DEFAULT_PROJECT_SORT);
  // Controlled by the page when a sort is supplied, and self-contained otherwise.
  const activeSort = resolveProjectSort(sort || localSort);

  const rows = useMemo(
    () => sortProjectFamilies(families, activeSort),
    [families, activeSort.key, activeSort.direction],
  );

  const handleSort = (columnKey) => {
    const next = nextProjectSort(activeSort, columnKey);
    if (onSortChange) onSortChange(next);
    else setLocalSort(next);
  };

  const sortable = (key, fallbackLabel) => {
    const column = sortColumn(key);
    return (
      <SortableTh
        label={column?.label || fallbackLabel}
        columnKey={key}
        align={column?.align || 'left'}
        hint={column?.hint}
        activeKey={activeSort.key}
        direction={activeSort.direction}
        indicator={projectSortIndicator(activeSort, key)}
        onSort={handleSort}
      />
    );
  };

  return (
    <div style={TABLE_WRAP}>
      <table style={TABLE}>
        <thead>
          <tr>
            {sortable('included', 'Include')}
            <Th>Project</Th>
            <Th>Client</Th>
            <Th>Dealer / account</Th>
            <Th>Status</Th>
            {sortable('age', 'Age')}
            {sortable('updated', 'Last updated')}
            <Th align="right">Versions</Th>
            {sortable('countedVersion', 'Counted version')}
            <Th>Count basis</Th>
            {sortable('liveValue', 'Artcoustic retail')}
            <Th align="right">Product lines</Th>
            <Th>Notes / flags</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((family) => {
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
                <Td title={ageBasisSentence(family)}>
                  {formatProjectAge(family.updatedDate || family.createdDate)}
                </Td>
                <Td title={ageBasisSentence(family)}>
                  <div>{formatDate(family.updatedDate || family.createdDate)}</div>
                  <div style={{ fontSize: 11, color: BRAND.muted }}>
                    {family.updatedDate ? 'Last updated' : (family.createdDate ? 'Created' : 'No date recorded')}
                  </div>
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
                  {family.artcousticRetail === null || family.artcousticRetail === undefined
                    ? <Pill tone="warn">no catalogue value</Pill>
                    : formatMoney(family.artcousticRetail, family.countedCurrency || currency || 'GBP')}
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