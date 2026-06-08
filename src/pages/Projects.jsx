// pages/Projects.js — Stable, JS-only version (no external UI deps)
import React, { useMemo, useRef, useState, useEffect } from "react";
import { SegmentBoundary } from "@/components/dev/SegmentBoundary";
import { useProjectActions } from "@/components/state/project-session";
import { base44 } from "@/api/base44Client";
import NewProjectDialog, { dolbyConfigs, splOptions } from "@/components/projects/NewProjectDialog";

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
  bg: "rgb(248 248 247)",
  card: "#FFFFFF",

  green: "#2F8B57",      // Live
  amber: "#B37A2B",      // Prospective
  red: "#B23A3A",        // Lost
  blue: "#2C5AA0",       // Completed

  btn: "#1B1A1A",
  btnText: "#FFFFFF",
  btnGhost: "#FFFFFF",
};

// ---- Status helpers ----
const STATUS = ["Live", "Prospective", "Lost", "Completed"];

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

function getStatusStyle(status) {
  const key = String(status || "").trim().toLowerCase();
  const color = STATUS_COLORS[key] || "#DCDBD6";
  const alpha = STATUS_ALPHA[key] || 0.10;
  const tint = hexToRgba(color, alpha);
  return { color, tint };
}

function matchesStatus(p, filter) {
  if (!filter || filter === "All Statuses") return true;
  return (p.status || "").toLowerCase() === filter.toLowerCase();
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
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("All Statuses");
  const [sortKey, setSortKey] = useState("recent");

  // New Project dialog state (canonical NewProjectDialog)
  const [newProjectDialogOpen, setNewProjectDialogOpen] = useState(false);

  // Edit project dialog state (inline, for existing projects only)
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState({
    name: "",
    client: "",
    status: "Prospective",
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
                status: p.project_status || "Prospective",
                roomLength: p.room_length || null,
                roomWidth: p.room_width || null,
                roomHeight: p.room_height || null,
                dolby_config: p.dolby_config || null,
                amplifier_power: p.amplifier_power ?? null,
                notes: p.notes || "",
                createdAt: Number.isFinite(new Date(p.created_date).getTime())
                  ? new Date(p.created_date).getTime()
                  : Date.now(),
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
                status: p.project_status || "Prospective",
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

    // filter
    items = items.filter((p) => matchesStatus(p, statusFilter));

    // search
    const term = (q || "").trim();
    if (term) {
      items = items.filter(
        (p) =>
          safeContains(p.name, term) ||
          safeContains(p.client, term) ||
          safeContains(p.status, term)
      );
    }

    // sort
    if (sortKey === "client") {
      items.sort((a, b) => (a.client || "").localeCompare(b.client || ""));
    } else {
      items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }

    return items;
  }, [projects, q, statusFilter, sortKey]);

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
      status: newProject.project_status || "Prospective",
      roomLength: newProject.room_length || null,
      roomWidth: newProject.room_width || null,
      roomHeight: newProject.room_height || null,
      dolby_config: newProject.dolby_config || null,
      target_spl: newProject.target_spl ?? null,
      amplifier_power: newProject.amplifier_power ?? null,
      notes: newProject.notes || "",
      createdAt: new Date(newProject.created_date).getTime(),
      lcrModel: null, surroundModel: null, heightModel: null,
      subModel: null, subCount: null, screenSizeInches: null, seats: null,
    };
    setProjects((arr) => [p, ...arr]);
    setCreated(p);
    window.setTimeout(() => setCreated(null), 4000);
  }

  function handleProjectUpdated(updated) {
    setProjects((arr) =>
      arr.map((p) =>
        p.id === updated.id
          ? {
              ...p,
              name: updated.name || p.name,
              client: updated.client_name || "",
              status: updated.project_status || p.status,
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

  function ProjectCard({ p, onEdit }) {
    const prog = holdProgress[p.id] || 0;
    const barColor =
      p.status === "Live"
        ? BRAND.green
        : p.status === "Prospective"
        ? BRAND.amber
        : p.status === "Lost"
        ? BRAND.red
        : BRAND.blue;

    const [localStatus, setLocalStatus] = useState(p.status);
    const [statusError, setStatusError] = useState(null);
    const [isSaving, setIsSaving] = useState(false);

    // Update local status when prop changes
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
        
        // Update parent state
        setProjects((arr) =>
          arr.map((proj) =>
            proj.id === p.id ? { ...proj, status: newStatus } : proj
          )
        );
      } catch (err) {
        console.error('[Projects] Failed to update status:', err);
        setLocalStatus(prevStatus);
        setStatusError("Failed to update status");
        setTimeout(() => setStatusError(null), 3000);
      } finally {
        setIsSaving(false);
      }
    }

    const { color: statusColor, tint: statusTint } = getStatusStyle(localStatus);

    return (
      <div
        style={{
          background: BRAND.card,
          boxShadow: `inset 0 0 0 9999px ${statusTint}`,
          border: `2px solid ${BRAND.border}`,
          borderRadius: 12,
          overflow: "hidden",
          transition: "box-shadow 0.2s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = `inset 0 0 0 9999px ${statusTint}, 0 4px 12px rgba(0,0,0,0.08)`;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = `inset 0 0 0 9999px ${statusTint}`;
        }}
      >
        <div
          style={{
            height: 6,
            width: "100%",
            background: statusColor,
          }}
        />
        <div
          style={{
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: statusColor }}>
            {p.name || "Untitled Project"}
          </div>
          <div style={{ fontSize: 13, color: BRAND.subtext, marginTop: 2 }}>
            Client: {p.client || "—"}
          </div>

          {(p.dolby_config || p.target_spl != null) && (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 3 }}>
              {p.dolby_config && (
                <div style={{ fontSize: 12, color: BRAND.subtext }}>
                  <span style={{ fontWeight: 600, color: BRAND.text }}>Dolby: </span>
                  {dolbyLabelMap[p.dolby_config] || p.dolby_config}
                </div>
              )}
              {p.target_spl != null && (
                <div style={{ fontSize: 12, color: BRAND.subtext }}>
                  <span style={{ fontWeight: 600, color: BRAND.text }}>Target SPL: </span>
                  {`${p.target_spl} dB`}
                  {p.p12_level != null && (
                    <>
                      {' '}— P12 - L{p.p12_level}{' '}
                      {p.p12_mode === 'half-space'
                        ? 'Minimum'
                        : p.p12_mode === 'anechoic'
                          ? 'Recommended'
                          : ''}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          <div
            style={{
              marginTop: 10,
              display: "flex",
              gap: 10,
              flexDirection: "column",
              alignItems: "flex-start",
            }}
          >
            <select
              value={localStatus}
              onChange={(e) => handleStatusChange(e.target.value)}
              disabled={isSaving}
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "6px 10px 6px 14px",
                borderRadius: 999,
                border: `1px solid ${BRAND.border}`,
                background: BRAND.card,
                fontSize: 14,
                fontWeight: 600,
                color: statusColor,
                cursor: "pointer",
                appearance: "none",
                WebkitAppearance: "none",
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23${statusColor.slice(1)}' d='M6 8L2 4h8z'/%3E%3C/svg%3E")`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 10px center",
                paddingRight: 30,
                opacity: isSaving ? 0.6 : 1,
              }}
            >
              {STATUS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            {statusError && (
              <div style={{ fontSize: 11, color: BRAND.red, marginTop: 4 }}>
                {statusError}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => {
              const id = p.id;
              // keep this if you still want the session store to know about it
              if (projectActions && typeof projectActions.setActiveProjectId === "function") {
                projectActions.setActiveProjectId(id);
              }
              // navigate *with* the project id in the URL
              window.location.href = `/RoomDesigner?project=${encodeURIComponent(id)}`;
            }}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: `1px solid ${BRAND.border}`,
              background: BRAND.btn,
              color: BRAND.btnText,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Open Project
          </button>

          <button
            type="button"
            onClick={() => onEdit && onEdit(p)}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: `1px solid ${BRAND.border}`,
              background: BRAND.btnGhost,
              color: BRAND.text,
              fontSize: 13,
              cursor: "pointer",
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
              borderRadius: 10,
              border: `1px solid ${BRAND.border}`,
              background: BRAND.btnGhost,
              color: BRAND.text,
              fontSize: 13,
              cursor: "pointer",
              overflow: "hidden",
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
                height: 3,
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

      {/* Controls */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <input
          placeholder="Search projects…"
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
          <option>All Statuses</option>
          <option>Live</option>
          <option>Prospective</option>
          <option>Lost</option>
          <option>Completed</option>
        </select>

        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value === "client" ? "client" : "recent")}
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
        </select>
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
              <ProjectCard
                key={p.id}
                p={p}
                onEdit={handleEditProject}
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
                  {STATUS.map((s) => (
                    <option key={s} value={s}>
                      {s}
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
    </div>
  );
}