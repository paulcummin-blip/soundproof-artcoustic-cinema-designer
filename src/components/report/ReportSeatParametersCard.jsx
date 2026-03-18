import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import RP22GradingPill from '../ui/RP22GradingPill';
import SeatComplianceSummary from './SeatComplianceSummary';
import { formatSeatLabel } from '../utils/seatLabel';

export default function ReportSeatParametersCard({
    seats,
    hasSeats,
    reportSeatHudById,
    app,
    rspSeatId,
    analysisResult,
}) {
    return (
        <Card className="bg-[#FFFFFF] border-[#DCDBD6] mt-6">
            <CardHeader>
                <CardTitle className="text-[#1B1A1A] font-header">
                    RP22 Parameters (Seat)
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-stretch">
                    {!hasSeats ? (
                        <p className="text-sm text-[#3E4349]">
                            No seats defined yet. Configure seating in Room Designer.
                        </p>
                    ) : seats.map((seat, seatIdx) => {
                        const seatId = seat?.id || '—';

                        const tooltipData =
                            reportSeatHudById?.[seatId] ??
                            app?.seatMetricsById?.[seatId] ??
                            null;
                        const rp23 = tooltipData?.rp23 || {};
                        const rp22Hud = tooltipData?.rp22 || {};

                        const getRp22Metric = (key) => {
                            const n = parseInt(String(key).replace("p", ""), 10);
                            if (!Number.isFinite(n)) return null;
                            return rp22Hud[key] ?? rp22Hud[`p${n}`] ?? rp22Hud[n] ?? rp22Hud[String(n)] ?? null;
                        };

                        const isPrimary = tooltipData?.isPrimary || false;
                        const isRsp = seatId === rspSeatId;
                        const suffix = isRsp ? '(RSP)' : (isPrimary ? '(Primary)' : '(Secondary)');
                        const suffixColor = isRsp ? '#213428' : (isPrimary ? '#625143' : '#3E4349');

                        return (
                            <div
                                key={seatId}
                                className="rp22-card-wrap print-avoid-break flex flex-col h-full"
                                data-seat-index={seatIdx}
                                style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
                            >
                                <Card className="rp22-seat-card border-[#E6E4DD]">
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm font-semibold text-[#1B1A1A] flex items-center gap-2" style={{ fontFamily: 'Futura PT Light, Century Gothic, sans-serif' }}>
                                            {formatSeatLabel(seatId)}{' '}
                                            <span className="text-xs font-semibold" style={{ fontFamily: 'Futura PT Light, Century Gothic, sans-serif', color: suffixColor }}>{suffix}</span>
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

                                        <div className="mt-4 pt-3 border-t border-gray-200 text-xs text-gray-600 space-y-1">
                                            {tooltipData?.position && (
                                                <div><span className="font-medium">Position: </span>{tooltipData.position}</div>
                                            )}
                                            {tooltipData?.distanceToScreen && (
                                                <div>Distance to Screen: {tooltipData.distanceToScreen}</div>
                                            )}
                                            {tooltipData?.distanceToMLP && (
                                                <div>Distance to RSP: {tooltipData.distanceToMLP}</div>
                                            )}
                                        </div>

                                        {['p1', 'p4', 'p5', 'p6', 'p9', 'p10', 'p16', 'p17', 'p20'].map((key) => {
                                            const metric = getRp22Metric(key);
                                            const paramNum = parseInt(key.substring(1));
                                            return (
                                                <div key={key}>
                                                    <div className="flex items-baseline justify-between">
                                                        <div className="flex items-baseline gap-2">
                                                            <span className="font-normal text-[#3E4349]">P{paramNum}:</span>
                                                            <span className="text-sm font-bold text-[#1B1A1A]">
                                                                {metric ? (metric.formatted || metric.hudLabel || '—') : '—'}
                                                            </span>
                                                        </div>
                                                        <RP22GradingPill
                                                            level={metric ? (typeof metric.level === 'number' ? `L${metric.level}` : (metric.level || '—')) : '—'}
                                                        />
                                                    </div>
                                                    {metric && key === 'p16' && metric.perSpeaker && metric.perSpeaker.length > 0 && (
                                                        <div className="text-[10px] text-gray-500 pl-2 mt-0.5">
                                                            {metric.perSpeaker.map(s =>
                                                                `${s.role} ${Math.floor(s.angleDeg || 0)}° / ${s.lossLabel || '—'}`
                                                            ).join(', ')}
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
                    }).filter(Boolean)}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
                    <SeatComplianceSummary position='left' />
                    <SeatComplianceSummary position='middle' />
                    <SeatComplianceSummary position='right' />
                </div>
            </CardContent>
        </Card>
    );
}