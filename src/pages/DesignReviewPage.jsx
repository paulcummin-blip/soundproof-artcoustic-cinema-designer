/**
 * DesignReviewPage.jsx
 * ---------------------
 * In-app RP22 Compliance Report — Design Review workspace.
 *
 * Route: /DesignReview?projectId={projectId}
 *
 * Page structure:
 *   1. RP22 Compliance Report header (ReportCover branding + action bar)
 *   2. Project Summary card (project, client, room, system, screen, seating)
 *   3. Four collapsible Design Review sections:
 *      - Design Overview (OPEN by default)
 *      - Drawings & Geometry
 *      - Parameter Details (controlled)
 *      - Recommendations & Products (controlled)
 *
 * CRITICAL: Does NOT mount useRP22AnalysisEngine, DesignRecommendationEngine,
 * or a second pricing calculation. Reads the already-settled analysis and full
 * commercial price snapshot from the project-scoped Room Designer handoff.
 */

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useActiveProjectId } from "@/components/state/project-session";
import { useAppState } from "@/components/AppStateProvider";
import { hydrateProjectIntoAppState } from "@/components/utils/hydrateProjectIntoAppState";
import { mergeProjectAndVersion } from "@/lib/versionAuthority";
import { readDesignReviewHandoff, subscribeDesignReviewHandoff } from "@/components/state/designReviewHandoff";
import { base44 } from "@/api/base44Client";
import { CollapsiblePanel } from "@/components/ui/CollapsiblePanel";
import ReportCover from "@/components/report/ReportCover";
import DesignOverviewBlock from "@/components/designreview/DesignOverviewBlock";
import ParameterExplorer from "@/components/designreview/ParameterExplorer";
import DrawingsBlock from "@/components/designreview/DrawingsBlock";
import RecommendationsBlock from "@/components/designreview/RecommendationsBlock";
import TechnicalInstalledCalibration from "@/components/report/technical/TechnicalInstalledCalibration";
import DesignReviewActions from "@/components/designreview/DesignReviewActions";
import ProjectSummaryCard from "@/components/designreview/ProjectSummaryCard";
import { BarChart3, PenTool, ListChecks, Package, Sparkles } from "lucide-react";
import AiSummaryPanel from "@/components/aiSummary/AiSummaryPanel";

const COLORS = {
  bg: "#F1F0EE",
  primary: "#213428",
  body: "#3E4349",
  muted: "#77736B",
};

const FONT_BODY = "'Didact Gothic', 'Century Gothic', sans-serif";

