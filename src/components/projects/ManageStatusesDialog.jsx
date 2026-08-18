import React, { useState } from "react";

// Compact modal for managing configurable project statuses:
// add, rename, reorder, archive (safe — never hard-deletes in-use statuses).
// Archived statuses stay visible on existing projects that already use them.
export default function ManageStatusesDialog({
  open,
  onClose,
  statuses,
  activeStatuses,
  archivedStatuses,
  onAdd,
  onRename,
  onRecolor,
  onReorder,
  onArchive,
  onUnarchive,
  statusUsageCounts,
}) {
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState("#625143");
  const [editingId, setEditingId] = useState(null);
  const [editLabel, setEditLabel] = useState("");
  const [error, setError] = useState(null);

  if (!open) return null;

  const handleAdd = async () => {
    if (!newLabel.trim()) return;
    try {
      setError(null);
      await onAdd(newLabel, newColor);
      setNewLabel("");
      setNewColor("#625143");
    } catch (e) {
      setError(e?.message || "Failed to add status");
    }
  };

  const handleArchive = async (status) => {
    const count = statusUsageCounts?.[status.status_id] || 0;
    if (count > 0) {
      if (
        !window.confirm(
          `"${status.label}" is used by ${count} project(s). Archiving hides it from new assignments, but existing projects keep it. Continue?`
        )
      ) {
        return;
      }
    }
    try {
      setError(null);
      await onArchive(status.id);
    } catch (e) {
      setError(e?.message || "Failed to archive status");
    }
  };

  const moveUp = (idx) => {
    if (idx <= 0) return;
    const ids = activeStatuses.map((s) => s.id);
    [ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]];
    onReorder(ids);
  };
  const moveDown = (idx) => {
    if (idx >= activeStatuses.length - 1) return;
    const ids = activeStatuses.map((s) => s.id);
    [ids[idx + 1], ids[idx]] = [ids[idx], ids[idx + 1]];
    onReorder(ids);
  };

  const startEdit = (s) => {
    setEditingId(s.id);
    setEditLabel(s.label);
  };
  const saveEdit = async () => {
    if (!editLabel.trim()) return;
    try {
      setError(null);
      await onRename(editingId, editLabel);
      setEditingId(null);
      setEditLabel("");
    } catch (e) {
      setError(e?.message || "Failed to rename status");
    }
  };

  const handleColorChange = async (id, newColor) => {
    try {
      setError(null);
      await onRecolor(id, newColor);
    } catch (e) {
      setError(e?.message || "Failed to update status colour");
    }
  };

  const btnBase = {
    padding: "4px 10px",
    borderRadius: 6,
    border: "1px solid #DCDBD6",
    background: "#fff",
    cursor: "pointer",
    fontSize: 12,
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1100,
      }}
    >
      <div
        style={{
          width: "min(520px, 92vw)",
          maxHeight: "85vh",
          overflowY: "auto",
          background: "#fff",
          borderRadius: 12,
          border: "1px solid #DCDBD6",
          padding: 20,
          color: "#1B1A1A",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 18 }}>Manage Project Statuses</h2>
          <button onClick={onClose} style={{ ...btnBase }}>
            Close
          </button>
        </div>

        {error && (
          <div
            style={{
              padding: 8,
              background: "#fee",
              border: "1px solid #fcc",
              borderRadius: 6,
              fontSize: 13,
              color: "#B23A3A",
              marginBottom: 12,
            }}
          >
            {error}
          </div>
        )}

        {/* Active statuses */}
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "#3E4349",
            marginBottom: 8,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Active
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
          {activeStatuses.length === 0 && (
            <div style={{ fontSize: 13, color: "#9B9890" }}>No active statuses.</div>
          )}
          {activeStatuses.map((s, idx) => (
            <div
              key={s.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 10px",
                border: "1px solid #DCDBD6",
                borderRadius: 8,
                background: "#FAFAF8",
              }}
            >
              <label
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  border: "1px solid #DCDBD6",
                  background: s.color || "#625143",
                  flexShrink: 0,
                  cursor: "pointer",
                  position: "relative",
                  overflow: "hidden",
                }}
                title="Click to change colour"
              >
                <input
                  type="color"
                  value={s.color || "#625143"}
                  onChange={(e) => handleColorChange(s.id, e.target.value)}
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    opacity: 0,
                    cursor: "pointer",
                    border: "none",
                    padding: 0,
                  }}
                />
              </label>
              {editingId === s.id ? (
                <>
                  <input
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    style={{
                      flex: 1,
                      padding: "6px 8px",
                      borderRadius: 6,
                      border: "1px solid #DCDBD6",
                      fontSize: 14,
                    }}
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                  />
                  <button
                    onClick={saveEdit}
                    style={{ ...btnBase, background: "#1B1A1A", color: "#fff", borderColor: "#1B1A1A" }}
                  >
                    Save
                  </button>
                  <button onClick={() => setEditingId(null)} style={{ ...btnBase }}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{s.label}</span>
                  {s.is_default && (
                    <span
                      style={{
                        fontSize: 10,
                        color: "#9B9890",
                        border: "1px solid #DCDBD6",
                        borderRadius: 4,
                        padding: "1px 5px",
                      }}
                    >
                      default
                    </span>
                  )}
                  <button
                    onClick={() => moveUp(idx)}
                    disabled={idx === 0}
                    style={{ ...btnBase, opacity: idx === 0 ? 0.4 : 1, cursor: idx === 0 ? "default" : "pointer" }}
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => moveDown(idx)}
                    disabled={idx === activeStatuses.length - 1}
                    style={{
                      ...btnBase,
                      opacity: idx === activeStatuses.length - 1 ? 0.4 : 1,
                      cursor: idx === activeStatuses.length - 1 ? "default" : "pointer",
                    }}
                  >
                    ↓
                  </button>
                  <button onClick={() => startEdit(s)} style={{ ...btnBase }}>
                    Rename
                  </button>
                  <button
                    onClick={() => handleArchive(s)}
                    style={{ ...btnBase, color: "#B23A3A" }}
                    title="Archive — hides from new assignments, keeps on existing projects"
                  >
                    Archive
                  </button>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Add new */}
        <div style={{ borderTop: "1px solid #DCDBD6", paddingTop: 14, marginBottom: 16 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "#3E4349",
              marginBottom: 8,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Add New Status
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              style={{
                width: 36,
                height: 36,
                border: "1px solid #DCDBD6",
                borderRadius: 6,
                cursor: "pointer",
                padding: 2,
              }}
            />
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Status label…"
              style={{
                flex: 1,
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #DCDBD6",
                fontSize: 14,
              }}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <button
              onClick={handleAdd}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: "1px solid #DCDBD6",
                background: "#1B1A1A",
                color: "#fff",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              Add
            </button>
          </div>
        </div>

        {/* Archived */}
        {archivedStatuses.length > 0 && (
          <div style={{ borderTop: "1px solid #DCDBD6", paddingTop: 14 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "#9B9890",
                marginBottom: 8,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Archived
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {archivedStatuses.map((s) => (
                <div
                  key={s.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 10px",
                    border: "1px solid #DCDBD6",
                    borderRadius: 8,
                    background: "#F8F8F7",
                    opacity: 0.75,
                  }}
                >
                  <label
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      border: "1px solid #DCDBD6",
                      background: s.color || "#625143",
                      flexShrink: 0,
                      cursor: "pointer",
                      position: "relative",
                      overflow: "hidden",
                    }}
                    title="Click to change colour"
                  >
                    <input
                      type="color"
                      value={s.color || "#625143"}
                      onChange={(e) => handleColorChange(s.id, e.target.value)}
                      style={{
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        opacity: 0,
                        cursor: "pointer",
                        border: "none",
                        padding: 0,
                      }}
                    />
                  </label>
                  <span style={{ flex: 1, fontSize: 14 }}>{s.label}</span>
                  <button onClick={() => onUnarchive(s.id)} style={{ ...btnBase }}>
                    Restore
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}