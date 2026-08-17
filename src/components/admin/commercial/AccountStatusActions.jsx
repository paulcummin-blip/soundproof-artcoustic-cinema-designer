import React, { useState } from "react";
import { base44 } from "@/api/base44Client";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#3E4349",
  border: "#DCDBD6",
  card: "#FFFFFF",
  red: "#B23A3A",
  green: "#213428",
};

/**
 * Admin-only Suspend / Reactivate Account actions.
 * Confirmation is required before changing status.
 *
 * Props:
 * - account: Account record
 * - onStatusChanged: (updatedAccount) => void
 */
export default function AccountStatusActions({ account, onStatusChanged }) {
  const [confirming, setConfirming] = useState(null); // null | 'suspend' | 'reactivate'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!account) return null;

  const status = account.status;
  const canSuspend = status === "active" || status === "inactive";
  const canReactivate = status === "suspended";

  async function handleSuspend() {
    setLoading(true);
    setError(null);
    try {
      const updated = await base44.entities.Account.update(account.id, { status: "suspended" });
      onStatusChanged?.(updated);
    } catch (err) {
      setError(err?.message || "Failed to suspend account");
    } finally {
      setLoading(false);
      setConfirming(null);
    }
  }

  async function handleReactivate() {
    setLoading(true);
    setError(null);
    try {
      const updated = await base44.entities.Account.update(account.id, { status: "active" });
      onStatusChanged?.(updated);
    } catch (err) {
      setError(err?.message || "Failed to reactivate account");
    } finally {
      setLoading(false);
      setConfirming(null);
    }
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        background: BRAND.card, border: `1px solid ${BRAND.border}`,
        borderRadius: 12, padding: "16px 20px",
        display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: BRAND.text }}>
          Account status controls
        </div>

        {canSuspend && !confirming && (
          <button
            onClick={() => setConfirming("suspend")}
            disabled={loading}
            style={{
              padding: "8px 16px", borderRadius: 8,
              border: `1px solid ${BRAND.border}`,
              background: BRAND.card, color: BRAND.red,
              fontSize: 12, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            Suspend Account
          </button>
        )}

        {canReactivate && !confirming && (
          <button
            onClick={() => setConfirming("reactivate")}
            disabled={loading}
            style={{
              padding: "8px 16px", borderRadius: 8,
              border: `1px solid ${BRAND.border}`,
              background: BRAND.card, color: BRAND.green,
              fontSize: 12, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            Reactivate Account
          </button>
        )}

        {confirming === "suspend" && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: BRAND.subtext }}>
              Suspend this account? Linked users will lose Sound Proof access.
            </span>
            <button
              onClick={handleSuspend}
              disabled={loading}
              style={{
                padding: "6px 14px", borderRadius: 8,
                background: BRAND.red, color: "#FFFFFF",
                fontSize: 12, fontWeight: 600, border: "none",
                cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? "Suspending…" : "Confirm Suspend"}
            </button>
            <button
              onClick={() => setConfirming(null)}
              disabled={loading}
              style={{
                padding: "6px 14px", borderRadius: 8,
                border: `1px solid ${BRAND.border}`,
                background: BRAND.card, color: BRAND.text,
                fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        )}

        {confirming === "reactivate" && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: BRAND.subtext }}>
              Reactivate this account? Linked users will regain Sound Proof access.
            </span>
            <button
              onClick={handleReactivate}
              disabled={loading}
              style={{
                padding: "6px 14px", borderRadius: 8,
                background: BRAND.green, color: "#FFFFFF",
                fontSize: 12, fontWeight: 600, border: "none",
                cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? "Reactivating…" : "Confirm Reactivate"}
            </button>
            <button
              onClick={() => setConfirming(null)}
              disabled={loading}
              style={{
                padding: "6px 14px", borderRadius: 8,
                border: `1px solid ${BRAND.border}`,
                background: BRAND.card, color: BRAND.text,
                fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        )}

        {error && (
          <div style={{ fontSize: 12, color: BRAND.red, width: "100%" }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}