export default function DesignReviewPage() {
  const app = useAppState();
  const [geometryReadyProjectId, setGeometryReadyProjectId] = useState(null);
  const { projectId: routeProjectId } = useParams();
  const [searchParams] = useSearchParams();
  const activeProjectId = useActiveProjectId();
  const projectId =
    routeProjectId ||
    searchParams.get("projectId") ||
    searchParams.get("project") ||
    searchParams.get("id") ||
    activeProjectId;

  const [projectDetails, setProjectDetails] = useState(null);
  const [asdrData, setAsdrData] = useState(null);
  const [loadingProject, setLoadingProject] = useState(true);
  const priceData = asdrData?.priceData?.showPrices ? asdrData.priceData : null;

  // ── Resolved seating authority ──
  // Same-project Room Designer seats are carried with the canonical result
  // handoff. A direct load (or a project without a usable handoff) falls back
  // to the persisted Project geometry. Never infer seat ownership from whatever
  // AppState happens to contain on this route.
  const resolvedSeatingPositions = useMemo(() => {
    const handoffSeats = Array.isArray(asdrData?.seatingPositions)
      ? asdrData.seatingPositions
      : [];
    const handoffBelongsToCurrentProject =
      String(asdrData?.projectId || "") === String(projectId || "") &&
      handoffSeats.length > 0;
    if (handoffBelongsToCurrentProject) return handoffSeats;

    return Array.isArray(projectDetails?.seating_positions)
      ? projectDetails.seating_positions
      : [];
  }, [asdrData, projectId, projectDetails]);

  // Stage C: Parameter Explorer state (page-level)
  const [paramDetailsOpen, setParamDetailsOpen] = useState(false);
  const [expandedParamKey, setExpandedParamKey] = useState(null);
  const [activeFilter, setActiveFilter] = useState("all");

  // Stage D: Recommendations & Products panel state
  const [recsOpen, setRecsOpen] = useState(false);

  // Fetch full project entity for the summary card
  useEffect(() => {
    if (!projectId) {
      setProjectDetails(null);
      setLoadingProject(false);
      return;
    }
    let cancelled = false;
    // Clear the previous project's record before fetching the next one so its
    // seat geometry cannot render under the new project identity.
    setProjectDetails(null);
    setGeometryReadyProjectId(null);
    setLoadingProject(true);
    base44.entities.Project.filter({ id: projectId }).then(async (results) => {
      if (cancelled) return;
      const p = Array.isArray(results) && results.length > 0 ? results[0] : null;
      if (p) {
        // Merge with the active ProjectVersion so per-version design fields
        // come from design_state, not from the legacy Project position.
        let merged = p;
        const versionId = p.active_version_id;
        if (versionId) {
          try {
            const versions = await base44.entities.ProjectVersion.filter({ id: versionId });
            if (!cancelled && versions && versions.length > 0) {
              merged = mergeProjectAndVersion(p, versions[0]);
            }
          } catch (verErr) {
            console.warn("[DesignReviewPage] Version fetch failed, using project-only:", verErr);
          }
        }
        // Preserve live same-project edits; cold/direct loads use the same
        // hydration path as Room Designer and the PDF report before drawing.
        if (!(activeProjectId === projectId && app?.isProjectHydrationReady === true)) {
          hydrateProjectIntoAppState(merged, app, { ...app, setDolbyPreset: app.setDolbyLayout });
        }
        setGeometryReadyProjectId(merged.id || p.id);
        // Store the MERGED project (Project + active version design_state), not
        // the raw Project entity. Per-version design fields (speakers, subs,
        // seating, room dims, screen, etc.) come from design_state; storing raw
        // p would show stale legacy fields when a version has diverged.
        setProjectDetails(merged || null);
      }
    }).catch(() => {
      if (!cancelled) setProjectDetails(null);
    }).finally(() => {
      if (!cancelled) setLoadingProject(false);
    });
    return () => { cancelled = true; };
  }, [projectId]);

  // Read the live same-window handoff first, then the project-scoped stored
  // snapshot for direct/new-tab loads. Stored data is accepted only after the
  // current Project record has loaded and passed the freshness check.
  const activeVersionId = projectDetails?.active_version_id || null;

  useEffect(() => {
    if (!projectId || !activeVersionId) {
      setAsdrData(null);
      return undefined;
    }
    const read = () => {
      const shared = readDesignReviewHandoff(projectId, activeVersionId, {
        allowStored: !loadingProject,
      });
      setAsdrData(shared);
    };
    read();
    return subscribeDesignReviewHandoff(projectId, activeVersionId, (snapshot) => {
      if (snapshot) setAsdrData(snapshot);
      else read();
    });
  }, [projectId, activeVersionId, loadingProject]);

  // Keep the persistent sidebar on the same project-scoped price snapshot,
  // including on a direct/new-tab Design Review load.
  useEffect(() => {
    if (typeof window === "undefined" || !priceData) return;
    if (String(priceData.projectId || "") !== String(projectId || "")) return;
    window.__ROOM_DESIGNER_PRICE__ = priceData;
  }, [priceData, projectId]);

  const engineeringSummary =
    asdrData?.engineeringSummary
      ?? asdrData?.rating?.engineeringSummary
      ?? null;

  // Stage C: Handle Lowest Performance Results row click from Design Overview
  const handleParamClick = useCallback((paramKey) => {
    if (!paramKey) return;
    setParamDetailsOpen(true);
    setActiveFilter("all");
    setExpandedParamKey(paramKey);
  }, []);

  // Stage D: Handle "View Recommendations" click from Design Overview
  const handleShowRecommendations = useCallback(() => {
    setRecsOpen(true);
  }, []);

  const handleExpandParam = useCallback((key) => {
    setExpandedParamKey(key);
  }, []);

  const handleFilterChange = useCallback((filter) => {
    setActiveFilter(filter);
  }, []);

  return (
    <div style={{
      minHeight: "100vh",
      background: COLORS.bg,
      fontFamily: FONT_BODY,
      color: COLORS.body,
    }}>
      {/* ── RP22 Compliance Report header (existing branding) ── */}
      <div style={{
        maxWidth: 920,
        margin: "0 auto",
        padding: "24px 16px 0",
      }}>
        <ReportCover variant="screen" />

        {/* Action bar */}
        <div style={{
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: 16,
        }}>
          <DesignReviewActions projectId={projectId} />
        </div>

        {/* Project Summary card */}
        {projectDetails ? (
          <ProjectSummaryCard project={projectDetails} />
        ) : (
          !projectId && !loadingProject && (
            <div style={{
              padding: "24px 16px",
              textAlign: "center",
              color: COLORS.muted,
              fontFamily: FONT_BODY,
              fontSize: 13,
            }}>
              No project selected. Open a project from the Room Designer.
            </div>
          )
        )}
      </div>

      {/* ── Four Design Review sections ── */}
      <div style={{
        maxWidth: 920,
        margin: "0 auto",
        padding: "16px 16px 32px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}>
        <CollapsiblePanel
          title="Design Overview"
          icon={<BarChart3 style={{ width: 16, height: 16, color: COLORS.primary }} />}
          defaultOpen={true}
        >
          <DesignOverviewBlock
            engineeringSummary={engineeringSummary}
            recommendations={asdrData?.recommendations}
            onParamClick={handleParamClick}
            onShowRecommendations={handleShowRecommendations}
          />
        </CollapsiblePanel>

        <CollapsiblePanel
          title="Drawings & Geometry"
          icon={<PenTool style={{ width: 16, height: 16, color: COLORS.primary }} />}
        >
          {geometryReadyProjectId === projectId ? (
            <DrawingsBlock asdrData={asdrData} />
          ) : (
            <div role="status">Loading project geometry…</div>
          )}
        </CollapsiblePanel>

        <CollapsiblePanel
          title="Parameter Details"
          icon={<ListChecks style={{ width: 16, height: 16, color: COLORS.primary }} />}
          isOpen={paramDetailsOpen}
          onToggle={() => setParamDetailsOpen(prev => !prev)}
        >
          <ParameterExplorer
            engineeringSummary={engineeringSummary}
            expandedParamKey={expandedParamKey}
            onExpandParam={handleExpandParam}
            activeFilter={activeFilter}
            onFilterChange={handleFilterChange}
            seatingPositions={resolvedSeatingPositions}
          />
        </CollapsiblePanel>

        <CollapsiblePanel
          title="Recommendations & Products"
          icon={<Package style={{ width: 16, height: 16, color: COLORS.primary }} />}
          isOpen={recsOpen}
          onToggle={() => setRecsOpen(prev => !prev)}
        >
          <TechnicalInstalledCalibration
            subwooferInstances={projectDetails?.subwooferInstances || []}
            roomDims={{
              widthM: projectDetails?.room_width,
              lengthM: projectDetails?.room_length,
              heightM: projectDetails?.room_height,
            }}
          />
          <div style={{ height: 12 }} />
          <RecommendationsBlock asdrData={asdrData} priceData={priceData} />
        </CollapsiblePanel>

        <CollapsiblePanel
          title="AI Client Summary"
          icon={<Sparkles style={{ width: 16, height: 16, color: COLORS.primary }} />}
        >
          <AiSummaryPanel
            projectId={projectId}
            versionId={activeVersionId}
            publishedSnapshot={asdrData}
            projectDetails={projectDetails}
          />
        </CollapsiblePanel>
      </div>
    </div>
  );
}