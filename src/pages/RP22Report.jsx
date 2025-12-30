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

    const { backgroundNoiseNCB, setBackgroundNoiseNCB, ...appState } = app;
    const analysisResult = useRP22AnalysisEngine(appState);

    // Build ordered parameters list (1-21)
    const orderedParams = React.useMemo(() => {
        return [...rp22Parameters].sort((a, b) => a.id - b.id);
    }, []);

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
                        <CardTitle className="text-[#1B1A1A] font-header">Room Settings</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <Label htmlFor="noise" className="text-sm font-medium text-[#3E4349]">
                                    Background Noise (NCB)
                                </Label>
                                <Input
                                    id="noise"
                                    type="number"
                                    value={backgroundNoiseNCB}
                                    onChange={(e) => setBackgroundNoiseNCB(Number(e.target.value))}
                                    className="mt-1"
                                />
                                <p className="text-xs text-gray-500 mt-1">Defines compliance for Parameter #{RP22_CATALOG["15"].number}.</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-[#FFFFFF] border-[#DCDBD6] mt-6">
                    <CardHeader>
                        <CardTitle className="text-[#1B1A1A] font-header">
                            RP22 Parameters (All 21)
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {orderedParams.map(param => (
                                <ParameterCard
                                    key={param.id}
                                    parameter={param}
                                    roomResult={getRoomResult(param.id)}
                                    seatResults={getSeatResults(param.id)}
                                />
                            ))}
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