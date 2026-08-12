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
 * CRITICAL: Does NOT mount useRP22AnalysisEngine or DesignRecommendationEngine.
 * Reads the already-settled rating + recommendations + analysisResult from the
 * shared window.__ROOM_DESIGNER_ASDR__ store, and price breakdown from
 * window.__ROOM_DESIGNER_PRICE__, both published by the Room Designer.
 */

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useActiveProjectId } from "@/components/state/project-session";
import { readDesignReviewHandoff } from "@/components/state/designReviewHandoff";
import { base44 } from "@/api/base44Client";
import { CollapsiblePanel } from "@/components/ui/CollapsiblePanel";
import ReportCover from "@/components/report/ReportCover";
import DesignOverviewBlock from "@/components/designreview/DesignOverviewBlock";
import ParameterExplorer from "@/components/designreview/ParameterExplorer";
import DrawingsBlock from "@/components/designreview/DrawingsBlock";
import RecommendationsBlock from "@/components/designreview/RecommendationsBlock";
import DesignReviewActions from "@/components/designreview/DesignReviewActions";
import ProjectSummaryCard from "@/components/designreview/ProjectSummaryCard";
import { BarChart3, PenTool, ListChecks, Package } from "lucide-react";

const COLORS = {
  bg: "#F1F0EE",
  primary: "#213428",
  body: "#3E4349",
  muted: "#77736B",
};

const FONT_BODY = "'Didact Gothic', 'Century Gothic', sans-serif";

export default function DesignReviewPage() {
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
  const [priceData, setPriceData] = useState(null);
  const [loadingProject, setLoadingProject] = useState(true);

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
    setLoadingProject(true);
    base44.entities.Project.filter({ id: projectId }).then((results) => {
      if (cancelled) return;
      const p = Array.isArray(results) && results.length > 0 ? results[0] : null;
      setProjectDetails(p || null);
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
  useEffect(() => {
    const read = () => {
      const shared = readDesignReviewHandoff(projectId, {
        projectUpdatedAt: projectDetails?.updated_date,
        allowStored: !loadingProject,
      });
      setAsdrData(shared);
    };
    read();
    const interval = setInterval(read, 500);
    return () => clearInterval(interval);
  }, [projectId, projectDetails?.updated_date, loadingProject]);

  // Stage D: Poll the shared price store published by the Room Designer.
  useEffect(() => {
    const read = () => {
      const shared = typeof window !== "undefined" ? window.__ROOM_DESIGNER_PRICE__ : null;
      if (shared && shared.showPrices) {
        setPriceData(shared);
      } else {
        setPriceData(null);
      }
    };
    read();
    const interval = setInterval(read, 500);
    return () => clearInterval(interval);
  }, []);

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
            rating={asdrData?.rating}
            recommendations={asdrData?.recommendations}
            onParamClick={handleParamClick}
            onShowRecommendations={handleShowRecommendations}
          />
        </CollapsiblePanel>

        <CollapsiblePanel
          title="Drawings & Geometry"
          icon={<PenTool style={{ width: 16, height: 16, color: COLORS.primary }} />}
        >
          <DrawingsBlock asdrData={asdrData} />
        </CollapsiblePanel>

        <CollapsiblePanel
          title="Parameter Details"
          icon={<ListChecks style={{ width: 16, height: 16, color: COLORS.primary }} />}
          isOpen={paramDetailsOpen}
          onToggle={() => setParamDetailsOpen(prev => !prev)}
        >
          <ParameterExplorer
            rating={asdrData?.rating}
            analysisResult={asdrData?.analysisResult}
            projectId={projectId}
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
          <RecommendationsBlock asdrData={asdrData} priceData={priceData} />
        </CollapsiblePanel>
      </div>
    </div>
  );
}