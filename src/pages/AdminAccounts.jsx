import React, { useEffect, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#3E4349",
  border: "#DCDBD6",
  bg: "rgb(248 248 247)",
  card: "#FFFFFF",
  btn: "#1B1A1A",
  btnText: "#FFFFFF",
  green: "#213428",
  amber: "#625143",
  red: "#B23A3A",
  blue: "#2C5AA0",
};

const STATUS_COLORS = {
  active: "#213428",
  inactive: "#3E4349",
  trial: "#625143",
  suspended: "#B23A3A",
};

const TYPE_LABELS = {
  dealer: "Dealer",
  client: "Client",
  admin: "Admin",
  demo: "Demo",
};

function StatusPill({ value }) {
  const color = STATUS_COLORS[value] || BRAND.subtext;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "4px 10px", borderRadius: 999,
      border: `1px solid ${BRAND.border}`,
      background: BRAND.card, fontSize: 12, fontWeight: 600, color,
    }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
      {value ? value.charAt(0).toUpperCase() + value.slice(1) : "—"}
    </span>
  );
}

function formatDate(val) {
  if (!val) return "—";
  try {
    return new Date(val).toLocaleDateString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch {
    return "—";
  }
}

export default function AdminAccountsPage() {
  const { user, isLoadingAuth } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (!isAdmin) return;
    let mounted = true;

    async function load() {
      try {
        setLoading(true);
        setLoadError(null);
        const data = await base44.entities.Account.list("-created_date", 200);
        if (mounted) setAccounts(data || []);
      } catch (err) {
        if (mounted) setLoadError(err?.message || "Failed to load accounts");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => { mounted = false; };
  }, [isAdmin]);

  // Loading auth state
  if (isLoadingAuth) {
    return (
      <div style={{ padding: 48, textAlign: "center", color: BRAND.subtext }}>
        Checking access…
      </div>
    );
  }

  // Access denied for non-admins
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
        }}>
          Go to Projects
        </a>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, background: BRAND.bg, minHeight: "100vh", color: BRAND.text }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, color: BRAND.text }}>Accounts</h1>
          <div style={{ fontSize: 13, color: BRAND.subtext, marginTop: 4 }}>
            All client and dealer accounts
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

      {/* Content */}
      {loading ? (
        <div style={{
          marginTop: 16, padding: 32, textAlign: "center",
          border: `1px dashed ${BRAND.border}`, borderRadius: 12,
          background: BRAND.card, color: BRAND.subtext, fontSize: 15,
        }}>
          Loading accounts…
        </div>
      ) : loadError ? (
        <div style={{
          marginTop: 16, padding: 32, textAlign: "center",
          border: `1px dashed ${BRAND.border}`, borderRadius: 12,
          background: BRAND.card, color: BRAND.red, fontSize: 15,
        }}>
          {loadError}
          <div style={{ marginTop: 12 }}>
            <button onClick={() => window.location.reload()} style={{
              padding: "10px 16px", borderRadius: 10,
              border: `1px solid ${BRAND.border}`,
              background: BRAND.btn, color: BRAND.btnText,
              cursor: "pointer", fontSize: 14,
            }}>
              Retry
            </button>
          </div>
        </div>
      ) : accounts.length === 0 ? (
        <div style={{
          marginTop: 16, padding: 48, textAlign: "center",
          border: `1px dashed ${BRAND.border}`, borderRadius: 12,
          background: BRAND.card, color: BRAND.subtext,
          display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
        }}>
          <div style={{ fontSize: 36 }}>🏢</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: BRAND.text }}>No accounts yet</div>
          <div style={{ fontSize: 13 }}>Accounts will appear here once created.</div>
        </div>
      ) : (
        <div style={{
          background: BRAND.card, border: `1px solid ${BRAND.border}`,
          borderRadius: 12, overflow: "hidden",
        }}>
          {/* Table header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1fr 2fr 1fr 80px",
            gap: 0,
            padding: "10px 16px",
            background: "rgb(244 243 241)",
            borderBottom: `1px solid ${BRAND.border}`,
            fontSize: 11, fontWeight: 700, color: BRAND.subtext,
            letterSpacing: "0.06em", textTransform: "uppercase",
          }}>
            <div>Account Name</div>
            <div>Type</div>
            <div>Status</div>
            <div>Contact Email</div>
            <div>Last Access</div>
            <div style={{ textAlign: "right" }}>Projects</div>
          </div>

          {/* Table rows */}
          {accounts.map((acc, i) => (
            <div
              key={acc.id}
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1fr 1fr 2fr 1fr 80px",
                gap: 0,
                padding: "14px 16px",
                borderBottom: i < accounts.length - 1 ? `1px solid ${BRAND.border}` : "none",
                alignItems: "center",
                transition: "background 0.15s",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "rgb(248 248 247)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: BRAND.text }}>
                  {acc.name || "—"}
                </div>
                {acc.notes && (
                  <div style={{
                    fontSize: 11, color: BRAND.subtext, marginTop: 2,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 240,
                  }}>
                    {acc.notes}
                  </div>
                )}
              </div>
              <div style={{ fontSize: 13, color: BRAND.subtext }}>
                {TYPE_LABELS[acc.account_type] || acc.account_type || "—"}
              </div>
              <div>
                <StatusPill value={acc.status} />
              </div>
              <div style={{ fontSize: 13, color: BRAND.subtext }}>
                {acc.contact_email || "—"}
              </div>
              <div style={{ fontSize: 13, color: BRAND.subtext }}>
                {formatDate(acc.last_access_at)}
              </div>
              <div style={{ textAlign: "right", fontSize: 14, fontWeight: 700, color: BRAND.text }}>
                {acc.project_count ?? 0}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Summary footer */}
      {!loading && !loadError && accounts.length > 0 && (
        <div style={{ marginTop: 12, fontSize: 12, color: BRAND.subtext, textAlign: "right" }}>
          {accounts.length} account{accounts.length !== 1 ? "s" : ""} total
        </div>
      )}
    </div>
  );
}