// src/components/data/polar/SpitfireCloud/index.jsx
// Measured PAS/FRD dataset module for Spitfire Cloud. NO DATA YET — populate horizontal/ and
// vertical/ with real measured angle curves before enabling polarModel.type === "measured" with
// dataset: "SpitfireCloud" on this model in the speaker registry. Keep this file free of
// invented/placeholder measurements — it must only re-export the real data files.

import { horizontalDataset } from "@/components/data/polar/SpitfireCloud/horizontal";
import { verticalDataset } from "@/components/data/polar/SpitfireCloud/vertical";

export default {
  horizontal: horizontalDataset,
  vertical: verticalDataset,
};