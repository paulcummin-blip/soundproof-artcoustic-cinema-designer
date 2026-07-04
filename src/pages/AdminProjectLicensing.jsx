import React, { useEffect, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import { getEffectiveAllowance } from "@/lib/licensingPlans";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#3E4349",
  border: "#DCDBD6",
  bg: "rgb(248 248 247)",
  card: "#FFFFFF",
  btn: "#1B1A1A",
  btnText: "#FFFFFF",
};

function formatDate(val) {
  if (!val) return "—";
  try {
    return new Date(val).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
}

export default function AdminProjectLicensing() {
  const { user, isLoadingAuth } = useAuth();
  const isInternal = user?.license_account_type === "Internal";

  const [users, setUsers] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isInternal) return;
    let mounted = true;
    (async () => {
      try {
        const [userData, accountData, projectData] = await Promise.all([
          base44.entities.User.list("-created_date", 500),
          base44.entities.Account.list("-created_date", 500),
          base44.entities.Project.list("-created_date", 1000),
        ]);
        if (mounted) {
          setUsers(userData || []);
          setAccounts(accountData || []);
          setProjects(projectData || []);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [isInternal]);

  if (isLoadingAuth) {
    return <div style={{ padding: 48, textAlign: "center", color: BRAND.subtext }}>Checking access…</div>;
  }

  if (!isInternal) {
    return (
      <div style={{ padding: 48, textAlign: "center", color: BRAND.subtext, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 32 }}>🔒</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: BRAND.text }}>Access Denied</div>
        <div style={{ fontSize: 14 }}>This page is restricted to Internal users.</div>
        <a href="/Projects" style={{ marginTop: 8, padding: "10px 20px", borderRadius: 10, background: BRAND.btn, color: BRAND.btnText, fontSize: 14, textDecoration: "none" }}>
          Go to Projects
        </a>
      </div>
    );
  }

  const accountsById = Object.fromEntries(accounts.map((a) => [a.id, a]));

  return (
    <div style={{ padding: 24, background: BRAND.bg, minHeight: "100vh", color: BRAND.text }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, color: BRAND.text }}>Project Licensing</h1>
          <div style={{ fontSize: 13, color: BRAND.subtext, marginTop: 4 }}>
            Infrastructure only — licensing is not enforced. Visible to Internal users only.
          </div>
        </div>
        <div style={{ padding: "6px 14px", borderRadius: 999, background: "#625143", color: "#fff", fontSize: 12, fontWeight: 700, letterSpacing: "0.04em" }}>
          INTERNAL
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 32, textAlign: "center", border: `1px dashed ${BRAND.border}`, borderRadius: 12, background: BRAND.card, color: BRAND.subtext }}>
          Loading…
        </div>
      ) : (
        <div style={{ background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 12, overflow: "auto" }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "1.6fr 1.4fr 1fr 1fr 0.8fr 0.8fr 1fr 1fr 1fr 1fr 1fr 70px",
            padding: "10px 16px", background: "rgb(244 243 241)", borderBottom: `1px solid ${BRAND.border}`,
            fontSize: 10, fontWeight: 700, color: BRAND.subtext, letterSpacing: "0.06em", textTransform: "uppercase", minWidth: 1100,
          }}>
            <div>User</div>
            <div>Company</div>
            <div>Plan</div>
            <div>Status</div>
            <div>Allowance</div>
            <div>Override</div>
            <div>Active Projects</div>
            <div>Archived</div>
            <div>Draft</div>
            <div>Last Login</div>
            <div>Projects Created</div>
            <div></div>
          </div>

          {users.map((u, i) => {
            const userProjects = projects.filter((p) => p.created_by_id === u.id);
            const activeCount = userProjects.filter((p) => p.lifecycle_status === "Active").length;
            const archivedCount = userProjects.filter((p) => p.lifecycle_status === "Archived").length;
            const draftCount = userProjects.filter((p) => !p.lifecycle_status || p.lifecycle_status === "Draft").length;
            const company = accountsById[u.account_id]?.name || "—";

            return (
              <div key={u.id} style={{
                display: "grid",
                gridTemplateColumns: "1.6fr 1.4fr 1fr 1fr 0.8fr 0.8fr 1fr 1fr 1fr 1fr 1fr 70px",
                padding: "12px 16px",
                borderBottom: i < users.length - 1 ? `1px solid ${BRAND.border}` : "none",
                fontSize: 12, alignItems: "center", minWidth: 1100,
              }}>
                <div style={{ fontWeight: 600 }}>{u.full_name || u.email || "—"}</div>
                <div style={{ color: BRAND.subtext }}>{company}</div>
                <div>{u.license_account_type || "Free"}</div>
                <div>{u.license_account_status || "Active"}</div>
                <div>{Number.isFinite(Number(u.license_active_project_allowance)) ? u.license_active_project_allowance : "—"}</div>
                <div>{u.license_override_allowance ?? "—"}</div>
                <div>{activeCount}</div>
                <div>{archivedCount}</div>
                <div>{draftCount}</div>
                <div>—</div>
                <div>{userProjects.length}</div>
                <div>
                  <a href={`/admin/project-licensing/${u.id}`} style={{
                    padding: "5px 10px", borderRadius: 8, border: `1px solid ${BRAND.border}`,
                    background: BRAND.card, color: BRAND.text, fontSize: 12, fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap",
                  }}>
                    View →
                  </a>
                </div>
              </div>
            );
          })}
          {users.length === 0 && (
            <div style={{ padding: 32, textAlign: "center", color: BRAND.subtext }}>No users found.</div>
          )}
        </div>
      )}
    </div>
  );
}