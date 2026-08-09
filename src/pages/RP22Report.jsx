import React, { useEffect, useState, useMemo, useCallback, useRef, useSyncExternalStore } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAppState } from '../components/AppStateProvider';
// TEMP DEBUG: remove after sub persistence proven
import { useActiveProjectId } from '@/components/state/project-session';
// END TEMP DEBUG
import { useRP22AnalysisEngine } from '../components/hooks/useRP22AnalysisEngine';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart4 } from 'lucide-react';
import { rp22Parameters } from '../components/data/rp22Parameters';
import RP22GradingPill from '../components/ui/RP22GradingPill';
import { computeAllSeatSplMetrics } from '../components/utils/spl/centralSplEngine';
import { getSpeakerModelMeta } from '../components/models/speakers/registry';
import { buildSeatHudSnapshot } from '../components/utils/buildSeatHudSnapshot';
import { computeScreenMetrics } from '../components/utils/screenMetrics';
import { calculateViewingAngle } from '../components/utils/viewingAngleUtils';
import { safeYawToMLP } from '@/components/room/rv/RenderPrimitives';
import { deriveSubwoofersFromCfg } from '@/components/utils/deriveSubwoofersFromCfg';
import { hydrateProjectIntoAppState } from '@/components/utils/hydrateProjectIntoAppState';
import { useAnalysisSpeakers } from '@/components/hooks/useAnalysisSpeakers';
import { useSubwooferSync } from '@/components/hooks/useSubwooferSync';
import { base44 } from '@/api/base44Client';
import { useEffectiveRsp } from '@/components/room/rsp/useEffectiveRsp';
import { computeMLPAndPrimary } from '@/components/utils/computeMLPAndPrimary';

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
import SpeakerPositionPlan from '../components/report/SpeakerPositionPlan';
import { fovForDistance } from '../components/utils/screenMetrics';
import ElevationDrawing from '../components/report/ElevationDrawing';
import FrontElevation from '../components/room/FrontElevation';
import SideElevation from '../components/room/SideElevation';
import PrintRp23Pill from '@/components/report/PrintRp23Pill';
import { usePlanCapture } from '@/components/report/usePlanCapture';
import { rp23DisplayAngleDeg, rp23LevelForAngleDeg } from '../components/utils/viewingAngleUtils';
import { getP21PresetResult, levelP21_earlyReflections } from '@/components/utils/rp22/levels';
import { useCompletedBassAuthority } from '@/components/room/bass/completedBassResultStore';
import { buildComplianceBassExportData, buildComplianceBassPresentation } from '@/components/room/bass/bassCompliancePresentation';
import { RP22_SEAT_PARAMETERS } from '@/components/utils/rp22ParameterPresentation';
import TechnicalProjectOverview from '@/components/report/technical/TechnicalProjectOverview';
import TechnicalPerformanceSummary from '@/components/report/technical/TechnicalPerformanceSummary';
import { resolveRoomParameterLevel, normalizeRoomLevel } from '@/components/report/technical/roomParameterLevelAuthority';
import { buildDesignRatingInput } from '@/components/report/technical/buildDesignRatingInput';
import {
  buildArtcousticDesignRatingAuthority,
  calculateRoomDesignRating,
  calculateSeatDesignRating,
} from '@/components/report/technical/artcousticSystemDesignRating';
import { subscribeAsdrVisibility, getAsdrVisibility } from '@/components/state/asdrVisibilityStore';

