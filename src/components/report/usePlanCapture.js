import { useEffect } from "react";

const MIN_EXPORT_BBOX_PX = 200;

const hasExportBounds = (svg) => {
  try { return !!svg?.querySelector?.("#export-bounds"); } catch { return false; }
};

function stripViewportTransforms(svg) {
  try {
    const anchor = svg.querySelector("#export-crop-bounds") || svg.querySelector("#export-bounds");
    let node = anchor?.parentNode;
    while (node?.nodeName?.toLowerCase() !== "svg") {
      if (node?.nodeName?.toLowerCase() === "g") {
        node.removeAttribute("transform");
        node.removeAttribute("clip-path");
        node.removeAttribute("clipPath");
        if (node.style) { node.style.transform = "none"; node.style.transformOrigin = "0 0"; }
      }
      node = node?.parentNode;
    }
  } catch { /* optional export cleanup */ }
}

function measureClone(svg, selector) {
  let host = null;
  try {
    const element = svg.querySelector(selector);
    if (!element) return null;
    host = document.createElement("div");
    host.style.cssText = "position:fixed;left:-10000px;top:-10000px;width:1px;height:1px;overflow:hidden;pointer-events:none;opacity:0;";
    document.body.appendChild(host);
    host.appendChild(svg);
    const bounds = element.getBBox();
    return bounds?.width > 0 && bounds?.height > 0
      ? { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
      : null;
  } catch { return null; }
  finally { if (host?.parentNode) host.parentNode.removeChild(host); }
}

function drawDebug(ctx, width, height, info, enabled) {
  if (!enabled) return;
  const lines = [
    `PLAN: ${info.planLabel || "?"}`,
    `SRC: ${info.baseRectSource || "?"}`,
    `crop: x${Math.round(info.cropRect?.x || 0)} y${Math.round(info.cropRect?.y || 0)} w${Math.round(info.cropRect?.width || 0)} h${Math.round(info.cropRect?.height || 0)}`,
    `bbox: x${Math.round(info.contentBbox?.x || 0)} y${Math.round(info.contentBbox?.y || 0)} w${Math.round(info.contentBbox?.width || 0)} h${Math.round(info.contentBbox?.height || 0)}`,
    `png : ${width} x ${height}`,
  ];
  ctx.font = "12px monospace";
  const boxWidth = Math.max(...lines.map((line) => ctx.measureText(line).width)) + 20;
  const boxHeight = lines.length * 16 + 20;
  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.fillRect(20, height - boxHeight - 20, boxWidth, boxHeight);
  ctx.fillStyle = "#FFFFFF";
  ctx.textBaseline = "top";
  lines.forEach((line, index) => ctx.fillText(line, 30, height - boxHeight - 10 + index * 16));
}

export function usePlanCapture({ isPrinting, imageDataUrl, setImageDataUrl, selector, planLabel, debugPlanCapture, exportGuardRef, setExportStatus, setIsPrinting }) {
  useEffect(() => {
    if (!isPrinting || imageDataUrl !== null) return undefined;
    setExportStatus(`Capturing ${planLabel}: waiting for SVG…`);
    let attempts = 0;
    let retryTimer = null;
    const retry = (fn) => { retryTimer = setTimeout(fn, 100); };
    const skipOrRetry = (fn) => attempts < 20 ? retry(fn) : setImageDataUrl("__SKIP__");

    const capture = () => {
      attempts += 1;
      try {
        const svg = document.querySelector(selector)?.querySelector("svg");
        const anchor = svg?.querySelector("#export-crop-bounds") || svg?.querySelector("#export-bounds");
        if (!svg || !anchor || !hasExportBounds(svg)) return skipOrRetry(capture);
        try {
          const bounds = anchor.getBBox?.();
          if (bounds && (bounds.width < MIN_EXPORT_BBOX_PX || bounds.height < MIN_EXPORT_BBOX_PX)) return skipOrRetry(capture);
        } catch { /* continue with clone measurement */ }

        const clone = svg.cloneNode(true);
        clone.style.opacity = "1";
        stripViewportTransforms(clone);
        const crop = clone.querySelector("#export-crop-bounds");
        const cropRect = crop ? { x: Number(crop.getAttribute("x")), y: Number(crop.getAttribute("y")), width: Number(crop.getAttribute("width")), height: Number(crop.getAttribute("height")) } : null;
        const bounds = measureClone(clone, "#export-content-bounds");
        const base = bounds?.width > 0 ? bounds : cropRect;
        if (!base?.width) return skipOrRetry(capture);

        const buffer = 80;
        const viewBox = { x: base.x - buffer, y: base.y - buffer, width: base.width + buffer * 2, height: base.height + buffer * 2 };
        clone.setAttribute("viewBox", `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
        clone.setAttribute("preserveAspectRatio", "xMidYMid meet");
        clone.removeAttribute("width");
        clone.removeAttribute("height");
        const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml;charset=utf-8" }));
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = 3000;
          canvas.height = Math.round(3000 * viewBox.height / viewBox.width);
          const context = canvas.getContext("2d");
          context.fillStyle = "#FFFFFF";
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          drawDebug(context, canvas.width, canvas.height, { planLabel, baseRectSource: bounds?.width > 0 ? "bbox" : "cropRect", cropRect, contentBbox: bounds }, debugPlanCapture);
          setImageDataUrl(canvas.toDataURL("image/png"));
          setExportStatus(`${planLabel} captured`);
          URL.revokeObjectURL(url);
        };
        image.onerror = () => { URL.revokeObjectURL(url); skipOrRetry(capture); };
        image.src = url;
      } catch {
        if (attempts < 20) retry(capture);
        else {
          exportGuardRef.current.active = false;
          setIsPrinting(false);
          setTimeout(() => window.print(), 250);
        }
      }
    };

    capture();
    return () => { if (retryTimer) clearTimeout(retryTimer); };
  }, [isPrinting, imageDataUrl, selector, planLabel, debugPlanCapture, exportGuardRef, setExportStatus, setImageDataUrl, setIsPrinting]);
}