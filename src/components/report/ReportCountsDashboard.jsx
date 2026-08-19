import React from 'react';
import { Home, User } from 'lucide-react';
import RP22GradingPill from '../ui/RP22GradingPill';

export default function ReportCountsDashboard({
    roomLevelCounts,
    seatCountsByRow,
    analysisResult,
    totalRoomParameters,
    totalSeatParameters,
}) {
    return (
        <div className="report-counts-dashboard flex flex-col gap-4 mt-4 w-full break-inside-avoid-page page-break-inside-avoid">
            {/* Left: Room count box */}
            <div>
                <div className="flex items-center gap-2 mb-3">
                    <Home className="w-4 h-4 text-[#213428]" />
                    <div className="text-sm font-semibold text-[#1B1A1A]" style={{ fontFamily: 'Futura PT Light, Century Gothic, sans-serif' }}>
                        Room parameters
                    </div>
                    <span className="text-sm text-gray-500">({totalRoomParameters})</span>
                </div>
                <div className="border-2 border-[#213428] rounded-lg px-4 py-4 bg-white w-full max-w-[360px] min-h-[96px] flex flex-col justify-center break-inside-avoid-page page-break-inside-avoid">
                    <div className="flex justify-center items-center mt-1 px-1">
                        {(() => {
                            const l4 = Number(roomLevelCounts?.L4 ?? 0);
                            const l3 = Number(roomLevelCounts?.L3 ?? 0);
                            const l2 = Number(roomLevelCounts?.L2 ?? 0);
                            const l1 = Number(roomLevelCounts?.L1 ?? 0);
                            const maxRoom = Math.max(l4, l3, l2, l1);
                            const isMax = (v) => v === maxRoom;

                            return (
                                <div className="flex gap-3 items-center justify-center">
                                    <div style={{ transform: isMax(l4) ? 'scale(1.25)' : 'scale(1)', transformOrigin: 'center' }}>
                                        <RP22GradingPill level="L4" count={l4} />
                                    </div>
                                    <div style={{ transform: isMax(l3) ? 'scale(1.25)' : 'scale(1)', transformOrigin: 'center' }}>
                                        <RP22GradingPill level="L3" count={l3} />
                                    </div>
                                    <div style={{ transform: isMax(l2) ? 'scale(1.25)' : 'scale(1)', transformOrigin: 'center' }}>
                                        <RP22GradingPill level="L2" count={l2} />
                                    </div>
                                    <div style={{ transform: isMax(l1) ? 'scale(1.25)' : 'scale(1)', transformOrigin: 'center' }}>
                                        <RP22GradingPill level="L1" count={l1} />
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                </div>
            </div>

            {/* Right: Seat parameters section — no L-level aggregation */}
            <div className="w-full">
                <div className="flex items-center gap-2 mb-3">
                    <User className="w-4 h-4 text-[#213428]" />
                    <div className="text-sm font-semibold text-[#1B1A1A]" style={{ fontFamily: 'Futura PT Light, Century Gothic, sans-serif' }}>
                        Seat Results
                    </div>
                </div>
                {(() => {
                    const allSeats = (seatCountsByRow || []).flatMap(r => r.seats || []);
                    const seatsEvaluated = allSeats.length;
                    const calculatedParams = allSeats.reduce((max, s) => Math.max(max, s.activeCount ?? 0), 0);
                    return (
                        <div className="border-2 border-[#213428] rounded-lg px-4 py-4 bg-white w-full max-w-[360px] min-h-[96px] flex flex-col justify-center break-inside-avoid-page page-break-inside-avoid">
                            <div className="flex flex-col gap-2">
                                <div className="text-sm text-[#1B1A1A]">
                                    <span className="text-[#625143]">Calculated parameters: </span>
                                    <span className="font-semibold">{calculatedParams}</span>
                                </div>
                                <div className="text-sm text-[#1B1A1A]">
                                    <span className="text-[#625143]">Seats evaluated: </span>
                                    <span className="font-semibold">{seatsEvaluated}</span>
                                </div>
                            </div>
                        </div>
                    );
                })()}
            </div>
        </div>
    );
}