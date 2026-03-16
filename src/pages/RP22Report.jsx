import React, { useEffect, useState } from 'react';
import { useAppState } from '../components/AppStateProvider';
// TEMP DEBUG: remove after sub persistence proven
import { useActiveProjectId } from '@/components/state/project-session';
// END TEMP DEBUG
import { useRP22AnalysisEngine } from '../components/hooks/useRP22AnalysisEngine';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart4 } from 'lucide-react';
import { rp22Parameters } from '../components/data/rp22Parameters';
import ParameterCard from '../components/report/ParameterCard';
import SeatComplianceSummary from '../components/report/SeatComplianceSummary';
import RP22GradingPill from '../components/ui/RP22GradingPill';
import { computeAllSeatSplMetrics } from '../components/utils/spl/centralSplEngine';
import { getSpeakerModelMeta } from '../components/models/speakers/registry';
import { buildSeatHudSnapshot } from '../components/utils/buildSeatHudSnapshot';
import { formatSeatLabel } from '../components/utils/seatLabel';
import { computeScreenMetrics } from '../components/utils/screenMetrics';
import { calculateViewingAngle } from '../components/utils/viewingAngleUtils';
import { safeYawToMLP } from '@/components/room/rv/RenderPrimitives';
import { deriveSubwoofersFromCfg } from '@/components/utils/deriveSubwoofersFromCfg';
import { hydrateProjectIntoAppState } from '@/components/utils/hydrateProjectIntoAppState';
import { base44 } from '@/api/base44Client';

// Extracted child components
import ReportPrintStyles from '../components/report/ReportPrintStyles';
import ReportHeader from '../components/report/ReportHeader';
import ReportCountsDashboard from '../components/report/ReportCountsDashboard';
import ReportSeatParametersCard from '../components/report/ReportSeatParametersCard';
import ReportHiddenCaptures from '../components/report/ReportHiddenCaptures';
import SightlineGraphic from '../components/report/SightlineGraphic';
import { fovForDistance } from '../components/utils/screenMetrics';

// --- Plan capture helpers (kept here since they close over state setters) ---
const MIN_EXPORT_BBOX_PX = 200;

function hasRvExportBounds(svgEl) {
    try { return !!(svgEl && svgEl.querySelector && svgEl.querySelector('#export-bounds')); } catch { return false; }
}

function stripExportViewportTransforms(svgClone) {
    try {
        const anchor = svgClone.querySelector('#export-crop-bounds') || svgClone.querySelector('#export-bounds');
        if (!anchor) return;
        let node = anchor.parentNode;
        while (node && node.nodeName && node.nodeName.toLowerCase() !== 'svg') {
            if (node.nodeName.toLowerCase() === 'g') {
                node.removeAttribute('transform');
                node.removeAttribute('clip-path');
                node.removeAttribute('clipPath');
                if (node.style) { node.style.transform = 'none'; node.style.transformOrigin = '0 0'; }
            }
            node = node.parentNode;
        }
    } catch { }
}

function measureBboxFromClone(svgClone, selector) {
    let host = null;
    try {
        const el = svgClone.querySelector(selector);
        if (!el) return null;
        host = document.createElement('div');
        host.style.cssText = 'position:fixed;left:-10000px;top:-10000px;width:1px;height:1px;overflow:hidden;pointer-events:none;opacity:0;';
        document.body.appendChild(host);
        host.appendChild(svgClone);
        const b = el.getBBox();
        if (!b || !(b.width > 0) || !(b.height > 0)) return null;
        return { x: b.x, y: b.y, width: b.width, height: b.height };
    } catch { return null; }
    finally {
        try { if (host && host.parentNode) host.parentNode.removeChild(host); } catch { }
    }
}

function drawDebugOverlay(ctx, canvasW, canvasH, debugInfo, enabled) {
    if (!enabled) return;
    const lines = [
        `PLAN: ${debugInfo.planLabel || '?'}`,
        `SRC: ${debugInfo.baseRectSource || '?'}`,
        `crop: x${Math.round(debugInfo.cropRect?.x || 0)} y${Math.round(debugInfo.cropRect?.y || 0)} w${Math.round(debugInfo.cropRect?.width || 0)} h${Math.round(debugInfo.cropRect?.height || 0)}`,
        `bbox: x${Math.round(debugInfo.contentBbox?.x || 0)} y${Math.round(debugInfo.contentBbox?.y || 0)} w${Math.round(debugInfo.contentBbox?.width || 0)} h${Math.round(debugInfo.contentBbox?.height || 0)}`,
        `vb  : X${Math.round(debugInfo.viewBoxX || 0)} Y${Math.round(debugInfo.viewBoxY || 0)} W${Math.round(debugInfo.viewBoxW || 0)} H${Math.round(debugInfo.viewBoxH || 0)}`,
        `ratio: ${(debugInfo.ratio || 0).toFixed(3)}`,
        `png : ${debugInfo.canvasW || 0} x ${debugInfo.canvasH || 0}`,
    ];
    const fontSize = 12; const lineHeight = 16; const padding = 10; const margin = 20;
    ctx.font = `${fontSize}px monospace`;
    const textW = Math.max(...lines.map(l => ctx.measureText(l).width));
    const boxW = textW + padding * 2;
    const boxH = lines.length * lineHeight + padding * 2;
    const boxX = margin;
    const boxY = canvasH - boxH - margin;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.fillStyle = '#FFFFFF';
    ctx.textBaseline = 'top';
    lines.forEach((line, i) => ctx.fillText(line, boxX + padding, boxY + padding + i * lineHeight));
}

