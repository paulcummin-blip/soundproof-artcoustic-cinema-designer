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
import ClientP9Overhead from "@/components/report/client/ClientP9Overhead";
import { selectClientP9Overhead } from "@/components/report/client/selectClientP9Overhead";
import ClientReportPage from "@/components/report/client/ClientReportPage";
import ClientReportPrintStyles from "@/components/report/client/ClientReportPrintStyles";
import { useClientReportPdfExport } from "@/components/report/client/useClientReportPdfExport";
import { selectClientDesignHighlights } from "@/components/report/client/selectClientDesignHighlights";
import ClientDesignHighlights from "@/components/report/client/ClientDesignHighlights";
import ClientRecommendedSeatingPosition from "@/components/report/client/ClientRecommendedSeatingPosition";
import { selectClientRecommendedSeatingPosition } from "@/components/report/client/selectClientRecommendedSeatingPosition";
import ClientBestListeningArea from "@/components/report/client/ClientBestListeningArea";
import { selectClientBestListeningArea } from "@/components/report/client/selectClientBestListeningArea";
import ClientTimbreConsistency from "@/components/report/client/ClientTimbreConsistency";
import { selectClientTimbreConsistency } from "@/components/report/client/selectClientTimbreConsistency";
import ClientFrontSoundstageDynamicRange from "@/components/report/client/ClientFrontSoundstageDynamicRange";
import { selectClientFrontSoundstageDynamicRange } from "@/components/report/client/selectClientFrontSoundstageDynamicRange";
import ClientNonScreenDynamicRange from "@/components/report/client/ClientNonScreenDynamicRange";
import { selectClientNonScreenDynamicRange } from "@/components/report/client/selectClientNonScreenDynamicRange";
import ClientScreenSeating from "@/components/report/client/ClientScreenSeating";
import { selectClientScreenSeating } from "@/components/report/client/selectClientScreenSeating";
import ClientAcousticTreatment from "@/components/report/client/ClientAcousticTreatment";
import ClientRecommendationFooter from "@/components/report/client/ClientRecommendationFooter";
import { LOGO_URL } from "@/components/report/ReportCover";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText, Download } from "lucide-react";
import { useAppState } from "@/components/AppStateProvider";
import { buildRp22SeatCoverageSentence } from "@/components/utils/rp22SeatCoverageSentence";

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
  const appState = useAppState();
  // Active P12 target basis — the same authority that drives the App compliance
  // panel and the Technical Report (RP22CompliancePanel / RP22ReportParameterGrid).
  const p12Mode = appState?.p12Mode || "minimum";
  // Active P13 target basis — same authority chain (appState.splConfig.p13Mode).
  const p13Mode = appState?.splConfig?.p13Mode || "minimum";
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
    allSeatSplMetrics,
  } = authority;

  // ── Design Summary (static intro — pure selector, no analysis) ──
  const highlights = useMemo(() => selectClientDesignHighlights(), []);

  // ── RP22 seating-coverage summary sentence (shared helper) ──
  // Visual Report intentionally excludes RP22 parameters from its pages, so
  // allParametersReportable is always false → "currently assessed" wording.
  // The sentence reuses the canonical per-seat RP22 results + primary-seat
  // designation from the shared analysisResult — no recalculation.
  const realSeatIds = useMemo(
    () => (Array.isArray(seatingPositions) ? seatingPositions.map((s) => s.id).filter(Boolean) : []),
    [seatingPositions]
  );
  const coverageSentence = useMemo(
    () => buildRp22SeatCoverageSentence({
      analysisResult,
      realSeatIds,
      allParametersReportable: false,
    }),
    [analysisResult, realSeatIds]
  );

  // ── Published recommendations (from Room Designer ASDR engine) ──
  // Read from the shared window store populated by DesignRecommendationEngine.
  // The footer renders only when recommendations are settled and available.
  const [publishedRecommendations, setPublishedRecommendations] = React.useState(null);
  React.useEffect(() => {
    let cancelled = false;
    const read = () => {
      if (cancelled) return;
      const recs = typeof window !== "undefined" ? window.__ROOM_DESIGNER_ASDR__?.recommendations : null;
      if (recs && recs.isSettled !== false) {
        setPublishedRecommendations(recs);
      }
    };
    read();
    const interval = setInterval(read, 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [projectId]);

  // ── RP23 Screen Size / Seating (uses existing RP23 viewing-angle authority) ──
  const screenSeating = useMemo(() => {
    if (hydrating || !Array.isArray(seatingPositions) || !screenWidthM) {
      return { seats: [], zones: [], hasAny: false, explanation: "" };
    }
    return selectClientScreenSeating({
      seatingPositions,
      screenFrontPlaneM,
      screenWidthM,
      roomLengthM: roomDims.lengthM,
      aspectRatio: screen?.aspectRatio,
    });
  }, [hydrating, seatingPositions, screenFrontPlaneM, screenWidthM, roomDims.lengthM, screen?.aspectRatio]);

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

  // ── P9 Overhead per-seat (pure selector — reads canonical perSeatRp22) ──
  // P9 is a SEAT-scope parameter. This selector reads each seat's canonical
  // P9 result from analysisResult.perSeatRp22 — no RSP-only room-level grade.
  const p9Overhead = useMemo(() => {
    if (hydrating || !analysisResult || !Array.isArray(seatingPositions)) {
      return { seats: [], counts: {}, hasAnyValidResult: false, summary: "" };
    }
    return selectClientP9Overhead({ analysisResult, seatingPositions });
  }, [hydrating, analysisResult, seatingPositions]);

  // ── Recommended seating position (pure selector, no new analysis) ──
  const recommendedSeatingPosition = useMemo(() => {
    if (hydrating || !analysisResult || !Array.isArray(seatingPositions)) {
      return { seats: [], rsp: null, hasAny: false };
    }
    return selectClientRecommendedSeatingPosition({
      analysisResult,
      seatingPositions,
      rsp,
    });
  }, [hydrating, analysisResult, seatingPositions, rsp]);

  // ── Front Soundstage Dynamic Range (pure selector, no new analysis) ──
  // P12 is a room-scope parameter measured at the RSP. The selector reads the
  // canonical gradedParameters.primary[12] (achieved value) and re-grades the
  // level using the active p12Mode — the same authority as App / Tech Report.
  const frontSoundstage = useMemo(() => {
    if (hydrating || !allSeatSplMetrics || !Array.isArray(seatingPositions)) {
      return { seats: [], rsp: null, fl: null, fc: null, fr: null, minimum: null, level: null, hasAny: false };
    }
    return selectClientFrontSoundstageDynamicRange({
      analysisResult,
      allSeatSplMetrics,
      seatingPositions,
      rsp,
      p12Mode,
    });
  }, [hydrating, analysisResult, allSeatSplMetrics, seatingPositions, rsp, p12Mode]);

  // ── Non-Screen Dynamic Range (pure selector, no new analysis) ──
  // P13 is a room-scope parameter measured at the RSP. The selector reads the
  // canonical gradedParameters.primary[13] (achieved value) and re-grades the
  // level using the active p13Mode — the same authority as App / Tech Report.
  const nonScreenSoundstage = useMemo(() => {
    if (hydrating || !allSeatSplMetrics || !Array.isArray(seatingPositions)) {
      return { seats: [], rsp: null, speakerSplValues: [], minimum: null, level: null, hasAny: false };
    }
    return selectClientNonScreenDynamicRange({
      analysisResult,
      allSeatSplMetrics,
      seatingPositions,
      rsp,
      p13Mode,
    });
  }, [hydrating, analysisResult, allSeatSplMetrics, seatingPositions, rsp, p13Mode]);

  const hasSeatingPosition = recommendedSeatingPosition.hasAny && !!rsp;

  // ── Active pages collection — drives both screen and PDF rendering order ──
  const activePages = useMemo(() => {
    const pages = [];
    // Design Summary — always first (intro page)
    if (highlights.length > 0) {
      pages.push({
        id: "design-summary",
        visual: (
          <ClientDesignHighlights
            highlights={highlights}
            coverageSentence={coverageSentence}
            recommendationFooter={<ClientRecommendationFooter recommendations={publishedRecommendations} />}
          />
        ),
        printData: {
          type: "highlights",
          highlights,
          recommendations: publishedRecommendations,
          coverageSentence,
        },
      });
    }
    // RP23 Screen Size / Seating — after Design Summary, before RP22 pages
    if (screenSeating.hasAny) {
      pages.push({
        id: "screen-seating",
        visual: (
          <ClientScreenSeating
            roomDims={roomDims}
            seats={screenSeating.seats}
            rsp={rsp}
            screenFrontPlaneM={screenFrontPlaneM}
            screenWidthM={screenWidthM}
            zones={screenSeating.zones}
            explanation={screenSeating.explanation}
            projectorLumens={screenSeating.projectorLumens}
          />
        ),
        printData: {
          type: "screen-seating",
          roomDims,
          seats: screenSeating.seats,
          rsp,
          screenFrontPlaneM,
          screenWidthM,
          zones: screenSeating.zones,
          explanation: screenSeating.explanation,
          projectorLumens: screenSeating.projectorLumens,
        },
      });
    }
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
          <ClientP9Overhead
            roomDims={roomDims}
            seats={p9Overhead.seats}
            rsp={rsp}
            screenFrontPlaneM={screenFrontPlaneM}
            screenWidthM={screenWidthM}
            counts={p9Overhead.counts}
            summary={p9Overhead.summary}
          />
        ),
        printData: {
          type: "p9",
          p9Snapshot,
          roomDims,
          p9Overhead,
          rsp,
          screenFrontPlaneM,
          screenWidthM,
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
    // Front Soundstage Dynamic Range (after Timbre Consistency, before Design Highlights)
    if (frontSoundstage.hasAny) {
      pages.push({
        id: "front-soundstage-dynamic-range",
        visual: (
          <ClientFrontSoundstageDynamicRange
            roomDims={roomDims}
            seats={frontSoundstage.seats}
            rsp={rsp}
            screenFrontPlaneM={screenFrontPlaneM}
            screenWidthM={screenWidthM}
            screen={screen}
            placedSpeakers={placedSpeakers}
            fl={frontSoundstage.fl}
            fc={frontSoundstage.fc}
            fr={frontSoundstage.fr}
            minimum={frontSoundstage.minimum}
            level={frontSoundstage.level}
            bandLabels={frontSoundstage.bandLabels}
            targetBasisLabel={frontSoundstage.targetBasisLabel}
            resultHeading={frontSoundstage.resultHeading}
            resultExplanation={frontSoundstage.resultExplanation}
          />
        ),
        printData: {
          type: "front-soundstage-dynamic-range",
          roomDims,
          seats: frontSoundstage.seats,
          rsp,
          screenFrontPlaneM,
          screenWidthM,
          screen,
          placedSpeakers,
          fl: frontSoundstage.fl,
          fc: frontSoundstage.fc,
          fr: frontSoundstage.fr,
          minimum: frontSoundstage.minimum,
          level: frontSoundstage.level,
          bandLabels: frontSoundstage.bandLabels,
          targetBasisLabel: frontSoundstage.targetBasisLabel,
          resultHeading: frontSoundstage.resultHeading,
          resultExplanation: frontSoundstage.resultExplanation,
        },
      });
    }
    // Non-Screen Dynamic Range (after Front Soundstage, before Design Highlights)
    if (nonScreenSoundstage.hasAny) {
      pages.push({
        id: "non-screen-dynamic-range",
        visual: (
          <ClientNonScreenDynamicRange
            roomDims={roomDims}
            seats={nonScreenSoundstage.seats}
            rsp={rsp}
            screenFrontPlaneM={screenFrontPlaneM}
            screenWidthM={screenWidthM}
            placedSpeakers={placedSpeakers}
            speakerSplValues={nonScreenSoundstage.speakerSplValues}
            minimum={nonScreenSoundstage.minimum}
            level={nonScreenSoundstage.level}
            targetBasisLabel={nonScreenSoundstage.targetBasisLabel}
            resultHeading={nonScreenSoundstage.resultHeading}
            resultExplanation={nonScreenSoundstage.resultExplanation}
          />
        ),
        printData: {
          type: "non-screen-dynamic-range",
          roomDims,
          seats: nonScreenSoundstage.seats,
          rsp,
          screenFrontPlaneM,
          screenWidthM,
          placedSpeakers,
          speakerSplValues: nonScreenSoundstage.speakerSplValues,
          minimum: nonScreenSoundstage.minimum,
          level: nonScreenSoundstage.level,
          targetBasisLabel: nonScreenSoundstage.targetBasisLabel,
          resultHeading: nonScreenSoundstage.resultHeading,
          resultExplanation: nonScreenSoundstage.resultExplanation,
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
            seats={recommendedSeatingPosition.seats}
            rsp={rsp}
            screenFrontPlaneM={screenFrontPlaneM}
            screenWidthM={screenWidthM}
            screen={screen}
          />
        ),
        printData: {
          type: "seating-position",
          roomDims,
          seats: recommendedSeatingPosition.seats,
          rsp,
          rspSourceLabel,
          screenFrontPlaneM,
          screenWidthM,
          screen,
        },
      });
    }
    // Acoustic Treatment (always last — only when enabled)
    if (appState?.acousticTreatmentEnabled && Number(appState?.selectedAbfuserQty) > 0) {
      pages.push({
        id: "acoustic-treatment",
        visual: (
          <ClientAcousticTreatment
            roomDims={roomDims}
            seatingPositions={seatingPositions}
            placedSpeakers={placedSpeakers}
            rsp={rsp}
            acousticTreatmentEnabled={!!appState?.acousticTreatmentEnabled}
            selectedAbfuserQty={Number(appState?.selectedAbfuserQty) || 0}
          />
        ),
        printData: {
          type: "acoustic-treatment",
          roomDims,
          seatingPositions,
          placedSpeakers,
          rsp,
          acousticTreatmentEnabled: !!appState?.acousticTreatmentEnabled,
          selectedAbfuserQty: Number(appState?.selectedAbfuserQty) || 0,
        },
      });
    }
    return pages;
  }, [p5Snapshot, p9Snapshot, p9Overhead, bestListeningArea, timbreConsistency, frontSoundstage, nonScreenSoundstage, highlights, screenSeating, hasSeatingPosition, recommendedSeatingPosition, roomDims, rsp, rspSourceLabel, screenFrontPlaneM, screenWidthM, screen, placedSpeakers, appState?.acousticTreatmentEnabled, appState?.selectedAbfuserQty, publishedRecommendations, coverageSentence]);

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
    navigate(`/DesignReview?projectId=${projectId}`);
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