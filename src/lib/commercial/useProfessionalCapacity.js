// React hook for reading canonical Professional Project capacity.
//
// Source of truth: CapacityLedger SUM(delta) for the account — resolved
// server-side via the getProfessionalProjectCapacity backend function.
// The browser never supplies account_id; the backend resolves it from
// the authenticated user record (same pattern as getEffectivePromotion).
//
// Returns:
//   status: "OK" | "ADMIN" | "ACCOUNT_NOT_LINKED" | "ERROR" | "LOADING"
//   available: number | null  (null for non-OK / loading / admin)
//
// Admin users receive status "ADMIN" — the UI hides the dealer commercial
// header for them. Dealers with no linked account receive
// "ACCOUNT_NOT_LINKED" — the UI also hides the commercial header.

import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

/**
 * @returns {{ status: string, available: number|null, loading: boolean, refresh: Function }}
 */
export function useProfessionalCapacity() {
  const [state, setState] = useState({ status: 'LOADING', available: null });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const res = await base44.functions.invoke('getProfessionalProjectCapacity', {});
      const data = res?.data || {};
      setState({ status: data.status || 'ERROR', available: data.available ?? null });
    } catch (err) {
      // Fail-closed: show no capacity indicator on error.
      setState({ status: 'ERROR', available: null });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // 60-second poll — catches admin grants/reclaims and ledger changes
  // without requiring a manual page refresh.
  useEffect(() => {
    const POLL_MS = 60000;
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  return { ...state, loading, refresh };
}