import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';

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

export default function BassGraph({ responseData, schroederFrequency, rp22Levels, toggles, crossoverFrequency = 80 }) {
    const data = toggles.smoothing
        ? responseData // Placeholder for actual smoothing logic
        : responseData;

    return (
        <div className="w-full h-[400px]">
            <ResponsiveContainer>
                <LineChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#DCDBD6" />
                    <XAxis
                        dataKey="frequency"
                        type="number"
                        domain={['dataMin', 'dataMax']}
                        scale="log"
                        tickFormatter={(tick) => tick.toFixed(0)}
                        label={{ value: "Frequency (Hz)", position: 'insideBottom', offset: -15, className: 'font-body text-[#3E4349]' }}
                        className="font-body text-xs"
                    />
                    <YAxis
                        domain={[70, 130]}
                        label={{ value: 'SPL (dB)', angle: -90, position: 'insideLeft', className: 'font-body text-[#3E4349]' }}
                        className="font-body text-xs"
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontFamily: 'Didact Gothic, sans-serif' }} />

                    {rp22Levels.map(level => (
                        <ReferenceLine key={level.level} y={level.spl} label={{ value: level.level, position: 'right', fill: level.color, className: 'font-body text-xs' }} stroke={level.color} strokeDasharray="2 2" />
                    ))}
                    
                    {schroederFrequency > 0 && (
                        <ReferenceLine x={schroederFrequency} stroke="#4A230F" strokeDasharray="4 4" label={{ value: 'Schroeder', position: 'top', fill: '#4A230F', className: 'font-body text-xs' }} />
                    )}

                    <ReferenceLine x={crossoverFrequency} stroke="#1d4ed8" strokeDasharray="4 4" label={{ value: 'Crossover', position: 'top', fill: '#1d4ed8', className: 'font-body text-xs' }} />
                    <ReferenceLine x={120} stroke="#7e22ce" strokeDasharray="4 4" label={{ value: 'LFE Limit', position: 'top', fill: '#7e22ce', className: 'font-body text-xs' }} />


                    <Line type="monotone" dataKey="spl" stroke="#213428" strokeWidth={2} dot={false} name="Combined Response" />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}