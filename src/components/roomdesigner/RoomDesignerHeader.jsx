import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { RotateCcw, FileText, Eye, ExternalLink, Edit2 } from "lucide-react";
import { useProjectVersions } from "@/components/versions/useProjectVersions";
import { VERSION_NAME_MAX_LENGTH, sanitiseVersionName } from "@/lib/versionAuthority";

// External resource — Artcoustic product CAD files (Dropbox folder).
// Opens in a new tab; not a primary project action.
const PRODUCT_CAD_FILES_URL =
  "https://www.dropbox.com/scl/fo/uh8061fp2gcua4qya4vsl/AIB6tiWKiYJ1kmc1bkav8Ag?rlkey=13gap6ajvpnlgjs74u8jopctq&st=c8f27qoy&dl=0";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#625143",
  border: "#DCDBD6",
  green: "#213428",
};

// Inline editable version name field. Doubles as the rename target when a
// new design option is created — navigation state { renameVersion: true }
// auto-enters edit mode with the text selected so the user can immediately
// type a meaningful name. No banner, no extra notification UI.
function VersionNameField({ projectId }) {
  const { versions, activeVersionId, renameVersion } = useProjectVersions(projectId);
  const location = useLocation();
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [renameConsumed, setRenameConsumed] = useState(false);
  const inputRef = useRef(null);

  const activeVersion = versions.find((v) => v.id === activeVersionId);
  const versionName = activeVersion?.version_name || "";

  // Auto-enter edit mode when navigation state requests a rename.
  const renameRequested = location.state?.renameVersion === true && !renameConsumed;

  useEffect(() => {
    if (renameRequested && activeVersionId) {
      setRenameConsumed(true);
      setEditing(true);
      setEditValue(versionName);
    }
  }, [renameRequested, activeVersionId, versionName]);

  // Focus + select-all when entering edit mode
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleSave = async () => {
    const newName = sanitiseVersionName(editValue);
    setEditing(false);
    if (newName !== versionName && activeVersionId) {
      try {
        await renameVersion(activeVersionId, newName);
      } catch (err) {
        console.error("[VersionNameField] Rename failed:", err);
      }
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setEditing(false);
    }
  };

  if (!activeVersion) return null;

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="text-xs font-medium" style={{ color: BRAND.subtext }}>Version:</span>
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value.substring(0, VERSION_NAME_MAX_LENGTH))}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          maxLength={VERSION_NAME_MAX_LENGTH}
          className="px-2 py-0.5 rounded text-xs outline-none"
          style={{
            border: `1px solid ${BRAND.green}`,
            color: BRAND.text,
            fontFamily: "Didact Gothic, sans-serif",
            background: "#FFFFFF",
            minWidth: 140,
          }}
        />
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-xs font-medium" style={{ color: BRAND.subtext }}>Version:</span>
      <button
        onClick={() => {
          setEditing(true);
          setEditValue(versionName);
        }}
        className="inline-flex items-center gap-1 text-xs font-semibold transition-colors hover:underline"
        style={{ color: BRAND.green, fontFamily: "Didact Gothic, sans-serif" }}
        title="Click to rename"
      >
        {versionName}
        <Edit2 className="w-3 h-3 opacity-40" />
      </button>
    </span>
  );
}

export default function RoomDesignerHeader({
  loadState,
  autosaveStatus,
  reloadProject,
  projectIdState,
  activeProjectId,
  isProjectMode,
}) {
  const navigate = useNavigate();

  const effectiveProjectId = activeProjectId || projectIdState || null;

  const handleDesignReviewClick = () => {
    if (effectiveProjectId) {
      navigate(`/DesignReview?projectId=${effectiveProjectId}`);
    }
  };

  const handleClientReportClick = () => {
    if (effectiveProjectId) {
      navigate(`/RP22ClientReport?projectId=${effectiveProjectId}`);
    }
  };

  const handleProductCadFilesClick = () => {
    window.open(PRODUCT_CAD_FILES_URL, "_blank", "noopener,noreferrer");
  };

  return (
    <header className="p-4 bg-white border-b border-[#DCDBD6] flex-shrink-0">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#1B1A1A] font-header">Cinema Designer</h1>

        <div className="flex items-center" style={{ gap: '12px' }}>
          {/* Resource link — secondary/light treatment, opens new tab */}
          <Button
            size="sm"
            variant="outline"
            className="font-medium whitespace-nowrap"
            onClick={handleProductCadFilesClick}
            style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            <ExternalLink className="w-4 h-4 mr-2" style={{ flexShrink: 0 }} />
            Product CAD Files
          </Button>

          <Button
            size="sm"
            variant="secondary"
            className="font-semibold border-[#213428] text-[#213428] whitespace-nowrap"
            onClick={handleClientReportClick}
            disabled={!effectiveProjectId}
            style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            <Eye className="w-4 h-4 mr-2" style={{ flexShrink: 0 }} />
            Visual Report
          </Button>

          <Button
            size="sm"
            variant="secondary"
            className="font-semibold border-[#625143] text-[#625143] whitespace-nowrap"
            onClick={handleDesignReviewClick}
            disabled={!effectiveProjectId}
            style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            <FileText className="w-4 h-4 mr-2" style={{ flexShrink: 0 }} />
            Technical Report
          </Button>
        </div>
      </div>
      <div className="mt-2 text-xs flex items-center gap-4 flex-wrap">
          {/* A valid project is always present — project-mode statuses only */}
          {loadState.phase === "loading" && <div className="text-xs text-gray-500 inline-flex items-center gap-2"> Loading project... </div>}
          {loadState.phase === "loaded" && <div className="text-xs text-gray-600 inline-flex items-center gap-2"> Loaded "{loadState.name}" </div>}
          {loadState.phase === "error" && <div className="text-xs text-red-600 inline-flex items-center gap-2"> Error: {loadState.error} <Button size="xs" variant="outline" className="ml-2 h-6 px-2" onClick={() => {const ctrl = new AbortController();reloadProject(ctrl.signal);}}><RotateCcw className="w-3 h-3 mr-1" /> Retry</Button> </div>}
          {autosaveStatus === "saving" && <span className="text-gray-500 font-medium">Saving...</span>}
          {autosaveStatus === "saved" && <span className="text-green-700 font-medium">Saved</span>}
          {autosaveStatus === "dirty" && <span className="text-amber-600 font-medium">Pending changes...</span>}
          {autosaveStatus === "hydrating" && <span>Loading project data...</span>}
          {effectiveProjectId && (
            <VersionNameField projectId={effectiveProjectId} />
          )}
          {projectIdState && (
            <span className="text-xs text-gray-400 ml-auto">ID: {projectIdState.slice(0, 12)}…</span>
          )}
      </div>
    </header>
  );
}