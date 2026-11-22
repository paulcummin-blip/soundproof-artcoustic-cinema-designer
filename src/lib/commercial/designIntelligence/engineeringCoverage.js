/**
 * engineeringCoverage.js
 * ----------------------
 * Engineering publication coverage for the consolidated page.
 *
 * Reads the active version's published_fingerprint to determine whether
 * a valid current engineering publication exists. Does NOT infer RP22
 * results from speaker count or configuration. Missing publications are
 * reported as "unavailable", never as "failed".
 *
 * Pure: no React, no side effects.
 */

import { safeArray } from '../projectReporting/reportingUtils';

/** The active variation of a family. */
function activeVariationOf(family) {
  return safeArray(family?.variations).find((v) => v.isActive) || safeArray(family?.variations)[0] || null;
}

/**
 * Build the engineering coverage summary for a set of families.
 *
 * @param {Array} families
 * @returns {Object} { publishedCount, unpublishedCount, total, coveragePercent, publishedFamilies, unpublishedFamilies }
 */
export function buildEngineeringCoverage(families) {
  const list = safeArray(families);
  let published = 0;
  const publishedFamilies = [];
  const unpublishedFamilies = [];

  for (const family of list) {
    const variation = activeVariationOf(family);
    if (variation?.publicationSummary) {
      published += 1;
      publishedFamilies.push({
        id: family.id,
        name: family.name,
        dealerName: family.dealerName || family.accountName,
        publishedAt: variation.publicationSummary.publishedAt,
        engineVersion: variation.publicationSummary.engineVersion,
      });
    } else {
      unpublishedFamilies.push({
        id: family.id,
        name: family.name,
        dealerName: family.dealerName || family.accountName,
      });
    }
  }

  return {
    publishedCount: published,
    unpublishedCount: list.length - published,
    total: list.length,
    coveragePercent: list.length > 0 ? Math.round((published / list.length) * 100) : 0,
    publishedFamilies,
    unpublishedFamilies,
  };
}