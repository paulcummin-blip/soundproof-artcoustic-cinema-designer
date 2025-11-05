// Single source of truth for RP22 bands & targets.
// TODO: Replace PLACEHOLDER ranges with your EXACT RP22 values.

export const RP22 = {
  // Horizontal angle bands (degrees) from MLP to WALLS
  // Positive = to the right, negative = to the left (0° is straight ahead to the front wall)
  angleBands: {
    // --- Front wall (use X on y=0) ---
    FrontL: { minDeg: -30, maxDeg: -22 }, // PLACEHOLDER — verify with RP22
    FrontR: { minDeg:  22, maxDeg:  30 }, // PLACEHOLDER — verify with RP22

    // --- Side walls (use Y on x=0 / x=width) ---
    FrontWideL: { minDeg: -60, maxDeg: -50 }, // PLACEHOLDER — verify with RP22
    FrontWideR: { minDeg:  50, maxDeg:  60 }, // PLACEHOLDER — verify with RP22
  },

  // Side/Rear bands: draw on walls spanning the listening area with a margin (metres)
  bands: {
    sideMarginM: 0.15,
    wallInsetM: 0.02,
    bandDepthM: 0.06,
  },

  // Adjacency target ladder (surround-to-surround at each seat)
  adjacencyTargetsDeg: [50, 60, 80], // strict priority ladder

  // Screen/viewing (for seat generation elsewhere if needed)
  viewing: {
    targetHorizontalDeg: 57.5, // RP23 typical target you're using
  },

  // Weights for the optimisation objective (tuned for stable results)
  weights: {
    bandPenalty: 1.0,        // penalty for leaving allowed band
    target50: 0.6,           // penalty weight to hit 50°
    target60: 0.4,           // penalty weight to hit 60°
    target80: 0.25,          // penalty weight to hit 80°
    symmetry:  0.15,         // L/R symmetry nudging
  },
};