/**
 * productDemand.js
 * ----------------
 * Product demand for Project Intelligence.
 *
 * Demand is aggregated from the SAME priced line output the pricing engine
 * produced for each project's active version — never from raw selected_speakers,
 * which are only a fallback quantity source and never a price source. Quoted
 * demand comes from the frozen proposal snapshot breakdown.
 *
 * Unpriced and inactive products stay visible and are never treated as zero.
 *
 * Pure: no React, no side effects.
 */

import { STATUS_BUCKETS } from './statusBuckets';
import { text } from './reportingUtils';

const DERIVED_LINE_PATTERNS = ['cph-1000d', '500027', 'manual-extra'];

export function isDerivedLine(model) {
  return DERIVED_LINE_PATTERNS.includes(text(model).toLowerCase());
}

/**
 * The variation whose priced lines count as demand for this project.
 *
 * A project's versions are design options and a client cannot buy every option,
 * so only the ONE counted version contributes. The counted version is chosen in
 * the selection layer; when a caller has not chosen one, the active version is
 * used exactly as before.
 */
function countedVariationOf(family) {
  const variations = family?.variations || [];
  if (family?.countedVariationId) {
    const chosen = variations.find((variation) => variation.id === family.countedVariationId);
    if (chosen) return chosen;
  }
  return variations.find((variation) => variation.isActive) || variations[0];
}

/**
 * @param {Object} input
 * @param {Array} input.families — filtered project families
 * @param {Map} input.priceMap — Product Master index (sku → product)
 * @returns {Array<Object>} demand rows
 */
export function buildProductDemand({ families = [], priceMap = null } = {}) {
  const rows = new Map();

  const ensureRow = (sku, label) => {
    const key = text(sku).toLowerCase() || text(label).toLowerCase();
    if (!key) return null;
    if (!rows.has(key)) {
      const product = priceMap?.get?.(text(sku)) || null;
      rows.set(key, {
        sku: text(sku) || null,
        product: product?.label || label || text(sku) || 'Unknown product',
        category: product?.category || product?.product_type || (isDerivedLine(sku) ? 'Derived line' : '—'),
        quantity: 0,
        projectIds: new Set(),
        qtyByBucket: Object.fromEntries(STATUS_BUCKETS.map((bucket) => [bucket.key, 0])),
        liveValue: 0,
        quotedValue: 0,
        quotedQuantity: 0,
        derived: isDerivedLine(sku),
        priced: true,
        inactive: false,
        unpricedQuantity: 0,
        priceKnown: false,
      });
    }
    return rows.get(key);
  };

  // Live design demand, from the priced schedule of the counted version only.
  for (const family of families) {
    const counted = countedVariationOf(family);
    for (const line of counted?.lines || []) {
      const row = ensureRow(line.model, line.description);
      if (!row) continue;
      const quantity = Number(line.count ?? line.qty) || 0;
      row.quantity += quantity;
      row.projectIds.add(family.id);
      row.qtyByBucket[family.bucket] = (row.qtyByBucket[family.bucket] || 0) + quantity;

      if (line.unitPriceExVat === null || line.unitPriceExVat === undefined) {
        // No price is known for this line: the quantity is still reported, the
        // value is not, and the row is marked Unpriced.
        row.unpricedQuantity += quantity;
        row.priced = false;
        row.inactive = row.inactive || line.inactive === true;
      } else {
        row.priceKnown = true;
        row.liveValue += Number(line.subtotalExVat) || 0;
      }
    }
  }

  // Quoted demand, from the frozen snapshot the quoted value is read from.
  for (const family of families) {
    const snapshotLines = family.quotedSnapshotBreakdown || [];
    for (const line of snapshotLines) {
      const row = ensureRow(line.model, line.description);
      if (!row) continue;
      const quantity = Number(line.quantity) || 0;
      row.quotedQuantity += quantity;
      row.projectIds.add(family.id);
      row.quotedValue += Number(line.subtotal_ex_vat) || 0;
      if (line.unit_price_ex_vat === null || line.unit_price_ex_vat === undefined) row.priced = false;
    }
  }

  return [...rows.values()]
    .map((row) => ({
      ...row,
      projectFamilies: row.projectIds.size,
      // The contributing project ids are kept so the demand table can show which
      // included projects produced each quantity.
      projectIds: [...row.projectIds],
      liveValue: row.priceKnown || row.liveValue > 0 ? row.liveValue : null,
      quotedValue: row.quotedQuantity > 0 ? row.quotedValue : null,
      status: row.inactive ? 'Inactive' : (row.priced ? 'Priced' : 'Unpriced'),
    }))
    .sort((a, b) => (b.quantity + b.quotedQuantity) - (a.quantity + a.quotedQuantity));
}