// Generic SVG-to-PNG capture effect factory
function usePlanCapture({ isPrinting, imageDataUrl, setImageDataUrl, selector, planLabel, debugPlanCapture, exportTimeoutRef, exportGuardRef, setExportStatus, setIsPrinting, setExportDebug }) {
    useEffect(() => {
        if (!isPrinting || imageDataUrl !== null) return;
        setExportStatus(`Capturing ${planLabel}: waiting for SVG…`);
        let attempts = 0;
        const maxAttempts = 20;
        let retryTimer = null;

        const attemptCapture = async () => {
            attempts++;
            try {
                const planElement = document.querySelector(selector);
                if (!planElement) {
                    if (attempts < maxAttempts) { retryTimer = setTimeout(attemptCapture, 100); return; }
                    setImageDataUrl('__SKIP__'); return;
                }
                const svgElement = planElement.querySelector('svg');
                if (!svgElement) {
                    if (attempts < maxAttempts) { retryTimer = setTimeout(attemptCapture, 100); return; }
                    setImageDataUrl('__SKIP__'); return;
                }

                let liveAnchor = null;
                try { liveAnchor = svgElement.querySelector('#export-crop-bounds') || svgElement.querySelector('#export-bounds'); } catch { }
                if (!liveAnchor) {
                    if (attempts < maxAttempts) { retryTimer = setTimeout(attemptCapture, 100); return; }
                    setImageDataUrl('__SKIP__'); return;
                }

                try {
                    const b = liveAnchor.getBBox?.();
                    if (b && Number.isFinite(b.width) && Number.isFinite(b.height) && (b.width < MIN_EXPORT_BBOX_PX || b.height < MIN_EXPORT_BBOX_PX)) {
                        if (attempts < maxAttempts) { retryTimer = setTimeout(attemptCapture, 100); return; }
                        setImageDataUrl('__SKIP__'); return;
                    }
                } catch { }

                if (!hasRvExportBounds(svgElement)) {
                    if (attempts < maxAttempts) { retryTimer = setTimeout(attemptCapture, 100); return; }
                    setImageDataUrl('__SKIP__'); return;
                }

                const svgClone = svgElement.cloneNode(true);
                svgClone.style.opacity = '1';
                stripExportViewportTransforms(svgClone);

                const cropRectEl = svgClone.querySelector('#export-crop-bounds');
                const cropRect = cropRectEl ? {
                    x: Number(cropRectEl.getAttribute('x')),
                    y: Number(cropRectEl.getAttribute('y')),
                    width: Number(cropRectEl.getAttribute('width')),
                    height: Number(cropRectEl.getAttribute('height')),
                } : null;

                const bbox = measureBboxFromClone(svgClone, '#export-content-bounds');
                const baseRect = (bbox && bbox.width > 0 && bbox.height > 0) ? bbox : cropRect;

                if (!baseRect || !Number.isFinite(baseRect.width) || baseRect.width <= 0) {
                    if (attempts < maxAttempts) { retryTimer = setTimeout(attemptCapture, 100); return; }
                    setImageDataUrl('__SKIP__'); return;
                }

                const BUFFER_PX = 80;
                const viewBoxX = baseRect.x - BUFFER_PX;
                const viewBoxY = baseRect.y - BUFFER_PX;
                const viewBoxW = baseRect.width + (2 * BUFFER_PX);
                const viewBoxH = baseRect.height + (2 * BUFFER_PX);

                svgClone.setAttribute('viewBox', `${viewBoxX} ${viewBoxY} ${viewBoxW} ${viewBoxH}`);
                svgClone.setAttribute('preserveAspectRatio', 'xMidYMid meet');
                svgClone.removeAttribute('width');
                svgClone.removeAttribute('height');

                const svgString = new XMLSerializer().serializeToString(svgClone);
                const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
                const url = URL.createObjectURL(svgBlob);

                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const targetW = 3000;
                    const ratio = viewBoxH / viewBoxW;
                    canvas.width = targetW;
                    canvas.height = Math.round(targetW * ratio);
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    drawDebugOverlay(ctx, canvas.width, canvas.height, {
                        planLabel, baseRectSource: (bbox && bbox.width > 0) ? 'bbox' : 'cropRect',
                        cropRect, contentBbox: bbox, baseRect, viewBoxX, viewBoxY, viewBoxW, viewBoxH,
                        ratio, canvasW: canvas.width, canvasH: canvas.height, BUFFER_PX,
                    }, debugPlanCapture);
                    setImageDataUrl(canvas.toDataURL('image/png'));
                    setExportStatus(`${planLabel} captured`);
                    URL.revokeObjectURL(url);
                };
                img.onerror = () => {
                    if (attempts < maxAttempts) { retryTimer = setTimeout(attemptCapture, 100); }
                    else { setImageDataUrl('__SKIP__'); }
                    URL.revokeObjectURL(url);
                };
                img.src = url;
            } catch (err) {
                if (attempts < maxAttempts) { retryTimer = setTimeout(attemptCapture, 100); }
                else {
                    exportGuardRef.current.active = false;
                    setIsPrinting(false);
                    setTimeout(() => window.print(), 250);
                }
            }
        };

        attemptCapture();
        return () => { if (retryTimer) clearTimeout(retryTimer); };
    }, [isPrinting, imageDataUrl]);
}

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

    const devMode = false;

    const activeProjectId = useActiveProjectId();

    // Full project hydration for RP22Report — mirrors Room Designer's useProjectLoader path
    useEffect(() => {
        if (!activeProjectId || !app) return;
        base44.entities.Project.filter({ id: activeProjectId }).then((results) => {
            const p = Array.isArray(results) && results.length > 0 ? results[0] : null;
            if (!p) return;
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
            });
        }).catch(() => {});
    }, [activeProjectId]);

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
        if (!isPrinting) return;
        if (planImageDataUrl !== null && planDimsImageDataUrl !== null && planSpeakerDimsImageDataUrl !== null) {
            setExportDebug(d => ({ ...d, printReady: true }));
            setPrintReady(true);
            setExportStatus("Capture complete — preparing print…");
            if (exportTimeoutRef.current) { clearTimeout(exportTimeoutRef.current); exportTimeoutRef.current = null; }
        }
    }, [isPrinting, planImageDataUrl, planDimsImageDataUrl, planSpeakerDimsImageDataUrl]);

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

    const safeArray = (v) => (Array.isArray(v) ? v : []);
    const safeObj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);

    const seats = safeArray(app?.seatingPositions);
    const placedSpeakers = safeArray(app?.speakerSystem?.placedSpeakers);
    const roomDims = app?.roomDims || {};
    const screen = app?.screen || {};
    const dolbyLayout = app?.dolbyLayout || "5.1";
    const mlpBasis = app?.mlpBasis || "front";
    const frontSubsCfg = safeObj(app?.frontSubsCfg);
    const rearSubsCfg = safeObj(app?.rearSubsCfg);
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
        const inches = Number(scr?.visibleWidthInches || scr?.diagonalInches || scr?.sizeInches);
        const ratio = cleanAspectLabel(scr?.aspectRatio);
        const inchesTxt = Number.isFinite(inches) && inches > 0 ? `${Math.round(inches)}"` : "";
        const ratioTxt = ratio ? ratio : "";
        return [inchesTxt, ratioTxt].filter(Boolean).join(" ") || "Not specified";
    };

    const stableDimensions = React.useMemo(() => ({
        width: Number(roomDims?.widthM) || 4.5,
        length: Number(roomDims?.lengthM) || 6.0,
        height: Number(roomDims?.heightM) || 2.4
    }), [roomDims?.widthM, roomDims?.lengthM, roomDims?.heightM]);

    const primarySeatingPosition = app?.mlp || null;

    const rspSeatId = React.useMemo(() => {
        const greenDot = app?.mlp;
        if (!greenDot || !Number.isFinite(greenDot.x) || !Number.isFinite(greenDot.y)) return null;
        let closestSeat = null; let minDist = Infinity;
        seats.forEach(s => {
            if (!Number.isFinite(s?.x) || !Number.isFinite(s?.y)) return;
            const d = Math.hypot(s.x - greenDot.x, s.y - greenDot.y);
            if (d < minDist) { minDist = d; closestSeat = s.id; }
        });
        return (minDist <= 0.05) ? closestSeat : null;
    }, [seats, app?.mlp]);

    const resolveScreenMetricsSnapshot = React.useCallback(() => {
        try {
            const mlpY_m = app?.mlp?.y ?? stableDimensions.length * 0.58;
            const screenFrontPlaneM = app?.screenFrontPlaneM ?? app?.screen?.frontPlaneYm ?? null;
            const visibleWidthInches = Number(app?.screen?.visibleWidthInches);
            const aspectRatio = app?.screen?.aspectRatio ?? "16:9";
            if (!Number.isFinite(screenFrontPlaneM) || !Number.isFinite(visibleWidthInches) || visibleWidthInches <= 0) {
                return { ok: true, viewWm: null, viewHm: null, overallWm: null, overallHm: null, horizontalDeg: null, verticalDeg: null, wallDistM: null, wallCm: null, wallIn: null, screenChoiceLabel: formatScreenChoiceLabel(app?.screen) };
            }
            const { viewWm, viewHm, overallWm, overallHm } = computeScreenMetrics(visibleWidthInches, aspectRatio);
            const horizDeg = calculateViewingAngle({ y: mlpY_m }, visibleWidthInches, aspectRatio, { y: screenFrontPlaneM });
            const viewerDistance = Math.abs(mlpY_m - screenFrontPlaneM);
            const verticalDeg = viewerDistance > 0 ? (2 * Math.atan(viewHm / (2 * viewerDistance)) * (180 / Math.PI)) : 0;
            return {
                ok: true, viewWm, viewHm, overallWm, overallHm,
                horizontalDeg: horizDeg ?? 0, verticalDeg,
                wallDistM: screenFrontPlaneM,
                wallCm: (screenFrontPlaneM * 100).toFixed(0),
                wallIn: (screenFrontPlaneM * 39.3701).toFixed(1),
                screenChoiceLabel: formatScreenChoiceLabel(app?.screen)
            };
        } catch {
            return { ok: true, viewWm: null, viewHm: null, overallWm: null, overallHm: null, horizontalDeg: null, verticalDeg: null, wallDistM: null, wallCm: null, wallIn: null, screenChoiceLabel: formatScreenChoiceLabel(app?.screen) };
        }
    }, [app?.mlp?.y, app?.screenFrontPlaneM, app?.screen?.frontPlaneYm, app?.screen?.visibleWidthInches, app?.screen?.aspectRatio, stableDimensions.length]);

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
        placedSpeakers, seatingPositions: seats, primarySeatingPosition,
        dimensions: stableDimensions, mlpBasis,
        sevenBedLayoutType: app?.sevenBedLayoutType,
        extraSurroundCount: app?.extraSurroundCount,
        seatSplMetrics: allSeatSplMetrics,
        overheadState: { globalModel: app?.overheadGlobalModel, frontOverride: app?.overheadFrontOverride, midOverride: app?.overheadMidOverride, rearOverride: app?.overheadRearOverride, useFrontGlobal: app?.useFrontGlobal ?? true, useMidGlobal: app?.useMidGlobal ?? true, useRearGlobal: app?.useRearGlobal ?? true, aimFrontWidesAtMLP: app?.aimFrontWidesAtMLP, aimSideSurroundsAtMLP: app?.aimSideSurroundsAtMLP, aimRearSurroundsAtMLP: app?.aimRearSurroundsAtMLP },
        aimState: { aimFrontWidesAtMLP: app?.aimFrontWidesAtMLP, aimSideSurroundsAtMLP: app?.aimSideSurroundsAtMLP, aimRearSurroundsAtMLP: app?.aimRearSurroundsAtMLP },
        p15ConstructionLevel: app?.p15ConstructionLevel
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
                });
                if (snapshot) out[seat.id] = snapshot;
            } catch (e) { console.warn(`[RP22Report] HUD failed for seat ${seat.id}:`, e); }
        }
        return out;
    }, [seats, placedSpeakers, stableDimensions.width, stableDimensions.length, stableDimensions.height, screen, primarySeatingPosition, allSeatSplMetrics, app?.aimAtMLP, app?.aimFrontWidesAtMLP, app?.aimSideSurroundsAtMLP, app?.aimRearSurroundsAtMLP, app?.screenFrontPlaneM, app?.screen?.frontPlaneYm, app?.splConfig, analysisResult, reportSevenBedMode, reportDolbyLayout]);

    const orderedParams = React.useMemo(() => {
        const perSeatParams = new Set([1, 4, 5, 6, 9, 10, 16, 17, 20]);
        return [...rp22Parameters].filter(p => !perSeatParams.has(p.number)).sort((a, b) => a.id - b.id);
    }, []);

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
        const normaliseLvl = (rawLevel) => {
            if (rawLevel == null) return null;
            if (typeof rawLevel === "number" && Number.isFinite(rawLevel)) { if (rawLevel >= 1 && rawLevel <= 4) return `L${rawLevel}`; return null; }
            if (typeof rawLevel === "string") { const m = rawLevel.trim().match(/^L([1-4])$/i); if (m) return `L${m[1]}`; }
            return null;
        };
        const res = getRoomResult(paramId);
        if (res) {
            if (res.status && typeof res.status === "string") { const s = res.status.toLowerCase(); if (s === "no_data" || s === "fail") return null; }
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
        if (paramId === 21) return ({ l1: "L1", l2: "L2", l3: "L3", l4: "L4" })[app?.p21EarlyReflectionPreset || 'l2'] || null;
        return null;
    }, [analysisResult, getRoomResult, p2SystemConfig, app?.p15ConstructionLevel, app?.p21EarlyReflectionPreset]);

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
        for (const id of [2, 3, 7, 8, 11, 12, 13, 14, 15, 18, 19, 21]) {
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
            const tooltipData = app?.seatSnapshotBySeatId?.[seatId] ?? reportSeatHudById?.[seatId] ?? app?.seatMetricsById?.[seatId] ?? null;
            const rp23 = tooltipData?.rp23 || {};
            const rp22Hud = tooltipData?.rp22 || {};
            const getRp22Metric = (key) => {
                const n = parseInt(String(key).replace("p", ""), 10);
                if (!Number.isFinite(n)) return null;
                return rp22Hud[key] ?? rp22Hud[`p${n}`] ?? rp22Hud[n] ?? rp22Hud[String(n)] ?? null;
            };
            const lvl23 = normalizeLvl(rp23?.level);
            if (lvl23) counts[lvl23] += 1;
            ['p1', 'p4', 'p5', 'p6', 'p9', 'p10', 'p16', 'p17', 'p20'].forEach(key => {
                const metric = getRp22Metric(key);
                if (!metric) return;
                const lvl = normalizeLvl(metric.level);
                if (lvl) counts[lvl] += 1;
            });
            return { seatId, counts, total: 10 };
        });
        if (!next.length && lastSeatLevelCountsRef.current.length) return lastSeatLevelCountsRef.current;
        lastSeatLevelCountsRef.current = next;
        return next;
    }, [reportSeatHudById, app?.seatSnapshotBySeatId, app?.seatMetricsById, seats]);

    const seatCountsByRow = React.useMemo(() => {
        const rows = {};
        seatLevelCounts.forEach(({ seatId, counts, total }) => {
            const match = seatId.match(/^seat-r(\d+)-c(\d+)$/);
            const rowNum = match ? parseInt(match[1], 10) : 0;
            const seatNum = match ? parseInt(match[2], 10) : Number.MAX_SAFE_INTEGER;
            if (!rows[rowNum]) rows[rowNum] = [];
            rows[rowNum].push({ seatId, counts, total, seatNum });
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
        if (!canRenderSightlinePage) return [];
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
                // 1. prefer isPrimary
                const primary = rowSeats.filter(s => s.isPrimary);
                const candidates = primary.length ? primary : rowSeats;
                // 2. closest to room centreline, tie-break on id string sort
                return candidates
                    .slice()
                    .sort((a, b) => {
                        const da = Math.abs(a.x - roomCentreX);
                        const db = Math.abs(b.x - roomCentreX);
                        if (Math.abs(da - db) > 0.001) return da - db;
                        return String(a.id || '').localeCompare(String(b.id || ''));
                    })[0];
            })
            .filter(Boolean);
    }, [canRenderSightlinePage, app?.seatingPositions, stableDimensions.width]);

    const sightlineRowData = React.useMemo(() => {
        if (!canRenderSightlinePage || !sightlineScreenMetrics || !rowCentralSeats.length) return [];
        const { screenFrontPlaneY, screenBottomHeightM, screenTopHeightM, screenWidthM } = sightlineScreenMetrics;
        const aspectRatio = app?.screen?.aspectRatio || '16:9';
        return rowCentralSeats.map(seat => {
            const eyeY = seat.y;
            const eyeZ = Number.isFinite(seat.z) ? seat.z : 1.2;
            const viewingDistanceM = Math.abs(eyeY - screenFrontPlaneY);
            const horizontalViewingAngleDeg = viewingDistanceM > 0
                ? 2 * Math.atan((screenWidthM / 2) / viewingDistanceM) * (180 / Math.PI)
                : 0;
            const verticalAngleToTopDeg    = viewingDistanceM > 0 ? Math.atan2(screenTopHeightM    - eyeZ, viewingDistanceM) * (180 / Math.PI) : 0;
            const verticalAngleToBottomDeg = viewingDistanceM > 0 ? Math.atan2(screenBottomHeightM - eyeZ, viewingDistanceM) * (180 / Math.PI) : 0;
            const totalVerticalAngleDeg    = verticalAngleToTopDeg - verticalAngleToBottomDeg;
            const seatHud = reportSeatHudById?.[seat.id];
            const rp23 = seatHud?.rp23;
            const complianceNote = rp23?.level
                ? `RP23 H: ${rp23.formatted || `${(horizontalViewingAngleDeg).toFixed(1)}°`} (${rp23.level})`
                : '—';
            return {
                rowNumber: seat.rowNumber || 1,
                seatId:    seat.id,
                eyeY, eyeZ,
                viewingDistanceM,
                horizontalViewingAngleDeg,
                verticalAngleToTopDeg,
                verticalAngleToBottomDeg,
                totalVerticalAngleDeg,
                complianceNote,
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
            const model = normalizeModel(spk?.model);
            if (!model) return;
            let cat = null;
            if (['FL', 'FC', 'FR', 'L', 'C', 'R'].includes(role)) cat = 'lcr';
            else if (['SL', 'SR', 'SBL', 'SBR', 'LW', 'RW', 'LS', 'RS', 'LR', 'RR', 'FWL', 'FWR'].includes(role)) cat = 'surrounds';
            else if (role.startsWith('T') || role.startsWith('U')) cat = 'overheads';
            if (cat) byCategory[cat][model] = (byCategory[cat][model] || 0) + 1;
        });
        Object.keys(byCategory).forEach(cat => {
            const models = Object.entries(byCategory[cat]).map(([k, count]) => { const name = getDisplayName(k) || k; return count > 1 ? `${name} × ${count}` : name; }).sort();
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

    const planEnabled = true;

    return (
        <div className="min-h-screen bg-[#F9F8F6] p-6">
            <ReportPrintStyles />

            <div className="screen-only">
                {devMode && (
                    <>
                        {/* TEMP DEBUG: DB Snapshot */}
                        <div className="print:hidden mb-4 p-3 border border-gray-300 rounded text-xs text-gray-600 bg-gray-50 max-w-2xl font-mono">
                            <div className="font-bold text-gray-700 mb-1">DB Snapshot</div>
                            {dbSnapshotErr && <div className="text-red-500">Error: {dbSnapshotErr}</div>}
                            {dbSnapshot ? (
                                <ul className="space-y-0.5">
                                    <li>Active project id: <strong>{activeProjectId || "—"}</strong></li>
                                    <li>Project name: <strong>{dbSnapshot.name ?? "—"}</strong></li>
                                    <li>subwoofers field: <strong>{dbSnapshot.hasSubwoofersField ? "present" : "missing"}</strong></li>
                                    <li>subwoofers type: <strong>{dbSnapshot.subwoofersType ?? "—"}</strong></li>
                                    <li>subwoofers length: <strong>{dbSnapshot.subwoofersLength ?? "—"}</strong></li>
                                    {dbSnapshot.subFirst && (
                                        <li>first sub — model: <strong>{dbSnapshot.subFirst.model}</strong>, group: <strong>{dbSnapshot.subFirst.group}</strong>, role: <strong>{dbSnapshot.subFirst.role}</strong></li>
                                    )}
                                    <li>front_subs_cfg present: <strong>{dbSnapshot.front_subs_cfg_present ? "yes" : "no"}</strong></li>
                                    <li>front_subs_cfg model: <strong>{dbSnapshot.frontCfgModel ?? "—"}</strong></li>
                                    <li>front_subs_cfg count: <strong>{dbSnapshot.frontCfgCount ?? "—"}</strong></li>
                                    <li>front_subs_cfg positions length: <strong>{dbSnapshot.frontCfgPositionsLen ?? "—"}</strong></li>
                                    <li>rear_subs_cfg present: <strong>{dbSnapshot.rear_subs_cfg_present ? "yes" : "no"}</strong></li>
                                    <li>rear_subs_cfg model: <strong>{dbSnapshot.rearCfgModel ?? "—"}</strong></li>
                                    <li>rear_subs_cfg count: <strong>{dbSnapshot.rearCfgCount ?? "—"}</strong></li>
                                    <li>rear_subs_cfg positions length: <strong>{dbSnapshot.rearCfgPositionsLen ?? "—"}</strong></li>
                                    {dbSnapshot.status && <li>status: <strong>{dbSnapshot.status}</strong></li>}
                                </ul>
                            ) : !dbSnapshotErr ? (
                                <div>Loading…</div>
                            ) : null}
                        </div>

                        {/* TEMP DEBUG: Live AppState snapshot */}
                        <div className="print:hidden mb-4 p-3 border border-blue-300 rounded text-xs text-gray-600 bg-blue-50 max-w-2xl font-mono">
                            <div className="font-bold text-blue-700 mb-1">Live State Snapshot (AppState)</div>
                            {(() => {
                                const fCfg = app?.frontSubsCfg;
                                const rCfg = app?.rearSubsCfg;
                                const derivedSubs = (() => {
                                    try {
                                        const result = deriveSubwoofersFromCfg(fCfg, rCfg, app?.roomDims, null);
                                        return Array.isArray(result) ? result.length : "not array";
                                    } catch { return "error"; }
                                })();
                                return (
                                    <ul className="space-y-0.5">
                                        <li>activeProjectId: <strong>{activeProjectId || "—"}</strong></li>
                                        <li>frontSubsCfg present: <strong>{fCfg ? "yes" : "no"}</strong></li>
                                        <li>frontSubsCfg model: <strong>{fCfg?.model ?? "—"}</strong></li>
                                        <li>frontSubsCfg count: <strong>{fCfg?.count ?? "—"}</strong></li>
                                        <li>frontSubsCfg positions length: <strong>{Array.isArray(fCfg?.positions) ? fCfg.positions.length : "—"}</strong></li>
                                        <li>rearSubsCfg present: <strong>{rCfg ? "yes" : "no"}</strong></li>
                                        <li>rearSubsCfg model: <strong>{rCfg?.model ?? "—"}</strong></li>
                                        <li>rearSubsCfg count: <strong>{rCfg?.count ?? "—"}</strong></li>
                                        <li>rearSubsCfg positions length: <strong>{Array.isArray(rCfg?.positions) ? rCfg.positions.length : "—"}</strong></li>
                                        <li>app.subwoofers length: <strong>{Array.isArray(app?.subwoofers) ? app.subwoofers.length : "not array"}</strong></li>
                                        <li>derived subs from cfg length: <strong>{derivedSubs}</strong></li>
                                    </ul>
                                );
                            })()}
                        </div>
                    </>
                )}

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
                    />

                    <div className="border-b border-[#E6E4DD]" />

                    <ReportCountsDashboard
                        roomLevelCounts={roomLevelCounts}
                        seatCountsByRow={seatCountsByRow}
                        analysisResult={analysisResult}
                    />

                    <Card className="bg-[#FFFFFF] border-[#DCDBD6]">
                        <CardHeader>
                            <CardTitle className="text-[#1B1A1A] font-header">RP22 Parameters (Room)</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
                                {orderedParams.map(param => (
                                    <ParameterCard
                                        key={param.id}
                                        parameter={param}
                                        roomResult={getRoomResult(param.id)}
                                        seatResults={getSeatResults(param.id)}
                                        systemConfig={param.id === 2 ? p2SystemConfig : null}
                                        p15ConstructionLevel={app?.p15ConstructionLevel}
                                        onP15ConstructionLevelChange={app?.setP15ConstructionLevel}
                                        p21EarlyReflectionPreset={app?.p21EarlyReflectionPreset}
                                        onP21EarlyReflectionPresetChange={app?.setP21EarlyReflectionPreset}
                                        displayedLevel={getDisplayedRoomLevel(param.id)}
                                    />
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    <ReportSeatParametersCard
                        seats={seats}
                        hasSeats={hasSeats}
                        reportSeatHudById={reportSeatHudById}
                        app={app}
                        rspSeatId={rspSeatId}
                        analysisResult={analysisResult}
                    />
                </div>
            </div>

            {/* Print-only layout */}
            <div className="print-only print-keep-layout">
                <div className="print-root">
                    <div className="print-container rp22-report">
                        <section id="pdf-cover">
                            <div className="print-page-break-after print-summary">
                                <div style={{ maxWidth: "460px", margin: "0 auto 13mm auto", textAlign: "center" }}>
                                    <img
                                        src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/a8e555dac_Screenshot2025-08-31at135313.jpg"
                                        alt="SoundProof"
                                        style={{ width: "100%", height: "auto", marginBottom: "8mm" }}
                                    />
                                    <div style={{ fontSize: '26pt', fontWeight: 700, color: '#1B1A1A', lineHeight: 1.2, marginBottom: '3mm' }}>
                                        RP22 Compliance Report
                                    </div>
                                    <div style={{ fontSize: '10pt', color: '#3E4349', lineHeight: 1.4 }}>
                                        {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}
                                        <span style={{ margin: '0 8px', color: '#DCDBD6' }}>•</span>
                                        <span style={{ color: '#625143' }}>
                                            System: {(() => {
                                                const dolbyPreset = app?.dolbyLayout || "5.1";
                                                const base = String(dolbyPreset).split(" ")[0];
                                                const parts = base.split(".");
                                                const bed = parts[0] || "5";
                                                const heights = parts[2] || "";
                                                const totalSubs = Number(app?.frontSubsCfg?.count ?? 0) + Number(app?.rearSubsCfg?.count ?? 0);
                                                return heights ? `${bed}.${totalSubs}.${heights}` : `${bed}.${totalSubs}`;
                                            })()}
                                        </span>
                                    </div>
                                </div>

                                <div className="rp22-cover-stack" style={{ maxWidth: '185mm', margin: '0 auto 0', display: 'flex', flexDirection: 'column', gap: '2mm' }}>
                                    {/* Room parameters */}
                                    <div style={{ border: '1.5px solid #D9D5CE', borderRadius: '10px', padding: '9mm 12mm', background: '#FBFAF8', width: '100%', minHeight: '34mm' }} className="print-avoid-break rp22-cover-card">
                                        <div style={{ fontSize: '15pt', fontWeight: 700, color: '#1B1A1A', marginBottom: '4mm', textAlign: 'center' }}>
                                            Room parameters ({roomLevelCounts.L4 + roomLevelCounts.L3 + roomLevelCounts.L2 + roomLevelCounts.L1})
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6mm', paddingTop: '1mm', paddingBottom: '1mm', fontSize: '110%' }}>
                                            {['L4', 'L3', 'L2', 'L1'].map(lvl => {
                                                const maxRoom = Math.max(roomLevelCounts.L4, roomLevelCounts.L3, roomLevelCounts.L2, roomLevelCounts.L1);
                                                return <div key={lvl} style={{ transform: roomLevelCounts[lvl] === maxRoom ? 'scale(1.25)' : 'none', transformOrigin: 'center' }}><RP22GradingPill level={lvl} count={roomLevelCounts[lvl]} /></div>;
                                            })}
                                        </div>
                                    </div>

                                    {/* Seat parameters */}
                                    <div style={{ border: '1.5px solid #D9D5CE', borderRadius: '10px', padding: '8mm 10mm', background: '#FBFAF8', width: '100%' }} className="print-avoid-break rp22-cover-card">
                                        <div style={{ fontSize: '15pt', fontWeight: 700, color: '#1B1A1A', marginBottom: '4mm', textAlign: 'center' }}>
                                            Seat parameters ({seats?.length || 0} seats)
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'center', gap: '5mm', fontSize: '110%' }}>
                                            {(() => {
                                                const agg = { L4: 0, L3: 0, L2: 0, L1: 0 };
                                                (seatLevelCounts || []).forEach(s => { agg.L4 += s.counts?.L4 || 0; agg.L3 += s.counts?.L3 || 0; agg.L2 += s.counts?.L2 || 0; agg.L1 += s.counts?.L1 || 0; });
                                                return ['L4', 'L3', 'L2', 'L1'].map(lvl => <RP22GradingPill key={lvl} level={lvl} count={agg[lvl]} />);
                                            })()}
                                        </div>
                                    </div>

                                    {/* Screen & Viewing Geometry */}
                                    <div style={{ border: '1.5px solid #D9D5CE', borderRadius: '10px', padding: '8mm 10mm', background: '#FBFAF8', width: '100%' }} className="print-avoid-break rp22-cover-card">
                                        <div style={{ fontSize: '15pt', fontWeight: 700, color: '#1B1A1A', marginBottom: '4mm', textAlign: 'center' }}>Screen &amp; Viewing Geometry</div>
                                        {(() => {
                                            const snap = screenMetricsForPrint;
                                            const viewWm = Number(snap?.viewWm); const viewHm = Number(snap?.viewHm);
                                            const overallWm = Number(snap?.overallWm); const overallHm = Number(snap?.overallHm);
                                            const horizontalDeg = Number(snap?.horizontalDeg); const verticalDeg = Number(snap?.verticalDeg);
                                            const wallDistM = Number(snap?.wallDistM);
                                            const choiceLabel = String(snap?.screenChoiceLabel || formatScreenChoiceLabel(screen) || "Not specified");
                                            const hasViewable = Number.isFinite(viewWm) && viewWm > 0 && Number.isFinite(viewHm) && viewHm > 0;
                                            const hasOverall = Number.isFinite(overallWm) && overallWm > 0 && Number.isFinite(overallHm) && overallHm > 0;
                                            const hasAngles = Number.isFinite(horizontalDeg) && Number.isFinite(verticalDeg);
                                            const hasWallDist = Number.isFinite(wallDistM) && wallDistM >= 0;
                                            const fmtCm = (m) => `${Math.round(m * 100)}`; const fmtIn = (m) => `${(m * 39.3701).toFixed(1)}`;
                                            return (
                                                <div style={{ display: 'flex', gap: '8mm' }}>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ fontWeight: 600, fontSize: '11pt', color: '#1B1A1A', marginBottom: '3mm' }}>Screen size — {choiceLabel}</div>
                                                        <div style={{ fontSize: '10pt', color: '#3E4349', lineHeight: 1.7 }}>
                                                            <div><strong>Viewable area</strong></div>
                                                            {hasViewable ? <div>{fmtCm(viewWm)} × {fmtCm(viewHm)} cm ({fmtIn(viewWm)}" × {fmtIn(viewHm)}")</div> : <div>Not specified</div>}
                                                            <div style={{ marginTop: '2.5mm' }}><strong>Overall with border</strong></div>
                                                            {hasOverall ? <div>{fmtCm(overallWm)} × {fmtCm(overallHm)} cm ({fmtIn(overallWm)}" × {fmtIn(overallHm)}")</div> : <div>Not specified</div>}
                                                        </div>
                                                    </div>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ fontWeight: 600, fontSize: '11pt', color: '#1B1A1A', marginBottom: '3mm' }}>Viewing geometry</div>
                                                        <div style={{ fontSize: '10pt', color: '#3E4349', lineHeight: 1.7 }}>
                                                            <div><strong>Horizontal viewing angle:</strong> {hasAngles ? `${horizontalDeg.toFixed(1)}°` : "Not specified"}</div>
                                                            <div><strong>Vertical viewing angle:</strong> {hasAngles ? `${verticalDeg.toFixed(1)}°` : "Not specified"}</div>
                                                            <div style={{ marginTop: '2.5mm' }}><strong>Distance from front wall</strong></div>
                                                            {hasWallDist ? <div>{Math.round(wallDistM * 100)} cm ({(wallDistM * 39.3701).toFixed(1)}")</div> : <div>Not specified</div>}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </div>

                                    {/* System Summary */}
                                    <div style={{ border: '1.5px solid #D9D5CE', borderRadius: '10px', padding: '8mm 10mm', background: '#FBFAF8', width: '100%' }} className="print-avoid-break rp22-cover-card">
                                        <div style={{ fontSize: '15pt', fontWeight: 700, color: '#1B1A1A', marginBottom: '4mm', textAlign: 'center' }}>System summary</div>
                                        <div style={{ fontSize: '10pt', color: '#3E4349', marginBottom: '5mm', textAlign: 'center' }}>Selected loudspeaker models</div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4mm' }}>
                                            {[['LCR', systemSummary.lcr], ['Surrounds', systemSummary.surrounds], ['Overheads', systemSummary.overheads], ['Subwoofers', systemSummary.subs]].map(([label, models], i, arr) => (
                                                <div key={label} style={{ display: 'flex', paddingBottom: i < arr.length - 1 ? '4mm' : 0, borderBottom: i < arr.length - 1 ? '1px solid #EEEAE3' : 'none' }}>
                                                    <div style={{ width: '30%', fontWeight: 600, fontSize: '11.5pt', color: '#1B1A1A' }}>{label}</div>
                                                    <div style={{ width: '70%', fontSize: '11.5pt', color: '#3E4349' }}>{models.join(', ')}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div style={{ marginTop: '2mm', fontSize: '8.5pt', color: '#625143', textAlign: 'center' }}>
                                        Generated from current Room Designer configuration and live analysis state.
                                    </div>
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

                        <section id="pdf-room-parameters">
                            <div>
                                <div style={{ fontFamily: 'Futura PT Light, Century Gothic, sans-serif', fontSize: 18, fontWeight: 700, color: '#1B1A1A', marginBottom: 14 }}>RP22 Parameters (Room)</div>
                                <div style={{ color: '#3E4349', fontSize: 11, marginBottom: 10 }}>Room-wide compliance parameters (non seat-specific).</div>
                                <div className="rp22-params-grid rp22-cards-grid">
                                    {orderedParams.map(param => (
                                        <div key={param.id} className="rp22-card-wrap">
                                            <div className="rp22-param-card">
                                                <ParameterCard
                                                    parameter={param}
                                                    roomResult={getRoomResult(param.id)}
                                                    seatResults={getSeatResults(param.id)}
                                                    systemConfig={param.id === 2 ? p2SystemConfig : null}
                                                    p15ConstructionLevel={app?.p15ConstructionLevel}
                                                    onP15ConstructionLevelChange={app?.setP15ConstructionLevel}
                                                    p21EarlyReflectionPreset={app?.p21EarlyReflectionPreset}
                                                    onP21EarlyReflectionPresetChange={app?.setP21EarlyReflectionPreset}
                                                    displayedLevel={getDisplayedRoomLevel(param.id)}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </section>

                        <section id="pdf-seat-parameters">
                            <div className="print-page-break-before" style={{ marginTop: 18 }}>
                                <div style={{ fontFamily: 'Futura PT Light, Century Gothic, sans-serif', fontSize: 18, fontWeight: 700, color: '#1B1A1A', marginBottom: 14 }}>RP22 Parameters (Seat)</div>
                                <div style={{ color: '#3E4349', fontSize: 11, marginBottom: 10 }}>Seat-by-seat compliance parameters including RP23 horizontal viewing.</div>
                                <div className="rp22-params-grid rp22-cards-grid">
                                    {seats.map((seat, seatIdx) => {
                                        const seatId = seat?.id || '—';
                                        const tooltipData = app?.seatSnapshotBySeatId?.[seatId] ?? reportSeatHudById?.[seatId] ?? app?.seatMetricsById?.[seatId] ?? null;
                                        const rp23 = tooltipData?.rp23 || {};
                                        const rp22Hud = tooltipData?.rp22 || {};
                                        const getRp22Metric = (key) => { const n = parseInt(String(key).replace("p", ""), 10); if (!Number.isFinite(n)) return null; return rp22Hud[key] ?? rp22Hud[`p${n}`] ?? rp22Hud[n] ?? rp22Hud[String(n)] ?? null; };
                                        const isPrimary = tooltipData?.isPrimary || false;
                                        const isRsp = seatId === rspSeatId;
                                        const suffix = isRsp ? '(RSP)' : (isPrimary ? '(Primary)' : '(Secondary)');
                                        const suffixColor = isRsp ? '#213428' : (isPrimary ? '#625143' : '#3E4349');
                                        const seatLabel = formatSeatLabel(seatId);
                                        return (
                                            <div key={seatId} className="rp22-card-wrap" data-print-seat={seatLabel} data-print-index={seatIdx}>
                                                <div className="rp22-param-card rp22-seat-card">
                                                    <Card className="border-[#E6E4DD]">
                                                        <CardHeader className="pb-2">
                                                            <CardTitle className="text-sm font-semibold text-[#1B1A1A]" style={{ fontFamily: 'Futura PT Light, Century Gothic, sans-serif' }}>
                                                                {seatLabel}{' '}<span style={{ fontSize: 11, fontWeight: 700, color: suffixColor }}>{suffix}</span>
                                                            </CardTitle>
                                                        </CardHeader>
                                                        <CardContent className="space-y-2.5 text-xs">
                                                            <div className="flex justify-between items-center">
                                                                <div className="flex items-baseline gap-2">
                                                                    <span className="font-normal text-[#3E4349]">RP23 Horizontal:</span>
                                                                    <span className="text-sm font-bold text-[#1B1A1A]">{rp23?.formatted && rp23.formatted !== '—' ? rp23.formatted : '—'}</span>
                                                                </div>
                                                                <RP22GradingPill level={rp23?.level || '—'} />
                                                            </div>
                                                            <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-600 space-y-1">
                                                                {tooltipData?.position && <div><span className="font-medium">Position: </span>{tooltipData.position}</div>}
                                                                {tooltipData?.distanceToScreen && <div>Distance to Screen: {tooltipData.distanceToScreen}</div>}
                                                                {tooltipData?.distanceToMLP && <div>Distance to RSP: {tooltipData.distanceToMLP}</div>}
                                                            </div>
                                                            {['p1', 'p4', 'p5', 'p6', 'p9', 'p10', 'p16', 'p17', 'p20'].map((key) => {
                                                                const metric = getRp22Metric(key);
                                                                const paramNum = parseInt(key.substring(1), 10);
                                                                return (
                                                                    <div key={key}>
                                                                        <div className="flex items-baseline justify-between">
                                                                            <div className="flex items-baseline gap-2">
                                                                                <span className="font-normal text-[#3E4349]">P{paramNum}:</span>
                                                                                <span className="text-sm font-bold text-[#1B1A1A]">{metric ? (metric.formatted || metric.hudLabel || '—') : '—'}</span>
                                                                            </div>
                                                                            <RP22GradingPill level={metric ? (typeof metric.level === 'number' ? `L${metric.level}` : (metric.level || '—')) : '—'} />
                                                                        </div>
                                                                        {metric && key === 'p16' && metric.perSpeaker?.length > 0 && (
                                                                            <div className="text-[10px] text-gray-500 pl-2 mt-0.5">{metric.perSpeaker.map(s => `${s.role} ${Math.floor(s.angleDeg || 0)}° / ${s.lossLabel || '—'}`).join(', ')}</div>
                                                                        )}
                                                                        {metric && key === 'p17' && metric.worstRole && (
                                                                            <div className="text-[10px] text-gray-500 pl-2 mt-0.5">Worst: {metric.worstRole} ({Math.floor(metric.worstAngleDeg || 0)}° / {metric.worstLossDb?.toFixed(1) || '—'} dB)</div>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </CardContent>
                                                    </Card>
                                                </div>
                                            </div>
                                        );
                                    }).filter(Boolean)}
                                </div>
                                <div className="grid grid-cols-3 gap-4 mt-6 print-avoid-break">
                                    <SeatComplianceSummary position="left" />
                                    <SeatComplianceSummary position="middle" />
                                    <SeatComplianceSummary position="right" />
                                </div>
                            </div>
                        </section>

                        {/* ── Sightlines & Viewing Angles (final page) ── */}
                        {canRenderSightlinePage && sightlineScreenMetrics && sightlineRowData.length > 0 && (
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
                                    dolbyConfig={app?.dolbyConfig || app?.dolbyLayout || ''}
                                />
                            </section>
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