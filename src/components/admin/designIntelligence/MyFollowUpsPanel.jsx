/**
 * MyFollowUpsPanel.jsx
 * ---------------------
 * Admin's recorded follow-up records, filterable by status and sorted by
 * next contact date. Shows the same Dealer → Observation → Status format.
 */

import React, { useMemo, useState } from 'react';
import { BRAND, Pill, Button } from '@/components/admin/intelligence/IntelligenceUi';
import { formatDate, formatNumber } from '@/lib/commercial/projectReporting/formatMoney';
import IntelligenceCard, { StatCard } from './IntelligenceCard';

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'awaiting_follow_up', label: 'Awaiting' },
  { key: 'relevant', label: 'Relevant' },
  { key: 'dismissed', label: 'Dismissed' },
];

export default function MyFollowUpsPanel({ followUps, sectorLabel }) {
  const [statusFilter, setStatusFilter] = useState('all');

  const filtered = useMemo(() => {
    let list = [...followUps];
    if (statusFilter !== 'all') {
      list = list.filter((f) => f.status === statusFilter);
    }
    return list.sort((a, b) => {
      const aDate = a.next_contact_date || a.contact_date || a.created_date || '';
      const bDate = b.next_contact_date || b.contact_date || b.created_date || '';
      return String(aDate).localeCompare(String(bDate));
    });
  }, [followUps, statusFilter]);

  const counts = useMemo(() => {
    const c = { awaiting_follow_up: 0, relevant: 0, dismissed: 0 };
    for (const f of followUps) {
      if (c[f.status] !== undefined) c[f.status] += 1;
    }
    return c;
  }, [followUps]);

  return (
    <IntelligenceCard
      title="My Follow-ups"
      subtitle="Your recorded follow-up conversations. Sorted by next contact date. Mark opportunities as relevant, dismissed or awaiting follow-up."
    >
      {followUps.length === 0 ? (
        <div style={{ fontSize: 13, color: BRAND.muted }}>
          No follow-up records yet. Log a follow-up from any opportunity card above.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setStatusFilter(f.key)}
                style={{
                  padding: '5px 11px',
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: `1px solid ${statusFilter === f.key ? BRAND.primary : BRAND.border}`,
                  background: statusFilter === f.key ? BRAND.primary : BRAND.card,
                  color: statusFilter === f.key ? '#FFFFFF' : BRAND.text,
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <StatCard label="Total" value={formatNumber(followUps.length)} />
            <StatCard label="Awaiting" value={formatNumber(counts.awaiting_follow_up)} tone={BRAND.warn} />
            <StatCard label="Relevant" value={formatNumber(counts.relevant)} tone={BRAND.good} />
            <StatCard label="Dismissed" value={formatNumber(counts.dismissed)} />
          </div>

          <div style={{ display: 'grid', gap: 8, maxHeight: 400, overflowY: 'auto' }}>
            {filtered.map((f) => (
              <div key={f.id} style={{
                border: `1px solid ${BRAND.border}`,
                borderRadius: 8,
                background: BRAND.card,
                padding: 12,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: BRAND.text }}>
                      {f.account_name || 'Unnamed dealer'}
                    </div>
                    <div style={{ fontSize: 11, color: BRAND.muted }}>
                      {sectorLabel} · {f.opportunity_type.replace(/_/g, ' ')}
                    </div>
                  </div>
                  <Pill tone={f.status === 'relevant' ? 'good' : f.status === 'dismissed' ? 'neutral' : 'warn'}>
                    {f.status.replace(/_/g, ' ')}
                  </Pill>
                </div>
                <div style={{ fontSize: 12, color: BRAND.subtext, marginTop: 6, lineHeight: 1.4 }}>
                  <strong style={{ color: BRAND.text }}>Observed:</strong> {f.observation}
                </div>
                {f.conversation_notes && (
                  <div style={{ fontSize: 12, color: BRAND.muted, marginTop: 4, lineHeight: 1.4, fontStyle: 'italic' }}>
                    "{f.conversation_notes}"
                  </div>
                )}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6, fontSize: 11, color: BRAND.muted }}>
                  {f.contact_date && <span>Last contact: {formatDate(f.contact_date)}</span>}
                  {f.next_contact_date && <span>Next: {formatDate(f.next_contact_date)}</span>}
                  {f.created_date && <span>Recorded: {formatDate(f.created_date)}</span>}
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div style={{ fontSize: 12, color: BRAND.muted, padding: 8 }}>No records with this status.</div>
            )}
          </div>
        </div>
      )}
    </IntelligenceCard>
  );
}