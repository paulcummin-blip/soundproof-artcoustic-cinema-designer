import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        const freqDisplay = Number.isFinite(Number(label)) ? `${Number(label).toFixed(1)} Hz` : String(label);
        const splValue = payload[0]?.value;
        const splDisplay = Number.isFinite(Number(splValue)) ? `${Number(splValue).toFixed(1)} dB` : 'N/A';
        
        return (
            <div className="bg-white/80 backdrop-blur-sm p-3 border border-[#DCDBD6] rounded-lg shadow-lg font-body">
                <p className="font-bold text-[#1B1A1A]">{freqDisplay}</p>
                <p className="text-[#213428]">{`SPL: ${splDisplay}`}</p>
            </div>
        );
    }
    return null;
};

// REW mode plot range debug (proof we're plotting the right numbers)
const RewPlotRangeDebug = ({ chartData }) => {
  const finite = chartData.map(p => p?.spl).filter(v => Number.isFinite(Number(v)));
  if (finite.length === 0) return null;
  
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  
  return (
    <div className="text-[9px] text-gray-500 mb-1">
      Plot min/max: {Number.isFinite(min) ? min.toFixed(2) : 'N/A'} / {Number.isFinite(max) ? max.toFixed(2) : 'N/A'} dB
    </div>
  );
};

