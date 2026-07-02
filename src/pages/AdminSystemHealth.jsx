import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import { getDatasetPlatformStats } from "@/components/admin/datasets/datasetManagerHelpers";
import { getProductStats } from "@/components/admin/system-health/productDatasetStats";
import StatSection from "@/components/admin/system-health/StatSection";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#3E4349",
  border: "#DCDBD6",
  bg: "rgb(248 248 247)",
  card: "#FFFFFF",
  btn: "#1B1A1A",
  btnText: "#FFFFFF",
};

const STATUS_COLORS = {
  healthy: "#213428",
  connected: "#213428",
  operational: "#213428",
  not_connected: "#625143",
  unknown: "#625143",
  offline: "#B23A3A",
};

function StatusPill({ value }) {
  const key = (value || "").toLowerCase().replace(/\s+/g, "_");
  const color = STATUS_COLORS[key] || BRAND.subtext;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "4px 10px", borderRadius: 999,
      border: `1px solid ${BRAND.border}`,
      background: BRAND.card, fontSize: 12, fontWeight: 600, color,
    }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
      {value}
    </span>
  );
}

function HealthRow({ label, value, status, last }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1.5fr",
      padding: "14px 16px", alignItems: "center",
      borderBottom: `1px solid ${BRAND.border}`,
    }}>
      <div style={{ fontWeight: 600, fontSize: 14, color: BRAND.text }}>{label}</div>
      <div style={{ fontSize: 13, color: BRAND.subtext }}>{value}</div>
      <div><StatusPill value={status} /></div>
      <div style={{ fontSize: 12, color: BRAND.subtext }}>{last}</div>
    </div>
  );
}

export default function AdminSystemHealth() {
  const { user, isLoadingAuth } = useAuth();
  const isAdmin = user?.role === "admin";

  const [userCount, setUserCount] = useState(null);

  useEffect(() => {
    if (!isAdmin) return;
    let mounted = true;
    (async () => {
      try {
        const users = await base44.entities.User.list();
        if (mounted) setUserCount((users || []).length);
      } catch {
        if (mounted) setUserCount(null);
      }
    })();
    return () => { mounted = false; };
  }, [isAdmin]);

  const datasetStats = useMemo(() => getDatasetPlatformStats(), []);
  const productStats = useMemo(() => getProductStats(), []);

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

  const rows = [
    { label: "Users", value: userCount !== null ? `${userCount} registered` : "—", status: "Healthy", last: "Just now" },
    { label: "Database", value: "Base44 entity store", status: "Connected", last: "—" },
    { label: "GitHub Sync", value: "Not configured", status: "Not Connected", last: "—" },
    { label: "Last Build", value: "Placeholder — no build data yet", status: "Unknown", last: "—" },
    { label: "Storage", value: "Placeholder — usage not tracked yet", status: "Healthy", last: "—" },
  ];

  return (
    <div style={{ padding: 24, background: BRAND.bg, minHeight: "100vh", color: BRAND.text }}>
      <div style={{ marginBottom: 20 }}>
        <a href="/admin" style={{ fontSize: 13, color: BRAND.subtext, textDecoration: "none" }}>
          ← Back to Admin Dashboard
        </a>
      </div>

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 26, color: BRAND.text }}>System Health</h1>
        <div style={{ fontSize: 13, color: BRAND.subtext, marginTop: 4 }}>
          Live status of core systems (placeholder data where noted)
        </div>
      </div>

      <StatSection
        title="Measured Dataset Platform"
        stats={[
          { label: "Datasets discovered", value: datasetStats.discovered },
          { label: "Datasets ready", value: datasetStats.ready },
          { label: "Datasets with warnings", value: datasetStats.warnings },
          { label: "Datasets with errors", value: datasetStats.errors },
        ]}
      />

      <StatSection
        title="Products"
        stats={[
          { label: "Registered products", value: productStats.registered },
          { label: "Products linked to measured datasets", value: productStats.linked },
        ]}
      />

      <div style={{
        background: BRAND.card, border: `1px solid ${BRAND.border}`,
        borderRadius: 12, overflow: "hidden",
      }}>
        <div style={{
          display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1.5fr",
          padding: "10px 16px", background: "rgb(244 243 241)",
          borderBottom: `1px solid ${BRAND.border}`,
          fontSize: 10, fontWeight: 700, color: BRAND.subtext,
          letterSpacing: "0.06em", textTransform: "uppercase",
        }}>
          <div>System</div>
          <div>Detail</div>
          <div>Status</div>
          <div>Last Checked</div>
        </div>
        {rows.map((row) => <HealthRow key={row.label} {...row} />)}
      </div>
    </div>
  );
}