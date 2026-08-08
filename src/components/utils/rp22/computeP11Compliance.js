/**
 * computeP11Compliance
 * ---------------------
 * RP22 Parameter 11 — Number of surround / wide / upper speakers outside
 * recommended zonal locations.
 *
 * Authority:
 *   Overhead zones:   computeOverheadZones (wraps computeRp22OverheadZoneExtents)
 *   Front wide zones: computeFrontWideZonesStrict
 *   Side/rear zones:   computeRp22SurroundZones (RP22 5.6.1 canonical)
 *
 * All three use the SAME canonical zone geometry as the Room Designer overlays.
 * No zone geometry is duplicated or approximated inside this function.
 *
 * FAIL-SAFE:
 *   If applicable zone authority cannot be calculated (indeterminate),
 *   the result level is "indeterminate" — NOT a false L4.
 *   outsideCount is still reported for speakers whose zones ARE determinate.
 *
 * Grading (when authority is valid for ALL checked speakers):
 *   outsideCount === 0 → L4
 *   outsideCount >= 1  → L1
 *   (No L2, L3, or FAIL for P11)
 *
 * Speakers checked (active, with real model, layout-visible):
 *   - Side surrounds (SL, SR)
 *   - Rear surrounds (SBL, SBR)
 *   - Front wides (LW, RW)
 *   - Overhead speakers (TFL/TFR → front, TML/TMR → mid, TBL/TBR/TRL/TRR → rear)
 *
 * Excluded: screen speakers (FL/FC/FR), subwoofers, disabled/inactive speakers.
 */

import { computeOverheadZones } from "@/components/room/utils/overheadZones";
import { computeFrontWideZonesStrict } from "@/components/utils/frontWideZones";
import {
  computeRp22SurroundZones,
  isInsideSurroundZone,
  hasActiveSurroundBack,
} from "@/components/utils/rp22/rp22SurroundZones";
import { getCanonicalRole } from "@/components/utils/surroundRoleMap";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/**
 * Map a canonical overhead role to its applicable zone key.
 * TFL/TFR → front, TML/TMR → mid, TBL/TBR/TRL/TRR → rear.
 */
function getOverheadZoneKey(canonRole) {
  const r = String(canonRole || "").toUpperCase();
  if (r === "TFL" || r === "TFR") return "front";
  if (r === "TML" || r === "TMR") return "mid";
  if (r === "TBL" || r === "TBR" || r === "TRL" || r === "TRR") return "rear";
  return null;
}

/**
 * Test whether a point (x, y) is inside an overhead zone.
 * Inactive zones return true (speaker not counted as outside — preserved
 * existing validated authority).
 */
function isInsideOverheadZone(x, y, zone) {
  if (!zone || !zone.active) return true;
  if (!isNum(y) || y < zone.y1 || y > zone.y2) return false;
  if (!isNum(x)) return false;
  const pieces =
    Array.isArray(zone.pieces) && zone.pieces.length > 0
      ? zone.pieces
      : [{ x1: zone.x1, x2: zone.x2 }];
  return pieces.some((piece) => {
    const lo = Math.min(piece.x1, piece.x2);
    const hi = Math.max(piece.x1, piece.x2);
    return x >= lo && x <= hi;
  });
}

/**
 * Test whether a Y coordinate is inside a front wide side zone.
 * Inactive zones return true (speaker not counted as outside — preserved
 * existing validated authority).
 */
function isInsideFrontWideZone(y, sideZone) {
  if (!sideZone || sideZone.status !== "ok") return true;
  if (!isNum(y)) return false;
  return y >= sideZone.yMin && y <= sideZone.yMax;
}

/**
 * @param {Object}   opts
 * @param {Array}    opts.speakers          - Speakers to check (layout-visible, resolved)
 * @param {Array}    opts.placedSpeakers    - All placed speakers (for zone computation)
 * @param {Array}    opts.seatingPositions  - Seat array
 * @param {Object}   opts.dimensions        - { widthM, lengthM, heightM } or { width, length, height }
 * @param {Object}   opts.mlpPoint          - MLP/RSP { x, y, z }
 * @param {Function} opts.getSpeakerModelMeta - From speakers registry
 * @returns {{ outsideCount: number, outsideSpeakers: Array, level: string, indeterminate: boolean }}
 */
