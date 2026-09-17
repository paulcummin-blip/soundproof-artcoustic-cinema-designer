// AdminAddSpeaker.jsx — Page wrapper for the Add Speaker wizard

import React from "react";
import { useAuth } from "@/lib/AuthContext";
import AddSpeakerWizard from "@/components/admin/speaker-db/add-speaker/AddSpeakerWizard.jsx";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#625143",
};

export default function AdminAddSpeaker() {
  const { user, isLoadingAuth } = useAuth();
  const isAdmin = user?.role === "admin";

  if (isLoadingAuth) {
    return <div style={{ padding: 48, textAlign: "center", color: BRAND.subtext }}>Checking access…</div>;
  }

  if (!isAdmin) {
    return (
      <div style={{ padding: 48, textAlign: "center", color: BRAND.subtext, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 32 }}>🔒</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: BRAND.text }}>Access Denied</div>
        <div style={{ fontSize: 14 }}>This page is restricted to admin users.</div>
        <a href="/Projects" style={{ marginTop: 8, padding: "10px 20px", borderRadius: 10, background: "#1B1A1A", color: "#fff", fontSize: 14, textDecoration: "none" }}>Go to Projects</a>
      </div>
    );
  }

  return <AddSpeakerWizard />;
}