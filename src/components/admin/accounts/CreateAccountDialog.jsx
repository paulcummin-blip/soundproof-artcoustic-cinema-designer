import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#3E4349",
  border: "#DCDBD6",
  card: "#FFFFFF",
  btn: "#1B1A1A",
  btnText: "#FFFFFF",
  green: "#213428",
  red: "#B23A3A",
};

const inputStyle = {
  width: "100%", padding: "8px 10px", borderRadius: 8,
  border: `1px solid ${BRAND.border}`, background: BRAND.card,
  fontSize: 13, color: BRAND.text, outline: "none",
};

const labelStyle = {
  fontSize: 11, fontWeight: 700, color: BRAND.subtext,
  textTransform: "uppercase", letterSpacing: "0.04em",
  marginBottom: 4, display: "block",
};

/**
 * Create a new account in a given commercial group.
 *
 * Props:
 * - open: boolean
 * - groupKey: "internal" | "professional"
 * - onCreated: (newAccount) => void
 * - onClose: () => void
 */
export default function CreateAccountDialog({ open, groupKey, onCreated, onClose }) {
  const [name, setName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const config = GROUP_CONFIG[groupKey] || GROUP_CONFIG.internal;

  useEffect(() => {
    if (open) {
      setName("");
      setContactEmail("");
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  async function handleSave() {
    setError(null);
    if (!name.trim()) { setError("Account name is required."); return; }

    const payload = {
      name: name.trim(),
      account_type: config.account_type,
      dealer_group: config.dealer_group,
      status: "active",
    };
    if (contactEmail.trim()) payload.contact_email = contactEmail.trim();

    setSaving(true);
    try {
      const account = await base44.entities.Account.create(payload);
      onCreated?.(account);
    } catch (err) {
      setError(err?.message || "Failed to create account.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.4)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16,
    }} onClick={onClose}>
      <div
        style={{
          background: BRAND.card, borderRadius: 12,
          border: `1px solid ${BRAND.border}`,
          maxWidth: 460, width: "100%",
          padding: "20px 24px",
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontSize: 18, fontWeight: 700, color: BRAND.text, marginBottom: 4 }}>
          Create {config.label} Account
        </div>
        <div style={{ fontSize: 12, color: BRAND.subtext, marginBottom: 16 }}>
          {config.description}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={labelStyle}>Account name</label>
            <input style={inputStyle} value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Cinema Luxe" />
          </div>
          <div>
            <label style={labelStyle}>Contact email (optional)</label>
            <input style={inputStyle} value={contactEmail} onChange={e => setContactEmail(e.target.value)}
              placeholder="e.g. info@example.com" />
          </div>
        </div>

        {error && (
          <div style={{
            marginTop: 12, padding: "8px 10px",
            background: "rgb(253 238 238)", border: `1px solid ${BRAND.red}`,
            borderRadius: 8, fontSize: 12, color: BRAND.red,
          }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button onClick={onClose} style={{
            padding: "8px 16px", borderRadius: 8,
            border: `1px solid ${BRAND.border}`, background: BRAND.card, color: BRAND.text,
            fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} style={{
            padding: "8px 16px", borderRadius: 8, border: "none",
            background: saving ? "#888" : BRAND.btn, color: BRAND.btnText,
            fontSize: 13, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer",
          }}>
            {saving ? "Creating…" : "Create Account"}
          </button>
        </div>
      </div>
    </div>
  );
}

export const GROUP_CONFIG = {
  internal: {
    account_type: "internal",
    dealer_group: "INTERNAL",
    label: "Internal",
    description: "Internal Sound Proof staff or development/test account. No dealer page, no trade pricing.",
  },
  professional: {
    account_type: "professional",
    dealer_group: "PROFESSIONAL",
    label: "Professional",
    description: "Non-dealer professional user (cinema designer/specifier). Sound Proof access with no dealer page, trade pricing, or turnover tracking.",
  },
};