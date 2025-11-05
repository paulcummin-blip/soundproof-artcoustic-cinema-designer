import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, ResponsiveContainer } from 'recharts';

const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-white/80 backdrop-blur-sm p-3 border border-[#DCDBD6] rounded-lg shadow-lg">
                <p className="font-bold text-sm text-[#1B1A1A] font-header">{`${label.toFixed(1)} Hz`}</p>
                {payload.map((pld, index) => (
                    <p key={index} style={{ color: pld.color }} className="text-xs font-body">
                        {`${pld.name}: ${pld.value.toFixed(1)} dB`}
                    </p>
                ))}
            </div>
        );
    }
    return null;
};

export default function BassGraph({
    responseData,
    schroederFrequency,
    rp22Levels,
    toggles
}) {
    // Defensive Guard: If there's no data, don't render the chart.
    if (!responseData || !Array.isArray(responseData) || responseData.length === 0) {
        return (
            <div className="h-[400px] w-full flex items-center justify-center bg-[#F9F8F6] border border-[#DCDBD6] rounded-lg">
                <p className="text-[#3E4349] font-body">Run simulation to see graph.</p>
            </div>
        );
    }

    // IEC 61260 1/3-octave band center frequencies for ticks
    const oneThirdOctaveTicks = [15.6, 20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200];

    return (
        <ResponsiveContainer width="100%" height={400}>
            <LineChart
                data={responseData}
                margin={{ top: 5, right: 30, left: 0, bottom: 20 }}
            >
                <CartesianGrid strokeDasharray="3 3" stroke="#DCDBD6" />
                <XAxis
                    dataKey="frequency"
                    type="number"
                    scale="log"
                    domain={['dataMin', 'dataMax']}
                    ticks={oneThirdOctaveTicks}
                    tickFormatter={(tick) => Math.round(tick)}
                    label={{ value: "Frequency (Hz)", position: 'insideBottom', offset: -10, className: 'font-body text-sm text-[#3E4349]' }}
                    stroke="#3E4349"
                    className="font-body text-xs"
                />
                <YAxis
                    domain={[90, 130]}
                    allowDataOverflow={true}
                    label={{ value: 'dB SPL (C)', angle: -90, position: 'insideLeft', className: 'font-body text-sm text-[#3E4349]' }}
                    stroke="#3E4349"
                    className="font-body text-xs"
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontFamily: 'Didact Gothic', fontSize: '12px' }} />

                {/* RP22 Level Reference Lines */}
                {rp22Levels.map(level => (
                    <ReferenceLine
                        key={level.level}
                        y={level.spl}
                        label={{ value: level.level, position: 'right', fill: level.color, className: 'font-body text-xs' }}
                        stroke={level.color}
                        strokeDasharray="3 3"
                    />
                ))}

                {/* Schroeder Frequency Line */}
                {schroederFrequency > 0 && (
                    <ReferenceLine
                        x={schroederFrequency}
                        stroke="#213428"
                        strokeDasharray="4 4"
                        strokeOpacity={0.6}
                        label={{ value: "Schroeder Freq.", position: 'top', fill: '#213428', className: 'font-body text-xs' }}
                    />
                )}

                {/* Main Response Curve */}
                <Line
                    type="monotone"
                    dataKey="spl"
                    name="Combined Response"
                    stroke="#213428"
                    strokeWidth={2}
                    dot={false}
                />
            </LineChart>
        </ResponsiveContainer>
    );
}