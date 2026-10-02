/**
 * reportWarnings.js
 * -----------------
 * The warning panel data for Project Intelligence.
 *
 * A warning is raised rather than a value being guessed: an unknown
 * dealer-specific status, a project whose live value cannot be calculated, an
 * unpriced product line, an inactive product in use, or a possible duplicate
 * project. Nothing here is resolved automatically.
 *
 * Pure: no React, no side effects.
 */

import { BUCKET } from './statusBuckets';

/**
 * @param {Object} input
 * @param {Array} input.families — filtered project families
 * @param {Array} input.duplicates — detectPossibleDuplicates output
 * @param {Array} input.productDemand — buildProductDemand output
 * @returns {Array<Object>} warning rows
 */
export function buildWarnings({ families = [], duplicates = [], productDemand = [] } = {}) {
  const warnings = [];

  for (const family of families) {
    if (family.bucket === BUCKET.UNCLASSIFIED) {
      warnings.push({
        type: 'unclassified_status',
        severity: 'warning',
        projectId: family.id,
        projectName: family.name,
        message: `Unclassified status: ${family.bucketReason || family.rawStatusLabel}`,
        detail: `Raw status: ${family.rawStatusLabel} · Account: ${family.accountName || '—'}`,
      });
    }

    if (family.quotedValue === null) {
      warnings.push({
        type: 'no_quoted_value',
        severity: 'info',
        projectId: family.id,
        projectName: family.name,
        message: family.quotedReason || 'No quoted snapshot value',
        detail: `Live Design Value: ${family.liveValue === null ? 'not calculable' : 'available'}`,
      });
    }

    if (family.liveValue === null) {
      warnings.push({
        type: 'unpriced_project',
        severity: 'warning',
        projectId: family.id,
        projectName: family.name,
        message: 'Live Design Value is not calculable for this project',
        detail: family.livePriceListAvailable
          ? `${family.productLineCount} product lines · ${family.unpricedLineCount} unpriced`
          : 'Price list not available for this territory',
      });
    } else if (family.unpricedLineCount > 0) {
      warnings.push({
        type: 'unpriced_project',
        severity: 'warning',
        projectId: family.id,
        projectName: family.name,
        message: `${family.unpricedLineCount} product line${family.unpricedLineCount === 1 ? '' : 's'} have no price`,
        detail: 'Unpriced lines are excluded from the value and are never treated as zero.',
      });
    }

    if (family.inactiveLineCount > 0) {
      warnings.push({
        type: 'inactive_product',
        severity: 'warning',
        projectId: family.id,
        projectName: family.name,
        message: `${family.inactiveLineCount} inactive product line${family.inactiveLineCount === 1 ? '' : 's'} in the active version`,
        detail: 'Inactive products never contribute to the value.',
      });
    }
  }

  for (const pair of duplicates) {
    warnings.push({
      type: 'possible_duplicate',
      severity: 'info',
      projectId: pair.aId,
      projectName: pair.aName,
      message: `Possible duplicate projects: ${pair.aName} and ${pair.bName}`,
      detail: `Signals: ${pair.signals.join(', ')} · Account: ${pair.accountName || '—'}`,
    });
  }

  for (const row of productDemand) {
    if (row.inactive) {
      warnings.push({
        type: 'inactive_product',
        severity: 'warning',
        projectId: null,
        projectName: row.product,
        message: `Inactive product in use: ${row.product}`,
        detail: `SKU ${row.sku || '—'} · ${row.projectFamilies} project famil${row.projectFamilies === 1 ? 'y' : 'ies'}`,
      });
    }
  }

  return warnings;
}