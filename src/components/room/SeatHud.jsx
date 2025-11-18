// components/room/SeatHud.jsx
"use client";
import React from "react";

export default function SeatHud({
  tooltipData,
  hudPosition,
  isHudPinned,
  hudDynamicStyle,
  onHudHeaderMouseDown,
  hudElRef,
  setHudHiddenWhenPinned,
  hudHiddenWhenPinned,
  renderLevelBadge,
}) {
  if (!tooltipData) return null;

  const left = (hudPosition?.x ?? 20);
  const top  = (hudPosition?.y ?? 20);

  const rp23 = tooltipData.rp23 ?? {};
  const splAtSeat = tooltipData.splAtSeat ?? {};
  const lcr = splAtSeat.lcr ?? {};
  const surrounds = splAtSeat.surrounds ?? {};
  const overheads = splAtSeat.overheads ?? {};

  const hasAnySPL =
    Object.keys(lcr).length > 0 ||
    Object.keys(surrounds).length > 0 ||
    Object.keys(overheads).length > 0;

  const fmt = (v) => {
    if (v == null) return "—";
    if (typeof v === "object" && "formatted" in v) return v.formatted ?? "—";
    return String(v);
  };

  return (
    <div
      ref={hudElRef}
      className="seat-hud"
      style={{
        position: "absolute",
        left,
        top,
        background: "white",
        border: "1px solid #DCDBD6",
        borderRadius: 4,
        padding: 12,
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        pointerEvents: isHudPinned ? "auto" : "none",
        zIndex: 1000,
        minWidth: 260,
        maxWidth: 320,
        fontSize: 11,
        color: "#625143",
        maxHeight: "80vh",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        ...hudDynamicStyle,
      }}
    >
      {/* Header */}
      <div
        onMouseDown={(e) => {
          if (isHudPinned && onHudHeaderMouseDown) {
            e.currentTarget.style.cursor = "grabbing";
            onHudHeaderMouseDown(e);
          }
        }}
        onMouseUp={(e) => {
          if (isHudPinned) {
            e.currentTarget.style.cursor = "grab";
          }
        }}
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "#1B1A1A",
          marginBottom: 4,
          paddingBottom: 4,
          borderBottom: "1px solid #E6E4DD",
          cursor: isHudPinned ? "grab" : "default",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          {tooltipData.seatId} {tooltipData.isPrimary ? "(MLP)" : ""}
          {isHudPinned && (
            <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 500, color: "#999" }}>
              (Pinned)
            </span>
          )}
        </div>

        {isHudPinned && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setHudHiddenWhenPinned((v) => !v);
            }}
            aria-label={hudHiddenWhenPinned ? "Show HUD" : "Hide HUD"}
            title={hudHiddenWhenPinned ? "Show HUD (H)" : "Hide HUD (H)"}
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              padding: "2px 4px",
              lineHeight: 1,
              fontSize: 14,
            }}
          >
            {hudHiddenWhenPinned ? "👁️‍🗨️" : "👁️"}
          </button>
        )}
      </div>

      {/* Basic info */}
      <div style={{ marginBottom: 4 }}>
        <div>Position: {fmt(tooltipData.position)}</div>
        <div>Distance to Screen: {fmt(tooltipData.distanceToScreen)}</div>
        {tooltipData.distanceToMLP != null && tooltipData.distanceToMLP !== "—" && (
          <div>Distance to MLP: {fmt(tooltipData.distanceToMLP)}</div>
        )}
      </div>

      {/* RP23 */}
      {rp23.formatted && rp23.formatted !== "—" && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "4px 0",
            borderTop: "1px solid #E6E4DD",
          }}
        >
          <span>RP23 Horizontal: {fmt(rp23)}</span>
          {typeof renderLevelBadge === "function" ? renderLevelBadge(rp23.level ?? "—") : null}
        </div>
      )}

      {/* SPL @ Seat */}
      {hasAnySPL && (
        <div style={{ borderTop: "1px solid #E6E4DD", marginTop: 8, paddingTop: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6, color: "#1B1A1A" }}>
            SPL @ Seat (Target: 100W)
          </div>

          {Object.keys(lcr).length > 0 && (
            <div style={{ marginBottom: 4 }}>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>Screen:</div>
              {Object.entries(lcr).map(([role, spl]) => (
                <div key={role} style={{ fontSize: 12, paddingLeft: 8 }}>
                  {role}: {fmt(spl)}
                </div>
              ))}
            </div>
          )}

          {Object.keys(surrounds).length > 0 && (
            <>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>Surrounds:</div>
              {Object.entries(surrounds).map(([role, spl]) => (
                <div key={role} style={{ fontSize: 12, paddingLeft: 8 }}>
                  {role}: {fmt(spl)}
                </div>
              ))}
            </>
          )}

          {Object.keys(overheads).length > 0 && (
            <div style={{ marginBottom: 4 }}>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>Overheads:</div>
              {Object.entries(overheads).map(([role, spl]) => (
                <div key={role} style={{ fontSize: 12, paddingLeft: 8 }}>
                  {role}: {fmt(spl)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* RP22 Metrics */}
      <div style={{ borderTop: "1px solid #E6E4DD", paddingTop: 4, marginTop: 4 }}>
        <div style={{ fontWeight: 600, fontSize: 11, marginBottom: 4, color: "#1B1A1A" }}>
          RP22 Per-Seat Metrics
        </div>
        {["p1", "p4", "p5", "p6", "p9", "p10", "p16", "p17", "p20"].map((key) => {
          const metric = tooltipData.rp22?.[key];
          if (!metric) return null;
          return (
            <div
              key={key}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "2px 0",
                fontSize: 12,
              }}
            >
              <span>{key.toUpperCase()}: {metric.formatted || "—"}</span>
              {typeof renderLevelBadge === "function" ? renderLevelBadge(metric.level || "—") : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}