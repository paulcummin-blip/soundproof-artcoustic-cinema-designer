import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { mergeBassGraphSeries } from '@/components/room/bass/bassGraphSeriesAlignment';
import BassModeMarkers from '@/components/room/bass/BassModeMarkers';
import ProtectedNullOverlay from '@/components/room/bass/ProtectedNullOverlay';

const hasFiniteValue = (value) =>
  value !== null &&
  value !== undefined &&
  value !== "" &&
  Number.isFinite(Number(value));

const CustomTooltip = ({ active, payload, label, series = [] }) => {
    if (!active || !payload?.length) return null;
    const row = payload[0]?.payload;
    const actualFreq = row?.frequency;
    const freqDisplay = Number.isFinite(Number(actualFreq))
        ? `${Number(actualFreq).toFixed(2)} Hz`
        : (Number.isFinite(Number(label)) ? `${Number(label).toFixed(2)} Hz` : String(label));
    const visibleSeries = series.filter((item) => hasFiniteValue(row?.[`spl_${item.id}`]));
    const raw = visibleSeries.find((item) => item.kind === "raw");
    const postEq = visibleSeries.find((item) => item.kind === "post-eq");
    const houseCurve = visibleSeries.find((item) => item.kind === "house-curve");
    const rawValue = raw ? row[`spl_${raw.id}`] : null;
    const postEqValue = postEq ? row[`spl_${postEq.id}`] : null;
    const houseCurveValue = houseCurve ? row[`spl_${houseCurve.id}`] : null;
    const eqApplied = hasFiniteValue(rawValue) && hasFiniteValue(postEqValue) ? Number(postEqValue) - Number(rawValue) : null;
    const residual = hasFiniteValue(postEqValue) && hasFiniteValue(houseCurveValue) ? Number(postEqValue) - Number(houseCurveValue) : null;
    const fallbackValue = visibleSeries.length
      ? row[`spl_${visibleSeries[0].id}`]
      : payload.find((item) => hasFiniteValue(item?.value))?.value;

    return (
        <div className="bg-white/80 backdrop-blur-sm p-3 border border-[#DCDBD6] rounded-lg shadow-lg font-body">
            <p className="font-bold text-[#1B1A1A]">{freqDisplay}</p>
            {visibleSeries.length > 1
                ? visibleSeries.map((item) => {
                    const value = row[`spl_${item.id}`];
                    return hasFiniteValue(value) ? <p key={item.id} style={{ color: item.color }}>{item.tooltipLabel || item.label || item.id}: {Number(value).toFixed(1)} dB</p> : null;
                  })
                : hasFiniteValue(fallbackValue) && <p className="text-[#213428]">SPL: {Number(fallbackValue).toFixed(1)} dB</p>}
            {hasFiniteValue(eqApplied) && <p className="text-[#3E4349]">EQ applied: {eqApplied >= 0 ? "+" : ""}{Number(eqApplied).toFixed(1)} dB</p>}
            {hasFiniteValue(residual) && <p className="text-[#625143]">Residual: {residual >= 0 ? "+" : ""}{Number(residual).toFixed(1)} dB</p>}
        </div>
    );
};

// REW mode plot range debug (proof we're plotting the right numbers)
const RewPlotRangeDebug = ({ chartData, yDomain }) => {
  const finite = chartData.map(p => p?.spl).filter(v => Number.isFinite(Number(v)));
  if (finite.length === 0) return null;
  
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  
  return (
    <div className="text-[9px] text-gray-500 mb-1">
      Plot min/max: {Number.isFinite(min) ? min.toFixed(2) : 'N/A'} / {Number.isFinite(max) ? max.toFixed(2) : 'N/A'} dB
      {yDomain && yDomain[0] !== undefined && (
        <span className="ml-1 text-blue-500">(Y-axis locked to {yDomain[0].toFixed(0)} / {yDomain[1].toFixed(0)} dB)</span>
      )}
    </div>
  );
};

