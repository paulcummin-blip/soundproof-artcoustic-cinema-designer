/**
 * RP22ClientReport
 * ----------------
 * Client-facing Visual Report — Page 1: Sound Around the Listener
 * (RP22 Parameter 5 — Spatial resolution)
 *
 * Route: /RP22ClientReport?projectId={projectId}
 *
 * Does NOT mount useRP22AnalysisEngine, useSeatResponses, or RoomVisualisation.
 * Builds one page-local, hydration-gated P5 snapshot using existing production
 * helpers only.
 */

import React, { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useActiveProjectId } from "@/components/state/project-session";
import { useClientReportAuthority } from "@/components/report/client/useClientReportAuthority";
import ClientSoundAroundListener from "@/components/report/client/ClientSoundAroundListener";
import ClientSoundAboveListener from "@/components/report/client/ClientSoundAboveListener";
import ClientReportPage from "@/components/report/client/ClientReportPage";
import ClientReportPrintStyles from "@/components/report/client/ClientReportPrintStyles";
import { useClientReportPdfExport } from "@/components/report/client/useClientReportPdfExport";
import { selectClientDesignHighlights } from "@/components/report/client/selectClientDesignHighlights";
import ClientDesignHighlights from "@/components/report/client/ClientDesignHighlights";
import ClientRecommendedSeatingPosition from "@/components/report/client/ClientRecommendedSeatingPosition";
import ClientBestListeningArea from "@/components/report/client/ClientBestListeningArea";
import { selectClientBestListeningArea } from "@/components/report/client/selectClientBestListeningArea";
import ClientTimbreConsistency from "@/components/report/client/ClientTimbreConsistency";
import { selectClientTimbreConsistency } from "@/components/report/client/selectClientTimbreConsistency";
import { LOGO_URL } from "@/components/report/ReportCover";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText, Download } from "lucide-react";

