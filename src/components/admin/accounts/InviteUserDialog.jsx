import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { ACCESS_LABELS, ACCESS_LEVELS } from "@/lib/accountAccess";

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
  width: "100%",
  padding: "8px 10px",
  borderRadius: 8,
  border: `1px solid ${BRAND.border}`,
  background: BRAND.card,
  fontSize: 13,
  color: BRAND.text,
  outline: "none",
};

const labelStyle = {
  fontSize: 11,
  fontWeight: 700,
  color: BRAND.subtext,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  marginBottom: 4,
  display: "block",
};

export default function InviteUserDialog({
  open,
  accounts,
  preselectedAccountId = null,
  onInvited,
  onClose,
}) {
  const [email, setEmail] = useState("");
  const [accountId, setAccountId] = useState("");
  const [permission, setPermission] = useState("ADMIN");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const sortedAccounts = useMemo(
    () => [...(accounts || [])].sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [accounts],
  );

  useEffect(() => {
    if (!open) return;
    setEmail("");
    setAccountId(preselectedAccountId || sortedAccounts[0]?.id || "");
    setPermission("ADMIN");
    setError("");
    setSuccess("");
  }, [open, preselectedAccountId, sortedAccounts]);

  if (!open) return null;

  async function handleInvite() {
    setError("");
    setSuccess("");
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError("Email is required.");
      return;
    }
    if (!accountId) {
      setError("Select an account.");
      return;
    }

    setSaving(true);
    try {
      await base44.functions.invoke("manageAccountUsers", {
        action: "invite",
        account_id: accountId,
        email: cleanEmail,
        access_level: permission === "ADMIN" ? ACCESS_LEVELS.FULL_ACCESS : permission,
        is_account_admin: permission === "ADMIN",
      });
      const account = sortedAccounts.find((item) => item.id === accountId);
      setSuccess(`User access created for ${cleanEmail} in "${account?.name || "account"}".`);
      onInvited?.();
    } catch (err) {
      setError(
        err?.response?.data?.message
        || err?.data?.message
        || err?.message
        || "Failed to invite user."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: BRAND.card,
          borderRadius: 12,
          border: `1px solid ${BRAND.border}`,
          maxWidth: 480,
          width: "100%",
          padding: "20px 24px",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ fontSize: 18, fontWeight: 700, color: BRAND.text, marginBottom: 4 }}>
          Invite Account User
        </div>
        <div style={{ fontSize: 12, color: BRAND.subtext, marginBottom: 16, lineHeight: 1.5 }}>
          Invitations and permissions are recorded in the account audit trail. Each account is limited to five logins.
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={labelStyle}>Account</label>
            <select
              style={inputStyle}
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
              disabled={Boolean(preselectedAccountId)}
            >
              <option value="">Select an account…</option>
              {sortedAccounts.map((account) => (
                <option key={account.id} value={account.id}>{account.name || "Unnamed"}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Email address</label>
            <input
              type="email"
              style={inputStyle}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="colleague@company.com"
            />
          </div>

          <div>
            <label style={labelStyle}>Permission</label>
            <select style={inputStyle} value={permission} onChange={(event) => setPermission(event.target.value)}>
              <option value="ADMIN">Account Admin (primary login)</option>
              {Object.values(ACCESS_LEVELS).map((level) => (
                <option key={level} value={level}>{ACCESS_LABELS[level]}</option>
              ))}
            </select>
            <div style={{ marginTop: 5, fontSize: 11, color: BRAND.subtext }}>
              Choose Account Admin only when establishing the account's single primary administrator.
            </div>
          </div>
        </div>

        {success && (
          <div style={{ marginTop: 12, padding: "8px 10px", background: "rgb(238 246 240)", border: `1px solid ${BRAND.green}`, borderRadius: 8, fontSize: 12, color: BRAND.green }}>
            {success}
          </div>
        )}
        {error && (
          <div style={{ marginTop: 12, padding: "8px 10px", background: "rgb(253 238 238)", border: `1px solid ${BRAND.red}`, borderRadius: 8, fontSize: 12, color: BRAND.red }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button
            onClick={onClose}
            style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${BRAND.border}`, background: BRAND.card, color: BRAND.text, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            {success ? "Close" : "Cancel"}
          </button>
          {!success && (
            <button
              onClick={handleInvite}
              disabled={saving}
              style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: saving ? "#888" : BRAND.btn, color: BRAND.btnText, fontSize: 13, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer" }}
            >
              {saving ? "Sending…" : "Send Invitation"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
