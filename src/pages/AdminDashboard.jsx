import React, { useEffect, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import AdminSectionCard from "@/components/admin/AdminSectionCard";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#3E4349",
  border: "#DCDBD6",
  bg: "rgb(248 248 247)",
  card: "#FFFFFF",
  btn: "#1B1A1A",
  btnText: "#FFFFFF",
  accent: "#625143",
};

// Core administration stays prominent. Setup, configuration and legacy tooling
// live under Advanced / Setup so the dashboard leads with the tools that are
// used daily.
const CORE_CARDS = [
  {
    title: "Commercial Control Centre",
    description: "Dealer accounts, Professional Projects, turnover and activity.",
    status: "Healthy",
    countKey: "accounts",
    href: "/admin/accounts",
  },
  {
    title: "Account Access & Credits",
    description: "Dealer access, logins, Sound Proof credits and account diagnostics in one grouped view.",
    status: "Ready",
    count: "Partner / Trade / Richer Sounds",
    href: "/admin/access",
  },
  {
    title: "Project Intelligence",
    description: "Commercial project counts, project values, product demand and export. Projects are counted once; design versions are shown as variations.",
    status: "Ready",
    count: "Projects counted once",
    href: "/admin/project-intelligence",
  },
  {
    title: "Product Master",
    description: "Product names, availability, Sound Proof roles and retail pricing — the pricing authority.",
    status: "Healthy",
    count: "—",
    href: "/PriceList",
  },
  {
    title: "Speaker Database",
    description: "A structured catalogue of loudspeaker specifications and sources. Manufacturers, products, specifications, data quality, change history and model ingestion.",
    status: "Ready",
    count: "Foundation built",
    href: "/admin/speaker-database",
  },
  {
    title: "Content Management",
    description: "Publication content — the canonical source for About Sound Proof and future client-facing text used in the app, Visual Report, Technical Report, and proposals.",
    status: "Ready",
    count: "1 document",
    href: "/admin/content",
  },
  {
    title: "System Health",
    description: "Live status of core systems and infrastructure.",
    status: "Operational",
    count: "7 systems monitored",
    href: "/admin/system-health",
  },
];

const ADVANCED_CARDS = [
  {
    title: "Measured Datasets",
    description: "Measured polar dataset platform, ingestion wizards and health checks.",
    status: "Healthy",
    count: "—",
    href: "/admin/datasets",
  },
  {
    title: "RP22 Configuration",
    description: "Compliance parameters and grading thresholds.",
    status: "Healthy",
    count: "—",
    href: "/admin/rp22-config",
  },
  {
    title: "Audit Log",
    description: "Track changes made across the platform.",
    status: "Active",
    count: "—",
    href: "/admin/audit-log",
  },
  {
    title: "Billing",
    description: "Subscription plans and payment configuration.",
    status: "Setup Required",
    count: "—",
    href: "/admin/billing",
  },
  {
    title: "Legacy Licensing",
    description: "Legacy per-user licensing infrastructure. Superseded by the Commercial Control Centre.",
    status: "Setup Required",
    count: "Feature flag OFF",
    href: "/admin/project-licensing",
  },
];

export default function AdminDashboard() {
  const { user, isLoadingAuth } = useAuth();
  const isAdmin = user?.role === "admin";

  const [accountCount, setAccountCount] = useState(null);

  useEffect(() => {
    if (!isAdmin) return;
    let mounted = true;
    (async () => {
      try {
        const accounts = await base44.entities.Account.list("-created_date", 500);
        if (mounted) setAccountCount((accounts || []).length);
      } catch {
        if (mounted) setAccountCount(null);
      }
    })();
    return () => { mounted = false; };
  }, [isAdmin]);

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

  const accountCountLabel = accountCount !== null
    ? `${accountCount} account${accountCount !== 1 ? "s" : ""}`
    : "—";

  const cards = [...CORE_CARDS, ...ADVANCED_CARDS].map((card) => ({
    ...card,
    count: card.countKey === "accounts" ? accountCountLabel : card.count,
  }));

  const coreCards = cards.slice(0, CORE_CARDS.length);
  const advancedCards = cards.slice(CORE_CARDS.length);

  const renderGrid = (list) => (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
      gap: 18,
    }}>
      {list.map(({ countKey, ...card }) => (
        <AdminSectionCard key={card.title} {...card} />
      ))}
    </div>
  );

  return (
    <div style={{ padding: 24, background: BRAND.bg, minHeight: "100vh", color: BRAND.text }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, color: BRAND.text }}>Admin Dashboard</h1>
          <div style={{ fontSize: 13, color: BRAND.subtext, marginTop: 4 }}>
            System-wide administration and configuration
          </div>
        </div>
        <div style={{
          padding: "6px 14px", borderRadius: 999,
          background: "#213428", color: "#fff",
          fontSize: 12, fontWeight: 700, letterSpacing: "0.04em",
        }}>
          ADMIN
        </div>
      </div>

      <div style={{ marginBottom: 30 }}>
        <h2 style={{
          margin: "0 0 12px",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: BRAND.accent,
        }}>
          Core administration
        </h2>
        {renderGrid(coreCards)}
      </div>

      <div>
        <h2 style={{
          margin: "0 0 12px",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: BRAND.accent,
        }}>
          Advanced / Setup
        </h2>
        {renderGrid(advancedCards)}
      </div>
    </div>
  );
}