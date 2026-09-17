// src/pages/AdminSpeakerDatabase.jsx
//
// Main admin page for the Speaker Capability Database.
// Contains sub-navigation (Dashboard, Manufacturers, Products, Validation,
// Change History, Settings) and renders the active section.

import React, { useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import SpeakerDbNav from "@/components/admin/speaker-db/SpeakerDbNav";
import SpeakerDbDashboard from "@/components/admin/speaker-db/SpeakerDbDashboard";
import SpeakerDbManufacturers from "@/components/admin/speaker-db/SpeakerDbManufacturers";
import SpeakerDbProducts from "@/components/admin/speaker-db/SpeakerDbProducts";
import SpeakerDbValidation from "@/components/admin/speaker-db/SpeakerDbValidation";
import SpeakerDbChangeHistory from "@/components/admin/speaker-db/SpeakerDbChangeHistory";
import SpeakerDbSettings from "@/components/admin/speaker-db/SpeakerDbSettings";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#3E4349",
  border: "#DCDBD6",
  bg: "rgb(248 248 247)",
  btn: "#1B1A1A",
  btnText: "#FFFFFF",
};

export default function AdminSpeakerDatabase() {
  const { user, isLoadingAuth } = useAuth();
  const isAdmin = user?.role === "admin";
  const [section, setSection] = useState("dashboard");

  if (isLoadingAuth) {
    return <div style={{ padding: 48, textAlign: "center", color: BRAND.subtext }}>Checking access…</div>;
  }

  if (!isAdmin) {
    return (
      <div style={{ padding: 48, textAlign: "center", color: BRAND.subtext, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 32 }}>🔒</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: BRAND.text }}>Access Denied</div>
        <div style={{ fontSize: 14 }}>This page is restricted to admin users.</div>
        <a href="/Projects" style={{ marginTop: 8, padding: "10px 20px", borderRadius: 10, background: BRAND.btn, color: BRAND.btnText, fontSize: 14, textDecoration: "none" }}>Go to Projects</a>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, background: BRAND.bg, minHeight: "100vh", color: BRAND.text }}>
      <div style={{ marginBottom: 20 }}>
        <a href="/admin" style={{ fontSize: 13, color: BRAND.subtext, textDecoration: "none" }}>← Back to Admin Dashboard</a>
      </div>

      <div style={{ marginBottom: 8 }}>
        <h1 style={{ margin: 0, fontSize: 26, color: BRAND.text }}>Speaker Capability Database</h1>
        <div style={{ fontSize: 13, color: BRAND.subtext, marginTop: 4 }}>
          The single source of truth for all loudspeaker capability data in Sound Proof.
        </div>
      </div>

      <SpeakerDbNav active={section} onChange={setSection} />

      {section === "dashboard" && <SpeakerDbDashboard />}
      {section === "manufacturers" && <SpeakerDbManufacturers />}
      {section === "products" && <SpeakerDbProducts />}
      {section === "validation" && <SpeakerDbValidation />}
      {section === "history" && <SpeakerDbChangeHistory />}
      {section === "settings" && <SpeakerDbSettings />}
    </div>
  );
}