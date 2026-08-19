// src/components/pricing/useProductPriceMap.jsx
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

/**
 * Shared price-loading authority.
 *
 * Fetches ProductPrice records once per session (5-minute stale time) and
 * builds:
 *   - priceMap:        Map<sku, ProductPrice record>
 *   - soundbarOptions: object keyed by model prefix (same shape as the
 *                      legacy SOUNDBAR_PRICE_OPTIONS constant)
 *
 * Null price_ex_vat is preserved as null (not converted to zero).
 * Inactive products are included in the map but excluded from soundbarOptions.
 *
 * Admin edits are picked up on refetch or page refresh (staleTime expires).
 */
export function useProductPriceMap(enabled = true) {
  const query = useQuery({
    queryKey: ['productPrices'],
    queryFn: async () => {
      const response = await base44.functions.invoke('getAuthorizedProductPrices', {});
      return response?.data?.prices || [];
    },
    staleTime: 5 * 60 * 1000,
    enabled,
  });

  const { priceMap, soundbarOptions } = useMemo(() => {
    const map = new Map();
    const options = {};
    for (const rec of (query.data || [])) {
      if (!rec.sku) continue;
      map.set(rec.sku, rec);
      // Build soundbar options from composite-key SKUs (e.g. "c4-1:1222")
      if (rec.sku.includes(':') && rec.active !== false) {
        const colonIdx = rec.sku.indexOf(':');
        const model = rec.sku.slice(0, colonIdx);
        const value = rec.sku.slice(colonIdx + 1);
        if (!options[model]) options[model] = [];
        // Extract size label from the ProductPrice label (e.g. "C4-1 — 1222mm" → "1222mm")
        const sizeLabel = rec.label?.split('—')[1]?.trim() || value;
        options[model].push({
          value,
          label: sizeLabel,
          priceExVat: rec.price_ex_vat,
        });
      }
    }
    // Sort each model's options by value for consistent ordering
    for (const model in options) {
      options[model].sort((a, b) => String(a.value).localeCompare(String(b.value)));
    }
    return { priceMap: map, soundbarOptions: options };
  }, [query.data]);

  return {
    priceMap,
    soundbarOptions,
    loading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}