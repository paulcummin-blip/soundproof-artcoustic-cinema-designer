import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { base44 } from "@/api/base44Client";

/**
 * Single in-memory identity provider for the Partner Portal Dealer Identity.
 *
 * Resolves the dealer identity on mount via the resolveDealerIdentity backend
 * function and caches it in React state for the current session only.
 * Nothing is persisted to localStorage, sessionStorage, or the database.
 *
 * Exposes { identity, loading, error, reason, refetch } via usePartnerPortalIdentity().
 */

const PartnerPortalIdentityContext = createContext(null);

export function PartnerPortalIdentityProvider({ children }) {
  const [state, setState] = useState({
    identity: null,
    loading: true,
    error: null,
    reason: null,
  });

  const resolve = useCallback(async () => {
    setState((prev) => ({
      ...prev,
      loading: true,
      error: null,
      reason: null,
    }));
    try {
      const response = await base44.functions.invoke("resolveDealerIdentity", {});
      const data = response?.data || response;
      if (data?.resolved === true && data?.identity) {
        setState({
          identity: data.identity,
          loading: false,
          error: null,
          reason: null,
        });
        console.log("[PartnerPortalIdentity] Dealer identity resolved", {
          dealer: data.identity.dealer_name,
          dealerAccountId: data.identity.dealer_account_id,
        });
      } else {
        setState({
          identity: null,
          loading: false,
          error: null,
          reason: data?.reason || "NOT_RESOLVED",
        });
      }
    } catch (error) {
      setState({
        identity: null,
        loading: false,
        error: String(error?.message || error || "INVOKE_FAILED"),
        reason: null,
      });
    }
  }, []);

  useEffect(() => {
    resolve();
  }, [resolve]);

  const value = { ...state, refetch: resolve };

  return (
    <PartnerPortalIdentityContext.Provider value={value}>
      {children}
    </PartnerPortalIdentityContext.Provider>
  );
}

export function usePartnerPortalIdentity() {
  const ctx = useContext(PartnerPortalIdentityContext);
  if (!ctx) {
    return {
      identity: null,
      loading: false,
      error: null,
      reason: "NO_PROVIDER",
      refetch: () => {},
    };
  }
  return ctx;
}