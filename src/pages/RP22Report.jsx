import React, { useEffect, useState, useMemo, useCallback, useRef, useSyncExternalStore } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { frozenReportAppState } from '@/components/report/frozenReportAppState';
import { useAppState } from '../components/AppStateProvider';
// TEMP DEBUG: remove after sub persistence proven
import { useActiveProjectId } from '@/components/state/project-session';
// END TEMP DEBUG
// READ-ONLY REPORT: The Technical Report does NOT run useRP22AnalysisEngine,
// useSubwooferSync, useAnalysisSpeakers, or useAllSeatSplMetrics. It reads the
// authoritative RP22 analysisResult, Design Rating, and recommendations from
// the Design Review handoff published by the Room Designer.
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart4 } from 'lucide-react';
import { rp22Parameters } from '../components/data/rp22Parameters';
import { getSpeakerModelMeta } from '../components/models/speakers/registry';
import { buildProductsSelected } from '@/components/report/reportProductsSelected';
import { computeScreenMetrics } from '../components/utils/screenMetrics';
import { resolveEffectiveViewableDimsM } from '../components/models/screen/resolveEffectiveScreen';
import { calculateViewingAngle } from '../components/utils/viewingAngleUtils';
import { safeYawToMLP } from '@/components/room/rv/RenderPrimitives';
import { deriveSubwoofersFromCfg } from '@/components/utils/deriveSubwoofersFromCfg';
import { hydrateProjectIntoAppState } from '@/components/utils/hydrateProjectIntoAppState';
import { mergeProjectAndVersion } from '@/lib/versionAuthority';
import {
    readProjectRecord,
    readProjectVersionRecord,
} from '@/components/state/projectReadCache';
import { useCanonicalProject } from '@/components/state/projectHydrationStore';
import { readVersionIdentity } from '@/components/report/activeVersionIdentity';
import {
    readRequestedVersionId,
    resolveReportVersionId,
    sharedHydrationMatchesRequest,
} from '@/components/report/reportVersionRequest';
import { useEffectiveRsp } from '@/components/room/rsp/useEffectiveRsp';
import { resolveDesignatedRspSeat, resolveRowDerivedRspYByMode } from '@/components/room/rsp/rspInputResolver';
import { resolveRspScreenFrontPlaneM, resolveRspScreenWidthM } from '@/components/room/rsp/screenGeometryResolver';

// Extracted child components
import ReportPrintStyles from '../components/report/ReportPrintStyles';
import ReportTypographyStyles from '@/components/report/typography/ReportTypographyStyles';
import {
    REPORT_FONT_BODY,
    REPORT_FONT_HEADING,
    REPORT_SECTION_HEADING_GAP_PX,
    reportSectionHeadingStyle,
} from '@/components/report/typography/reportTypography';
import RP22ReportParameterGrid from '../components/report/RP22ReportParameterGrid';
import BassResponseGraphSection from '../components/report/technical/BassResponseGraphSection';
import TechnicalReportNotice from '../components/report/technical/TechnicalReportNotice';
import ReportGateDiagnosticsPanel from '@/components/report/ReportGateDiagnosticsPanel';
import { buildReportGateDiagnostics } from '@/components/report/reportGateDiagnostics';
import { useReportSnapshot } from '@/components/report/useReportSnapshot';
import ReportSnapshotBanner from '@/components/report/ReportSnapshotBanner';
import {
    REPORT_SNAPSHOT_TYPE,
    REPORT_SNAPSHOT_STATUS,
    buildSnapshotPayload,
    currentSourceFingerprints,
} from '@/components/report/reportSnapshotAuthority';
import { readSeatPriorityFingerprint } from '@/components/state/designReviewHandoff';
import ReportHeader from '../components/report/ReportHeader';
import TechnicalReportNavBar from '@/components/report/TechnicalReportNavBar';
import ReportCover from '../components/report/ReportCover';
import ReportCountsDashboard from '../components/report/ReportCountsDashboard';
import ProjectDetailsCard from '../components/report/ProjectDetailsCard';
import ReportHiddenCaptures from '../components/report/ReportHiddenCaptures';
import SightlineGraphic from '../components/report/SightlineGraphic';
import ScreenWallConstructionGraphic from '../components/report/ScreenWallConstructionGraphic';
import ReportDrawingPage from '../components/report/ReportDrawingPage';
import { fovForDistance } from '../components/utils/screenMetrics';
import ElevationDrawing from '../components/report/ElevationDrawing';
import FrontElevation from '../components/room/FrontElevation';
import SideElevation from '../components/room/SideElevation';
import PrintRp23Pill from '@/components/report/PrintRp23Pill';
import { usePlanCapture } from '@/components/report/usePlanCapture.jsx';
import { rp23DisplayAngleDeg, rp23LevelForAngleDeg } from '../components/utils/viewingAngleUtils';
import { getP21PresetResult, levelP21_earlyReflections } from '@/components/utils/rp22/levels';
import TechnicalProjectOverview from '@/components/report/technical/TechnicalProjectOverview';
import TechnicalPerformanceSummary from '@/components/report/technical/TechnicalPerformanceSummary';
import TechnicalAsdrScorecard from '@/components/report/technical/TechnicalAsdrScorecard';
import TechnicalRp23Rows from '@/components/report/technical/TechnicalRp23Rows';
import ScopedAsdrSummary from '@/components/report/technical/ScopedAsdrSummary';
import TechnicalEngineeringSummaryNote from '@/components/report/technical/TechnicalEngineeringSummaryNote';
import { subscribeAsdrVisibility, getAsdrVisibility } from '@/components/state/asdrVisibilityStore';
import { useAuth } from '@/lib/AuthContext';
import { DEFAULT_TERRITORY, getTerritoryConfig } from '@/components/pricing/territoryConfig';
import { resolveSeatPriority, getPrimarySeats, getSecondarySeats } from '@/components/utils/seatPriorityAuthority';
import Rp22SeatCoverageSentence from '@/components/report/Rp22SeatCoverageSentence';
import { buildTechnicalReportTitle } from '@/components/report/reportPdfTitle';
import { reportHeaderMetadata } from '@/components/report/reportPrintHeader';
import useReportFilenameIdentity from '@/components/report/useReportFilenameIdentity';
import { applyPrintDocumentTitle, restorePrintDocumentTitle } from '@/components/report/printDocumentTitle';
import {
    findTechnicalReportPrintNode,
    openTechnicalReportPrintWindow,
    printTechnicalReportInWindow,
    closeTechnicalReportPrintWindow,
} from '@/components/report/technical/technicalReportPrintWindow';
import TechnicalAboutSoundProofSection from '@/components/report/technical/TechnicalAboutSoundProofSection';
import TechnicalHowToReadSection from '@/components/report/technical/TechnicalHowToReadSection';
import { ISSUED_DOCUMENT_TYPE } from '@/components/library/issuedDocument/issuedDocumentTypes';
import {
    recordIssuedExportInBackground,
    snapshotIssuedComposition,
} from '@/components/library/issuedDocument/recordIssuedExport';
import { readDesignReviewHandoff, subscribeDesignReviewHandoff } from '@/components/state/designReviewHandoff';
import { useVersionedEngineeringAuthority } from '@/components/engineering/useVersionedEngineeringAuthority';
import { useCompletedBassAuthority } from '@/components/room/bass/completedBassResultStore';
import { setAuthoritativeReadOnlyMode } from '@/components/state/authoritativeReadOnlyMode';
import { useAutoPrintReadinessInstrumentation, logAutoPrintBlock } from '@/components/report/useAutoPrintReadinessInstrumentation';
import useReportBlockPagination from '@/components/report/useReportBlockPagination';
import { REPORT_UPDATE_PARAM, useReportActionIntent } from '@/components/report/reportActionIntent';

// --- Main component ---
/**
 * @param {{embed?: boolean}} [options]
 *   embed — mount the report's DOCUMENT only. Used by the consolidated Project
 *   Report, which carries the Technical pages as part of its own document: the
 *   Technical Report's review chrome, its gates and its export/print machinery
 *   belong to this route, never to the merged document. Nothing about the
 *   report's pages changes; only the chrome around them is left to the route.
 */
