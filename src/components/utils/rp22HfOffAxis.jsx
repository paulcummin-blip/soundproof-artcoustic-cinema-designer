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

// Model-specific vertical tilt for in-ceiling speakers.
// This is the *built-in* tilt away from straight-down, not seat-dependent.
function getOverheadTiltDeg(modelKeyRaw) {
  const key = String(modelKeyRaw || "").toLowerCase().trim();

  // Architect 2-1 / 4-2: approx 5° tilt
  if (key.includes("architect-2-1") || key.includes("architect-4-2")) {
    return 5;
  }

  // Architect PAS in-ceiling: approx 20° tilt
  if (key.includes("architect-pas") || key.includes("pas2-2")) {
    return 20;
  }

  // Mikro, and any unknown models: treat as flat (0°)
  return 0;
}

// Compute vertical off-axis angle for an overhead speaker using 3D geometry
function computeVerticalOffAxisDeg(speakerPos, seatPos, earHeightM, modelKey) {
  // Guard against missing data
  if (!seatPos || !speakerPos) return null;

  const sx = Number(speakerPos.x) || 0;
  const sy = Number(speakerPos.y) || 0;
  const sz = Number(speakerPos.z); // overhead Z should already be the ceiling height

  const ex = Number(seatPos.x) || 0;
  const ey = Number(seatPos.y) || 0;
  const ez = Number(earHeightM);   // ear height in metres

  // If we don't have a sensible ceiling height or ear height, bail early
  if (!Number.isFinite(sz) || !Number.isFinite(ez)) return null;

  // 1) Vector from speaker to listener's ears
  const vx = ex - sx;
  const vy = ey - sy;
  const vz = ez - sz; // will usually be negative (ears below the speaker)

  const horizontalDist = Math.hypot(vx, vy);
  const radialDist = Math.hypot(horizontalDist, vz);

  if (radialDist < 0.01) {
    // Seat is effectively at the speaker – treat as on-axis
    return 0;
  }

  // 2) Reference axis: straight down from the ceiling speaker.
  // In world coordinates this is (0, 0, -1).
  const refZ = -1;
  const refLen = 1; // already unit length

  // 3) Normalised actual direction vector (speaker -> ear)
  const dirX = vx / radialDist;
  const dirY = vy / radialDist;
  const dirZ = vz / radialDist;

  // 4) Angle between the straight-down vector and the actual direction.
  // dot(ref, dir) = (0 * dirX) + (0 * dirY) + (-1 * dirZ) = -dirZ
  let cosTheta = -(dirZ);

  // Clamp for numeric safety
  if (cosTheta > 1) cosTheta = 1;
  if (cosTheta < -1) cosTheta = -1;

  const rawAngleDeg = rad2deg(Math.acos(cosTheta)); // 0° = straight down, 90° = horizontal

  // 5) Apply model-specific tilt: Architect 2-1/4-2 ≈ 5°, PAS ≈ 20°, Mikro = 0°
  const tiltDeg = getOverheadTiltDeg(modelKey);

  // Off-axis angle is how far the listener is from the *aimed* axis
  const offAxisDeg = Math.abs(rawAngleDeg - tiltDeg);

  // Always return a positive, rounded value
  return Number(offAxisDeg.toFixed(1));
}

// Unified helper: compute HF loss for one non-LCR speaker at one seat
function computeSurroundLikeHfLoss({ speaker, seat, earHeightM, modelMeta }) {
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
    if (!isNum(pos.z)) return null;
    offAxisDeg = computeVerticalOffAxisDeg(
      pos,
      { x: seat.x, y: seat.y },
      earHeightM || 1.2,
      speaker.model
    );
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
export function computeP17ForAllSeats({ seats, speakers, getSpeakerModelMeta: modelIndex, debug }) {
  if (!Array.isArray(seats) || !seats.length) return {};
  if (!Array.isArray(speakers) || !speakers.length) return {};

  const perSeat = {};

  for (const seat of seats) {
    const seatId = seat.id || `seat-${seat.x}-${seat.y}`;
    if (!isNum(seat.x) || !isNum(seat.y)) continue;

    const earHeightM = seat.z || 1.2;
    let maxAbsLossDb = -Infinity;
    let worstRole = null;
    let worstAngleDeg = null;

    // Loop over all non-LCR speakers
    for (const spk of speakers) {
      const result = computeSurroundLikeHfLoss({
        speaker: spk,
        seat,
        earHeightM,
        modelMeta: spk.model ? modelIndex(spk.model) : null,
      });

      if (!result) continue;

      // Track worst loss
      if (result.lossDb > maxAbsLossDb) {
        maxAbsLossDb = result.lossDb;
        worstRole = result.role;
        worstAngleDeg = result.offAxisDeg;
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
      maxAbsLossDb: Number(maxAbsLossDb.toFixed(1)),
      worstRole,
      worstAngleDeg,
    };
  }

  return perSeat;
}