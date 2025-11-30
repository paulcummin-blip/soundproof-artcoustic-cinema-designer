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

export function computeP16ForSeat(seat, allSpeakers, mlpPoint, getCanonicalRole, getSpeakerMeta) {
  if (!seat || !isNum(seat.x) || !isNum(seat.y)) return null;
  if (!mlpPoint || !isNum(mlpPoint.x) || !isNum(mlpPoint.y)) return null;
  if (!Array.isArray(allSpeakers) || !allSpeakers.length) return null;

  const seatId = seat.id || `seat-${seat.x}-${seat.y}`;

  // Collect valid LCR speakers on the screen wall
  const lcrList = allSpeakers
    .filter(spk => {
      const role = getCanonicalRole(spk.role);
      return (
        LCR_ROLES.has(role) &&
        spk.position &&
        isNum(spk.position.x) &&
        isNum(spk.position.y)
      );
    })
    .map(spk => {
      const role = getCanonicalRole(spk.role);
      const meta = spk.model ? getSpeakerMeta(spk.model) : null;
      const horiz3dB =
        meta?.hfOffAxis16k?.minus3deg ??
        meta?.hfHoriz3dB ??
        meta?.hfHoriz_3db ??
        30; // sensible default

      return { spk, role, horiz3dB };
    });

  if (!lcrList.length) return null;

  const perSpeaker = {};
  let worstLoss = 0;
  let worstRole = null;
  let worstAngle = 0;

  for (const { spk, role, horiz3dB } of lcrList) {
    const pos = spk.position;

    // 0° = +Y into the room, +ve = clockwise
    const seatAz = angleFromTo(pos, seat);
    const aimAz  = angleFromTo(pos, mlpPoint);

    // signed difference, then take absolute for the actual off-axis angle
    const offAxis = normalizeAngle(seatAz - aimAz);
    const offAxisAbs = Math.abs(offAxis);

    // Convert off-axis angle → predicted HF loss
    const lossDb = hfLossFromAngle(offAxisAbs, horiz3dB);

    // Store per-speaker debug data
    perSpeaker[role] = {
      seatAzimuthDeg: Number(seatAz.toFixed(1)),
      aimAzimuthDeg: Number(aimAz.toFixed(1)),
      angleDeg: Number(offAxisAbs.toFixed(1)),     // POSITIVE angle away from aim
      coverage3dB: Number(horiz3dB.toFixed(1)),
      lossDb: lossDb != null ? Number(lossDb.toFixed(1)) : null,
    };

    if (!isNum(lossDb)) continue;

    if (lossDb > worstLoss) {
      worstLoss = lossDb;
      worstRole = role;
      worstAngle = offAxisAbs;
    }
  }

  if (!worstRole) return null;

  const loss = Number(worstLoss.toFixed(1));
  const level = classifyP16(loss);

  return {
    value: loss,
    valueDb: loss,
    // P16 is a one-sided dB loss, not ±
    formatted: `${loss.toFixed(1)} dB`,
    hudLabel: `${worstRole} ${loss.toFixed(1)} dB`,
    level: level ?? 'FAIL',
    debug: {
      seatId,
      perSpeaker,
      worst: {
        role: worstRole,
        angleDeg: Number(worstAngle.toFixed(1)),  // POSITIVE worst off-axis angle
        lossDb: loss,
      },
    },
  };
}