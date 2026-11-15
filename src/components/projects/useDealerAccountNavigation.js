// Resolves the authenticated dealer's own Partner Portal / Lovable Dealer
// Page URL. Read-only — calls resolveDealerAccountNavigation, which derives
// the account from the authenticated session and fails closed on any
// ambiguity. The browser never supplies an account or dealer selector.
//
// Returns { url: string|null, loading: boolean }.
// url is null for admin users, non-dealer accounts, or unresolved identities.

import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { hasCapability } from '@/lib/accountAccess';

export function useDealerAccountNavigation() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const canUseCommercial = hasCapability(user, 'commercial');
  const [url, setUrl] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || isAdmin || !canUseCommercial) {
      setUrl(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const response = await base44.functions.invoke('resolveDealerAccountNavigation', {});
        const data = response?.data || {};
        if (!cancelled) {
          setUrl(data.eligible === true && typeof data.url === 'string' ? data.url : null);
        }
      } catch {
        // Optional navigation fails closed: ambiguity or backend failure hides the link.
        if (!cancelled) setUrl(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [user?.id, isAdmin, canUseCommercial]);

  return { url, loading };
}