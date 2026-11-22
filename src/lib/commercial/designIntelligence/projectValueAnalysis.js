/**
 * projectValueAnalysis.js
 * ------------------------
 * Project value statistics for the consolidated page.
 *
 * Keeps Live Design Value (current retail ex VAT from the active version
 * priced against the Product Master) and Quoted Snapshot Value (frozen at
 * proposal generation) strictly separate. Neither is ever added to the
 * other. An unpriced project is reported as unpriced, never as zero.
 *
 * Pure: no React, no side effects.
 */

import { safeArray } from '../projectReporting/reportingUtils';

/**
 * Build value statistics for a set of families.
 *
 * @param {Array} families
 * @returns {Object} { live, quoted, fullyPricedCount, partiallyPricedCount, unpricedCount }
 */
export function buildProjectValueSummary(families) {
  const list = safeArray(families);

  const liveValues = list
    .map((f) => f.liveValue)
    .filter((v) => v !== null && v !== undefined && Number.isFinite(Number(v)))
    .map(Number);

  const quotedValues = list
    .map((f) => f.quotedValue)
    .filter((v) => v !== null && v !== undefined && Number.isFinite(Number(v)))
    .map(Number);

  const stats = (values) => {
    if (values.length === 0) return { total: null, min: null, max: null, average: null, count: 0 };
    const total = values.reduce((sum, v) => sum + v, 0);
    return {
      total,
      min: Math.min(...values),
      max: Math.max(...values),
      average: total / values.length,
      count: values.length,
    };
  };

  const fullyPriced = list.filter((f) => f.liveValue !== null && (f.unpricedLineCount || 0) === 0);
  const partiallyPriced = list.filter((f) => f.liveValue !== null && (f.unpricedLineCount || 0) > 0);
  const unpriced = list.filter((f) => f.liveValue === null);

  return {
    live: stats(liveValues),
    quoted: stats(quotedValues),
    fullyPricedCount: fullyPriced.length,
    partiallyPricedCount: partiallyPriced.length,
    unpricedCount: unpriced.length,
    total: list.length,
  };
}