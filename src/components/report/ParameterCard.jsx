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
        if (!lvl || lvl === '—') return <RP22GradingPill level="—" />;
        return <RP22GradingPill level={lvl || '—'} />;
    };

    return (
        <Card className="border bg-white border-[#DCDBD6] h-full">
            <div style={{ 
                display: 'grid', 
                gridTemplateRows: '120px 60px 1fr', 
                height: '100%',
                fontFamily: 'Didact Gothic, Century Gothic, sans-serif'
            }}>
                {/* ROW 1: Header (fixed 120px) */}
                <div className="px-6 pt-6 overflow-hidden">
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
                
                {/* ROW 2: Metric Label + Divider (fixed 60px) */}
                <div className="px-6 flex flex-col justify-center">
                    <div className="text-xs font-medium text-[#3E4349] mb-2">
                        {isSeatScoped ? 'Overall (Room)' : 'System Metric'}
                    </div>
                    <div className="border-t border-[#E6E4DD]"></div>
                </div>
                
                {/* ROW 3: Content + Result (flexible, result pinned to bottom) */}
                <div className="px-6 pb-6 flex flex-col" style={{ height: '100%' }}>
                    {/* BodyTop: Detail content (fixed start point) */}
                    <div style={{ paddingTop: '12px' }}>
                        {parameter.id === 2 && systemConfig ? (
                            <div className="text-[10px] text-[#3E4349] leading-relaxed" style={{ marginTop: 0 }}>
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
                        ) : parameter.id === 3 ? (
                            <div className="text-[10px] text-[#3E4349] leading-relaxed" style={{ marginTop: 0 }}>
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
                        ) : parameter.id === 7 && systemConfig ? (
                            <div className="text-[10px] text-[#3E4349] leading-relaxed" style={{ marginTop: 0 }}>
                                <div className="mb-1">Maximum deviation</div>
                                <div className="text-[9px] space-y-0.5">
                                    <div>L4: ≤ 2°</div>
                                    <div>L3: ≤ 5°</div>
                                    <div>L2: ≤ 7°</div>
                                    <div>L1: ≤ 10°</div>
                                </div>
                                <div className="text-[9px] mt-1">
                                    {systemConfig.status === 'disabled' 
                                        ? 'Front wides not enabled in current layout.'
                                        : 'Measured as maximum angular deviation of LW/RW from the median angle between wide speakers, as viewed from MLP.'}
                                </div>
                                
                                {/* Debug output */}
                                {systemConfig.debug && (
                                    <div className="text-[9px] mt-2 p-2 bg-gray-50 rounded border border-gray-200 font-mono">
                                        <div>hasWides: {systemConfig.debug.hasWides ? 'true' : 'false'}</div>
                                        <div>mlp: {systemConfig.debug.mlp ? `(${systemConfig.debug.mlp.x.toFixed(2)}, ${systemConfig.debug.mlp.y.toFixed(2)})` : '—'}</div>
                                        <div>medianAz: {systemConfig.debug.medianAzDeg !== null ? `${systemConfig.debug.medianAzDeg}°` : '—'}</div>
                                        <div>lwAz: {systemConfig.debug.lwAzDeg !== null ? `${systemConfig.debug.lwAzDeg}°` : '—'}</div>
                                        <div>rwAz: {systemConfig.debug.rwAzDeg !== null ? `${systemConfig.debug.rwAzDeg}°` : '—'}</div>
                                        <div>lwDev: {systemConfig.debug.lwDevDeg !== null ? `${systemConfig.debug.lwDevDeg}°` : '—'}</div>
                                        <div>rwDev: {systemConfig.debug.rwDevDeg !== null ? `${systemConfig.debug.rwDevDeg}°` : '—'}</div>
                                        <div>maxDev: {systemConfig.debug.maxDevDeg !== null ? `${systemConfig.debug.maxDevDeg}°` : '—'}</div>
                                    </div>
                                )}
                            </div>
                        ) : null}
                    </div>
                    
                    {/* BodyBottom: Result row (pinned to bottom) */}
                    <div style={{ marginTop: 'auto', paddingTop: '12px' }}>
                        {parameter.id === 2 && systemConfig ? (
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
                        ) : parameter.id === 3 ? (
                            <div className="flex justify-between items-center">
                                <span 
                                    className="text-sm font-bold"
                                    style={{ color: '#213428' }}
                                >
                                    0
                                </span>
                                {renderLevelBadge('L4')}
                            </div>
                        ) : parameter.id === 7 && systemConfig ? (
                            <div className="flex justify-between items-center">
                                <span 
                                    className="text-sm font-bold"
                                    style={{
                                        color: systemConfig.level === 'L4' ? '#213428' :
                                               systemConfig.level === 'L3' ? '#3E4349' :
                                               systemConfig.level === 'L2' ? '#625143' :
                                               systemConfig.level === 'L1' ? '#4A230F' :
                                               '#000000'
                                    }}
                                >
                                    {systemConfig.displayValue}
                                </span>
                                {renderLevelBadge(systemConfig.level)}
                            </div>
                        ) : hasRoomResult ? (
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-[#213428] font-medium">
                                    {formatted || formatValue(value)}
                                </span>
                                {renderLevelBadge(level)}
                            </div>
                        ) : (
                            <span className="text-xs text-gray-400 italic">No data yet</span>
                        )}
                    </div>
                </div>
            </div>
        </Card>
    );
}