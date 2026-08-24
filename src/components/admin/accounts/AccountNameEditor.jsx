import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Pencil, Check, X } from "lucide-react";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#3E4349",
  border: "#DCDBD6",
  green: "#213428",
  red: "#B23A3A",
};

/**
 * Inline editor for the canonical Account.name (dealer/company name).
 * Admin-only — used on the central admin Account Dashboard heading.
 * On save, updates the Account entity directly (admin RLS permits update).
 */
export default function AccountNameEditor({ account, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(account?.name || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!editing) setDraft(account?.name || "");
  }, [account?.name, editing]);

  async function handleSave() {
    const trimmed = draft.trim();
    if (!trimmed) {
      setError("Account name cannot be empty.");
      return;
    }
    if (trimmed === (account?.name || "")) {
      setEditing(false);
      setError(null);
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const updated = await base44.entities.Account.update(account.id, { name: trimmed });
      onSaved?.(updated);
      setEditing(false);
    } catch (err) {
      setError(err?.message || "Failed to save account name.");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setDraft(account?.name || "");
    setError(null);
    setEditing(false);
  }

  if (editing) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") handleCancel();
          }}
          disabled={saving}
          maxLength={120}
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: BRAND.text,
            border: `1px solid ${BRAND.border}`,
            borderRadius: 8,
            padding: "4px 10px",
            outline: "none",
            minWidth: 260,
            fontFamily: "inherit",
          }}
        />
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            borderRadius: 8,
            background: BRAND.green,
            color: "#FFFFFF",
            border: "none",
            fontSize: 13,
            fontWeight: 600,
            cursor: saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.6 : 1,
          }}
        >
          <Check size={15} /> Save
        </button>
        <button
          onClick={handleCancel}
          disabled={saving}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            borderRadius: 8,
            background: "transparent",
            color: BRAND.subtext,
            border: `1px solid ${BRAND.border}`,
            fontSize: 13,
            fontWeight: 600,
            cursor: saving ? "not-allowed" : "pointer",
          }}
        >
          <X size={15} /> Cancel
        </button>
        {error && (
          <div style={{ width: "100%", fontSize: 12, color: BRAND.red, marginTop: 4 }}>
            {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: BRAND.text }}>
        {account?.name || "Unnamed Account"}
      </h1>
      <button
        onClick={() => { setDraft(account?.name || ""); setEditing(true); }}
        title="Edit account name"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 30,
          height: 30,
          borderRadius: 8,
          background: "transparent",
          color: BRAND.subtext,
          border: `1px solid ${BRAND.border}`,
          cursor: "pointer",
        }}
      >
        <Pencil size={14} />
      </button>
    </div>
  );
}