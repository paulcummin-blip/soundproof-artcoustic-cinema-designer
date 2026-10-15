// ---------------------------------------------------------------------------
// elevationArtAuthority.js
// ---------------------------------------------------------------------------
// The ONE measured/approved crop authority for every ELEVATION artwork.
//
// The catalogue artwork is line art supplied on a white PAGE: an outer sheet
// margin, sometimes a thin border rule framing the sheet, and only then the
// loudspeaker's own drawing. Drawn whole inside a cabinet's footprint that page
// reads as an image tile with a white/grey box around the speaker, and it makes
// the speaker's apparent size wrong. Each artwork therefore carries a CROP — the
// drawing's own bounds inside its file — and the elevation drawings place the
// crop, never the page.
//
// The numbers here are RECORDED, not measured at render time. They come from the
// accepted measurement pass (src/test/elevation-art-measurement.test.mjs, run by
// scripts/measureElevationArt.mjs), which finds each file's ink bounds with the
// same rules the app renders with — or, where that pass is known to be
// unreliable for an asset, from the already-verified crop that was hand-measured
// from the file and has been shipping.
//
//   mode 'measured'  the accepted measurement pass is trustworthy for this
//                    artwork: the drawing's ink bounds ARE the speaker. Used for
//                    the line drawings whose measurement agrees with the
//                    cabinet's own face proportions.
//
//   mode 'approved'  the measurement pass is NOT trustworthy for this artwork,
//                    so its crop is the hand-verified box measured directly from
//                    the file. Two different reasons, both recorded per entry:
//                    a wide, line-sparse drawing (a soundbar: mostly long thin
//                    horizontal rules) gives the ink detector too little to find
//                    and its measurement collapses onto the driver cluster; and
//                    a file whose declared aspect is simply not the drawing's
//                    own (Q 6-3, the C4-1 variants, C-1) already had its crop
//                    measured and verified by hand.
//
// No entry here changes geometry, dimensions, position, model assignment, RP22
// or RP23, and nothing here writes to an asset: the original files are untouched
// and are always the thing being drawn.
//
// A model with no entry, or an entry that cannot be trusted, is NOT cropped. It
// is drawn from its own declared box exactly as it was before this authority
// existed, fitted without distortion, and the fallback is logged — see
// resolveElevationArtwork() and elevationArtFitRatio() below.
// ---------------------------------------------------------------------------

/**
 * The box a normalised artwork is drawn into: the drawing fills the cabinet's
 * own footprint, because the page around it is gone.
 */
export const ELEVATION_ART_FIT_NORMALISED = 1;

/**
 * The box an UN-normalised artwork is drawn into. Catalogue artwork that still
 * carries its page is drawn larger than the cabinet so the drawing inside the
 * page covers the footprint — the long-standing behaviour, kept exactly as it
 * was for every model this authority does not normalise.
 */
export const ELEVATION_ART_FIT_LEGACY = 0.72;

export const ELEVATION_ART_MODE = Object.freeze({
  MEASURED: "measured",
  APPROVED: "approved",
  FALLBACK: "fallback",
});

const MEASUREMENT = "src/test/elevation-art-measurement.test.mjs";

/**
 * One entry per elevation artwork, keyed by the artwork key the face icons use.
 *
 *   native   the source file's own pixel size. The crop is expressed in exactly
 *            this space, and the image is drawn at this size so the crop bites
 *            instead of the drawing being resized onto it.
 *   box      the drawing's own bounds — the crop.
 *   face     the cabinet face proportions the crop was checked against.
 */
