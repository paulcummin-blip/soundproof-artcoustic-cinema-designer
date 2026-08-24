// pages/Projects.js — Stable, JS-only version (no external UI deps)
import React, { useMemo, useRef, useState, useEffect } from "react";
import { SegmentBoundary } from "@/components/dev/SegmentBoundary";
import { useProjectActions } from "@/components/state/project-session";
import { base44 } from "@/api/base44Client";
import NewProjectDialog, { dolbyConfigs, splOptions } from "@/components/projects/NewProjectDialog";
import ManageStatusesDialog from "@/components/projects/ManageStatusesDialog";
import { useProjectStatuses } from "@/components/projects/useProjectStatuses";
import { normalizeStatusId, getStatusColor } from "@/components/projects/statusDefaults";
import { useProjectsSortPreference } from "@/components/projects/useProjectsSortPreference";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { useProfessionalCapacity } from "@/lib/commercial/useProfessionalCapacity";
import { useEffectivePromotion, formatPromotionEndDate } from "@/lib/commercial/useEffectivePromotion";
import { getAgeDays, formatAge, isAgeReviewDue } from "@/components/utils/projectAge";
import AgeReviewDialog from "@/components/projects/AgeReviewDialog";
import ProjectCardPrototype from "@/components/projects/ProjectCardPrototype";

// Build lookup maps from the shared label arrays
const dolbyLabelMap = Object.fromEntries(dolbyConfigs.map(c => [c.value, c.label]));
// For SPL, pick the last matching label (Recommended over Minimum for same dB value)
const splLabelMap = {};
splOptions.forEach(o => { splLabelMap[o.value] = o.label; });

// ---- Brand tokens ----
const BRAND = {
  text: "#1B1A1A",
  subtext: "#3E4349",
  border: "#DCDBD6",
  bg: "#FFFFFF",
  card: "#FBFAF8",

  green: "#2F8B57",      // Live
  amber: "#B37A2B",      // Prospective
  red: "#B23A3A",        // Lost
  blue: "#2C5AA0",       // Completed

  btn: "#1B1A1A",
  btnText: "#FFFFFF",
  btnGhost: "#FFFFFF",
};

// ---- Status helpers ----
// Legacy fallback colours/alpha for the default statuses (used before the
// dynamic ProjectStatus definitions have loaded).
const STATUS_COLORS = {
  live: "#213428",
  prospective: "#625143",
  lost: "#4A230F",
  completed: "#C1B6AD",
};

const STATUS_ALPHA = {
  live: 0.22,
  prospective: 0.16,
  lost: 0.18,
  completed: 0.14,
};

function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getStatusStyle(status, statuses) {
  const key = normalizeStatusId(status);
  let color;
  if (statuses && statuses.length) {
    const def = statuses.find((s) => s.status_id === key);
    color = def?.color || STATUS_COLORS[key] || "#DCDBD6";
  } else {
    color = STATUS_COLORS[key] || "#DCDBD6";
  }
  const alpha = STATUS_ALPHA[key] || 0.10;
  const tint = hexToRgba(color, alpha);
  return { color, tint };
}

function matchesStatus(p, filter) {
  if (!filter || filter === "All Statuses") return true;
  return normalizeStatusId(p.status) === normalizeStatusId(filter);
}

function safeContains(hay, needle) {
  return (hay || "").toLowerCase().includes((needle || "").toLowerCase());
}

function safeJson(v) {
  try {
    if (v == null) return null;
    if (typeof v === "object") return v; // already parsed
    if (typeof v === "string") {
      const s = v.trim();
      if (!s || s === "[object Object]" || s.startsWith("[object ")) return null;
      return JSON.parse(s);
    }
    return null;
  } catch (_e) { return null; }
}

// Small helper to reuse input/select styling
function fieldStyle() {
  return {
    width: "100%",
    marginTop: 6,
    padding: "10px 12px",
    borderRadius: 10,
    border: `1px solid ${BRAND.border}`,
    background: BRAND.card,
    fontSize: 14,
    color: BRAND.text,
    outline: "none",
  };
}

