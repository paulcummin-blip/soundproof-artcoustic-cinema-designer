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
  rewStyleMode = false,
  yDomain,
  showAxialOnly = false
}) {
    // In REW mode, use data as-is (no baseline subtraction or normalization)
    let data = responseData;
    
    // Filter mode markers to axial only when requested (visual only, calculation unchanged)
    const drawnModeMarkers = React.useMemo(() => {
        if (!modeMarkers || modeMarkers.length === 0) return [];
        if (showAxialOnly) {
            return modeMarkers.filter(m => m.family === 'axial');
        }
        return modeMarkers;
    }, [modeMarkers, showAxialOnly]);

    // Determine Y-axis domain
    let calculatedYMin, calculatedYMax;
    let calculatedXMax = 200;

    if (yDomain && yDomain.min !== undefined && yDomain.max !== undefined) {
      // Use provided fixed domain
      calculatedYMin = yDomain.min;
      calculatedYMax = yDomain.max;
    } else if (rewStyleMode && data.length > 0) {
      // REW-style auto-windowing when no fixed domain
      const validSpl = data.map(p => p.spl).filter(v => Number.isFinite(v));
      if (validSpl.length > 0) {
        const dataMin = Math.min(...validSpl);
        const dataMax = Math.max(...validSpl);
        const dataMean = validSpl.reduce((a, b) => a + b, 0) / validSpl.length;
        
        calculatedYMin = Math.max(dataMax - 45, dataMin - 5, 40);
        calculatedYMax = Math.min(dataMax + 5, dataMean + 30, 120);
      }
    } else if (rewStyleMode) {
      // Default REW-like range when no data
      calculatedYMin = 60;
      calculatedYMax = 110;
    }

    // Smart X-axis for REW mode
    if (rewStyleMode && schroederFrequency > 0) {
      calculatedXMax = Math.max(120, Math.min(200, schroederFrequency * 1.2));
    }

    // Render mode markers if enabled (axial only for visual clarity)
    const renderModeMarkers = () => {
        if (!showModeMarkers || drawnModeMarkers.length === 0) return null;

        // In REW mode, only show axial markers
        const markersToRender = rewStyleMode 
          ? drawnModeMarkers.filter(m => m.family === 'axial')
          : drawnModeMarkers;

        return markersToRender.map((marker, i) => {
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
            {rewStyleMode && (
                <div className="text-[10px] text-gray-500 mb-1">
                    X-axis scale: {linearHzAxis ? 'LINEAR' : 'LOG'}
                </div>
            )}
            <ResponsiveContainer>
                <LineChart data={data} margin={{ top: 30, right: 50, left: 20, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#DCDBD6" />
                    <XAxis
                        dataKey="frequency"
                        type="number"
                        domain={rewStyleMode ? [20, calculatedXMax] : ['dataMin', 'dataMax']}
                        scale={linearHzAxis ? "linear" : "log"}
                        ticks={linearHzAxis ? undefined : [20, 30, 40, 50, 60, 70, 80, 100, 120, 150, 200]}
                        tickFormatter={(tick) => Number(tick).toFixed(0)}
                        label={{ value: "Frequency (Hz)", position: 'insideBottom', offset: -10, className: 'font-body text-[#3E4349]' }}
                        className="font-body text-xs"
                        tick={{ fill: '#3E4349' }}
                    />
                    <YAxis
                        domain={calculatedYMin !== undefined && calculatedYMax !== undefined ? [calculatedYMin, calculatedYMax] : ['dataMin - 5', 'dataMax + 5']}
                        tickFormatter={(tick) => Number(tick).toFixed(0)}
                        label={{ value: rewStyleMode ? 'Relative (dB)' : 'SPL (dB)', angle: -90, position: 'insideLeft', className: 'font-body text-[#3E4349]' }}
                        className="font-body text-xs"
                        tick={{ fill: '#3E4349' }}
                    />
                    <Tooltip content={<CustomTooltip />} />

                    {rewStyleMode && rp22Levels.map(level => (
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
                    {showModeMarkers && drawnModeMarkers.length > 0 && (
                        <text x={60} y={20} fontSize={10} fill="#3E4349" className="font-body">
                            Mode lines: Axial (—)
                        </text>
                    )}
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}