import { useEffect } from "react";

export const A4_PRINTABLE_HEIGHT_MM = 273;
const HEIGHT_TOLERANCE_PX = 1;

export function planReportBlockPagination({
  blockHeights = [],
  pageHeight,
  forcePageStart = [],
} = {}) {
  const usableHeight = Number(pageHeight);
  if (!Number.isFinite(usableHeight) || usableHeight <= 0) return [];

  let remaining = usableHeight;
  return blockHeights.map((rawHeight, index) => {
    const height = Math.max(0, Number(rawHeight) || 0);
    const forced = forcePageStart[index] === true && index > 0;
    const needsNewPage = forced || height > remaining + HEIGHT_TOLERANCE_PX;
    if (needsNewPage) remaining = usableHeight;

    const oversize = height > usableHeight + HEIGHT_TOLERANCE_PX;
    remaining = oversize ? 0 : Math.max(0, remaining - height);

    return Object.freeze({
      index,
      height,
      needsNewPage,
      oversize,
      remaining,
    });
  });
}

function pixelsPerMillimetre(root) {
  const probe = document.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText = "position:absolute;visibility:hidden;pointer-events:none;width:100mm;height:1px;";
  root.appendChild(probe);
  const pixels = probe.getBoundingClientRect().width / 100;
  probe.remove();
  return Number.isFinite(pixels) && pixels > 0 ? pixels : 96 / 25.4;
}

export function paginateTechnicalReportBlocks(root) {
  if (!root) return [];

  const blocks = Array.from(root.querySelectorAll("[data-report-block]"))
    .filter((block) => !block.parentElement?.closest?.("[data-report-block]"));

  blocks.forEach((block) => {
    block.classList.remove("report-force-new-page");
    block.removeAttribute("data-report-block-oversize");
  });

  const pageHeight = A4_PRINTABLE_HEIGHT_MM * pixelsPerMillimetre(root);
  const plan = planReportBlockPagination({
    blockHeights: blocks.map((block) => {
      const renderedHeight = block.getBoundingClientRect().height;
      const contentHeight = block.scrollHeight;
      return Math.max(renderedHeight, contentHeight);
    }),
    pageHeight,
    forcePageStart: blocks.map((block) => block.dataset.reportPageStart === "true"),
  });

  plan.forEach((entry) => {
    const block = blocks[entry.index];
    if (entry.needsNewPage) block.classList.add("report-force-new-page");
    if (entry.oversize) block.setAttribute("data-report-block-oversize", "true");
    block.style.setProperty("--report-measured-height-px", String(entry.height));
  });

  return plan;
}

export default function useReportBlockPagination(rootRef, readinessKey) {
  useEffect(() => {
    const run = () => paginateTechnicalReportBlocks(rootRef.current);
    const media = window.matchMedia?.("print");

    const onMediaChange = (event) => {
      if (event.matches) run();
    };

    window.addEventListener("beforeprint", run);
    media?.addEventListener?.("change", onMediaChange);

    return () => {
      window.removeEventListener("beforeprint", run);
      media?.removeEventListener?.("change", onMediaChange);
    };
  }, [rootRef, readinessKey]);
}
