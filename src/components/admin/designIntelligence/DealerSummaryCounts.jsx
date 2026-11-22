/**
 * DealerSummaryCounts.jsx
 * --------------------------
 * Four clickable summary cards at the top of the Account Management view.
 * Clicking a card filters the dealer table by that opportunity category.
 * "All Dealers" card returns to the unfiltered view.
 *
 * Overlooked, Need Attention, Emerging filter by opportunity category.
 * Follow-ups Due filters by date-driven follow-up due status (a dealer can
 * be Emerging AND have a follow-up due — both cards count it).
 */

import React from 'react';
import { BRAND } from '@/components/admin/intelligence/IntelligenceUi';
import { formatNumber } from '@/lib/commercial/projectReporting/formatMoney';
import { FILTER_KEYS } from '@/lib/commercial/designIntelligence/accountManagementConfig';

const CARDS = [
  { key: 'overlooked', filterKey: FILTER_KEYS.OVERLOOKED, label: 'Overlooked', subtitle: 'Relationship reviews', tone: BRAND.accent, bg: '#F6F0EA' },
  { key: 'needingAttention', filterKey: FILTER_KEYS.NEEDS_ATTENTION, label: 'Need Attention', subtitle: 'Onboarding follow-ups', tone: BRAND.warn, bg: BRAND.warnBg },
  { key: 'emerging', filterKey: FILTER_KEYS.EMERGING, label: 'Emerging', subtitle: 'Developing opportunities', tone: BRAND.good, bg: BRAND.goodBg },
  { key: 'followUpsDue', filterKey: FILTER_KEYS.FOLLOW_UPS_DUE, label: 'Follow-ups Due', subtitle: 'Due now (date-driven)', tone: BRAND.bad, bg: BRAND.badBg },
];

export default function DealerSummaryCounts({ counts, activeFilter, onFilterChange }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
      gap: 10,
    }}>
      {/* All Dealers card */}
      <button
        type="button"
        onClick={() => onFilterChange(FILTER_KEYS.ALL)}
        style={{
          background: activeFilter === FILTER_KEYS.ALL ? BRAND.primary : BRAND.card,
          border: `2px solid ${activeFilter === FILTER_KEYS.ALL ? BRAND.primary : BRAND.border}`,
          borderRadius: 10,
          padding: '14px 16px',
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'all 0.15s',
        }}
      >
        <div style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: activeFilter === FILTER_KEYS.ALL ? '#FFFFFF' : BRAND.accent,
          marginBottom: 6,
        }}>
          All Dealers
        </div>
        <div style={{
          fontSize: 28,
          fontWeight: 700,
          color: activeFilter === FILTER_KEYS.ALL ? '#FFFFFF' : BRAND.text,
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1,
        }}>
          {formatNumber(
            (counts.overlooked || 0) + (counts.needingAttention || 0) +
            (counts.emerging || 0) + (counts.noOpportunity || 0) +
            (counts.insufficientEvidence || 0)
          )}
        </div>
        <div style={{
          marginTop: 4,
          fontSize: 11,
          color: activeFilter === FILTER_KEYS.ALL ? 'rgba(255,255,255,0.7)' : BRAND.muted,
        }}>
          Total in sector
        </div>
      </button>

      {CARDS.map((card) => {
        const isActive = activeFilter === card.filterKey;
        const count = counts[card.key] || 0;
        return (
          <button
            key={card.key}
            type="button"
            onClick={() => onFilterChange(isActive ? FILTER_KEYS.ALL : card.filterKey)}
            style={{
              background: isActive ? card.tone : card.bg,
              border: `2px solid ${isActive ? card.tone : BRAND.border}`,
              borderRadius: 10,
              padding: '14px 16px',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.15s',
              opacity: count === 0 && !isActive ? 0.6 : 1,
            }}
          >
            <div style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: isActive ? '#FFFFFF' : card.tone,
              marginBottom: 6,
            }}>
              {card.label}
            </div>
            <div style={{
              fontSize: 28,
              fontWeight: 700,
              color: isActive ? '#FFFFFF' : BRAND.text,
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1,
            }}>
              {formatNumber(count)}
            </div>
            <div style={{
              marginTop: 4,
              fontSize: 11,
              color: isActive ? 'rgba(255,255,255,0.7)' : BRAND.muted,
            }}>
              {card.subtitle}
            </div>
          </button>
        );
      })}
    </div>
  );
}