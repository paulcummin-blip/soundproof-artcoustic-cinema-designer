/**
 * DesignReviewPage.jsx
 * ---------------------
 * Stage B + C + D — In-app Design Review workspace.
 *
 * Route: /DesignReview?projectId={projectId}
 *
 * Four collapsible sections:
 *   1. Design Overview (OPEN by default) — rating, pillar summaries, needs attention, rec snapshot
 *   2. Drawings & Geometry — lazy-mounted plan, elevation, zones, acoustic treatment
 *   3. Parameter Details (controlled) — compact parameter explorer
 *   4. Recommendations & Products (controlled) — design recs, products selected, price breakdown
 *
 * Stage C: Design Overview → Parameter Details navigation.
 * Stage D: Drawings & Geometry + Recommendations & Products sections.
 *   - "View Details" in Recommendation Snapshot opens Recommendations & Products.
 *
 * CRITICAL: Does NOT mount useRP22AnalysisEngine or DesignRecommendationEngine.
 * Reads the already-settled rating + recommendations + analysisResult from the
 * shared window.__ROOM_DESIGNER_ASDR__ store, and price breakdown from
 * window.__ROOM_DESIGNER_PRICE__, both published by the Room Designer.
 */

import React, { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useActiveProjectId } from "@/components/state/project-session";
import { base44 } from "@/api/base44Client";
import { CollapsiblePanel } from "@/components/ui/CollapsiblePanel";
import DesignOverviewBlock from "@/components/designreview/DesignOverviewBlock";
import ParameterExplorer from "@/components/designreview/ParameterExplorer";
import DrawingsBlock from "@/components/designreview/DrawingsBlock";
import RecommendationsBlock from "@/components/designreview/RecommendationsBlock";
import DesignReviewActions from "@/components/designreview/DesignReviewActions";
import { BarChart3, PenTool, ListChecks, Package } from "lucide-react";

const COLORS = {
  bg: "#F1F0EE",
  primary: "#213428",
  secondary: "#625143",
  body: "#3E4349",
  muted: "#77736B",
  border: "#E6E4DD",
};

const FONT_HEADING = "'Futura PT Light', 'Century Gothic', sans-serif";
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

  // Stage C: Parameter Explorer state (page-level)
  const [paramDetailsOpen, setParamDetailsOpen] = useState(false);
  const [expandedParamKey, setExpandedParamKey] = useState(null);
  const [activeFilter, setActiveFilter] = useState("needs");

  // Stage D: Recommendations & Products panel state
  const [recsOpen, setRecsOpen] = useState(false);

  // Fetch project details (name, client) for the header
  useEffect(() => {
    if (!projectId) {
      setProjectDetails(null);
      setLoadingProject(false);
      return;
    }
    let cancelled = false;
    setLoadingProject(true);
    base44.entities.Project.filter({ id: projectId }).then((results) => {
      if (cancelled) return;
      const p = Array.isArray(results) && results.length > 0 ? results[0] : null;
      if (p) {
        setProjectDetails({ name: p.name, client_name: p.client_name });
      } else {
        setProjectDetails(null);
      }
    }).catch(() => {
      if (!cancelled) setProjectDetails(null);
    }).finally(() => {
      if (!cancelled) setLoadingProject(false);
    });
    return () => { cancelled = true; };
  }, [projectId]);

  // Poll the shared ASDR store published by the Room Designer.
  useEffect(() => {
    const read = () => {
      const shared = typeof window !== "undefined" ? window.__ROOM_DESIGNER_ASDR__ : null;
      if (
        shared &&
        String(shared.projectId || "") === String(projectId || "")
      ) {
        setAsdrData(shared);
      } else {
        setAsdrData(null);
      }
    };
    read();
    const interval = setInterval(read, 500);
    return () => clearInterval(interval);
  }, [projectId]);

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

  // Stage C: Handle Needs Attention row click from Design Overview
  const handleParamClick = useCallback((paramKey) => {
    if (!paramKey) return;
    setParamDetailsOpen(true);
    setActiveFilter("needs");
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
      {/* Header */}
      <div style={{
        padding: "20px 24px",
        borderBottom: `1px solid ${COLORS.border}`,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
      }}>
        <div>
          <h1 style={{
            margin: 0,
            fontSize: 20,
            fontWeight: 600,
            color: COLORS.primary,
            fontFamily: FONT_HEADING,
          }}>
            Design Review
          </h1>
          <p style={{
            margin: "4px 0 0 0",
            fontSize: 12,
            color: COLORS.muted,
            fontFamily: FONT_BODY,
          }}>
            Review performance, geometry and recommendations before export.
          </p>
          {projectDetails && (
            <p style={{
              margin: "6px 0 0 0",
              fontSize: 13,
              color: COLORS.secondary,
              fontFamily: FONT_BODY,
            }}>
              {projectDetails.name}
              {projectDetails.client_name ? ` — ${projectDetails.client_name}` : ""}
            </p>
          )}
          {!projectId && !loadingProject && (
            <p style={{
              margin: "6px 0 0 0",
              fontSize: 13,
              color: COLORS.muted,
              fontFamily: FONT_BODY,
            }}>
              No project selected. Open a project from the Room Designer.
            </p>
          )}
        </div>
        <DesignReviewActions projectId={projectId} />
      </div>

      {/* Four collapsible sections */}
      <div style={{
        maxWidth: 920,
        margin: "0 auto",
        padding: "20px 16px",
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