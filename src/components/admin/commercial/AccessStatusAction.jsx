import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#3E4349",
  border: "#DCDBD6",
  card: "#FFFFFF",
  red: "#B23A3A",
  green: "#213428",
  amber: "#625143",
};

const STATUS_COLORS = {
  active: "#213428",
  inactive: "#3E4349",
  trial: "#625143",
  suspended: "#B23A3A",
};

const STATUS_LABELS = {
  active: "Enabled",
  inactive: "Not Activated",
  suspended: "Suspended",
  trial: "Trial",
};

/**
 * Clickable status pill with a dropdown for individual Sound Proof access
 * actions (Enable, Suspend, Restore).
 *
 * Props:
 * - account: Account record
 * - onChanged: (updatedAccount) => void
 */
export default function AccessStatusAction({ account, onChanged }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setConfirming(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!account) return null;

  const status = account.status;
  const color = STATUS_COLORS[status] || BRAND.subtext;
  const label = STATUS_LABELS[status] || (status ? status.charAt(0).toUpperCase() + status.slice(1) : "—");

  async function handleAction(action) {
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke("manageSoundProofAccess", {
        action,
        account_id: account.id,
      });
      const data = res?.data || {};
      if (!data.ok) {
        const failed = (data.results || []).find((r) => !r.ok);
        setError(failed?.error || data.error || "Action failed.");
      } else {
        const result = (data.results || [])[0] || {};
        onChanged?.({
          ...account,
          status: result.new_status || status,
          soundproof_access_expires_at: result.new_expires_at || account.soundproof_access_expires_at,
        });
        setOpen(false);
        setConfirming(null);
      }
    } catch (err) {
      setError(err?.message || "Action failed.");
    } finally {
      setLoading(false);
    }
  }

  const canEnable = status === "inactive";
  const canSuspend = status === "active";
  const canRestore = status === "suspended";

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          padding: "3px 8px", borderRadius: 999,
          border: `1px solid ${BRAND.border}`,
          background: BRAND.card, fontSize: 11, fontWeight: 600, color,
          cursor: "pointer", transition: "border-color 0.15s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = color; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = BRAND.border; }}
      >
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
        {label}
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none"
          stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.6 }}>
          <path d="M1 2.5L4 5.5L7 2.5" />
        </svg>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "100%", left: 0, marginTop: 4,
          background: BRAND.card, border: `1px solid ${BRAND.border}`,
          borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
          zIndex: 50, minWidth: 180, padding: "6px 0",
        }}>
          {canEnable && !confirming && (
            <button
              type="button"
              onClick={() => setConfirming("enable")}
              disabled={loading}
              style={menuItemStyle(BRAND.green)}
            >
              Enable Access
            </button>
          )}
          {canSuspend && !confirming && (
            <button
              type="button"
              onClick={() => setConfirming("suspend")}
              disabled={loading}
              style={menuItemStyle(BRAND.red)}
            >
              Suspend Access
            </button>
          )}
          {canRestore && !confirming && (
            <button
              type="button"
              onClick={() => setConfirming("restore")}
              disabled={loading}
              style={menuItemStyle(BRAND.green)}
            >
              Restore Access
            </button>
          )}

          {confirming && (
            <div style={{ padding: "8px 12px" }}>
              <div style={{ fontSize: 11, color: BRAND.subtext, marginBottom: 8 }}>
                {confirming === "enable" && "Enable Sound Proof access? Starts a 90-day term."}
                {confirming === "suspend" && "Suspend Sound Proof access? Linked users will lose access immediately."}
                {confirming === "restore" && "Restore Sound Proof access?"}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  onClick={() => handleAction(confirming)}
                  disabled={loading}
                  style={{
                    padding: "5px 10px", borderRadius: 6, border: "none",
                    background: confirming === "suspend" ? BRAND.red : BRAND.green,
                    color: "#FFFFFF", fontSize: 11, fontWeight: 600,
                    cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1,
                  }}
                >
                  {loading ? "…" : "Confirm"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(null)}
                  disabled={loading}
                  style={{
                    padding: "5px 10px", borderRadius: 6,
                    border: `1px solid ${BRAND.border}`,
                    background: BRAND.card, color: BRAND.text,
                    fontSize: 11, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {error && (
            <div style={{ padding: "6px 12px", fontSize: 10, color: BRAND.red }}>
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function menuItemStyle(color) {
  return {
    display: "block", width: "100%", textAlign: "left",
    padding: "6px 12px", border: "none", background: "transparent",
    color, fontSize: 12, fontWeight: 600, cursor: "pointer",
  };
}