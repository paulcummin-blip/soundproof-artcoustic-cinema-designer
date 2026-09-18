// acousticTreatmentRecommendation.js
// --------------------------------
// Equivalent Reflective Area treatment recommendation engine.
//
// Calculates the recommended quantity of treatment panels from the actual
// room geometry, weighting each surface by its reflectivity coefficient:
//
//   100%  Painted plaster, Concrete, Glass
//    80%  Timber, Solid doors
//    50%  Carpet, Heavy curtains, Large fabric sofas
//    25%  Bookshelves, Open shelving, Existing acoustic treatment
//     0%  Screen image area
//
// The "equivalent reflective area" represents the untreated reflective
// area remaining in the room. The recommendation targets a volume-adjusted
// percentage (15–25%) of this area, divided by the product's
// effectiveCoverageArea.
//
// Default surface assumptions for a cinema room:
//   Floor   → carpet (50%)
//   Ceiling → painted plaster (100%)
//   Walls   → painted plaster (100%)
//
// Room elements (doors, windows, built-ins) are subtracted from the wall
// area they occupy, then added back at their own reflectivity. Projectors
// are suspended and do not occupy wall surface. The screen is subtracted
// from the front wall and contributes 0% (screen image area).
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

// ── Reflectivity Coefficients ──────────────────────────────────────────
// The fraction of incident sound each material reflects (vs absorbs).
// Used to weight surface areas into "equivalent reflective area".

// Default surface materials for a cinema room.
const SURFACE_REFLECTIVITY = Object.freeze({
  floor: 0.50,    // Carpet (typical cinema floor finish)
  ceiling: 1.00,  // Painted plaster
  wall: 1.00,     // Painted plaster
});

// Room element reflectivity by element type.
// null = suspended / not a wall surface (skip entirely).
const ELEMENT_REFLECTIVITY = Object.freeze({
  door: 0.80,       // Timber / solid door
  window: 1.00,     // Glass
  fireplace: 0.80,  // Masonry / timber surround
  built_in: 0.25,   // Bookshelves / open shelving
  projector: null,  // Suspended — not a wall surface
});

// Screen image area — 0% reflective for treatment purposes.
const SCREEN_REFLECTIVITY = 0.00;

// ── Coverage Target by Room Volume ─────────────────────────────────────
// Target 15–25% effective coverage of equivalent reflective area,
// adjusted by room volume.
//   Small rooms  (< 50 m³)   ≈ 25%
//   Medium rooms (50–100 m³) ≈ 22%
//   Large rooms  (> 100 m³)  ≈ 18%

function getCoverageTarget(volumeM3) {
  if (volumeM3 < 50) return 0.25;
  if (volumeM3 < 100) return 0.22;
  return 0.18;
}

// Never recommend less than a sensible minimum.
const MIN_RECOMMENDED_QTY = 4;

// ── Area Helpers ───────────────────────────────────────────────────────

function getScreenAreaM2(screen) {
  if (!screen) return 0;
  const dims = resolveEffectiveViewableDimsM(screen);
  const w = Number(dims?.widthM);
  const h = Number(dims?.heightM);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return 0;
  return w * h;
}

