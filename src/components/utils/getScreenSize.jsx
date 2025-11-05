// Single source of truth for screen size math

export function aspectToWH(aspect) {
  const s = String(aspect || "16:9");
  const [w, h] = s.split(":").map(Number);
  return (Number.isFinite(w) && Number.isFinite(h) && h > 0) ? { w, h } : { w: 16, h: 9 };
}

export function computeScreenWidthMeters(opts = {}) {
  const {
    visibleWidthInches,
    aspectRatio,
    manualMode,
    manualWidthM,
    manualHeightM
  } = opts;

  // Manual overrides take precedence
  if (manualMode) {
    if (Number.isFinite(manualWidthM) && manualWidthM > 0) return manualWidthM;
    if (Number.isFinite(manualHeightM) && manualHeightM > 0) {
      const { w, h } = aspectToWH(aspectRatio);
      return (manualHeightM * w) / h;
    }
  }

  // Width in inches → meters
  if (Number.isFinite(visibleWidthInches) && visibleWidthInches > 0) {
    return (visibleWidthInches * 0.0254);
  }

  // Fallback (never return undefined)
  return 2.54; // sane default (≈100")
}