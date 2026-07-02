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
};

/**
 * Generic "coming soon" admin section page.
 * Props: title, description
 */
export default function AdminPlaceholderPage({ title, description }) {
  const { user, isLoadingAuth } = useAuth();
  const isAdmin = user?.role === "admin";

  if (isLoadingAuth) {
    return <div style={{ padding: 48, textAlign: "center", color: BRAND.subtext }}>Checking access…</div>;
  }

  if (!isAdmin) {
    return (
      <div style={{
        padding: 48, textAlign: "center", color: BRAND.subtext,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
      }}>
        <div style={{ fontSize: 32 }}>🔒</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: BRAND.text }}>Access Denied</div>
        <div style={{ fontSize: 14 }}>This page is restricted to admin users.</div>
        <a href="/Projects" style={{
          marginTop: 8, padding: "10px 20px", borderRadius: 10,
          background: BRAND.btn, color: BRAND.btnText,
          fontSize: 14, textDecoration: "none",
        }}>Go to Projects</a>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, background: BRAND.bg, minHeight: "100vh", color: BRAND.text }}>
      <div style={{ marginBottom: 20 }}>
        <a href="/admin" style={{ fontSize: 13, color: BRAND.subtext, textDecoration: "none" }}>
          ← Back to Admin Dashboard
        </a>
      </div>

      <div style={{
        background: BRAND.card, border: `1px dashed ${BRAND.border}`,
        borderRadius: 12, padding: 48, textAlign: "center",
      }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: BRAND.text, marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 14, color: BRAND.subtext }}>{description}</div>
        <div style={{ marginTop: 16, fontSize: 13, color: BRAND.subtext }}>Coming soon.</div>
      </div>
    </div>
  );
}