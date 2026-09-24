// ParameterFocusBar.jsx
//
// A compact, clickable bar of P14/P18/P19/P20 buttons that sits above the
// bass response graph. Clicking a button selects that parameter as the
// graph's "storyteller" focus — the graph immediately changes to explain
// that parameter's published result.
//
// This is presentation-only state (graphInteractionStore). It never changes
// calculations, grading, or optimiser results.

import React from "react";
import { useGraphInteraction, setGraphInteraction } from "@/components/room/bass/bda/graphInteractionStore";

const METRICS = [
  { key: "p14", label: "P14", title: "Bass SPL Capability" },
  { key: "p18", label: "P18", title: "Low-Frequency Extension" },
  { key: "p19", label: "P19", title: "Response Fit vs Reference EQ" },
  { key: "p20", label: "P20", title: "Seat-to-Seat Consistency" },
];

export default function ParameterFocusBar({ disabled = false }) {
  const interaction = useGraphInteraction();
  const activeMetric = interaction?.selectedMetric || null;

  const toggle = (metric) => {
    if (disabled) return;
    setGraphInteraction({
      selectedMetric: activeMetric === metric ? null : metric,
    });
  };

  return (
    <div
      style={{
        display: "flex",
        gap: 6,
        alignItems: "center",
        flexWrap: "wrap",
        opacity: disabled ? 0.4 : 1,
        pointerEvents: disabled ? "none" : "auto",
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "#625143",
          marginRight: 4,
        }}
      >
        Graph focus:
      </span>
      {METRICS.map((metric) => {
        const isActive = activeMetric === metric.key;
        return (
          <button
            key={metric.key}
            onClick={() => toggle(metric.key)}
            title={metric.title}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "4px 10px",
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 700,
              fontFamily: "Didact Gothic, sans-serif",
              letterSpacing: "0.02em",
              cursor: "pointer",
              border: isActive ? "1.5px solid #213428" : "1px solid #DCDBD6",
              background: isActive ? "#213428" : "#FFFFFF",
              color: isActive ? "#FFFFFF" : "#3E4349",
              transition: "all 0.15s ease-out",
            }}
          >
            {metric.label}
          </button>
        );
      })}
      {activeMetric && (
        <button
          onClick={() => setGraphInteraction({ selectedMetric: null })}
          style={{
            padding: "4px 8px",
            borderRadius: 6,
            fontSize: 10,
            fontWeight: 500,
            cursor: "pointer",
            border: "1px solid #DCDBD6",
            background: "#F8F8F7",
            color: "#625143",
          }}
        >
          Clear
        </button>
      )}
    </div>
  );
}