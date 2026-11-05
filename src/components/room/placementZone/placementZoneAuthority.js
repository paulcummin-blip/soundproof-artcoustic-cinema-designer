/**
 * placementZoneAuthority.js
 * -------------------------
 * Pure, read-only speaker placement-zone membership.
 *
 * Reuses the EXISTING authoritative RP22 placement-zone evaluation:
 *   - P3  screen speakers (FL / FR)            → lcrZoneAuthority
 *   - P11 surround / wide / overhead speakers  → computeP11Compliance
 *
 * No zone geometry is duplicated or approximated here, and no RP22 performance
 * level is read. A speaker is "outside" only when its cabinet centre lies
 * outside its permitted placement zone — independent of any spacing, SPL or
 * other parameter grade it may also carry.
 *
 * Returns:
 *   true  — speaker is OUTSIDE its applicable placement zone
 *   false — speaker is INSIDE its applicable placement zone
 *   null  — indeterminate (no zone, invalid geometry, or no real model)
 *
 * `null` never triggers a warning.
 */

import { computeP11Compliance } from "@/components/utils/rp22/computeP11Compliance";
import {
  clampLcrZoneDepth,
  computeLcrZones,
  isCentreInZone,
} from "@/components/utils/rp22/lcrZoneAuthority";
import { getCanonicalRole } from "@/components/utils/surroundRoleMap";

const hasRealModel = (speaker) => {
  const model = String(speaker?.model ?? "").trim().toLowerCase();
  return !!model && model !== "off" && model !== "none";
};

const hasPosition = (speaker) =>
  !!speaker?.position &&
  Number.isFinite(Number(speaker.position.x)) &&
  Number.isFinite(Number(speaker.position.y));

/**
 * Evaluate a single speaker against its applicable RP22 placement zone.
 *
 * @param {Object} speaker
 * @param {Object} ctx
 * @param {Array}  ctx.placedSpeakers      - All placed speakers (zone computation)
 * @param {Array}  ctx.seatingPositions    - Seat array
 * @param {Object} ctx.dimensions         - { widthM, lengthM, heightM } or { width, length, height }
 * @param {Object} ctx.mlpPoint           - RSP/MLP { x, y, z }
 * @param {number} [ctx.screenFrontPlaneM] - Screen front-plane Y (metres) for P3
 * @param {Function} [ctx.getSpeakerModelMeta]
 * @returns {boolean|null}
 */
export function isSpeakerOutsidePlacementZone(speaker, ctx) {
  if (!hasPosition(speaker) || !hasRealModel(speaker)) return null;

  const role = getCanonicalRole(speaker.role);
  if (!role) return null;

  // ── P3: screen speakers FL / FR (FC is constrained to the centreline) ──
  if (role === "FL" || role === "FR") {
    const zoneDepthM = clampLcrZoneDepth(ctx?.screenFrontPlaneM);
    if (!ctx?.mlpPoint || zoneDepthM == null) return null;
    const zones = computeLcrZones({
      mlpX: ctx.mlpPoint.x,
      mlpY: ctx.mlpPoint.y,
      zoneDepthM,
    });
    if (!zones) return null;
    const zone = role === "FL" ? zones.left : zones.right;
    const inside = isCentreInZone(speaker.position.x, zone);
    if (inside === null) return null;
    return inside ? false : true;
  }

  // ── P11: surround / wide / overhead (roles with no applicable zone are
  //     skipped by computeP11Compliance and return no outside speakers) ──
  const result = computeP11Compliance({
    speakers: [speaker],
    placedSpeakers: Array.isArray(ctx?.placedSpeakers) ? ctx.placedSpeakers : [],
    seatingPositions: Array.isArray(ctx?.seatingPositions) ? ctx.seatingPositions : [],
    dimensions: ctx?.dimensions || {},
    mlpPoint: ctx?.mlpPoint,
    getSpeakerModelMeta: ctx?.getSpeakerModelMeta,
  });

  if (!result || result.indeterminate) return null;
  const identity = speaker.id || role;
  return result.outsideSpeakers.some((s) => (s.id || s.role) === identity);
}

/**
 * Evaluate a set of speakers and return the IDs of those outside their zones.
 * Returns a Set of speaker IDs (empty when none are outside, or when the
 * authority is indeterminate for every checked speaker).
 */
export function evaluatePlacementZones({ speakers, placedSpeakers, seatingPositions, dimensions, mlpPoint, screenFrontPlaneM, getSpeakerModelMeta }) {
  const outside = new Set();
  const list = Array.isArray(speakers) ? speakers : [];
  const ctx = { placedSpeakers, seatingPositions, dimensions, mlpPoint, screenFrontPlaneM, getSpeakerModelMeta };
  for (const speaker of list) {
    const isOutside = isSpeakerOutsidePlacementZone(speaker, ctx);
    if (isOutside === true) outside.add(speaker.id || getCanonicalRole(speaker.role));
  }
  return outside;
}

export default { isSpeakerOutsidePlacementZone, evaluatePlacementZones };