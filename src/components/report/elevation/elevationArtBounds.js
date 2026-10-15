// ---------------------------------------------------------------------------
// elevationArtBounds.js
// ---------------------------------------------------------------------------
// The ONE dependency-free authority for ELEVATION artwork bounds.
//
// An elevation drawing must show a loudspeaker's own technical line art filling
// its physical footprint on a clean white field: no page margin, no frame rule,
// no inset tile. The catalogue artwork is line art supplied on a white page
// (some of it with a thin border rule around the page), so the drawing's own
// bounds have to be found BEFORE it is placed — and it is then placed by
// cropping to those bounds, never by stretching it onto the cabinet's shape.
//
// This module holds the geometry rules only: which pixels count as ink, how the
// meaningful bounds are found in a pixel field, how a declared SVG viewBox is
// read, and whether a crop agrees with the footprint it will be drawn into. It
// has no React, no DOM and no I/O, so the same rules run at render time in the
// app, in the test suite, and in the offline measuring script that records each
// model's bounds.
// ---------------------------------------------------------------------------

/** A pixel at or above this luminance is page, not drawing. */
export const ELEVATION_ART_PAGE_LEVEL = 236;

/** A pixel below this alpha is transparent margin, not drawing. */
export const ELEVATION_ART_ALPHA_FLOOR = 8;

/**
 * Is this pixel part of the drawing?
 * The page an artwork is supplied on is a LIGHT, NEUTRAL field — plain white, or
 * white with a faint grey cast from the export. Both must read as page; the
 * drawing's own line work, including its greys, must not. Transparent margins are
 * page as well. Everything else is the drawing, which is what keeps white areas
 * INSIDE the drawing from being cut away: the trim only walks in from the outer
 * edges and stops at the first drawing pixel it meets.
 */
export function isElevationInk(r, g, b, a, options = {}) {
  const pageLevel = options.pageLevel ?? ELEVATION_ART_PAGE_LEVEL;
  const alphaFloor = options.alphaFloor ?? ELEVATION_ART_ALPHA_FLOOR;
  if (a !== null && a !== undefined && a < alphaFloor) return false;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance < pageLevel;
}

// Trim one axis: walk in from each end past plain margin, and past a thin
// border rule that only frames the page (a narrow band of ink followed by a
// white gap) — a page frame is not part of the speaker.
function trimAxis(counts, span, options = {}) {
  const dimension = counts.length;
  if (!dimension) return null;

  const minDensity = options.minDensity ?? 0.03;
  const threshold = Math.max(2, Math.ceil(minDensity * span));
  const isContent = counts.map((count) => count >= threshold);

  const ruleMaxWidth = Math.max(3, Math.ceil((options.borderRuleMax ?? 0.02) * dimension));
  const gapMinWidth = Math.max(2, Math.ceil((options.gapMin ?? 0.01) * dimension));

  const nextContent = (from) => {
    for (let i = from; i < dimension; i += 1) if (isContent[i]) return i;
    return -1;
  };
  const prevContent = (from) => {
    for (let i = from; i >= 0; i -= 1) if (isContent[i]) return i;
    return -1;
  };
  const bandEnd = (start) => {
    let i = start;
    while (i + 1 < dimension && isContent[i + 1]) i += 1;
    return i;
  };
  const bandStart = (end) => {
    let i = end;
    while (i - 1 >= 0 && isContent[i - 1]) i -= 1;
    return i;
  };
  const gapAfter = (from) => {
    let i = from;
    while (i < dimension && !isContent[i]) i += 1;
    return i - from;
  };
  const gapBefore = (from) => {
    let i = from;
    while (i >= 0 && !isContent[i]) i -= 1;
    return from - i;
  };

  // A page frame (or a solid rule printed across the sheet) is a band whose ink
  // spans the whole axis AND that hugs the sheet's own edge: it belongs to the
  // page, never to the drawing. Only a band inside that narrow edge margin is
  // treated as a page band, because a cabinet's own edge line also spans the
  // axis — that one is part of the drawing and must be kept.
  const solidDensity = options.solidBandDensity ?? 0.9;
  const edgeMargin = Math.max(2, Math.ceil((options.pageBandEdgeMargin ?? 0.05) * dimension));
  const isSolidBand = (index) => counts[index] >= solidDensity * span;

  let lo = nextContent(0);
  if (lo < 0) return null;
  let hi = prevContent(dimension - 1);
  let frameRuleSkipped = false;
  let pageBandSkipped = false;

  while (lo >= 0 && lo <= edgeMargin && isSolidBand(lo)) {
    pageBandSkipped = true;
    lo = nextContent(lo + 1);
  }
  while (hi >= 0 && hi >= dimension - 1 - edgeMargin && isSolidBand(hi)) {
    pageBandSkipped = true;
    hi = prevContent(hi - 1);
  }
  if (lo < 0 || hi < 0 || hi < lo) return null;

  // Front edge — skip a page frame rule, stop at the drawing.
  for (;;) {
    const end = bandEnd(lo);
    const gap = gapAfter(end + 1);
    const isThinRule = end - lo + 1 <= ruleMaxWidth && gap >= gapMinWidth;
    if (!isThinRule) break;
    const next = nextContent(end + 1 + gap);
    if (next < 0) break;
    frameRuleSkipped = true;
    lo = next;
  }

  // Back edge — mirror of the front edge.
  for (;;) {
    const start = bandStart(hi);
    const gap = gapBefore(start - 1);
    const isThinRule = hi - start + 1 <= ruleMaxWidth && gap >= gapMinWidth;
    if (!isThinRule) break;
    const prev = prevContent(start - 1 - gap);
    if (prev < 0) break;
    frameRuleSkipped = true;
    hi = prev;
  }

  return { lo, hi, frameRuleSkipped, pageBandSkipped };
}

