// components/pricing/usePriceCalculation.jsx
//
// The React wrapper around the commercial pricing engine. All of the actual
// pricing lives in commercialPriceBreakdown.js (pure) so that non-React
// consumers — per-version commercial reporting — price a design with exactly
// the same engine. This hook only resolves the caller's territory, price list
// access and the Product Master, then delegates.
import { useMemo } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { DEFAULT_TERRITORY, getTerritoryConfig } from './territoryConfig';
import { useProductPriceMap } from './useProductPriceMap';
import { computeCommercialPriceBreakdown, getCommercialPrice } from './commercialPriceBreakdown';

// Re-exported so existing importers of the engine keep working.
export { getCommercialPrice };

export function usePriceCalculation({
  placedSpeakers = [],
  frontSubsCfg = null,
  rearSubsCfg = null,
  difficultyMultiplier = 1.0,
  priceMode = 'incVat',
  manualExtras = [],
  soundbarSelections = {},
  acousticTreatmentEnabled = false,
  selectedAbfuserQty = 0,
}) {
  const { user } = useAuth();
  const territory = user?.territory || DEFAULT_TERRITORY;
  const territoryConfig = getTerritoryConfig(territory);
  const hasPriceAccess =
    user?.role === 'admin'
    || user?.access_context?.capabilities?.priceList === true;
  const priceListAvailable = hasPriceAccess && !!territoryConfig?.priceListAvailable;
  const { priceMap, soundbarOptions, loading: priceMapLoading } = useProductPriceMap(hasPriceAccess);

  return useMemo(() => computeCommercialPriceBreakdown({
    placedSpeakers,
    frontSubsCfg,
    rearSubsCfg,
    difficultyMultiplier,
    priceMode,
    manualExtras,
    soundbarSelections,
    acousticTreatmentEnabled,
    selectedAbfuserQty,
    priceMap,
    soundbarOptions,
    priceListAvailable,
    priceListLoading: priceMapLoading,
    territoryCode: territory,
    territoryLabel: territoryConfig?.label ?? null,
    currency: territoryConfig?.currency ?? null,
  }), [placedSpeakers, frontSubsCfg, rearSubsCfg, difficultyMultiplier, priceMode, manualExtras, soundbarSelections, priceListAvailable, territory, acousticTreatmentEnabled, selectedAbfuserQty, priceMap, soundbarOptions, priceMapLoading, territoryConfig?.label, territoryConfig?.currency]);
}