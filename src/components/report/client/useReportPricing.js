/**
 * useReportPricing
 * ----------------
 * Recomputes the Project Report's priced schedule from the FROZEN product
 * selection (the publication's placed speakers, subwoofer config and acoustic
 * treatment) against the CURRENT Product Master, using the same commercial
 * engine the Room Designer uses (usePriceCalculation → computeCommercialPrice
 * Breakdown).
 *
 * Why this exists: the publication freezes `report_snapshot.priceData` at the
 * instant the design is pinned. Prices are not part of the engineering
 * fingerprint, so a price added or changed AFTER publication never triggers a
 * re-publication, and the frozen priceData grows stale — a product line that
 * is "price not set" in the frozen snapshot can be fully priced in the current
 * Product Master. Reading the frozen snapshot's `incompletePriceCount` would
 * then raise a false "Pricing/products incomplete" blocker. Recomputing here
 * makes the report's pricing verdict reflect the same current Product Master
 * the Room Designer prices against, so the two surfaces make one consistent
 * readiness decision.
 *
 * The product SELECTION stays frozen (the publication's authority): the same
 * speakers, subwoofers and Abfuser quantity the report documents. Only the
 * PRICE lookup is current. No price is fabricated — a product the Product
 * Master still does not price stays "price not set" and is named in the
 * blocker.
 *
 * While the Product Master is loading, the frozen priceData is kept for
 * display so the report never flashes an all-unpriced schedule, and the
 * pricing status is `unknown` so it can never produce a transient false block
 * from an empty price map.
 */
import { usePriceCalculation } from '@/components/pricing/usePriceCalculation';
import { buildPricingMissingItem } from '@/components/report/reportReadinessAuthority';

export function useReportPricing({
  appState = null,
  placedSpeakers = [],
  projectId = null,
  frozenPriceData = null,
} = {}) {
  const calculation = usePriceCalculation({
    placedSpeakers: Array.isArray(placedSpeakers) ? placedSpeakers : [],
    frontSubsCfg: appState?.frontSubsCfg || null,
    rearSubsCfg: appState?.rearSubsCfg || null,
    difficultyMultiplier: appState?.difficultyMultiplier ?? 1.0,
    priceMode: appState?.priceMode || 'incVat',
    manualExtras: Array.isArray(appState?.manualExtras) ? appState.manualExtras : [],
    soundbarSelections: appState?.soundbarSelections || {},
    acousticTreatmentEnabled: appState?.acousticTreatmentEnabled === true,
    selectedAbfuserQty: Number(appState?.selectedAbfuserQty) || 0,
    screen: appState?.screen || null,
  });

  const loading = !!calculation.priceMapLoading;
  const currentSummary = { ...calculation, projectId: projectId || null };
  // While the Product Master loads, keep the frozen schedule for display so
  // the report never flashes an all-unpriced priced schedule. Once loaded, the
  // current Product Master is the price authority.
  const priceSummary = loading && frozenPriceData ? frozenPriceData : currentSummary;
  const incompletePriceCount = loading
    ? (frozenPriceData ? Number(frozenPriceData.incompletePriceCount) || 0 : 0)
    : (Number(calculation.incompletePriceCount) || 0);
  const pricingStatus = loading ? 'unknown' : (incompletePriceCount > 0 ? 'incomplete' : 'ok');
  const pricingMissingItem = pricingStatus === 'incomplete'
    ? buildPricingMissingItem(currentSummary)
    : null;

  return { priceSummary, pricingStatus, loading, incompletePriceCount, pricingMissingItem };
}

export default useReportPricing;