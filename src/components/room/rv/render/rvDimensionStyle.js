/**
 * rvDimensionStyle
 *
 * The one visual language for the plan's proximity dimension guides: dashed
 * brand-green leaders, tick end-caps, a small origin anchor and bold small
 * labels. Shared by the RSP / MLP drag guide, the seat drag guide and the seat
 * Dimensions-mode guide, so every measurement on the plan reads identically.
 */

export const DIM_TEXT_SIZE = 10;
export const DIM_TEXT_WEIGHT = 600;
export const DIM_TEXT_FILL = '#213428';
export const DIM_STROKE = '#3E6B4F';
export const DIM_STROKE_W = 1;
export const DIM_DASH = '3,3';
export const DIM_TICK = 5;

const TEXT_HALF_W = 50;
const TEXT_H = DIM_TEXT_SIZE;
const SAFE_PAD = 4;

export function clampDimTextX(x, svgW) {
  return Math.max(TEXT_HALF_W + SAFE_PAD, Math.min(x, svgW - TEXT_HALF_W - SAFE_PAD));
}

export function clampDimTextY(y, svgH) {
  return Math.max(TEXT_H + SAFE_PAD, Math.min(y, svgH - TEXT_H - SAFE_PAD));
}

export function formatDimMeters(value) {
  return `${Number(value).toFixed(2)} m`;
}