export default function BassGraph({ 
  responseData, 
  schroederFrequency = 0, 
  rp22Levels = [], 
  toggles = {}, 
  crossoverFrequency = 80,
  modeFrequencies = [],
  showModeMarkers = false,
  modeMarkers = { axial: [], tangential: [], oblique: [] },
  linearHzAxis = false,
  rewStyleMode = false,
  yDomain,
  yMin,
  yMax,
  showAxialOnly = false,
  refDb = 85,
  disableHighlight = false
}) {
    let data = responseData;
    
    // Build chart data: REW mode = one true series (ZERO processing), non-REW = good/bad split
    const chartData = React.useMemo(() => {
      if (!data || data.length === 0) return [];

      const sorted = [...data].sort((a, b) => (a.frequency ?? 0) - (b.frequency ?? 0));

      // REW mode: plot true values with ZERO processing (no windowing, no splitting, no clamping)
      if (rewStyleMode) {
        return sorted.map(d => ({
          frequency: d.frequency,
          spl: d.spl // Raw value from engine (can be null/undefined/non-finite)
        }));
      }

      // Non-REW mode: use good/bad splitting
      const LOWER = refDb - 6;
      const UPPER = refDb + 6;

      const rows = [];

      const isInside = (v) => Number.isFinite(v) && v >= LOWER && v <= UPPER;

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

      for (let i = 0; i < sorted.length; i++) {
        const curr = sorted[i];
        const currFreq = curr.frequency;
        const currSpl = curr.spl;

        if (!Number.isFinite(currFreq)) continue;

        // If highlight disabled: always black
        if (disableHighlight) {
          rows.push({
            frequency: currFreq,
            spl: Number.isFinite(currSpl) ? currSpl : null,
            splGood: Number.isFinite(currSpl) ? currSpl : null,
            splBad: null
          });
          continue;
        }

        const currInside = isInside(currSpl);

        if (i > 0) {
          const prev = sorted[i - 1];
          const prevFreq = prev.frequency;
          const prevSpl = prev.spl;
          const prevInside = isInside(prevSpl);

          if (Number.isFinite(prevFreq) && Number.isFinite(prevSpl) && Number.isFinite(currSpl) && prevInside !== currInside) {
            const crossings = [];

            if ((prevSpl >= LOWER && currSpl < LOWER) || (prevSpl < LOWER && currSpl >= LOWER)) {
              const t = (LOWER - prevSpl) / (currSpl - prevSpl);
              crossings.push({ thr: LOWER, t });
            }

            if ((prevSpl <= UPPER && currSpl > UPPER) || (prevSpl > UPPER && currSpl <= UPPER)) {
              const t = (UPPER - prevSpl) / (currSpl - prevSpl);
              crossings.push({ thr: UPPER, t });
            }

            crossings
              .filter(c => Number.isFinite(c.t) && c.t > 0 && c.t < 1)
              .sort((a, b) => a.t - b.t)
              .forEach(c => {
                const crossFreq = prevFreq + c.t * (currFreq - prevFreq);
                pushCross(crossFreq, c.thr, prevInside, currInside);
              });
          }
        }

        rows.push({
          frequency: currFreq,
          spl: Number.isFinite(currSpl) ? currSpl : null,
          splGood: currInside ? currSpl : null,
          splBad: currInside ? null : currSpl
        });
      }

      return rows;
    }, [data, refDb, disableHighlight, rewStyleMode]);
    
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

    // CRITICAL: If explicit yMin/yMax provided (REW locked mode), use them directly — DO NOT auto-scale from data
    if (Number.isFinite(yMin) && Number.isFinite(yMax)) {
      calculatedYMin = yMin;
      calculatedYMax = yMax;
    }
    // REW mode unlocked: compute Y domain from actual plotted data (only finite values)
    else if (rewStyleMode) {
      const splValues = chartData
        .map(d => d.spl)
        .filter(v => Number.isFinite(v));

      if (splValues.length > 0) {
        const dataMin = Math.min(...splValues);
        const dataMax = Math.max(...splValues);
        const padding = 5; // 5 dB padding top and bottom
        calculatedYMin = dataMin - padding;
        calculatedYMax = dataMax + padding;
      } else {
        // Fallback if no data
        calculatedYMin = 60;
        calculatedYMax = 110;
      }
    } else if (yDomain && Number.isFinite(yDomain.min) && Number.isFinite(yDomain.max)) {
      // Non-REW mode: use provided fixed domain
      calculatedYMin = yDomain.min;
      calculatedYMax = yDomain.max;
    } else {
      // Default Y range
      calculatedYMin = 90;
      calculatedYMax = 130;
    }

    // Nice ticks policy: snap Y domain to clean numbers for designer readability
    let snappedYMin = calculatedYMin;
    let snappedYMax = calculatedYMax;
    let yTicks = undefined;

    if (Number.isFinite(calculatedYMin) && Number.isFinite(calculatedYMax) && calculatedYMax > calculatedYMin) {
      const rawMin = calculatedYMin;
      const rawMax = calculatedYMax;
      const span = rawMax - rawMin;

      // Determine tick step based on span
      let step;
      if (span <= 30) {
        step = 5;
      } else if (span <= 60) {
        step = 10;
      } else {
        step = 20;
      }

      // Snap min/max to tick boundaries
      snappedYMin = Math.floor(rawMin / step) * step;
      snappedYMax = Math.ceil(rawMax / step) * step;

      // Generate ticks array
      const ticks = [];
      for (let i = snappedYMin; i <= snappedYMax; i += step) {
        ticks.push(i);
      }

      // Guard: if too many ticks, fall back to step=20
      if (ticks.length > 50) {
        step = 20;
        snappedYMin = Math.floor(rawMin / step) * step;
        snappedYMax = Math.ceil(rawMax / step) * step;
        const safeTicks = [];
        for (let i = snappedYMin; i <= snappedYMax; i += step) {
          safeTicks.push(i);
        }
        yTicks = safeTicks;
      } else {
        yTicks = ticks;
      }
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
                    if (!Number.isFinite(marker.fHz)) return null;

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
                    if (!Number.isFinite(marker.fHz)) return null;

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
                    if (!Number.isFinite(marker.fHz)) return null;

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
                <>
                    <div className="text-[10px] text-gray-500 mb-1">
                        X-axis scale: {linearHzAxis ? 'LINEAR' : 'LOG'}
                    </div>
                    <RewPlotRangeDebug chartData={chartData} />
                </>
            )}
            <ResponsiveContainer>
                <LineChart data={chartData} margin={{ top: 30, right: 50, left: 20, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#DCDBD6" />
                    <XAxis
                        dataKey="frequency"
                        type="number"
                        domain={rewStyleMode ? [20, calculatedXMax] : ['dataMin', 'dataMax']}
                        scale={linearHzAxis ? "linear" : "log"}
                        ticks={linearHzAxis 
                          ? [20, 30, 40, 50, 60, 80, 100, 120, 160, 200] 
                          : [20, 30, 40, 50, 60, 70, 80, 100, 120, 150, 200]
                        }
                        tickFormatter={(tick) => Number.isFinite(Number(tick)) ? Number(tick).toFixed(0) : ''}
                        label={{ value: "Frequency (Hz)", position: 'insideBottom', offset: -10, className: 'font-body text-[#3E4349]' }}
                        className="font-body text-xs"
                        tick={{ fill: '#3E4349' }}
                    />
                    <YAxis
                        domain={[snappedYMin, snappedYMax]}
                        ticks={yTicks}
                        tickFormatter={(tick) => Number.isFinite(Number(tick)) ? Number(tick).toFixed(0) : ''}
                        label={{ value: 'SPL (dB)', angle: -90, position: 'insideLeft', className: 'font-body text-[#3E4349]' }}
                        className="font-body text-xs"
                        tick={{ fill: '#3E4349' }}
                        allowDecimals={false}
                    />
                    <Tooltip content={<CustomTooltip />} shared={false} cursor={false} />

                    {rewStyleMode && rp22Levels && rp22Levels.map(level => (
                        Number.isFinite(level.spl) && (
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
                        )
                    ))}
                    
                    {/* Schroeder frequency line (on-scale only) */}
                    {Number.isFinite(schroederFrequency) && schroederFrequency > 0 && schroederFrequency <= 200 && (
                        <ReferenceLine 
                            x={schroederFrequency} 
                            stroke="#4A230F" 
                            strokeDasharray="4 4"
                        />
                    )}

                    {/* REW-style mode markers (prefer detailed modeMarkers data) */}
                    {showModeMarkers && (normalizedMarkers.axial.length > 0 || normalizedMarkers.tangential.length > 0 || normalizedMarkers.oblique.length > 0) && renderModeMarkers()}
                    
                    {/* Legacy mode markers (fallback to modeFrequencies array) */}
                    {showModeMarkers && normalizedMarkers.axial.length === 0 && modeFrequencies.length > 0 && modeFrequencies.map((freq, i) => (
                      <ReferenceLine 
                        key={`mode-legacy-${i}`}
                        x={freq} 
                        stroke="#DCDBD6" 
                        strokeWidth={1}
                        strokeDasharray="1 2"
                        opacity={0.3}
                      />
                    ))}

                    {/* REW mode: single true-value curve with monotone interpolation (ZERO processing) */}
                    {rewStyleMode && (
                      <Line 
                          type="monotone" 
                          dataKey="spl"
                          stroke="#213428" 
                          strokeWidth={2} 
                          dot={false}
                          activeDot={false}
                          connectNulls={true}
                          isAnimationActive={false}
                      />
                    )}

                    {/* Non-REW mode: good/bad splitting curves */}
                    {!rewStyleMode && (
                      <>
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
                      </>
                    )}

                    {/* Reference Line (Always Visible) */}
                    {Number.isFinite(refDb) && (
                        <ReferenceLine 
                            y={refDb} 
                            stroke="#2563eb" 
                            strokeWidth={1.5}
                            strokeDasharray="4 4"
                            label={{ 
                              value: refDb === 0 ? `${refDb} dB (Relative)` : `${refDb} dB Reference`, 
                              position: 'right', 
                              fill: '#2563eb', 
                              className: 'font-body text-xs',
                              offset: 5
                            }} 
                          />
                    )}
                    
                    {/* Mode line legend (REW style) */}
                    {showModeMarkers && (normalizedMarkers.axial.length > 0 || normalizedMarkers.tangential.length > 0 || normalizedMarkers.oblique.length > 0) && (
                        <text x={60} y={20} fontSize={10} fill="#3E4349" className="font-body">
                            Modes: Axial (━━) Tangential (- -) Oblique (···)
                        </text>
                    )}

                    {/* Schroeder frequency header label (top-right) */}
                    {schroederFrequency > 0 && Number.isFinite(schroederFrequency) && (
                        <text
                            x="98%"
                            y={20}
                            fontSize={10}
                            fill="#4A230F"
                            className="font-body"
                            textAnchor="end"
                        >
                            {schroederFrequency > 200
                                ? `Schroeder (${schroederFrequency.toFixed(0)} Hz off-scale)`
                                : `Schroeder (${schroederFrequency.toFixed(1)} Hz)`}
                        </text>
                    )}
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}