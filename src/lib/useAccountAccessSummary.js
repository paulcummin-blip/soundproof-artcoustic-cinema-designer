/**
 * useAccountAccessSummary — lightweight live-summary hook for the Admin
 * Dashboard "Account Access & Credits" card.
 *
 * Calls the single aggregated backend function (getAccountAccessDashboardSummary)
 * and refreshes automatically while the dashboard is visible. The backend
 * function performs the reads server-side and returns only compact counts, so
 * the dashboard never loads the full account-management record set in the
 * background.
 *
 * Refresh cadence:
 *   - On mount (and when isAdmin becomes true).
 *   - Every 60 seconds while the tab is visible.
 *   - Immediately when the tab becomes visible again (visibilitychange).
 * Opening or refreshing the dashboard never resets the activity counters — the
 * lastSeen timestamp is only advanced by markSectionSeen when the full Account
 * Access page is opened.
 *
 * Overlap-safe: an in-flight request is not duplicated.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';

const REFRESH_INTERVAL_MS = 60_000;
const INITIAL_SUMMARY = null;

export function useAccountAccessSummary(isAdmin) {
  const [summary, setSummary] = useState(INITIAL_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const inFlight = useRef(false);

  const fetchSummary = useCallback(async () => {
    if (!isAdmin || inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await base44.functions.invoke(
        'getAccountAccessDashboardSummary',
        {}
      );
      const data = res?.data || {};
      if (data?.error) {
        setError(data.error);
      } else {
        setSummary(data);
        setError(null);
      }
    } catch (err) {
      setError(err?.message || 'Could not load the live summary.');
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) {
      setSummary(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetchSummary();

    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      fetchSummary();
    }, REFRESH_INTERVAL_MS);

    const onVisibility = () => {
      if (typeof document !== 'undefined' && !document.hidden) {
        fetchSummary();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [isAdmin, fetchSummary]);

  return { summary, loading, error, refresh: fetchSummary };
}