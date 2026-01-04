// rp22HfOffAxis.js
// RP22 P16 + P17 – HF off-axis attenuation per seat
// P16: LCR speakers
// P17: Surrounds, Wides, Overheads
// Uses speaker.yaw as the aim direction and computes true off-axis angle
// between the speaker's front axis and the seat direction.

import { getSpeakerModelMeta, normaliseModelKey } from "@/components/models/speakers/registry";

const LCR_ROLES = new Set(["FL", "L", "FC", "C", "FR", "R"]);
const OVERHEAD_ROLES = new Set(["TFL", "TFR", "TL", "TR", "TML", "TMR", "TBL", "TBR", "TFC", "TBC"]);
const SURROUND_ROLES = new Set(["SL", "SR", "SBL", "SBR", "LW", "RW"]);

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

// Normalise to -180..+180
const norm180 = (deg) => {
  if (!isNum(deg)) return null;
  let a = deg % 360;
  if (a > 180) a -= 360;
  if (a < -180) a += 360;
  return a;
};

// Centralized angle → HF loss mapping using new RP22 thresholds
// Uses model-specific dispersion if available, otherwise defaults to generic thresholds
function mapAngleToHfLossDb(angleDeg, modelMeta = null) {
  const a = Math.abs(Number(angleDeg) || 0);

  // Try to use model-specific dispersion data
  if (modelMeta?.dispersion?.horizontal) {
    const disp = modelMeta.dispersion.horizontal;
    const minus1p5 = disp.minus1p5dB ?? disp.minus1p5 ?? null;
    const minus3 = disp.minus3dB ?? disp.minus3 ?? null;
    const minus5 = disp.minus5dB ?? disp.minus5 ?? null;

    if (minus1p5 != null && minus3 != null && minus5 != null) {
      if (a <= minus1p5) return 1.5;
      if (a <= minus3) return 3.0;
      if (a <= minus5) return 5.0;
      return null; // Beyond model's −5 dB window
    }
  }

  // Fallback to generic RP22 thresholds
  if (a <= 28) return 1.5;
  if (a <= 41) return 3.0;
  if (a <= 55) return 5.0;

  // Above 55° we are beyond our reference window.
  // Callers decide how to classify this for RP22.
  return null; // use null to mean "beyond 55° reference"
}

// Convert radians to degrees
const rad2deg = (rad) => rad * 180 / Math.PI;

// 0° = straight into the room (+Y), positive = clockwise.
// Same convention as yawDegToMLP / safeYawToMLP.
const angleFromTo = (from, to) => {
  if (!from || !to) return null;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (!isNum(dx) || !isNum(dy)) return null;
  return (Math.atan2(dx, dy) * 180) / Math.PI; // -180..+180
};

// P16 level mapping based on loss
const classifyP16 = (lossDb) => {
  if (!isNum(lossDb)) return null;
  if (lossDb > 5) return null;   // FAIL
  if (lossDb > 3) return 1;      // 3–5 dB
  if (lossDb > 1.5) return 2;    // 1.5–3 dB
  return 4;                      // ≤1.5 dB
};

