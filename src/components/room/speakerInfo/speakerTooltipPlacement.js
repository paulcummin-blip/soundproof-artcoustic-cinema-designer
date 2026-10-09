/**
 * Intelligent placement for the speaker information tooltip.
 *
 * Pure geometry: plain rectangles in one coordinate space (container pixels),
 * so it is testable and holds for any room layout, any speaker role and any
 * zoom or pan — nothing here is a fixed per-role offset.
 *
 * Rules, in order:
 *  1. never cover the hovered speaker;
 *  2. prefer the side with the most free space (neighbours and the screen are
 *     passed in as exclusions);
 *  3. flip left/right and above/below automatically near an edge;
 *  4. stay fully inside the visible drawing area.
 */
const DEFAULT_GAP = 10;
const DEFAULT_MARGIN = 6;

const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

const clamp = (value, min, max) => (max < min ? min : Math.min(Math.max(value, min), max));

/**
 * @param {object} params
 * @param {{left:number,top:number,right:number,bottom:number}} params.anchor  hovered speaker, container px
 * @param {{width:number,height:number}} params.size                            measured tooltip size
 * @param {{left:number,top:number,right:number,bottom:number}} params.bounds   visible drawing area
 * @param {Array}  params.exclusions                                           boxes to avoid where practical
 * @param {number} params.gap
 * @param {number} params.margin
 * @returns {{left:number, top:number, side:string}}
 */
export function computeTooltipPlacement({
  anchor,
  size,
  bounds,
  exclusions = [],
  gap = DEFAULT_GAP,
  margin = DEFAULT_MARGIN,
}) {
  const width = Math.max(1, Math.round(Number(size?.width) || 0));
  const height = Math.max(1, Math.round(Number(size?.height) || 0));
  const limit = {
    left: bounds.left + margin,
    top: bounds.top + margin,
    right: bounds.right - margin,
    bottom: bounds.bottom - margin,
  };

  const centreX = anchor.left + (anchor.right - anchor.left - width) / 2;
  const centreY = anchor.top + (anchor.bottom - anchor.top - height) / 2;

  // Preferred order: beside the icon first (least likely to sit over the screen
  // or a neighbouring cabinet in a front elevation), then above, then below.
  const candidates = [
    { side: "right", left: anchor.right + gap, top: centreY },
    { side: "left", left: anchor.left - gap - width, top: centreY },
    { side: "above", left: centreX, top: anchor.top - gap - height },
    { side: "below", left: centreX, top: anchor.bottom + gap },
  ];

  let best = null;
  for (const candidate of candidates) {
    const pos = {
      left: clamp(candidate.left, limit.left, limit.right - width),
      top: clamp(candidate.top, limit.top, limit.bottom - height),
    };
    const box = {
      left: pos.left,
      top: pos.top,
      right: pos.left + width,
      bottom: pos.top + height,
    };
    const coversAnchor = overlaps(box, anchor) ? 1 : 0;
    const blocked = exclusions.reduce((n, e) => (e && overlaps(box, e) ? n + 1 : n), 0);
    const better =
      !best ||
      coversAnchor < best.coversAnchor ||
      (coversAnchor === best.coversAnchor && blocked < best.blocked);
    if (better) best = { pos, coversAnchor, blocked, side: candidate.side };
  }

  return { left: Math.round(best.pos.left), top: Math.round(best.pos.top), side: best.side };
}

/**
 * Maps a box drawn in SVG user units to container pixels.
 * Both rects come from getBoundingClientRect, so the result follows a resize,
 * a zoom or a pan automatically.
 */
export function scaleSvgBoxToContainer(box, svgRect, containerRect, svgWidth) {
  if (!box || !svgRect || !containerRect || !svgWidth) return null;
  const k = svgRect.width / svgWidth;
  const originX = svgRect.left - containerRect.left;
  const originY = svgRect.top - containerRect.top;
  return {
    left: originX + box.left * k,
    top: originY + box.top * k,
    right: originX + box.right * k,
    bottom: originY + box.bottom * k,
  };
}