export const ELEVATION_ART_AUTHORITY = Object.freeze({
  q43: {
    artwork: "Q4-3 front",
    href: "https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/689388d97_Q4-3front.png",
    native: { width: 1024, height: 769 },
    box: { x: 54, y: 53, width: 918, height: 662 },
    mode: ELEVATION_ART_MODE.MEASURED,
    source: MEASUREMENT,
    note: "The sheet edge frame and margin are trimmed; the drawing's own bound is kept.",
  },
  q45: {
    artwork: "Q4-5 front",
    href: "https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/d1376c28d_Q4-5front.png",
    native: { width: 1024, height: 817 },
    box: { x: 39, y: 42, width: 948, height: 733 },
    mode: ELEVATION_ART_MODE.MEASURED,
    source: MEASUREMENT,
    note: "STALE VIEWBOX: the icon declared a square box; the drawing is not square, so the declared box is not used.",
  },
  q85: {
    artwork: "Q8-5 front",
    href: "https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/8eb64d06e_Q8-5Front.png",
    native: { width: 859, height: 1024 },
    box: { x: 37, y: 34, width: 783, height: 960 },
    mode: ELEVATION_ART_MODE.MEASURED,
    source: MEASUREMENT,
    note: "STALE VIEWBOX: the icon declared a square box; the drawing is portrait, so the declared box is not used.",
  },
  q63: {
    artwork: "Q6-3 front",
    href: "https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/9a1ad66a6_Q6-3front.png",
    native: { width: 1024, height: 1021 },
    box: { x: 54, y: 52, width: 916, height: 916 },
    mode: ELEVATION_ART_MODE.APPROVED,
    source: "measured from the file and verified in the Q 6-3 elevation artwork tests",
    note: "Page screenshot: the sheet's dark edge frame and its white margin are both excluded; the crop is the cabinet's own square outline.",
  },
  evolve_2_1: {
    artwork: "EVOLVE 2-1 front",
    href: "https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/bb66545fd_Evolve2-1front.png",
    native: { width: 1024, height: 1024 },
    box: { x: 29, y: 88, width: 963, height: 850 },
    mode: ELEVATION_ART_MODE.MEASURED,
    source: MEASUREMENT,
    note: "STALE VIEWBOX: the icon declared the whole square page; the drawing sits inside it with wide top and bottom margins, so the measured drawing bounds are used.",
  },
  evolve_3_1: {
    artwork: "EVOLVE 3-1 front",
    href: "https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/053510389_Evolve3-1front.png",
    native: { width: 751, height: 1024 },
    box: { x: 139, y: 10, width: 443, height: 993 },
    mode: ELEVATION_ART_MODE.MEASURED,
    source: MEASUREMENT,
    note: "STALE VIEWBOX: the file's declared box is the page, which carries wide side margins; the measured drawing bounds are used instead.",
  },
  evolve_4_2: {
    artwork: "EVOLVE 4-2 front",
    href: "https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/fa3b2393b_Evolve4-2front.png",
    native: { width: 747, height: 1024 },
    box: { x: 41, y: 10, width: 666, height: 994 },
    mode: ELEVATION_ART_MODE.MEASURED,
    source: MEASUREMENT,
    note: "STALE VIEWBOX: the icon declared a square page; the measured drawing bounds are used.",
  },
  evolve_6_3: {
    artwork: "EVOLVE 6-3 front",
    href: "https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/3010c90e8_Evolve6-3front.png",
    native: { width: 747, height: 1024 },
    box: { x: 42, y: 24, width: 664, height: 978 },
    mode: ELEVATION_ART_MODE.MEASURED,
    source: MEASUREMENT,
    note: "STALE VIEWBOX: the icon declared a square page; the measured drawing bounds are used.",
  },
  evolve_8_4: {
    artwork: "EVOLVE 8-4 front",
    href: "https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/6f0f8bcb9_Evolve8-4front.png",
    native: { width: 748, height: 1024 },
    box: { x: 40, y: 24, width: 667, height: 978 },
    mode: ELEVATION_ART_MODE.MEASURED,
    source: MEASUREMENT,
    note: "STALE VIEWBOX: the icon declared a square page; the measured drawing bounds are used.",
  },
  c41_1222: {
    artwork: "C4-1 1222 mm front",
    href: "https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/0103ea1cc_ChatGPTImage9Oct202610_47_24.png",
    native: { width: 2172, height: 724 },
    box: { x: 45, y: 257, width: 2083, height: 208 },
    mode: ELEVATION_ART_MODE.APPROVED,
    source: "measured from the file and verified in the C4-1 cabinet variant tests",
    note: "The automated pass cannot be used on a long, line-sparse soundbar drawing: its ink bound collapses onto the driver cluster, so the hand-measured crop is the authority.",
  },
  c41_1441: {
    artwork: "C4-1 1441 mm front",
    href: "https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/40ad34db7_ChatGPTImage9Oct202610_49_42.png",
    native: { width: 2167, height: 726 },
    box: { x: 36, y: 275, width: 2095, height: 170 },
    mode: ELEVATION_ART_MODE.APPROVED,
    source: "measured from the file and verified in the C4-1 cabinet variant tests",
    note: "As the 1222 mm variant: the hand-measured crop is the authority.",
  },
  c41_1711: {
    artwork: "C4-1 1711 mm front",
    href: "https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/7759b8f47_ChatGPTImage9Oct202610_54_00.png",
    native: { width: 2167, height: 726 },
    box: { x: 35, y: 277, width: 2097, height: 149 },
    mode: ELEVATION_ART_MODE.APPROVED,
    source: "measured from the file and verified in the C4-1 cabinet variant tests",
    note: "As the 1222 mm variant: the hand-measured crop is the authority.",
  },
  c1: {
    artwork: "C-1 front",
    href: "https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/634ab2ddc_Screenshot2026-10-09at094937.png",
    native: { width: 1250, height: 322 },
    box: { x: 6, y: 4, width: 1240, height: 312 },
    mode: ELEVATION_ART_MODE.APPROVED,
    source: "measured from the file and verified in the display label parity tests",
    note: "Hand-measured crop, already shipping. C-1 keeps its own long-established line-art treatment unchanged.",
    preserveAspect: "none",
  },
});

