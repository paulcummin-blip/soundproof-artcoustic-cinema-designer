import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { getAgeDays, formatAge } from "@/components/utils/projectAge";
import { normalizeStatusId, getStatusColor } from "@/components/projects/statusDefaults";

// Refined prototype card — lighter, calmer, more architectural.
// Only used for the "Bass Test" project to assess the design before rollout.

const BRAND = {
  text: "#1B1A1A",
  subtext: "#625143",
  muted: "#8B8378",
  border: "#E2DED7",
  card: "#FBFAF8",
  accent: "#213428",
  btn: "#213428",
  btnText: "#FFFFFF",
  btnGhost: "#FFFFFF",
  btnGhostBorder: "#D9D5CE",
};

const STATUS_COLORS = {
  live: "#213428",
  prospective: "#625143",
  lost: "#4A230F",
  completed: "#C1B6AD",
};

function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getStatusColorLocal(status, statuses) {
  const key = normalizeStatusId(status);
  if (statuses && statuses.length) {
    const def = statuses.find((s) => s.status_id === key);
    if (def?.color) return def.color;
  }
  return STATUS_COLORS[key] || BRAND.muted;
}

// Build the system summary line from existing project data.
// Shows only the system format (e.g. "Dolby Atmos 5.1.4"). No RP22 levels,
// P2/L results, or compliance fragments — those belong in the report.
function buildSystemSummary(p, dolbyLabelMap) {
  if (!p.dolby_config) return "";
  const label = dolbyLabelMap[p.dolby_config] || p.dolby_config;
  // Existing labels look like "5.1.4 Atmos"; normalise to "Dolby Atmos 5.1.4".
  const match = label.match(/^(\d+(?:\.\d+)*)\s*Atmos$/i);
  return match ? `Dolby Atmos ${match[1]}` : label;
}

// Build the supporting detail line from existing project data.
function buildSupportingDetail(p) {
  const parts = [];
  if (p.target_spl != null) {
    parts.push(`Target SPL ${p.target_spl} dB`);
  }
  const ageDays = getAgeDays(p.createdAt);
  if (ageDays != null) {
    parts.push(formatAge(ageDays));
  }
  return parts.join(" · ");
}

