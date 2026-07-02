// src/components/data/polar/genericDatasetRegistry.jsx
// GENERIC MEASURED POLAR DATASET PLATFORM
//
// Auto-discovers measured speaker datasets from the folder structure below, using Vite's
// import.meta.glob (build-time file discovery — no per-speaker import statements, no manual
// angle tables, no duplicated index.jsx files):
//
//   src/components/data/polar/<DatasetName>/metadata.json
//   src/components/data/polar/<DatasetName>/horizontal/*.json
//   src/components/data/polar/<DatasetName>/vertical/*.json
//
// Adding a new speaker = adding a folder. This file never needs to change.
//
// Angle keys are derived purely from filenames (0.json -> 0, neg45.json -> -45), never from
// metadata or hard-coded lists. Missing angles are tolerated; extra angles are picked up
// automatically. Unknown/future metadata fields are ignored, not validated against.

const metadataFiles = import.meta.glob("./*/metadata.json", { eager: true });
const horizontalFiles = import.meta.glob("./*/horizontal/*.json", { eager: true });
const verticalFiles = import.meta.glob("./*/vertical/*.json", { eager: true });

function datasetNameFromPath(path) {
  const match = path.match(/^\.\/([^/]+)\//);
  return match ? match[1] : null;
}

// Filename -> angle number. "0.json" -> 0, "45.json" -> 45, "neg45.json" -> -45.
function filenameToAngle(path) {
  const match = path.match(/\/([^/]+)\.json$/);
  if (!match) return null;
  const raw = match[1];
  const negMatch = raw.match(/^neg(\d+(\.\d+)?)$/i);
  if (negMatch) return -Number(negMatch[1]);
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

// Normalizes a raw curve into [{frequency, spl}, ...], accepting either [freq, spl] tuples
// (the on-disk format for this platform) or already-object points, for tolerance.
function normalizeCurve(raw) {
  if (!Array.isArray(raw)) return null;
  return raw
    .map((point) => {
      if (Array.isArray(point)) return { frequency: point[0], spl: point[1] };
      if (point && typeof point === "object") return { frequency: point.frequency, spl: point.spl };
      return null;
    })
    .filter((p) => p && Number.isFinite(p.frequency) && Number.isFinite(p.spl));
}

function buildAngleMap(files, datasetName, subfolder) {
  const map = {};
  const prefix = `./${datasetName}/${subfolder}/`;
  for (const path of Object.keys(files)) {
    if (!path.startsWith(prefix)) continue;
    const angle = filenameToAngle(path);
    if (angle === null) continue;

    const mod = files[path];
    const raw = mod && typeof mod === "object" && "default" in mod ? mod.default : mod;
    const keys = raw && typeof raw === "object" ? Object.keys(raw) : [];
    if (!keys.length) continue; // empty placeholder file — tolerate as a missing angle

    const curve = normalizeCurve(raw[keys[0]]);
    if (curve && curve.length) map[angle] = curve;
  }
  return map;
}

function loadMetadata(datasetName) {
  const path = `./${datasetName}/metadata.json`;
  const mod = metadataFiles[path];
  if (!mod) return null;
  return mod && typeof mod === "object" && "default" in mod ? mod.default : mod;
}

function discoverDatasetNames() {
  const names = new Set();
  for (const path of Object.keys(metadataFiles)) {
    const name = datasetNameFromPath(path);
    if (name) names.add(name);
  }
  return Array.from(names);
}

// Built once at module load — pure discovery, no speaker-specific code.
const GENERIC_DATASETS = {};
for (const name of discoverDatasetNames()) {
  GENERIC_DATASETS[name] = {
    metadata: loadMetadata(name),
    horizontal: buildAngleMap(horizontalFiles, name, "horizontal"),
    vertical: buildAngleMap(verticalFiles, name, "vertical"),
  };
}

/** Returns { metadata, horizontal, vertical } for a discovered dataset, or null. */
export function getGenericDataset(datasetName) {
  return GENERIC_DATASETS[datasetName] || null;
}

/** True only if the dataset has at least one usable horizontal AND vertical angle. */
export function isGenericDatasetUsable(datasetName) {
  const ds = GENERIC_DATASETS[datasetName];
  if (!ds) return false;
  return Object.keys(ds.horizontal).length > 0 && Object.keys(ds.vertical).length > 0;
}

/** All dataset names discovered on disk (usable or not). */
export function listGenericDatasets() {
  return Object.keys(GENERIC_DATASETS);
}

/**
 * Generic validation report for a discovered dataset. Never blocks a partially complete
 * dataset from loading — only reports what is missing/malformed.
 */
export function validateGenericDataset(datasetName) {
  const ds = GENERIC_DATASETS[datasetName];
  if (!ds) {
    return { datasetName, status: "missing", horizontalAngles: [], verticalAngles: [], messages: [`No dataset folder found for "${datasetName}".`] };
  }

  const messages = [];
  if (!ds.metadata) messages.push("metadata.json missing or unreadable.");

  const horizontalAngles = Object.keys(ds.horizontal).map(Number).sort((a, b) => a - b);
  const verticalAngles = Object.keys(ds.vertical).map(Number).sort((a, b) => a - b);
  if (!horizontalAngles.length) messages.push("No horizontal angle data found (missing or all empty placeholders).");
  if (!verticalAngles.length) messages.push("No vertical angle data found (missing or all empty placeholders).");

  for (const [angle, curve] of Object.entries(ds.horizontal)) {
    if (!curve.length) messages.push(`Horizontal angle ${angle} has an empty curve.`);
  }
  for (const [angle, curve] of Object.entries(ds.vertical)) {
    if (!curve.length) messages.push(`Vertical angle ${angle} has an empty curve.`);
  }

  return {
    datasetName,
    status: messages.length ? "incomplete" : "valid",
    horizontalAngles,
    verticalAngles,
    messages,
  };
}