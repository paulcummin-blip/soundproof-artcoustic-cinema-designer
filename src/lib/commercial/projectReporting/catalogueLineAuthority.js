/**
 * catalogueLineAuthority.js
 * -------------------------
 * The single authority for what belongs in Product Demand: Artcoustic catalogue
 * lines only.
 *
 * Product Demand is Artcoustic product forecasting, so a priced line counts only
 * when it resolves to a real Product Master record — the approved Artcoustic
 * catalogue. Everything the design or the pricing engine added alongside the
 * catalogue is classified out WITH A REASON and reported separately, never
 * silently dropped:
 *
 *   · manual extras    — hand-typed lines (projector, manual amplifier, labour,
 *                        install, cables, racks, custom lines). The pricing
 *                        engine keys every one of them 'manual-extra'.
 *   · unresolved lines — a SKU the Product Master does not know, which is not an
 *                        approved catalogue item.
 *
 * Derived Artcoustic lines the pricing engine generates (the CPH-1000D
 * subwoofer amplifier and the Abfuser acoustic treatment) resolve like any other
 * product and are kept, marked Derived.
 *
 * Pure: no React, no side effects, no entity access.
 */

import { text } from './reportingUtils';

/** Pricing-engine generated Artcoustic line keys. */
const ENGINE_DERIVED_KEYS = ['cph-1000d', '500027'];

export const CATALOGUE_REASON = {
  MANUAL: 'Manual extra — not an Artcoustic catalogue item',
  UNRESOLVED: 'Not in the Artcoustic Product Master',
  NO_IDENTITY: 'Line has no product identity',
};

/** A line the pricing engine generated from the design (amplifier, treatment). */
export function isEngineDerivedLine(value) {
  return ENGINE_DERIVED_KEYS.includes(text(value).toLowerCase());
}

/** The line's product identity: the model key the engine wrote, or a SKU. */
export function lineSku(line) {
  return text(line?.sku || line?.model);
}

/** Whether a Product Master index is actually available to check against. */
export function isCatalogueIndexAvailable(priceMap) {
  if (!priceMap || typeof priceMap.get !== 'function') return false;
  if (typeof priceMap.size === 'number') return priceMap.size > 0;
  return true;
}

/** Manual extras are hand-typed lines, never catalogue products. */
export function isManualLine(line) {
  if (line?.isManual === true) return true;
  return lineSku(line).toLowerCase() === 'manual-extra';
}

/**
 * Resolve one line to its Product Master record. Soundbar size variants are
 * keyed 'model:value' in the master, so the size is tried after the base model.
 */
export function resolveCatalogueProduct(line, priceMap) {
  if (!priceMap?.get) return null;
  const sku = lineSku(line);
  if (!sku) return null;
  const direct = priceMap.get(sku);
  if (direct) return direct;
  const size = text(line?.sizeValue);
  if (size) return priceMap.get(`${sku}:${size}`) || null;
  return null;
}

/**
 * Classify one priced line against the Artcoustic Product Master.
 *
 * @returns {{ eligible: boolean, reason: string|null, product: Object|null, sku: string, derived: boolean }}
 */
export function classifyCatalogueLine(line, priceMap) {
  const sku = lineSku(line);

  if (isManualLine(line)) {
    return { eligible: false, reason: CATALOGUE_REASON.MANUAL, product: null, sku: sku || 'manual-extra', derived: false };
  }
  if (!sku) {
    return { eligible: false, reason: CATALOGUE_REASON.NO_IDENTITY, product: null, sku: '', derived: false };
  }

  const product = resolveCatalogueProduct(line, priceMap);
  if (product) {
    return {
      eligible: true,
      reason: null,
      product,
      sku,
      derived: isEngineDerivedLine(sku) || line?.isAbfuser === true,
    };
  }

  // No catalogue index at all: there is nothing to check the line against, so it
  // is kept and reported as unresolved (Unpriced) instead of being dropped as if
  // the catalogue had rejected it. With the catalogue available, a SKU it does
  // not know is a non-catalogue line and is excluded.
  if (!isCatalogueIndexAvailable(priceMap)) {
    return {
      eligible: true,
      reason: null,
      product: null,
      sku,
      derived: isEngineDerivedLine(sku) || line?.isAbfuser === true,
    };
  }

  return { eligible: false, reason: CATALOGUE_REASON.UNRESOLVED, product: null, sku, derived: false };
}