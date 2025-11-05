export function computeScreenDimsFromWidthInches(
  viewWidthInches,
  aspect,
  borderCm = 8
) {
  const INCH_TO_M = 0.0254;
  const BORDER_M = Math.max(0, borderCm) / 100;

  const viewWm = Math.max(0, Number(viewWidthInches) || 0) * INCH_TO_M;

  const ratio = aspect === "2.35:1" ? 2.35 : (16 / 9);
  const viewHm = viewWm / ratio;

  const overallWm = viewWm + 2 * BORDER_M;
  const overallHm = viewHm + 2 * BORDER_M;

  return {
    viewable: { w: viewWm, h: viewHm },
    overall:  { w: overallWm, h: overallHm },
  };
}