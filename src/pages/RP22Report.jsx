import React, { useEffect, useState, useMemo, useCallback, useRef, useSyncExternalStore } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
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
import RP22GradingPill from '../components/ui/RP22GradingPill';
import { getSpeakerModelMeta } from '../components/models/speakers/registry';
import { computeScreenMetrics } from '../components/utils/screenMetrics';
import { resolveEffectiveViewableDimsM } from '../components/models/screen/resolveEffectiveScreen';
import { calculateViewingAngle } from '../components/utils/viewingAngleUtils';
import { safeYawToMLP } from '@/components/room/rv/RenderPrimitives';
import { deriveSubwoofersFromCfg } from '@/components/utils/deriveSubwoofersFromCfg';
import { hydrateProjectIntoAppState } from '@/components/utils/hydrateProjectIntoAppState';
import { mergeProjectAndVersion } from '@/lib/versionAuthority';
import { base44 } from '@/api/base44Client';
import { useEffectiveRsp } from '@/components/room/rsp/useEffectiveRsp';
import { resolveDesignatedRspSeat, resolveRowDerivedRspYByMode } from '@/components/room/rsp/rspInputResolver';
import { resolveRspScreenFrontPlaneM, resolveRspScreenWidthM } from '@/components/room/rsp/screenGeometryResolver';

// Extracted child components
import ReportPrintStyles from '../components/report/ReportPrintStyles';
import RP22ReportParameterGrid from '../components/report/RP22ReportParameterGrid';
import ReportHeader from '../components/report/ReportHeader';
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
import ScopedAsdrSummary from '@/components/report/technical/ScopedAsdrSummary';
import TechnicalReportRecommendations from '@/components/report/technical/TechnicalReportRecommendations';
import TechnicalAdiAssessment from '@/components/report/technical/TechnicalAdiAssessment';
import { subscribeAsdrVisibility, getAsdrVisibility } from '@/components/state/asdrVisibilityStore';
import { useAuth } from '@/lib/AuthContext';
import { DEFAULT_TERRITORY, getTerritoryConfig } from '@/components/pricing/territoryConfig';
import { resolveSeatPriority, getPrimarySeats, getSecondarySeats } from '@/components/utils/seatPriorityAuthority';
import Rp22SeatCoverageSentence from '@/components/report/Rp22SeatCoverageSentence';
import { buildTechnicalReportTitle } from '@/components/report/reportPdfTitle';
import AboutSoundProofReportPage from '@/components/report/AboutSoundProofReportPage';
import { readDesignReviewHandoff, subscribeDesignReviewHandoff } from '@/components/state/designReviewHandoff';
import { setAuthoritativeReadOnlyMode } from '@/components/state/authoritativeReadOnlyMode';
import { useAutoPrintReadinessInstrumentation, logAutoPrintBlock } from '@/components/report/useAutoPrintReadinessInstrumentation';
import useReportBlockPagination from '@/components/report/useReportBlockPagination';

