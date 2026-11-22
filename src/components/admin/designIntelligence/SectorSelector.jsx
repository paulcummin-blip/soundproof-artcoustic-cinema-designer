/**
 * SectorSelector.jsx
 * -------------------
 * The sector tab bar for the consolidated page. Shows the four principal
 * views plus visible Unclassified, International and Internal counts.
 */

import React from 'react';
import { BRAND } from '@/components/admin/intelligence/IntelligenceUi';
import { SECTOR_TABS } from '@/lib/commercial/designIntelligence/sectorScope';

export default function SectorSelector({ activeKey, counts, onSelect }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {SECTOR_TABS.map((tab) => {
        const count = counts[tab.key] || 0;
        const isActive = activeKey === tab.key;
        const isPrincipal = ['all_dealers', 'premium_partners', 'trade_accounts', 'richer_sounds'].includes(tab.key);
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onSelect(tab.key)}
            title={tab.description}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              border: `1px solid ${isActive ? BRAND.primary : BRAND.border}`,
              background: isActive ? BRAND.primary : BRAND.card,
              color: isActive ? '#FFFFFF' : BRAND.text,
              opacity: count === 0 && !isActive ? 0.5 : 1,
            }}
          >
            {tab.label}
            <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.8 }}>{count}</span>
            {!isPrincipal && count > 0 && (
              <span style={{ marginLeft: 4, fontSize: 10, color: isActive ? '#C1B6AD' : BRAND.warn }}>•</span>
            )}
          </button>
        );
      })}
    </div>
  );
}