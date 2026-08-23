import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { RotateCcw, FileText, Eye, ExternalLink } from "lucide-react";

// External resource — Artcoustic product CAD files (Dropbox folder).
// Opens in a new tab; not a primary project action.
const PRODUCT_CAD_FILES_URL =
  "https://www.dropbox.com/scl/fo/uh8061fp2gcua4qya4vsl/AIB6tiWKiYJ1kmc1bkav8Ag?rlkey=13gap6ajvpnlgjs74u8jopctq&st=c8f27qoy&dl=0";

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
      <div className="mt-2 text-xs flex items-center gap-4">
          {/* A valid project is always present — project-mode statuses only */}
          {loadState.phase === "loading" && <div className="text-xs text-gray-500 inline-flex items-center gap-2"> Loading project... </div>}
          {loadState.phase === "loaded" && <div className="text-xs text-gray-600 inline-flex items-center gap-2"> Loaded "{loadState.name}" </div>}
          {loadState.phase === "error" && <div className="text-xs text-red-600 inline-flex items-center gap-2"> Error: {loadState.error} <Button size="xs" variant="outline" className="ml-2 h-6 px-2" onClick={() => {const ctrl = new AbortController();reloadProject(ctrl.signal);}}><RotateCcw className="w-3 h-3 mr-1" /> Retry</Button> </div>}
          {autosaveStatus === "saving" && <span className="text-gray-500 font-medium">Saving...</span>}
          {autosaveStatus === "saved" && <span className="text-green-700 font-medium">Saved</span>}
          {autosaveStatus === "dirty" && <span className="text-amber-600 font-medium">Pending changes...</span>}
          {autosaveStatus === "hydrating" && <span>Loading project data...</span>}
          {projectIdState && (
            <span className="text-xs text-gray-400 ml-auto">ID: {projectIdState.slice(0, 12)}…</span>
          )}
      </div>
    </header>
  );
}