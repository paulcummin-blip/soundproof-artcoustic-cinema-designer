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
import ClientBassCapability from "@/components/report/client/ClientBassCapability";
import ClientBassResponse from "@/components/report/client/ClientBassResponse";
import ClientP19HeatMap from "@/components/report/client/ClientP19HeatMap";
import { selectClientBassPerformance } from "@/components/report/client/selectClientBassPerformance";
import ClientP2SystemArchitecture from "@/components/report/client/ClientP2SystemArchitecture";
import { selectClientP2SystemArchitecture } from "@/components/report/client/selectClientP2SystemArchitecture";
import ClientP7FrontWides from "@/components/report/client/ClientP7FrontWides";
import { selectClientP7FrontWides } from "@/components/report/client/selectClientP7FrontWides";
import ClientRecommendationFooter from "@/components/report/client/ClientRecommendationFooter";
import AboutSoundProofReportPage from "@/components/report/AboutSoundProofReportPage";
import { LOGO_URL } from "@/components/report/ReportCover";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText, Download } from "lucide-react";
import ReportDependencyChecker from "@/components/report/ReportDependencyChecker";
import { useAppState } from "@/components/AppStateProvider";
import { resolveSeatPriority } from "@/components/utils/seatPriorityAuthority";
import { isAssessedLevel } from "@/components/report/client/visualReportSeatStyle";

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
  const engineeringSummary = authority.engineeringSummary || null;
  const p19SeatAuthority = engineeringSummary?.p19SeatAuthority || null;
  const appState = useAppState();
  const p12Mode = engineeringSummary?.roomResultsByParameter?.[12]?.targetBasis || "minimum";
  const p13Mode = engineeringSummary?.roomResultsByParameter?.[13]?.targetBasis || "minimum";
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
    subwooferInstances,
    analysisResult,
    allSeatSplMetrics,
  } = authority;

  // A report is ready only when the one canonical publication is available.
  // No secondary bass-store lifecycle may override or reinterpret it.
  const reportPending = hydrating || !engineeringSummary;

  // ── Design Summary (static intro + canonical design assumptions) ──
  const highlights = useMemo(() => selectClientDesignHighlights(), []);
  const designAssumptions = useMemo(() => {
    const roomResults = engineeringSummary?.roomResultsByParameter || {};
    const p15 = roomResults?.[15] || {};
    const p21 = roomResults?.[21] || {};
    return {
      p15: {
        label: "Background Noise Floor",
        status: p15.status === "measured" ? "Measured" : "Assumed",
        level: p15.level || "L2",
        detail: p15.status === "measured" ? (p15.formatted || "Measured result") : "Design target: NCB 22",
      },
      p21: {
        label: "Early Reflections",
        status: p21.status === "measured" ? "Measured" : "Assumed",
        level: p21.level || "L2",
        detail: p21.status === "measured" ? (p21.formatted || "Measured result") : "Early reflections have not been measured.",
      },
    };
  }, [engineeringSummary]);

  // PASSIVE CONSUMER: the Visual Report reads the exact coverage result
  // published by the Room Designer's canonical engineering summary.
  const coverageResult = engineeringSummary?.project?.coverage || null;
  const coverageSentence = coverageResult?.statement || null;

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
    if (hydrating || !engineeringSummary || !Array.isArray(seatingPositions) || !screenWidthM) {
      return { seats: [], zones: [], hasAny: false, explanation: "" };
    }
    return selectClientScreenSeating({
      seatingPositions,
      screenFrontPlaneM,
      screenWidthM,
      aspectRatio: screen?.aspectRatio,
      engineeringSummary,
    });
  }, [hydrating, engineeringSummary, seatingPositions, screenFrontPlaneM, screenWidthM, screen?.aspectRatio]);

  // ── Best Listening Area — passive read from the canonical summary ──
  const bestListeningArea = useMemo(() => {
    if (hydrating || !engineeringSummary || !Array.isArray(seatingPositions)) {
      return { seats: [], rsp: null, counts: {}, hasAny: false, hasPrimary: false, explanation: "" };
    }
    return selectClientBestListeningArea({
      engineeringSummary,
      seatingPositions,
      rsp,
    });
  }, [hydrating, engineeringSummary, seatingPositions, rsp]);

  // ── Timbre Consistency — passive read from the canonical summary ──
  const timbreConsistency = useMemo(() => {
    if (hydrating || !engineeringSummary || !Array.isArray(seatingPositions)) {
      return { seats: [], counts: {}, hasAnyValidResult: false };
    }
    return selectClientTimbreConsistency({
      engineeringSummary,
      seatingPositions,
    });
  }, [hydrating, engineeringSummary, seatingPositions]);

  // ── P9 Overhead — passive read from the canonical summary ──
  const p9Overhead = useMemo(() => {
    if (hydrating || !engineeringSummary || !Array.isArray(seatingPositions)) {
      return { seats: [], counts: {}, hasAnyValidResult: false, summary: "" };
    }
    return selectClientP9Overhead({ engineeringSummary, seatingPositions });
  }, [hydrating, engineeringSummary, seatingPositions]);

  // ── P2 System Architecture — passive read from the canonical summary ──
  const p2SystemArchitecture = useMemo(() => {
    if (hydrating || !engineeringSummary || !Array.isArray(placedSpeakers)) return null;
    return selectClientP2SystemArchitecture(engineeringSummary, placedSpeakers, subwooferInstances);
  }, [hydrating, engineeringSummary, placedSpeakers, subwooferInstances]);

  // ── P7 Front Wides — passive read from the canonical summary ──
  const p7FrontWides = useMemo(() => {
    if (hydrating || !engineeringSummary || !Array.isArray(placedSpeakers) || !rsp) return null;
    return selectClientP7FrontWides(engineeringSummary, placedSpeakers, rsp);
  }, [hydrating, engineeringSummary, placedSpeakers, rsp]);

  // ── Recommended seating position — passive P1 authority read ──
  const recommendedSeatingPosition = useMemo(() => {
    if (hydrating || !engineeringSummary || !Array.isArray(seatingPositions)) {
      return { seats: [], rsp: null, hasAny: false };
    }
    return selectClientRecommendedSeatingPosition({
      engineeringSummary,
      seatingPositions,
      rsp,
    });
  }, [hydrating, engineeringSummary, seatingPositions, rsp]);

  // P12 presentation reads the published value and published level directly.
  const frontSoundstage = useMemo(() => {
    if (hydrating || !engineeringSummary || !Array.isArray(seatingPositions)) {
      return { seats: [], rsp: null, fl: null, fc: null, fr: null, minimum: null, level: null, hasAny: false };
    }
    return selectClientFrontSoundstageDynamicRange({
      analysisResult,
      engineeringSummary,
      allSeatSplMetrics,
      seatingPositions,
      rsp,
      p12Mode,
    });
  }, [hydrating, analysisResult, engineeringSummary, allSeatSplMetrics, seatingPositions, rsp, p12Mode]);

  // P13 presentation reads the published value and published level directly.
  const nonScreenSoundstage = useMemo(() => {
    if (hydrating || !engineeringSummary || !Array.isArray(seatingPositions)) {
      return { seats: [], rsp: null, speakerSplValues: [], minimum: null, level: null, hasAny: false };
    }
    return selectClientNonScreenDynamicRange({
      analysisResult,
      engineeringSummary,
      allSeatSplMetrics,
      seatingPositions,
      rsp,
      p13Mode,
    });
  }, [hydrating, analysisResult, engineeringSummary, allSeatSplMetrics, seatingPositions, rsp, p13Mode]);

  const hasSeatingPosition = recommendedSeatingPosition.hasAny && !!rsp;

  // ── Bass Performance (P14/P18/P19/P20) — current applied design ──
  // Passive read from the canonical summary. The Visual Report never reads raw
  // contract grades, so P19/P20 cannot diverge from the app or other reports.
  const bassPerformance = useMemo(() => {
    if (hydrating || !engineeringSummary) return null;
    return selectClientBassPerformance(engineeringSummary, seatingPositions);
  }, [hydrating, engineeringSummary, seatingPositions]);

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
            assumptions={designAssumptions}
            recommendationFooter={<ClientRecommendationFooter recommendations={publishedRecommendations} />}
          />
        ),
        printData: {
          type: "highlights",
          highlights,
          recommendations: publishedRecommendations,
          coverageSentence,
          assumptions: designAssumptions,
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
    // P2 System Architecture — after Viewing Experience, before P5
    if (p2SystemArchitecture) {
      pages.push({
        id: "p2-system-architecture",
        visual: (
          <ClientP2SystemArchitecture
            p2Data={p2SystemArchitecture}
            roomDims={roomDims}
            seatingPositions={seatingPositions}
            rsp={rsp}
            screenFrontPlaneM={screenFrontPlaneM}
            screenWidthM={screenWidthM}
            placedSpeakers={placedSpeakers}
            subwooferInstances={subwooferInstances}
          />
        ),
        printData: {
          type: "p2-system-architecture",
          p2Data: p2SystemArchitecture,
          roomDims,
          seatingPositions,
          rsp,
          screenFrontPlaneM,
          screenWidthM,
          placedSpeakers,
          subwooferInstances,
        },
      });
    }
    if (p5Snapshot && isAssessedLevel(p5Snapshot.level)) {
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
    // P7 Front Wides — only when front wides are present
    if (p7FrontWides) {
      pages.push({
        id: "p7-front-wides",
        visual: (
          <ClientP7FrontWides
            p7Data={p7FrontWides}
            roomDims={roomDims}
            screenFrontPlaneM={screenFrontPlaneM}
            screenWidthM={screenWidthM}
          />
        ),
        printData: {
          type: "p7-front-wides",
          p7Data: p7FrontWides,
          roomDims,
          screenFrontPlaneM,
          screenWidthM,
        },
      });
    }
    // P9 only when at least one seat has a genuine assessed result (L1-L4 or FAIL).
    // Excludes N/A / Not assessed / Not calculated (e.g. single overhead row).
    if (p9Overhead.hasAnyValidResult) {
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
            placedSpeakers={placedSpeakers}
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
    // Best Listening Area — only when at least one seat has a genuine assessed result
    if (bestListeningArea.hasAnyValidResult) {
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
    // Bass Performance — two adjacent pages:
    //   Page 1: P14/P18 — Output Capability and Low-Frequency Extension
    //   Page 2: P19/P20 — Response Quality and Seat Consistency
    // Both consume the same canonical bass authority. Only included when at
    // least one genuine assessed bass result exists.
    if (bassPerformance) {
      pages.push({
        id: "bass-capability",
        visual: (
          <ClientBassCapability bassPerformance={bassPerformance} />
        ),
        printData: {
          type: "bass-capability",
          bassPerformance,
        },
      });
      pages.push({
        id: "bass-response",
        visual: (
          <ClientBassResponse
            bassPerformance={bassPerformance}
            roomDims={roomDims}
            seatingPositions={seatingPositions}
            rsp={rsp}
            screenFrontPlaneM={screenFrontPlaneM}
            screenWidthM={screenWidthM}
          />
        ),
        printData: {
          type: "bass-response",
          bassPerformance,
          roomDims,
          seatingPositions,
          rsp,
          screenFrontPlaneM,
          screenWidthM,
        },
      });
      // P19 Heat Map — dedicated spatial response-quality page
      pages.push({
        id: "p19-heatmap",
        visual: (
          <ClientP19HeatMap
            bassPerformance={bassPerformance}
            roomDims={roomDims}
            seatingPositions={seatingPositions}
            rsp={rsp}
            screenFrontPlaneM={screenFrontPlaneM}
            screenWidthM={screenWidthM}
            subwooferInstances={subwooferInstances}
          />
        ),
        printData: {
          type: "p19-heatmap",
          bassPerformance,
          roomDims,
          seatingPositions,
          rsp,
          screenFrontPlaneM,
          screenWidthM,
          subwooferInstances,
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
    // Acoustic Treatment (only when enabled)
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
    // About Sound Proof — always the final page (fixed brand closing page)
    pages.push({
      id: "about-sound-proof",
      visual: (
        <div style={{
          background: "#FFFFFF",
          borderRadius: 16,
          padding: "48px 40px",
          minHeight: 400,
          boxShadow: "0 2px 12px rgba(0, 0, 0, 0.06)",
          border: "1px solid #DCDBD6",
        }}>
          <AboutSoundProofReportPage />
        </div>
      ),
      printData: { type: "about-sound-proof" },
    });
    return pages;
  }, [p5Snapshot, p9Snapshot, p9Overhead, bestListeningArea, timbreConsistency, frontSoundstage, nonScreenSoundstage, highlights, designAssumptions, screenSeating, hasSeatingPosition, recommendedSeatingPosition, bassPerformance, roomDims, rsp, rspSourceLabel, screenFrontPlaneM, screenWidthM, screen, placedSpeakers, appState?.acousticTreatmentEnabled, appState?.selectedAbfuserQty, publishedRecommendations, coverageSentence]);

  const { exporting, error: exportError, handleExport } = useClientReportPdfExport({
    activePageCount: showDependencyChecker ? 0 : activePages.length,
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

  const handleOpenBassSimulation = () => {
    if (!projectId) return;
    navigate(`/RoomDesigner?projectId=${projectId}`);
  };

  // The report requires bass simulation to be complete. When bass has never
  // been calculated (or is actively running), the dependency checker explains
  // exactly what is missing instead of showing a generic loading message.
  const bassMissing = !hydrating && !!engineeringSummary && !bassPerformance;
  const showDependencyChecker = reportPending || bassMissing;

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
            disabled={showDependencyChecker || activePages.length === 0 || exporting}
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
        {showDependencyChecker ? (
          <div className="client-report-screen-only">
            <ReportDependencyChecker
              projectId={projectId}
              hydrating={hydrating}
              projectDetails={projectDetails}
              roomDims={roomDims}
              placedSpeakers={placedSpeakers}
              engineeringSummary={engineeringSummary}
              bassPerformance={bassPerformance}
              onOpenBassSimulation={handleOpenBassSimulation}
            />
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