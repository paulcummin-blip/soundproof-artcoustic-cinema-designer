// src/components/versions/OpenVersionDropdown.jsx
//
// Split-button "Open Version | ▼" for project cards.
// PURE PRESENTATION COMPONENT — no network requests.
//
// Receives all version data and callbacks through props:
//   versions          — array of ProjectVersion records for this project
//   activeVersionId   — the active version's ID
//   onSwitchVersion   — async callback(versionId) → switches active version
//   onCreateVersion    — async callback(slotNumber, name) → creates new version
//   loading           — whether versions are still being loaded
//
// The Projects page owns all data fetching and mutation logic.

import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { ChevronDown, Check, Plus, AlertCircle } from "lucide-react";
import { setActiveProjectId } from "@/components/state/project-session";
import {
  truncateVersionName,
  NEW_VERSION_DEFAULT_NAME,
  findNextEmptySlot,
} from "@/lib/versionAuthority";

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

const VERSION_CREATION_ENABLED = true;

export default function OpenVersionDropdown({
  projectId,
  projectName,
  versions,
  activeVersionId,
  onSwitchVersion,
  onCreateVersion,
  loading = false,
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);
  const dropdownRef = useRef(null);
  const [menuPos, setMenuPos] = useState(null);

  const versionList = versions || [];
  const nextEmptySlot = findNextEmptySlot(versionList);
  const canCreateVersion = nextEmptySlot !== null;

  // Measure button position when opening — menu renders as a floating
  // portal so it is never clipped by the card's overflow:hidden.
  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    const btn = dropdownRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    setMenuPos({
      top: rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, 220),
    });
  }, [open]);

  // Close on outside click or scroll/resize
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    function handleClose() {
      setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("scroll", handleClose, true);
    window.addEventListener("resize", handleClose);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", handleClose, true);
      window.removeEventListener("resize", handleClose);
    };
  }, [open]);

  const navigateToDesigner = () => {
    setActiveProjectId(projectId);
    window.location.href = `/RoomDesigner?project=${encodeURIComponent(projectId)}`;
  };

  const handleSelect = async (version) => {
    if (version.id !== activeVersionId && onSwitchVersion) {
      try {
        await onSwitchVersion(projectId, version.id);
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
      await onCreateVersion(projectId, nextEmptySlot, NEW_VERSION_DEFAULT_NAME);

      setOpen(false);
      setActiveProjectId(projectId);
      // Pass rename intent via navigation state — transient, belongs to this
      // navigation event only. No sessionStorage, no banner.
      navigate(`/RoomDesigner?project=${encodeURIComponent(projectId)}`, {
        state: { renameVersion: true },
      });
    } catch (err) {
      console.error("[OpenVersionDropdown] Create version failed:", err);
      setCreateError(err?.message || "Failed to create design option.");
    } finally {
      setCreating(false);
    }
  };

  const handleMainClick = () => {
    if (loading) return;
    navigateToDesigner();
  };

  const handleArrowClick = () => {
    if (loading) return;
    setOpen(!open);
  };

  return (
    <div ref={dropdownRef} className="relative inline-block text-left w-full">
      <div className="w-full flex items-stretch rounded-md overflow-hidden" style={{ background: BRAND.btnBg }}>
        {/* Main button — opens the active version immediately */}
        <button
          onClick={handleMainClick}
          disabled={loading}
          className="flex-1 flex items-center px-3 py-2 text-sm font-medium transition-all duration-200 disabled:opacity-50 hover:brightness-110"
          style={{
            color: BRAND.btnText,
            fontFamily: "Didact Gothic, sans-serif",
            letterSpacing: "0.02em",
          }}
          title={loading ? "Loading versions…" : "Open the current version"}
        >
          <span>{loading ? "Loading…" : "Open"}</span>
        </button>

        {/* Divider between main button and arrow */}
        <div style={{ width: 1, background: "rgba(255,255,255,0.25)" }} />

        {/* Arrow button — opens the version menu */}
        <button
          onClick={handleArrowClick}
          disabled={loading}
          aria-label="Choose a version"
          className="flex items-center justify-center px-2.5 py-2 text-sm font-medium transition-all duration-200 disabled:opacity-50 hover:brightness-110"
          style={{
            color: BRAND.btnText,
            fontFamily: "Didact Gothic, sans-serif",
          }}
          title="Choose another version or create a new one"
        >
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {open && menuPos && createPortal(
        <div
          className="fixed rounded-md shadow-xl max-h-[360px] overflow-y-auto"
          style={{
            position: "fixed",
            top: menuPos.top,
            left: menuPos.left,
            width: menuPos.width,
            background: BRAND.bg,
            border: `1px solid ${BRAND.border}`,
            fontFamily: "Didact Gothic, sans-serif",
            zIndex: 9999,
          }}
        >
          {/* Existing versions — name only, no slot numbers */}
          {versionList.map((version) => {
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
        </div>,
        document.body
      )}
    </div>
  );
}