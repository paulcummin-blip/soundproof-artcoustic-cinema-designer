// abfuserQuantityMigration.js
// --------------------------------
// Shared migration authority for the Abfuser selected quantity.
//
// Under the previous model the app auto-seeded the selected quantity from a
// broad surface-area recommendation, so every stored value the app wrote was an
// automatic value — never a designer decision. The source flag was also not
// persisted (always "recommended"), so a stored number alone cannot be trusted
// as designer-selected.
//
// Migration rule:
//   source "user"  → genuine designer selection, preserved
//   any other value with qty > 0 → legacy automatic value: retained as
//                                  legacyAutoQuantity, NOT treated as selected
//
// The canonical engine recomputes the ADI recommendation from geometry, so the
// recommendation never needs to be read from storage.

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
  const isLegacyAutomatic = !isDesignerSelection && storedQty > 0;

  return {
    selectedQuantity: isDesignerSelection ? storedQty : 0,
    quantitySource: isDesignerSelection
      ? ABFUSER_QTY_SOURCE.USER
      : ABFUSER_QTY_SOURCE.NONE,
    legacyAutoQuantity: isLegacyAutomatic ? storedQty : storedLegacy,
    migrated: isLegacyAutomatic,
  };
}