function getElementAreaM2(el) {
  if (!el) return 0;
  const w = Number(el.width);
  const h = Number(el.height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return 0;
  return w * h;
}

/**
 * Categorise room elements by type and sum their areas.
 * Returns { door, window, fireplace, built_in, total } areas in m².
 * Projectors are excluded (suspended, not a wall surface).
 */
function categoriseRoomElements(roomElements) {
  const areas = { door: 0, window: 0, fireplace: 0, built_in: 0 };
  if (!Array.isArray(roomElements)) return { ...areas, total: 0 };
  for (const el of roomElements) {
    const type = String(el?.type || '').toLowerCase();
    if (!(type in areas)) continue; // skip projector and unknown types
    const area = getElementAreaM2(el);
    areas[type] += area;
  }
  const total = Object.values(areas).reduce((a, b) => a + b, 0);
  return { ...areas, total };
}

// ── Main Recommendation Engine ─────────────────────────────────────────

/**
 * Calculate the recommended treatment quantity from equivalent reflective
 * area.
 *
 * @param {Object} params
 * @param {Object} params.roomDims     - { widthM, lengthM, heightM }
 * @param {Object} params.screen       - Screen state (for screen area)
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

  // ── Raw surface areas ──
  const floorArea = widthM * lengthM;
  const ceilingArea = floorArea;
  const totalWallArea = 2 * (widthM + lengthM) * heightM; // all 4 walls

  // ── Screen and element areas (subtracted from walls) ──
  const screenArea = getScreenAreaM2(screen);
  const elementAreas = categoriseRoomElements(roomElements);
  const subtractedFromWalls = screenArea + elementAreas.total;
  const netWallArea = Math.max(0, totalWallArea - subtractedFromWalls);

  // ── Equivalent reflective area ──
  // Each surface is weighted by its reflectivity coefficient. The screen
  // contributes 0% (screen image area). Elements are added back at their
  // own reflectivity after being subtracted from the wall.
  const floorEquivalent = floorArea * SURFACE_REFLECTIVITY.floor;
  const ceilingEquivalent = ceilingArea * SURFACE_REFLECTIVITY.ceiling;
  const wallEquivalent = netWallArea * SURFACE_REFLECTIVITY.wall;
  const doorEquivalent = elementAreas.door * ELEMENT_REFLECTIVITY.door;
  const windowEquivalent = elementAreas.window * ELEMENT_REFLECTIVITY.window;
  const fireplaceEquivalent = elementAreas.fireplace * ELEMENT_REFLECTIVITY.fireplace;
  const builtInEquivalent = elementAreas.built_in * ELEMENT_REFLECTIVITY.built_in;
  // Screen: 0% reflectivity → contributes nothing

  const equivalentReflectiveArea =
    floorEquivalent + ceilingEquivalent + wallEquivalent +
    doorEquivalent + windowEquivalent + fireplaceEquivalent + builtInEquivalent;

  // ── Volume-adjusted target coverage ──
  const volumeM3 = widthM * lengthM * heightM;
  const targetCoverage = getCoverageTarget(volumeM3);

  // ── Quantity from required treated area ÷ effective coverage per panel ──
  const requiredTreatmentArea = equivalentReflectiveArea * targetCoverage;
  const rawQty = requiredTreatmentArea / product.effectiveCoverageArea;
  const recommendedQty = Math.max(MIN_RECOMMENDED_QTY, Math.round(rawQty));

  // ── Effective treatment area (what the recommended panels actually cover) ──
  const effectiveTreatmentArea = recommendedQty * product.effectiveCoverageArea;

  // ── Remaining reflective area after treatment ──
  const remainingReflectiveArea = Math.max(0, equivalentReflectiveArea - effectiveTreatmentArea);

  // ── Percentage of equivalent reflective area treated ──
  const percentageTreated = equivalentReflectiveArea > 0
    ? (effectiveTreatmentArea / equivalentReflectiveArea) * 100
    : 0;

  return {
    recommendedQty,
    effectiveTreatmentArea,
    equivalentReflectiveArea,
    remainingReflectiveArea,
    percentageTreated,
    targetCoverage,
    volumeM3,
    product,
    // Surface breakdown (for future debugging / display)
    surfaceBreakdown: {
      floor: { area: floorArea, reflectivity: SURFACE_REFLECTIVITY.floor, equivalent: floorEquivalent },
      ceiling: { area: ceilingArea, reflectivity: SURFACE_REFLECTIVITY.ceiling, equivalent: ceilingEquivalent },
      walls: { area: netWallArea, reflectivity: SURFACE_REFLECTIVITY.wall, equivalent: wallEquivalent },
      screen: { area: screenArea, reflectivity: SCREEN_REFLECTIVITY, equivalent: 0 },
      door: { area: elementAreas.door, reflectivity: ELEMENT_REFLECTIVITY.door, equivalent: doorEquivalent },
      window: { area: elementAreas.window, reflectivity: ELEMENT_REFLECTIVITY.window, equivalent: windowEquivalent },
      fireplace: { area: elementAreas.fireplace, reflectivity: ELEMENT_REFLECTIVITY.fireplace, equivalent: fireplaceEquivalent },
      built_in: { area: elementAreas.built_in, reflectivity: ELEMENT_REFLECTIVITY.built_in, equivalent: builtInEquivalent },
    },
  };
}