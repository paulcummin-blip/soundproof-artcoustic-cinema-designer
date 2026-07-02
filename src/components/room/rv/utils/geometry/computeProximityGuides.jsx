"use client";

/**
 * computeProximityGuides
 *
 * Generic geometry helper for live drag proximity dimension guides.
 * Stage 1 scope: RSP / MLP point only (nearest side wall + nearest front/back wall).
 *
 * Does NOT touch room geometry source of truth — pure read-only calculation.
 */

/**
 * Computes up to 2 proximity guides for a single point (RSP / MLP) against
 * the four room boundaries: nearest left/right wall, nearest front/back wall.
 *
 * @param {{ x: number, y: number, widthM: number, lengthM: number }} params
 * @returns {{
 *   x: number, y: number, widthM: number, lengthM: number,
 *   side: 'left'|'right', sideDist: number,
 *   vert: 'front'|'back', vertDist: number,
 * } | null}
 */
export function computeMlpProximityGuides({ x, y, widthM, lengthM }) {
  const px = Number(x);
  const py = Number(y);
  const W = Number(widthM);
  const L = Number(lengthM);

  if (![px, py, W, L].every(Number.isFinite)) return null;

  const distLeft = Math.max(0, px);
  const distRight = Math.max(0, W - px);
  const side = distLeft <= distRight ? 'left' : 'right';
  const sideDist = side === 'left' ? distLeft : distRight;

  const distFront = Math.max(0, py);
  const distBack = Math.max(0, L - py);
  const vert = distFront <= distBack ? 'front' : 'back';
  const vertDist = vert === 'front' ? distFront : distBack;

  return { x: px, y: py, widthM: W, lengthM: L, side, sideDist, vert, vertDist };
}