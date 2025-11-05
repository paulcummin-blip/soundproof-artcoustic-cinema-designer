// components/models/screen/normalise.js
export function normaliseScreenConfig(screen = {}, dims = {}) {
  const toNum = (v, d = 0) => Number.isFinite(Number(v)) ? Number(v) : d;

  const inchesWidth = toNum(screen.visibleWidthInches, 100); // width in inches
  const arStr = (screen.aspectRatio || "16:9").toString();
  const [arW, arH] = arStr.includes(":")
    ? arStr.split(":").map(n => toNum(n, NaN))
    : [16, 9];
  const ratio = (Number.isFinite(arW) && Number.isFinite(arH) && arW > 0 && arH > 0)
    ? (arW / arH)
    : (16 / 9);

  // width is provided directly in inches; convert to meters
  const viewableWidthM  = toNum(inchesWidth * 0.0254, 2.54);
  const viewableHeightM = viewableWidthM / ratio;

  // 8 cm borders on all sides -> +16 cm to width and +16 cm to height
  const overallWidthM  = viewableWidthM  + 0.16;
  const overallHeightM = viewableHeightM + 0.16;

  const mountMode   = (screen.mountMode === "floating") ? "floating" : "baffle";
  const planeDepthM = (mountMode === "floating") ? toNum(screen.floatDepthM, 0.2) : 0;

  return {
    mountMode,
    aspectRatio: arStr,
    viewableWidthM,
    viewableHeightM,
    overallWidthM,
    overallHeightM,
    planeDepthM
  };
}