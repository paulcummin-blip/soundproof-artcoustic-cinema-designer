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
 * Clean expired-access screen shown when authError.type === 'account_expired'.
 * The dealer's 90-day Sound Proof access term has passed.
 * No operational renewal button is shown until the Lovable integration exists.
 */
export default function AccountExpiredScreen() {
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
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </div>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: BRAND.text, marginBottom: 8 }}>
          Renew Access
        </h1>
        <p style={{ margin: 0, fontSize: 14, color: BRAND.subtext, lineHeight: 1.5, marginBottom: 24 }}>
          Your Sound Proof access has expired.
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