import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";
import { useProjectVersions } from "@/components/versions/useProjectVersions";
import { useCanonicalProject } from "@/components/state/projectHydrationStore";
import RoomDesignerVersionBar from "@/components/versions/RoomDesignerVersionBar";
import { REPORT_ROUTE } from "@/components/report/reportLibraryContext";
import { REPORT_UPDATE_PARAM } from "@/components/report/reportActionIntent";

import DocumentsAssetsControl from "@/components/roomdesigner/DocumentsAssetsControl";
import DownloadsMenu from "@/components/roomdesigner/DownloadsMenu";
import { useDocumentWorkflowStatus } from "@/components/documentWorkflow/useDocumentWorkflowStatus";

export default function RoomDesignerHeader({
  loadState,
  autosaveStatus,
  reloadProject,
  projectIdState,
  activeProjectId,
  isProjectMode,
  handleSaveProject = null,
  loadedVersionId = null,
  // The Room Designer's live priced schedule (the same object the page publishes
  // to the sidebar). The Project Report readiness verdict reads the CURRENT
  // Product Master from it, so the button never claims commercial readiness
  // from unknown pricing and agrees with the report's pricing decision.
  priceData = null,
}) {
  const navigate = useNavigate();

  // Project identity comes from the same canonical hydration source as the
  // sidebar and every global page — the header never fetches its own copy.
  const projectHydration = useCanonicalProject();
  const identity = projectHydration.identity;

  const effectiveProjectId = activeProjectId || projectIdState || null;
  // ONE version authority for this header: the version switcher below reads the
  // same instance, so a version is never fetched twice or reported twice.
  const versionApi = useProjectVersions(effectiveProjectId);
  const activeVersionId = versionApi.activeVersionId;

  // The version the designer is editing. The loaded version record is preferred
  // so the Project CAD filename names the version actually on screen; the
  // project's active version is the fallback, then its slot number.
  const activeVersionRecord = React.useMemo(() => {
    const versions = Array.isArray(versionApi?.versions) ? versionApi.versions : [];
    return (
      versions.find((v) => v.id === loadedVersionId) ||
      (activeVersionId ? versions.find((v) => v.id === activeVersionId) : null) ||
      versionApi?.activeVersion ||
      null
    );
  }, [versionApi?.versions, versionApi?.activeVersion, activeVersionId, loadedVersionId]);

  const projectCadVersionName = React.useMemo(() => {
    const name = String(activeVersionRecord?.version_name || "").trim();
    if (name) return name;
    const number = Number(activeVersionRecord?.version_number);
    return Number.isFinite(number) ? `V${number}` : null;
  }, [activeVersionRecord]);

  const projectCadProjectName = identity?.name || loadState?.name || null;

  // The version the report area opens for: the version being edited — the same
  // version the Project CAD export names — never another version's saved report.
  const reportVersionId = activeVersionRecord?.id || activeVersionId || null;

  // Base44 preview mirrors the iframe path into its outer route. A client-side
  // path-only transition could update that outer route while leaving the Room
  // Designer tree mounted. Load the same explicit project/version URL used by a
  // direct report open so the router and ProjectGate start from one identity.
  const openReport = (pathname, options = {}) => {
    if (!effectiveProjectId) return;
    const params = new URLSearchParams();
    params.set("projectId", effectiveProjectId);
    if (reportVersionId) params.set("versionId", reportVersionId);
    // The report page's own update intent: rebuild the report from the design as
    // it stands. This is what a report that has moved on offers.
    if (options.updateReport) params.set(REPORT_UPDATE_PARAM, "1");
    const url = `${pathname}?${params.toString()}`;
    if (typeof window !== "undefined") {
      window.location.assign(url);
    } else {
      navigate(url);
    }
  };

  const handleProjectReportClick = () => openReport(REPORT_ROUTE.VISUAL);

  // Coordinated document workflow: all projects show the DocumentWorkflowPanel.
  // The document_workflow marker remains for compatibility but no longer gates
  // the interface — legacy projects use the same panel, populated from their
  // existing stored records without migration or regeneration.
  const workflowStatus = useDocumentWorkflowStatus({
    projectId: effectiveProjectId,
    versionId: reportVersionId,
  });

  const isLoaded = loadState?.phase === "loaded";
  const hasError = loadState?.phase === "error";

  return (
    <header className="px-4 pt-2 pb-2 bg-white border-b border-[#DCDBD6] flex-shrink-0">
      {/* Row 1: Project identity + active version + save status + version switcher */}
      {effectiveProjectId && (
        <RoomDesignerVersionBar
          projectId={effectiveProjectId}
          projectName={identity?.name || loadState?.name || null}
          clientName={identity?.clientName || null}
          projectReference={identity?.projectReference || null}
          loadedVersionId={loadedVersionId}
          versionApi={versionApi}
          autosaveStatus={autosaveStatus}
          onSaveProject={handleSaveProject}
          disabled={!isLoaded}
        />
      )}

      {/* Loading state when no project is open yet */}
      {loadState?.phase === "loading" && !effectiveProjectId && (
        <div className="py-3 text-xs text-[#8B8378]">Loading project…</div>
      )}

      {/* Row 2: Documents & Assets (collapsible) + Downloads menu */}
      {effectiveProjectId && (
        <div className="mt-2 flex items-start gap-3 flex-wrap">
          <DocumentsAssetsControl
            projectId={effectiveProjectId}
            versionId={reportVersionId}
            projectName={projectCadProjectName}
            clientName={identity?.clientName || null}
            projectReference={identity?.projectReference || null}
            versionName={projectCadVersionName}
            engineeringFingerprint={workflowStatus?.engineeringFingerprint || null}
            workflowStatus={workflowStatus}
            onRetryVerification={workflowStatus?.retry || null}
            disabled={!isLoaded}
            onOpenReport={handleProjectReportClick}
          />
          <DownloadsMenu
            projectName={projectCadProjectName}
            versionName={projectCadVersionName}
            disabled={!isLoaded}
          />
        </div>
      )}

      {/* Error state — actionable, inline only when an error occurs */}
      {hasError && (
        <div className="mt-2 flex items-center gap-2 text-xs text-[#B23A3A]">
          <span>Error: {loadState.error}</span>
          <Button
            size="xs"
            variant="outline"
            className="h-6 px-2"
            onClick={() => {
              const ctrl = new AbortController();
              reloadProject(ctrl.signal);
            }}
          >
            <RotateCcw className="w-3 h-3 mr-1" />
            Retry
          </Button>
        </div>
      )}
    </header>
  );
}