import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea } from 'recharts';
import { mergeBassGraphSeries } from '@/components/room/bass/bassGraphSeriesAlignment';
import BassModeMarkers from '@/components/room/bass/BassModeMarkers';
import ProtectedNullOverlay from '@/components/room/bass/ProtectedNullOverlay';
import { P14_EQ_ASSESSMENT_RANGE_HZ } from '@/components/utils/p14CapabilityAuthority';

const hasFiniteValue = (value) =>
  value !== null &&
  value !== undefined &&
  value !== "" &&
  Number.isFinite(Number(value));

const CustomTooltip = ({ active, payload, label, series = [], operatingLevelOffsetDb = 0 }) => {
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
    const productMaximum = visibleSeries.find((item) => item.kind === "product-maximum");
    const productMaximumValue = productMaximum ? row[`spl_${productMaximum.id}`] : null;
    const rawValue = raw ? row[`spl_${raw.id}`] : null;
    const postEqValue = postEq ? row[`spl_${postEq.id}`] : null;
    const houseCurveValue = houseCurve ? row[`spl_${houseCurve.id}`] : null;
    // rawValue is the level-normalised "RSP before PEQ" (raw + operatingLevelOffset).
    // PEQ applied is the filter-bank response only, NOT the global level trim.
    const rawSimulatedDb = hasFiniteValue(rawValue) ? Number(rawValue) - Number(operatingLevelOffsetDb) : null;
    const peqAppliedDb = hasFiniteValue(rawValue) && hasFiniteValue(postEqValue) ? Number(postEqValue) - Number(rawValue) : null;
    const residual = hasFiniteValue(postEqValue) && hasFiniteValue(houseCurveValue) ? Number(postEqValue) - Number(houseCurveValue) : null;
    const fallbackValue = visibleSeries.length
      ? row[`spl_${visibleSeries[0].id}`]
      : payload.find((item) => hasFiniteValue(item?.value))?.value;
    const hasLevelOffset = Number.isFinite(Number(operatingLevelOffsetDb)) && Number(operatingLevelOffsetDb) !== 0;

    return (
        <div className="bg-white/80 backdrop-blur-sm p-3 border border-[#DCDBD6] rounded-lg shadow-lg font-body">
            <p className="font-bold text-[#1B1A1A]">{freqDisplay}</p>
            {visibleSeries.length > 1
                ? visibleSeries.map((item) => {
                    const value = row[`spl_${item.id}`];
                    if (!hasFiniteValue(value)) return null;
                    if (item.kind === "room-response" && hasFiniteValue(item.systemPowerReferenceDb)) {
                      const roomLayoutContributionDb = Number(value) - Number(item.systemPowerReferenceDb);
                      return (
                        <React.Fragment key={item.id}>
                          <p style={{ color: item.color }}>{item.tooltipLabel || item.label || item.id}: {Number(value).toFixed(1)} dB</p>
                          <p style={{ color: item.color }}>
                            Room / layout contribution vs {Number(item.systemPowerReferenceDb).toFixed(1)} dB power-summed flat-system reference: {roomLayoutContributionDb >= 0 ? "+" : ""}{roomLayoutContributionDb.toFixed(1)} dB
                          </p>
                        </React.Fragment>
                      );
                    }
                    if (item.kind === "maximum-spl") {
                      const safetyMarginDb = hasFiniteValue(item.safetyMarginDb) ? Number(item.safetyMarginDb) : 0;
                      const rawInRoomMaximumDb = Number(value) + safetyMarginDb;
                      const roomLayoutEffectDb = hasFiniteValue(productMaximumValue)
                        ? rawInRoomMaximumDb - Number(productMaximumValue)
                        : null;
                      return (
                        <React.Fragment key={item.id}>
                          <p style={{ color: item.color }}>{item.tooltipLabel || item.label || item.id}: {Number(value).toFixed(1)} dB</p>
                          <p style={{ color: item.color }}>Raw product + room maximum before reserve: {rawInRoomMaximumDb.toFixed(1)} dB</p>
                          {hasFiniteValue(roomLayoutEffectDb) && (
                            <p style={{ color: item.color }}>
                              Room / layout effect on product maximum: {roomLayoutEffectDb >= 0 ? "+" : ""}{Number(roomLayoutEffectDb).toFixed(1)} dB
                            </p>
                          )}
                        </React.Fragment>
                      );
                    }
                    return <p key={item.id} style={{ color: item.color }}>{item.tooltipLabel || item.label || item.id}: {Number(value).toFixed(1)} dB</p>;
                  })
                : hasFiniteValue(fallbackValue) && <p className="text-[#213428]">SPL: {Number(fallbackValue).toFixed(1)} dB</p>}
            {hasFiniteValue(rawSimulatedDb) && <p className="text-[#3E4349]">Raw simulated RSP: {Number(rawSimulatedDb).toFixed(1)} dB</p>}
            {hasLevelOffset && <p className="text-[#3E4349]">Operating-level offset: {Number(operatingLevelOffsetDb) >= 0 ? "+" : ""}{Number(operatingLevelOffsetDb).toFixed(1)} dB</p>}
            {hasFiniteValue(peqAppliedDb) && <p className="text-[#3E4349]">PEQ applied: {peqAppliedDb >= 0 ? "+" : ""}{Number(peqAppliedDb).toFixed(1)} dB</p>}
            {hasFiniteValue(residual) && <p className="text-[#625143]">Final residual: {residual >= 0 ? "+" : ""}{Number(residual).toFixed(1)} dB</p>}
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
  yMin = null,
  yMax = null,
  showAxialOnly = false,
  refDb = 85,
  disableHighlight = false,
  renderToken = '',
  p14TotalDb = null,
  operatingLevelOffsetDb = 0,
  rp22Markers = {
    p18FrequencyHz: null,
    p19StartHz: null,
    p19EndHz: null,
    p19WorstFrequencyHz: null,
    p20WorstFrequencyHz: null,
    p20WorstSeatId: null,
  }
}) {
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
    
    // Fixed REW-style Y-axis domain — always 70–140 dB with 10 dB ticks.
    // No Auto scaling, no material-signature cache, no reset control.
    const finalYMin = Array.isArray(yDomain) && Number.isFinite(yDomain[0]) ? yDomain[0] : 70;
    const finalYMax = Array.isArray(yDomain) && Number.isFinite(yDomain[1]) ? yDomain[1] : 140;
    const domainSpan = finalYMax - finalYMin;
    const step = domainSpan <= 30 ? 5 : 10;
    const finalYTicks = [];
    for (let i = finalYMin; i <= finalYMax; i += step) {
      finalYTicks.push(i);
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

    // Presentation order follows the acoustic signal path. Reference layers
    // render first; the final EQ response renders last so target tracking remains
    // visible when curves overlap.
    const renderedMultiSeries = React.useMemo(() => {
      if (!Array.isArray(multiSeries)) return [];
      const orderByKind = {
        "room-response": 10,
        "product-maximum": 20,
        "maximum-spl": 30,
        raw: 40,
        "house-curve": 50,
        "normalized-target": 50,
        "post-eq": 60,
        "real-seat-overlay": 70,
      };
      return multiSeries
        .map((series, index) => ({ series, index }))
        .sort((left, right) => (orderByKind[left.series.kind] ?? 45) - (orderByKind[right.series.kind] ?? 45)
          || left.index - right.index)
        .map(({ series }) => series);
    }, [multiSeries]);

    return (
        <div className="w-full h-[575px]">
            {rewStyleMode && (
                <>
                    <div className="text-[10px] text-gray-500 mb-1 flex items-center justify-between">
                        <span>X-axis scale: {linearHzAxis ? 'LINEAR' : 'LOG'}</span>
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
                    <Tooltip content={(props) => <CustomTooltip {...props} series={isMulti ? multiSeries : []} operatingLevelOffsetDb={operatingLevelOffsetDb} />} shared cursor={false} />

                    {/* Schroeder frequency line (on-scale only) */}
                    {Number.isFinite(schroederFrequency) && schroederFrequency > 0 && schroederFrequency <= 200 && (
                        <ReferenceLine 
                            x={schroederFrequency} 
                            stroke="#4A230F" 
                            strokeDasharray="4 4"
                        />
                    )}

                    {/* RP22 calculation markers. P19 and P20 share the same
                        1/3-octave assessment band; their worst-frequency lines
                        show the exact points that set the displayed results. */}
                    {Number.isFinite(rp22Markers?.p19StartHz)
                      && Number.isFinite(rp22Markers?.p19EndHz)
                      && rp22Markers.p19EndHz > rp22Markers.p19StartHz && (
                      <ReferenceArea
                        x1={rp22Markers.p19StartHz}
                        x2={rp22Markers.p19EndHz}
                        fill="#2563EB"
                        fillOpacity={0.018}
                        stroke="#2563EB"
                        strokeOpacity={0.2}
                        strokeDasharray="3 5"
                      />
                    )}
                    {Number.isFinite(rp22Markers?.p18FrequencyHz) && (
                      <ReferenceLine
                        x={rp22Markers.p18FrequencyHz}
                        stroke="#2563EB"
                        strokeWidth={1.5}
                        strokeDasharray="5 4"
                      />
                    )}
                    {Number.isFinite(rp22Markers?.p19WorstFrequencyHz) && (
                      <ReferenceLine
                        x={rp22Markers.p19WorstFrequencyHz}
                        stroke="#B45309"
                        strokeWidth={1.25}
                        strokeDasharray="3 4"
                      />
                    )}
                    {Number.isFinite(rp22Markers?.p20WorstFrequencyHz) && (
                      <ReferenceLine
                        x={rp22Markers.p20WorstFrequencyHz}
                        stroke="#7C3AED"
                        strokeWidth={1.25}
                        strokeDasharray="3 4"
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

                    {/* P14 assessment band — subtle shaded marker along the X-axis
                        covering the centrally defined P14 assessment band. This is
                        a presentation-only marker; it does not alter curves, Y-axis
                        scaling, EQ, or any RP22 calculation. */}
                    {Number.isFinite(p14TotalDb) && (
                        <ReferenceArea
                            x1={P14_EQ_ASSESSMENT_RANGE_HZ.lowerHz}
                            x2={P14_EQ_ASSESSMENT_RANGE_HZ.upperHz}
                            fill="#213428"
                            fillOpacity={0.04}
                            stroke="#213428"
                            strokeOpacity={0.15}
                            strokeDasharray="3 3"
                            ifOverflow="extendDomain"
                            label={{
                              value: `P14 integration band · Σ ${Math.round(p14TotalDb)} dBC`,
                              position: 'insideBottom',
                              fill: '#625143',
                              fontSize: 9,
                              className: 'font-body',
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