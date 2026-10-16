// src/pages/AdminSpeakerDatabase.jsx
//
// Main admin page for the Speaker Database.
// Contains sub-navigation (Dashboard, Manufacturers, Products, Data Quality,
// Change History, Settings) and renders the active section.

import React, { useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import SpeakerDbNav from "@/components/admin/speaker-db/SpeakerDbNav";
import SpeakerDbDashboard from "@/components/admin/speaker-db/SpeakerDbDashboard";
import SpeakerDbManufacturers from "@/components/admin/speaker-db/SpeakerDbManufacturers";
import SpeakerDbManufacturerHealth from "@/components/admin/speaker-db/SpeakerDbManufacturerHealth";
import SpeakerDbProducts from "@/components/admin/speaker-db/SpeakerDbProducts";
import SpeakerDbDataQuality from "@/components/admin/speaker-db/SpeakerDbDataQuality";
import SpeakerDbChangeHistory from "@/components/admin/speaker-db/SpeakerDbChangeHistory";
import SpeakerDbSettings from "@/components/admin/speaker-db/SpeakerDbSettings";
import CanonicalDataTransfer from "@/components/admin/speaker-db/canonical/CanonicalDataTransfer";
import SpeakerDbDataTransferActions from "@/components/admin/speaker-db/SpeakerDbDataTransferActions";

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
  // Header "Import speaker data" intent: opens the canonical import workflow in
  // the Export / Import section, then clears itself once that screen has
  // handled it, so returning to the section never reopens the upload on its own.
  const [transferIntent, setTransferIntent] = useState(null);
  // Drill-in filter: when set, the Products tab shows only the specified
  // manufacturer's incomplete products. Set by the Manufacturer Health page.
  const [productsDrillFilter, setProductsDrillFilter] = useState(null);

  const handleDrillIntoManufacturer = (manufacturerId, manufacturerName) => {
    setProductsDrillFilter({ manufacturerId, manufacturerName, incompleteOnly: true });
    setSection("products");
  };

  const handleClearDrillFilter = () => {
    setProductsDrillFilter(null);
  };

  const handleImportSpeakerData = () => {
    setTransferIntent("import");
    setSection("dataTransfer");
  };

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

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 20 }}>
        <div style={{ flex: "1 1 420px", minWidth: 260 }}>
          <h1 style={{ margin: 0, fontSize: 26, color: BRAND.text }}>Speaker Database</h1>
          <div style={{ fontSize: 13, color: BRAND.subtext, marginTop: 4 }}>
            A structured catalogue of loudspeaker specifications and sources. Capability is derived downstream by the RP22 engine.
          </div>
          <a
            href="/admin/speaker-database/model-first"
            style={{ display: "inline-block", marginTop: 12, padding: "9px 14px", borderRadius: 10, background: BRAND.text, color: BRAND.btnText, fontSize: 13, fontWeight: 600, textDecoration: "none" }}
          >
            Add competitor model by name
          </a>
        </div>

        <SpeakerDbDataTransferActions onImport={handleImportSpeakerData} />
      </div>

      <SpeakerDbNav active={section} onChange={setSection} />

      {section === "dashboard" && <SpeakerDbDashboard />}
      {section === "manufacturers" && <SpeakerDbManufacturers />}
      {section === "manufacturerHealth" && <SpeakerDbManufacturerHealth onDrillInto={handleDrillIntoManufacturer} />}
      {section === "products" && <SpeakerDbProducts drillFilter={productsDrillFilter} onClearDrillFilter={handleClearDrillFilter} />}
      {section === "dataQuality" && <SpeakerDbDataQuality />}
      {section === "history" && <SpeakerDbChangeHistory />}
      {section === "dataTransfer" && (
        <CanonicalDataTransfer initialAction={transferIntent} onActionHandled={() => setTransferIntent(null)} />
      )}
      {section === "settings" && <SpeakerDbSettings />}
    </div>
  );
}