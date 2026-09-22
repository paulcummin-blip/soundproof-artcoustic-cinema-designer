import React from "react";
import { usePartnerPortalIdentity } from "@/components/providers/PartnerPortalIdentityProvider";
import { SHOW_DEBUG_PANEL } from "@/components/utils/diagnostics";

/**
 * Temporary developer diagnostic panel for the Partner Portal Dealer Identity.
 *
 * Shows the resolved dealer identity (or error/reason) as a floating panel.
 * Only visible when SHOW_DEBUG_PANEL is enabled. Nothing user-facing.
 */
export default function DealerIdentityDiagnostic() {
  const { identity, loading, error, reason } = usePartnerPortalIdentity();

  if (!SHOW_DEBUG_PANEL) return null;
  if (loading && !identity && !error && !reason) return null;
  if (!identity && !error && !reason) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 12,
        right: 12,
        maxWidth: 380,
        padding: "10px 14px",
        borderRadius: 8,
        background: "#1B1A1A",
        color: "#F5F4F0",
        fontSize: 11,
        fontFamily: "monospace",
        lineHeight: 1.5,
        zIndex: 9999,
        boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
        border: "1px solid #3E4349",
      }}
    >
      <div
        style={{
          fontWeight: 700,
          marginBottom: 6,
          color: "#a8c7a0",
        }}
      >
        Partner Portal Identity
      </div>
      {loading && <div>Resolving…</div>}
      {error && (
        <div style={{ color: "#ff8a80" }}>Error: {error}</div>
      )}
      {!loading && !identity && reason && (
        <div style={{ color: "#ffcc80" }}>Not resolved: {reason}</div>
      )}
      {identity && (
        <div>
          <div>
            <strong>Dealer:</strong> {identity.dealer_name}
          </div>
          <div>
            <strong>Account ID:</strong> {identity.dealer_account_id}
          </div>
          <div>
            <strong>Status:</strong> {identity.status}
          </div>
          <div>
            <strong>Version:</strong> {identity.identity_version}
          </div>
        </div>
      )}
    </div>
  );
}