// ---- Component ----
export default function ProjectsPage() {
  const projectActions = useProjectActions();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { available: professionalCapacity, status: capacityStatus, loading: capacityLoading, refresh: refreshCapacity } = useProfessionalCapacity();
  const showCapacityIndicator = capacityStatus === 'OK';
  const { isEffective: promotionEffective, headline: promoHeadline, message: promoMessage, endsAt: promoEndsAt, loading: promoLoading, refresh: refreshPromotion } = useEffectivePromotion();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("All Statuses");
  const [sortKey, setSortKey] = useState("recent");
  const [manageOpen, setManageOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [ageReviewProject, setAgeReviewProject] = useState(null);
  const ageReviewShownThisSession = useRef(false);

  // Per-user sort preference (persisted to the signed-in user's profile)
  const { savedSort, loaded: sortPrefLoaded, persistSort } = useProjectsSortPreference();
  const appliedSavedSort = useRef(false);
  useEffect(() => {
    if (!appliedSavedSort.current && sortPrefLoaded) {
      setSortKey(savedSort);
      appliedSavedSort.current = true;
    }
  }, [savedSort, sortPrefLoaded]);

  // Configurable project status definitions (account-scoped)
  const {
    statuses, activeStatuses, archivedStatuses,
    loading: statusesLoading,
    reload: reloadStatuses,
    addStatus, renameStatus, recolorStatus, reorderStatuses, archiveStatus, unarchiveStatus,
  } = useProjectStatuses();

  // New Project dialog state (canonical NewProjectDialog)
  const [newProjectDialogOpen, setNewProjectDialogOpen] = useState(false);

  // Edit project dialog state (inline, for existing projects only)
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState({
    name: "",
    client: "",
    status: "prospective",
  });

  // If not null, dialog is editing an existing project
  const [editingProject, setEditingProject] = useState(null);

  // Banner after create
  const [created, setCreated] = useState(null);
  const [createError, setCreateError] = useState(null);

  // Hold-to-delete state
  const holdTimers = useRef({});
  const [holdProgress, setHoldProgress] = useState({});

  // Load projects from backend on mount
  useEffect(() => {
    let mounted = true;
    
    async function loadProjects() {
      try {
        setLoading(true);
        setLoadError(null);
        const projectList = await base44.entities.Project.list('-created_date', 100);
        
        if (mounted) {
          // Filter out legacy projects with no account_id, then map to UI format
          const filtered = (projectList || []).filter(p => p.account_id);
          const mapped = filtered.map(p => {
            try {
              return {
                id: p.id,
                name: p.name || "Untitled Project",
                client: p.client_name || "",
                status: normalizeStatusId(p.project_status || "Prospective"),
                roomLength: p.room_length || null,
                roomWidth: p.room_width || null,
                roomHeight: p.room_height || null,
                dolby_config: p.dolby_config || null,
                amplifier_power: p.amplifier_power ?? null,
                notes: p.notes || "",
                createdAt: Number.isFinite(new Date(p.created_date).getTime())
                  ? new Date(p.created_date).getTime()
                  : Date.now(),
                lifecycleStatus: p.lifecycle_status || "Draft",
                lastAgeReviewedAt: p.last_age_reviewed_at || null,
                spl_config: (() => { return safeJson(p.spl_config) || {}; })(),
                p12_mode: (() => { const c = safeJson(p.spl_config) || {}; return c.p12_mode || null; })(),
                p12_level: (() => { const c = safeJson(p.spl_config) || {}; return c.p12_level ?? null; })(),
                target_spl: (() => { const c = safeJson(p.spl_config) || {}; return p.target_spl ?? c.target_spl ?? null; })(),
                lcrModel: (() => {
                  try {
                    const obj = safeJson(p.selected_speakers_by_role);
                    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
                    return (obj.L && obj.L.model) || (obj.FL && obj.FL.model) || null;
                  } catch (_e) { return null; }
                })(),
                surroundModel: null,
                heightModel: null,
                subModel: null,
                subCount: null,
                screenSizeInches: p.screen_size || null,
                seats: (() => {
                  try {
                    const arr = safeJson(p.seating_positions);
                    return Array.isArray(arr) ? arr.length : null;
                  } catch (_e) { return null; }
                })(),
              };
            } catch (mapErr) {
              console.warn('[Projects] Failed to map project:', p?.id, mapErr);
              return {
                id: p.id,
                name: p.name || "Untitled Project",
                client: p.client_name || "",
                status: normalizeStatusId(p.project_status || "Prospective"),
                createdAt: Date.now(),
              };
            }
          });
          
          setProjects(mapped);
          setLoading(false);
        }
      } catch (err) {
        console.error('[Projects] Failed to load projects:', err);
        if (mounted) {
          setLoadError(err?.message || "Failed to load projects");
          setLoading(false);
        }
      }
    }
    
    loadProjects();
    
    return () => {
      mounted = false;
    };
  }, []);

  // Derived list
  const list = useMemo(() => {
    let items = projects.slice();

    // filter — archived projects are excluded from the active list
    // unless the user explicitly toggles "Show Archived"
    items = items.filter((p) => {
      const isArchived = p.lifecycleStatus === "Archived";
      return showArchived ? isArchived : !isArchived;
    });

    // filter by status
    items = items.filter((p) => matchesStatus(p, statusFilter));

    // search — project name only (case-insensitive, partial, trimmed)
    const term = (q || "").trim();
    if (term) {
      items = items.filter((p) => safeContains(p.name, term));
    }

    // sort
    if (sortKey === "client") {
      items.sort((a, b) => (a.client || "").localeCompare(b.client || ""));
    } else if (sortKey === "project_az") {
      items.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    } else if (sortKey === "project_za") {
      items.sort((a, b) => (b.name || "").localeCompare(a.name || ""));
    } else {
      items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }

    return items;
  }, [projects, q, statusFilter, sortKey]);

  // Count projects per status_id (for archive-in-use warnings)
  const statusUsageCounts = useMemo(() => {
    const m = {};
    projects.forEach((p) => {
      const id = normalizeStatusId(p.status);
      m[id] = (m[id] || 0) + 1;
    });
    return m;
  }, [projects]);

  // ---- Age review (200-day) ----
  useEffect(() => {
    if (loading || ageReviewProject || ageReviewShownThisSession.current) return;
    const due = projects.find((p) => {
      if (p.lifecycleStatus === "Archived") return false;
      const ageDays = getAgeDays(p.createdAt);
      return isAgeReviewDue(ageDays, p.lastAgeReviewedAt);
    });
    if (due) {
      setAgeReviewProject(due);
      ageReviewShownThisSession.current = true;
    }
  }, [loading, projects, ageReviewProject]);

  async function handleAgeKeepLive() {
    if (!ageReviewProject) return;
    const nowIso = new Date().toISOString();
    try {
      await base44.entities.Project.update(ageReviewProject.id, {
        last_age_reviewed_at: nowIso,
      });
      setProjects((arr) =>
        arr.map((p) =>
          p.id === ageReviewProject.id
            ? { ...p, lastAgeReviewedAt: nowIso }
            : p
        )
      );
    } catch (err) {
      console.error("[Projects] Failed to stamp age review:", err);
    }
    setAgeReviewProject(null);
  }

  async function handleAgeArchive() {
    if (!ageReviewProject) return;
    try {
      await base44.entities.Project.update(ageReviewProject.id, {
        lifecycle_status: "Archived",
      });
      setProjects((arr) =>
        arr.map((p) =>
          p.id === ageReviewProject.id
            ? { ...p, lifecycleStatus: "Archived" }
            : p
        )
      );
    } catch (err) {
      console.error("[Projects] Failed to archive project:", err);
    }
    setAgeReviewProject(null);
  }

  // ---- UI bits ----
  function openDialog() {
    // New project — use canonical NewProjectDialog
    setNewProjectDialogOpen(true);
  }

  function handleNewProjectCreated(newProject) {
    const p = {
      id: newProject.id,
      name: newProject.name || "Untitled Project",
      client: newProject.client_name || "",
      status: normalizeStatusId(newProject.project_status || "Prospective"),
      roomLength: newProject.room_length || null,
      roomWidth: newProject.room_width || null,
      roomHeight: newProject.room_height || null,
      dolby_config: newProject.dolby_config || null,
      target_spl: newProject.target_spl ?? null,
      amplifier_power: newProject.amplifier_power ?? null,
      notes: newProject.notes || "",
      createdAt: new Date(newProject.created_date).getTime(),
      lifecycleStatus: newProject.lifecycle_status || "Draft",
      lastAgeReviewedAt: newProject.last_age_reviewed_at || null,
      lcrModel: null, surroundModel: null, heightModel: null,
      subModel: null, subCount: null, screenSizeInches: null, seats: null,
    };
    setProjects((arr) => [p, ...arr]);
    setCreated(p);
    window.setTimeout(() => setCreated(null), 4000);
    refreshCapacity && refreshCapacity();
    refreshPromotion && refreshPromotion();
  }

  function handleProjectUpdated(updated) {
    setProjects((arr) =>
      arr.map((p) =>
        p.id === updated.id
          ? {
              ...p,
              name: updated.name || p.name,
              client: updated.client_name || "",
              status: normalizeStatusId(updated.project_status || p.status),
              roomLength: updated.room_length ?? p.roomLength,
              roomWidth: updated.room_width ?? p.roomWidth,
              roomHeight: updated.room_height ?? p.roomHeight,
              dolby_config: updated.dolby_config ?? p.dolby_config,
              target_spl: updated.target_spl ?? p.target_spl,
              amplifier_power: updated.amplifier_power ?? p.amplifier_power,
              notes: updated.notes ?? p.notes,
            }
          : p
      )
    );
    setEditingProject(null);
    setNewProjectDialogOpen(false);
  }

  function handleEditProject(p) {
    setEditingProject(p);
    setNewProjectDialogOpen(true);
  }

  function toNumberOrNull(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  async function saveProject() {
    const name = draft.name.trim();
    const client = draft.client.trim();
    const status = draft.status;

    if (!name) {
      setCreateError("Please enter a project name.");
      return;
    }

    try {
      setCreateError(null);

      const projectData = {
        name,
        client_name: client || "",
        project_status: status,
        // Room dimensions will be filled in by Room Designer and autosave.
        // We deliberately do NOT set room_length / room_width / room_height here.
      };

      if (!editingProject) {
        // CREATE NEW PROJECT
        const newProject = await base44.entities.Project.create(projectData);

        const p = {
          id: newProject.id,
          name: newProject.name,
          client: newProject.client_name || "",
          status: newProject.project_status || status,
          roomLength: newProject.room_length,
          roomWidth: newProject.room_width,
          roomHeight: newProject.room_height,
          createdAt: new Date(newProject.created_date).getTime(),
          lifecycleStatus: newProject.lifecycle_status || "Draft",
          lastAgeReviewedAt: newProject.last_age_reviewed_at || null,
          lcrModel: null,
          surroundModel: null,
          heightModel: null,
          subModel: null,
          subCount: null,
          screenSizeInches: null,
          seats: null,
        };

        setProjects((arr) => [p, ...arr]);
        setDialogOpen(false);
        setEditingProject(null);
        setCreated(p);
        window.setTimeout(() => setCreated(null), 4000);
      } else {
        // UPDATE EXISTING PROJECT
        const updated = await base44.entities.Project.update(
          editingProject.id,
          projectData
        );

        setProjects((arr) =>
          arr.map((p) =>
            p.id === editingProject.id
              ? {
                  ...p,
                  name: updated.name,
                  client: updated.client_name || "",
                  status: updated.project_status || status,
                  roomLength: updated.room_length,
                  roomWidth: updated.room_width,
                  roomHeight: updated.room_height,
                }
              : p
          )
        );

        setDialogOpen(false);
        setEditingProject(null);
      }
    } catch (err) {
      console.error("[Projects] Failed to save project:", err);
      setCreateError(err?.message || "Failed to save project. Please try again.");
    }
  }

  function startHoldDelete(id) {
    if (holdTimers.current[id]) return;
    const DURATION = 1500;
    const startedAt = Date.now();

    function tick() {
      const elapsed = Date.now() - startedAt;
      const pct = Math.min(1, elapsed / DURATION);
      setHoldProgress((m) => ({ ...m, [id]: pct }));
      if (pct >= 1) {
        clear();
        if (window.confirm("Delete this project? This cannot be undone.")) {
          deleteProject(id);
        } else {
          setHoldProgress((m) => ({ ...m, [id]: 0 }));
        }
        return;
      }
      holdTimers.current[id].t = window.setTimeout(tick, 16);
    }

    function clear() {
      const rec = holdTimers.current[id];
      if (rec && rec.t) window.clearTimeout(rec.t);
      delete holdTimers.current[id];
    }

    holdTimers.current[id] = { t: window.setTimeout(tick, 16), startedAt };
  }

  async function deleteProject(id) {
    try {
      await base44.entities.Project.delete(id);
      setProjects((arr) => arr.filter((p) => p.id !== id));
    } catch (err) {
      console.error('[Projects] Failed to delete project:', err);
      alert("Failed to delete project. Please try again.");
    }
  }

  // Delete *all* untitled projects from the backend, not just the ones in state
  async function bulkDeleteUntitled() {
    const isUntitledName = (rawName) => {
      const name = (rawName || "").trim();
      return (
        name === "" ||
        name === "Untitled Room" ||
        name === "Untitled Project" ||
        name === "Untitled"
      );
    };

    if (!window.confirm(
      "This will permanently delete ALL projects named 'Untitled Room', 'Untitled Project', 'Untitled' or with a blank name from the cloud.\n\nAre you sure you want to continue?"
    )) {
      return;
    }

    let totalDeleted = 0;

    try {
      // We'll keep asking the backend for batches until there are no untitled projects left.
      // Safety cap: max 50 loops so we can't get stuck.
      for (let pass = 0; pass < 50; pass++) {
        // Fetch a fresh batch each time so we see older rows once newer ones are gone
        const batch = await base44.entities.Project.list("-created_date", 200);
        if (!batch || batch.length === 0) break;

        const untitledBatch = batch.filter((p) => isUntitledName(p.name));
        if (untitledBatch.length === 0) {
          // No more untitled projects in this batch – we're done
          break;
        }

        // Delete this batch
        for (const p of untitledBatch) {
          try {
            await base44.entities.Project.delete(p.id);
            totalDeleted += 1;
          } catch (err) {
            console.error("[Projects] Failed to delete untitled project", p.id, err);
          }
        }

        // If the backend has more than 200 untitled projects, the next loop
        // will fetch the next "page" and keep going.
      }

      // Also prune any untitled ones from local state
      setProjects((arr) =>
        arr.filter((p) => !isUntitledName(p.name))
      );
      setHoldProgress({});

      window.alert(`Deleted ${totalDeleted} untitled project(s). If you still see any after a refresh, they are newly created ones.`);
    } catch (err) {
      console.error("[Projects] Bulk delete (all untitled) failed:", err);
      window.alert("Bulk delete failed. Check console for details.");
    }
  }

  function cancelHoldDelete(id) {
    const rec = holdTimers.current[id];
    if (rec && rec.t) window.clearTimeout(rec.t);
    delete holdTimers.current[id];
    setHoldProgress((m) => ({ ...m, [id]: 0 }));
  }

  // ---- Sub components ----
  function StatusPill({ value }) {
    const { color: c } = getStatusStyle(value);
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 14px",
          borderRadius: 999,
          border: `1px solid ${BRAND.border}`,
          background: BRAND.card,
          fontSize: 14,
          fontWeight: 600,
          color: c,
        }}
        aria-label={`Status: ${value}`}
      >
        <span
          style={{
            width: 12,
            height: 12,
            borderRadius: 12,
            background: c,
          }}
          aria-hidden
        />
        {value}
      </span>
    );
  }

  // ---- Render ----
  return (
    <div
      style={{
        padding: 24,
        background: BRAND.bg,
        minHeight: "100vh",
        color: BRAND.text,
      }}
      data-testid="projects-safe-boot"
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 28, color: BRAND.text }}>Projects</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {showCapacityIndicator && (
            <div style={{ fontSize: 13, color: BRAND.subtext, whiteSpace: "nowrap" }}>
              Professional Projects: <strong style={{ color: BRAND.text }}>{capacityLoading ? '…' : professionalCapacity}</strong> available
            </div>
          )}
          {showCapacityIndicator && promotionEffective && !promoLoading && (
            <div
              title={promoMessage || undefined}
              style={{
                padding: "10px 16px",
                borderRadius: 10,
                border: `1px solid #213428`,
                background: "#F3F0EB",
                color: "#213428",
                fontSize: 13,
                fontWeight: 600,
                whiteSpace: "nowrap",
              }}
            >
              {`Special access: Unlimited until ${formatPromotionEndDate(promoEndsAt)}`}
            </div>
          )}
          {showCapacityIndicator && !promotionEffective && (
            <button
              type="button"
              onClick={() => navigate('/PurchaseProjects')}
              style={{
                padding: "10px 16px",
                borderRadius: 10,
                border: `1px solid ${BRAND.border}`,
                background: BRAND.card,
                color: BRAND.subtext,
                cursor: "pointer",
                fontSize: 13,
                whiteSpace: "nowrap",
              }}
            >
              Buy Projects
            </button>
          )}
          <button
            type="button"
            onClick={openDialog}
            style={{
              padding: "13px 20px",
              borderRadius: 10,
              border: `1px solid ${BRAND.border}`,
              background: BRAND.btn,
              color: BRAND.btnText,
              cursor: "pointer",
              fontSize: 18,
            }}
          >
            + New Project
          </button>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <input
          placeholder="Search project name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{
            flex: 1,
            padding: "12px 14px",
            borderRadius: 10,
            border: `1px solid ${BRAND.border}`,
            background: BRAND.card,
            fontSize: 14,
            color: BRAND.text,
          }}
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            padding: "12px 14px",
            borderRadius: 10,
            border: `1px solid ${BRAND.border}`,
            background: BRAND.card,
            fontSize: 14,
            color: BRAND.text,
            minWidth: 180,
          }}
        >
          <option value="All Statuses">All Statuses</option>
          {activeStatuses.map((s) => (
            <option key={s.status_id} value={s.status_id}>
              {s.label}
            </option>
          ))}
          {archivedStatuses.length > 0 && (
            <optgroup label="Archived">
              {archivedStatuses.map((s) => (
                <option key={s.status_id} value={s.status_id}>
                  {s.label}
                </option>
              ))}
            </optgroup>
          )}
        </select>

        <button
          type="button"
          onClick={() => setManageOpen(true)}
          style={{
            padding: "12px 14px",
            borderRadius: 10,
            border: `1px solid ${BRAND.border}`,
            background: BRAND.card,
            color: BRAND.text,
            fontSize: 14,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
          title="Configure project statuses"
        >
          Manage Statuses
        </button>

        <select
          value={sortKey}
          onChange={(e) => {
            const v = e.target.value;
            setSortKey(v);
            persistSort(v);
          }}
          style={{
            padding: "12px 14px",
            borderRadius: 10,
            border: `1px solid ${BRAND.border}`,
            background: BRAND.card,
            fontSize: 14,
            color: BRAND.text,
            minWidth: 180,
          }}
        >
          <option value="recent">Recently Added</option>
          <option value="client">Client A–Z</option>
          <option value="project_az">Project A–Z</option>
          <option value="project_za">Project Z–A</option>
        </select>

        <button
          type="button"
          onClick={() => setShowArchived((v) => !v)}
          style={{
            padding: "12px 14px",
            borderRadius: 10,
            border: `1px solid ${BRAND.border}`,
            background: showArchived ? BRAND.btn : BRAND.card,
            color: showArchived ? BRAND.btnText : BRAND.text,
            fontSize: 14,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
          title="Toggle archived projects"
        >
          {showArchived ? "Show Active" : "Show Archived"}
        </button>
      </div>

      {/* Created banner */}
      {created && (
        <div
          style={{
            marginBottom: 12,
            padding: 10,
            border: `1px solid ${BRAND.border}`,
            background: BRAND.card,
            borderRadius: 10,
            fontSize: 13,
            color: BRAND.subtext,
          }}
        >
          <strong style={{ color: BRAND.text }}>{created.name}</strong> created.
          <button
            type="button"
            onClick={() => {
              const id = created.id;
              if (projectActions && typeof projectActions.setActiveProjectId === "function") {
                projectActions.setActiveProjectId(id);
              }
              window.location.href = `/RoomDesigner?project=${encodeURIComponent(id)}`;
            }}
            style={{
              marginLeft: 8,
              padding: "6px 10px",
              borderRadius: 8,
              border: `1px solid ${BRAND.border}`,
              background: BRAND.btn,
              color: BRAND.btnText,
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            Open
          </button>
        </div>
      )}

      {/* Grid or empty */}
      {loading ? (
        <div
          style={{
            marginTop: 16,
            padding: 24,
            textAlign: "center",
            border: `1px dashed ${BRAND.border}`,
            borderRadius: 12,
            background: BRAND.card,
            color: BRAND.subtext,
            fontSize: 16,
          }}
        >
          Loading projects...
        </div>
      ) : loadError ? (
        <div
          style={{
            marginTop: 16,
            padding: 24,
            textAlign: "center",
            border: `1px dashed ${BRAND.border}`,
            borderRadius: 12,
            background: BRAND.card,
            color: BRAND.red,
            fontSize: 16,
          }}
        >
          {loadError}
          <div style={{ marginTop: 12 }}>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                padding: "10px 16px",
                borderRadius: 10,
                border: `1px solid ${BRAND.border}`,
                background: BRAND.btn,
                color: BRAND.btnText,
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              Retry
            </button>
          </div>
        </div>
      ) : list.length === 0 ? (
        <div
          style={{
            marginTop: 16,
            padding: 24,
            textAlign: "center",
            border: `1px dashed ${BRAND.border}`,
            borderRadius: 12,
            background: BRAND.card,
            color: BRAND.subtext,
            fontSize: 16,
          }}
        >
          No projects yet. Create one to begin.
          <div style={{ marginTop: 12 }}>
            <button
              type="button"
              onClick={openDialog}
              style={{
                padding: "10px 16px",
                borderRadius: 10,
                border: `1px solid ${BRAND.border}`,
                background: BRAND.btn,
                color: BRAND.btnText,
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              + New Project
            </button>
          </div>
        </div>
      ) : (
        <SegmentBoundary name="ProjectsGrid">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 16,
              marginTop: 16,
            }}
          >
            {list.map((p) => (
              <ProjectCardPrototype
                key={p.id}
                p={p}
                onEdit={handleEditProject}
                statuses={statuses}
                activeStatuses={activeStatuses}
                dolbyLabelMap={dolbyLabelMap}
                projectActions={projectActions}
                startHoldDelete={startHoldDelete}
                cancelHoldDelete={cancelHoldDelete}
                holdProgress={holdProgress}
                setProjects={setProjects}
              />
            ))}
          </div>
        </SegmentBoundary>
      )}

      {/* Canonical New / Edit Project Dialog */}
      <NewProjectDialog
        open={newProjectDialogOpen}
        onOpenChange={(val) => {
          setNewProjectDialogOpen(val);
          if (!val) setEditingProject(null);
        }}
        onProjectCreated={handleNewProjectCreated}
        editProject={editingProject}
        onProjectUpdated={handleProjectUpdated}
      />

      {/* Manage Project Statuses */}
      <ManageStatusesDialog
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        statuses={statuses}
        activeStatuses={activeStatuses}
        archivedStatuses={archivedStatuses}
        onAdd={addStatus}
        onRename={renameStatus}
        onRecolor={recolorStatus}
        onReorder={reorderStatuses}
        onArchive={archiveStatus}
        onUnarchive={unarchiveStatus}
        statusUsageCounts={statusUsageCounts}
      />

      {/* Edit Project Modal (existing projects only) */}
      {dialogOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              width: "min(560px, 92vw)",
              background: BRAND.card,
              border: `1px solid ${BRAND.border}`,
              borderRadius: 12,
              padding: 16,
              color: BRAND.text,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <h2 style={{ margin: 0, fontSize: 18 }}>
                Edit Project
              </h2>
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                style={{
                  border: `1px solid ${BRAND.border}`,
                  background: BRAND.card,
                  color: BRAND.text,
                  borderRadius: 8,
                  padding: "6px 10px",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <label style={{ fontSize: 12, color: BRAND.subtext }}>
                Project Name
                <input
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  style={fieldStyle()}
                  placeholder="e.g. Cinema One"
                />
              </label>

              <label style={{ fontSize: 12, color: BRAND.subtext }}>
                Client Name
                <input
                  value={draft.client}
                  onChange={(e) => setDraft((d) => ({ ...d, client: e.target.value }))}
                  style={fieldStyle()}
                  placeholder="e.g. Smith"
                />
              </label>

              <label style={{ fontSize: 12, color: BRAND.subtext }}>
                Status
                <select
                  value={draft.status}
                  onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}
                  style={fieldStyle()}
                >
                  {activeStatuses.map((s) => (
                    <option key={s.status_id} value={s.status_id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>

              {createError && (
                <div style={{ marginTop: 8, padding: 8, background: "#fee", border: "1px solid #fcc", borderRadius: 6, fontSize: 13, color: BRAND.red }}>
                  {createError}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setDialogOpen(false)}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: `1px solid ${BRAND.border}`,
                    background: BRAND.card,
                    color: BRAND.text,
                    cursor: "pointer",
                    fontSize: 14,
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveProject}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: `1px solid ${BRAND.border}`,
                    background: BRAND.btn,
                    color: BRAND.btnText,
                    cursor: "pointer",
                    fontSize: 14,
                  }}
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <AgeReviewDialog
        open={!!ageReviewProject}
        projectName={ageReviewProject?.name}
        ageDays={ageReviewProject ? getAgeDays(ageReviewProject.createdAt) : null}
        brand={BRAND}
        onKeepLive={handleAgeKeepLive}
        onArchive={handleAgeArchive}
        onCancel={() => setAgeReviewProject(null)}
      />
    </div>
  );
}