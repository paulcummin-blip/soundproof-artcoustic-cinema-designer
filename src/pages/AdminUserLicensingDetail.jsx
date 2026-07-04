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
  red: "#B23A3A",
};

function formatDate(val) {
  if (!val) return "—";
  try {
    return new Date(val).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
}

function Field({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: BRAND.subtext, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: BRAND.text }}>{value ?? "—"}</div>
    </div>
  );
}

export default function AdminUserLicensingDetail() {
  const { user, isLoadingAuth } = useAuth();
  const isInternal = user?.license_account_type === "Internal";
  const userId = window.location.pathname.split("/").pop();

  const [targetUser, setTargetUser] = useState(null);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState(null);

  useEffect(() => {
    if (!isInternal) return;
    let mounted = true;
    (async () => {
      try {
        const [userMatches, projectData] = await Promise.all([
          base44.entities.User.filter({ id: userId }),
          base44.entities.Project.filter({ created_by_id: userId }, "-created_date", 500),
        ]);
        if (mounted) {
          setTargetUser((userMatches && userMatches[0]) || null);
          setProjects(projectData || []);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [isInternal, userId]);

  async function handleProjectAction(projectId, action) {
    setActionMessage(null);
    try {
      if (action === "archive") {
        await base44.entities.Project.update(projectId, { lifecycle_status: "Archived" });
      } else if (action === "restore") {
        await base44.entities.Project.update(projectId, { lifecycle_status: "Active" });
      } else if (action === "delete") {
        await base44.entities.Project.delete(projectId);
      }
      const refreshed = await base44.entities.Project.filter({ created_by_id: userId }, "-created_date", 500);
      setProjects(refreshed || []);
      setActionMessage({ type: "success", text: `Project ${action} succeeded.` });
    } catch (err) {
      setActionMessage({ type: "error", text: err?.message || `Failed to ${action} project.` });
    }
  }

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

  if (loading) {
    return <div style={{ padding: 48, textAlign: "center", color: BRAND.subtext }}>Loading…</div>;
  }

  if (!targetUser) {
    return <div style={{ padding: 48, textAlign: "center", color: BRAND.subtext }}>User not found.</div>;
  }

  const effectiveAllowance = getEffectiveAllowance(targetUser);

  return (
    <div style={{ padding: 24, background: BRAND.bg, minHeight: "100vh", color: BRAND.text }}>
      <div style={{ marginBottom: 16 }}>
        <a href="/admin/project-licensing" style={{ fontSize: 13, color: BRAND.subtext, textDecoration: "none" }}>← Back to Project Licensing</a>
      </div>

      <h1 style={{ margin: 0, fontSize: 24, marginBottom: 4 }}>{targetUser.full_name || targetUser.email}</h1>
      <div style={{ fontSize: 13, color: BRAND.subtext, marginBottom: 20 }}>{targetUser.email}</div>

      <div style={{
        background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 20, marginBottom: 20,
        display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 16,
      }}>
        <Field label="Account Type" value={targetUser.license_account_type || "Free"} />
        <Field label="Account Status" value={targetUser.license_account_status || "Active"} />
        <Field label="Allowance" value={targetUser.license_active_project_allowance ?? "—"} />
        <Field label="Override" value={targetUser.license_override_allowance ?? "—"} />
        <Field label="Effective Allowance" value={effectiveAllowance} />
        <Field label="Licensing Enabled" value={targetUser.license_enabled ? "Yes" : "No"} />
      </div>

      {actionMessage && (
        <div style={{
          marginBottom: 16, padding: "10px 14px", borderRadius: 8,
          background: actionMessage.type === "success" ? "#eafaf1" : "#fdecea",
          border: `1px solid ${actionMessage.type === "success" ? "#a3d9b1" : "#f5c6cb"}`,
          color: actionMessage.type === "success" ? "#213428" : BRAND.red, fontSize: 13,
        }}>
          {actionMessage.text}
        </div>
      )}

      <div style={{ background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 12, overflow: "auto" }}>
        <div style={{
          display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr 1fr 0.8fr 0.8fr 1.6fr",
          padding: "10px 16px", background: "rgb(244 243 241)", borderBottom: `1px solid ${BRAND.border}`,
          fontSize: 10, fontWeight: 700, color: BRAND.subtext, letterSpacing: "0.06em", textTransform: "uppercase", minWidth: 900,
        }}>
          <div>Project Name</div>
          <div>Client</div>
          <div>Created</div>
          <div>Last Edited</div>
          <div>Status</div>
          <div>Reports</div>
          <div>Sessions</div>
          <div>Actions</div>
        </div>

        {projects.map((p, i) => (
          <div key={p.id} style={{
            display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr 1fr 0.8fr 0.8fr 1.6fr",
            padding: "12px 16px", borderBottom: i < projects.length - 1 ? `1px solid ${BRAND.border}` : "none",
            fontSize: 12, alignItems: "center", minWidth: 900,
          }}>
            <div style={{ fontWeight: 600 }}>{p.name || "—"}</div>
            <div style={{ color: BRAND.subtext }}>{p.client_name || "—"}</div>
            <div style={{ color: BRAND.subtext }}>{formatDate(p.created_date)}</div>
            <div style={{ color: BRAND.subtext }}>{formatDate(p.updated_date)}</div>
            <div>{p.lifecycle_status || "Draft"}</div>
            <div>{p.metrics_reports_generated ?? 0}</div>
            <div>{p.metrics_session_count ?? 0}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button onClick={() => handleProjectAction(p.id, "archive")} style={actionBtnStyle}>Archive</button>
              <button onClick={() => handleProjectAction(p.id, "restore")} style={actionBtnStyle}>Restore</button>
              <button onClick={() => handleProjectAction(p.id, "delete")} style={{ ...actionBtnStyle, color: BRAND.red, borderColor: "#f5c6cb" }}>Delete</button>
            </div>
          </div>
        ))}
        {projects.length === 0 && (
          <div style={{ padding: 32, textAlign: "center", color: BRAND.subtext }}>No projects for this user.</div>
        )}
      </div>
    </div>
  );
}

const actionBtnStyle = {
  padding: "5px 10px", borderRadius: 8, border: `1px solid ${BRAND.border}`,
  background: BRAND.card, color: BRAND.text, fontSize: 11, fontWeight: 600, cursor: "pointer",
};