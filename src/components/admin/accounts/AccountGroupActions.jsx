import React, { useState } from "react";
import CreateAccountDialog, { GROUP_CONFIG } from "./CreateAccountDialog";
import InviteUserDialog from "./InviteUserDialog";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#3E4349",
  border: "#DCDBD6",
  card: "#FFFFFF",
  btn: "#1B1A1A",
  btnText: "#FFFFFF",
};

/**
 * Section-level action bar for Internal / Professional account groups.
 * Renders "Create Account" and "Invite User" buttons and owns the dialogs.
 *
 * Props:
 * - groupKey: "internal" | "professional"
 * - accounts: Account[] (this group's accounts, for the invite dropdown)
 * - onChanged: () => void (refresh callback after create/invite)
 */
export default function AccountGroupActions({ groupKey, accounts, onChanged }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  if (!GROUP_CONFIG[groupKey]) return null;

  return (
    <>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button
          onClick={() => setCreateOpen(true)}
          style={{
            padding: "8px 14px", borderRadius: 8,
            border: `1px solid ${BRAND.border}`,
            background: BRAND.card, color: BRAND.text,
            fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}
        >
          + Create Account
        </button>
        <button
          onClick={() => setInviteOpen(true)}
          style={{
            padding: "8px 14px", borderRadius: 8,
            border: `1px solid ${BRAND.border}`,
            background: BRAND.card, color: BRAND.text,
            fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}
        >
          + Invite User
        </button>
      </div>

      <CreateAccountDialog
        open={createOpen}
        groupKey={groupKey}
        onCreated={() => { setCreateOpen(false); onChanged?.(); }}
        onClose={() => setCreateOpen(false)}
      />
      <InviteUserDialog
        open={inviteOpen}
        accounts={accounts}
        onInvited={() => { onChanged?.(); }}
        onClose={() => setInviteOpen(false)}
      />
    </>
  );
}