// src/components/utils/rp22/polarModelValidation.jsx
// RP22 P17 MEASURED ENGINE — Stage 1 scaffolding.
// Product validation framework for future measured-polar speaker datasets.
//
// Checks whether a speaker's `polarModel` definition in the registry is complete enough to be
// used by the measured P17 engine — BEFORE any real measurement data is added. Does not require
// real Spitfire Cloud (or any) data to function; an empty/missing polarModel is a valid input
// and simply reports "not ready".

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/**
 * Validate a speaker's polarModel definition.
 *
 * @param {object|null|undefined} polarModel
 * @returns {{
 *   validationStatus: 'missing'|'incomplete'|'valid',
 *   horizontalAnglesFound: number,
 *   verticalAnglesFound: number,
 *   frequencyRangeFound: {lowHz:number|null, highHz:number|null},
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
      missingDataWarnings: ["No measured polarModel present — speaker uses the estimated dispersion path."],
      readyForMeasuredP17: false,
    };
  }

  const warnings = [];

  if (!isNum(polarModel.axisTiltDeg)) {
    warnings.push("axisTiltDeg is missing — acoustic axis tilt cannot be resolved.");
  }

  const hAngles = Array.isArray(polarModel.horizontalAngles) ? polarModel.horizontalAngles : [];
  const vAngles = Array.isArray(polarModel.verticalAngles) ? polarModel.verticalAngles : [];

  if (!hAngles.length) warnings.push("No horizontalAngles provided.");
  if (!vAngles.length) warnings.push("No verticalAngles provided.");

  const hDataset = polarModel.horizontalDataset || {};
  const vDataset = polarModel.verticalDataset || {};

  let lowHz = null;
  let highHz = null;

  for (const angle of hAngles) {
    const curve = hDataset[angle];
    if (Array.isArray(curve) && curve.length) {
      const freqs = curve.map((p) => p.frequency).filter(isNum);
      if (freqs.length) {
        const lo = Math.min(...freqs);
        const hi = Math.max(...freqs);
        lowHz = lowHz == null ? lo : Math.min(lowHz, lo);
        highHz = highHz == null ? hi : Math.max(highHz, hi);
      }
    } else {
      warnings.push(`Missing horizontal dataset for angle ${angle}\u00b0.`);
    }
  }

  for (const angle of vAngles) {
    const curve = vDataset[angle];
    if (!Array.isArray(curve) || !curve.length) {
      warnings.push(`Missing vertical dataset for angle ${angle}\u00b0.`);
    }
  }

  if (hAngles.length && vAngles.length && (lowHz == null || highHz == null || lowHz > 500 || highHz < 16000)) {
    warnings.push("Measured frequency range does not fully cover 500 Hz\u201316 kHz.");
  }

  const readyForMeasuredP17 =
    hAngles.length > 0 &&
    vAngles.length > 0 &&
    isNum(polarModel.axisTiltDeg) &&
    warnings.length === 0;

  return {
    validationStatus: warnings.length ? "incomplete" : "valid",
    horizontalAnglesFound: hAngles.length,
    verticalAnglesFound: vAngles.length,
    frequencyRangeFound: { lowHz, highHz },
    missingDataWarnings: warnings,
    readyForMeasuredP17,
  };
}