export function computeP16ForSeat(seat, allSpeakers, getSpeakerModelMeta) {
  if (!seat || !isNum(seat.x) || !isNum(seat.y)) return null;
  if (!Array.isArray(allSpeakers) || !allSpeakers.length) return null;

  // 1) Pick LCR speakers that have valid positions
  const lcrSpeakers = allSpeakers.filter((spk) => {
    const role = String(spk.role || "").toUpperCase();
    const pos = spk.position;
    return (
      LCR_ROLES.has(role) &&
      pos &&
      isNum(pos.x) &&
      isNum(pos.y)
    );
  });

  if (!lcrSpeakers.length) return null;

  const perSpeaker = {};
  let worstLossDb = -Infinity;
  let worstRole = null;

  // 2) Evaluate each LCR for this seat
  for (const spk of lcrSpeakers) {
    const role = String(spk.role || "").toUpperCase();
    const pos = spk.position;

    // Direction from speaker → seat
    const seatAzDeg = angleFromTo(pos, seat);
    if (!isNum(seatAzDeg)) continue;

    // Aim direction: prefer explicit yaw, then rotationDeg, otherwise assume flat (0°)
    let aimDeg = null;
    if (isNum(spk.yaw)) {
      aimDeg = Number(spk.yaw);
    } else if (isNum(spk.rotationDeg)) {
      aimDeg = Number(spk.rotationDeg);
    } else if (isNum(spk.rotation_deg)) {
      aimDeg = Number(spk.rotation_deg);
    } else {
      aimDeg = 0;
    }

    // True off-axis angle = |seat direction – aim direction|
    const offAxisDeg = Math.abs(norm180(seatAzDeg - aimDeg));
    if (!isNum(offAxisDeg)) continue;

    const angleDeg = Number(offAxisDeg.toFixed(1));

    // Get model metadata for dispersion
    const meta = spk.model ? getSpeakerModelMeta(spk.model) : null;

    // Use new centralized mapping with model-specific dispersion
    const lossFromAngle = mapAngleToHfLossDb(angleDeg, meta);
    let lossDb;
    let isBeyondLcrLimit = false;

    if (lossFromAngle == null) {
      // Angle beyond model's −5 dB window: this is a fail for P16
      lossDb = 5.0;
      isBeyondLcrLimit = true;
    } else {
      lossDb = lossFromAngle;
    }

    perSpeaker[role] = {
      angleDeg,
      lossDb: Number(lossDb.toFixed(1)),
      isBeyondLcrLimit,
    };

    if (lossDb > worstLossDb) {
      worstLossDb = lossDb;
      worstRole = role;
    }
  }

  if (!worstRole || !isNum(worstLossDb)) return null;

  const value = Number(worstLossDb.toFixed(1));

  // Check if any LCR exceeds 55° off-axis
  const hasLcrBeyondLimit = Object.values(perSpeaker).some(
    (spk) => spk.isBeyondLcrLimit === true
  );

  // Force Level 1 if any LCR is beyond 55°
  let level = classifyP16(value);
  if (hasLcrBeyondLimit) {
    level = 1;
  }

  const worstAngle = perSpeaker[worstRole]?.angleDeg ?? null;

  return {
    value,
    formatted: `±${value.toFixed(1)} dB`,
    hudLabel: `${worstRole} ±${value.toFixed(1)} dB`,
    level,
    p16BeyondLcrLimit: hasLcrBeyondLimit,
    debug: {
      perSpeaker,
      worst: {
        role: worstRole,
        angleDeg: worstAngle,
        lossDb: value,
      },
    },
  };
  }

// --- P17 HELPERS ---

// Map overhead models to their built-in tilt (towards the MLP), in degrees
function getOverheadTiltDeg(modelKey) {
  const key = (modelKey || "").toString().toLowerCase();

  // Mikro: flat baffle, no tilt
  if (key.includes("mikro")) return 0;

  // Architect 2-1: ~5° angled tweeter
  if (key.includes("architect-2-1")) return 5;

  // Architect 4-2: ~5° angled tweeter
  if (key.includes("architect-4-2")) return 5;

  // Architect PAS2-2: ~20° angled baffle
  if (key.includes("pas2-2") || key.includes("architect pas")) {
    return 20;
  }

  // Default: no built-in tilt
  return 0;
}



/**
 * Compute vertical off-axis angle for an overhead speaker relative to the listener.
 *
 * - speakerPos: { x, y, z? }  (z will be ignored if roomHeightM is provided)
 * - seatPos: { x, y }
 * - earHeightM: listener ear height in metres
 * - modelKey: string used to look up built-in tilt and dispersion
 * - roomHeightM: current room ceiling height (if finite, overrides speakerPos.z)
 *
 * Returns: effective off-axis angle (raw - aim offset) and predicted HF loss using model dispersion.
 */