/**
 * Find the drawing's own bounds in a pixel field.
 * `inkAt(x, y)` answers whether that pixel is part of the drawing (see
 * isElevationInk). Returns null when the field holds no drawing at all, so the
 * caller keeps the artwork unchanged rather than cropping it to nothing.
 */
export function detectElevationArtBounds({ width, height, inkAt, options = {} }) {
  if (!(width > 0) || !(height > 0) || typeof inkAt !== "function") return null;

  const colCounts = new Array(width).fill(0);
  const rowCounts = new Array(height).fill(0);
  let ink = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (inkAt(x, y)) {
        colCounts[x] += 1;
        rowCounts[y] += 1;
        ink += 1;
      }
    }
  }
  if (ink === 0) return null;

  const columns = trimAxis(colCounts, height, options);
  const rows = trimAxis(rowCounts, width, options);
  if (!columns || !rows) return null;

  return {
    x: columns.lo,
    y: rows.lo,
    width: columns.hi - columns.lo + 1,
    height: rows.hi - rows.lo + 1,
    trimmed: {
      left: columns.lo,
      top: rows.lo,
      right: width - 1 - columns.hi,
      bottom: height - 1 - rows.hi,
    },
    fullFrame: columns.lo === 0 && columns.hi === width - 1 && rows.lo === 0 && rows.hi === height - 1,
    frameRuleSkipped: columns.frameRuleSkipped || rows.frameRuleSkipped,
    inkRatio: ink / (width * height),
    method: "raster-bounds",
  };
}

/** Read a declared SVG viewBox into the same bounds shape. Vector artwork
 *  already states its own drawing box, so nothing has to be measured. */
export function boundsFromViewBox(viewBox) {
  const parts = String(viewBox || "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [x, y, width, height] = parts;
  if (!(width > 0) || !(height > 0)) return null;
  return { x, y, width, height, trimmed: null, fullFrame: false, frameRuleSkipped: false, inkRatio: null, method: "viewBox" };
}

/** Aspect-ratio agreement between a crop and the footprint it is drawn into.
 *  A drawing whose own proportions match the cabinet's face is placed edge to
 *  edge; one that does not is fitted inside the footprint without distortion. */
export function elevationArtAspectCheck(crop, box, tolerance = 0.12) {
  if (!(crop?.width > 0) || !(crop?.height > 0) || !(box?.width > 0) || !(box?.height > 0)) {
    return { known: false, ok: false };
  }
  const cropAspect = crop.width / crop.height;
  const boxAspect = box.width / box.height;
  const drift = Math.abs(cropAspect / boxAspect - 1);
  return { known: true, ok: drift <= tolerance, cropAspect, boxAspect, drift };
}