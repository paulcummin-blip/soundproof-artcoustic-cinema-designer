// src/pages/AdminModelFirstSpeaker.jsx
//
// Model-first entry point into the Speaker Database: the admin types the
// manufacturer and the exact model, and Sound Proof works only from that model.

import React from "react";
import { useAuth } from "@/lib/AuthContext";
import ModelFirstWizard from "@/components/admin/speaker-db/model-first/ModelFirstWizard";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#3E4349",
  bg: "rgb(248 248 247)",
  btn: "#1B1A1A",
};

export default function AdminModelFirstSpeaker() {
  const { user, isLoadingAuth } = useAuth();
  const isAdmin = user?.role === "admin";

  if (isLoadingAuth) {
    return <div style={{ padding: 48, textAlign: "center", color: BRAND.subtext }}>Checking access…</div>;
  }

  if (!isAdmin) {
    return (
      <div style={{ padding: 48, textAlign: "center", color: BRAND.subtext, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: BRAND.text }}>Access Denied</div>
        <div style={{ fontSize: 14 }}>This page is restricted to admin users.</div>
        <a href="/Projects" style={{ marginTop: 8, padding: "10px 20px", borderRadius: 10, background: BRAND.btn, color: "#FFF", fontSize: 14, textDecoration: "none" }}>Go to Projects</a>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, background: BRAND.bg, minHeight: "100vh", color: BRAND.text }}>
      <div style={{ marginBottom: 16 }}>
        <a href="/admin/speaker-database" style={{ fontSize: 13, color: BRAND.subtext, textDecoration: "none" }}>
          ← Back to Speaker Database
        </a>
      </div>

      <div style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 26 }}>Add Competitor Model</h1>
        <div style={{ fontSize: 13, color: BRAND.subtext, marginTop: 4, maxWidth: 820 }}>
          Model-first entry: name the manufacturer and the exact model, and Sound Proof looks only at that
          manufacturer's own website for that model. Approved specifications are published into the RP22
          comparison library; drafts and unapproved records never appear there.
        </div>
      </div>

      <ModelFirstWizard />
    </div>
  );
}