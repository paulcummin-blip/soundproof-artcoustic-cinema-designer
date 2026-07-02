// Read-only helpers that shape the generic measured polar dataset registry into
// rows/details for the Measured Dataset Manager admin UI. No dataset files, RP22 logic,
// or speaker registry logic are touched here — this only reads existing registry exports.

import {
  listGenericDatasets,
  getGenericDataset,
  validateGenericDataset,
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