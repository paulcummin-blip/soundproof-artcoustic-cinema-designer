// src/components/data/polar/index.jsx
// MEASURED POLAR DATASET REGISTRY (Stage 2A/2B infrastructure)
//
// Maps a dataset name — referenced from a speaker's registry entry via polarModel.dataset — to
// its measured horizontal/vertical data module. This file must never contain embedded measurement
// data itself, only wiring to the per-speaker dataset modules.

import SpitfireCloudDataset, { fetchSpitfireCloudDataset } from "@/components/data/polar/SpitfireCloud";

export const MEASURED_DATASETS = {
  SpitfireCloud: SpitfireCloudDataset,
};

const MEASURED_DATASET_PRELOADERS = {
  SpitfireCloud: fetchSpitfireCloudDataset,
};

// Eagerly kick off every dataset fetch as soon as this module is first imported (app start /
// RP22 engine load), instead of waiting for the first P17 miss. This does not make the data
// synchronously available on the very first render, but it removes the "first-run" gap in
// practice: by the time a user reaches a seat/report calculation, the fetch has almost always
// already resolved in the background.
Object.values(MEASURED_DATASET_PRELOADERS).forEach((preload) => preload());

export function getMeasuredDatasetModule(datasetName) {
  if (!datasetName) return null;
  return MEASURED_DATASETS[datasetName] || null;
}

// Triggers (or reuses) the background fetch for a named dataset. Fire-and-forget safe.
export function preloadMeasuredDataset(datasetName) {
  const preload = MEASURED_DATASET_PRELOADERS[datasetName];
  return preload ? preload() : Promise.resolve(null);
}