// --- Main component ---
function RP22ReportInner() {
    const app = useAppState();

    const [isPrinting, setIsPrinting] = useState(false);
    const [planImageDataUrl, setPlanImageDataUrl] = useState(null);
    const [planDimsImageDataUrl, setPlanDimsImageDataUrl] = useState(null);
    const [planSpeakerDimsImageDataUrl, setPlanSpeakerDimsImageDataUrl] = useState(null);
    const [hasPrintedOnce, setHasPrintedOnce] = useState(false);
    const [exportStatus, setExportStatus] = useState("Idle");
    const [exportDebug, setExportDebug] = useState({ isPrinting: false, planLen: 0, printReady: false });
    const [screenMetricsForPrint, setScreenMetricsForPrint] = useState(null);
    const [screenMetricsStatus, setScreenMetricsStatus] = useState("");
    const [showCadExportMenu, setShowCadExportMenu] = useState(false);
    const [projectDetails, setProjectDetails] = useState(null);
    const [reportHydrating, setReportHydrating] = useState(true);
    const [reportReadyProjectId, setReportReadyProjectId] = useState(null);
    const showDesignRating = useSyncExternalStore(subscribeAsdrVisibility, getAsdrVisibility);

    const { projectId: routeProjectId } = useParams();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const activeProjectId = useActiveProjectId();
    const effectiveProjectId =
        routeProjectId ||
        searchParams.get("projectId") ||
        searchParams.get("id") ||
        activeProjectId;
    const completedBassAuthority = useCompletedBassAuthority(effectiveProjectId || "free");
    const completedBassContract = completedBassAuthority.contract;
    const bassErrorMessage = completedBassAuthority.errorMessage || null;
    const completedBassPresentation = useMemo(() => buildComplianceBassPresentation({ completedBassAuthority }, bassErrorMessage), [completedBassAuthority, bassErrorMessage]);
    const complianceBassExportData = useMemo(() => buildComplianceBassExportData({ completedBassAuthority }, bassErrorMessage), [completedBassAuthority, bassErrorMessage]);
    const bassReportPending = completedBassAuthority.status === "loading";
    const completedP19Result = completedBassContract?.productAnalysis?.parameters?.p19 || null;
    const completedP19Results = completedBassContract?.selectedCandidate?.perSeatP19Results || [];
    const completedP20Results = completedBassPresentation.perSeatP20Results;

    // Full project hydration for RP22Report — mirrors Room Designer's useProjectLoader path
    useEffect(() => {
        let cancelled = false;

        if (!app) return;

        if (!effectiveProjectId) {
            setProjectDetails(null);
            setReportHydrating(false);
            setReportReadyProjectId(null);
            return;
        }

        if (reportReadyProjectId === effectiveProjectId && reportHydrating === false) {
            return;
        }

        if (reportReadyProjectId !== effectiveProjectId) {
            setReportHydrating(true);
            setReportReadyProjectId(null);
        }

        base44.entities.Project.filter({ id: effectiveProjectId }).then((results) => {
            if (cancelled) return;
            const p = Array.isArray(results) && results.length > 0 ? results[0] : null;
            if (!p) {
                setProjectDetails(null);
                setReportHydrating(false);
                setReportReadyProjectId(null);
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
            });
            hydrateProjectIntoAppState(p, app, {
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
            });
            setReportReadyProjectId(p.id);
            setReportHydrating(false);
        }).catch(() => {
            if (cancelled) return;
            setProjectDetails(null);
            setReportHydrating(false);
            setReportReadyProjectId(null);
        });

        return () => {
            cancelled = true;
        };
    }, [effectiveProjectId]);

    const [printReady, setPrintReady] = useState(false);
    const [debugPlanCapture, setDebugPlanCapture] = useState(false);
    const printLockRef = React.useRef(false);
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
    usePlanCapture({ isPrinting, imageDataUrl: planImageDataUrl, setImageDataUrl: setPlanImageDataUrl, selector: '[data-plan-capture]', planLabel: 'CLEAN', debugPlanCapture, exportTimeoutRef, exportGuardRef, setExportStatus, setIsPrinting, setExportDebug });
    usePlanCapture({ isPrinting, imageDataUrl: planDimsImageDataUrl, setImageDataUrl: setPlanDimsImageDataUrl, selector: '[data-plan-capture-dims]', planLabel: 'DIMS', debugPlanCapture, exportTimeoutRef, exportGuardRef, setExportStatus, setIsPrinting, setExportDebug });
    usePlanCapture({ isPrinting, imageDataUrl: planSpeakerDimsImageDataUrl, setImageDataUrl: setPlanSpeakerDimsImageDataUrl, selector: '[data-plan-capture-speaker-dims]', planLabel: 'SPEAKER', debugPlanCapture, exportTimeoutRef, exportGuardRef, setExportStatus, setIsPrinting, setExportDebug });

    // Mark printReady when all captures are done
    useEffect(() => {
        if (!isPrinting || reportHydrating || !effectiveProjectId || reportReadyProjectId !== effectiveProjectId) return;
        if (planImageDataUrl !== null && planDimsImageDataUrl !== null && planSpeakerDimsImageDataUrl !== null) {
            setExportDebug(d => ({ ...d, printReady: true }));
            setPrintReady(true);
            setExportStatus("Capture complete — preparing print…");
            if (exportTimeoutRef.current) { clearTimeout(exportTimeoutRef.current); exportTimeoutRef.current = null; }
        }
    }, [isPrinting, planImageDataUrl, planDimsImageDataUrl, planSpeakerDimsImageDataUrl, reportHydrating, effectiveProjectId, reportReadyProjectId]);

    // Trigger print when ready
    useEffect(() => {
        if (!isPrinting) { setHasPrintedOnce(false); printLockRef.current = false; setPrintReady(false); return; }
        if (!printReady || hasPrintedOnce || printLockRef.current) return;
        const t = setTimeout(() => {
            setExportStatus("Opening PDF preview…");
            setHasPrintedOnce(true);
            printLockRef.current = true;
            if (exportTimeoutRef.current) clearTimeout(exportTimeoutRef.current);
            exportTimeoutRef.current = null;
            exportGuardRef.current.active = false;
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

    useSubwooferSync({ appState: app, stableDimensions, frontSubsCfg, rearSubsCfg });

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
    const reportP14Mode = completedBassPresentation.parameters.p14.targetBasis || app?.splConfig?.p14Mode || "minimum";

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

    const screenVisibleWidthInches = React.useMemo(() => {
        const TV_PRESET_WIDTH_MM = { tv65: 1411, tv77: 1711, tv83: 1872, tv100: 2230 };
        const tvKey = screen?.tvPresetKey;
        const tvMm = Number(screen?.tvWidthMm);
        if (tvKey && TV_PRESET_WIDTH_MM[tvKey]) return TV_PRESET_WIDTH_MM[tvKey] / 25.4;
        if (Number.isFinite(tvMm) && tvMm > 0) return tvMm / 25.4;
        const vwi = Number(screen?.visibleWidthInches);
        if (Number.isFinite(vwi) && vwi > 0) return vwi;
        const mw = Number(screen?.manualWidthM);
        if (Number.isFinite(mw) && mw > 0) return mw / 0.0254;
        return 120;
    }, [screen?.tvPresetKey, screen?.tvWidthMm, screen?.visibleWidthInches, screen?.manualWidthM]);

    const reportScreenFrontPlaneM = React.useMemo(() => {
        const raw = Number(app?.screenFrontPlaneM);
        if (Number.isFinite(raw) && raw > 0) return raw;
        const floatDepth = Number(screen?.floatDepthM);
        if (Number.isFinite(floatDepth) && floatDepth > 0) return floatDepth;
        return 0.20;
    }, [app?.screenFrontPlaneM, screen?.floatDepthM]);

    const reportScreenWidthM = React.useMemo(
        () => Number(screenVisibleWidthInches) * 0.0254,
        [screenVisibleWidthInches]
    );

    const rowDerivedRspYByMode = React.useMemo(() => {
        if (!seats.length) return {};
        try {
            const result = computeMLPAndPrimary(
                seats,
                stableDimensions.width,
                stableDimensions.length,
                "front"
            );
            return result?.rowDerivedRspYByMode ?? {};
        } catch {
            return {};
        }
    }, [seats, stableDimensions.width, stableDimensions.length]);

    const { effectiveRspY_m } = useEffectiveRsp({
        rspMode,
        manualRspY_m,
        screenFrontPlaneM: reportScreenFrontPlaneM,
        screenWidthM: reportScreenWidthM,
        rowCentersM: app?.rowCentersM || [],
        seatingPositions: seats,
        currentMlpY_m: app?.mlpY_m ?? null,
        rowDerivedRspYByMode,
    });

    const reportMlpAnchorEffective = React.useMemo(() => {
        const cx = stableDimensions.width / 2;
        const y = Number.isFinite(effectiveRspY_m) ? effectiveRspY_m : app?.mlpY_m;
        if (Number.isFinite(y)) {
            return { x: cx, y, z: 1.2 };
        }
        return app?.mlp || null;
    }, [effectiveRspY_m, app?.mlpY_m, stableDimensions.width, app?.mlp]);

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
            const TV_PRESET_WIDTH_MM = { tv65: 1411, tv77: 1711, tv83: 1872, tv100: 2230 };
            const tvKey = app?.screen?.tvPresetKey;
            const tvMm = Number(app?.screen?.tvWidthMm);
            const resolvedWidthIn = (() => {
                if (tvKey && TV_PRESET_WIDTH_MM[tvKey]) return TV_PRESET_WIDTH_MM[tvKey] / 25.4;
                if (Number.isFinite(tvMm) && tvMm > 0) return tvMm / 25.4;
                return Number(app?.screen?.visibleWidthInches) || 0;
            })();
            const aspectRatio = app?.screen?.aspectRatio || "16:9";
            const rawBorder = Number(app?.screen?.borderThicknessM);
            const borderThicknessM = Number.isFinite(rawBorder) && rawBorder >= 0 ? rawBorder : 0.08;
            if (resolvedWidthIn <= 0) {
                return { ok: true, viewWm: null, viewHm: null, overallWm: null, overallHm: null, wallDistM: null, screenChoiceLabel: formatScreenChoiceLabel(app?.screen) };
            }
            const { viewWm, viewHm, overallWm, overallHm } = computeScreenMetrics(resolvedWidthIn, aspectRatio, borderThicknessM);
            const screenFrontPlaneM = app?.screenFrontPlaneM ?? app?.screen?.frontPlaneYm ?? null;
            return {
                ok: true, viewWm, viewHm, overallWm, overallHm,
                wallDistM: Number.isFinite(screenFrontPlaneM) ? screenFrontPlaneM : null,
                screenChoiceLabel: formatScreenChoiceLabel(app?.screen)
            };
        } catch {
            return { ok: true, viewWm: null, viewHm: null, overallWm: null, overallHm: null, wallDistM: null, screenChoiceLabel: formatScreenChoiceLabel(app?.screen) };
        }
    }, [app?.screenFrontPlaneM, app?.screen?.frontPlaneYm, app?.screen?.visibleWidthInches, app?.screen?.aspectRatio]);

    const showLoadingReport = reportHydrating || (effectiveProjectId && reportReadyProjectId !== effectiveProjectId);

    const analysisSpeakers = useAnalysisSpeakers({
        placedSpeakers,
        speakerSystem: app?.speakerSystem,
        sevenBedLayoutType: app?.sevenBedLayoutType,
        getSpeakerVisibility: app?.getSpeakerVisibility,
        dolbyPreset: reportDolbyLayout,
    });

    const allSeatSplMetrics = React.useMemo(() => {
        if (!hasSeats || !hasSpeakers) return [];
        const getCanonicalRole = (role) => {
            const map = { SL: 'SL', LS: 'SL', SR: 'SR', RS: 'SR', SBL: 'SBL', SBR: 'SBR', LW: 'LW', RW: 'RW', FL: 'FL', L: 'FL', FC: 'FC', C: 'FC', FR: 'FR', R: 'FR', TFL: 'TFL', TFR: 'TFR', TML: 'TML', TMR: 'TMR', TRL: 'TRL', TRR: 'TRR' };
            return map[String(role || '').toUpperCase()] || String(role || '').toUpperCase();
        };
        return computeAllSeatSplMetrics({
            seats, placedSpeakers, getCanonicalRole,
            getEffectiveSplInputs: app?.getEffectiveSplInputs || (() => ({ powerW: 100, eqHeadroomDb: 0 })),
            getModelDimsM: (model) => {
                const meta = getSpeakerModelMeta(model);
                if (meta && !meta.notFound) return { ...meta, sensitivity_db_1w_1m: meta.sensitivity_dB_1w1m || 87, power_handling_w: meta.max_power || Infinity, max_spl_cont_db_1m: meta.max_spl || null };
                return { widthM: 0.27, depthM: 0.082, sensitivity_dB_1w1m: 87 };
            },
            screenLoss_dB: Number(app?.splConfig?.screenLossDb) || 0,
            eqHeadroom_dB: Number(app?.splConfig?.globalEqHeadroomDb) || 0,
            mlpPoint: primarySeatingPosition
        });
    }, [seats, placedSpeakers, primarySeatingPosition, app?.splConfig, app?.getEffectiveSplInputs, hasSeats, hasSpeakers]);

    const analysisResult = useRP22AnalysisEngine({
        diagnosticOwner: "rp22-report-page-authority",
        placedSpeakers, visiblePlanSpeakers: analysisSpeakers, seatingPositions: seats, primarySeatingPosition,
        dimensions: stableDimensions, mlpBasis,
        sevenBedLayoutType: app?.sevenBedLayoutType,
        extraSurroundCount: app?.extraSurroundCount,
        seatSplMetrics: allSeatSplMetrics,
        mlpPointOverride: reportMlpAnchorEffective,
        overheadState: { globalModel: app?.overheadGlobalModel, frontOverride: app?.overheadFrontOverride, midOverride: app?.overheadMidOverride, rearOverride: app?.overheadRearOverride, useFrontGlobal: app?.useFrontGlobal ?? true, useMidGlobal: app?.useMidGlobal ?? true, useRearGlobal: app?.useRearGlobal ?? true, aimFrontWidesAtMLP: app?.aimFrontWidesAtMLP, aimSideSurroundsAtMLP: app?.aimSideSurroundsAtMLP, aimRearSurroundsAtMLP: app?.aimRearSurroundsAtMLP },
        aimState: { aimFrontWidesAtMLP: app?.aimFrontWidesAtMLP, aimSideSurroundsAtMLP: app?.aimSideSurroundsAtMLP, aimRearSurroundsAtMLP: app?.aimRearSurroundsAtMLP, lcrAimMode: app?.lcrAimMode },
        p15ConstructionLevel: app?.p15ConstructionLevel,
        screen,
        dolbyLayout: canonicalP2Layout,
        includeBassAnalysis: false,
    });

    const reportSeatHudById = React.useMemo(() => {
        const out = {};
        const list = safeArray(seats);
        const aimAtMLP = app?.aimAtMLP ?? false;
        const lcrAngleInfo = { L: 0, R: 0, averageAngle: 0, maxAbs: 0 };
        if (aimAtMLP && primarySeatingPosition) {
            const mlpTarget = { x: primarySeatingPosition.x, y: primarySeatingPosition.y };
            const flSpeaker = placedSpeakers?.find(s => { const c = String(s?.role || '').toUpperCase(); return (c === 'FL' || c === 'L') && s?.position; });
            const frSpeaker = placedSpeakers?.find(s => { const c = String(s?.role || '').toUpperCase(); return (c === 'FR' || c === 'R') && s?.position; });
            if (flSpeaker?.position && Number.isFinite(mlpTarget.x)) lcrAngleInfo.L = safeYawToMLP(flSpeaker.position, mlpTarget);
            if (frSpeaker?.position && Number.isFinite(mlpTarget.x)) lcrAngleInfo.R = safeYawToMLP(frSpeaker.position, mlpTarget);
            const avg = (Math.abs(lcrAngleInfo.L) + Math.abs(lcrAngleInfo.R)) / 2;
            lcrAngleInfo.averageAngle = Number.isFinite(avg) ? avg : 0;
            lcrAngleInfo.maxAbs = Math.max(Math.abs(lcrAngleInfo.L), Math.abs(lcrAngleInfo.R));
        }
        for (let i = 0; i < list.length; i++) {
            const seat = list[i];
            if (!seat?.id) continue;
            try {
                const snapshot = buildSeatHudSnapshot({
                    seat, placedSpeakers, widthM: stableDimensions.width, lengthM: stableDimensions.length, heightM: stableDimensions.height,
                    screenFrontPlaneM: app?.screenFrontPlaneM ?? (app?.screen?.frontPlaneYm || 0),
                    screen, mlp: primarySeatingPosition || { x: stableDimensions.width / 2, y: stableDimensions.length * 0.58, z: 1.2 },
                    allSeatSplMetrics, aimAtMLP,
                    aimFrontWidesAtMLP: app?.aimFrontWidesAtMLP ?? false,
                    aimSideSurroundsAtMLP: app?.aimSideSurroundsAtMLP ?? false,
                    aimRearSurroundsAtMLP: app?.aimRearSurroundsAtMLP ?? false,
                    lcrAngleInfo, analysisResult: analysisResult || {},
                    seatingPositions: seats, splConfig: app?.splConfig || {},
                    sevenBedMode: reportSevenBedMode, dolbyLayout: reportDolbyLayout,
                    officialP19Result: completedP19Result,
                    perSeatP19Results: completedP19Results,
                    perSeatP20Results: completedP20Results,
                });
                if (snapshot) out[seat.id] = snapshot;
            } catch (e) { console.warn(`[RP22Report] HUD failed for seat ${seat.id}:`, e); }
        }
        return out;
    }, [seats, placedSpeakers, stableDimensions.width, stableDimensions.length, stableDimensions.height, screen, primarySeatingPosition, allSeatSplMetrics, app?.aimAtMLP, app?.aimFrontWidesAtMLP, app?.aimSideSurroundsAtMLP, app?.aimRearSurroundsAtMLP, app?.screenFrontPlaneM, app?.screen?.frontPlaneYm, app?.splConfig, analysisResult, reportSevenBedMode, reportDolbyLayout, completedP19Result, completedP19Results, completedP20Results]);

    const seatScopedParamNumbers = React.useMemo(() => new Set(RP22_SEAT_PARAMETERS.map((parameter) => parameter.number)), []);

    const roomScopedParamCount = React.useMemo(() => {
        return rp22Parameters.filter(p => !seatScopedParamNumbers.has(p.number)).length;
    }, [seatScopedParamNumbers]);

    const seatScopedParamCount = React.useMemo(() => {
        return rp22Parameters.filter(p => seatScopedParamNumbers.has(p.number)).length;
    }, [seatScopedParamNumbers]);

    const orderedParams = React.useMemo(() => {
        return [...rp22Parameters].filter(p => !seatScopedParamNumbers.has(p.number)).sort((a, b) => a.id - b.id);
    }, [seatScopedParamNumbers]);

    const getRoomResult = React.useCallback((paramId) => analysisResult?.gradedParameters?.primary?.[paramId] ?? null, [analysisResult]);

    const getDisplayedRoomLevel = React.useCallback((paramId) => {
        return resolveRoomParameterLevel(paramId, {
            analysisResult,
            p12Mode: reportP12Mode,
            p13Mode: reportP13Mode,
            p14Mode: reportP14Mode,
            p15ConstructionLevel: app?.p15ConstructionLevel,
            p21EarlyReflectionPreset: app?.p21EarlyReflectionPreset,
            bassPresentation: completedBassPresentation,
        });
    }, [analysisResult, reportP12Mode, reportP13Mode, reportP14Mode, app?.p15ConstructionLevel, app?.p21EarlyReflectionPreset, completedBassPresentation]);

    const getSeatResults = React.useCallback((paramId) => {
        if (!analysisResult?.perSeatRp22) return [];
        const results = [];
        for (const [seatId, seatData] of Object.entries(analysisResult.perSeatRp22)) {
            const metric = seatData.rp22?.[paramId];
            if (metric) results.push({ seatId, isPrimary: seatData.isPrimary, metric });
        }
        return results;
    }, [analysisResult]);

    const roomLevelCounts = React.useMemo(() => {
        const counts = { L4: 0, L3: 0, L2: 0, L1: 0, unassessed: 0 };
        for (const param of orderedParams) {
            const raw = getDisplayedRoomLevel(param.id);
            const lvl = normalizeRoomLevel(raw);
            if (lvl) counts[lvl] += 1;
            else counts.unassessed += 1;
        }
        return counts;
    }, [getDisplayedRoomLevel, orderedParams]);

    const roomCalculatedCount = React.useMemo(() => {
        return roomLevelCounts.L4 + roomLevelCounts.L3 + roomLevelCounts.L2 + roomLevelCounts.L1;
    }, [roomLevelCounts]);

    const lastSeatIdsRef = React.useRef([]);
    const lastSeatLevelCountsRef = React.useRef([]);

    const seatLevelCounts = React.useMemo(() => {
        const seatIdsNow = (safeArray(seats).map(s => s?.id).filter(Boolean)).sort();
        const seatIds = seatIdsNow.length ? seatIdsNow : lastSeatIdsRef.current;
        if (seatIdsNow.length) lastSeatIdsRef.current = seatIdsNow;
        const normalizeLvl = (rawLevel) => {
            if (rawLevel == null) return null;
            if (typeof rawLevel === "number" && Number.isFinite(rawLevel)) { if (rawLevel >= 1 && rawLevel <= 4) return `L${rawLevel}`; return null; }
            if (typeof rawLevel === "string") { const m = rawLevel.trim().match(/^L([1-4])$/i); if (m) return `L${m[1]}`; }
            return null;
        };
        const next = seatIds.map(seatId => {
            const counts = { L1: 0, L2: 0, L3: 0, L4: 0 };
            let activeCount = 0;
            let failCount = 0;
            const seatHudRp22 = reportSeatHudById?.[seatId]?.rp22 || {};
            const getRp22Metric = (key) => {
                return seatHudRp22[key] ?? null;
            };
            RP22_SEAT_PARAMETERS.map((parameter) => `p${parameter.number}`).forEach(key => {
                const metric = getRp22Metric(key);
                if (!metric) return;
                const rawLevel = metric.level;
                const lvl = normalizeLvl(rawLevel);
                const isFail = String(rawLevel ?? '').trim().toUpperCase() === 'FAIL';
                if (!lvl && !isFail) return;
                activeCount += 1;
                if (isFail) {
                    failCount += 1;
                } else {
                    counts[lvl] += 1;
                }
            });
            return { seatId, counts, activeCount, failCount, total: RP22_SEAT_PARAMETERS.length };
        });
        if (!next.length && lastSeatLevelCountsRef.current.length) return lastSeatLevelCountsRef.current;
        lastSeatLevelCountsRef.current = next;
        return next;
    }, [analysisResult, reportSeatHudById, app?.seatSnapshotBySeatId, app?.seatMetricsById, seats, completedBassContract]);

    const seatCountsByRow = React.useMemo(() => {
        const rows = {};
        seatLevelCounts.forEach(({ seatId, counts, activeCount, failCount, total }) => {
            const match = seatId.match(/^seat-r(\d+)-c(\d+)$/);
            const rowNum = match ? parseInt(match[1], 10) : 0;
            const seatNum = match ? parseInt(match[2], 10) : Number.MAX_SAFE_INTEGER;
            if (!rows[rowNum]) rows[rowNum] = [];
            rows[rowNum].push({ seatId, counts, activeCount, failCount, total, seatNum });
        });
        Object.keys(rows).forEach(rowNum => { rows[rowNum].sort((a, b) => a.seatNum - b.seatNum); });
        return Object.keys(rows).map(Number).sort((a, b) => a - b).map(rowNum => ({ rowNum, seats: rows[rowNum] }));
    }, [seatLevelCounts]);

    // ── Seat compromise comparison (Page 3 only, relative observation) ────────
    // For each seat-scope RP22 parameter, find the best achieved assessed level
    // across all physical seats. A seat incurs a "major gap" for a parameter when
    // it is two or more RP22 levels below that best. A seat is labelled
    // "MORE COMPROMISED" only when it has at least 4 major gaps AND those gaps
    // represent at least 50% of its comparable assessed seat-scope parameters.
    // This is a relative design observation, NOT an RP22 Performance Level.
    const seatCompromiseById = React.useMemo(() => {
        const paramKeys = RP22_SEAT_PARAMETERS.map((parameter) => `p${parameter.number}`);
        const normalizeLvl = (rawLevel) => {
            if (rawLevel == null) return null;
            if (typeof rawLevel === "number" && Number.isFinite(rawLevel)) {
                if (rawLevel >= 1 && rawLevel <= 4) return rawLevel;
                return null;
            }
            if (typeof rawLevel === "string") {
                const m = rawLevel.trim().match(/^L([1-4])$/i);
                if (m) return parseInt(m[1], 10);
            }
            return null;
        };
        const seatIds = safeArray(seats).map(s => s?.id).filter(Boolean);
        const seatLevelsByParam = {};      // paramKey -> { seatId -> numericLevel }
        const comparableParamsBySeat = {}; // seatId -> Set<paramKey>
        seatIds.forEach(seatId => {
            const seatHudRp22 = reportSeatHudById?.[seatId]?.rp22 || {};
            comparableParamsBySeat[seatId] = new Set();
            paramKeys.forEach(key => {
                const metric = seatHudRp22[key];
                if (!metric) return;
                const lvl = normalizeLvl(metric.level);
                if (lvl == null) return; // ignore —, N/A, Not Calculated, FAIL
                if (!seatLevelsByParam[key]) seatLevelsByParam[key] = {};
                seatLevelsByParam[key][seatId] = lvl;
                comparableParamsBySeat[seatId].add(key);
            });
        });
        const bestByParam = {};
        Object.keys(seatLevelsByParam).forEach(key => {
            const levels = Object.values(seatLevelsByParam[key]);
            if (levels.length) bestByParam[key] = Math.max(...levels);
        });
        const out = {};
        seatIds.forEach(seatId => {
            let majorGapCount = 0;
            const comparableCount = (comparableParamsBySeat[seatId] || new Set()).size;
            paramKeys.forEach(key => {
                if (!bestByParam[key]) return;
                const seatLvl = seatLevelsByParam[key]?.[seatId];
                if (seatLvl == null) return;
                const gap = bestByParam[key] - seatLvl;
                if (gap >= 2) majorGapCount += 1;
            });
            const majorGapPct = comparableCount > 0 ? majorGapCount / comparableCount : 0;
            const isCompromised = majorGapCount >= 4 && majorGapPct >= 0.5;
            out[seatId] = { majorGapCount, comparableCount, majorGapPct, isCompromised };
        });
        return out;
    }, [seats, reportSeatHudById]);

    // ── Artcoustic System Design Rating ────────────────────────────────────
    // Wires Page 3 into the approved Stage B adapter. The UI layer supplies
    // ONLY existing canonical authority inputs — no thresholds, FAIL rules,
    // or bass scoring are reimplemented. The adapter is the sole scoring authority.
    const hasFrontWides = React.useMemo(() => {
        return placedSpeakers.some(s => {
            const r = String(s?.role || '').toUpperCase();
            return r === 'LW' || r === 'RW';
        });
    }, [placedSpeakers]);

    const designRatingAuthority = React.useMemo(() => {
        if (!showDesignRating) return null;
        const input = buildDesignRatingInput({
            seats,
            analysisResult,
            reportSeatHudById,
            completedBassAuthority,
            completedBassPresentation,
            reportP12Mode,
            reportP13Mode,
            reportP14Mode,
            hasFrontWides,
        });
        return buildArtcousticDesignRatingAuthority(input);
    }, [showDesignRating, seats, analysisResult, reportSeatHudById, completedBassAuthority, completedBassPresentation, reportP12Mode, reportP13Mode, reportP14Mode, hasFrontWides]);

    const roomDesignRating = React.useMemo(() => {
        if (!designRatingAuthority) return null;
        return calculateRoomDesignRating(designRatingAuthority);
    }, [designRatingAuthority]);

    const seatDesignRatings = React.useMemo(() => {
        if (!designRatingAuthority) return null;
        const ratings = {};
        for (const seatId of designRatingAuthority.seatIds) {
            ratings[seatId] = calculateSeatDesignRating(designRatingAuthority, seatId);
        }
        return ratings;
    }, [designRatingAuthority]);

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
        return summary;
    }, [placedSpeakers, frontSubsCfg, rearSubsCfg, app?.getSpeakerVisibility]);

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
        analysisResult,
        seatHudSnapshots: reportSeatHudById,
        seatingPositions: seats,
        mlpSeatId: rspSeatId,
        p15ConstructionLevel: app?.p15ConstructionLevel,
        p21EarlyReflectionPreset: app?.p21EarlyReflectionPreset,
        bassAuthority: completedBassAuthority,
        bassErrorMessage,
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

            <div className="screen-only">
                <ReportHiddenCaptures
                    app={app}
                    placedSpeakers={placedSpeakers}
                    seats={seats}
                    primarySeatingPosition={primarySeatingPosition}
                    screen={screen}
                    dolbyLayout={dolbyLayout}
                />

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
                        exportDisabled={reportHydrating || (effectiveProjectId && reportReadyProjectId !== effectiveProjectId) || bassReportPending}
                        exportDisabledMessage={bassReportPending ? "Bass analysis updating" : "Report loading"}
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

                    {/* ── Report assumptions + RP23 row + RP22 Parameters — all inside one card so widths match ── */}
                    <Card className="bg-[#FFFFFF] border-[#DCDBD6]">
                        <CardHeader>
                            <CardTitle className="text-[#1B1A1A] font-header">RP22 Parameters</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {/* Assumptions + RP23 row — same inner width as the grid below */}
                            {(() => {
                                const rowMap = {};
                                seats.forEach(s => {
                                    const match = s.id?.match(/^seat-r(\d+)-c(\d+)$/);
                                    const rowNum = match ? parseInt(match[1], 10) : (s.rowNumber || 1);
                                    if (!rowMap[rowNum]) rowMap[rowNum] = [];
                                    rowMap[rowNum].push(s);
                                });
                                const rp23Rows = rowCentralSeats
                                    .map(seat => {
                                        const rowNum = seat.rowNumber || 1;
                                        const snap = reportSeatHudById?.[seat.id];
                                        return { rowNum, rp23: snap?.rp23 || null };
                                    })
                                    .filter(r => r.rp23);
                                return (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                                        {/* ── Report assumptions block — 2 cols ── */}
                                        <div style={{ gridColumn: 'span 2' }}>
                                            <div style={{ background: '#FFFFFF', border: '1px solid #DCDBD6', borderRadius: 8, padding: '16px' }}>
                                                <div style={{ fontSize: 15, fontWeight: 700, color: '#1B1A1A', marginBottom: 4 }}>Report assumptions</div>
                                                <div style={{ fontSize: 12, color: '#625143', marginBottom: 16 }}>Manual estimates for non-calculated parameters</div>
                                                {/* P15 */}
                                                <div style={{ marginBottom: 14 }}>
                                                    <div style={{ fontSize: 12, fontWeight: 600, color: '#1B1A1A', marginBottom: 6 }}>P15 — Background noise floor</div>
                                                    <select
                                                        style={{ width: '100%', padding: '6px 8px', fontSize: 12, border: '1px solid #DCDBD6', borderRadius: 6, background: '#fff', color: '#1B1A1A', cursor: 'pointer', position: 'relative', zIndex: 1 }}
                                                        value={app?.p15ConstructionLevel || 'standard'}
                                                        onChange={e => app?.setP15ConstructionLevelSafe?.(e.target.value)}
                                                    >
                                                        <option value="standard">Standard domestic room (NCB 26 · L1)</option>
                                                        <option value="purpose-built">Purpose-built home cinema (NCB 22 · L2)</option>
                                                        <option value="reference">Reference-grade isolated room (NCB 18 · L3)</option>
                                                        <option value="studio">Studio / screening-room grade (NCB 15 · L4)</option>
                                                    </select>
                                                </div>
                                                {/* P21 */}
                                                <div>
                                                    <div style={{ fontSize: 12, fontWeight: 600, color: '#1B1A1A', marginBottom: 6 }}>P21 — Early reflections</div>
                                                    <select
                                                        style={{ width: '100%', padding: '6px 8px', fontSize: 12, border: '1px solid #DCDBD6', borderRadius: 6, background: '#fff', color: '#1B1A1A', cursor: 'pointer', position: 'relative', zIndex: 1 }}
                                                        value={app?.p21EarlyReflectionPreset || 'l2'}
                                                        onChange={e => app?.setP21EarlyReflectionPresetSafe?.(e.target.value)}
                                                    >
                                                        <option value="l1">No estimate / not applicable (N/A)</option>
                                                        <option value="l2">Moderately live room (−8 dB · L2)</option>
                                                        <option value="l3">Well-balanced treated room (−10 dB · L3)</option>
                                                        <option value="l4">Heavily optimised room (−12 dB · L4)</option>
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                        {/* ── RP23 card — 1 col ── */}
                                        <div>
                                            {rp23Rows.length > 0 && (
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
                                            )}
                                        </div>
                                    </div>
                                );
                            })()}

                            <RP22ReportParameterGrid {...parameterGridProps} />
                        </CardContent>
                    </Card>


                </div>
            </div>

            {/* Print-only layout */}
            <div className="print-only print-keep-layout">
                <div className="print-root">
                    <div className="print-container rp22-report">
                        <section id="pdf-cover">
                            {/* ── Page 1: Logo + title + RP22/RP23 explanations ── */}
                            <div className="print-page-break-after print-summary">
                                <ReportCover variant="print" />
                                {/* RP22 explanation */}
                                <div style={{ maxWidth: '185mm', margin: '0 auto', paddingTop: '8mm', borderTop: '1px solid #D9D5CE', fontFamily: 'Century Gothic, Futura PT Light, Didact Gothic, sans-serif', fontSize: '10.5pt', color: '#3E4349', lineHeight: 1.75, textAlign: 'left' }}>
                                    <div style={{ fontWeight: 700, color: '#1B1A1A', marginBottom: '4mm', fontSize: '11pt' }}>CEDIA RP22 - Immersive Audio Performance Levels</div>
                                    <div><strong>Level 1</strong> – The minimum level of performance necessary to convey basic artistic intent.</div>
                                    <div><strong>Level 2</strong> – A higher level of performance that more accurately conveys artistic intent.</div>
                                    <div><strong>Level 3</strong> – Meets or exceeds reference commercial cinema exhibition standards.</div>
                                    <div><strong>Level 4</strong> – The maximum level of achievable performance across every parameter.</div>
                                    <div style={{ marginTop: '2mm' }}>Performance levels apply to both individual seating positions as well as the room, with parameters therein attributed to one or the other.</div>
                                </div>
                                {/* RP23 explanation */}
                                <div style={{ maxWidth: '185mm', margin: '0 auto', marginTop: '8mm', paddingTop: '8mm', borderTop: '1px solid #D9D5CE', fontFamily: 'Century Gothic, Futura PT Light, Didact Gothic, sans-serif', fontSize: '10.5pt', color: '#3E4349', lineHeight: 1.75, textAlign: 'left' }}>
                                    <div style={{ fontWeight: 700, color: '#1B1A1A', marginBottom: '4mm', fontSize: '11pt' }}>RP23 - Image Performance</div>
                                    <div>CEDIA's forthcoming RP23 document will address best practice for image. Currently, we only have the size of the images based on the horizontal viewing angle, and the brightness which is known.</div>
                                </div>
                            </div>

                            {/* ── Page 2: Project & System Overview ── */}
                            <div className="print-page-break-after">
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
                            <div className="print-page-break-after">
                                <TechnicalPerformanceSummary
                                    roomLevelCounts={roomLevelCounts}
                                    roomCalculatedCount={roomCalculatedCount}
                                    seatCountsByRow={seatCountsByRow}
                                    totalRoomParameters={roomScopedParamCount}
                                    totalSeatParameters={seatScopedParamCount}
                                    rspSeatId={rspSeatId}
                                    seatCompromiseById={seatCompromiseById}
                                    showDesignRating={showDesignRating}
                                    roomDesignRating={roomDesignRating}
                                    seatDesignRatings={seatDesignRatings}
                                />
                            </div>
                            </section>

                        {planEnabled && typeof planImageDataUrl === 'string' && planImageDataUrl.length > 0 && planImageDataUrl !== '__SKIP__' && (
                            <section id="pdf-room-plan" className="print-page-break-after" style={{ background: 'transparent', padding: 0, margin: 0 }}>
                                <div className="plan-fitbox"><img src={planImageDataUrl} alt="Room plan" style={{ background: 'transparent' }} /></div>
                            </section>
                        )}

                        {planEnabled && typeof planDimsImageDataUrl === 'string' && planDimsImageDataUrl.length > 0 && planDimsImageDataUrl !== '__SKIP__' && (
                            <section id="pdf-room-plan-dims" className="print-page-break-after" style={{ background: 'transparent', padding: 0, margin: 0 }}>
                                <div className="plan-fitbox"><img src={planDimsImageDataUrl} alt="Room plan (dimensions)" style={{ background: 'transparent' }} /></div>
                            </section>
                        )}

                        {planEnabled && typeof planSpeakerDimsImageDataUrl === 'string' && planSpeakerDimsImageDataUrl.length > 0 && planSpeakerDimsImageDataUrl !== '__SKIP__' && (
                            <section id="pdf-room-plan-positions" className="print-page-break-before" style={{ background: '#FFFFFF', padding: 0, margin: 0 }}>
                                <SpeakerPositionPlan
                                    projectName={projectDetails?.name || ''}
                                    clientName={projectDetails?.client_name || ''}
                                    planImageDataUrl={planSpeakerDimsImageDataUrl}
                                    roomWidthM={stableDimensions.width}
                                    roomLengthM={stableDimensions.length}
                                    screenFrontPlaneM={reportScreenFrontPlaneM}
                                    projector={projector}
                                />
                            </section>
                        )}

                        <section
                          id="pdf-room-parameters"
                          className="print-page-break-before"
                          data-bass-result-fingerprint={complianceBassExportData.resultFingerprint || ""}
                          data-bass-selected-candidate={complianceBassExportData.selectedCandidateId || ""}
                        >
                             <div>
                                 <div style={{ fontFamily: 'Futura PT Light, Century Gothic, sans-serif', fontSize: 16, fontWeight: 400, color: '#213428', marginBottom: 2, letterSpacing: '0.01em' }}>RP22 Parameters</div>
                                <div style={{ color: '#625143', fontSize: 9, marginBottom: 8, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'Didact Gothic, Century Gothic, sans-serif' }}>Engineering Evidence</div>
                                {bassErrorMessage && <div style={{ color: '#625143', fontSize: 10, marginBottom: 8, fontFamily: 'Didact Gothic, Century Gothic, sans-serif' }}>Bass analysis unavailable</div>}
                                <RP22ReportParameterGrid {...parameterGridProps} variant="print" />
                            </div>
                        </section>

                        {/* ── Elevation Drawings page ── */}
                        <section id="pdf-elevation-drawings" className="print-page-break-before" style={{ padding: '8mm 10mm', background: '#FFFFFF' }}>
                            <div style={{ fontFamily: 'Futura PT Light, Century Gothic, sans-serif', fontSize: 18, fontWeight: 700, color: '#1B1A1A', marginBottom: 14 }}>Elevation Drawings</div>
                            <div className="print-avoid-break" style={{ marginBottom: 48 }}>
                                <FrontElevation
                                    dimensions={stableDimensions}
                                    screen={screen}
                                    placedSpeakers={placedSpeakers}
                                    frontSubs={frontSubs}
                                    frontSubsCfg={frontSubsCfg}
                                    roomElements={(app?.roomElements || []).filter(el => el?.type !== 'projector')}
                                />
                            </div>
                            <div className="print-avoid-break print-page-break-before" style={{ marginBottom: 16 }}>
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
                            </div>
                            <div className="print-avoid-break print-page-break-before">
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
                            </div>
                        </section>

                        {/* ── Sightlines & Viewing Angles (final page) ── */}
                        {canRenderSightlinePage && sightlineScreenMetrics && sightlineRowData.length > 0 && (
                            <>
                                <section id="pdf-sightlines" className="print-page-break-before" style={{ padding: '8mm 10mm', background: '#FFFFFF' }}>
                                    <div className="print-avoid-break">
                                    <SightlineGraphic
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
                                    </div>
                                </section>

                                <section
                                    id="pdf-screen-wall-construction"
                                    className="print-page-break-before"
                                    style={{ padding: '8mm 10mm', background: '#FFFFFF' }}
                                >
                                    <div className="print-avoid-break">
                                    <ScreenWallConstructionGraphic
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
                                    </div>
                                </section>
                            </>
                        )}


                    </div>
                </div>
            </div>
        </div>
    );
}

export default function RP22Report() {
    return <RP22ReportInner />;
}