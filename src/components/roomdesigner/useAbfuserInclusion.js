import { useEffect, useMemo } from "react";
import { calculateAbfuserRecommendation } from "@/components/utils/adiAbfuserRecommendation";
import {
  isManualAbfuserOverride,
  resolveIncludedAbfuserQuantity,
} from "@/components/utils/abfuserInclusionAuthority";

/**
 * useAbfuserInclusion
 *
 * The Room Designer's Abfuser authority: the live ADI recommendation and the
 * included (priced) quantity.
 *
 *   • No manual override  → the included quantity follows the recommendation, so
 *                           the ADI recommendation is included by default.
 *   • Manual override     → the designer's quantity is preserved and never
 *                           overwritten by a recalculation.
 *   • Treatment off       → nothing is included and nothing is priced.
 *
 * Returns { abfuserRecommendation, recommendedAbfuserQty, includedAbfuserQty }.
 */
export function useAbfuserInclusion(appState) {
  const abfuserRecommendation = useMemo(() => calculateAbfuserRecommendation({
    room: appState?.roomDims,
    speakers: appState?.speakerSystem?.placedSpeakers || [],
    seating: appState?.seatingPositions,
    screen: appState?.screen,
    acousticTreatmentSettings: {
      enabled: appState?.acousticTreatmentEnabled,
      selectedQuantity: appState?.selectedAbfuserQty,
      quantitySource: appState?.abfuserQtySource,
      legacyAutoQuantity: appState?.legacyAbfuserAutoQty,
    },
  }), [appState?.roomDims, appState?.speakerSystem?.placedSpeakers, appState?.seatingPositions, appState?.screen, appState?.acousticTreatmentEnabled, appState?.selectedAbfuserQty, appState?.abfuserQtySource, appState?.legacyAbfuserAutoQty]);

  const recommendedAbfuserQty = abfuserRecommendation?.recommendedQuantity ?? 0;

  const includedAbfuserQty = resolveIncludedAbfuserQuantity({
    enabled: appState?.acousticTreatmentEnabled === true,
    quantitySource: appState?.abfuserQtySource,
    selectedQuantity: appState?.selectedAbfuserQty,
    recommendedQuantity: recommendedAbfuserQty,
  });

  // Keep the stored quantity on the followed value so pricing, the product
  // breakdown, the engineering snapshots and the reports all agree.
  useEffect(() => {
    if (appState?.acousticTreatmentEnabled !== true) return;
    if (isManualAbfuserOverride(appState?.abfuserQtySource)) return;
    if ((Number(appState?.selectedAbfuserQty) || 0) === includedAbfuserQty) return;
    appState?.setSelectedAbfuserQty?.(includedAbfuserQty);
  }, [
    appState?.acousticTreatmentEnabled,
    appState?.abfuserQtySource,
    appState?.selectedAbfuserQty,
    appState?.setSelectedAbfuserQty,
    includedAbfuserQty,
  ]);

  return { abfuserRecommendation, recommendedAbfuserQty, includedAbfuserQty };
}