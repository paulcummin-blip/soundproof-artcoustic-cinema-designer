// src/components/utils/rp22/measuredDatasetLoader.jsx
// RP22 P17 MEASURED ENGINE — Stage 2A: measurement data loader.
//
// Resolves a named dataset (e.g. "SpitfireCloud") from the measured polar dataset registry
// (src/components/data/polar/index.jsx) into discovered angles, frequency range/resolution, and
// per-angle curves — WITHOUT assuming any fixed angle spacing or frequency spacing. Angles and
// frequencies are always discovered from the dataset content itself.
//
// This file contains NO measurement data. It only reads whatever the dataset module exports.

import { getMeasuredDatasetModule } from "@/components/data/polar/index";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

// Discover the measured angles present in a horizontal/vertical dataset map, sorted ascending.
// Does not assume any fixed spacing — reads whatever angle keys actually exist.
function discoverAngles(datasetMap) {
  if (!datasetMap || typeof datasetMap !== "object") return [];
  return Object.keys(datasetMap).map(Number).filter(isNum).sort((a, b) => a - b);
}

// Discover the frequency range covered across all curves in a dataset map.
function discoverFrequencyRange(datasetMap) {
  let lowHz = null;
  let highHz = null;
  for (const angle of Object.keys(datasetMap || {})) {
    const curve = datasetMap[angle];
    if (!Array.isArray(curve)) continue;
    for (const point of curve) {
      if (!isNum(point?.frequency)) continue;
      lowHz = lowHz == null ? point.frequency : Math.min(lowHz, point.frequency);
      highHz = highHz == null ? point.frequency : Math.max(highHz, point.frequency);
    }
  }
  return { lowHz, highHz };
}

// Discover the frequency resolution actually present in the dataset — does not assume fixed
// spacing. Returns the distinct point-to-point gaps found (Hz) so callers can see whether the
// measurement grid is uniform or irregular, plus the largest point count found.
function discoverFrequencyResolution(datasetMap) {
  const gaps = new Set();
  let pointCount = 0;
  for (const angle of Object.keys(datasetMap || {})) {
    const curve = datasetMap[angle];
    if (!Array.isArray(curve) || curve.length < 2) continue;
    const freqs = curve.map((p) => p.frequency).filter(isNum).sort((a, b) => a - b);
    pointCount = Math.max(pointCount, freqs.length);
    for (let i = 1; i < freqs.length; i++) {
      gaps.add(Number((freqs[i] - freqs[i - 1]).toFixed(3)));
    }
  }
  return {
    pointCount,
    uniform: gaps.size <= 1,
    distinctGapsHz: Array.from(gaps).sort((a, b) => a - b),
  };
}

/**
 * Load a named measured dataset (horizontal + vertical maps), discovering its angles and
 * frequency coverage directly from its content — no assumed spacing of any kind.
 *
 * @param {string} datasetName - e.g. "SpitfireCloud", matched against the dataset registry.
 */
export function loadMeasuredDataset(datasetName) {
  const mod = getMeasuredDatasetModule(datasetName);

  if (!mod) {
    return {
      found: false,
      horizontal: null,
      vertical: null,
      horizontalAngles: [],
      verticalAngles: [],
      frequencyRange: { lowHz: null, highHz: null },
      frequencyResolution: { pointCount: 0, uniform: true, distinctGapsHz: [] },
      missingDataWarnings: [`Measured dataset unavailable: no dataset registered as "${datasetName}".`],
    };
  }

  const horizontal = mod.horizontal || {};
  const vertical = mod.vertical || {};
  const horizontalAngles = discoverAngles(horizontal);
  const verticalAngles = discoverAngles(vertical);

  const warnings = [];
  if (!horizontalAngles.length) warnings.push(`Measured dataset unavailable: no horizontal angles found for "${datasetName}".`);
  if (!verticalAngles.length) warnings.push(`Measured dataset unavailable: no vertical angles found for "${datasetName}".`);

  const hRange = discoverFrequencyRange(horizontal);
  const vRange = discoverFrequencyRange(vertical);
  const allLows = [hRange.lowHz, vRange.lowHz].filter(isNum);
  const allHighs = [hRange.highHz, vRange.highHz].filter(isNum);
  const frequencyRange = {
    lowHz: allLows.length ? Math.min(...allLows) : null,
    highHz: allHighs.length ? Math.max(...allHighs) : null,
  };

  const hRes = discoverFrequencyResolution(horizontal);
  const vRes = discoverFrequencyResolution(vertical);
  const frequencyResolution = {
    pointCount: Math.max(hRes.pointCount, vRes.pointCount),
    uniform: hRes.uniform && vRes.uniform,
    distinctGapsHz: Array.from(new Set([...hRes.distinctGapsHz, ...vRes.distinctGapsHz])).sort((a, b) => a - b),
  };

  return {
    found: true,
    horizontal,
    vertical,
    horizontalAngles,
    verticalAngles,
    frequencyRange,
    frequencyResolution,
    missingDataWarnings: warnings,
  };
}

/**
 * Validation summary for a named measured dataset — reports exactly what the loader discovered,
 * with no assumptions about angle or frequency spacing.
 *
 * @param {string} datasetName
 * @returns {{
 *   validationStatus: 'missing'|'incomplete'|'valid',
 *   horizontalAnglesFound: number,
 *   verticalAnglesFound: number,
 *   frequencyRangeFound: {lowHz:number|null, highHz:number|null},
 *   frequencyResolution: {pointCount:number, uniform:boolean, distinctGapsHz:number[]},
 *   missingDataWarnings: string[],
 *   readyForMeasuredP17: boolean,
 * }}
 */
export function validateMeasuredDataset(datasetName) {
  const loaded = loadMeasuredDataset(datasetName);

  const readyForMeasuredP17 =
    loaded.found &&
    loaded.horizontalAngles.length > 0 &&
    loaded.verticalAngles.length > 0 &&
    loaded.missingDataWarnings.length === 0;

  return {
    validationStatus: !loaded.found ? "missing" : (loaded.missingDataWarnings.length ? "incomplete" : "valid"),
    horizontalAnglesFound: loaded.horizontalAngles.length,
    verticalAnglesFound: loaded.verticalAngles.length,
    frequencyRangeFound: loaded.frequencyRange,
    frequencyResolution: loaded.frequencyResolution,
    missingDataWarnings: loaded.missingDataWarnings,
    readyForMeasuredP17,
  };
}