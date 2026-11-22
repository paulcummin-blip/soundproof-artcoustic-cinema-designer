/**
 * useDealerCategoryOverrides.js
 * ------------------------------
 * React hook to load, save, and delete DealerCategoryOverride records.
 * Admin-only entity (RLS enforced server-side). Direct SDK access.
 *
 * A manual override takes precedence over the system-generated opportunity
 * category in the Account Management table. Follow-ups Due remains
 * date-driven and is never set here.
 */

import { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

export function useDealerCategoryOverrides() {
  const [overrides, setOverrides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await base44.entities.DealerCategoryOverride.filter({}, { sort: '-assigned_at', limit: 500 });
      setOverrides(Array.isArray(page) ? page : (page.items || []));
    } catch (err) {
      setError(err?.message || 'Could not load category overrides.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveOverride = useCallback(async (data) => {
    setSaving(true);
    setError(null);
    try {
      // Check if an override already exists for this account
      const existing = overrides.find((o) => o.account_id === data.account_id);
      if (existing) {
        await base44.entities.DealerCategoryOverride.update(existing.id, data);
      } else {
        await base44.entities.DealerCategoryOverride.create(data);
      }
      await load();
      return true;
    } catch (err) {
      setError(err?.message || 'Could not save category override.');
      return false;
    } finally {
      setSaving(false);
    }
  }, [load, overrides]);

  const removeOverride = useCallback(async (accountId) => {
    setSaving(true);
    setError(null);
    try {
      const existing = overrides.find((o) => o.account_id === accountId);
      if (existing) {
        await base44.entities.DealerCategoryOverride.delete(existing.id);
      }
      await load();
      return true;
    } catch (err) {
      setError(err?.message || 'Could not remove category override.');
      return false;
    } finally {
      setSaving(false);
    }
  }, [load, overrides]);

  // Index by account_id for quick lookup
  const overridesByAccount = new Map(overrides.map((o) => [o.account_id, o]));

  return {
    overrides,
    overridesByAccount,
    loading,
    saving,
    error,
    saveOverride,
    removeOverride,
    reload: load,
  };
}

export default useDealerCategoryOverrides;