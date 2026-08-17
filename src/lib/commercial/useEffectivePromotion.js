// React hook for reading the dealer-facing effective promotion.
//
// Calls the getEffectivePromotion backend function (read-only).
// The backend resolves account_id from the authenticated user — the
// client never supplies account_id, dealer_group, or promotion_id.
//
// Returns only dealer-facing display fields:
//   { isEffective, promotionType, headline, message, endsAt, loading }
//
// Commercial enforcement remains backend-authoritative. This hook is
// display-only — it does not decide project-creation eligibility.

import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

/**
 * @returns {{
 *   isEffective: boolean,
 *   promotionType: string|null,
 *   headline: string|null,
 *   message: string|null,
 *   endsAt: string|null,
 *   loading: boolean,
 *   refresh: Function
 * }}
 */
export function useEffectivePromotion() {
  const [state, setState] = useState({
    isEffective: false,
    promotionType: null,
    headline: null,
    message: null,
    endsAt: null,
  });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const res = await base44.functions.invoke('getEffectivePromotion', {});
      const data = res || {};
      setState({
        isEffective: !!data.is_effective,
        promotionType: data.promotion_type || null,
        headline: data.headline || null,
        message: data.message || null,
        endsAt: data.ends_at || null,
      });
    } catch (err) {
      // Fail-closed: show no promotion on error.
      setState({
        isEffective: false,
        promotionType: null,
        headline: null,
        message: null,
        endsAt: null,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...state, loading, refresh };
}

/**
 * Format an ISO ends_at timestamp as a compact dealer-facing date.
 * e.g. "31 Dec 2026".
 * @param {string|null} iso
 * @returns {string}
 */
export function formatPromotionEndDate(iso) {
  if (!iso) return '';
  try {
    // ends_at is exclusive (e.g. 2027-01-01T00:00:00Z = "until 31 Dec 2026").
    // The last effective day is 1ms before ends_at.
    const endMs = new Date(iso).getTime();
    if (!Number.isFinite(endMs)) return '';
    const d = new Date(endMs - 1);
    if (isNaN(d.getTime())) return '';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  } catch (_e) {
    return '';
  }
}