import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import RP22GradingPill from '../ui/RP22GradingPill';

export default function ParameterCard({ parameter, roomResult, seatResults = [], systemConfig = null, p15ConstructionLevel, onP15ConstructionLevelChange }) {
    if (!parameter) return null;

    const hasRoomResult = roomResult && typeof roomResult === 'object';
    const level = hasRoomResult ? (roomResult.level || null) : null;
    const value = hasRoomResult ? roomResult.value : null;
    const formatted = hasRoomResult ? roomResult.formatted : null;
    
    const isSeatScoped = parameter.scope === 'Seat';
    const hasSeatData = Array.isArray(seatResults) && seatResults.length > 0;

    const formatValue = (val) => {
        if (val === null || val === undefined) return '—';
        if (typeof val === 'number' && Number.isFinite(val)) {
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
                    {parameter.id === 15 ? (
                        <>
                            <CardTitle 
                                className="text-sm font-semibold text-[#1B1A1A] leading-snug"
                                style={{ fontFamily: 'Futura PT Light, Century Gothic, sans-serif' }}
                            >
                                P{parameter.id} — Background noise floor<br />
                                with all AV equipment and mechanical systems<br />
                                and building services switched on, at nominal<br />
                                operating temperatures
                            </CardTitle>
                            <p className="text-xs mt-1 text-[#3E4349]">
                                {parameter.scope} • {parameter.unit}
                            </p>
                        </>
                    ) : (
                        <>
                            <CardTitle 
                                className="text-sm font-semibold text-[#1B1A1A]"
                                style={{ fontFamily: 'Futura PT Light, Century Gothic, sans-serif' }}
                            >
                                P{parameter.id} — {parameter.name}
                            </CardTitle>
                            <p className="text-xs mt-1 text-[#3E4349]">
                                {parameter.scope} • {parameter.unit}
                            </p>
                        </>
                    )}
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
                                <div className="text-[13px] space-y-0.5">
                                    <div>Min.</div>
                                    <div>L1: 5</div>
                                    <div>L2: 11</div>
                                    <div>L3: 15</div>
                                    <div>L4: 15</div>
                                    <div>Room</div>
                                </div>
                                <div className="text-[9px] mt-1">
                                    Includes all listener-level and upper discrete processor outputs, though there are multiple combinations of speaker locations possible therein, depending on the room design and characteristics.
                                </div>
                            </div>
                        ) : parameter.id === 3 ? (
                            <div className="text-[10px] text-[#3E4349] leading-relaxed" style={{ marginTop: 0 }}>
                                <div className="mb-1">Number speakers</div>
                                <div className="text-[13px] space-y-0.5">
                                    <div>L1: 0</div>
                                    <div>L2: 0</div>
                                    <div>L3: 0</div>
                                    <div>L4: 0</div>
                                </div>
                                <div className="text-[9px] mt-1">
                                    Speaker locations are not strict angle numbers. They are zones/areas resulting from multiple trade-offs and defining acceptable possible locations for a given screen wall speaker. Defined zones are wide enough to allow some flexibility in speaker locations within the recommended zone.
                                </div>
                            </div>
                        ) : parameter.id === 7 ? (
                            <div className="text-[10px] text-[#3E4349] leading-relaxed" style={{ marginTop: 0 }}>
                                <div className="mb-1">Degrees</div>
                                <div className="mb-1">±</div>
                                <div className="text-[13px] space-y-0.5">
                                    <div>L1: 10°</div>
                                    <div>L2: 7°</div>
                                    <div>L3: 5°</div>
                                    <div>L4: 2°</div>
                                </div>
                                <div className="text-[9px] mt-1">Room</div>
                                <div className="text-[9px] mt-1">
                                    To ensure localisation accuracy, this metric is the maximum horizontal angular deviation allowed from the ideal median angular location for wide front speakers.
                                </div>
                            </div>
                        ) : parameter.id === 8 ? (
                            <div className="text-[10px] text-[#3E4349] leading-relaxed" style={{ marginTop: 0 }}>
                                <div className="mb-1">Yes/No</div>
                                <div className="mb-1">-</div>
                                <div className="text-[13px] space-y-0.5">
                                    <div>L1: Yes</div>
                                    <div>L2: Yes</div>
                                    <div>L3: No</div>
                                    <div>L4: No</div>
                                </div>
                                <div className="text-[9px] mt-1">-</div>
                                <div className="text-[9px] mt-1">
                                    Absent the ability to install top (overhead) speakers, one solution is to employ upfiring/elevation (e.g., "Atmos Enabled") speakers aimed at a reflective ceiling surface to reproduce immersive content and audio objects. These speakers should have a suitable mechanical and electrical design.
                                </div>
                            </div>
                        ) : parameter.id === 11 ? (
                            <div className="text-[10px] text-[#3E4349] leading-relaxed" style={{ marginTop: 0 }}>
                                <div className="mb-1">Number speakers</div>
                                <div className="mb-1">-</div>
                                <div className="text-[13px] space-y-0.5">
                                    <div>L1: N/A</div>
                                    <div>L2: 0</div>
                                    <div>L3: 0</div>
                                    <div>L4: 0</div>
                                </div>
                                <div className="text-[9px] mt-1">Room</div>
                                <div className="text-[9px] mt-1">
                                    Speaker locations are not strict angle numbers; they are designated zones/areas for speaker groups resulting from multiple trade-offs. Zones are broad enough to allow some flexibility in speaker locations.
                                </div>
                            </div>
                        ) : parameter.id === 12 ? (
                            <div className="text-[10px] text-[#3E4349] leading-relaxed" style={{ marginTop: 0 }}>
                                <div className="mb-1">dB SPL (C)</div>
                                <div className="mb-1">-</div>
                                <div className="text-[13px] space-y-0.5">
                                    <div>L1: 102</div>
                                    <div>L2: 105</div>
                                    <div>L3: 108</div>
                                    <div>L4: 111</div>
                                </div>
                                <div className="text-[9px] mt-1">Room</div>
                                <div className="text-[9px] mt-1">
                                    Sound Pressure Level at the Reference Seating Position is the recommended minimum long term SPL according to AES75-2022 or ANSI-CTA-2034-A, Section 8. Consideration should be given to the following: 1. Additional speaker SPL capability at bass frequencies to allow for bass contours 2. Additional speaker SPL capability to allow for +EQ
                                </div>
                            </div>
                        ) : parameter.id === 13 ? (
                            <div className="text-[10px] text-[#3E4349] leading-relaxed" style={{ marginTop: 0 }}>
                                <div className="mb-1">dB SPL (C)</div>
                                <div className="mb-1">-</div>
                                <div className="text-[13px] space-y-0.5">
                                    <div>L1: 99</div>
                                    <div>L2: 102</div>
                                    <div>L3: 105</div>
                                    <div>L4: 108</div>
                                </div>
                                <div className="text-[9px] mt-1">Room</div>
                                <div className="text-[9px] mt-1">
                                    Sound Pressure Level at the Reference Seating Position is the recommended minimum long term SPL according to AES75-2022 or ANSI-CTA-2034-A, Section 8. Consideration should be given to the following:
                                </div>
                                <div className="text-[9px] mt-0.5">
                                    1. Additional speaker SPL capability at bass frequencies to allow for bass contours
                                </div>
                                <div className="text-[9px]">
                                    2. Additional speaker SPL capability to allow for +EQ
                                </div>
                            </div>
                        ) : parameter.id === 15 ? (
                            <div className="text-[10px] text-[#3E4349] leading-relaxed" style={{ marginTop: 0 }}>
                                <div className="mb-2">
                                    <label className="block text-[11px] font-semibold text-[#1B1A1A] mb-1.5">
                                        Expected room noise control (design estimate)
                                    </label>
                                    <select 
                                        className="w-full px-2 py-1.5 text-xs border border-[#DCDBD6] rounded bg-white text-[#1B1A1A]"
                                        value={String(p15ConstructionLevel ?? 'standard')}
                                        onChange={(e) => {
                                            const next = String(e.target.value);
                                            const allowed = new Set(["standard", "purpose-built", "reference", "studio"]);
                                            const safeNext = allowed.has(next) ? next : "standard";
                                            onP15ConstructionLevelChange?.(safeNext);
                                        }}
                                    >
                                        <option value="standard">Standard domestic room</option>
                                        <option value="purpose-built">Purpose-built home cinema</option>
                                        <option value="reference">Reference-grade isolated room</option>
                                        <option value="studio">Studio / screening-room grade</option>
                                    </select>
                                    <div className="text-[9px] text-gray-400 mt-1">Selected key: {p15ConstructionLevel || "standard"}</div>
                                </div>
                                <div className="mb-1 pt-2 border-t border-gray-100">Max. NCB rating</div>
                                <div className="mb-1">Rec.</div>
                                <div className="text-[13px] space-y-0.5">
                                    <div>L1: 26</div>
                                    <div>L2: 22</div>
                                    <div>L3: 18</div>
                                    <div>L4: 15</div>
                                </div>
                                <div className="text-[9px] mt-1">Room</div>
                                <div className="text-[9px] mt-1">
                                    Noise floor indicates the level of general noise in the background — that which is discernible with all systems running (including HVAC) during regular operation of the entertainment space but while no multimedia content is being played (for instance, on pause or menu).
                                </div>
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
                        ) : parameter.id === 8 ? (
                            <div className="flex justify-between items-center">
                                <span 
                                    className="text-sm font-bold"
                                    style={{ color: '#213428' }}
                                >
                                    No
                                </span>
                                {renderLevelBadge('L4')}
                            </div>
                        ) : parameter.id === 11 ? (
                            <div className="flex justify-between items-center">
                                <span 
                                    className="text-sm font-bold"
                                    style={{ color: '#213428' }}
                                >
                                    0
                                </span>
                                {renderLevelBadge('L4')}
                            </div>
                        ) : parameter.id === 12 || parameter.id === 13 || parameter.id === 15 ? (
                            <div className="flex justify-between items-center">
                                <span className="text-sm font-bold text-[#1B1A1A]">
                                    {formatted || formatValue(value)}
                                </span>
                                {renderLevelBadge(level)}
                            </div>
                        ) : hasRoomResult && roomResult.status !== 'no_data' ? (
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-[#1B1A1A] font-bold">
                                    {formatted || formatValue(value)}
                                </span>
                                {renderLevelBadge(level)}
                            </div>
                        ) : (
                            <div className="flex justify-between items-center">
                                <span className="text-xs text-gray-400 italic">—</span>
                                {renderLevelBadge('—')}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </Card>
    );
}