function computeVerticalOffAxisDeg(speakerPos, seatPos, earHeightM, modelKey, roomHeightM) {
  if (!seatPos || !speakerPos) {
    return { offAxisDeg: 0, lossDb: 1.5, rawAngleDeg: 0 };
  }

  const earZ = Number.isFinite(Number(earHeightM))
    ? Number(earHeightM)
    : 1.2;

  // Work out which Z we're using for the speaker:
  // 1) explicit room height from dimensions
  // 2) speaker's own z
  // 3) fallback to 1 m above the ear
  const speakerZRaw = Number.isFinite(Number(roomHeightM))
    ? Number(roomHeightM)
    : (Number.isFinite(Number(speakerPos.z)) ? Number(speakerPos.z) : (earZ + 1.0));

  // Ensure the speaker is always above the listener
  const speakerZ = Math.max(earZ + 0.01, speakerZRaw);

  // Horizontal distance in plan view
  const horizontalDist = Math.hypot(
    Number(seatPos.x) - Number(speakerPos.x),
    Number(seatPos.y) - Number(speakerPos.y)
  );

  const verticalDist = speakerZ - earZ;

  // Geometric angle from vertical (0° straight down, 90° horizontal)
  const rawAngleDeg = rad2deg(Math.atan2(horizontalDist, verticalDist));

  // Get model metadata for aim offset and dispersion
  const meta = getSpeakerModelMeta(modelKey);
  const aimOffsetDeg = meta?.builtInTiltDeg ?? getOverheadTiltDeg(modelKey) ?? 0;

  // Effective off-axis angle: raw angle minus the speaker's built-in aim
  // This treats the aim direction as 0° on-axis
  const effectiveAngleDeg = Math.abs(rawAngleDeg - aimOffsetDeg);

  // Use model-specific dispersion windows if available
  let lossDb;
  if (meta?.dispersion?.horizontal) {
    const disp = meta.dispersion.horizontal;
    const minus1p5 = disp.minus1p5dB ?? disp.minus1p5 ?? null;
    const minus3 = disp.minus3dB ?? disp.minus3 ?? null;
    const minus5 = disp.minus5dB ?? disp.minus5 ?? null;

    if (minus1p5 != null && minus3 != null && minus5 != null) {
      // Use model's actual dispersion windows directly on effective angle
      if (effectiveAngleDeg <= minus1p5) lossDb = 1.5;
      else if (effectiveAngleDeg <= minus3) lossDb = 3.0;
      else if (effectiveAngleDeg <= minus5) lossDb = 5.0;
      else lossDb = 5.0; // Beyond −5 dB window
    } else {
      // Fallback to legacy thresholds if dispersion incomplete
      const key = (modelKey || "").toString().toLowerCase();
      if (key.includes("mikro")) {
        if (effectiveAngleDeg <= 40) lossDb = 1.5;
        else if (effectiveAngleDeg <= 50) lossDb = 3.0;
        else lossDb = 5.0;
      } else {
        if (effectiveAngleDeg <= 45) lossDb = 1.5;
        else if (effectiveAngleDeg <= 55) lossDb = 3.0;
        else lossDb = 5.0;
      }
    }
  } else {
    // No dispersion data: use legacy thresholds
    const key = (modelKey || "").toString().toLowerCase();
    if (key.includes("mikro")) {
      if (effectiveAngleDeg <= 40) lossDb = 1.5;
      else if (effectiveAngleDeg <= 50) lossDb = 3.0;
      else lossDb = 5.0;
    } else {
      if (effectiveAngleDeg <= 45) lossDb = 1.5;
      else if (effectiveAngleDeg <= 55) lossDb = 3.0;
      else lossDb = 5.0;
    }
  }

  return {
    offAxisDeg: effectiveAngleDeg,  // effective angle for P17 scoring
    rawAngleDeg: rawAngleDeg,       // geometric angle for display
    lossDb,
    // Debug data for verification
    debug: {
      modelKey,
      rawAngleDeg,
      aimOffsetDeg,
      effectiveAngleDeg,
      dispersionWindows: meta?.dispersion?.horizontal ? {
        minus1p5dB: meta.dispersion.horizontal.minus1p5dB ?? meta.dispersion.horizontal.minus1p5 ?? null,
        minus3dB: meta.dispersion.horizontal.minus3dB ?? meta.dispersion.horizontal.minus3 ?? null,
        minus5dB: meta.dispersion.horizontal.minus5dB ?? meta.dispersion.horizontal.minus5 ?? null,
      } : null,
    },
  };
}

