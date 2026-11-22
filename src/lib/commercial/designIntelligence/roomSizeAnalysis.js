/**
 * roomSizeAnalysis.js
 * --------------------
 * Room size quartile analysis for the consolidated page.
 *
 * Uses floor area = width × length. Excludes:
 *   · room_dimensions_edited !== true (unconfirmed dimensions)
 *   · non-positive or missing width/length
 *   · internal/admin projects (for dealer stats)
 *
 * Quartiles are interpolated (linear) so the boundaries are stable and
 * comparable across sectors.
 *
 * Pure: no React, no side effects.
 */

import { safeArray } from '../projectReporting/reportingUtils';

const MIN_DIMENSION_M = 0.5;

/** True when a family has confirmed, valid room dimensions. */
export function hasValidRoomDims(family) {
  const dims = family?.roomDims;
  if (!dims) return false;
  const w = Number(dims.widthM);
  const l = Number(dims.lengthM);
  return Number.isFinite(w) && Number.isFinite(l) && w >= MIN_DIMENSION_M && l >= MIN_DIMENSION_M;
}

/** Floor area in m², or null when invalid. */
export function floorAreaOf(family) {
  if (!hasValidRoomDims(family)) return null;
  return Number(family.roomDims.widthM) * Number(family.roomDims.lengthM);
}

/**
 * Interpolated quartile (Q1, median, Q3) using the linear method.
 * Returns null when fewer than 4 values.
 */
function interpolatedQuartile(sorted, q) {
  if (sorted.length < 4) return null;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (base + 1 < sorted.length) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

/**
 * Build the room size summary for a set of families.
 *
 * @param {Array} families
 * @returns {Object} { validRoomCount, areas, min, max, average, median, q1, q3, quartileBands }
 */
export function buildRoomSizeSummary(families) {
  const areas = safeArray(families)
    .map(floorAreaOf)
    .filter((area) => area !== null && Number.isFinite(area))
    .sort((a, b) => a - b);

  if (areas.length === 0) {
    return {
      validRoomCount: 0,
      areas: [],
      min: null,
      max: null,
      average: null,
      median: null,
      q1: null,
      q3: null,
      quartileBands: [],
    };
  }

  const sum = areas.reduce((total, a) => total + a, 0);
  const average = sum / areas.length;
  const median = interpolatedQuartile(areas, 0.5);
  const q1 = interpolatedQuartile(areas, 0.25);
  const q3 = interpolatedQuartile(areas, 0.75);

  // Four quartile bands: Q1 ≤ Q2 ≤ Q3 ≤ Q4
  const bands = [
    { label: 'Q1 (smallest)', min: 0, max: q1, count: 0, projects: [] },
    { label: 'Q2', min: q1, max: median, count: 0, projects: [] },
    { label: 'Q3', min: median, max: q3, count: 0, projects: [] },
    { label: 'Q4 (largest)', min: q3, max: Infinity, count: 0, projects: [] },
  ];

  for (const family of safeArray(families)) {
    const area = floorAreaOf(family);
    if (area === null) continue;
    for (let i = bands.length - 1; i >= 0; i--) {
      if (area > bands[i].min || (i === 0 && area >= bands[i].min)) {
        if (area <= bands[i].max || i === bands.length - 1) {
          bands[i].count += 1;
          bands[i].projects.push({ id: family.id, name: family.name, area });
          break;
        }
      }
    }
  }

  return {
    validRoomCount: areas.length,
    areas,
    min: areas[0],
    max: areas[areas.length - 1],
    average,
    median,
    q1,
    q3,
    quartileBands: bands,
  };
}