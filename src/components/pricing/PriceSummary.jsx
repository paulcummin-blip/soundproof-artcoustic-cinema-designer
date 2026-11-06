// components/pricing/PriceSummary.jsx
import React from 'react';
import { getCanonicalRole } from '@/components/utils/surroundRoleMap';

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
 *
 * Display ordering only: the breakdown already combines identical models (by
 * canonical product key) with their correct total quantity, and already omits
 * categories with no selected products. SystemRows simply presents those lines
 * in a fixed category order — LCR, then surrounds/wides, then overheads, then
 * subwoofers, then amplifiers (CPH-1000D), then ABFUSERS — without adding any
 * category headings. Quantities, pricing and product selection are untouched.
 */
const LCR_CANON = new Set(['FL', 'FC', 'FR']);

function isOverheadCanon(canon) {
  return canon.startsWith('T') || /^(UFL|UFR|UBL|UBR)$/.test(canon);
}

// Fixed display category order. Lower numbers render first. A line that shares
// roles across categories (e.g. one model used as both LCR and surround) takes
// the earliest category it belongs to, so identical models stay on one line.
const CATEGORY_LCR = 1;
const CATEGORY_SURROUND_WIDE = 2;
const CATEGORY_OVERHEAD = 3;
const CATEGORY_SUBWOOFER = 4;
const CATEGORY_AMPLIFIER = 5;
const CATEGORY_ABFUSER = 6;
const CATEGORY_OTHER = 9;

function lineCategory(line) {
  if (line?.isAbfuser) return CATEGORY_ABFUSER;
  const roles = Array.isArray(line?.rolesList) ? line.rolesList : [];
  if (roles.includes('Subwoofer amp')) return CATEGORY_AMPLIFIER;
  if (roles.some((r) => String(r).includes('SUB ('))) return CATEGORY_SUBWOOFER;
  let isLcr = false;
  let isSurroundWide = false;
  let isOverhead = false;
  for (const r of roles) {
    const canon = getCanonicalRole(r);
    if (LCR_CANON.has(canon)) {
      isLcr = true;
    } else if (isOverheadCanon(canon)) {
      isOverhead = true;
    } else {
      isSurroundWide = true;
    }
  }
  if (isLcr) return CATEGORY_LCR;
  if (isSurroundWide) return CATEGORY_SURROUND_WIDE;
  if (isOverhead) return CATEGORY_OVERHEAD;
  return CATEGORY_OTHER;
}

function SystemRows({ breakdown }) {
  if (!Array.isArray(breakdown) || breakdown.length === 0) return null;
  const rows = breakdown
    .map((line) => {
      const name = String(line?.description || '').trim();
      const qty = Number(line?.qty ?? line?.count) || 0;
      if (!name || qty <= 0) return null;
      return {
        name,
        qty,
        model: line?.model || '',
        category: lineCategory(line),
        key: `${line?.model || name}:${name}:${qty}`,
      };
    })
    .filter(Boolean);

  if (rows.length === 0) return null;

  // Stable sort by the fixed category order; preserves the breakdown's own
  // relative order within a category (identical models are already combined
  // by the pricing engine, so no further merging is needed here).
  const ordered = [...rows].sort(
    (a, b) => (a.category - b.category) || 0,
  );

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#625143', marginBottom: 6 }}>
        System
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {ordered.map((row) => (
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