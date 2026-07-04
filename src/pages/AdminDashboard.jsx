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
};

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

  const cards = [
    {
      title: "Users & Accounts",
      description: "Manage client and dealer accounts, roles and access.",
      status: "Healthy",
      count: accountCount !== null ? `${accountCount} account${accountCount !== 1 ? "s" : ""}` : "—",
      href: "/admin/accounts",
    },
    {
      title: "Products",
      description: "Speaker, subwoofer and accessory registry.",
      status: "Healthy",
      count: "—",
      href: "/SpeakerDatabase",
    },
    {
      title: "Measured Datasets",
      description: "Measured polar dataset platform and health checks.",
      status: "Healthy",
      count: "—",
      href: "/admin/datasets",
    },
    {
      title: "Pricing",
      description: "Price lists, discounts and difficulty multipliers.",
      status: "Healthy",
      count: "—",
      href: "/admin/pricing",
    },
    {
      title: "RP22 Configuration",
      description: "Compliance parameters and grading thresholds.",
      status: "Healthy",
      count: "—",
      href: "/admin/rp22-config",
    },
    {
      title: "System Health",
      description: "Live status of core systems and infrastructure.",
      status: "Operational",
      count: "7 systems monitored",
      href: "/admin/system-health",
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
      title: "Project Licensing",
      description: "Commercial licensing infrastructure. Internal users only — not yet enforced.",
      status: "Setup Required",
      count: "Feature flag OFF",
      href: "/admin/project-licensing",
    },
  ];

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

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: 18,
      }}>
        {cards.map((card) => (
          <AdminSectionCard key={card.title} {...card} />
        ))}
      </div>
    </div>
  );
}