// Unified helper: compute HF loss for one non-LCR speaker at one seat
function computeSurroundLikeHfLoss({ speaker, seat, earHeightM, modelMeta, roomHeightM }) {
  if (!speaker || !seat) return null;
  
  const role = String(speaker.role || "").toUpperCase();
  const pos = speaker.position;
  
  // [B44 DEBUG] Log filter decisions
  if (globalThis.__B44_RV_DEBUG === true && ["LW", "RW", "SBL", "SBR"].includes(role)) {
    console.log(`[P17 FILTER] ${role}:`, {
      hasRole: !!speaker.role,
      isLCR: LCR_ROLES.has(role),
      isSub: role.includes("LFE") || role.includes("SUB"),
      hasPosition: !!(pos && isNum(pos.x) && isNum(pos.y)),
      inSurroundRoles: SURROUND_ROLES.has(role),
      inOverheadRoles: OVERHEAD_ROLES.has(role),
      willProcess: !LCR_ROLES.has(role) && !role.includes("LFE") && !role.includes("SUB") && pos && isNum(pos.x) && isNum(pos.y)
    });
  }
  
  // Skip LCR and subs
  if (LCR_ROLES.has(role) || role.includes("LFE") || role.includes("SUB")) {
    return null;
  }
  
  if (!pos || !isNum(pos.x) || !isNum(pos.y)) return null;

  let offAxisDeg = null;

  // Overhead speakers: use vertical off-axis
  if (OVERHEAD_ROLES.has(role)) {
    // Overheads: use room height + model tilt
    const vert = computeVerticalOffAxisDeg(
      speaker.position,
      seat,
      earHeightM,
      speaker.model,
      roomHeightM
    );

    if (!vert || !Number.isFinite(vert.offAxisDeg) || !Number.isFinite(vert.lossDb)) {
      return null;
    }

    return {
      role,
      offAxisDeg: Number(vert.offAxisDeg.toFixed(1)),        // effective angle for scoring
      rawAngleDeg: Number((vert.rawAngleDeg ?? vert.offAxisDeg).toFixed(1)), // geometric angle for display
      lossDb: Number(vert.lossDb.toFixed(1)),
      debug: vert.debug, // Pass through debug data
    };
  } 
  // Bed-layer surrounds/wides: use horizontal off-axis (same as P16)
  else if (SURROUND_ROLES.has(role)) {
    const seatAzDeg = angleFromTo(pos, seat);
    if (!isNum(seatAzDeg)) return null;

    // Aim direction from speaker data
    // CRITICAL: If yaw is missing, default to "aimed at seat" (zero off-axis)
    let aimDeg = null;
    if (isNum(speaker.yaw)) {
      aimDeg = Number(speaker.yaw);
    } else if (isNum(speaker.rotationDeg)) {
      aimDeg = Number(speaker.rotationDeg);
    } else if (isNum(speaker.rotation_deg)) {
      aimDeg = Number(speaker.rotation_deg);
    } else {
      // Default to aimed at seat, so off-axis becomes 0
      aimDeg = seatAzDeg;
    }

    offAxisDeg = Math.abs(norm180(seatAzDeg - aimDeg));

    // If yaw is explicitly provided, SBL/SBR can be 180° flipped depending on yaw convention.
    // Try aimDeg + 180 and keep whichever produces the smaller off-axis angle.
    const yawWasProvided =
      isNum(speaker.yaw) || isNum(speaker.rotationDeg) || isNum(speaker.rotation_deg);

    if (yawWasProvided && (role === "SBL" || role === "SBR") && isNum(offAxisDeg) && offAxisDeg > 90) {
      const aimFlip = norm180((Number(aimDeg) || 0) + 180);
      const offFlip = Math.abs(norm180(seatAzDeg - aimFlip));
      if (isNum(offFlip) && offFlip < offAxisDeg) {
        aimDeg = aimFlip;
        offAxisDeg = offFlip;
      }
    }

    if (!isNum(offAxisDeg)) return null;

    const effectiveAngleDeg = Number(offAxisDeg.toFixed(1));

    // Get model metadata for dispersion
    const meta = modelMeta || (speaker.model ? getSpeakerModelMeta(speaker.model) : null);

    // Use centralized mapping with model-specific dispersion
    const lossFromAngle = mapAngleToHfLossDb(effectiveAngleDeg, meta);

    let lossDb;
    let isBeyondNonLcrLimit = false;

    // Determine limit based on model-specific dispersion or fallback to 41°
    const nonLcrLimit = meta?.dispersion?.horizontal?.minus3dB ?? 
                       meta?.dispersion?.horizontal?.minus3 ?? 
                       41;

    if (Math.abs(effectiveAngleDeg) > nonLcrLimit) {
      // Beyond the model's −3 dB window
      isBeyondNonLcrLimit = true;
      // For RP22 we still want P17 to land at Level 2, so use 3 dB as the nominal value
      lossDb = 3.0;
    } else {
      // Within the model's coverage: use the normal dispersion-based values
      lossDb = lossFromAngle != null ? lossFromAngle : 5.0;
    }

    console.log("[P17 SURROUND]", role, { seatAzDeg, aimDeg, offAxisDeg, lossDb });

    return {
      role,
      offAxisDeg: effectiveAngleDeg,
      lossDb: Number(lossDb.toFixed(1)),
      isBeyondNonLcrLimit,
    };
  }
}

