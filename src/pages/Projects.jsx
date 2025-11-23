// pages/Projects.js — Stable, JS-only version (no external UI deps)
import React, { useMemo, useRef, useState, useEffect } from "react";
import { SegmentBoundary } from "@/components/dev/SegmentBoundary";
import { useProjectActions } from "@/components/state/project-session";
import { base44 } from "@/api/base44Client";

const Project = base44.entities.Project;

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

function statusColor(s) {
  const v = (s || "").toLowerCase();
  if (v === "live") return BRAND.green;
  if (v === "prospective") return BRAND.amber;
  if (v === "lost") return BRAND.red;
  if (v === "completed") return BRAND.blue;
  return BRAND.subtext;
}

function matchesStatus(p, filter) {
  if (!filter || filter === "All Statuses") return true;
  return (p.status || "").toLowerCase() === filter.toLowerCase();
}

function safeContains(hay, needle) {
  return (hay || "").toLowerCase().includes((needle || "").toLowerCase());
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
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("All Statuses");
  const [sortKey, setSortKey] = useState("recent");

  // New Project dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState({
    name: "",
    client: "",
    status: "Prospective",
    roomLength: "",
    roomWidth: "",
    roomHeight: "",
  });

  // Banner after create
  const [created, setCreated] = useState(null);

  // Hold-to-delete state
  const holdTimers = useRef({});
  const [holdProgress, setHoldProgress] = useState({});

  // Load projects from database on mount
  useEffect(() => {
    async function loadProjects() {
      try {
        setLoading(true);
        const list = await Project.list('-created_date', 100);
        setProjects(list || []);
      } catch (err) {
        console.error('[Projects] Failed to load projects:', err);
      } finally {
        setLoading(false);
      }
    }
    
    loadProjects();
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
    setDraft({
      name: "",
      client: "",
      status: "Prospective",
      roomLength: "",
      roomWidth: "",
      roomHeight: "",
    });
    setDialogOpen(true);
  }

  function toNumberOrNull(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  async function saveProject() {
    const name = draft.name.trim();
    const client = draft.client.trim();
    const rl = toNumberOrNull(draft.roomLength);
    const rw = toNumberOrNull(draft.roomWidth);
    const rh = toNumberOrNull(draft.roomHeight);

    if (!name) return alert("Please enter a project name.");
    if (!client) return alert("Please enter a client name.");

    try {
      const projectData = {
        name,
        client_name: client,
        room_length: rl,
        room_width: rw,
        room_height: rh,
      };

      // Create in database
      const created = await Project.create(projectData);
      
      // Add to local list
      setProjects((arr) => [created, ...arr]);
      
      // Set as active project (RoomDesigner will sync summary when it loads)
      projectActions.setActiveProjectId(created.id);
      
      setDialogOpen(false);
      setCreated(created);
      window.setTimeout(() => setCreated(null), 4000);
    } catch (err) {
      console.error('[Projects] Failed to create project:', err);
      alert('Failed to create project. Please try again.');
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
      await Project.delete(id);
      setProjects((arr) => arr.filter((p) => p.id !== id));
      
      // Clear active project if it was deleted
      if (projectActions) {
        const activeId = window.localStorage?.getItem('b44_activeProjectId');
        if (activeId === id) {
          projectActions.clearActiveProject();
        }
      }
    } catch (err) {
      console.error('[Projects] Failed to delete project:', err);
      alert('Failed to delete project. Please try again.');
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
    const c = statusColor(value);
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "2px 8px",
          borderRadius: 999,
          border: `1px solid ${BRAND.border}`,
          background: BRAND.card,
          fontSize: 12,
          color: c,
        }}
        aria-label={`Status: ${value}`}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 8,
            background: c,
          }}
          aria-hidden
        />
        {value}
      </span>
    );
  }

  function ProjectCard({ p }) {
    const prog = holdProgress[p.id] || 0;
    const barColor =
      p.status === "Live"
        ? BRAND.green
        : p.status === "Prospective"
        ? BRAND.amber
        : p.status === "Lost"
        ? BRAND.red
        : BRAND.blue;

    return (
      <div
        style={{
          background: BRAND.card,
          border: `1px solid ${BRAND.border}`,
          borderRadius: 12,
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: BRAND.text }}>
            {p.name || "Untitled Project"}
          </div>
          <div style={{ fontSize: 13, color: BRAND.subtext, marginTop: 2 }}>
            Client: {p.client || "—"}
          </div>

          <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
            <StatusPill value={p.status} />
            <span style={{ fontSize: 12, color: statusColor(p.status) }}>{p.status}</span>
          </div>

          <div style={{ fontSize: 12, color: BRAND.subtext, marginTop: 8 }}>
            Room: {p.room_length != null ? p.room_length : "—"}m ×{" "}
            {p.room_width != null ? p.room_width : "—"}m ×{" "}
            {p.room_height != null ? p.room_height : "—"}m
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => {
              projectActions.setActiveProjectId(p.id);
              window.location.href = "/RoomDesigner";
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
              projectActions.setActiveProjectId(created.id);
              window.location.href = "/RoomDesigner";
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
            color: BRAND.subtext,
            fontSize: 16,
          }}
        >
          Loading projects...
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
              <ProjectCard key={p.id} p={p} />
            ))}
          </div>
        </SegmentBoundary>
      )}

      {/* Modal */}
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
              <h2 style={{ margin: 0, fontSize: 18 }}>Create Project</h2>
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

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 10,
                }}
              >
                <label style={{ fontSize: 12, color: BRAND.subtext }}>
                  Room Length (m)
                  <input
                    value={draft.roomLength}
                    onChange={(e) => setDraft((d) => ({ ...d, roomLength: e.target.value }))}
                    style={fieldStyle()}
                    placeholder="e.g. 6.2"
                  />
                </label>

                <label style={{ fontSize: 12, color: BRAND.subtext }}>
                  Room Width (m)
                  <input
                    value={draft.roomWidth}
                    onChange={(e) => setDraft((d) => ({ ...d, roomWidth: e.target.value }))}
                    style={fieldStyle()}
                    placeholder="e.g. 4.1"
                  />
                </label>

                <label style={{ fontSize: 12, color: BRAND.subtext }}>
                  Room Height (m)
                  <input
                    value={draft.roomHeight}
                    onChange={(e) => setDraft((d) => ({ ...d, roomHeight: e.target.value }))}
                    style={fieldStyle()}
                    placeholder="e.g. 2.4"
                  />
                </label>
              </div>

              <div style={{ marginTop: 6, fontSize: 12, color: BRAND.subtext }}>
                <em>Speakers, screen size and seats will auto‑populate from Room Designer (read‑only).</em>
              </div>

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
                  Save Project
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}