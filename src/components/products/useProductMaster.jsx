import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { buildProductRoleOptions, PRODUCT_ROLES } from '@/components/products/productMaster';

export const PRODUCT_MASTER_QUERY_KEY = ['productMaster'];

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

  const products = Array.isArray(query.data?.products) ? query.data.products : [];

  const derived = useMemo(() => {
    const priceMap = new Map();
    const soundbarOptions = {};
    const roleOptions = {};

    for (const role of Object.values(PRODUCT_ROLES)) {
      roleOptions[role] = buildProductRoleOptions(products, role);
    }

    for (const product of products) {
      if (!product?.sku) continue;
      priceMap.set(product.sku, product);
      if (!product.sku.includes(':') || product.active === false) continue;
      const colonIndex = product.sku.indexOf(':');
      const model = product.sku.slice(0, colonIndex);
      const value = product.sku.slice(colonIndex + 1);
      if (!soundbarOptions[model]) soundbarOptions[model] = [];
      soundbarOptions[model].push({
        value,
        label: product.label?.split('—')[1]?.trim() || value,
        priceExVat: product.price_ex_vat,
      });
    }

    for (const options of Object.values(soundbarOptions)) {
      options.sort((a, b) => String(a.value).localeCompare(String(b.value)));
    }

    return { priceMap, soundbarOptions, roleOptions };
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
