// Read-only helpers that shape the generic measured polar dataset registry into
// rows/details for the Measured Dataset Manager admin UI. No dataset files, RP22 logic,
// or speaker registry logic are touched here — this only reads existing registry exports.

import {
  listGenericDatasets,
  getGenericDataset,
  validateGenericDataset,
  isGenericDatasetUsable,
} from "@/components/data/polar/genericDatasetRegistry";

export function buildDatasetRows() {
  return listGenericDatasets().map((datasetName) => {
    const ds = getGenericDataset(datasetName);
    const validation = validateGenericDataset(datasetName);
    const meta = ds?.metadata || {};

    const health = validation.messages.length === 0 ? "good" : "warn";
    const statusTone = validation.status === "valid" ? "good" : validation.status === "incomplete" ? "warn" : "bad";

    return {
      datasetName,
      speaker: meta.speakerName || meta.name || datasetName,
      measurementVersion: meta.measurementVersion || "—",
      schemaVersion: meta.schemaVersion || "—",
      horizontalCount: validation.horizontalAngles.length,
      verticalCount: validation.verticalAngles.length,
      healthTone: health,
      healthLabel: health === "good" ? "Pass" : `${validation.messages.length} warning${validation.messages.length !== 1 ? "s" : ""}`,
      statusTone,
      statusLabel: validation.status,
      lastUpdated: meta.lastUpdated || meta.updatedAt || "—",
      metadata: meta,
      validation,
    };
  });
}

// Aggregate registry-wide stats for the Measured Dataset Platform panel on System Health.
// Read-only — derives everything from the existing exported registry/validation functions.
export function getDatasetPlatformStats() {
  const names = listGenericDatasets();
  let ready = 0;
  let warnings = 0;
  let errors = 0;

  for (const name of names) {
    const usable = isGenericDatasetUsable(name);
    const validation = validateGenericDataset(name);
    if (usable) {
      ready++;
      if (validation.messages.length > 0) warnings++;
    } else {
      errors++;
    }
  }

  return { discovered: names.length, ready, warnings, errors };
}