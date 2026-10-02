/**
 * productDemandSort.js
 * --------------------
 * The sort authority for the Project Intelligence Product Demand table and its
 * export. It orders the demand rows the calculation already produced — it never
 * changes a quantity, a value, a category or a status, and it never removes a
 * row. The same order is therefore available to the screen and to the workbook.
 *
 * Sorting rules:
 *  - Text columns (Product / model, SKU, Category) order alphabetically, case
 *    insensitively.
 *  - Quantity orders by the counted catalogue quantity itself. Product Demand
 *    carries no quoted snapshot or non-counted version quantity, so nothing else
 *    can influence the ordering.
 *  - Included projects using it orders by the number of contributing projects.
 *  - Trade value orders numerically on the Artcoustic-only figure. A line with no
 *    usable price is not a value of zero, so unpriced lines stay at the end in
 *    both directions rather than being shown as the cheapest products.
 *  - Derived line groups Not derived before Derived.
 *  - Priced groups Priced, then Unpriced, then Inactive.
 *  - Every comparison falls back to Product / model and then SKU, so a given set
 *    of rows never reorders arbitrarily and the export always matches the screen.
 *
 * Pure: no React, no DOM, no entity access.
 */

const text = (value) => (value === null || value === undefined ? '' : String(value));

/** Alphabetical text comparison, ignoring case, in the requested direction. */
const byText = (left, right, direction) => (
  text(left).localeCompare(text(right), undefined, { sensitivity: 'base' }) * direction
);

const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const numberOrNull = (value) => (
  value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Number(value)
);

// The displayed Priced grouping, in the order an admin reads it.
const PRICED_ORDER = ['Priced', 'Unpriced', 'Inactive'];
const pricedRank = (row) => {
  const index = PRICED_ORDER.indexOf(text(row.status));
  return index === -1 ? PRICED_ORDER.length : index;
};

/**
 * The Product Demand columns, in display order. The table headings and the sort
 * registry are built from this one list, so a heading and its sort can never
 * drift apart.
 */
export const PRODUCT_DEMAND_SORT_COLUMNS = [
  {
    key: 'product',
    label: 'Product / model',
    align: 'left',
    hint: 'Sort alphabetically by product name',
    compare: (a, b, direction) => byText(a.product, b.product, direction),
  },
  {
    key: 'sku',
    label: 'SKU',
    align: 'left',
    hint: 'Sort alphabetically by SKU',
    compare: (a, b, direction) => byText(a.sku, b.sku, direction),
  },
  {
    key: 'category',
    label: 'Category',
    align: 'left',
    hint: 'Sort alphabetically by category',
    compare: (a, b, direction) => byText(a.category, b.category, direction),
  },
  {
    key: 'quantity',
    label: 'Quantity',
    align: 'right',
    hint: 'Sort by counted catalogue quantity',
    compare: (a, b, direction) => (
      (number(a.quantity) - number(b.quantity)) * direction
      || (number(a.quotedQuantity) - number(b.quotedQuantity)) * direction
    ),
  },
  {
    key: 'projectFamilies',
    label: 'Included projects using it',
    align: 'right',
    hint: 'Sort by the number of included projects using this product',
    compare: (a, b, direction) => (number(a.projectFamilies) - number(b.projectFamilies)) * direction,
  },
  {
    key: 'tradeValue',
    label: 'Trade value',
    align: 'right',
    hint: 'Sort by Artcoustic trade value, highest first when descending. Unpriced lines are always kept last.',
    compare: (a, b, direction) => {
      const left = numberOrNull(a.tradeValue);
      const right = numberOrNull(b.tradeValue);
      if (left === null && right === null) return 0;
      if (left === null) return 1;
      if (right === null) return -1;
      return (left - right) * direction;
    },
  },
  {
    key: 'derived',
    label: 'Derived line',
    align: 'left',
    hint: 'Sort by derived line, not derived first',
    compare: (a, b, direction) => ((a.derived ? 1 : 0) - (b.derived ? 1 : 0)) * direction,
  },
  {
    key: 'status',
    label: 'Priced',
    align: 'left',
    hint: 'Sort by priced, grouped Priced, Unpriced, Inactive',
    compare: (a, b, direction) => (pricedRank(a) - pricedRank(b)) * direction,
  },
];

const COLUMNS_BY_KEY = new Map(PRODUCT_DEMAND_SORT_COLUMNS.map((column) => [column.key, column]));

/**
 * The opening view: the Artcoustic products that represent the most commercial
 * value.
 */
export const DEFAULT_PRODUCT_DEMAND_SORT = { key: 'tradeValue', direction: 'desc' };

export const PRODUCT_DEMAND_SORT_LABEL = 'Artcoustic trade value, highest first';

/** A usable sort state, falling back to the default when nothing valid is given. */
export function resolveProductDemandSort(sort) {
  const key = COLUMNS_BY_KEY.has(sort?.key) ? sort.key : DEFAULT_PRODUCT_DEMAND_SORT.key;
  const direction = sort?.direction === 'asc' ? 'asc' : (sort?.direction === 'desc' ? 'desc' : DEFAULT_PRODUCT_DEMAND_SORT.direction);
  return { key, direction };
}

/**
 * The next sort state for a heading click: a new column opens ascending, and the
 * active column flips between ascending and descending.
 */
export function nextProductDemandSort(current, key) {
  const resolved = resolveProductDemandSort(current);
  if (!COLUMNS_BY_KEY.has(key)) return resolved;
  if (resolved.key === key) {
    return { key, direction: resolved.direction === 'asc' ? 'desc' : 'asc' };
  }
  return { key, direction: 'asc' };
}

/** The heading suffix shown on the active column. */
export function productDemandSortIndicator(activeSort, columnKey) {
  const resolved = resolveProductDemandSort(activeSort);
  if (resolved.key !== columnKey) return '';
  return resolved.direction === 'asc' ? '▲' : '▼';
}

/**
 * A new array of the same rows, in the requested order. The input is never
 * mutated, so no demand total can be affected by sorting.
 *
 * @param {Array<Object>} rows — demand rows from the demand calculation
 * @param {Object} sort — { key, direction }
 * @returns {Array<Object>}
 */
export function sortProductDemandRows(rows = [], sort = DEFAULT_PRODUCT_DEMAND_SORT) {
  const resolved = resolveProductDemandSort(sort);
  const column = COLUMNS_BY_KEY.get(resolved.key);
  const direction = resolved.direction === 'asc' ? 1 : -1;

  return [...rows].sort((a, b) => {
    const primary = column.compare(a, b, direction);
    if (primary !== 0) return primary;
    // Deterministic fallback, independent of direction.
    return byText(a.product, b.product, 1) || byText(a.sku, b.sku, 1);
  });
}