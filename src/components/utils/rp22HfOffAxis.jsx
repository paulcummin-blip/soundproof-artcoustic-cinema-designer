// rp22HfOffAxis.js
// RP22 P16 implementation: off-axis HF attenuation helpers

import { getSpeakerModelMeta } from "@/components/models/speakers/registry";

// Normalize angle to 0..360
const normAngle = (deg) => ((deg % 360) + 360) % 360;

// Shortest angular difference between two azimuths (0..180)
const shortestDiff = (a, b) => {
  const da = normAngle(a);
  const db = normAngle(b);
  let diff = Math.abs(da - db);
  if (diff > 180) diff = 360 - diff;
  return diff;
};

// LCR roles for P16
const LCR_ROLES = new Set(['FL', 'L', 'FC', 'C', 'FR', 'R']);

export function computeP16ForSeat(seat, speakers, getSpeakerModelMeta) {
  // 1. Collect LCR speakers
  const lcrSpeakers = Array.isArray(speakers)
    ? speakers.filter(s =>
        LCR_ROLES.has(String(s.role).toUpperCase()) &&
        s.position &&
        Number.isFinite(s.position.x) &&
        Number.isFinite(s.position.y)
      )
    : [];

  if (!seat || !Number.isFinite(seat.x) || !Number.isFinite(seat.y) || lcrSpeakers.length === 0) {
    return null;
  }

  const debugRows = [];
  let worstLossDb = -Infinity;
  let worstSpeakerRole = null;

  // 2. Loop through L/C/R speakers
  for (const spk of lcrSpeakers) {
    // Build vector from speaker to seat
    const dx = seat.x - spk.position.x;
    const dy = seat.y - spk.position.y;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) continue;

    // Compute azimuth from speaker to seat (0° = +Y, positive to right)
    const seatAzimuthDeg = Math.atan2(dx, dy) * 180 / Math.PI;

    // Get speaker's aim/yaw
    const aimDeg = Number.isFinite(spk.rotation_deg) ? spk.rotation_deg : 0;

    // Off-axis angle is shortest difference
    const offAxisDeg = shortestDiff(seatAzimuthDeg, aimDeg);

    // Get HF horizontal 3 dB coverage from model meta
    const meta = spk.model ? getSpeakerModelMeta(spk.model) : null;
    const coverage3dB = meta && [
      meta.hfOffAxis16k?.minus3deg,
      meta.hfHoriz3dB,
      meta.hfHoriz_3db,
      meta.hfHorz3dB,
      meta.horiz3dB
    ].find(v => typeof v === 'number' && Number.isFinite(v));
    
    if (!coverage3dB) continue;

    // Convert off-axis angle → predicted loss dB
    let lossDb;
    if (offAxisDeg <= coverage3dB) {
      lossDb = 1.5;
    } else if (offAxisDeg >= coverage3dB + 10) {
      lossDb = 5;
    } else {
      const t = (offAxisDeg - coverage3dB) / 10;
      lossDb = 3 + 2 * t;
    }

    if (!Number.isFinite(lossDb)) continue;

    const role = String(spk.role).toUpperCase();
    debugRows.push({
      role,
      offAxisDeg: Number(offAxisDeg.toFixed(1)),
      coverage3dB: Number(coverage3dB.toFixed(1)),
      lossDb: Number(lossDb.toFixed(1)),
    });

    if (lossDb > worstLossDb) {
      worstLossDb = lossDb;
      worstSpeakerRole = role;
    }
  }

  // 3. If no valid rows, return null
  if (!debugRows.length || !Number.isFinite(worstLossDb) || !worstSpeakerRole) {
    return null;
  }

  // 4. Map worst loss → RP22 level
  const loss = Number(worstLossDb.toFixed(1));
  let level = null;
  if (loss > 5) {
    level = null; // FAIL
  } else if (loss > 3) {
    level = 1;
  } else if (loss >= 1.5) {
    level = 2;
  } else {
    level = 4;
  }

  // 5. Build perSpeaker object for HUD compatibility
  const perSpeaker = {};
  for (const row of debugRows) {
    perSpeaker[row.role] = {
      angleDeg: row.offAxisDeg,
      lossDb: row.lossDb,
    };
  }

  return {
    value: loss,
    formatted: `±${loss.toFixed(1)} dB`,
    hudLabel: `${worstSpeakerRole} ±${loss.toFixed(1)} dB`,
    level: level ?? "FAIL",
    debug: {
      seatId: seat.id || `seat-${seat.x}-${seat.y}`,
      perSpeaker,
      worst: {
        role: worstSpeakerRole,
        lossDb: loss,
      },
    },
  };
}