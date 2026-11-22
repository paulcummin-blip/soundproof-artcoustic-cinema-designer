/**
 * useDealerFollowUps.js
 * ----------------------
 * React hook to load and save DealerFollowUp records for the intelligence
 * dashboard. Admin-only entity (RLS enforced server-side). Direct SDK access
 * — no backend function needed because the RLS gates all operations to
 * admin role, matching the existing Commercial Intelligence pattern.
 */

import { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

export function useDealerFollowUps() {
  const [followUps, setFollowUps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await base44.entities.DealerFollowUp.filter({}, { sort: '-created_date', limit: 500 });
      setFollowUps(Array.isArray(page) ? page : (page.items || []));
    } catch (err) {
      setError(err?.message || 'Could not load follow-up records.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveFollowUp = useCallback(async (data) => {
    setSaving(true);
    setError(null);
    try {
      await base44.entities.DealerFollowUp.create(data);
      await load();
      return true;
    } catch (err) {
      setError(err?.message || 'Could not save follow-up record.');
      return false;
    } finally {
      setSaving(false);
    }
  }, [load]);

  const updateFollowUp = useCallback(async (id, data) => {
    setSaving(true);
    setError(null);
    try {
      await base44.entities.DealerFollowUp.update(id, data);
      await load();
      return true;
    } catch (err) {
      setError(err?.message || 'Could not update follow-up record.');
      return false;
    } finally {
      setSaving(false);
    }
  }, [load]);

  // Index by opportunity_key for quick lookup
  const followUpsByKey = new Map(followUps.map((f) => [f.opportunity_key, f]));
  const followUpsByAccount = new Map();
  for (const f of followUps) {
    if (!followUpsByAccount.has(f.account_id)) followUpsByAccount.set(f.account_id, []);
    followUpsByAccount.get(f.account_id).push(f);
  }

  return {
    followUps,
    followUpsByKey,
    followUpsByAccount,
    loading,
    saving,
    error,
    saveFollowUp,
    updateFollowUp,
    reload: load,
  };
}

export default useDealerFollowUps;