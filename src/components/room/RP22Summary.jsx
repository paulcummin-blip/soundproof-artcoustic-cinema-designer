import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default function RP22Summary({ analysis }) {
    if (!analysis) return null;

    const { calculatedSPL, rp22Level, factors, isDesignEstimate, note } = analysis;

    return (
        <Card className="bg-[#FFFFFF] border-[#DCDBD6] relative overflow-hidden">
            <CardHeader>
                <CardTitle className="text-[#1B1A1A] font-header">
                    RP22 Parameter 14: LFE SPL Capability
                </CardTitle>
                <CardDescription className="text-sm text-[#3E4349] font-body">
                    Combined system output at MLP (C-weighted, in-room)
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-[#F9F8F6] rounded-lg border border-[#DCDBD6]">
                    <div>
                        <div className="text-2xl font-bold text-[#1B1A1A] font-header">
                            {calculatedSPL.toFixed(1)} dB SPL
                        </div>
                        <p className="text-sm text-[#3E4349] font-body">Live-calculated Result</p>
                    </div>
                    <div className="text-right">
                        <div className="text-lg font-header text-[#213428]">
                            {rp22Level}
                        </div>
                        <p className="text-xs text-[#3E4349] font-body">RP22 Level Achieved</p>
                    </div>
                </div>
                {factors && (
                    <div>
                        <h4 className="font-header text-sm text-[#1B1A1A] mb-2">Factors Considered:</h4>
                        <ul className="list-disc list-inside text-xs text-[#3E4349] font-body space-y-1">
                            <li>Summation Gain: {factors.summationGain?.toFixed(1) || 0} dB</li>
                            <li>Average Boundary Gain: {factors.boundaryGain?.toFixed(1) || 0} dB</li>
                            <li>Destructive Nulls Count: {factors.nullCount || 0}</li>
                        </ul>
                    </div>
                )}
                {isDesignEstimate && note && (
                    <p className="text-xs text-[#8B7F76] font-body italic">
                        {note}
                    </p>
                )}
            </CardContent>
            <img
                src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/c0d2feeed_Artcoustic-logo_dark-grey-icon_TRANSPARENT_BACKGROUND.png"
                alt="Artcoustic Watermark"
                className="absolute bottom-3 right-3 w-16 h-16 opacity-[0.12] pointer-events-none"
            />
        </Card>
    );
}