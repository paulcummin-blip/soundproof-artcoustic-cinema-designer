import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-white/80 backdrop-blur-sm p-3 border border-[#DCDBD6] rounded-lg shadow-lg font-body">
                <p className="font-bold text-[#1B1A1A]">{`${label.toFixed(1)} Hz`}</p>
                <p className="text-[#213428]">{`SPL: ${payload[0].value.toFixed(1)} dB`}</p>
            </div>
        );
    }
    return null;
};

export default function BassGraph({ 
  responseData, 
  schroederFrequency, 
  rp22Levels, 
  toggles, 
  crossoverFrequency = 80,
  modeFrequencies = [],
  showModeMarkers = false,
  modeMarkers = [],
  linearHzAxis = false,
  rewStyleMode = false
}) {
    // Clamp and sanitize data for REW mode (prevent crazy Y-axis values)
    let data = toggles.smoothing
        ? responseData // Placeholder for actual smoothing logic
        : responseData;
    
    if (rewStyleMode && data.length > 0) {
        data = data.map(point => {
            let spl = point.spl;
            // Guard against non-finite values
            if (!isFinite(spl)) {
                spl = 0;
            }
            // Clamp to reasonable relative range
            spl = Math.max(-40, Math.min(20, spl));
            return { ...point, spl };
        });
    }

    // Render mode markers if enabled
    const renderModeMarkers = () => {
        if (!showModeMarkers || modeMarkers.length === 0) return null;
        
        return modeMarkers.map((marker, i) => {
            // Different stroke styles for each family
            let strokeDasharray = '1 0'; // solid for axial
            let opacity = 0.3;
            
            if (marker.family === 'tangential') {
                strokeDasharray = '4 2'; // dashed
                opacity = 0.2;
            } else if (marker.family === 'oblique') {
                strokeDasharray = '2 2'; // dotted
                opacity = 0.15;
            }
            
            return (
                <ReferenceLine 
                    key={`mode-${i}`}
                    x={marker.fHz}
                    stroke="#213428"
                    strokeWidth={1}
                    strokeDasharray={strokeDasharray}
                    opacity={opacity}
                />
            );
        });
    };

    return (
        <div className="w-full h-[400px]">
            <ResponsiveContainer>
                <LineChart data={data} margin={{ top: 30, right: 50, left: 20, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#DCDBD6" />
                    <XAxis
                        dataKey="frequency"
                        type="number"
                        domain={['dataMin', 'dataMax']}
                        scale={linearHzAxis ? "linear" : "log"}
                        tickFormatter={(tick) => Number(tick).toFixed(0)}
                        label={{ value: "Frequency (Hz)", position: 'insideBottom', offset: -10, className: 'font-body text-[#3E4349]' }}
                        className="font-body text-xs"
                        tick={{ fill: '#3E4349' }}
                    />
                    <YAxis
                        domain={rewStyleMode ? [-40, 20] : ['dataMin - 5', 'dataMax + 5']}
                        tickFormatter={(tick) => Number(tick).toFixed(0)}
                        label={{ value: rewStyleMode ? 'Relative (dB)' : 'SPL (dB)', angle: -90, position: 'insideLeft', className: 'font-body text-[#3E4349]' }}
                        className="font-body text-xs"
                        tick={{ fill: '#3E4349' }}
                    />
                    <Tooltip content={<CustomTooltip />} />

                    {rp22Levels.map(level => (
                        <ReferenceLine 
                            key={level.level} 
                            y={level.spl} 
                            label={{ 
                                value: level.level, 
                                position: 'right', 
                                fill: level.color, 
                                className: 'font-body text-xs',
                                offset: 5
                            }} 
                            stroke={level.color} 
                            strokeDasharray="2 2" 
                        />
                    ))}
                    
                    {schroederFrequency > 0 && (
                        <ReferenceLine 
                            x={schroederFrequency} 
                            stroke="#4A230F" 
                            strokeDasharray="4 4" 
                            label={{ 
                                value: 'Schroeder', 
                                position: 'insideTopRight', 
                                fill: '#4A230F', 
                                className: 'font-body text-xs',
                                offset: 10,
                                style: { textAnchor: 'end' }
                            }} 
                        />
                    )}

                    {/* REW-style mode markers */}
                    {renderModeMarkers()}
                    
                    {/* Legacy mode markers (non-REW) */}
                    {!rewStyleMode && showModeMarkers && modeFrequencies.map((freq, i) => (
                      <ReferenceLine 
                        key={`mode-${i}`}
                        x={freq} 
                        stroke="#DCDBD6" 
                        strokeWidth={1}
                        strokeDasharray="1 2"
                      />
                    ))}

                    <Line type="monotone" dataKey="spl" stroke="#213428" strokeWidth={2} dot={false} />
                    
                    {/* Mode line legend (REW style) */}
                    {showModeMarkers && modeMarkers.length > 0 && (
                        <text x={60} y={20} fontSize={10} fill="#3E4349" className="font-body">
                            Mode lines: Axial (—) / Tangential (- -) / Oblique (···)
                        </text>
                    )}
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}