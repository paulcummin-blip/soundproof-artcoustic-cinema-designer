import React from 'react';
import { AppStateProvider, useAppState } from '../components/AppStateProvider';
import { useRP22AnalysisEngine } from '../components/hooks/useRP22AnalysisEngine';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BarChart4 } from 'lucide-react';
import { rp22Parameters } from '../components/data/rp22Parameters';
import { RP22_CATALOG } from "@/components/data/rp22Catalog";
import ParameterCard from '../components/report/ParameterCard';
import SeatComplianceSummary from '../components/report/SeatComplianceSummary';
import RP22GradingPill from '../components/ui/RP22GradingPill';
import { computeMLPAndPrimary } from '../components/utils/computeMLPAndPrimary';
import { computeAllSeatSplMetrics } from '../components/utils/spl/centralSplEngine';
import { getSpeakerModelMeta } from '../components/models/speakers/registry';
import { buildSeatHudSnapshot } from '../components/utils/buildSeatHudSnapshot';

function RP22ReportInner() {
    const app = useAppState();
    
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

    // Count per-seat parameters (L1-L4 only, exclude null/FAIL/no_data)
    const seatLevelCounts = React.useMemo(() => {
        const perSeat = analysisResult?.perSeatRp22 || {};
        const seatIds = Object.keys(perSeat).sort();
        
        return seatIds.map(seatId => {
            const rp22 = perSeat[seatId]?.rp22 || {};
            const counts = { L4: 0, L3: 0, L2: 0, L1: 0 };
            
            Object.values(rp22).forEach(metric => {
                if (!metric || !metric.level) return;
                
                const lvl = typeof metric.level === 'string' 
                    ? metric.level.trim()
                    : `L${metric.level}`;
                
                if (lvl.match(/^L[1-4]$/)) {
                    counts[lvl] += 1;
                }
            });
            
            return { seatId, counts };
        });
    }, [analysisResult?.perSeatRp22]);

    // Chunk seat counts into groups of 4 for column layout
    const seatChunks = React.useMemo(() => {
        const chunkSize = 4;
        const chunks = [];
        for (let i = 0; i < seatLevelCounts.length; i += chunkSize) {
            chunks.push(seatLevelCounts.slice(i, i + chunkSize));
        }
        return chunks;
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

    return (
        <div className="min-h-screen bg-[#F9F8F6] p-6">
            <div className="max-w-7xl mx-auto space-y-6">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-bold text-[#1B1A1A] font-header">RP22 Compliance Report</h1>
                        <div className="text-sm text-[#3E4349] mt-1">
                            System: {(() => {
                                const dolbyPreset = app?.dolbyLayout || "5.1";
                                const base = String(dolbyPreset).split(" ")[0]; // "5.1.4" or "5.1"
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
                    <div className="flex gap-4 items-start">
                        {/* Column 1: Room parameters + first chunk of seats */}
                        <div className="space-y-4">
                            <div className="border-2 border-[#213428] rounded-lg px-4 py-3 bg-white">
                                <div className="text-sm font-semibold text-[#1B1A1A] mb-2" style={{ fontFamily: 'Futura PT Light, Century Gothic, sans-serif' }}>
                                    Room parameters ({roomLevelCounts.L4 + roomLevelCounts.L3 + roomLevelCounts.L2 + roomLevelCounts.L1})
                                </div>
                                <div className="flex gap-2">
                                    <RP22GradingPill level="L4" count={roomLevelCounts.L4} />
                                    <RP22GradingPill level="L3" count={roomLevelCounts.L3} />
                                    <RP22GradingPill level="L2" count={roomLevelCounts.L2} />
                                    <RP22GradingPill level="L1" count={roomLevelCounts.L1} />
                                </div>
                            </div>

                            {seatChunks.length > 0 && seatChunks[0].map(({ seatId, counts }) => (
                                <div key={seatId} className="border-2 border-[#213428] rounded-lg px-4 py-3 bg-white">
                                    <div className="text-sm font-semibold text-[#1B1A1A] mb-2" style={{ fontFamily: 'Futura PT Light, Century Gothic, sans-serif' }}>
                                        Seat parameters — {seatId}
                                    </div>
                                    <div className="flex gap-2">
                                        <RP22GradingPill level="L4" count={counts.L4} />
                                        <RP22GradingPill level="L3" count={counts.L3} />
                                        <RP22GradingPill level="L2" count={counts.L2} />
                                        <RP22GradingPill level="L1" count={counts.L1} />
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Columns 2+: remaining chunks of seats */}
                        {seatChunks.slice(1).map((chunk, columnIndex) => (
                            <div key={columnIndex} className="space-y-4">
                                {chunk.map(({ seatId, counts }) => (
                                    <div key={seatId} className="border-2 border-[#213428] rounded-lg px-4 py-3 bg-white">
                                        <div className="text-sm font-semibold text-[#1B1A1A] mb-2" style={{ fontFamily: 'Futura PT Light, Century Gothic, sans-serif' }}>
                                            Seat parameters — {seatId}
                                        </div>
                                        <div className="flex gap-2">
                                            <RP22GradingPill level="L4" count={counts.L4} />
                                            <RP22GradingPill level="L3" count={counts.L3} />
                                            <RP22GradingPill level="L2" count={counts.L2} />
                                            <RP22GradingPill level="L1" count={counts.L1} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ))}
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
                                    
                                    return (
                                        <div key={seatId} className="flex flex-col h-full">
                                            <Card className="border-[#E6E4DD]">
                                                <CardHeader className="pb-2">
                                                    <CardTitle className="text-sm font-semibold text-[#1B1A1A] flex items-center gap-2" style={{ fontFamily: 'Futura PT Light, Century Gothic, sans-serif' }}>
                                                        {seatId} {isPrimary && <span className="text-xs text-green-700">(MLP)</span>}
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
                                                {/* Summary Box */}
                                                <div className="mt-2 flex-1">
                                                    <SeatComplianceSummary position={idx === 0 ? 'left' : idx === 1 ? 'middle' : 'right'} />
                                                </div>
                                            </div>
                                            );
                                        }).filter(Boolean); // Remove any null cards
                                        })()}
                        </div>
                    </CardContent>
                </Card>
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