/**
 * artcousticForecast.js
 * ---------------------
 * The Artcoustic-only commercial forecast: the trade multiplier and the small
 * helpers every forecast surface shares.
 *
 * Project Intelligence forecasts Artcoustic product business, not project
 * accounting. Only Artcoustic catalogue products count (a line has to resolve
 * against the Product Master), every figure is retail ex VAT, and the trade
 * value is derived from that retail at one fixed multiplier so the two figures
 * can never be calculated differently in two places.
 *
 * Pure: no React, no side effects, no entity access.
 */

/** Trade value as a share of Artcoustic retail ex VAT. */
export const ARTCOUSTIC_TRADE_MULTIPLIER = 0.59;

export const ARTCOUSTIC_RETAIL_LABEL = 'Artcoustic retail value';
export const ARTCOUSTIC_TRADE_LABEL = 'Artcoustic trade value';
export const ARTCOUSTIC_RETAIL_HELPER = 'Retail ex VAT, Artcoustic catalogue products only';
export const ARTCOUSTIC_TRADE_HELPER = 'Retail ex VAT × 0.59';

/** Two decimal places, so retail × multiplier never shows float dust. */
const round2 = (value) => Math.round(value * 100) / 100;

const numeric = (value) => (
  value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Number(value)
);

/** Trade value for an Artcoustic retail ex VAT figure. Unknown retail stays unknown. */
export function tradeValueOf(retail) {
  const value = numeric(retail);
  return value === null ? null : round2(value * ARTCOUSTIC_TRADE_MULTIPLIER);
}

/**
 * Retail and trade totals for a list of retail figures. A list with nothing
 * priced has no total at all — never a zero standing in for unknown.
 */
export function sumForecast(retailValues = []) {
  const present = (retailValues || []).map(numeric).filter((value) => value !== null);
  if (present.length === 0) {
    return { retail: null, trade: null, valuedCount: 0, noValueCount: (retailValues || []).length };
  }
  const retail = round2(present.reduce((sum, value) => sum + value, 0));
  return {
    retail,
    trade: tradeValueOf(retail),
    valuedCount: present.length,
    noValueCount: (retailValues || []).length - present.length,
  };
}

/** The Artcoustic catalogue categories, in the order an admin reads them. */
export const FORECAST_CATEGORY_ORDER = [
  'Loudspeaker',
  'Subwoofer',
  'Amplifier',
  'Acoustic Treatment',
  'Accessory',
];

/** A stable key for a category label: case and spacing never split a category. */
export function categoryKeyOf(label) {
  return String(label ?? '').trim().toLowerCase();
}

/** Where a category sits in the reading order; a category we do not know follows. */
export function categoryOrderIndex(label) {
  const key = categoryKeyOf(label);
  const index = FORECAST_CATEGORY_ORDER.findIndex((entry) => categoryKeyOf(entry) === key);
  return index === -1 ? FORECAST_CATEGORY_ORDER.length : index;
}

/** Known Artcoustic categories first, then any other catalogue category, alphabetically. */
export function sortCategoryRows(rows = []) {
  return [...rows].sort((a, b) => (
    categoryOrderIndex(a.label) - categoryOrderIndex(b.label)
    || String(a.label).localeCompare(String(b.label))
  ));
}