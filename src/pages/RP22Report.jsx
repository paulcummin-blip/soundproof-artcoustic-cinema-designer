
import React from 'react';
import { useAppState } from '../components/AppStateProvider';
import { useRP22AnalysisEngine } from '../components/hooks/useRP22AnalysisEngine';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BarChart4 } from 'lucide-react';
import { rp22Parameters, rp22ByNumber } from '../components/data/rp22Parameters'; // Import canonical data
import { RP22_CATALOG } from "@/components/data/rp22Catalog";
import ParameterCard from '../components/report/ParameterCard';

export default function RP22Report() {
    const { backgroundNoiseNCB, setBackgroundNoiseNCB, ...appState } = useAppState();
    const analysisResult = useRP22AnalysisEngine(appState);

    const levelCounts = React.useMemo(() => {
        if (!analysisResult?.gradedParameters?.primary) return {};
        return Object.values(analysisResult.gradedParameters.primary).reduce((acc, param) => {
            const level = param?.level?.level;
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

    if (!analysisResult || !analysisResult.gradedParameters || !analysisResult.gradedParameters.primary) {
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
    
    const { gradedParameters, analysisDetails } = analysisResult;

    const parameterGroups = {
        geometry: { title: 'Room & Seating Geometry', ids: [1, 3, 11] },
        placement: { title: 'Speaker Placement & Coherence', ids: [4, 5, 6, 7, 9, 10] },
        capability: { title: 'System Capability & SPL', ids: [2, 8, 12, 13, 14, 18] },
        acoustics: { title: 'Acoustic Performance & Variance', ids: [15, 16, 17, 19, 20, 21] },
    };

    const renderCategory = (group, results, keyPrefix) => (
        <div key={`${keyPrefix}-${group.title}`}>
            <h3 className="text-xl font-header text-[#1B1A1A] mt-8 mb-4">{group.title}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {rp22Parameters
                    .filter(p => group.ids.includes(p.id))
                    .map(param => (
                        <ParameterCard 
                            key={param.id} 
                            parameter={param} 
                            result={results ? results[param.id] : null}
                        />
                ))}
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-[#F9F8F6] p-6">
            <div className="max-w-7xl mx-auto space-y-6">
                <div className="flex justify-between items-center">
                    <h1 className="text-3xl font-bold text-[#1B1A1A] font-header">RP22 Compliance Report</h1>
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

                {Object.values(parameterGroups).map(group => renderCategory(group, gradedParameters.primary, 'primary'))}

                {analysisDetails.hasSecondarySeating && gradedParameters.secondary && (
                     <>
                        <h2 className="text-2xl font-header text-[#1B1A1A] mt-12 pt-6 border-t border-[#DCDBD6]">Secondary Seating Area</h2>
                        {Object.values(parameterGroups).map(group => renderCategory(group, gradedParameters.secondary, 'secondary'))}
                    </>
                )}
            </div>
        </div>
    );
}
