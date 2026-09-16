// src/components/versions/VersionManagementPanel.jsx
//
// Vertical list of 5 version rows for the Project Edit / Versions panel.
// Each row shows: version number (not editable), active marker, editable name,
// and delete control (V2–V5 only; V1 has no delete button).
//
// V1 is the permanent baseline and cannot be deleted.
// If the active version is deleted, activation moves to the previous
// occupied version, falling back to V1 if none exists.

import React, { useState } from "react";
import { Check, Trash2, AlertTriangle } from "lucide-react";
import { useProjectVersions } from "@/components/versions/useProjectVersions";
import { VERSION_NAME_MAX_LENGTH, MAX_VERSION_SLOTS } from "@/lib/versionAuthority";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#625143",
  border: "#DCDBD6",
  bg: "#FFFFFF",
  card: "#FBFAF8",
  green: "#213428",
  btnBg: "#1B1A1A",
  btnText: "#FFFFFF",
  danger: "#B23A3A",
  dangerBg: "#FDF5F5",
};

export default function VersionManagementPanel({ projectId }) {
  const {
    versions,
    activeVersionId,
    slotGrid,
    loading,
    renameVersion,
    deleteVersion,
    switchVersion,
  } = useProjectVersions(projectId);

  const [editingName, setEditingName] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [error, setError] = useState(null);

  if (loading) {
    return (
      <div className="py-8 text-center text-sm" style={{ color: BRAND.subtext }}>
        Loading versions…
      </div>
    );
  }

  const handleStartEdit = (version) => {
    setEditingName(version.id);
    setEditValue(version.version_name || "");
  };

  const handleSaveName = async (versionId) => {
    try {
      await renameVersion(versionId, editValue);
      setEditingName(null);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (versionId) => {
    setConfirmDelete(null);
    try {
      await deleteVersion(versionId);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-2">
      {error && (
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-md mb-2 text-xs"
          style={{ background: BRAND.dangerBg, color: BRAND.danger }}
        >
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {slotGrid.map(({ slot, occupied, version }) => {
        const isActive = occupied && version.id === activeVersionId;
        const isEditing = editingName === version?.id;
        const isConfirmingDelete = confirmDelete === version?.id;
        const canDelete = occupied && slot !== 1;

        return (
          <div
            key={slot}
            className="flex items-center gap-3 px-3 py-2.5 rounded-md transition-all"
            style={{
              background: isActive ? "#E8E6E0" : occupied ? BRAND.card : "transparent",
              border: `1px solid ${isActive ? BRAND.green : occupied ? BRAND.border : "#E8E6E0"}`,
            }}
          >
            {/* Version number badge (not editable) */}
            <span
              className="flex-shrink-0 w-12 text-center text-xs font-bold px-2 py-1 rounded"
              style={{
                background: occupied ? BRAND.green : "transparent",
                color: occupied ? BRAND.btnText : BRAND.subtext,
                border: occupied ? "none" : `1px solid ${BRAND.border}`,
              }}
            >
              V{slot}
            </span>

            {occupied ? (
              <>
                {/* Version name (editable) */}
                {isEditing ? (
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value.substring(0, VERSION_NAME_MAX_LENGTH))}
                    onBlur={() => handleSaveName(version.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveName(version.id);
                      if (e.key === "Escape") setEditingName(null);
                    }}
                    maxLength={VERSION_NAME_MAX_LENGTH}
                    autoFocus
                    className="flex-1 px-2 py-1 rounded text-sm outline-none"
                    style={{
                      border: `1px solid ${BRAND.green}`,
                      color: BRAND.text,
                      fontFamily: "Didact Gothic, sans-serif",
                    }}
                  />
                ) : (
                  <button
                    onClick={() => handleStartEdit(version)}
                    className="flex-1 text-left text-sm truncate hover:underline"
                    style={{
                      color: isActive ? BRAND.green : BRAND.text,
                      fontWeight: isActive ? 600 : 400,
                      fontFamily: "Didact Gothic, sans-serif",
                    }}
                    title="Click to rename"
                  >
                    {version.version_name || "Untitled"}
                  </button>
                )}

                {/* Active marker */}
                {isActive && (
                  <span
                    className="flex items-center gap-1 text-xs flex-shrink-0"
                    style={{ color: BRAND.green }}
                  >
                    <Check className="w-3.5 h-3.5" />
                    Active
                  </span>
                )}

                {/* Switch button (if not active) */}
                {!isActive && !isEditing && (
                  <button
                    onClick={() => switchVersion(version.id)}
                    className="text-xs px-2 py-1 rounded transition-colors hover:bg-gray-100 flex-shrink-0"
                    style={{ color: BRAND.subtext, fontFamily: "Didact Gothic, sans-serif" }}
                  >
                    Open
                  </button>
                )}

                {/* Delete button (V2–V5 only) */}
                {canDelete && !isConfirmingDelete && (
                  <button
                    onClick={() => setConfirmDelete(version.id)}
                    className="p-1 rounded transition-colors hover:bg-red-50 flex-shrink-0"
                    title="Delete version"
                  >
                    <Trash2 className="w-3.5 h-3.5" style={{ color: BRAND.danger, opacity: 0.6 }} />
                  </button>
                )}

                {/* Delete confirmation */}
                {isConfirmingDelete && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleDelete(version.id)}
                      className="text-xs px-2 py-1 rounded font-medium"
                      style={{
                        background: BRAND.danger,
                        color: BRAND.btnText,
                        fontFamily: "Didact Gothic, sans-serif",
                      }}
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className="text-xs px-2 py-1 rounded transition-colors hover:bg-gray-100"
                      style={{ color: BRAND.subtext }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </>
            ) : (
              <span className="flex-1 text-sm italic" style={{ color: BRAND.subtext, opacity: 0.5 }}>
                Empty
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}