/**
 * Calculate LCR horizontal corridor constraints.
 * PURE: does not mutate inputs.
 *
 * Returns shape per role:
 *   { clamp: { minX, maxX }, currentX, iconWidthM, travelDistance, canMove, model }
 *
 * NOTE (overhang rule):
 *   We clamp the *icon center* inside the zone corridor. That naturally allows
 *   up to 50% of the icon's width to overhang outside the zone on either side,
 *   but never lets the icon go fully outside.
 */

import { getSpeakerModelMeta } from "@/components/models/speakers/registry";

export function calculateLcrConstraints({ placedSpeakers = [], zones, room, screen }) {
  const out = {};
  if (!zones || !zones.LCR) return out;

  // local copies only; never write back to screen/room
  const zoneLeft  = zones.LCR?.FL; // {points:[{x},{x_end}]...} per your overlay builder
  const zoneRight = zones.LCR?.FR;

  // Helper: extract min/max X (in meters) for each side
  const zoneRange = (z) => {
    if (!z || !Array.isArray(z.points) || z.points.length < 2) return null;
    const xs = z.points.map(p => Number(p.x)).filter(Number.isFinite);
    return { min: Math.min(...xs), max: Math.max(...xs) };
  };

  const leftRange  = zoneRange(zoneLeft);
  const rightRange = zoneRange(zoneRight);

  // Map by role for easy lookup
  const byRole = {};
  for (const s of placedSpeakers) {
    const r = String(s.role || "").toUpperCase();
    if (["FL", "FR", "L", "R", "FC", "C"].includes(r)) byRole[r] = s;
  }

  // Compute constraints for FL/FR (L/R aliases supported)
  const roles = [
    ["FL", "L", leftRange],
    ["FR", "R", rightRange]
  ];

  for (const [primary, alias, range] of roles) {
    const speaker = byRole[primary] || byRole[alias];
    if (!speaker || !range) continue;

    const meta = getSpeakerModelMeta(speaker.model) || {};
    const iconWidthM = Number(meta.widthM) || 0.27;

    // IMPORTANT: center must stay within zone => 50% overhang max
    const minCenter = range.min;
    const maxCenter = range.max;

    const currentX = Number(speaker.position?.x);
    const clampMin = Math.min(minCenter, maxCenter);
    const clampMax = Math.max(minCenter, maxCenter);

    const clamped = {
      minX: clampMin,
      maxX: clampMax
    };

    out[primary] = {
      clamp: clamped,
      currentX,
      iconWidthM,
      travelDistance: Math.max(0, clampMax - clampMin),
      canMove: Number.isFinite(currentX) && clampMax > clampMin,
      model: speaker.model
    };
  }

  // CENTER is fixed (as in your handler)
  if (byRole.FC || byRole.C) {
    const c = byRole.FC || byRole.C;
    out.FC = {
      clamp: { minX: c?.position?.x ?? 0, maxX: c?.position?.x ?? 0 },
      currentX: Number(c?.position?.x),
      iconWidthM: (getSpeakerModelMeta(c?.model)?.widthM) || 0.27,
      travelDistance: 0,
      canMove: false,
      model: c?.model
    };
  }

  return out;
}