export default function BassGraph({ 
  responseData, 
  multiSeries,
  schroederFrequency = 0, 
  rp22Levels = [], 
  toggles = {}, 
  crossoverFrequency = 80,
  showModeMarkers = false,
  modeMarkers = { axial: [], tangential: [], oblique: [] },
  protectedNullAnnotations = [],
  linearHzAxis = false,
  rewStyleMode = false,
  yDomain,
  xDomain = null,
  yMin,
  yMax,
  showAxialOnly = false,
  refDb = 85,
  disableHighlight = false,
  renderToken = ''
}) {
    const lastValidYDomainRef = React.useRef(null);

    // Multi-series: merge all series data into one keyed chartData array
    const isMulti = rewStyleMode && Array.isArray(multiSeries) && multiSeries.length > 0;

    const multiChartData = React.useMemo(() => {
      if (!isMulti) return null;
      return mergeBassGraphSeries(multiSeries);
    }, [isMulti, multiSeries]);

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

    // Determine X-axis domain
    const xMin = xDomain?.[0] ?? 20;
    const xMax = xDomain?.[1] ?? 200;
    
    // Determine Y-axis domain
    let finalYMin, finalYMax, finalYTicks;

    const hasExternalYDomain =
      Array.isArray(yDomain) &&
      yDomain.length === 2 &&
      Number.isFinite(yDomain[0]) &&
      Number.isFinite(yDomain[1]);

    // Cache last valid domain so the axis cannot jump if parent misses one frame
    if (hasExternalYDomain) {
      lastValidYDomainRef.current = [yDomain[0], yDomain[1]];
    }

    const cached = lastValidYDomainRef.current;
    const hasCached =
      Array.isArray(cached) &&
      cached.length === 2 &&
      Number.isFinite(cached[0]) &&
      Number.isFinite(cached[1]);

    if (hasExternalYDomain || hasCached) {
      const d = hasExternalYDomain ? yDomain : cached;
      finalYMin = d[0];
      finalYMax = d[1];

      // Always use 10 dB steps for fixed external domains (e.g. REW-style 60–120)
      const domainSpan = finalYMax - finalYMin;
      const step = domainSpan <= 30 ? 5 : 10;

      const ticks = [];
      for (let i = finalYMin; i <= finalYMax; i += step) {
        ticks.push(i);
      }
      finalYTicks = ticks;

    } else {
      // Auto-calculation logic if no yDomain is provided
      let calculatedYMin, calculatedYMax;

      // REW mode: derive layout only from response/target data. The maximum-SPL
      // capability ceiling remains rendered, but never participates in axis layout.
      if (rewStyleMode) {
        const domainKinds = new Set([
          "raw", "post-eq", "house-curve", "normalized", "normalized-target", "real-seat-overlay",
        ]);
        const domainSeries = isMulti
          ? multiSeries.filter((series) => domainKinds.has(series.kind))
          : [];
        const responseValues = isMulti
          ? domainSeries.flatMap((series) => (series.data || [])
              .filter((point) => point.frequency >= xMin && point.frequency <= xMax)
              .map((point) => point.spl))
          : chartData
              .filter((point) => point.frequency >= xMin && point.frequency <= xMax)
              .map((point) => point.spl);
        const rp22Values = (rp22Levels || []).map((level) => level.spl);
        const splValues = [...responseValues, ...rp22Values].filter((value) => Number.isFinite(value));

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
      finalYMin = snappedYMin;
      finalYMax = snappedYMax;
      finalYTicks = yTicks;
    }

    // chartRenderKey — forces LineChart remount when plotted data changes.
    // Case 079: previous version only hashed the first row + row count, which left
    // the key unchanged when a qStrategy switch altered mid/late-curve values but
    // left the first plotted point (≈20 Hz, below the first mode) identical — so
    // Recharts reconciled instead of remounting and the curve did not repaint.
    // Fix: sample SPL at several indices across the whole band (first, 1/4, mid,
    // 3/4, last) for every series, plus row count. Any value change now flips the
    // key and forces a clean remount/redraw. Rendering fix only — no data change.
    const activeData = isMulti ? multiChartData : chartData;
    const _rowCount = activeData?.length ?? 0;
    let _splSample = '';
    if (_rowCount > 0 && activeData) {
        const sampleIdx = [
            0,
            Math.floor(_rowCount / 4),
            Math.floor(_rowCount / 2),
            Math.floor((_rowCount * 3) / 4),
            _rowCount - 1,
        ];
        for (const idx of sampleIdx) {
            const row = activeData[idx];
            if (!row || isMulti) {
                // Multi-series rows carry spl_<id> keys; concatenate their values.
                if (row && isMulti) {
                    const vals = Object.keys(row).filter(k => k.startsWith('spl_')).sort().map(k => row[k]);
                    _splSample += vals.map(v => (Number.isFinite(v) ? Number(v).toFixed(4) : 'null')).join(',');
                } else {
                    _splSample += 'null';
                }
            } else {
                _splSample += Number.isFinite(row.spl) ? Number(row.spl).toFixed(4) : 'null';
            }
            _splSample += '|';
        }
    }
    const chartRenderKey = `${isMulti ? 'multi' : 'single'}_rows${_rowCount}|${renderToken}|${_splSample}`;

    // Draw post-EQ first and raw second so the dotted before-EQ reference
    // remains visible wherever the two RSP curves overlap.
    const renderedMultiSeries = React.useMemo(() => {
      if (!Array.isArray(multiSeries)) return [];
      const postEq = multiSeries.find((series) => series.id === 'rsp-eq');
      const raw = multiSeries.find((series) => series.id === 'rsp-raw');
      const remaining = multiSeries.filter((series) => series.id !== 'rsp-eq' && series.id !== 'rsp-raw');
      return [postEq, raw, ...remaining].filter(Boolean);
    }, [multiSeries]);

    return (
        <div className="w-full h-[575px]">
            {rewStyleMode && (
                <>
                    <div className="text-[10px] text-gray-500 mb-1">
                        X-axis scale: {linearHzAxis ? 'LINEAR' : 'LOG'}
                    </div>
                    <RewPlotRangeDebug chartData={chartData} yDomain={yDomain} />
                </>
            )}
            <ResponsiveContainer>
                <LineChart key={chartRenderKey} data={isMulti ? multiChartData : chartData} margin={{ top: 30, right: 50, left: 20, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#DCDBD6" />
                    <XAxis
                        dataKey="frequency"
                        type="number"
                        domain={[xMin, xMax]}
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
                        domain={[finalYMin, finalYMax]}
                        ticks={finalYTicks}
                        allowDataOverflow={true}
                        tickFormatter={(tick) => Number.isFinite(Number(tick)) ? Number(tick).toFixed(0) : ''}
                        label={{ value: 'SPL (dB)', angle: -90, position: 'insideLeft', className: 'font-body text-[#3E4349]' }}
                        className="font-body text-xs"
                        tick={{ fill: '#3E4349' }}
                        allowDecimals={false}
                    />
                    <Tooltip content={(props) => <CustomTooltip {...props} series={isMulti ? multiSeries : []} />} shared cursor={false} />

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

                    <ProtectedNullOverlay annotations={protectedNullAnnotations} />
                    {showModeMarkers && <BassModeMarkers markers={normalizedMarkers} />}

                    {/* REW mode: multi-series or single trace */}
                    {rewStyleMode && isMulti && renderedMultiSeries.map((s) => (
                      <Line
                        key={s.id}
                        type="linear" 
                         dataKey={`spl_${s.id}`}
                        stroke={s.color}
                        strokeWidth={s.strokeWidth ?? 2}
                        strokeOpacity={s.strokeOpacity ?? 1}
                        strokeDasharray={s.strokeDasharray}
                        dot={false}
                        activeDot={false}
                        connectNulls={false}
                        isAnimationActive={false}
                      />
                    ))}
                    {rewStyleMode && !isMulti && (
                      <Line 
                          type="linear" 
                          dataKey="spl"
                          stroke="#213428" 
                          strokeWidth={2} 
                          dot={false}
                          activeDot={false}
                          connectNulls={false}
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