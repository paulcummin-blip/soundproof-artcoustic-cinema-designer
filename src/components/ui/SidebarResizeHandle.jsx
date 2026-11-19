import React from "react";

/**
 * SidebarResizeHandle — a vertical drag handle for the app-shell sidebar.
 *
 * Reuses the same visual language as the ResizableTwoColumnLayout divider
 * (2px rail, wider transparent hit area, brand-green active state) but drives
 * a single sidebar width instead of a two-column split. Presentation + drag
 * behaviour only; the parent owns the width state and the min/max clamp.
 */
export default function SidebarResizeHandle({
  width,
  minWidth,
  maxWidth,
  onWidthChange,
}) {
  const [isDragging, setIsDragging] = React.useState(false);
  const [isHovering, setIsHovering] = React.useState(false);
  const startRef = React.useRef({ x: 0, width: 0 });

  React.useEffect(() => {
    if (!isDragging) return undefined;

    const onMove = (event) => {
      event.preventDefault();
      const delta = event.clientX - startRef.current.x;
      const next = Math.min(
        Math.max(startRef.current.width + delta, minWidth),
        maxWidth,
      );
      onWidthChange(next);
    };

    const onUp = () => {
      setIsDragging(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);

    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isDragging, minWidth, maxWidth, onWidthChange]);

  const active = isHovering || isDragging;

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      title="Drag to resize panel"
      onMouseDown={(event) => {
        event.preventDefault();
        startRef.current = { x: event.clientX, width };
        setIsDragging(true);
      }}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        right: -5,
        width: 12,
        cursor: "col-resize",
        zIndex: 20,
      }}
    >
      {/* Transparent hit area (wider than the visible rail). */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: active ? "rgba(33, 52, 40, 0.08)" : "transparent",
          borderRadius: 8,
          transition: "background 120ms ease",
        }}
      />
      {/* Visible 2px rail, centred on the sidebar edge. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: 2,
          borderRadius: 999,
          background: active ? "#213428" : "#D6D3CC",
          opacity: active ? 0.8 : 0.7,
          transition: "background 120ms ease, opacity 120ms ease",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}