
import { MIN_SCREEN_CLEARANCE_M, screenPlaneOffsetY } from "../../models/screen";
import { effectiveDepthAtAngle } from "@/components/lib/geometry/speakers";
import { PRODUCTS } from "@/components/models/speakers/SpeakerData";

/** True front projection (depth) in meters for a product at given angle. */
export function frontProjectionDepth(product, angleDeg = 0) {
  const d = product?.dims?.d || 0;
  if (angleDeg && angleDeg > 0) return effectiveDepthAtAngle(d, angleDeg, 0.10);
  return d;
}

/** Returns minimal required plane offset to stay ≥2cm in front of the deepest box. */
export function requiredPlaneOffsetM(behind) {
  const depths = Array.isArray(behind) ? behind.map(s => frontProjectionDepth(s.product, s.angleDeg || 0)) : [];
  const deepest = depths.length ? Math.max(0, ...depths) : 0;
  return deepest + MIN_SCREEN_CLEARANCE_M; // 2 cm clearance rule
}

/** Convenience: decide floating cavity (0.2 vs 0.3) based on whether any SUB is behind. */
export function pickFloatingModeForBehind(behind) {
  const hasSub = Array.isArray(behind) && behind.some(s => typeof s.productId === "string" && /^SUB/.test(s.productId));
  return hasSub ? "floating30" : "floating20";
}

/** True if any SUB is behind the screen (used to lock 30 cm in UI). */
export function subsBehindScreen(behind) {
  return Array.isArray(behind) && behind.some(s => typeof s.productId === "string" && /^SUB/.test(s.productId));
}

/** Check current screen config satisfies clearance for given behind items. */
export function hasSufficientClearance(screenConfig, behind) {
  const req = requiredPlaneOffsetM(
    (behind || []).map(b => ({
      product: PRODUCTS[b.productId] || b.product, // allow either id or full object
      angleDeg: b.angleDeg || 0,
    })).filter(x => x.product)
  );
  const plane = screenPlaneOffsetY(screenConfig);  // 0, 0.20, 0.30
  return plane >= req;
}
