import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
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
    const completedBassPresentation = useMemo(() => buildComplianceBassPresentation(completedBassContract), [completedBassContract]);
    const complianceBassExportData = useMemo(() => buildComplianceBassExportData(completedBassContract), [completedBassContract]);
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
    const reportSevenBedMode = String(app?.sevenBedLayoutType || app?.speakerSystem?.sevenBedLayoutType || (app?.speakerSystem?.useWidesInsteadOfRears ? "wides" : "") || "rears").toLowerCase();

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

    const reportMlpAnchorEffective = React.useMemo(() => {
        const cx = stableDimensions.width / 2;
        const mlpY = app?.mlpY_m;
        if (Number.isFinite(mlpY)) {
            return { x: cx, y: mlpY, z: 1.2 };
        }
        return app?.mlp || null;
    }, [app?.mlpY_m, stableDimensions.width, app?.mlp]);

    const primarySeatingPosition = reportMlpAnchorEffective || app?.mlp || null;

    const rspSeatId = React.useMemo(() => {
        const greenDot = primarySeatingPosition;
        if (!greenDot || !Number.isFinite(greenDot.x) || !Number.isFinite(greenDot.y)) return null;
        let closestSeat = null; let minDist = Infinity;
        seats.forEach(s => {
            if (!Number.isFinite(s?.x) || !Number.isFinite(s?.y)) return;
            const d = Math.hypot(s.x - greenDot.x, s.y - greenDot.y);
            if (d < minDist) { minDist = d; closestSeat = s.id; }
        });
        return (minDist <= 0.05) ? closestSeat : null;
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
        placedSpeakers, visiblePlanSpeakers: analysisSpeakers, seatingPositions: seats, primarySeatingPosition,
        dimensions: stableDimensions, mlpBasis,
        sevenBedLayoutType: app?.sevenBedLayoutType,
        extraSurroundCount: app?.extraSurroundCount,
        seatSplMetrics: allSeatSplMetrics,
        mlpPointOverride: reportMlpAnchorEffective,
        overheadState: { globalModel: app?.overheadGlobalModel, frontOverride: app?.overheadFrontOverride, midOverride: app?.overheadMidOverride, rearOverride: app?.overheadRearOverride, useFrontGlobal: app?.useFrontGlobal ?? true, useMidGlobal: app?.useMidGlobal ?? true, useRearGlobal: app?.useRearGlobal ?? true, aimFrontWidesAtMLP: app?.aimFrontWidesAtMLP, aimSideSurroundsAtMLP: app?.aimSideSurroundsAtMLP, aimRearSurroundsAtMLP: app?.aimRearSurroundsAtMLP },
        aimState: { aimFrontWidesAtMLP: app?.aimFrontWidesAtMLP, aimSideSurroundsAtMLP: app?.aimSideSurroundsAtMLP, aimRearSurroundsAtMLP: app?.aimRearSurroundsAtMLP },
        p15ConstructionLevel: app?.p15ConstructionLevel,
        screen,
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

    const p2SystemConfig = React.useMemo(() => {
        const dolbyPreset = app?.dolbyLayout || "5.1";
        const base = String(dolbyPreset).split(" ")[0];
        const parts = base.split(".");
        const bedCount = parseInt(parts[0]) || 5;
        const overheadCount = parseInt(parts[2]) || 0;
        const discreteCount = bedCount + overheadCount;
        let p2Level = 'L1';
        if (discreteCount >= 15) p2Level = 'L4';
        else if (discreteCount >= 11) p2Level = 'L2';
        return { discreteSpeakerCount: discreteCount, p2Level };
    }, [app?.dolbyLayout, app?.frontSubsCfg?.count, app?.rearSubsCfg?.count]);

    const getRoomResult = React.useCallback((paramId) => analysisResult?.gradedParameters?.primary?.[paramId] ?? null, [analysisResult]);

    const getDisplayedRoomLevel = React.useCallback((paramId) => {
        if ([14, 18, 19].includes(paramId)) return completedBassPresentation.parameters[`p${paramId}`].level;
        const normaliseLvl = (rawLevel) => {
            if (rawLevel == null) return null;
            if (typeof rawLevel === "number" && Number.isFinite(rawLevel)) { if (rawLevel >= 1 && rawLevel <= 4) return `L${rawLevel}`; return null; }
            if (typeof rawLevel === "string") { const m = rawLevel.trim().match(/^L([1-4])$/i); if (m) return `L${m[1]}`; }
            return null;
        };
        const res = getRoomResult(paramId);
        if (res) {
            if (res.status && typeof res.status === "string") { const s = res.status.toLowerCase(); if (s === "no_data" || s === "fail" || s === "error") return null; }
            if (paramId === 21 && Number.isFinite(res.value)) return levelP21_earlyReflections(res.value).level;
            const lvl = normaliseLvl(res.level);
            if (lvl) return lvl;
        }
        if (paramId === 2 && p2SystemConfig) return normaliseLvl(p2SystemConfig.p2Level);
        if (paramId === 3) {
          const p3 = analysisResult?.gradedParameters?.primary?.[3];
          if (p3 && p3.status === "ok" && p3.level) return String(p3.level).toUpperCase() === 'FAIL' ? 'FAIL' : normaliseLvl(p3.level);
          return null;
        }
        if (paramId === 8) return "L4";
        if (paramId === 11) return "L4";
        if (paramId === 15) return ({ standard: "L1", "purpose-built": "L2", reference: "L3", studio: "L4" })[app?.p15ConstructionLevel || 'standard'] || null;
        if (paramId === 21) return getP21PresetResult(app?.p21EarlyReflectionPreset || 'l2').level;
        return null;
    }, [analysisResult, getRoomResult, p2SystemConfig, app?.p15ConstructionLevel, app?.p21EarlyReflectionPreset, completedBassPresentation]);

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
        const counts = { L4: 0, L3: 0, L2: 0, L1: 0 };
        for (const id of [2, 3, 7, 8, 11, 12, 13, 14, 15, 18, 21]) {
            const lvl = getDisplayedRoomLevel(id);
            if (lvl && lvl.match(/^L[1-4]$/)) counts[lvl] += 1;
        }
        return counts;
    }, [getDisplayedRoomLevel]);

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
        dolbyLayout: app?.dolbyLayout,
        frontSubsCount: app?.frontSubsCfg?.count,
        rearSubsCount: app?.rearSubsCfg?.count,
        p15ConstructionLevel: app?.p15ConstructionLevel,
        p21EarlyReflectionPreset: app?.p21EarlyReflectionPreset,
        bassContract: completedBassContract,
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
                        exportDisabled={reportHydrating || (effectiveProjectId && reportReadyProjectId !== effectiveProjectId) || !completedBassAuthority.exportable}
                        exportDisabledMessage={!completedBassAuthority.exportable ? "Bass analysis updating" : "Report loading"}
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

                            {/* ── Page 2: Project details, geometry, system summary, counts ── */}
                            <div className="print-page-break-after print-summary">
                                <div className="rp22-cover-stack" style={{ maxWidth: '195mm', margin: '0 auto 0', display: 'flex', flexDirection: 'column', gap: '3mm' }}>
                                    <div className="print-avoid-break rp22-cover-card" style={{ marginBottom: '0', textAlign: 'left' }}>
                                        <ProjectDetailsCard
                                            project={frontPageProjectDetails}
                                            extraItems={frontPageProjectDetails?.extraItems || []}
                                            title={`Project details  –  System Configuration  –  ${exportSystemConfiguration || '—'}`}
                                            subtitle=""
                                            className="bg-[#FBFAF8] border-[1.5px] border-[#D9D5CE] shadow-none rounded-[10px]"
                                            contentClassName="px-[10mm] py-[8mm]"
                                            headerClassName="mb-[4mm]"
                                            titleClassName="text-center text-[15pt] font-bold leading-[1.15] text-[#1B1A1A]"
                                            subtitleClassName="hidden"
                                            gridClassName="grid grid-cols-2 gap-x-[8mm] gap-y-[3mm] lg:grid-cols-2"
                                            labelClassName="text-[10px] font-medium uppercase tracking-[0.06em] leading-[1.1] text-[#625143]"
                                            valueClassName="mt-[1mm] truncate text-[12px] font-medium leading-[1.3] text-[#1B1A1A]"
                                            hideProjectId={true}
                                        />
                                    </div>

                                    {/* Screen & Viewing Geometry */}
                                    <div style={coverBoxStyle} className="print-avoid-break rp22-cover-card">
                                        <div style={coverBoxTitleStyle}>Screen &amp; Viewing Geometry</div>
                                        {(() => {
                                            // Screen dims — resolve width from TV preset first, then fall back to visibleWidthInches
                                            const TV_PRESET_WIDTH_MM = { tv65: 1411, tv77: 1711, tv83: 1872, tv100: 2230 };
                                            const tvPresetKey = app?.screen?.tvPresetKey;
                                            const tvWidthMm = Number(app?.screen?.tvWidthMm);
                                            const resolvedWidthIn = (() => {
                                               if (tvPresetKey && TV_PRESET_WIDTH_MM[tvPresetKey]) {
                                                   return TV_PRESET_WIDTH_MM[tvPresetKey] / 25.4;
                                               }
                                               if (Number.isFinite(tvWidthMm) && tvWidthMm > 0) {
                                                   return tvWidthMm / 25.4;
                                               }
                                               return Number(app?.screen?.visibleWidthInches) || 0;
                                            })();
                                            const liveAspect = app?.screen?.aspectRatio || "16:9";
                                            const liveBorderM = Number(app?.screen?.borderThicknessM);
                                            const borderThicknessM = Number.isFinite(liveBorderM) && liveBorderM >= 0 ? liveBorderM : 0.08;
                                            const { viewWm, viewHm, overallWm, overallHm } = (resolvedWidthIn > 0)
                                               ? computeScreenMetrics(resolvedWidthIn, liveAspect, borderThicknessM)
                                               : { viewWm: null, viewHm: null, overallWm: null, overallHm: null };
                                            const choiceLabel = formatScreenChoiceLabel(app?.screen) || "Not specified";
                                            const hasViewable = Number.isFinite(viewWm) && viewWm > 0 && Number.isFinite(viewHm) && viewHm > 0;
                                            const hasOverall = Number.isFinite(overallWm) && overallWm > 0 && Number.isFinite(overallHm) && overallHm > 0;
                                            const fmtCm = (m) => `${Math.round(m * 100)}`;

                                            // Per-row geometry — use the same representative row seat source as all
                                            // other report/export RP23 sections: rowCentralSeats.
                                            const screenFrontM = app?.screenFrontPlaneM ?? 0;
                                            const screenY = Number.isFinite(screenFrontM) ? screenFrontM : 0;
                                            const scrW = viewWm || 0;
                                            const scrH = viewHm || 0;
                                            const scrBottom = Number(app?.screen?.heightFromFloorM ?? app?.screenHeight ?? 0.5);
                                            const scrTop = scrBottom + scrH;
                                            const buildRowGeoEntry = (eyeY, eyeZ, rowNumber) => {
                                                const dist = Math.abs(eyeY - screenY);
                                                const hAngle = dist > 0 ? 2 * Math.atan((scrW / 2) / dist) * (180 / Math.PI) : 0;
                                                const vTop = dist > 0 ? Math.atan2(scrTop - eyeZ, dist) * (180 / Math.PI) : 0;
                                                const vBot = dist > 0 ? Math.atan2(scrBottom - eyeZ, dist) * (180 / Math.PI) : 0;
                                                return { rowNumber, viewingDistanceM: dist, horizontalViewingAngleDeg: hAngle, totalVerticalAngleDeg: vTop - vBot };
                                            };
                                            const rowGeo = rowCentralSeats
                                                .map(seat => buildRowGeoEntry(
                                                    seat.y,
                                                    Number.isFinite(seat.z) ? seat.z : 1.2,
                                                    seat.rowNumber || 1
                                                ))
                                                .filter(Boolean);

                                            return (
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', columnGap: '8mm', rowGap: '4mm' }}>
                                                    <div>
                                                        <div style={coverSectionTitleStyle}>Screen size — {choiceLabel}</div>
                                                        <div style={{ display: 'grid', rowGap: '2.5mm' }}>
                                                            <div style={coverLabelValueRowStyle}>
                                                                <div style={coverLabelStyle}>Viewable area</div>
                                                                {hasViewable ? <div style={coverValueStyle}>{fmtCm(viewWm)} × {fmtCm(viewHm)} cm</div> : <div style={coverValueStyle}>Not specified</div>}
                                                            </div>
                                                            <div style={coverLabelValueRowStyle}>
                                                                <div style={coverLabelStyle}>Overall with border</div>
                                                                {hasOverall ? <div style={coverValueStyle}>{fmtCm(overallWm)} × {fmtCm(overallHm)} cm</div> : <div style={coverValueStyle}>Not specified</div>}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div style={coverSectionTitleStyle}>Viewing geometry — per row</div>
                                                        {rowGeo.length > 0 ? (
                                                            <div>
                                                                <div style={{ display: 'grid', rowGap: '3mm' }}>
                                                                    {rowGeo.map(row => {
                                                                                        const hDeg = row.horizontalViewingAngleDeg;
                                                                                        const displayHorizontalDeg = rp23DisplayAngleDeg(hDeg);
                                                                                        const rp23AngleStr = Number.isFinite(displayHorizontalDeg) ? `${displayHorizontalDeg}°` : '—';
                                                                                        const rp23Level = rp23LevelForAngleDeg(hDeg);
                                                                                        return (
                                                                                            <div key={row.rowNumber} style={{ paddingBottom: '2mm', borderBottom: '1px solid #F0EFEA', display: 'grid', gridTemplateColumns: '1fr auto', columnGap: '6mm', alignItems: 'start' }}>
                                                                                                {/* Left: existing geometry values */}
                                                                                                <div>
                                                                                                    <div style={{ ...coverLabelStyle, marginBottom: '1.5mm' }}>Row {row.rowNumber}</div>
                                                                                                    <div style={coverLabelValueRowStyle}>
                                                                                                        <div style={{ ...coverLabelStyle, fontWeight: 400 }}>Horizontal angle</div>
                                                                                                        <div style={coverValueStyle}>{rp23AngleStr}</div>
                                                                                                    </div>
                                                                                                    <div style={coverLabelValueRowStyle}>
                                                                                                        <div style={{ ...coverLabelStyle, fontWeight: 400 }}>Vertical angle</div>
                                                                                                        <div style={coverValueStyle}>{Number.isFinite(row.totalVerticalAngleDeg) ? `${row.totalVerticalAngleDeg.toFixed(1)}°` : '—'}</div>
                                                                                                    </div>
                                                                                                    <div style={coverLabelValueRowStyle}>
                                                                                                        <div style={{ ...coverLabelStyle, fontWeight: 400 }}>Distance from wall</div>
                                                                                                        <div style={coverValueStyle}>{Number.isFinite(row.viewingDistanceM) ? `${Math.round(row.viewingDistanceM * 100)} cm` : '—'}</div>
                                                                                                    </div>
                                                                                                </div>
                                                                                                {/* Right: RP23 block */}
                                                                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minWidth: '28mm' }}>
                                                                                                    <div style={{ fontSize: '8pt', fontWeight: 600, color: '#625143', marginBottom: '2mm', textAlign: 'center', whiteSpace: 'nowrap' }}>RP23 viewing angle</div>
                                                                                                    <div style={{ fontSize: '10pt', fontWeight: 700, color: '#1B1A1A', marginBottom: '2mm', textAlign: 'center' }}>{rp23AngleStr}</div>
                                                                                                    <PrintRp23Pill level={rp23Level} />
                                                                                                </div>
                                                                                            </div>
                                                                                        );
                                                                                    })}
                                                                </div>
                                                                {/* RP23 reference ranges */}
                                                                <div style={{ marginTop: '4mm', paddingTop: '3mm', borderTop: '1px solid #E8E6E1', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', textAlign: 'center', fontSize: '9pt', color: '#6F6B64' }}>
                                                                    <div><div style={{ fontWeight: 600 }}>L4</div><div>50°–65°</div></div>
                                                                    <div><div style={{ fontWeight: 600 }}>L3</div><div>45°–70°</div></div>
                                                                    <div><div style={{ fontWeight: 600 }}>L2</div><div>40°–80°</div></div>
                                                                    <div><div style={{ fontWeight: 600 }}>L1</div><div>33°–90°</div></div>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div style={coverValueStyle}>Not specified</div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </div>

                                    {/* System Summary */}
                                     <div style={coverBoxStyle} className="print-avoid-break rp22-cover-card">
                                         <div style={coverBoxTitleStyle}>System summary</div>
                                         <div style={coverBoxSubtitleStyle}>Selected loudspeaker models</div>
                                         <div style={{ display: 'grid', rowGap: '4mm' }}>
                                             {[['LCR', systemSummary.lcr], ['Surrounds', systemSummary.surrounds], ['Overheads', systemSummary.overheads], ['Subwoofers', systemSummary.subs]].map(([label, models], i, arr) => (
                                                 <div key={label} style={{ display: 'grid', gridTemplateColumns: '32mm 1fr', columnGap: '6mm', alignItems: 'start', paddingBottom: i < arr.length - 1 ? '4mm' : 0, borderBottom: i < arr.length - 1 ? '1px solid #EEEAE3' : 'none' }}>
                                                     <div style={{ fontWeight: 600, fontSize: '11.5pt', color: '#1B1A1A', lineHeight: 1.3 }}>{label}</div>
                                                     <div style={{ fontSize: '11.5pt', color: '#3E4349', lineHeight: 1.3 }}>{models.join(', ')}</div>
                                                 </div>
                                             ))}
                                         </div>
                                     </div>

                                    </div>

                                    {/* ReportCountsDashboard at bottom of project/summary page */}
                                    <div style={{ maxWidth: '195mm', width: '100%', margin: '5mm auto 0', paddingTop: '5mm' }}>
                                     <ReportCountsDashboard
                                         roomLevelCounts={roomLevelCounts}
                                         seatCountsByRow={seatCountsByRow}
                                         analysisResult={analysisResult}
                                         totalRoomParameters={roomScopedParamCount}
                                         totalSeatParameters={seatScopedParamCount}
                                     />
                                    </div>
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
                            <section id="pdf-room-plan-positions" className="print-page-break-after" style={{ background: "transparent", padding: 0, margin: 0 }}>
                                <div className="plan-fitbox"><img src={planSpeakerDimsImageDataUrl} alt="Room plan (speaker positions)" style={{ background: "transparent" }} /></div>
                            </section>
                        )}

                        <section
                          id="pdf-room-parameters"
                          data-bass-result-fingerprint={complianceBassExportData.resultFingerprint || ""}
                          data-bass-selected-candidate={complianceBassExportData.selectedCandidateId || ""}
                        >
                             <div>
                                 <div style={{ fontFamily: 'Futura PT Light, Century Gothic, sans-serif', fontSize: 18, fontWeight: 700, color: '#1B1A1A', marginBottom: 14 }}>RP22 Parameters</div>
                                <div style={{ color: '#3E4349', fontSize: 11, marginBottom: 10 }}>Live report parameter cards using the same room and seat rendering path as the in-app RP22 report.</div>
                                <RP22ReportParameterGrid {...parameterGridProps} />
                            </div>
                        </section>

                        {/* ── Elevation Drawings page ── */}
                        <section id="pdf-elevation-drawings" className="print-page-break-before" style={{ padding: '8mm 10mm', background: '#FFFFFF' }}>
                            <div style={{ fontFamily: 'Futura PT Light, Century Gothic, sans-serif', fontSize: 18, fontWeight: 700, color: '#1B1A1A', marginBottom: 14 }}>Elevation Drawings</div>
                            <div style={{ marginBottom: 48 }}>
                                <FrontElevation
                                    dimensions={stableDimensions}
                                    screen={screen}
                                    placedSpeakers={placedSpeakers}
                                    frontSubs={frontSubs}
                                    frontSubsCfg={frontSubsCfg}
                                    roomElements={(app?.roomElements || []).filter(el => el?.type !== 'projector')}
                                />
                            </div>
                            <div style={{ marginBottom: 16 }}>
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
                            <div>
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
                                </section>

                                <section
                                    id="pdf-screen-wall-construction"
                                    className="print-page-break-before"
                                    style={{ padding: '8mm 10mm', background: '#FFFFFF' }}
                                >
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
                                        placedSpeakers={placedSpeakers}
                                        frontSubs={frontSubs}
                                        frontSubsCfg={app?.frontSubsCfg}
                                    />
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