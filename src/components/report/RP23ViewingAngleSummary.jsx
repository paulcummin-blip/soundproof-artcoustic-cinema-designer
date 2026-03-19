import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import RP22GradingPill from '../ui/RP22GradingPill';

export default function RP23ViewingAngleSummary({ rp23Rows, className = '' }) {
    if (!Array.isArray(rp23Rows) || rp23Rows.length === 0) return null;

    return (
        <div className={className}>
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
                </CardContent>
            </Card>
        </div>
    );
}