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
import { useClientReportAuthority } from "@/components/report/client/useClientReportAuthority";
import { selectClientP9Overhead } from "@/components/report/client/selectClientP9Overhead";
import { selectClientP5SeatResults } from "@/components/report/client/selectClientP5SeatResults";
import ClientReportPage from "@/components/report/client/ClientReportPage";
import ClientReportPrintStyles from "@/components/report/client/ClientReportPrintStyles";
import ReportTypographyStyles from "@/components/report/typography/ReportTypographyStyles";
import { useClientReportPdfExport } from "@/components/report/client/useClientReportPdfExport";
import {
  readReportActionIntent,
  useReportActionIntent,
} from "@/components/report/reportActionIntent";
import useReportFilenameIdentity from '@/components/report/useReportFilenameIdentity';
import { selectClientDesignHighlights } from "@/components/report/client/selectClientDesignHighlights";
import { selectClientRecommendedSeatingPosition } from "@/components/report/client/selectClientRecommendedSeatingPosition";
import { selectClientBestListeningArea } from "@/components/report/client/selectClientBestListeningArea";
import { selectClientTimbreConsistency } from "@/components/report/client/selectClientTimbreConsistency";
import { selectClientFrontSoundstageDynamicRange } from "@/components/report/client/selectClientFrontSoundstageDynamicRange";
import { selectClientNonScreenDynamicRange } from "@/components/report/client/selectClientNonScreenDynamicRange";
import { selectClientScreenSeating } from "@/components/report/client/selectClientScreenSeating";
import { buildP19RspGraph } from "@/components/report/technical/bassResponseGraphAuthority";
import { useCompletedBassAuthority } from "@/components/room/bass/completedBassResultStore";
import { selectClientBassPerformance } from "@/components/report/client/selectClientBassPerformance";
import { selectClientP2SystemArchitecture } from "@/components/report/client/selectClientP2SystemArchitecture";
import { selectClientPerSeatPerformance } from "@/components/report/client/selectClientPerSeatPerformance";
import { selectClientP7FrontWides } from "@/components/report/client/selectClientP7FrontWides";
import TechnicalReportDocument from "@/components/report/technical/TechnicalReportDocument";
import { LOGO_URL } from "@/components/report/ReportCover";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText, Download } from "lucide-react";
import ReportStatePanel from "@/components/report/ReportStatePanel";
import { buildReportGateDiagnostics } from "@/components/report/reportGateDiagnostics";
import BackToProposalLink from "@/components/report/BackToProposalLink";
import { readProposalContext } from "@/components/report/proposalReportContext";
import BackToProjectLibraryLink from "@/components/report/BackToProjectLibraryLink";
import {
  buildReportPairingUrl,
  readLibraryContext,
  REPORT_ROUTE,
} from "@/components/report/reportLibraryContext";
import { readRequestedVersionId } from "@/components/report/reportVersionRequest";
import { deriveReportReadiness, REPORT_STATE } from "@/components/report/reportReadinessAuthority";
import { useReportSnapshot } from "@/components/report/useReportSnapshot";
import ReportSnapshotBanner from "@/components/report/ReportSnapshotBanner";
import ReportGateDiagnosticsPanel from "@/components/report/ReportGateDiagnosticsPanel";
import {
  REPORT_SNAPSHOT_STATUS,
  buildSnapshotPayload,
  currentSourceFingerprints,
} from "@/components/report/reportSnapshotAuthority";
import { useProjectReportPages } from "@/components/report/projectReport/useProjectReportPages";
import {
  PROJECT_REPORT_TITLE,
  PROJECT_REPORT_SNAPSHOT_TYPE,
  PROJECT_REPORT_DOCUMENT_TYPE,
} from "@/components/report/projectReport/projectReportIdentity";
import { buildProductsSelected } from "@/components/report/reportProductsSelected";
import { reportDateLabel } from "@/components/report/reportFirstPageMeta";