// P17: Compute surround/wide/overhead HF variance across all non-LCR speakers for all seats
export function computeP17ForAllSeats({ seats, speakers, getSpeakerModelMeta: modelIndex, roomHeightM, debug }) {
  if (!Array.isArray(seats) || !seats.length) return {};
  if (!Array.isArray(speakers) || !speakers.length) return {};

  // [B44 DEBUG] Log speakers entering P17 analysis
  if (globalThis.__B44_RV_DEBUG === true) {
    console.groupCollapsed("[P17 DEBUG] Speakers entering analysis");
    console.log("Total speakers:", speakers.length);
    console.table(speakers.map(s => ({
      role: s.role,
      canonicalRole: String(s.role || "").toUpperCase(),
      model: s.model || "—",
      hasPosition: !!(s.position && isNum(s.position.x) && isNum(s.position.y)),
      posX: s.position?.x?.toFixed(3) || "—",
      posY: s.position?.y?.toFixed(3) || "—",
    })));
    console.log("SURROUND_ROLES allowlist:", Array.from(SURROUND_ROLES));
    console.log("OVERHEAD_ROLES allowlist:", Array.from(OVERHEAD_ROLES));
    console.groupEnd();
  }

  const perSeat = {};

  for (const seat of seats) {
    const seatId = seat.id || `seat-${seat.x}-${seat.y}`;
    if (!isNum(seat.x) || !isNum(seat.y)) continue;

    const seatPos = seat.position || {};
    const earHeightM =
      Number(seat.earHeightM) && Number.isFinite(seat.earHeightM)
        ? seat.earHeightM
        : (Number(seatPos.z) && Number.isFinite(seatPos.z) ? seatPos.z : 1.2);

    let maxAbsLossDb = -Infinity;
    let worstRole = null;
    let worstAngleDeg = -Infinity;
    let worstLossDb = null;
    const perSpeaker = [];
    let p17HasNaAngles = false;

    // [B44 DEBUG] Track which speakers enter the per-seat loop
    const speakersProcessed = [];

    // Loop over all non-LCR speakers
    for (const spk of speakers) {
      const result = computeSurroundLikeHfLoss({
        speaker: spk,
        seat: { x: seatPos.x || seat.x, y: seatPos.y || seat.y, z: seatPos.z || seat.z },
        earHeightM,
        modelMeta: spk.model ? modelIndex(spk.model) : null,
        roomHeightM,
      });

      // [B44 DEBUG] Track processing result
      if (globalThis.__B44_RV_DEBUG === true) {
        speakersProcessed.push({
          role: spk.role,
          processed: !!result,
          reason: result ? "OK" : "filtered by computeSurroundLikeHfLoss"
        });
      }

      if (!result) continue;

      // Track if any speaker is beyond 41°
      if (result.isBeyondNonLcrLimit) {
        p17HasNaAngles = true;
      }

      // Collect per-speaker data
      perSpeaker.push({
        role: result.role,
        angleDeg: result.offAxisDeg,
        rawAngleDeg: result.rawAngleDeg ?? result.offAxisDeg, // for overhead display
        lossDb: result.lossDb,
        isBeyondNonLcrLimit: result.isBeyondNonLcrLimit || false,
        debug: result.debug, // Pass through debug data for HUD display
      });

      // Track worst loss: highest dB loss; if tie, largest angle
      if (
        result.lossDb > maxAbsLossDb ||
        (
          result.lossDb === maxAbsLossDb &&
          result.offAxisDeg > worstAngleDeg
        )
      ) {
        maxAbsLossDb = result.lossDb;
        worstRole = result.role;
        worstAngleDeg = result.offAxisDeg;
        worstLossDb = result.lossDb;
      }

      // Store in debug if provided
      if (debug && debug.perSpeaker) {
        if (!debug.perSpeaker[result.role]) {
          debug.perSpeaker[result.role] = {};
        }
        debug.perSpeaker[result.role].p17 = {
          offAxisDeg: result.offAxisDeg,
          lossDb: result.lossDb,
          isBeyondNonLcrLimit: result.isBeyondNonLcrLimit || false,
        };
      }
    }

    // [B44 DEBUG] Log processing results for this seat
    if (globalThis.__B44_RV_DEBUG === true && seatId === seats[0]?.id) {
      console.groupCollapsed(`[P17 DEBUG] Seat ${seatId} processing`);
      console.table(speakersProcessed);
      console.log("perSpeaker results:", perSpeaker);
      console.groupEnd();
    }

    if (!isNum(maxAbsLossDb) || maxAbsLossDb === -Infinity) {
      perSeat[seatId] = null;
      continue;
    }

    perSeat[seatId] = {
      p17Db: Number(maxAbsLossDb.toFixed(1)),
      worstRole,
      worstAngleDeg: worstAngleDeg !== null ? Number(worstAngleDeg.toFixed(1)) : null,
      worstLossDb: worstLossDb !== null ? Number(worstLossDb.toFixed(1)) : null,
      perSpeaker,
      p17HasNaAngles,
    };
  }

  return perSeat;
}