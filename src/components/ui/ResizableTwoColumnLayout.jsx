import React from "react";

export default function ResizableTwoColumnLayout({
  leftContent,
  rightContent,
  initialLeftWidth = 720,
  minLeftWidth = 480,
  minRightWidth = 420,
  dividerWidth = 8,
  gap = 12,
}) {
  const containerRef = React.useRef(null);
  const [leftWidth, setLeftWidth] = React.useState(initialLeftWidth);
  const [isDragging, setIsDragging] = React.useState(false);
  const [isHovering, setIsHovering] = React.useState(false);

  React.useEffect(() => {
    if (!isDragging) return;

    const clampWidth = (clientX) => {
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const reservedWidth = minRightWidth + dividerWidth + gap * 2;
      const maxLeftWidth = Math.max(minLeftWidth, rect.width - reservedWidth);
      const nextWidth = Math.max(
        minLeftWidth,
        Math.min(maxLeftWidth, clientX - rect.left)
      );

      setLeftWidth(nextWidth);
    };

    const handleMouseMove = (event) => {
      event.preventDefault();
      clampWidth(event.clientX);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isDragging, minLeftWidth, minRightWidth, dividerWidth, gap]);

  const dividerActive = isHovering || isDragging;

  return (
    <div
      ref={containerRef}
      style={{
        display: "grid",
        gridTemplateColumns: `${leftWidth}px ${dividerWidth}px minmax(${minRightWidth}px, 1fr)`,
        columnGap: gap,
        overflow: "hidden",
        padding: 16,
        flex: "1 1 auto",
        minWidth: 0,
        minHeight: 0,
      }}
    >
      <div style={{ minWidth: minLeftWidth, minHeight: 0, overflow: "hidden" }}>
        {leftContent}
      </div>

      <div
        role="separator"
        aria-orientation="vertical"
        title="Drag to resize panels"
        onMouseDown={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        style={{
          width: dividerWidth,
          minHeight: 0,
          cursor: "ew-resize",
          display: "flex",
          alignItems: "stretch",
          justifyContent: "center",
          borderRadius: 8,
          background: dividerActive ? "rgba(33, 52, 40, 0.08)" : "transparent",
          transition: "background 120ms ease",
        }}
      >
        <div
          style={{
            width: 2,
            height: "100%",
            borderRadius: 999,
            background: dividerActive ? "#213428" : "#D6D3CC",
            opacity: dividerActive ? 0.8 : 0.7,
            transition: "background 120ms ease, opacity 120ms ease",
          }}
        />
      </div>

      <div style={{ minWidth: minRightWidth, minHeight: 0, overflow: "hidden" }}>
        {rightContent}
      </div>
    </div>
  );
}