export default function RP22ClientReport() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const projectId = useMemo(
    () =>
      searchParams.get("projectId") ||
      searchParams.get("id") ||
      null,
    [searchParams]
  );

  // The version this report was opened FOR. The Project Library's report row
  // passes it explicitly; a page opened without one states the project's active
  // version. The loaded Room Designer version is never consulted — that is what
  // opened the wrong version's report.
  const requestedVersionId = useMemo(() => readRequestedVersionId(searchParams), [searchParams]);

  const authority = useClientReportAuthority(projectId, requestedVersionId);
  // The P19 evidence graph reads the same saved completed bass contract the
  // Room Designer and the Technical Report read. Nothing is recalculated, and
  // when the saved post-EQ RSP curve and target are unavailable the P19 page
  // states that plainly instead of drawing an unrelated curve.
  const completedBassAuthority = useCompletedBassAuthority(projectId || "free", authority.versionId || "free");
  const engineeringSummary = authority.engineeringSummary || null;
  const p19SeatAuthority = engineeringSummary?.p19SeatAuthority || null;
  const appState = authority.reportApp;
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

  // ── P19 evidence graph ──
  // The corrected (post-EQ) response at the RSP against the target, built from
  // the saved completed bass contract through the shared P19 graph authority —
  // the same evidence the Technical Report's P19 page draws.
  const p19Graph = useMemo(() => buildP19RspGraph({
    contract: completedBassAuthority?.contract || null,
    authoritative: completedBassAuthority?.authoritative === true,
    roomDims,
  }), [completedBassAuthority?.contract, completedBassAuthority?.authoritative, roomDims]);

  // ── Design Summary (static intro) ──
  // Design assumptions (P15/P21) are deliberately absent from the Visual Report:
  // they are engineering caveats and remain in the Technical Report.
  const highlights = useMemo(() => selectClientDesignHighlights(), []);

  // PASSIVE CONSUMER: the Visual Report reads the exact coverage result
  // published by the Room Designer's canonical engineering summary.
  const coverageResult = engineeringSummary?.project?.coverage || null;
  const coverageSentence = coverageResult?.statement || null;

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

  // ── P5 seat results — P5 is assessed at every seating position, so the
  // RSP-centred drawing is paired with the published per-seat result map.
  const p5SeatResults = useMemo(() => {
    if (hydrating || !engineeringSummary || !Array.isArray(seatingPositions)) return null;
    return selectClientP5SeatResults({ engineeringSummary, seatingPositions });
  }, [hydrating, engineeringSummary, seatingPositions]);

  // ── P2 System Architecture — passive read from the canonical summary ──
  const p2SystemArchitecture = useMemo(() => {
    if (hydrating || !engineeringSummary || !Array.isArray(placedSpeakers)) return null;
    return selectClientP2SystemArchitecture(engineeringSummary, placedSpeakers, subwooferInstances);
  }, [hydrating, engineeringSummary, placedSpeakers, subwooferInstances]);

  // ── P7 Front Wides — passive read from the canonical summary ──
  const p7FrontWides = useMemo(() => {
    if (hydrating || !engineeringSummary || !Array.isArray(placedSpeakers) || !rsp) return null;
    return selectClientP7FrontWides(engineeringSummary, placedSpeakers, rsp, analysisResult, roomDims);
  }, [hydrating, engineeringSummary, placedSpeakers, rsp, analysisResult, roomDims]);

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

  // ── Per-Seat Performance — the seat pop-up, laid out as the seating plan ──
  // One compact card per assessed seat, carrying the published RP22/RP23 levels
  // read through the pop-up's own presenters. P19 is deliberately absent: it is
  // assessed at the reference seating position only, never seat by seat.
  const perSeatPerformance = useMemo(() => {
    if (hydrating || !engineeringSummary || !Array.isArray(seatingPositions)) {
      return { hasAny: false, rows: [] };
    }
    return selectClientPerSeatPerformance({
      engineeringSummary,
      seatingPositions,
      bassPerformance,
      rsp,
    });
  }, [hydrating, engineeringSummary, seatingPositions, bassPerformance, rsp]);

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

  // The document's closing About Sound Proof page is the Technical Report's own,
  // mounted with the Technical pages below: the consolidated report states About
  // Sound Proof exactly once.

  // The page list is the consolidated document: the two front pages, then the
  // Visual Report's own pages in their existing order. The Technical Report's
  // pages follow them, mounted by this page — see the render below. No competing
  // page order or heading logic exists here.

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

  const derivedReadiness = deriveReportReadiness({
    hydrating,
    roomDims,
    placedSpeakers,
    engineeringSummary,
    bassPerformance,
    assessment: { reportComplete:authority.reportComplete, status:authority.publicationGate?.status,
      reason:authority.reportCompleteness?.reason, missing:authority.publicationGate?.missing },
    pricingStatus,
    elapsedSeconds: stateSeconds,
  });
  // ── THE TWO NOT-READY STATES ARE DISTINCT ────────────────────────────────
  // An incomplete assessment and a stale publication are different problems and
  // must never be labelled as each other. Staleness is the authority's own
  // determination — the saved publication exists but its bass fingerprint no
  // longer matches the current version. Incompleteness is the real absence of
  // assessment items. Each state states its own body, label and action, so the
  // card can never describe two different problems at once.
  const incompleteAssessmentKeys = [...new Set([
    ...(authority.reportCompleteness?.missingParameterKeys || []),
    ...(authority.reportCompleteness?.incompleteSeatParameterKeys || []),
  ])];
  const gateStatus = authority.publicationGate?.status || null;
  // The assessment itself is genuinely incomplete: items are missing, or the
  // authority says the assessment is not there at all.
  const assessmentIncomplete = incompleteAssessmentKeys.length > 0
    || gateStatus === "assessment_incomplete"
    || gateStatus === "assessment_missing";
  // A stale publication: stated by the gate pointer, or by the authority's own
  // stale-publication reason.
  const publicationStale = gateStatus === "stale_pointer"
    || authority.reportCompleteness?.bassAuthorityOutOfDate === true
    || /publication is stale/i.test(authority.reportCompleteness?.reason || "");

  const STALE_PUBLICATION_BODY = "The saved engineering publication is stale. The bass fingerprint no longer matches the current version.";
  const INCOMPLETE_ASSESSMENT_BODY = "The current assessment is incomplete. Complete the missing items before creating the Project Report.";
  const PUBLISH_CURRENT_ASSESSMENT_ACTION = "Update the Project Report to publish the current assessment and refresh the report evidence.";
  const COMPLETE_ASSESSMENT_ACTION = "Complete the missing assessment items in Room Designer, then create the Project Report.";

  const readinessBase = assessmentIncomplete
    ? {
        ...derivedReadiness,
        state: REPORT_STATE.NOT_READY,
        missing: [
          { key: "engineering_assessment", label: "Saved assessment incomplete" },
          ...incompleteAssessmentKeys.map((key) => ({
            key,
            label: key.toUpperCase(),
            action: "Complete this parameter in Room Designer.",
          })),
        ],
        nextAction: COMPLETE_ASSESSMENT_ACTION,
        reason: INCOMPLETE_ASSESSMENT_BODY,
        canExport: false,
      }
    : publicationStale
      ? {
          ...derivedReadiness,
          state: REPORT_STATE.NOT_READY,
          // A complete assessment needs saving, not repairing: the missing item is
          // the stale publication itself, and the body already says why.
          missing: [{ key: "engineering_publication", label: "Saved publication stale" }],
          nextAction: PUBLISH_CURRENT_ASSESSMENT_ACTION,
          reason: STALE_PUBLICATION_BODY,
          canExport: false,
        }
      : derivedReadiness;

  // The design version this report belongs to. One object states it on the
  // first page and in the exported filename, so the two can never disagree.
  const reportVersion = useMemo(
    () => ({ number: versionNumber, name: versionName }),
    [versionNumber, versionName]
  );

  // The report's own date — the project's report date, read from the same shared
  // builder the first-page meta line uses, so the cover's Date row and the
  // masthead can never disagree, and neither moves when the report is reopened.
  const reportOnDate = useMemo(() => reportDateLabel(projectDetails), [projectDetails]);

  // ── Systems / Products Selected — the equipment schedule ────────────────
  // The report's own canonical product derivation (the same rows the Technical
  // Report and the frozen Engineering Snapshot state), so the consolidated
  // report cannot name a different package from the one the design was specified
  // and priced from.
  const productsSelected = useMemo(
    () => buildProductsSelected({
      placedSpeakers,
      frontSubsCfg: appState?.frontSubsCfg,
      rearSubsCfg: appState?.rearSubsCfg,
      subwooferInstances,
      acousticTreatmentEnabled: appState?.acousticTreatmentEnabled === true,
      selectedAbfuserQty: Number(appState?.selectedAbfuserQty) || 0,
      isVisible: appState?.getSpeakerVisibility,
    }),
    [
      placedSpeakers,
      appState?.frontSubsCfg,
      appState?.rearSubsCfg,
      subwooferInstances,
      appState?.acousticTreatmentEnabled,
      appState?.selectedAbfuserQty,
      appState?.getSpeakerVisibility,
    ]
  );

  // ── The Project Report's composition ────────────────────────────────────
  // The page CONTENT is assembled by the report's own composition hook; the
  // composition authority (projectReportRegistry) owns the document — the section
  // order, each page's heading and continuation state, and the P1–P21 inclusion
  // rule. No competing page order or heading logic exists here.
  const orderedPages = useProjectReportPages({
    hydrating,
    engineeringSummary,
    projectDetails,
    reportVersion,
    reportOnDate,
    productsSelected,
    p5Snapshot,
    p5SeatResults,
    p9Snapshot,
    p9Overhead,
    bestListeningArea,
    timbreConsistency,
    frontSoundstage,
    nonScreenSoundstage,
    highlights,
    screenSeating,
    p2SystemArchitecture,
    p7FrontWides,
    hasSeatingPosition,
    recommendedSeatingPosition,
    bassPerformance,
    perSeatPerformance,
    roomDims,
    screen,
    screenFrontPlaneM,
    screenWidthM,
    rsp,
    rspSourceLabel,
    seatingPositions,
    placedSpeakers,
    subwooferInstances,
    p19Graph,
    coverageSentence,
    reportGeometry,
    reportSystem,
    appState,
    projectId,
    versionId: authority.versionId || null,
  });

  const filenameIdentity = useReportFilenameIdentity(projectDetails);
  const { exporting, error: exportError, handleExport } = useClientReportPdfExport({
    activePageCount: readinessBase.state === REPORT_STATE.READY && filenameIdentity.ready ? orderedPages.length : 0,
    projectName: projectDetails?.name,
    logoUrl: LOGO_URL,
    versionNumber,
    versionName,
    // The exported filename names every populated project identity field —
    // dealer, project name, client name and reference — so the file identifies
    // itself out of context.
    dealerName: filenameIdentity.dealerName,
    clientName: filenameIdentity.clientName,
    projectReference: filenameIdentity.projectReference,
    // Exporting this report also stores the issued PDF in the project library.
    // The source identity is resolved at export time, in the background.
    issuedDocument: {
      projectId,
      accountId: projectDetails?.account_id || null,
      documentType: PROJECT_REPORT_DOCUMENT_TYPE,
      title: PROJECT_REPORT_TITLE,
      resolveSource: () => ({
        versionId: authority.versionId || null,
        selectedVersionIds: authority.versionId ? [authority.versionId] : [],
        sourceRecordId: reportSnapshot.saved?.id || null,
        sourceFingerprints: snapshotFingerprints,
        sourceStatusAtExport: reportSnapshot.status === REPORT_SNAPSHOT_STATUS.STALE
          ? 'source_changed'
          : 'current',
      }),
    },
  });

  // A failed export resolves the report to the canonical Failed state.
  const authorityReadFailed = authority.readFailed || authority.bassRestoreFailed;
  const readiness = authorityReadFailed
    ? {
        state: REPORT_STATE.FAILED,
        missing: [],
        nextAction: "Retry the saved engineering read, or return to the project.",
        reason: authority.readError || "Saved engineering authority could not be read. Nothing has been treated as missing or uncalculated.",
        canExport: false,
      }
    : exportError
      ? {
          state: REPORT_STATE.FAILED,
          missing: [],
          nextAction: "Retry the report, or return to the project.",
          reason: exportError,
          canExport: false,
        }
      : readinessBase;

  const reportReady = readiness.state === REPORT_STATE.READY;

  // ── Saved report snapshot (Visual Report) ────────────────────────────────
  // Once this report is generated it is saved against the project version. A
  // later design change marks it as generated before the latest changes instead
  // of blanking it, and Regenerate overwrites that saved report in place.
  const snapshotFingerprints = useMemo(
    () =>
      currentSourceFingerprints({
        authoritySnapshot: authority.authoritySnapshot,
        engineeringSummary,
        // Final report identity follows the publication's frozen seating priorities.
      }),
    [authority.authoritySnapshot, engineeringSummary, projectId]
  );

  const snapshotPayload = useMemo(
    () =>
      buildSnapshotPayload({
        engineeringFingerprint: authority.authoritySnapshot?.engineeringFingerprint || null,
        presentation: {
          showAsdr: authority.authoritySnapshot?.showAsdr,
          priceData: authority.authoritySnapshot?.priceData || null,
          seatingPositions,
          placedSpeakers,
          subwooferInstances,
          dolbyLayout: authority.authoritySnapshot?.dolbyLayout || null,
        },
        pages: orderedPages,
      }),
    [authority.authoritySnapshot, seatingPositions, placedSpeakers, subwooferInstances, orderedPages]
  );

  const reportSnapshot = useReportSnapshot({
    projectId,
    versionId: authority.versionId,
    accountId: projectDetails?.account_id || null,
    reportType: PROJECT_REPORT_SNAPSHOT_TYPE,
    currentFingerprints: snapshotFingerprints,
    payload: snapshotPayload,
    reportSource: { project: projectDetails, engineeringSummary, app: appState,
      presentation: { seatingPositions, placedSpeakers, priceData: authority.authoritySnapshot?.priceData } },
    ready: reportReady && orderedPages.length > 0,
  });

  // ── Report actions requested by the link that opened this report ──────────
  // The Project Library's rows ask for one of these: ?autoPrint=1 exports this
  // report's PDF, ?updateReport=1 creates an updated report from the design as it
  // stands. Both run through THIS report's own handlers — the same ones its own
  // buttons call — and neither changes the saved report's status.
  const reportIntent = readReportActionIntent(searchParams);
  useReportActionIntent({
    requested: reportIntent.exportPdf,
    ready: reportReady && filenameIdentity.ready && orderedPages.length > 0 && !exporting,
    onRun: handleExport,
  });
  useReportActionIntent({
    requested: reportIntent.updateReport,
    ready: reportReady
      && reportSnapshot.status === REPORT_SNAPSHOT_STATUS.STALE
      && !reportSnapshot.saving,
    onRun: reportSnapshot.regenerate,
  });

  // The gate's own account of this report: which authority exists, whether it is
  // complete, what is missing, and whether the saved report still matches.
  const gateDiagnostics = buildReportGateDiagnostics({
    projectId,
    versionId: authority.versionId,
    reportType: PROJECT_REPORT_SNAPSHOT_TYPE,
    hasSavedEngineeringAuthority: !!engineeringSummary,
    hasCompleteEngineeringSnapshot: authority.reportComplete === true,
    hasReportSnapshot: !!reportSnapshot.saved,
    missingParameters: authority.reportCompleteness?.missingParameterKeys,
    incompleteSeatParameters: authority.reportCompleteness?.incompleteSeatParameterKeys,
    sourceFingerprint: snapshotFingerprints?.engineeringFingerprint ?? null,
    savedFingerprint: reportSnapshot.saved?.source_fingerprints?.engineeringFingerprint ?? null,
    snapshotStatus: reportSnapshot.status,
    gateResult: readiness.state,
    blockReason: readiness.reason || authority.reportCompleteness?.reason || null,
  });

  const progressItems = [
    { key: "project", label: "Project loaded", done: !hydrating && !!projectDetails },
    { key: "room", label: "Room geometry", done: Number(roomDims?.widthM) > 0 && Number(roomDims?.lengthM) > 0 },
    { key: "speakers", label: "Speaker layout", done: Array.isArray(placedSpeakers) && placedSpeakers.length > 0 },
    { key: "rp22", label: "RP22 assessment", done: authority.reportComplete === true },
    {
      key: "bass",
      label: "Bass assessment",
      done: authority.reportComplete === true && !!bassPerformance,
      running: hydrating || (!bassPerformance && !!engineeringSummary),
    },
  ];

  const handleBackToProject = () => {
    if (!projectId) return;
    navigate(`/RoomDesigner?projectId=${projectId}`);
  };

  // The one action flow for both not-ready states: the Room Designer, for THIS
  // version, is where a stale publication is refreshed and where an incomplete
  // assessment is completed. Opening it refreshes the publication; the Project
  // Report can then be generated, or refreshed by its own Update action. No
  // second publication path is created here.
  const handleUpdateProjectReport = () => {
    if (!projectId) return;
    const targetVersion = authority.versionId || requestedVersionId || null;
    navigate(`/RoomDesigner?projectId=${projectId}${targetVersion ? `&versionId=${targetVersion}` : ""}`);
  };

  // The Visual and Technical Reports are one pairing: moving between them must
  // not drop the version being viewed, nor either return route. The shared
  // pairing builder carries project, version and both contexts — the version is
  // the one this report is showing, never the version loaded in the designer.
  const currentProposalContext = () => readProposalContext(searchParams);
  const currentLibraryContext = () => readLibraryContext(searchParams);
  const viewedVersionId = authority.versionId || requestedVersionId || null;

  const handleTechnicalReport = () => {
    if (!projectId) return;
    navigate(buildReportPairingUrl({
      route: REPORT_ROUTE.DESIGN_REVIEW,
      projectId,
      versionId: viewedVersionId,
      libraryContext: currentLibraryContext(),
      proposalContext: currentProposalContext(),
    }));
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
            Project Report
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
          {/* Library context only — absent when the report was opened from the project
              flow. The primary return route when it came from the Project Library. */}
          <BackToProjectLibraryLink
            className="client-report-screen-only"
            projectId={projectId}
            versionId={viewedVersionId}
          />
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
            disabled={!reportReady || !filenameIdentity.ready || orderedPages.length === 0 || exporting}
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
            {exporting ? "Preparing Project Report…" : "Download Project Report (PDF)"}
          </Button>
        </div>
      </div>

      {/* ── Body — active pages drive both screen and print ── */}
      <div className="client-report-body" style={{
        padding: "32px",
        maxWidth: 900,
        margin: "0 auto",
      }}>
        {/* Saved report: generated before the latest changes. The report stays
            fully visible; Regenerate overwrites the saved report in place. */}
        <ReportSnapshotBanner
          className="client-report-screen-only"
          status={reportSnapshot.status}
          reportType={PROJECT_REPORT_SNAPSHOT_TYPE}
          changedKeys={reportSnapshot.changedKeys}
          generatedAt={reportSnapshot.generatedAt}
          generatedBy={reportSnapshot.generatedBy}
          regenerating={reportSnapshot.saving}
          onRegenerate={reportSnapshot.regenerate}
          evidenceIncomplete={reportSnapshot.evidenceIncomplete}
          evidenceMismatches={reportSnapshot.evidenceMismatches}
        />
        {reportSnapshot.status !== REPORT_SNAPSHOT_STATUS.CURRENT && (
          <div className="client-report-screen-only">
            <ReportGateDiagnosticsPanel diagnostics={gateDiagnostics} />
          </div>
        )}
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
            Open a project from the Room Designer to view its Project Report.
          </div>
        ) : !reportReady ? (
          <div className="client-report-screen-only">
            <ReportStatePanel
              state={readiness.state}
              reportLabel="Project Report"
              missing={readiness.missing}
              nextAction={readiness.nextAction}
              reason={readiness.reason}
              progressItems={progressItems}
              elapsedSeconds={stateSeconds}
              onReturn={handleBackToProject}
              onRetry={
                authorityReadFailed ? authority.retry
                  : exportError ? handleExport
                  : (assessmentIncomplete || publicationStale) ? handleUpdateProjectReport
                  : undefined
              }
              retryLabel={assessmentIncomplete ? "Complete Assessment" : "Update Project Report"}
              diagnostics={gateDiagnostics}
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
              version={reportVersion}
            >
              {page.visual}
            </ClientReportPage>
          ))
        )}

        {/* THE TECHNICAL REPORT'S OWN PAGES, EXACTLY AS IT PRINTS THEM.
            Mounted after the Visual pages so the document moves from the
            client-facing story and its visual evidence into the detailed
            engineering: the level definitions, the project and system overview,
            the performance summary, the ASDR scorecard, the room plan, dimensions
            and speaker position plan, the complete P1–P21 parameter-card sequence
            in its own block, the elevations, the sightlines, the screen-wall
            detail, the primary-seat bass curves and the single closing About
            Sound Proof page. Nothing about those pages is edited, re-sectioned,
            split apart or given a competing presentation. */}
        {reportReady && orderedPages.length > 0 && <TechnicalReportDocument />}
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