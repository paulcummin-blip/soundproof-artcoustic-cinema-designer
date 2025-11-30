// rp22HfOffAxis.js
// RP22 P16 implementation: off-axis HF attenuation helpers

import { getSpeakerModelMeta } from "@/components/models/speakers/registry";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

// LCR roles only for P16
const LCR_ROLES = new Set(["FL", "FC", "FR", "L", "C", "R"]);

// Normalize angle to -180..+180 range
function normalizeAngle(deg) {
  let a = ((deg % 360) + 360) % 360;
  if (a > 180) a -= 360;
  return a;
}

// 0° = +Y (into room), +ve = clockwise
function angleFromTo(from, to) {
  const dx = to.x - from.x; // lateral
  const dy = to.y - from.y; // fore/aft
  return (Math.atan2(dx, dy) * 180) / Math.PI;
}

// Map off-axis angle → predicted HF loss (dB)
function hfLossFromAngle(offAxisDeg, horiz3dB) {
  if (!isNum(offAxisDeg) || !isNum(horiz3dB)) return null;

  const a = Math.abs(offAxisDeg);

  if (a <= horiz3dB) return 1.5;
  if (a <= horiz3dB + 10) return 5.0;
  return 6.0; // clearly >5 → FAIL
}

// Map loss → RP22 level for P16
function classifyP16(lossDb) {
  if (!isNum(lossDb)) return null;

  if (lossDb > 5) return null; // FAIL
  if (lossDb > 3) return 1;    // 3 < loss ≤ 5
  if (lossDb > 1.5) return 2;  // 1.5 < loss ≤ 3
  return 4;                    // ≤ 1.5
}

// Resolve speaker yaw/rotation in degrees (0 = flat to room, +ve = clockwise)
function resolveYawDeg(spk) {
  if (isNum(spk.yaw)) return spk.yaw;
  if (isNum(spk.rotationDeg)) return spk.rotationDeg;
  if (isNum(spk.rotation_deg)) return spk.rotation_deg;
  return 0; // flat
}

// Map off-axis angle → predicted HF loss (dB) - renamed for consistency
function hfLoss(offAxisDeg, horiz3dB) {
  if (!isNum(offAxisDeg) || !isNum(horiz3dB)) return null;

  const a = Math.abs(offAxisDeg);

  if (a <= horiz3dB) return 1.5;
  if (a <= horiz3dB + 10) return 5.0;
  return 6.0; // clearly >5 → FAIL
}

// P16 – seat-to-seat frequency response variance across LCR
// Uses HF horizontal off-axis angle from each LCR to the seat,
// based on the speaker's stored yaw (flat vs angled).

export function computeP16ForSeat(seat, allSpeakers, getCanonicalRole, getSpeakerMeta) {
  if (!seat || !allSpeakers) return null;
  if (!isNum(seat.x) || !isNum(seat.y)) return null;

  const seatId = seat.id || `seat-${seat.x}-${seat.y}`;

  // 1) Collect valid LCR speakers (FL / FC / FR only)
  const lcrData = [];

  for (const spk of allSpeakers) {
    const canon = getCanonicalRole(spk.role);
    if (!["FL", "FC", "FR"].includes(canon)) continue;
    if (!spk.position || !isNum(spk.position.x) || !isNum(spk.position.y)) continue;

    // Horizontal HF 3 dB angle from model meta (fallback 30° if missing)
    const meta = spk.model ? getSpeakerMeta(spk.model) : null;
    const hf3dBAng =
      meta?.hfOffAxis16k?.minus3deg ??
      meta?.hfHoriz3dB ??
      meta?.hfHoriz_3db ??
      30;

    // Speaker aim / yaw in degrees.
    // RoomVisualisation persists this as `speaker.yaw`.
    const aimDeg = resolveYawDeg(spk); // 0 = flat to room, +ve = clockwise

    lcrData.push({
      role: canon,
      pos: spk.position,
      aimDeg,
      hf3dBAng,
    });
  }

  if (!lcrData.length) return null;

  // 2) For each LCR, compute seat azimuth, off-axis angle, and loss
  const perSpeaker = {};
  let worstLoss = -Infinity;
  let worstRole = null;

  for (const { role, pos, aimDeg, hf3dBAng } of lcrData) {
    // Angle from speaker to seat, 0° = +Y (into room), +ve = clockwise
    const seatAzimuthDeg = angleFromTo(pos, seat); // uses same convention as plan view

    // Off-axis = absolute difference between where speaker is pointed and where seat is
    const offAxisDeg = Math.abs(normalizeAngle(seatAzimuthDeg - aimDeg)); // 0..180

    // Convert off-axis angle → predicted HF loss using RP22 logic
    const lossDb = hfLoss(offAxisDeg, hf3dBAng);

    perSpeaker[role] = {
      angleDeg: Number(offAxisDeg.toFixed(1)),          // geometric off-axis angle
      seatAzimuthDeg: Number(seatAzimuthDeg.toFixed(1)),// direction seat is seen from speaker
      aimDeg: Number(aimDeg.toFixed(1)),                // stored yaw
      coverage3dB: Number(hf3dBAng.toFixed(1)),
      lossDb: lossDb != null ? Number(lossDb.toFixed(1)) : null,
    };

    if (!isNum(lossDb)) continue;

    if (lossDb > worstLoss) {
      worstLoss = lossDb;
      worstRole = role;
    }
  }

  if (!isNum(worstLoss) || !worstRole) return null;

  // 3) Map worst loss → RP22 level (using existing thresholds)
  const level = classifyP16(worstLoss); // returns 1,2,4 or null for FAIL

  const lossRounded = Number(worstLoss.toFixed(1));

  return {
    value: lossRounded,
    valueDb: lossRounded,
    formatted: `±${lossRounded.toFixed(1)} dB`,
    hudLabel: `${worstRole} ±${lossRounded.toFixed(1)} dB`,
    level: level ?? "FAIL",
    debug: {
      seatId,
      perSpeaker,
      worst: {
        role: worstRole,
        angleDeg: perSpeaker[worstRole]?.angleDeg ?? null,
        lossDb: lossRounded,
      },
    },
  };
}