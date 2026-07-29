import React from "react";
import ResizableTwoColumnLayout from "@/components/ui/ResizableTwoColumnLayout";

// ViewModeLayout — switches the Cinema Designer workspace between
// Split (resizable two-column), Plan (left/room full page) and
// Technical (right/controls full page). Presentation only — the content
// elements are identical across modes; only the layout shell changes.
export default function ViewModeLayout({
  viewMode = "split",
  leftContent,
  rightContent,
  ...resizeProps
}) {
  if (viewMode === "plan") {
    return (
      <div
        style={{
          flex: "1 1 auto",
          minWidth: 0,
          minHeight: 0,
          overflow: "hidden",
          padding: 16,
          display: "flex",
        }}
      >
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: "hidden" }}>
          {leftContent}
        </div>
      </div>
    );
  }

  if (viewMode === "technical") {
    return (
      <div
        style={{
          flex: "1 1 auto",
          minWidth: 0,
          minHeight: 0,
          overflow: "hidden",
          padding: 16,
          display: "flex",
        }}
      >
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: "hidden" }}>
          {rightContent}
        </div>
      </div>
    );
  }

  return (
    <ResizableTwoColumnLayout
      leftContent={leftContent}
      rightContent={rightContent}
      {...resizeProps}
    />
  );
}