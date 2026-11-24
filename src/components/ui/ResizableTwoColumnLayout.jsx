import React from "react";
import SplitDividerHandle from "@/components/ui/SplitDividerHandle";

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
  const leftPanelRef = React.useRef(null);
  const rightPanelRef = React.useRef(null);
  const [containerWidth, setContainerWidth] = React.useState(0);
  const [viewportHeight, setViewportHeight] = React.useState(null);
  const [requestedLeftWidth, setRequestedLeftWidth] = React.useState(initialLeftWidth);
  const [isDragging, setIsDragging] = React.useState(false);
  const [isHovering, setIsHovering] = React.useState(false);

  // Linked vertical scroll via the centre grab handle. The handle is a
  // temporary linked-scrolling control: dragging it applies the same vertical
  // delta to both panels' own scroll containers, and each panel clamps
  // independently at its own boundary. Independent scrolling (wheel/trackpad
  // over a single panel) is untouched, and horizontal resizing through the
  // divider rail remains independent.
  const [isScrollDragging, setIsScrollDragging] = React.useState(false);
  const [handleHover, setHandleHover] = React.useState(false);
  const scrollDragStartY = React.useRef(0);
  const scrollDragStartTops = React.useRef({ left: 0, right: 0 });

  function findScrollContainer(root) {
    if (!root) return null;
    const queue = [root];
    while (queue.length) {
      const el = queue.shift();
      if (!el || el.nodeType !== 1) continue;
      const style = window.getComputedStyle(el);
      const ov = style.overflowY;
      if ((ov === "auto" || ov === "scroll") && el.scrollHeight > el.clientHeight + 1) {
        return el;
      }
      for (const child of el.children) queue.push(child);
    }
    return null;
  }

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

    // The app shell is content-sized, so percentage heights cannot establish
    // the workspace viewport. Measure actual visible space instead. Sticky
    // positioning keeps the split toolbar at the viewport top when the page
    // header is scrolled away; the drawing retains its own scroll container.
    const measure = () => {
      const next = container.clientWidth;
      setContainerWidth((previous) => (previous === next ? previous : next));
      const viewport = window.visualViewport;
      const top = viewport?.offsetTop || 0;
      const bottom = top + (viewport?.height || window.innerHeight);
      const available = Math.max(160, Math.floor(
        bottom - Math.max(top, container.getBoundingClientRect().top)
      ));
      setViewportHeight((previous) => previous === available ? previous : available);
    };
    let frame = 0;
    const scheduleMeasure = (event) => {
      // Scrolling a panel must never resize it or move its neighbour.
      if (event?.type === "scroll" && event.target instanceof Node &&
          container.contains(event.target)) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("resize", scheduleMeasure);
    window.addEventListener("scroll", scheduleMeasure, true);
    window.visualViewport?.addEventListener("resize", scheduleMeasure);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleMeasure);
    observer?.observe(container);
    if (container.parentElement) {
      observer?.observe(container.parentElement);
      // Header/asset drawer changes can move the split without resizing its
      // content-sized parent, so observe the preceding layout siblings too.
      for (const sibling of container.parentElement.children) {
        if (sibling === container) break;
        observer?.observe(sibling);
      }
    }
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
      window.removeEventListener("scroll", scheduleMeasure, true);
      window.visualViewport?.removeEventListener("resize", scheduleMeasure);
    };
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

  React.useEffect(() => {
    if (!isScrollDragging) return undefined;

    const handleScrollMouseMove = (event) => {
      event.preventDefault();
      const deltaY = event.clientY - scrollDragStartY.current;
      const leftContainer = findScrollContainer(leftPanelRef.current);
      const rightContainer = findScrollContainer(rightPanelRef.current);
      // Apply the same delta to both; the browser clamps each to its own
      // scroll boundary, so panels with different heights stop independently.
      if (leftContainer) leftContainer.scrollTop = scrollDragStartTops.current.left + deltaY;
      if (rightContainer) rightContainer.scrollTop = scrollDragStartTops.current.right + deltaY;
    };

    const handleScrollMouseUp = () => {
      setIsScrollDragging(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleScrollMouseMove);
    document.addEventListener("mouseup", handleScrollMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleScrollMouseMove);
      document.removeEventListener("mouseup", handleScrollMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isScrollDragging]);

  const handleScrollDragStart = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const leftContainer = findScrollContainer(leftPanelRef.current);
    const rightContainer = findScrollContainer(rightPanelRef.current);
    scrollDragStartY.current = event.clientY;
    scrollDragStartTops.current = {
      left: leftContainer ? leftContainer.scrollTop : 0,
      right: rightContainer ? rightContainer.scrollTop : 0,
    };
    setIsScrollDragging(true);
  };

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
          flex: "0 0 auto",
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
        gridTemplateRows: "minmax(0, 1fr)",
        position: "sticky",
        top: 0,
        height: viewportHeight ?? undefined,
        columnGap: gap,
        overflowX: "hidden",
        overflowY: "hidden",
        padding: paddingX,
        flex: "0 0 auto",
        minWidth: 0,
        minHeight: 0,
      }}
    >
      <div ref={leftPanelRef} style={{ minWidth: 0, minHeight: 0, overflow: "hidden" }}>
        {leftContent}
      </div>

      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "stretch",
          justifyContent: "center",
          width: dividerWidth,
          minHeight: 0,
        }}
      >
        {/* Draggable hit area: wider than the visible divider so the grab
            target is comfortable without thickening the divider itself. */}
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
            position: "absolute",
            top: 0,
            bottom: 0,
            left: "50%",
            transform: "translateX(-50%)",
            width: 16,
            cursor: "col-resize",
            borderRadius: 8,
            background: dividerActive ? "rgba(33, 52, 40, 0.08)" : "transparent",
            transition: "background 120ms ease",
            zIndex: 1,
          }}
        />
        {/* Visible divider rail (unchanged thickness). */}
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
        {/* Permanently visible grab handle, centred vertically. The handle is
            the linked vertical scroll control; it stops propagation so the
            horizontal resize separator beneath it does not also engage. */}
        <div
          onMouseDown={handleScrollDragStart}
          onMouseEnter={() => setHandleHover(true)}
          onMouseLeave={() => setHandleHover(false)}
          title="Drag to scroll both panels"
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 14,
            height: 38,
            cursor: isScrollDragging ? "grabbing" : "grab",
            zIndex: 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <SplitDividerHandle active={dividerActive || handleHover || isScrollDragging} />
        </div>
      </div>

      <div ref={rightPanelRef} style={{ minWidth: 0, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {rightContent}
      </div>
    </div>
  );
}