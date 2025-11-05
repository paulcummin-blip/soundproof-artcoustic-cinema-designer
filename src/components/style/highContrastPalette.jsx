
// High‑contrast, Phase‑1 style colours + simple overlay style.
// Self‑contained so we don't depend on brand tokens.

export const HIGH_CONTRAST_COLORS = {
  "Front L": "#B94A48",
  "Front R": "#213428",      // brand green
  "Centre":  "#C1B6AD",
  "Sub":     "#3E4349",
  "Front Wide": "#D97742",
  "Side Surround": "#4A6FA5",
  "Rear Surround": "#7A4C8D",
  "All": "#213428"
};

// Keep dash only; do not recolor via code to avoid overriding pads
export const HIGH_CONTRAST_OVERLAY_STYLE = {
  dash: "8 5",
  // stroke: (c) => c, // optional identity if needed
  // fill:   (c) => c, // optional identity if needed
};
