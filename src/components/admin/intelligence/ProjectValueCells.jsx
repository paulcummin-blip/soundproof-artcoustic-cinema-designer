// ProjectValueCells.jsx
// --------------------
// The value cells for a project row. Live Design Value and Quoted Snapshot
// Value are independent: neither is ever added to the other, and an unpriced
// project shows a dash with the reason rather than a zero.

import React from 'react';
import { BRAND, Pill } from './IntelligenceUi';
import { formatMoney } from '@/lib/commercial/projectReporting/formatMoney';

export function LiveValueCell({ family }) {
  if (family.liveValue !== null && family.liveValue !== undefined) {
    return (
      <span style={{ color: BRAND.text, fontWeight: 600 }}>
        {formatMoney(family.liveValue, family.liveCurrency || 'GBP')}
        {family.unpricedLineCount > 0 && (
          <span style={{ marginLeft: 6 }}>
            <Pill tone="warn" title={`${family.unpricedLineCount} line(s) unpriced — excluded from this value`}>partial</Pill>
          </span>
        )}
      </span>
    );
  }
  return (
    <span title={family.livePriceListAvailable ? 'No priced products in the active version' : 'Price list unavailable for this territory'}>
      <Pill tone={family.livePriceListAvailable ? 'warn' : 'neutral'}>
        {family.livePriceListAvailable ? 'unpriced' : 'no price list'}
      </Pill>
    </span>
  );
}

export function QuotedValueCell({ family }) {
  if (family.quotedValue !== null && family.quotedValue !== undefined) {
    return (
      <span style={{ color: BRAND.text, fontWeight: 600 }}>
        {formatMoney(family.quotedValue, family.quotedCurrency || 'GBP')}
      </span>
    );
  }
  return <Pill tone="neutral" title={family.quotedReason || 'No proposal snapshot'}>no snapshot</Pill>;
}