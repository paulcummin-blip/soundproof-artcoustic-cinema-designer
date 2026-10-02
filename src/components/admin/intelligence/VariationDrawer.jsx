// VariationDrawer.jsx
// -------------------
// The design variations of one project family. Each ProjectVersion is listed
// with its own Live Design Value (calculated from that version's own design),
// its product lines and its warnings. Variations are never counted as separate
// commercial projects.

import React, { useEffect } from 'react';
import { BRAND, Pill, TABLE, Td, Th } from './IntelligenceUi';
import { formatDate, formatDateTime, formatMoney } from '@/lib/commercial/projectReporting/formatMoney';

function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', gap: 10, fontSize: 12, padding: '3px 0' }}>
      <span style={{ minWidth: 132, color: BRAND.accent, fontWeight: 600 }}>{label}</span>
      <span style={{ color: BRAND.subtext, minWidth: 0 }}>{children}</span>
    </div>
  );
}

function VariationCard({ variation, currency }) {
  return (
    <article style={{
      border: `1px solid ${BRAND.border}`,
      borderRadius: 10,
      padding: 14,
      marginBottom: 12,
      background: variation.isActive ? '#FBFCFB' : BRAND.card,
    }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, color: BRAND.text, fontSize: 14 }}>
          V{variation.versionNumber ?? '—'} · {variation.versionName}
        </span>
        {variation.isActive && <Pill tone="good">Active version</Pill>}
        {variation.legacySource && <Pill tone="info">Priced from project record</Pill>}
      </header>

      <Row label="Created">{formatDateTime(variation.createdDate)}</Row>
      <Row label="Updated">{formatDateTime(variation.updatedDate)}</Row>
      <Row label="Live design value">
        {variation.liveValue === null
          ? <Pill tone="warn">{variation.priceListAvailable ? 'Not calculable' : 'Price list unavailable'}</Pill>
          : formatMoney(variation.liveValue, variation.currency || currency || 'GBP')}
        {variation.priceMode ? <span style={{ color: BRAND.muted }}> · {variation.priceMode === 'exVat' ? 'ex VAT' : 'inc VAT'}{variation.difficultyMultiplier !== 1 ? ` · difficulty ×${variation.difficultyMultiplier}` : ''}</span> : null}
      </Row>
      <Row label="Product lines">{variation.lineCount}{variation.unpricedLineCount > 0 ? ` · ${variation.unpricedLineCount} unpriced` : ''}</Row>
      <Row label="Format">{variation.format || '—'}</Row>
      <Row label="Engineering result">
        {variation.publicationSummary
          ? `Published ${formatDate(variation.publicationSummary.publishedAt)}${variation.publicationSummary.engineVersion ? ` · ${variation.publicationSummary.engineVersion}` : ''}`
          : 'Not published'}
      </Row>

      {variation.warnings?.length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {variation.warnings.map((warning) => <Pill key={warning} tone="warn">{warning}</Pill>)}
        </div>
      )}

      {variation.lines?.length > 0 && (
        <div style={{ marginTop: 10, border: `1px solid ${BRAND.border}`, borderRadius: 8, overflowX: 'auto' }}>
          <table style={{ ...TABLE, fontSize: 12 }}>
            <thead>
              <tr>
                <Th>Product</Th>
                <Th align="right">Qty</Th>
                <Th align="right">Unit ex VAT</Th>
                <Th align="right">Subtotal ex VAT</Th>
              </tr>
            </thead>
            <tbody>
              {variation.lines.map((line) => (
                <tr key={`${line.model}-${line.sizeValue || ''}`}>
                  <Td>{line.description || line.model}</Td>
                  <Td align="right" mono>{line.count ?? line.qty}</Td>
                  <Td align="right" mono>
                    {line.unitPriceExVat === null || line.unitPriceExVat === undefined
                      ? <Pill tone="warn">unpriced</Pill>
                      : formatMoney(line.unitPriceExVat, variation.currency || currency || 'GBP')}
                  </Td>
                  <Td align="right" mono>
                    {line.subtotalExVat === null || line.subtotalExVat === undefined
                      ? '—'
                      : formatMoney(line.subtotalExVat, variation.currency || currency || 'GBP')}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {variation.inactiveLines?.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 12, color: BRAND.warn }}>
          {variation.inactiveLines.map((line) => `${line.description || line.model} × ${line.count ?? line.qty} (inactive)`).join(', ')}
        </div>
      )}
    </article>
  );
}

export default function VariationDrawer({ family, onClose }) {
  useEffect(() => {
    if (!family) return undefined;
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [family, onClose]);

  if (!family) return null;

  return (
    <>
      <div
        role="presentation"
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(27,26,26,0.28)',
          zIndex: 60,
        }}
      />
      <aside
        role="dialog"
        aria-label={`Design variations for ${family.name}`}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 'min(720px, 96vw)',
          background: BRAND.bg,
          borderLeft: `1px solid ${BRAND.border}`,
          zIndex: 61,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <header style={{
          padding: '16px 20px',
          borderBottom: `1px solid ${BRAND.border}`,
          background: BRAND.card,
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          alignItems: 'flex-start',
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, color: BRAND.text }}>{family.name}</h2>
            <div style={{ marginTop: 4, fontSize: 12, color: BRAND.muted }}>
              {family.client || '—'}{family.reference ? ` · ${family.reference}` : ''} · {family.dealerName || '—'}
            </div>
            <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Pill tone="neutral">{family.rawStatusLabel}</Pill>
              <Pill tone="neutral">{family.variationCount} variation{family.variationCount === 1 ? '' : 's'}</Pill>
              <Pill tone={family.lifecycleStatus === 'Archived' ? 'bad' : 'neutral'}>{family.lifecycleStatus}</Pill>
            </div>
            <div style={{ marginTop: 6, fontSize: 11, color: BRAND.muted }}>
              Design variations are not counted as separate commercial projects.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: `1px solid ${BRAND.border}`,
              background: BRAND.card,
              borderRadius: 8,
              padding: '6px 10px',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              color: BRAND.text,
            }}
          >
            Close
          </button>
        </header>

        <div style={{ padding: 20, overflowY: 'auto' }}>
          {family.variations.map((variation) => (
            <VariationCard key={variation.id} variation={variation} currency={family.liveCurrency} />
          ))}
        </div>
      </aside>
    </>
  );
}