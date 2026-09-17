// src/components/versions/OpenVersionDropdown.jsx
//
// "Open Version ▼" dropdown for project cards.
// Lists existing versions by name only (no V-numbers).
// Active version is marked with ✓ and a subtle highlight.
// "+ New Design Option…" at the bottom duplicates the active version's
// design_state into the next available slot (V2→V5), switches to it,
// and opens the Room Designer. The new version inherits the source
// name with a " (Copy)" suffix. A sessionStorage flag triggers the
// NewVersionRenameBanner in the Room Designer header for instant renaming.

import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, Check, Plus, AlertCircle } from "lucide-react";
import { useProjectVersions } from "@/components/versions/useProjectVersions";
import { setActiveProjectId } from "@/components/state/project-session";
import { truncateVersionName, buildCopyVersionName } from "@/lib/versionAuthority";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#625143",
  border: "#DCDBD6",
  bg: "#FFFFFF",
  green: "#213428",
  btnBg: "#1B1A1A",
  btnText: "#FFFFFF",
  activeBg: "#E8E6E0",
  danger: "#B23A3A",
  dangerBg: "#FDF5F5",
};

// Phase 2 — version creation is now enabled.
const VERSION_CREATION_ENABLED = true;

// sessionStorage flag prefix consumed by NewVersionRenameBanner.
const RENAME_FLAG_PREFIX = "sp:newVersionRename:";

export default function OpenVersionDropdown({ projectId, projectName }) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);
  const dropdownRef = useRef(null);
  const {
    versions,
    activeVersionId,
    loading,
    switchVersion,
    createVersion,
    nextEmptySlot,
    canCreateVersion,
    activeVersion,
  } = useProjectVersions(projectId);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const navigateToDesigner = () => {
    setActiveProjectId(projectId);
    window.location.href = `/RoomDesigner?project=${encodeURIComponent(projectId)}`;
  };

  const handleSelect = async (version) => {
    if (version.id !== activeVersionId) {
      try {
        await switchVersion(version.id);
      } catch (err) {
        console.error("[OpenVersionDropdown] Switch failed:", err);
      }
    }
    setOpen(false);
    navigateToDesigner();
  };

  const handleCreateNew = async () => {
    if (!VERSION_CREATION_ENABLED) return;
    setCreateError(null);

    if (!canCreateVersion) {
      setCreateError("This project already contains the maximum of five design options.");
      return;
    }

    setCreating(true);
    try {
      const sourceName = activeVersion?.version_name || "Original Design";
      const copyName = buildCopyVersionName(sourceName);
      const newVersion = await createVersion(nextEmptySlot, copyName);

      // Set the rename flag so NewVersionRenameBanner auto-enters edit mode
      if (newVersion?.id) {
        try {
          sessionStorage.setItem(RENAME_FLAG_PREFIX + newVersion.id, copyName);
        } catch {
          // sessionStorage may be unavailable; fail silently.
        }
      }

      setOpen(false);
      navigateToDesigner();
    } catch (err) {
      console.error("[OpenVersionDropdown] Create version failed:", err);
      setCreateError(err?.message || "Failed to create design option.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div ref={dropdownRef} className="relative inline-block text-left w-full">
      <button
        onClick={() => setOpen(!open)}
        disabled={loading}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 disabled:opacity-50"
        style={{
          background: BRAND.btnBg,
          color: BRAND.btnText,
          fontFamily: "Didact Gothic, sans-serif",
          letterSpacing: "0.02em",
        }}
      >
        <span>{loading ? "Loading…" : "Open Version"}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          className="absolute right-0 mt-1 w-full min-w-[220px] rounded-md shadow-lg z-50 max-h-[360px] overflow-y-auto"
          style={{
            background: BRAND.bg,
            border: `1px solid ${BRAND.border}`,
            fontFamily: "Didact Gothic, sans-serif",
          }}
        >
          {/* Existing versions — name only, no slot numbers */}
          {versions.map((version) => {
            const isActive = version.id === activeVersionId;
            return (
              <button
                key={version.id}
                onClick={() => handleSelect(version)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors duration-150 text-left"
                style={{
                  background: isActive ? BRAND.activeBg : "transparent",
                  color: isActive ? BRAND.green : BRAND.text,
                  fontWeight: isActive ? 600 : 400,
                }}
                title={version.version_name}
              >
                <span className="flex-shrink-0 w-4 flex justify-center">
                  {isActive && <Check className="w-3.5 h-3.5" style={{ color: BRAND.green }} />}
                </span>
                <span className="flex-1 truncate">
                  {truncateVersionName(version.version_name, 30)}
                </span>
              </button>
            );
          })}

          {/* Divider before create action */}
          <div style={{ borderTop: `1px solid ${BRAND.border}` }} />

          {/* Max-versions message (shown inline when all 5 slots are full) */}
          {createError && (
            <div
              className="flex items-start gap-2 px-3 py-2 text-xs"
              style={{ color: BRAND.danger, background: BRAND.dangerBg }}
            >
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>{createError}</span>
            </div>
          )}

          {/* New Design Option */}
          <button
            onClick={handleCreateNew}
            disabled={!VERSION_CREATION_ENABLED || creating || !canCreateVersion}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors duration-150 text-left disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              color: BRAND.green,
            }}
            title={
              !canCreateVersion
                ? "This project already contains the maximum of five design options."
                : "Duplicate the active version into a new design option"
            }
          >
            <Plus className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="flex-1">
              {creating ? "Creating…" : "New Design Option…"}
            </span>
            {!canCreateVersion && !creating && (
              <span className="text-xs italic flex-shrink-0" style={{ color: BRAND.subtext }}>
                Full
              </span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}