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
 * Clean suspended-account screen shown when authError.type === 'account_suspended'.
 * Does not expose Projects, Room Designer, reports, or commercial data.
 * Provides a sign-out action only.
 */
export default function AccountSuspendedScreen() {
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
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: BRAND.text, marginBottom: 8 }}>
          Sound Proof access suspended
        </h1>
        <p style={{ margin: 0, fontSize: 14, color: BRAND.subtext, lineHeight: 1.5, marginBottom: 24 }}>
          Please contact Sound Proof for assistance.
        </p>
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