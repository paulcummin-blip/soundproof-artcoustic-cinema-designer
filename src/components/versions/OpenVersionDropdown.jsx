// src/components/versions/OpenVersionDropdown.jsx
//
// Replaces the 'Open Project' button on project cards with an
// 'Open Version ▼' dropdown listing V1–V5 with custom names.
// Empty slots show 'Create new...'.
//
// Selecting a version navigates to the Room Designer with that version loaded.

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
  card: "#FBFAF8",
  green: "#213428",
  btnBg: "#1B1A1A",
  btnText: "#FFFFFF",
  activeBg: "#E8E6E0",
};

export default function OpenVersionDropdown({ projectId, projectName }) {
  const [open, setOpen] = useState(false);
  const [showPlaceholder, setShowPlaceholder] = useState(false);
  const dropdownRef = useRef(null);
  const { versions, activeVersionId, loading, slotGrid, switchVersion } =
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
    setShowPlaceholder(true);
    window.setTimeout(() => setShowPlaceholder(false), 3000);
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
        <span className="flex items-center gap-2">
          <span>{loading ? "Loading…" : "Open Version"}</span>
        </span>
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
          {slotGrid.map(({ slot, occupied, version }) => {
            if (!occupied) {
              return (
                <button
                  key={`empty-${slot}`}
                  onClick={handleCreateNew}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors duration-150 hover:bg-gray-50 text-left"
                  style={{ color: BRAND.subtext, opacity: 0.6 }}
                  title={`V${slot} — Version creation coming soon`}
                >
                  <span
                    className="flex-shrink-0 w-6 text-center text-xs font-bold"
                    style={{ color: BRAND.subtext, opacity: 0.5 }}
                  >
                    V{slot}
                  </span>
                  <Plus className="w-3 h-3" />
                  <span className="text-xs italic">Create New...</span>
                </button>
              );
            }

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
                <span
                  className="flex-shrink-0 w-6 text-center text-xs font-bold"
                  style={{ color: isActive ? BRAND.green : BRAND.subtext }}
                >
                  V{slot}
                </span>
                <span className="flex-1 truncate">
                  {truncateVersionName(version.version_name, 26)}
                </span>
                {isActive && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
              </button>
            );
          })}
          {showPlaceholder && (
            <div
              className="px-3 py-2 text-xs italic"
              style={{ color: BRAND.subtext, borderTop: `1px solid ${BRAND.border}` }}
            >
              Version creation will be implemented in the next phase.
            </div>
          )}
        </div>
      )}
    </div>
  );
}