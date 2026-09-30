"use client";

import React from "react";
import ViewModeToggle from "@/components/roomdesigner/ViewModeToggle";

/**
 * WorkspaceViewSelector
 *
 * The persistent Workspace View selector (Split / Plan / Technical). Mounted
 * above ViewModeLayout so it is never removed when the right-hand content panel
 * hides in Plan View. Pure presentation — it never affects calculations.
 */
export default function WorkspaceViewSelector({ viewMode, onViewModeChange }) {
  return (
    <div
      role="group"
      aria-label="Workspace view"
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 10,
        padding: "8px 16px",
        borderBottom: "1px solid #DCDBD6",
        background: "#FAFAF8",
        flex: "0 0 auto",
      }}
    >
      <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#625143" }}>
        Workspace View
      </span>
      <ViewModeToggle viewMode={viewMode} onViewModeChange={onViewModeChange} />
    </div>
  );
}