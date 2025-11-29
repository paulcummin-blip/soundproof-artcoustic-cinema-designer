// rp22HfOffAxis.js
// RP22 P16 implementation: off-axis HF attenuation helpers

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
 * @param {Object} params
 * @param {Object} params.seat - { x, y, earHeightM, ... }
 * @param {Array}  params.speakers - all placed speakers
 * @param {Function} params.getCanonicalRole - role normalization function
 * @returns {Object|null} p16 metric { value, formatted, level, hudLabel } or null
 */
export function computeP16ForSeat({
  seat,
  speakers,
  getCanonicalRole,
}) {
  // Import getSpeakerModelMeta for looking up speaker data
  const { getSpeakerModelMeta } = require('@/components/models/speakers/registry');

  // 1. Find the front-centre speaker
  const fc = speakers.find(s => 
    ['FC', 'C'].includes(getCanonicalRole(s.role)) && 
    s.position && 
    Number.isFinite(s.position.x) && 
    Number.isFinite(s.position.y)
  );

  // 2. Validate seat and FC
  if (!fc || !seat || !Number.isFinite(seat.x) || !Number.isFinite(seat.y)) {
    return null;
  }

  // 3. Get the HF horizontal coverage from the model data
  const fcMeta = getSpeakerModelMeta(fc.model);
  const horiz3dB = fcMeta?.hfOffAxis16k?.minus3deg ?? 30; // default to 30° if missing

  // 4. Compute the off-axis angle from FC to this seat
  const dx = seat.x - fc.position.x;
  const dy = seat.y - fc.position.y;
  const rawDeg = Math.atan2(dx, dy) * 180 / Math.PI;
  const offAxis = Math.abs(rawDeg); // 0..180

  // 5. Convert off-axis angle to predicted HF loss in dB
  let lossDb;

  if (offAxis <= horiz3dB) {
    // inside main coverage
    lossDb = 1.5;
  } else if (offAxis <= horiz3dB + 10) {
    // just outside −3 dB line
    lossDb = 3.0;
  } else {
    // further out into the roll-off
    lossDb = 5.1;
  }

  // 6. Map dB value to RP22 "level", with NO L3 state
  let level;
  if (lossDb > 5.0) {
    level = 1; // "Level 1 not achieved"
  } else if (lossDb > 3.0 && lossDb <= 5.0) {
    level = 1; // passes only L1
  } else if (lossDb > 1.5 && lossDb <= 3.0) {
    level = 2; // passes L1 & L2
  } else {
    level = 4; // passes L1–L4; do not ever return level 3
  }

  // 7. Return the metric in the standard format used by the HUD
  const valueRounded = Math.round(lossDb * 10) / 10;

  return {
    value: valueRounded,
    formatted: `±${valueRounded.toFixed(1)} dB`,
    hudLabel: `FC ±${valueRounded.toFixed(1)} dB`,
    level,
  };
}