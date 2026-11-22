/**
 * DealerSummaryCounts.jsx
 * --------------------------
 * Four summary count cards at the top of the Account Management view.
 * Compact, scalable overview of the four opportunity categories.
 */

import React from 'react';
import { BRAND } from '@/components/admin/intelligence/IntelligenceUi';
import { formatNumber } from '@/lib/commercial/projectReporting/formatMoney';
import { ACTION_CATEGORIES } from '@/lib/commercial/designIntelligence/accountManagementConfig';

const CARDS = [
  { key: 'overlooked', label: 'Overlooked Opportunities', category: ACTION_CATEGORIES.RELATIONSHIP_REVIEW, tone: BRAND.accent, bg: '#F6F0EA' },
  { key: 'needingAttention', label: 'Accounts Needing Attention', category: ACTION_CATEGORIES.ONBOARDING_FOLLOW_UP, tone: BRAND.warn, bg: BRAND.warnBg },
  { key: 'emerging', label: 'Emerging Opportunities', category: ACTION_CATEGORIES.NEW_OPPORTUNITY, tone: BRAND.good, bg: BRAND.goodBg },
  { key: 'followUpsDue', label: 'Follow-ups Due', category: ACTION_CATEGORIES.FOLLOW_UP_DUE, tone: BRAND.bad, bg: BRAND.badBg },
];

export default function DealerSummaryCounts({ counts }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      gap: 12,
    }}>
      {CARDS.map((card) => (
        <div
          key={card.key}
          style={{
            background: card.bg,
            border: `1px solid ${BRAND.border}`,
            borderRadius: 10,
            padding: '14px 16px',
          }}
        >
          <div style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: card.tone,
            marginBottom: 6,
          }}>
            {card.label}
          </div>
          <div style={{
            fontSize: 28,
            fontWeight: 700,
            color: BRAND.text,
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1,
          }}>
            {formatNumber(counts[card.key] || 0)}
          </div>
          <div style={{
            marginTop: 4,
            fontSize: 11,
            color: BRAND.muted,
          }}>
            {card.category}
          </div>
        </div>
      ))}
    </div>
  );
}