// useRoomDesignerCommercialSelections.js
// ------------------------------------
// The Room Designer's read-only view of the app-level commercial selections —
// manual extras, the price-display basis and the difficulty multiplier.
//
// Extracted from RoomDesigner.jsx (a large page file) to keep the wiring in one
// small, reusable place. This hook owns no persistence: the values are hydrated
// from the loaded design version and persisted in serializeProject, and the save
// permission rules live in commercialHydrationAuthority.
//
// The fallbacks cover the first render, before app state is available. They are
// deliberately inert (no-op setter, empty list) and can never be mistaken for a
// designer edit.

import { useMemo } from "react";

const NOOP = () => {};

export function useRoomDesignerCommercialSelections(appState) {
  const manualExtras = useMemo(
    () => (Array.isArray(appState?.manualExtras) ? appState.manualExtras : []),
    [appState?.manualExtras],
  );

  const difficultyMultiplier = Number.isFinite(Number(appState?.difficultyMultiplier))
    ? Number(appState.difficultyMultiplier)
    : 1.0;

  return {
    manualExtras,
    setManualExtras: appState?.setManualExtras || NOOP,
    priceMode: appState?.priceMode === "exVat" ? "exVat" : "incVat",
    setPriceMode: appState?.setPriceMode || NOOP,
    showPrices: appState?.showPrices !== false,
    setShowPrices: appState?.setShowPrices || NOOP,
    difficultyMultiplier,
    setDifficultyMultiplier: appState?.setDifficultyMultiplier || NOOP,
  };
}

export default useRoomDesignerCommercialSelections;