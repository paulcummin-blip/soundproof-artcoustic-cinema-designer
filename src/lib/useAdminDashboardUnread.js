/**
 * useAdminDashboardUnread — React hook for the Admin Dashboard.
 *
 * Reads the current admin's three per-section last-seen timestamps, fetches
 * the unread counts for System Health, Account Access and Commercial Control,
 * and re-fetches on demand. This hook is read-only on the dashboard; the
 * destination pages call markSectionSeen directly when the admin opens them.
 */

import { useEffect, useState, useCallback } from 'react';
import {
  fetchAllUnreadCounts,
  readLastSeenTimestamps,
} from '@/lib/adminDashboardUnread';

const INITIAL_COUNTS = {
  systemHealth: { count: 0, loading: true },
  accountAccess: { count: 0, loading: true },
  commercialControl: { count: 0, loading: true },
};

export function useAdminDashboardUnread(isAdmin) {
  const [counts, setCounts] = useState(INITIAL_COUNTS);

  const refresh = useCallback(async () => {
    if (!isAdmin) return;
    const timestamps = await readLastSeenTimestamps();
    const result = await fetchAllUnreadCounts(timestamps);
    setCounts({
      systemHealth: { count: result.systemHealth, loading: false },
      accountAccess: { count: result.accountAccess, loading: false },
      commercialControl: { count: result.commercialControl, loading: false },
    });
  }, [isAdmin]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { counts, refresh };
}