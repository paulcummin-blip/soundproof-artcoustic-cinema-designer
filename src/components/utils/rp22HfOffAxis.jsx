// rp22HfOffAxis.js
// RP22 P16 implementation: off-axis HF attenuation helpers

import { getSpeakerModelMeta } from "@/components/models/speakers/registry";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

// LCR roles only for P16
const LCR_ROLES = new Set(["FL", "FC", "FR", "L", "C", "R"]);

// Normalize angle to -180..+180 range
function normalizeAngle(deg) {
  let normalized = deg % 360;
  if (normalized > 180) normalized -= 360;
  if (normalized < -180) normalized += 360;
  return normalized;
}

// Convert off-axis angle → predicted HF loss (dB)
function hfLoss(angleDeg, horiz3dB) {
  if (!isNum(angleDeg) || !isNum(horiz3dB)) return null;

  const absAngle = Math.abs(angleDeg);
  if (absAngle <= horiz3dB) return 1.5;
  if (absAngle <= horiz3dB + 10) return 5.0;
  return 6.0; // clearly >5 → FAIL
}

// Map predicted loss → RP22 P16 level
function classifyP16(lossDb) {
  if (!isNum(lossDb)) return null;

  if (lossDb > 5) return null; // FAIL
  if (lossDb > 3) return 1;
  if (lossDb > 1.5) return 2;
  return 4;
}

// Try several common yaw/rotation properties and fall back to 0°
function resolveYawDeg(spk) {
  const candidates = [
    spk?.yaw,
    spk?.rotationDeg,
    spk?.rotation_deg,
    spk?.rotation,
    spk?.yawDeg,
  ];

  for (const v of candidates) {
    if (typeof v === "number" && Number.isFinite(v)) {
      return v;
    }
  }
  return 0;
}

export function computeP16ForSeat(seat, allSpeakers, getCanonicalRole, getSpeakerMeta) {
  if (!seat || !allSpeakers) return null;
  if (!isNum(seat.x) || !isNum(seat.y)) return null;

  const seatId = seat.id || `seat-${seat.x}-${seat.y}`;

  // Get valid LCR speakers with canonical roles
  const lcrData = [];
  
  for (const spk of allSpeakers) {
    const canon = getCanonicalRole(spk.role);
    if (!['FL', 'FC', 'FR'].includes(canon)) continue;
    if (!spk.position || !isNum(spk.position.x) || !isNum(spk.position.y)) continue;
    
    const meta = spk.model ? getSpeakerMeta(spk.model) : null;
    const hf3dBAng = meta?.hfOffAxis16k?.minus3deg ?? 30;
    
    // Speaker aim / yaw – 0° means facing straight into the room.
    // Use resolveYawDeg so we pick up whatever property the plan view is using.
    const aimDeg = resolveYawDeg(spk);
    
    lcrData.push({
      role: canon,
      pos: spk.position,
      aimDeg,
      hf3dBAng,
    });
  }

  if (lcrData.length === 0) return null;

  // Compute off-axis angle and loss for each LCR
  const perSpeaker = {};
  let worstLoss = 0;
  let worstRole = null;

  for (const { role, pos, aimDeg, hf3dBAng } of lcrData) {
    // Step 1: Compute seat azimuth from speaker (0° = +Y axis, into room)
    const dx = seat.x - pos.x;
    const dy = seat.y - pos.y;
    const seatAzimuthDeg = Math.atan2(dx, dy) * 180 / Math.PI; // -180..+180

    // Step 2: Compute aim azimuth (base is 0° straight into room, apply yaw)
    // NOTE: plan-view rotation uses the opposite sign, so we flip here to
    // match the on-screen speaker icons (toe-in towards the seat reduces angle).
    const aimAz = -aimDeg;

    // Step 3: Compute off-axis angle
    const offAxisDeg = Math.abs(normalizeAngle(seatAzimuthDeg - aimAz));

    // Step 4: Convert to predicted HF loss
    const lossDb = hfLoss(offAxisDeg, hf3dBAng);

    // Store debug info
    const offAxisRounded = Number(offAxisDeg.toFixed(1));

    perSpeaker[role] = {
      // Main value used by the HUD today
      angleDeg: offAxisRounded,                          // keep legacy name for HUD

      // Extra debug fields so we can sanity-check geometry
      seatAzimuthDeg: Number(seatAzimuthDeg.toFixed(1)), // azimuth seat-from-speaker
      aimDeg: Number(aimDeg.toFixed(1)),                 // resolved yaw/aim
      offAxisDeg: offAxisRounded,                        // |seatAz - aim|
      coverage3dB: Number(hf3dBAng.toFixed(1)),
      lossDb: lossDb !== null ? Number(lossDb.toFixed(1)) : null,
    };

    if (!isNum(lossDb)) continue;

    if (lossDb > worstLoss) {
      worstLoss = lossDb;
      worstRole = role;
    }
  }

  if (!worstRole) return null;

  const level = classifyP16(worstLoss);

  return {
    value: worstLoss,
    valueDb: worstLoss, // Keep both for compatibility
    formatted: `±${worstLoss.toFixed(1)} dB`,
    hudLabel: `${worstRole} ±${worstLoss.toFixed(1)} dB`,
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