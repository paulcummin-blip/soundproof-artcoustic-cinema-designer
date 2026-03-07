import React from "react";
import { Button } from "@/components/ui/button";
import { Save, RotateCcw } from "lucide-react";

export default function RoomDesignerHeader({
  showResetConfirm,
  setShowResetConfirm,
  isFrozen,
  handleResetPositions,
  handleSaveProject,
  showLocalHint,
  loadState,
  autosaveStatus,
  reloadProject,
  projectIdState,
  isProjectMode,
}) {
  return (
    <header className="p-4 bg-white border-b border-[#DCDBD6] flex-shrink-0">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#1B1A1A] font-header">Cinema Designer</h1>
        
        <div className="flex items-center" style={{ gap: '12px' }}>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowResetConfirm(true)}
            disabled={isFrozen('speakers')}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset
          </Button>

          <Button size="sm" className="brand-btn" onClick={handleSaveProject}>
            <Save className="w-4 h-4 mr-2" />
            {isProjectMode ? "Save Project" : "Save Local Draft"}
          </Button>
        </div>
      </div>
      <div className="mt-2 text-xs flex items-center gap-4">
          {/* Scratch mode: single clear message, no project-style statuses */}
          {!isProjectMode && (
            <div className="text-xs text-amber-600 inline-flex items-center gap-2">
              Free Use — local draft, not linked to a project
            </div>
          )}
          {!isProjectMode && autosaveStatus === "local" && (
            <span className="text-gray-500">Saved locally</span>
          )}

          {/* Project mode only statuses */}
          {isProjectMode && loadState.phase === "loading" && <div className="text-xs text-gray-500 inline-flex items-center gap-2"> Loading project... </div>}
          {isProjectMode && loadState.phase === "loaded" && <div className="text-xs text-gray-600 inline-flex items-center gap-2"> Loaded "{loadState.name}" </div>}
          {isProjectMode && loadState.phase === "error" && <div className="text-xs text-red-600 inline-flex items-center gap-2"> Error: {loadState.error} <Button size="xs" variant="outline" className="ml-2 h-6 px-2" onClick={() => {const ctrl = new AbortController();reloadProject(ctrl.signal);}}><RotateCcw className="w-3 h-3 mr-1" /> Retry</Button> </div>}
          {isProjectMode && autosaveStatus === "saving" && <span className="text-gray-500">Saving…</span>}
          {isProjectMode && autosaveStatus === "saved" && <span className="text-[#3E4349]">All changes saved</span>}
          {isProjectMode && autosaveStatus === "dirty" && <span className="text-amber-600">Pending changes…</span>}
          {isProjectMode && autosaveStatus === "hydrating" && <span>Loading project data...</span>}
          {isProjectMode && projectIdState && (
            <span className="text-xs text-gray-400 ml-auto">ID: {projectIdState.slice(0, 12)}…</span>
          )}
      </div>
    </header>
  );
}