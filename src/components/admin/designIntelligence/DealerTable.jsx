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
import { ChevronDown, ChevronRight, ChevronUp, Phone, Clock, ArrowUpRight } from 'lucide-react';
import { BRAND, Pill, Button, Th, Td, TABLE_WRAP, TABLE } from '@/components/admin/intelligence/IntelligenceUi';
import { formatDate, formatNumber } from '@/lib/commercial/projectReporting/formatMoney';
import { ACCOUNT_MANAGEMENT_THRESHOLDS, ACTION_CATEGORIES } from '@/lib/commercial/designIntelligence/accountManagementConfig';
import { SECTOR_TABS } from '@/lib/commercial/designIntelligence/sectorScope';

const PAGE_SIZE = ACCOUNT_MANAGEMENT_THRESHOLDS.dealerTablePageSize;

const CATEGORY_TONES = {
  [ACTION_CATEGORIES.FOLLOW_UP_DUE]: 'bad',
  [ACTION_CATEGORIES.NEW_OPPORTUNITY]: 'good',
  [ACTION_CATEGORIES.RELATIONSHIP_REVIEW]: 'neutral',
  [ACTION_CATEGORIES.ONBOARDING_FOLLOW_UP]: 'warn',
  [ACTION_CATEGORIES.INSUFFICIENT_EVIDENCE]: 'neutral',
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
  { key: 'sectorKey', label: 'Sector', sortable: true },
  { key: 'signalLabels', label: 'Signals', sortable: false },
  { key: 'primaryObservation', label: 'Most relevant observation', sortable: false },
  { key: 'followUpStatus', label: 'Follow-up', sortable: true },
  { key: 'nextContactDate', label: 'Next contact', sortable: true },
];

function sectorLabel(key) {
  const tab = SECTOR_TABS.find((t) => t.key === key);
  return tab ? tab.label : key || 'Unclassified';
}

export default function DealerTable({ dealers, followUpsByKey, onLogFollowUp, onSelectDealer }) {
  const [sortKey, setSortKey] = useState('categoryPriority');
  const [sortDir, setSortDir] = useState('asc');
  const [expandedId, setExpandedId] = useState(null);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    const list = [...dealers];
    list.sort((a, b) => {
      let aVal, bVal;
      if (sortKey === 'categoryPriority') {
        aVal = a.categoryPriority;
        bVal = b.categoryPriority;
      } else if (sortKey === 'signalLabels') {
        aVal = (a.signalLabels || []).join(', ');
        bVal = (b.signalLabels || []).join(', ');
      } else if (sortKey === 'nextContactDate') {
        aVal = a.nextContactDate || '9999';
        bVal = b.nextContactDate || '9999';
      } else if (sortKey === 'followUpStatus') {
        aVal = a.followUpStatus || 'zzz';
        bVal = b.followUpStatus || 'zzz';
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
                No dealers with actionable signals in this sector.
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
                    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                      <Pill tone={CATEGORY_TONES[dealer.category] || 'neutral'}>{dealer.category}</Pill>
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
                    {dealer.followUpStatus ? (
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
                      <ExpandedDealerDetail dealer={dealer} onLogFollowUp={onLogFollowUp} />
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

/**
 * Inline expandable detail for a single dealer row.
 * Shows all signals with observations, suggested questions, and follow-up controls.
 */
function ExpandedDealerDetail({ dealer, onLogFollowUp }) {
  const signals = dealer.signals || [];
  const hasSignals = signals.length > 0;

  // For follow-up, use the first signal as the opportunity reference
  const primarySignal = signals[0] || {
    opportunityKey: `manual:${dealer.accountId}`,
    opportunityType: 'needs_attention',
    accountId: dealer.accountId,
    dealerName: dealer.dealerName,
    observation: dealer.primaryObservation,
    reason: 'No specific signal — see dealer drill-down for details.',
    suggestedQuestion: null,
  };

  return (
    <div style={{
      background: '#FAFAF8',
      padding: '14px 18px',
      display: 'grid',
      gap: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: BRAND.accent, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {dealer.category}
        </div>
        <Button variant="secondary" onClick={() => onLogFollowUp(primarySignal, dealer.followUpRecord)}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Phone size={12} /> {dealer.followUpRecord ? 'Update follow-up' : 'Log follow-up'}
          </span>
        </Button>
      </div>

      {!hasSignals && dealer.followUpRecord && (
        <div style={{
          fontSize: 12,
          color: BRAND.subtext,
          background: BRAND.card,
          border: `1px solid ${BRAND.border}`,
          borderRadius: 8,
          padding: 10,
          lineHeight: 1.5,
        }}>
          <strong style={{ color: BRAND.text }}>Recorded observation:</strong> {dealer.followUpRecord.observation}
          {dealer.followUpRecord.conversation_notes && (
            <div style={{ marginTop: 4, fontStyle: 'italic', color: BRAND.muted }}>
              "{dealer.followUpRecord.conversation_notes}"
            </div>
          )}
        </div>
      )}

      {hasSignals && signals.map((signal) => (
        <div key={signal.opportunityKey} style={{
          background: BRAND.card,
          border: `1px solid ${BRAND.border}`,
          borderRadius: 8,
          padding: 10,
          display: 'grid',
          gap: 6,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: BRAND.accent, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {signal.opportunityType.replace(/_/g, ' ')}
            </span>
            <Pill tone="neutral">{signal.opportunityKey.split(':').slice(2).join(':') || signal.opportunityType}</Pill>
          </div>
          <div style={{ fontSize: 12, color: BRAND.subtext, lineHeight: 1.5 }}>
            <strong style={{ color: BRAND.text }}>Observed:</strong> {signal.observation}
          </div>
          <div style={{ fontSize: 12, color: BRAND.subtext, lineHeight: 1.5 }}>
            <strong style={{ color: BRAND.text }}>Why:</strong> {signal.reason}
          </div>
          {signal.suggestedQuestion && (
            <div style={{
              fontSize: 12,
              color: BRAND.info,
              lineHeight: 1.5,
              background: BRAND.infoBg,
              borderRadius: 6,
              padding: '5px 8px',
            }}>
              <strong>Suggested question:</strong> {signal.suggestedQuestion}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => onLogFollowUp(signal, null)}>
              Log follow-up for this signal
            </Button>
          </div>
        </div>
      ))}

      {dealer.followUpRecord && (
        <div style={{
          background: BRAND.warnBg,
          border: `1px solid ${BRAND.border}`,
          borderRadius: 8,
          padding: 10,
          fontSize: 12,
          color: BRAND.subtext,
          lineHeight: 1.5,
        }}>
          <strong style={{ color: BRAND.text }}>Existing follow-up:</strong>{' '}
          Status: {FOLLOWUP_STATUS_LABELS[dealer.followUpRecord.status] || dealer.followUpRecord.status}
          {dealer.followUpRecord.contact_date && ` · Last contact: ${formatDate(dealer.followUpRecord.contact_date)}`}
          {dealer.followUpRecord.next_contact_date && ` · Next: ${formatDate(dealer.followUpRecord.next_contact_date)}`}
          {dealer.followUpRecord.discovered_reason && (
            <div style={{ marginTop: 4, fontStyle: 'italic' }}>
              Discovered: "{dealer.followUpRecord.discovered_reason}"
            </div>
          )}
        </div>
      )}
    </div>
  );
}