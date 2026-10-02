// IntelligenceUi.jsx
// ------------------
// Shared presentation primitives for the Project Intelligence admin area.
// Presentation only: no business logic, no data access.

import React from 'react';

export const BRAND = {
  text: '#1B1A1A',
  subtext: '#3E4349',
  muted: '#6B6B66',
  border: '#DCDBD6',
  bg: '#F8F8F7',
  card: '#FFFFFF',
  primary: '#213428',
  accent: '#625143',
  warn: '#8A4B12',
  warnBg: '#FBF2E7',
  bad: '#8C2F1B',
  badBg: '#FBEDE9',
  good: '#2F5A44',
  goodBg: '#EDF4F0',
  info: '#2B4A63',
  infoBg: '#EDF2F6',
};

export const TABLE_WRAP = {
  width: '100%',
  overflowX: 'auto',
  background: BRAND.card,
  border: `1px solid ${BRAND.border}`,
  borderRadius: 12,
};

export const TABLE = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
};

export function Card({ title, subtitle, actions, children, style }) {
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

export function Th({ children, align = 'left', width }) {
  return (
    <th style={{
      textAlign: align,
      padding: '9px 12px',
      borderBottom: `1px solid ${BRAND.border}`,
      background: '#FAFAF8',
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      color: BRAND.accent,
      whiteSpace: 'nowrap',
      width,
    }}>
      {children}
    </th>
  );
}

export function Td({ children, align = 'left', mono = false, style }) {
  return (
    <td style={{
      textAlign: align,
      padding: '9px 12px',
      borderBottom: '1px solid #EFEEEA',
      color: BRAND.subtext,
      verticalAlign: 'top',
      fontVariantNumeric: mono ? 'tabular-nums' : undefined,
      ...style,
    }}>
      {children}
    </td>
  );
}

const TONES = {
  neutral: { color: BRAND.subtext, background: '#F1F0EC' },
  good: { color: BRAND.good, background: BRAND.goodBg },
  warn: { color: BRAND.warn, background: BRAND.warnBg },
  bad: { color: BRAND.bad, background: BRAND.badBg },
  info: { color: BRAND.info, background: BRAND.infoBg },
};

export function Pill({ tone = 'neutral', children, title }) {
  const palette = TONES[tone] || TONES.neutral;
  return (
    <span title={title} style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 999,
      fontSize: 11,
      fontWeight: 600,
      whiteSpace: 'nowrap',
      color: palette.color,
      background: palette.background,
    }}>
      {children}
    </span>
  );
}

export function EmptyState({ message, hint }) {
  return (
    <div style={{ padding: '20px 4px', fontSize: 13, color: BRAND.muted }}>
      <div>{message}</div>
      {hint && <div style={{ marginTop: 4, fontSize: 12 }}>{hint}</div>}
    </div>
  );
}

export function Button({ children, onClick, variant = 'primary', disabled = false, title }) {
  const primary = variant === 'primary';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        padding: '8px 14px',
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        border: primary ? '1px solid transparent' : `1px solid ${BRAND.border}`,
        background: primary ? BRAND.primary : BRAND.card,
        color: primary ? '#FFFFFF' : BRAND.text,
      }}
    >
      {children}
    </button>
  );
}