// ─── Fallback reporting ──────────────────────────────────────────────────────
// A fallback is a normal, correct outcome: an artwork this authority has no
// trustworthy crop for is simply drawn unchanged. It is reported once per
// artwork per session so it is visible without filling the console during a
// report composition.

const loggedFallbacks = new Set();

export const NORMALISATION_FALLBACK = "NORMALISATION_FALLBACK";

export function logNormalisationFallback(key, reason) {
  const marker = `${key}:${reason}`;
  if (loggedFallbacks.has(marker)) return;
  loggedFallbacks.add(marker);
  // eslint-disable-next-line no-console
  console.warn(NORMALISATION_FALLBACK, { artworkKey: key, reason });
}

/** Test-only: forget the logged fallbacks so a suite can assert the log. */
export function resetNormalisationFallbackLog() {
  loggedFallbacks.clear();
}

/**
 * The crop for one artwork, or an explicit fallback.
 *
 *   { mode: 'measured' | 'approved', box, native, preserveAspect, fitRatio }
 *   { mode: 'fallback', reason, box: null, fitRatio: LEGACY }
 *
 * A fallback carries no box: the caller draws its own declared box, unchanged.
 */
export function resolveElevationArtwork(key) {
  const entry = ELEVATION_ART_AUTHORITY[key] || null;
  if (!entry) {
    logNormalisationFallback(key, "no-crop-metadata");
    return {
      key,
      mode: ELEVATION_ART_MODE.FALLBACK,
      reason: "no-crop-metadata",
      box: null,
      fitRatio: ELEVATION_ART_FIT_LEGACY,
    };
  }
  const box = entry.box;
  const sane = box
    && box.width > 0
    && box.height > 0
    && box.x >= 0
    && box.y >= 0
    && box.x + box.width <= entry.native.width
    && box.y + box.height <= entry.native.height;
  if (!sane) {
    logNormalisationFallback(key, "crop-outside-asset");
    return {
      key,
      mode: ELEVATION_ART_MODE.FALLBACK,
      reason: "crop-outside-asset",
      box: null,
      fitRatio: ELEVATION_ART_FIT_LEGACY,
    };
  }
  return {
    key,
    mode: entry.mode,
    artwork: entry.artwork,
    source: entry.source,
    note: entry.note,
    box,
    native: entry.native,
    preserveAspect: entry.preserveAspect || "xMidYMid meet",
    fitRatio: ELEVATION_ART_FIT_NORMALISED,
  };
}

/**
 * How much larger than the cabinet's own footprint an artwork is drawn.
 *
 * A normalised artwork is drawn AT the footprint: its page is cropped away, so
 * the drawing itself is the footprint. An artwork this authority does not
 * normalise keeps the long-standing enlargement, because its page is still
 * inside the box. The elevation drawings read this — there is no second copy of
 * the figure at a draw site.
 */
export function elevationArtFitRatio(key) {
  return resolveElevationArtwork(key).fitRatio;
}