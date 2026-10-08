// The single authority for the manual screen configuration's persistence shape.
//
// The live authority is appState.screen.manualSize, written by the Screen
// Configuration panel. This module is the ONLY place that maps it to the fields
// a project stores and back again, so the saved controls, the screen drawing and
// the screen geometry can never disagree with one another.
//
// Persisted shape:
//   manual_dimensions / manual_width_m / manual_height_m — the flat trio that
//     every existing consumer (RSP, RP23, geometry, reports) already reads.
//   screen_manual_config — the same configuration plus its mode and inputs, so an
//     override is restored exactly as the designer left it (Width × Height or
//     Diagonal + Aspect), not merely re-derived into metres.
//
// Pure: no React, no side effects.

const CANONICAL_MODES = new Set(["wh", "diagonal"]);
const DEFAULT_ASPECT = "16:9";
// The UI's own starting values for the diagonal mode's inputs. They are inert
// while the override is in Width x Height mode, and applying the same defaults
// on both sides of the round trip keeps a saved record byte-stable.
const DEFAULT_DIAGONAL_INCHES = 100;
const DEFAULT_CUSTOM_ASPECT_W = 16;
const DEFAULT_CUSTOM_ASPECT_H = 9;

function toPositiveNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function canonicalMode(mode) {
  return CANONICAL_MODES.has(mode) ? mode : "wh";
}

/**
 * The canonical persisted configuration for a live screen object.
 * Always returns the same keys, so a restored design's signature never drifts
 * between the live state and the loaded baseline.
 *
 * @param {object} screen - the live screen state (appState.screen)
 * @returns {object} the persisted manual configuration
 */
export function manualScreenConfigForPersist(screen) {
  const manualSize = screen?.manualSize;

  if (manualSize?.enabled === true) {
    return {
      enabled: true,
      mode: canonicalMode(manualSize.mode),
      widthM: toPositiveNumber(manualSize.widthM),
      heightM: toPositiveNumber(manualSize.heightM),
      diagonalInches: toPositiveNumber(manualSize.diagonalInches) || DEFAULT_DIAGONAL_INCHES,
      aspect: typeof manualSize.aspect === "string" && manualSize.aspect ? manualSize.aspect : DEFAULT_ASPECT,
      customAspectW: toPositiveNumber(manualSize.customAspectW) || DEFAULT_CUSTOM_ASPECT_W,
      customAspectH: toPositiveNumber(manualSize.customAspectH) || DEFAULT_CUSTOM_ASPECT_H,
    };
  }

  // Legacy projects carry the configuration in the flat fields only.
  if (screen?.manualMode === true) {
    const widthM = toPositiveNumber(screen?.manualWidthM);
    const heightM = toPositiveNumber(screen?.manualHeightM);
    if (widthM > 0 && heightM > 0) {
      return {
        enabled: true,
        mode: "wh",
        widthM,
        heightM,
        diagonalInches: DEFAULT_DIAGONAL_INCHES,
        aspect: DEFAULT_ASPECT,
        customAspectW: DEFAULT_CUSTOM_ASPECT_W,
        customAspectH: DEFAULT_CUSTOM_ASPECT_H,
      };
    }
  }

  return {
    enabled: false,
    mode: "wh",
    widthM: 0,
    heightM: 0,
    diagonalInches: DEFAULT_DIAGONAL_INCHES,
    aspect: DEFAULT_ASPECT,
    customAspectW: DEFAULT_CUSTOM_ASPECT_W,
    customAspectH: DEFAULT_CUSTOM_ASPECT_H,
  };
}

/**
 * Restore the live manualSize from a persisted project (Project + version
 * design_state merged). Falls back to the flat manual trio for projects saved
 * before the full configuration was stored.
 *
 * @param {object} project - merged project record
 * @returns {object|undefined} the live manualSize, or undefined when none is configured
 */
export function manualSizeFromPersisted(project) {
  const config = project?.screen_manual_config;

  if (config?.enabled === true) {
    return {
      enabled: true,
      mode: canonicalMode(config.mode),
      widthM: toPositiveNumber(config.widthM),
      heightM: toPositiveNumber(config.heightM),
      diagonalInches: toPositiveNumber(config.diagonalInches) || DEFAULT_DIAGONAL_INCHES,
      aspect: typeof config.aspect === "string" && config.aspect ? config.aspect : DEFAULT_ASPECT,
      customAspectW: toPositiveNumber(config.customAspectW) || DEFAULT_CUSTOM_ASPECT_W,
      customAspectH: toPositiveNumber(config.customAspectH) || DEFAULT_CUSTOM_ASPECT_H,
    };
  }

  const widthM = toPositiveNumber(project?.manual_width_m);
  const heightM = toPositiveNumber(project?.manual_height_m);

  if (project?.manual_dimensions === true) {
    return {
      enabled: true,
      mode: "wh",
      widthM,
      heightM,
      diagonalInches: DEFAULT_DIAGONAL_INCHES,
      aspect: DEFAULT_ASPECT,
      customAspectW: DEFAULT_CUSTOM_ASPECT_W,
      customAspectH: DEFAULT_CUSTOM_ASPECT_H,
    };
  }

  return undefined;
}