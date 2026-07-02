// Read-only aggregation of speaker registry vs. measured dataset registry, for the
// System Health "Products" panel. Does not modify the speaker registry or any dataset files.

import { MODELS } from "@/components/models/speakers/registry";
import { listGenericDatasets } from "@/components/data/polar/genericDatasetRegistry";

export function getProductStats() {
  const datasetNames = new Set(listGenericDatasets());
  const registered = MODELS.length;
  const linked = MODELS.filter((m) => m.polarModel?.dataset && datasetNames.has(m.polarModel.dataset)).length;
  return { registered, linked };
}