export default function RP22ClientReport() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionProjectId = useActiveProjectId();

  const projectId = useMemo(
    () =>
      searchParams.get("projectId") ||
      searchParams.get("id") ||
      sessionProjectId ||
      null,
    [searchParams, sessionProjectId]
  );

  const authority = useClientReportAuthority(projectId);
  const {
    hydrating,
    projectDetails,
    p5Snapshot,
    p9Snapshot,
    roomDims,
    screen,
    screenFrontPlaneM,
    screenWidthM,
    rsp,
    rspSourceLabel,
    seatingPositions,
    placedSpeakers,
    analysisResult,
    bassPresentation,
  } = authority;

  // ── Design highlights (pure selector, no new analysis) ──
  const highlights = useMemo(() => {
    if (hydrating || !analysisResult) return [];
    return selectClientDesignHighlights({
      analysisResult,
      bassPresentation,
      p5Snapshot,
      p9Snapshot,
      placedSpeakers,
    });
  }, [hydrating, analysisResult, bassPresentation, p5Snapshot, p9Snapshot, placedSpeakers]);

  // ── Best Listening Area (pure selector, no new analysis) ──
  const bestListeningArea = useMemo(() => {
    if (hydrating || !analysisResult || !Array.isArray(seatingPositions)) {
      return { seats: [], rsp: null, counts: {}, hasAny: false, hasPrimary: false, explanation: "" };
    }
    return selectClientBestListeningArea({
      analysisResult,
      seatingPositions,
      rsp,
    });
  }, [hydrating, analysisResult, seatingPositions, rsp]);

  // ── Timbre Consistency (pure selector, no new analysis) ──
  const timbreConsistency = useMemo(() => {
    if (hydrating || !analysisResult || !Array.isArray(seatingPositions)) {
      return { seats: [], counts: {}, hasAnyValidResult: false };
    }
    return selectClientTimbreConsistency({
      analysisResult,
      seatingPositions,
      rsp,
    });
  }, [hydrating, analysisResult, seatingPositions, rsp]);

  // ── Recommended seating position availability ──
  const hasSeatingPosition = useMemo(() => {
    if (!roomDims || !Array.isArray(seatingPositions) || seatingPositions.length === 0 || !rsp) return false;
    const x = Number(rsp.x);
    const y = Number(rsp.y);
    return Number.isFinite(x) && Number.isFinite(y);
  }, [roomDims, seatingPositions, rsp]);

  // ── Active pages collection — drives both screen and PDF rendering order ──
  const activePages = useMemo(() => {
    const pages = [];
    if (p5Snapshot) {
      pages.push({
        id: "p5-spatial-resolution",
        visual: (
          <ClientSoundAroundListener
            p5Snapshot={p5Snapshot}
            roomDims={roomDims}
            screen={screen}
            screenFrontPlaneM={screenFrontPlaneM}
          />
        ),
        printData: {
          type: "p5",
          p5Snapshot,
          roomDims,
          screen,
          screenFrontPlaneM,
        },
      });
    }
    // P9 only when an actual overhead visual exists (not the no-overhead empty-state)
    if (p9Snapshot && p9Snapshot.reason !== "no_overhead_speakers") {
      pages.push({
        id: "p9-spatial-resolution",
        visual: (
          <ClientSoundAboveListener
            p9Snapshot={p9Snapshot}
            roomDims={roomDims}
          />
        ),
        printData: {
          type: "p9",
          p9Snapshot,
          roomDims,
        },
      });
    }
    // Best Listening Area (after P9 when P9 exists, otherwise after P5;
    // before Design Highlights and Recommended Seating Position)
    if (bestListeningArea.hasAny) {
      pages.push({
        id: "best-listening-area",
        visual: (
          <ClientBestListeningArea
            roomDims={roomDims}
            seats={bestListeningArea.seats}
            rsp={bestListeningArea.rsp}
            screenFrontPlaneM={screenFrontPlaneM}
            screenWidthM={screenWidthM}
            counts={bestListeningArea.counts}
            explanation={bestListeningArea.explanation}
          />
        ),
        printData: {
          type: "best-listening-area",
          roomDims,
          seats: bestListeningArea.seats,
          rsp: bestListeningArea.rsp,
          screenFrontPlaneM,
          screenWidthM,
          counts: bestListeningArea.counts,
          explanation: bestListeningArea.explanation,
        },
      });
    }
    // Timbre Consistency (after Best Listening Area, before Design Highlights)
    if (timbreConsistency.hasAnyValidResult) {
      pages.push({
        id: "timbre-consistency",
        visual: (
          <ClientTimbreConsistency
            roomDims={roomDims}
            seats={timbreConsistency.seats}
            rsp={rsp}
            screenFrontPlaneM={screenFrontPlaneM}
            screenWidthM={screenWidthM}
            counts={timbreConsistency.counts}
          />
        ),
        printData: {
          type: "timbre-consistency",
          roomDims,
          seats: timbreConsistency.seats,
          rsp,
          screenFrontPlaneM,
          screenWidthM,
          counts: timbreConsistency.counts,
        },
      });
    }
    // Design Highlights (only when supported highlights exist)
    if (highlights.length > 0) {
      pages.push({
        id: "design-highlights",
        visual: (
          <ClientDesignHighlights highlights={highlights} />
        ),
        printData: {
          type: "highlights",
          highlights,
        },
      });
    }
    // Recommended Seating Position (only when valid geometry + seats + RSP)
    if (hasSeatingPosition) {
      pages.push({
        id: "recommended-seating-position",
        visual: (
          <ClientRecommendedSeatingPosition
            roomDims={roomDims}
            seatingPositions={seatingPositions}
            rsp={rsp}
            rspSourceLabel={rspSourceLabel}
            screenFrontPlaneM={screenFrontPlaneM}
            screenWidthM={screenWidthM}
            screen={screen}
          />
        ),
        printData: {
          type: "seating-position",
          roomDims,
          seatingPositions,
          rsp,
          rspSourceLabel,
          screenFrontPlaneM,
          screenWidthM,
          screen,
        },
      });
    }
    return pages;
  }, [p5Snapshot, p9Snapshot, bestListeningArea, timbreConsistency, highlights, hasSeatingPosition, roomDims, seatingPositions, rsp, rspSourceLabel, screenFrontPlaneM, screenWidthM, screen]);

  const { exporting, error: exportError, handleExport } = useClientReportPdfExport({
    activePageCount: activePages.length,
    projectName: projectDetails?.name,
    logoUrl: LOGO_URL,
  });

  const handleBackToProject = () => {
    if (!projectId) return;
    navigate(`/RoomDesigner?projectId=${projectId}`);
  };

  const handleTechnicalReport = () => {
    if (!projectId) return;
    navigate(`/RP22Report?projectId=${projectId}`);
  };

  return (
    <div className="client-report-root" style={{
      minHeight: "100vh",
      background: "#F1F0EE",
      fontFamily: "Didact Gothic, Century Gothic, sans-serif",
    }}>
      {/* ── Header ── */}
      <div className="client-report-screen-only" style={{
        padding: "20px 32px",
        borderBottom: "1px solid #DCDBD6",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div>
          <h1 style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 600,
            color: "#213428",
            fontFamily: "Futura PT Light, Century Gothic, sans-serif",
          }}>
            Visual Report
          </h1>
          {projectDetails && (
            <p style={{
              margin: "4px 0 0 0",
              fontSize: 13,
              color: "#625143",
            }}>
              {projectDetails.name}
              {projectDetails.client_name ? ` — ${projectDetails.client_name}` : ""}
            </p>
          )}
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <Button
            type="button"
            onClick={handleBackToProject}
            disabled={!projectId}
            style={{
              fontFamily: "Didact Gothic, Century Gothic, sans-serif",
              backgroundColor: "#F8F8F7",
              border: "1px solid #213428",
              color: "#213428",
              opacity: 1,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            <ArrowLeft className="w-4 h-4 mr-2" style={{ color: "#213428", flexShrink: 0 }} />
            Back to Project
          </Button>
          <Button
            type="button"
            onClick={handleTechnicalReport}
            disabled={!projectId}
            style={{
              fontFamily: "Didact Gothic, Century Gothic, sans-serif",
              backgroundColor: "#F1F0EE",
              border: "1px solid #625143",
              color: "#625143",
              opacity: 1,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            <FileText className="w-4 h-4 mr-2" style={{ color: "#625143", flexShrink: 0 }} />
            Technical Report
          </Button>
          <Button
            type="button"
            onClick={handleExport}
            disabled={hydrating || activePages.length === 0 || exporting}
            className="client-report-screen-only"
            style={{
              fontFamily: "Didact Gothic, Century Gothic, sans-serif",
              backgroundColor: "#213428",
              border: "1px solid #213428",
              color: "#FFFFFF",
              opacity: 1,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            <Download className="w-4 h-4 mr-2" style={{ color: "#FFFFFF", flexShrink: 0 }} />
            {exporting ? "Preparing Visual Report…" : "Download Visual Report (PDF)"}
          </Button>
        </div>
      </div>

      {/* ── Body — active pages drive both screen and print ── */}
      <div className="client-report-body" style={{
        padding: "32px",
        maxWidth: 900,
        margin: "0 auto",
      }}>
        {hydrating ? (
          <div className="client-report-screen-only" style={{
            background: "#FFFFFF",
            borderRadius: 16,
            padding: 64,
            textAlign: "center",
            color: "#625143",
            fontFamily: "Didact Gothic, Century Gothic, sans-serif",
            boxShadow: "0 2px 12px rgba(0, 0, 0, 0.06)",
            border: "1px solid #DCDBD6",
          }}>
            Preparing Visual Report…
          </div>
        ) : !projectId ? (
          <div className="client-report-screen-only" style={{
            background: "#FFFFFF",
            borderRadius: 16,
            padding: 64,
            textAlign: "center",
            color: "#625143",
            fontFamily: "Didact Gothic, Century Gothic, sans-serif",
            boxShadow: "0 2px 12px rgba(0, 0, 0, 0.06)",
            border: "1px solid #DCDBD6",
          }}>
            Open a project from the Room Designer to view its Visual Report.
          </div>
        ) : activePages.length === 0 ? (
          <div className="client-report-screen-only" style={{
            background: "#FFFFFF",
            borderRadius: 16,
            padding: 64,
            textAlign: "center",
            color: "#625143",
            fontFamily: "Didact Gothic, Century Gothic, sans-serif",
            boxShadow: "0 2px 12px rgba(0, 0, 0, 0.06)",
            border: "1px solid #DCDBD6",
          }}>
            No active report pages.
          </div>
        ) : (
          activePages.map((page, i) => (
            <ClientReportPage
              key={page.id}
              pageId={page.id}
              isFirst={i === 0}
              isLast={i === activePages.length - 1}
              projectDetails={projectDetails}
              logoUrl={LOGO_URL}
              printData={page.printData}
            >
              {page.visual}
            </ClientReportPage>
          ))
        )}
        {exportError && (
          <div className="client-report-screen-only" style={{
            marginTop: 16,
            padding: "12px 16px",
            background: "#F1F0EE",
            borderRadius: 8,
            color: "#4A230F",
            fontSize: 13,
            fontFamily: "Didact Gothic, Century Gothic, sans-serif",
            border: "1px solid #4A230F40",
          }}>
            {exportError}
          </div>
        )}
      </div>

      <ClientReportPrintStyles />
    </div>
  );
}