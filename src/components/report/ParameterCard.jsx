import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import RP22GradingPill from '../ui/RP22GradingPill';

export default function ParameterCard({ parameter, roomResult, seatResults = [], systemConfig = null }) {
    if (!parameter) return null;

    const hasRoomResult = roomResult && typeof roomResult === 'object';
    const level = hasRoomResult ? (roomResult.level || null) : null;
    const value = hasRoomResult ? roomResult.value : null;
    const formatted = hasRoomResult ? roomResult.formatted : null;
    
    const isSeatScoped = parameter.scope === 'Seat';
    const hasSeatData = Array.isArray(seatResults) && seatResults.length > 0;

    const formatValue = (val) => {
        if (val === null || val === undefined) return 'N/A';
        if (typeof val === 'number') {
            return parameter.unit ? `${val.toFixed(1)} ${parameter.unit}` : val.toFixed(1);
        }
        return String(val);
    };

    // Level badge helper
    const renderLevelBadge = (lvl) => {
        if (!lvl || lvl === '—') return <Badge variant="outline" className="text-xs">—</Badge>;
        return <RP22GradingPill level={typeof lvl === 'string' ? parseInt(lvl.replace('L', '')) : lvl} />;
    };

    return (
        <Card className="border bg-white border-[#DCDBD6]">
            <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                    <div className="flex-1">
                        <CardTitle 
                            className="text-sm font-semibold text-[#1B1A1A]"
                            style={{ fontFamily: 'Futura PT Light, Century Gothic, sans-serif' }}
                        >
                            P{parameter.id} — {parameter.name}
                        </CardTitle>
                        <p className="text-xs mt-1 text-[#3E4349]">
                            {parameter.scope} • {parameter.unit}
                        </p>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <div 
                    className="space-y-3"
                    style={{ fontFamily: 'Didact Gothic, Century Gothic, sans-serif' }}
                >
                    {/* Room/System Value */}
                    <div className="border-b border-[#E6E4DD] pb-3">
                        <div className="text-xs font-medium text-[#3E4349] mb-2">
                            {isSeatScoped ? 'Overall (Room)' : 'System Metric'}
                        </div>
                        {parameter.id === 2 && systemConfig ? (
                            // P2: Discrete speaker count
                            <div className="space-y-2">
                                <div className="text-[10px] text-[#3E4349] leading-relaxed mb-2" style={{ minHeight: '180px' }}>
                                    <div className="font-semibold mb-1">2. Decoder/renderer capability and discretely rendered speaker configuration, excl. subwoofers</div>
                                    <div className="mb-1">Number discrete speakers</div>
                                    <div className="text-[9px] space-y-0.5">
                                        <div>Min.</div>
                                        <div>Level 1: 5</div>
                                        <div>Level 2: 11</div>
                                        <div>Level 3: 15</div>
                                        <div>Level 4: 15</div>
                                        <div>Room</div>
                                    </div>
                                    <div className="text-[9px] mt-1">
                                        Includes all listener-level and upper discrete processor outputs, though there are multiple combinations of speaker locations possible therein, depending on the room design and characteristics.
                                    </div>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span 
                                        className="text-sm font-bold"
                                        style={{
                                            color: systemConfig.p2Level === 'L4' ? '#213428' :
                                                   systemConfig.p2Level === 'L2' ? '#625143' :
                                                   '#4A230F'
                                        }}
                                    >
                                        {systemConfig.discreteSpeakerCount}
                                    </span>
                                    {renderLevelBadge(systemConfig.p2Level)}
                                </div>
                            </div>
                        ) : parameter.id === 3 ? (
                            // P3: Screen wall speakers outside recommended zones (always L4)
                            <div className="space-y-2">
                                <div className="text-[10px] text-[#3E4349] leading-relaxed mb-2" style={{ minHeight: '180px' }}>
                                    <div className="font-semibold mb-1">3. Number of screen wall speakers allowed outside of recommended zonal locations</div>
                                    <div className="mb-1">Number speakers</div>
                                    <div className="text-[9px] space-y-0.5">
                                        <div>L1: 0</div>
                                        <div>L2: 0</div>
                                        <div>L3: 0</div>
                                        <div>L4: 0</div>
                                    </div>
                                    <div className="text-[9px] mt-1">
                                        Speaker locations are not strict angle numbers. They are zones/areas resulting from multiple trade-offs and defining acceptable possible locations for a given screen wall speaker. Defined zones are wide enough to allow some flexibility in speaker locations within the recommended zone.
                                    </div>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span 
                                        className="text-sm font-bold"
                                        style={{ color: '#213428' }}
                                    >
                                        0
                                    </span>
                                    {renderLevelBadge('L4')}
                                </div>
                            </div>
                        ) : hasRoomResult ? (
                            <div style={{ minHeight: '180px' }} className="flex flex-col justify-end">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-[#213428] font-medium">
                                        {formatted || formatValue(value)}
                                    </span>
                                    {renderLevelBadge(level)}
                                </div>
                            </div>
                        ) : (
                            <div style={{ minHeight: '180px' }} className="flex items-end">
                                <span className="text-xs text-gray-400 italic">No data yet</span>
                            </div>
                        )}
                    </div>

                    {/* Per-Seat Data (for seat-scoped parameters) */}
                    {isSeatScoped && (
                        <div>
                            <div className="text-xs font-medium text-[#3E4349] mb-2">
                                Per-Seat Values
                            </div>
                            {hasSeatData ? (
                                <div className="max-h-40 overflow-y-auto border border-[#E6E4DD] rounded">
                                    <table className="w-full text-xs">
                                        <thead className="bg-[#F8F8F7] sticky top-0">
                                            <tr>
                                                <th className="text-left px-2 py-1 text-[#3E4349]">Seat</th>
                                                <th className="text-right px-2 py-1 text-[#3E4349]">Value</th>
                                                <th className="text-right px-2 py-1 text-[#3E4349]">Level</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {seatResults.map(({ seatId, isPrimary, metric }) => (
                                                <tr key={seatId} className="border-t border-[#E6E4DD]">
                                                    <td className="px-2 py-1 text-[#1B1A1A]">
                                                        {seatId} {isPrimary ? '(MLP)' : ''}
                                                    </td>
                                                    <td className="px-2 py-1 text-right text-[#213428]">
                                                        {metric.formatted || formatValue(metric.value)}
                                                    </td>
                                                    <td className="px-2 py-1 text-right">
                                                        {renderLevelBadge(metric.level)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <span className="text-xs text-gray-400 italic">
                                    Per-seat metrics not implemented yet
                                </span>
                            )}
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}