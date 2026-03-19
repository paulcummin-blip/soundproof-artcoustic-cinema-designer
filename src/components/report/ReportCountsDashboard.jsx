import React from 'react';
import { Home, User } from 'lucide-react';
import RP22GradingPill from '../ui/RP22GradingPill';
import { formatSeatLabel } from '../utils/seatLabel';

export default function ReportCountsDashboard({
    roomLevelCounts,
    seatCountsByRow,
    analysisResult,
    totalRoomParameters,
    totalSeatParameters,
}) {
    return (
        <div className="grid grid-cols-[auto_1fr] gap-10 items-start mt-8">
            {/* Left: Room count box */}
            <div className="justify-self-start">
                <div className="flex items-center gap-2 mb-3">
                    <Home className="w-4 h-4 text-[#213428]" />
                    <div className="text-sm font-semibold text-[#1B1A1A]" style={{ fontFamily: 'Futura PT Light, Century Gothic, sans-serif' }}>
                        Room parameters
                    </div>
                    <span className="text-sm text-gray-500">({totalRoomParameters})</span>
                </div>
                <div className="border-2 border-[#213428] rounded-lg px-5 py-4 bg-white w-[340px] min-h-[100px] flex flex-col justify-center">
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

            {/* Right: Seat parameters section */}
            <div className="justify-self-end">
                <div className="flex items-center gap-2 mb-3">
                    <User className="w-4 h-4 text-[#213428]" />
                    <div className="text-sm font-semibold text-[#1B1A1A]" style={{ fontFamily: 'Futura PT Light, Century Gothic, sans-serif' }}>
                        Seat parameters
                    </div>
                    <span className="text-sm text-gray-500">({totalSeatParameters})</span>
                </div>

                <div className="flex gap-4">
                    {seatCountsByRow.map(({ rowNum, seats }) => (
                        <div key={rowNum} className="flex flex-col gap-4">
                            {seats.map(({ seatId, counts, activeCount, failCount }) => { // activeCount and failCount are siblings of counts
                                const isPrimary = analysisResult?.perSeatRp22?.[seatId]?.isPrimary === true;
                                return (
                                    <div
                                        key={seatId}
                                        className={`rounded-lg px-5 py-4 bg-white w-[340px] min-h-[100px] flex flex-col justify-center ${
                                            isPrimary ? 'border-[3px] border-[#213428]' : 'border-2 border-[#213428]'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between gap-2 mb-2">
                                            <div className="text-sm font-semibold text-[#1B1A1A]" style={{ fontFamily: 'Futura PT Light, Century Gothic, sans-serif' }}>
                                                {formatSeatLabel(seatId)}
                                            </div>
                                            <div className="flex items-center gap-3 text-xs text-[#625143]">
                                                <span>Active: {activeCount ?? 0}</span>
                                                {(failCount ?? 0) > 0 && (
                                                    <span className="font-semibold text-[#8B2500]">Fail: {failCount}</span>
                                                )}
                                            </div>
                                        </div>
                                        <div style={{
                                            marginTop: 6,
                                            marginBottom: 8,
                                            padding: '6px 8px',
                                            background: '#FFF3CD',
                                            border: '1px solid #D6B656',
                                            borderRadius: 6,
                                            fontSize: 12,
                                            fontFamily: 'monospace',
                                            color: '#5C4400'
                                        }}>
                                            DEBUG seatId:{seatId} A:{activeCount ?? 'X'} F:{failCount ?? 'X'} L4:{counts?.L4 ?? 'X'} L3:{counts?.L3 ?? 'X'} L2:{counts?.L2 ?? 'X'} L1:{counts?.L1 ?? 'X'}
                                        </div>
                                        {(() => {
                                            const maxSeat = Math.max(
                                                Number(counts?.L4 ?? 0),
                                                Number(counts?.L3 ?? 0),
                                                Number(counts?.L2 ?? 0),
                                                Number(counts?.L1 ?? 0)
                                            );
                                            const seatIsMax = (k) => Number(counts?.[k] ?? 0) === maxSeat;
                                            return (
                                                <div className="flex justify-center items-center gap-3 mt-1 px-1">
                                                    <div style={{ transform: seatIsMax('L4') ? 'scale(1.25)' : 'none', transformOrigin: 'center' }}>
                                                        <RP22GradingPill level="L4" count={counts.L4} />
                                                    </div>
                                                    <div style={{ transform: seatIsMax('L3') ? 'scale(1.25)' : 'none', transformOrigin: 'center' }}>
                                                        <RP22GradingPill level="L3" count={counts.L3} />
                                                    </div>
                                                    <div style={{ transform: seatIsMax('L2') ? 'scale(1.25)' : 'none', transformOrigin: 'center' }}>
                                                        <RP22GradingPill level="L2" count={counts.L2} />
                                                    </div>
                                                    <div style={{ transform: seatIsMax('L1') ? 'scale(1.25)' : 'none', transformOrigin: 'center' }}>
                                                        <RP22GradingPill level="L1" count={counts.L1} />
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}