/**
 * DealerTable.jsx
 * ----------------
 * Compact, sortable dealer table for the Account Management view.
 *
 * Each dealer appears once. Columns: Dealer, Sector, Signals, Most relevant
 * observation, Follow-up status, Next contact date.
 *
 * Clicking a row expands an inline detail view showing all signals,
 * suggested questions, and follow-up controls.
 *
 * Client-side pagination supports 300+ accounts efficiently.
 */

import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, ChevronUp, Clock, ArrowUpRight } from 'lucide-react';
import { BRAND, Pill, Button, Th, Td, TABLE_WRAP, TABLE } from '@/components/admin/intelligence/IntelligenceUi';
import { formatDate, formatNumber } from '@/lib/commercial/projectReporting/formatMoney';
import { ACCOUNT_MANAGEMENT_THRESHOLDS, OPPORTUNITY_CATEGORIES, FILTER_KEYS } from '@/lib/commercial/designIntelligence/accountManagementConfig';
import { SECTOR_TABS } from '@/lib/commercial/designIntelligence/sectorScope';
import EnhancedDealerDetail from './EnhancedDealerDetail';

const PAGE_SIZE = ACCOUNT_MANAGEMENT_THRESHOLDS.dealerTablePageSize;

const CATEGORY_TONES = {
  [OPPORTUNITY_CATEGORIES.OVERLOOKED]: 'neutral',
  [OPPORTUNITY_CATEGORIES.NEEDS_ATTENTION]: 'warn',
  [OPPORTUNITY_CATEGORIES.EMERGING]: 'good',
  [OPPORTUNITY_CATEGORIES.NO_CURRENT_OPPORTUNITY]: 'neutral',
  [OPPORTUNITY_CATEGORIES.INSUFFICIENT_EVIDENCE]: 'neutral',
  [OPPORTUNITY_CATEGORIES.NO_OPPORTUNITY]: 'neutral',
};

const FOLLOWUP_STATUS_LABELS = {
  relevant: 'Relevant',
  dismissed: 'Dismissed',
  awaiting_follow_up: 'Awaiting',
};

const FOLLOWUP_STATUS_TONES = {
  relevant: 'good',
  dismissed: 'neutral',
  awaiting_follow_up: 'warn',
};

const COLUMNS = [
  { key: 'dealerName', label: 'Dealer', sortable: true },
  { key: 'opportunityCategory', label: 'Category', sortable: true },
  { key: 'signalLabels', label: 'Signals', sortable: false },
  { key: 'primaryObservation', label: 'Most relevant observation', sortable: false },
  { key: 'followUpDue', label: 'Follow-up', sortable: true },
  { key: 'nextContactDate', label: 'Next contact', sortable: true },
];

function sectorLabel(key) {
  const tab = SECTOR_TABS.find((t) => t.key === key);
  return tab ? tab.label : key || 'Unclassified';
}

