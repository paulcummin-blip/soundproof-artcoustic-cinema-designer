/**
 * ProductDemandSection.jsx
 * -------------------------
 * Every Artcoustic speaker and subwoofer model, the number of projects
 * specifying each product, total specified quantities, soundbar and
 * subwoofer breakdowns, and derived amplifiers separately identified.
 *
 * Reuses the existing buildCatalogueDemand authority and normalises
 * products against the Product Master.
 */

import React, { useMemo } from 'react';
import { BRAND, Pill, Th, Td, TABLE_WRAP, TABLE } from '@/components/admin/intelligence/IntelligenceUi';
import { formatMoney, formatNumber } from '@/lib/commercial/projectReporting/formatMoney';
import IntelligenceCard, { StatCard } from './IntelligenceCard';
import { buildCatalogueDemand, summariseProductDemand } from '@/lib/commercial/projectReporting/productDemand';
import { SUBWOOFER_AMPLIFIER_MODEL } from '@/components/pricing/subwooferAmplifierAuthority';

export default function ProductDemandSection({ families, priceContext }) {
  const demand = useMemo(() => buildCatalogueDemand({
    families: families.filter((f) => f.included !== false),
    priceMap: priceContext?.priceMap || null,
    includeQuoted: false,
  }), [families, priceContext]);

  const summary = useMemo(() => summariseProductDemand(demand.rows), [demand]);

  const speakerRows = demand.rows.filter((row) => {
    const cat = String(row.category || '').toLowerCase();
    return cat.includes('loudspeaker') || cat.includes('speaker');
  });
  const subwooferRows = demand.rows.filter((row) => {
    const cat = String(row.category || '').toLowerCase();
    return cat.includes('sub') || cat.includes('bass');
  });
  const amplifierRows = demand.rows.filter((row) =>
    String(row.product || row.sku || '').toLowerCase().includes('cph-1000d'));

  return (
    <IntelligenceCard
      title="Product Demand"
      subtitle="Artcoustic catalogue products from the active version of each project. Normalised against the Product Master. Derived subwoofer amplifiers identified separately."
    >
      <div style={{ display: 'grid', gap: 16 }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 10,
        }}>
          <StatCard label="Catalogue lines" value={formatNumber(summary.lineCount)} />
          <StatCard label="Total units" value={formatNumber(summary.units)} />
          <StatCard label="Valued lines" value={formatNumber(summary.valuedLineCount)} />
          <StatCard label="Unpriced lines" value={formatNumber(summary.unpricedLineCount)} tone={summary.unpricedLineCount > 0 ? BRAND.warn : undefined} />
        </div>

        <div style={TABLE_WRAP}>
          <table style={TABLE}>
            <thead>
              <tr>
                <Th>Product / model</Th>
                <Th align="right">Projects</Th>
                <Th align="right">Quantity</Th>
                <Th align="right">Live value (ex VAT)</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {demand.rows.length === 0 ? (
                <tr><Td colSpan={5} style={{ textAlign: 'center', color: BRAND.muted }}>No catalogue products in this sector.</Td></tr>
              ) : (
                demand.rows.map((row) => (
                  <tr key={row.sku || row.product}>
                    <Td>
                      <div style={{ fontWeight: 600, color: BRAND.text }}>{row.product}</div>
                      <div style={{ fontSize: 11, color: BRAND.muted }}>{row.sku || '—'} · {row.category}</div>
                    </Td>
                    <Td align="right" mono>{row.projectFamilies}</Td>
                    <Td align="right" mono>{row.quantity}</Td>
                    <Td align="right" mono>
                      {row.liveValue !== null ? formatMoney(row.liveValue, 'GBP') : '—'}
                    </Td>
                    <Td>
                      {row.derived ? <Pill tone="info">Derived</Pill> : null}{' '}
                      {row.status === 'Unpriced' ? <Pill tone="warn">Unpriced</Pill> : <Pill tone="good">Priced</Pill>}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Pill tone="neutral">Speaker rows: {speakerRows.length}</Pill>
          <Pill tone="neutral">Subwoofer rows: {subwooferRows.length}</Pill>
          <Pill tone="info">Derived amplifiers ({SUBWOOFER_AMPLIFIER_MODEL}): {amplifierRows.length}</Pill>
        </div>
      </div>
    </IntelligenceCard>
  );
}