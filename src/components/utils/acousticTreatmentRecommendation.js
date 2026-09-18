// acousticTreatmentRecommendation.js
// --------------------------------
// Surface-area-based acoustic treatment recommendation engine.
//
// Calculates the recommended quantity of treatment panels from the actual
// room geometry: total reflective surface area (6 surfaces) minus screen,
// doors, windows, and large room elements, multiplied by a volume-adjusted
// target coverage (15–25%), divided by the product's effective coverage area.
//
// PRODUCT REGISTRY: Each treatment product defines its effectiveCoverageArea
// (m² of reflective surface it meaningfully treats). Future absorbers,
// diffusers, and hybrid panels can be added to TREATMENT_PRODUCTS without
// changing the recommendation engine.

import { resolveEffectiveViewableDimsM } from '@/components/models/screen/resolveEffectiveScreen';

// ── Product Registry ──────────────────────────────────────────────────
export const TREATMENT_PRODUCTS = {
  '500027': {
    sku: '500027',
    label: 'Artcoustic Abfuser, Black',
    // 1.10 m × 0.70 m panel = 0.77 m² effective coverage
    effectiveCoverageArea: 0.77,
  },
};

export const DEFAULT_TREATMENT_SKU = '500027';

// Backward-compatible aliases (consumed by abfuserRecommendation.js)
export const ABFUSER_SKU = DEFAULT_TREATMENT_SKU;
export const ABFUSER_LABEL = TREATMENT_PRODUCTS[DEFAULT_TREATMENT_SKU].label;

// ── Coverage Target by Room Volume ─────────────────────────────────────
// Target 15–25% effective coverage, adjusted by room volume.
//   Small rooms  (< 50 m³)   ≈ 25%  (20–25% band, upper end)
//   Medium rooms (50–100 m³) ≈ 22%  (18–22% band, upper end)
//   Large rooms  (> 100 m³)  ≈ 18%  (15–20% band, upper end)

function getCoverageTarget(volumeM3) {
  if (volumeM3 < 50) return 0.25;
  if (volumeM3 < 100) return 0.22;
  return 0.18;
}

// Never recommend less than a sensible minimum.
const MIN_RECOMMENDED_QTY = 4;

// ── Screen Area ────────────────────────────────────────────────────────
function getScreenAreaM2(screen) {
  if (!screen) return 0;
  const dims = resolveEffectiveViewableDimsM(screen);
  const w = Number(dims?.widthM);
  const h = Number(dims?.heightM);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return 0;
  return w * h;
}

// ── Room Element Area ──────────────────────────────────────────────────
// Doors, windows, fireplaces, and built-ins occupy wall surface area.
// Projectors are suspended and do not occupy wall surface — skip them.

function getElementAreaM2(el) {
  if (!el) return 0;
  const type = String(el.type || '').toLowerCase();
  if (type === 'projector') return 0;
  const w = Number(el.width);
  const h = Number(el.height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return 0;
  return w * h;
}

function getRoomElementsAreaM2(roomElements) {
  if (!Array.isArray(roomElements)) return 0;
  return roomElements.reduce((sum, el) => sum + getElementAreaM2(el), 0);
}

// ── Main Recommendation Engine ─────────────────────────────────────────

/**
 * Calculate the recommended treatment quantity from room geometry.
 *
 * @param {Object} params
 * @param {Object} params.roomDims     - { widthM, lengthM, heightM }
 * @param {Object} params.screen       - Screen state (for screen area subtraction)
 * @param {Array}  params.roomElements - Room elements (doors, windows, etc.)
 * @param {string} params.productSku   - Treatment product SKU (defaults to Abfuser)
 * @returns {Object|null} Recommendation result, or null if room is invalid.
 */
export function calculateTreatmentRecommendation({ roomDims, screen, roomElements, productSku } = {}) {
  const widthM = Number(roomDims?.widthM);
  const lengthM = Number(roomDims?.lengthM);
  const heightM = Number(roomDims?.heightM);

  if (!Number.isFinite(widthM) || !Number.isFinite(lengthM) || !Number.isFinite(heightM) ||
      widthM <= 0 || lengthM <= 0 || heightM <= 0) {
    return null;
  }

  const product = TREATMENT_PRODUCTS[productSku || DEFAULT_TREATMENT_SKU] || TREATMENT_PRODUCTS[DEFAULT_TREATMENT_SKU];

  // ── Surface areas (all 6 room surfaces) ──
  const floorArea = widthM * lengthM;
  const ceilingArea = floorArea;
  const frontWallArea = widthM * heightM;
  const rearWallArea = frontWallArea;
  const leftWallArea = lengthM * heightM;
  const rightWallArea = leftWallArea;

  const totalSurfaceArea =
    floorArea + ceilingArea + frontWallArea + rearWallArea + leftWallArea + rightWallArea;

  // ── Subtract non-reflective / already-occupied areas ──
  const screenArea = getScreenAreaM2(screen);
  const elementsArea = getRoomElementsAreaM2(roomElements);
  const subtractedArea = screenArea + elementsArea;

  const reflectiveSurfaceArea = Math.max(0, totalSurfaceArea - subtractedArea);

  // ── Volume-adjusted target coverage ──
  const volumeM3 = widthM * lengthM * heightM;
  const targetCoverage = getCoverageTarget(volumeM3);

  // ── Quantity from required treated area ÷ effective coverage per panel ──
  const requiredTreatedArea = reflectiveSurfaceArea * targetCoverage;
  const rawQty = requiredTreatedArea / product.effectiveCoverageArea;
  const recommendedQty = Math.max(MIN_RECOMMENDED_QTY, Math.round(rawQty));

  // ── Actual achieved coverage (may differ from target due to rounding/min) ──
  const coverageArea = recommendedQty * product.effectiveCoverageArea;
  const coveragePercent = reflectiveSurfaceArea > 0
    ? (coverageArea / reflectiveSurfaceArea) * 100
    : 0;

  return {
    recommendedQty,
    coverageArea,
    coveragePercent,
    reflectiveSurfaceArea,
    totalSurfaceArea,
    subtractedArea,
    targetCoverage,
    volumeM3,
    product,
  };
}