function RP22ReportInner({ embed = false } = {}) {
    const liveApp = useAppState();

    // ── Authoritative Read-Only Mode ──────────────────────────────────────
    // While the Technical Report is mounted, authoritative write boundaries
    // emit a console warning if called. The report is a pure consumer of the
    // published engineering summary: zero publishes or recalculations. It may
    // hydrate the saved read-only authority needed to prove completeness.
    // Cleared on unmount.
    useEffect(() => {
        setAuthoritativeReadOnlyMode(true);
        return () => setAuthoritativeReadOnlyMode(false);
    }, []);

    const [isPrinting, setIsPrinting] = useState(false);
    const [planImageDataUrl, setPlanImageDataUrl] = useState(null);
    const [planDimsImageDataUrl, setPlanDimsImageDataUrl] = useState(null);
    const [planSpeakerDimsImageDataUrl, setPlanSpeakerDimsImageDataUrl] = useState(null);
    const [hasPrintedOnce, setHasPrintedOnce] = useState(false);
    const [autoPrintDone, setAutoPrintDone] = useState(false);
    const [exportStatus, setExportStatus] = useState("Idle");
    const [exportDebug, setExportDebug] = useState({ isPrinting: false, planLen: 0, printReady: false });
    const [screenMetricsForPrint, setScreenMetricsForPrint] = useState(null);
    const [screenMetricsStatus, setScreenMetricsStatus] = useState("");
    const [showCadExportMenu, setShowCadExportMenu] = useState(false);
    const [projectDetails, setProjectDetails] = useState(null);
    const [reportVersionNumber, setReportVersionNumber] = useState(null);
    const [reportVersionName, setReportVersionName] = useState(null);
    const [reportHydrating, setReportHydrating] = useState(true);
    const [reportReadyProjectId, setReportReadyProjectId] = useState(null);
    // The version the ready flag was set for, so opening a DIFFERENT version of
    // the same project re-hydrates instead of reusing the previous version.
    const [reportReadyVersionId, setReportReadyVersionId] = useState(null);

    // ONE filename for this report. The print dialog's Save-as-PDF default and
    // the stalled-export fallback both use exactly this string, so a downloaded
    // Technical Report always identifies itself: brand, report type, dealer,
    // project and reference.
    const filenameIdentity = useReportFilenameIdentity(projectDetails);
    const technicalReportPrintTitle = buildTechnicalReportTitle(
        projectDetails?.name,
        { number: reportVersionNumber, name: reportVersionName },
        filenameIdentity
    );

    // The Technical Report's first page states the same identity line as the
    // Visual Report — Project, Client, Version, Reference, Date — read from the
    // one shared builder, naming the design version this report documents.
    const technicalFirstPageMeta = reportHeaderMetadata(projectDetails, {
        number: reportVersionNumber,
        name: reportVersionName,
    });
    const showDesignRating = useSyncExternalStore(subscribeAsdrVisibility, getAsdrVisibility);

    // ── ASDR recommendation wiring ───────────────────────────────────────
    // READ-ONLY REPORT: The report does NOT mount DesignRecommendationEngine.
    // It reads the already-settled recommendations, analysisResult, Design
    // Rating, and per-seat ratings from the Design Review handoff published
    // by the Room Designer. No recommendation logic is duplicated here.
    const { user: reportUser } = useAuth();
    const reportTerritory = reportUser?.territory || DEFAULT_TERRITORY;
    const reportTerritoryConfig = getTerritoryConfig(reportTerritory);
    const reportAllowUkPricing = !!reportTerritoryConfig?.priceListAvailable && reportTerritory === "UK";

    const { projectId: routeProjectId } = useParams();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const activeProjectId = useActiveProjectId();
    // ── Report project ID authority (immutable for session, FIX 2) ────────
    // The explicit project ID from the route/query is the SOLE authority.
    // Global activeProjectId is NEVER used as a fallback for report data.
    // It is retained only for the FAST PATH optimisation check and may be
    // written for navigation convenience — but NEVER read as authority.
    const explicitProjectId =
        routeProjectId ||
        searchParams.get("projectId") ||
        searchParams.get("id") ||
        null;
    const [reportProjectError, setReportProjectError] = useState(null);

    // ── Report version authority ──────────────────────────────────────────
    // The version this report was opened FOR. The Project Library's report row
    // passes it explicitly; a page opened without one states the project's
    // active version. The loaded Room Designer version is never consulted — a
    // Level 4 row must open, generate and export the Level 4 report.
    const requestedVersionId = readRequestedVersionId(searchParams);
    // The version the shared app state already holds. The in-session shortcut
    // may only be used when it is the version this report was asked for.
    const sharedHydratedVersionId = useCanonicalProject().identity?.activeVersionId || null;

    // ── READ-ONLY handoff (event-driven snapshot, no polling) ──────────────
    // The Room Designer publishes its authoritative analysisResult, Design
    // Rating (roomDesignRating + scopedRatings + seatDesignRatings), and
    // settled recommendations to the Design Review handoff. The Technical
    // Report reads this published state — it never recalculates.
    //
    // The handoff is a write-once/read-many snapshot. By the time the report
    // mounts (SPA navigation) the value is already in window.__ROOM_DESIGNER_ASDR__;
    // for direct loads it is already in localStorage. A single useEffect read
    // suffices. A storage event listener covers the rare case where another
    // browser tab updates the project while the report is already open.
    // The explicit request is the authority; the project's active version is
    // only the fallback for a page opened without a version.
    const reportVersionId = resolveReportVersionId({
        requestedVersionId,
        activeVersionId: projectDetails?.active_version_id || null,
    });

    // ── Version-scoped engineering authority (durable first) ──────────────
    // The Technical Report reads the settled engineering result from the DB
    // Published Engineering Authority for this version, with the same-window
    // handoff overlaid as an optimisation. A cold load with empty site storage
    // therefore still restores the published report instead of reporting that
    // no analysis exists. Still read-only: no engine, no recalculation.
    const reportAuthority = useVersionedEngineeringAuthority(explicitProjectId, reportVersionId, { finalReport: true });
    const app = useMemo(() => frozenReportAppState(liveApp, reportAuthority.publication), [liveApp, reportAuthority.publication]);
    const frozenProject = reportAuthority.publication?.report_snapshot?.report_project || null;
    const reportProjectDetails = useMemo(() => frozenProject ? { ...projectDetails, ...frozenProject } : projectDetails, [projectDetails, frozenProject]);
    const completedBassAuthority = useCompletedBassAuthority(
        explicitProjectId || "free",
        reportVersionId || "free",
    );
    const bassScopeId = String(completedBassAuthority?.projectId || "").split("::")[0] || null;
    const projectIdMatch = !!explicitProjectId
        && !!reportVersionId
        && String(completedBassAuthority?.projectId || "") === `${explicitProjectId}::${reportVersionId}`;
    const bassReportPending = !projectIdMatch || completedBassAuthority?.hydrationSettled !== true;
    const bassRestoreFailed = projectIdMatch
        && completedBassAuthority?.hydrationSettled === true
        && completedBassAuthority?.authorityStatus === "ERROR"
        && !completedBassAuthority?.contract;
    const designReviewHandoff = reportAuthority.snapshot;
    const authorityResolving = reportAuthority.loading;
    const authorityReadFailed = reportAuthority.readFailed === true;
    const designRecommendations = designReviewHandoff?.recommendations ?? null;

    // One published engineering summary is the sole report authority.
    // The printable report never mounts the bass result store, checks a second
    // fingerprint, or reconstructs any parameter presentation.
    const engineeringSummary = designReviewHandoff?.engineeringSummary
        ?? designReviewHandoff?.rating?.engineeringSummary
        ?? null;

    // The published P19 result — the single RSP assessment the P19 graph page
    // states beside its graph. Read from the same canonical room result every
    // other P19 surface reads; never re-graded or re-derived here.
    const p19ReportResult = useMemo(() => {
        const row = engineeringSummary?.roomResultsByParameter?.[19] || null;
        if (!row) return null;
        return {
            level: row.level ?? null,
            valueText: row.formatted ?? row.valueText ?? null,
        };
    }, [engineeringSummary]);
    const authorityReportPending = !engineeringSummary;
    const reportDataIncomplete = !authorityResolving
        && !authorityReadFailed
        && !bassReportPending
        && !bassRestoreFailed
        && !reportAuthority.reportComplete;
    const reportDataIncompleteReason = reportAuthority.reportCompleteness?.reason
        || "Complete every project assessment before generating reports or proposals.";

    // ── Saved report snapshot (Technical Report) ────────────────────────────
    // The saved report is recorded against this project version when it is
    // generated, marked as generated before the latest changes rather than
    // blanked when the design moves on, and overwritten in place on Regenerate.
    // The values themselves stay in the published engineering publication that
    // this record points at — one engineering authority, never a second copy.
    const snapshotFingerprints = useMemo(
        () => currentSourceFingerprints({
            authoritySnapshot: designReviewHandoff,
            engineeringSummary,
            // Final report identity follows the publication's frozen seating priorities.
        }),
        [designReviewHandoff, engineeringSummary, explicitProjectId]
    );

    const snapshotPayload = useMemo(
        () => buildSnapshotPayload({
            engineeringFingerprint: designReviewHandoff?.engineeringFingerprint || null,
            presentation: { showAsdr: designReviewHandoff?.showAsdr !== false },
        }),
        [designReviewHandoff]
    );

    const reportSnapshot = useReportSnapshot({
        projectId: explicitProjectId,
        versionId: reportVersionId,
        accountId: projectDetails?.account_id || null,
        reportType: REPORT_SNAPSHOT_TYPE.TECHNICAL,
        currentFingerprints: snapshotFingerprints,
        payload: snapshotPayload,
        reportSource: { project: projectDetails, engineeringSummary, app },
        // An embedded document is not this report's own generation: the Technical
        // Report is saved by its own route, never by the consolidated Project
        // Report that carries its pages.
        ready: !embed && !!engineeringSummary && !authorityResolving && !reportHydrating && !bassReportPending && !bassRestoreFailed && !reportDataIncomplete,
    });

    // updateReport: when the Project Library's row asks for an updated report,
    // create it from the design as it stands — through the same action the saved
    // report banner offers. It runs only on a report the design has moved past,
    // and never changes a Current report's status.
    useReportActionIntent({
        requested: searchParams.get(REPORT_UPDATE_PARAM) === "1",
        ready: reportSnapshot.status === REPORT_SNAPSHOT_STATUS.STALE
            && !reportSnapshot.saving
            && !!explicitProjectId
            && !isPrinting,
        onRun: reportSnapshot.regenerate,
    });

    // The gate's own account of this report: which authority exists, whether it
    // is complete, what is missing, and whether the saved report still matches.
    const gateDiagnostics = buildReportGateDiagnostics({
        projectId: explicitProjectId,
        versionId: reportVersionId,
        reportType: REPORT_SNAPSHOT_TYPE.TECHNICAL,
        hasSavedEngineeringAuthority: !!reportAuthority.publication || !!engineeringSummary,
        hasCompleteEngineeringSnapshot: reportAuthority.reportComplete === true,
        hasReportSnapshot: !!reportSnapshot.saved,
        missingParameters: reportAuthority.reportCompleteness?.missingParameterKeys,
        incompleteSeatParameters: reportAuthority.reportCompleteness?.incompleteSeatParameterKeys,
        sourceFingerprint: snapshotFingerprints?.engineeringFingerprint ?? null,
        savedFingerprint: reportSnapshot.saved?.source_fingerprints?.engineeringFingerprint ?? null,
        snapshotStatus: reportSnapshot.status,
        gateResult: reportDataIncomplete
            ? 'blocked'
            : ((reportHydrating
                || (explicitProjectId && reportReadyProjectId !== explicitProjectId)
                || authorityReportPending
                || authorityResolving
                || bassReportPending)
                ? 'loading'
                : 'open'),
        blockReason: reportDataIncomplete ? reportDataIncompleteReason : null,
    });

    // Full project hydration for RP22Report — mirrors Room Designer's useProjectLoader path
    useEffect(() => {
        let cancelled = false;

        if (!app) return;

        if (!explicitProjectId) {
            setProjectDetails(null);
            setReportHydrating(false);
            setReportReadyProjectId(null);
            setReportProjectError("Project could not be resolved for Technical Report.");
            return;
        }

        // Clear any prior error when resolving a new valid project.
        setReportProjectError(null);

        // ── FAST PATH (SPA navigation from Room Designer) ──────────────────
        // If the shared AppStateProvider is already hydrated for the EXACT
        // requested project (identity match via session store + usable
        // hydrated design state via isProjectHydrationReady), skip the
        // redundant network hydration and mark ready immediately. Project
        // details (name/client) are fetched non-blocking for the header.
        // Hard refresh fails this check (isProjectHydrationReady=false) and
        // falls through to the full fetch/hydrate path below.
        // The shortcut may only be taken when the shared state holds the version
        // this report was ASKED FOR. A request for another version hydrates that
        // version explicitly, so an in-session load can never answer a Level 4
        // request with the loaded Level 1 design.
        const sharedProviderReady =
            activeProjectId === explicitProjectId &&
            app?.isProjectHydrationReady === true &&
            sharedHydrationMatchesRequest({
                requestedVersionId,
                hydratedVersionId: sharedHydratedVersionId,
            }) &&
            Number.isFinite(Number(app?.roomDims?.widthM)) &&
            Number.isFinite(Number(app?.roomDims?.lengthM));

        if (sharedProviderReady) {
            setReportHydrating(false);
            setReportReadyProjectId(explicitProjectId);
            setReportReadyVersionId(reportVersionId || null);
            readProjectRecord(explicitProjectId).then(async (p) => {
                if (cancelled) return;
                if (!p) return;
                setProjectDetails({
                    id: p.id,
                    name: p.name,
                    client_name: p.client_name,
                    project_status: p.project_status,
                    notes: p.notes,
                    created_date: p.created_date,
                    updated_date: p.updated_date,
                    account_id: p.account_id || null,
                    dealer_name: p.dealer_name || null,
                    project_reference: p.project_reference || null,
                    active_version_id: p.active_version_id || null,
                });
                // The fast path states the version exactly as the full load does:
                // the saved version name is read here too, so an in-session export
                // or front page never falls back to a generic version label.
                const version = await readVersionIdentity(
                    resolveReportVersionId({
                        requestedVersionId,
                        activeVersionId: p.active_version_id,
                    }),
                );
                if (cancelled) return;
                setReportVersionNumber(version.number);
                setReportVersionName(version.name);
            }).catch(() => { /* non-blocking metadata fetch */ });
            return () => { cancelled = true; };
        }

        // Ready for this exact project AND this exact version.
        if (reportReadyProjectId === explicitProjectId
            && reportReadyVersionId === (reportVersionId || null)
            && reportHydrating === false) {
            return;
        }

        if (reportReadyProjectId !== explicitProjectId
            || reportReadyVersionId !== (reportVersionId || null)) {
            setReportHydrating(true);
            setReportReadyProjectId(null);
            setReportReadyVersionId(null);
        }

        readProjectRecord(explicitProjectId).then(async (p) => {
            if (cancelled) return;
            if (!p) {
                setProjectDetails(null);
                setReportHydrating(false);
                setReportReadyProjectId(null);
                setReportProjectError("Project could not be resolved for Technical Report.");
                return;
            }
            setProjectDetails({
                id: p.id,
                name: p.name,
                client_name: p.client_name,
                project_status: p.project_status,
                notes: p.notes,
                created_date: p.created_date,
                updated_date: p.updated_date,
                account_id: p.account_id || null,
                dealer_name: p.dealer_name || null,
                project_reference: p.project_reference || null,
                active_version_id: p.active_version_id || null,
            });
            // Merge with the version this report was ASKED FOR — the explicit
            // request first, the project's active version only as the fallback.
            // Per-version design fields come from that version's design_state,
            // never from the legacy Project position and never from whichever
            // version the Room Designer happens to have loaded.
            let merged = p;
            const versionId = resolveReportVersionId({
                requestedVersionId,
                activeVersionId: p.active_version_id,
            });
            if (versionId) {
                try {
                    const v = await readProjectVersionRecord(versionId);
                    if (!cancelled && v) {
                        merged = mergeProjectAndVersion(p, v);
                        setReportVersionNumber(typeof v.version_number === "number" ? v.version_number : null);
                        setReportVersionName(typeof v.version_name === "string" ? v.version_name : null);
                    }
                } catch (verErr) {
                    console.warn("[RP22Report] Version fetch failed, using project-only:", verErr);
                }
            }
            hydrateProjectIntoAppState(merged, app, {
                setScreen: app.setScreen,
                setDolbyConfig: app.setDolbyConfig,
                setDolbyPreset: app.setDolbyLayout,
                setSevenBedLayoutType: app.setSevenBedLayoutType,
                setLcrAimMode: app.setLcrAimMode,
                setEnableFrontWides: app.setEnableFrontWides,
                setOverheadGlobalModel: app.setOverheadGlobalModel,
                setOverheadFrontOverride: app.setOverheadFrontOverride,
                setOverheadMidOverride: app.setOverheadMidOverride,
                setOverheadRearOverride: app.setOverheadRearOverride,
                setUseFrontGlobal: app.setUseFrontGlobal,
                setUseMidGlobal: app.setUseMidGlobal,
                setUseRearGlobal: app.setUseRearGlobal,
                setRowSpacingM: app.setRowSpacingM,
                setSeatsPerRowByRow: app.setSeatsPerRowByRow,
                setOverlays: app.setOverlays,
                setSeatingPositions: app.setSeatingPositions,
                setRoomElements: app.setRoomElements,
                setFrontSubsCfg: app.setFrontSubsCfg,
                setRearSubsCfg: app.setRearSubsCfg,
                setSpeakerSystem: app.setSpeakerSystem,
                setSeatingRows: app.setSeatingRows,
                setSeatsPerRow: app.setSeatsPerRow,
                setSeatSpacing: app.setSeatSpacing,
                setMlpBasis: app.setMlpBasis,
                setSeatingBlockOffset: app.setSeatingBlockOffset,
                setRowEarHeights: app.setRowEarHeights,
                setSelectedSpeakersByRole: app.setSelectedSpeakersByRole,
                setSpeakerNodes: app.setSpeakerNodes,
                setGlobalSurroundModel: app.setGlobalSurroundModel,
                setExtraSurroundCount: app.setExtraSurroundCount,
                setFreeMoveLcr: app.setFreeMoveLcr,
                setRspMode: app.setRspMode,
                setManualRspY_m: app.setManualRspY_m,
                setManualRspX_m: app.setManualRspX_m,
                setDesignatedRspSeatId: app.setDesignatedRspSeatId,
            });
            setReportReadyProjectId(p.id);
            setReportReadyVersionId(versionId || null);
            setReportHydrating(false);
        }).catch(() => {
            if (cancelled) return;
            setProjectDetails(null);
            setReportHydrating(false);
            setReportReadyProjectId(null);
            setReportProjectError("Project could not be resolved for Technical Report.");
        });

        return () => {
            cancelled = true;
        };
    }, [explicitProjectId, requestedVersionId]);

    const [printReady, setPrintReady] = useState(false);
    const printReportRef = useRef(null);
    useReportBlockPagination(
        printReportRef,
        `${printReady}:${isPrinting}:${planImageDataUrl?.length || 0}:${planDimsImageDataUrl?.length || 0}:${planSpeakerDimsImageDataUrl?.length || 0}`,
    );
    const [debugPlanCapture, setDebugPlanCapture] = useState(false);
    const printLockRef = React.useRef(false);
    const cleanupTimeoutRef = React.useRef(null);
    const exportGuardRef = React.useRef({ active: false, startedAt: 0 });
    const exportTimeoutRef = React.useRef(null);
    const EXPORT_TIMEOUT_MS = 60000;
    // The app-owned print window the export click opened, when one could be opened.
    const printWindowRef = React.useRef(null);

    /**
     * Print the report under its own filename.
     *
     * The export click opens the app-owned print window up front — a window
     * opened after the capture pipeline would be blocked as an unwanted pop-up.
     * Every Technical Report print path goes through here: while that window is
     * available the report is printed from it, so the browser names the saved PDF
     * after the report; otherwise it prints in place, applying the report title to
     * the app document and the host tab exactly as before.
     */
    const printTechnicalReport = React.useCallback(() => {
        const printWindow = printWindowRef.current;
        printWindowRef.current = null;

        // Exporting this report also stores the issued PDF in the project
        // library, from the SAME print composition, in the background. The
        // export itself is never delayed and never depends on storage.
        // The issued copy is taken from the SAME composition this export prints
        // and stored in the background; a failure is reported with its reason,
        // and a retry that cannot use a held PDF re-runs this very export.
        recordIssuedExportInBackground({
                identity: {
                    projectId: explicitProjectId,
                    accountId: projectDetails?.account_id || null,
                    documentType: ISSUED_DOCUMENT_TYPE.TECHNICAL,
                    title: 'Technical Report',
                    filename: technicalReportPrintTitle,
                    versionId: reportVersionId,
                    selectedVersionIds: reportVersionId ? [reportVersionId] : [],
                    sourceRecordId: reportSnapshot.saved?.id || null,
                    sourceFingerprints: snapshotFingerprints,
                    sourceStatusAtExport: reportSnapshot.status === REPORT_SNAPSHOT_STATUS.STALE
                        ? 'source_changed'
                        : 'current',
                    exportedBy: reportUser?.full_name || reportUser?.email || null,
                },
                snapshot: snapshotIssuedComposition(ISSUED_DOCUMENT_TYPE.TECHNICAL),
                retryExport: printTechnicalReport,
            });

        const onDone = () => {
            setAutoPrintDone(true);
            setExportStatus("Done");
            setExportDebug(d => ({ ...d, isPrinting: false, printReady: false }));
            setIsPrinting(false);
            setPlanImageDataUrl(null);
            setPlanDimsImageDataUrl(null);
            setPlanSpeakerDimsImageDataUrl(null);
            printLockRef.current = false;
            if (cleanupTimeoutRef.current) { clearTimeout(cleanupTimeoutRef.current); cleanupTimeoutRef.current = null; }
            exportGuardRef.current.active = false;
        };

        const printInPlace = () => {
            applyPrintDocumentTitle(technicalReportPrintTitle);
            window.addEventListener("afterprint", () => setAutoPrintDone(true), { once: true });
            window.print();
        };

        if (!printWindow) {
            printInPlace();
            return;
        }

        printTechnicalReportInWindow(printWindow, {
            title: technicalReportPrintTitle,
            node: findTechnicalReportPrintNode(),
            onDone,
        }).then((printed) => {
            if (printed) return;
            // The window could not be used: fall back to printing in place.
            closeTechnicalReportPrintWindow(printWindow);
            printInPlace();
        });
    }, [
        technicalReportPrintTitle,
        explicitProjectId,
        projectDetails,
        reportVersionId,
        reportSnapshot,
        snapshotFingerprints,
        reportUser,
    ]);

    // Cleanup on afterprint
    useEffect(() => {
        const cleanup = () => {
            setExportStatus("Done");
            setExportDebug(d => ({ ...d, isPrinting: false, printReady: false }));
            setIsPrinting(false);
            setPlanImageDataUrl(null);
            setPlanDimsImageDataUrl(null);
            setPlanSpeakerDimsImageDataUrl(null);
            printLockRef.current = false;
            restorePrintDocumentTitle();
            if (cleanupTimeoutRef.current) { clearTimeout(cleanupTimeoutRef.current); cleanupTimeoutRef.current = null; }
            if (exportTimeoutRef.current) { clearTimeout(exportTimeoutRef.current); exportTimeoutRef.current = null; }
            exportGuardRef.current.active = false;
        };
        window.addEventListener('afterprint', cleanup);
        return () => {
            window.removeEventListener('afterprint', cleanup);
            closeTechnicalReportPrintWindow(printWindowRef.current);
            printWindowRef.current = null;
            if (cleanupTimeoutRef.current) clearTimeout(cleanupTimeoutRef.current);
            if (exportTimeoutRef.current) clearTimeout(exportTimeoutRef.current);
        };
    }, []);

    // Plan capture hooks
    usePlanCapture({ isPrinting, planImageDataUrl, setPlanImageDataUrl, planDimsImageDataUrl, setPlanDimsImageDataUrl, planSpeakerDimsImageDataUrl, setPlanSpeakerDimsImageDataUrl, setExportStatus, exportTimeoutRef, exportGuardRef, setIsPrinting, debugPlanCapture, onPrintFallback: printTechnicalReport });

    // autoPrint: when navigated from Design Review with ?autoPrint=1, auto-trigger
    // the print pipeline once the report is hydrated and ready.
    // An embedded document never auto-prints: the merged document owns its own
    // export, and a second print would open a second print window.
    const autoPrintRequested = !embed && searchParams.get("autoPrint") === "1";
    const autoPrintTriggeredRef = React.useRef(false);

    // Preparation screen: when autoPrint=1 is present, suppress the full interactive
    // Technical Report UI and show a neutral white preparation screen until the
    // existing readiness conditions are satisfied and window.print() opens.
    const isAutoPrintPreparing = autoPrintRequested && !autoPrintDone;
    useEffect(() => {
        if (!autoPrintRequested || autoPrintTriggeredRef.current) {
            if (!autoPrintRequested) logAutoPrintBlock('autoPrintRequested = false', 383);
            if (autoPrintTriggeredRef.current) logAutoPrintBlock('autoPrintTriggered already true', 383);
            return;
        }
        // FIX 3: autoPrint requires an explicit project ID. Never fall back
        // to a globally active project. A failed PDF is preferable to a PDF
        // for the wrong client.
        if (!explicitProjectId) {
            logAutoPrintBlock('explicitProjectId missing', 388);
            setReportProjectError("Project could not be resolved for Technical Report.");
            return;
        }
        if (!filenameIdentity.ready || reportHydrating || reportReadyProjectId !== explicitProjectId) {
            logAutoPrintBlock(reportHydrating ? 'reportHydrating = true' : 'reportReadyProjectId mismatch', 391);
            return;
        }
        if (authorityReportPending || bassReportPending || bassRestoreFailed || reportDataIncomplete) {
            logAutoPrintBlock(
                bassRestoreFailed ? 'saved bass authority restore failed' : (bassReportPending ? 'saved bass authority hydrating' : (reportDataIncomplete ? 'engineering assessment incomplete' : 'engineeringSummary unavailable')),
                395,
            );
            return;
        }
        if (isPrinting) {
            logAutoPrintBlock('isPrinting already true', 396);
            return;
        }
        autoPrintTriggeredRef.current = true;
        setExportStatus("Auto-printing from Design Review…");
        setHasPrintedOnce(false);
        setPlanImageDataUrl(null);
        setPlanDimsImageDataUrl(null);
        setPlanSpeakerDimsImageDataUrl(null);
        setIsPrinting(true);
    }, [autoPrintRequested, reportHydrating, explicitProjectId, reportReadyProjectId, isPrinting, authorityReportPending, bassReportPending, bassRestoreFailed, reportDataIncomplete, filenameIdentity.ready]);

    // Mark printReady when all captures are done
    useEffect(() => {
        if (!isPrinting || reportHydrating || !explicitProjectId || reportReadyProjectId !== explicitProjectId) {
            if (isPrinting) logAutoPrintBlock('printReady effect: report not ready (hydrating or project mismatch)', 422);
            return;
        }
        if (planImageDataUrl !== null && planDimsImageDataUrl !== null && planSpeakerDimsImageDataUrl !== null) {
            setExportDebug(d => ({ ...d, printReady: true }));
            setPrintReady(true);
            setExportStatus("Capture complete — preparing print…");
            if (exportTimeoutRef.current) { clearTimeout(exportTimeoutRef.current); exportTimeoutRef.current = null; }
        } else {
            logAutoPrintBlock('printReady effect: planCaptureReady = false (waiting for plan captures)', 423);
        }
    }, [isPrinting, planImageDataUrl, planDimsImageDataUrl, planSpeakerDimsImageDataUrl, reportHydrating, explicitProjectId, reportReadyProjectId]);

    // Trigger print when ready
    useEffect(() => {
        if (!isPrinting) { setHasPrintedOnce(false); printLockRef.current = false; setPrintReady(false); return; }
        if (!printReady || hasPrintedOnce || printLockRef.current) {
            if (!printReady) logAutoPrintBlock('print trigger: printReady = false', 434);
            if (hasPrintedOnce) logAutoPrintBlock('print trigger: hasPrintedOnce already true', 434);
            if (printLockRef.current) logAutoPrintBlock('print trigger: printLockRef already true', 434);
            return;
        }
        const t = setTimeout(() => {
            // Project consistency guard before window.print().
            // The report must remain bound to its explicit project; never
            // substitute another project's published engineering summary.
            if (!explicitProjectId || reportReadyProjectId !== explicitProjectId || reportHydrating) {
                logAutoPrintBlock('print trigger: project identity mismatch guard', 440);
                setExportStatus("Print cancelled — project identity mismatch.");
                closeTechnicalReportPrintWindow(printWindowRef.current);
                printWindowRef.current = null;
                setIsPrinting(false);
                setPrintReady(false);
                printLockRef.current = false;
                return;
            }
            if (!projectIdMatch || bassScopeId !== explicitProjectId || bassReportPending || bassRestoreFailed || reportDataIncomplete) {
                logAutoPrintBlock('print trigger: bass authority project mismatch or restore incomplete', 441);
                setExportStatus("Print cancelled — bass authority project mismatch.");
                closeTechnicalReportPrintWindow(printWindowRef.current);
                printWindowRef.current = null;
                setIsPrinting(false);
                setPrintReady(false);
                printLockRef.current = false;
                return;
            }
            setExportStatus("Opening PDF preview…");
            setHasPrintedOnce(true);
            // Keep the lightweight preparation view mounted until the browser has
            // taken its print snapshot. Revealing the full screen report here can
            // leak a partial screen header onto a leading PDF page.
            printLockRef.current = true;
            if (exportTimeoutRef.current) clearTimeout(exportTimeoutRef.current);
            exportTimeoutRef.current = null;
            exportGuardRef.current.active = false;
            // A window opened here may still be honoured while the click that
            // started the export is recent — the Design Review route has no click
            // of its own to open one on. When the browser refuses it, printing
            // falls back to the in-place path inside printTechnicalReport().
            if (!printWindowRef.current) {
                printWindowRef.current = openTechnicalReportPrintWindow(technicalReportPrintTitle);
            }
            // The report's own filename, printed from the app-owned window when
            // one could be opened, so the saved PDF is named by the report rather
            // than by the host tab the app is running in.
            printTechnicalReport();
            cleanupTimeoutRef.current = setTimeout(() => {
                if (isPrinting) {
                    setIsPrinting(false); setPlanImageDataUrl(null);
                    setPlanDimsImageDataUrl(null); setPlanSpeakerDimsImageDataUrl(null);
                    printLockRef.current = false;
                }
            }, 2000);
        }, 250);
        return () => clearTimeout(t);
    }, [isPrinting, printReady, hasPrintedOnce, explicitProjectId, reportReadyProjectId, reportHydrating, projectIdMatch, bassScopeId, bassReportPending, bassRestoreFailed, reportDataIncomplete]);

    useEffect(() => { setExportDebug(d => ({ ...d, isPrinting, printReady })); }, [isPrinting, printReady]);

    useEffect(() => {
        if (!reportHydrating) return;
        setPrintReady(false);
        setHasPrintedOnce(false);
        setPlanImageDataUrl(null);
        setPlanDimsImageDataUrl(null);
        setPlanSpeakerDimsImageDataUrl(null);
    }, [reportHydrating]);

    const safeArray = (v) => (Array.isArray(v) ? v : []);
    const safeObj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);

    const roomDims = app?.roomDims || {};
    const screen = app?.screen || {};
    const dolbyLayout = app?.dolbyLayout || "5.1";
    const frontSubsCfg = safeObj(app?.frontSubsCfg);
    const rearSubsCfg = safeObj(app?.rearSubsCfg);
    const stableDimensions = React.useMemo(() => ({
        width: Number(roomDims?.widthM) || 4.5,
        length: Number(roomDims?.lengthM) || 6.0,
        height: Number(roomDims?.heightM) || 2.4
    }), [roomDims?.widthM, roomDims?.lengthM, roomDims?.heightM]);

    // READ-ONLY: useSubwooferSync is NOT called here. The Room Designer owns
    // subwoofer sync; the report reads the already-synced appState.subwoofers.

    const seats = safeArray(app?.seatingPositions);
    const placedSpeakers = safeArray(app?.speakerSystem?.placedSpeakers);
    const frontSubs = safeArray(app?.subwoofers).filter((sub) => sub?.group === 'front' || String(sub?.role || '').startsWith('SUBF'));
    const mlpBasis = app?.mlpBasis || "front";
    const hasSeats = seats.length > 0;
    const hasSpeakers = placedSpeakers.length > 0;

    const reportDolbyLayout = app?.dolbyLayout ?? app?.dolbyConfig ?? app?.speakerSystem?.dolbyLayout ?? app?.speakerSystem?.dolbyPreset ?? "5.1";
    const canonicalP2Layout = app?.dolbyLayout ?? app?.dolbyConfig ?? app?.speakerSystem?.dolbyLayout ?? app?.speakerSystem?.dolbyPreset ?? null;
    const reportSevenBedMode = String(app?.sevenBedLayoutType || app?.speakerSystem?.sevenBedLayoutType || (app?.speakerSystem?.useWidesInsteadOfRears ? "wides" : "") || "rears").toLowerCase();

    const reportP12Mode = app?.p12Mode || "minimum";
    const reportP13Mode = app?.splConfig?.p13Mode || "minimum";
    const reportP14Mode = engineeringSummary?.roomResultsByParameter?.[14]?.targetBasis || app?.splConfig?.p14Mode || "minimum";
    const reportP18Mode = engineeringSummary?.roomResultsByParameter?.[18]?.targetBasis || app?.splConfig?.p18Mode || "minimum";

    const cleanAspectLabel = (v) => {
        const s = String(v ?? "").trim();
        if (!s) return "";
        if (s === "16x9" || s === "16/9") return "16:9";
        if (s === "235" || s === "2.35" || s === "2.35/1" || s === "2.35:1") return "2.35:1";
        if (s === "239" || s === "2.39" || s === "2.39/1" || s === "2.39:1") return "2.39:1";
        return s;
    };

    const formatScreenChoiceLabel = (scr) => {
        const TV_PRESET_LABELS = { tv65: 'TV 65"', tv77: 'TV 77"', tv83: 'TV 83"', tv100: 'TV 100"' };
        const tvKey = scr?.tvPresetKey;
        if (tvKey && TV_PRESET_LABELS[tvKey]) return TV_PRESET_LABELS[tvKey];
        // For non-TV screens: derive inches from tvWidthMm fallback or visibleWidthInches
        const tvMm = Number(scr?.tvWidthMm);
        const inches = Number.isFinite(tvMm) && tvMm > 0
            ? tvMm / 25.4
            : Number(scr?.visibleWidthInches || scr?.diagonalInches || scr?.sizeInches) || 0;
        const ratio = cleanAspectLabel(scr?.aspectRatio);
        const inchesTxt = Number.isFinite(inches) && inches > 0 ? `${Math.round(inches)}"` : "";
        const ratioTxt = ratio ? ratio : "";
        return [inchesTxt, ratioTxt].filter(Boolean).join(" ") || "Not specified";
    };

    // ── Effective RSP from restored authority ──────────────────────────────
    // Resolves RSP Y directly from rspMode / manualRspY_m / screen geometry via
    // the production useEffectiveRsp helper.  Does NOT rely on app.mlpY_m being
    // precomputed by Room Designer effects (those effects don't run here).
    const rspMode = app?.rspMode || "auto_from_screen";
    const manualRspY_m = app?.manualRspY_m ?? null;

    const reportScreenFrontPlaneM = React.useMemo(
        () => resolveRspScreenFrontPlaneM(app?.screenFrontPlaneM, screen),
        [app?.screenFrontPlaneM, screen?.floatDepthM, screen?.screenPlaneY_m]
    );

    const rowDerivedRspYByMode = React.useMemo(
        () => resolveRowDerivedRspYByMode(seats, stableDimensions.width, stableDimensions.length),
        [seats, stableDimensions.width, stableDimensions.length]
    );

    // ── Designated RSP seat (seat_bound mode) ──────────────────────────────
    const designatedRspSeat = React.useMemo(
        () => resolveDesignatedRspSeat(app?.designatedRspSeatId, seats),
        [app?.designatedRspSeatId, seats]
    );

    // ── Canonical RSP via shared screen-geometry resolver ──────────────────
    // Uses resolveRspScreenFrontPlaneM / resolveRspScreenWidthM so the RSP
    // coordinate matches RoomVisualisation and useClientReportAuthority exactly.
    const rspScreenFrontPlaneM = reportScreenFrontPlaneM;
    const rspScreenWidthM = React.useMemo(
        () => resolveRspScreenWidthM(screen),
        [screen?.tvPresetKey, screen?.tvWidthMm, screen?.visibleWidthInches, screen?.manualWidthM, screen?.manualHeightM, screen?.aspectRatio, screen?.manualSize]
    );

    const { effectiveRspY_m, effectiveRspX_m } = useEffectiveRsp({
        rspMode,
        manualRspY_m,
        manualRspX_m: app?.manualRspX_m ?? null,
        roomWidthM: stableDimensions.width,
        screenFrontPlaneM: rspScreenFrontPlaneM,
        screenWidthM: rspScreenWidthM,
        rowCentersM: app?.rowCentersM || [],
        seatingPositions: seats,
        currentMlpY_m: app?.mlpY_m ?? null,
        rowDerivedRspYByMode,
        designatedRspSeat,
    });

    const reportMlpAnchorEffective = React.useMemo(() => {
        const cx = Number.isFinite(effectiveRspX_m) ? effectiveRspX_m : (stableDimensions.width / 2);
        const y = Number.isFinite(effectiveRspY_m) ? effectiveRspY_m : app?.mlpY_m;
        if (Number.isFinite(y)) {
            return { x: cx, y, z: 1.2 };
        }
        return app?.mlp || null;
    }, [effectiveRspX_m, effectiveRspY_m, app?.mlpY_m, stableDimensions.width, app?.mlp]);

    const primarySeatingPosition = reportMlpAnchorEffective || app?.mlp || null;

    const rspSeatId = React.useMemo(() => {
        const greenDot = primarySeatingPosition;
        if (greenDot && Number.isFinite(greenDot.x) && Number.isFinite(greenDot.y)) {
            let closestSeat = null; let minDist = Infinity;
            seats.forEach(s => {
                if (!Number.isFinite(s?.x) || !Number.isFinite(s?.y)) return;
                const d = Math.hypot(s.x - greenDot.x, s.y - greenDot.y);
                if (d < minDist) { minDist = d; closestSeat = s.id; }
            });
            if (minDist <= 0.05 && closestSeat) return closestSeat;
        }
        // No fallback: if no physical seat is within 0.05 m of the canonical RSP,
        // no seat carries the RSP badge.
        return null;
    }, [seats, primarySeatingPosition]);

    // resolveScreenMetricsSnapshot — always reads from the live screen object.
    // Used by ReportHeader to snapshot metrics at print time.
    const resolveScreenMetricsSnapshot = React.useCallback(() => {
        try {
            // Use the same single authority as the live Front Elevation so manual
            // screen dimensions, TV presets, and visibleWidthInches all resolve
            // identically.  Previously this used computeScreenMetrics (width ÷ aspect)
            // which ignored manualSize overrides and produced stale screen heights.
            const dims = resolveEffectiveViewableDimsM(app?.screen);
            const viewWm = dims.widthM;
            const viewHm = dims.heightM;
            const rawBorder = Number(app?.screen?.borderThicknessM);
            const borderThicknessM = Number.isFinite(rawBorder) && rawBorder > 0 ? rawBorder : 0.08;
            const overallWm = viewWm + borderThicknessM * 2;
            const overallHm = viewHm + borderThicknessM * 2;
            const screenFrontPlaneM = resolveRspScreenFrontPlaneM(app?.screenFrontPlaneM, app?.screen);
            return {
                ok: true, viewWm, viewHm, overallWm, overallHm,
                wallDistM: Number.isFinite(screenFrontPlaneM) ? screenFrontPlaneM : null,
                screenChoiceLabel: formatScreenChoiceLabel(app?.screen)
            };
        } catch {
            return { ok: true, viewWm: null, viewHm: null, overallWm: null, overallHm: null, wallDistM: null, screenChoiceLabel: formatScreenChoiceLabel(app?.screen) };
        }
    }, [app?.screenFrontPlaneM, app?.screen?.frontPlaneYm, app?.screen?.borderThicknessM, app?.screen]);

    // The report waits for project, engineering publication, and durable bass
    // hydration. It must never render or print a partial summary first.
    const showLoadingReport = reportHydrating || (explicitProjectId && reportReadyProjectId !== explicitProjectId) || authorityReportPending || authorityResolving || bassReportPending;

    // READ-ONLY: useAnalysisSpeakers, useAllSeatSplMetrics, and
    // useRP22AnalysisEngine are NOT called here. The authoritative RP22
    // analysisResult is read from the Design Review handoff published by the
    // Room Designer. The report never recalculates RP22 parameters.
    const analysisResult = designReviewHandoff?.analysisResult ?? null;

    // PASSIVE CONSUMER: all seat grouping, counts, floors and diagnostics
    // are read from the immutable summary published by Room Designer.
    const reportSeatHudById = engineeringSummary?.seatHudById || {};
    const reportCounts = engineeringSummary?.project?.reportCounts || {};
    const roomLevelCounts = reportCounts.roomLevelCounts || { L4: 0, L3: 0, L2: 0, L1: 0, fail: 0, unassessed: 0 };
    const roomCalculatedCount = reportCounts.roomCalculatedCount || 0;
    const seatCountsByRow = reportCounts.seatCountsByRow || [];
    const seatCompromiseById = reportCounts.seatCompromiseById || {};
    const roomScopedParamCount = reportCounts.roomParameterCount || 0;
    const seatScopedParamCount = reportCounts.seatParameterCount || 0;
    const coverageResult = engineeringSummary?.project?.coverage || null;
    const coverageSentence = coverageResult?.statement || null;

    // ── Artcoustic System Design Rating — READ from published handoff ──────
    // The Technical Report does NOT regenerate the Design Rating. It reads
    // the roomDesignRating, scopedRatings, and seatDesignRatings that the
    // Room Designer already computed and published to the Design Review
    // handoff. No buildArtcousticDesignRatingAuthority, calculateRoomDesignRating,
    // calculateScopedRoomDesignRating, or calculateSeatDesignRating calls.
    const roomDesignRating = showDesignRating
        ? (engineeringSummary?.project?.rating ?? null)
        : null;
    // A report that states the design is not assessed must not offer an enabled
    // PDF export. Only an explicit NOT_ASSESSED rating blocks it — a hidden
    // rating display preference never blocks the export.
    const designAssessmentComplete = !(showDesignRating && roomDesignRating?.status === "NOT_ASSESSED");
    const scopedRatings = engineeringSummary?.designRating?.scopedRatings ?? null;
    const seatDesignRatings = engineeringSummary?.designRating?.seatDesignRatings ?? null;

    // Export gate: recommendations are read from the handoff, not evaluated
    // locally. The gate checks the published settlement state only.
    const recommendationsPending = false;

    // ── Forensic autoPrint readiness instrumentation ──────────────────────
    // Single immutable snapshot — the diagnostics hook logs every field
    // transition, emits a periodic wait report while preparing, patches
    // window.print to log when called, and identifies the first blocking
    // condition. Instrumentation only — no gating, no side effects.
    const autoPrintState = {
        autoPrintRequested: !!autoPrintRequested,
        reportReady: !reportHydrating && !!explicitProjectId && reportReadyProjectId === explicitProjectId,
        designReviewHandoffReady: !!designReviewHandoff,
        analysisResultReady: !!engineeringSummary && reportAuthority.reportComplete,
        engineeringSummaryReady: !!engineeringSummary,
        recommendationsReady: designRecommendations != null,
        renderGatePassed: !!engineeringSummary && reportAuthority.reportComplete && !showLoadingReport,
        planCaptureReady: planImageDataUrl !== null && planDimsImageDataUrl !== null && planSpeakerDimsImageDataUrl !== null,
        autoPrintTriggered: !!autoPrintTriggeredRef.current,
        isPrinting: !!isPrinting,
        autoPrintDone: !!autoPrintDone,
        isAutoPrintPreparing: !!autoPrintRequested && !autoPrintDone,
        authoritySummaryPending: !!authorityReportPending,
    };
    useAutoPrintReadinessInstrumentation(autoPrintState);

    // ── ASDR contributions by key — for parameter card footers ────────────
    // Maps the canonical contributions array to a { p1: {...}, p12: {...}, screen: {...} } lookup
    // so RP22ReportParameterGrid can display per-card ASDR footers without recalculating.
    const asdrContributionsByKey = React.useMemo(() => {
        if (!roomDesignRating?.contributions) return null;
        const map = {};
        for (const contrib of roomDesignRating.contributions) {
            map[contrib.key] = contrib;
        }
        return map;
    }, [roomDesignRating]);

    // ── Sightline page derived data ──────────────────────────────────────────
    const projector = React.useMemo(() => {
        return (app?.roomElements || []).find(el => el.type === 'projector');
    }, [app?.roomElements]);

    const canRenderSightlinePage = React.useMemo(() => {
        if (!projector) return false;
        const proj = Number.isFinite(projector.x_lens_m) && Number.isFinite(projector.y_lens_m) && Number.isFinite(projector.z_lens_m);
        const scr  = Number.isFinite(app?.screenFrontPlaneM) && Number.isFinite(app?.screen?.visibleWidthInches) && Number(app?.screen?.visibleWidthInches) > 0;
        const seat = (app?.seatingPositions?.length || 0) > 0;
        const room = Number.isFinite(app?.roomDims?.heightM) && Number(app?.roomDims?.heightM) > 0;
        return proj && scr && seat && room;
    }, [projector, app?.screenFrontPlaneM, app?.screen?.visibleWidthInches, app?.seatingPositions, app?.roomDims?.heightM]);

    const sightlineScreenMetrics = React.useMemo(() => {
        if (!canRenderSightlinePage) return null;
        const visibleWidthInches = Number(app?.screen?.visibleWidthInches || 0);
        const aspectRatio = app?.screen?.aspectRatio || '16:9';
        const { viewWm, viewHm, overallWm, overallHm } = resolveScreenMetricsSnapshot() || {};
        const resolvedViewWm = viewWm ?? (visibleWidthInches * 0.0254);
        const resolvedViewHm = viewHm ?? (resolvedViewWm * (aspectRatio === '16:9' ? 9/16 : 1/2.35));
        const resolvedOverallWm = overallWm ?? (resolvedViewWm + 0.16);
        const resolvedOverallHm = overallHm ?? (resolvedViewHm + 0.16);
        const heightFromFloor = Number(app?.screen?.heightFromFloorM ?? app?.screenHeight ?? 0.5);
        return {
            screenFrontPlaneY: app?.screenFrontPlaneM,
            screenWidthM:      resolvedViewWm,
            screenHeightM:     resolvedViewHm,
            screenTotalWidthM: resolvedOverallWm,
            screenTotalHeightM: resolvedOverallHm,
            screenBottomHeightM: heightFromFloor,
            screenCenterHeightM: heightFromFloor + resolvedViewHm / 2,
            screenTopHeightM:    heightFromFloor + resolvedViewHm,
        };
    }, [canRenderSightlinePage, app?.screen, app?.screenFrontPlaneM, app?.screenHeight, resolveScreenMetricsSnapshot]);

    const rowCentralSeats = React.useMemo(() => {
        // Used by all report/export row-based RP23 sections
        const grouped = {};
        (app?.seatingPositions || []).forEach(seat => {
            const row = seat.rowNumber || 1;
            if (!grouped[row]) grouped[row] = [];
            grouped[row].push(seat);
        });
        const roomCentreX = stableDimensions.width / 2;
        return Object.keys(grouped)
            .map(Number)
            .sort((a, b) => a - b)
            .map(rowNum => {
                const rowSeats = grouped[rowNum];
                return rowSeats
                    .slice()
                    .sort((a, b) => {
                        const da = Math.abs(a.x - roomCentreX);
                        const db = Math.abs(b.x - roomCentreX);
                        if (Math.abs(da - db) > 0.001) return da - db;
                        return String(a.id || '').localeCompare(String(b.id || ''));
                    })[0];
            })
            .filter(Boolean);
    }, [app?.seatingPositions, stableDimensions.width]);

    const sightlineRowData = React.useMemo(() => {
        if (!canRenderSightlinePage || !sightlineScreenMetrics || !rowCentralSeats.length) return [];
        const { screenFrontPlaneY, screenBottomHeightM, screenTopHeightM, screenWidthM } = sightlineScreenMetrics;
        const aspectRatio = app?.screen?.aspectRatio || '16:9';
        return rowCentralSeats.map(seat => {
            const eyeY = seat.y;
            const rowNum = seat.rowNumber || 1;
            // Use per-row ear heights matching SeatingLayout's getEarHeightForRow defaults.
            // seat.z defaults to 1.2 for every row, so we apply the intended staggered heights here.
            const defaultEarHeight = rowNum === 1 ? 1.2 : rowNum === 2 ? 1.5 : rowNum === 3 ? 1.8 : 1.2 + (rowNum - 1) * 0.3;
            const eyeZ = Number.isFinite(seat.z) && seat.z !== 1.2 ? seat.z : defaultEarHeight;
            const viewingDistanceM = Math.abs(eyeY - screenFrontPlaneY);
            const rawHorizontalAngle = viewingDistanceM > 0
                ? 2 * Math.atan((screenWidthM / 2) / viewingDistanceM) * (180 / Math.PI)
                : 0;
            const horizontalViewingAngleDeg = rp23DisplayAngleDeg(rawHorizontalAngle);
            const verticalAngleToTopDeg    = viewingDistanceM > 0 ? Math.atan2(screenTopHeightM    - eyeZ, viewingDistanceM) * (180 / Math.PI) : 0;
            const verticalAngleToBottomDeg = viewingDistanceM > 0 ? Math.atan2(screenBottomHeightM - eyeZ, viewingDistanceM) * (180 / Math.PI) : 0;
            const totalVerticalAngleDeg    = verticalAngleToTopDeg - verticalAngleToBottomDeg;
            const seatHud = reportSeatHudById?.[seat.id];
            const rp23 = seatHud?.rp23;
            const complianceNote = rp23?.level
                ? `RP23 H: ${rp23.formatted || `${horizontalViewingAngleDeg}°`} (${rp23.level})`
                : '—';
            return {
                rowNumber: seat.rowNumber || 1,
                seatId:    seat.id,
                eyeY, eyeZ,
                viewingDistanceM,
                rawHorizontalAngle,
                horizontalViewingAngleDeg,
                verticalAngleToTopDeg,
                verticalAngleToBottomDeg,
                totalVerticalAngleDeg,
                complianceNote,
                rp23Level: rp23?.level ?? null,
                rp23Formatted: rp23?.formatted ?? null,
            };
        });
    }, [canRenderSightlinePage, sightlineScreenMetrics, rowCentralSeats, app?.screen?.aspectRatio, reportSeatHudById]);
    // ── end sightline data ───────────────────────────────────────────────────

    // The products selected in THIS version. One derivation, shared with the
    // frozen Engineering Snapshot, so a System Design Comparison states exactly
    // the products this report states for each version.
    const systemSummary = React.useMemo(() => {
        const selected = buildProductsSelected({
            placedSpeakers,
            frontSubsCfg,
            rearSubsCfg,
            acousticTreatmentEnabled: app?.acousticTreatmentEnabled,
            selectedAbfuserQty: app?.selectedAbfuserQty,
            isVisible: app?.getSpeakerVisibility,
        });
        return {
            lcr: selected.lcr,
            surrounds: selected.surrounds,
            overheads: selected.overheads,
            subs: selected.subwoofers,
            acousticTreatment: selected.acoustic_treatment,
        };
    }, [placedSpeakers, frontSubsCfg, rearSubsCfg, app?.getSpeakerVisibility, app?.acousticTreatmentEnabled, app?.selectedAbfuserQty]);

    const exportSystemConfiguration = React.useMemo(() => {
        const dolbyPreset = app?.dolbyLayout || "5.1";
        const base = String(dolbyPreset).split(" ")[0];
        const parts = base.split(".");
        const bed = parts[0] || "5";
        const heights = parts[2] || "";
        const totalSubs = Number(app?.frontSubsCfg?.count ?? 0) + Number(app?.rearSubsCfg?.count ?? 0);
        return heights ? `${bed}.${totalSubs}.${heights}` : `${bed}.${totalSubs}`;
    }, [app?.dolbyLayout, app?.frontSubsCfg?.count, app?.rearSubsCfg?.count]);

    const exportDateLabel = React.useMemo(() => {
        return new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
    }, []);

    const frontPageProjectDetails = React.useMemo(() => {
        if (!projectDetails) return null;
        return {
            ...reportProjectDetails,
            extraItems: [
                { label: 'Date', value: exportDateLabel },
            ],
        };
    }, [reportProjectDetails, exportDateLabel, exportSystemConfiguration]);

    // FIX 3: If autoPrint was requested but no explicit project ID was provided,
    // block the report entirely. Never substitute a globally active project.
    if (!embed && reportProjectError) {
        return (
            <div className="min-h-screen bg-[#F9F8F6] p-6 flex items-center justify-center">
                <Card className="max-w-xl mx-auto w-full">
                    <CardHeader><CardTitle className="text-[#1B1A1A] font-header">Technical Report</CardTitle></CardHeader>
                    <CardContent className="text-center py-10">
                        <BarChart4 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <p className="text-[#3E4349]">{reportProjectError}</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (!embed && (authorityReadFailed || bassRestoreFailed)) {
        const readFailureMessage = reportAuthority.readError
            || reportAuthority.bassRestoreError
            || "Saved engineering authority could not be read. Nothing has been treated as missing or uncalculated.";
        return (
            <div className="min-h-screen bg-[#F9F8F6] p-6 flex items-center justify-center">
                <Card className="max-w-xl mx-auto w-full">
                    <CardHeader><CardTitle className="text-[#1B1A1A] font-header">Saved engineering authority could not be read</CardTitle></CardHeader>
                    <CardContent className="text-center py-10">
                        <BarChart4 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <p className="text-[#3E4349] mb-6">{readFailureMessage}</p>
                        <div className="flex justify-center gap-3">
                            <button type="button" className="px-5 py-2.5 text-sm text-white rounded-md" style={{ backgroundColor: '#213428' }} onClick={reportAuthority.retry}>Retry</button>
                            <button type="button" className="px-5 py-2.5 text-sm rounded-md border border-[#213428] text-[#213428]" onClick={() => navigate('/RoomDesigner?projectId=' + encodeURIComponent(explicitProjectId || ''))}>Back to Room Designer</button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (!embed && reportDataIncomplete) {
        return (
            <div className="min-h-screen bg-[#F9F8F6] p-6 flex items-center justify-center">
                <Card className="max-w-xl mx-auto w-full">
                    <CardHeader><CardTitle className="text-[#1B1A1A] font-header">Technical Report not ready</CardTitle></CardHeader>
                    <CardContent className="text-center py-10">
                        <BarChart4 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <p className="text-[#3E4349] mb-6">{reportDataIncompleteReason}</p>
                        <button
                            type="button"
                            className="px-5 py-2.5 text-sm text-white rounded-md"
                            style={{ backgroundColor: '#213428' }}
                            onClick={() => navigate(`/RoomDesigner?projectId=${explicitProjectId}`)}
                        >
                            Continue analysis
                        </button>
                        <ReportGateDiagnosticsPanel diagnostics={gateDiagnostics} />
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (!embed && !app) {
        return (
            <div className="min-h-screen bg-[#F9F8F6] p-6 flex items-center justify-center">
                <div className="text-center text-[#3E4349]">
                    <p>App state is not initialised.</p>
                    <p>Please open the Room Designer first, then return to this report.</p>
                </div>
            </div>
        );
    }

    const parameterGridProps = {
        engineeringSummary,
        analysisResult,
        seatHudSnapshots: reportSeatHudById,
        seatingPositions: seats,
        mlpSeatId: rspSeatId,
        contributionsByKey: showDesignRating ? asdrContributionsByKey : null,
    };

    const coverBoxStyle = {
        border: '1.5px solid #D9D5CE',
        borderRadius: '10px',
        padding: '9mm 11mm',
        background: '#FBFAF8',
        width: '100%',
        boxShadow: 'none',
    };

    const coverBoxTitleStyle = {
        fontSize: '16pt',
        fontWeight: 700,
        color: '#1B1A1A',
        marginBottom: '5mm',
        textAlign: 'center',
        lineHeight: 1.15,
    };

    const coverBoxSubtitleStyle = {
        fontSize: '10.5pt',
        color: '#3E4349',
        marginBottom: '5mm',
        textAlign: 'center',
        lineHeight: 1.35,
    };

    const coverSectionTitleStyle = {
        fontWeight: 600,
        fontSize: '11.5pt',
        color: '#1B1A1A',
        marginBottom: '3.5mm',
        lineHeight: 1.2,
    };

    const coverLabelValueRowStyle = {
        display: 'grid',
        gridTemplateColumns: '32mm 1fr',
        columnGap: '4mm',
        alignItems: 'baseline',
    };

    const coverLabelStyle = {
        fontSize: '10.5pt',
        fontWeight: 600,
        color: '#1B1A1A',
        lineHeight: 1.35,
    };

    const coverValueStyle = {
        fontSize: '10.5pt',
        color: '#3E4349',
        lineHeight: 1.35,
    };

    const planEnabled = true;

    if (showLoadingReport && isAutoPrintPreparing) {
        return (
            <div className="min-h-screen bg-white flex items-center justify-center">
                <div className="flex flex-col items-center gap-6">
                    <div className="w-10 h-10 border-[3px] border-[#E6E4DD] border-t-[#213428] rounded-full animate-spin" />
                    <div style={{ fontSize: 18, fontWeight: 400, color: '#213428', fontFamily: REPORT_FONT_HEADING, letterSpacing: '0.01em' }}>
                        Preparing Technical Report…
                    </div>
                </div>
            </div>
        );
    }

    return !embed && showLoadingReport ? (
        <div className="min-h-screen bg-[#F9F8F6] p-6 flex items-center justify-center">
            <Card className="max-w-xl mx-auto w-full">
                <CardHeader><CardTitle className="text-[#1B1A1A] font-header">RP22 Compliance Report</CardTitle></CardHeader>
                <CardContent className="text-center py-10">
                    <BarChart4 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-[#3E4349]">Loading saved report data…</p>
                </CardContent>
            </Card>
        </div>
    ) : (
        <div className={embed ? 'technical-report-embedded' : 'min-h-screen bg-[#F9F8F6] p-6'}>
            <ReportPrintStyles />

            {/* Saved report: generated before the latest changes. The report
                stays visible; Regenerate overwrites the saved report in place. */}
            <div className="screen-only">
                <ReportSnapshotBanner
                    status={reportSnapshot.status}
                    reportType={REPORT_SNAPSHOT_TYPE.TECHNICAL}
                    changedKeys={reportSnapshot.changedKeys}
                    generatedAt={reportSnapshot.generatedAt}
                    generatedBy={reportSnapshot.generatedBy}
                    regenerating={reportSnapshot.saving}
                    onRegenerate={reportSnapshot.regenerate}
                    evidenceIncomplete={reportSnapshot.evidenceIncomplete}
                    evidenceMismatches={reportSnapshot.evidenceMismatches}
                />
            </div>

            {/* Assessment gate — the report says the design is not assessed, so
                the PDF export is disabled and the reason is stated plainly. */}
            {!designAssessmentComplete && (
                <TechnicalReportNotice title="This design has not been assessed.">
                    Complete the RP22 assessment in the Room Designer to enable PDF export. The report can still be
                    viewed here.
                </TechnicalReportNotice>
            )}

            {/* The version points at a publication that cannot be read. Say so
                plainly instead of letting current values read as the saved
                report. The saved report is never silently replaced. */}
            {reportAuthority?.state === 'PUBLISHED_STALE' && (
                <TechnicalReportNotice title="The saved report for this version could not be read.">
                    The values shown come from the current design. Open this project in the Room Designer to save it
                    again.
                </TechnicalReportNotice>
            )}

            {/* READ-ONLY: DesignRecommendationEngine is NOT mounted here.
                The report reads already-settled recommendations from the
                Design Review handoff published by the Room Designer. */}

            <div className="screen-only">
                <ReportHiddenCaptures
                    app={app}
                    placedSpeakers={placedSpeakers}
                    seats={seats}
                    primarySeatingPosition={primarySeatingPosition}
                    screen={screen}
                    dolbyLayout={dolbyLayout}
                />

                {isAutoPrintPreparing ? (
                    <div className="flex flex-col items-center justify-center" style={{ minHeight: 'calc(100vh - 200px)', gap: 24 }}>
                        <div className="w-10 h-10 border-[3px] border-[#E6E4DD] border-t-[#213428] rounded-full animate-spin" />
                        <div style={{ fontSize: 18, fontWeight: 400, color: '#213428', fontFamily: REPORT_FONT_HEADING, letterSpacing: '0.01em' }}>
                            Preparing Technical Report…
                        </div>
                    </div>
                ) : (
                <div className="max-w-7xl mx-auto space-y-6">
                    {/* Screen-only navigation. Every link carries the version
                        being viewed and, when the report came from the Project
                        Library, the route back to it. */}
                    <TechnicalReportNavBar
                        projectId={explicitProjectId}
                        versionId={reportVersionId}
                    />

                    <ReportHeader
                        app={app}
                        seats={seats}
                        placedSpeakers={placedSpeakers}
                        roomDims={roomDims}
                        primarySeatingPosition={primarySeatingPosition}
                        frontSubsCfg={frontSubsCfg}
                        rearSubsCfg={rearSubsCfg}
                        roomElements={app?.roomElements || []}
                        projector={projector || null}
                        screenMetrics={resolveScreenMetricsSnapshot()}
                        debugPlanCapture={debugPlanCapture}
                        setDebugPlanCapture={setDebugPlanCapture}
                        showCadExportMenu={showCadExportMenu}
                        setShowCadExportMenu={setShowCadExportMenu}
                        exportGuardRef={exportGuardRef}
                        exportTimeoutRef={exportTimeoutRef}
                        EXPORT_TIMEOUT_MS={EXPORT_TIMEOUT_MS}
                        printTitle={technicalReportPrintTitle}
                        // The on-screen cover states the same identity line as the
                        // printed first page — project, client, design version and
                        // project reference — from the one shared builder, so the
                        // page itself names the version it documents.
                        screenMeta={technicalFirstPageMeta}
                        printWindowRef={printWindowRef}
                        onPrintFallback={printTechnicalReport}
                        resolveScreenMetricsSnapshot={resolveScreenMetricsSnapshot}
                        setScreenMetricsForPrint={setScreenMetricsForPrint}
                        setScreenMetricsStatus={setScreenMetricsStatus}
                        setExportStatus={setExportStatus}
                        setExportDebug={setExportDebug}
                        setHasPrintedOnce={setHasPrintedOnce}
                        setPlanImageDataUrl={setPlanImageDataUrl}
                        setPlanDimsImageDataUrl={setPlanDimsImageDataUrl}
                        setPlanSpeakerDimsImageDataUrl={setPlanSpeakerDimsImageDataUrl}
                        setIsPrinting={setIsPrinting}
                        exportDisabled={!filenameIdentity.ready || reportHydrating || (explicitProjectId && reportReadyProjectId !== explicitProjectId) || authorityReportPending || bassReportPending || bassRestoreFailed || reportDataIncomplete || recommendationsPending || !designAssessmentComplete}
                        exportDisabledMessage={reportDataIncomplete ? reportDataIncompleteReason : (!designAssessmentComplete ? "Complete assessment to export PDF" : (authorityReportPending ? "Engineering summary loading" : (recommendationsPending ? "Recommendations evaluating" : "Report loading")))}
                        lcrAngleInfo={(() => {
                            // Compute LCR angles exactly as Plan View does:
                            // lcrAimMode === 'angled' → compute yaw from speaker position to MLP
                            // lcrAimMode === 'flat'   → L=0, R=0
                            const lcrAimMode = app?.lcrAimMode || 'flat';
                            const info = { L: 0, R: 0 };
                            if (lcrAimMode === 'angled' && primarySeatingPosition) {
                                const mlpTarget = { x: primarySeatingPosition.x, y: primarySeatingPosition.y };
                                const fl = placedSpeakers.find(s => { const c = String(s?.role || '').toUpperCase(); return (c === 'FL' || c === 'L') && s?.position; });
                                const fr = placedSpeakers.find(s => { const c = String(s?.role || '').toUpperCase(); return (c === 'FR' || c === 'R') && s?.position; });
                                if (fl?.position) info.L = safeYawToMLP(fl.position, mlpTarget) ?? 0;
                                if (fr?.position) info.R = safeYawToMLP(fr.position, mlpTarget) ?? 0;
                            }
                            return info;
                        })()}
                        aimToggles={{
                            aimFrontWidesAtMLP:    !!app?.aimFrontWidesAtMLP,
                            aimSideSurroundsAtMLP: !!app?.aimSideSurroundsAtMLP,
                            aimRearSurroundsAtMLP: !!app?.aimRearSurroundsAtMLP,
                        }}
                    />

                    <div className="border-b border-[#E6E4DD]" />

                    <ProjectDetailsCard
                        project={frontPageProjectDetails}
                        extraItems={frontPageProjectDetails?.extraItems || []}
                        title={`Project details — System Configuration — ${exportSystemConfiguration || '—'}`}
                        subtitle=""
                        hideProjectId={true}
                    />

                    <ReportCountsDashboard
                        roomLevelCounts={roomLevelCounts}
                        seatCountsByRow={seatCountsByRow}
                        analysisResult={analysisResult}
                        totalRoomParameters={roomScopedParamCount}
                        totalSeatParameters={seatScopedParamCount}
                    />

                    {coverageSentence && (
                        <Rp22SeatCoverageSentence sentence={coverageSentence} variant="screen" />
                    )}

                    {/* ── RP23 row + RP22 Parameters — all inside one card so widths match ── */}
                    <Card className="bg-[#FFFFFF] border-[#DCDBD6]">
                        <CardHeader>
                            <CardTitle className="text-[#1B1A1A] font-header">RP22 Parameters</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {/* RP23 row — one result per seating row, read from the shared
                                published viewing authority (the same one the Visual Report
                                Viewing Experience page and the seat pop-up read). */}
                            <TechnicalRp23Rows
                                representativeSeats={rowCentralSeats}
                                engineeringSummary={engineeringSummary}
                            />

                            <RP22ReportParameterGrid {...parameterGridProps} />
                        </CardContent>
                    </Card>

                    {/* ── Screen-only scoped ASDR header ── */}
                    {showDesignRating && scopedRatings && (
                        <div style={{
                            background: '#FFFFFF',
                            border: '1px solid #DCDBD6',
                            borderRadius: 8,
                            padding: '20px 24px',
                        }}>
                            <div style={{ fontFamily: REPORT_FONT_HEADING, fontSize: 16, fontWeight: 400, color: '#213428', marginBottom: 12, letterSpacing: '0.01em' }}>
                                ARTCOUSTIC SYSTEM DESIGN RATING
                            </div>
                            <ScopedAsdrSummary engineeringSummary={engineeringSummary} />
                            <div style={{ marginTop: 12, fontSize: 10, color: '#9B8E82', fontStyle: 'italic', fontFamily: REPORT_FONT_BODY }}>
                                Sound Proof proprietary design metric. Not part of CEDIA RP22 or RP23.
                            </div>
                        </div>
                    )}

                    {/* ── Screen-only neutral engineering summary ──
                        The Technical Report documents the finished design. It gives
                        no post-design change advice: design changes are proposed and
                        applied in the Bass Optimiser workflow, before report
                        generation. ── */}
                    <TechnicalEngineeringSummaryNote />

                    {/* ── Bass response graphs — the final technical evidence pages,
                        placed after the RP22 parameter flow so they never interrupt
                        it. Rendered only when the saved bass authority is CURRENT
                        and carries a finished graph payload; stale or absent bass
                        renders nothing (the report's own gates already block). ── */}
                    <BassResponseGraphSection
                        contract={completedBassAuthority?.contract || null}
                        authoritative={completedBassAuthority?.authoritative === true}
                        seats={seats}
                        roomDims={{
                            widthM: stableDimensions.width,
                            lengthM: stableDimensions.length,
                            heightM: stableDimensions.height,
                        }}
                        p19Result={p19ReportResult}
                        variant="screen"
                    />

                </div>
                )}
            </div>

            {/* Print-only layout */}
            <div className="print-only print-keep-layout">
                <div className="print-root" ref={printReportRef}>
                    <div className="print-container rp22-report">
                        <ReportTypographyStyles scope=".rp22-report" profile="a4" />
                        <section id="pdf-cover">
                            {/* ── The Technical Report's own front page ──────────────
                                The RP22 level definitions and the RP23 image statement
                                are the report's reference material: they now print on the
                                "How to Read This Report" page in the back matter,
                                immediately before the closing About page. This page keeps
                                the cover and this report's own seating-coverage statement.
                                In the consolidated Project Report the cover belongs to the
                                document's own front section, so this page is not printed
                                there at all and the technical pages open on Project &
                                System Overview. ── */}
                            {!embed && (
                                <div className="print-summary report-page-block report-page-block--cover" data-report-block="cover" data-report-page-start="true">
                                    <ReportCover variant="print" project={projectDetails} meta={technicalFirstPageMeta} />
                                    {coverageSentence && (
                                        <div style={{ maxWidth: '185mm', margin: '0 auto', marginTop: '5mm' }}>
                                            <Rp22SeatCoverageSentence sentence={coverageSentence} variant="cover" />
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ── Page 2: Project & System Overview ── */}
                            <div className="report-page-block report-page-block--summary" data-report-block="project-overview" data-report-page-start="true">
                                <TechnicalProjectOverview
                                    projectDetails={reportProjectDetails}
                                    exportDateLabel={exportDateLabel}
                                    exportSystemConfiguration={exportSystemConfiguration}
                                    screenChoiceLabel={formatScreenChoiceLabel(app?.screen)}
                                    screenMetrics={resolveScreenMetricsSnapshot()}
                                    rowCentralSeats={rowCentralSeats}
                                    screenFrontPlaneM={app?.screenFrontPlaneM}
                                    screen={screen}
                                    systemSummary={systemSummary}
                                />
                            </div>

                            {/* ── Page 3: RP22 Performance Summary ── */}
                            <div className="report-page-block report-page-block--summary" data-report-block="performance-summary" data-report-page-start="true">
                                <TechnicalPerformanceSummary
                                    engineeringSummary={engineeringSummary}
                                    rspSeatId={rspSeatId}
                                    showDesignRating={showDesignRating}
                                />
                            </div>

                            {/* ── Page 3b: ASDR Scorecard ── */}
                            {showDesignRating && roomDesignRating && (
                                <div className="report-page-block report-page-block--summary" data-report-block="asdr-scorecard" data-report-page-start="true">
                                    <TechnicalAsdrScorecard
                                        roomDesignRating={roomDesignRating}
                                        showDesignRating={showDesignRating}
                                        engineeringSummary={engineeringSummary}
                                        rspSeatId={rspSeatId}
                                    />
                                </div>
                            )}

                            {/* The former Page 3c ADI Assessment page is deliberately
                                absent: the Technical Report documents the finished
                                design and carries no post-design change advice.
                                Advised design changes belong to the Bass Optimiser
                                workflow, and a limitation shows through the parameter
                                result itself. */}
                            </section>

                        {planEnabled && typeof planImageDataUrl === 'string' && planImageDataUrl.length > 0 && planImageDataUrl !== '__SKIP__' && (
                            <ReportDrawingPage
                                id="pdf-room-plan"
                                blockName="floor-plan"
                                title="Room Plan"
                                projectName={projectDetails?.name || ''}
                                clientName={projectDetails?.client_name || ''}
                                imageSrc={planImageDataUrl}
                                imageAlt="Room plan"
                            />
                        )}

                        {planEnabled && typeof planDimsImageDataUrl === 'string' && planDimsImageDataUrl.length > 0 && planDimsImageDataUrl !== '__SKIP__' && (
                            <ReportDrawingPage
                                id="pdf-room-plan-dims"
                                blockName="dimensioned-floor-plan"
                                title="Room Dimensions"
                                projectName={projectDetails?.name || ''}
                                clientName={projectDetails?.client_name || ''}
                                imageSrc={planDimsImageDataUrl}
                                imageAlt="Room dimensions plan"
                            />
                        )}

                        {planEnabled && typeof planSpeakerDimsImageDataUrl === 'string' && planSpeakerDimsImageDataUrl.length > 0 && planSpeakerDimsImageDataUrl !== '__SKIP__' && (
                            <ReportDrawingPage
                                id="pdf-room-plan-positions"
                                blockName="speaker-plan"
                                title="Speaker Position Plan"
                                projectName={projectDetails?.name || ''}
                                clientName={projectDetails?.client_name || ''}
                                sheetCode="SP-01"
                                status="NOT FOR SCALING"
                                imageSrc={planSpeakerDimsImageDataUrl}
                                imageAlt="Speaker position plan"
                            />
                        )}

                        <section id="pdf-room-parameters">
                            <RP22ReportParameterGrid {...parameterGridProps} variant="print" />
                        </section>

                        {/* ── Drawing set: every page uses one fixed printable frame ── */}
                        <ReportDrawingPage
                            id="pdf-elevation-front"
                            blockName="front-elevation"
                            title="Elevation Drawing · Front"
                            projectName={projectDetails?.name || ''}
                            clientName={projectDetails?.client_name || ''}
                            sheetCode="EL-F"
                            status="NOT FOR SCALING"
                        >
                            <FrontElevation
                                dimensions={stableDimensions}
                                screen={screen}
                                placedSpeakers={placedSpeakers}
                                frontSubs={frontSubs}
                                frontSubsCfg={frontSubsCfg}
                                roomElements={(app?.roomElements || []).filter(el => el?.type !== 'projector')}
                            />
                        </ReportDrawingPage>

                        <ReportDrawingPage
                            id="pdf-elevation-left"
                            blockName="left-elevation"
                            title="Elevation Drawing · Left"
                            projectName={projectDetails?.name || ''}
                            clientName={projectDetails?.client_name || ''}
                            sheetCode="EL-L"
                            status="NOT FOR SCALING"
                        >
                            <SideElevation
                                wall="left"
                                dimensions={stableDimensions}
                                screen={screen}
                                placedSpeakers={placedSpeakers}
                                frontSubs={frontSubs}
                                frontSubsCfg={frontSubsCfg}
                                rearSubs={safeArray(app?.subwoofers).filter(s => s?.group === 'rear')}
                                rearSubsCfg={rearSubsCfg}
                                seatingPositions={seats}
                                mlpPoint={primarySeatingPosition}
                                roomElements={app?.roomElements || []}
                            />
                        </ReportDrawingPage>

                        <ReportDrawingPage
                            id="pdf-elevation-right"
                            blockName="right-elevation"
                            title="Elevation Drawing · Right"
                            projectName={projectDetails?.name || ''}
                            clientName={projectDetails?.client_name || ''}
                            sheetCode="EL-R"
                            status="NOT FOR SCALING"
                        >
                            <SideElevation
                                wall="right"
                                dimensions={stableDimensions}
                                screen={screen}
                                placedSpeakers={placedSpeakers}
                                frontSubs={frontSubs}
                                frontSubsCfg={frontSubsCfg}
                                rearSubs={safeArray(app?.subwoofers).filter(s => s?.group === 'rear')}
                                rearSubsCfg={rearSubsCfg}
                                seatingPositions={seats}
                                mlpPoint={primarySeatingPosition}
                                roomElements={app?.roomElements || []}
                            />
                        </ReportDrawingPage>

                        {canRenderSightlinePage && sightlineScreenMetrics && sightlineRowData.length > 0 && (
                            <>
                                <ReportDrawingPage
                                    id="pdf-sightlines"
                                    blockName="sightline-drawing"
                                    title="Sightlines & Viewing Angles"
                                    projectName={projectDetails?.name || ''}
                                    clientName={projectDetails?.client_name || ''}
                                    sheetCode="SL-01"
                                    status="NOT FOR SCALING"
                                >
                                    <SightlineGraphic
                                        showHeader={false}
                                        projectName={app?.projectName || ''}
                                        clientName={app?.clientName || ''}
                                        roomWidthM={stableDimensions.width}
                                        roomLengthM={stableDimensions.length}
                                        roomHeightM={stableDimensions.height}
                                        screenWidthM={sightlineScreenMetrics.screenWidthM}
                                        screenHeightM={sightlineScreenMetrics.screenHeightM}
                                        screenTotalWidthM={sightlineScreenMetrics.screenTotalWidthM}
                                        screenTotalHeightM={sightlineScreenMetrics.screenTotalHeightM}
                                        screenFrontPlaneY={sightlineScreenMetrics.screenFrontPlaneY}
                                        screenCenterHeightM={sightlineScreenMetrics.screenCenterHeightM}
                                        screenBottomHeightM={sightlineScreenMetrics.screenBottomHeightM}
                                        screenTopHeightM={sightlineScreenMetrics.screenTopHeightM}
                                        projectorLensX={projector?.x_lens_m}
                                        projectorLensY={projector?.y_lens_m}
                                        projectorLensZ={projector?.z_lens_m}
                                        projectorBodyWidth={projector?.body_width_m}
                                        projectorBodyHeight={projector?.body_height_m}
                                        projectorBodyDepth={projector?.body_depth_m}
                                        rowData={sightlineRowData}
                                        dolbyConfig={exportSystemConfiguration || ''}
                                    />
                                </ReportDrawingPage>

                                <ReportDrawingPage
                                    id="pdf-screen-wall-construction"
                                    blockName="screen-wall-detail"
                                    title="Screen Wall Construction Detail"
                                    projectName={projectDetails?.name || ''}
                                    clientName={projectDetails?.client_name || ''}
                                    sheetCode="SW-01"
                                    status="NOT FOR SCALING"
                                >
                                    <ScreenWallConstructionGraphic
                                        showHeader={false}
                                        projectName={projectDetails?.name || ''}
                                        clientName={projectDetails?.client_name || ''}
                                        roomWidthM={stableDimensions.width}
                                        roomHeightM={stableDimensions.height}
                                        screenWidthM={sightlineScreenMetrics.screenWidthM}
                                        screenHeightM={sightlineScreenMetrics.screenHeightM}
                                        screenTotalWidthM={sightlineScreenMetrics.screenTotalWidthM}
                                        screenTotalHeightM={sightlineScreenMetrics.screenTotalHeightM}
                                        screenBottomHeightM={sightlineScreenMetrics.screenBottomHeightM}
                                        screenTopHeightM={sightlineScreenMetrics.screenTopHeightM}
                                        screenFrontPlaneM={reportScreenFrontPlaneM}
                                        placedSpeakers={placedSpeakers}
                                        frontSubs={frontSubs}
                                        frontSubsCfg={app?.frontSubsCfg}
                                        primarySeatingPosition={primarySeatingPosition}
                                        lcrAimMode={app?.lcrAimMode}
                                        speakerClearanceM={app?.speaker_clearance_m}
                                    />
                                </ReportDrawingPage>
                            </>
                        )}

                        {/* ── Bass response graph pages — the final technical evidence
                            pages, immediately before the closing About Sound Proof
                            page. One full-width graph per printed page, drawn only
                            from the current saved bass authority. ── */}
                        <BassResponseGraphSection
                            contract={completedBassAuthority?.contract || null}
                            authoritative={completedBassAuthority?.authoritative === true}
                            seats={seats}
                            roomDims={{
                                widthM: stableDimensions.width,
                                lengthM: stableDimensions.length,
                                heightM: stableDimensions.height,
                            }}
                            p19Result={p19ReportResult}
                            variant="print"
                        />

                        {/* ── How to Read This Report — the report's reference
                            page: the CEDIA RP22 performance levels, how room-wide
                            and seat-scoped parameters are read, and the RP23 image
                            statement. It follows the technical evidence and prints
                            immediately before the closing About page. ── */}
                        <TechnicalHowToReadSection />

                        {/* ── About Sound Proof — the closing brand page, and a
                            mandatory part of the report: it always renders, from
                            the published copy or the built-in fallback, so the
                            export never carries a "Loading…" page, never a blank
                            page, and never leaves the page out. ── */}
                        <TechnicalAboutSoundProofSection />

                    </div>
                </div>
            </div>
        </div>
    );
}

export default function RP22Report() {
    return <RP22ReportInner />;
}

/**
 * The Technical Report's pages, mounted inside another document — the
 * consolidated Project Report. It is the same report, the same pages and the
 * same print layout; see TechnicalReportDocument.
 */
export function TechnicalReportEmbedded() {
    return <RP22ReportInner embed />;
}