// --- Main component ---
function RP22ReportInner() {
    const app = useAppState();

    // ── Authoritative Read-Only Mode ──────────────────────────────────────
    // While the Technical Report is mounted, authoritative write boundaries
    // emit a console warning if called. The report is a pure consumer of the
    // published engineering summary: zero publishes, recalculations, or cache
    // hydration. Cleared on unmount.
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
    const showDesignRating = useSyncExternalStore(subscribeAsdrVisibility, getAsdrVisibility);
    const [includeAdiAssessment, setIncludeAdiAssessment] = useState(true);

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
    const reportVersionId = projectDetails?.active_version_id || null;

    const [designReviewHandoff, setDesignReviewHandoff] = useState(
        () => (explicitProjectId && reportVersionId) ? readDesignReviewHandoff(explicitProjectId, reportVersionId) : null
    );
    useEffect(() => {
        if (!explicitProjectId || !reportVersionId) {
            setDesignReviewHandoff(null);
            return;
        }
        const read = (preferStored = false) => {
            const shared = readDesignReviewHandoff(explicitProjectId, reportVersionId, {
                allowStored: true,
                preferStored,
            });
            setDesignReviewHandoff(shared);
        };
        // One-shot read — handles SPA navigation (window value) and direct
        // load (localStorage fallback). Re-runs when projectDetails load.
        read();
        // Same-window and cross-tab publications push the exact canonical
        // snapshot into every open consumer immediately.
        return subscribeDesignReviewHandoff(explicitProjectId, reportVersionId, (snapshot, preferStored) => {
            if (snapshot) setDesignReviewHandoff(snapshot);
            else read(preferStored);
        });
    }, [explicitProjectId, reportVersionId]);
    const designRecommendations = designReviewHandoff?.recommendations ?? null;

    // One published engineering summary is the sole report authority.
    // The printable report never mounts the bass result store, checks a second
    // fingerprint, or reconstructs any parameter presentation.
    const engineeringSummary = designReviewHandoff?.engineeringSummary
        ?? designReviewHandoff?.rating?.engineeringSummary
        ?? null;
    const authorityReportPending = !engineeringSummary;

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
        const sharedProviderReady =
            activeProjectId === explicitProjectId &&
            app?.isProjectHydrationReady === true &&
            Number.isFinite(Number(app?.roomDims?.widthM)) &&
            Number.isFinite(Number(app?.roomDims?.lengthM));

        if (sharedProviderReady) {
            setReportHydrating(false);
            setReportReadyProjectId(explicitProjectId);
            base44.entities.Project.filter({ id: explicitProjectId }).then((results) => {
                if (cancelled) return;
                const p = Array.isArray(results) && results.length > 0 ? results[0] : null;
                if (!p) return;
                setProjectDetails({
                    id: p.id,
                    name: p.name,
                    client_name: p.client_name,
                    project_status: p.project_status,
                    notes: p.notes,
                    created_date: p.created_date,
                    updated_date: p.updated_date,
                    active_version_id: p.active_version_id || null,
                });
            }).catch(() => { /* non-blocking metadata fetch */ });
            return () => { cancelled = true; };
        }

        if (reportReadyProjectId === explicitProjectId && reportHydrating === false) {
            return;
        }

        if (reportReadyProjectId !== explicitProjectId) {
            setReportHydrating(true);
            setReportReadyProjectId(null);
        }

        base44.entities.Project.filter({ id: explicitProjectId }).then(async (results) => {
            if (cancelled) return;
            const p = Array.isArray(results) && results.length > 0 ? results[0] : null;
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
                active_version_id: p.active_version_id || null,
            });
            // Merge with the active ProjectVersion so per-version design fields
            // come from design_state, not from the legacy Project position.
            let merged = p;
            const versionId = p.active_version_id;
            if (versionId) {
                try {
                    const versions = await base44.entities.ProjectVersion.filter({ id: versionId });
                    if (!cancelled && versions && versions.length > 0) {
                        const v = versions[0];
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
    }, [explicitProjectId]);

    const [printReady, setPrintReady] = useState(false);
    const printReportRef = useRef(null);
    useReportBlockPagination(
        printReportRef,
        `${printReady}:${isPrinting}:${planImageDataUrl?.length || 0}:${planDimsImageDataUrl?.length || 0}:${planSpeakerDimsImageDataUrl?.length || 0}`,
    );
    const [debugPlanCapture, setDebugPlanCapture] = useState(false);
    const printLockRef = React.useRef(false);
    const originalPrintTitleRef = React.useRef(null);
    const cleanupTimeoutRef = React.useRef(null);
    const exportGuardRef = React.useRef({ active: false, startedAt: 0 });
    const exportTimeoutRef = React.useRef(null);
    const EXPORT_TIMEOUT_MS = 60000;

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
            if (originalPrintTitleRef.current !== null) {
                document.title = originalPrintTitleRef.current;
                originalPrintTitleRef.current = null;
            }
            if (cleanupTimeoutRef.current) { clearTimeout(cleanupTimeoutRef.current); cleanupTimeoutRef.current = null; }
            if (exportTimeoutRef.current) { clearTimeout(exportTimeoutRef.current); exportTimeoutRef.current = null; }
            exportGuardRef.current.active = false;
        };
        window.addEventListener('afterprint', cleanup);
        return () => {
            window.removeEventListener('afterprint', cleanup);
            if (cleanupTimeoutRef.current) clearTimeout(cleanupTimeoutRef.current);
            if (exportTimeoutRef.current) clearTimeout(exportTimeoutRef.current);
        };
    }, []);

    // Plan capture hooks
    usePlanCapture({ isPrinting, planImageDataUrl, setPlanImageDataUrl, planDimsImageDataUrl, setPlanDimsImageDataUrl, planSpeakerDimsImageDataUrl, setPlanSpeakerDimsImageDataUrl, setExportStatus, exportTimeoutRef, exportGuardRef, setIsPrinting, debugPlanCapture });

    // autoPrint: when navigated from Design Review with ?autoPrint=1, auto-trigger
    // the print pipeline once the report is hydrated and ready.
    const autoPrintRequested = searchParams.get("autoPrint") === "1";
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
        if (reportHydrating || reportReadyProjectId !== explicitProjectId) {
            logAutoPrintBlock(reportHydrating ? 'reportHydrating = true' : 'reportReadyProjectId mismatch', 391);
            return;
        }
        if (authorityReportPending) {
            logAutoPrintBlock('engineeringSummary unavailable', 395);
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
    }, [autoPrintRequested, reportHydrating, explicitProjectId, reportReadyProjectId, isPrinting, authorityReportPending]);

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
            if (originalPrintTitleRef.current === null) {
                originalPrintTitleRef.current = document.title;
            }
            document.title = buildTechnicalReportTitle(projectDetails?.name, { number: reportVersionNumber, name: reportVersionName });
            window.addEventListener("afterprint", () => setAutoPrintDone(true), { once: true });
            window.print();
            cleanupTimeoutRef.current = setTimeout(() => {
                if (isPrinting) {
                    setIsPrinting(false); setPlanImageDataUrl(null);
                    setPlanDimsImageDataUrl(null); setPlanSpeakerDimsImageDataUrl(null);
                    printLockRef.current = false;
                }
            }, 2000);
        }, 250);
        return () => clearTimeout(t);
    }, [isPrinting, printReady, hasPrintedOnce]);

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

    // The report waits only for project hydration and the one published summary.
    const showLoadingReport = reportHydrating || (explicitProjectId && reportReadyProjectId !== explicitProjectId) || authorityReportPending;

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
        analysisResultReady: !!analysisResult && !!analysisResult.gradedParameters,
        engineeringSummaryReady: !!engineeringSummary,
        recommendationsReady: designRecommendations != null,
        renderGatePassed: !!analysisResult && !!analysisResult.gradedParameters && !showLoadingReport,
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

    const systemSummary = React.useMemo(() => {
        const summary = { lcr: [], surrounds: [], overheads: [], subs: [] };
        const normalizeModel = (model) => (!model || model === 'off' || model === 'none') ? null : String(model).trim();
        const activeSpeakers = placedSpeakers.filter(spk => app?.getSpeakerVisibility?.(spk?.role, spk?.model) ?? true);
        const getDisplayName = (modelKey) => {
            if (!modelKey) return null;
            const meta = getSpeakerModelMeta(modelKey);
            if (meta?.label && !meta.notFound) return meta.label;
            return String(modelKey).trim().replace(/[_-][sml]$/i, '').split(/[-_]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
        };
        const byCategory = { lcr: {}, surrounds: {}, overheads: {} };
        activeSpeakers.forEach(spk => {
            const role = String(spk?.role || '').toUpperCase();
            const modelKey = normalizeModel(spk?.model);
            if (!modelKey) return;
            const model = getDisplayName(modelKey) || modelKey;
            let cat = null;
            if (['FL', 'FC', 'FR', 'L', 'C', 'R'].includes(role)) cat = 'lcr';
            else if (
              ['SL', 'SR', 'SBL', 'SBR', 'LW', 'RW', 'LS', 'RS', 'LR', 'RR', 'FWL', 'FWR'].includes(role) ||
              /^(SL|SR)\d+$/.test(role)
            ) cat = 'surrounds';
            else if (role.startsWith('T') || role.startsWith('U')) cat = 'overheads';
            if (cat) byCategory[cat][model] = (byCategory[cat][model] || 0) + 1;
        });
        Object.keys(byCategory).forEach(cat => {
            const models = Object.entries(byCategory[cat])
              .map(([name, count]) => count > 1 ? `${name} × ${count}` : name)
              .sort();
            summary[cat] = models.length > 0 ? models : ['None specified'];
        });
        const frontSubs = frontSubsCfg?.count || 0;
        const rearSubs = rearSubsCfg?.count || 0;
        const frontModel = normalizeModel(frontSubsCfg?.model);
        const rearModel = normalizeModel(rearSubsCfg?.model);
        const subList = [];
        if (frontSubs > 0 && frontModel) { const name = getDisplayName(frontModel) || frontModel; subList.push(frontSubs > 1 ? `${name} × ${frontSubs} (front)` : `${name} (front)`); }
        if (rearSubs > 0 && rearModel) { const name = getDisplayName(rearModel) || rearModel; subList.push(rearSubs > 1 ? `${name} × ${rearSubs} (rear)` : `${name} (rear)`); }
        summary.subs = subList.length > 0 ? subList : ['None specified'];
        // Acoustic treatment (Abfuser product selection)
        if (app?.acousticTreatmentEnabled && Number(app?.selectedAbfuserQty) > 0) {
          summary.acousticTreatment = [`Artcoustic Abfuser × ${Math.floor(Number(app.selectedAbfuserQty))}`];
        } else {
          summary.acousticTreatment = ['None specified'];
        }
        return summary;
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
            ...projectDetails,
            extraItems: [
                { label: 'Date', value: exportDateLabel },
            ],
        };
    }, [projectDetails, exportDateLabel, exportSystemConfiguration]);

    // FIX 3: If autoPrint was requested but no explicit project ID was provided,
    // block the report entirely. Never substitute a globally active project.
    if (reportProjectError) {
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

    if (!app) {
        return (
            <div className="min-h-screen bg-[#F9F8F6] p-6 flex items-center justify-center">
                <div className="text-center text-[#3E4349]">
                    <p>App state is not initialised.</p>
                    <p>Please open the Room Designer first, then return to this report.</p>
                </div>
            </div>
        );
    }

    if (!analysisResult || !analysisResult.gradedParameters) {
        if (isAutoPrintPreparing) {
            return (
                <div className="min-h-screen bg-white flex items-center justify-center">
                    <div className="flex flex-col items-center gap-6">
                        <div className="w-10 h-10 border-[3px] border-[#E6E4DD] border-t-[#213428] rounded-full animate-spin" />
                        <div style={{ fontSize: 18, fontWeight: 400, color: '#213428', fontFamily: "'Futura PT Light', 'Century Gothic', sans-serif", letterSpacing: '0.01em' }}>
                            Preparing Technical Report…
                        </div>
                    </div>
                </div>
            );
        }
        return (
            <div className="min-h-screen bg-[#F9F8F6] p-6 flex items-center justify-center">
                <Card className="max-w-xl mx-auto w-full">
                    <CardHeader><CardTitle className="text-[#1B1A1A] font-header">RP22 Compliance Report</CardTitle></CardHeader>
                    <CardContent className="text-center py-10">
                        <BarChart4 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <p className="text-[#3E4349]">Run an analysis in the Room Designer to see the report.</p>
                    </CardContent>
                </Card>
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
                    <div style={{ fontSize: 18, fontWeight: 400, color: '#213428', fontFamily: "'Futura PT Light', 'Century Gothic', sans-serif", letterSpacing: '0.01em' }}>
                        Preparing Technical Report…
                    </div>
                </div>
            </div>
        );
    }

    return showLoadingReport ? (
        <div className="min-h-screen bg-[#F9F8F6] p-6 flex items-center justify-center">
            <Card className="max-w-xl mx-auto w-full">
                <CardHeader><CardTitle className="text-[#1B1A1A] font-header">RP22 Compliance Report</CardTitle></CardHeader>
                <CardContent className="text-center py-10">
                    <BarChart4 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-[#3E4349]">Loading report…</p>
                </CardContent>
            </Card>
        </div>
    ) : (
        <div className="min-h-screen bg-[#F9F8F6] p-6">
            <ReportPrintStyles />

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
                        <div style={{ fontSize: 18, fontWeight: 400, color: '#213428', fontFamily: "'Futura PT Light', 'Century Gothic', sans-serif", letterSpacing: '0.01em' }}>
                            Preparing Technical Report…
                        </div>
                    </div>
                ) : (
                <div className="max-w-7xl mx-auto space-y-6">
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
                        exportDisabled={reportHydrating || (explicitProjectId && reportReadyProjectId !== explicitProjectId) || authorityReportPending || recommendationsPending}
                        exportDisabledMessage={authorityReportPending ? "Engineering summary loading" : (recommendationsPending ? "Recommendations evaluating" : "Report loading")}
                        includeAdiAssessment={includeAdiAssessment}
                        onToggleAdiAssessment={showDesignRating ? setIncludeAdiAssessment : null}
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
                            {/* RP23 row */}
                            {(() => {
                                const rp23Rows = rowCentralSeats
                                    .map(seat => {
                                        const rowNum = seat.rowNumber || 1;
                                        const snap = reportSeatHudById?.[seat.id];
                                        return { rowNum, rp23: snap?.rp23 || null };
                                    })
                                    .filter(r => r.rp23);
                                if (rp23Rows.length === 0) return null;
                                return (
                                    <Card className="bg-[#FFFFFF] border-[#DCDBD6]">
                                        <CardHeader className="pb-2">
                                            <CardTitle className="text-[#1B1A1A] font-header">RP23 — Horizontal Viewing Angle</CardTitle>
                                            <p className="text-xs text-[#625143] mt-1">Representative seat per row · target range 50°–65° (L4)</p>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="space-y-2">
                                                {rp23Rows.map(({ rowNum, rp23 }) => (
                                                    <div key={rowNum} className="flex items-center justify-between py-1.5 border-b border-[#F0EFEA] last:border-0">
                                                        <span className="text-sm text-[#3E4349] font-medium">Row {rowNum}</span>
                                                        <div className="flex items-center gap-3">
                                                            <span className="text-sm font-bold text-[#1B1A1A]">{rp23.formatted || '—'}</span>
                                                            <RP22GradingPill level={rp23.level || '—'} />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                            <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #E8E6E1' }}>
                                                <div style={{
                                                    display: 'grid',
                                                    gridTemplateColumns: 'repeat(4, 1fr)',
                                                    textAlign: 'center',
                                                    fontSize: 12,
                                                    color: '#6F6B64'
                                                }}>
                                                    <div>
                                                        <div style={{ fontWeight: 600 }}>L4</div>
                                                        <div>50°–65°</div>
                                                    </div>
                                                    <div>
                                                        <div style={{ fontWeight: 600 }}>L3</div>
                                                        <div>45°–70°</div>
                                                    </div>
                                                    <div>
                                                        <div style={{ fontWeight: 600 }}>L2</div>
                                                        <div>40°–80°</div>
                                                    </div>
                                                    <div>
                                                        <div style={{ fontWeight: 600 }}>L1</div>
                                                        <div>33°–90°</div>
                                                    </div>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                );
                            })()}

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
                            <div style={{ fontFamily: "'Futura PT Light', 'Century Gothic', sans-serif", fontSize: 16, fontWeight: 400, color: '#213428', marginBottom: 12, letterSpacing: '0.01em' }}>
                                ARTCOUSTIC SYSTEM DESIGN RATING
                            </div>
                            <ScopedAsdrSummary engineeringSummary={engineeringSummary} />
                            <div style={{ marginTop: 12, fontSize: 10, color: '#9B8E82', fontStyle: 'italic', fontFamily: "'Didact Gothic', 'Century Gothic', sans-serif" }}>
                                Sound Proof proprietary design metric. Not part of CEDIA RP22 or RP23.
                            </div>
                        </div>
                    )}

                    {/* ── Screen-only ADI Assessment ── */}
                    {showDesignRating && includeAdiAssessment && designReviewHandoff && (
                        <TechnicalAdiAssessment publishedAuthority={designReviewHandoff} />
                    )}

                    {/* ── Screen-only Recommendations section (NOT in PDF) ── */}
                    {showDesignRating && (
                        <TechnicalReportRecommendations recommendations={designRecommendations} />
                    )}

                </div>
                )}
            </div>

            {/* Print-only layout */}
            <div className="print-only print-keep-layout">
                <div className="print-root" ref={printReportRef}>
                    <div className="print-container rp22-report">
                        <section id="pdf-cover">
                            {/* ── Page 1: Logo + title + RP22/RP23 explanations ── */}
                            <div className="print-summary report-page-block report-page-block--cover" data-report-block="cover" data-report-page-start="true">
                                <ReportCover variant="print" />
                                {/* RP22 explanation */}
                                <div style={{ maxWidth: '185mm', margin: '0 auto', paddingTop: '5mm', borderTop: '1px solid #D9D5CE', fontFamily: 'Century Gothic, Futura PT Light, Didact Gothic, sans-serif', fontSize: '10pt', color: '#3E4349', lineHeight: 1.55, textAlign: 'left' }}>
                                    <div style={{ fontWeight: 700, color: '#1B1A1A', marginBottom: '3mm', fontSize: '11pt' }}>CEDIA RP22 - Immersive Audio Performance Levels</div>
                                    <div><strong>Level 1</strong> – The minimum level of performance necessary to convey basic artistic intent.</div>
                                    <div><strong>Level 2</strong> – A higher level of performance that more accurately conveys artistic intent.</div>
                                    <div><strong>Level 3</strong> – Meets or exceeds reference commercial cinema exhibition standards.</div>
                                    <div><strong>Level 4</strong> – The maximum level of achievable performance across every parameter.</div>
                                    <div style={{ marginTop: '2mm' }}>Performance levels apply to both individual seating positions as well as the room, with parameters therein attributed to one or the other.</div>
                                </div>
                                {/* RP23 explanation */}
                                <div style={{ maxWidth: '185mm', margin: '0 auto', marginTop: '5mm', paddingTop: '5mm', borderTop: '1px solid #D9D5CE', fontFamily: 'Century Gothic, Futura PT Light, Didact Gothic, sans-serif', fontSize: '10pt', color: '#3E4349', lineHeight: 1.55, textAlign: 'left' }}>
                                    <div style={{ fontWeight: 700, color: '#1B1A1A', marginBottom: '3mm', fontSize: '11pt' }}>RP23 - Image Performance</div>
                                    <div>CEDIA's forthcoming RP23 document will address best practice for image. Currently, we only have the size of the images based on the horizontal viewing angle, and the brightness which is known.</div>
                                    {coverageSentence && (
                                        <Rp22SeatCoverageSentence sentence={coverageSentence} variant="cover" />
                                    )}
                                </div>
                            </div>

                            {/* ── Page 2: Project & System Overview ── */}
                            <div className="report-page-block report-page-block--summary" data-report-block="project-overview" data-report-page-start="true">
                                <TechnicalProjectOverview
                                    projectDetails={projectDetails}
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
                                    />
                                </div>
                            )}

                            {/* ── Page 3c: ADI Assessment (optional) ── */}
                            {showDesignRating && includeAdiAssessment && designReviewHandoff && (
                                <div className="report-page-block report-page-block--summary" data-report-block="adi-assessment" data-report-page-start="true">
                                    <TechnicalAdiAssessment publishedAuthority={designReviewHandoff} />
                                </div>
                            )}
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

                        {/* ── About Sound Proof — final page (fixed brand closing page) ── */}
                        <section
                          id="pdf-about-sound-proof"
                          className="report-page-block report-page-block--summary"
                          data-report-block="about-sound-proof"
                          data-report-page-start="true"
                          style={{ background: '#FFFFFF', padding: 0, margin: 0 }}
                        >
                            <AboutSoundProofReportPage />
                        </section>

                    </div>
                </div>
            </div>
        </div>
    );
}

export default function RP22Report() {
    return <RP22ReportInner />;
}