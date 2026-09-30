// adiAbfuserProduct.js
// --------------------------------
// Canonical acoustic product model for the Artcoustic Abfuser panel.
//
// SINGLE AUTHORITY for panel size, panel area, octave-band absorption and
// intended use. Consumed by the ADI strategic reflection-control engine
// (adiAbfuserRecommendation.js), the Visual Report Acoustic Treatment page,
// and Product Master.
//
// The Abfuser is NOT a small tile: at 700 mm × 1100 mm it is 0.77 m² per panel
// and absorbs strongly from 500 Hz upward. Its limited low-frequency
// absorption means it is not a bass treatment product.

export const ABFUSER_SKU = "500027";
export const ABFUSER_LABEL = "Artcoustic Abfuser, Black";

export const ABFUSER_PRODUCT = Object.freeze({
  sku: ABFUSER_SKU,
  label: ABFUSER_LABEL,
  manufacturer: "Artcoustic",
  category: "Acoustic Treatment",
  widthMm: 700,
  heightMm: 1100,
  // 0.70 m × 1.10 m
  areaM2: 0.77,
  // Octave-band absorption coefficient (manufacturer data)
  absorption: Object.freeze({
    125: 0.26,
    250: 0.32,
    500: 0.85,
    1000: 0.95,
    2000: 0.95,
    4000: 0.95,
    6000: 0.90,
  }),
  useCase: Object.freeze([
    "lateral first reflection control",
    "rear wall reflection / slap echo control",
    "selective ceiling reflection control",
    "mid/high decay control",
  ]),
  notPrimaryBassTreatment: true,
});

export const ABFUSER_BANDS_HZ = Object.freeze([125, 250, 500, 1000, 2000, 4000, 6000]);

// Stated once, reused by every client-facing surface that discusses the product.
export const ABFUSER_BASS_NOTE =
  "Abfusers help control mid/high reflection energy and some lower-mid decay, but they are not a substitute for dedicated bass control.";

// Absorption area (m² Sabine equivalent) contributed by N panels, per band.
export function abfuserAbsorptionArea(panelCount, absorption = ABFUSER_PRODUCT.absorption) {
  const count = Math.max(0, Math.floor(Number(panelCount) || 0));
  const areaM2 = count * ABFUSER_PRODUCT.areaM2;
  const byBand = {};
  for (const band of ABFUSER_BANDS_HZ) {
    byBand[band] = areaM2 * (Number(absorption?.[band]) || 0);
  }
  return { panelCount: count, areaM2, byBand };
}

// Total panel area for N panels (the figure quoted on reports).
export function abfuserTotalAreaM2(panelCount) {
  const count = Math.max(0, Math.floor(Number(panelCount) || 0));
  return count * ABFUSER_PRODUCT.areaM2;
}