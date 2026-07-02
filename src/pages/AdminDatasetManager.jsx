import React, { useMemo, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { buildDatasetRows } from "@/components/admin/datasets/datasetManagerHelpers";
import DatasetManagerTable from "@/components/admin/datasets/DatasetManagerTable";
import DatasetDetailSheet from "@/components/admin/datasets/DatasetDetailSheet";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#3E4349",
  border: "#DCDBD6",
  bg: "rgb(248 248 247)",
  card: "#FFFFFF",
  btn: "#1B1A1A",
  btnText: "#FFFFFF",
};

// Admin-only, read-only view over the Generic Measured Polar Dataset Platform registry.
export default function AdminDatasetManager() {
  const { user, isLoadingAuth } = useAuth();
  const isAdmin = user?.role === "admin";

  const rows = useMemo(() => (isAdmin ? buildDatasetRows() : []), [isAdmin]);
  const [selectedDataset, setSelectedDataset] = useState(null);

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

  const selectedRow = rows.find((r) => r.datasetName === selectedDataset) || null;

  return (
    <div style={{ padding: 24, background: BRAND.bg, minHeight: "100vh", color: BRAND.text }}>
      <div style={{ marginBottom: 20 }}>
        <a href="/admin" style={{ fontSize: 13, color: BRAND.subtext, textDecoration: "none" }}>
          ← Back to Admin Dashboard
        </a>
      </div>

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 26, color: BRAND.text }}>Measured Dataset Manager</h1>
        <div style={{ fontSize: 13, color: BRAND.subtext, marginTop: 4 }}>
          Read-only view of the Generic Measured Polar Dataset Platform registry. {rows.length} dataset{rows.length !== 1 ? "s" : ""} discovered.
        </div>
      </div>

      <DatasetManagerTable rows={rows} selectedDataset={selectedDataset} onSelect={setSelectedDataset} />

      <DatasetDetailSheet
        row={selectedRow}
        open={!!selectedRow}
        onOpenChange={(open) => { if (!open) setSelectedDataset(null); }}
      />
    </div>
  );
}