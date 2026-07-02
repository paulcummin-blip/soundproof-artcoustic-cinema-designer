// src/components/data/polar/index.jsx
// MEASURED POLAR DATASET REGISTRY (Stage 2A/2B infrastructure)
//
// Maps a dataset name — referenced from a speaker's registry entry via polarModel.dataset — to
// its measured horizontal/vertical data module. This file must never contain embedded measurement
// data itself, only wiring to the per-speaker dataset modules.

import SpitfireCloudDataset, { fetchSpitfireCloudDataset } from "@/components/data/polar/SpitfireCloud";
import { getGenericDataset, isGenericDatasetUsable } from "@/components/data/polar/genericDatasetRegistry";

export const MEASURED_DATASETS = {
  SpitfireCloud: SpitfireCloudDataset,
};

const MEASURED_DATASET_PRELOADERS = {
  SpitfireCloud: fetchSpitfireCloudDataset,
};

// Generic Measured Polar Dataset Platform takes priority when a dataset folder is discovered
// AND actually contains usable horizontal + vertical data. Otherwise falls back to the legacy
// per-speaker module (e.g. SpitfireCloud's remote fetch) so existing speakers keep working
// unchanged during migration.
export function getMeasuredDatasetModule(datasetName) {
  if (!datasetName) return null;
  if (isGenericDatasetUsable(datasetName)) {
    const generic = getGenericDataset(datasetName);
    return { horizontal: generic.horizontal, vertical: generic.vertical };
  }
  return MEASURED_DATASETS[datasetName] || null;
}

// Triggers (or reuses) the background fetch for a named dataset. Fire-and-forget safe.
// Not needed for generic-platform datasets, which are already loaded synchronously.
export function preloadMeasuredDataset(datasetName) {
  if (isGenericDatasetUsable(datasetName)) return Promise.resolve(null);
  const preload = MEASURED_DATASET_PRELOADERS[datasetName];
  return preload ? preload() : Promise.resolve(null);
}