// src/components/utils/rp22/polarModelValidation.jsx
// RP22 P17 MEASURED ENGINE — Stage 2A.
// Validates a speaker's polarModel definition. The actual measurement data lives in a separate
// named dataset (see measuredDatasetLoader.jsx) — polarModel only references it by name, it never
// embeds measurement data itself.
//
// Expected shape: polarModel = { type: "measured", axisTiltDeg: number, dataset: "SpitfireCloud" }

import { validateMeasuredDataset } from "@/components/utils/rp22/measuredDatasetLoader";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

const EMPTY_FREQ_RESOLUTION = { pointCount: 0, uniform: true, distinctGapsHz: [] };

/**
 * Validate a speaker's polarModel definition.
 *
 * @param {object|null|undefined} polarModel
 * @returns {{
 *   validationStatus: 'missing'|'incomplete'|'valid',
 *   horizontalAnglesFound: number,
 *   verticalAnglesFound: number,
 *   frequencyRangeFound: {lowHz:number|null, highHz:number|null},
 *   frequencyResolution: {pointCount:number, uniform:boolean, distinctGapsHz:number[]},
 *   missingDataWarnings: string[],
 *   readyForMeasuredP17: boolean,
 * }}
 */
export function validatePolarModel(polarModel) {
  if (!polarModel || polarModel.type !== "measured") {
    return {
      validationStatus: "missing",
      horizontalAnglesFound: 0,
      verticalAnglesFound: 0,
      frequencyRangeFound: { lowHz: null, highHz: null },
      frequencyResolution: EMPTY_FREQ_RESOLUTION,
      missingDataWarnings: ["No measured polarModel present — speaker uses the estimated dispersion path."],
      readyForMeasuredP17: false,
    };
  }

  const warnings = [];
  if (!isNum(polarModel.axisTiltDeg)) {
    warnings.push("axisTiltDeg is missing — acoustic axis tilt cannot be resolved.");
  }

  if (!polarModel.dataset) {
    warnings.push("No dataset name declared on polarModel.");
    return {
      validationStatus: "incomplete",
      horizontalAnglesFound: 0,
      verticalAnglesFound: 0,
      frequencyRangeFound: { lowHz: null, highHz: null },
      frequencyResolution: EMPTY_FREQ_RESOLUTION,
      missingDataWarnings: warnings,
      readyForMeasuredP17: false,
    };
  }

  const datasetValidation = validateMeasuredDataset(polarModel.dataset);
  const combinedWarnings = [...warnings, ...datasetValidation.missingDataWarnings];

  return {
    validationStatus: combinedWarnings.length
      ? (datasetValidation.validationStatus === "missing" ? "missing" : "incomplete")
      : "valid",
    horizontalAnglesFound: datasetValidation.horizontalAnglesFound,
    verticalAnglesFound: datasetValidation.verticalAnglesFound,
    frequencyRangeFound: datasetValidation.frequencyRangeFound,
    frequencyResolution: datasetValidation.frequencyResolution,
    missingDataWarnings: combinedWarnings,
    readyForMeasuredP17: datasetValidation.readyForMeasuredP17 && isNum(polarModel.axisTiltDeg),
  };
}