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

function ProjectStatusPill({ value }) {
  const colorMap = {
    live: "#213428",
    prospective: "#625143",
    lost: "#4A230F",
    completed: "#C1B6AD",
  };
  const color = colorMap[(value || "").toLowerCase()] || BRAND.subtext;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 8px", borderRadius: 999,
      border: `1px solid ${BRAND.border}`,
      background: BRAND.card, fontSize: 11, fontWeight: 600, color,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
      {value || "—"}
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

export default function AccountDashboard() {
  const { user, isLoadingAuth } = useAuth();
  const isAdmin = user?.role === "admin";

  // Extract accountId from URL path: /admin/accounts/:id
  const accountId = window.location.pathname.split("/").pop();

  const [account, setAccount] = useState(null);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    if (!isAdmin || !accountId) return;
    let mounted = true;

    async function load() {
      try {
        setLoading(true);
        setLoadError(null);

        const [accountList, projectList] = await Promise.all([
          base44.entities.Account.filter({ id: accountId }),
          base44.entities.Project.filter({ account_id: accountId }),
        ]);

        if (mounted) {
          setAccount((accountList || [])[0] || null);
          setProjects(projectList || []);
        }
      } catch (err) {
        if (mounted) setLoadError(err?.message || "Failed to load account");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => { mounted = false; };
  }, [isAdmin, accountId]);

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

  return (
    <div style={{ padding: 24, background: BRAND.bg, minHeight: "100vh", color: BRAND.text }}>

      {/* Back nav */}
      <div style={{ marginBottom: 20 }}>
        <a
          href="/admin/accounts"
          style={{ fontSize: 13, color: BRAND.subtext, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}
        >
          ← Back to Accounts
        </a>
      </div>

      {loading ? (
        <div style={{ padding: 32, textAlign: "center", color: BRAND.subtext }}>Loading…</div>
      ) : loadError ? (
        <div style={{ padding: 32, textAlign: "center", color: BRAND.red }}>{loadError}</div>
      ) : !account ? (
        <div style={{ padding: 32, textAlign: "center", color: BRAND.subtext }}>Account not found.</div>
      ) : (
        <>
          {/* Account header */}
          <div style={{
            background: BRAND.card, border: `1px solid ${BRAND.border}`,
            borderRadius: 12, padding: "20px 24px", marginBottom: 24,
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div>
                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: BRAND.text }}>
                  {account.name || "Unnamed Account"}
                </h1>
                {account.contact_email && (
                  <div style={{ fontSize: 13, color: BRAND.subtext, marginTop: 4 }}>
                    {account.contact_email}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, color: BRAND.subtext }}>
                  {TYPE_LABELS[account.account_type] || account.account_type || "—"}
                </span>
                <StatusPill value={account.status} />
              </div>
            </div>

            {/* Stats row */}
            <div style={{
              display: "flex", gap: 32, marginTop: 16,
              paddingTop: 16, borderTop: `1px solid ${BRAND.border}`,
            }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: BRAND.subtext, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>
                  Projects
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, color: BRAND.green }}>
                  {projects.length}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: BRAND.subtext, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>
                  Account ID
                </div>
                <div style={{ fontSize: 11, fontFamily: "monospace", color: BRAND.subtext }}>
                  {account.id}
                </div>
              </div>
            </div>
          </div>

          {/* Projects table */}
          <div style={{ marginBottom: 12, fontSize: 13, fontWeight: 700, color: BRAND.text }}>
            Projects ({projects.length})
          </div>

          {projects.length === 0 ? (
            <div style={{
              padding: 32, textAlign: "center",
              border: `1px dashed ${BRAND.border}`, borderRadius: 12,
              background: BRAND.card, color: BRAND.subtext, fontSize: 14,
            }}>
              No projects linked to this account yet.
            </div>
          ) : (
            <div style={{
              background: BRAND.card, border: `1px solid ${BRAND.border}`,
              borderRadius: 12, overflow: "hidden",
            }}>
              {/* Table header */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "2fr 1.5fr 1fr 1fr 1fr 1fr 90px",
                padding: "10px 16px",
                background: "rgb(244 243 241)",
                borderBottom: `1px solid ${BRAND.border}`,
                fontSize: 10, fontWeight: 700, color: BRAND.subtext,
                letterSpacing: "0.06em", textTransform: "uppercase",
              }}>
                <div>Project Name</div>
                <div>Client</div>
                <div>Status</div>
                <div>Dolby Layout</div>
                <div>Created</div>
                <div>Updated</div>
                <div style={{ textAlign: "right" }}>Open</div>
              </div>

              {/* Table rows */}
              {projects.map((p, i) => (
                <div
                  key={p.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "2fr 1.5fr 1fr 1fr 1fr 1fr 90px",
                    padding: "14px 16px",
                    borderBottom: i < projects.length - 1 ? `1px solid ${BRAND.border}` : "none",
                    alignItems: "center",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgb(248 248 247)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <div style={{ fontWeight: 600, fontSize: 14, color: BRAND.text }}>
                    {p.name || "Untitled Project"}
                  </div>
                  <div style={{ fontSize: 13, color: BRAND.subtext }}>
                    {p.client_name || "—"}
                  </div>
                  <div>
                    <ProjectStatusPill value={p.project_status} />
                  </div>
                  <div style={{ fontSize: 12, color: BRAND.subtext }}>
                    {p.dolby_config || "—"}
                  </div>
                  <div style={{ fontSize: 12, color: BRAND.subtext }}>
                    {formatDate(p.created_date)}
                  </div>
                  <div style={{ fontSize: 12, color: BRAND.subtext }}>
                    {formatDate(p.updated_date)}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <a
                      href={`/RoomDesigner?project=${encodeURIComponent(p.id)}`}
                      style={{
                        display: "inline-block",
                        padding: "6px 12px", borderRadius: 8,
                        background: BRAND.btn, color: BRAND.btnText,
                        fontSize: 12, fontWeight: 600, textDecoration: "none",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Open →
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}