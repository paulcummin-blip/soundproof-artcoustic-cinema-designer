// components/pricing/PriceSummary.jsx
import React from 'react';

/**
 * Price summary card for the sidebar.
 *
 * Shows the products included in the current system (sourced from the same
 * priced breakdown the right-side schedule uses) above the existing system
 * total. The total remains the strongest element; product rows are secondary.
 *
 * Territory metadata is passed in as props from the canonical usePriceCalculation
 * resolver via Layout — PriceSummary does NOT resolve territory independently and
 * does NOT recalculate the total. `breakdown` is the same line array the pricing
 * engine returns, so the card is never a second, manually-maintained product list.
 */
function SystemRows({ breakdown }) {
  if (!Array.isArray(breakdown) || breakdown.length === 0) return null;
  const rows = breakdown
    .map((line) => {
      const name = String(line?.description || '').trim();
      const qty = Number(line?.qty ?? line?.count) || 0;
      if (!name || qty <= 0) return null;
      return { name, qty, key: `${name}:${qty}:${line?.model || ''}` };
    })
    .filter(Boolean);

  if (rows.length === 0) return null;

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#625143', marginBottom: 6 }}>
        System
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {rows.map((row) => (
          <div
            key={row.key}
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: '#3E4349',
              lineHeight: 1.35,
              fontFamily: 'Didact Gothic, sans-serif',
            }}
          >
            {row.name} <span style={{ color: '#625143' }}>× {row.qty}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PriceSummary({
  showPrices = false,
  baseTotal = 0,
  finalTotal = 0,
  difficultyMultiplier = 1.0,
  priceMode = "incVat",
  territoryLabel = '',
  territoryCode = 'UK',
  currency = 'GBP',
  priceListAvailable = true,
  incompletePriceCount = 0,
  breakdown = [],
}) {
  // Don't render anything when prices are hidden
  if (!showPrices) {
    return null;
  }

  // Format price with thousand separators
  const formatPrice = (value) => {
    const rounded = Math.round(value);
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: currency || 'GBP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(rounded);
  };

  return (
    <div
      style={{
        padding: '12px 16px',
        background: '#FFFFFF',
        border: '1px solid #DCDBD6',
        borderRadius: '8px',
        margin: '0 16px 12px 16px',
      }}
    >
      <SystemRows breakdown={breakdown} />
      <div style={{ borderTop: '1px solid #E5E5E5', margin: '0 0 8px 0' }} />
      {priceListAvailable ? (
        <>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#3E4349', marginBottom: 8 }}>
            {incompletePriceCount > 0 ? 'System Price incomplete' : 'System Price'}, {priceMode === "exVat" ? "ex VAT" : "inc VAT"}
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#213428' }}>
            {formatPrice(finalTotal)}
          </div>
          {incompletePriceCount > 0 && (
            <div style={{ fontSize: 11, color: '#B8860B', marginTop: 4, fontWeight: 500 }}>
              {incompletePriceCount} product{incompletePriceCount > 1 ? 's' : ''} requires a price
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#3E4349', marginBottom: 8 }}>
            System Price
          </div>
          <div style={{ fontSize: 13, color: '#625143' }}>
            Price list not available for {territoryLabel}
          </div>
        </>
      )}
    </div>
  );
}