// src/components/data/polar/datasetHealthCheck.jsx
// Developer-only health check for the Generic Measured Polar Dataset Platform.
// Runs once at registry initialisation, dev builds only (caller gates with import.meta.env.DEV).
// Read-only: never modifies, resamples, interpolates, or corrects measurement data — reports only.

import log from "@/components/utils/logger";

const FILENAME_TOKEN_RE = /^(neg)?\d+(\.\d+)?$/i;
const REQUIRED_METADATA_FIELDS = [
  "schemaVersion",
  "measurementVersion",
  "datasetId",
  "speakerName",
  "measurementType",
  "units",
  "status",
];

function rawFilename(path) {
  const match = path.match(/\/([^/]+)\.json$/);
  return match ? match[1] : null;
}

// FEATURE 4 — filename validation + duplicate angle detection.
function checkFilenames(files, datasetName, subfolder, warnings) {
  const prefix = `./${datasetName}/${subfolder}/`;
  const seenAngles = new Map();
  for (const path of Object.keys(files)) {
    if (!path.startsWith(prefix)) continue;
    const raw = rawFilename(path);
    if (raw === null || !FILENAME_TOKEN_RE.test(raw)) {
      warnings.push(`[${datasetName}] ${subfolder}: malformed filename "${raw}.json" — expected patterns like "45.json", "22.5.json" or "neg45.json".`);
      continue;
    }
    const negMatch = raw.match(/^neg(\d+(\.\d+)?)$/i);
    const angle = negMatch ? -Number(negMatch[1]) : Number(raw);
    if (seenAngles.has(angle)) {
      warnings.push(`[${datasetName}] ${subfolder}: duplicate angle ${angle} from "${raw}.json" and "${seenAngles.get(angle)}.json".`);
    } else {
      seenAngles.set(angle, raw);
    }
  }
}

// FEATURE 3 — metadata schema validation.
function checkMetadata(datasetName, metadata, warnings) {
  if (!metadata) {
    warnings.push(`[${datasetName}] metadata.json missing or unreadable.`);
    return;
  }
  for (const field of REQUIRED_METADATA_FIELDS) {
    if (metadata[field] === undefined || metadata[field] === null || metadata[field] === "") {
      warnings.push(`[${datasetName}] metadata missing recommended field "${field}".`);
    }
  }
}

// Empty curves, non-numeric/missing frequency or SPL, duplicate frequencies within a curve.
function checkCurveValues(datasetName, subfolder, angleMap, warnings) {
  for (const [angle, curve] of Object.entries(angleMap)) {
    if (!curve.length) {
      warnings.push(`[${datasetName}] ${subfolder} angle ${angle}: empty curve.`);
      continue;
    }
    const freqSeen = new Set();
    for (const point of curve) {
      if (!Number.isFinite(point.frequency)) warnings.push(`[${datasetName}] ${subfolder} angle ${angle}: non-numeric or missing frequency value.`);
      if (!Number.isFinite(point.spl)) warnings.push(`[${datasetName}] ${subfolder} angle ${angle}: non-numeric or missing SPL value.`);
      if (Number.isFinite(point.frequency)) {
        if (freqSeen.has(point.frequency)) {
          warnings.push(`[${datasetName}] ${subfolder} angle ${angle}: duplicate frequency ${point.frequency}Hz.`);
        }
        freqSeen.add(point.frequency);
      }
    }
  }
}

// FEATURE 2 — frequency grid consistency. Compares every curve's frequency axis against the
// first curve found in the dataset. Read-only: reports the first differing index only.
function checkFrequencyGridConsistency(datasetName, horizontal, vertical, warnings) {
  const allCurves = [
    ...Object.entries(horizontal).map(([angle, curve]) => ({ subfolder: "horizontal", angle, curve })),
    ...Object.entries(vertical).map(([angle, curve]) => ({ subfolder: "vertical", angle, curve })),
  ].filter((c) => c.curve.length);

  if (allCurves.length < 2) return;

  const reference = allCurves[0];
  const referenceFreqs = reference.curve.map((p) => p.frequency);

  for (let i = 1; i < allCurves.length; i++) {
    const candidate = allCurves[i];
    const candidateFreqs = candidate.curve.map((p) => p.frequency);
    const len = Math.min(referenceFreqs.length, candidateFreqs.length);
    for (let idx = 0; idx < len; idx++) {
      if (referenceFreqs[idx] !== candidateFreqs[idx]) {
        warnings.push(
          `[${datasetName}] frequency grid mismatch: ${candidate.subfolder} angle ${candidate.angle} vs ${reference.subfolder} angle ${reference.angle} ` +
          `at index ${idx} (expected ${referenceFreqs[idx]}Hz, got ${candidateFreqs[idx]}Hz).`
        );
        break;
      }
    }
    if (candidateFreqs.length !== referenceFreqs.length) {
      warnings.push(
        `[${datasetName}] frequency grid length mismatch: ${candidate.subfolder} angle ${candidate.angle} has ${candidateFreqs.length} points, ` +
        `reference (${reference.subfolder} angle ${reference.angle}) has ${referenceFreqs.length}.`
      );
    }
  }
}

/**
 * Runs the full developer-only health check across all discovered datasets.
 * Dev-mode only (caller gates with import.meta.env.DEV). Never blocks a dataset from loading.
 */
export function runDatasetHealthCheck(datasets, rawFiles) {
  const { horizontalFiles, verticalFiles } = rawFiles;
  let ready = 0;
  const perDataset = [];

  for (const [datasetName, ds] of Object.entries(datasets)) {
    const warnings = [];

    checkFilenames(horizontalFiles, datasetName, "horizontal", warnings);
    checkFilenames(verticalFiles, datasetName, "vertical", warnings);
    checkMetadata(datasetName, ds.metadata, warnings);
    checkCurveValues(datasetName, "horizontal", ds.horizontal, warnings);
    checkCurveValues(datasetName, "vertical", ds.vertical, warnings);
    checkFrequencyGridConsistency(datasetName, ds.horizontal, ds.vertical, warnings);

    const horizontalCount = Object.keys(ds.horizontal).length;
    const verticalCount = Object.keys(ds.vertical).length;
    const isReady = horizontalCount > 0 && verticalCount > 0 && !!ds.metadata;
    if (isReady) ready++;

    perDataset.push({ datasetName, horizontalCount, verticalCount, warnings, isReady });
  }

  const totalWarnings = perDataset.reduce((sum, d) => sum + d.warnings.length, 0);

  log.info(`[Measured Polar Dataset Platform] Health check — ${perDataset.length} dataset(s) discovered, ${ready} ready, ${totalWarnings} warning(s).`);
  for (const d of perDataset) {
    log.info(`  • ${d.datasetName}: horizontal=${d.horizontalCount} vertical=${d.verticalCount} ready=${d.isReady}`);
    for (const w of d.warnings) log.warn(`    \u26A0 ${w}`);
  }

  return {
    datasetsDiscovered: perDataset.length,
    datasetsReady: ready,
    warnings: totalWarnings,
    errors: 0,
    perDataset,
  };
}