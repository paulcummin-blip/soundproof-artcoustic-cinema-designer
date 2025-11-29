// rp22HfOffAxis.js
// RP22 P16 implementation: off-axis HF attenuation helpers

import { getSpeakerModelMeta } from "@/components/models/speakers/registry";

/**
 * Estimate HF attenuation at 16 kHz based on off-axis angle.
 * 
 * @param {number} angleDeg - absolute off-axis angle in degrees
 * @param {Object} hfProfile - { minus3deg, minus5deg }
 * @returns {number} attenuation in dB (negative value)
 */
export function estimateHFAttenuationAt16k(angleDeg, hfProfile) {
  if (!hfProfile) return 0; // treat as flat if no data

  const a = Math.abs(angleDeg);
  const a3 = Number(hfProfile.minus3deg ?? NaN);
  const a5 = Number(hfProfile.minus5deg ?? NaN);

  if (!Number.isFinite(a3) || !Number.isFinite(a5) || a3 <= 0 || a5 <= a3) {
    // Fallback: no usable profile -> 0 dB (no predicted variance)
    return 0;
  }

  // 0° => 0 dB, a3 => -3 dB, a5 => -5 dB, >a5 => clamp at -5 dB
  if (a <= 0) return 0;
  if (a <= a3) {
    const t = a / a3;
    return -3 * t; // linear between 0 and -3 dB
  }
  if (a <= a5) {
    const t = (a - a3) / (a5 - a3);
    return -3 - 2 * t; // linear between -3 and -5 dB
  }

  return -5; // beyond -5 dB region, clamp
}

/**
 * Classify P16 delta according to RP22 thresholds.
 * 
 * @param {number} deltaDb - maximum absolute SPL delta across seats
 * @returns {string|null} level (L4, L3, L2, L1) or null
 */
export function classifyP16(deltaDb) {
  const d = Math.abs(deltaDb);
  if (!Number.isFinite(d)) return null;

  if (d <= 1.5) return 'L4';
  if (d <= 3.0) return 'L3';
  if (d <= 5.0) return 'L2';
  return 'L1'; // > 5 dB
}

/**
 * Compute speaker-to-seat azimuth angle in degrees.
 * 
 * @param {Object} speaker - { position: {x, y} }
 * @param {Object} seat - { x, y }
 * @returns {number} angle in degrees (0-360, where 0 = straight ahead)
 */
export function computeSpeakerSeatAzimuth(speaker, seat) {
  if (!speaker?.position || !seat) return 0;
  
  const spkX = Number(speaker.position.x ?? 0);
  const spkY = Number(speaker.position.y ?? 0);
  const seatX = Number(seat.x ?? seat.position?.x ?? 0);
  const seatY = Number(seat.y ?? seat.position?.y ?? 0);
  
  const dx = seatX - spkX;
  const dy = seatY - spkY;
  
  // atan2(dx, dy) gives azimuth with 0° = +Y (forward)
  const rad = Math.atan2(dx, dy);
  const deg = rad * 180 / Math.PI;
  
  return Math.abs(deg); // Return absolute angle for off-axis calculation
}

/**
 * Compute RP22 P16 for a given seat using off-axis HF roll-off.
 *
 * @param {Object} seat - { x, y, ... }
 * @param {Array} speakers - all placed speakers
 * @param {Function} getSpeakerModelMeta - function to get speaker model metadata
 * @returns {Object|null} p16 metric { value, formatted, level, hudLabel } or null
 */
export function computeP16ForSeat(seat, speakers, getSpeakerModelMeta) {
  // 1. Find the front centre speaker
  const fc = speakers.find(s =>
    ['FC', 'C'].includes(String(s.role).toUpperCase()) &&
    s.position &&
    Number.isFinite(s.position.x) &&
    Number.isFinite(s.position.y)
  );
  if (!fc) return null;

  // 2. Get the FC model meta and the HF horizontal −3 dB angle
  const meta = getSpeakerModelMeta(fc.model);
  const A3 = meta?.hfOffAxis16k?.minus3deg ?? 30; // sensible default if missing

  // 3. Compute horizontal off-axis angle from FC → seat (speaker is origin, looking "up" the room)
  const dx = seat.x - fc.position.x;
  const dy = seat.y - fc.position.y;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;

  const rawAngleDeg = Math.atan2(dx, dy) * 180 / Math.PI; // 0° = straight into room
  const offAxis = Math.abs(rawAngleDeg); // 0..180

  // 4. Map offAxis angle → predicted dB loss using stepped rule
  let lossDb;

  if (offAxis <= A3) {
    lossDb = 1.5;          // inside coverage
  } else if (offAxis <= A3 + 10) {
    lossDb = 3.0;          // just outside coverage
  } else {
    lossDb = 5.5;          // 5 dB or worse
  }

  // 5. Map lossDb → RP22 level, with no Level 3
  let level;
  if (lossDb > 5) {
    level = 1;             // fails L1
  } else if (lossDb > 3) {
    level = 2;             // between 3 and 5 dB
  } else {
    level = 4;             // ≤ 3 dB always treated as L4
  }

  // 6. Return the P16 metric object
  const valueDb = Number(lossDb.toFixed(1));
  return {
    value: valueDb,
    formatted: `±${valueDb.toFixed(1)} dB`,
    hudLabel: `FC ±${valueDb.toFixed(1)} dB`,
    level,
  };
}