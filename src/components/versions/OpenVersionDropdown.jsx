// src/components/versions/OpenVersionDropdown.jsx
//
// "Open Version ▼" dropdown for project cards.
// Lists existing versions by name only (no V-numbers).
// Active version is marked with ✓ and a subtle highlight.
// A single disabled "+ Copy Active Version..." item sits at the bottom
// until version creation is implemented in a future phase. When enabled,
// it duplicates the active version's design_state into a new slot.

import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, Check, Plus } from "lucide-react";
import { useProjectVersions } from "@/components/versions/useProjectVersions";
import { setActiveProjectId } from "@/components/state/project-session";
import { truncateVersionName } from "@/lib/versionAuthority";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#625143",
  border: "#DCDBD6",
  bg: "#FFFFFF",
  green: "#213428",
  btnBg: "#1B1A1A",
  btnText: "#FFFFFF",
  activeBg: "#E8E6E0",
};

// Phase 2 gate — version creation is not yet implemented.
const VERSION_CREATION_ENABLED = false;

export default function OpenVersionDropdown({ projectId, projectName }) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);
  const { versions, activeVersionId, loading, switchVersion } =
    useProjectVersions(projectId);

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

  const handleCreateNew = () => {
    if (!VERSION_CREATION_ENABLED) return;
    // Phase 2: duplicate the active version's design_state into a new slot,
    // switch to it, and navigate to the Room Designer.
    setOpen(false);
    navigateToDesigner();
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

          {/* Create New Version — disabled until Phase 2 */}
          <button
            onClick={handleCreateNew}
            disabled={!VERSION_CREATION_ENABLED}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors duration-150 text-left disabled:cursor-not-allowed"
            style={{
              color: VERSION_CREATION_ENABLED ? BRAND.green : BRAND.subtext,
              opacity: VERSION_CREATION_ENABLED ? 1 : 0.5,
            }}
          >
            <Plus className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="flex-1">
              {VERSION_CREATION_ENABLED ? "Copy Active Version..." : "Copy Active Version..."}
            </span>
            {!VERSION_CREATION_ENABLED && (
              <span className="text-xs italic" style={{ color: BRAND.subtext }}>
                Coming next
              </span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}