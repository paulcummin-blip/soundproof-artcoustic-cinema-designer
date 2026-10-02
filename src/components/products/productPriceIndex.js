// productPriceIndex.js
// -------------------
// Builds the price index the pricing engine reads: a Map of SKU → product
// record, plus the soundbar size options keyed by base model.
//
// Extracted verbatim from useProductMaster so a non-React consumer (commercial
// reporting) can build the same index from the same Product Master payload
// without duplicating the rules.
//
// Pure: no React, no side effects.

/**
 * @param {Array} products — product records from getAuthorizedProductMaster
 * @returns {{ priceMap: Map<string, Object>, soundbarOptions: Object }}
 */
export function buildProductPriceIndex(products) {
  const priceMap = new Map();
  const soundbarOptions = {};

  for (const product of Array.isArray(products) ? products : []) {
    if (!product?.sku) continue;
    priceMap.set(product.sku, product);
    if (!product.sku.includes(':') || product.active === false) continue;
    const colonIndex = product.sku.indexOf(':');
    const model = product.sku.slice(0, colonIndex);
    const value = product.sku.slice(colonIndex + 1);
    if (!soundbarOptions[model]) soundbarOptions[model] = [];
    soundbarOptions[model].push({
      value,
      label: product.label?.split('—')[1]?.trim() || value,
      priceExVat: product.price_ex_vat,
    });
  }

  for (const options of Object.values(soundbarOptions)) {
    options.sort((a, b) => String(a.value).localeCompare(String(b.value)));
  }

  return { priceMap, soundbarOptions };
}