// src/components/pricing/useProductPriceMap.jsx
import { useProductMaster } from '@/components/products/useProductMaster';

/**
 * Compatibility wrapper for existing pricing consumers.
 * Product identity, availability, selector roles and prices now come from the
 * same Product Master query. Null prices remain null.
 */
export function useProductPriceMap(enabled = true) {
  const master = useProductMaster(enabled);
  return {
    priceMap: master.priceMap,
    soundbarOptions: master.soundbarOptions,
    loading: master.loading,
    error: master.error,
    refetch: master.refetch,
  };
}
