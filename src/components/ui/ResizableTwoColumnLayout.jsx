import React from "react";

// Canonical split measurements. Every clamp — initial mount, container resize
// and divider drag — reads from this one calculation, so the grid can never be
// wider than its own content box.
function computeSplitMetrics({
  containerWidth,
  paddingX,
  dividerWidth,
  gap,
  minLeftWidth,
  minRightWidth,
}) {
  // Divider plus both column gaps sit between the two panels.
  const chrome = dividerWidth + gap * 2;
  const contentWidth = Math.max(0, containerWidth - paddingX * 2);
  const maxLeftWidth = Math.max(minLeftWidth, contentWidth - chrome - minRightWidth);
  const minGridWidth = minLeftWidth + minRightWidth + chrome + paddingX * 2;

  return {
    contentWidth,
    maxLeftWidth,
    minGridWidth,
    // Below the true two-column minimum the panels stack instead of clipping.
    stacked: containerWidth > 0 && containerWidth < minGridWidth,
  };
}

function clampLeftWidth(value, minLeftWidth, maxLeftWidth) {
  return Math.min(Math.max(value, minLeftWidth), maxLeftWidth);
}

export default function ResizableTwoColumnLayout({
  leftContent,
  rightContent,
  initialLeftWidth = 720,
  minLeftWidth = 480,
  minRightWidth = 420,
  dividerWidth = 8,
  gap = 12,
  paddingX = 16,
}) {
  const containerRef = React.useRef(null);
  const [containerWidth, setContainerWidth] = React.useState(0);
  const [requestedLeftWidth, setRequestedLeftWidth] = React.useState(initialLeftWidth);
  const [isDragging, setIsDragging] = React.useState(false);
  const [isHovering, setIsHovering] = React.useState(false);

  const metrics = React.useMemo(
    () => computeSplitMetrics({
      containerWidth,
      paddingX,
      dividerWidth,
      gap,
      minLeftWidth,
      minRightWidth,
    }),
    [containerWidth, paddingX, dividerWidth, gap, minLeftWidth, minRightWidth],
  );

  // Derived, never stored: an old pixel width cannot outlive the space it was
  // chosen in.
  const effectiveLeftWidth = clampLeftWidth(requestedLeftWidth, minLeftWidth, metrics.maxLeftWidth);

  // The split container is the single authority for available width — measured
  // on mount and re-clamped whenever it changes width, never waiting for a drag.
  React.useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const measure = () => {
      const next = container.clientWidth;
      setContainerWidth((previous) => (previous === next ? previous : next));
    };

    measure();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }

    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    if (!isDragging) return undefined;

    const handleMouseMove = (event) => {
      event.preventDefault();

      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      // Screen X to content-box X: the padding sits inside the container, so a
      // pointer at the content edge must not read as a wider left panel.
      const pointerContentX = event.clientX - rect.left - paddingX;
      const liveMetrics = computeSplitMetrics({
        containerWidth: rect.width,
        paddingX,
        dividerWidth,
        gap,
        minLeftWidth,
        minRightWidth,
      });

      setRequestedLeftWidth(
        clampLeftWidth(pointerContentX, minLeftWidth, liveMetrics.maxLeftWidth)
      );
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
  }, [isDragging, paddingX, minLeftWidth, minRightWidth, dividerWidth, gap]);

  const dividerActive = isHovering || isDragging;

  // Deliberate responsive fallback: when the container is narrower than the
  // true two-column minimum, the panels stack vertically so neither is clipped
  // or pushed off-screen. No body-level overflow hiding is involved.
  if (metrics.stacked) {
    return (
      <div
        ref={containerRef}
        style={{
          display: "flex",
          flexDirection: "column",
          gap,
          padding: paddingX,
          overflowX: "hidden",
          overflowY: "auto",
          flex: "1 1 0",
          minWidth: 0,
          minHeight: 0,
        }}
      >
        <div style={{ minWidth: 0 }}>{leftContent}</div>
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
          {rightContent}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        display: "grid",
        gridTemplateColumns: `${effectiveLeftWidth}px ${dividerWidth}px minmax(${minRightWidth}px, 1fr)`,
        gridTemplateRows: "1fr",
        columnGap: gap,
        overflowX: "hidden",
        overflowY: "hidden",
        padding: paddingX,
        flex: "1 1 0",
        minWidth: 0,
        minHeight: 0,
      }}
    >
      <div style={{ minWidth: 0, minHeight: 0, overflow: "hidden" }}>
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

      <div style={{ minWidth: 0, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {rightContent}
      </div>
    </div>
  );
}