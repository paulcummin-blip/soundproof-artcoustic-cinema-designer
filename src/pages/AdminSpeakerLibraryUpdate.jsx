// AdminSpeakerLibraryUpdate.jsx
// Administrator page for a staged Speaker Library update from the RP22
// Comparison brands workbook. Master-admin only (the entities it writes are
// admin-only). Renders the review panel; no direct data writes here.

import React from "react";
import { useAuth } from "@/lib/AuthContext";
import StagingUpdateReviewPanel from "@/components/admin/speaker-library-update/StagingUpdateReviewPanel";

const BRAND = { text: "#1B1A1A", subtext: "#3E4349" };

export default function AdminSpeakerLibraryUpdate() {
  const { user, isLoadingAuth } = useAuth();
  if (isLoadingAuth) {
    return <div style={{ padding: 48, textAlign: "center", color: BRAND.subtext }}>Checking access…</div>;
  }
  if (user?.role !== "admin") {
    return (
      <div style={{ padding: 48, textAlign: "center", color: BRAND.subtext }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: BRAND.text }}>Access Denied</div>
        <div style={{ fontSize: 14, marginTop: 6 }}>This page is restricted to admin users.</div>
      </div>
    );
  }
  return <StagingUpdateReviewPanel />;
}