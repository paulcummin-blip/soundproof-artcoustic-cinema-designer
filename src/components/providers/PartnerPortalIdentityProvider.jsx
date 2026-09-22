import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { base44 } from "@/api/base44Client";
import DealerIdentityMismatchScreen from "@/components/DealerIdentityMismatchScreen";

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
    association: null,
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
      const response = await base44.functions.invoke("associateDealerIdentity", {});
      const data = response?.data || response;
      if (data?.resolved === true && data?.identity) {
        setState({
          identity: data.identity,
          association: data.association || null,
          loading: false,
          error: null,
          reason: null,
        });
      } else {
        setState({
          identity: null,
          association: null,
          loading: false,
          error: data?.reason === "DEALER_IDENTITY_MISMATCH" ? "DEALER_IDENTITY_MISMATCH" : null,
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

  if (state.error === "DEALER_IDENTITY_MISMATCH") {
    return <DealerIdentityMismatchScreen />;
  }

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