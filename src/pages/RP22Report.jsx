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
            p15ConstructionLevel: app?.p15ConstructionLevel,
        },
        aimState: {
            aimFrontWidesAtMLP: app?.aimFrontWidesAtMLP,
            aimSideSurroundsAtMLP: app?.aimSideSurroundsAtMLP,
            aimRearSurroundsAtMLP: app?.aimRearSurroundsAtMLP,
        }
    });

    // READ seat metrics from AppState cache (single source of truth shared with HUD)
    const seatMetricsById = app?.seatMetricsById || {};

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

    const levelCounts = React.useMemo(() => {
        if (!analysisResult?.gradedParameters?.primary) return {};
        return Object.values(analysisResult.gradedParameters.primary).reduce((acc, param) => {
            const level = param?.level;
            if (level) {
                acc[`L${level}`] = (acc[`L${level}`] || 0) + 1;
            }
            return acc;
        }, {});
    }, [analysisResult]);

    const overallLevel = () => {
        const counts = levelCounts;
        if (counts.L4 === 21) return 'L4';
        if ((counts.L3 || 0) + (counts.L4 || 0) >= 19) return 'L3';
        if ((counts.L2 || 0) + (counts.L3 || 0) + (counts.L4 || 0) >= 15) return 'L2';
        return 'L1';
    };

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
                    <div className="text-right">
                        <div className="text-2xl font-bold text-[#213428]">Overall: {overallLevel()}</div>
                        <div className="text-sm text-[#3E4349]">
                            {['L4', 'L3', 'L2', 'L1'].map(l => `${l}: ${levelCounts[l] || 0}`).join(' | ')}
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
                                />
                            ))}
                        </div>
                    </CardContent>
                </Card>

                {/* Seat Reports Section */}
                <Card className="bg-[#FFFFFF] border-[#DCDBD6] mt-6">
                    <CardHeader>
                        <CardTitle className="text-[#1B1A1A] font-header">Seat Reports</CardTitle>
                        <p className="text-xs text-[#3E4349] mt-1">Per-seat results shown below match the Seat HUD values.</p>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {(() => {
                                // Check state before rendering
                                if (!hasSeats) {
                                    return (
                                        <p className="text-sm text-[#3E4349]">
                                            No seats defined yet. Configure seating in Room Designer.
                                        </p>
                                    );
                                }

                                const hasMetrics = Object.keys(seatMetricsById).length > 0;
                                if (!hasMetrics) {
                                    return (
                                        <p className="text-sm text-[#3E4349]">
                                            Analysis in progress…
                                        </p>
                                    );
                                }

                                return seats.map((seat) => {
                                    const seatId = seat?.id || '—';
                                    const tooltipData = seatMetricsById[seatId];

                                    // If no metrics computed yet for this seat, skip
                                    if (!tooltipData) {
                                        return null;
                                    }

                                    const rp22Raw = tooltipData?.rp22 || {};
                                    const rp23 = tooltipData?.rp23 || {};
                                    const isPrimary = tooltipData?.isPrimary || false;
                                    
                                    return (
                                        <Card key={seatId} className="border-[#E6E4DD]">
                                            <CardHeader className="pb-2">
                                                <CardTitle className="text-sm font-semibold text-[#1B1A1A] flex items-center gap-2">
                                                    {seatId} {isPrimary && <span className="text-xs text-green-700">(MLP)</span>}
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent className="space-y-1.5 text-xs">
                                                {/* RP23 Horizontal Viewing */}
                                                <div className="flex justify-between items-center pb-1.5 border-b border-gray-100">
                                                    <span className="font-semibold text-[#1B1A1A]">RP23 Horizontal:</span>
                                                    <div className="flex items-center gap-2">
                                                        {rp23?.formatted && rp23.formatted !== '—' ? (
                                                            <>
                                                                <span className="text-[#1B1A1A]">{rp23.formatted}</span>
                                                                <RP22GradingPill level={rp23.level} />
                                                            </>
                                                        ) : (
                                                            <span className="text-xs text-gray-400">—</span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* RP22 Per-Seat Parameters */}
                                                {['p1', 'p4', 'p5', 'p6', 'p9', 'p10', 'p16', 'p17', 'p20'].map((key) => {
                                                   const metric = rp22Raw[key];
                                                   const paramNum = parseInt(key.substring(1));

                                                   return (
                                                       <div key={key}>
                                                           <div className="flex justify-between items-center">
                                                               <span className="font-semibold text-[#1B1A1A]">
                                                                   P{paramNum}:
                                                               </span>
                                                               <div className="flex items-center gap-2">
                                                                   {metric ? (
                                                                       <>
                                                                           <span className="text-[#1B1A1A]">{metric.formatted || metric.hudLabel || '—'}</span>
                                                                           <RP22GradingPill level={typeof metric.level === 'number' ? `L${metric.level}` : (metric.level || '—')} />
                                                                       </>
                                                                   ) : (
                                                                      <span className="text-xs text-gray-400">—</span>
                                                                   )}
                                                               </div>
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