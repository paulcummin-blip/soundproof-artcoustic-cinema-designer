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

// Map off-axis angle → HF loss (dB) using your existing pattern:
//  • ≤ horiz3dB  → 1.5 dB
//  • ≥ horiz3dB+10 → 5.0 dB
//  • in between → 3 → 5 dB linearly
const lossFromAngle = (offAxisDeg, horiz3dB) => {
  if (!isNum(offAxisDeg) || !isNum(horiz3dB)) return null;

  const a = Math.abs(offAxisDeg);
  if (a <= horiz3dB) return 1.5;
  if (a >= horiz3dB + 10) return 5.0;

  const t = (a - horiz3dB) / 10; // 0..1
  return 3 + 2 * t; // 3 → 5 dB
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

    // Speaker model HF 3 dB horizontal coverage
    const meta = spk.model ? getSpeakerModelMeta(spk.model) : null;
    const horiz3dB =
      meta?.hfOffAxis16k?.minus3deg ??
      meta?.hfHoriz3dB ??
      meta?.hfHoriz_3db ??
      meta?.hfHorz3dB ??
      meta?.horiz3dB ??
      30; // Sensible default if missing

    const lossDbRaw = lossFromAngle(offAxisDeg, horiz3dB);
    if (!isNum(lossDbRaw)) continue;

    const lossDb = Number(lossDbRaw.toFixed(1));
    const angleDeg = Number(offAxisDeg.toFixed(1)); // ALWAYS positive magnitude

    perSpeaker[role] = {
      angleDeg,   // off-axis angle, not raw yaw
      lossDb,     // predicted HF loss
    };

    if (lossDb > worstLossDb) {
      worstLossDb = lossDb;
      worstRole = role;
    }
  }

  if (!worstRole || !isNum(worstLossDb)) return null;

  const value = Number(worstLossDb.toFixed(1));
  const level = classifyP16(value);
  const worstAngle = perSpeaker[worstRole]?.angleDeg ?? null;

  return {
    value,
    formatted: `±${value.toFixed(1)} dB`,
    hudLabel: `${worstRole} ±${value.toFixed(1)} dB`,
    level,
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
 * - modelKey: string used to look up built-in tilt
 * - roomHeightM: current room ceiling height (if finite, overrides speakerPos.z)
 *
 * Returns: halved off-axis angle and predicted HF loss.
 */
function computeVerticalOffAxisDeg(speakerPos, seatPos, earHeightM, modelKey, roomHeightM) {
  if (!seatPos || !speakerPos) {
    return { offAxisDeg: 0, lossDb: 1.5 };
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
  const geometricAngleDeg = rad2deg(Math.atan2(horizontalDist, verticalDist));

  // Speaker's built-in tilt towards the MLP
  const tiltDeg = getOverheadTiltDeg(modelKey);

  // Effective off-axis relative to the speaker's aimed axis
  const relativeDeg = Math.abs(geometricAngleDeg - tiltDeg);

  // Halve the off-axis angle for P17 analysis
  const halfOffAxisDeg = relativeDeg / 2;

  // Apply model-specific thresholds to the halved angle
  const key = (modelKey || "").toString().toLowerCase();
  let lossDb;

  if (key.includes("mikro")) {
    // Mikro: 40° / 50° thresholds
    if (halfOffAxisDeg <= 40) lossDb = 1.5;
    else if (halfOffAxisDeg <= 50) lossDb = 3.0;
    else lossDb = 5.0;
  } else if (
    key.includes("architect-2-1") ||
    key.includes("architect-4-2") ||
    key.includes("pas2-2") ||
    key.includes("architect pas")
  ) {
    // Architect 2-1 / 4-2 / PAS2-2: 45° / 55° thresholds
    if (halfOffAxisDeg <= 45) lossDb = 1.5;
    else if (halfOffAxisDeg <= 55) lossDb = 3.0;
    else lossDb = 5.0;
  } else {
    // Default: similar to Architect
    if (halfOffAxisDeg <= 45) lossDb = 1.5;
    else if (halfOffAxisDeg <= 55) lossDb = 3.0;
    else lossDb = 5.0;
  }

  return {
    offAxisDeg: halfOffAxisDeg,
    lossDb,
  };
}

// Unified helper: compute HF loss for one non-LCR speaker at one seat
function computeSurroundLikeHfLoss({ speaker, seat, earHeightM, modelMeta, roomHeightM }) {
  if (!speaker || !seat) return null;
  
  const role = String(speaker.role || "").toUpperCase();
  const pos = speaker.position;
  
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
      offAxisDeg: Number(vert.offAxisDeg.toFixed(1)),
      lossDb: Number(vert.lossDb.toFixed(1)),
    };
  } 
  // Bed-layer surrounds/wides: use horizontal off-axis (same as P16)
  else if (SURROUND_ROLES.has(role)) {
    const seatAzDeg = angleFromTo(pos, seat);
    if (!isNum(seatAzDeg)) return null;

    // Aim direction from speaker data
    let aimDeg = null;
    if (isNum(speaker.yaw)) {
      aimDeg = Number(speaker.yaw);
    } else if (isNum(speaker.rotationDeg)) {
      aimDeg = Number(speaker.rotationDeg);
    } else if (isNum(speaker.rotation_deg)) {
      aimDeg = Number(speaker.rotation_deg);
    } else {
      aimDeg = 0;
    }

    offAxisDeg = Math.abs(norm180(seatAzDeg - aimDeg));
  }

  if (!isNum(offAxisDeg)) return null;

  // Get model HF coverage
  const meta = modelMeta || (speaker.model ? getSpeakerModelMeta(speaker.model) : null);
  const horiz3dB =
    meta?.hfOffAxis16k?.minus3deg ??
    meta?.hfHoriz3dB ??
    meta?.hfHoriz_3db ??
    meta?.hfHorz3dB ??
    meta?.horiz3dB ??
    30;

  const lossDb = lossFromAngle(offAxisDeg, horiz3dB);
  if (!isNum(lossDb)) return null;

  return {
    role,
    offAxisDeg: Number(offAxisDeg.toFixed(1)),
    lossDb: Number(lossDb.toFixed(1)),
  };
}

// P17: Compute surround/wide/overhead HF variance across all non-LCR speakers for all seats
export function computeP17ForAllSeats({ seats, speakers, getSpeakerModelMeta: modelIndex, roomHeightM, debug }) {
  if (!Array.isArray(seats) || !seats.length) return {};
  if (!Array.isArray(speakers) || !speakers.length) return {};

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

    // Loop over all non-LCR speakers
    for (const spk of speakers) {
      const result = computeSurroundLikeHfLoss({
        speaker: spk,
        seat: { x: seatPos.x || seat.x, y: seatPos.y || seat.y, z: seatPos.z || seat.z },
        earHeightM,
        modelMeta: spk.model ? modelIndex(spk.model) : null,
        roomHeightM,
      });

      if (!result) continue;

      // Collect per-speaker data
      perSpeaker.push({
        role: result.role,
        angleDeg: result.offAxisDeg,
        lossDb: result.lossDb,
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
        };
      }
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
    };
  }

  return perSeat;
}