export function computeP11Compliance({
  speakers,
  placedSpeakers,
  seatingPositions,
  dimensions,
  mlpPoint,
  getSpeakerModelMeta,
}) {
  const widthM = Number(dimensions?.widthM ?? dimensions?.width) || 4.5;
  const lengthM = Number(dimensions?.lengthM ?? dimensions?.length) || 6.0;
  const heightM = Number(dimensions?.heightM ?? dimensions?.height) || 2.4;

  const allSpeakers = Array.isArray(placedSpeakers) ? placedSpeakers : [];
  const seats = Array.isArray(seatingPositions) ? seatingPositions : [];
  const checkSpeakers = Array.isArray(speakers) ? speakers : [];

  // ── Compute canonical zones (same authority as Room Designer overlays) ──

  const overheadZones = computeOverheadZones({
    seatingPositions: seats,
    heightM,
    widthM,
    lengthM,
    mlpY_m: mlpPoint?.y,
    mlpPoint: mlpPoint || undefined,
    placedSpeakers: allSpeakers,
    getCanonicalRole,
  });

  const frontWideZones = computeFrontWideZonesStrict({
    mlpPoint,
    dimensions: { width: widthM, length: lengthM },
    placedSpeakers: allSpeakers,
    getModelDimsM: (model) => {
      const meta = getSpeakerModelMeta ? getSpeakerModelMeta(model) : null;
      if (meta && !meta.notFound) return meta;
      return { depthM: 0.082, widthM: 0.27 };
    },
    enableFrontWides: true,
  });

  const surroundZones = computeRp22SurroundZones({
    seatingPositions: seats,
    dimensions: { widthM, lengthM },
    mlpPoint,
    hasSurroundBack: hasActiveSurroundBack(checkSpeakers),
  });

  // ── Check each speaker against its applicable zone ──

  const outsideSpeakers = [];
  let indeterminateCount = 0;

  for (const speaker of checkSpeakers) {
    if (!speaker || !speaker.position) continue;
    if (!isNum(speaker.position.x) || !isNum(speaker.position.y)) continue;

    // Skip speakers without a real model
    const model = String(speaker.model ?? "").trim().toLowerCase();
    if (!model || model === "off" || model === "none") continue;

    const role = getCanonicalRole(speaker.role);
    const x = speaker.position.x;
    const y = speaker.position.y;

    let isOutside = false;
    let zoneType = null;
    let zoneIndeterminate = false;

    // Overhead speakers
    const ohZoneKey = getOverheadZoneKey(role);
    if (ohZoneKey) {
      zoneType = `overhead-${ohZoneKey}`;
      const zone =
        ohZoneKey === "front"
          ? overheadZones.frontZone
          : ohZoneKey === "mid"
          ? overheadZones.midZone
          : overheadZones.backZone;
      isOutside = !isInsideOverheadZone(x, y, zone);
    }
    // Front wides
    else if (role === "LW") {
      zoneType = "front-wide-left";
      isOutside = !isInsideFrontWideZone(y, frontWideZones?.left);
    } else if (role === "RW") {
      zoneType = "front-wide-right";
      isOutside = !isInsideFrontWideZone(y, frontWideZones?.right);
    }
    // Side surrounds — canonical RP22 surround zones
    else if (role === "SL") {
      zoneType = "side-surround-left";
      const inside = isInsideSurroundZone(x, y, surroundZones?.sideLeft);
      if (inside === null) {
        zoneIndeterminate = true;
      } else {
        isOutside = !inside;
      }
    } else if (role === "SR") {
      zoneType = "side-surround-right";
      const inside = isInsideSurroundZone(x, y, surroundZones?.sideRight);
      if (inside === null) {
        zoneIndeterminate = true;
      } else {
        isOutside = !inside;
      }
    }
    // Rear surrounds — canonical RP22 surround-back zones
    else if (role === "SBL") {
      zoneType = "rear-surround-left";
      const inside = isInsideSurroundZone(x, y, surroundZones?.backLeft);
      if (inside === null) {
        zoneIndeterminate = true;
      } else {
        isOutside = !inside;
      }
    } else if (role === "SBR") {
      zoneType = "rear-surround-right";
      const inside = isInsideSurroundZone(x, y, surroundZones?.backRight);
      if (inside === null) {
        zoneIndeterminate = true;
      } else {
        isOutside = !inside;
      }
    }
    // Skip screen speakers (FL/FC/FR), subwoofers, and any other roles
    else {
      continue;
    }

    if (zoneIndeterminate) {
      indeterminateCount++;
      continue;
    }

    if (isOutside) {
      outsideSpeakers.push({ id: speaker.id || role, role, x, y, zoneType });
    }
  }

  // ── Fail-safe: if any speaker's zone was indeterminate, return indeterminate ──
  if (indeterminateCount > 0) {
    return {
      outsideCount: outsideSpeakers.length,
      outsideSpeakers,
      level: "indeterminate",
      indeterminate: true,
      indeterminateCount,
    };
  }

  const outsideCount = outsideSpeakers.length;
  const level = outsideCount === 0 ? "L4" : "L1";

  return { outsideCount, outsideSpeakers, level, indeterminate: false };
}