import { getSpeakerModelMeta } from "@/components/models/speakers/registry";
import { WALL_BUFFER_CM, SCREEN_BUFFER_CM } from "@/components/room/constants/screenDepth";

// 57.5° target distance from SCREEN PLANE (using viewable WIDTH)
const RAD = Math.PI / 180;
function targetDistFromPlaneM(visibleWidthInches) {
  const w_m = Number(visibleWidthInches || 100) * 0.0254;
  const half = w_m / 2;
  const theta = 57.5;
  return half / Math.tan((theta * RAD) / 2);
}

/**
 * Calculates the forward protrusion of an object from the front wall when angled.
 * This is the space the object occupies behind its front-most face.
 * @param {number} depthCm - The object's total depth in cm.
 * @param {number} widthCm - The object's total width in cm.
 * @param {number} yawDeg - The object's toe-in angle in degrees (0 = flat).
 * @returns {number} The total protrusion from the front wall in cm.
 */
function getFrontProtrusionCm(depthCm, widthCm, yawDeg) {
  const absYawRad = Math.abs(yawDeg) * RAD;
  
  // Approximation of forward extent based on toe-in.
  const effectiveDepth = 
    depthCm * Math.cos(absYawRad) + 
    (widthCm * 0.5) * Math.sin(absYawRad);
    
  return effectiveDepth + WALL_BUFFER_CM;
}

// NEW: compute required floating depth from LCR+subs based on new buffer rules
export function computeAutoFloatDepth({
  dimensions,       // { width, length, height }
  screen,           // { visibleWidthInches, ... }
  speakers = [],    // all placedSpeakers
  subs = [],        // subwoofer list
  includeSubs = true,
}) {
  const roomW = Number(dimensions?.width) || 4.5;
  const midX = roomW / 2;
  const dPlane = targetDistFromPlaneM(screen?.visibleWidthInches);

  const all = Array.isArray(speakers) ? [...speakers] : [];
  const subList = Array.isArray(subs) ? subs : [];
  if (includeSubs) all.push(...subList);

  const isLCR = r => ["FL","FC","FR","L","C","R","FCL","FCR"].includes(String(r).toUpperCase());
  const isSub = r => String(r).toUpperCase().includes("SUB") || String(r).toUpperCase()==="LFE" || String(r).toUpperCase().startsWith("SW");

  // Step 1: Find the maximum front protrusion across all objects
  let maxFront = 0;
  
  for (const item of all) {
    const role = String(item?.role || "").toUpperCase();
    if (!(isLCR(role) || (includeSubs && isSub(role)))) continue;

    const meta = getSpeakerModelMeta(item?.model) || {};
    const widthCm = (Number(meta.widthM) || (isSub(role) ? 0.60 : 0.27)) * 100;
    const depthCm = (Number(meta.depthM) || (isSub(role) ? 0.25 : 0.08)) * 100;

    const dx = Math.abs((Number(item?.position?.x) || midX) - midX);
    const dy = Math.max(dPlane, 0.01);
    const yawRad = Math.atan2(dx, dy);
    const yawDeg = yawRad / RAD;

    const protrusionCm = getFrontProtrusionCm(depthCm, widthCm, yawDeg);
    
    if (protrusionCm > maxFront) {
      maxFront = protrusionCm;
    }
  }

  // Step 2: Calculate required screen offset from the deepest object
  const requiredScreenOffsetCm = maxFront + SCREEN_BUFFER_CM;
  
  // Step 3: Convert to meters and apply minimum
  const requiredScreenOffsetM = requiredScreenOffsetCm / 100;
  const minM = 0.10;
  
  return Math.max(minM, Number.isFinite(requiredScreenOffsetM) ? requiredScreenOffsetM : 0.20);
}

// KEEP existing export signature used by your effect.
// Now it uses the new computeAutoFloatDepth under the hood.
export function placeSubsForFrontWall({ dimensions, screen, speakers }) {
  const includeSubs = true;
  const updatedFloatDepth = computeAutoFloatDepth({
    dimensions,
    screen,
    speakers,
    subs: speakers?.filter(s => String(s.role || "").toUpperCase().includes("SUB")),
    includeSubs,
  });
  
  // The original sub placement logic is now deprecated in favor of the auto-depth calculation.
  // We return the calculated depth and an empty sub array, as sub positions are handled elsewhere.
  return { 
    subs: [],
    updatedFloatDepth 
  };
}

export default { placeSubsForFrontWall, computeAutoFloatDepth };