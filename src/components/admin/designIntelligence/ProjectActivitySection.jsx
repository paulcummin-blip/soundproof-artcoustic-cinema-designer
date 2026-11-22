/**
 * ProjectActivitySection.jsx
 * ---------------------------
 * Projects created by dealer and period, genuine recorded proposal events,
 * project status distribution, and dealer drill-down.
 */

import React, { useMemo } from 'react';
import { BRAND, Pill } from '@/components/admin/intelligence/IntelligenceUi';
import { formatNumber, formatDate } from '@/lib/commercial/projectReporting/formatMoney';
import IntelligenceCard, { StatCard } from './IntelligenceCard';
import { buildProposalEventTimeline } from '@/lib/commercial/commercialDashboard/proposalEvents';
import { BUCKET_LABEL } from '@/lib/commercial/projectReporting/statusBuckets';

export default function ProjectActivitySection({ families, report, onSelectDealer, selectedDealerId }) {
  const timeline = useMemo(() => {
    const events = (report?.commercial?.proposalEvents || []).filter((event) =>
      families.some((f) => f.id === event.projectId));
    return buildProposalEventTimeline(events, { months: 12 });
  }, [families, report]);

  const statusCounts = useMemo(() => {
    const map = {};
    for (const family of families) {
      const key = family.bucket || 'unclassified';
      map[key] = (map[key] || 0) + 1;
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [families]);

  const monthBuckets = useMemo(() => {
    const map = new Map();
    for (const family of families) {
      const created = family.createdDate;
      if (!created) continue;
      const date = new Date(created);
      if (Number.isNaN(date.getTime())) continue;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      map.set(key, (map.get(key) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-12);
  }, [families]);

  const dealers = useMemo(() => {
    const map = new Map();
    for (const family of families) {
      if (!family.accountId) continue;
      const key = family.accountId;
      if (!map.has(key)) {
        map.set(key, {
          accountId: key,
          name: family.dealerName || family.accountName || 'Unnamed',
          projectCount: 0,
          proposalCount: 0,
          latestActivity: null,
        });
      }
      const entry = map.get(key);
      entry.projectCount += 1;
      const created = family.createdDate ? new Date(family.createdDate).getTime() : null;
      if (created && (!entry.latestActivity || created > entry.latestActivity)) {
        entry.latestActivity = created;
      }
    }
    return [...map.values()].sort((a, b) => b.projectCount - a.projectCount);
  }, [families]);

  return (
    <IntelligenceCard
      title="Project Activity"
      subtitle="Projects created by dealer and period, genuine recorded proposal events, and project status distribution"
    >
      <div style={{ display: 'grid', gap: 16 }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 10,
        }}>
          <StatCard label="Projects" value={formatNumber(families.length)} />
          <StatCard label="Dealers" value={formatNumber(dealers.length)} />
          <StatCard label="Proposal events (12mo)" value={formatNumber(timeline.reduce((s, b) => s + b.events, 0))} />
          <StatCard label="Statuses mapped" value={formatNumber(statusCounts.filter(([k]) => k !== 'unclassified').length)} />
        </div>

        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: BRAND.accent, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
              Projects created by month
            </div>
            {monthBuckets.length === 0 ? (
              <div style={{ fontSize: 12, color: BRAND.muted }}>No creation dates recorded.</div>
            ) : (
              <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 60 }}>
                {monthBuckets.map(([month, count]) => {
                  const max = Math.max(...monthBuckets.map(([, c]) => c), 1);
                  const height = (count / max) * 100;
                  return (
                    <div key={month} title={`${month}: ${count} project(s)`} style={{
                      flex: 1,
                      minWidth: 18,
                      height: `${height}%`,
                      minHeight: 2,
                      background: BRAND.primary,
                      borderRadius: '3px 3px 0 0',
                      opacity: 0.8,
                    }} />
                  );
                })}
              </div>
            )}
            <div style={{ marginTop: 4, fontSize: 10, color: BRAND.muted }}>
              Last 12 months · {monthBuckets.length} month(s) with activity
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: BRAND.accent, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
              Project status distribution
            </div>
            {statusCounts.length === 0 ? (
              <div style={{ fontSize: 12, color: BRAND.muted }}>No statuses.</div>
            ) : (
              <div style={{ display: 'grid', gap: 4 }}>
                {statusCounts.map(([bucket, count]) => (
                  <div key={bucket} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, padding: '4px 0' }}>
                    <span style={{ color: bucket === 'unclassified' ? BRAND.warn : BRAND.text }}>
                      {BUCKET_LABEL[bucket] || bucket}
                    </span>
                    <span style={{ fontWeight: 700, color: BRAND.text }}>{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: BRAND.accent, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
            Dealer drill-down
          </div>
          {dealers.length === 0 ? (
            <div style={{ fontSize: 12, color: BRAND.muted }}>No dealer accounts in this sector.</div>
          ) : (
            <div style={{ display: 'grid', gap: 4 }}>
              {dealers.slice(0, 20).map((dealer) => (
                <button
                  key={dealer.accountId}
                  type="button"
                  onClick={() => onSelectDealer(dealer.accountId)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: `1px solid ${selectedDealerId === dealer.accountId ? BRAND.primary : BRAND.border}`,
                    background: selectedDealerId === dealer.accountId ? '#F0EDE8' : BRAND.card,
                    cursor: 'pointer',
                    fontSize: 13,
                  }}
                >
                  <span style={{ fontWeight: 600, color: BRAND.text }}>{dealer.name}</span>
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Pill tone="neutral">{dealer.projectCount} project{dealer.projectCount !== 1 ? 's' : ''}</Pill>
                    {dealer.latestActivity && (
                      <span style={{ fontSize: 11, color: BRAND.muted }}>
                        {formatDate(new Date(dealer.latestActivity).toISOString())}
                      </span>
                    )}
                  </span>
                </button>
              ))}
              {dealers.length > 20 && (
                <div style={{ fontSize: 11, color: BRAND.muted, padding: '4px 12px' }}>
                  + {dealers.length - 20} more dealer(s)
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </IntelligenceCard>
  );
}