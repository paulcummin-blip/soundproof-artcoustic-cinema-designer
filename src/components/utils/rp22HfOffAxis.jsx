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