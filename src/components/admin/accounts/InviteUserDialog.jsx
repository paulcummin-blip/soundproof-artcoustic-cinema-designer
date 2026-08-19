import React, { useState, useEffect, useMemo } from "react";
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
 * Invite a new auth user and link them to an account via account_id.
 *
 * Flow:
 * 1. base44.auth.inviteUser(email, 'user') — creates auth user, sends invite email.
 * 2. base44.entities.User.filter({ email }) — locate the created user record.
 * 3. base44.entities.User.update(userId, { account_id }) — link to the account.
 *
 * Props:
 * - open: boolean
 * - accounts: Account[] (accounts in this group, for the dropdown)
 * - preselectedAccountId: string (optional — locks the account)
 * - onInvited: () => void
 * - onClose: () => void
 */
export default function InviteUserDialog({ open, accounts, preselectedAccountId, onInvited, onClose }) {
  const [email, setEmail] = useState("");
  const [accountId, setAccountId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const sortedAccounts = useMemo(() => {
    if (!accounts) return [];
    return [...accounts].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [accounts]);

  useEffect(() => {
    if (open) {
      setEmail("");
      setAccountId(preselectedAccountId || (sortedAccounts[0]?.id || ""));
      setError(null);
      setSuccess(null);
    }
  }, [open, preselectedAccountId, sortedAccounts]);

  if (!open) return null;

  async function handleInvite() {
    setError(null);
    setSuccess(null);
    const cleanEmail = email.trim();
    if (!cleanEmail) { setError("Email is required."); return; }
    if (!accountId) { setError("Select an account to link the user to."); return; }

    setSaving(true);
    try {
      // Step 1: invite the auth user (platform sends the set-password email).
      // If the user already exists, inviteUser may throw — tolerate that and
      // proceed to link the existing record.
      try {
        await base44.auth.inviteUser(cleanEmail, "user");
      } catch (inviteErr) {
        // Continue — we'll attempt to locate and link the existing user below.
        // Only surface this as an error if the subsequent lookup also fails.
      }

      // Step 2: locate the user record by email.
      const users = await base44.entities.User.filter({ email: cleanEmail });
      const user = Array.isArray(users) && users.length > 0 ? users[0] : null;
      if (!user) {
        setError("Invitation sent, but the user record could not be found to link. The user may need to accept the invite before linking. Re-open this dialog after they set a password.");
        return;
      }

      // Step 3: link the user to the account.
      await base44.entities.User.update(user.id, { account_id: accountId });

      const acct = sortedAccounts.find(a => a.id === accountId);
      setSuccess(`Invitation sent to ${cleanEmail} and linked to "${acct?.name || "account"}". The user will set their password from the email and can then log in.`);
      onInvited?.();
    } catch (err) {
      setError(err?.message || "Failed to invite user.");
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
          Invite User
        </div>
        <div style={{ fontSize: 12, color: BRAND.subtext, marginBottom: 16 }}>
          Sends an email invitation. The user sets their own password and is linked to the selected account.
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={labelStyle}>Account</label>
            <select style={inputStyle} value={accountId} onChange={e => setAccountId(e.target.value)}
              disabled={!!preselectedAccountId}>
              <option value="">Select an account…</option>
              {sortedAccounts.map(a => (
                <option key={a.id} value={a.id}>{a.name || "Unnamed"}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Email address</label>
            <input style={inputStyle} value={email} onChange={e => setEmail(e.target.value)}
              placeholder="e.g. info@example.com" />
          </div>
        </div>

        {success && (
          <div style={{
            marginTop: 12, padding: "8px 10px",
            background: "rgb(238 246 240)", border: `1px solid ${BRAND.green}`,
            borderRadius: 8, fontSize: 12, color: BRAND.green,
          }}>
            {success}
          </div>
        )}
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
            {success ? "Close" : "Cancel"}
          </button>
          {!success && (
            <button onClick={handleInvite} disabled={saving} style={{
              padding: "8px 16px", borderRadius: 8, border: "none",
              background: saving ? "#888" : BRAND.btn, color: BRAND.btnText,
              fontSize: 13, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer",
            }}>
              {saving ? "Sending…" : "Send Invitation"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}