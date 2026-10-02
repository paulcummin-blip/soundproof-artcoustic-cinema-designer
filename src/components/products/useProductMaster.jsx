import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { buildProductRoleOptions, PRODUCT_ROLES } from '@/components/products/productMaster';
import { buildProductPriceIndex } from '@/components/products/productPriceIndex';

export const PRODUCT_MASTER_QUERY_KEY = ['productMaster'];
const EMPTY_PRODUCTS = Object.freeze([]);

export function useProductMaster(enabled = true) {
  const query = useQuery({
    queryKey: PRODUCT_MASTER_QUERY_KEY,
    queryFn: async () => {
      const response = await base44.functions.invoke('getAuthorizedProductMaster', {});
      return response?.data || { products: [] };
    },
    staleTime: 5 * 60 * 1000,
    enabled,
  });

  const products = Array.isArray(query.data?.products) ? query.data.products : EMPTY_PRODUCTS;

  const derived = useMemo(() => {
    const roleOptions = {};

    for (const role of Object.values(PRODUCT_ROLES)) {
      roleOptions[role] = buildProductRoleOptions(products, role);
    }

    return { ...buildProductPriceIndex(products), roleOptions };
  }, [products]);

  return {
    products,
    ...derived,
    canEdit: query.data?.can_edit === true,
    canViewPrices: query.data?.can_view_prices === true,
    territory: query.data?.territory || 'UK',
    loading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useProductRoleOptions(role, enabled = true) {
  const master = useProductMaster(enabled);
  return {
    options: master.roleOptions?.[role] || [],
    loading: master.loading,
    error: master.error,
    refetch: master.refetch,
  };
}