export default function DealerTable({ dealers, categoryFilter, onLogFollowUp, onSelectDealer, onChangeCategory }) {
  const [sortKey, setSortKey] = useState('categoryPriority');
  const [sortDir, setSortDir] = useState('asc');
  const [expandedId, setExpandedId] = useState(null);
  const [page, setPage] = useState(0);

  // Filter dealers by the active category filter
  const filtered = useMemo(() => {
    if (!categoryFilter || categoryFilter === FILTER_KEYS.ALL) return dealers;
    if (categoryFilter === FILTER_KEYS.FOLLOW_UPS_DUE) {
      return dealers.filter((d) => d.followUpDue);
    }
    // Map filter key to opportunity category label
    const filterMap = {
      [FILTER_KEYS.OVERLOOKED]: OPPORTUNITY_CATEGORIES.OVERLOOKED,
      [FILTER_KEYS.NEEDS_ATTENTION]: OPPORTUNITY_CATEGORIES.NEEDS_ATTENTION,
      [FILTER_KEYS.EMERGING]: OPPORTUNITY_CATEGORIES.EMERGING,
    };
    const targetCategory = filterMap[categoryFilter];
    if (!targetCategory) return dealers;
    return dealers.filter((d) => d.opportunityCategory === targetCategory);
  }, [dealers, categoryFilter]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      let aVal, bVal;
      if (sortKey === 'categoryPriority') {
        aVal = a.categoryPriority;
        bVal = b.categoryPriority;
      } else if (sortKey === 'opportunityCategory') {
        aVal = a.opportunityCategory || 'zzz';
        bVal = b.opportunityCategory || 'zzz';
      } else if (sortKey === 'signalLabels') {
        aVal = (a.signalLabels || []).join(', ');
        bVal = (b.signalLabels || []).join(', ');
      } else if (sortKey === 'nextContactDate') {
        aVal = a.nextContactDate || '9999';
        bVal = b.nextContactDate || '9999';
      } else if (sortKey === 'followUpDue') {
        aVal = a.followUpDue ? 0 : 1;
        bVal = b.followUpDue ? 0 : 1;
      } else {
        aVal = String(a[sortKey] || '');
        bVal = String(b[sortKey] || '');
      }
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [dealers, sortKey, sortDir]);

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const pageStart = page * PAGE_SIZE;
  const pageDealers = sorted.slice(pageStart, pageStart + PAGE_SIZE);

  // Reset page when dealer count changes drastically
  React.useEffect(() => {
    if (page > 0 && pageStart >= sorted.length) setPage(0);
  }, [sorted.length, page, pageStart]);

  const handleSort = (key) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ colKey }) => {
    if (sortKey !== colKey) return <span style={{ width: 12, display: 'inline-block' }} />;
    return sortDir === 'asc'
      ? <ChevronUp size={11} style={{ display: 'inline-block', verticalAlign: 'middle' }} />
      : <ChevronDown size={11} style={{ display: 'inline-block', verticalAlign: 'middle' }} />;
  };

  return (
    <div style={TABLE_WRAP}>
      <table style={TABLE}>
        <thead>
          <tr>
            <Th width="28px"></Th>
            {COLUMNS.map((col) => (
              <Th key={col.key} align={col.key === 'nextContactDate' ? 'right' : 'left'}>
                {col.sortable ? (
                  <button
                    type="button"
                    onClick={() => handleSort(col.key)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      color: BRAND.accent,
                      padding: 0,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 2,
                    }}
                  >
                    {col.label} <SortIcon colKey={col.key} />
                  </button>
                ) : (
                  col.label
                )}
              </Th>
            ))}
            <Th width="28px"></Th>
          </tr>
        </thead>
        <tbody>
          {pageDealers.length === 0 && (
            <tr>
              <Td colSpan={COLUMNS.length + 2} align="center" style={{ padding: 24, color: BRAND.muted }}>
                {categoryFilter && categoryFilter !== FILTER_KEYS.ALL
                  ? 'No dealers match the selected opportunity filter in this sector.'
                  : 'No dealers in this sector.'}
              </Td>
            </tr>
          )}
          {pageDealers.map((dealer) => {
            const isExpanded = expandedId === dealer.accountId;
            return (
              <React.Fragment key={dealer.accountId}>
                <tr
                  onClick={() => setExpandedId(isExpanded ? null : dealer.accountId)}
                  style={{
                    cursor: 'pointer',
                    background: isExpanded ? '#F6F3EE' : 'transparent',
                    transition: 'background 0.15s',
                  }}
                >
                  <Td align="center" style={{ padding: '8px 4px' }}>
                    {isExpanded
                      ? <ChevronDown size={14} color={BRAND.muted} />
                      : <ChevronRight size={14} color={BRAND.muted} />}
                  </Td>
                  <Td>
                    <div style={{ fontWeight: 700, color: BRAND.text, fontSize: 13 }}>{dealer.dealerName}</div>
                    {dealer.territory && (
                      <div style={{ fontSize: 10, color: BRAND.muted }}>{dealer.territory}</div>
                    )}
                  </Td>
                  <Td>
                    <Pill tone="neutral">{sectorLabel(dealer.sectorKey)}</Pill>
                  </Td>
                  <Td>
                    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}>
                      <Pill tone={CATEGORY_TONES[dealer.opportunityCategory] || 'neutral'}>
                        {dealer.opportunityCategory}
                      </Pill>
                      <span style={{
                        fontSize: 9,
                        fontWeight: 600,
                        color: dealer.opportunitySource === 'manual' ? BRAND.warn : BRAND.muted,
                        textTransform: 'uppercase',
                        letterSpacing: '0.03em',
                      }}>
                        {dealer.opportunitySource === 'manual' ? 'M' : 'S'}
                      </span>
                      {dealer.followUpDue && (
                        <Pill tone="bad">Due</Pill>
                      )}
                      {dealer.signalLabels.map((label, i) => (
                        <span key={i} style={{
                          fontSize: 10,
                          color: BRAND.muted,
                          border: `1px solid ${BRAND.border}`,
                          borderRadius: 4,
                          padding: '1px 5px',
                        }}>{label}</span>
                      ))}
                    </div>
                  </Td>
                  <Td>
                    <div style={{ fontSize: 12, color: BRAND.subtext, lineHeight: 1.4, maxWidth: 320 }}>
                      {dealer.primaryObservation}
                    </div>
                  </Td>
                  <Td align="right">
                    {dealer.followUpDue ? (
                      <Pill tone="bad">Due</Pill>
                    ) : dealer.followUpStatus ? (
                      <Pill tone={FOLLOWUP_STATUS_TONES[dealer.followUpStatus] || 'neutral'}>
                        {FOLLOWUP_STATUS_LABELS[dealer.followUpStatus] || dealer.followUpStatus}
                      </Pill>
                    ) : (
                      <span style={{ fontSize: 11, color: BRAND.muted }}>—</span>
                    )}
                  </Td>
                  <Td align="right">
                    {dealer.nextContactDate ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, color: BRAND.text }}>
                        <Clock size={11} /> {formatDate(dealer.nextContactDate)}
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: BRAND.muted }}>—</span>
                    )}
                  </Td>
                  <Td align="center" style={{ padding: '8px 4px' }}>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onSelectDealer(dealer.accountId); }}
                      title="Open dealer drill-down"
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 2,
                        color: BRAND.primary,
                        display: 'inline-flex',
                        alignItems: 'center',
                      }}
                    >
                      <ArrowUpRight size={14} />
                    </button>
                  </Td>
                </tr>
                {isExpanded && (
                  <tr>
                    <Td colSpan={COLUMNS.length + 2} style={{ padding: 0, borderBottom: `2px solid ${BRAND.border}` }}>
                      <EnhancedDealerDetail
                        dealer={dealer}
                        onLogFollowUp={onLogFollowUp}
                        onChangeCategory={onChangeCategory}
                      />
                    </Td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>

      {totalPages > 1 && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 14px',
          borderTop: `1px solid ${BRAND.border}`,
          fontSize: 12,
          color: BRAND.muted,
        }}>
          <span>
            Showing {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, sorted.length)} of {formatNumber(sorted.length)} dealers
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <Button
              variant="secondary"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              Previous
            </Button>
            <span style={{ alignSelf: 'center', fontWeight: 700, color: BRAND.text }}>
              {page + 1} / {totalPages}
            </span>
            <Button
              variant="secondary"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}