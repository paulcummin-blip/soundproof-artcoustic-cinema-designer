import React, { useEffect, useState } from 'react';
import { AppStateProvider, useAppState } from '../components/AppStateProvider';
import { useRP22AnalysisEngine } from '../components/hooks/useRP22AnalysisEngine';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BarChart4, Home, User, FileText } from 'lucide-react';
import { rp22Parameters } from '../components/data/rp22Parameters';
import { RP22_CATALOG } from "@/components/data/rp22Catalog";
import ParameterCard from '../components/report/ParameterCard';
import SeatComplianceSummary from '../components/report/SeatComplianceSummary';
import RP22GradingPill from '../components/ui/RP22GradingPill';
import { computeMLPAndPrimary } from '../components/utils/computeMLPAndPrimary';
import { computeAllSeatSplMetrics } from '../components/utils/spl/centralSplEngine';
import { getSpeakerModelMeta } from '../components/models/speakers/registry';
import { buildSeatHudSnapshot } from '../components/utils/buildSeatHudSnapshot';
import { formatSeatLabel } from '../components/utils/seatLabel';
import { Button } from '@/components/ui/button';
import RoomVisualisation from '@/components/room/RoomVisualisation';
import html2canvas from 'html2canvas';

function RP22ReportInner() {
    const app = useAppState();
    
    const [isPrinting, setIsPrinting] = useState(false);
    const [planImageDataUrl, setPlanImageDataUrl] = useState(null);
    const [planDimsImageDataUrl, setPlanDimsImageDataUrl] = useState(null);
    const [planSpeakerDimsImageDataUrl, setPlanSpeakerDimsImageDataUrl] = useState(null);
    const [hasPrintedOnce, setHasPrintedOnce] = useState(false);
    const [exportStatus, setExportStatus] = useState("Idle");
    const [exportDebug, setExportDebug] = useState({ isPrinting: false, planLen: 0, printReady: false });
    const planEnabled = true;

    useEffect(() => {
        const onAfterPrint = () => {
            setExportStatus("Done");
            setExportDebug(d => ({ ...d, isPrinting: false, printReady: false }));
            setIsPrinting(false);
            setPlanImageDataUrl(null);
            setPlanDimsImageDataUrl(null);
            setPlanSpeakerDimsImageDataUrl(null);
        };
        window.addEventListener('afterprint', onAfterPrint);
        return () => window.removeEventListener('afterprint', onAfterPrint);
    }, []);
    
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

    // --- SAFE READERS (do not assume Map / do not crash) ---
    const safeArray = (v) => (Array.isArray(v) ? v : []);
    const safeObj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);

    // No-op callbacks for RoomVisualisation capture render
    const noop = () => {};
    const rvNoops = {
        onSetSpeakers: noop,
        onSetSeatingPositions: noop,
        onSetScreen: noop,
        onSetFrontSubsCfg: noop,
        onSetRearSubsCfg: noop,
        onSetElements: noop,
        onSetOverheadState: noop,
        onSetAimState: noop,
        onSetRoomDims: noop,
        onSetMlpPoint: noop,
    };

    // Room Designer source-of-truth keys (these must match AppStateProvider)
    const seats = safeArray(app?.seatingPositions);
    const placedSpeakers = safeArray(app?.speakerSystem?.placedSpeakers);
    const roomDims = app?.roomDims || {};
    const screen = app?.screen || {};
    const dolbyLayout = app?.dolbyLayout || "5.1";
    const mlpBasis = app?.mlpBasis || "front";

    // Optional subs (won't break if missing)
    const frontSubsCfg = safeObj(app?.frontSubsCfg);
    const rearSubsCfg = safeObj(app?.rearSubsCfg);

    // Validation flags
    const hasSeats = seats.length > 0;
    const hasSpeakers = placedSpeakers.length > 0;

    // Compute stable dimensions for analysis
    const stableDimensions = React.useMemo(() => ({
        width: Number(roomDims?.widthM) || 4.5,
        length: Number(roomDims?.lengthM) || 6.0,
        height: Number(roomDims?.heightM) || 2.4
    }), [roomDims?.widthM, roomDims?.lengthM, roomDims?.heightM]);

    // Get MLP from AppState context (same as Room Designer uses)
    const primarySeatingPosition = app?.mlp || null;

    // Compute SPL metrics for all seats (needed by analysis engine)
    const allSeatSplMetrics = React.useMemo(() => {
        if (!hasSeats || !hasSpeakers) return [];

        const getCanonicalRole = (role) => {
            const map = { 
                SL: 'SL', LS: 'SL', SR: 'SR', RS: 'SR', 
                SBL: 'SBL', SBR: 'SBR', LW: 'LW', RW: 'RW',
                FL: 'FL', L: 'FL', FC: 'FC', C: 'FC', FR: 'FR', R: 'FR',
                TFL: 'TFL', TFR: 'TFR', TML: 'TML', TMR: 'TMR', TRL: 'TRL', TRR: 'TRR'
            };
            const r = String(role || '').toUpperCase();
            return map[r] || r;
        };

        const splConfig = app?.splConfig || {};
        const mlpPoint = primarySeatingPosition;

        return computeAllSeatSplMetrics({
            seats: seats,
            placedSpeakers: placedSpeakers,
            getCanonicalRole,
            getEffectiveSplInputs: app?.getEffectiveSplInputs || (() => ({ powerW: 100, eqHeadroomDb: 0 })),
            getModelDimsM: (model) => {
                const meta = getSpeakerModelMeta(model);
                if (meta && !meta.notFound) {
                    return {
                        ...meta,
                        sensitivity_db_1w_1m: meta.sensitivity_dB_1w1m || 87,
                        power_handling_w: meta.max_power || Infinity,
                        max_spl_cont_db_1m: meta.max_spl || null
                    };
                }
                return { widthM: 0.27, depthM: 0.082, sensitivity_dB_1w1m: 87 };
            },
            screenLoss_dB: Number(splConfig.screenLossDb) || 0,
            eqHeadroom_dB: Number(splConfig.globalEqHeadroomDb) || 0,
            mlpPoint
        });
    }, [seats, placedSpeakers, primarySeatingPosition, app?.splConfig, app?.getEffectiveSplInputs, hasSeats, hasSpeakers]);

    // Call analysis engine with proper inputs (same as Room Designer)
    const analysisResult = useRP22AnalysisEngine({
        placedSpeakers,
        seatingPositions: seats,
        primarySeatingPosition,
        dimensions: stableDimensions,
        mlpBasis,
        seatSplMetrics: allSeatSplMetrics,
        overheadState: {
            globalModel: app?.overheadGlobalModel,
            frontOverride: app?.overheadFrontOverride,
            midOverride: app?.overheadMidOverride,
            rearOverride: app?.overheadRearOverride,
            useFrontGlobal: app?.useFrontGlobal ?? true,
            useMidGlobal: app?.useMidGlobal ?? true,
            useRearGlobal: app?.useRearGlobal ?? true,
            aimFrontWidesAtMLP: app?.aimFrontWidesAtMLP,
            aimSideSurroundsAtMLP: app?.aimSideSurroundsAtMLP,
            aimRearSurroundsAtMLP: app?.aimRearSurroundsAtMLP,
        },
        aimState: {
            aimFrontWidesAtMLP: app?.aimFrontWidesAtMLP,
            aimSideSurroundsAtMLP: app?.aimSideSurroundsAtMLP,
            aimRearSurroundsAtMLP: app?.aimRearSurroundsAtMLP,
        },
        p15ConstructionLevel: app?.p15ConstructionLevel
    });



    // Build ordered parameters list (1-21)
    // Exclude per-seat parameters (P1, P4, P5, P6, P9, P10, P16, P17, P20) from overall grid
    const orderedParams = React.useMemo(() => {
        const perSeatParams = new Set([1, 4, 5, 6, 9, 10, 16, 17, 20]);
        return [...rp22Parameters]
            .filter(p => !perSeatParams.has(p.number))
            .sort((a, b) => a.id - b.id);
    }, []);

    // Compute P2: Discrete speaker count (excluding subwoofers)
    const p2SystemConfig = React.useMemo(() => {
        // Parse current system configuration string
        const systemConfigStr = (() => {
            const dolbyPreset = app?.dolbyLayout || "5.1";
            const base = String(dolbyPreset).split(" ")[0];
            const parts = base.split(".");
            const bed = parts[0] || "5";
            const heights = parts[2] || "";
            
            const frontCount = Number(app?.frontSubsCfg?.count ?? 0);
            const rearCount = Number(app?.rearSubsCfg?.count ?? 0);
            const totalSubs = frontCount + rearCount;
            
            return heights ? `${bed}.${totalSubs}.${heights}` : `${bed}.${totalSubs}`;
        })();
        
        // Parse bed.overhead configuration
        const parts = systemConfigStr.split('.');
        const bedCount = parseInt(parts[0]) || 5;
        const overheadCount = parseInt(parts[2]) || 0;
        
        const discreteCount = bedCount + overheadCount;
        
        // Apply P2 level mapping (never L3)
        let p2Level = 'L1';
        if (discreteCount >= 15) {
            p2Level = 'L4';
        } else if (discreteCount >= 11) {
            p2Level = 'L2';
        } else {
            p2Level = 'L1';
        }
        
        return {
            discreteSpeakerCount: discreteCount,
            p2Level,
        };
    }, [app?.dolbyLayout, app?.frontSubsCfg?.count, app?.rearSubsCfg?.count]);



    // Helper: get room-level result for a parameter
    const getRoomResult = React.useCallback((paramId) => {
        return analysisResult?.gradedParameters?.primary?.[paramId] ?? null;
    }, [analysisResult]);

    // Single helper that returns the final displayed pill level for each room parameter
    const getDisplayedRoomLevel = React.useCallback((paramId) => {
        // Normalise level into "L1".."L4" string (or null if not countable)
        const normaliseLvl = (rawLevel) => {
            if (rawLevel == null) return null;
            
            // Numeric 1..4
            if (typeof rawLevel === "number" && Number.isFinite(rawLevel)) {
                if (rawLevel >= 1 && rawLevel <= 4) return `L${rawLevel}`;
                return null;
            }
            
            // Strings like "L4"
            if (typeof rawLevel === "string") {
                const m = rawLevel.trim().match(/^L([1-4])$/i);
                if (m) return `L${m[1]}`;
            }
            
            return null;
        };

        // First try to pull from getRoomResult (same as cards)
        const res = getRoomResult(paramId);
        if (res) {
            // Check for explicit no-data / fail states
            if (res.status && typeof res.status === "string") {
                const s = res.status.toLowerCase();
                if (s === "no_data" || s === "fail") return null;
            }
            
            const lvl = normaliseLvl(res.level);
            if (lvl) return lvl;
        }

        // Apply report-page fallback rules for specific params
        if (paramId === 2 && p2SystemConfig) {
            // P2 uses systemConfig.p2Level
            return normaliseLvl(p2SystemConfig.p2Level);
        }
        
        if (paramId === 3) {
            // P3 is always L4 (no screen wall speakers outside zones)
            return "L4";
        }
        
        if (paramId === 8) {
            // P8 is always L4 (no upfiring)
            return "L4";
        }
        
        if (paramId === 11) {
            // P11 is always L4 (app enforces zone compliance)
            return "L4";
        }
        
        if (paramId === 15) {
            // P15 uses construction level dropdown
            const P15_MAP = {
                standard: "L1",
                "purpose-built": "L2",
                reference: "L3",
                studio: "L4",
            };
            return P15_MAP[app?.p15ConstructionLevel || 'standard'] || null;
        }
        
        if (paramId === 21) {
            // P21 uses early reflection preset dropdown from app state
            const P21_MAP = {
                l1: "L1",
                l2: "L2",
                l3: "L3",
                l4: "L4",
            };
            return P21_MAP[app?.p21EarlyReflectionPreset || 'l2'] || null;
        }

        return null;
    }, [analysisResult, getRoomResult, p2SystemConfig, app?.p15ConstructionLevel, app?.p21EarlyReflectionPreset]);

    // Helper: get seat results for a parameter
    const getSeatResults = React.useCallback((paramId) => {
        if (!analysisResult?.perSeatRp22) return [];
        
        const results = [];
        for (const [seatId, seatData] of Object.entries(analysisResult.perSeatRp22)) {
            const metric = seatData.rp22?.[paramId];
            if (metric) {
                results.push({
                    seatId,
                    isPrimary: seatData.isPrimary,
                    metric
                });
            }
        }
        return results;
    }, [analysisResult]);

    // Count ONLY the 12 room parameters with valid L1–L4 pills,
    // using the shared getDisplayedRoomLevel helper.
    const roomLevelCounts = React.useMemo(() => {
        const counts = { L4: 0, L3: 0, L2: 0, L1: 0 };
        const roomParamIds = [2, 3, 7, 8, 11, 12, 13, 14, 15, 18, 19, 21];

        for (const id of roomParamIds) {
            const lvl = getDisplayedRoomLevel(id);
            if (lvl && lvl.match(/^L[1-4]$/)) {
                counts[lvl] += 1;
            }
        }

        return counts;
    }, [getDisplayedRoomLevel]);

    // Check if print layout is ready (all data loaded)
    const printReady = React.useMemo(() => {
        if (!isPrinting) return false;
        
        const roomCardCount = orderedParams.length;
        const seatsOk = (seats.length === 0) ? true : (Object.keys(app?.seatMetricsById || {}).length >= seats.length);
        const cleanOk = planEnabled ? (typeof planImageDataUrl === 'string' && planImageDataUrl.length > 0) : true;
        const dimsOk = planEnabled ? (typeof planDimsImageDataUrl === 'string' && planDimsImageDataUrl.length > 0) : true;
        const speakerDimsOk = planEnabled ? (typeof planSpeakerDimsImageDataUrl === 'string' && planSpeakerDimsImageDataUrl.length > 0) : true;
        const planOk = cleanOk && dimsOk && speakerDimsOk;
        
        return roomCardCount > 0 && seatsOk && planOk;
    }, [isPrinting, orderedParams.length, seats.length, planEnabled, planImageDataUrl, planDimsImageDataUrl, planSpeakerDimsImageDataUrl, app?.seatMetricsById]);

    // Trigger print when ready (with print-once guard)
    useEffect(() => {
        if (!isPrinting) {
            setHasPrintedOnce(false);
            return;
        }
        if (!printReady) return;
        if (hasPrintedOnce) return;

        const t = setTimeout(() => {
            setExportStatus("Opening PDF preview…");
            setHasPrintedOnce(true);
            window.print();
        }, 250);

        return () => clearTimeout(t);
    }, [isPrinting, printReady, hasPrintedOnce]);

    // Mirror printReady state to debug
    useEffect(() => {
        setExportDebug(d => ({ ...d, isPrinting, printReady }));
    }, [isPrinting, printReady]);

    // Capture plan when printing starts (with retry logic)
    useEffect(() => {
        if (!isPrinting || planImageDataUrl !== null) return;
        
        setExportStatus("Capturing plan: waiting for SVG…");
        
        let attempts = 0;
        const maxAttempts = 20;
        let retryTimer = null;
        
        const attemptCapture = async () => {
            attempts++;
            
            try {
                const planElement = document.querySelector('[data-plan-capture]');
                if (!planElement) {
                    setExportStatus(`Capturing plan: plan container not found (attempt ${attempts}/${maxAttempts})`);
                    if (attempts < maxAttempts) {
                        retryTimer = setTimeout(attemptCapture, 100);
                        return;
                    }
                    setExportStatus("Plan skipped: continuing without plan");
                    setPlanImageDataUrl('__SKIP__');
                    return;
                }
                
                const svgElement = planElement.querySelector('svg');
                if (!svgElement) {
                    setExportStatus(`Capturing plan: SVG not found (attempt ${attempts}/${maxAttempts})`);
                    if (attempts < maxAttempts) {
                        retryTimer = setTimeout(attemptCapture, 100);
                        return;
                    }
                    setExportStatus("Plan skipped: continuing without plan");
                    setPlanImageDataUrl('__SKIP__');
                    return;
                }
                
                // Build union bbox from meaningful content (not background grid)
                let bbox = null;
                
                try {
                    // Try export-bounds wrapper first
                    const exportBounds = svgElement.querySelector('#export-bounds');
                    if (exportBounds) {
                        bbox = exportBounds.getBBox();
                    }
                } catch (e) {
                    bbox = null;
                }
                
                // Fallback: build union bbox from visible geometry
                if (!bbox || bbox.width <= 0 || bbox.height <= 0) {
                    try {
                        // Get SVG dimensions for filtering
                        let svgWidth = 1200, svgHeight = 800;
                        const vb = svgElement.getAttribute('viewBox');
                        if (vb) {
                            const parts = vb.split(/\s+/);
                            if (parts.length === 4) {
                                svgWidth = parseFloat(parts[2]);
                                svgHeight = parseFloat(parts[3]);
                            }
                        } else {
                            const rect = svgElement.getBoundingClientRect();
                            if (rect.width > 0) svgWidth = rect.width;
                            if (rect.height > 0) svgHeight = rect.height;
                        }
                        
                        // Collect meaningful geometry
                        const candidates = svgElement.querySelectorAll('rect, path, line, polyline, polygon, circle, ellipse');
                        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                        let count = 0;
                        
                        candidates.forEach(el => {
                            // Skip invisible or background elements
                            const opacity = el.getAttribute('opacity');
                            const display = el.getAttribute('display');
                            if (opacity === '0' || display === 'none') return;
                            
                            try {
                                const b = el.getBBox();
                                if (!b || b.width <= 0 || b.height <= 0) return;
                                
                                // Skip background-sized elements (90% of SVG or larger)
                                if (b.width > svgWidth * 0.9 || b.height > svgHeight * 0.9) return;
                                
                                // Accumulate bounds
                                minX = Math.min(minX, b.x);
                                minY = Math.min(minY, b.y);
                                maxX = Math.max(maxX, b.x + b.width);
                                maxY = Math.max(maxY, b.y + b.height);
                                count++;
                            } catch (e) {
                                // Skip elements that can't be measured
                            }
                        });
                        
                        if (count > 0 && Number.isFinite(minX) && Number.isFinite(maxX)) {
                            bbox = {
                                x: minX,
                                y: minY,
                                width: maxX - minX,
                                height: maxY - minY
                            };
                        }
                    } catch (e) {
                        bbox = null;
                    }
                }
                
                // Fallback: Use viewBox if bbox still invalid
                if (!bbox || bbox.width <= 0 || bbox.height <= 0) {
                    const viewBoxAttr = svgElement.getAttribute('viewBox');
                    if (viewBoxAttr) {
                        const parts = viewBoxAttr.split(/\s+/);
                        if (parts.length === 4) {
                            bbox = {
                                x: parseFloat(parts[0]),
                                y: parseFloat(parts[1]),
                                width: parseFloat(parts[2]),
                                height: parseFloat(parts[3])
                            };
                        }
                    }
                }
                
                // Check if we have valid dimensions
                if (!bbox || bbox.width <= 0 || bbox.height <= 0) {
                    setExportStatus(`Capturing plan: SVG bbox invalid (attempt ${attempts}/${maxAttempts})`);
                    if (attempts < maxAttempts) {
                        retryTimer = setTimeout(attemptCapture, 100);
                        return;
                    }
                    setExportStatus("Plan skipped: continuing without plan");
                    setPlanImageDataUrl('__SKIP__');
                    return;
                }
                
                // Clean plan: tight padding (3%, min 12)
                const shortestSide = Math.min(bbox.width, bbox.height);
                const padding = Math.max(shortestSide * 0.03, 12);
                
                const viewBoxX = bbox.x - padding;
                const viewBoxY = bbox.y - padding;
                const viewBoxW = bbox.width + (2 * padding);
                const viewBoxH = bbox.height + (2 * padding);
                
                // Now clone and apply the computed viewBox
                const svgClone = svgElement.cloneNode(true);
                svgClone.setAttribute('viewBox', `${viewBoxX} ${viewBoxY} ${viewBoxW} ${viewBoxH}`);
                svgClone.setAttribute('preserveAspectRatio', 'xMidYMid meet');
                svgClone.setAttribute('width', String(viewBoxW));
                svgClone.setAttribute('height', String(viewBoxH));
                
                const svgString = new XMLSerializer().serializeToString(svgClone);
                const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
                const url = URL.createObjectURL(svgBlob);
                
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    
                    // Keep exact aspect ratio from the cropped viewBox
                    const targetW = 3000;
                    const ratio = viewBoxH / viewBoxW;
                    
                    canvas.width = targetW;
                    canvas.height = Math.round(targetW * ratio);
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    const dataUrl = canvas.toDataURL('image/png');
                    setExportStatus("Plan captured: image ready");
                    setExportDebug(d => ({ ...d, planLen: dataUrl.length }));
                    setPlanImageDataUrl(dataUrl);
                    URL.revokeObjectURL(url);
                };
                img.onerror = () => {
                    if (attempts < maxAttempts) {
                        retryTimer = setTimeout(attemptCapture, 100);
                    } else {
                        setExportStatus("Plan skipped: continuing without plan");
                        setPlanImageDataUrl('__SKIP__');
                    }
                    URL.revokeObjectURL(url);
                };
                img.src = url;
            } catch (err) {
                console.warn('Failed to capture plan image (attempt ' + attempts + '):', err);
                if (attempts < maxAttempts) {
                    retryTimer = setTimeout(attemptCapture, 100);
                } else {
                    setExportStatus("Plan skipped: continuing without plan");
                    setPlanImageDataUrl('__SKIP__');
                }
            }
        };
        
        attemptCapture();
        
        return () => {
            if (retryTimer) clearTimeout(retryTimer);
        };
    }, [isPrinting, planImageDataUrl]);

    // Capture dimensioned plan when printing starts (with retry logic)
    useEffect(() => {
        if (!isPrinting || planDimsImageDataUrl !== null) return;
        
        setExportStatus("Capturing dimensioned plan: waiting for SVG…");
        
        let attempts = 0;
        const maxAttempts = 20;
        let retryTimer = null;
        
        const attemptCapture = async () => {
            attempts++;
            
            try {
                const planElement = document.querySelector('[data-plan-capture-dims]');
                if (!planElement) {
                    setExportStatus(`Capturing dims plan: container not found (attempt ${attempts}/${maxAttempts})`);
                    if (attempts < maxAttempts) {
                        retryTimer = setTimeout(attemptCapture, 100);
                        return;
                    }
                    setExportStatus("Dims plan skipped: continuing without dimensioned plan");
                    setPlanDimsImageDataUrl('__SKIP__');
                    return;
                }
                
                const svgElement = planElement.querySelector('svg');
                if (!svgElement) {
                    setExportStatus(`Capturing dims plan: SVG not found (attempt ${attempts}/${maxAttempts})`);
                    if (attempts < maxAttempts) {
                        retryTimer = setTimeout(attemptCapture, 100);
                        return;
                    }
                    setExportStatus("Dims plan skipped: continuing without dimensioned plan");
                    setPlanDimsImageDataUrl('__SKIP__');
                    return;
                }
                
                // Build union bbox from meaningful content (not background grid)
                let bbox = null;
                
                try {
                    // Try export-bounds wrapper first
                    const exportBounds = svgElement.querySelector('#export-bounds');
                    if (exportBounds) {
                        bbox = exportBounds.getBBox();
                    }
                } catch (e) {
                    bbox = null;
                }
                
                // Fallback: build union bbox from visible geometry
                if (!bbox || bbox.width <= 0 || bbox.height <= 0) {
                    try {
                        // Get SVG dimensions for filtering
                        let svgWidth = 1200, svgHeight = 800;
                        const vb = svgElement.getAttribute('viewBox');
                        if (vb) {
                            const parts = vb.split(/\s+/);
                            if (parts.length === 4) {
                                svgWidth = parseFloat(parts[2]);
                                svgHeight = parseFloat(parts[3]);
                            }
                        } else {
                            const rect = svgElement.getBoundingClientRect();
                            if (rect.width > 0) svgWidth = rect.width;
                            if (rect.height > 0) svgHeight = rect.height;
                        }
                        
                        // Collect meaningful geometry
                        const candidates = svgElement.querySelectorAll('rect, path, line, polyline, polygon, circle, ellipse');
                        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                        let count = 0;
                        
                        candidates.forEach(el => {
                            // Skip invisible or background elements
                            const opacity = el.getAttribute('opacity');
                            const display = el.getAttribute('display');
                            if (opacity === '0' || display === 'none') return;
                            
                            try {
                                const b = el.getBBox();
                                if (!b || b.width <= 0 || b.height <= 0) return;
                                
                                // Skip background-sized elements (90% of SVG or larger)
                                if (b.width > svgWidth * 0.9 || b.height > svgHeight * 0.9) return;
                                
                                // Accumulate bounds
                                minX = Math.min(minX, b.x);
                                minY = Math.min(minY, b.y);
                                maxX = Math.max(maxX, b.x + b.width);
                                maxY = Math.max(maxY, b.y + b.height);
                                count++;
                            } catch (e) {
                                // Skip elements that can't be measured
                            }
                        });
                        
                        if (count > 0 && Number.isFinite(minX) && Number.isFinite(maxX)) {
                            bbox = {
                                x: minX,
                                y: minY,
                                width: maxX - minX,
                                height: maxY - minY
                            };
                        }
                    } catch (e) {
                        bbox = null;
                    }
                }
                
                // Fallback: Use viewBox if bbox still invalid
                if (!bbox || bbox.width <= 0 || bbox.height <= 0) {
                    const viewBoxAttr = svgElement.getAttribute('viewBox');
                    if (viewBoxAttr) {
                        const parts = viewBoxAttr.split(/\s+/);
                        if (parts.length === 4) {
                            bbox = {
                                x: parseFloat(parts[0]),
                                y: parseFloat(parts[1]),
                                width: parseFloat(parts[2]),
                                height: parseFloat(parts[3])
                            };
                        }
                    }
                }
                
                // Check if we have valid dimensions
                if (!bbox || bbox.width <= 0 || bbox.height <= 0) {
                    setExportStatus(`Capturing dims plan: SVG bbox invalid (attempt ${attempts}/${maxAttempts})`);
                    if (attempts < maxAttempts) {
                        retryTimer = setTimeout(attemptCapture, 100);
                        return;
                    }
                    setExportStatus("Dims plan skipped: continuing without dimensioned plan");
                    setPlanDimsImageDataUrl('__SKIP__');
                    return;
                }
                
                // Room dimensions plan: medium padding (5%, min 18)
                const shortestSide = Math.min(bbox.width, bbox.height);
                const padding = Math.max(shortestSide * 0.05, 18);
                
                const viewBoxX = bbox.x - padding;
                const viewBoxY = bbox.y - padding;
                const viewBoxW = bbox.width + (2 * padding);
                const viewBoxH = bbox.height + (2 * padding);
                
                // Now clone and apply the computed viewBox
                const svgClone = svgElement.cloneNode(true);
                svgClone.setAttribute('viewBox', `${viewBoxX} ${viewBoxY} ${viewBoxW} ${viewBoxH}`);
                svgClone.setAttribute('preserveAspectRatio', 'xMidYMid meet');
                svgClone.setAttribute('width', String(viewBoxW));
                svgClone.setAttribute('height', String(viewBoxH));
                
                const svgString = new XMLSerializer().serializeToString(svgClone);
                const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
                const url = URL.createObjectURL(svgBlob);
                
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    
                    // Keep exact aspect ratio from the cropped viewBox
                    const targetW = 3000;
                    const ratio = viewBoxH / viewBoxW;
                    
                    canvas.width = targetW;
                    canvas.height = Math.round(targetW * ratio);
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    const dataUrl = canvas.toDataURL('image/png');
                    setExportStatus("Dimensioned plan captured: image ready");
                    setExportDebug(d => ({ ...d, planLen: dataUrl.length }));
                    setPlanDimsImageDataUrl(dataUrl);
                    URL.revokeObjectURL(url);
                };
                img.onerror = () => {
                    if (attempts < maxAttempts) {
                        retryTimer = setTimeout(attemptCapture, 100);
                    } else {
                        setExportStatus("Dims plan skipped: continuing without dimensioned plan");
                        setPlanDimsImageDataUrl('__SKIP__');
                    }
                    URL.revokeObjectURL(url);
                };
                img.src = url;
            } catch (err) {
                console.warn('Failed to capture dimensioned plan (attempt ' + attempts + '):', err);
                if (attempts < maxAttempts) {
                    retryTimer = setTimeout(attemptCapture, 100);
                } else {
                    setExportStatus("Dims plan skipped: continuing without dimensioned plan");
                    setPlanDimsImageDataUrl('__SKIP__');
                }
            }
        };
        
        attemptCapture();
        
        return () => {
            if (retryTimer) clearTimeout(retryTimer);
        };
    }, [isPrinting, planDimsImageDataUrl]);

    // Capture speaker positions plan when printing starts (with retry logic)
    useEffect(() => {
        if (!isPrinting || planSpeakerDimsImageDataUrl !== null) return;

        setExportStatus("Capturing speaker positions plan: waiting for SVG…");

        let attempts = 0;
        const maxAttempts = 20;
        let retryTimer = null;

        const attemptCapture = async () => {
            attempts++;

            try {
                const planElement = document.querySelector('[data-plan-capture-speaker-dims]');
                if (!planElement) {
                    setExportStatus(`Capturing speaker positions: container not found (attempt ${attempts}/${maxAttempts})`);
                    if (attempts < maxAttempts) {
                        retryTimer = setTimeout(attemptCapture, 100);
                        return;
                    }
                    setExportStatus("Speaker positions plan skipped: continuing without speaker positions");
                    setPlanSpeakerDimsImageDataUrl('__SKIP__');
                    return;
                }

                const svgElement = planElement.querySelector('svg');
                if (!svgElement) {
                    setExportStatus(`Capturing speaker positions: SVG not found (attempt ${attempts}/${maxAttempts})`);
                    if (attempts < maxAttempts) {
                        retryTimer = setTimeout(attemptCapture, 100);
                        return;
                    }
                    setExportStatus("Speaker positions plan skipped: continuing without speaker positions");
                    setPlanSpeakerDimsImageDataUrl('__SKIP__');
                    return;
                }

                // Build union bbox from meaningful content (not background grid)
                let bbox = null;
                
                try {
                    // Try export-bounds wrapper first
                    const exportBounds = svgElement.querySelector('#export-bounds');
                    if (exportBounds) {
                        bbox = exportBounds.getBBox();
                    }
                } catch (e) {
                    bbox = null;
                }
                
                // Fallback: build union bbox from visible geometry
                if (!bbox || bbox.width <= 0 || bbox.height <= 0) {
                    try {
                        // Get SVG dimensions for filtering
                        let svgWidth = 1200, svgHeight = 800;
                        const vb = svgElement.getAttribute('viewBox');
                        if (vb) {
                            const parts = vb.split(/\s+/);
                            if (parts.length === 4) {
                                svgWidth = parseFloat(parts[2]);
                                svgHeight = parseFloat(parts[3]);
                            }
                        } else {
                            const rect = svgElement.getBoundingClientRect();
                            if (rect.width > 0) svgWidth = rect.width;
                            if (rect.height > 0) svgHeight = rect.height;
                        }
                        
                        // Collect meaningful geometry
                        const candidates = svgElement.querySelectorAll('rect, path, line, polyline, polygon, circle, ellipse');
                        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                        let count = 0;
                        
                        candidates.forEach(el => {
                            // Skip invisible or background elements
                            const opacity = el.getAttribute('opacity');
                            const display = el.getAttribute('display');
                            if (opacity === '0' || display === 'none') return;
                            
                            try {
                                const b = el.getBBox();
                                if (!b || b.width <= 0 || b.height <= 0) return;
                                
                                // Skip background-sized elements (90% of SVG or larger)
                                if (b.width > svgWidth * 0.9 || b.height > svgHeight * 0.9) return;
                                
                                // Accumulate bounds
                                minX = Math.min(minX, b.x);
                                minY = Math.min(minY, b.y);
                                maxX = Math.max(maxX, b.x + b.width);
                                maxY = Math.max(maxY, b.y + b.height);
                                count++;
                            } catch (e) {
                                // Skip elements that can't be measured
                            }
                        });
                        
                        if (count > 0 && Number.isFinite(minX) && Number.isFinite(maxX)) {
                            bbox = {
                                x: minX,
                                y: minY,
                                width: maxX - minX,
                                height: maxY - minY
                            };
                        }
                    } catch (e) {
                        bbox = null;
                    }
                }
                
                // Fallback: Use viewBox if bbox still invalid
                if (!bbox || bbox.width <= 0 || bbox.height <= 0) {
                    const viewBoxAttr = svgElement.getAttribute('viewBox');
                    if (viewBoxAttr) {
                        const parts = viewBoxAttr.split(/\s+/);
                        if (parts.length === 4) {
                            bbox = {
                                x: parseFloat(parts[0]),
                                y: parseFloat(parts[1]),
                                width: parseFloat(parts[2]),
                                height: parseFloat(parts[3])
                            };
                        }
                    }
                }

                if (!bbox || bbox.width <= 0 || bbox.height <= 0) {
                    setExportStatus(`Capturing speaker positions: SVG bbox invalid (attempt ${attempts}/${maxAttempts})`);
                    if (attempts < maxAttempts) {
                        retryTimer = setTimeout(attemptCapture, 100);
                        return;
                    }
                    setExportStatus("Speaker positions plan skipped: continuing without speaker positions");
                    setPlanSpeakerDimsImageDataUrl('__SKIP__');
                    return;
                }

                // Speaker positions plan: larger padding to accommodate measurement leaders/labels
                const shortestSide = Math.min(bbox.width, bbox.height);
                const padding = Math.max(shortestSide * 0.05, 24);
                
                const viewBoxX = bbox.x - padding;
                const viewBoxY = bbox.y - padding;
                const viewBoxW = bbox.width + (2 * padding);
                const viewBoxH = bbox.height + (2 * padding);
                
                const svgClone = svgElement.cloneNode(true);
                svgClone.setAttribute('viewBox', `${viewBoxX} ${viewBoxY} ${viewBoxW} ${viewBoxH}`);
                svgClone.setAttribute('preserveAspectRatio', 'xMidYMid meet');
                svgClone.setAttribute('width', String(viewBoxW));
                svgClone.setAttribute('height', String(viewBoxH));
                
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
                    const dataUrl = canvas.toDataURL('image/png');
                    setExportStatus("Speaker dimensions plan captured: image ready");
                    setExportDebug(d => ({ ...d, planLen: dataUrl.length }));
                    setPlanSpeakerDimsImageDataUrl(dataUrl);
                    URL.revokeObjectURL(url);
                };
                img.onerror = () => {
                    if (attempts < maxAttempts) {
                        retryTimer = setTimeout(attemptCapture, 100);
                    } else {
                        setExportStatus("Speaker dims plan skipped: continuing without speaker dimensions");
                        setPlanSpeakerDimsImageDataUrl('__SKIP__');
                    }
                    URL.revokeObjectURL(url);
                };
                img.src = url;
            } catch (err) {
                console.warn('Failed to capture speaker dims plan (attempt ' + attempts + '):', err);
                if (attempts < maxAttempts) {
                    retryTimer = setTimeout(attemptCapture, 100);
                } else {
                    setExportStatus("Speaker dims plan skipped: continuing without speaker dimensions");
                    setPlanSpeakerDimsImageDataUrl('__SKIP__');
                }
            }
        };
        
        attemptCapture();
        
        return () => {
            if (retryTimer) clearTimeout(retryTimer);
        };
    }, [isPrinting, planSpeakerDimsImageDataUrl]);

    // System summary: group speakers by role and model
    const systemSummary = React.useMemo(() => {
        const summary = {
            lcr: [],
            surrounds: [],
            overheads: [],
            subs: []
        };

        // Helper to normalize model name to display format (strips suffixes, proper capitalisation)
        const normalizeModel = (model) => {
            if (!model || model === 'off' || model === 'none') return null;
            return String(model).trim();
        };

        // Helper to get display-ready speaker name (matches Room Designer UI)
        const getDisplayName = (modelKey) => {
            if (!modelKey) return null;
            
            // Get metadata from registry
            const meta = getSpeakerModelMeta(modelKey);
            
            // Use registry label if available (most reliable)
            if (meta?.label && !meta.notFound) {
                return meta.label;
            }
            
            // Fallback: manual cleanup
            let name = String(modelKey).trim();
            
            // Strip any trailing variant suffix (_s, _m, _l, etc.)
            name = name.replace(/[_-][sml]$/i, '');
            
            // Convert kebab-case to spaces and title case
            name = name
                .split(/[-_]+/)
                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join(' ');
            
            // Final defensive check: strip any remaining underscores
            if (name.includes('_')) {
                name = name.split('_')[0];
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn('[RP22Report] Model name still contains underscore after normalisation:', modelKey);
                }
            }
            
            return name;
        };

        // Group speakers by category and model
        const speakersByCategory = {
            lcr: {},
            surrounds: {},
            overheads: {}
        };

        placedSpeakers.forEach(spk => {
            const role = String(spk?.role || '').toUpperCase();
            const model = normalizeModel(spk?.model);
            if (!model) return;

            let category = null;
            if (['FL', 'FC', 'FR', 'L', 'C', 'R'].includes(role)) {
                category = 'lcr';
            } else if (['SL', 'SR', 'SBL', 'SBR', 'LW', 'RW', 'LS', 'RS', 'LR', 'RR', 'FWL', 'FWR'].includes(role)) {
                category = 'surrounds';
            } else if (role.startsWith('T') || role.startsWith('U')) {
                category = 'overheads';
            }

            if (category) {
                speakersByCategory[category][model] = (speakersByCategory[category][model] || 0) + 1;
            }
        });

        // Format speaker lists with display names
        Object.keys(speakersByCategory).forEach(cat => {
            const models = Object.entries(speakersByCategory[cat])
                .map(([modelKey, count]) => {
                    const displayName = getDisplayName(modelKey) || modelKey;
                    return count > 1 ? `${displayName} × ${count}` : displayName;
                })
                .sort();
            summary[cat] = models.length > 0 ? models : ['None selected'];
        });

        // Subwoofers with display names
        const frontSubs = frontSubsCfg?.count || 0;
        const rearSubs = rearSubsCfg?.count || 0;
        const frontModel = normalizeModel(frontSubsCfg?.model);
        const rearModel = normalizeModel(rearSubsCfg?.model);

        const subList = [];
        if (frontSubs > 0 && frontModel) {
            const displayName = getDisplayName(frontModel) || frontModel;
            subList.push(frontSubs > 1 ? `${displayName} × ${frontSubs} (front)` : `${displayName} (front)`);
        }
        if (rearSubs > 0 && rearModel) {
            const displayName = getDisplayName(rearModel) || rearModel;
            subList.push(rearSubs > 1 ? `${displayName} × ${rearSubs} (rear)` : `${displayName} (rear)`);
        }
        summary.subs = subList.length > 0 ? subList : ['None selected'];

        return summary;
    }, [placedSpeakers, frontSubsCfg, rearSubsCfg]);

    // Count per-seat parameters (L1-L4 only, exclude null/FAIL/no_data)
    // Total is always 10 (RP23 + 9 RP22 params: P1, P4, P5, P6, P9, P10, P16, P17, P20)
    const seatLevelCounts = React.useMemo(() => {
        const perSeat = analysisResult?.perSeatRp22 || {};
        const seatIds = Object.keys(perSeat).sort();
        
        return seatIds.map(seatId => {
            // Read from same source as seat cards: app.seatMetricsById
            const tooltipData = app?.seatMetricsById?.[seatId];
            const rp22Raw = tooltipData?.rp22 || {};
            const rp23 = tooltipData?.rp23 || {};
            
            const counts = { L4: 0, L3: 0, L2: 0, L1: 0 };
            
            // Normalize level helper (same as room count logic)
            const normalizeLvl = (rawLevel) => {
                if (rawLevel == null) return null;
                if (typeof rawLevel === "number" && Number.isFinite(rawLevel)) {
                    if (rawLevel >= 1 && rawLevel <= 4) return `L${rawLevel}`;
                    return null;
                }
                if (typeof rawLevel === "string") {
                    const m = rawLevel.trim().match(/^L([1-4])$/i);
                    if (m) return `L${m[1]}`;
                }
                return null;
            };
            
            // Count RP23 Horizontal
            const lvl23 = normalizeLvl(rp23?.level);
            if (lvl23) counts[lvl23] += 1;
            
            // Count RP22 parameters (P1, P4, P5, P6, P9, P10, P16, P17, P20)
            ['p1', 'p4', 'p5', 'p6', 'p9', 'p10', 'p16', 'p17', 'p20'].forEach(key => {
                const metric = rp22Raw[key];
                if (!metric) return;
                const lvl = normalizeLvl(metric.level);
                if (lvl) counts[lvl] += 1;
            });
            
            // Total is always 10 rows (RP23 + 9 RP22 params)
            const total = 10;
            
            return { seatId, counts, total };
        });
    }, [analysisResult?.perSeatRp22, app?.seatMetricsById]);

    // Group seat counts by row, sorted by seat number within each row
    const seatCountsByRow = React.useMemo(() => {
        const rows = {};

        seatLevelCounts.forEach(({ seatId, counts, total }) => {
            // Parse seat-r{row}-c{col}
            const match = seatId.match(/^seat-r(\d+)-c(\d+)$/);
            if (!match) return;

            const rowNum = parseInt(match[1], 10);
            const seatNum = parseInt(match[2], 10);

            if (!rows[rowNum]) rows[rowNum] = [];
            rows[rowNum].push({ seatId, counts, total, seatNum });
        });

        // Sort each row's seats by seat number
        Object.keys(rows).forEach(rowNum => {
            rows[rowNum].sort((a, b) => a.seatNum - b.seatNum);
        });

        // Return sorted row numbers
        return Object.keys(rows)
            .map(Number)
            .sort((a, b) => a - b)
            .map(rowNum => ({ rowNum, seats: rows[rowNum] }));
    }, [seatLevelCounts]);

    if (!analysisResult || !analysisResult.gradedParameters) {
        return (
            <div className="min-h-screen bg-[#F9F8F6] p-6 flex items-center justify-center">
                <Card className="max-w-xl mx-auto w-full">
                    <CardHeader>
                        <CardTitle className="text-[#1B1A1A] font-header">RP22 Compliance Report</CardTitle>
                    </CardHeader>
                    <CardContent className="text-center py-10">
                        <BarChart4 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <p className="text-[#3E4349]">Run an analysis in the Room Designer to see the report.</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const PrintStyles = () => (
        <style>{`
            @media print {
                /* 1) Kill anything that can clip/stop the print flow */
                html, body {
                    height: auto !important;
                    overflow: visible !important;
                }
                
                /* Force pure white backgrounds (kill the pale side bars) */
                html, body, #root, #__next {
                    background: #FFFFFF !important;
                }
                
                /* Outer wrapper is bg-[#F9F8F6] p-6 — force white + no padding in print */
                .min-h-screen {
                    background: #FFFFFF !important;
                    padding: 0 !important;
                }
                
                /* Ensure print layout is pure white */
                .print-root, .print-container, .print-only, section {
                    background: #FFFFFF !important;
                    box-shadow: none !important;
                    border: none !important;
                }
                
                /* Kill gutters on plan pages */
                #pdf-room-plan, #pdf-room-plan-dims {
                    background: #FFFFFF !important;
                    padding-left: 0 !important;
                    padding-right: 0 !important;
                    margin-left: 0 !important;
                    margin-right: 0 !important;
                }

                /* Base44 / app wrappers sometimes clamp height */
                #root, #__next, .min-h-screen, .screen-only, .print-only {
                    height: auto !important;
                    min-height: 0 !important;
                    overflow: visible !important;
                }

                /* 2) Remove fixed/sticky elements during print */
                * {
                    position: static !important;
                }

                /* But keep your actual cards/layout intact */
                .print-keep-layout {
                    position: relative !important;
                }

                /* 3) Ensure background colours + borders print */
                body {
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }

                /* 4) Page size + margins */
                @page {
                    size: A4 portrait;
                    margin: 12mm;
                }

                /* 5) Reliable page-break helpers */
                .print-page-break-after {
                    break-after: page;
                    page-break-after: always;
                }
                .print-page-break-before {
                    break-before: page;
                    page-break-before: always;
                }
                
                /* IMPORTANT: Chrome PDF preview can truncate if large cards are "unbreakable".
                   So we do NOT force avoid-break on all cards. */
                .print-avoid-break {
                    break-inside: auto !important;
                    page-break-inside: auto !important;
                }
                
                /* Keep the top summary blocks intact (safe + small) */
                .print-summary .print-avoid-break {
                    break-inside: avoid !important;
                    page-break-inside: avoid !important;
                }
                
                /* For the big room/seat cards: allow splitting if needed */
                .print-grid-room > .print-avoid-break,
                .print-grid-seats > .print-avoid-break {
                    break-inside: auto !important;
                    page-break-inside: auto !important;
                }
                
                /* Make sure Card content can flow */
                .print-only .rounded-xl,
                .print-only .rounded-xl * {
                    overflow: visible !important;
                    max-height: none !important;
                }

                /* 6) PRINT SAFE: avoid CSS grid (Chrome can truncate PDF output) */
                .print-grid-room,
                .print-grid-seats {
                    display: block !important;
                    
                    /* two-column print-safe layout */
                    column-count: 2 !important;
                    column-gap: 10mm !important;
                    column-fill: auto !important;
                    
                    width: 100% !important;
                }
                
                /* each card wrapper becomes a column item */
                .print-grid-room > .print-avoid-break,
                .print-grid-seats > .print-avoid-break {
                    display: inline-block !important;
                    width: 100% !important;
                    
                    /* keep cards intact where possible */
                    break-inside: avoid !important;
                    page-break-inside: avoid !important;
                    
                    /* spacing between cards */
                    margin: 0 0 10mm 0 !important;
                }

                /* Hide anything that isn't the print layout */
                .screen-only,
                .no-print,
                nav,
                header,
                aside,
                footer,
                .b44-sidebar,
                .b44-topbar,
                [class*="sidebar"],
                [class*="SideBar"],
                [class*="TopBar"],
                [class*="navbar"],
                [class*="NavBar"],
                [class*="toolbar"],
                [class*="ToolBar"],
                [class*="api"],
                [class*="Api"],
                #root > div > div:first-child {
                    display: none !important;
                }

                /* Ensure print layout uses full width */
                .print-only {
                    display: block !important;
                    width: 100% !important;
                }

                .print-root {
                    width: 100% !important;
                    margin: 0 !important;
                    padding: 0 !important;
                }
                
                /* extra safety: Card internals must not clip */
                .print-only .card,
                .print-only .card * {
                    overflow: visible !important;
                    max-height: none !important;
                }
            }

            @media screen {
                .print-only { display: none !important; }
            }

            .screen-only { display: block; }

            .print-root {
                background: #FFFFFF;
            }

            .print-container {
                width: 100%;
                max-width: 100%;
                margin: 0;
                padding: 0;
                font-family: 'Didact Gothic', 'Century Gothic', sans-serif;
            }
        `}</style>
    );

    return (
        <div className="min-h-screen bg-[#F9F8F6] p-6">
            <PrintStyles />
            
            <div className="screen-only">
            {/* Hidden plan capture element (CLEAN) - MUST be in DOM (not display:none) for SVG capture */}
            <div 
                data-plan-capture 
                style={{ 
                    position: 'fixed',
                    left: 0,
                    top: 0,
                    width: '1200px',
                    height: '800px',
                    opacity: 0,
                    pointerEvents: 'none',
                    zIndex: -1
                }}
            >
                <RoomVisualisation
                    placedSpeakers={placedSpeakers}
                    seatingPositions={seats}
                    mlpPoint={primarySeatingPosition}
                    screen={screen}
                    dolbyLayout={dolbyLayout}
                    frontSubs={frontSubsCfg?.positions || []}
                    rearSubs={rearSubsCfg?.positions || []}
                    exportMode="dimensions"
                    overlays={{ ROOM_DIMS: true }}
                    showBaffle={true}
                    showScreen={true}
                    speakerPositionsView="off"
                    showMlpRuler={false}
                    zoomMode="off"
                    onSetSpeakers={rvNoops.onSetSpeakers}
                    onSetSeatingPositions={rvNoops.onSetSeatingPositions}
                    onSetScreen={rvNoops.onSetScreen}
                    onSetFrontSubsCfg={rvNoops.onSetFrontSubsCfg}
                    onSetRearSubsCfg={rvNoops.onSetRearSubsCfg}
                    onSetElements={rvNoops.onSetElements}
                    onSetOverheadState={rvNoops.onSetOverheadState}
                    onSetAimState={rvNoops.onSetAimState}
                    onSetRoomDims={rvNoops.onSetRoomDims}
                    onSetMlpPoint={rvNoops.onSetMlpPoint}
                />
            </div>
            
            {/* Hidden plan capture element (ROOM DIMENSIONS) */}
            <div 
                data-plan-capture-dims
                style={{ 
                    position: 'fixed',
                    left: 0,
                    top: 0,
                    width: '1200px',
                    height: '800px',
                    opacity: 0,
                    pointerEvents: 'none',
                    zIndex: -1
                }}
            >
                <RoomVisualisation
                    placedSpeakers={placedSpeakers}
                    seatingPositions={seats}
                    mlpPoint={primarySeatingPosition}
                    screen={screen}
                    dolbyLayout={dolbyLayout}
                    frontSubs={frontSubsCfg?.positions || []}
                    rearSubs={rearSubsCfg?.positions || []}
                    exportMode="dimensions"
                    overlays={{}}
                    showBaffle={true}
                    showScreen={true}
                    speakerPositionsView="off"
                    showMlpRuler={true}
                    zoomMode="off"
                    onSetSpeakers={rvNoops.onSetSpeakers}
                    onSetSeatingPositions={rvNoops.onSetSeatingPositions}
                    onSetScreen={rvNoops.onSetScreen}
                    onSetFrontSubsCfg={rvNoops.onSetFrontSubsCfg}
                    onSetRearSubsCfg={rvNoops.onSetRearSubsCfg}
                    onSetElements={rvNoops.onSetElements}
                    onSetOverheadState={rvNoops.onSetOverheadState}
                    onSetAimState={rvNoops.onSetAimState}
                    onSetRoomDims={rvNoops.onSetRoomDims}
                    onSetMlpPoint={rvNoops.onSetMlpPoint}
                />
            </div>
            
            {/* Hidden plan capture element (SPEAKER POSITIONS) */}
            <div 
                data-plan-capture-speaker-dims
                style={{ 
                    position: 'fixed',
                    left: 0,
                    top: 0,
                    width: '1200px',
                    height: '800px',
                    opacity: 0,
                    pointerEvents: 'none',
                    zIndex: -1
                }}
            >
                <RoomVisualisation
                    placedSpeakers={placedSpeakers}
                    seatingPositions={seats}
                    mlpPoint={primarySeatingPosition}
                    screen={screen}
                    dolbyLayout={dolbyLayout}
                    frontSubs={frontSubsCfg?.positions || []}
                    rearSubs={rearSubsCfg?.positions || []}
                    exportMode="dimensions"
                    overlays={{}}
                    showBaffle={true}
                    showScreen={true}
                    speakerPositionsView="plan"
                    showMlpRuler={false}
                    zoomMode="off"
                    onSetSpeakers={rvNoops.onSetSpeakers}
                    onSetSeatingPositions={rvNoops.onSetSeatingPositions}
                    onSetScreen={rvNoops.onSetScreen}
                    onSetFrontSubsCfg={rvNoops.onSetFrontSubsCfg}
                    onSetRearSubsCfg={rvNoops.onSetRearSubsCfg}
                    onSetElements={rvNoops.onSetElements}
                    onSetOverheadState={rvNoops.onSetOverheadState}
                    onSetAimState={rvNoops.onSetAimState}
                    onSetRoomDims={rvNoops.onSetRoomDims}
                    onSetMlpPoint={rvNoops.onSetMlpPoint}
                />
            </div>
            
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-start justify-between gap-4 mb-6">
                    <div className="flex-1">
                        <h1 className="text-3xl font-bold text-[#1B1A1A] font-header">RP22 Compliance Report</h1>
                        <div className="text-base text-[#3E4349] mt-1">
                            System: {(() => {
                                const dolbyPreset = app?.dolbyLayout || "5.1";
                                const base = String(dolbyPreset).split(" ")[0];
                                const parts = base.split(".");
                                const bed = parts[0] || "5";
                                const heights = parts[2] || "";
                                
                                const frontCount = Number(app?.frontSubsCfg?.count ?? 0);
                                const rearCount = Number(app?.rearSubsCfg?.count ?? 0);
                                const totalSubs = frontCount + rearCount;
                                
                                return heights ? `${bed}.${totalSubs}.${heights}` : `${bed}.${totalSubs}`;
                            })()}
                        </div>
                    </div>
                    <div>
                        <Button
                            type="button"
                            onClick={() => {
                                setExportStatus("Clicked: starting export…");
                                setExportDebug({ isPrinting: true, planLen: 0, printReady: false });
                                setHasPrintedOnce(false);
                                setPlanImageDataUrl(null);
                                setPlanDimsImageDataUrl(null);
                                setPlanSpeakerDimsImageDataUrl(null);
                                setIsPrinting(true);
                            }}
                            className="px-5 py-2.5 border shadow-sm hover:bg-[#F1F0EE]"
                            style={{
                                fontFamily: "Futura PT Light, Century Gothic, sans-serif",
                                backgroundColor: "#FFFFFF",
                                borderColor: "#625143",
                                color: "#625143",
                                opacity: 1,
                            }}
                        >
                            <FileText className="w-4 h-4 mr-2" style={{ color: "#625143" }} />
                            Export PDF
                        </Button>
                        <div style={{ marginTop: 6, textAlign: "right", fontSize: 12, color: "#3E4349" }}>
                            <div><strong>Export status:</strong> {exportStatus}</div>
                            <div style={{ fontSize: 11, color: "#625143" }}>
                                isPrinting: {String(exportDebug.isPrinting)} · planLen: {exportDebug.planLen} · printReady: {String(exportDebug.printReady)}
                            </div>
                        </div>
                    </div>
                </div>
                <div className="border-b border-[#E6E4DD]" />

                {/* Counts Dashboard */}
                <div className="grid grid-cols-[auto_1fr] gap-6 items-start mt-8">
                    {/* Left: Room count box */}
                    <div className="justify-self-start">
                        <div className="border-2 border-[#213428] rounded-lg px-4 py-3 bg-white w-[280px] min-h-[88px]">
                            <div className="flex items-center gap-2 mb-2">
                                <Home className="w-4 h-4 text-[#213428]" />
                                <div className="text-sm font-semibold text-[#1B1A1A]" style={{ fontFamily: 'Futura PT Light, Century Gothic, sans-serif' }}>
                                    Room parameters ({roomLevelCounts.L4 + roomLevelCounts.L3 + roomLevelCounts.L2 + roomLevelCounts.L1})
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <RP22GradingPill level="L4" count={roomLevelCounts.L4} />
                                <RP22GradingPill level="L3" count={roomLevelCounts.L3} />
                                <RP22GradingPill level="L2" count={roomLevelCounts.L2} />
                                <RP22GradingPill level="L1" count={roomLevelCounts.L1} />
                            </div>
                        </div>
                    </div>

                    {/* Right: Seat parameters section */}
                    <div className="justify-self-end">
                        {/* Seat parameters heading */}
                        <div className="flex items-center gap-2 mb-3">
                            <User className="w-4 h-4 text-[#213428]" />
                            <div className="text-sm font-semibold text-[#1B1A1A]" style={{ fontFamily: 'Futura PT Light, Century Gothic, sans-serif' }}>
                                Seat parameters
                            </div>
                            <span className="text-sm text-gray-500">(10)</span>
                        </div>
                        
                        {/* Seat boxes grouped by row into columns */}
                        <div className="flex gap-4">
                            {seatCountsByRow.map(({ rowNum, seats }) => (
                                <div key={rowNum} className="flex flex-col gap-4">
                                    {seats.map(({ seatId, counts, total }) => {
                                        const isPrimary = analysisResult?.perSeatRp22?.[seatId]?.isPrimary === true;
                                        return (
                                        <div key={seatId} className={`rounded-lg px-4 py-3 bg-white w-[280px] min-h-[88px] ${isPrimary ? 'border-[3px] border-[#213428]' : 'border-2 border-[#213428]'}`}>
                                            <div className="flex items-center gap-2 mb-2">
                                                <div className="text-sm font-semibold text-[#1B1A1A]" style={{ fontFamily: 'Futura PT Light, Century Gothic, sans-serif' }}>
                                                    {formatSeatLabel(seatId)}
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                <RP22GradingPill level="L4" count={counts.L4} />
                                                <RP22GradingPill level="L3" count={counts.L3} />
                                                <RP22GradingPill level="L2" count={counts.L2} />
                                                <RP22GradingPill level="L1" count={counts.L1} />
                                            </div>
                                            </div>
                                            );
                                            })}
                                            </div>
                                            ))}
                        </div>
                    </div>
                </div>

                <Card className="bg-[#FFFFFF] border-[#DCDBD6]">
                    <CardHeader>
                        <CardTitle className="text-[#1B1A1A] font-header">
                            RP22 Parameters (Room)
                        </CardTitle>
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

                {/* Seat Reports Section */}
                <Card className="bg-[#FFFFFF] border-[#DCDBD6] mt-6">
                    <CardHeader>
                        <CardTitle className="text-[#1B1A1A] font-header">
                            RP22 Parameters (Seat)
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-stretch">
                            {(() => {
                                // Check state before rendering
                                if (!hasSeats) {
                                    return (
                                        <p className="text-sm text-[#3E4349]">
                                            No seats defined yet. Configure seating in Room Designer.
                                        </p>
                                    );
                                }



                                // Compute RSP seat (closest to green dot within 5cm)
                                const rspSeatId = React.useMemo(() => {
                                    const greenDot = app?.mlp;
                                    if (!greenDot || !Number.isFinite(greenDot.x) || !Number.isFinite(greenDot.y)) return null;
                                    
                                    let closestSeat = null;
                                    let minDist = Infinity;
                                    
                                    seats.forEach(s => {
                                        if (!Number.isFinite(s?.x) || !Number.isFinite(s?.y)) return;
                                        const d = Math.hypot(s.x - greenDot.x, s.y - greenDot.y);
                                        if (d < minDist) {
                                            minDist = d;
                                            closestSeat = s.id;
                                        }
                                    });
                                    
                                    return (minDist <= 0.05) ? closestSeat : null;
                                }, [seats, app?.mlp]);

                                return seats.map((seat, idx) => {
                                    const seatId = seat?.id || '—';
                                    
                                    // CRITICAL: Read from HUD cache (same source as Seat HUD tooltip)
                                    const tooltipData = app?.seatMetricsById?.[seatId];
                                    const rp22Raw = tooltipData?.rp22 || {};
                                    const rp23 = tooltipData?.rp23 || {};
                                    const isPrimary = tooltipData?.isPrimary || false;

                                    // If no metrics computed yet for this seat, show placeholders
                                    if (!tooltipData) {
                                        return null;
                                    }
                                    
                                    // Determine suffix label and colour
                                    const isRsp = seatId === rspSeatId;
                                    const suffix = isRsp ? '(RSP)' : (isPrimary ? '(Primary)' : '(Secondary)');
                                    const suffixColor = isRsp ? '#213428' : (isPrimary ? '#625143' : '#3E4349');
                                    
                                    return (
                                        <div key={seatId} className="flex flex-col h-full">
                                            <Card className="border-[#E6E4DD]">
                                                <CardHeader className="pb-2">
                                                    <CardTitle className="text-sm font-semibold text-[#1B1A1A] flex items-center gap-2" style={{ fontFamily: 'Futura PT Light, Century Gothic, sans-serif' }}>
                                                        {formatSeatLabel(seatId)} <span className="text-xs font-semibold" style={{ fontFamily: 'Futura PT Light, Century Gothic, sans-serif', color: suffixColor }}>{suffix}</span>
                                                    </CardTitle>
                                                </CardHeader>
                                                <CardContent className="space-y-2.5 text-xs">
                                                    {/* RP23 Horizontal Viewing */}
                                                    <div className="flex justify-between items-center">
                                                        <div className="flex items-baseline gap-2">
                                                            <span className="font-normal text-[#3E4349]">RP23 Horizontal:</span>
                                                            <span className="text-sm font-bold text-[#1B1A1A]">
                                                                {rp23?.formatted && rp23.formatted !== '—' ? rp23.formatted : '—'}
                                                            </span>
                                                        </div>
                                                        <RP22GradingPill level={rp23?.level || '—'} />
                                                    </div>

                                                    {/* RP22 Per-Seat Parameters */}
                                                    {/* Position and distances (from HUD) */}
                                                    <div className="mt-4 pt-3 border-t border-gray-200 text-xs text-gray-600 space-y-1">
                                                        {tooltipData?.position && (
                                                            <div>
                                                                <span className="font-medium">Position: </span>
                                                                {tooltipData.position}
                                                            </div>
                                                        )}
                                                        {tooltipData?.distanceToScreen && (
                                                            <div>Distance to Screen: {tooltipData.distanceToScreen}</div>
                                                        )}
                                                        {tooltipData?.distanceToMLP && (
                                                            <div>Distance to RSP: {tooltipData.distanceToMLP}</div>
                                                        )}
                                                    </div>

                                                    {['p1', 'p4', 'p5', 'p6', 'p9', 'p10', 'p16', 'p17', 'p20'].map((key) => {
                                                       const metric = rp22Raw[key];
                                                       const paramNum = parseInt(key.substring(1));

                                                        return (
                                                            <div key={key}>
                                                                <div className="flex items-baseline justify-between">
                                                                    {/* Left: P#: value (Room-result typography) */}
                                                                    <div className="flex items-baseline gap-2">
                                                                        <span className="font-normal text-[#3E4349]">
                                                                            P{paramNum}:
                                                                        </span>

                                                                        <span className="text-sm font-bold text-[#1B1A1A]">
                                                                            {metric ? (metric.formatted || metric.hudLabel || '—') : '—'}
                                                                        </span>
                                                                    </div>

                                                                    {/* Right: Level pill */}
                                                                    <RP22GradingPill
                                                                        level={
                                                                            metric
                                                                                ? (typeof metric.level === 'number' ? `L${metric.level}` : (metric.level || '—'))
                                                                                : '—'
                                                                        }
                                                                    />
                                                                </div>

                                                                {/* P16 breakdown */}
                                                                {metric && key === 'p16' && metric.perSpeaker && metric.perSpeaker.length > 0 && (
                                                                    <div className="text-[10px] text-gray-500 pl-2 mt-0.5">
                                                                        {metric.perSpeaker.map(s => 
                                                                            `${s.role} ${Math.floor(s.angleDeg || 0)}° / ${s.lossLabel || '—'}`
                                                                        ).join(', ')}
                                                                    </div>
                                                                )}

                                                                {/* P17 breakdown */}
                                                                {metric && key === 'p17' && metric.worstRole && (
                                                                    <div className="text-[10px] text-gray-500 pl-2 mt-0.5">
                                                                        Worst: {metric.worstRole} ({Math.floor(metric.worstAngleDeg || 0)}° / {metric.worstLossDb?.toFixed(1) || '—'} dB)
                                                                    </div>
                                                                )}
                                                            </div>
                                                            );
                                                            })}
                                                            </CardContent>
                                                            </Card>
                                                            </div>
                                                            );
                                                            }).filter(Boolean); // Remove any null cards
                                                            })()}
                                                            </div>

                                                            {/* Explanatory Footer - render once after all seat cards */}
                                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
                                                            <SeatComplianceSummary position='left' />
                                                            <SeatComplianceSummary position='middle' />
                                                            <SeatComplianceSummary position='right' />
                                                            </div>
                    </CardContent>
                </Card>
            </div>
            </div>

            {/* Print-only layout */}
            <div className="print-only print-keep-layout">
                <div className="print-root">
                    <div className="print-container">
                        <section id="pdf-cover">
                        {/* PAGE 1: Headline + counts only */}
                        <div className="print-page-break-after print-summary">
                            {/* Top: centred logo + title */}
                            <div
                                style={{
                                    maxWidth: "520px",
                                    margin: "0 auto",
                                    textAlign: "center",
                                    marginTop: 4
                                }}
                            >
                                <img
                                    src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/a8e555dac_Screenshot2025-08-31at135313.jpg"
                                    alt="SoundProof"
                                    style={{
                                        width: "100%",
                                        height: "auto",
                                        marginBottom: "12px",
                                    }}
                                />

                                <div
                                    style={{
                                        fontFamily: 'Futura PT Light, Century Gothic, sans-serif',
                                        fontSize: 28,
                                        fontWeight: 700,
                                        color: '#1B1A1A',
                                        lineHeight: 1.15,
                                    }}
                                >
                                    RP22 Compliance Report
                                </div>

                                <div style={{ marginTop: 6, color: '#3E4349', fontSize: 12 }}>
                                    {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}
                                    <span style={{ margin: '0 10px', color: '#DCDBD6' }}>•</span>
                                    <span style={{ color: '#625143' }}>
                                        System: {(() => {
                                            const dolbyPreset = app?.dolbyLayout || "5.1";
                                            const base = String(dolbyPreset).split(" ")[0];
                                            const parts = base.split(".");
                                            const bed = parts[0] || "5";
                                            const heights = parts[2] || "";
                                            const frontCount = Number(app?.frontSubsCfg?.count ?? 0);
                                            const rearCount = Number(app?.rearSubsCfg?.count ?? 0);
                                            const totalSubs = frontCount + rearCount;
                                            return heights ? `${bed}.${totalSubs}.${heights}` : `${bed}.${totalSubs}`;
                                        })()}
                                    </span>
                                </div>
                            </div>

                            {/* Divider */}
                            <div style={{ borderBottom: '1px solid #E6E4DD', marginTop: 18, marginBottom: 18 }} />

                            {/* Counts: two stacked full-width cards */}
                            <div style={{ 
                                display: 'flex', 
                                flexDirection: 'column', 
                                gap: '6mm',
                                maxWidth: '170mm',
                                margin: '6mm auto 0',
                            }}>
                                {/* Room */}
                                <div
                                    style={{
                                        border: '1px solid #D9D5CE',
                                        borderRadius: '12px',
                                        padding: '6mm 8mm',
                                        background: '#FBFAF8',
                                        width: '100%',
                                        textAlign: 'center',
                                    }}
                                    className="print-avoid-break"
                                >
                                    <div
                                        style={{
                                            fontFamily: 'Futura PT Light, Century Gothic, sans-serif',
                                            fontSize: '12pt',
                                            fontWeight: 700,
                                            color: '#1B1A1A',
                                            marginBottom: '3mm',
                                        }}
                                    >
                                        Room parameters ({roomLevelCounts.L4 + roomLevelCounts.L3 + roomLevelCounts.L2 + roomLevelCounts.L1})
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'center', gap: '4mm', marginTop: '2mm' }}>
                                        <RP22GradingPill level="L4" count={roomLevelCounts.L4} />
                                        <RP22GradingPill level="L3" count={roomLevelCounts.L3} />
                                        <RP22GradingPill level="L2" count={roomLevelCounts.L2} />
                                        <RP22GradingPill level="L1" count={roomLevelCounts.L1} />
                                    </div>
                                </div>

                                {/* Seat */}
                                <div
                                    style={{
                                        border: '1px solid #D9D5CE',
                                        borderRadius: '12px',
                                        padding: '6mm 8mm',
                                        background: '#FBFAF8',
                                        width: '100%',
                                        textAlign: 'center',
                                    }}
                                    className="print-avoid-break"
                                >
                                    <div
                                        style={{
                                            fontFamily: 'Futura PT Light, Century Gothic, sans-serif',
                                            fontSize: '12pt',
                                            fontWeight: 700,
                                            color: '#1B1A1A',
                                            marginBottom: '3mm',
                                        }}
                                    >
                                        Seat parameters ({seats?.length || 0} seats)
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'center', gap: '4mm', marginTop: '2mm' }}>
                                        {(() => {
                                            const agg = { L4: 0, L3: 0, L2: 0, L1: 0 };
                                            (seatLevelCounts || []).forEach(s => {
                                                agg.L4 += s.counts?.L4 || 0;
                                                agg.L3 += s.counts?.L3 || 0;
                                                agg.L2 += s.counts?.L2 || 0;
                                                agg.L1 += s.counts?.L1 || 0;
                                            });
                                            return (
                                                <>
                                                    <RP22GradingPill level="L4" count={agg.L4} />
                                                    <RP22GradingPill level="L3" count={agg.L3} />
                                                    <RP22GradingPill level="L2" count={agg.L2} />
                                                    <RP22GradingPill level="L1" count={agg.L1} />
                                                </>
                                            );
                                        })()}
                                    </div>
                                </div>
                            </div>

                            {/* System Summary */}
                            <div style={{
                                maxWidth: '170mm',
                                margin: '6mm auto 0',
                            }}>
                                <div
                                    style={{
                                        border: '1px solid #D9D5CE',
                                        borderRadius: '12px',
                                        padding: '6mm 8mm',
                                        background: '#FBFAF8',
                                        width: '100%',
                                    }}
                                    className="print-avoid-break"
                                >
                                    <div
                                        style={{
                                            fontFamily: 'Futura PT Light, Century Gothic, sans-serif',
                                            fontSize: '12pt',
                                            fontWeight: 700,
                                            color: '#1B1A1A',
                                            marginBottom: '2mm',
                                            textAlign: 'center',
                                        }}
                                    >
                                        System summary
                                    </div>
                                    <div
                                        style={{
                                            fontFamily: 'Futura PT Light, Century Gothic, sans-serif',
                                            fontSize: '9pt',
                                            color: '#3E4349',
                                            marginBottom: '4mm',
                                            textAlign: 'center',
                                        }}
                                    >
                                        Selected loudspeaker models
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3mm' }}>
                                        {/* LCR */}
                                        <div style={{ display: 'flex', paddingBottom: '3mm', borderBottom: '1px solid #EEEAE3' }}>
                                            <div style={{ width: '30%', fontWeight: 600, fontSize: '10pt', color: '#1B1A1A' }}>
                                                LCR
                                            </div>
                                            <div style={{ width: '70%', fontSize: '10pt', color: '#3E4349' }}>
                                                {systemSummary.lcr.join(', ')}
                                            </div>
                                        </div>

                                        {/* Surrounds */}
                                        <div style={{ display: 'flex', paddingBottom: '3mm', borderBottom: '1px solid #EEEAE3' }}>
                                            <div style={{ width: '30%', fontWeight: 600, fontSize: '10pt', color: '#1B1A1A' }}>
                                                Surrounds
                                            </div>
                                            <div style={{ width: '70%', fontSize: '10pt', color: '#3E4349' }}>
                                                {systemSummary.surrounds.join(', ')}
                                            </div>
                                        </div>

                                        {/* Overheads */}
                                        <div style={{ display: 'flex', paddingBottom: '3mm', borderBottom: '1px solid #EEEAE3' }}>
                                            <div style={{ width: '30%', fontWeight: 600, fontSize: '10pt', color: '#1B1A1A' }}>
                                                Overheads
                                            </div>
                                            <div style={{ width: '70%', fontSize: '10pt', color: '#3E4349' }}>
                                                {systemSummary.overheads.join(', ')}
                                            </div>
                                        </div>

                                        {/* Subwoofers */}
                                        <div style={{ display: 'flex' }}>
                                            <div style={{ width: '30%', fontWeight: 600, fontSize: '10pt', color: '#1B1A1A' }}>
                                                Subwoofers
                                            </div>
                                            <div style={{ width: '70%', fontSize: '10pt', color: '#3E4349' }}>
                                                {systemSummary.subs.join(', ')}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Optional small note at bottom of page 1 */}
                            <div style={{ marginTop: '5mm', fontSize: 10, color: '#3E4349', textAlign: 'center' }}>
                                Generated from current Room Designer configuration and live analysis state.
                            </div>
                        </div>
                        </section>

                        {planEnabled && typeof planImageDataUrl === 'string' && planImageDataUrl.length > 0 && planImageDataUrl !== '__SKIP__' && (
                            <section id="pdf-room-plan" className="print-page-break-after" style={{ background: 'transparent', padding: 0, margin: 0 }}>
                                <h2
                                    style={{
                                        fontFamily: 'Futura PT Light, Century Gothic, sans-serif',
                                        fontSize: '20pt',
                                        fontWeight: 500,
                                        letterSpacing: '0.3px',
                                        color: '#1B1A1A',
                                        margin: '0 0 6mm 0',
                                        background: 'transparent',
                                        padding: 0,
                                    }}
                                >
                                    Room plan
                                </h2>

                                <img
                                    src={planImageDataUrl}
                                    alt="Room plan"
                                    style={{
                                        width: '100%',
                                        height: 'auto',
                                        objectFit: 'contain',
                                        display: 'block',
                                        margin: '0',
                                        padding: 0,
                                        background: 'transparent',
                                    }}
                                />
                            </section>
                        )}

                        {planEnabled && typeof planDimsImageDataUrl === 'string' && planDimsImageDataUrl.length > 0 && planDimsImageDataUrl !== '__SKIP__' && (
                            <section id="pdf-room-plan-dims" className="print-page-break-after" style={{ background: 'transparent', padding: 0, margin: 0 }}>
                                <h2
                                    style={{
                                        fontFamily: 'Futura PT Light, Century Gothic, sans-serif',
                                        fontSize: '20pt',
                                        fontWeight: 500,
                                        letterSpacing: '0.3px',
                                        color: '#1B1A1A',
                                        margin: '0 0 6mm 0',
                                        background: 'transparent',
                                        padding: 0,
                                    }}
                                >
                                    Room plan (dimensions)
                                </h2>

                                <img
                                    src={planDimsImageDataUrl}
                                    alt="Room plan (dimensions)"
                                    style={{
                                        width: '100%',
                                        height: 'auto',
                                        objectFit: 'contain',
                                        display: 'block',
                                        margin: '0',
                                        padding: 0,
                                        background: 'transparent',
                                    }}
                                />
                            </section>
                        )}

                        {planEnabled && typeof planSpeakerDimsImageDataUrl === 'string' && planSpeakerDimsImageDataUrl.length > 0 && planSpeakerDimsImageDataUrl !== '__SKIP__' && (
                            <section
                                id="pdf-room-plan-positions"
                                className="print-page-break-after"
                                style={{ background: "transparent", padding: 0, margin: 0 }}
                            >
                                <h2
                                    style={{
                                        fontFamily: "Futura PT Light, Century Gothic, sans-serif",
                                        fontSize: "20pt",
                                        fontWeight: 500,
                                        letterSpacing: "0.3px",
                                        color: "#1B1A1A",
                                        margin: "0 0 6mm 0",
                                        background: "transparent",
                                        padding: 0,
                                    }}
                                >
                                    Room plan (speaker positions)
                                </h2>

                                <img
                                    src={planSpeakerDimsImageDataUrl}
                                    alt="Room plan (speaker positions)"
                                    style={{
                                        width: "100%",
                                        height: "auto",
                                        objectFit: "contain",
                                        display: "block",
                                        margin: 0,
                                        padding: 0,
                                        background: "transparent",
                                    }}
                                />
                            </section>
                        )}

                        <section id="pdf-room-parameters">
                        {/* ROOM PARAMETERS */}
                        <div>
                        <div style={{ fontFamily: 'Futura PT Light, Century Gothic, sans-serif', fontSize: 18, fontWeight: 700, color: '#1B1A1A', marginBottom: 14 }}>
                            RP22 Parameters (Room)
                        </div>
                        <div style={{ color: '#3E4349', fontSize: 11, marginBottom: 10 }}>
                            Room-wide compliance parameters (non seat-specific).
                        </div>
                        <div className="print-grid-room">
                            {orderedParams.map(param => (
                                <div key={param.id} className="print-avoid-break">
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
                            ))}
                        </div>
                        </div>
                        </section>

                        <section id="pdf-seat-parameters">
                        {/* SEAT PARAMETERS */}
                        <div className="print-page-break-before" style={{ marginTop: 18 }}>
                        <div style={{ fontFamily: 'Futura PT Light, Century Gothic, sans-serif', fontSize: 18, fontWeight: 700, color: '#1B1A1A', marginBottom: 14 }}>
                            RP22 Parameters (Seat)
                        </div>
                        <div style={{ color: '#3E4349', fontSize: 11, marginBottom: 10 }}>
                            Seat-by-seat compliance parameters including RP23 horizontal viewing.
                        </div>
                        <div className="print-grid-seats">
                            {(() => {
                                const greenDot = app?.mlp;
                                let rspSeatId = null;
                                if (greenDot && Number.isFinite(greenDot.x) && Number.isFinite(greenDot.y)) {
                                    let closestSeat = null;
                                    let minDist = Infinity;
                                    seats.forEach(s => {
                                        if (!Number.isFinite(s?.x) || !Number.isFinite(s?.y)) return;
                                        const d = Math.hypot(s.x - greenDot.x, s.y - greenDot.y);
                                        if (d < minDist) { minDist = d; closestSeat = s.id; }
                                    });
                                    if (minDist <= 0.05) rspSeatId = closestSeat;
                                }

                                return seats.map(seat => {
                                    const seatId = seat?.id || '—';
                                    const tooltipData = app?.seatMetricsById?.[seatId];
                                    if (!tooltipData) return null;

                                    const rp22Raw = tooltipData?.rp22 || {};
                                    const rp23 = tooltipData?.rp23 || {};
                                    const isPrimary = tooltipData?.isPrimary || false;
                                    const isRsp = seatId === rspSeatId;
                                    const suffix = isRsp ? '(RSP)' : (isPrimary ? '(Primary)' : '(Secondary)');
                                    const suffixColor = isRsp ? '#213428' : (isPrimary ? '#625143' : '#3E4349');

                                    return (
                                        <div key={seatId} className="print-avoid-break">
                                            <Card className="border-[#E6E4DD]">
                                                <CardHeader className="pb-2">
                                                    <CardTitle className="text-sm font-semibold text-[#1B1A1A]" style={{ fontFamily: 'Futura PT Light, Century Gothic, sans-serif' }}>
                                                        {formatSeatLabel(seatId)}{' '}
                                                        <span style={{ fontSize: 11, fontWeight: 700, color: suffixColor }}>{suffix}</span>
                                                    </CardTitle>
                                                </CardHeader>
                                                <CardContent className="space-y-2.5 text-xs">
                                                    <div className="flex justify-between items-center">
                                                        <div className="flex items-baseline gap-2">
                                                            <span className="font-normal text-[#3E4349]">RP23 Horizontal:</span>
                                                            <span className="text-sm font-bold text-[#1B1A1A]">
                                                                {rp23?.formatted && rp23.formatted !== '—' ? rp23.formatted : '—'}
                                                            </span>
                                                        </div>
                                                        <RP22GradingPill level={rp23?.level || '—'} />
                                                    </div>
                                                    <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-600 space-y-1">
                                                        {tooltipData?.position && <div><span className="font-medium">Position: </span>{tooltipData.position}</div>}
                                                        {tooltipData?.distanceToScreen && <div>Distance to Screen: {tooltipData.distanceToScreen}</div>}
                                                        {tooltipData?.distanceToMLP && <div>Distance to RSP: {tooltipData.distanceToMLP}</div>}
                                                    </div>
                                                    {['p1', 'p4', 'p5', 'p6', 'p9', 'p10', 'p16', 'p17', 'p20'].map((key) => {
                                                        const metric = rp22Raw[key];
                                                        const paramNum = parseInt(key.substring(1), 10);
                                                        return (
                                                            <div key={key}>
                                                                <div className="flex items-baseline justify-between">
                                                                    <div className="flex items-baseline gap-2">
                                                                        <span className="font-normal text-[#3E4349]">P{paramNum}:</span>
                                                                        <span className="text-sm font-bold text-[#1B1A1A]">
                                                                            {metric ? (metric.formatted || metric.hudLabel || '—') : '—'}
                                                                        </span>
                                                                    </div>
                                                                    <RP22GradingPill level={metric ? (typeof metric.level === 'number' ? `L${metric.level}` : (metric.level || '—')) : '—'} />
                                                                </div>
                                                                {metric && key === 'p16' && metric.perSpeaker && metric.perSpeaker.length > 0 && (
                                                                    <div className="text-[10px] text-gray-500 pl-2 mt-0.5">
                                                                        {metric.perSpeaker.map(s => `${s.role} ${Math.floor(s.angleDeg || 0)}° / ${s.lossLabel || '—'}`).join(', ')}
                                                                    </div>
                                                                )}
                                                                {metric && key === 'p17' && metric.worstRole && (
                                                                    <div className="text-[10px] text-gray-500 pl-2 mt-0.5">
                                                                        Worst: {metric.worstRole} ({Math.floor(metric.worstAngleDeg || 0)}° / {metric.worstLossDb?.toFixed(1) || '—'} dB)
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </CardContent>
                                            </Card>
                                        </div>
                                    );
                                }).filter(Boolean);
                            })()}
                        </div>
                        <div className="grid grid-cols-3 gap-4 mt-6 print-avoid-break">
                            <SeatComplianceSummary position="left" />
                            <SeatComplianceSummary position="middle" />
                            <SeatComplianceSummary position="right" />
                        </div>
                        </div>
                        </section>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function RP22Report() {
    return (
        <AppStateProvider>
            <RP22ReportInner />
        </AppStateProvider>
    );
}