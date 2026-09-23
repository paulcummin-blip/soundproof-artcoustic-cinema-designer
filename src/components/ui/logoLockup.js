// logoLockup.js
// ---------------------------------------------------------------------------
// Pure utility module for the Sound Proof partner-logo lockup system.
//
// DESIGN PRINCIPLE:
//   "Sound Proof is always the master brand. The partner/dealer logo is
//    always secondary."
//
// The Sound Proof wordmark width is the scale anchor. The partner logo is
// sized relative to it based on detected shape (aspect ratio), with
// admin-overridable manual type selection.
//
// This module is PURE: no React, no side effects, no I/O.
// ---------------------------------------------------------------------------

// ── Shape enum (detected from aspect ratio) ──────────────────────────────

export const LOGO_SHAPES = {
  VERY_WIDE: "very_wide", // aspect > 4.0
  WIDE: "wide", // 2.0–4.0
  BALANCED: "balanced", // 0.8–2.0
  TALL: "tall", // 0.4–0.8
  VERY_TALL: "very_tall", // < 0.4
};

// ── Manual type enum (admin override) ────────────────────────────────────

export const LOGO_TYPES = {
  AUTO: "auto",
  WORDMARK: "wordmark",
  SQUARE: "square",
  TALL: "tall",
  ICON_WORDMARK: "icon_wordmark",
};

// ── Shape-based sizing rules ──────────────────────────────────────────────
//
// widthRatio      — max logo width as fraction of SP wordmark width
// maxHeightRatio  — max logo height as fraction of partner box height
// boxHeightRatio  — partner box height as fraction of SP wordmark width
//
// These rules ensure the partner logo always reads as a partner endorsement,
// never a second headline. Square/tall logos are constrained more tightly
// than wide wordmarks to prevent visual dominance.

const SHAPE_RULES = {
  very_wide: { widthRatio: 0.88, maxHeightRatio: 0.42, boxHeightRatio: 0.45 },
  wide: { widthRatio: 0.88, maxHeightRatio: 0.42, boxHeightRatio: 0.45 },
  balanced: { widthRatio: 0.60, maxHeightRatio: 0.58, boxHeightRatio: 0.45 },
  tall: { widthRatio: 0.42, maxHeightRatio: 0.70, boxHeightRatio: 0.48 },
  very_tall: { widthRatio: 0.35, maxHeightRatio: 0.72, boxHeightRatio: 0.48 },
};

// Manual type → shape mapping (for admin override)
const TYPE_TO_SHAPE = {
  wordmark: "wide",
  square: "balanced",
  tall: "tall",
  icon_wordmark: "wide",
};

// ── Shape detection ───────────────────────────────────────────────────────

/**
 * Detect logo shape from natural pixel dimensions.
 *
 * @param {number} naturalWidth
 * @param {number} naturalHeight
 * @returns {string} one of LOGO_SHAPES
 */
export function detectLogoShape(naturalWidth, naturalHeight) {
  if (!naturalWidth || !naturalHeight) return LOGO_SHAPES.WIDE;
  const aspect = naturalWidth / naturalHeight;
  if (aspect > 4.0) return LOGO_SHAPES.VERY_WIDE;
  if (aspect >= 2.0) return LOGO_SHAPES.WIDE;
  if (aspect >= 0.8) return LOGO_SHAPES.BALANCED;
  if (aspect >= 0.4) return LOGO_SHAPES.TALL;
  return LOGO_SHAPES.VERY_TALL;
}

/**
 * Resolve the effective logo shape, honouring manual type override.
 *
 * @param {string} manualType - one of LOGO_TYPES (auto = detect from image)
 * @param {number} naturalWidth
 * @param {number} naturalHeight
 * @returns {string} one of LOGO_SHAPES
 */
export function resolveLogoShape(manualType, naturalWidth, naturalHeight) {
  if (manualType && manualType !== LOGO_TYPES.AUTO && TYPE_TO_SHAPE[manualType]) {
    return TYPE_TO_SHAPE[manualType];
  }
  return detectLogoShape(naturalWidth, naturalHeight);
}

// ── Logo dimension computation ────────────────────────────────────────────

/**
 * Estimate the logo height as a fraction of SP wordmark width.
 *
 * Used to pre-compute height constraints before the full dimension
 * calculation. Returns boxHeightRatio × maxHeightRatio × scale.
 *
 * @param {string} shape - one of LOGO_SHAPES
 * @param {number} [scale=1] - manual scale multiplier
 * @returns {number} fraction of SP width
 */
export function estimateLogoHeightFraction(shape, scale = 1) {
  const rule = SHAPE_RULES[shape] || SHAPE_RULES.wide;
  return rule.boxHeightRatio * rule.maxHeightRatio * scale;
}

/**
 * Compute partner logo dimensions within the lockup.
 *
 * The logo is fit inside a bounding box derived from the SP wordmark width.
 * Both width and height constraints are enforced while preserving the
 * logo's original aspect ratio (no stretching or distortion).
 *
 * @param {object} params
 * @param {number} params.spWidth - Sound Proof wordmark rendered width (px)
 * @param {number} params.logoAspect - logo aspect ratio (naturalWidth / naturalHeight)
 * @param {string} params.shape - one of LOGO_SHAPES
 * @param {number} [params.scale=1] - manual scale multiplier (0.8–1.2)
 * @returns {{ logoWidth: number, logoHeight: number, boxWidth: number, boxHeight: number }}
 */
export function computeLogoDimensions({ spWidth, logoAspect, shape, scale = 1 }) {
  const rule = SHAPE_RULES[shape] || SHAPE_RULES.wide;
  const boxWidth = spWidth * 0.90;
  const boxHeight = spWidth * rule.boxHeightRatio;

  const maxWidth = spWidth * rule.widthRatio * scale;
  const maxHeight = boxHeight * rule.maxHeightRatio * scale;

  // Fit logo within both constraints, preserving aspect ratio
  let logoWidth = maxWidth;
  let logoHeight = logoAspect > 0 ? logoWidth / logoAspect : maxHeight;

  if (logoHeight > maxHeight) {
    logoHeight = maxHeight;
    logoWidth = logoAspect > 0 ? logoHeight * logoAspect : maxWidth;
  }

  // Hard cap: logo must never exceed the bounding box, even at max scale.
  // The partner logo is always secondary to Sound Proof.
  if (logoWidth > boxWidth) {
    logoWidth = boxWidth;
    logoHeight = logoAspect > 0 ? logoWidth / logoAspect : logoHeight;
  }
  if (logoHeight > boxHeight) {
    logoHeight = boxHeight;
    logoWidth = logoAspect > 0 ? logoHeight * logoAspect : logoWidth;
  }

  return { logoWidth, logoHeight, boxWidth, boxHeight };
}