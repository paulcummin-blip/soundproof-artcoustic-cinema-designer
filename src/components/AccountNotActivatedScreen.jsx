import React from "react";
import { useAuth } from "@/lib/AuthContext";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#3E4349",
  border: "#DCDBD6",
  bg: "rgb(248 248 247)",
  card: "#FFFFFF",
  btn: "#1B1A1A",
  btnText: "#FFFFFF",
  amber: "#625143",
};

/**
 * Clean not-activated screen shown when authError.type === 'account_not_activated'.
 * Sound Proof access has not been enabled for this account.
 */
export default function AccountNotActivatedScreen() {
  const { logout } = useAuth();

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: BRAND.bg, padding: 24,
    }}>
      <div style={{
        maxWidth: 420, textAlign: "center",
        background: BRAND.card, border: `1px solid ${BRAND.border}`,
        borderRadius: 16, padding: "40px 32px",
      }}>
        <div style={{
          width: 56, height: 56, margin: "0 auto 20px",
          borderRadius: "50%", background: BRAND.bg,
          display: "flex", alignItems: "center", justifyContent: "center",
          border: `2px solid ${BRAND.amber}`,
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
            stroke={BRAND.amber} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: BRAND.text, marginBottom: 8 }}>
          Sound Proof access has not been enabled
        </h1>
        <button
          onClick={() => logout(true)}
          style={{
            padding: "10px 24px", borderRadius: 10,
            background: BRAND.btn, color: BRAND.btnText,
            fontSize: 14, fontWeight: 600, border: "none", cursor: "pointer",
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}