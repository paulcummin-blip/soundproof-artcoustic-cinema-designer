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
  modeMarkers = { axial: [], tangential: [], oblique: [] },
  linearHzAxis = false,
  rewStyleMode = false,
  yDomain,
  showAxialOnly = false,
  refDb = 85
}) {
    // In REW mode, use data as-is (no baseline subtraction or normalization)
    let data = responseData;
    
    // Build chart data with red/black split at refDb ± 6 dB (with threshold-crossing interpolation)
    const chartData = React.useMemo(() => {
        if (!data || data.length === 0) return [];

        const LOWER = refDb - 6;
        const UPPER = refDb + 6;

        const rows = [];
        
        // Helper: push two rows at crossing point (finish old color, start new color)
        const pushCross = (crossFreq, thr, prevInside, currInside) => {
            if (prevInside && !currInside) {
                // black → red
                rows.push({ frequency: crossFreq, spl: thr, splGood: thr, splBad: null });
                rows.push({ frequency: crossFreq, spl: thr, splGood: null, splBad: thr });
            } else if (!prevInside && currInside) {
                // red → black
                rows.push({ frequency: crossFreq, spl: thr, splGood: null, splBad: thr });
                rows.push({ frequency: crossFreq, spl: thr, splGood: thr, splBad: null });
            }
        };
        
        for (let i = 0; i < data.length; i++) {
            const curr = data[i];
            const currSpl = curr.spl;
            const currFreq = curr.frequency;
            
            // Check if current point is inside or outside band
            const currInside = Number.isFinite(currSpl) && currSpl >= LOWER && currSpl <= UPPER;
            
            // If this is not the first point, check for threshold crossings
            if (i > 0) {
                const prev = data[i - 1];
                const prevSpl = prev.spl;
                const prevFreq = prev.frequency;
                const prevInside = Number.isFinite(prevSpl) && prevSpl >= LOWER && prevSpl <= UPPER;
                
                // Detect crossing and insert interpolated points
                if (Number.isFinite(prevSpl) && Number.isFinite(currSpl) && prevInside !== currInside) {
                    const crossings = [];
                    
                    // Check for lower threshold crossing
                    if ((prevSpl >= LOWER && currSpl < LOWER) || (prevSpl < LOWER && currSpl >= LOWER)) {
                        const t = (LOWER - prevSpl) / (currSpl - prevSpl);
                        crossings.push({ thr: LOWER, t });
                    }
                    
                    // Check for upper threshold crossing
                    if ((prevSpl <= UPPER && currSpl > UPPER) || (prevSpl > UPPER && currSpl <= UPPER)) {
                        const t = (UPPER - prevSpl) / (currSpl - prevSpl);
                        crossings.push({ thr: UPPER, t });
                    }
                    
                    // Sort crossings by t and insert in order
                    crossings
                        .filter(c => Number.isFinite(c.t) && c.t > 0 && c.t < 1)
                        .sort((a, b) => a.t - b.t)
                        .forEach(c => {
                            const crossFreq = prevFreq + c.t * (currFreq - prevFreq);
                            pushCross(crossFreq, c.thr, prevInside, currInside);
                        });
                }
            }
            
            // Add current point with strict good/bad assignment
            rows.push({
                frequency: currFreq,
                spl: currSpl,
                splGood: currInside ? currSpl : null,
                splBad: currInside ? null : currSpl
            });
        }

        return rows;
    }, [data, refDb]);
    
    // Normalize modeMarkers input (support both old array format and new grouped format)
    const normalizedMarkers = React.useMemo(() => {
        if (!modeMarkers) return { axial: [], tangential: [], oblique: [] };
        
        // New format: already grouped
        if (modeMarkers.axial || modeMarkers.tangential || modeMarkers.oblique) {
            return {
                axial: modeMarkers.axial || [],
                tangential: modeMarkers.tangential || [],
                oblique: modeMarkers.oblique || []
            };
        }
        
        // Old format: array of markers
        if (Array.isArray(modeMarkers)) {
            return {
                axial: modeMarkers.filter(m => m.family === 'axial'),
                tangential: modeMarkers.filter(m => m.family === 'tangential'),
                oblique: modeMarkers.filter(m => m.family === 'oblique')
            };
        }
        
        return { axial: [], tangential: [], oblique: [] };
    }, [modeMarkers]);

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

    // Render mode markers with hover tooltips (REW parity overlay)
    const renderModeMarkers = () => {
        if (!showModeMarkers) return null;

        const hasMarkers = normalizedMarkers.axial.length > 0 || 
                          normalizedMarkers.tangential.length > 0 || 
                          normalizedMarkers.oblique.length > 0;
        
        if (!hasMarkers) return null;

        return (
            <>
                {/* Axial modes (stronger style) */}
                {normalizedMarkers.axial.map((marker, i) => {
                    const modeStr = `(${marker.n[0]},${marker.n[1]},${marker.n[2]})`;
                    const label = marker.axisLabel 
                        ? `axial [${marker.axisLabel}] ${modeStr} ${marker.fHz.toFixed(1)} Hz`
                        : `axial ${modeStr} ${marker.fHz.toFixed(1)} Hz`;
                    
                    return (
                        <ReferenceLine 
                            key={`mode-axial-${i}`}
                            x={marker.fHz}
                            stroke="#8B7F76"
                            strokeWidth={1.5}
                            strokeDasharray="3 3"
                            opacity={0.7}
                        >
                            <title>{label}</title>
                        </ReferenceLine>
                    );
                })}
                
                {/* Tangential modes (lighter style) */}
                {normalizedMarkers.tangential.map((marker, i) => {
                    const modeStr = `(${marker.n[0]},${marker.n[1]},${marker.n[2]})`;
                    const label = `tangential ${modeStr} ${marker.fHz.toFixed(1)} Hz`;
                    
                    return (
                        <ReferenceLine 
                            key={`mode-tangential-${i}`}
                            x={marker.fHz}
                            stroke="#C1B6AD"
                            strokeWidth={1.0}
                            strokeDasharray="2 2"
                            opacity={0.4}
                        >
                            <title>{label}</title>
                        </ReferenceLine>
                    );
                })}
                
                {/* Oblique modes (lightest style) */}
                {normalizedMarkers.oblique.map((marker, i) => {
                    const modeStr = `(${marker.n[0]},${marker.n[1]},${marker.n[2]})`;
                    const label = `oblique ${modeStr} ${marker.fHz.toFixed(1)} Hz`;
                    
                    return (
                        <ReferenceLine 
                            key={`mode-oblique-${i}`}
                            x={marker.fHz}
                            stroke="#DCDBD6"
                            strokeWidth={0.8}
                            strokeDasharray="1 1"
                            opacity={0.3}
                        >
                            <title>{label}</title>
                        </ReferenceLine>
                    );
                })}
            </>
        );
    };

    return (
        <div className="w-full h-[400px]">
            {rewStyleMode && (
                <div className="text-[10px] text-gray-500 mb-1">
                    X-axis scale: {linearHzAxis ? 'LINEAR' : 'LOG'}
                </div>
            )}
            <ResponsiveContainer>
                <LineChart data={chartData} margin={{ top: 30, right: 50, left: 20, bottom: 30 }}>
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
                        label={{ value: 'SPL (dB)', angle: -90, position: 'insideLeft', className: 'font-body text-[#3E4349]' }}
                        className="font-body text-xs"
                        tick={{ fill: '#3E4349' }}
                    />
                    <Tooltip content={<CustomTooltip />} shared={false} cursor={false} />

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
                    
                    {/* Schroeder frequency line (always visible when > 0) */}
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

                    {/* Reference Line (Always Visible) */}
                    <ReferenceLine 
                        y={refDb} 
                        stroke="#2563eb" 
                        strokeWidth={1.5}
                        strokeDasharray="4 4"
                        label={{ 
                          value: `${refDb} dB Reference`, 
                          position: 'right', 
                          fill: '#2563eb', 
                          className: 'font-body text-xs',
                          offset: 5
                        }} 
                      />

                    {/* Black curve (inside limits: refDb ± 6 dB) */}
                    <Line 
                        type="linear" 
                        dataKey="splGood"
                        stroke="#213428" 
                        strokeWidth={2} 
                        dot={false}
                        activeDot={false}
                        connectNulls={false}
                        isAnimationActive={false}
                    />

                    {/* Red curve (outside limits: > refDb+6 or < refDb-6) */}
                    <Line 
                        type="linear" 
                        dataKey="splBad"
                        stroke="#dc2626" 
                        strokeWidth={2} 
                        dot={false}
                        activeDot={false}
                        connectNulls={false}
                        isAnimationActive={false}
                    />
                    
                    {/* Mode line legend (REW style) */}
                    {showModeMarkers && (normalizedMarkers.axial.length > 0 || normalizedMarkers.tangential.length > 0 || normalizedMarkers.oblique.length > 0) && (
                        <text x={60} y={20} fontSize={10} fill="#3E4349" className="font-body">
                            Modes: Axial (━━) Tangential (- -) Oblique (···)
                        </text>
                    )}
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}