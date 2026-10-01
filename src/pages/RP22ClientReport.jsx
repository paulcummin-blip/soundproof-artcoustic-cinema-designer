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
import ReportTypographyStyles from "@/components/report/typography/ReportTypographyStyles";
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
import ClientP19RspPresentation from "@/components/report/client/ClientP19RspPresentation";
import ClientAdiDesignSummary from "@/components/report/client/ClientAdiDesignSummary";
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
import ReportStatePanel from "@/components/report/ReportStatePanel";
import BackToProposalLink from "@/components/report/BackToProposalLink";
import { readProposalContext, withProposalContext } from "@/components/report/proposalReportContext";
import { deriveReportReadiness, REPORT_STATE } from "@/components/report/reportReadinessAuthority";
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
    versionNumber,
    versionName,
  } = authority;

  // The report's canonical readiness state is derived below, once the
  // published bass authority has resolved. One state governs the whole report.

  // ── Design Summary (static intro) ──
  // Design assumptions (P15/P21) are deliberately absent from the Visual Report:
  // they are engineering caveats and remain in the Technical Report.
  const highlights = useMemo(() => selectClientDesignHighlights(), []);

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

  // Published geometry/system context for the ADI Design Summary. Read from
  // the saved project, so ADI receives the same inputs here as everywhere else.
  const reportGeometry = useMemo(() => {
    const lengthM = Number(roomDims?.lengthM) || 0;
    const seatYs = (Array.isArray(seatingPositions) ? seatingPositions : [])
      .map((seat) => Number(seat?.y ?? seat?.position?.y))
      .filter((value) => Number.isFinite(value));
    return {
      roomDims: {
        widthM: Number(roomDims?.widthM) || 0,
        lengthM,
        heightM: Number(roomDims?.heightM) || 0,
      },
      rearWallDistanceM: lengthM > 0 && seatYs.length > 0
        ? Math.max(0, lengthM - Math.max(...seatYs))
        : null,
    };
  }, [roomDims, seatingPositions]);

  const reportSystem = useMemo(() => ({
    subwooferCount: (Array.isArray(subwooferInstances) ? subwooferInstances : [])
      .filter((sub) => sub && sub.enabled !== false).length,
  }), [subwooferInstances]);

  // ── Active pages — one coherent client story ────────────────────────────
  // 1 Project overview · 2 Key performance highlights · 3 ADI Design Summary
  // 4 Dynamic Range · 5 Spatial Resolution · 6 Timbre Matching
  // 7 Practical limitations and upgrades · 8 Short About Sound Proof
  const activePages = useMemo(() => {
    const overviewPages = [];
    const dynamicPages = [];
    const spatialPages = [];
    const timbrePages = [];
    const bassPages = [];
    const closingPages = [];
    // Design Summary — always first (intro page)
    if (highlights.length > 0) {
      overviewPages.push({
        id: "design-summary",
        category: "Design Summary",
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
    // ADI Design Summary — what Artcoustic Design Intelligence contributes:
    // the project's genuine strengths, the main limiting factor and the
    // practical next actions. Immediately after the performance highlights.
    overviewPages.push({
      id: "adi-design-summary",
      category: "ADI Design Summary",
      visual: (
        <ClientAdiDesignSummary
          engineeringSummary={engineeringSummary}
          seats={seatingPositions}
          geometry={reportGeometry}
          system={reportSystem}
          projectId={projectId}
          versionId={authority.versionId || null}
        />
      ),
      printData: { type: "adi-design-summary" },
    });
    // RP23 Screen Size / Seating — project overview page
    if (screenSeating.hasAny) {
      overviewPages.push({
        id: "screen-seating",
        category: "Viewing Experience",
        visual: (
          <ClientScreenSeating
            roomDims={roomDims}
            seats={screenSeating.seats}
            rows={screenSeating.rows}
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
          rows: screenSeating.rows,
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
      spatialPages.push({
        id: "p2-system-architecture",
        category: "Spatial Resolution",
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
      spatialPages.push({
        id: "p5-spatial-resolution",
        category: "Spatial Resolution",
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
      spatialPages.push({
        id: "p7-front-wides",
        category: "Spatial Resolution",
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
      spatialPages.push({
        id: "p9-spatial-resolution",
        category: "Spatial Resolution",
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
      spatialPages.push({
        id: "best-listening-area",
        category: "Spatial Resolution",
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
      timbrePages.push({
        id: "timbre-consistency",
        category: "Timbre Matching",
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
      dynamicPages.push({
        id: "front-soundstage-dynamic-range",
        category: "Dynamic Range",
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
      dynamicPages.push({
        id: "non-screen-dynamic-range",
        category: "Dynamic Range",
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
      bassPages.push({
        id: "bass-capability",
        category: "Bass Performance",
        visual: (
          <ClientBassCapability bassPerformance={bassPerformance} />
        ),
        printData: {
          type: "bass-capability",
          bassPerformance,
        },
      });
      bassPages.push({
        id: "bass-response",
        category: "Bass Performance",
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
      // P19 — Bass Response at RSP. P19 is assessed at the reference seating
      // position only, so it is presented as a single RSP result. Seat-to-seat
      // consistency is the P20 page above; no all-seat P19 grid is ever drawn.
      bassPages.push({
        id: "p19-rsp",
        category: "Bass Performance",
        visual: (
          <ClientP19RspPresentation
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
          type: "p19-rsp",
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
      bassPages.push({
        id: "recommended-seating-position",
        category: "Spatial Resolution",
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
    // Acoustic Treatment — shown whenever treatment is enabled. The page carries
    // the ADI recommendation and the separate included quantity, so it does not
    // depend on a quantity having been accepted into pricing.
    if (appState?.acousticTreatmentEnabled) {
      const reportPriceSummary = (() => {
        const summary = typeof window !== "undefined" ? window.__ROOM_DESIGNER_PRICE__ : null;
        return summary && projectId && String(summary.projectId || "") === String(projectId)
          ? summary
          : null;
      })();
      const acousticTreatmentProps = {
        roomDims,
        seatingPositions,
        placedSpeakers,
        rsp,
        acousticTreatmentEnabled: true,
        selectedAbfuserQty: Number(appState?.selectedAbfuserQty) || 0,
        legacyAutoQuantity: Number(appState?.legacyAbfuserAutoQty) || 0,
        // Quantity consistency: the report reads the same canonical quantity the
        // priced schedule uses, and warns rather than contradicting it.
        pricedAbfuserQty: Number(appState?.selectedAbfuserQty) || 0,
        priceSummary: reportPriceSummary,
        projectId,
      };
      closingPages.push({
        id: "acoustic-treatment",
        category: "Acoustic Treatment",
        visual: <ClientAcousticTreatment {...acousticTreatmentProps} />,
        printData: {
          type: "acoustic-treatment",
          ...acousticTreatmentProps,
        },
      });
    }
    // About Sound Proof — the short brand closing section, always last.
    closingPages.push({
      id: "about-sound-proof",
      category: "About Sound Proof",
      visual: (
        <div style={{
          background: "#FFFFFF",
          borderRadius: 16,
          padding: "28px 32px",
          boxShadow: "0 2px 12px rgba(0, 0, 0, 0.06)",
          border: "1px solid #DCDBD6",
        }}>
          <AboutSoundProofReportPage variant="compact" />
        </div>
      ),
      printData: { type: "about-sound-proof" },
    });

    return [
      ...overviewPages,
      ...dynamicPages,
      ...spatialPages,
      ...timbrePages,
      ...bassPages,
      ...closingPages,
    ];
  }, [p5Snapshot, p9Snapshot, p9Overhead, bestListeningArea, timbreConsistency, frontSoundstage, nonScreenSoundstage, highlights, screenSeating, hasSeatingPosition, recommendedSeatingPosition, bassPerformance, roomDims, rsp, rspSourceLabel, screenFrontPlaneM, screenWidthM, screen, placedSpeakers, appState?.acousticTreatmentEnabled, appState?.selectedAbfuserQty, publishedRecommendations, coverageSentence, reportGeometry, reportSystem, projectId]);

  // Each category heading is printed once. The first page of a category keeps
  // its heading; continuation pages never repeat the major category heading.
  const orderedPages = useMemo(() => {
    const seen = new Set();
    return activePages.map((page) => {
      const firstOfCategory = !seen.has(page.category);
      seen.add(page.category);
      return {
        ...page,
        printData: { ...page.printData, categoryFirst: firstOfCategory },
      };
    });
  }, [activePages]);

  // ── Canonical report state ──────────────────────────────────────────────
  // One authority decides whether this report is Not Ready, Preparing, Ready
  // or Failed. PDF export is enabled only in the Ready state, and Preparing is
  // bounded: it always resolves to a definite state instead of waiting
  // indefinitely.
  const [stateSeconds, setStateSeconds] = React.useState(0);

  React.useEffect(() => {
    const interval = setInterval(() => setStateSeconds((seconds) => seconds + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const windowPriceSummary = typeof window !== "undefined" ? window.__ROOM_DESIGNER_PRICE__ : null;
  const priceSummary = windowPriceSummary
    && projectId
    && String(windowPriceSummary.projectId || "") === String(projectId)
    ? windowPriceSummary
    : null;

  // Pricing is only reported as incomplete when it genuinely is — an absent
  // price summary for this project is treated as unknown, never as a blocker.
  const pricingStatus = priceSummary
    ? (Number(priceSummary.incompletePriceCount) > 0 ? "incomplete" : "ok")
    : "unknown";

  const readinessBase = deriveReportReadiness({
    hydrating,
    roomDims,
    placedSpeakers,
    engineeringSummary,
    bassPerformance,
    pricingStatus,
    elapsedSeconds: stateSeconds,
  });

  const { exporting, error: exportError, handleExport } = useClientReportPdfExport({
    activePageCount: readinessBase.state === REPORT_STATE.READY ? activePages.length : 0,
    projectName: projectDetails?.name,
    logoUrl: LOGO_URL,
    versionNumber,
    versionName,
  });

  // A failed export resolves the report to the canonical Failed state.
  const readiness = exportError
    ? {
        state: REPORT_STATE.FAILED,
        missing: [],
        nextAction: "Retry the report, or return to the project.",
        reason: exportError,
        canExport: false,
      }
    : readinessBase;

  const reportReady = readiness.state === REPORT_STATE.READY;

  const progressItems = [
    { key: "project", label: "Project loaded", done: !hydrating && !!projectDetails },
    { key: "room", label: "Room geometry", done: Number(roomDims?.widthM) > 0 && Number(roomDims?.lengthM) > 0 },
    { key: "speakers", label: "Speaker layout", done: Array.isArray(placedSpeakers) && placedSpeakers.length > 0 },
    { key: "rp22", label: "RP22 assessment", done: !!engineeringSummary },
    {
      key: "bass",
      label: "Bass assessment",
      done: !!bassPerformance,
      running: hydrating || (!bassPerformance && !!engineeringSummary),
    },
  ];

  const handleBackToProject = () => {
    if (!projectId) return;
    navigate(`/RoomDesigner?projectId=${projectId}`);
  };

  // The Visual and Technical Reports are one pairing: moving between them must
  // not drop the proposal context, or the way back would disappear mid-report.
  const currentProposalContext = () => readProposalContext(searchParams);

  const handleTechnicalReport = () => {
    if (!projectId) return;
    navigate(withProposalContext(
      `/DesignReview?projectId=${projectId}`,
      currentProposalContext()
    ));
  };

  const handleOpenBassSimulation = () => {
    if (!projectId) return;
    navigate(`/RoomDesigner?projectId=${projectId}`);
  };

  return (
    <div className="client-report-root" style={{
      minHeight: "100vh",
      background: "#F1F0EE",
      fontFamily: "Didact Gothic, Century Gothic, sans-serif",
    }}>
      {/* Shared report typography system — the Visual Report preview and its
          PDF export both read their type from this one source. The preview
          keeps its own screen-adapted body sizes, so only the families,
          custom properties and heading roles are applied here; the exported
          PDF carries the full A4 set. */}
      <ReportTypographyStyles scope=".client-report-root" profile="a4" includeBodyRole={false} />
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
          {/* Proposal context only — absent when the report was opened from the project flow */}
          <BackToProposalLink className="client-report-screen-only" />
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
            disabled={!reportReady || activePages.length === 0 || exporting}
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
        {!projectId ? (
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
        ) : !reportReady ? (
          <div className="client-report-screen-only">
            <ReportStatePanel
              state={readiness.state}
              reportLabel="Visual Report"
              missing={readiness.missing}
              nextAction={readiness.nextAction}
              reason={readiness.reason}
              progressItems={progressItems}
              elapsedSeconds={stateSeconds}
              onReturn={handleBackToProject}
              onRetry={exportError ? handleExport : undefined}
            />
          </div>
        ) : orderedPages.length === 0 ? (
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
          orderedPages.map((page, i) => (
            <ClientReportPage
              key={page.id}
              pageId={page.id}
              isFirst={i === 0}
              isLast={i === orderedPages.length - 1}
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