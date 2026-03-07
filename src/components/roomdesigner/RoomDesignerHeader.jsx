import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Save, RotateCcw, ChevronDown, FolderOpen } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  onFreeUse,
  onNewProject,
  onSaveToExistingProject,
  existingProjects,
}) {
  const [overwriteCandidate, setOverwriteCandidate] = useState(null); // { id, name }

  const handleExistingProjectClick = (project) => {
    setOverwriteCandidate({ id: project.id, name: project.name });
  };

  const handleOverwriteConfirm = () => {
    if (overwriteCandidate) {
      onSaveToExistingProject(overwriteCandidate.id, overwriteCandidate.name);
    }
    setOverwriteCandidate(null);
  };

  return (
    <>
    <AlertDialog open={!!overwriteCandidate} onOpenChange={(open) => { if (!open) setOverwriteCandidate(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Overwrite existing project?</AlertDialogTitle>
          <AlertDialogDescription>
            This will overwrite &ldquo;{overwriteCandidate?.name}&rdquo; with the current Room Designer state. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>No</AlertDialogCancel>
          <AlertDialogAction onClick={handleOverwriteConfirm} className="bg-[#213428] hover:bg-[#3E4349] text-white">Yes, overwrite</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

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

          <Button
            size="sm"
            variant="outline"
            onClick={onFreeUse}
            className={!isProjectMode ? "border-amber-400 text-amber-700 bg-amber-50" : ""}
          >
            Free Use
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="brand-btn">
                <Save className="w-4 h-4 mr-2" />
                Save to Project
                <ChevronDown className="w-3 h-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-white border-[#DCDBD6]">
              <DropdownMenuItem onClick={onNewProject} className="cursor-pointer font-medium">
                <FolderOpen className="w-4 h-4 mr-2" />
                New Project
              </DropdownMenuItem>
              {existingProjects && existingProjects.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  {existingProjects.map((p) => (
                    <DropdownMenuItem
                      key={p.id}
                      onClick={() => handleExistingProjectClick(p)}
                      className="cursor-pointer"
                    >
                      <span className="truncate">{p.name || "Untitled"}</span>
                    </DropdownMenuItem>
                  ))}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
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
    </>
  );
}