import React from "react";

// A small, permanently visible grab handle centred vertically on the Split View
// divider. Visual only: it reports no pointer events of its own, so the parent
// separator element stays the single drag authority.
export default function SplitDividerHandle({ active = false }) {
  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 14,
        height: 38,
        borderRadius: 999,
        background: active ? "#EDEAE3" : "#F3F1EC",
        boxShadow: active
          ? "0 1px 2px rgba(33, 52, 40, 0.18)"
          : "0 1px 1px rgba(33, 52, 40, 0.10)",
        border: "1px solid rgba(33, 52, 40, 0.10)",
        transition: "background 120ms ease, box-shadow 120ms ease",
        pointerEvents: "none",
      }}
      aria-hidden="true"
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 3,
          alignItems: "center",
        }}
      >
        <span style={grip(active)} />
        <span style={grip(active)} />
        <span style={grip(active)} />
      </div>
    </div>
  );
}

function grip(active) {
  return {
    display: "block",
    width: 6,
    height: 1.5,
    borderRadius: 999,
    background: active ? "#3E4349" : "#8A8278",
    opacity: active ? 0.9 : 0.7,
    transition: "background 120ms ease, opacity 120ms ease",
  };
}