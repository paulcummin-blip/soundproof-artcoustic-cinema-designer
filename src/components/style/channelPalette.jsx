
export const CHANNEL_COLORS = {
  All:            "#213428", // deep brand green
  "Front L":      "#0F172A", // slate-900
  "Front R":      "#0F172A", // same as L (front pair)
  "Front Wide":   "#7C2D12", // warm brown
  "Side Surround":"#7C3E2E", // cocoa
  "Rear Surround":"#111827", // near-black (not pure black)
  Centre:         "#1B1A1A",
  Sub:            "#065F46",
};

// hex -> rgba string with alpha
export function withAlpha(hex, alpha = 1) {
  const h = hex.replace("#", "");
  const bigint = parseInt(h, 16);
  const isShort = h.length === 3;
  const r = isShort ? ((bigint >> 8) & 0xF) * 17 : (bigint >> 16) & 255;
  const g = isShort ? ((bigint >> 4) & 0xF) * 17 : (bigint >> 8) & 255;
  const b = isShort ? ((bigint & 0xF) * 17) : (bigint & 255);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// standardised overlay styles per channel group
export const OVERLAY_STYLE = {
  fill(alpha = 0.12, key) {
    return withAlpha(CHANNEL_COLORS[key], alpha);
  },
  stroke(alpha = 0.65, key) {
    return withAlpha(CHANNEL_COLORS[key], alpha);
  },
  dash: "6 4",
  FRONT_WIDE: {
    stroke: '#2b8a3e',
    width: 6,
    tick: '#2b8a3e',
    tickWidth: 3,
    label: '#2b8a3e',
  },
};