export default function ProjectCardPrototype({
  p,
  onEdit,
  statuses,
  activeStatuses,
  dolbyLabelMap,
  projectActions,
  startHoldDelete,
  cancelHoldDelete,
  holdProgress,
  setProjects,
}) {
  const prog = holdProgress[p.id] || 0;
  const barColor = getStatusColor(p.status, statuses);

  const [localStatus, setLocalStatus] = useState(p.status);
  const [statusError, setStatusError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setLocalStatus(p.status);
  }, [p.status]);

  async function handleStatusChange(newStatus) {
    const prevStatus = localStatus;
    setLocalStatus(newStatus);
    setStatusError(null);
    setIsSaving(true);
    try {
      await base44.entities.Project.update(p.id, { project_status: newStatus });
      setProjects((arr) =>
        arr.map((proj) =>
          proj.id === p.id ? { ...proj, status: newStatus } : proj
        )
      );
    } catch (err) {
      console.error("[Projects] Failed to update status:", err);
      setLocalStatus(prevStatus);
      setStatusError("Failed to update status");
      setTimeout(() => setStatusError(null), 3000);
    } finally {
      setIsSaving(false);
    }
  }

  const statusColor = getStatusColorLocal(localStatus, statuses);
  const isLive = normalizeStatusId(localStatus) === "live";

  const systemSummary = buildSystemSummary(p, dolbyLabelMap);
  const supportingDetail = buildSupportingDetail(p);

  return (
    <div
      style={{
        background: BRAND.card,
        border: `1px solid ${BRAND.border}`,
        borderRadius: 8,
        overflow: "hidden",
        transition: "box-shadow 0.2s ease, border-color 0.2s ease",
        display: "flex",
        flexDirection: "column",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.04)";
        e.currentTarget.style.borderColor = "#D5D0C8";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "none";
        e.currentTarget.style.borderColor = BRAND.border;
      }}
    >
      {/* Thin top accent line — dark green for Live, neutral otherwise */}
      <div
        style={{
          height: 3,
          width: "100%",
          background: isLive ? BRAND.accent : "transparent",
        }}
      />

      <div
        style={{
          padding: "20px 20px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          flex: 1,
        }}
      >
        {/* 1. Project name */}
        <div>
          <div
            style={{
              fontSize: 17,
              fontWeight: 600,
              color: BRAND.text,
              lineHeight: 1.3,
              letterSpacing: "-0.01em",
            }}
          >
            {p.name || "Untitled Project"}
          </div>

          {/* 2. Client */}
          <div
            style={{
              fontSize: 13,
              color: BRAND.subtext,
              marginTop: 4,
              fontWeight: 400,
            }}
          >
            Client: {p.client || "—"}
          </div>
        </div>

        {/* 3. System summary */}
        {systemSummary && (
          <div
            style={{
              fontSize: 13,
              color: BRAND.text,
              fontWeight: 500,
              lineHeight: 1.4,
            }}
          >
            {systemSummary}
          </div>
        )}

        {/* 4. Supporting detail */}
        {supportingDetail && (
          <div
            style={{
              fontSize: 12,
              color: BRAND.muted,
              fontWeight: 400,
              lineHeight: 1.4,
            }}
          >
            {supportingDetail}
          </div>
        )}

        {/* 5. Status — quieter pill */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <select
            value={localStatus}
            onChange={(e) => handleStatusChange(e.target.value)}
            disabled={isSaving}
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "4px 28px 4px 12px",
              borderRadius: 999,
              border: `1px solid ${isLive ? BRAND.accent : BRAND.btnGhostBorder}`,
              background: isLive ? "#FFFFFF" : BRAND.btnGhost,
              fontSize: 12,
              fontWeight: 600,
              color: isLive ? BRAND.accent : BRAND.subtext,
              cursor: "pointer",
              appearance: "none",
              WebkitAppearance: "none",
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'%3E%3Cpath fill='${isLive ? "%23213428" : "%238B8378"}' d='M5 7L1 3h8z'/%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 10px center",
              opacity: isSaving ? 0.6 : 1,
              outline: "none",
            }}
          >
            {(() => {
              const opts = activeStatuses.slice();
              const curId = normalizeStatusId(localStatus);
              if (curId && !opts.some((s) => s.status_id === curId)) {
                const archived = statuses.find((s) => s.status_id === curId);
                if (archived) opts.push(archived);
              }
              return opts.map((s) => (
                <option key={s.status_id} value={s.status_id}>
                  {s.label}
                </option>
              ));
            })()}
          </select>
          {statusError && (
            <span style={{ fontSize: 11, color: "#B23A3A" }}>{statusError}</span>
          )}
        </div>

        {/* 6. Actions — aligned at bottom */}
        <div
          style={{
            display: "flex",
            gap: 8,
            marginTop: "auto",
            paddingTop: 4,
          }}
        >
          <button
            type="button"
            onClick={() => {
              const id = p.id;
              if (projectActions && typeof projectActions.setActiveProjectId === "function") {
                projectActions.setActiveProjectId(id);
              }
              window.location.href = `/RoomDesigner?project=${encodeURIComponent(id)}`;
            }}
            style={{
              flex: 1,
              padding: "8px 12px",
              borderRadius: 6,
              border: `1px solid ${BRAND.btn}`,
              background: BRAND.btn,
              color: BRAND.btnText,
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              transition: "background 0.15s ease",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#1A2A20"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = BRAND.btn; }}
          >
            Open Project
          </button>

          <button
            type="button"
            onClick={() => onEdit && onEdit(p)}
            style={{
              padding: "8px 12px",
              borderRadius: 6,
              border: `1px solid ${BRAND.btnGhostBorder}`,
              background: BRAND.btnGhost,
              color: BRAND.subtext,
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              transition: "border-color 0.15s ease, color 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "#C5C0B8";
              e.currentTarget.style.color = BRAND.text;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = BRAND.btnGhostBorder;
              e.currentTarget.style.color = BRAND.subtext;
            }}
          >
            Edit
          </button>

          <button
            type="button"
            onMouseDown={() => startHoldDelete(p.id)}
            onMouseUp={() => cancelHoldDelete(p.id)}
            onMouseLeave={() => cancelHoldDelete(p.id)}
            style={{
              position: "relative",
              padding: "8px 12px",
              borderRadius: 6,
              border: `1px solid ${BRAND.btnGhostBorder}`,
              background: BRAND.btnGhost,
              color: BRAND.muted,
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              overflow: "hidden",
              transition: "border-color 0.15s ease, color 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "#C5C0B8";
              e.currentTarget.style.color = BRAND.subtext;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = BRAND.btnGhostBorder;
              e.currentTarget.style.color = BRAND.muted;
            }}
            aria-label="Hold to delete project"
            title="Hold to delete (safety)"
          >
            <span>Delete</span>
            <span
              style={{
                position: "absolute",
                left: 0,
                bottom: 0,
                height: 2,
                width: `${Math.round(prog * 100)}%`,
                background: barColor,
                transition: "width 60ms linear",
              }}
              aria-hidden
            />
          </button>
        </div>
      </div>
    </div>
  );
}