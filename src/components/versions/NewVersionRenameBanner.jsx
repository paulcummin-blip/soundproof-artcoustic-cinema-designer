// src/components/versions/NewVersionRenameBanner.jsx
//
// Subtle inline rename affordance shown in the Room Designer header when a
// new design option was just created. Reads a sessionStorage flag set by
// OpenVersionDropdown at creation time, then auto-focuses an editable input
// so the designer can immediately rename "Original Design (Copy)" to
// something meaningful (e.g. "Dual SUB2-12").
//
// The flag is: sp:newVersionRename:<versionId> = initial version name.
// It is cleared on mount so reloads/navigations don't re-trigger the banner.

import React, { useState, useEffect, useRef } from "react";
import { useProjectVersions } from "@/components/versions/useProjectVersions";
import { VERSION_NAME_MAX_LENGTH, sanitiseVersionName } from "@/lib/versionAuthority";

const FLAG_PREFIX = "sp:newVersionRename:";

// Read and consume the rename flag for a given project's active version.
function consumeRenameFlag(projectId) {
  if (!projectId) return null;
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (!key || !key.startsWith(FLAG_PREFIX)) continue;
      const value = sessionStorage.getItem(key);
      sessionStorage.removeItem(key);
      return { versionId: key.slice(FLAG_PREFIX.length), initialName: value || "" };
    }
  } catch {
    // sessionStorage may be unavailable (private mode); fail silently.
  }
  return null;
}

export default function NewVersionRenameBanner({ projectId }) {
  const { versions, activeVersionId, renameVersion } = useProjectVersions(projectId);
  const [renameInfo, setRenameInfo] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  // On mount, consume the rename flag
  useEffect(() => {
    const flag = consumeRenameFlag(projectId);
    if (flag) {
      setRenameInfo(flag);
      setEditValue(flag.initialName || "");
      setVisible(true);
    }
  }, [projectId]);

  // Auto-focus and select the base name (without " (Copy)") for easy typing
  useEffect(() => {
    if (visible && inputRef.current) {
      inputRef.current.focus();
      // Select everything before " (Copy)" so the user can type a new name
      const copySuffix = " (Copy)";
      if (editValue.endsWith(copySuffix)) {
        inputRef.current.setSelectionRange(0, editValue.length - copySuffix.length);
      } else {
        inputRef.current.select();
      }
    }
  }, [visible, editValue]);

  const handleSave = async () => {
    if (!renameInfo?.versionId) {
      setVisible(false);
      return;
    }
    const newName = sanitiseVersionName(editValue);
    // If the name is unchanged, just dismiss
    if (newName === renameInfo.initialName) {
      setVisible(false);
      setRenameInfo(null);
      return;
    }
    setSaving(true);
    try {
      await renameVersion(renameInfo.versionId, newName);
    } catch (err) {
      console.error("[NewVersionRenameBanner] Rename failed:", err);
    } finally {
      setSaving(false);
      setVisible(false);
      setRenameInfo(null);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setVisible(false);
      setRenameInfo(null);
    }
  };

  if (!visible || !renameInfo) return null;

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm"
      style={{
        background: "#E8E6E0",
        border: "1px solid #213428",
        fontFamily: "Didact Gothic, sans-serif",
      }}
    >
      <span className="text-xs font-medium flex-shrink-0" style={{ color: "#213428" }}>
        New design option:
      </span>
      <input
        ref={inputRef}
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value.substring(0, VERSION_NAME_MAX_LENGTH))}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        maxLength={VERSION_NAME_MAX_LENGTH}
        disabled={saving}
        className="flex-1 px-2 py-0.5 rounded text-sm outline-none min-w-0"
        style={{
          border: "1px solid #213428",
          color: "#1B1A1A",
          fontFamily: "Didact Gothic, sans-serif",
          background: "#FFFFFF",
        }}
      />
      <span className="text-xs italic flex-shrink-0" style={{ color: "#625143" }}>
        {saving ? "Saving…" : "Press Enter to rename, Esc to keep"}
      </span>
    </div>
  );
}