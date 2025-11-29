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
    
    // Get speaker yaw (rotation_deg field)
    const yawDeg = isNum(spk.rotation_deg) ? spk.rotation_deg : 0;
    
    lcrData.push({
      role: canon,
      pos: spk.position,
      yawDeg,
      hf3dBAng,
    });
  }

  if (lcrData.length === 0) return null;

  // Compute off-axis angle and loss for each LCR
  const perSpeaker = {};
  let worstLoss = 0;
  let worstRole = null;

  for (const { role, pos, yawDeg, hf3dBAng } of lcrData) {
    // Step 1: Compute seat azimuth from speaker (0° = +Y axis, into room)
    const dx = seat.x - pos.x;
    const dy = seat.y - pos.y;
    const seatAz = Math.atan2(dx, dy) * 180 / Math.PI; // -180..+180

    // Step 2: Compute aim azimuth (base is 0° straight into room, apply yaw)
    const aimAz = yawDeg; // yawDeg is already relative to forward axis

    // Step 3: Compute off-axis angle
    const offAxisDeg = Math.abs(normalizeAngle(seatAz - aimAz));

    // Step 4: Convert to predicted HF loss
    const lossDb = hfLoss(offAxisDeg, hf3dBAng);

    // Store debug info
    perSpeaker[role] = {
      angleDeg: Number(offAxisDeg.toFixed(1)),
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