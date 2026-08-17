// React hook for reading canonical Professional Project capacity.
//
// Source of truth: CapacityLedger SUM(delta) for the account.
// Does NOT read legacy license_credit_balance / license_active_project_allowance.
//
// Admin users are unrestricted — the hook returns a no-op indicator for them
// so the UI never shows a misleading "0 available" limit for the admin account.

import { useState, useEffect, useCallback } from 'react';
import { getAvailableProfessionalProjects } from '@/lib/commercial/capacityService';

/**
 * @param {string|null} accountId
 * @param {boolean} isAdmin
 * @returns {{ available: number|null, loading: boolean, refresh: Function }}
 */
export function useProfessionalCapacity(accountId, isAdmin) {
  const [available, setAvailable] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (isAdmin || !accountId) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const cap = await getAvailableProfessionalProjects(accountId);
      setAvailable(cap);
    } catch (err) {
      console.error('[useProfessionalCapacity] Failed to fetch capacity:', err);
      setAvailable(null);
    } finally {
      setLoading(false);
    }
  }, [accountId, isAdmin]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { available, loading, refresh };
}