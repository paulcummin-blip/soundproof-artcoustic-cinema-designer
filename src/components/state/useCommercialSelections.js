// useCommercialSelections.js
// --------------------------
// The designer's priced selections: manual extras, the acoustic-treatment
// (Abfuser) selection, and the price-display basis.
//
// Extracted from AppStateProvider so that file stays within its size budget.
// Behaviour is unchanged: the same state, the same setters, the same restore
// from the browser working copy.
//
// Persistence and gating live elsewhere:
//   · design_state persistence  → serializeProject / hydrateProjectIntoAppState
//   · save permission + wipe gate → commercialHydrationAuthority
// This hook only owns the state and records genuine edits.

import { useCallback, useState } from "react";
import { COMMERCIAL_COLLECTION, recordCommercialEdit } from "@/components/state/commercialHydrationAuthority";

const ABFUSER_QTY_SOURCE_DEFAULT = "none";

/**
 * @param {Object|null} autosavePayload - restored browser working copy, if any
 */
export function useCommercialSelections(autosavePayload) {
  // ── Acoustic treatment (Abfuser product selection) ──────────────────────
  const [acousticTreatmentEnabled, setAcousticTreatmentEnabled] = useState(() => (
    (autosavePayload && typeof autosavePayload.acousticTreatmentEnabled === "boolean")
      ? autosavePayload.acousticTreatmentEnabled
      : false
  ));
  const [selectedAbfuserQty, _setSelectedAbfuserQty] = useState(() => (
    (autosavePayload && Number.isFinite(Number(autosavePayload.selectedAbfuserQty)))
      ? Number(autosavePayload.selectedAbfuserQty)
      : 0
  ));
  const setSelectedAbfuserQty = useCallback((v) => {
    recordCommercialEdit(COMMERCIAL_COLLECTION.ACOUSTIC_TREATMENT);
    const n = Math.max(0, Math.floor(Number(v) || 0));
    _setSelectedAbfuserQty(n);
  }, []);
  // Source of the selected quantity: "none" (not accepted), "recommended"
  // (ADI recommendation accepted by the designer) or "user" (manual entry).
  const [abfuserQtySource, setAbfuserQtySource] = useState(() => (
    (autosavePayload && typeof autosavePayload.abfuserQtySource === "string")
      ? autosavePayload.abfuserQtySource
      : ABFUSER_QTY_SOURCE_DEFAULT
  ));
  // Retired automatic quantity from the previous recommendation model. Kept for
  // transparency only — it is never treated as a designer selection.
  const [legacyAbfuserAutoQty, setLegacyAbfuserAutoQty] = useState(() => (
    (autosavePayload && Number.isFinite(Number(autosavePayload.legacyAbfuserAutoQty)))
      ? Number(autosavePayload.legacyAbfuserAutoQty)
      : 0
  ));

  // ── Manual extras + price-display basis ─────────────────────────────────
  // Every user-facing setter records the edit; that record is how the commercial
  // save gate tells a genuine designer change apart from a default that only
  // appeared because something had not loaded yet. Recording is ignored while a
  // project is still hydrating.
  const [manualExtras, _setManualExtras] = useState(() => (
    (autosavePayload && Array.isArray(autosavePayload.manualExtras))
      ? autosavePayload.manualExtras
      : []
  ));
  const setManualExtras = useCallback((next) => {
    recordCommercialEdit(COMMERCIAL_COLLECTION.MANUAL_EXTRAS);
    _setManualExtras((prev) => {
      const value = typeof next === "function" ? next(prev) : next;
      return Array.isArray(value) ? value : [];
    });
  }, []);
  const [priceMode, setPriceMode] = useState(() => (
    (autosavePayload && typeof autosavePayload.priceMode === "string")
      ? autosavePayload.priceMode
      : "incVat"
  ));
  const [showPrices, setShowPrices] = useState(() => (
    (autosavePayload && typeof autosavePayload.showPrices === "boolean")
      ? autosavePayload.showPrices
      : true
  ));
  const [difficultyMultiplier, setDifficultyMultiplier] = useState(() => (
    (autosavePayload && Number.isFinite(Number(autosavePayload.difficultyMultiplier)))
      ? Number(autosavePayload.difficultyMultiplier)
      : 1
  ));

  return {
    acousticTreatmentEnabled,
    setAcousticTreatmentEnabled,
    selectedAbfuserQty,
    setSelectedAbfuserQty,
    abfuserQtySource,
    setAbfuserQtySource,
    legacyAbfuserAutoQty,
    setLegacyAbfuserAutoQty,
    manualExtras,
    setManualExtras,
    priceMode,
    setPriceMode,
    showPrices,
    setShowPrices,
    difficultyMultiplier,
    setDifficultyMultiplier,
  };
}

export default useCommercialSelections;