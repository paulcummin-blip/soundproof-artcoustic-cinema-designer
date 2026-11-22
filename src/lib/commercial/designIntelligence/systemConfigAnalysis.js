/**
 * systemConfigAnalysis.js
 * ------------------------
 * System configuration frequency analysis for the consolidated page.
 *
 * Reads the active version's Dolby configuration, bed-channel count,
 * overhead count and subwoofer count. Counts ONE version per project
 * (the active version), never summing variations.
 *
 * Pure: no React, no side effects.
 */

import { safeArray, text } from '../projectReporting/reportingUtils';

/** The active variation of a family (the one currently loaded in the designer). */
function activeVariationOf(family) {
  return safeArray(family?.variations).find((v) => v.isActive) || safeArray(family?.variations)[0] || null;
}

/** Count enabled subwoofer instances from the active variation's lines. */
function countSubwoofersFromLines(variation) {
  const lines = safeArray(variation?.lines);
  let count = 0;
  for (const line of lines) {
    const desc = text(line?.description || line?.model).toLowerCase();
    if (desc.includes('sub')) {
      count += Number(line?.count ?? line?.qty) || 0;
    }
  }
  return count;
}

/**
 * Build the system configuration summary for a set of families.
 *
 * @param {Array} families
 * @returns {Object} { dolbyConfigs, bedCounts, overheadCounts, subwooferCounts, totalProjects }
 */
export function buildSystemConfigSummary(families) {
  const list = safeArray(families);
  const dolbyMap = new Map();
  const bedMap = new Map();
  const overheadMap = new Map();
  const subMap = new Map();
  let totalWithConfig = 0;

  for (const family of list) {
    const variation = activeVariationOf(family);
    const format = text(variation?.format || family?.format).trim();
    if (format) {
      dolbyMap.set(format, (dolbyMap.get(format) || 0) + 1);
      totalWithConfig += 1;
    }

    // Bed channel count = the number before the first dot in the Dolby config
    if (format) {
      const bedMatch = format.match(/^(\d+)\./);
      if (bedMatch) {
        const bed = Number(bedMatch[1]);
        bedMap.set(bed, (bedMap.get(bed) || 0) + 1);
      }
    }

    // Overhead count = the number after the last dot
    if (format) {
      const overheadMatch = format.match(/\.(\d+)$/);
      if (overheadMatch) {
        const overhead = Number(overheadMatch[1]);
        overheadMap.set(overhead, (overheadMap.get(overhead) || 0) + 1);
      }
    }

    // Subwoofer count = the middle number (x.y.z) or counted from lines
    if (format) {
      const subMatch = format.match(/\.(\d+)\./);
      if (subMatch) {
        const subs = Number(subMatch[1]);
        subMap.set(subs, (subMap.get(subs) || 0) + 1);
      }
    }
  }

  const mapToSorted = (map) => [...map.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || Number(a.value) - Number(b.value));

  return {
    dolbyConfigs: mapToSorted(dolbyMap),
    bedCounts: mapToSorted(bedMap),
    overheadCounts: mapToSorted(overheadMap),
    subwooferCounts: mapToSorted(subMap),
    totalProjects: list.length,
    totalWithConfig,
  };
}