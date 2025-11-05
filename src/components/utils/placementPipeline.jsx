// components/utils/placementPipeline.js
// Minimal, hardened pipeline used by Room Designer & Visualiser.
// Exposes the names that callers expect, with safe fallbacks.

import { computeP5Overlay } from './p5Overlay';
import { autoNudgeBedLayer } from './placementRules';

const A = (x) => (Array.isArray(x) ? x : []);
const cloneSpk = (arr) =>
  A(arr).map(s => ({ ...s, position: s?.position ? { ...s.position } : { x: 0, y: 0, z: 0 } }));

/**
 * Prepare speakers + seats for rendering.
 * - merges speakers and subs (if present)
 * - applies optional bed-layer auto-nudge (non-destructive)
 * - returns stable arrays for the visualiser
 */
export function prepareSystemForRender({
  placedSpeakersBase,
  subs,
  seatingPositions,
  dimensions,
  overheadMode,
  overheadOffsetM,
  rowTarget,
  engineRP22,
  applyAutoNudge = true,
}) {
  const base = cloneSpk(placedSpeakersBase);
  const withSubs = [...base, ...cloneSpk(subs)];

  let processed = withSubs;
  if (applyAutoNudge && dimensions) {
    try {
      // Derive row Y's (≈ group rows by Y)
      const rowsY = Array.from(
        new Set(A(seatingPositions).map(s => s?.y).filter(Number.isFinite))
      ).sort((a,b)=>a-b);
      processed = autoNudgeBedLayer({
        speakers: withSubs,
        room: { width: dimensions?.width, length: dimensions?.length },
        rowsY,
      });
    } catch {
      // keep withSubs if anything goes wrong
      processed = withSubs;
    }
  }

  // Count overheads for badge calculation
  const overheadCount = cloneSpk(processed).filter(s => /^T(F|M|R)[LR]$/.test(String(s?.role || ""))).length;

  // Determine MLP from seating
  const mlp = A(seatingPositions).find(s => s?.isPrimary) || 
    A(seatingPositions)[Math.floor(A(seatingPositions).length / 2)] ||
    { x: (dimensions?.width || 4) / 2, y: Math.min((dimensions?.length || 6) * 0.58, (dimensions?.length || 6) - 1.2), isVirtualMLP: true };

  return {
    speakersForDraw: cloneSpk(processed),
    overheadBadge: overheadCount > 0 ? { overallLevel: 2, count: overheadCount } : null, // Simple badge
    overheadCount,
    offsetUsed: overheadOffsetM || 0,
    mlp,
    meta: { nudged: applyAutoNudge }
  };
}

/**
 * Optional: build label data for the P5 overlay so the UI
 * can render small angle balloons. No-throw fallback.
 */
export function buildP5OverlayLabels({ speakers, seating }) {
  try {
    return computeP5Overlay?.({ speakers, seating }) || [];
  } catch {
    return [];
  }
}

/**
 * Backwards-compat shim for older code that referenced bed-layer auto-nudge via pipeline.
 */
export function bedLayerAutoNudge({ speakers, room, rowsY }) {
  try {
    return autoNudgeBedLayer({ speakers: cloneSpk(speakers), room, rowsY });
  } catch {
    return cloneSpk(speakers);
  }
}