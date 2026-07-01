// src/components/data/polar/index.jsx
// MEASURED POLAR DATASET REGISTRY (Stage 2A infrastructure)
//
// Maps a dataset name — referenced from a speaker's registry entry via
// polarModel.dataset — to its measured horizontal/vertical data module. Add a new entry here
// only once real PAS/FRD measurement files exist for that speaker. This file must never contain
// embedded measurement data itself, only wiring to the per-speaker dataset folders.
//
// Each dataset module exports { horizontal, vertical }, where each is a map of
// { [angleDeg: number]: Array<{ frequency: number, spl: number }> }. The measuredDatasetLoader
// discovers angles and frequency coverage from this content — no spacing is assumed here.

import SpitfireCloudDataset from "@/components/data/polar/SpitfireCloud";

export const MEASURED_DATASETS = {
  SpitfireCloud: SpitfireCloudDataset,
};

export function getMeasuredDatasetModule(datasetName) {
  if (!datasetName) return null;
  return MEASURED_DATASETS[datasetName] || null;
}