// src/components/data/polar/SpitfireCloud/index.jsx
// Measured PAS/FRD dataset module for Spitfire Cloud.
//
// The measurement data itself is the exact JSON file supplied by the user (MLS SPL FRD
// measurements only — phase, GIFs, filters, diffraction, VituixCAD full-space and driver
// response files were all excluded during conversion). It is fetched verbatim at runtime from
// its hosted location — no values are transcribed, smoothed, normalised or resampled here. This
// keeps the uploaded file as the single source of truth and avoids transcription risk for a
// 623-point x 22-angle measurement set.
//
// STILL NOT ENABLED: no speaker registry entry declares polarModel for Spitfire Cloud yet.

const DATASET_URL = "https://media.base44.com/files/public/6a1166c68ddc81e5ea2cdf6b/cb4bbcfc8_SpitfireCloud_polar_dataset.json";

// Converts the source file's [frequencyHz, splDb] tuples into the loader's point-object shape.
// This is a lossless reshape only — no numeric value is altered, dropped, smoothed or resampled.
function tuplesToPoints(tuples) {
  if (!Array.isArray(tuples)) return [];
  const points = [];
  for (const rec of tuples) {
    if (!Array.isArray(rec) || rec.length !== 2) continue;
    const [frequency, spl] = rec;
    if (!Number.isFinite(frequency) || !Number.isFinite(spl)) continue;
    points.push({ frequency, spl });
  }
  return points;
}

let cache = null; // { horizontal, vertical } once fetched
let fetchPromise = null;

// Kicks off (or reuses) the fetch of the real measurement file. Resolves once cached. Safe to
// call repeatedly — subsequent calls return the same in-flight/resolved promise.
export function fetchSpitfireCloudDataset() {
  if (cache) return Promise.resolve(cache);
  if (!fetchPromise) {
    fetchPromise = fetch(DATASET_URL)
      .then((res) => res.json())
      .then((raw) => {
        const horizontal = {};
        const vertical = {};
        for (const angle of Object.keys(raw.horizontalDataset || {})) {
          horizontal[angle] = tuplesToPoints(raw.horizontalDataset[angle]);
        }
        for (const angle of Object.keys(raw.verticalDataset || {})) {
          vertical[angle] = tuplesToPoints(raw.verticalDataset[angle]);
        }
        cache = { horizontal, vertical };
        return cache;
      });
  }
  return fetchPromise;
}

// Synchronous accessor for the loader — returns {} until fetchSpitfireCloudDataset() has resolved
// at least once (the loader triggers that fetch in the background on first miss).
export default {
  get horizontal() {
    return cache?.horizontal || {};
  },
  get vertical() {
    return cache?.vertical || {};
  },
};