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

// Get overhead speaker model-specific tilt angle (degrees from straight down)
function getOverheadTiltDeg(modelKey) {
  if (!modelKey) return 0;
  const normalized = normaliseModelKey(modelKey);
  
  if (normalized.includes("architect-2-1")) return 5;
  if (normalized.includes("architect-4-2")) return 5;
  if (normalized.includes("architect-pas2-2")) return 20;
  if (normalized.includes("architect-mikro")) return 0;
  
  return 0; // Default for unknown models
}

// Compute vertical off-axis angle for an overhead speaker using 3D geometry
function computeVerticalOffAxisDeg(speakerPos, seatPos, earHeightM, modelKey) {
  if (!speakerPos || !seatPos) return null;
  if (!isNum(speakerPos.x) || !isNum(speakerPos.y) || !isNum(speakerPos.z)) return null;
  if (!isNum(seatPos.x) || !isNum(seatPos.y)) return null;
  if (!isNum(earHeightM)) return null;

  const horizontalDist = Math.hypot(
    seatPos.x - speakerPos.x,
    seatPos.y - speakerPos.y
  );

  const verticalDist = Math.max(0.01, speakerPos.z - earHeightM); // Floor to avoid division by zero

  const rawAngleDeg = rad2deg(Math.atan2(horizontalDist, verticalDist));
  
  const tiltDeg = getOverheadTiltDeg(modelKey);
  const offAxisDeg = Math.abs(rawAngleDeg - tiltDeg);

  return offAxisDeg;
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