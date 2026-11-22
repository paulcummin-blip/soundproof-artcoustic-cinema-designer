/**
 * IntelligenceCard.jsx
 * --------------------
 * Shared card primitive for the consolidated intelligence page sections.
 * Presentation only.
 */

import React from 'react';
import { BRAND } from '@/components/admin/intelligence/IntelligenceUi';

export default function IntelligenceCard({ title, subtitle, actions, children, style }) {
  return (
    <section style={{
      background: BRAND.card,
      border: `1px solid ${BRAND.border}`,
      borderRadius: 12,
      padding: 18,
      ...style,
    }}>
      {(title || actions) && (
        <header style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 14,
        }}>
          <div>
            {title && <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: BRAND.text }}>{title}</h2>}
            {subtitle && <div style={{ marginTop: 4, fontSize: 12, color: BRAND.muted, lineHeight: 1.5 }}>{subtitle}</div>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function StatCard({ label, value, hint, tone }) {
  return (
    <div style={{
      background: BRAND.card,
      border: `1px solid ${BRAND.border}`,
      borderRadius: 10,
      padding: '12px 14px',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: BRAND.accent, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: tone || BRAND.text, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      {hint && <div style={{ marginTop: 4, fontSize: 11, color: BRAND.muted, lineHeight: 1.4 }}>{hint}</div>}
    </div>
  );
}