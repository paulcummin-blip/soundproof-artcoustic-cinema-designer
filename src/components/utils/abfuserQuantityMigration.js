// abfuserQuantityMigration.js
// --------------------------------
// Shared migration authority for the Abfuser selected quantity.
//
// The included quantity now follows the ADI recommendation by default, so only
// an explicit designer edit is a stored decision. The retired surface-area model
// produced 20+ panels for ordinary rooms; anything that large cannot be a
// designer selection made under the current model.
//
// Migration rule:
//   source "user"                  → genuine designer selection, preserved as a
//                                    manual override
//   any other source, qty > 12     → retired automatic value from the old
//                                    surface-area model: recorded in
//                                    legacyAutoQuantity and replaced by the new
//                                    ADI recommendation, never treated as selected
//   any other source, 0 < qty ≤ 12 → a stored selection: PRESERVED, never zeroed
//                                    during hydration. Its source is unchanged,
//                                    so the included quantity still follows the
//                                    live ADI recommendation, exactly as before.
//
// The canonical engine recomputes the ADI recommendation from geometry, so the
// recommendation never needs to be read from storage.

import { ABFUSER_MAX_AUTO_QTY } from "./adiAbfuserRecommendation";

export const ABFUSER_QTY_SOURCE = Object.freeze({
  NONE: "none",
  RECOMMENDED: "recommended",
  USER: "user",
});

/**
 * @param {Object} project - stored Project record
 * @returns {{selectedQuantity:number, quantitySource:string, legacyAutoQuantity:number, migrated:boolean}}
 */
export function resolveAbfuserQuantityFromProject(project) {
  const storedQty = Math.max(0, Math.floor(Number(project?.selected_abfuser_qty) || 0));
  const storedSource = String(project?.abfuser_qty_source || "");
  const storedLegacy = Math.max(0, Math.floor(Number(project?.legacy_abfuser_auto_qty) || 0));

  const isDesignerSelection = storedSource === ABFUSER_QTY_SOURCE.USER && storedQty > 0;
  const isLegacyAutomatic = !isDesignerSelection && storedQty > ABFUSER_MAX_AUTO_QTY;
  // A stored positive quantity inside the automatic range is a REAL stored
  // selection — an accepted recommendation, or a quantity that is already
  // priced. It is preserved: zeroing it during hydration dropped a priced
  // treatment selection, and the next autosave then persisted the zero. Its
  // source is kept so the included quantity follows the same rule as before.
  const isStoredSelection = !isDesignerSelection && !isLegacyAutomatic && storedQty > 0;
  const quantitySource = isDesignerSelection
    ? ABFUSER_QTY_SOURCE.USER
    : isStoredSelection && storedSource === ABFUSER_QTY_SOURCE.RECOMMENDED
      ? ABFUSER_QTY_SOURCE.RECOMMENDED
      : ABFUSER_QTY_SOURCE.NONE;

  return {
    selectedQuantity: isDesignerSelection || isStoredSelection ? storedQty : 0,
    quantitySource,
    legacyAutoQuantity: isLegacyAutomatic ? storedQty : storedLegacy,
    migrated: isLegacyAutomatic,
  };
}