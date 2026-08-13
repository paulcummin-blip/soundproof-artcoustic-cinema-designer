/**
 * Canonical LCR screen-speaker placement zone authority.
 *
 * Single source of truth for the 22.5°–30° LCR zone construction shared by:
 *   - Room Designer visible LCR zone overlay (lcrZoneBlocks)
 *   - LCR drag constraint (lcrConstraints.jsx, via visualConstraintZones)
 *   - RP22 Parameter 3 — Screen Speakers Outside Zones (useRP22AnalysisEngine)
 *
 * Zone construction:
 *   From the effective RSP/MLP, project two angular wedges (22.5° inner,
 *   30° outer) to the screen front-plane depth (zoneDepthM). The permitted
 *   FL zone is the lateral span between the inner-left and outer-left rays;
 *   FR is the mirror image.
 *
 * Compliance rule (Sound Proof / Artcoustic):
 *   A screen speaker is compliant when its physical cabinet CENTRE lies within
 *   its permitted zone (inclusive boundaries). This directly implements the
 *   permitted 50% cabinet overhang rule — the Artcoustic tweeter/acoustic
 *   centre is centrally located within the cabinet.
 *
 *     centre inside zone  = PASS
 *     centre on boundary  = PASS (inclusive)
 *     centre outside zone  = FAIL (speaker counted outside)
 *
 *   0 screen speakers outside recommended zones = L4
 *   ≥1 screen speaker outside                   = FAIL
 */

const TAN_22_5 = Math.tan((22.5 * Math.PI) / 180);
const TAN_30 = Math.tan((30.0 * Math.PI) / 180);

export const LCR_ZONE_MIN_DEPTH_M = 0.10;
export const LCR_ZONE_MAX_DEPTH_M = 0.60;

/**
 * Clamp the screen front-plane depth to the permitted LCR zone depth range.
 * Same formula used by the Room Designer overlay (ZONE_DEPTH_M).
 *
 * @param {number|null|undefined} screenPlaneY - Screen front-plane Y in metres
 * @returns {number|null} Clamped depth, or null when input is not finite.
 */
export function clampLcrZoneDepth(screenPlaneY) {
  const raw = Number(screenPlaneY);
  if (!Number.isFinite(raw)) return null;
  return Math.max(LCR_ZONE_MIN_DEPTH_M, Math.min(LCR_ZONE_MAX_DEPTH_M, raw));
}

/**
 * Compute the FL and FR permitted zone boundaries (lateral X span) from the
 * effective RSP/MLP and the clamped screen front-plane depth.
 *
 * @param {Object} params
 * @param {number} params.mlpX       - RSP/MLP lateral X (room metres)
 * @param {number} params.mlpY       - RSP/MLP fore/aft Y (room metres)
 * @param {number} params.zoneDepthM - Screen front-plane depth, already clamped to [0.10, 0.60]
 * @returns {{ left: {xMin, xMax}, right: {xMin, xMax} } | null}
 */
export function computeLcrZones({ mlpX, mlpY, zoneDepthM }) {
  const mx = Number(mlpX);
  const my = Number(mlpY);
  const zd = Number(zoneDepthM);
  if (!Number.isFinite(mx) || !Number.isFinite(my) || !Number.isFinite(zd)) return null;

  const spanY = my - zd;
  const xIL = mx - spanY * TAN_22_5;
  const xOL = mx - spanY * TAN_30;
  const xIR = mx + spanY * TAN_22_5;
  const xOR = mx + spanY * TAN_30;

  return {
    left: { xMin: Math.min(xIL, xOL), xMax: Math.max(xIL, xOL) },
    right: { xMin: Math.min(xIR, xOR), xMax: Math.max(xIR, xOR) },
  };
}

/**
 * Test whether a speaker cabinet centre lies within a zone (inclusive boundaries).
 *
 * @param {number|null|undefined} cx - Speaker centre X (room metres)
 * @param {{xMin:number,xMax:number}|null|undefined} zone
 * @returns {boolean|null} true (pass), false (fail), or null (invalid input — not scored)
 */
export function isCentreInZone(cx, zone) {
  if (!zone || !Number.isFinite(zone.xMin) || !Number.isFinite(zone.xMax)) return null;
  const x = Number(cx);
  if (!Number.isFinite(x)) return null;
  return x >= zone.xMin && x <= zone.xMax;
}