import React, { useState } from "react";
import { base44 } from "@/api/base44Client";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#3E4349",
  border: "#DCDBD6",
  card: "#FFFFFF",
  red: "#B23A3A",
  green: "#213428",
  bg: "rgb(248 248 247)",
};

/**
 * Bulk action bar for managing Sound Proof access across multiple Premium
 * Partner accounts. Shows when accounts are selected.
 *
 * Props:
 * - selectedIds: Set<string>
 * - onCleared: () => void
 * - onCompleted: () => void
 */
export default function BulkAccessBar({ selectedIds, onCleared, onCompleted }) {
  const [confirming, setConfirming] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const count = selectedIds?.size || 0;
  if (count === 0 && !result) return null;

  async function handleBulk(action) {
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke("manageSoundProofAccess", {
        action,
        account_ids: Array.from(selectedIds),
      });
      const data = res?.data || {};
      setResult(data);
      if (data.ok) {
        setTimeout(() => {
          setResult(null);
          setConfirming(null);
          onCleared?.();
          onCompleted?.();
        }, 1500);
      }
    } catch (err) {
      setResult({ ok: false, error: err?.message || "Bulk action failed." });
    } finally {
      setLoading(false);
    }
  }

  const [error, setError] = useState(null);

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
      padding: "10px 14px", marginBottom: 12,
      background: BRAND.card, border: `1px solid ${BRAND.border}`,
      borderRadius: 8,
    }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: BRAND.text }}>
        {count} selected
      </span>

      {!confirming && !result && (
        <>
          <button
            type="button"
            onClick={() => setConfirming("enable")}
            disabled={loading}
            style={btnStyle(BRAND.green, false)}
          >
            Enable Access
          </button>
          <button
            type="button"
            onClick={() => setConfirming("suspend")}
            disabled={loading}
            style={btnStyle(BRAND.red, false)}
          >
            Suspend Access
          </button>
          <button
            type="button"
            onClick={() => onCleared?.()}
            style={btnStyle(BRAND.subtext, true)}
          >
            Clear selection
          </button>
        </>
      )}

      {confirming && !result && (
        <>
          <span style={{ fontSize: 12, color: BRAND.subtext }}>
            {confirming === "enable"
              ? `Enable access for ${count} account(s)? Each starts a 90-day term.`
              : `Suspend access for ${count} account(s)? Linked users will lose access immediately.`}
          </span>
          <button
            type="button"
            onClick={() => handleBulk(confirming)}
            disabled={loading}
            style={btnStyle(confirming === "suspend" ? BRAND.red : BRAND.green, false)}
          >
            {loading ? "Applying…" : "Confirm"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(null)}
            disabled={loading}
            style={btnStyle(BRAND.subtext, true)}
          >
            Cancel
          </button>
        </>
      )}

      {result && (
        <div style={{ fontSize: 12, color: result.ok ? BRAND.green : BRAND.red }}>
          {result.ok
            ? `Done: ${result.succeeded} account(s) updated.`
            : `Completed with ${result.failed} failure(s) of ${result.processed}.`}
          {!result.ok && result.results && (
            <ul style={{ margin: "4px 0 0 16px", padding: 0, fontSize: 11, color: BRAND.red }}>
              {result.results.filter((r) => !r.ok).map((r) => (
                <li key={r.account_id}>{r.account_id}: {r.error}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function btnStyle(color, isOutline) {
  return {
    padding: "6px 14px", borderRadius: 8,
    border: isOutline ? `1px solid ${BRAND.border}` : "none",
    background: isOutline ? BRAND.card : color,
    color: isOutline ? color : "#FFFFFF",
    fontSize: 12, fontWeight: 600, cursor: "pointer",
  };
}