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

// RP22 P16 – seat-to-seat HF off-axis loss for LCR only
// 0° = straight into room (+Y), positive angles = clockwise

export function computeP16ForSeat(seat, allSpeakers, getCanonicalRole, getSpeakerMeta) {
  if (!seat || !allSpeakers || !Array.isArray(allSpeakers)) return null;
  if (!isNum(seat.x) || !isNum(seat.y)) return null;

  const seatId = seat.id || `seat-${seat.x}-${seat.y}`;

  // Helper: canonicalise role without relying on external helpers
  const canonRole = (role) => {
    const r = typeof role === "string" ? role.toUpperCase() : "";
    return r;
  };

  const perSpeaker = {};
  let worstLoss = 0;
  let worstRole = null;

  for (const spk of allSpeakers) {
    const role = canonRole(spk.role);
    // P16 is LCR only
    if (!["FL", "L", "FC", "C", "FR", "R"].includes(role)) continue;

    const pos = spk.position;
    if (!pos || !isNum(pos.x) || !isNum(pos.y)) continue;

    // --- 1. Get HF coverage from model meta (fallback 30° if missing) ---
    const meta =
      spk.model && typeof getSpeakerMeta === "function"
        ? getSpeakerMeta(spk.model)
        : null;

    const horiz3dB = isNum(meta?.hfOffAxis16k?.minus3deg)
      ? meta.hfOffAxis16k.minus3deg
      : 30; // safe default

    // --- 2. Angle from speaker → seat (0° = +Y, +ve = clockwise) ---
    const dxSeat = seat.x - pos.x; // lateral (right = +)
    const dySeat = seat.y - pos.y; // depth   (into room = +)
    const seatAngleDeg = Math.atan2(dxSeat, dySeat) * 180 / Math.PI; // -180..+180

    // --- 3. Speaker aim direction in same coordinate system ---
    // resolveYawDeg returns the speaker's aim angle (0° = flat, +ve = clockwise)
    const aimDeg = resolveYawDeg(spk);    // 0° = flat to wall, +ve = clockwise toe-in

    // --- 4. Off-axis angle = | seat direction – aim direction | (0..180°) ---
    const diffDeg    = normalizeAngle(seatAngleDeg - aimDeg);
    const offAxisDeg = Math.abs(diffDeg);       // always positive

    // --- 5. Convert off-axis angle → predicted HF loss (dB) ---
    const lossDb = hfLoss(offAxisDeg, horiz3dB);
    if (!isNum(lossDb)) continue;

    const lossRounded = Number(lossDb.toFixed(1));
    const angleRounded = Number(offAxisDeg.toFixed(1));

    // Store per-speaker debug so HUD can show real angles
    perSpeaker[role] = {
      angleDeg: angleRounded,     // off-axis from speaker front axis
      lossDb: lossRounded,
      coverage3dB: horiz3dB,
      seatAzimuthDeg: Number(seatAngleDeg.toFixed(1)),
      aimDeg: Number(aimDeg.toFixed(1)),
    };

    // Track worst (highest) loss of the three LCR
    if (lossRounded > worstLoss || !worstRole) {
      worstLoss = lossRounded;
      worstRole = role;
    }
  }

  if (!worstRole) return null;

  const level = classifyP16(worstLoss); // uses your existing 1.5 / 3 / 5 dB thresholds

  return {
    value: worstLoss,
    valueDb: worstLoss,
    formatted: `${worstLoss.toFixed(1)} dB`,
    hudLabel: `${worstRole} ${worstLoss.toFixed(1)} dB`,
    level: level ?? "FAIL",
    debug: {
      seatId,
      perSpeaker,
      worst: {
        role: worstRole,
        angleDeg: perSpeaker[worstRole]?.angleDeg ?? null,
        lossDb: Number(worstLoss.toFixed(1)),
      },
    },
  };
}