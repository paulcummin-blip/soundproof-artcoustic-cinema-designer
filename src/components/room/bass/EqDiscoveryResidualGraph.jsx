// EqDiscoveryResidualGraph.jsx — Compact diagnostic residual graph.
// Read-only. Uses recharts. Does not alter the main Bass Response graph.

import React, { useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine, Tooltip, ResponsiveContainer,
} from "recharts";

export default function EqDiscoveryResidualGraph({ residualGraphData }) {
  const chartData = useMemo(() => {
    if (!residualGraphData?.series?.length) return [];
    const freqSet = new Set();
    for (const s of residualGraphData.series) {
      for (const p of s.data) freqSet.add(p.frequency);
    }
    const freqs = [...freqSet].sort((a, b) => a - b);
    return freqs.map((f) => {
      const row = { frequency: f };
      for (const s of residualGraphData.series) {
        const p = s.data.find((d) => d.frequency === f);
        row[s.key] = p ? p.residualDb : null;
      }
      return row;
    });
  }, [residualGraphData]);

  if (!chartData.length) {
    return <div style={{ fontSize: 11, color: "#8B7F76", fontFamily: "monospace", padding: 12 }}>No residual data available.</div>;
  }

  const probeFreqs = residualGraphData?.probeFreqs || [34.16, 77.81];

  return (
    <div style={{ width: "100%", height: 220 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" />
          <XAxis
            dataKey="frequency"
            type="number"
            domain={["dataMin", "dataMax"]}
            scale="log"
            tick={{ fontSize: 9, fill: "#625143", fontFamily: "monospace" }}
            tickFormatter={(v) => v.toFixed(0)}
            label={{ value: "Hz", position: "insideBottom", offset: -8, fontSize: 9, fill: "#625143" }}
          />
          <YAxis
            domain={[-12, 12]}
            tick={{ fontSize: 9, fill: "#625143", fontFamily: "monospace" }}
            tickFormatter={(v) => `${v}dB`}
            label={{ value: "Residual (dB)", angle: -90, position: "insideLeft", fontSize: 9, fill: "#625143" }}
          />
          <Tooltip
            contentStyle={{ fontSize: 10, fontFamily: "monospace", padding: 4 }}
            labelStyle={{ fontSize: 10, fontFamily: "monospace" }}
            labelFormatter={(v) => `${Number(v).toFixed(2)} Hz`}
            formatter={(v, name) => [`${Number(v).toFixed(3)} dB`, name]}
          />
          <ReferenceLine y={0} stroke="#1B1A1A" strokeWidth={1} />
          <ReferenceLine y={3} stroke="#dc2626" strokeDasharray="4 4" strokeWidth={1} />
          <ReferenceLine y={-3} stroke="#dc2626" strokeDasharray="4 4" strokeWidth={1} />
          {probeFreqs.map((f) => (
            <ReferenceLine key={f} x={f} stroke="#2563eb" strokeDasharray="2 2" strokeWidth={1} label={{ value: `${f}`, fontSize: 8, fill: "#2563eb", position: "top" }} />
          ))}
          {(residualGraphData?.discoveredRegions || []).map((r, i) => (
            <ReferenceLine key={`reg-${i}`} x={r.centreHz} stroke="#16a34a" strokeDasharray="3 3" strokeWidth={1} />
          ))}
          {(residualGraphData?.filters || []).map((f, i) => (
            <ReferenceLine key={`filt-${i}`} x={f.frequencyHz} stroke="#7c3aed" strokeDasharray="1 3" strokeWidth={1} />
          ))}
          {residualGraphData.series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stroke={s.color}
              dot={false}
              strokeWidth={s.key === "1/3" ? 2 : 1}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}